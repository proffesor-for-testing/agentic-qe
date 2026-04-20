# CI/CD Deep Analysis Report — v3.9.13

**Date**: 2026-04-20
**Agent**: qe-ci-engineer (swarm agent 11)
**Scope**: All GitHub Actions workflows + CodeQL + Dependabot posture
**Previous report**: `docs/qe-reports-3-8-13/11-ci-deep-analysis-report.md`
**Tools used**: `gh` v2.88.0 (authenticated), `actionlint` v1.7.12, Grep/Read

---

## Executive Summary

CI/CD at v3.9.13 has undergone a **major remediation** since v3.8.13. The two most critical findings from the previous report — (1) npm publishes shipping without a test gate and (2) optimized-ci having 0% success on 6 of 9 workflows — are both substantially fixed. The release of v3.9.13 itself (2026-04-17) flowed through a 4-stage gated pipeline (`build` → `pre-publish-gate` (corpus init) → `tests-on-tag-sha` (fast unit suite) → `publish`), all four jobs green, and a post-publish canary (`post-publish-canary.yml`) verified the live npm tarball 12 minutes later.

Remaining issues are narrower and lower-severity:

- **P0**: None. The previously-P0 "publish without tests" is closed.
- **P1**: `qcsd-production-trigger.yml` still `git push`es to protected `main` → 100% failure on every release. Exactly the same failure mode flagged in v3.8.13 — this is an unfixed regression carrier. `init-chaos.yml` (new) has 2/2 failures on `npm install`.
- **P2**: No Node.js version matrix (everything pinned to 24.13.0 despite `engines: ">=18.0.0"`). No OS matrix (ubuntu-latest only). Floating `@v4` action tags — none SHA-pinned. No explicit `.github/dependabot.yml` (GitHub-side Dependabot security alerts are on, but no automated PR bumps for devDependencies).

**Score: 7.5 / 10** (v3.8.13 was **3/10**). Delta: **+4.5**. The publish path is now the strongest part of CI, not the weakest.

---

## Workflow Inventory & Recent Runs

`actionlint` on all 12 workflow files: **0 errors, 0 warnings** (exit 0, clean). The feedback_actionlint_for_workflows.md memory is satisfied — workflows validated with actionlint, not js-yaml.

| # | Workflow | Trigger | Last 10 runs (success / fail / cancel / skip) | State |
|---|----------|---------|----------------------------------------------|-------|
| 1 | `optimized-ci.yml` | push main/develop, PRs, manual | **5 / 1 / 4 / 0** | **Fixed-ish** (was 0/2/8 — now 50% success) |
| 2 | `npm-publish.yml` | `release: published`, manual | **9 / 1 / 0 / 0** (90%) | **Fixed** — now has test gates |
| 3 | `post-publish-canary.yml` | after npm-publish succeeds | **7 / 0 / 0 / 2** (100% of real runs) | **NEW** — added post-v3.8.13 |
| 4 | `pre-publish-gate` (job in npm-publish) | part of npm-publish | Green on v3.9.13 | **NEW** — 4-fixture corpus init gate |
| 5 | `tests-on-tag-sha` (job in npm-publish) | part of npm-publish on release | Green on v3.9.13 | **NEW** — fast unit suite re-run |
| 6 | `mcp-tools-test.yml` | push main/testing-with-qe (paths), PRs | **10 / 0 / 0 / 0** (100%) | **Fixed** (was 0/1/9) |
| 7 | `coherence.yml` | push main, PRs (paths) | **10 / 0 / 0 / 0** (100%) | Stable (still masks via `\|\| true`) |
| 8 | `skill-validation.yml` | PRs on `.claude/skills/**`, manual | **10 / 0 / 0 / 0** (100%) | Stable |
| 9 | `pr-template-check.yml` | PR open/edit | **9 / 1 / 0 / 0** (90%) | Stable |
| 10 | `init-corpus-mirror-test.yml` | weekly cron + manual | **4 / 2 / 0 / 0** | **NEW**, flaky on fixture download |
| 11 | `init-chaos.yml` | weekly cron + manual | **0 / 2 / 0 / 0** (0%) | **NEW**, broken at `npm install` |
| 12 | `qcsd-production-trigger.yml` | after npm-publish | **0 / 8 / 0 / 2** (0%) | **Broken — UNCHANGED from v3.8.13** |
| 13 | `benchmark.yml` | manual only (release disabled) | No recent runs | **Correctly disabled** (P3 fix applied) |
| 14 | `n8n-workflow-ci.yml` | push/PR on n8n paths (cron disabled) | 10/10 fail at last trigger (2026-03-19) | Dormant, path-filtered |

CodeQL: **configured via GitHub default setup** (weekly, languages: actions/javascript/typescript/python) — not a workflow file, which is why the Grep earlier missed it. No custom CodeQL workflow needed.

