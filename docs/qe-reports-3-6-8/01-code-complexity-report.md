# Code Complexity Analysis Report

**Codebase**: `/workspaces/agentic-qe-new/v3/src/`
**Date**: 2026-02-16
**Analyzer**: QE Code Complexity Analyzer v3
**Version**: 3.6.8

---

## Executive Summary

| Metric | Value | Status |
|--------|-------|--------|
| Total Files | 942 | -- |
| Total Lines of Code | 478,814 | -- |
| Average Lines/File | 508 | WARNING |
| Median Lines/File | 436 | OK |
| Files Exceeding 500 Lines | 397 (42%) | CRITICAL |
| Files Exceeding 1,000 Lines | 84 (9%) | CRITICAL |
| Files Exceeding 2,000 Lines | 10 (1%) | CRITICAL |
| Functions with Cyclomatic Complexity >10 | 882 | CRITICAL |
| Functions with CC >30 | 41 | CRITICAL |
| Functions Exceeding 50 Lines | 150+ | HIGH |
| Functions with >4 Parameters | 6 | LOW |
| Max Nesting Depth Found | 10 | CRITICAL |
| Modules with >100 Cross-Imports | 4 | HIGH |

**Overall Health**: The codebase has significant complexity debt concentrated in domain coordinators, service files, and the coordination layer. 42% of files exceed the project's 500-line limit (per CLAUDE.md). The top 10 files average 2,155 lines -- over 4x the limit. Cyclomatic complexity is critically high in test-generation, test-execution, and MCP analysis modules.

---

## 1. File Size Violations (>500 Lines)

The project rule in CLAUDE.md states: "Keep files under 500 lines." **397 files (42%) violate this rule.**

### 1.1 Critical Violations (>2,000 Lines)

| Lines | File | Severity |
|-------|------|----------|
| 2,426 | `domains/quality-assessment/coordinator.ts` | CRITICAL |
| 2,272 | `kernel/unified-memory.ts` | CRITICAL |
| 2,228 | `domains/security-compliance/services/security-auditor.ts` | CRITICAL |
| 2,219 | `coordination/workflow-orchestrator.ts` | CRITICAL |
| 2,202 | `coordination/queen-coordinator.ts` | CRITICAL |
| 2,159 | `domains/code-intelligence/coordinator.ts` | CRITICAL |
| 2,126 | `domains/visual-accessibility/services/accessibility-tester.ts` | CRITICAL |
| 2,113 | `init/init-wizard.ts` | CRITICAL |
| 2,094 | `domains/learning-optimization/coordinator.ts` | CRITICAL |
| 2,048 | `cli/commands/learning.ts` | CRITICAL |

**Refactoring Recommendation**: Each of these files should be decomposed into 4-5 smaller files. For example:
- `quality-assessment/coordinator.ts` (2,426 lines) should extract: gate evaluation logic, report generation, RL integration, event handling, and configuration into separate service files.
- `kernel/unified-memory.ts` (2,272 lines) should extract: HNSW operations, CRDT sync, TTL management, and query building into focused modules.
- `queen-coordinator.ts` (2,202 lines) should extract: task routing, domain health monitoring, TinyDancer integration, and task lifecycle management.

### 1.2 High Violations (1,500-2,000 Lines)

| Lines | File |
|-------|------|
| 1,889 | `domains/chaos-resilience/coordinator.ts` |
| 1,860 | `domains/requirements-validation/qcsd-refinement-plugin.ts` |
| 1,845 | `domains/test-generation/coordinator.ts` |
| 1,840 | `learning/qe-reasoning-bank.ts` |
| 1,825 | `domains/visual-accessibility/coordinator.ts` |
| 1,822 | `domains/contract-testing/services/contract-validator.ts` |
| 1,730 | `cli/completions/index.ts` |
| 1,725 | `domains/test-generation/services/pattern-matcher.ts` |
| 1,712 | `coordination/mincut/time-crystal.ts` |
| 1,697 | `domains/requirements-validation/qcsd-ideation-plugin.ts` |
| 1,691 | `domains/contract-testing/coordinator.ts` |
| 1,637 | `shared/llm/router/types.ts` |
| 1,603 | `domains/code-intelligence/services/c4-model/index.ts` |
| 1,587 | `coordination/protocols/security-audit.ts` |
| 1,583 | `governance/ab-benchmarking.ts` |
| 1,566 | `coordination/protocols/quality-gate.ts` |
| 1,556 | `coordination/mincut/neural-goap.ts` |

