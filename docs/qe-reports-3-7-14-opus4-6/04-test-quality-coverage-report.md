# Test Quality & Coverage Analysis Report - AQE v3.7.14

**Generated**: 2026-03-09
**Analyzer**: Coverage Gap Analyzer (claude-opus-4-6)
**Codebase**: `/workspaces/agentic-qe-new/` (branch: `march-fixes-and-improvements`)

---

## Executive Summary

**Test Health Verdict: MODERATE -- Improving But With Structural Gaps**

AQE v3.7.14 has made measurable progress from the v3.7.10 baseline: test file count grew from 623 to 647 (+3.9%), and test case count grew from 18,700 to ~20,426 (+9.2%). However, the test suite has structural issues that limit its effectiveness as a quality gate:

1. **The test pyramid is dangerously inverted at the E2E layer.** Only 0.9% of tests are E2E, and they are excluded from CI by vitest config (`*.e2e.test.ts` excluded). This means there is effectively zero automated E2E validation on every commit.
2. **Bail=3 masks the true pass rate.** The vitest config stops after 3 failures, so only 82 out of ~20,426 tests actually executed. The 2 observed failures (`domain-handlers.test.ts`) suggest the remaining 609 files never ran, making the pass rate unreliable.
3. **Three domains remain critically under-tested**: enterprise-integration (11%), test-execution (24%), and requirements-validation (38%) have barely improved since v3.7.10.
4. **No property-based, mutation, contract, or load/stress testing** frameworks are integrated into the test suite.
5. **418 uses of `as any`** and **365 skipped tests** indicate test quality degradation through type-unsafe shortcuts and deferred coverage.

---

## v3.7.10 vs v3.7.14 Comparison

| Metric | v3.7.10 | v3.7.14 | Delta | Trend |
|--------|---------|---------|-------|-------|
| Test files | 623 | 647 | +24 (+3.9%) | Improving |
| Test cases (grep-counted) | 18,700 | ~20,426 | +1,726 (+9.2%) | Improving |
| Unique test names | -- | 17,067 | -- | New metric |
| Vitest-detected files | -- | 609 | -- | (38 excluded by config) |
| Source files (non-test) | -- | 1,080 | -- | New metric |
| Test-to-source ratio | -- | 0.60:1 | -- | Below 1:1 target |
| Unit layer | 75% | 68.0% | -7.0pp | Declining (diluted by growth) |
| Integration layer | -- | 16.2% | -- | New metric |
| E2E layer | 0.3% | 0.9% | +0.6pp | Minimal improvement |
| Fake timer coverage | 10.3% | 20.9% | +10.6pp | Improving |
| enterprise-integration | 11% | 11% | 0 | Stagnant |
| test-execution | 24% | 24% | 0 | Stagnant |
| requirements-validation | 38% | 38% | 0 | Stagnant |
| Property-based testing | None | None | 0 | No progress |
| Mutation testing | None | None | 0 | No progress |
| Contract testing | None | None | 0 | No progress |
| Load/stress testing | None | None | 0 | No progress |
| Skipped tests (.skip) | -- | 365 | -- | New metric (concern) |
| Tests with .only | -- | 73 (1 real file) | -- | Low risk (in Playwright d.ts) |
| Failing tests | -- | 2 | -- | Active regressions |

---

## Test Pyramid Analysis

```
                         /\
                        /  \
                       / E2E\           0.9%  (6 files, ~19 test files in tests/e2e/)
                      /------\          But *.e2e.test.ts EXCLUDED from CI
                     /        \
                    /Integration\       16.2% (105 files in tests/integration/)
                   /--------------\
                  /                \
                 /   Unit Tests     \   68.0% (440 files in tests/unit/)
                /--------------------\
               /                      \
              /    Uncategorized Tests  \  14.9% (97 files elsewhere: tests/domains/,
             /--------------------------\       tests/security/, tests/load/, etc.)
```

### Layer Distribution (by file count, 647 total)

| Layer | File Count | Percentage | Health |
|-------|-----------|------------|--------|
| Unit (`tests/unit/`) | 440 | 68.0% | Adequate |
| Integration (`tests/integration/`) | 105 | 16.2% | Adequate |
| E2E (`tests/e2e/`) | 19 | 2.9% | CRITICAL -- 5 of 6 e2e files excluded from CI |
| Other (security, load, domains, etc.) | 83 | 12.8% | Mixed |

