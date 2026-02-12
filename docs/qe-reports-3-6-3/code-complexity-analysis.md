# Code Complexity Analysis Report - AQE v3.6.3

**Date:** 2026-02-11
**Scope:** `/workspaces/agentic-qe-new/v3/src/`
**Analyzer:** V3 QE Code Complexity Analyzer (claude-opus-4-6)

---

## Executive Summary

| Metric | Value | Status |
|--------|-------|--------|
| **Total Files** | 940 | - |
| **Total Lines** | 474,973 | - |
| **Average File Size** | 505 lines | WARNING |
| **Median File Size** | 436 lines | OK |
| **Files >500 lines** | 391 (41.6%) | CRITICAL |
| **Files >1000 lines** | 84 (8.9%) | CRITICAL |
| **Files >2000 lines** | 9 (1.0%) | CRITICAL |
| **Methods >100 lines** | 184 | CRITICAL |
| **Methods >200 lines** | 24 | CRITICAL |
| **God Classes (>20 methods)** | 30 | CRITICAL |
| **Cross-module coupling links** | 559 | HIGH |
| **Kernel -> Domain imports** | 13 | ARCHITECTURE VIOLATION |

### Key Findings

1. **41.6% of all files violate the 500-line project standard.** This is the single most significant compliance failure. The project standard in CLAUDE.md states "Keep files under 500 lines" -- yet 391 of 940 files exceed this limit.

2. **9 files exceed 2000 lines**, with the worst being `quality-assessment/coordinator.ts` at 2,426 lines (4.85x the limit).

3. **19 CRITICAL complexity files** were identified with composite scores above 0.80, combining file size, method count, conditional density, error handling, and coupling.

4. **God classes are pervasive.** 30 classes have more than 20 methods each, with `qe-agent-registry.ts` having 98 methods in a single file.

5. **13 domain coordinators share identical mixin patterns** (MinCut + Consensus + Governance), suggesting boilerplate that could be abstracted into a base class.

6. **Kernel imports from Domains** -- `kernel/kernel.ts` imports all 13 domain plugins directly, violating the dependency inversion principle.

---

## File Size Distribution

```
     0-100:  119 files  #######################################
   101-200:  106 files  ###################################
   201-300:   81 files  ###########################
   301-500:  243 files  ################################################################################
   501-750:  194 files  ################################################################
  751-1000:  113 files  #####################################
 1001-1500:   58 files  ###################
 1501-2000:   17 files  #####
     2001+:    9 files  ###
```

**Compliance:** 549 files (58.4%) are within the 500-line limit. 391 files (41.6%) are non-compliant.

---

## Top 20 Most Complex Files (Sorted by Composite Score)

Composite score formula: `size(0.25) + methods(0.25) + conditionals(0.25) + error_handling(0.15) + coupling(0.10)`

