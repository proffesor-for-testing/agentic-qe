# Test Quality & Coverage Analysis Report - AQE v3.8.3

**Date**: 2026-03-19
**Baseline**: v3.7.10 (623 test files, 18,700 test cases, 0.58 test-to-source ratio)
**Scope**: Full test inventory, pyramid health, domain coverage, quality indicators, gap analysis

---

## Executive Summary

The AQE test suite continues to grow in v3.8.3, with test files increasing from 623 to 689 (+10.6%) and test cases rising from 18,700 to 20,431 (+9.3%). The test-to-source ratio has recovered from 0.58 to 0.61 -- a meaningful improvement indicating test creation is now outpacing source file growth. The test pyramid shape remains healthy with 75.8% unit tests. The most significant improvement is in E2E coverage, which surged from 54 to 327 test cases (+505%), driven by the addition of the sauce-demo spec suite and new platform E2E tests. However, the three critically undercovered domains persist: enterprise-integration (9%, regressed from 11%), test-execution (21%, regressed from 24%), and requirements-validation (26%, regressed from 38%). These regressions are driven by source file growth without corresponding test additions. Fake timer adoption remains stagnant at 9.5% (down from 10.3%), and files missing `afterEach` cleanup have increased from 105 to 128 -- a concerning 22% rise. Test file bloat has worsened, with 44 files now exceeding 1,000 lines (up from 39).

---

## 1. Test File Inventory

### Overall Counts

| Metric | v3.7.10 | v3.8.3 | Delta |
|--------|---------|--------|-------|
| Test files | 623 | 689 | +66 (+10.6%) |
| Test cases (it/test blocks) | 18,700 | 20,431 | +1,731 (+9.3%) |
| Source files (non-test .ts) | 1,074 | 1,138 | +64 (+6.0%) |
| Test-to-source ratio | 0.58 | 0.61 | +0.03 (improved) |
| Total test lines | 330,853 | 360,970 | +30,117 (+9.1%) |

### Breakdown by Directory

| Category | v3.7.10 Files | v3.8.3 Files | v3.7.10 Cases | v3.8.3 Cases | % of Total Cases |
|----------|--------------|-------------|--------------|-------------|-----------------|
| Unit (`tests/unit/`) | 434 | 476 | 14,025 | 15,495 | 75.8% |
| Integration (`tests/integration/`) | 104 | 111 | 2,183 | 2,444 | 12.0% |
| Integrations (`tests/integrations/`) | -- | 25 | 826 | 826 | 4.0% |
| Domains (`tests/domains/`) | 15 | 15 | 358 | 358 | 1.8% |
| Coordination (`tests/coordination/`) | 13 | 13 | 326 | 326 | 1.6% |
| E2E (`tests/e2e/`) | 10 | 19 | 54 | 327 | 1.6% |
| Security (`tests/security/`) | 15* | 1 | 44+ | 44 | 0.2% |
| Load (`tests/load/`) | 1 | 1 | 58 | 58 | 0.3% |
| Learning (`tests/learning/`) | 4 | 4 | 48 | 48 | 0.2% |
| Hooks (`tests/hooks/`) | 3 | 3 | 67 | 67 | 0.3% |
| Benchmarks (`tests/benchmarks/`) | 8 | 4 | 58 | 58 | 0.3% |
| Strange-loop (`tests/strange-loop/`) | -- | 1 | 37 | 37 | 0.2% |
| Kernel (`tests/kernel/`) | 1 | 1 | 24 | 24 | 0.1% |
| Validation (`tests/validation/`) | 3 | 3 | 20 | 20 | 0.1% |
| Shared (`tests/shared/`) | -- | 4 | -- | 86 | 0.4% |
| Agents (`tests/agents/`) | -- | 1 | -- | 33 | 0.2% |
| Routing (`tests/routing/`) | -- | 1 | -- | 26 | 0.1% |
| Fixtures (`tests/fixtures/`) | -- | 2 | -- | 11 | 0.1% |

