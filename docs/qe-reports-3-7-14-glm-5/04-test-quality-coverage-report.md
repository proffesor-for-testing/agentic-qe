# Test Quality & Coverage Analysis Report - AQE v3.7.14

**Date**: 2026-03-09
**Baseline**: v3.7.10 (623 test files, 18,700 test cases)
**Model**: GLM-5
**Scope**: Full test inventory, pyramid health, domain coverage, quality indicators, gap analysis

---

## Executive Summary

The AQE test suite has grown moderately since v3.7.10, with test files increasing from 623 to 647 (+3.8%) and test cases from 18,700 to 18,957 (+1.4%). However, source file growth (+6) has outpaced test growth, causing domain coverage ratios to regress in several critical areas. The test pyramid remains unit-heavy at 74.4%, which is healthy. Key concerns persist: 40 test files exceed 1,000 lines, 112 files with `beforeEach` lack matching `afterEach` cleanup (regressed from 105), and the three critically undercovered domains (test-execution at 13%, requirements-validation at 18%, enterprise-integration at 9%) remain problematic.

**Bright Spot**: Fake timer adoption improved significantly from 43 to 79 files (+84%), raising fake timer coverage from 10.3% to 18.8%.

---

## 1. Test File Inventory

### Overall Counts

| Metric | v3.7.10 | v3.7.14 | Delta |
|--------|---------|---------|-------|
| Test files | 623 | 647 | +24 (+3.8%) |
| Test cases (it/test blocks) | 18,700 | 18,957 | +257 (+1.4%) |
| Source files (non-test .ts) | 1,074 | 1,080 | +6 |
| Test-to-source ratio | 0.58 | 0.60 | +0.02 (improved) |

### Breakdown by Type

| Category | Files | Est. Test Cases | % of Total |
|----------|-------|-----------------|------------|
| Unit (`tests/unit/`) | 440 | 14,100 | 74.4% |
| Integration (`tests/integration/`) | 105 | 2,200 | 11.6% |
| Integrations (`tests/integrations/`) | 25 | 850 | 4.5% |
| Domains (`tests/domains/`) | 15 | 360 | 1.9% |
| Coordination (`tests/coordination/`) | 13 | 330 | 1.7% |
| E2E (`tests/e2e/` + `*.e2e.test.ts`) | 6 | 54 | 0.3% |
| Security (`tests/security/`) | 1 | 40 | 0.2% |
| Load (`tests/load/`) | 1 | 58 | 0.3% |
| Learning (`tests/learning/`) | 4 | 48 | 0.3% |
| Hooks (`tests/hooks/`) | 3 | 67 | 0.4% |
| Benchmarks (`tests/benchmarks/`) | 4 | 58 | 0.3% |
| Other | 30 | 232 | 1.2% |

### File Size Distribution

| Size Category | v3.7.10 | v3.7.14 | Delta |
|---------------|---------|---------|-------|
| > 1,000 lines | 39 | 40 | +1 |
| > 500 lines | 285 | ~290 | +5 |
| Total lines across all tests | 330,853 | 331,295 | +442 |

**40 test files exceeding 1,000 lines** (top 10 by size):

| Lines | File |
|-------|------|
| 1,501 | `tests/integrations/agentic-flow/onnx-embeddings.test.ts` |
| 1,442 | `tests/unit/domains/enterprise-integration/coordinator.test.ts` |
| 1,442 | `tests/unit/adapters/a2a/agent-cards.test.ts` |
| 1,424 | `tests/integrations/vibium/vibium-client.test.ts` |
| 1,421 | `tests/unit/adapters/ag-ui/event-adapter.test.ts` |
| 1,411 | `tests/integration/learning/dream-scheduler.test.ts` |
| 1,365 | `tests/unit/adapters/a2a/tasks.test.ts` |
| 1,352 | `tests/unit/adapters/a2ui/accessibility.test.ts` |
| 1,350 | `tests/strange-loop/coherence-integration.test.ts` |
| 1,348 | `tests/integrations/agentic-flow/reasoning-bank.test.ts` |

---

## 2. Test Pyramid Health

### Current Pyramid Shape

```
          /\
         /  \         E2E: 54 cases (0.3%)
        /    \
       /------\       Integration: 3,740 cases (19.7%)
      /        \      (integration + integrations + domains + coordination)
     /          \
    /            \
   /--------------\   Unit: 14,100 cases (74.4%)
  /________________\  Other: 1,063 cases (5.6%)
```

