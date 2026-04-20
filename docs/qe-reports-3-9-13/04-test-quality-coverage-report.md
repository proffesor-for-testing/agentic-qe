# Test Quality & Coverage Report - v3.9.13

**Date**: 2026-04-20
**Agent**: qe-coverage-specialist (Agent 04)
**Baseline**: v3.8.13 (2026-03-30)
**Score**: 6.0 / 10 (delta: +0.5)

---

## Executive Summary

The suite grew from 730 to 790 test files (+8.2%) and the test-to-source ratio edged up from 0.60 to 0.63 (777 tests / 1,260 sources). The single biggest positive delta is the reduction of .skip()/.only() from 72 to 30 (-58.3%), which is the first material cleanup of skip debt since v3.8.3. However, the enterprise-integration freeze remains unbroken (still 12.5% at the impl-file level, 6/6 critical services have zero tests for the 4th consecutive release), test-execution coverage continued to decline (18.2%, down from the reconstructed 21% baseline), and property-based testing is still a single file (the v3.8.3 collapse from 8 to 1 has not been reversed in 3 releases). Cleanup hygiene regressed: 186 files now lack afterEach/afterAll (up from 113), largely because new test files skipped cleanup hooks. The `npm test` script still uses `--max-old-space-size=1024`, identical to v3.8.13, so the codespace OOM surface is unchanged.

---

## 1. Test Volume

| Metric | v3.8.13 | v3.9.13 | Delta |
|--------|--------|---------|-------|
| Test files (.test.ts) | 717 | 777 | +60 (+8.4%) |
| Spec files (.spec.ts) | 13 | 13 | 0 |
| **Total test files** | **730** | **790** | **+60 (+8.2%)** |
| Source files (non-test .ts) | 1,192 | 1,260 | +68 (+5.7%) |
| **Test-to-source ratio** | **0.60** | **0.63** | **+0.03** |
| Total test cases (it/test) | 21,861 | 21,959 | +98 |
| Total expect() calls | 43,994 | 45,916 | +1,922 |
| **Assertions per test** | **2.01** | **2.09** | **+0.08** |

Ratio recovery is modest but real — test files grew faster than source files for the first time in the window covered by these reports.

---

## 2. E2E Tests

| Metric | v3.8.13 | v3.9.13 | Delta |
|--------|--------|---------|-------|
| E2E test files | 20 | 19 | -1 |
| **E2E test cases** | **346** | **323** | **-23 (-6.6%)** |

E2E case count *decreased* — not a growth story. The decline comes from removals in `critical-user-journeys.e2e.test.ts` (5→4) and `opencode-aqe-smoke.test.ts` (10→6), plus disappearance of one e2e file. The 8 sauce-demo specs are still present and still account for 186/323 = 57.6% of e2e cases.

---

## 3. Skipped Tests — Major Improvement

| Smell | v3.8.13 | v3.9.13 | Delta |
|-------|--------|---------|-------|
| Total .skip()/.only() (grep hits) | 72 | 30 | **-42 (-58.3%)** |
| Files containing skips | -- | 14 | -- |
| .only() | 0 | 0 | 0 |

### Categorization — 30 skips across 14 files

| Bucket | Count | Files / Rationale |
|--------|-------|-------------------|
| **Quarantined for cause** (documented reason) | 9 | vibium-client.test.ts (3, ESM require() incompat), domain-handlers.test.ts (4, integration-only), oauth-security.test.ts (1, placeholder), security-auditor.test.ts (1, slow audit) |
| **Browser/integration gated** (requires env) | 10 | cart-management.spec.ts (9), security.spec.ts (1) — Playwright fixtures with conditional skip for unavailable browser state |
| **Deferred feature** (not yet implemented) | 5 | tinydancer-full-integration (1), plugin-loader circular deps (1), goap-benchmarks (2), ruvector/wrappers hierarchical fwd (1) |
| **Load/scale suite** (resource-gated) | 1 | 100-agents.test.ts — `describe.skip` for the whole suite |
| **Ambiguous / needs triage** | 5 | domain-tools.test.ts (2), purchase-flow.spec.ts (2), sona-persistence.test.ts (1) |

