# Release verification

> The verification layer that was structurally missing during the v3.9.1–v3.9.4 init regression series is now in place. This document is the maintainer-facing entry point for understanding how it works, how to interpret a failure, and how to add new coverage.

## TL;DR

Every `npm publish` runs `aqe init --auto` end-to-end against a corpus of 4 pinned real public repositories with 22 assertions per fixture. If any assertion fails, the publish does not happen — the release tag stays unpublished until the bug is fixed. After publish, a canary re-runs the corpus against the freshly-published package on the actual npm CDN.

This is not aspirational. It is the load-bearing verification layer that prevents another #401-class regression from shipping.

```
                       (PR merged to main)
                              │
                              ▼
                      release tag created
                              │
                              ▼
              ┌───────────────────────────────┐
              │  npm-publish.yml              │
              │  ├─ build                     │
              │  ├─ tests-on-tag-sha          │
              │  └─ pre-publish-gate          │ ◄──── this is the gate
              │       ├─ setup.sh             │
              │       ├─ run-gate.sh          │
              │       └─ summary.txt → ARTIFACT
              └───────────────────────────────┘
                              │
                  (only if gate passes)
                              │
                              ▼
                          npm publish
                              │
                              ▼
              ┌───────────────────────────────┐
              │  post-publish-canary.yml      │
              │  ├─ install from npm registry │
              │  ├─ run-gate.sh against it    │
              │  └─ open P0 issue on failure  │
              └───────────────────────────────┘
```

## How a release is verified

### 1. The release-gate corpus (`tests/fixtures/init-corpus/`)

Four pinned slices of real public repositories. Each runs `aqe init --auto` end-to-end against a cleanroom checkout and asserts 22 things (A1–A22). See the [corpus README](../tests/fixtures/init-corpus/README.md) for the per-fixture purpose, and the gate script (`tests/fixtures/init-corpus/run-gate.sh`) for the assertion contract.

The corpus is **not** a unit-test fixture. It only ever runs `aqe init --auto` end-to-end against an installed `agentic-qe` package, exactly the way a real user runs it.

### 2. The release-gate workflow

`.github/workflows/npm-publish.yml`'s `pre-publish-gate` job runs the corpus against a freshly-built `npm pack` tarball after `build` and `tests-on-tag-sha` complete. If any fixture fails any assertion, the `publish` job does not run and the tag stays unpublished. The job uploads `tests/fixtures/init-corpus/run-logs/` as the `init-corpus-logs` artifact and appends `summary.txt` to the workflow run summary.

### 3. The post-publish canary

`.github/workflows/post-publish-canary.yml` re-runs the same corpus against the just-published version on the npm registry. This catches the rare case where the published tarball differs from what was tested (a packaging mismatch). On failure it opens a P0 issue automatically.

### 4. The mirror-test workflow