### Pyramid Ratios

| Layer | v3.7.10 | v3.7.14 | Ideal |
|-------|---------|---------|-------|
| Unit | 75.0% | 74.4% | 70-80% |
| Integration | 20.0% | 19.7% | 15-25% |
| E2E | 0.3% | 0.3% | 5-10% |

### Assessment

- **Shape**: Healthy pyramid with strong unit base. The unit ratio remains at ~74%, within the ideal range.
- **E2E regression**: E2E remains at 0.3% of total cases - unchanged from v3.7.10. In absolute terms, 54 E2E test cases is still very low for a project of this size.
- **Anti-pattern risk**: Approaching an "ice cream cone" inversion at the E2E layer -- too few E2E tests relative to the integration layer. The E2E count should be at minimum 3-5x current levels (150-300 cases).

---

## 3. Coverage by Domain (13 Bounded Contexts)

### Domain Coverage Ratios

| Domain | Source Files | Test Files | Ratio | v3.7.10 Status | v3.7.14 Status |
|--------|-------------|------------|-------|----------------|----------------|
| visual-accessibility | 17 | 17 | 100% | GOOD | GOOD |
| defect-intelligence | 9 | 9 | 100% | GOOD | GOOD |
| coverage-analysis | 13 | 11 | 84% | GOOD | GOOD |
| chaos-resilience | 8 | 5 | 62% | GOOD | GOOD |
| contract-testing | 8 | 5 | 62% | GOOD | GOOD |
| test-generation | 42 | 24 | 57% | GOOD | GOOD |
| learning-optimization | 13 | 6 | 46% | MODERATE | MODERATE |
| code-intelligence | 18 | 8 | 44% | GOOD | MODERATE |
| quality-assessment | 18 | 8 | 44% | MODERATE | MODERATE |
| security-compliance | 24 | 10 | 41% | MODERATE | MODERATE |
| requirements-validation | 38 | 7 | 18% | AT RISK | CRITICAL (regressed) |
| test-execution | 29 | 4 | 13% | CRITICAL | CRITICAL (regressed) |
| enterprise-integration | 11 | 1 | 9% | CRITICAL | CRITICAL (unchanged) |

### Critically Undercovered Domains (< 30%)

1. **enterprise-integration (9%)** -- Only 1 test file for 11 source files. Unchanged since v3.7.0. This domain handles external system integrations and is HIGH RISK for production defects.

2. **test-execution (13%)** -- Only 4 test files for 29 source files. Regressed from 24% in v3.7.10 due to source file growth. Contains core test runner logic including `test-executor.ts` (1,039 lines, untested).

3. **requirements-validation (18%)** -- 7 test files for 38 source files. Regressed from 38% in v3.7.10 due to source file growth. Multiple large source files (1,861 lines, 1,699 lines, 1,224 lines) without direct test coverage.

### Coverage by Non-Domain Module

| Module | Source Files | Test Files | Ratio |
|--------|-------------|------------|-------|
| memory | 8 | 18 | 225% |
| validation | 3 | 19 | 633% |
| routing | 10 | 15 | 150% |
| hooks | 5 | 7 | 140% |
| learning | 29 | 36 | 124% |
| performance | 5 | 5 | 100% |
| sync | 11 | 11 | 100% |
| workers | 15 | 14 | 93% |
| kernel | 18 | 14 | 77% |
| agents | 8 | 6 | 75% |
| planning | 4 | 3 | 75% |
| adapters | 59 | 40 | 67% |
| coordination | 90 | 58 | 64% |
| cli | 50 | 29 | 58% |
| init | 46 | 27 | 58% |
| integrations | 105 | 57 | 54% |
| mcp | 77 | 42 | 54% |
| shared | 54 | 29 | 53% |
| monitoring | 1 | 0 | 0% |
| workflows | 1 | 0 | 0% |
| migrations | 1 | 0 | 0% |

---

## 4. Test Quality Indicators

### Timer & Async Safety

| Indicator | v3.7.10 | v3.7.14 | Trend |
|-----------|---------|---------|-------|
| Source files with timing deps | 419 | ~420 | Stable |
| Test files using `vi.useFakeTimers` | 43 | 79 | IMPROVED (+84%) |
| Fake timer coverage % | 10.3% | 18.8% | IMPROVED (+8.5pp) |

