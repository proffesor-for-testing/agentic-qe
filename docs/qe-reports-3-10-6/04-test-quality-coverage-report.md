# Test Quality & Coverage Report - v3.10.6

**Date**: 2026-06-12
**Agent**: qe-coverage-specialist (Agent 04)
**Baseline**: v3.9.13 (2026-04-20)
**Analyzed version**: v3.10.6 (folder labeled qe-reports-3-10-6)
**Score**: 6.0 / 10 (delta vs v3.9.13: 0.0)

> Evidence discipline (ADR-105): every metric below is EXECUTED (real grep/find/git command, output cited) or STATIC (derived from a file). No simulated test runs. Coverage-by-domain is STATIC-inferred from test-file presence per `src/domains/*` (full `npm test` coverage NOT run — OOM risk per CLAUDE.md).

---

## Executive Summary

The suite grew from 790 to 884 test files (+94, +11.9%) and the test-to-source ratio rose from 0.63 to 0.68 — the largest single-release ratio jump in the window. The new ADR-105..110 learning/benchmark/safety work is **mostly tested**: the ADR-106 safety eval has dedicated behavioral tests (`tests/safety/behavioral/`), the ADR-109 interaction benchmark has `tests/unit/benchmarks/interaction-stats.test.ts`, and the dream/sona learning subsystem is well-covered (12 dream test files, 75 test files referencing sona). TDD adherence on net-new source files improved from 53% to **72.7%** (24/33), finally crossing the 70% threshold.

However, the two oldest structural P0s are **unchanged**: the enterprise-integration freeze holds for the **6th consecutive release** (all 6 critical services still have zero dedicated tests — `coordinator.test.ts` only mentions them incidentally), and the test-execution e2e subsystem (`browser-orchestrator`, `step-executors`, `step-retry-handler`, `retry-handler`) still has **zero dedicated tests**. Cleanup hygiene regressed again (234 files missing afterEach/afterAll, up from 186). Property-based testing is **stuck at 1 file for the 4th release**. Mutation testing (Stryker) remains absent. The score holds flat at 6.0: TDD/ratio gains exactly offset by the unbroken freezes, the cleanup regression, and the residual ADR-110 learning-wiring gaps.

---

## 1. Metrics Delta Table (v3.9.13 → v3.10.6)

| Metric | v3.9.13 | v3.10.6 | Delta | Evidence (command) |
|--------|--------:|--------:|------:|-------------------|
| Test files (.test.ts) | 777 | 871 | +94 | `find tests -name "*.test.ts" \| wc -l` → 871 |
| Spec files (.spec.ts) | 13 | 13 | 0 | `find tests -name "*.spec.ts" \| wc -l` → 13 |
| **Total test files** | **790** | **884** | **+94 (+11.9%)** | sum |
| Source files (non-test .ts) | 1,260 | 1,293 | +33 | `find src -name "*.ts" \| grep -v test \| wc -l` → 1293 |
| **Test-to-source ratio** | **0.63** | **0.684** | **+0.054** | 884/1293 |
| Total test cases (it/test) | 21,959 | 22,835 | +876 | `grep -rEh "\b(it\|test)\s*\(" ... \| wc -l` → 22835 |
| Total expect() calls | 45,916 | 47,356 | +1,440 | `grep -rohE "expect\s*\(" ... \| wc -l` → 47356 |
| **Assertions per test** | **2.09** | **2.07** | **-0.02** | 47356/22835 |
| E2E test cases (all e2e paths) | 323 | 559 | +236 | see §2 (scope widened) |
| .skip/.only hits (narrow) | 30 | 31 | +1 | `grep -rEoh "\.(skip\|only)\s*\(" ... \| wc -l` → 31 |
| Files containing skips | 14 | 15 | +1 | `grep -rEl ... \| wc -l` → 15 |
| Files missing afterEach/afterAll | 186 | 234 | **+48 (worse)** | 884 total − 650 with cleanup |
| Property-based (fast-check) files | 1 | 1 | 0 | `grep -rl "fast-check\|fc\.property" ...` → 1 |
| Stryker / mutation config | None | None | 0 | no stryker in package.json |
| console.log test files | 46 | 49 | +3 | `grep -rl "console\.log" tests ... \| wc -l` → 49 |
| Empty test suites | 3 | 3 | 0 | all-plugins, tinydancer, infra-healing-docker |
| TDD adherence (new src files) | 53.3% | **72.7%** | **+19.4pp** | 24/33 new files tested |