| Rank | File | Lines | Methods | Ifs | Try/Catch | Imports | Score | Rating |
|------|------|-------|---------|-----|-----------|---------|-------|--------|
| 1 | `domains/code-intelligence/coordinator.ts` | 2,156 | 82 | 82 | 27 | 27 | 1.00 | CRITICAL |
| 2 | `coordination/queen-coordinator.ts` | 2,202 | 90 | 117 | 20 | 29 | 1.00 | CRITICAL |
| 3 | `domains/quality-assessment/coordinator.ts` | 2,426 | 72 | 106 | 25 | 19 | 0.99 | CRITICAL |
| 4 | `domains/test-generation/coordinator.ts` | 1,845 | 67 | 70 | 16 | 19 | 0.94 | CRITICAL |
| 5 | `domains/visual-accessibility/services/accessibility-tester.ts` | 2,126 | 62 | 89 | 18 | 8 | 0.94 | CRITICAL |
| 6 | `domains/learning-optimization/coordinator.ts` | 2,094 | 64 | 74 | 12 | 17 | 0.94 | CRITICAL |
| 7 | `domains/security-compliance/services/security-auditor.ts` | 2,228 | 52 | 110 | 23 | 7 | 0.94 | CRITICAL |
| 8 | `domains/contract-testing/coordinator.ts` | 1,691 | 46 | 80 | 15 | 18 | 0.93 | CRITICAL |
| 9 | `cli/commands/learning.ts` | 1,726 | 52 | 86 | 22 | 13 | 0.93 | CRITICAL |
| 10 | `domains/chaos-resilience/coordinator.ts` | 1,889 | 55 | 74 | 13 | 16 | 0.93 | CRITICAL |
| 11 | `domains/visual-accessibility/coordinator.ts` | 1,825 | 60 | 69 | 16 | 16 | 0.92 | CRITICAL |
| 12 | `init/init-wizard.ts` | 2,113 | 57 | 66 | 19 | 10 | 0.91 | CRITICAL |
| 13 | `coordination/workflow-orchestrator.ts` | 2,219 | 61 | 82 | 9 | 4 | 0.86 | CRITICAL |
| 14 | `domains/requirements-validation/coordinator.ts` | 1,452 | 53 | 65 | 13 | 17 | 0.85 | CRITICAL |
| 15 | `domains/test-generation/services/pattern-matcher.ts` | 1,725 | 60 | 81 | 9 | 8 | 0.85 | CRITICAL |
| 16 | `kernel/unified-memory.ts` | 2,070 | 55 | 100 | 6 | 7 | 0.85 | CRITICAL |
| 17 | `domains/code-intelligence/services/c4-model/index.ts` | 1,603 | 50 | 83 | 11 | 4 | 0.83 | CRITICAL |
| 18 | `domains/security-compliance/coordinator.ts` | 1,358 | 53 | 61 | 12 | 18 | 0.82 | CRITICAL |
| 19 | `domains/contract-testing/services/contract-validator.ts` | 1,824 | 41 | 169 | 10 | 5 | 0.81 | CRITICAL |
| 20 | `domains/chaos-resilience/services/chaos-engineer.ts` | 1,176 | 62 | 65 | 15 | 9 | 0.80 | HIGH |

---

## Files Exceeding 500-Line Limit

**Total violations:** 391 files (41.6% of codebase)

### Files >2000 Lines (CRITICAL -- 4x+ Over Limit)

| File | Lines | Over By |
|------|-------|---------|
| `domains/quality-assessment/coordinator.ts` | 2,426 | +1,926 (385%) |
| `domains/security-compliance/services/security-auditor.ts` | 2,228 | +1,728 (346%) |
| `coordination/workflow-orchestrator.ts` | 2,219 | +1,719 (344%) |
| `coordination/queen-coordinator.ts` | 2,202 | +1,702 (340%) |
| `domains/code-intelligence/coordinator.ts` | 2,156 | +1,656 (331%) |
| `domains/visual-accessibility/services/accessibility-tester.ts` | 2,126 | +1,626 (325%) |
| `init/init-wizard.ts` | 2,113 | +1,613 (323%) |
| `domains/learning-optimization/coordinator.ts` | 2,094 | +1,594 (319%) |
| `kernel/unified-memory.ts` | 2,070 | +1,570 (314%) |

### Distribution of Violations by Module

| Module | Files | Total Lines | Files >500 | Avg Lines | Severity |
|--------|-------|-------------|------------|-----------|----------|
| domains | 209 | 127,615 | 108 | 610 | CRITICAL |
| integrations | 115 | 58,126 | 49 | 505 | HIGH |
| coordination | 88 | 49,428 | 37 | 561 | CRITICAL |
| adapters | 74 | 42,244 | 49 | 570 | CRITICAL |
| mcp | 89 | 36,343 | 29 | 408 | HIGH |
| shared | 61 | 25,062 | 25 | 410 | MEDIUM |
| learning | 28 | 21,053 | 22 | 751 | CRITICAL |
| cli | 50 | 21,008 | 14 | 420 | HIGH |
| governance | 16 | 13,159 | 12 | 822 | CRITICAL |
| init | 35 | 10,771 | 5 | 307 | LOW |
| strange-loop | 19 | 8,027 | 6 | 422 | MEDIUM |
| kernel | 14 | 5,624 | 1 | 401 | LOW |
| routing | 9 | 4,594 | 4 | 510 | MEDIUM |
| planning | 5 | 3,899 | 3 | 779 | HIGH |

**Worst offenders by average file size:** `governance` (822 avg), `learning` (751 avg), `planning` (779 avg), `domains` (610 avg).

### Specifically Flagged: CLI Index (842 lines)