*v3.7.10 security file count used a broader filename-matching methodology. The v3.8.3 count reflects files in the `tests/security/` directory only; 19 security-named test files exist across the entire test tree.

### File Size Distribution

| Size Category | v3.7.10 | v3.8.3 | Delta |
|---------------|---------|--------|-------|
| > 1,000 lines | 39 | 44 | +5 (WORSE) |
| > 500 lines | 285 | 313 | +28 (WORSE) |
| Total lines across all tests | 330,853 | 360,970 | +30,117 |

**44 test files exceeding 1,000 lines** (top 10 by size):

| Lines | File | New? |
|-------|------|------|
| 1,551 | `tests/integration/ruvector/phase4-differentiation.test.ts` | NEW |
| 1,501 | `tests/integrations/agentic-flow/onnx-embeddings.test.ts` | -- |
| 1,442 | `tests/unit/domains/enterprise-integration/coordinator.test.ts` | -- |
| 1,442 | `tests/unit/adapters/a2a/agent-cards.test.ts` | -- |
| 1,424 | `tests/integrations/vibium/vibium-client.test.ts` | -- |
| 1,421 | `tests/unit/adapters/ag-ui/event-adapter.test.ts` | -- |
| 1,411 | `tests/integration/learning/dream-scheduler.test.ts` | -- |
| 1,365 | `tests/unit/adapters/a2a/tasks.test.ts` | -- |
| 1,352 | `tests/unit/adapters/a2ui/accessibility.test.ts` | -- |
| 1,350 | `tests/strange-loop/coherence-integration.test.ts` | -- |

**5 new files crossed the 1,000-line threshold** since v3.7.10:

| Lines | File |
|-------|------|
| 1,551 | `tests/integration/ruvector/phase4-differentiation.test.ts` |
| 1,233 | `tests/integration/ruvector/phase3-safety.test.ts` |
| 1,183 | `tests/integration/ruvector/phase1-integration.test.ts` |
| 1,022 | `tests/integration/adapters/a2a/oauth-flow.integration.test.ts` |
| 1,006 | `tests/unit/domains/quality-assessment/coherence-gate.test.ts` |

Three of the five are RuVector integration test files, suggesting the RuVector integration added significant test volume without splitting into focused modules.

---

## 2. Test Pyramid Health

### Current Pyramid Shape

```
          /\
         /  \         E2E: 327 cases (1.6%)
        /    \
       /------\       Integration: 3,954 cases (19.4%)
      /        \      (integration + integrations + domains + coordination)
     /          \
    /            \
   /--------------\   Unit: 15,495 cases (75.8%)
  /________________\  Other: 655 cases (3.2%)
```

### Pyramid Ratios

| Layer | v3.7.0 | v3.7.10 | v3.8.3 | Ideal | Trend |
|-------|--------|---------|--------|-------|-------|
| Unit | 70.7% | 75.0% | 75.8% | 70-80% | Stable (healthy) |
| Integration | 26.2% | 20.0% | 19.4% | 15-25% | Stable (healthy) |
| E2E | 3.1% | 0.3% | 1.6% | 5-10% | IMPROVED (+1.3pp) |

### Assessment

- **Shape**: Healthy pyramid with strong unit base. The unit ratio at 75.8% is well within the ideal 70-80% range.
- **E2E recovery**: E2E test cases grew from 54 to 327 (+505%), the most significant improvement in this release. The addition of 9 sauce-demo spec files and 4 new platform E2E tests (agent-lifecycle, critical-user-journeys, platform-init, test-generation-flow) drove this improvement. Including e2e-named files across all directories raises the total to 219 dedicated E2E test cases from 14 files.
- **Remaining gap**: At 1.6%, E2E coverage is still below the ideal 5-10% range. The project would need approximately 700-1,000 additional E2E cases to reach the 5% threshold given current total case count.
- **Integration stability**: Integration layer at 19.4% remains healthy and within the 15-25% ideal range.

---

## 3. Coverage by Domain (13 Bounded Contexts)

### Domain Coverage Ratios