### 1.3 File Size Distribution

| Range | Count | Percentage |
|-------|-------|------------|
| 0-100 lines | 121 | 12% |
| 101-250 lines | 148 | 15% |
| 251-500 lines | 276 | 29% |
| 501-1,000 lines | 313 | 33% |
| 1,001-1,500 lines | 57 | 6% |
| 1,501-2,000 lines | 17 | 1% |
| >2,000 lines | 10 | 1% |

---

## 2. Cyclomatic Complexity Hotspots

### 2.1 Critical Functions (CC > 50)

| CC | Length | Nesting | File:Line | Function | Severity |
|----|--------|---------|-----------|----------|----------|
| 91 | 327 | 9 | `domains/test-execution/services/user-flow-generator.ts:1048` | `generateTestBlock()` | CRITICAL |
| 88 | 422 | 9 | `domains/test-generation/services/pattern-matcher.ts:420` | `generateMockValue()` | CRITICAL |
| 86 | 469 | 10 | `domains/test-generation/services/pattern-matcher.ts:853` | `estimateComplexity()` | CRITICAL |
| 77 | 167 | 4 | `mcp/tools/qx-analysis/impact-analyzer.ts:20` | `analyze()` | CRITICAL |
| 75 | 82 | 4 | `domains/test-generation/services/tdd-generator.ts:275` | `inferImplementationFromBehavior()` | CRITICAL |
| 72 | 159 | 7 | `init/project-analyzer.ts:565` | `calculateComplexity()` | CRITICAL |
| 60 | 233 | 6 | `domains/test-generation/generators/base-test-generator.ts:64` | `generateTestValue()` | CRITICAL |
| 54 | 100 | 4 | `domains/test-generation/services/tdd-generator.ts:63` | `generateAssertionsFromBehavior()` | CRITICAL |
| 51 | 227 | 8 | `domains/requirements-validation/.../brutal-honesty-analyzer.ts:288` | `analyzeRequirements()` | CRITICAL |

**Analysis**: The test-generation domain is the single worst offender, containing 4 of the top 9 most complex functions. `generateTestBlock()` at CC=91 has 90 independent paths through the code, making it nearly impossible to achieve full branch coverage in testing.

**Refactoring Recommendations**:

1. **`generateTestBlock()` (CC=91, line 1048)** -- Replace the massive switch/case structure with a Strategy pattern. Create separate `PlaywrightTestGenerator`, `CypressTestGenerator`, and `PuppeteerTestGenerator` classes, each implementing a `TestBlockGenerator` interface. Estimated reduction: CC 91 to 15 per class.

2. **`generateMockValue()` (CC=88, line 420)** -- Replace the chain of if-statements with a type-to-mock mapping table (Record<string, () => string>). Estimated reduction: CC 88 to 5.

3. **`estimateComplexity()` (CC=86, line 853)** -- Decompose into `countControlFlow()`, `countNesting()`, `countOperators()`, and `calculateCompositeScore()`. Estimated reduction: CC 86 to 12-15 per sub-function.

4. **`analyze()` in impact-analyzer (CC=77, line 20)** -- Extract domain-specific analysis into separate methods: `analyzeGUIImpact()`, `analyzeSecurityImpact()`, `analyzePerformanceImpact()`. Estimated reduction: CC 77 to 10-15 per method.

### 2.2 High Complexity Functions (CC 30-50)