Dependabot: **security alerts ON**, but **no `.github/dependabot.yml`** for scheduled dependency-bump PRs. Security vulnerability autofixes are handled server-side; no dev-dep refresh cadence.

### Deleted since v3.8.13
- `publish-v3-alpha.yml` — **not present** in the repo (CLAUDE.md references it as a distinct alpha workflow, but the file no longer exists, so the "use npm-publish, not alpha" rule is now enforced by physics). No alpha/beta channel publish workflow exists at all.
- `sauce-demo-e2e.yml` — gone (previous report P7 recommendation applied).

---

## v3.8.13 Regression Remediation — Verification

| v3.8.13 Finding | Severity | Status | Evidence |
|---|---|---|---|
| optimized-ci 0% success (0/30 runs) | P0 | **Substantially fixed** | Last 10: 5 success, 1 fail, 4 cancel. `continue-on-error: true` removed from all test steps (was 4 instances, now 0). Timeouts bumped from 15→15 but journey shards now split across 4 parallel jobs, so effective time budget is ~5× larger. |
| `npm-publish.yml` had no `needs:` on test job | **P0** | **Fixed** | `publish` job now requires `needs: [build, pre-publish-gate, tests-on-tag-sha]`, line 228. The `if:` at lines 233-237 explicitly blocks publish unless build=success AND pre-publish-gate=success AND tests-on-tag-sha ∈ {success, skipped}. Verified on v3.9.13 run (24574829895): all 4 jobs green before npm publish step ran. |
| `publish-v3-alpha.yml` risk of misuse for production | P1 | **Fixed by deletion** | File no longer exists. CLAUDE.md still references it as a cautionary tale but there is no way to publish via alpha from this repo. |
| `benchmark.yml` 100% fail (missing `benchmarks/suite.ts`) | P2 | **Fixed** | Release trigger commented out (lines 10-13), only `workflow_dispatch` remains. No release-time failures. |
| `qcsd-production-trigger.yml` `git push` to protected main | P2 | **Not fixed** | Still uses direct push. 8/10 of last 10 runs are `failure` with the same `GH013 Cannot update this protected ref` error. Exact text from run 24578828261: `remote: - Cannot update this protected ref. - Changes must be made through a pull request.` |
| sharp transient install timeouts | P3 | Unverified (no recent occurrence) | No `.npmrc` changes observed; probably mitigated by upstream npm cache warming rather than by the recommended fix. |
| 14 `continue-on-error: true` instances | P3 | **Partially reduced** | Now **10 instances** across 5 workflows. Removed from optimized-ci entirely (0 in that file vs. 4 before). Remaining are concentrated in `mcp-tools-test.yml` (3 — one of which is a legitimate junit-hang workaround) and `skill-validation.yml` tier-2/tier-1 (5 — by design, tier-based strictness). |
| Vitest process hang | P1 | Mitigated by wrapper | `scripts/ci-vitest-run.sh` detects "Test Files X passed" then exits 0 even if vitest hung. Not a clean fix (native-handle cleanup still missing) but is working — cancels are down from 8/10 to 4/10. |

**Net**: 5 of 8 previous-report P0/P1/P2 findings closed, 1 partially closed, 1 unchanged, 1 unverifiable.

---

## Release Workflow for v3.9.13 — Detailed Trace

```
GitHub release v3.9.13 created           2026-04-17 17:32:36Z (target: main, sha 4742c41f)
Release published                         2026-04-17 17:33:02Z
  → npm-publish.yml triggered (run 24574829895)  17:33:04Z
    Job 1: Build and Verify                      17:33:07 → 17:36:43  (3m 36s, success)
    Job 2: Pre-publish init gate (corpus)        17:36:46 → 17:43:14  (6m 28s, success)  ← 4 pinned public-repo fixtures
    Job 3: Tests on tag SHA                      17:36:46 → 17:41:28  (4m 42s, success)  ← npm run test:unit:fast
    Job 4: Publish to npm                        17:43:17 → 17:45:27  (2m 10s, success)
  → post-publish-canary.yml triggered            17:45:30Z
    Init canary against published @3.9.13        success (verified CDN serves tarball via `npm install --dry-run`)
  → qcsd-production-trigger.yml triggered        17:45:30Z — FAILED (git push to protected main)
```

The publish path is **gated end-to-end**. Fast unit suite must pass on the tag SHA, and the corpus init gate (4 real public repos, not synthetic fixtures — satisfies feedback_synthetic_fixtures_dont_count) must pass, before `npm publish --provenance` runs. After publish, a separate workflow re-runs the corpus gate against the actual npm tarball with up to 5 min of CDN propagation retry.

The only failure on the release path was `qcsd-production-trigger.yml`, which is downstream of publish and cannot block the release. So users got a clean v3.9.13 but telemetry collection silently failed (as it has been for 8 consecutive releases).