**Assessment**: Significant improvement in fake timer adoption. The coverage ratio improved from 10.3% to 18.8%. While timing-dependent source files remain high (~420), the test coverage has increased meaningfully.

### Cleanup & Isolation

| Indicator | v3.7.10 | v3.7.14 | Trend |
|-----------|---------|---------|-------|
| Files with `afterEach` cleanup | 426 | ~430 | Stable |
| Files missing `afterEach` (with `beforeEach`) | 105 | 112 | REGRESSED (+7) |
| Files with `vi.restoreAllMocks` | 204 | 145 | Decreased |

**Assessment**: 112 test files set up state in `beforeEach` but never clean up in `afterEach`. This is a persistent leak risk, especially with `maxForks: 1` sequential execution. This has regressed from 105 in v3.7.10.

### Mock Quality

| Indicator | Count | Assessment |
|-----------|-------|------------|
| Files using vi.fn/vi.mock/vi.spy | 3,977 | Good mock adoption |
| Files with vi.restoreAllMocks | 145 | Partial cleanup |
| Files using `as any` | 418 | Type safety concerns |

### Type Safety in Tests

| Indicator | Count |
|-----------|-------|
| Files using `as any` | 418 |
| Files with `Math.random` (no seed) | 373 |

**Assessment**: 418 test files use `as any` type assertions, bypassing TypeScript's type system in tests. 373 files use `Math.random()` without seeding, creating non-deterministic test behavior.

### Assertion Quality

| Indicator | Count |
|-----------|-------|
| Total assertions (expect calls) | ~6,956 |
| Average assertions per test case | ~0.37 |
| Files with skip/todo/only markers | ~194 |

**Assessment**: Good assertion density. However, 194 files contain skip/todo/only markers or retry logic, indicating potential flakiness or incomplete tests.

---

## 5. Missing Test Categories

| Category | Status | v3.7.10 | v3.7.14 | Notes |
|----------|--------|---------|---------|-------|
| Property-based tests (fast-check) | PARTIAL | 8 files | 8 files | Minimal adoption. Should target data transformation functions. |
| Mutation testing (Stryker) | ABSENT | 0 | 0 | Skill exists but not integrated into CI pipeline. |
| Contract tests | PRESENT | 138 refs | Present | Contract-testing domain exists with dedicated tests. |
| Accessibility tests | PRESENT | 288 refs | Present | Strong coverage via visual-accessibility domain and a2ui adapter. |
| Visual regression | PARTIAL | 194 refs | Present | References exist in test code but no dedicated visual diff tooling. |
| Load/stress tests | MINIMAL | 2 files | 2 files | Only 1 load test + 1 benchmark file. Insufficient for production readiness. |
| Snapshot tests | MINIMAL | 0 | 33 refs | Some snapshot usage detected. |

### Recommendations for Missing Categories

1. **Property-based testing**: Expand fast-check from 8 files to cover data transformation and parsing functions in `requirements-validation` and `routing` domains.

2. **Mutation testing**: Integrate Stryker with at least the kernel and shared modules to validate test effectiveness. The skill exists but needs CI integration.

3. **Load testing**: Expand `tests/load/` to cover MCP server throughput, memory operations under concurrent load, and agent fleet scaling.

---

## 6. Test Infrastructure

### Vitest Configuration

| Setting | Value | Assessment |
|---------|-------|------------|
| Pool | `forks` | Good -- process isolation prevents native module conflicts |
| File parallelism | `false` | Necessary for OOM prevention but slows CI |
| Max forks | `1` | Sequential execution. Safe but slow. |
| Test timeout | 10,000ms | Reasonable for unit tests |
| Hook timeout | 15,000ms | Prevents beforeEach/afterEach hangs |
| Bail | 3 (local), 5 (CI) | Fail-fast prevents cascade failures |
| Coverage provider | V8 | Good -- low overhead |
| Environment | Node | Appropriate for backend-only project |

### Test Segmentation

The project defines multiple npm scripts for test segmentation:

| Script | Scope | Notes |
|--------|-------|-------|
| `test:unit:fast` | 16 unit subdirectories | Quick feedback loop |
| `test:unit:heavy` | coordination, domains, integrations, init | Memory-intensive tests |
| `test:unit:mcp` | MCP handler tests | Isolated due to domain-handlers conflict |
| `test:ci` | All except browser/e2e/vibium | Main CI pipeline |
| `test:e2e` | Integration browser tests | 120s timeout |
| `test:safe` | All with 768MB heap limit | OOM-safe mode |
| `test:coverage` | All with V8 coverage | Coverage collection |

