# Test Quality & Coverage Analysis Report - AQE v3.7.10

**Date**: 2026-03-06
**Baseline**: v3.7.0 (590 test files, 7,031 test cases, 99.9% pass rate)
**Scope**: Full test inventory, pyramid health, domain coverage, quality indicators, gap analysis

---

## Executive Summary

The AQE test suite has grown substantially since v3.7.0, with test files increasing from 590 to 623 (+5.6%) and test cases surging from 7,031 to 18,700 (+166%). The test pyramid remains unit-heavy at 75% unit tests, which is healthy. However, several structural concerns persist: 39 test files exceed 1,000 lines (unchanged from v3.7.0), 105 files with `beforeEach` lack matching `afterEach` cleanup (improved from 104), and the three critically undercovered domains (test-execution, requirements-validation, enterprise-integration) remain problematic. Fake timer adoption has not meaningfully improved despite 419 timing-dependent source files.

---

## 1. Test File Inventory

### Overall Counts

| Metric | v3.7.0 | v3.7.10 | Delta |
|--------|--------|---------|-------|
| Test files | 590 | 623 | +33 (+5.6%) |
| Test cases (it/test blocks) | 7,031 | 18,700 | +11,669 (+166%) |
| Source files (non-test .ts) | ~900* | 1,074 | +174 |
| Test-to-source ratio | 0.66 | 0.58 | -0.08 (regressed) |

*v3.7.0 source count estimated from prior reports.

### Breakdown by Type

| Category | Files | Test Cases | % of Total Cases |
|----------|-------|------------|------------------|
| Unit (`tests/unit/`) | 434 | 14,025 | 75.0% |
| Integration (`tests/integration/`) | 104 | 2,183 | 11.7% |
| Integrations (`tests/integrations/`) | -- | 826 | 4.4% |
| Domains (`tests/domains/`) | 15 | 358 | 1.9% |
| Coordination (`tests/coordination/`) | 13 | 326 | 1.7% |
| E2E (`tests/e2e/` + `*.e2e.test.ts`) | 10 | 54 | 0.3% |
| Security (`tests/security/` + security-named) | 15 | 44+ | 0.2% |
| Load (`tests/load/`) | 1 | 58 | 0.3% |
| Learning (`tests/learning/`) | 4 | 48 | 0.3% |
| Hooks (`tests/hooks/`) | 3 | 67 | 0.4% |
| Benchmarks (`tests/benchmarks/`) | 8 | 58 | 0.3% |
| Strange-loop (`tests/strange-loop/`) | -- | 37 | 0.2% |
| Kernel (`tests/kernel/`) | 1 | 24 | 0.1% |
| Validation (`tests/validation/`) | 3 | 20 | 0.1% |

### File Size Distribution

| Size Category | v3.7.0 | v3.7.10 | Delta |
|---------------|--------|---------|-------|
| > 1,000 lines | 39 | 39 | 0 (unchanged) |
| > 500 lines | N/A | 285 | -- |
| Total lines across all tests | -- | 330,853 | -- |

**39 test files exceeding 1,000 lines** (top 10 by size):

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
       /------\       Integration: 3,730 cases (20.0%)
      /        \      (integration + integrations + domains + coordination)
     /          \
    /            \
   /--------------\   Unit: 14,025 cases (75.0%)
  /________________\  Other: 852 cases (4.6%)