| Domain | Src Files (v3.7.10) | Src Files (v3.8.3) | Test Files (v3.8.3) | Ratio (v3.7.10) | Ratio (v3.8.3) | Status |
|--------|--------------------|--------------------|--------------------|-----------------|--------------------|--------|
| visual-accessibility | 15 | 18 | 18 | 113% | 100% | GOOD |
| defect-intelligence | 7 | 9 | 9 | 128% | 100% | GOOD |
| coverage-analysis | 11 | 13 | 12 | 109% | 92% | GOOD |
| chaos-resilience | 6 | 8 | 5 | 83% | 63% | MODERATE (down from GOOD) |
| code-intelligence | 14 | 18 | 11 | 78% | 61% | MODERATE (down from GOOD) |
| test-generation | 34 | 42 | 26 | 76% | 62% | MODERATE (down from GOOD) |
| contract-testing | 6 | 8 | 5 | 83% | 63% | MODERATE (down from GOOD) |
| learning-optimization | 11 | 13 | 6 | 54% | 46% | MODERATE |
| quality-assessment | 15 | 18 | 8 | 53% | 44% | MODERATE |
| security-compliance | 21 | 24 | 10 | 47% | 42% | MODERATE |
| requirements-validation | 26 | 38 | 10 | 38% | 26% | CRITICAL (down from AT RISK) |
| test-execution | 25 | 29 | 6 | 24% | 21% | CRITICAL |
| enterprise-integration | 9 | 11 | 1 | 11% | 9% | CRITICAL (WORSE) |

### Critical Observation: Source Growth Outpacing Tests in Domains

Across all 13 domains, source files grew from 200 to 249 (+49 files, +24.5%) while test file counts remained largely static. This caused broad coverage ratio regression. The three most concerning:

1. **enterprise-integration (9%, down from 11%)** -- Source files grew from 9 to 11, still only 1 test file. Now three releases with effectively zero progress. This is the longest-standing critical gap in the project.

2. **test-execution (21%, down from 24%)** -- Source files grew from 25 to 29. Still only 6 test files. The core `test-executor.ts` (1,039 lines) remains completely untested.

3. **requirements-validation (26%, down from 38%)** -- Source files surged from 26 to 38 (+46%). Test files unchanged at 10. The three largest untested files in the entire project belong to this domain (1,861, 1,699, and 1,224 lines).

4. **chaos-resilience, code-intelligence, contract-testing, test-generation** -- All four domains dropped from GOOD to MODERATE status due to source file growth without corresponding test additions.

### Coverage by Non-Domain Module

| Module | Src Files (v3.7.10) | Src Files (v3.8.3) | Test Files (v3.8.3) | Ratio (v3.7.10) | Ratio (v3.8.3) | Trend |
|--------|--------------------|--------------------|--------------------|-----------------|--------------------|-------|
| validation | 3 | 9 | 9 | 633% | 100% | Normalized |
| memory | 8 | 10 | 7 | 225% | 70% | Down |
| governance | -- | 18 | 19 | -- | 106% | NEW |
| routing | 10 | 18 | 13 | 150% | 72% | Down |
| hooks | 5 | 6 | 5 | 140% | 83% | Down |
| learning | 29 | 33 | 29 | 124% | 88% | Down |
| performance | 5 | 6 | 1 | 100% | 17% | CRITICAL drop |
| sync | 11 | 16 | 10 | 100% | 63% | Down |
| workers | 15 | 18 | 14 | 93% | 78% | Down |
| kernel | 18 | 20 | 15 | 77% | 75% | Stable |
| planning | 4 | 5 | 3 | 75% | 60% | Down |
| agents | 8 | 14 | 4 | 75% | 29% | CRITICAL drop |
| adapters | 59 | 75 | 40 | 67% | 53% | Down |
| coordination | 90 | 116 | 63 | 64% | 54% | Down |
| cli | 50 | 60 | 21 | 58% | 35% | Down |
| init | 46 | 45 | 24 | 58% | 53% | Stable |
| integrations | 105 | 145 | 67 | 54% | 46% | Down |
| mcp | 77 | 100 | 41 | 54% | 41% | Down |
| shared | 54 | 74 | 28 | 53% | 38% | Down |
| monitoring | 1 | 1 | 0 | 0% | 0% | Unchanged |
| workflows | 1 | 2 | 0 | 0% | 0% | Unchanged |
| migrations | 1 | 1 | 0 | 0% | 0% | Unchanged |