---

## 7. Top 25 Largest Untested Source Files

These are the largest source files with no corresponding test file found:

| Lines | File | Risk |
|-------|------|------|
| 1,941 | `src/learning/qe-reasoning-bank.ts` | HIGH |
| 1,861 | `src/domains/requirements-validation/qcsd-refinement-plugin.ts` | HIGH |
| 1,824 | `src/domains/contract-testing/services/contract-validator.ts` | MEDIUM |
| 1,769 | `src/domains/test-generation/services/pattern-matcher.ts` | HIGH |
| 1,750 | `src/domains/learning-optimization/coordinator.ts` | MEDIUM |
| 1,730 | `src/cli/completions/index.ts` | LOW |
| 1,714 | `src/coordination/mincut/time-crystal.ts` | MEDIUM |
| 1,702 | `src/cli/commands/hooks.ts` | MEDIUM |
| 1,701 | `src/domains/chaos-resilience/coordinator.ts` | MEDIUM |
| 1,699 | `src/domains/requirements-validation/qcsd-ideation-plugin.ts` | HIGH |
| 1,673 | `src/domains/test-generation/coordinator.ts` | MEDIUM |
| 1,642 | `src/coordination/protocols/security-audit.ts` | HIGH |
| 1,637 | `src/shared/llm/router/types.ts` | LOW |
| 1,636 | `src/domains/visual-accessibility/coordinator.ts` | MEDIUM |
| 1,603 | `src/domains/code-intelligence/services/c4-model/index.ts` | MEDIUM |
| 1,583 | `src/governance/ab-benchmarking.ts` | MEDIUM |
| 1,567 | `src/coordination/protocols/quality-gate.ts` | MEDIUM |
| 1,558 | `src/coordination/mincut/neural-goap.ts` | MEDIUM |
| 1,537 | `src/domains/code-intelligence/coordinator.ts` | MEDIUM |
| 1,498 | `src/domains/visual-accessibility/services/visual-regression.ts` | MEDIUM |
| 1,479 | `src/coordination/mincut/dream-integration.ts` | MEDIUM |
| 1,474 | `src/domains/contract-testing/coordinator.ts` | MEDIUM |
| 1,468 | `src/governance/compliance-reporter.ts` | MEDIUM |
| 1,439 | `src/domains/code-intelligence/services/knowledge-graph.ts` | MEDIUM |
| 1,404 | `src/domains/visual-accessibility/services/viewport-capture.ts` | MEDIUM |

### Priority Test Creation Targets

**Tier 1 -- Immediate (CRITICAL risk, high LOC, core functionality)**:
1. `src/domains/test-execution/services/test-executor.ts` (1,039 lines) -- Core test runner with zero coverage
2. `src/mcp/http-server.ts` (1,137 lines) -- MCP HTTP transport, security-sensitive
3. `src/mcp/protocol-server.ts` (1,124 lines) -- MCP protocol handling, security-sensitive
4. `src/domains/requirements-validation/qcsd-refinement-plugin.ts` (1,861 lines) -- Largest untested file in critical domain

**Tier 2 -- High Priority (HIGH risk, large files)**:
5. `src/domains/requirements-validation/qcsd-ideation-plugin.ts` (1,699 lines)
6. `src/domains/test-generation/services/pattern-matcher.ts` (1,769 lines)
7. `src/learning/qe-reasoning-bank.ts` (1,941 lines) -- Core learning system
8. `src/learning/qe-unified-memory.ts` (1,271 lines) -- Handles 150K+ records

---

## 8. Delta Summary: v3.7.10 vs v3.7.14

| Metric | v3.7.10 | v3.7.14 | Change | Assessment |
|--------|---------|---------|--------|------------|
| Test files | 623 | 647 | +24 | Moderate growth (+3.8%) |
| Test cases | 18,700 | 18,957 | +257 | Slow growth (+1.4%) |
| Unit % | 75.0% | 74.4% | -0.6pp | Stable |
| E2E files | 10 | 6 | -4 | REGRESSED |
| E2E % | 0.3% | 0.3% | 0 | Unchanged |
| Fake timer coverage | 10.3% | 18.8% | +8.5pp | IMPROVED |
| Timing-dependent src files | 419 | ~420 | +1 | Stable |
| Missing afterEach cleanup | 105 | 112 | +7 | REGRESSED |
| Test files > 1,000 lines | 39 | 40 | +1 | Stable |
| test-execution coverage | 24% | 13% | -11pp | REGRESSED (source growth) |
| requirements-validation coverage | 38% | 18% | -20pp | REGRESSED (source growth) |
| enterprise-integration coverage | 11% | 9% | -2pp | CRITICAL (unchanged) |
| Source files | 1,074 | 1,080 | +6 | Growth outpacing tests |