`/workspaces/agentic-qe-new/v3/src/cli/index.ts` is 845 lines, exceeding the 500-line limit by 69%. This file registers CLI commands using Commander.js and should be split into separate command registration modules.

---

## God Classes (>20 Methods Per Class)

| Methods | Lines | File |
|---------|-------|------|
| 98 | 1,273 | `routing/qe-agent-registry.ts` |
| 93 | 1,075 | `integrations/coherence/types.ts` |
| 90 | 2,202 | `coordination/queen-coordinator.ts` |
| 82 | 2,156 | `domains/code-intelligence/coordinator.ts` |
| 72 | 2,426 | `domains/quality-assessment/coordinator.ts` |
| 68 | 1,401 | `domains/test-execution/services/user-flow-generator.ts` |
| 67 | 1,845 | `domains/test-generation/coordinator.ts` |
| 66 | 545 | `memory/crdt/types.ts` |
| 64 | 912 | `domains/coverage-analysis/services/gap-detector.ts` |
| 64 | 713 | `memory/crdt/crdt-store.ts` |
| 64 | 2,094 | `domains/learning-optimization/coordinator.ts` |
| 64 | 1,478 | `coordination/mincut/dream-integration.ts` |
| 63 | 1,212 | `integrations/ruvector/sona-persistence.ts` |
| 62 | 2,126 | `domains/visual-accessibility/services/accessibility-tester.ts` |
| 62 | 1,176 | `domains/chaos-resilience/services/chaos-engineer.ts` |
| 61 | 2,219 | `coordination/workflow-orchestrator.ts` |
| 60 | 1,825 | `domains/visual-accessibility/coordinator.ts` |
| 60 | 1,725 | `domains/test-generation/services/pattern-matcher.ts` |
| 58 | 1,556 | `coordination/mincut/neural-goap.ts` |
| 58 | 1,383 | `adapters/ag-ui/event-adapter.ts` |

**Pattern:** Nearly all domain coordinators are God classes. The coordinator pattern has accumulated too many responsibilities over time.

---

## Longest Methods (Cognitive Complexity Hotspots)

Methods exceeding 100 lines are extremely difficult to test and understand.

| Lines | Method | File | Issue |
|-------|--------|------|-------|
| 1,008 | `createAgentProfile` (data block) | `routing/qe-agent-registry.ts:60` | Giant data literal -- not a method but a massive array declaration |
| 622 | `registerBuiltInWorkflows` | `coordination/workflow-orchestrator.ts:1492` | 15+ workflow definitions crammed into one method |
| 609 | `parseGraphQLField` | `contract-testing/services/contract-validator.ts:1216` | Recursive parser with deep nesting |
| 515 | `calculateComplexity` | `defect-intelligence/services/defect-predictor.ts:651` | Multi-branch AST analysis with fallback heuristics |
| 469 | `estimateComplexity` | `test-generation/services/pattern-matcher.ts:853` | Large switch/case with string pattern matching |
| 460 | `registerAllTools` | `mcp/protocol-server.ts:425` | Tool registration -- 30+ tools inline |
| 422 | `generateMockValue` | `test-generation/services/pattern-matcher.ts:420` | Type-to-mock-value mapping with many branches |
| 366 | `apply` | `mcp/tools/qx-analysis/heuristics-engine.ts:55` | Rule engine with accumulated conditionals |
| 327 | `generateTestBlock` | `test-execution/services/user-flow-generator.ts:1048` | Template generation with many conditionals |
| 299 | `getTestTemplates` | `requirements-validation/.../test-idea-generator.ts:474` | Large data literal |
| 281 | `performDASTScan` | `security-compliance/services/security-auditor.ts:1505` | Complex security scan orchestration |
| 265 | `getDemoSearchResult` | `mcp/tools/code-intelligence/analyze.ts:336` | Hardcoded demo data |
| 242 | `generateCLAUDEmdContent` | `init/init-wizard.ts:1521` | Template string generation |
| 233 | `generateTestValue` | `test-generation/generators/base-test-generator.ts:64` | Type-to-value mapping |
| 227 | `analyzeRequirements` | `requirements-validation/.../brutal-honesty-analyzer.ts:288` | Multi-step analysis pipeline |
| 218 | `initialize` | `init/init-wizard.ts:338` | 13-phase initialization sequence |
| 217 | `execute` | `mcp/tools/visual-accessibility/index.ts:371` | Multi-mode dispatch |
| 206 | `getMetrics` | `adapters/a2a/discovery/metrics.ts:232` | Metrics computation |
| 199 | `performUnifiedAssertion` | `test-execution/services/e2e/assertion-handlers.ts:46` | Multi-type assertion switch |
| 186 | `calculateCognitiveComplexity` | `shared/metrics/code-metrics.ts:322` | AST traversal with nesting tracking |

