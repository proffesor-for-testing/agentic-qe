# CI/CD Deep Analysis Report — v3.10.6

**Date**: 2026-06-12
**Agent**: qe-ci-engineer (QE fleet, Report 11)
**Analyzed version**: v3.10.6 (package.json source of truth)
**Baseline for deltas**: v3.9.13 (`docs/qe-reports-3-9-13/11-ci-deep-analysis-report.md`, prior score 7.5/10)
**Tools used**: `gh` v(authenticated as proffesor-for-testing), `actionlint` v1.7.12, Read/Grep/Bash. All commands real; no fabrication.

---

## Executive Summary

CI/CD continued to strengthen since v3.9.13. The release pipeline for v3.10.6 itself
flowed through a now **6-job gated publish** (`build` → `pre-publish-gate` + `tests-on-tag-sha`
+ `integration-tests-on-tag-sha` + `consumer-audit` → `publish`) and succeeded
(`npm-publish.yml` run on 2026-06-11, `v3.10.6`, **completed/success**). Two new safety
gates landed (`safety-eval.yml` ADR-106, `invariant-check.yml` ADR-107/108), both green on
the release tag, both least-privilege `contents: read`. The publish gate also **demonstrably
worked**: v3.10.5's first publish attempt was **blocked** when `tests-on-tag-sha` failed →
`publish` job **skipped** (run 27275586477). That is the gate doing exactly its job.

Two prior P1s moved:

- **`init-chaos.yml` (prior P1, 0% success) → FIXED.** Last 5 runs: 3 success, 2 failure;
  the 3 most recent (2026-05-24, 05-31, 06-07) all **success**. The `npm install` step now
  uses `npm ci --no-audit --no-fund` (line 58).
- **`qcsd-production-trigger.yml` (prior P1, `git push` to protected `main`) → PARTIAL.** The
  code was rewritten to push to a bot branch and `gh pr create` instead of pushing to `main`
  (lines 104–141). The protected-ref failure is gone. **But it still fails** — now at the PR
  step with `Resource not accessible by integration (createPullRequest)` (run 27366464283,
  2026-06-11). Root cause: the workflow's `permissions:` block (lines 27–29) grants
  `contents: write` + `issues: write` but is **missing `pull-requests: write`**, so the
  GITHUB_TOKEN cannot open the PR. One-line fix. Failure mode changed; release-blocking impact
  remains nil (downstream of publish).

The persistent P2 cluster is unchanged: **no Node matrix** (no 18/20/22/24), **no macOS/Windows
runners**, **zero SHA-pinned actions** (122× `@v4`, 3× `@v7`, 2× `@v1` — all floating), **no
`.github/dependabot.yml`** file.

**Score: 7.8 / 10** (prior 7.5). Delta **+0.3**. The two new safety workflows and the
qcsd-failure-mode improvement nudge it up; the unmoved P2 matrix/supply-chain cluster and the
still-red qcsd job cap it below 8.

- **P0: 0** (publish path remains gated end-to-end; v3.10.6 verified).
- **P1: 1** (qcsd PR step missing `pull-requests: write`).
- **P2: 4** (Node matrix, OS matrix, SHA pins, dependabot.yml).

---

## Workflow Inventory (15 files)

`actionlint -no-color .github/workflows/*.yml` → **exit 0, clean** (satisfies the
actionlint-not-js-yaml memory rule). 15 workflow files; `gh workflow list` shows 17 active
entries (incl. server-side **CodeQL** default-setup and **Dependabot Updates**, neither a
file in-repo).