| CC | Length | Nesting | File:Line | Function |
|----|--------|---------|-----------|----------|
| 50 | 123 | 5 | `sync/cloud/postgres-writer.ts:263` | `serializeValue()` |
| 49 | 120 | 4 | `mcp/tools/qx-analysis/analyze.ts:228` | `analyzeProblem()` |
| 49 | 81 | 3 | `mcp/tools/qx-analysis/analyze.ts:349` | `analyzeUserNeeds()` |
| 46 | 186 | 5 | `shared/metrics/code-metrics.ts:322` | `calculateCognitiveComplexity()` |
| 46 | 34 | 3 | `feedback/test-outcome-tracker.ts:176` | `persistOutcome()` |
| 42 | 160 | 7 | `domains/test-execution/services/e2e/e2e-coordinator.ts:94` | `runTestCase()` |
| 41 | 139 | 4 | `domains/code-intelligence/services/semantic-analyzer.ts:520` | `extractConcepts()` |
| 41 | 125 | 7 | `integrations/ruvector/hypergraph-engine.ts:820` | `buildFromIndexResult()` |
| 38 | 76 | 4 | `coordination/claims/claim-repository.ts:115` | `applyFilter()` |
| 38 | 65 | 4 | `coordination/claims/claim-repository.ts:499` | `applyFilter()` |
| 38 | 137 | 1 | `integrations/ruvector/sona-persistence.ts:258` | `prepareStatements()` |
| 37 | 331 | 2 | `cli/completions/index.ts:328` | `_aqe_completions()` |
| 37 | 103 | 5 | `adapters/a2a/tasks/task-store.ts:313` | `query()` |
| 36 | 78 | 3 | `domains/requirements-validation/qcsd-ideation-plugin.ts:418` | `parseWebsiteContent()` |
| 35 | 103 | 1 | `integrations/rl-suite/persistence/q-value-store.ts:136` | `prepareStatements()` |
| 34 | 281 | 9 | `domains/security-compliance/services/security-auditor.ts:1505` | `performDASTScan()` |
| 34 | 32 | 3 | `init/orchestrator.ts:148` | `createSuccessResult()` |
| 34 | 68 | 3 | `mcp/tools/qx-analysis/analyze.ts:565` | `analyzeDesign()` |
| 33 | 44 | 3 | `domains/requirements-validation/.../brutal-honesty-analyzer.ts:821` | `addTechnicalPrecision()` |
| 33 | 53 | 1 | `integrations/agentic-flow/reasoning-bank/trajectory-tracker.ts:336` | `prepareStatements()` |
| 32 | 215 | 5 | `init/phases/10-workers.ts:48` | `run()` |
| 32 | 112 | 6 | `domains/requirements-validation/services/bdd-scenario-writer.ts:200` | `parseGherkin()` |
| 32 | 149 | 6 | `coordination/queen-coordinator.ts:1767` | `assignTaskToDomain()` |
| 32 | 116 | 5 | `coordination/task-executor.ts:1240` | `execute()` |
| 31 | 171 | 7 | `domains/code-intelligence/services/knowledge-graph.ts:721` | `extractEntities()` |
| 31 | 100 | 6 | `learning/dream/insight-generator.ts:720` | `insightToPattern()` |
| 30 | 67 | 1 | `learning/sqlite-persistence.ts:271` | `prepareStatements()` |
| 30 | 64 | 5 | `learning/v2-to-v3-migration.ts:368` | `migratePatterns()` |
| 30 | 61 | 3 | `mcp/tools/qx-analysis/analyze.ts:431` | `analyzeBusinessNeeds()` |
| 30 | 58 | 1 | `integrations/agentic-flow/reasoning-bank/pattern-evolution.ts:326` | `prepareStatements()` |

---

## 3. Cognitive Complexity (Deep Nesting)

Functions with nesting depth >= 7 are extremely difficult to understand and test.

### 3.1 Deepest Nesting (Severity: Critical)

