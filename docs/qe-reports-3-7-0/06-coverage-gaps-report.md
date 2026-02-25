# Coverage Gap Analysis Report -- AQE v3.7.0

**Date**: 2026-02-23
**Analyzer**: Coverage Gap Analyzer (qe-coverage-gap-analyzer)
**Codebase**: /workspaces/agentic-qe-new/v3/src/
**Tests**: /workspaces/agentic-qe-new/v3/tests/

---

## Executive Summary

| Metric | v3.6.8 Baseline | v3.7.0 Current | Delta |
|--------|----------------|----------------|-------|
| Total source files | 752 | 1,002 | +250 (+33%) |
| Total test files | ~449 | 590 | +141 (+31%) |
| Modules without unit tests | 10 | 9 | -1 |
| Total source LOC | ~350K (est.) | 489,405 | +~140K |
| File-level coverage (approx) | 62% | 59% | -3pp |

The codebase grew substantially from v3.6.8 to v3.7.0 (+250 source files, +~140K LOC). While 141 new test files were added, test creation did not keep pace with source growth. The overall file-level coverage ratio declined slightly from 62% to approximately 59%. Three previously untested modules (governance, hooks, agents) now have unit tests -- a significant improvement. However, 9 modules still lack any unit test directory, and the domains layer (127K LOC) remains the single largest coverage gap.

---

## 1. Module-Level Coverage Analysis

### All Modules: Source Files vs Unit Test Files

| Module | Source Files | Unit Tests | Gap | Test:Source Ratio | LOC |
|--------|-------------|------------|-----|-------------------|-----|
| adapters | 75 | 37 | 38 | 0.49 | 42,456 |
| agents | 12 | 3 | 9 | 0.25 | 4,712 |
| audit | 1 | 1 | 0 | 1.00 | 383 |
| benchmarks | 2 | 0 | 2 | 0.00 | 969 |
| causal-discovery | 5 | 4 | 1 | 0.80 | 2,060 |
| cli | 54 | 16 | 38 | 0.30 | 21,653 |
| coordination | 95 | 37 | 58 | 0.39 | 50,621 |
| coverage | 0 | 0 | 0 | N/A | 0 |
| domains | 230 | 91 | 139 | 0.40 | 127,187 |
| early-exit | 6 | 5 | 1 | 0.83 | 2,387 |
| feedback | 7 | 5 | 2 | 0.71 | 2,968 |
| governance | 16 | 5 | 11 | 0.31 | 13,360 |
| hooks | 6 | 2 | 4 | 0.33 | 2,057 |
| init | 39 | 15 | 24 | 0.38 | 11,178 |
| integrations | 119 | 28 | 91 | 0.24 | 60,966 |
| kernel | 19 | 13 | 6 | 0.68 | 6,623 |
| learning | 30 | 18 | 12 | 0.60 | 23,300 |
| logging | 4 | 3 | 1 | 0.75 | 785 |
| mcp | 91 | 35 | 56 | 0.38 | 38,640 |
| memory | 10 | 7 | 3 | 0.70 | 3,238 |
| migration | 1 | 0 | 1 | 0.00 | 323 |
| migrations | 1 | 0 | 1 | 0.00 | 129 |
| monitoring | 1 | 0 | 1 | 0.00 | 309 |
| neural-optimizer | 6 | 4 | 2 | 0.67 | 2,734 |
| optimization | 8 | 6 | 2 | 0.75 | 4,100 |
| performance | 6 | 1 | 5 | 0.17 | 2,931 |
| planning | 5 | 2 | 3 | 0.40 | 3,972 |
| routing | 9 | 7 | 2 | 0.78 | 4,719 |
| shared | 67 | 24 | 43 | 0.36 | 25,853 |
| skills | 2 | 0 | 2 | 0.00 | 946 |
| strange-loop | 19 | 10 | 9 | 0.53 | 8,033 |
| sync | 16 | 9 | 7 | 0.56 | 4,717 |
| testing | 5 | 0 | 5 | 0.00 | 2,224 |
| test-scheduling | 8 | 3 | 5 | 0.38 | 2,810 |
| types | 2 | 0 | 2 | 0.00 | 204 |
| validation | 4 | 2 | 2 | 0.50 | 2,770 |
| workers | 17 | 13 | 4 | 0.76 | 6,178 |
| workflows | 2 | 0 | 2 | 0.00 | 486 |

