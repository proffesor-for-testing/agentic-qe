# aqe init release-gate corpus

This directory contains the load-bearing verification fixtures for `aqe init`.
The corpus is the structural fix for the verification gap that allowed v3.9.1
through v3.9.4 to ship broken init flows. See
[issue #401](https://github.com/proffesor-for-testing/agentic-qe/issues/401)
for the post-mortem.

## What this corpus is

Four pinned slices of **real public repositories**, downloaded by sha256, run
end-to-end through `aqe init --auto` as a release-blocking gate in
[`.github/workflows/npm-publish.yml`](../../../.github/workflows/npm-publish.yml).

| Fixture | Source | Why it's in the corpus |
|---|---|---|
| `tiny-ts` | [`developit/mitt@b240473`](https://github.com/developit/mitt/tree/b240473b5707857ba2c6a8e6d707c28d1e39da49) | Minimal TS happy path. If the gate fails on `tiny-ts`, init is broken at the most basic level. |
| `mid-ts` | [`sindresorhus/p-queue@55d306b`](https://github.com/sindresorhus/p-queue/tree/55d306ba03479dcc531a8e06deab24d3f60feacd) | Idiomatic mid-size TS with strict types, multiple test files, and build config. Catches parser regressions on real type complexity. |
| `multi-lang-real` | [`ruvnet/RuView@2a05378`](https://github.com/ruvnet/RuView/tree/2a05378bd229df07eff3e309d414d65510ce507c) | Real multi-language codebase (TS / Python / Rust / JS / Swift). **Crucially contains [`examples/ruview_live.py`](https://github.com/ruvnet/RuView/blob/2a05378bd229df07eff3e309d414d65510ce507c/examples/ruview_live.py)** — the 28 KB Python file that triggered the v3.9.4 init deadlock against `@ruvector/router`'s broken HNSW. This fixture is the permanent regression marker for that specific bug class. |
| `self-dogfood` | `agentic-qe` (current checkout) | Largest fixture. If a release breaks init on the very repo it ships from, the gate must catch it. |

## What this corpus is *not*

- **Not a unit test fixture.** Unit tests stay in `tests/unit/` and `tests/integration/`. This corpus only ever runs `aqe init --auto` end-to-end against an installed `agentic-qe` package.
- **Not a synthetic generator output.** Per the lesson from [#401 Part 1](https://github.com/proffesor-for-testing/agentic-qe/issues/401), synthetic `export class Foo {}` fixtures hide real-world content bugs. Every fixture is a verbatim slice of a real public repository at a pinned immutable commit SHA.
- **Not a chaos test.** Pathological encodings, symlink loops, mixed line endings, etc. belong in a separate weekly chaos workflow, not in the release gate. This corpus is about everyday-real, not adversarial.

## How the gate works

```
.github/workflows/npm-publish.yml
└── pre-publish-gate job (runs after build, before publish)
    ├── 1. Download build artifact (dist/)
    ├── 2. Run `npm pack` → agentic-qe-${VERSION}.tgz
    ├── 3. tests/fixtures/init-corpus/setup.sh
    │      └── For each fixture in MANIFEST.json:
    │          ├── curl tarball (cached by sha256 across CI runs)
    │          ├── verify sha256 matches MANIFEST.json
    │          └── tar -xzf into ./extracted/
    └── 4. tests/fixtures/init-corpus/run-gate.sh
           └── For each fixture, runs 22 assertions (A1–A22):
               ├── A1–A4   fixture exists, mustContainFileSha256 matches, cleanroom copy ok
               ├── A5–A7   npm install of agentic-qe ok, binary present, init exits 0 within timeoutSec
               ├── A8–A10  init --json output is valid JSON, success=true, NO step.status='error'
               ├── A11–A12 .agentic-qe/memory.db exists, KG entries >= snapshot × tolerance
               ├── A13–A17 skills/agents present (json OR on-disk), CLAUDE.md, MCP, .mcp.json
               ├── A18–A20 CLAUDE.md exists, workers registered, config.yaml non-empty
               ├── A21     elapsed <= expectedElapsedSec × 3 (subthreshold stall detection)
               └── A22     if doubleInit: a SECOND init in the same cleanroom also passes
                           (exercises the delta-scan path of phase 06 — the actual surface
                            that hung in v3.9.1 ruview, never reached on a first init)
```

If any fixture fails, the publish job does not run. The release tag stays
unpublished until the bug is fixed.

## Running the gate locally

```bash
# One-time download + extraction (cached after first run)
./tests/fixtures/init-corpus/setup.sh

# Build the local agentic-qe package
npm run build && npm pack

# Run the gate against the local .tgz
AQE_LOCAL_TARBALL=./agentic-qe-$(node -p "require('./package.json').version").tgz \
  ./tests/fixtures/init-corpus/run-gate.sh
```

The gate writes per-fixture logs to `tests/fixtures/init-corpus/run-logs/` so
you can inspect failures.

## Updating the corpus

When you bump a fixture (rare — should only happen if a pinned tarball goes
404 or if the upstream repo gains a regression we want to track):

1. Pick a new immutable commit SHA from the upstream repo.
2. Download the tarball: `curl -fSL "https://codeload.github.com/<owner>/<repo>/tar.gz/<sha>" -o /tmp/new.tar.gz`
3. Compute checksum: `sha256sum /tmp/new.tar.gz`
4. Update `MANIFEST.json` with the new SHA, sha256, sizeBytes, and `extractedDir`.
5. Run `./setup.sh` and `./run-gate.sh` locally to confirm the new fixture passes the gate.
6. Run `./scripts/upload-init-corpus-mirror.sh` to populate the self-hosted mirror with the new tarball. The script is idempotent — existing assets are skipped. Then set `tarball.mirror` in `MANIFEST.json` to the new asset URL (format: `https://github.com/proffesor-for-testing/agentic-qe/releases/download/init-corpus-v1/<sha256>.tar.gz`).
7. Commit. PR should explain *why* the bump was needed (404? new bug class? upstream repo migration?).

## Mirror fallback (codeload drift resilience)

GitHub's `codeload.github.com` has regenerated `git archive` output at least
twice (2023, 2024). When it happens, every pinned sha256 mismatches and the
release gate hard-fails until a maintainer scrambles. To defend against
this, each tarball fixture has a `tarball.mirror` field pointing at a
self-hosted copy on the
[`init-corpus-v1` release](https://github.com/proffesor-for-testing/agentic-qe/releases/tag/init-corpus-v1)
of this repo. Assets are content-addressed as `<sha256>.tar.gz`.

`setup.sh` tries the primary URL first. On network failure or sha256
mismatch, it falls back to the mirror, verifies the sha256 there, and
logs a loud `WARNING: using mirror for <id>` line so CI surfaces the
drift even though the job stays green. The fallback path is exercised
by [`init-corpus-mirror-test.yml`](../../../.github/workflows/init-corpus-mirror-test.yml)
on every PR that touches this directory and weekly on Mondays.

The `upload-init-corpus-mirror.sh` script refuses to upload any tarball
whose sha256 does not match `MANIFEST.json` — the mirror must never
serve drifted content, since that would defeat the sha256 verification
in `setup.sh`.

**Never bump a fixture just because the upstream has a newer commit.** Pinned
SHAs are the whole point — if `multi-lang-real` is on the 2026-04-06 commit
forever, the regression marker for the v3.9.4 bug is preserved forever.

## Why these specific fixtures?

The proposal in issue #401 Part 2 listed 7 fixtures. We deliberately landed 4:

| #401 proposed | Action | Why |
|---|---|---|
| Small TS-only | **Kept** as `tiny-ts` | Baseline |
| Large TS monorepo | **Replaced** with `self-dogfood` | agentic-qe is the largest TS monorepo we have access to and proves init works on real complex code. No need for two of these. |
| Multi-language (ruview-shaped) | **Kept** as `multi-lang-real`, using actual RuView | The regression target is RuView. Use RuView, not a synthetic shape. |
| TS with minified bundles in `src/` | **Dropped** | This is a chaos test, not a release-gate marker. Belongs in a weekly chaos workflow if at all. |
| Project with pre-existing `.agentic-qe/` | **Covered via `doubleInit` flag** | Every fixture with `gate.doubleInit: true` runs init twice in the same cleanroom. The first run takes the `incremental=false` path of phase 06; the second hits the `incremental=true` delta-scan branch — the actual surface that hung in the original v3.9.1 ruview report. All 4 fixtures use `doubleInit: true`. |
| Unusual encodings, binary-in-text, symlinks | **Dropped** | Same — chaos workflow material, not a release blocker. |
| Clone of ruview at known-hang commit | **Kept** as the centerpiece of `multi-lang-real` | This is the most important fixture in the corpus. |

The pruned set runs in ~3-5 min on a GitHub Actions runner. The full 7 would
have pushed the gate past the 10 min mark, which makes engineers add `[skip
ci]` workarounds. Faster is better.

## Deferred to follow-up issues

These items were considered for the corpus and explicitly deferred. They have
their own tracking issues so the deferral is visible:

| Item | Tracking issue | Why deferred |
|---|---|---|
| Phase 06 in `worker_threads.Worker` (#401 Part 3 original proposal) | [#407](https://github.com/proffesor-for-testing/agentic-qe/issues/407) | The deadlocking dependency was replaced (ADR-090); the corpus is the load-bearing prevention layer. Worker isolation becomes load-bearing again only if a future native dep deadlocks — `#407` defines when to revisit. |