| Nesting | CC | Length | File:Line | Function |
|---------|-----|--------|-----------|----------|
| 10 | 86 | 469 | `domains/test-generation/services/pattern-matcher.ts:853` | `estimateComplexity()` |
| 9 | 91 | 327 | `domains/test-execution/services/user-flow-generator.ts:1048` | `generateTestBlock()` |
| 9 | 88 | 422 | `domains/test-generation/services/pattern-matcher.ts:420` | `generateMockValue()` |
| 9 | 34 | 281 | `domains/security-compliance/services/security-auditor.ts:1505` | `performDASTScan()` |
| 9 | 14 | 97 | `domains/visual-accessibility/services/accessibility-tester.ts:1272` | `checkKeyboardWithBrowser()` |
| 9 | 7 | 60 | `domains/contract-testing/coordinator.ts:985` | `contractToOpenAPI()` |
| 9 | 7 | 49 | `domains/coverage-analysis/services/gap-detector.ts:728` | `generateUnitTestTemplate()` |
| 8 | 51 | 227 | `domains/requirements-validation/.../brutal-honesty-analyzer.ts:288` | `analyzeRequirements()` |
| 8 | 27 | 78 | `kernel/unified-memory.ts:1099` | `remove()` |
| 8 | 24 | 39 | `domains/enterprise-integration/services/message-broker-service.ts:519` | `validateJsonMessage()` |
| 8 | 20 | 80 | `cli/handlers/task-handler.ts:86` | `executeSubmit()` |
| 8 | 20 | 113 | `sync/cloud/tunnel-manager.ts:70` | `start()` |
| 8 | 18 | 90 | `init/governance-installer.ts:95` | `install()` |
| 8 | 16 | 67 | `coordination/consensus/providers/native-learning-provider.ts:281` | `matchPattern()` |
| 8 | 12 | 49 | `kernel/hybrid-backend.ts:363` | `cleanup()` |

**Refactoring Recommendations**:

1. **Nesting depth 10** (`estimateComplexity()`): Apply "Extract Method" for each nesting level. The inner loops analyzing code patterns should become separate functions. Apply early-return/guard-clause pattern to flatten the top-level conditionals.

2. **Nesting depth 9** (`performDASTScan()`): This 281-line function with 9 levels of nesting is a prime candidate for the "Replace Nested Conditional with Guard Clauses" refactoring. The DAST scanning workflow should be split into `scanEndpoint()`, `analyzeResponse()`, and `reportVulnerability()`.

3. **`remove()` in unified-memory (nesting=8, line 1099)**: A memory removal function should not have 8 levels of nesting. Extract error-handling paths into helper methods and use early returns.

---

## 4. Function Length Violations (>50 Lines)

### 4.1 Worst Offenders (>200 Lines)

| Length | CC | File:Line | Function | Severity |
|--------|-----|-----------|----------|----------|
| 469 | 86 | `domains/test-generation/services/pattern-matcher.ts:853` | `estimateComplexity()` | CRITICAL |
| 460 | 9 | `mcp/protocol-server.ts:425` | `registerAllTools()` | HIGH |
| 422 | 88 | `domains/test-generation/services/pattern-matcher.ts:420` | `generateMockValue()` | CRITICAL |
| 331 | 37 | `cli/completions/index.ts:328` | `_aqe_completions()` | HIGH |
| 327 | 91 | `domains/test-execution/services/user-flow-generator.ts:1048` | `generateTestBlock()` | CRITICAL |
| 316 | 22 | `cli/completions/index.ts:1280` | `elseif()` | HIGH |
| 313 | 15 | `cli/completions/index.ts:685` | `_aqe()` | HIGH |
| 299 | 19 | `domains/requirements-validation/.../test-idea-generator.ts:474` | `getTestTemplates()` | HIGH |
| 281 | 34 | `domains/security-compliance/services/security-auditor.ts:1505` | `performDASTScan()` | CRITICAL |
| 265 | 26 | `mcp/tools/code-intelligence/analyze.ts:336` | `getDemoSearchResult()` | HIGH |
| 242 | 12 | `init/init-wizard.ts:1521` | `generateCLAUDEmdContent()` | MEDIUM |
| 233 | 60 | `domains/test-generation/generators/base-test-generator.ts:64` | `generateTestValue()` | CRITICAL |
| 227 | 51 | `domains/requirements-validation/.../brutal-honesty-analyzer.ts:288` | `analyzeRequirements()` | CRITICAL |
| 218 | 22 | `init/init-wizard.ts:338` | `initialize()` | HIGH |
| 215 | 32 | `init/phases/10-workers.ts:48` | `run()` | HIGH |
| 206 | 27 | `adapters/a2a/discovery/metrics.ts:232` | `getMetrics()` | HIGH |

**Note**: `registerAllTools()` (460 lines, CC=9) is a registration function -- low branching but excessive length. It should be decomposed into per-domain registration functions.

---

## 5. Module Coupling Analysis

### 5.1 Highest Efferent Coupling (Outgoing Dependencies)