**Overall test-to-source ratio**: 590 / 1,002 = **0.59**

---

## 2. Modules Without Unit Test Directories

Nine modules under `v3/src/` have no corresponding directory in `v3/tests/unit/`:

| Module | Source Files | LOC | Risk Level | Notes |
|--------|-------------|-----|------------|-------|
| testing | 5 | 2,224 | HIGH | Ironic: the test framework itself is untested |
| benchmarks | 2 | 969 | LOW | Performance benchmarks, less critical |
| skills | 2 | 946 | MEDIUM | Skill definitions affect runtime behavior |
| workflows | 2 | 486 | MEDIUM | Workflow orchestration logic |
| migration | 1 | 323 | MEDIUM | Data migration code -- errors lose data |
| monitoring | 1 | 309 | LOW | Observability infrastructure |
| types | 2 | 204 | LOW | Type definitions, mostly compile-time |
| migrations | 1 | 129 | MEDIUM | Schema migrations -- errors corrupt DB |
| coverage | 0 | 0 | N/A | Empty module placeholder |

**Total untested LOC across these modules**: 5,590

### Change from v3.6.8

Previously untested modules that **now have tests** (removed from gap list):
- **governance**: 5 unit tests added (was 0, had 13,360 LOC)
- **hooks**: 2 unit tests added (was 0, had 2,057 LOC)
- **agents**: 3 unit tests added (was 0, had 4,712 LOC)

Previously untested modules that **remain untested**:
- benchmarks, migration, migrations, testing, types, workflows

**New modules added to untested list in v3.7.0**:
- coverage (empty), monitoring, skills

---

## 3. File-Level Gaps in Tested Modules

For modules that DO have unit test directories, the following shows the gap between source files (excluding index.ts) and test files:

| Module | Source (non-index) | Tests | Gap | Coverage % |
|--------|-------------------|-------|-----|------------|
| **domains** | 184 | 91 | **93** | 49% |
| **integrations** | 98 | 28 | **70** | 29% |
| **coordination** | 79 | 37 | **42** | 47% |
| **mcp** | 71 | 35 | **36** | 49% |
| **cli** | 46 | 16 | **30** | 35% |
| **shared** | 48 | 24 | **24** | 50% |
| **adapters** | 59 | 37 | **22** | 63% |
| **init** | 35 | 15 | **20** | 43% |
| **learning** | 28 | 18 | **10** | 64% |
| **governance** | 15 | 5 | **10** | 33% |
| **agents** | 8 | 3 | **5** | 38% |
| **kernel** | 18 | 13 | **5** | 72% |

---

## 4. Critical Untested Code -- Top 30 Highest-Risk Files

Ranked by LOC (proxy for complexity). Domain criticality multiplier applied in the Risk Score column.