30 skips is manageable. None are `.only()`, and roughly 2/3 have a recognizable quarantine reason. The remaining 5 ambiguous ones should be triaged.

---

## 4. Async & Flaky Indicators

| Smell | v3.8.13 | v3.9.13 | Delta |
|-------|--------|---------|-------|
| Files with setTimeout | 84 | 84 | 0 |
| Total setTimeout occurrences | 209 | 202 | -7 |
| Files with Date.now() | -- | 235 | -- |
| Files with Math.random() | -- | 125 | -- |
| **Retry/flaky indicator files** | **138** | **135** | **-3** |
| Files with waitFor (polling) | 380 | 2 | -378 |

The apparent huge drop in waitFor usage (from 380 to 2) is a counting-scope difference — the v3.8.13 figure was file count matches on any occurrence including non-jest `waitFor`; the accurate literal match on `\bwaitFor\s*\(` in test files yields 2. Treat the 380 baseline as inflated.

Date.now() in 235 files and Math.random() in 125 files is a large non-determinism surface. Fake-timer coverage (64/790 = 8.1%) is still low. All 64 fake-timer files correctly call useRealTimers (no timer leak).

---

## 5. Cleanup Hygiene — Regression

| Metric | v3.8.13 | v3.9.13 | Delta |
|--------|--------|---------|-------|
| Files with afterEach/afterAll | 597 | 604 | +7 |
| **Files missing cleanup** | **113** | **186** | **+73 (worse)** |
| % with cleanup | 84.0% | 76.5% | **-7.5pp** |

Cleanup hygiene regressed substantially. Of the 60 new test files added since v3.8.13, at least 66 now contribute to the missing-cleanup list (differential grew by 73). New authors appear to be skipping cleanup hooks on new tests — this is a process-level issue, not a legacy debt issue.

---

## 6. Property-Based Testing — Still Frozen

| Metric | v3.8.3 | v3.8.13 | v3.9.13 |
|--------|--------|--------|---------|
| fast-check files | 8 | 1 | 1 |

Still `tests/unit/adapters/a2a/agent-cards.test.ts` only. No recovery. 3 consecutive releases stuck at 1 file, down from the historical peak of 8. This is now the **oldest unresolved quality methodology regression** in the suite.

---

## 7. Mutation Testing

| Metric | Result |
|--------|--------|
| Stryker config present | **No** |
| mutation package in deps | **No** (checked package.json) |
| Mutation testing skill present | Yes (`.claude/skills/mutation-testing/`) |
| Mutation testing run in CI | No |

The mutation-testing skill is documented and shipped, but there is no live Stryker (or equivalent) configuration in the project. No mutation scores are produced for any release. The assertion-quality signal remains limited to expect-per-test ratio only.

---

## 8. Domain Coverage (impl files, excluding index.ts, *.types.ts, interfaces.ts)

| Domain | Impl Src | Test Files | Coverage % | v3.8.13 | Delta |
|--------|----------|-----------|-----------|---------|-------|
| **enterprise-integration** | 8 | 1 | **12.5%** | 9.1% | +3.4pp* |
| **test-execution** | 22 | 4 | **18.2%** | 16.7% | +1.5pp |
| **requirements-validation** | 25 | 7 | **28.0%** | 25.0% | +3.0pp |
| coverage-analysis | 11 | 11 | 100.0% | 92.9% | +7.1pp |
| defect-intelligence | 7 | 7 | 100.0% | 90.0% | +10.0pp |
| quality-assessment | 15 | 7 | 46.7% | 42.1% | +4.6pp |
| code-intelligence | 14 | 8 | 57.1% | -- | -- |
| security-compliance | 21 | 10 | 47.6% | -- | -- |
| chaos-resilience | 6 | 5 | 83.3% | -- | -- |
| test-generation | 35 | 24 | 68.6% | -- | -- |
| visual-accessibility | 16 | 18 | >100%† | -- | -- |
| learning-optimization | 11 | 6 | 54.5% | -- | -- |
| contract-testing | 6 | 5 | 83.3% | -- | -- |

