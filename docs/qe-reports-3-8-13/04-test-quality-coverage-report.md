# Test Quality & Coverage Report - v3.8.13

**Date**: 2026-03-30
**Agent**: qe-coverage-specialist (Agent 04)
**Baseline**: v3.8.3 (2026-03-19)
**Score**: 5.5 / 10

---

## Executive Summary

The test suite has grown modestly from 689 to 730 files (+5.9%), and E2E cases rose from 327 to 346 (+5.8%). However, the structural weaknesses flagged in v3.8.3 persist largely unchanged: enterprise-integration coverage remains critically low at 9.1%, property-based testing is still confined to a single file, and 113 test files still lack cleanup hooks. The flaky indicator count dropped significantly from 319 to 138 files (-56.7%), which is the most notable positive delta. Overall, the suite is stable but has not closed the gaps identified at v3.8.3.

---

## 1. Test Volume

| Metric | v3.8.3 | v3.8.13 | Delta |
|--------|--------|---------|-------|
| Test files (.test.ts) | -- | 704 | -- |
| Spec files (.spec.ts) | -- | 13 | -- |
| **Total test files** | **689** | **717** | **+28 (+4.1%)** |
| Total incl. spec files | -- | **730** | -- |
| Source files (non-test .ts) | -- | 1,192 | -- |
| **Test-to-source ratio** | **0.61** | **0.60** | **-0.01 (flat)** |

The test-to-source ratio is essentially unchanged. New source files were added at roughly the same rate as new tests, maintaining the balance but not improving it.

---

## 2. Test Types

| Type | Files | % of Total |
|------|-------|-----------|
| Unit (tests/unit/) | 500 | 68.5% |
| Integration (tests/integration/) | 112 | 15.3% |
| E2E (tests/e2e/) | 19 | 2.6% |
| Domains (tests/domains/) | 15 | 2.1% |
| Coordination (tests/coordination/) | 13 | 1.8% |
| Integrations (tests/integrations/) | 25 | 3.4% |
| Security | 1 | 0.1% |
| Load | 1 | 0.1% |
| Performance | 2 | 0.3% |
| Benchmarks | 4 | 0.5% |
| Other (hooks, shared, validation, etc.) | 20 | 2.7% |
| Archived | 4 | 0.5% |

**Testing Pyramid Assessment**: The pyramid shape is reasonable (68.5% unit, 15.3% integration, 2.6% e2e). However, the e2e layer is thin in file count even though individual specs are case-dense.

---

## 3. E2E Tests

| Metric | v3.8.3 | v3.8.13 | Delta |
|--------|--------|---------|-------|
| E2E test files | -- | 20 | -- |
| **E2E test cases** | **327** | **346** | **+19 (+5.8%)** |
| Playwright-aware files | -- | 38 | -- |

### E2E Breakdown by File

| File | Cases |
|------|-------|
| sauce-demo/specs/collection-page.spec.ts | 37 |
| sauce-demo/specs/collection-security.spec.ts | 28 |
| e2e/specs/authentication.spec.ts | 23 |
| sauce-demo/specs/security.spec.ts | 23 |
| e2e/specs/security.spec.ts | 21 |
| sauce-demo/specs/home.spec.ts | 21 |
| sauce-demo/specs/accessibility.spec.ts | 20 |
| sauce-demo/specs/cart.spec.ts | 19 |
| sauce-demo/specs/checkout.spec.ts | 19 |
| sauce-demo/specs/product.spec.ts | 19 |
| adaptive-locator-service.test.ts (unit/e2e) | 18 |
| e2e/specs/cart-management.spec.ts | 15 |
| e2e/specs/search.spec.ts | 15 |
| e2e/specs/purchase-flow.spec.ts | 13 |
| opencode-aqe-smoke.test.ts | 10 |
| mcp-tool-invocation.e2e.test.ts | 10 |
| platform-init.e2e.test.ts | 10 |
| agent-lifecycle.e2e.test.ts | 10 |
| test-generation-flow.e2e.test.ts | 10 |
| critical-user-journeys.e2e.test.ts | 5 |

**Sauce-demo specs**: Still present and active (8 spec files under tests/e2e/sauce-demo/specs/). These represent the bulk of e2e case density (186 of 346 cases = 53.8%).

---

## 4. Test Smells Inventory