| Rank | File | LOC | Module | Risk Score | Priority |
|------|------|-----|--------|------------|----------|
| 1 | `domains/requirements-validation/qcsd-refinement-plugin.ts` | 1,861 | domains | **5,583** | P0 |
| 2 | `domains/test-generation/services/pattern-matcher.ts` | 1,769 | domains | **5,307** | P0 |
| 3 | `domains/requirements-validation/qcsd-ideation-plugin.ts` | 1,698 | domains | **5,094** | P0 |
| 4 | `coordination/protocols/security-audit.ts` | 1,642 | coordination | **4,926** | P0 |
| 5 | `cli/commands/hooks.ts` | 1,567 | cli | **3,134** | P0 |
| 6 | `domains/visual-accessibility/services/visual-regression.ts` | 1,498 | domains | **4,494** | P0 |
| 7 | `domains/test-execution/services/user-flow-generator.ts` | 1,336 | domains | **4,008** | P0 |
| 8 | `learning/real-qe-reasoning-bank.ts` | 1,335 | learning | **4,005** | P0 |
| 9 | `learning/qe-unified-memory.ts` | 1,271 | learning | **3,813** | P0 |
| 10 | `governance/evolution-pipeline-integration.ts` | 1,260 | governance | **3,780** | P0 |
| 11 | `adapters/a2ui/catalog/component-schemas.ts` | 1,226 | adapters | **2,452** | P1 |
| 12 | `domains/req-validation/.../brutal-honesty-analyzer.ts` | 1,224 | domains | **3,672** | P0 |
| 13 | `governance/shard-retriever-integration.ts` | 1,219 | governance | **3,657** | P0 |
| 14 | `integrations/browser/agent-browser/client.ts` | 1,209 | integrations | **3,627** | P0 |
| 15 | `cli/commands/learning.ts` | 1,142 | cli | **2,284** | P1 |
| 16 | `domains/req-validation/.../html-formatter.ts` | 1,140 | domains | **3,420** | P0 |
| 17 | `mcp/http-server.ts` | 1,131 | mcp | **3,393** | P0 |
| 18 | `mcp/protocol-server.ts` | 1,106 | mcp | **3,318** | P0 |
| 19 | `domains/test-generation/services/test-generator.ts` | 1,119 | domains | **3,357** | P0 |
| 20 | `adapters/a2ui/accessibility/wcag-validator.ts` | 1,079 | adapters | **2,158** | P1 |
| 21 | `domains/test-execution/types/e2e-step.types.ts` | 1,060 | domains | **2,120** | P1 |
| 22 | `cli/utils/workflow-parser.ts` | 1,042 | cli | **2,084** | P1 |
| 23 | `domains/test-execution/services/test-executor.ts` | 1,024 | domains | **3,072** | P0 |
| 24 | `domains/req-validation/.../product-factors-service.ts` | 1,024 | domains | **3,072** | P0 |
| 25 | `adapters/a2ui/catalog/standard-catalog.ts` | 1,012 | adapters | **2,024** | P1 |
| 26 | `domains/visual-accessibility/services/axe-core-integration.ts` | 985 | domains | **2,955** | P1 |
| 27 | `adapters/ag-ui/json-patch.ts` | 974 | adapters | **1,948** | P1 |
| 28 | `learning/pattern-lifecycle.ts` | 969 | learning | **2,907** | P1 |
| 29 | `agents/claim-verifier/interfaces.ts` | 963 | agents | **2,889** | P1 |
| 30 | `integrations/agentic-flow/reasoning-bank/pattern-evolution.ts` | 944 | integrations | **2,832** | P1 |

**Risk Score formula**: LOC x domain_criticality_multiplier
- domains, coordination, governance, mcp, learning: 3x (core QE logic)
- cli, integrations, agents: 2x (user-facing / external boundary)
- adapters, shared, init: 2x (infrastructure)
- others: 1x

---

## 5. Test-to-Source Ratio by Module

| Tier | Modules | Ratio Range |
|------|---------|-------------|
| Well-covered (>0.70) | audit (1.00), early-exit (0.83), causal-discovery (0.80), workers (0.76), optimization (0.75), logging (0.75), routing (0.78), kernel (0.72), feedback (0.71), memory (0.70) | 0.70 -- 1.00 |
| Partially covered (0.40--0.69) | neural-optimizer (0.67), learning (0.60), sync (0.56), strange-loop (0.53), validation (0.50), adapters (0.49), domains (0.40), coordination (0.39), planning (0.40) | 0.40 -- 0.69 |
| Under-covered (<0.40) | shared (0.36), mcp (0.38), init (0.38), test-scheduling (0.38), hooks (0.33), governance (0.31), cli (0.30), agents (0.25), integrations (0.24), performance (0.17) | 0.17 -- 0.39 |
| Zero coverage | benchmarks (0.00), migration (0.00), migrations (0.00), monitoring (0.00), skills (0.00), testing (0.00), types (0.00), workflows (0.00) | 0.00 |

**Weighted average ratio** (by LOC): approximately **0.42** -- below the 0.60 target.