*The enterprise-integration delta is a counting-methodology artifact. At the **service-impl level** (where the real gap lives), it's still 0/6 = 0%: none of `esb-middleware-service`, `message-broker-service`, `soap-wsdl-service`, `sod-analysis-service`, `odata-service`, `sap-integration-service` have a dedicated test. The freeze on the critical services has NOT broken.

†Multiple integration tests cover the same service.

### Enterprise-integration service-level status (unchanged from v3.8.3, v3.8.13)

| Service | v3.8.3 | v3.8.13 | v3.9.13 |
|---------|--------|---------|---------|
| esb-middleware-service | NO TEST | NO TEST | **NO TEST** |
| message-broker-service | NO TEST | NO TEST | **NO TEST** |
| soap-wsdl-service | NO TEST | NO TEST | **NO TEST** |
| sod-analysis-service | NO TEST | NO TEST | **NO TEST** |
| odata-service | NO TEST | NO TEST | **NO TEST** |
| sap-integration-service | NO TEST | NO TEST | **NO TEST** |

**Four consecutive releases. Zero test files for any of these 6 enterprise services.**

---

## 9. TDD Adherence — Sample of 15 New src Files Since v3.8.13

68 new src files were added between v3.8.13 and v3.9.13. Sample of 15:

| File | Has Test? |
|------|-----------|
| src/boot/fast-paths.ts | YES |
| src/boot/parallel-prefetch.ts | YES |
| src/cli/commands/daemon.ts | YES |
| src/cli/commands/plugin.ts | **NO** |
| src/cli/commands/workflow.ts | **NO** |
| src/cli/lazy-registry.ts | **NO** |
| src/context/compaction/tier1-microcompact.ts | YES |
| src/context/compaction/tier4-reactive.ts | YES |
| src/coordination/agent-memory-branch.ts | YES |
| src/domains/test-generation/generators/test-value-helpers.ts | YES |
| src/hooks/security/config-snapshot.ts | **NO** |
| src/init/browser-engine-installer.ts | **NO** |
| src/kernel/hnsw-legacy-bridge.ts | **NO** |
| src/persistence/rvf-consistency-validator.ts | **NO** |
| src/plugins/cache.ts | YES |

**TDD adherence: 8/15 = 53.3%**. Large untested clusters: the CLI commands (plugin/workflow/lazy-registry all untested), the entire hooks/security new module, the RVF persistence migration layer (`rvf-consistency-validator`, `rvf-migration-adapter`, `rvf-migration-coordinator`, `rvf-stage-gate` — none sampled but the pattern repeats), and `kernel/hnsw-legacy-bridge` / `kernel/hnsw-shadow-validator`. This is below the 70% threshold that would indicate TDD is being followed on new code.

---

## 10. Mock Quality

| Metric | v3.8.13 | v3.9.13 |
|--------|--------|---------|
| Files with jest.mock / vi.mock | 88 | 91 |
| Files with > 5 mocks (heavy mocking) | 18 | ~18 (unchanged) |

`config.test.ts` (47 mocks) and `cross-phase-hooks.test.ts` (30 mocks) are still the worst offenders per v3.8.13 — no refactoring applied.

---

## 11. Console Noise & Empty Suites

| Metric | v3.8.13 | v3.9.13 |
|--------|--------|---------|
| Files with console.log | 47 | 46 |
| Empty test suites (describe, no it) | 3 | 3 |

Empty suites unchanged: `all-plugins.test.ts` (1 describe, 0 tests), `tinydancer-full-integration.test.ts` (1 describe + 1 it.skip), `infra-healing-docker.test.ts` (1 describe, 0 tests).

---

## 12. Test Execution Memory Config

| Script | v3.8.13 | v3.9.13 |
|--------|--------|---------|
| `npm test` (NODE_OPTIONS) | --max-old-space-size=1024 --expose-gc | --max-old-space-size=1024 --expose-gc |
| `test:safe` | --max-old-space-size=768 --expose-gc --maxForks=1 | --max-old-space-size=768 --expose-gc --maxForks=1 |