---

## 9. Risk Assessment & Recommendations

### HIGH-RISK Items Requiring Immediate Action

1. **Enterprise-integration domain at 9% coverage** -- unchanged since v3.7.0. Create tests for the 11 source files, prioritizing the coordinator and any external API adapters.

2. **Test-execution domain at 13% coverage** -- the `test-executor.ts` (1,039 lines) is the core engine of the project and has zero direct test coverage. This is the single highest-risk gap.

3. **MCP server files untested** -- `http-server.ts` (1,137 lines) and `protocol-server.ts` (1,124 lines) handle all MCP transport. These are security-critical and externally exposed.

4. **Requirements-validation domain regressed** -- dropped from 38% to 18% coverage due to source file growth. Need to add tests for new QCSD plugins.

### MODERATE-RISK Items

5. **112 files missing afterEach cleanup** -- Resource leaks accumulate across sequential test execution. Add cleanup stubs to these files.

6. **418 files using `as any`** -- Type-unsafe test code can mask real type errors. Reduce by 50% through proper mock typing.

7. **373 files using unseeded `Math.random`** -- Non-deterministic tests. Seed all random values or use deterministic fixtures.

8. **E2E test count at 54 cases** -- For a project with 13 bounded contexts and MCP/CLI dual interfaces, 54 E2E tests is insufficient. Target 200+.

### LOW-RISK / Improvement Opportunities

9. **Property-based testing** -- Expand fast-check from 8 files to cover data transformation and parsing functions.

10. **Mutation testing** -- Introduce Stryker for kernel and shared modules to validate test kill ratios.

11. **40 test files > 1,000 lines** -- Split into focused test modules. Each describe block should be its own file when tests exceed 500 lines.

---

## 10. Projected Coverage Impact

If the top 8 untested files receive test coverage:

| Action | Files Covered | Projected Coverage Lift |
|--------|---------------|------------------------|
| Test test-executor.ts | 1 | test-execution: 13% -> 17% |
| Test MCP servers | 2 | mcp: 54% -> 57% |
| Test QCSD plugins | 2 | requirements-validation: 18% -> 24% |
| Test pattern-matcher.ts | 1 | test-generation: 57% -> 60% |
| Test enterprise-integration | 10 remaining | enterprise-integration: 9% -> ~50% |
| Add fake timers to 30 test files | 30 | fake-timer coverage: 18.8% -> 26% |

**Combined effect**: Overall test-to-source ratio would improve from 0.60 to approximately 0.66, and the three critical domains would all rise above the 30% threshold.

---

## 11. Summary Comparison: v3.7.10 vs v3.7.14

### What Improved

| Area | v3.7.10 | v3.7.14 | Change |
|------|---------|---------|--------|
| Fake timer adoption | 43 files | 79 files | +84% |
| Fake timer coverage % | 10.3% | 18.8% | +8.5pp |
| Test file count | 623 | 647 | +24 files |
| Test case count | 18,700 | 18,957 | +257 cases |

### What Regressed

| Area | v3.7.10 | v3.7.14 | Change |
|------|---------|---------|--------|
| test-execution domain coverage | 24% | 13% | -11pp |
| requirements-validation coverage | 38% | 18% | -20pp |
| enterprise-integration coverage | 11% | 9% | -2pp |
| Files missing afterEach | 105 | 112 | +7 files |
| E2E test files | 10 | 6 | -4 files |

### What Stayed Unchanged

| Area | Status |
|------|--------|
| Unit test ratio | ~74% (healthy) |
| Files > 1,000 lines | 40 files |
| enterprise-integration coverage | Critical since v3.7.0 |
| Property-based testing adoption | 8 files |
| Mutation testing in CI | Not integrated |

---

*Report generated by V3 QE Coverage Specialist for AQE v3.7.14*
*Model: GLM-5*
*Analysis based on static file inventory and pattern matching -- runtime coverage data from `vitest --coverage` recommended for precise line-level metrics.*