| # | Workflow | Trigger | Recent run health (last 5) | State vs baseline |
|---|----------|---------|----------------------------|-------------------|
| 1 | `npm-publish.yml` | release published, dispatch | v3.10.6 success; v3.10.5/v3.10.4 first-attempt failure (gate block) then success | **Strengthened** (6 jobs now) |
| 2 | `post-publish-canary.yml` | after publish | 06-11 success, 06-10 success | Stable, healthy |
| 3 | `optimized-ci.yml` | push main/develop, PR | main 06-11 success; feature-branch mix (fail/cancel) | Stable-ish |
| 4 | `safety-eval.yml` | PR (paths), release, dispatch | **all 5 success** (v3.10.6 + feature branch) | **NEW** (ADR-106) |
| 5 | `invariant-check.yml` | PR (paths), release, dispatch | v3.10.6 success; 1 earlier feature-branch failure (lineage path bug, since fixed) | **NEW** (ADR-107/108) |
| 6 | `test-qe-browser.yml` | PR (paths), push main, dispatch | main 04-22 success; 06-03 feature-branch failures | **NEW** since baseline (ADR-091) |
| 7 | `mcp-tools-test.yml` | push/PR (paths) | (not re-pulled; baseline 100%) | Stable |
| 8 | `coherence.yml` | push main, PR (paths) | stable | Stable (still masks via `\|\| true`, line 66) |
| 9 | `skill-validation.yml` | PR `.claude/skills/**`, dispatch | stable | Stable |
| 10 | `pr-template-check.yml` | PR open/edit | stable | Stable |
| 11 | `init-corpus-mirror-test.yml` | weekly cron + dispatch | (baseline flaky) | Stable |
| 12 | `init-chaos.yml` | weekly cron + dispatch | 3 recent success, 2 older failure | **FIXED** (was 0%) |
| 13 | `qcsd-production-trigger.yml` | after publish | **06-11 failure** (PR step), 06-10 fail, skipped | **PARTIAL** (push→PR, new perms bug) |
| 14 | `benchmark.yml` | dispatch only | no recent runs | Correctly disabled (release trigger commented lines 9–10) |
| 15 | `n8n-workflow-ci.yml` | push/PR n8n paths (cron off) | dormant | Path-filtered, dormant |

**CodeQL**: default setup, **0 open alerts** (`gh api .../code-scanning/alerts` → 0). Prior
alert 211 (`js/identity-replacement`, commit 0403a65f) resolved.

**`publish-v3-alpha.yml`**: **CONFIRMED DELETED** (file absent). The "use npm-publish, not
alpha" rule remains enforced by physics.

---

## Prior-Finding Remediation Table

| Prior finding | Sev | Status | Evidence |
|---|---|---|---|
| npm-publish gated on `needs: [build, pre-publish-gate, tests-on-tag-sha]` (WIN to re-verify) | P0-was | **FIXED / EXPANDED** | `publish.needs` now `[build, pre-publish-gate, consumer-audit, tests-on-tag-sha, integration-tests-on-tag-sha]` (npm-publish.yml:335). `if:` block lines 341–347 requires success of all + accepts skipped for the two release-only jobs. v3.10.6 run = success. |
| `post-publish-canary.yml` present (WIN) | — | **HELD** | Present; 06-11 main run success, 06-10 success/skipped pattern intact. |
| `publish-v3-alpha.yml` deleted (WIN) | — | **HELD** | File absent (verified `ls` fails). |
| `actionlint` clean on all workflows (WIN) | — | **HELD** | `actionlint -no-color .github/workflows/*.yml` exit 0, 15 files. |
| `qcsd-production-trigger.yml` git-push to protected `main` | P1 | **PARTIAL** | Rewritten to bot-branch + `gh pr create` (lines 104–141). GH013 protected-ref error gone. **New failure**: `Resource not accessible by integration (createPullRequest)` (run 27366464283) — `permissions:` missing `pull-requests: write` (lines 27–29 only have contents/issues write). |
| `init-chaos.yml` 100% fail at `npm install` | P1 | **FIXED** | 3 most-recent runs success (2026-05-24/05-31/06-07). Install now `npm ci --no-audit --no-fund` (line 58); secondary install `npm install --no-save --omit=dev` (line 93). |
| Node version matrix (18/20/22/24) | P2 | **UNCHANGED** | All workflows single-version. `node-version` is `24.13.0` (publish/CI/canary/coherence) or `20` (new safety/invariant/qe-browser). No multi-Node matrix anywhere. `engines: ">=18.0.0"` still unvalidated on 18/22. |
| macOS / Windows runners | P2 | **UNCHANGED** | 100% `ubuntu-latest`. No `macos-*`/`windows-*` runner. better-sqlite3/hnswlib-node/sharp platform prebuilds untested. |
| SHA-pinned actions (was 80+ floating) | P2 | **REGRESSED (count up)** | **0** SHA-pinned `uses:`. Floating tags now **122× `@v4`, 3× `@v7`, 2× `@v1`** (= 127). Growth driven by the 3 new workflows. |
| `.github/dependabot.yml` | P2 | **UNCHANGED** | File absent (`ls` fails; never committed in git history). "Dependabot Updates" in `gh workflow list` is the server-side security-alert engine, not a config-driven version-bump schedule. |
| `coherence.yml` `\|\| true` masking | P3 | **UNCHANGED** | line 66 `... > coherence-result.json 2>&1 \|\| true`. |
| `continue-on-error: true` instances | P3 | **~UNCHANGED** | 12 occurrences across 6 files (coherence, mcp-tools-test, benchmark, post-publish-canary, npm-publish, skill-validation). Baseline reported 10; the +2 are in new/canary jobs, mostly artifact/junit guards. |
| `benchmark.yml` release trigger disabled | P2-was | **HELD** | Release trigger commented (lines 9–10); `workflow_dispatch` only. |