**Total methods >100 lines:** 184
**Total methods >200 lines:** 24

---

## Conditional Density Hotspots (Highest if/line Ratio)

The `contract-validator.ts` has the highest conditional density in the entire codebase: 169 `if` statements in 1,824 lines (9.3% of lines are conditionals). This indicates validation logic that should be decomposed into a rule-based or schema-driven validator.

| File | Ifs | Lines | Density |
|------|-----|-------|---------|
| `contract-testing/services/contract-validator.ts` | 169 | 1,824 | 9.3% |
| `coordination/queen-coordinator.ts` | 117 | 2,202 | 5.3% |
| `security-compliance/services/security-auditor.ts` | 110 | 2,228 | 4.9% |
| `domains/quality-assessment/coordinator.ts` | 106 | 2,426 | 4.4% |
| `kernel/unified-memory.ts` | 100 | 2,070 | 4.8% |
| `visual-accessibility/services/accessibility-tester.ts` | 89 | 2,126 | 4.2% |
| `cli/commands/learning.ts` | 86 | 1,726 | 5.0% |
| `code-intelligence/services/c4-model/index.ts` | 83 | 1,603 | 5.2% |
| `governance/ab-benchmarking.ts` | 83 | 1,583 | 5.2% |
| `coordination/workflow-orchestrator.ts` | 82 | 2,219 | 3.7% |

---

## Coupling Analysis Between Bounded Contexts

### Cross-Module Import Counts

| Source | Target | Import Count | Assessment |
|--------|--------|-------------|------------|
| domains | shared | 170 | Expected (OK) |
| domains | kernel | 59 | Expected (OK) |
| domains | integrations | 41 | Acceptable |
| coordination | shared | 35 | Expected (OK) |
| integrations | shared | 31 | Expected (OK) |
| domains | coordination | 27 | WARNING -- Domains should not depend on coordination |
| mcp | domains | 19 | OK -- MCP dispatches to domains |
| learning | shared | 18 | Expected (OK) |
| coordination | kernel | 17 | Expected (OK) |
| mcp | kernel | 14 | OK |
| **kernel** | **domains** | **13** | **ARCHITECTURE VIOLATION** |
| learning | kernel | 12 | OK |
| mcp | learning | 11 | OK |
| mcp | coordination | 8 | OK |
| integrations | learning | 8 | Acceptable |
| coordination | domains | 7 | WARNING -- Creates circular dependency risk |
| **shared** | **learning** | **7** | **ARCHITECTURE VIOLATION** |
| integrations | kernel | 6 | OK |

### Architecture Violations

**1. Kernel -> Domains (13 imports) -- CRITICAL**

File: `/workspaces/agentic-qe-new/v3/src/kernel/kernel.ts`

The kernel directly imports all 13 domain plugin factories:
```typescript
import { createTestGenerationPlugin } from '../domains/test-generation/plugin';
import { createTestExecutionPlugin } from '../domains/test-execution/plugin';
import { createCoverageAnalysisPlugin } from '../domains/coverage-analysis/plugin';
// ... 10 more domain imports
```

This violates dependency inversion. The kernel should define interfaces, and domains should register themselves through a plugin registry pattern.

**2. Domains -> Coordination (27 imports) -- WARNING**

Domain coordinators import from the coordination layer (mixins, consensus, event routing). While some of this is acceptable for mixin application, it creates tight coupling between the domain and coordination layers.

**3. Coordination -> Domains (7 imports) -- WARNING**

The coordination layer (particularly `task-executor.ts`) imports concrete domain services:
```typescript
import { CoverageAnalyzerService } from '../domains/coverage-analysis';
import { SecurityScannerService } from '../domains/security-compliance';
import { createTestGeneratorService } from '../domains/test-generation';
```