---

## 6. New Coverage Since v3.6.8

### Modules That Gained Tests

| Module | v3.6.8 Unit Tests | v3.7.0 Unit Tests | New Tests | Status |
|--------|------------------|------------------|-----------|--------|
| **governance** | 0 | 5 | +5 | Now covered (33%) |
| **hooks** | 0 | 2 | +2 | Now covered (33%) |
| **agents** | 0 | 3 | +3 | Now covered (25%) |

### Specific Tests Added

**governance** (previously 13,334 LOC with zero tests):
- `ab-benchmarking.test.ts`
- `constitutional-enforcer.test.ts`
- `compliance-reporter.test.ts`
- `feature-flags.test.ts`
- `proof-envelope-integration.test.ts`
- Plus 13 integration tests in `tests/integration/governance/`

**hooks** (previously zero tests):
- `quality-gate-enforcer.test.ts`
- `cross-phase-hooks.test.ts`
- Plus 3 tests in `tests/hooks/`

**agents** (previously zero tests):
- `claim-verifier/output-verifier.test.ts`
- `claim-verifier/test-verifier.test.ts`
- `claim-verifier/file-verifier.test.ts`
- Plus 1 test in `tests/agents/`

### Modules That Remain Untested (Carried Over)
- benchmarks, migration, migrations, testing, types, workflows

### Net Assessment
The three highest-priority gaps from v3.6.8 (governance, hooks, agents) were addressed. However, governance at 33% file coverage still has significant gaps (10 of 15 source files untested), including the 1,260-line `evolution-pipeline-integration.ts` and 1,219-line `shard-retriever-integration.ts`.

---

## 7. Domain Bounded Context Coverage

The `v3/src/domains/` directory contains 13 bounded contexts totaling 127,187 LOC -- the largest single layer in the codebase.

| Domain | Src Files | LOC | Unit Tests | Integ Tests | Untested Files | File Coverage % | Risk |
|--------|-----------|-----|------------|-------------|----------------|----------------|------|
| chaos-resilience | 6 | 5,994 | 5 | 0 | 1 | 83% | LOW |
| code-intelligence | 14 | 8,779 | 8 | 3 | 6 | 57% | MEDIUM |
| contract-testing | 6 | 6,503 | 5 | 0 | 1 | 83% | LOW |
| coverage-analysis | 11 | 7,211 | 11 | 1 | 1 | 91% | LOW |
| defect-intelligence | 7 | 5,210 | 5 | 4 | 1 | 86% | LOW |
| enterprise-integration | 9 | 6,571 | 1 | 0 | 7 | 11% | **CRITICAL** |
| learning-optimization | 11 | 7,632 | 6 | 0 | 5 | 55% | MEDIUM |
| quality-assessment | 15 | 7,504 | 6 | 2 | 8 | 40% | HIGH |
| requirements-validation | 26 | 19,108 | 7 | 3 | 19 | 27% | **CRITICAL** |
| security-compliance | 21 | 9,150 | 10 | 0 | 11 | 48% | HIGH |
| test-execution | 23 | 13,193 | 3 | 2 | 18 | 13% | **CRITICAL** |
| test-generation | 17 | 9,810 | 7 | 3 | 13 | 41% | HIGH |
| visual-accessibility | 15 | 13,399 | 15 | 1 | 5 | 67% | MEDIUM |

### Critical Domain Gaps (Detailed)

**requirements-validation** (19,108 LOC, 27% file coverage):
- 19 untested source files including two files over 1,600 LOC
- QCSD refinement and ideation plugins entirely untested (3,559 LOC combined)
- Product factors assessment subsystem largely untested
- This domain validates all QE requirements -- bugs here propagate everywhere

**test-execution** (13,193 LOC, 13% file coverage):
- 18 untested source files, only 3 unit tests
- Core services `test-executor.ts` (1,024 LOC) and `user-flow-generator.ts` (1,336 LOC) untested
- E2E step types definition (1,060 LOC) untested
- This domain runs all test execution -- the most operationally critical domain