The +236 E2E delta is **scope-driven, not a real growth surge**: prior report counted only `tests/e2e/` it-blocks; v3.10.6 figure here counts all files under any `*e2e*` path (incl. `tests/integration/browser/*.e2e.test.ts`, sauce-demo specs). On a like-for-like `tests/e2e/` basis the count is roughly stable. Treat E2E volume as flat.

---

## 2. Skip Count Reconciliation (RESOLVED)

The shared snapshot reported **165** skips via a "broad regex"; the prior report reported **30**. My methodology reconciles this:

| Pattern | Count | Methodology |
|---------|------:|-------------|
| `.skip(` + `.only(` hits in `*.test.ts`/`*.spec.ts` | **31** | `grep -rEoh "\.(skip\|only)\s*\(" tests --include="*.test.ts" --include="*.spec.ts"` |
| `xit(` / `xdescribe(` | 0 | none present in repo |
| `.only(` alone | 0 | clean — no focus-leak |
| `describe.skip` | 3 | whole-suite quarantines |
| `it.skip`/`test.skip` | 28 | per-test skips |
| **`.skipIf` (Vitest conditional)** | 38 | **NOT skip debt** — env/platform gating, runs when condition met |
| `.runIf` (Vitest conditional) | 27 | **NOT skip debt** — conditional execution |

**Methodology decision**: The real skip-debt metric is `.skip` + `.only` = **31 hits across 15 files** — essentially flat vs the prior 30/14. The snapshot's 165 conflated `.skipIf`/`.runIf` (conditional execution primitives, which are *good* practice for env-gated tests, not disabled tests) and likely scanned `src/` too. `.skipIf`/`.runIf` are explicitly excluded from skip-debt because a `.skipIf(noBrowser)` test executes whenever a browser is present — it is gating, not quarantine.

### Skip categorization (31 hits / 15 files)

| Bucket | Hits | Files / Rationale |
|--------|-----:|-------------------|
| **Browser/integration env-gated** | 12 | cart-management.spec.ts (9), purchase-flow.spec.ts (2), security.spec.ts (1) — Playwright conditional skips for unavailable browser/state |
| **Quarantined for cause** (documented) | 8 | vibium-client.test.ts (3, ESM require() incompat), security-auditor.test.ts (1, slow), oauth-security.test.ts (1, placeholder), domain-handlers.test.ts (4, integration-only) |
| **Deferred feature** | 5 | goap-benchmarks.test.ts (2), plugin-loader.test.ts (1, circular deps), wrappers.test.ts (1, hierarchical fwd), tinydancer-full-integration.test.ts (1) |
| **Load/scale resource-gated** | 1 | 100-agents.test.ts (describe.skip whole suite) |
| **Needs-triage** | 5 | domain-tools.test.ts (2), sona-persistence.test.ts (1), qe-reasoning-bank-rvf-backfill.test.ts (1) |

Skip debt is healthy and stable: no `.only()` focus-leaks, ~2/3 documented. The 5 needs-triage skips carry over from prior (sona-persistence, domain-tools) — no regression but no cleanup either.

---

## 3. Domain Coverage (STATIC-inferred from test-file presence)