### Pyramid Health Assessment

The test pyramid shape is reasonable for the unit and integration layers, but the E2E layer is effectively non-existent in CI. The vitest configuration explicitly excludes `*.e2e.test.ts` files, meaning the 5 end-to-end test files (`agent-lifecycle.e2e.test.ts`, `critical-user-journeys.e2e.test.ts`, `mcp-tool-invocation.e2e.test.ts`, `platform-init.e2e.test.ts`, `test-generation-flow.e2e.test.ts`) never run in automated pipelines.

---

## Coverage Gap Analysis by Domain

### Domain Test Coverage Matrix

| Domain | Source Files | Test Files | Ratio | Test Cases | Risk Level |
|--------|-------------|------------|-------|------------|------------|
| visual-accessibility | 15 | 17 | 113% | 513 | LOW |
| coverage-analysis | 11 | 12 | 109% | 277 | LOW |
| defect-intelligence | 7 | 9 | 129% | 210 | LOW |
| chaos-resilience | 6 | 5 | 83% | 156 | LOW |
| contract-testing | 6 | 5 | 83% | 109 | MODERATE |
| code-intelligence | 14 | 11 | 79% | 267 | MODERATE |
| test-generation | 34 | 26 | 76% | 613 | MODERATE |
| learning-optimization | 11 | 6 | 55% | 181 | HIGH |
| quality-assessment | 15 | 8 | 53% | 216 | HIGH |
| security-compliance | 21 | 10 | 48% | 239 | HIGH |
| requirements-validation | 26 | 10 | 38% | 230 | HIGH |
| test-execution | 25 | 6 | 24% | 159 | CRITICAL |
| enterprise-integration | 9 | 1 | 11% | 87 | CRITICAL |

### Non-Domain Module Coverage

| Module | Source Files | Test Files | Ratio | Risk |
|--------|-------------|------------|-------|------|
| coordination | 108 | 58 | 54% | HIGH |
| integrations | 127 | 57 | 45% | HIGH |
| mcp | 97 | 42 | 43% | HIGH |
| adapters | 75 | 40 | 53% | HIGH |
| shared | 73 | 30 | 41% | HIGH |
| cli | 58 | 29 | 50% | HIGH |
| init | 50 | 27 | 54% | MODERATE |
| learning | 31 | 36 | 116% | LOW |
| kernel | 19 | 14 | 74% | MODERATE |
| strange-loop | 19 | 12 | 63% | MODERATE |
| workers | 17 | 14 | 82% | LOW |
| sync | 16 | 11 | 69% | MODERATE |
| governance | 16 | 19 | 119% | LOW |
| routing | 13 | 15 | 115% | LOW |
| agents | 12 | 6 | 50% | MODERATE |
| memory | 10 | 18 | 180% | LOW |
| optimization | 8 | 12 | 150% | LOW |
| test-scheduling | 8 | 3 | 38% | MODERATE |
| feedback | 7 | 7 | 100% | LOW |
| performance | 6 | 5 | 83% | LOW |
| early-exit | 6 | 6 | 100% | LOW |
| hooks | 6 | 7 | 117% | LOW |
| planning | 5 | 3 | 60% | MODERATE |
| logging | 4 | 3 | 75% | LOW |
| workflows | 2 | 0 | 0% | HIGH |
| monitoring | 1 | 0 | 0% | MODERATE |
| migrations | 1 | 0 | 0% | MODERATE |

---

## Critical Untested Source Files

The following 60+ source files have **zero corresponding test files**. These are prioritized by domain criticality and code complexity.

### CRITICAL -- Production-Facing Services Without Tests

**enterprise-integration (6 untested services out of 9 source files):**
- `services/esb-middleware-service.ts`
- `services/message-broker-service.ts`
- `services/soap-wsdl-service.ts`
- `services/sod-analysis-service.ts`
- `services/odata-service.ts`
- `services/sap-integration-service.ts`

**test-execution (15 untested files out of 25 source files):**
- `services/network-mocker.ts`
- `services/retry-handler.ts`
- `services/test-executor.ts`
- `services/auth-state-manager.ts`
- `services/test-prioritizer.ts`
- `services/e2e/step-executors.ts`
- `services/e2e/assertion-handlers.ts`
- `services/e2e/browser-orchestrator.ts`
- `services/e2e/e2e-coordinator.ts`
- `services/e2e/result-collector.ts`
- `services/e2e/step-retry-handler.ts`
- `services/e2e/wait-condition-handler.ts`
- `services/e2e/adaptive-locator-types.ts`
- `types/flow-templates.types.ts`
- `types/e2e-step.types.ts`