Net: prior P1 ×2 → 1 FIXED, 1 PARTIAL (failure-mode improved, new sub-bug). All publish-path
WINS held and the gate was extended (+`consumer-audit`, +`integration-tests-on-tag-sha`). The
P2 matrix/supply-chain cluster is entirely unmoved (SHA-pin count grew).

---

## New-Workflow Review (ADR-105..110 wave)

### `safety-eval.yml` (ADR-106) — solid
- **Correct**: two layers. `deterministic` job always runs (engine tests + fixture
  trajectories: violating shapes MUST fail, compliant MUST pass — lines 58–82). `live` job
  gated `if: github.event_name != 'pull_request'` (line 89) and **gracefully skips** when
  `ANTHROPIC_API_KEY` absent (`exit 0` with `::warning::`, lines 103–106) rather than failing —
  honest "deterministic layer still gates" posture.
- **Least-privilege**: `permissions: contents: read` (lines 32–33). Confirmed by commit
  bbb1676b which added the block.
- **Install hygiene**: `npm ci --ignore-scripts` (no native builds) — fast and avoids
  postinstall flake.
- **Health**: all 5 recent runs success.
- **Minor nit (P3)**: the `live` job runs on release with `ANTHROPIC_API_KEY` from
  `secrets.*` but has **no `environment:` protection** (unlike `npm-publish`'s
  `environment: npm-publish`). A real API key gets injected into a job with no reviewer gate.
  Low risk (release-only, no fork PRs reach it), but `npm-publish` sets the better precedent.

### `invariant-check.yml` (ADR-107/108) — solid, recently bug-fixed
- **Correct**: verifies shipped qe-*.md sections, assets↔.claude divergence, qe-only scoping,
  mutation-tests the verifier itself (lines 59–63), and the ADR-108 benchmark lineage gate
  (lines 65–78).
- **Lineage fix landed properly**: commit a7e21f9e widened the rubric search to "results dir
  OR its parent" (line 73: `ls "$d"/RUBRIC-v*.md ... || ls "$d"/../RUBRIC-v*.md`). The gate
  had fired correctly on PR #523 with too-strict path assumption; now matches the real
  `benchmarks/<name>/RUBRIC-v1.md` + `<name>/results/` layout. v3.10.6 run = success; the one
  earlier feature-branch failure predates the fix.