---

## Node / OS Matrix

- `package.json` engines: `"node": ">=18.0.0"`
- Every workflow that pins a Node version uses `'24.13.0'`. Grep for `node-version:` across all workflows returns only 24.13.0.
- **Gap**: Users on Node 18, 20, 22 are untested. The claim `">=18.0.0"` is a source-of-truth mismatch — we ship for Node 18+ but only CI-validate on 24.13.
- **OS**: 100% `ubuntu-latest`. No macOS or Windows runners anywhere. Several native modules (`better-sqlite3`, `hnswlib-node`, `sharp`) have known Windows/macOS prebuild quirks — untested by CI.

This was a P2 in the previous report and remains unaddressed.

---

## Security Posture

### Permissions (ok)
Every workflow declares a top-level `permissions:` block. Default is minimum-scope (most are `contents: read` only). `npm-publish.yml` correctly scopes `id-token: write` for OIDC trusted-publisher provenance. `post-publish-canary.yml` has `issues: write` only for P0-issue auto-creation on canary failure. No workflow uses `permissions: write-all` or defaults to the full-access token.

### Secrets (ok but one concern)
- `NPM_TOKEN` — used in `npm-publish.yml` only, gated by `environment: npm-publish` (requires manual approval per GitHub environment protection rules if configured). **Verify** the `npm-publish` environment has required reviewers set — I can't check this from CLI.
- `ANTHROPIC_API_KEY` — used in `skill-validation.yml` for eval runs only, protected by manual-trigger-only.
- `N8N_API_KEY`, `N8N_BASE_URL`, `N8N_WEBHOOK_AUTH`, `SLACK_WEBHOOK_URL` — only in dormant `n8n-workflow-ci.yml`, not on any active code path.
- No hardcoded tokens found (Grep for `ghp_`, `sk-`, `npm_` returned 0 results in workflows).

### Action Pinning (weak)
**Every** action reference uses a floating tag — `@v4`, `@v7`, `@v1`. **Zero** SHA pins. Count from Grep:
- `actions/checkout@v4`: 28 occurrences
- `actions/setup-node@v4`: 22 occurrences
- `actions/upload-artifact@v4`: 18 occurrences
- `actions/download-artifact@v4`: 6 occurrences
- `actions/github-script@v7`: 3 occurrences
- `actions/cache@v4`: 3 occurrences
- `dorny/test-reporter@v1`: 1 occurrence (mcp-tools-test.yml)
- `slackapi/slack-github-action@v1`: 1 occurrence (n8n-workflow-ci.yml)

For an OSS project with 65 forks and 321 stars publishing to npm under `--provenance`, the risk of a compromised upstream action (e.g. tj-actions/changed-files incident, 2025) injecting secrets into the build is real and mitigable by SHA-pinning all `uses:` references. Recommend `ratchet pin` or `pinact` as an automation.

### CodeQL (ok)
Default setup, weekly schedule, `remote` threat model, all 5 relevant languages indexed. Last update 2026-04-13. No custom query suite, which is fine for this project.

### Dependabot (weak)
- Security updates: enabled server-side (via repo settings).
- No `.github/dependabot.yml` → no scheduled version bumps. Dev dependencies drift silently.
- Recommend: add a minimal `dependabot.yml` covering `npm` (ecosystem: weekly, open-pull-requests-limit: 5) and `github-actions` (ecosystem: weekly) — the github-actions ecosystem would also auto-PR SHA-pin updates, solving both gaps at once.

---

## P0 / P1 / P2 Action Items

### P0 — None.

The previously-P0 "npm publish bypasses tests" is closed. No new P0 issues introduced.

### P1

1. **`qcsd-production-trigger.yml` repeated `git push` to protected main**. Same failure mode as v3.8.13. 8/10 recent runs failed with `GH013`. Telemetry collection for DORA metrics is silently broken for 8+ releases. Fix: switch to the `gh pr create` pattern proposed in the v3.8.13 P4 remediation (write telemetry to a branch, open a PR with `[skip ci]` label, let a human merge).
2. **`init-chaos.yml` 100% failure at `npm install`**. Workflow has run twice (2026-04-12, 2026-04-19), both failed at dependency install. Either fix the install (likely native-module or matrix issue) or disable until fixed — a workflow that has never succeeded is CI noise.

### P2

3. **No Node.js version matrix**. Add 18, 20, 22, 24 to a matrix job (at minimum in optimized-ci or a dedicated compatibility job). `engines: ">=18.0.0"` is currently unsupported by evidence.
4. **No OS matrix**. Add macOS and Windows runners for at least the build+fast-unit job. Critical because `better-sqlite3`, `hnswlib-node`, `sharp` all have platform-specific prebuilds.
5. **Unpinned actions**. 80+ action references on floating tags. Pin all `uses:` to SHAs and automate bumps with Dependabot's `github-actions` ecosystem.
6. **Missing `.github/dependabot.yml`**. Add config for `npm` (weekly) and `github-actions` (weekly) ecosystems.
7. **`init-corpus-mirror-test.yml` flaky** (2/6 failures). Investigate whether fixture download is flaky or the mirror itself is.