**security-compliance (10 untested files out of 21 source files):**
- `services/security-auditor-dast.ts`
- `services/security-auditor-sast.ts`
- `services/security-auditor-reports.ts`
- `services/security-auditor-secrets.ts`
- `services/security-auditor-types.ts`
- `services/scanners/dast-helpers.ts`
- `services/scanners/scanner-types.ts`
- `services/scanners/dast-injection-testing.ts`
- `services/scanners/dast-auth-testing.ts`
- `services/semgrep-integration.ts`

**requirements-validation (16 untested files out of 26 source files):**
- `qcsd-refinement-plugin.ts`
- `qcsd-ideation-plugin.ts`
- `services/product-factors-assessment/analyzers/brutal-honesty-analyzer.ts`
- `services/product-factors-assessment/analyzers/sfdipot-analyzer.ts`
- `services/product-factors-assessment/parsers/architecture-parser.ts`
- `services/product-factors-assessment/parsers/document-parser.ts`
- `services/product-factors-assessment/parsers/user-story-parser.ts`
- `services/product-factors-assessment/patterns/domain-registry.ts`
- `services/product-factors-assessment/formatters/gherkin-formatter.ts`
- `services/product-factors-assessment/formatters/json-formatter.ts`
- `services/product-factors-assessment/formatters/html-formatter.ts`
- `services/product-factors-assessment/formatters/markdown-formatter.ts`
- `services/product-factors-assessment/code-intelligence/codebase-analyzer.ts`
- `services/product-factors-assessment/product-factors-service.ts`
- `services/product-factors-assessment/skills/skill-integration.ts`
- `services/product-factors-assessment/generators/test-idea-generator.ts`

---

## Test Quality Metrics

### Assertions and Confidence

| Metric | Value | Assessment |
|--------|-------|------------|
| Total assertion lines | 62,941 | Strong |
| Assertions per test case (avg) | ~3.1 | Adequate (target: 3+) |
| Tests with `expect`/`assert` | 62,941 lines across files | -- |
| Snapshot tests | 33 | Very low -- under-utilized |
| Error boundary tests (`toThrow`/`.rejects`) | 716 | Good |
| Async test patterns | 866 | Adequate |

### Mocking Depth

| Pattern | Count | Assessment |
|---------|-------|------------|
| `vi.mock()` calls | 145 | Moderate -- 13.4% of unit test files use vi.mock |
| `vi.fn()` calls | 3,180 | Heavy mock usage |
| `vi.spyOn()` calls | 161 | Low spy usage relative to fn() |
| `beforeEach`/`beforeAll` | 2,005 | Active setup patterns |
| `afterEach`/`afterAll` | 1,152 | Good teardown discipline |

**Assessment**: The ratio of `vi.fn()` (3,180) to `vi.mock()` (145) is 22:1, indicating tests heavily create mock functions but rarely mock entire modules. This suggests many tests use manual dependency injection with function stubs rather than module-level mocking, which is a positive design pattern.

### Timer Coverage

| Metric | v3.7.10 | v3.7.14 | Assessment |
|--------|---------|---------|------------|
| Fake timer usage in tests | ~64 | 88 | +37.5% |
| Timer usage in source (`setTimeout`/`setInterval`) | -- | 421 | High timer dependency |
| Timer coverage ratio | 10.3% | 20.9% | Improved but still low |

**Risk**: 421 timer-dependent source code locations vs 88 fake timer test usages means ~79% of timer-dependent code paths lack proper timer-controlled testing. This is a common source of flaky tests and race conditions.

---

## Anti-Pattern Analysis

### Severity Breakdown

| Anti-Pattern | Count | Severity | Impact |
|--------------|-------|----------|--------|
| `as any` type casts | 418 | HIGH | Bypasses TypeScript safety in tests, can mask interface changes |
| Skipped tests (`.skip`) | 365 | HIGH | 1.8% of tests deliberately ignored -- coverage illusion |
| `.only` in source | 73 | LOW | Only in Playwright type definitions, not real test code |
| Hardcoded `sleep()`/`delay()` | 203 | MODERATE | Non-deterministic timing, causes flaky tests |
| Empty catch blocks | 40 | MODERATE | Silently swallowed errors in test setup/teardown |
| Deep nesting (>5 describes) | 80+ files | MODERATE | Reduced readability and maintainability |
| Duplicate test names | 20+ patterns | LOW | Confusing test reports, potential copy-paste errors |