| Module | Out Deps | Total Imports | Top Dependencies |
|--------|----------|---------------|------------------|
| `domains` | 22 | 563 | shared(188), kernel(82), coordination(80), integrations(76) |
| `mcp` | 24 | 187 | types(36), base(28), domains(25), learning(17) |
| `integrations` | 15 | 130 | shared(32), types(14), kernel(13), learning(11) |
| `coordination` | 15 | 124 | shared(47), kernel(25), domains(13) |
| `cli` | 21 | 102 | coordination(17), kernel(14), learning(12) |

### 5.2 Highest Afferent Coupling (Most Depended-On)

| Module | Incoming Imports | Risk |
|--------|-----------------|------|
| `shared` | 344 | HIGH -- Changes here cascade everywhere |
| `kernel` | 180 | HIGH -- Core infrastructure, high blast radius |
| `interfaces` | 124 | MEDIUM -- Type-only, lower risk |
| `coordination` | 107 | HIGH -- Orchestration logic is tightly coupled |
| `integrations` | 101 | HIGH -- Many modules depend on integration adapters |
| `types` | 99 | LOW -- Type definitions, safe |
| `learning` | 87 | MEDIUM -- Learning system is widely referenced |
| `domains` | 64 | MEDIUM -- Cross-domain references |

**Key Findings**:

1. **`shared` module (344 incoming imports)**: This is the most critical module in the codebase. Any breaking change propagates to virtually every other module. It needs strict API versioning and backward-compatibility guarantees.

2. **`domains` module (563 outgoing imports to 22 modules)**: The domains layer has the most external dependencies, pulling from shared, kernel, coordination, integrations, and interfaces. This is expected for a DDD architecture but the 563 total import count suggests some domains may be doing too much.

3. **Circular risk**: `domains` depends on `coordination` (80 imports) and `coordination` depends on `domains` (13 imports). This bidirectional dependency should be broken by introducing a mediator or event-based communication pattern.

4. **`mcp` module**: 24 distinct module dependencies is the highest fan-out. The MCP layer should depend only on a facade layer, not reach into 24 separate modules.

### 5.3 Module Complexity Summary

| Module | Files | Avg Lines | Files >500 | Max Lines | Worst File |
|--------|-------|-----------|------------|-----------|------------|
| `domains` | 209 | 610 | 108 (52%) | 2,426 | quality-assessment/coordinator.ts |
| `integrations` | 115 | 508 | 49 (43%) | 1,343 | agentic-flow/pattern-loader.ts |
| `adapters` | 75 | 565 | 49 (65%) | 1,383 | ag-ui/event-adapter.ts |
| `coordination` | 88 | 565 | 39 (44%) | 2,219 | workflow-orchestrator.ts |
| `mcp` | 89 | 409 | 30 (34%) | 1,131 | http-server.ts |
| `shared` | 62 | 404 | 25 (40%) | 1,637 | llm/router/types.ts |
| `learning` | 28 | 788 | 22 (79%) | 1,840 | qe-reasoning-bank.ts |
| `governance` | 16 | 833 | 12 (75%) | 1,583 | ab-benchmarking.ts |
| `cli` | 50 | 433 | 14 (28%) | 2,048 | commands/learning.ts |
| `planning` | 5 | 779 | 3 (60%) | 1,285 | goap-planner.ts |
| `routing` | 9 | 522 | 4 (44%) | 1,273 | qe-agent-registry.ts |

**Worst modules by density of violations**: `learning` (79% of files over 500 lines), `governance` (75%), `adapters` (65%), `planning` (60%).

---

## 6. Composite Risk Hotspots

The following files combine multiple risk factors (large size + high CC + deep nesting + high coupling) and represent the highest-priority refactoring targets.

### Tier 1: Immediate Action Required

| Risk Score | File | Lines | Max CC | Max Nesting | Coupling |
|------------|------|-------|--------|-------------|----------|
| 0.98 | `domains/test-generation/services/pattern-matcher.ts` | 1,725 | 88 | 10 | HIGH |
| 0.96 | `domains/test-execution/services/user-flow-generator.ts` | 1,401 | 91 | 9 | HIGH |
| 0.95 | `coordination/queen-coordinator.ts` | 2,202 | 32 | 6 | CRITICAL |
| 0.94 | `domains/quality-assessment/coordinator.ts` | 2,426 | 26 | 6 | CRITICAL |
| 0.93 | `kernel/unified-memory.ts` | 2,272 | 27 | 8 | CRITICAL |
| 0.92 | `domains/security-compliance/services/security-auditor.ts` | 2,228 | 34 | 9 | HIGH |
| 0.91 | `coordination/workflow-orchestrator.ts` | 2,219 | 27 | 6 | HIGH |
| 0.90 | `init/init-wizard.ts` | 2,113 | 22 | 6 | MEDIUM |