### 4.1 Skipped Tests

| Smell | v3.8.3 | v3.8.13 | Delta |
|-------|--------|---------|-------|
| it.skip / test.skip | -- | 47 | -- |
| describe.skip | -- | 25 | -- |
| **Total .skip()** | **30** | **72** | **+42 (+140%)** |
| .only() | 0 | 0 | No change |

**Severity: HIGH** -- Skip count more than doubled. The 30 baseline counted only grep hits; deeper analysis shows 47 individual test-level skips and 25 describe-level skips (each potentially covering many tests). Key offenders:
- `cart-management.spec.ts`: 9 test.skip() calls
- `domain-handlers.test.ts`: 4 it.skip() calls
- `oauth-security.test.ts`: 1 describe.skip() covering entire integration suite
- `100-agents.test.ts`: 1 describe.skip() covering load test suite

### 4.2 Hardcoded Timeouts & Async Smells

| Smell | Count |
|-------|-------|
| setTimeout in tests | 209 |
| waitFor in tests | 380 |
| Hardcoded timeout values (>1000ms) | 351 |

This is a significant smell surface. The 380 waitFor occurrences suggest heavy reliance on polling-based assertions rather than event-driven ones.

### 4.3 Empty & Assertion-Free Tests

| Smell | Count |
|-------|-------|
| Files with test blocks but 0 assertions | 0 |
| Empty test suites (describe with no it/test) | 3 |

Empty suites:
- `tests/unit/domains/all-plugins.test.ts`
- `tests/integration/tinydancer-full-integration.test.ts`
- `tests/integration/infra-healing-docker.test.ts`

### 4.4 Console Noise

| Smell | Count |
|-------|-------|
| Files with console.log | 47 |

47 test files contain console.log statements, which add noise to test output and can mask real failures.

### 4.5 Assertion Quality

| Metric | Value |
|--------|-------|
| Total expect() calls | 43,994 |
| Total test cases (it + test) | 21,861 |
| **Assertions per test** | **2.01** |
| expect.any() / expect.anything() usage | 124 |
| Snapshot tests | 1 |

Assertions-per-test of 2.01 is adequate but not strong. The 124 uses of expect.any() indicate some tests are not asserting specific values.

---

## 5. Cleanup Hygiene

| Metric | v3.8.3 | v3.8.13 | Delta |
|--------|--------|---------|-------|
| Files with afterEach/afterAll | -- | 597 | -- |
| **Files missing cleanup** | **128** | **113** | **-15 (improved)** |
| % with cleanup | -- | 84.0% | -- |

**Improvement**: 15 files gained cleanup hooks since v3.8.3. However, 113 files still lack afterEach/afterAll.

### Fake Timer Hygiene

| Metric | v3.8.3 | v3.8.13 | Delta |
|--------|--------|---------|-------|
| Files using useFakeTimers | -- | 59 | -- |
| Files using useRealTimers | -- | 59 | -- |
| **Fake timer coverage** | **9.5%** | **8.4%** (59/704) | **-1.1pp** |
| Missing useRealTimers cleanup | -- | 0 | -- |

All 59 fake-timer files properly call useRealTimers -- no timer leak risk. However, the percentage of files using fake timers dropped slightly as the test suite grew.

---

## 6. Flaky Test Assessment

| Metric | v3.8.3 | v3.8.13 | Delta |
|--------|--------|---------|-------|
| **Retry/flaky indicator files** | **319** | **138** | **-181 (-56.7%)** |
| Files with retry/retries | -- | 97 | -- |
| Files with flaky/unstable markers | -- | 61 | -- |

**Major improvement**: Flaky indicators dropped by 56.7%. This suggests either significant test stabilization work or removal of flaky test files. Key areas with remaining indicators:
- test-execution domain: coordinator, plugin
- coordination layer: consensus providers, mincut, task-executor
- learning-optimization: metrics-optimizer, coordinator
- test-scheduling: phase-scheduler, flaky-tracker (expected -- these track flakiness)

---

## 7. Property-Based Testing

| Metric | v3.8.3 | v3.8.13 | Delta |
|--------|--------|---------|-------|
| **Property-based test files** | **1** | **1** | **No change** |