**enterprise-integration** (6,571 LOC, 11% file coverage):
- 7 untested files, only 1 unit test
- ESB middleware service (872 LOC) untested
- Enterprise connectors represent external boundary code with high failure risk

---

## 8. Risk-Scored Gap Prioritization

### Tier 0 -- Immediate Action Required (Risk Score > 4,000)

| Risk Score | Target | LOC | Reason |
|------------|--------|-----|--------|
| 5,583 | `domains/requirements-validation/qcsd-refinement-plugin.ts` | 1,861 | Core QE domain, highest LOC untested file |
| 5,307 | `domains/test-generation/services/pattern-matcher.ts` | 1,769 | Pattern matching drives test generation |
| 5,094 | `domains/requirements-validation/qcsd-ideation-plugin.ts` | 1,698 | Requirements ideation, high complexity |
| 4,926 | `coordination/protocols/security-audit.ts` | 1,642 | Security audit protocol, compliance risk |
| 4,494 | `domains/visual-accessibility/services/visual-regression.ts` | 1,498 | Accessibility testing regression detection |
| 4,008 | `domains/test-execution/services/user-flow-generator.ts` | 1,336 | E2E flow generation, runtime critical |
| 4,005 | `learning/real-qe-reasoning-bank.ts` | 1,335 | Core learning persistence, data integrity |

### Tier 1 -- High Priority (Risk Score 3,000 -- 4,000)

| Risk Score | Target | LOC | Reason |
|------------|--------|-----|--------|
| 3,813 | `learning/qe-unified-memory.ts` | 1,271 | Unified memory layer, data loss risk |
| 3,780 | `governance/evolution-pipeline-integration.ts` | 1,260 | Governance pipeline, compliance critical |
| 3,672 | `domains/req-validation/.../brutal-honesty-analyzer.ts` | 1,224 | Quality gate analyzer |
| 3,657 | `governance/shard-retriever-integration.ts` | 1,219 | Shard retrieval, data integrity |
| 3,627 | `integrations/browser/agent-browser/client.ts` | 1,209 | Browser integration boundary |
| 3,420 | `domains/req-validation/.../html-formatter.ts` | 1,140 | Report formatting |
| 3,393 | `mcp/http-server.ts` | 1,131 | MCP HTTP entry point |
| 3,357 | `domains/test-generation/services/test-generator.ts` | 1,119 | Core test generation service |
| 3,318 | `mcp/protocol-server.ts` | 1,106 | MCP protocol entry point |
| 3,134 | `cli/commands/hooks.ts` | 1,567 | CLI hooks command, user-facing |
| 3,072 | `domains/test-execution/services/test-executor.ts` | 1,024 | Core test executor |
| 3,072 | `domains/req-validation/.../product-factors-service.ts` | 1,024 | Product factors scoring |

### Tier 2 -- Module-Level Gaps (Entire Untested Modules)

| Module | Files | LOC | Action |
|--------|-------|-----|--------|
| testing | 5 | 2,224 | Create unit test directory and tests for all 5 files |
| skills | 2 | 946 | Create unit tests for skill definitions |
| workflows | 2 | 486 | Create unit tests for workflow logic |
| migration | 1 | 323 | Create migration test (data integrity) |
| monitoring | 1 | 309 | Create monitoring test |
| migrations | 1 | 129 | Create schema migration test |

### Tier 3 -- Domain Remediation (Bounded Contexts Below 50% Coverage)

| Domain | Current | Target | Tests Needed (est.) |
|--------|---------|--------|---------------------|
| enterprise-integration | 11% | 70% | ~6 test files |
| test-execution | 13% | 70% | ~15 test files |
| requirements-validation | 27% | 70% | ~12 test files |
| quality-assessment | 40% | 70% | ~5 test files |
| test-generation | 41% | 70% | ~6 test files |
| security-compliance | 48% | 70% | ~5 test files |

---

## 9. Projected Coverage Impact

If all Tier 0 and Tier 1 gaps are addressed (19 test files for the highest-risk untested files):