```

### Pyramid Ratios

| Layer | v3.7.0 | v3.7.10 | Ideal |
|-------|--------|---------|-------|
| Unit | 70.7% | 75.0% | 70-80% |
| Integration | 26.2% | 20.0% | 15-25% |
| E2E | 3.1% | 0.3% | 5-10% |

### Assessment

- **Shape**: Healthy pyramid with strong unit base. The unit ratio improved from 70.7% to 75.0%.
- **E2E regression**: E2E dropped from 3.1% to 0.3% of total cases. While file count grew (10 files vs 18 in v3.7.0), the massive growth in unit tests (from ~5,000 to 14,025) diluted the E2E percentage. In absolute terms, 54 E2E test cases is still very low for a project of this size.
- **Anti-pattern risk**: Approaching an "ice cream cone" inversion at the E2E layer -- too few E2E tests relative to the integration layer. The E2E count should be at minimum 3-5x current levels (150-300 cases).

---

## 3. Coverage by Domain (13 Bounded Contexts)

### Domain Coverage Ratios

| Domain | Source Files | Test Files | Ratio | v3.7.0 Status | v3.7.10 Status |
|--------|-------------|------------|-------|---------------|----------------|
| visual-accessibility | 15 | 17 | 113% | -- | GOOD |
| coverage-analysis | 11 | 12 | 109% | -- | GOOD |
| defect-intelligence | 7 | 9 | 128% | -- | GOOD |
| chaos-resilience | 6 | 5 | 83% | -- | GOOD |
| contract-testing | 6 | 5 | 83% | -- | GOOD |
| code-intelligence | 14 | 11 | 78% | -- | GOOD |
| test-generation | 34 | 26 | 76% | -- | GOOD |
| learning-optimization | 11 | 6 | 54% | -- | MODERATE |
| quality-assessment | 15 | 8 | 53% | -- | MODERATE |
| security-compliance | 21 | 10 | 47% | -- | MODERATE |
| requirements-validation | 26 | 10 | 38% | 27% (CRITICAL) | AT RISK (improved) |
| test-execution | 25 | 6 | 24% | 13% (CRITICAL) | CRITICAL (improved) |
| enterprise-integration | 9 | 1 | 11% | 11% (CRITICAL) | CRITICAL (unchanged) |

### Critically Undercovered Domains (< 30%)

1. **enterprise-integration (11%)** -- Only 1 test file for 9 source files. Unchanged from v3.7.0. This domain handles external system integrations and is HIGH RISK for production defects.

2. **test-execution (24%)** -- Only 6 test files for 25 source files. Improved from 13% but still critically low. Contains core test runner logic including `test-executor.ts` (1,039 lines, untested).

3. **requirements-validation (38%)** -- 10 test files for 26 source files. Improved from 27%. Multiple large source files (1,861 lines, 1,699 lines, 1,224 lines) without direct test coverage.

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

| Indicator | v3.7.0 | v3.7.10 | Trend |
|-----------|--------|---------|-------|
| Source files with timing deps | 199 | 419 | +220 (WORSE) |
| Test files using `vi.useFakeTimers` | ~28* | 43 | +15 |
| Fake timer coverage % | 13.8% | 10.3% | REGRESSED |

*v3.7.0 estimate based on reported 13.8% of 199 files.

**Assessment**: Timing-dependent source files more than doubled (199 to 419), but fake timer usage in tests only grew from ~28 to 43. The fake timer coverage ratio dropped from 13.8% to 10.3%. This represents the single biggest flake risk in the test suite.

### Cleanup & Isolation

| Indicator | v3.7.0 | v3.7.10 | Trend |
|-----------|--------|---------|-------|
| Files with `afterEach` cleanup | ~486* | 426 | -- |
| Files missing `afterEach` (with `beforeEach`) | 104 | 105 | +1 (unchanged) |
| Files with `vi.restoreAllMocks` | -- | 204 | -- |
| Files with `afterAll` | -- | 56 | -- |

**Assessment**: 105 test files set up state in `beforeEach` but never clean up in `afterEach`. This is a persistent leak risk, especially with `maxForks: 1` sequential execution.

### Type Safety in Tests

| Indicator | Count |
|-----------|-------|
| Files using `as any` | 107 |
| Files with `Math.random` (no seed) | 107 |

**Assessment**: 107 test files use `as any` type assertions, bypassing TypeScript's type system in tests. An equal number use `Math.random()` without seeding, creating non-deterministic test behavior.

### Assertion Quality

| Indicator | Count |
|-----------|-------|
| Files with zero assertions | 0 |
| Files using `setTimeout` in tests | 165 |
| Files with retry/flaky indicators | 181 |

**Assessment**: No truly assertion-free test files exist (good). However, 165 files use `setTimeout` inside tests and 181 files contain retry logic or flaky test markers -- both strong indicators of timing sensitivity and potential flakiness.

---

## 5. Missing Test Categories

| Category | Status | v3.7.0 | v3.7.10 | Notes |
|----------|--------|--------|---------|-------|
| Property-based tests (fast-check) | PARTIAL | -- | 8 files | Minimal adoption. Should target data transformation functions. |
| Mutation testing (Stryker) | ABSENT | -- | 0 | 16 references to "mutation" exist but in domain code, not testing infrastructure. |
| Contract tests | PRESENT | -- | 138 refs | Contract-testing domain exists with dedicated tests. |
| Accessibility tests | PRESENT | -- | 288 refs | Strong coverage via visual-accessibility domain and a2ui adapter. |
| Visual regression | PARTIAL | -- | 194 refs | References exist in test code but no dedicated visual diff tooling (Percy/Chromatic). |
| Load/stress tests | MINIMAL | -- | 2 files | Only 1 load test + 1 performance test file. Insufficient for production readiness. |
| Snapshot tests | ABSENT | -- | 0 | No `toMatchSnapshot()` or `toMatchInlineSnapshot()` usage detected in core patterns. |

### Recommendations for Missing Categories

1. **Property-based testing**: Add fast-check for `requirements-validation` parsers, `routing` score calculations, and `shared/llm/router` rule matching.
2. **Mutation testing**: Integrate Stryker with at least the kernel and shared modules to validate test effectiveness.
3. **Load testing**: The `tests/load/` directory has 1 file with 58 test cases. Expand to cover MCP server throughput, memory operations under concurrent load, and agent fleet scaling.

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

### CI Test Execution

| Workflow | Trigger | Scope |
|----------|---------|-------|
| `mcp-tools-test.yml` | Push to main (src/mcp/**) | MCP unit tests |
| `optimized-ci.yml` | General CI | Full test suite |
| `sauce-demo-e2e.yml` | E2E trigger | Browser E2E |
| `coherence.yml` | Coherence changes | Strange-loop tests |
| `benchmark.yml` | Performance changes | Benchmark suite |
| `skill-validation.yml` | Skill changes | Skill tests |

**Gap**: No dedicated CI workflow for security tests, load tests, or integration tests as separate jobs. All run under `optimized-ci.yml` without isolation.

---

## 7. Top 25 Largest Untested Source Files

These are the largest source files with no corresponding test file found:

| Lines | File | Risk |
|-------|------|------|
| 1,861 | `src/domains/requirements-validation/qcsd-refinement-plugin.ts` | HIGH |
| 1,769 | `src/domains/test-generation/services/pattern-matcher.ts` | HIGH |
| 1,699 | `src/domains/requirements-validation/qcsd-ideation-plugin.ts` | HIGH |
| 1,271 | `src/learning/qe-unified-memory.ts` | HIGH |
| 1,260 | `src/governance/evolution-pipeline-integration.ts` | MEDIUM |
| 1,226 | `src/adapters/a2ui/catalog/component-schemas.ts` | MEDIUM |
| 1,224 | `src/domains/requirements-validation/services/product-factors-assessment/analyzers/brutal-honesty-analyzer.ts` | HIGH |
| 1,219 | `src/governance/shard-retriever-integration.ts` | MEDIUM |
| 1,140 | `src/domains/requirements-validation/services/product-factors-assessment/formatters/html-formatter.ts` | MEDIUM |
| 1,137 | `src/mcp/http-server.ts` | HIGH |
| 1,124 | `src/mcp/protocol-server.ts` | HIGH |
| 1,079 | `src/adapters/a2ui/accessibility/wcag-validator.ts` | MEDIUM |
| 1,061 | `src/domains/test-execution/types/e2e-step.types.ts` | LOW |
| 1,042 | `src/cli/utils/workflow-parser.ts` | MEDIUM |
| 1,039 | `src/domains/test-execution/services/test-executor.ts` | CRITICAL |
| 1,024 | `src/domains/requirements-validation/services/product-factors-assessment/product-factors-service.ts` | HIGH |
| 1,012 | `src/adapters/a2ui/catalog/standard-catalog.ts` | MEDIUM |
| 985 | `src/domains/visual-accessibility/services/axe-core-integration.ts` | MEDIUM |
| 975 | `src/learning/dream/concept-graph.ts` | MEDIUM |
| 969 | `src/learning/pattern-lifecycle.ts` | MEDIUM |
| 955 | `src/learning/sqlite-persistence.ts` | HIGH |
| 944 | `src/integrations/agentic-flow/reasoning-bank/pattern-evolution.ts` | MEDIUM |
| 942 | `src/init/kiro-installer.ts` | MEDIUM |
| 927 | `src/learning/dream/insight-generator.ts` | MEDIUM |
| 919 | `src/integrations/agentic-flow/reasoning-bank/experience-replay.ts` | MEDIUM |

### Priority Test Creation Targets

**Tier 1 -- Immediate (CRITICAL risk, high LOC, core functionality)**:
1. `src/domains/test-execution/services/test-executor.ts` (1,039 lines) -- Core test runner with zero coverage
2. `src/mcp/http-server.ts` (1,137 lines) -- MCP HTTP transport, security-sensitive
3. `src/mcp/protocol-server.ts` (1,124 lines) -- MCP protocol handling, security-sensitive
4. `src/domains/requirements-validation/qcsd-refinement-plugin.ts` (1,861 lines) -- Largest untested file

**Tier 2 -- High Priority (HIGH risk, large files)**:
5. `src/domains/requirements-validation/qcsd-ideation-plugin.ts` (1,699 lines)
6. `src/domains/test-generation/services/pattern-matcher.ts` (1,769 lines)
7. `src/learning/qe-unified-memory.ts` (1,271 lines) -- Handles 150K+ records
8. `src/learning/sqlite-persistence.ts` (955 lines) -- Data persistence layer

---

## 8. Delta Summary: v3.7.0 vs v3.7.10

| Metric | v3.7.0 | v3.7.10 | Change | Assessment |
|--------|--------|---------|--------|------------|
| Test files | 590 | 623 | +33 | Moderate growth |
| Test cases | 7,031 | 18,700 | +11,669 (+166%) | Major growth |
| Unit % | 70.7% | 75.0% | +4.3pp | Improved |
| E2E files | 18 | 10 | -8 | REGRESSED |
| E2E % | 3.1% | 0.3% | -2.8pp | REGRESSED |
| Security test files | 27 | 15 | -12* | Needs verification |
| Fake timer coverage | 13.8% | 10.3% | -3.5pp | REGRESSED |
| Timing-dependent src files | 199 | 419 | +220 | WORSE |
| Missing afterEach cleanup | 104 | 105 | +1 | Unchanged |
| Test files > 1,000 lines | 39 | 39 | 0 | Unchanged |
| test-execution coverage | 13% | 24% | +11pp | Improved but CRITICAL |
| requirements-validation coverage | 27% | 38% | +11pp | Improved but AT RISK |
| enterprise-integration coverage | 11% | 11% | 0 | Unchanged, CRITICAL |
| Source files | ~900 | 1,074 | +174 | Growth outpacing tests |

*Security test file count difference may be due to different counting methodology between reports. The v3.7.10 count includes only files with "security", "oauth", or "auth" in the filename.

---

## 9. Risk Assessment & Recommendations

### HIGH-RISK Items Requiring Immediate Action

1. **Enterprise-integration domain at 11% coverage** -- unchanged since v3.7.0. Create tests for the 9 source files, prioritizing the coordinator and any external API adapters.

2. **Test-execution domain at 24% coverage** -- the `test-executor.ts` (1,039 lines) is the core engine of the project and has zero direct test coverage. This is the single highest-risk gap.

3. **Fake timer coverage at 10.3%** -- 419 source files use timing constructs but only 43 test files use fake timers. Every test touching timing-dependent code without fake timers is a flake candidate.

4. **MCP server files untested** -- `http-server.ts` (1,137 lines) and `protocol-server.ts` (1,124 lines) handle all MCP transport. These are security-critical and externally exposed.

### MODERATE-RISK Items

5. **105 files missing afterEach cleanup** -- Resource leaks accumulate across sequential test execution. Add cleanup stubs.

6. **107 files using `as any`** -- Type-unsafe test code can mask real type errors. Reduce by 50% through proper mock typing.

7. **107 files using unseeded `Math.random`** -- Non-deterministic tests. Seed all random values or use deterministic fixtures.

8. **E2E test count at 54 cases** -- For a project with 13 bounded contexts and MCP/CLI dual interfaces, 54 E2E tests is insufficient. Target 200+.

### LOW-RISK / Improvement Opportunities

9. **Property-based testing** -- Expand fast-check from 8 files to cover data transformation and parsing functions.
10. **Mutation testing** -- Introduce Stryker for kernel and shared modules to validate test kill ratios.
11. **39 test files > 1,000 lines** -- Split into focused test modules. Each describe block should be its own file when tests exceed 500 lines.

---

## 10. Projected Coverage Impact

If the top 8 untested files receive test coverage:

| Action | Files Covered | Projected Coverage Lift |
|--------|---------------|------------------------|
| Test test-executor.ts | 1 | test-execution: 24% -> 28% |
| Test MCP servers | 2 | mcp: 54% -> 57% |
| Test QCSD plugins | 2 | requirements-validation: 38% -> 46% |
| Test pattern-matcher.ts | 1 | test-generation: 76% -> 79% |
| Test enterprise-integration | 8 remaining | enterprise-integration: 11% -> ~50% |
| Add fake timers to 40 test files | 40 | fake-timer coverage: 10.3% -> 19.8% |

**Combined effect**: Overall test-to-source ratio would improve from 0.58 to approximately 0.63, and the three critical domains would all rise above the 30% threshold.

---

*Report generated by qe-coverage-gap-analyzer for AQE v3.7.10*
*Analysis based on static file inventory and pattern matching -- runtime coverage data from `vitest --coverage` recommended for precise line-level metrics.*