This should use domain interfaces, not concrete implementations.

### Inter-Domain Coupling

No direct inter-domain imports were detected (domain A does not import from domain B). This is a positive finding -- the bounded context separation between the 13 domains is clean at the import level.

---

## Duplication Hotspots

### 1. Coordinator Mixin Boilerplate (All 13 Coordinators)

All 13 domain coordinators apply the same three mixins: **MinCutAwareDomainMixin**, **ConsensusEnabledMixin**, and **GovernanceAwareMixin**. Each coordinator contains duplicated:
- Mixin initialization code
- Health check aggregation from mixins
- Shutdown teardown for mixin resources
- Event subscription wiring

**Estimated duplicated lines per coordinator:** ~100-150 lines
**Total estimated duplication:** ~1,300-1,950 lines

**Recommendation:** Create an `AbstractDomainCoordinator` base class that applies all standard mixins and provides the common lifecycle (initialize, shutdown, health check).

### 2. Repeated Initialization Patterns

All 13 coordinators implement `async initialize(): Promise<void>` with similar patterns:
- Initialize sub-services
- Subscribe to domain events
- Register with coordination layer
- Set up health monitoring

### 3. Tool Registration Patterns (MCP)

`registerAllTools()` in `mcp/protocol-server.ts` (460 lines) and similar patterns in handlers contain repetitive tool definition structures. This should use a declarative schema.

### 4. Test Output Parsers (Flaky Detector)

`flaky-detector.ts` contains three nearly identical parser methods:
- `parseVitestJson()` (lines 692-724)
- `parseJestJson()` (lines 729-762)
- `parseTapOutput()` (lines 767-797)

Each follows the same pattern of iterating test results and creating `TestExecutionRecord` objects. These could share a common parsing pipeline.

---

## Refactoring Recommendations (Prioritized)

### Priority 1: CRITICAL -- Immediate Action Required

#### R1. Extract Domain Coordinator Base Class
**Files:** All 13 coordinators (26,000+ lines total)
**Issue:** Duplicated mixin application, lifecycle, and health check patterns
**Strategy:** Create `AbstractDomainCoordinator<TConfig>` with standard mixin application
**Estimated reduction:** ~1,500 lines total, each coordinator reduces by ~100-150 lines
**Testability improvement:** Mixins testable once in base class, not 13x

#### R2. Split Queen Coordinator (2,202 lines, 90 methods)
**File:** `coordination/queen-coordinator.ts`
**Issue:** Single class doing task routing, domain management, scaling, tracing, federation, hypothesis management, work stealing, and TinyDancer routing
**Strategy:** Extract into focused classes:
- `TaskRouter` -- task assignment and routing
- `DomainManager` -- domain lifecycle and health
- `ScalingController` -- dynamic scaling decisions
- `FederationCoordinator` -- cross-instance federation
- `HypothesisCoordinator` -- competing hypotheses
**Estimated reduction:** 2,202 -> 5 files of ~400-500 lines each
**Testability improvement:** 4x (each class independently testable)

#### R3. Split Quality Assessment Coordinator (2,426 lines, 72 methods)
**File:** `domains/quality-assessment/coordinator.ts`
**Issue:** Combines quality gate evaluation, deployment advice, complexity analysis, claim verification, consensus verification, RL integration, and SONA learning
**Strategy:** Extract:
- `QualityGateEngine` -- gate evaluation and borderline detection
- `ConsensusVerifier` -- consensus-based verification
- `RLOptimizer` -- reinforcement learning integration
- `ClaimVerificationService` -- report claim checking
**Estimated reduction:** 2,426 -> 4 files of ~500-600 lines

#### R4. Invert Kernel-Domain Dependency
**File:** `kernel/kernel.ts`
**Issue:** Kernel directly imports 13 domain plugins (dependency inversion violation)
**Strategy:** Implement plugin registry where domains self-register
```typescript
// Instead of: import { createTestGenerationPlugin } from '../domains/...'
// Use: kernel.registerPlugin(plugin) called from each domain's index.ts
```
**Impact:** Eliminates architectural violation, enables lazy domain loading

### Priority 2: HIGH -- Address Within Sprint