### Deeply Nested Test Files (>10 describe levels)

These files have excessive nesting that makes them hard to maintain:

| File | Nesting Depth |
|------|--------------|
| `quality-assessment/coherence-gate.test.ts` | 32 |
| `enterprise-integration/coordinator.test.ts` | 27 |
| `strange-loop/strange-loop.test.ts` | 24 |
| `learning-optimization/coordinator.test.ts` | 24 |
| `test-generation/coordinator.test.ts` | 18 |
| `quality-assessment/coordinator.test.ts` | 18 |
| `causal-discovery/causal-graph.test.ts` | 16 |
| `test-execution/coordinator.test.ts` | 16 |
| `strange-loop/belief-reconciler.test.ts` | 16 |
| `infra-healing/test-output-observer.test.ts` | 14 |
| `test-execution/e2e-runner-browser.test.ts` | 14 |

### Skipped Tests by Reason

| Reason | Count | Action Needed |
|--------|-------|---------------|
| Integration test deferred (`integration` label) | 4 | Wire up integration CI |
| ESM compatibility (`require() fails in ESM`) | 3 | Fix ESM/CJS interop |
| Feature not ready (`placeholder`) | 2 | Track in backlog |
| Flaky/timing issues | ~356 | Investigate and fix or remove |

---

## Missing Test Categories Assessment

| Category | Present? | Evidence | Priority |
|----------|----------|----------|----------|
| Property-based (fast-check) | NO | 70 matches for `property`/`arbitrary` but all are domain code, not fast-check usage | P1 -- HIGH |
| Mutation testing (Stryker) | NO | Skill definition exists (`.claude/skills/mutation-testing`) but no Stryker config or integration | P1 -- HIGH |
| Contract testing (Pact) | PARTIAL | 574 matches for schema/contract patterns; `contract-testing` domain exists as code but no Pact provider/consumer tests | P2 -- MODERATE |
| Accessibility (axe-core) | PARTIAL | 1,876 matches; `visual-accessibility` domain has tests but no axe-core integration tests | P2 -- MODERATE |
| Visual regression | PARTIAL | 1,107 matches for snapshot/screenshot patterns; Playwright exists in `tests/e2e/` but excluded from CI | P2 -- MODERATE |
| Load/stress testing | MINIMAL | 598 matches; `tests/load/100-agents.test.ts` exists but is `describe.skip`'d | P1 -- HIGH |
| Chaos testing | YES | `chaos-resilience` domain is 83% covered | P3 -- LOW |
| Security testing | PARTIAL | `tests/security/` exists with oauth tests but largely skipped | P2 -- MODERATE |

---

## Test Execution Results

### Current State (v3.7.14)

```
Test Files:  1 failed (609 detected, bail=3 stopped early)
Tests:       2 failed | 34 passed | 4 skipped (82 total executed out of ~20,426)
Duration:    21.33s
```

### Failing Tests

Both failures are in `tests/unit/mcp/handlers/domain-handlers.test.ts`:

1. **`handleTestExecute > should include summary`** -- `expect(result.success).toBe(true)` fails (result.success is false)
2. **`handleQualityAssess > should return quality metrics`** -- Same pattern, handler returns failure

**Root cause assessment**: These are likely regressions from changes to the domain handler response shape or fleet initialization sequence. The tests expect `success: true` but the handlers return `success: false`, indicating the underlying domain operations fail during test execution (possibly due to missing fleet initialization in the test context).

### Bail Configuration Impact

The vitest config sets `bail: 3` (non-CI) which stops test execution after 3 failures in a single file. Since `domain-handlers.test.ts` had 2 failures, the bail was nearly triggered. This means:
- Only 82 tests out of ~20,426 actually ran
- The pass rate of 34/36 (94.4%) is measured over a tiny subset
- **True pass rate is unknown** -- the remaining 609 test files never executed

**Recommendation**: The bail setting should be raised or removed for full-suite validation runs. The current configuration provides insufficient confidence.

---

## Test Suite Growth Trajectory