`impl` = `src/domains/<d>/**/*.ts` excluding index/interfaces/*.types.ts; `tests` = files under any `*<domain>*` test path.

| Domain | Impl | Test files | Inferred status | vs v3.9.13 |
|--------|-----:|-----------:|-----------------|-----------|
| **enterprise-integration** | 8 | **1** | **FROZEN — 0/6 services** | unchanged |
| **test-execution** | 22 | 6 | e2e subsystem 0 dedicated tests | +2 files, gap holds |
| requirements-validation | 25 | 10 | partial (40%) | unchanged |
| security-compliance | 20 | 10 | partial (50%) | ~flat |
| quality-assessment | 14 | 9 | partial (64%) | improved |
| test-generation | 34 | 29 | good (85%) | improved |
| code-intelligence | 12 | 13 | good (>100%) | improved |
| coverage-analysis | 9 | 13 | strong | maintained |
| learning-optimization | 10 | 11 | strong (ADR-110 area) | improved |
| defect-intelligence | 6 | 9 | strong | maintained |
| chaos-resilience | 5 | 5 | strong | maintained |
| contract-testing | 5 | 5 | strong | maintained |
| visual-accessibility | 15 | 18 | strong | maintained |

### 3a. Enterprise-Integration Freeze — RE-VERIFIED, STILL FROZEN (6th release)

| Service (`src/domains/enterprise-integration/services/`) | Dedicated test? | Evidence |
|---|---|---|
| esb-middleware-service.ts | **NO** | `grep -rl esb-middleware tests` → 0 |
| message-broker-service.ts | **NO** | only `coordinator.test.ts` (incidental mention) |
| soap-wsdl-service.ts | **NO** | `grep -rl soap-wsdl tests` → 0 |
| sod-analysis-service.ts | **NO** | `grep -rl sod-analysis tests` → 0 |
| odata-service.ts | **NO** | only `coordinator.test.ts` (incidental) |
| sap-integration-service.ts | **NO** | sap mentions only in infra-healing + coordinator, no service test |

The only enterprise-integration test is `tests/unit/domains/enterprise-integration/coordinator.test.ts`. **Five consecutive releases (v3.8.3 → v3.10.6) with zero dedicated tests for all 6 enterprise services.** Note: the project ships an `enterprise-integration-testing` skill and 6 SAP/OData/SOAP/middleware QE agents — but the in-repo services validating those flows are themselves untested.

### 3b. Test-Execution e2e subsystem — RE-VERIFIED, STILL ZERO

| File (`src/domains/test-execution/`) | Dedicated test? | Evidence |
|---|---|---|
| services/e2e/browser-orchestrator.ts | **NO** | `find tests -name "browser-orchestrator*.test.ts"` → empty; no import refs |
| services/e2e/step-executors.ts | **NO** | no test file, no import refs |
| services/e2e/step-retry-handler.ts | **NO** | no test file, no import refs |
| services/retry-handler.ts | **NO** | only incidental string in `completions.test.ts` |
| services/e2e/adaptive-locator-service.ts | YES | `adaptive-locator-service.test.ts` (added v3.9.13) |

Of 22 test-execution impl files, only 6 test files exist, and the 4 listed e2e/retry orchestration files — the runtime-critical browser flow path — remain untested for the 2nd release running.

---

## 4. New ADR-105..110 Work — TDD Assessment

| ADR / area | Code location | Tested? | Evidence |
|---|---|---|---|
| ADR-106 safety eval | safety eval logic + behavioral parse | **YES** | `tests/safety/behavioral/engine.test.ts`, `tests/safety/behavioral/live-parse.test.ts` |
| ADR-109 interaction benchmark | `benchmarks/interaction/{live-runner,lib/stats}.ts` | **PARTIAL** | `tests/unit/benchmarks/interaction-stats.test.ts` covers stats lib; `live-runner.ts` has no dedicated test |
| ADR-108 lineage gate | `docs/benchmarks/LINEAGE.md` + CI workflow | CI-validated | gate enforced in `.github/workflows`, no unit test (doc/CI artifact) |
| ADR-110 learning wiring | `src/learning/*` (this session) | **PARTIAL — gaps** | see below |
| dream/sona (this-session) | `src/learning/dream/*` | **YES, strong** | 12 dream test files; `dream-engine.test.ts`, `dream-scheduler.test.ts`, `dream-insights-pruner.test.ts`, `dream-branching.test.ts`, wiring tests |
| sona 0.1.5→0.1.7 weight-update | ruvector integration | covered | 75 test files reference sona/SONA |

### ADR-110 learning-wiring untested files (net-new this window, NO test)
- `src/learning/embedder-identity-store.ts` — 0 test refs
- `src/learning/local-judge-client.ts` — 0 test refs (the local LLM-judge path for verdicts)
- `src/learning/nagual-client.ts` — 0 test refs
- `src/migrations/20260611_add_pattern_nulls_table.ts` — 0 test (DB migration, data-path)

These are part of the learning/judging loop that feeds patterns into `memory.db`. `local-judge-client.ts` gating verdicts without a test is the highest-risk gap among the new code (verdict quality directly affects what gets persisted).

---

## 5. Test Smells

| Smell | v3.9.13 | v3.10.6 | Trend |
|-------|--------:|--------:|-------|
| Files missing afterEach/afterAll | 186 | **234** | REGRESSED (+48) |
| % with cleanup | 76.5% | 73.5% | -3.0pp |
| Property-based (fast-check) files | 1 | 1 | FROZEN (4th release) |
| Stryker/mutation config | absent | absent | unchanged |
| Heavy-mock files (config.test.ts) | 47 mocks | 47 mocks | no refactor |
| Heavy-mock (cross-phase-hooks.test.ts) | 30 mocks | 30 mocks | no refactor |
| Empty suites | 3 | 3 | unchanged (all-plugins, tinydancer, infra-healing-docker) |
| Assertions per test | 2.09 | 2.07 | flat |

Cleanup hygiene continues to degrade: 94 new test files added, but only ~46 of them carry cleanup hooks, so the missing-cleanup differential grew by 48. This is a **process-level regression for the 2nd consecutive release** — new authors merge tests without afterEach. Property-based testing remains a single file (`tests/unit/adapters/a2a/agent-cards.test.ts`) — the oldest unresolved methodology regression in the suite (4 releases). Mutation testing is still only a documented skill, never wired (no kill-rate signal exists for any release).

---

## 6. Remediation of Prior (v3.9.13) Findings

| # | Prior finding | Priority | v3.10.6 Status | Evidence |
|---|---------------|----------|----------------|----------|
| 1 | Enterprise-integration: add tests for 6 services | **P0** | **NOT DONE** | 0/6 services tested (§3a) |
| 2 | test-execution e2e: browser-orchestrator, step-executors, retry-handler | **P0** | **NOT DONE** | 4 files still zero dedicated tests (§3b) |
| 3 | Triage skipped tests | P0 (closed prior) | **MAINTAINED** | 31 skips, no `.only()`, ~2/3 documented |
| 4 | requirements-validation product-factors | P1 | **PARTIAL** | 10 test files / 25 impl (40%) |
| 5 | Restore property-based testing (target 5) | **P1** | **NOT DONE** | still 1 file |
| 6 | Reduce over-mocking (config/cross-phase-hooks) | P1 | **NOT DONE** | 47 / 30 mocks unchanged |
| 7 | console.log cleanup | P2 | **REGRESSED** | 46 → 49 files |
| 8 | Empty suite cleanup (3) | P2 | **NOT DONE** | still 3 |
| New | Cleanup hygiene regression | P1 | **REGRESSED further** | 186 → 234 missing |
| New | CLI commands untested (plugin/workflow/lazy-registry) | P1 | mixed | new untested cluster shifted to learning-wiring (§4) |

**P0 closure this window: 0/2 open structural P0s closed. P1: 0/3. Process regressions: cleanup + console both worse.**

---

## 7. Coverage-Gap Priorities

| Priority | Gap | Risk | Recommendation |
|----------|-----|------|----------------|
| **P0** | Enterprise-integration 6 services (esb, message-broker, soap-wsdl, sod-analysis, odata, sap-integration) | 6 releases frozen; ships as advertised capability | Add 1 service-level test per service (minimum smoke + 1 error path) |
| **P0** | test-execution e2e path (browser-orchestrator, step-executors, step-retry-handler, retry-handler) | Runtime-critical browser flow; 0 tests; 2 releases | Unit-test step dispatch + retry/backoff logic |
| **P1** | ADR-110 `local-judge-client.ts`, `embedder-identity-store.ts`, `nagual-client.ts` | New verdict/embedding path feeding memory.db; untested | Test judge verdict contract + embedder identity resolution |
| **P1** | Cleanup hygiene (234 missing afterEach) | resource/timer leaks, cross-test pollution | Add lint rule requiring afterEach in new test files (CI gate) |
| **P1** | Property-based testing (1 file, 4 releases) | edge-case blind spots | Restore fast-check on 4 high-branching modules |
| **P2** | Mutation testing absent | no assertion-quality signal | Wire Stryker on 1-2 core domains as pilot |
| **P2** | migration `20260611_add_pattern_nulls_table.ts` untested | data-path / schema change | Migration up/down test against DB copy |

---

## 8. Scoring

| Category | Weight | Score | Weighted | vs prior |
|----------|--------|-------|----------|---------|
| Test volume & ratio | 15% | 9/10 | 1.35 | +1 (ratio 0.63→0.68) |
| Test type distribution | 10% | 7/10 | 0.70 | flat |
| Domain coverage (enterprise/exec still frozen) | 20% | 4/10 | 0.80 | flat |
| Test smells (skips stable, no .only) | 15% | 7/10 | 1.05 | flat |
| Cleanup hygiene (regressed again) | 10% | 4/10 | 0.40 | -1 |
| Flaky indicators | 10% | 7/10 | 0.70 | flat |
| Property-based testing | 10% | 1/10 | 0.10 | flat |
| Mock quality | 10% | 6/10 | 0.60 | flat |
| New ADR-105..110 TDD (safety+dream tested; learning gaps) | — | (informs above) | — | TDD 53%→73% |
| **Total** | **100%** | — | **5.70** | |

**Rounded Score: 6.0 / 10 (delta vs v3.9.13: 0.0)**

The volume/ratio gain (+1) and TDD jump to 73% are exactly cancelled by the cleanup-hygiene regression (-1) and the persistence of both structural P0 freezes. The new ADR work is encouragingly well-tested (safety eval, dream/sona, interaction benchmark all have tests), which prevented a score *drop* — but it did not offset the two oldest open P0s, both untouched for multiple releases. The suite is meaningfully larger and the new-code discipline is better, yet the same critical gaps that capped v3.9.13 still cap v3.10.6.

---

## Shared Memory

- **Score 6.0/10, delta 0.0** vs v3.9.13. Test files 790→884 (+11.9%), ratio 0.63→0.684, TDD on new code 53%→72.7% — gains offset by frozen P0s + cleanup regression.
- **P0 (unchanged, 6th release): enterprise-integration freeze holds** — all 6 services (esb-middleware, message-broker, soap-wsdl, sod-analysis, odata, sap-integration) have ZERO dedicated tests; only `coordinator.test.ts` mentions them incidentally.
- **P0 (unchanged, 2nd release): test-execution e2e path untested** — browser-orchestrator.ts, step-executors.ts, step-retry-handler.ts, retry-handler.ts all have 0 dedicated tests.
- **Skip count reconciled: real skip debt = 31 hits / 15 files** (flat vs 30). The snapshot's 165 conflated `.skipIf`(38)/`.runIf`(27) conditional-execution primitives, which are env-gating not quarantine and excluded from skip debt. Zero `.only()` focus-leaks.
- **ADR-105..110 mostly tested**: ADR-106 safety eval (`tests/safety/behavioral/`), ADR-109 interaction-stats, dream/sona (12+75 test files) all covered; **gap: ADR-110 learning-wiring** `local-judge-client.ts`, `embedder-identity-store.ts`, `nagual-client.ts` untested (verdict/embedding path into memory.db).
- **Regressions: cleanup hygiene 186→234 missing afterEach (P1), console.log 46→49**; property-based frozen at 1 file (4 releases), Stryker still absent. CLI memory store broken — findings live here only.