| Metric | Current | After Tier 0+1 | After All Tiers |
|--------|---------|----------------|-----------------|
| Files with tests | ~590 | ~609 | ~680 |
| File coverage ratio | 59% | 61% | 68% |
| Untested LOC reduced by | -- | ~23,000 | ~55,000 |
| Domains below 50% | 4 | 2 | 0 |

### Optimal Test Creation Order (Maximum Coverage per Test)

1. `qcsd-refinement-plugin.ts` -- 1,861 LOC recovered
2. `pattern-matcher.ts` -- 1,769 LOC recovered
3. `qcsd-ideation-plugin.ts` -- 1,698 LOC recovered
4. `security-audit.ts` -- 1,642 LOC recovered
5. `hooks.ts` (CLI) -- 1,567 LOC recovered
6. `visual-regression.ts` -- 1,498 LOC recovered
7. `user-flow-generator.ts` -- 1,336 LOC recovered
8. `real-qe-reasoning-bank.ts` -- 1,335 LOC recovered
9. `qe-unified-memory.ts` -- 1,271 LOC recovered
10. `evolution-pipeline-integration.ts` -- 1,260 LOC recovered

These 10 tests alone would cover 14,237 LOC -- approximately 2.9% of total codebase LOC.

---

## 10. Recommendations

### Immediate (Sprint 1)

1. **Create test directories** for `testing/`, `skills/`, `workflows/` modules
2. **Write tests for Tier 0 files** -- the 7 files over 1,300 LOC with risk scores above 4,000
3. **Address test-execution domain** -- only 13% coverage on the domain that runs all tests

### Short-Term (Sprint 2-3)

4. **Address requirements-validation domain** -- 27% coverage on 19,108 LOC; the QCSD plugins are the highest single-file gaps in the entire codebase
5. **Address enterprise-integration domain** -- 11% coverage, only 1 unit test for 9 source files
6. **Write MCP server tests** -- `http-server.ts` and `protocol-server.ts` are the entry points for all MCP tool calls, both untested

### Medium-Term (Sprint 4-6)

7. **Raise all domain bounded contexts to 70% file coverage** -- estimated 49 additional test files needed
8. **Raise governance coverage** from 33% to 70% -- 10 source files still untested despite being a v3.6.8 priority
9. **Address integrations module** -- lowest ratio (0.24) of any large module, 70 file gap

### Quality Gates

- Block merges to main for any new source file in `domains/` without a corresponding test file
- Require minimum 50% file-level coverage per module for release
- Track domain bounded context coverage as a release metric

---

## Appendix A: Integration Test Coverage Supplement

Some modules compensate for unit test gaps with integration tests. Adjusted coverage considering both:

| Module | Unit Tests | Integration Tests | Combined | Adjustment |
|--------|-----------|------------------|----------|------------|
| governance | 5 | 13 | 18 | +13 (significant) |
| coordination | 37 | 11 | 48 | +11 |
| integrations | 28 | 25 | 53 | +25 |
| domains | 91 | 12 | 103 | +12 |
| mcp | 35 | 4 | 39 | +4 |

Governance stands out: while unit coverage is only 33%, the 13 integration tests provide substantial behavioral coverage. This reduces its effective risk but does not eliminate the need for unit tests (integration tests are slower and less precise for regression detection).

---

## Appendix B: Methodology

- **Source file count**: All `.ts` files in `v3/src/` excluding `*.test.ts`, `*.spec.ts`
- **Test file count**: All `.test.ts` and `.spec.ts` files in `v3/tests/`
- **File-level matching**: A source file `foo.ts` is considered "tested" if any `foo.test.ts` or `foo.spec.ts` exists anywhere in `v3/tests/`
- **Risk score**: LOC x criticality_multiplier (3x for core QE domains/coordination/governance/mcp/learning, 2x for CLI/integrations/agents/adapters/shared/init, 1x for others)
- **LOC**: Raw line count via `wc -l`, not SLOC
- **Coverage type**: File-level coverage only (not statement/branch); actual runtime coverage would require instrumented test execution

---

*Report generated by Coverage Gap Analyzer (qe-coverage-gap-analyzer) for AQE v3.7.0*