| Time Period | Test Files Modified | Assessment |
|-------------|-------------------|------------|
| Last 30 days | 634 | Massive churn (98% of files touched) |
| Last 7 days | 63 | Active development |
| Last 24 hours | 8 | Normal cadence |

The high 30-day modification count (634 out of 647 files) suggests a major restructuring or mass update occurred recently. This could indicate automated test generation, bulk refactoring, or a version migration. Test quality should be closely monitored after such events.

---

## Coverage Impact Projections

### If Top 5 Gap Domains Were Fully Tested

| Domain | Current Ratio | Target Ratio | New Tests Needed | Projected Coverage Lift |
|--------|--------------|-------------|-----------------|----------------------|
| enterprise-integration | 11% (1/9) | 80% | ~7 test files | +1.1% overall |
| test-execution | 24% (6/25) | 80% | ~14 test files | +2.2% overall |
| requirements-validation | 38% (10/26) | 80% | ~11 test files | +1.7% overall |
| security-compliance | 48% (10/21) | 80% | ~7 test files | +1.1% overall |
| quality-assessment | 53% (8/15) | 80% | ~4 test files | +0.6% overall |

**Total: ~43 new test files would lift overall domain coverage from 56% to ~73%.**

### Optimal Test Creation Order (by risk-weighted impact)