#### R5. Decompose Workflow Orchestrator (2,219 lines)
**File:** `coordination/workflow-orchestrator.ts`
**Issue:** `registerBuiltInWorkflows()` is 622 lines of inline workflow definitions
**Strategy:** Move workflow definitions to declarative YAML/JSON files, load dynamically
**Estimated reduction:** 2,219 -> ~800 lines + separate workflow definition files

#### R6. Split Security Auditor (2,228 lines)
**File:** `domains/security-compliance/services/security-auditor.ts`
**Issue:** Single class handling SAST, DAST, secret scanning, dependency auditing
**Strategy:** Extract per-scan-type classes: `SASTScanner`, `DASTScanner`, `SecretScanner`, `DependencyAuditor`
**Estimated reduction:** 2,228 -> 4 files of ~500-600 lines

#### R7. Refactor Contract Validator Conditionals (169 if-statements)
**File:** `domains/contract-testing/services/contract-validator.ts`
**Issue:** Highest conditional density in codebase (9.3%)
**Strategy:** Replace validation if-chains with schema-driven validation rules
**Estimated reduction:** 169 ifs -> ~40 ifs + validation rule definitions

#### R8. Split Init Wizard (2,113 lines)
**File:** `init/init-wizard.ts`
**Issue:** `generateCLAUDEmdContent()` is 242 lines, `initialize()` is 218 lines, `configureHooks()` is 193 lines
**Strategy:** Extract `CLAUDEmdGenerator`, `HooksConfigurator`, and use phase-based initialization (already partially done)
**Estimated reduction:** 2,113 -> ~800 + extracted generators

#### R9. Split Unified Memory (2,070 lines)
**File:** `kernel/unified-memory.ts`
**Issue:** Manages KV store, vectors, HNSW, Q-values, GOAP, dreams, CRDT, hypergraph all in one class
**Strategy:** Extract storage-specific adapters: `KVStoreAdapter`, `VectorStoreAdapter`, `HNSWIndexAdapter`
**Estimated reduction:** 2,070 -> 4-5 files of ~400-500 lines

#### R10. Decompose registerAllTools (460 lines)
**File:** `mcp/protocol-server.ts`
**Issue:** All 30+ MCP tools registered in a single method
**Strategy:** Use tool auto-discovery: each tool file exports a definition that protocol-server discovers
**Estimated reduction:** 460 -> ~50 lines (routing only) + tools self-register

### Priority 3: MEDIUM -- Technical Debt Backlog

#### R11. Split CLI Index (845 lines)
**File:** `cli/index.ts`
**Issue:** 845 lines registering Commander.js commands
**Strategy:** Already partially done with `cli/commands/` modules; move remaining inline command definitions to separate files
**Estimated reduction:** 845 -> ~300 lines

#### R12. Consolidate Agent Registry Data (1,273 lines)
**File:** `routing/qe-agent-registry.ts`
**Issue:** 98 agent profile definitions as inline data (1,008-line data block)
**Strategy:** Move agent definitions to a JSON/YAML configuration file
**Estimated reduction:** 1,273 -> ~300 lines + config file

#### R13. Extract Test Output Parsers
**File:** `domains/test-execution/services/flaky-detector.ts`
**Issue:** Three near-identical test output parsers (Vitest, Jest, TAP)
**Strategy:** Create `TestOutputParser` interface with framework-specific implementations
**Estimated reduction:** ~100 lines (deduplication)

#### R14. Split Code Intelligence Coordinator (2,156 lines)
**File:** `domains/code-intelligence/coordinator.ts`
**Issue:** 82 methods, 27 imports
**Strategy:** Extract `KnowledgeGraphCoordinator`, `C4ModelCoordinator`, `SemanticAnalysisCoordinator`

#### R15. Split Pattern Matcher (1,725 lines)
**File:** `domains/test-generation/services/pattern-matcher.ts`
**Issue:** `estimateComplexity()` is 469 lines, `generateMockValue()` is 422 lines
**Strategy:** Extract `ComplexityEstimator` and `MockValueGenerator` as standalone services

---

## Testability Assessment

### Most Difficult to Test (Score <40/100)