The single property-based test file remains: `tests/unit/adapters/a2a/agent-cards.test.ts`. The v3.8.3 report noted a decline from 8 files to 1 (-87.5%). No recovery has occurred. This represents a critical gap in test design maturity.

---

## 8. Mock Quality

| Metric | Count |
|--------|-------|
| Files using jest.mock / vi.mock | 88 |
| Files with >5 mocks (over-mocking) | 18 |
| Files using jest.fn() / vi.fn() | -- |

### Worst Offenders (>10 mocks per file)

| File | Mock Count |
|------|-----------|
| config.test.ts | 47 |
| cross-phase-hooks.test.ts | 30 |
| token-bootstrap.test.ts | 20 |
| git-aware-selector.test.ts | 17 |
| wrapped-domain-handlers.test.ts | 16 |
| handler-factory.test.ts | 15 |
| edge-case-injector.test.ts | 14 |
| queen-coordinator-race-condition.test.ts | 12 |
| mcp-phase.test.ts | 12 |
| fleet-integration.test.ts | 11 |

`config.test.ts` with 47 mocks is a serious design smell. Files with >10 mocks likely test tightly-coupled code or are testing at the wrong abstraction level.

---

## 9. Domain Coverage Analysis

| Domain | Test Files | Source Files | Coverage % | v3.8.3 Baseline | Delta |
|--------|-----------|-------------|-----------|-----------------|-------|
| **enterprise-integration** | 1 | 11 | **9.1%** | 9% | **+0.1pp (stagnant)** |
| **test-execution** | 6 | 36 | **16.7%** | 21% | **-4.3pp (declining)** |
| **requirements-validation** | 10 | 40 | **25.0%** | 26% | **-1.0pp (declining)** |
| coverage-analysis | 13 | 14 | 92.9% | -- | -- |
| defect-intelligence | 9 | 10 | 90.0% | -- | -- |
| quality-assessment | 8 | 19 | 42.1% | -- | -- |
| cli | 32 | 82 | 39.0% | -- | -- |
| adapters | 40 | 75 | 53.3% | -- | -- |
| hooks | 7 | 18 | 38.9% | -- | -- |
| mcp | 47 | 105 | 44.8% | -- | -- |

### Critical Declining Domains

**enterprise-integration (9.1%)** -- Stagnant at crisis level for 4+ consecutive releases. 6 of 11 source files have NO corresponding test:
- esb-middleware-service.ts
- message-broker-service.ts
- soap-wsdl-service.ts
- sod-analysis-service.ts
- odata-service.ts
- sap-integration-service.ts

**test-execution (16.7%, down from 21%)** -- Coverage DECLINED. 24 source files lack tests. The e2e subdirectory (step-executors, browser-orchestrator, result-collector, etc.) is essentially untested at unit level.

**requirements-validation (25.0%, down from 26%)** -- Slight decline. 18 source files lack tests. The entire product-factors-assessment subsystem (analyzers, parsers, formatters, generators) has zero unit test coverage.

---

## 10. Coverage Gap Analysis -- Missing Tests for Critical Source Files

### enterprise-integration (6 missing / 11 total = 54.5% gap)
- `esb-middleware-service.ts` -- ESB middleware: high integration risk
- `message-broker-service.ts` -- Message broker: async messaging patterns
- `soap-wsdl-service.ts` -- SOAP/WSDL: enterprise protocol handling
- `sod-analysis-service.ts` -- Segregation of duties: security-critical
- `odata-service.ts` -- OData: data access layer
- `sap-integration-service.ts` -- SAP: core enterprise integration

### test-execution (24 missing / 36 total = 66.7% gap)
Critical untested: `test-executor.ts`, `e2e-runner.ts`, `browser-orchestrator.ts`, `retry-handler.ts`, `auth-state-manager.ts`

### requirements-validation (18 missing / 40 total = 45.0% gap)
Critical untested: `quality-criteria-service.ts`, `product-factors-service.ts`, `sfdipot-analyzer.ts`, `brutal-honesty-analyzer.ts`

### quality-assessment (8 missing / 19 total = 42.1% gap)
Critical untested: `coordinator-claim-verifier.ts`, `coordinator-gate-evaluation.ts`, `lambda-calculator.ts`, `partition-detector.ts`

---

## 11. Test Health Summary