- **Least-privilege**: `contents: read` (lines 36–37), added by bbb1676b.
- **Install hygiene**: `npm ci --ignore-scripts`.

### `test-qe-browser.yml` (ADR-091) — correct, inherently flaky
- 3 jobs (unit / smoke / eval), `contents: read` (lines 41–42), concurrency-guarded.
- The smoke/eval jobs do **real Vibium + Chrome-for-Testing** installs with a `--no-sandbox`
  wrapper for GH runners (lines 114–124, 170–180) — well-commented but a known flake surface
  (06-03 feature-branch runs failed; 04-22 main runs passed). Not on the release path, so the
  blast radius is bounded.

**Least-privilege + CodeQL verdict**: the "least-privilege permissions" commit (bbb1676b) and
the CodeQL alert-211 fix (0403a65f) **landed properly** — `contents: read` present on all
three new workflows, **0 open CodeQL alerts**.

---

## Release Trace — v3.10.6 (verified)

```
npm-publish.yml  v3.10.6  2026-06-11  → completed/success
  Build and Verify ........... success  (typecheck, build, bundle smoke, prod-dep audit)
  Pre-publish init gate ...... success  (4-fixture real-repo corpus)
  Tests on tag SHA ........... success  (test:unit:fast)
  Integration tests on tag ... success  (test:integration:fast, daemon-runtime seam, #491)
  Consumer-side audit ........ success  (tarball install + npm audit from consumer POV, #491/9.32)
  Publish to npm ............. success  (--provenance, environment: npm-publish)
post-publish-canary.yml  2026-06-11 main → success
qcsd-production-trigger.yml      2026-06-11 main → FAILURE (PR-create permission)
```

Gate-works evidence: **v3.10.5** first attempt (run 27275586477) — `Tests on tag SHA`
**failed**, `Publish to npm` **skipped**. The gate blocked a bad publish; a later corrected
run shipped v3.10.5. This is the single most valuable CI behavior in the repo, and it is
demonstrably live.

---

## Security Posture

- **Permissions**: every active workflow has a top-level `permissions:` block; new safety
  workflows are minimal `contents: read`. `npm-publish` correctly scopes `id-token: write`
  for OIDC provenance (lines 15–17). **Gap**: `qcsd-production-trigger.yml` permissions
  (lines 27–29) are mis-scoped — has `contents: write` + `issues: write` but lacks
  `pull-requests: write`, which is exactly why its PR step 403s.
- **SHA pinning (weak, regressed in count)**: 0 pinned, 127 floating refs. For an npm
  `--provenance` publisher, a compromised upstream action remains a real supply-chain risk.
- **Secrets**: `NPM_TOKEN` gated by `environment: npm-publish`; `ANTHROPIC_API_KEY` used in
  `safety-eval` live job (no environment gate — see nit) and `skill-validation`. No hardcoded
  tokens.
- **CodeQL**: default setup, 0 open alerts.
- **Dependabot**: server-side security alerts on; no `.github/dependabot.yml` → no scheduled
  dev-dep or github-actions version bumps (which would also auto-PR the SHA-pin updates).

---

## P0 / P1 / P2 Action Items

### P0 — None
Publish path gated end-to-end; v3.10.6 verified success.

### P1
1. **`qcsd-production-trigger.yml` PR step fails — missing `pull-requests: write`.** Add it to
   the `permissions:` block (lines 27–29). The git-push-to-main fix (prior P1) is otherwise
   correct; this is the last mile. Failure is downstream of publish so it does not block
   releases, but DORA telemetry collection has still never landed a PR.

### P2 (all unchanged from baseline)
2. **No Node matrix.** Add 18/20/22/24 to at least the build+fast-unit job. `engines:
   ">=18.0.0"` remains evidence-unsupported.
3. **No OS matrix.** Add macOS + Windows for build+fast-unit (better-sqlite3 / hnswlib-node /
   sharp prebuilds).