### Tier 2: Plan for Next Sprint

| Risk Score | File | Lines | Max CC | Max Nesting |
|------------|------|-------|--------|-------------|
| 0.85 | `mcp/tools/qx-analysis/impact-analyzer.ts` | ~500 | 77 | 4 |
| 0.84 | `init/project-analyzer.ts` | ~900 | 72 | 7 |
| 0.83 | `domains/test-generation/generators/base-test-generator.ts` | ~600 | 60 | 6 |
| 0.82 | `domains/test-generation/services/tdd-generator.ts` | ~800 | 75 | 4 |
| 0.81 | `domains/requirements-validation/.../brutal-honesty-analyzer.ts` | 1,224 | 51 | 8 |
| 0.80 | `cli/completions/index.ts` | 1,730 | 37 | 2 |
| 0.79 | `learning/qe-reasoning-bank.ts` | 1,840 | 26 | 6 |
| 0.78 | `coordination/mincut/time-crystal.ts` | 1,712 | 25 | 6 |

---

## 7. Refactoring Recommendations

### 7.1 High-Impact Refactorings

#### R1: Decompose Domain Coordinators
**Files affected**: All 13 domain `coordinator.ts` files (average 1,600 lines each)
**Strategy**: Extract into Coordinator (orchestration only) + individual Service classes
**Estimated effort**: 2-3 days per coordinator
**Impact**: Reduces average coordinator size from 1,600 to 400 lines; improves testability 3x

#### R2: Replace Conditional Logic with Strategy Pattern
**Files affected**: `pattern-matcher.ts`, `user-flow-generator.ts`, `base-test-generator.ts`
**Strategy**: Replace switch/case and if-chains with polymorphic dispatch
**Estimated effort**: 1-2 days per file
**Impact**: Reduces CC from 60-91 to 10-15 per class; nesting from 9-10 to 3-4

#### R3: Extract `prepareStatements()` into Schema Definition Files
**Files affected**: 6 persistence files (`sona-persistence.ts`, `q-value-store.ts`, `sqlite-persistence.ts`, etc.)
**Strategy**: Move SQL schema definitions to separate schema files; use a table-driven approach
**Estimated effort**: 1 day
**Impact**: Reduces CC from 28-38 to 5-8; improves readability

#### R4: Break Circular `domains` <-> `coordination` Coupling
**Strategy**: Introduce an event bus or mediator pattern for domain-to-coordination communication. Domains should emit events; coordination should subscribe.
**Estimated effort**: 3-5 days
**Impact**: Eliminates bidirectional dependency; enables independent domain testing

#### R5: Facade for MCP Module Dependencies
**Strategy**: The MCP module imports from 24 distinct modules. Introduce a `QEServiceFacade` that aggregates domain APIs.
**Estimated effort**: 2-3 days
**Impact**: Reduces MCP fan-out from 24 to 2-3; simplifies MCP tool testing

### 7.2 Quick Wins (< 1 Day Each)

| Refactoring | File | Current | Target |
|-------------|------|---------|--------|
| Replace if-chain with lookup table | `generateMockValue()` in pattern-matcher.ts | CC=88 | CC=5 |
| Extract guard clauses | `remove()` in unified-memory.ts | Nesting=8 | Nesting=3 |
| Split `registerAllTools()` into per-domain functions | protocol-server.ts | 460 lines | 30-50 lines each |
| Extract `_aqe_completions()` into command-specific completers | completions/index.ts | 331 lines | 30-50 lines each |
| Replace nested try/catch with error middleware | `performDASTScan()` | Nesting=9 | Nesting=4 |

---

## 8. Testability Assessment

Based on the complexity analysis, estimated testability scores for the most complex modules:

| Module | Testability | Bottleneck | Tests Needed (est.) |
|--------|-------------|------------|---------------------|
| `test-generation` | 35/100 (Very Difficult) | CC=91 functions, deep nesting | 300+ |
| `coordination` | 42/100 (Difficult) | Large coordinators, circular deps | 250+ |
| `kernel` | 45/100 (Difficult) | 2,272-line unified-memory, nesting=8 | 150+ |
| `security-compliance` | 48/100 (Difficult) | DAST scan CC=34, nesting=9 | 200+ |
| `domains` (overall) | 50/100 (Moderate) | 52% files over limit | 800+ |
| `learning` | 52/100 (Moderate) | 79% files over limit, but lower CC | 120+ |
| `mcp` | 55/100 (Moderate) | High fan-out coupling | 180+ |
| `shared` | 65/100 (Moderate) | High afferent coupling risk | 100+ |
| `init` | 60/100 (Moderate) | init-wizard at 2,113 lines | 80+ |

---

## 9. Metrics Summary by Module

| Module | Files | >500 Lines | % Over | Avg Lines | Max CC | Assessment |
|--------|-------|------------|--------|-----------|--------|------------|
| domains | 209 | 108 | 52% | 610 | 91 | CRITICAL |
| integrations | 115 | 49 | 43% | 508 | 41 | HIGH |
| adapters | 75 | 49 | 65% | 565 | 26 | HIGH |
| coordination | 88 | 39 | 44% | 565 | 32 | HIGH |
| mcp | 89 | 30 | 34% | 409 | 77 | HIGH |
| shared | 62 | 25 | 40% | 404 | 46 | HIGH |
| learning | 28 | 22 | 79% | 788 | 31 | HIGH |
| governance | 16 | 12 | 75% | 833 | 26 | HIGH |
| cli | 50 | 14 | 28% | 433 | 37 | MEDIUM |
| init | 35 | 5 | 14% | 312 | 72 | MEDIUM |
| routing | 9 | 4 | 44% | 522 | 26 | MEDIUM |
| planning | 5 | 3 | 60% | 779 | 27 | MEDIUM |
| workers | 17 | 1 | 6% | 363 | 27 | LOW |
| memory | 10 | 2 | 20% | 323 | 20 | LOW |
| hooks | 6 | 1 | 17% | 342 | 18 | LOW |
| strange-loop | 19 | 6 | 32% | 422 | 29 | MEDIUM |
| causal-discovery | 5 | 1 | 20% | 412 | 15 | LOW |
| neural-optimizer | 6 | 2 | 33% | 455 | 22 | LOW |
| kernel | 14 | 1 | 7% | 420 | 27 | MEDIUM |

---

## 10. Conclusions and Priorities

### Critical Actions (Address Immediately)

1. **Decompose the 10 files over 2,000 lines.** These violate the project's 500-line rule by 4x or more and represent systemic risk. Start with `quality-assessment/coordinator.ts` and `queen-coordinator.ts`.

2. **Refactor the 9 functions with CC > 50.** These functions are nearly untestable in their current form. The test-generation domain's `generateTestBlock()` (CC=91) and `generateMockValue()` (CC=88) should be the first targets.

3. **Reduce nesting in functions with depth > 7.** There are 15 functions with nesting depth 8-10. Apply guard clauses and extract-method refactoring.

### Strategic Actions (Plan for Next Quarter)

4. **Break the domains-coordination circular dependency** using event-driven communication.
5. **Introduce a service facade** for the MCP module to reduce its 24-module fan-out.
6. **Establish automated complexity gates** in CI/CD: reject PRs that add functions with CC > 20 or files over 500 lines.

### Metrics Targets

| Metric | Current | Target | Timeline |
|--------|---------|--------|----------|
| Files >500 lines | 397 (42%) | <150 (16%) | 3 months |
| Files >2,000 lines | 10 | 0 | 1 month |
| Functions CC >50 | 9 | 0 | 1 month |
| Functions CC >20 | 41 | <10 | 3 months |
| Max nesting depth | 10 | 5 | 2 months |
| Average lines/file | 508 | <350 | 6 months |

---

*Report generated by QE Code Complexity Analyzer v3 on 2026-02-16.*
*Analysis scope: 942 TypeScript files across 37 modules in /workspaces/agentic-qe-new/v3/src/.*