**Key concern**: The `agents` module dropped from 75% to 29% (source grew from 8 to 14 files, tests stayed at 4). The `performance` module dropped from 100% to 17% (6 source files, only 1 test file). The `cli` module dropped from 58% to 35%.

---

## 4. Test Quality Indicators

### Timer & Async Safety

| Indicator | v3.7.0 | v3.7.10 | v3.8.3 | Trend |
|-----------|--------|---------|--------|-------|
| Source files with timing deps | 199 | 419 | 455 | +36 (WORSE) |
| Test files using `vi.useFakeTimers` | ~28 | 43 | 43 | 0 (STAGNANT) |
| Fake timer coverage % | 13.8% | 10.3% | 9.5% | REGRESSED |

**Assessment**: Timing-dependent source files continue to grow (455, up from 419) while fake timer adoption in tests is completely stagnant at 43 files. The coverage ratio has dropped to 9.5%, the worst it has been across the three measured releases. This remains the single largest flake risk factor. Zero new test files adopted `vi.useFakeTimers` between v3.7.10 and v3.8.3.

### Cleanup & Isolation

| Indicator | v3.7.0 | v3.7.10 | v3.8.3 | Trend |
|-----------|--------|---------|--------|-------|
| Files missing `afterEach` (with `beforeEach`) | 104 | 105 | 128 | +23 (WORSE) |
| Files with `vi.restoreAllMocks` | -- | 204 | 141 | -63 (WORSE) |
| Files with `afterAll` | -- | 56 | 45 | -11 |

**Assessment**: The cleanup situation has deteriorated significantly. 128 test files now set up state in `beforeEach` but never clean up in `afterEach` (up from 105, a 22% increase). Additionally, `vi.restoreAllMocks` usage dropped from 204 to 141, suggesting new test files are being added without proper mock cleanup. This creates state leakage risk in sequential test execution (maxForks=1).

### Type Safety in Tests

| Indicator | v3.7.10 | v3.8.3 | Trend |
|-----------|---------|--------|-------|
| Files using `as any` | 107 | 102 | -5 (slight improvement) |
| Files with `Math.random` (no seed) | 107 | 101 | -6 (slight improvement) |

**Assessment**: Minor improvement in both metrics. 102 test files still use `as any` type assertions, and 101 use unseeded `Math.random()`. The reductions are likely from archived/removed test files rather than active remediation.

### Assertion Quality

| Indicator | v3.7.10 | v3.8.3 | Trend |
|-----------|---------|--------|-------|
| Files with zero assertions | 0 | 0 | Stable (good) |
| Files using `setTimeout` in tests | 165 | 80 | -85 (IMPROVED) |
| Files with retry/flaky indicators | 181 | 319 | +138 (WORSE) |
| Snapshot tests | 0 | 1 | +1 (minimal) |

**Assessment**: A mixed picture. The reduction of `setTimeout` usage in tests from 165 to 80 is a strong positive signal, suggesting test authors are moving away from time-dependent test patterns. However, the explosion of retry/flaky indicators from 181 to 319 (+76%) is alarming -- this includes `.skip`, `retry`, `flaky`, `xdescribe`, and similar markers. The increase suggests either growing test instability or increased use of skip-to-pass workarounds.

---

## 5. Missing Test Categories