4. **0 SHA-pinned actions (127 floating).** Pin all `uses:` to SHAs; automate via dependabot
   `github-actions` ecosystem.
5. **No `.github/dependabot.yml`.** Add `npm` (weekly) + `github-actions` (weekly) — solves
   #4 and dev-dep drift in one file.

### P3
6. `safety-eval.yml` live job lacks `environment:` protection for `ANTHROPIC_API_KEY`.
7. `coherence.yml:66` `\|\| true` still masks coherence-check failures.

---

## Score

| Dimension | v3.9.13 | v3.10.6 | Delta |
|---|---|---|---|
| Publish safety (gates before npm) | 9/10 | 9.5/10 | +0.5 (consumer-audit + integration gate added; v3.10.5 block proven) |
| CI reliability (main pass rate) | 7/10 | 7/10 | 0 |
| Actionlint cleanliness | 10/10 | 10/10 | 0 |
| New safety workflows (ADR-106/107/108) | n/a | 8.5/10 | new (correct, least-priv, green; minor env-gate nit) |
| Permission scoping | 8/10 | 8/10 | 0 (new workflows good; qcsd mis-scoped) |
| Matrix coverage (Node/OS) | 2/10 | 2/10 | 0 |
| Supply-chain (SHA pins, Dependabot) | 3/10 | 3/10 | 0 (count regressed, posture same) |
| Canary / post-publish | 9/10 | 9/10 | 0 |
| **Composite** | **7.5 / 10** | **7.8 / 10** | **+0.3** |

The publish pipeline keeps getting safer (now a 6-job gate that visibly blocked a bad
v3.10.5 publish) and the two new ADR-106/107/108 safety workflows are well-built and green.
What keeps the score from breaking 8 is the same P2 cluster as last run — no Node/OS matrix,
zero SHA pins (count actually grew), no dependabot.yml — plus the still-red qcsd job whose
remediation got 90% of the way (push→PR) but tripped on a missing one-line permission.

---

## Shared Memory

Findings stored to namespace `aqe/v3/qe-reports-3-10-6` (CLI memory store reported broken;
recorded here per instructions):

- **ci-1 (P1)**: `qcsd-production-trigger.yml` prior `git push`→protected-main P1 is PARTIAL.
  Rewritten to bot-branch + `gh pr create` (lines 104–141), but now fails with
  `Resource not accessible by integration (createPullRequest)` (run 27366464283) because
  `permissions:` (lines 27–29) lacks `pull-requests: write`. One-line fix.
- **ci-2 (WIN-held)**: npm-publish gate held and EXPANDED — `publish.needs` now
  `[build, pre-publish-gate, consumer-audit, tests-on-tag-sha, integration-tests-on-tag-sha]`
  (npm-publish.yml:335). v3.10.6 success; v3.10.5 first attempt BLOCKED on failing tests
  (publish skipped, run 27275586477) — gate proven live.
- **ci-3 (FIXED)**: `init-chaos.yml` prior P1 (0% success) is FIXED — 3 most-recent runs
  success; install now `npm ci --no-audit --no-fund` (line 58).
- **ci-4 (NEW, good)**: ADR-106 `safety-eval.yml` + ADR-107/108 `invariant-check.yml` are
  correct, least-privilege `contents: read`, and green on v3.10.6. ADR-108 lineage rubric
  path fix (commit a7e21f9e) landed properly. CodeQL alert 211 fixed → 0 open alerts.
- **ci-5 (P2, regressed count)**: supply chain unmoved — 0 SHA-pinned actions, 127 floating
  refs (122×@v4, 3×@v7, 2×@v1, up from ~80), no `.github/dependabot.yml`.
- **ci-6 (P2, unchanged)**: no Node matrix (24.13.0/20 only, engines `>=18.0.0` unvalidated)
  and no macOS/Windows runners (100% ubuntu-latest) — native-module prebuilds untested.