| File | Methods | Dependencies | Side Effects | Testability |
|------|---------|--------------|--------------|-------------|
| `queen-coordinator.ts` | 90 | 15+ services | Event bus, timers, scaling | Very Difficult |
| `quality-assessment/coordinator.ts` | 72 | RL, SONA, Consensus, MinCut | DB, events, ML models | Very Difficult |
| `code-intelligence/coordinator.ts` | 82 | KnowledgeGraph, C4, AST | File system, DB | Very Difficult |
| `unified-memory.ts` | 55 | SQLite, CRDT, HNSW | Database file I/O | Difficult |
| `workflow-orchestrator.ts` | 61 | All 13 domains | Events, timers | Very Difficult |

### Testing Effort Estimate

| Complexity Level | Files | Estimated Hours | Tests Needed |
|-----------------|-------|-----------------|--------------|
| CRITICAL (>0.80) | 19 | ~380h | ~1,900 |
| HIGH (0.60-0.80) | 21 | ~210h | ~1,050 |
| MEDIUM (0.40-0.60) | ~100 | ~500h | ~3,000 |
| LOW (<0.40) | ~251 | ~500h | ~3,750 |
| **Total** | **391** | **~1,590h** | **~9,700** |

---

## Maintainability Index Summary

Using a simplified maintainability model based on file size, complexity, coupling, and duplication:

| Module | Files | Maintainability | Trend |
|--------|-------|----------------|-------|
| kernel | 14 | 68/100 MEDIUM | Stable |
| domains | 209 | 42/100 LOW | Declining |
| coordination | 88 | 45/100 LOW | Declining |
| adapters | 74 | 50/100 MEDIUM | Stable |
| mcp | 89 | 55/100 MEDIUM | Stable |
| learning | 28 | 38/100 LOW | Declining |
| governance | 16 | 40/100 LOW | Stable |
| integrations | 115 | 48/100 LOW | Stable |
| **Overall** | **940** | **46/100 LOW** | **Declining** |

---

## Appendix: Complete List of Files >1500 Lines

| Lines | File Path |
|-------|-----------|
| 2,426 | `v3/src/domains/quality-assessment/coordinator.ts` |
| 2,228 | `v3/src/domains/security-compliance/services/security-auditor.ts` |
| 2,219 | `v3/src/coordination/workflow-orchestrator.ts` |
| 2,202 | `v3/src/coordination/queen-coordinator.ts` |
| 2,156 | `v3/src/domains/code-intelligence/coordinator.ts` |
| 2,126 | `v3/src/domains/visual-accessibility/services/accessibility-tester.ts` |
| 2,113 | `v3/src/init/init-wizard.ts` |
| 2,094 | `v3/src/domains/learning-optimization/coordinator.ts` |
| 2,070 | `v3/src/kernel/unified-memory.ts` |
| 1,889 | `v3/src/domains/chaos-resilience/coordinator.ts` |
| 1,860 | `v3/src/domains/requirements-validation/qcsd-refinement-plugin.ts` |
| 1,845 | `v3/src/domains/test-generation/coordinator.ts` |
| 1,825 | `v3/src/domains/visual-accessibility/coordinator.ts` |
| 1,824 | `v3/src/domains/contract-testing/services/contract-validator.ts` |
| 1,730 | `v3/src/cli/completions/index.ts` |
| 1,726 | `v3/src/cli/commands/learning.ts` |
| 1,725 | `v3/src/domains/test-generation/services/pattern-matcher.ts` |
| 1,697 | `v3/src/domains/requirements-validation/qcsd-ideation-plugin.ts` |
| 1,691 | `v3/src/domains/contract-testing/coordinator.ts` |
| 1,637 | `v3/src/shared/llm/router/types.ts` |
| 1,603 | `v3/src/domains/code-intelligence/services/c4-model/index.ts` |
| 1,595 | `v3/src/coordination/mincut/time-crystal.ts` |
| 1,587 | `v3/src/coordination/protocols/security-audit.ts` |
| 1,583 | `v3/src/governance/ab-benchmarking.ts` |
| 1,566 | `v3/src/coordination/protocols/quality-gate.ts` |
| 1,556 | `v3/src/coordination/mincut/neural-goap.ts` |

---

*Report generated by V3 QE Code Complexity Analyzer on 2026-02-11. All file paths are relative to `/workspaces/agentic-qe-new/v3/src/` unless otherwise noted.*