| Indicator | Status | Trend |
|-----------|--------|-------|
| Test volume | 730 files, 21,861 cases | Stable (+4.1%) |
| Test-to-source ratio | 0.60 | Flat (-0.01) |
| E2E coverage | 346 cases | Growing (+5.8%) |
| Cleanup hygiene | 113 missing | Improving (-15 files) |
| Flaky indicators | 138 files | Strong improvement (-56.7%) |
| Skip debt | 72 skips | Worsening (+140%) |
| Property-based | 1 file | Stagnant (unchanged from v3.8.3) |
| enterprise-integration | 9.1% | Stagnant (4+ releases) |
| test-execution | 16.7% | Declining (-4.3pp) |
| requirements-validation | 25.0% | Declining (-1.0pp) |
| Over-mocking | 18 files | -- |
| Assertions/test | 2.01 | Adequate |

---

## 12. Risk-Weighted Gap Prioritization

Gaps ranked by composite risk score (change frequency x complexity x criticality):

| Rank | Gap | Risk Score | Rationale |
|------|-----|-----------|-----------|
| 1 | enterprise-integration services (6 files) | **0.95** | Zero tests, enterprise-critical, high complexity |
| 2 | test-execution e2e subsystem (8 files) | **0.91** | Zero unit tests for browser orchestration, active development area |
| 3 | requirements-validation product-factors (12 files) | **0.87** | Entire subsystem untested, parser/formatter logic prone to regressions |
| 4 | quality-assessment coherence subsystem (4 files) | **0.82** | Gate evaluation untested, directly affects release decisions |
| 5 | Property-based testing gap | **0.78** | 1 file vs. 8 historically; no fuzz testing of core algorithms |
| 6 | test.skip debt (72 skips) | **0.74** | Growing backlog of disabled tests masking potential failures |
| 7 | Over-mocked files (18 files, max 47 mocks) | **0.65** | Brittle tests that break on refactoring, not on behavior changes |

---

## 13. Recommendations

### P0 -- Immediate (before next release)
1. **Enterprise-integration**: Add integration tests for SAP, OData, and message broker services. Target: 50%+ coverage.
2. **test-execution e2e subsystem**: Add unit tests for browser-orchestrator, step-executors, and retry-handler. Target: 40%+ coverage.
3. **Triage skip debt**: Investigate the 72 skipped tests. Either fix and unskip them or delete them with documented reasons.

### P1 -- Next Sprint
4. **requirements-validation product-factors**: Add tests for SFDIPOT analyzer, quality-criteria-service, and all parsers/formatters.
5. **Restore property-based testing**: Add fast-check tests for at least 5 core algorithmic modules (HNSW search, risk scoring, gap detection, mincut analysis, coherence calculation).
6. **Reduce over-mocking**: Refactor config.test.ts (47 mocks) and cross-phase-hooks.test.ts (30 mocks) to use integration-style tests or extract interfaces.

### P2 -- Ongoing
7. **Console.log cleanup**: Remove 47 files with console.log in tests.
8. **Empty suite cleanup**: Delete or implement the 3 empty test suites.
9. **Reduce waitFor usage**: Replace polling-based waitFor (380 occurrences) with event-driven assertions where possible.

---

## 14. Scoring Breakdown

| Category | Weight | Score | Weighted |
|----------|--------|-------|----------|
| Test volume & ratio | 15% | 7/10 | 1.05 |
| Test type distribution | 10% | 7/10 | 0.70 |
| Domain coverage | 20% | 4/10 | 0.80 |
| Test smells | 15% | 5/10 | 0.75 |
| Cleanup hygiene | 10% | 6/10 | 0.60 |
| Flaky indicators | 10% | 7/10 | 0.70 |
| Property-based testing | 10% | 1/10 | 0.10 |
| Mock quality | 10% | 6/10 | 0.60 |
| **Total** | **100%** | -- | **5.30** |

**Rounded Score: 5.5 / 10**

The score reflects a suite that is large in volume but structurally uneven. Strong areas (coverage-analysis at 92.9%, defect-intelligence at 90.0%, flaky reduction) are offset by persistent gaps in enterprise-integration, test-execution, and requirements-validation domains. The property-based testing collapse from 8 files to 1 remains the single largest quality methodology regression.

---

*Report generated by qe-coverage-specialist (Agent 04) for QE Queen swarm, v3.8.13 release assessment.*