`.github/workflows/init-corpus-mirror-test.yml` exercises the `tarball.mirror` fallback path in `setup.sh`. Runs on any PR touching the corpus and weekly on Mondays. See [#411](https://github.com/proffesor-for-testing/agentic-qe/issues/411) for the rationale.

### 5. The chaos workflow

`.github/workflows/init-chaos.yml` runs adversarial inputs (UTF-16LE BOM, symlink loops, binary-as-text, minified bundles, control characters, mixed line endings) against `aqe init` weekly. Catches a different class of failure than the everyday-real gate — see [tests/fixtures/init-chaos/README.md](../tests/fixtures/init-chaos/README.md) and [#410](https://github.com/proffesor-for-testing/agentic-qe/issues/410).

## How to interpret a failed gate

When the `pre-publish-gate` job goes red, do this:

1. **Read the per-fixture verdict.** Open the workflow run, look at the `Append gate summary to job summary` step's output. It prints one line per fixture in the form `<id> PASS` or `<id> FAIL <code>` where `<code>` identifies which assertion failed (e.g. `A7-timeout`, `A11-kg-entries-low`, `A22-second-init-failed`).
2. **Download the `init-corpus-logs` artifact.** Each fixture has `${id}.log` (stderr from init), `${id}.json` (the `--json` output), and `${id}.run-meta.txt` (timing + exit code). Read the log for the failing fixture first.
3. **Reproduce locally** with the same install spec the gate used. From a clean checkout: `npm run build && npm pack && AQE_LOCAL_TARBALL=./agentic-qe-$(node -p "require('./package.json').version").tgz ./tests/fixtures/init-corpus/run-gate.sh`.
4. **Fix the bug, push the fix, and re-tag.** Do not delete and re-create the tag without the fix landing first — the gate runs on the tag SHA, not on main.

The cardinal rule from #401 applies: **"I believe it's unlikely" is not verification.** If you find yourself wanting to mark a fixture as "flaky" rather than "broken", stop and reproduce it locally first.

## How to add a new fixture

See the corpus README's [Updating the corpus](../tests/fixtures/init-corpus/README.md#updating-the-corpus) section. Quick version:

1. Pick a new immutable commit SHA from a real public repo.
2. Compute its sha256, update `MANIFEST.json` with the new entry.
3. Run `./scripts/upload-init-corpus-mirror.sh` to populate the self-hosted mirror with the new tarball, then set `tarball.mirror` in `MANIFEST.json` accordingly.
4. Run `./tests/fixtures/init-corpus/setup.sh && ./tests/fixtures/init-corpus/run-gate.sh` locally to confirm the new fixture passes the gate.
5. Land the change in a PR that explains *why* the new fixture is needed (404 on existing? new bug class? upstream repo migration?).

## Verification matrix in release notes

Every release-notes file under `docs/releases/vX.Y.Z.md` should include a verification matrix showing which fixtures were exercised by the gate that produced the release. The matrix is generated by the `embed-verification-matrix.sh` script.

### How to embed the matrix

After the `npm-publish.yml` workflow completes for a tag:

```bash
# 1. Find the workflow run ID for the release tag
gh run list --workflow=npm-publish.yml --branch=main --limit=10

# 2. Generate the matrix from that run's gate artifact
./scripts/embed-verification-matrix.sh <run-id> >> docs/releases/vX.Y.Z.md

# 3. Commit + open PR for the release notes update
```

The script downloads the `init-corpus-logs` artifact from the run, parses `summary.txt`, and emits a markdown table. Output format:

```markdown
## Verification matrix (agentic-qe@X.Y.Z)

Generated from npm-publish.yml run <run-id> on <date>.

| Fixture | Status |
|---|---|
| tiny-ts          | PASS |
| mid-ts           | PASS |
| multi-lang-real  | PASS |
| self-dogfood     | PASS |
```

The current matrix only carries Status. Time and KG-entries columns are tracked as a future enhancement — the gate's `summary.txt` doesn't carry per-fixture timing or KG counts today, so populating those columns would require either parsing the per-fixture JSON or extending the gate. Either is a larger change than #409 was scoped for; the status-only matrix ships value immediately and can be expanded later.

## The post-mortem this all comes from

The verification layer described above was built in response to [#401](https://github.com/proffesor-for-testing/agentic-qe/issues/401), the post-mortem for the v3.9.1–v3.9.4 init regression series. Every shipped CI gate, fixture, and policy in this document maps to a specific lesson from that post-mortem. Read it before proposing structural changes here — particularly the part about why we test against real public repos rather than synthetic fixtures.

## Related documents

- [tests/fixtures/init-corpus/README.md](../tests/fixtures/init-corpus/README.md) — corpus design, per-fixture rationale, update procedure
- [tests/fixtures/init-chaos/README.md](../tests/fixtures/init-chaos/README.md) — chaos shapes, failure-mode coverage
- [docs/policies/release-verification.md](policies/release-verification.md) — the load-bearing release-process policy (gate + version updates)
- [Issue #401](https://github.com/proffesor-for-testing/agentic-qe/issues/401) — the post-mortem
- [`.github/workflows/npm-publish.yml`](../.github/workflows/npm-publish.yml) — the gate workflow
- [`.github/workflows/post-publish-canary.yml`](../.github/workflows/post-publish-canary.yml) — the post-publish canary