| Category | v3.7.10 | v3.8.3 | Notes |
|----------|---------|--------|-------|
| Property-based tests (fast-check) | 8 files (PARTIAL) | 1 file (REGRESSED) | Only `agent-cards.test.ts` references fast-check. No `fast-check` in package.json dependencies. |
| Mutation testing (Stryker) | ABSENT | ABSENT | 15 references exist in code but none are actual Stryker test infrastructure. No `stryker.conf` found. |
| Contract tests | 138 refs (PRESENT) | 61 test files (PRESENT) | Healthy contract testing via dedicated domain. |
| Accessibility tests | 288 refs (PRESENT) | 167 test files (PRESENT) | Strong via visual-accessibility domain and a2ui adapter. |
| Visual regression | 194 refs (PARTIAL) | 47 test files (PARTIAL) | References exist but no dedicated visual diff tooling (Percy/Chromatic). |
| Load/stress tests | 2 files (MINIMAL) | 5 files (IMPROVED) | Load + benchmark test files. Still insufficient for production workloads. |
| Snapshot tests | 0 (ABSENT) | 1 file (MINIMAL) | Single file: `jest-rn-generator.test.ts`. No systematic snapshot adoption. |

### Recommendations for Missing Categories

1. **Property-based testing**: The regression from 8 files to 1 is concerning. Re-assess whether fast-check was removed intentionally. Add property-based tests for `requirements-validation` parsers, `routing` score calculations, and data transformation functions.
2. **Mutation testing**: Three consecutive releases with no Stryker adoption. Integrate with at least `kernel` and `shared` modules to validate test kill ratios.
3. **Load testing**: While files increased from 2 to 5, dedicated load testing for MCP server throughput, memory operations under concurrent load, and agent fleet scaling is still missing.
4. **Snapshot tests**: Consider `toMatchInlineSnapshot()` for MCP response format validation and CLI output stabilization.

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
| Test isolation | `AQE_PROJECT_ROOT` set to temp dir | Good -- prevents test writes to production memory.db |

**Change from v3.7.10**: The vitest config now sets `AQE_PROJECT_ROOT` to a per-PID temp directory, ensuring tests never write to the production `.agentic-qe/memory.db`. This is a meaningful infrastructure improvement for data protection.

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