### P3

8. **`continue-on-error: true` in `mcp-tools-test.yml` line 158** — on the integration test step itself. The test-reporter and upload-artifact usages are justified, but masking test failures in the integration job is not. Remove.
9. **`coherence.yml` line 66 `\|\| true`** — still masks errors in the coherence check script. Replace with explicit exit-code handling.
10. **`pr-template-check.yml` 1 failure in last 10**. Trivially low but worth a glance at run logs.

---

## Remediation Table (v3.8.13 findings → v3.9.13 status)

| Priority | v3.8.13 Finding | Recommended fix | v3.9.13 Status | Evidence |
|---|---|---|---|---|
| P1 | vitest hang, optimized-ci 0% success | Global teardown + bumped timeouts | **Fixed (via shards + wrapper)** | 5/10 success in last 10 runs. `ci-vitest-run.sh` detects hang. |
| P1 | npm-publish has no test gate | Add `test` job as `needs:` before publish | **Fixed** | `pre-publish-gate` + `tests-on-tag-sha` both required. v3.9.13 verified. |
| P2 | benchmark.yml references missing suite | Disable release trigger | **Fixed** | Trigger commented out lines 10-13. |
| P2 | qcsd `git push` to protected main | Use PR flow or GH App token | **NOT fixed** | 8/10 runs still failing with `GH013`. |
| P3 | sharp install timeouts | Add `.npmrc` binary host config | Unverified | No `.npmrc` change observed. No recent occurrence. |
| P3 | 14× `continue-on-error: true` | Remove from test steps | **Partially fixed** | Now 10 instances; removed entirely from optimized-ci. |
| P4 | sauce-demo-e2e broken | Fix tsconfig or delete | **Fixed by deletion** | File removed. |
| P4 | n8n-workflow-ci requires unprovisioned secrets | Delete or make manual | **Partially** | Schedule disabled; workflow remains but path-filtered. |

---

## Score

| Dimension | v3.8.13 | v3.9.13 | Delta |
|---|---|---|---|
| Publish safety (tests before npm?) | 1/10 | 9/10 | +8 |
| CI reliability (pass rate on main) | 2/10 | 7/10 | +5 |
| Action-lint cleanliness | Unknown | 10/10 | n/a |
| Permission scoping | 5/10 | 8/10 | +3 |
| Matrix coverage (Node/OS) | 2/10 | 2/10 | 0 |
| Supply-chain (SHA pins, Dependabot) | 3/10 | 3/10 | 0 |
| Canary / post-publish verification | 0/10 | 9/10 | +9 |
| **Composite** | **3.0 / 10** | **7.5 / 10** | **+4.5** |

The publish pipeline transformation (score 1 → 9) is the single biggest CI quality improvement between v3.8.13 and v3.9.13. The `pre-publish-gate` + `tests-on-tag-sha` + `post-publish-canary` trio is a legitimately well-designed release safety net, complete with thoughtful comments in `post-publish-canary.yml` (lines 33-40) explaining why it filters on `event == 'release'` to avoid firing P0 issues on dry-run dispatches. Whoever wrote these workflows has been thinking carefully about failure modes. That quality of thinking is now the CI baseline.

What's holding the score below 8.5 is the things that were P2/P3 in the previous report and remain P2/P3 now — matrix coverage, SHA pinning, Dependabot config, and the lingering qcsd-production-trigger regression — none of which block users, but all of which constitute known unaddressed risk.

---

## Evidence Trail

- `gh run list --workflow=<name> --limit 10 --json conclusion,status,createdAt` for all 12 active workflows
- `gh release view v3.9.13 --json name,tagName,createdAt,publishedAt,isDraft,isPrerelease` — verified tag/publish times
- `gh run view 24574829895 --json jobs` — verified all 4 npm-publish jobs green on v3.9.13
- `gh run view 24578828261 --log-failed` — confirmed qcsd-production-trigger failure text (GH013)
- `gh run view 24622097222 --json jobs -q` — confirmed init-chaos fails at `npm install`
- `gh api repos/proffesor-for-testing/agentic-qe/code-scanning/default-setup` — CodeQL configured weekly
- `/tmp/actionlint -no-color .github/workflows/*.yml` — exit 0, all 12 files clean
- Direct inspection of `npm-publish.yml`, `optimized-ci.yml`, `post-publish-canary.yml`
- Grep for `continue-on-error: true`, `uses:\s+[\w\-\./]+@(v\d|main|master)`, secret references across all workflows