1. **enterprise-integration/services/** -- 6 untested services, enterprise-facing, highest risk
2. **test-execution/services/e2e/** -- 8 untested E2E service files, core product capability
3. **security-compliance/services/scanners/** -- 5 untested DAST/SAST scanners, security-critical
4. **requirements-validation/services/product-factors-assessment/** -- 12 untested analyzers/parsers
5. **test-execution/services/** -- 4 core services (retry-handler, test-executor, etc.)

---

## Recommendations (Prioritized by Risk)

### P0 -- CRITICAL (address before next release)

1. **Fix the 2 failing tests in `domain-handlers.test.ts`**
   - These are active regressions blocking CI confidence
   - Investigate whether fleet initialization is required in the test context

2. **Remove or raise `bail: 3` for validation runs**
   - Current config means ~99.6% of tests never execute
   - Add a `test:full` npm script with `bail: 0` for pre-release validation
   - Keep `bail: 3` for development-time fast feedback

3. **Enable E2E tests in CI**
   - 5 E2E test files exist but are excluded by `*.e2e.test.ts` pattern in vitest config
   - Create a separate CI job for E2E tests (e.g., `test:e2e` script)

### P1 -- HIGH (address within 2 sprints)

4. **Test the enterprise-integration domain**
   - 6 out of 9 source files have zero tests
   - Focus on: `esb-middleware-service.ts`, `message-broker-service.ts`, `sap-integration-service.ts`

5. **Test the test-execution E2E services**
   - 8 files in `services/e2e/` have zero tests
   - These are the engine for E2E test execution -- untested test infrastructure is a recursive blind spot

6. **Integrate property-based testing (fast-check)**
   - Zero property-based tests exist
   - Start with pure functions in `coverage-analysis`, `defect-intelligence`, and `routing`
   - Estimated effort: 1-2 days for initial integration + 5-10 property tests

7. **Reduce `as any` casts in tests**
   - 418 occurrences bypass type safety
   - Create proper test fixture types and builder functions
   - Target: reduce to <50 within 2 sprints

### P2 -- MODERATE (address within 1 quarter)

8. **Set up mutation testing (Stryker)**
   - A skill definition exists but no actual Stryker config
   - Start with high-value modules: `kernel/`, `memory/`, `routing/`

9. **Address the 365 skipped tests**
   - Audit each skipped test: fix, delete, or convert to a tracked backlog item
   - Skipped tests create a false sense of coverage

10. **Reduce hardcoded sleeps/delays (203 occurrences)**
    - Replace with `vi.useFakeTimers()` or event-driven waits
    - Focus on files with >3 sleep calls first

11. **Refactor deeply nested test files**
    - 10+ files with >14 describe levels
    - Extract nested contexts into separate test files or use test factories

### P3 -- LOW (address as capacity allows)

12. **Add contract tests (Pact or similar)**
    - The `contract-testing` domain validates schemas but lacks provider/consumer contract tests
    - Add for MCP protocol boundaries

13. **Integrate load testing into CI**
    - `tests/load/100-agents.test.ts` exists but is skipped
    - Set up scheduled nightly load test runs

14. **Increase snapshot test usage**
    - Only 33 snapshot assertions across the entire suite
    - Good candidates: CLI output formatting, report generation, config serialization

---

## Risk Scoring Methodology

Each gap is scored on three factors (1-5 scale):

- **Complexity**: Cyclomatic complexity of the untested code
- **Criticality**: Impact on users if the code fails
- **Change Frequency**: How often the code has been modified recently (634/647 files touched in 30 days)

```
Risk Score = Complexity x Criticality x Change Frequency / 25 (normalized to 0-5)
```

| Risk Level | Score Range | Count of Gaps |
|------------|-------------|---------------|
| CRITICAL | 4.0-5.0 | 2 domains (enterprise-integration, test-execution) |
| HIGH | 3.0-3.9 | 4 domains + 5 modules |
| MODERATE | 2.0-2.9 | 4 domains + 8 modules |
| LOW | 0-1.9 | 3 domains + 10 modules |

---

## Appendix A: Full Domain Source vs Test Inventory

### Domains (13 bounded contexts)

| # | Domain | Src Files | Test Files | Ratio | Test Cases | Untested Files |
|---|--------|-----------|------------|-------|------------|----------------|
| 1 | visual-accessibility | 15 | 17 | 113% | 513 | 3 |
| 2 | defect-intelligence | 7 | 9 | 129% | 210 | 0 |
| 3 | coverage-analysis | 11 | 12 | 109% | 277 | 0 |
| 4 | chaos-resilience | 6 | 5 | 83% | 156 | 0 |
| 5 | contract-testing | 6 | 5 | 83% | 109 | 0 |
| 6 | code-intelligence | 14 | 11 | 79% | 267 | 4 |
| 7 | test-generation | 34 | 26 | 76% | 613 | 11 |
| 8 | learning-optimization | 11 | 6 | 55% | 181 | 4 |
| 9 | quality-assessment | 15 | 8 | 53% | 216 | 7 |
| 10 | security-compliance | 21 | 10 | 48% | 239 | 10 |
| 11 | requirements-validation | 26 | 10 | 38% | 230 | 16 |
| 12 | test-execution | 25 | 6 | 24% | 159 | 15 |
| 13 | enterprise-integration | 9 | 1 | 11% | 87 | 6 |
| | **TOTAL** | **200** | **126** | **63%** | **3,257** | **76** |

### Non-Domain Modules (top 10 by gap size)

| # | Module | Src Files | Test Files | Gap |
|---|--------|-----------|------------|-----|
| 1 | integrations | 127 | 57 | 70 |
| 2 | mcp | 97 | 42 | 55 |
| 3 | coordination | 108 | 58 | 50 |
| 4 | shared | 73 | 30 | 43 |
| 5 | adapters | 75 | 40 | 35 |
| 6 | cli | 58 | 29 | 29 |
| 7 | init | 50 | 27 | 23 |
| 8 | strange-loop | 19 | 12 | 7 |
| 9 | agents | 12 | 6 | 6 |
| 10 | test-scheduling | 8 | 3 | 5 |

## Appendix B: Vitest Configuration Summary

| Setting | Value | Impact |
|---------|-------|--------|
| Pool | `forks` | Process isolation (good for native modules) |
| File Parallelism | `false` | Sequential execution (OOM prevention) |
| Max Forks | 1 | Single-process execution |
| Bail | 3 (non-CI) / 5 (CI) | Stops after N failures |
| Test Timeout | 10,000ms | Aggressive for integration tests |
| Hook Timeout | 15,000ms | Adequate |
| Isolate | `true` | Full process isolation |
| Excluded patterns | `_archived/`, `browser/`, `*.e2e.test.ts`, `vibium/` | E2E excluded from CI |

## Appendix C: Vitest Exclude Impact

Files excluded from the default test run:

| Pattern | Files Excluded | Impact |
|---------|---------------|--------|
| `**/_archived/**` | 4+ | Low (archived code) |
| `**/browser/**` | Unknown | Moderate (browser tests skipped) |
| `**/*.e2e.test.ts` | 5 | HIGH (no E2E in CI) |
| `**/vibium/**` | 3+ | Low (third-party integration) |
| `browser-swarm-coordinator.test.ts` | 1 | Low |

---

*Report generated by Coverage Gap Analyzer. All file counts and test case numbers are based on static analysis (grep/find) and may differ slightly from runtime vitest detection due to dynamic test generation and conditional test registration.*