| Workflow | Trigger | Scope | Status |
|----------|---------|-------|--------|
| `mcp-tools-test.yml` | Push to main (src/mcp/**) | MCP unit tests | Active |
| `optimized-ci.yml` | General CI | Full test suite | Active |
| `sauce-demo-e2e.yml` | E2E trigger | Browser E2E | Active |
| `coherence.yml` | Coherence changes | Strange-loop tests | Active |
| `benchmark.yml` | Performance changes | Benchmark suite | Active |
| `skill-validation.yml` | Skill changes | Skill tests | Active |
| `n8n-workflow-ci.yml` | n8n changes | n8n workflow validation | NEW |
| `qcsd-production-trigger.yml` | Production trigger | QCSD production pipeline | NEW |
| `npm-publish.yml` | Release published | npm publish workflow | Active |

**New in v3.8.3**: Two new CI workflows added. The `n8n-workflow-ci.yml` validates n8n workflow definitions. The `qcsd-production-trigger.yml` provides production pipeline triggering.

**Persisting gap**: No dedicated CI workflow for security tests, load tests, or integration tests as separate jobs. All run under `optimized-ci.yml` without isolation.

---

## 7. Top 25 Largest Untested Source Files

These are the largest source files with no corresponding test file found:

| Lines | File | Risk | Domain | v3.7.10 |
|-------|------|------|--------|---------|
| 1,861 | `src/domains/requirements-validation/qcsd-refinement-plugin.ts` | CRITICAL | requirements-validation | Listed |
| 1,769 | `src/domains/test-generation/services/pattern-matcher.ts` | HIGH | test-generation | Listed |
| 1,699 | `src/domains/requirements-validation/qcsd-ideation-plugin.ts` | CRITICAL | requirements-validation | Listed |
| 1,325 | `src/governance/evolution-pipeline-integration.ts` | MEDIUM | governance | Listed (was 1,260) |
| 1,324 | `src/mcp/protocol-server.ts` | CRITICAL | mcp | Listed (was 1,124) |
| 1,279 | `src/governance/shard-retriever-integration.ts` | MEDIUM | governance | Listed (was 1,219) |
| 1,245 | `src/learning/sqlite-persistence.ts` | HIGH | learning | Listed (was 955) |
| 1,236 | `src/learning/qe-unified-memory.ts` | HIGH | learning | Listed (was 1,271) |
| 1,226 | `src/adapters/a2ui/catalog/component-schemas.ts` | MEDIUM | adapters | Listed |
| 1,224 | `src/domains/requirements-validation/services/product-factors-assessment/analyzers/brutal-honesty-analyzer.ts` | HIGH | requirements-validation | Listed |
| 1,140 | `src/domains/requirements-validation/services/product-factors-assessment/formatters/html-formatter.ts` | MEDIUM | requirements-validation | Listed |
| 1,137 | `src/mcp/http-server.ts` | CRITICAL | mcp | Listed |
| 1,089 | `src/learning/pattern-lifecycle.ts` | MEDIUM | learning | Listed (was 969) |
| 1,079 | `src/adapters/a2ui/accessibility/wcag-validator.ts` | MEDIUM | adapters | Listed |
| 1,061 | `src/domains/test-execution/types/e2e-step.types.ts` | LOW | test-execution | Listed |
| 1,042 | `src/cli/utils/workflow-parser.ts` | MEDIUM | cli | Listed |
| 1,039 | `src/domains/test-execution/services/test-executor.ts` | CRITICAL | test-execution | Listed |
| 1,024 | `src/domains/requirements-validation/services/product-factors-assessment/product-factors-service.ts` | HIGH | requirements-validation | Listed |
| 1,012 | `src/adapters/a2ui/catalog/standard-catalog.ts` | MEDIUM | adapters | Listed |
| 1,001 | `src/governance/adversarial-defense-integration.ts` | MEDIUM | governance | NEW |
| 985 | `src/domains/visual-accessibility/services/axe-core-integration.ts` | MEDIUM | visual-accessibility | Listed |
| 975 | `src/learning/dream/concept-graph.ts` | MEDIUM | learning | Listed |
| 949 | `src/init/kiro-installer.ts` | MEDIUM | init | Listed (was 942) |
| 944 | `src/integrations/agentic-flow/reasoning-bank/pattern-evolution.ts` | MEDIUM | integrations | Listed |
| 927 | `src/learning/dream/insight-generator.ts` | MEDIUM | learning | Listed |

### Key Observations

- **Zero files removed from the list since v3.7.10**. All 25 files from v3.7.10 remain untested. This means no test creation effort targeted these high-risk gaps.
- **Several files grew larger**: `protocol-server.ts` grew from 1,124 to 1,324 lines (+200), `sqlite-persistence.ts` from 955 to 1,245 lines (+290), `evolution-pipeline-integration.ts` from 1,260 to 1,325 lines (+65). Growing untested files represent accelerating risk.
- **1 new file entered the list**: `adversarial-defense-integration.ts` (1,001 lines) in the governance module.

### Priority Test Creation Targets

**Tier 1 -- Immediate (CRITICAL risk, high LOC, core functionality)**:
1. `src/domains/test-execution/services/test-executor.ts` (1,039 lines) -- Core test runner, zero coverage, three releases running
2. `src/mcp/protocol-server.ts` (1,324 lines) -- MCP protocol handling, security-sensitive, grew 200 lines without tests
3. `src/mcp/http-server.ts` (1,137 lines) -- MCP HTTP transport, externally exposed
4. `src/domains/requirements-validation/qcsd-refinement-plugin.ts` (1,861 lines) -- Largest untested file in project

**Tier 2 -- High Priority (HIGH risk, large files)**:
5. `src/domains/requirements-validation/qcsd-ideation-plugin.ts` (1,699 lines)
6. `src/domains/test-generation/services/pattern-matcher.ts` (1,769 lines)
7. `src/learning/sqlite-persistence.ts` (1,245 lines) -- Data persistence layer, grew 30% since v3.7.10
8. `src/learning/qe-unified-memory.ts` (1,236 lines) -- Handles 150K+ records

---

## 8. Delta Summary: v3.7.10 vs v3.8.3

| Metric | v3.7.10 | v3.8.3 | Change | Assessment |
|--------|---------|--------|--------|------------|
| Test files | 623 | 689 | +66 (+10.6%) | Healthy growth |
| Test cases | 18,700 | 20,431 | +1,731 (+9.3%) | Moderate growth |
| Source files | 1,074 | 1,138 | +64 (+6.0%) | Test growth outpacing source |
| Test-to-source ratio | 0.58 | 0.61 | +0.03 | IMPROVED |
| Unit % | 75.0% | 75.8% | +0.8pp | Stable |
| Integration % | 20.0% | 19.4% | -0.6pp | Stable |
| E2E cases | 54 | 327 | +273 (+505%) | MAJOR IMPROVEMENT |
| E2E % | 0.3% | 1.6% | +1.3pp | IMPROVED (still below 5%) |
| E2E files (tests/e2e/) | 10 | 19 | +9 | IMPROVED |
| Security test files (by name) | 15 | 19 | +4 | IMPROVED |
| Fake timer coverage | 10.3% | 9.5% | -0.8pp | REGRESSED |
| Timing-dependent src files | 419 | 455 | +36 | WORSE |
| Files using vi.useFakeTimers | 43 | 43 | 0 | STAGNANT |
| Missing afterEach cleanup | 105 | 128 | +23 | WORSE |
| vi.restoreAllMocks usage | 204 | 141 | -63 | WORSE |
| Files using `as any` | 107 | 102 | -5 | Slight improvement |
| Files using unseeded Math.random | 107 | 101 | -6 | Slight improvement |
| Files with setTimeout in tests | 165 | 80 | -85 | IMPROVED |
| Files with retry/flaky indicators | 181 | 319 | +138 | WORSE |
| Test files > 1,000 lines | 39 | 44 | +5 | WORSE |
| Test files > 500 lines | 285 | 313 | +28 | WORSE |
| enterprise-integration coverage | 11% | 9% | -2pp | CRITICAL (regressed) |
| test-execution coverage | 24% | 21% | -3pp | CRITICAL (regressed) |
| requirements-validation coverage | 38% | 26% | -12pp | CRITICAL (regressed) |
| Property-based test files | 8 | 1 | -7 | REGRESSED |
| Total test lines | 330,853 | 360,970 | +30,117 | Growth |

---

## 9. Risk Assessment & Recommendations

### HIGH-RISK Items Requiring Immediate Action

1. **All three critical domains regressed in coverage** -- enterprise-integration (11% -> 9%), test-execution (24% -> 21%), and requirements-validation (38% -> 26%) all got worse. Source files are being added to these domains without any test accompaniment. A policy of "no source merge without test" should be enforced for these three domains.

2. **128 files missing afterEach cleanup (up 22%)** -- This is an accelerating problem. New test files are being written without cleanup discipline. Combined with the drop in `vi.restoreAllMocks` usage (204 -> 141), state leakage risk is growing. Consider adding a lint rule requiring `afterEach` in any file that uses `beforeEach`.

3. **Fake timer coverage at historic low (9.5%)** -- 455 timing-dependent source files, 43 test files with fake timers, zero new adoptions. This must be addressed with a dedicated effort. Recommend a team convention: any test file touching timing-dependent code MUST use `vi.useFakeTimers()`.

4. **MCP server files untested and growing** -- `protocol-server.ts` grew to 1,324 lines (+200 since v3.7.10) and `http-server.ts` remains at 1,137 lines. Both are security-critical, externally exposed, and have zero test coverage.

5. **Zero top-25 untested files addressed** -- All 25 files from the v3.7.10 report remain untested. Several grew larger. This suggests gap reports are not being actioned.

### MODERATE-RISK Items

6. **Retry/flaky indicators exploded (+76%)** -- 319 files now contain retry, skip, or flaky markers (up from 181). Investigate whether this reflects genuine instability or a skip-to-pass culture. Run `vitest --reporter=verbose 2>&1 | grep -c "skip"` to count actively skipped tests.

7. **Property-based testing regressed** -- From 8 files to 1. If fast-check was removed, re-evaluate. Property-based tests are the most cost-effective way to find edge cases in data transformation code.

8. **Test file bloat increasing** -- 44 files over 1,000 lines (up from 39), 313 files over 500 lines (up from 285). The RuVector integration alone added 3 files over 1,000 lines. Establish a 500-line soft limit with CI warnings.

9. **Four domains dropped from GOOD to MODERATE** -- chaos-resilience, code-intelligence, contract-testing, and test-generation all regressed due to source growth. While not yet critical, the trend needs reversal.

### LOW-RISK / Improvement Opportunities

10. **Mutation testing** -- Three releases with no Stryker adoption. If test effectiveness validation is a goal, this needs a champion.
11. **Snapshot tests** -- Still effectively absent (1 file). Useful for stabilizing MCP response formats and CLI output.
12. **Load testing** -- Improved from 2 to 5 files but still insufficient. Target MCP throughput, concurrent memory operations, and fleet scaling scenarios.
13. **Dedicated CI workflows** -- Security tests, load tests, and integration tests still lack isolated CI workflows. Separating them would improve failure diagnosis and enable targeted re-runs.

---

## 10. Projected Coverage Impact

If the top 8 untested files receive test coverage:

| Action | Files Covered | Projected Coverage Lift |
|--------|---------------|------------------------|
| Test test-executor.ts | 1 | test-execution: 21% -> 24% |
| Test MCP servers (protocol + http) | 2 | mcp: 41% -> 44% |
| Test QCSD plugins (refinement + ideation) | 2 | requirements-validation: 26% -> 31% |
| Test pattern-matcher.ts | 1 | test-generation: 62% -> 64% |
| Test enterprise-integration (10 remaining) | 10 | enterprise-integration: 9% -> ~50% |
| Test sqlite-persistence.ts + qe-unified-memory.ts | 2 | learning: 88% -> 94% |
| Add fake timers to 40 test files | 40 | fake-timer coverage: 9.5% -> 18.2% |
| Add afterEach to 50 test files | 50 | missing cleanup: 128 -> 78 |

**Combined effect**: Overall test-to-source ratio would improve from 0.61 to approximately 0.66. The three critical domains would all rise above the 25% threshold, with requirements-validation crossing 30%. The cleanup deficit would drop by 40%.

---

## 11. Trend Analysis (v3.7.0 -> v3.7.10 -> v3.8.3)

| Metric | v3.7.0 | v3.7.10 | v3.8.3 | 3-Release Trend |
|--------|--------|---------|--------|-----------------|
| Test files | 590 | 623 | 689 | Steady growth (+17%) |
| Test cases | 7,031 | 18,700 | 20,431 | Growth decelerating |
| Test-to-source ratio | 0.66 | 0.58 | 0.61 | V-shaped recovery |
| E2E cases | ~218* | 54 | 327 | V-shaped recovery |
| Fake timer coverage | 13.8% | 10.3% | 9.5% | Continuous decline |
| Missing afterEach | 104 | 105 | 128 | Accelerating problem |
| enterprise-integration | 11% | 11% | 9% | Continuous decline |
| test-execution | 13% | 24% | 21% | Peaked at v3.7.10 |
| requirements-validation | 27% | 38% | 26% | Peaked at v3.7.10 |
| Files > 1,000 lines | 39 | 39 | 44 | Growing |

*v3.7.0 E2E estimate based on 3.1% of 7,031 total cases.

**Three persistent problems across all three releases**:
1. Fake timer coverage declining every release
2. Enterprise-integration domain declining every release
3. Cleanup discipline (afterEach) deteriorating every release

These are structural quality issues that will not self-correct without deliberate intervention.

---

*Report generated by qe-coverage-specialist for AQE v3.8.3*
*Analysis based on static file inventory and pattern matching against 689 test files and 1,138 source files. Runtime coverage data from `vitest --coverage` recommended for precise line-level metrics.*