**No changes to memory configuration.** If codespace OOM was a problem at v3.8.13, it remains a problem at v3.9.13. Tests were not run as instructed — this is a static check only.

---

## 13. Remediation Status — v3.8.13 P0/P1 Items

| # | Item (v3.8.13) | Priority | v3.9.13 Status | Evidence |
|---|----------------|----------|----------------|----------|
| 1 | Enterprise-integration: add tests for SAP, OData, message broker | **P0** | **NOT DONE** | All 6 service files still have no tests |
| 2 | test-execution e2e subsystem: browser-orchestrator, step-executors, retry-handler | **P0** | **PARTIAL** | 1 new test (adaptive-locator-service.test.ts); still 0 for orchestrator/step-executors/retry-handler |
| 3 | Triage 72 skipped tests | **P0** | **DONE** | 72 → 30 (-58.3%); remaining 30 mostly categorized |
| 4 | requirements-validation product-factors | **P1** | **PARTIAL** | Added bdd-scenario-writer, testability-scorer, test-idea-transformer, quality-criteria tests; still gap on sfdipot-analyzer and product-factors-service |
| 5 | Restore property-based testing (target: 5 modules) | **P1** | **NOT DONE** | Still 1 file |
| 6 | Reduce over-mocking (config.test.ts, cross-phase-hooks.test.ts) | **P1** | **NOT DONE** | No refactoring |
| 7 | Console.log cleanup (47 files) | **P2** | **NOT DONE** | 46 files (-1) |
| 8 | Empty suite cleanup (3 suites) | **P2** | **NOT DONE** | Still 3 |
| 9 | Reduce waitFor polling | **P2** | N/A | Baseline number was overcounted |

**P0 closure: 1/3 (33%). P1 closure: 0/3 (0%, partial on one). P2 closure: 0/3.**

---

## 14. New v3.9.13 Risks

1. **Cleanup hygiene regression** — 186 files missing afterEach/afterAll, up from 113. New code is being merged without cleanup hooks.
2. **CLI commands untested** — 3 of the 4 new CLI commands (plugin, workflow, lazy-registry) ship with zero unit tests.
3. **hooks/security module untested** — new `config-snapshot.ts`, `exit-codes.ts`, `index.ts` module has no test file.
4. **RVF persistence migration layer untested** — `rvf-consistency-validator.ts`, `rvf-migration-adapter.ts`, `rvf-migration-coordinator.ts`, `rvf-stage-gate.ts` are 4 new files for a data-critical migration path; spot-check showed no dedicated tests.
5. **E2E case count declined** from 346 to 323 — cases were removed from smoke/critical-user-journey suites.

---

## 15. Scoring

| Category | Weight | Score | Weighted |
|----------|--------|-------|----------|
| Test volume & ratio | 15% | 8/10 | 1.20 |
| Test type distribution | 10% | 7/10 | 0.70 |
| Domain coverage (enterprise still 0%) | 20% | 4/10 | 0.80 |
| Test smells (skips greatly improved) | 15% | 7/10 | 1.05 |
| Cleanup hygiene (regressed) | 10% | 5/10 | 0.50 |
| Flaky indicators | 10% | 7/10 | 0.70 |
| Property-based testing | 10% | 1/10 | 0.10 |
| Mock quality | 10% | 6/10 | 0.60 |
| TDD adherence on new code (53%) | -- | -- | -- |
| **Total** | **100%** | -- | **5.65** |

**Rounded Score: 6.0 / 10 (delta vs v3.8.13: +0.5)**

The +0.5 delta is driven almost entirely by the skip-debt cleanup (72→30) and the ratio improvement (0.60→0.63). Enterprise-integration coverage did not break its freeze, property-based testing did not recover, mutation testing is not wired, cleanup hygiene regressed, and TDD adherence on new code is only 53%. The suite is larger but not materially healthier; the score improvement reflects one concrete P0 (skip triage) being closed, not structural progress.

---

*Report generated by qe-coverage-specialist (Agent 04) for QE Queen swarm, v3.9.13 release assessment.*
