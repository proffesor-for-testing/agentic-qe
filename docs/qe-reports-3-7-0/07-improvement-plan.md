# v3.7.0 GOAP Improvement Plan

**Date**: 2026-02-23
**Branch**: working-branch-feb
**Source**: QE Fleet Analysis Reports 01-04 (v3.7.0) + v3.6.8 Improvement Plan (07)
**Execution Framework**: Claude Flow SPARC-GOAP with Hierarchical Swarms
**Baseline**: v3.6.8 Improvement Plan (2026-02-16)

---

## 1. Executive Summary

### Progress Since v3.6.8

The v3.6.8 improvement plan defined 6 phases with 31 goals across 300-340 estimated hours. Significant progress was made on several fronts, while other areas regressed or were left unaddressed.

| Metric | v3.6.8 | v3.7.0 | Delta | Status |
|--------|--------|--------|-------|--------|
| `as any` casts | 103 | 1 | -99% | RESOLVED |
| God files >2000 lines | 10 | 1 | -90% | NEAR-RESOLVED |
| Raw JSON.parse (unguarded) | 90+ | 20 (13 files) | -78% | IN PROGRESS |
| Error coercion (inline) | 724 | 273 (103 files) | -62% | IN PROGRESS |
| Math.random (total) | 170 | 173 (79 files) | +2% | NOT STARTED |
| Math.random (security-relevant) | ~15 | ~12 (targeted) | -20% | PARTIAL |
| Files >500 lines | 397 | 412 | +4% | REGRESSED |
| Files >2000 lines | 10 | 1 | -90% | IMPROVED |
| E2E test files | ~1 | 254 files (66 dirs) | +25,300% | IMPROVED |
| Modules without tests (large files) | 10 | 144 (>500 LOC, no test) | -- | MEASURED |
| `console.*` in src/ | 216 | 3,178 | +1,371% | SEVERELY REGRESSED |
| Silent catch blocks | ~15 | ~130 | +767% | SEVERELY REGRESSED |
| Deep imports (4+ levels) | 23+ | 0 | -100% | RESOLVED |
| Failing tests | 0 | 2 | +2 | REGRESSED |
| npm audit findings | 1 | 0 | -100% | RESOLVED |
| GOAP A* heap optimization | absent | MinHeap implemented | -- | RESOLVED |
| taskTraceContexts bound | absent | 10K FIFO cap | -- | RESOLVED |
| State hash map O(1) | absent | Map-based lookup | -- | RESOLVED |
| findProjectRoot cache | absent | module-level cache | -- | RESOLVED |
| Kernel constructor I/O | sync I/O | zero sync I/O | -- | RESOLVED |
| Mock auth middleware gating | ungated | NODE_ENV whitelist | -- | RESOLVED |
| Command executor (browser) | execSync string concat | spawnSync with arg arrays | -- | RESOLVED |
| BaseDomainCoordinator | absent | 27 coordinators extend it | -- | RESOLVED |
| Path aliases | absent | @shared/*, @kernel/* configured | -- | RESOLVED |
| safeJsonParse adoption | 25 files | 329 calls across 114 files | +356% | IN PROGRESS |
| toErrorMessage utility | absent | 1,049 usages, 268 importing files | -- | IN PROGRESS |

### v3.6.8 Goal Completion Scorecard

| Phase | Goals | Completed | Partial | Not Started |
|-------|-------|-----------|---------|-------------|
| Phase 1: Security | 7 | 4 (SEC-001, SEC-004, SEC-006, SEC-007) | 2 (SEC-002, SEC-003) | 1 (SEC-005) |
| Phase 2: Performance | 8 | 6 (PERF-001 to PERF-005, PERF-007) | 1 (PERF-008) | 1 (PERF-006) |
| Phase 3: Code Quality | 7 | 3 (CQ-001, CQ-002, CQ-004 partial) | 2 (CQ-003, CQ-006) | 2 (CQ-005, CQ-007) |
| Phase 4: Test Coverage | 7 | 0 | 0 | 7 (all deferred) |
| Phase 5: Test Quality | 5 | 1 (TQ-004 partial -- E2E count up) | 0 | 4 |
| Phase 6: Code Hygiene | 5 | 1 (HYG-003 -- deep imports) | 1 (HYG-004) | 3 |
| **Total** | **39** | **15 (38%)** | **6 (15%)** | **18 (46%)** |

### Updated Dimension Scores

| Dimension | v3.6.8 | v3.6.8 Target | v3.7.0 Actual | Delta from 6.8 | Notes |
|-----------|--------|---------------|---------------|-----------------|-------|
| Code Quality | 5.5/10 | 7.5/10 | 6.5/10 | +1.0 | `as any` resolved, base coordinator done, but console explosion |
| Test Quality | 7.2/10 | 8.5/10 | 7.0/10 | -0.2 | 2 failing tests, massive untested file count revealed |
| Security | 6.5/10 | 8.5/10 | 6.0/10 | -0.5 | New critical cmd injection in task-executor; Math.random not fixed |
| Performance | 7.0/10 | 8.5/10 | 8.0/10 | +1.0 | All 8 baseline fixes intact; 0 critical/high new findings |
| Coverage | 62% file | 75%+ | ~56% file | -6% | 144 large files untested; codebase grew faster than tests |
| Complexity | 4.0/10 | 6.5/10 | 5.0/10 | +1.0 | God files 10->1, but CC>50 functions grew 9->12 |

### Target State (After v3.7.0 Plan Execution)

| Dimension | v3.7.0 Current | Target | Delta |
|-----------|---------------|--------|-------|
| Code Quality | 6.5/10 | 8.0/10 | +1.5 |
| Test Quality | 7.0/10 | 8.5/10 | +1.5 |
| Security | 6.0/10 | 8.0/10 | +2.0 |
| Performance | 8.0/10 | 8.5/10 | +0.5 |
| Coverage | ~56% file | 68%+ | +12% |
| Complexity | 5.0/10 | 7.0/10 | +2.0 |

### New Issues Introduced in v3.7.0

| Issue | Severity | Source |
|-------|----------|--------|
| `console.*` pollution: 216 -> 3,178 calls | Critical | Code smells report |
| Silent catch blocks: 15 -> 130 | High | Code smells report |
| 3 new critical command injection in task-executor.ts | Critical | Security report |
| CC>50 functions increased from 9 to 12 | Medium | Complexity report |
| Files >500 lines increased from 397 to 412 | Low | Complexity report |
| 2 failing tests in task-executor.test.ts | High | Test run |
| 144 large files (>500 LOC) with no corresponding test | High | Coverage analysis |
| New ReDoS risk from user-supplied RegExp in 2 files | Medium | Security report |

### Aggregate Finding Counts

| Severity | Security | Performance | Code Smells | Complexity | Test Quality | Total |
|----------|----------|-------------|-------------|------------|--------------|-------|
| Critical | 3 | 0 | 1 (console) | 0 | 0 | **4** |
| High | 4 | 0 | 2 (catch, files) | 12 (CC>50) | 2 (failing) | **20** |
| Medium | 4 | 1 | 2 | 15 (nesting) | 144 (untested) | **166** |
| Low | 2 | 2 | 2 | misc | misc | **~10** |

**Total Estimated Technical Debt**: 80 hours (carry-over) + 60 hours (new regressions) + 80 hours (coverage) = **~220 hours**

---

## 2. Improvement Phases

---

### Phase 1: P0 Critical -- Fix Regressions and New Vulnerabilities

**Sprint Size**: 1 sprint (2 weeks)
**Estimated Effort**: 30 hours
**Goal**: Fix the 2 failing tests, 3 new critical security findings, and the console explosion

---

#### GOAL-FIX-001: Fix 2 Failing Tests in task-executor.test.ts

- **Description**: The coverage analysis test fails because `data.warning` is `undefined` when `toContain` expects a string. The requirements validation test fails because `requirementsAnalyzed` returns 0.
- **Source Finding**: Test run output (2 failures of 42 tests)
- **Preconditions**: None
- **Files to modify**:
  - `v3/tests/unit/coordination/task-executor.test.ts` (lines 319-321 and 487-491)
  - Potentially `v3/src/coordination/task-executor.ts` (coverage/requirements handlers)
- **Agent type**: `coder` for diagnosis and fix
- **Acceptance criteria**:
  - Both tests pass
  - Full test suite shows 0 failures
  - No test logic weakened (assertions must validate real behavior)
- **Estimated complexity**: S
- **Dependencies**: None

#### GOAL-SEC-008: Fix Critical Command Injection in task-executor.ts

- **Description**: Replace `execSync` with string interpolation of `testFiles.join(' ')` at line 1491-1492 with `execFileSync('npx', ['vitest', 'run', ...testFiles])`. Also fix coverageCmd construction at line 952.
- **Source Finding**: SEC-078-001 (Critical, CWE-78), SEC-078-002 (Critical)
- **Preconditions**: None
- **Files to modify**:
  - `v3/src/coordination/task-executor.ts` (lines 952, 1491-1492)
- **Agent type**: `qe-security-scanner` for audit, `coder` for implementation
- **Acceptance criteria**:
  - Zero `execSync` calls with string interpolation of user-provided data in task-executor.ts
  - All `testFiles` passed as array arguments to `execFileSync` or `spawnSync`
  - Existing task-executor tests pass
  - New test verifying shell metacharacters in file paths are handled safely
- **Estimated complexity**: M
- **Dependencies**: GOAL-FIX-001 (tests must pass first)

#### GOAL-SEC-009: Fix Command Injection in loc-counter.ts and test-counter.ts

- **Description**: Replace 9 `execSync` calls with string interpolation in the metric collectors with `execFileSync` using argument arrays.
- **Source Finding**: SEC-078-003 (Critical, CWE-78)
- **Preconditions**: None
- **Files to modify**:
  - `v3/src/domains/code-intelligence/services/metric-collector/loc-counter.ts` (lines 111, 170)
  - `v3/src/domains/code-intelligence/services/metric-collector/test-counter.ts` (lines 209, 299, 341, 388, 441)
- **Agent type**: `coder`
- **Acceptance criteria**:
  - Zero `execSync` calls with template literal interpolation in both files
  - All shell commands converted to `execFileSync` with argument arrays
  - New tests for path sanitization
- **Estimated complexity**: M
- **Dependencies**: None

#### GOAL-SEC-010: Replace Remaining Math.random in Security-Relevant ID Generation

- **Description**: Replace `Math.random()` with `crypto.randomUUID()` in 12 production files that generate IDs for connections, tasks, consensus, and subscriptions.
- **Source Finding**: SEC-338-001 (High, CWE-338) -- carried over from v3.6.8
- **Preconditions**: None
- **Files to modify**:
  - `v3/src/workers/base-worker.ts:303`
  - `v3/src/mcp/connection-pool.ts:364,391`
  - `v3/src/mcp/security/sampling-server.ts:567`
  - `v3/src/routing/routing-feedback.ts:229`
  - `v3/src/coordination/consensus/consensus-engine.ts:628`
  - `v3/src/adapters/a2a/tasks/task-manager.ts:114,115`
  - `v3/src/adapters/a2a/notifications/subscription-store.ts:646`
  - `v3/src/adapters/a2a/notifications/retry-queue.ts:225`
  - `v3/src/strange-loop/belief-reconciler.ts:263`
  - `v3/src/learning/memory-auditor.ts:578`
  - `v3/src/domains/defect-intelligence/services/causal-root-cause-analyzer.ts:442`
- **Agent type**: `coder`
- **Acceptance criteria**:
  - Zero `Math.random()` usage for ID generation in non-ML/non-test code
  - All replaced with `crypto.randomUUID()` or `crypto.randomBytes()`
  - ML/RL/benchmark uses of Math.random explicitly annotated as acceptable
  - All tests pass
- **Estimated complexity**: S
- **Dependencies**: None

#### GOAL-SEC-011: Replace Remaining Raw JSON.parse Calls

- **Description**: Replace the 13 remaining actionable raw `JSON.parse` calls with `safeJsonParse()`.
- **Source Finding**: SEC-1321-001 through SEC-1321-004 -- carried over
- **Preconditions**: None
- **Files to modify**:
  - `v3/src/integrations/ruvector/brain-exporter.ts` (lines 121, 317, 781)
  - `v3/src/integrations/ruvector/rvf-native-adapter.ts` (line 116)
  - `v3/src/coordination/task-executor.ts` (line 1504)
  - `v3/src/sync/cloud/postgres-writer.ts` (lines 358, 390)
  - Remaining 7 files identified in security report
- **Agent type**: `coder`
- **Acceptance criteria**:
  - Zero raw `JSON.parse` calls on external/file/process input
  - All converted to `safeJsonParse()` from shared utils
  - All tests pass
- **Estimated complexity**: S
- **Dependencies**: None

---

### Phase 2: P0 Critical -- Console Pollution and Error Handling Regression

**Sprint Size**: 1 sprint (2 weeks, overlaps Phase 1)
**Estimated Effort**: 35 hours
**Goal**: Address the two largest regressions: console explosion (216 -> 3,178) and silent catch blocks (15 -> 130)

---

#### GOAL-HYGIENE-001: Create CliOutput Abstraction for CLI Layer

- **Description**: Create a `CliOutput` class that wraps `console.log`/`console.error` for CLI user-facing output. This separates legitimate CLI output from production code logging. The CLI layer accounts for ~1,800 of the 3,178 console calls.
- **Source Finding**: Code Smells Report Section 3 (top 20 files are almost all CLI)
- **Preconditions**: None
- **Files to modify**:
  - Create `v3/src/cli/cli-output.ts` (new)
  - `v3/src/cli/commands/*.ts` (15+ files) -- replace direct console calls
  - `v3/src/cli/handlers/*.ts` (5+ files)
  - `v3/src/cli/index.ts`
- **Agent type**: `coder` (3 agents in parallel, one per CLI subdir)
- **Acceptance criteria**:
  - `CliOutput` class created with `log()`, `warn()`, `error()`, `info()`, `debug()` methods
  - Zero direct `console.*` calls in `v3/src/cli/` (all through CliOutput)
  - CliOutput is testable (injectable, mockable)
  - All CLI functionality works unchanged
- **Estimated complexity**: L (touches 20+ files but mechanical replacement)
- **Dependencies**: None

#### GOAL-HYGIENE-002: Replace console.* in Non-CLI Production Code with Structured Logger

- **Description**: Replace all `console.*` calls outside the CLI layer with the structured logger from `v3/src/logging/logger.ts`. Roughly 1,378 calls across non-CLI src/ files.
- **Source Finding**: Code Smells Report Section 3
- **Preconditions**: None (can run parallel to GOAL-HYGIENE-001)
- **Files to modify** (priority subset -- highest count first):
  - `v3/src/domains/chaos-resilience/services/chaos-engineer.ts` (44 calls)
  - `v3/src/performance/run-gates.ts` (29 calls)
  - `v3/src/learning/dream/dream-scheduler.ts` (22 calls)
  - `v3/src/learning/real-qe-reasoning-bank.ts` (21 calls)
  - `v3/src/strange-loop/strange-loop.ts` (15 calls)
  - `v3/src/kernel/unified-memory-migration.ts` (14 calls)
  - ~90 additional non-CLI files
- **Agent type**: `coder` (4 agents in parallel, partitioned by module)
- **Acceptance criteria**:
  - Zero `console.*` calls in `v3/src/` outside of `v3/src/cli/`
  - All replaced with appropriate structured logger methods
  - ESLint rule `no-console` added for src/ with override only for cli/
  - All tests pass
- **Estimated complexity**: L (mechanical but high volume)
- **Dependencies**: None

#### GOAL-HYGIENE-003: Fix Silent Catch Blocks

- **Description**: Add debug-level logging to the ~130 catch blocks that currently suppress errors silently. These grew from ~15 in v3.6.8 to ~130 in v3.7.0.
- **Source Finding**: Code Smells Report (silent catch blocks +767%)
- **Preconditions**: GOAL-HYGIENE-002 (structured logger in place)
- **Files to modify**: ~130 catch blocks across the codebase
- **Agent type**: `coder` (3 agents, partitioned by module)
- **Acceptance criteria**:
  - Zero completely empty catch blocks
  - All catch blocks have at minimum `logger.debug()` with context
  - Error context includes: operation name, relevant IDs, error message
  - All tests pass
- **Estimated complexity**: M
- **Dependencies**: GOAL-HYGIENE-002

#### GOAL-CQ-008: Complete Error Coercion Migration

- **Description**: Replace the remaining 273 inline `error instanceof Error ?` patterns across 103 files with `toErrorMessage()` / `toError()` from `v3/src/shared/error-utils.ts`.
- **Source Finding**: Code Smells Report Section 2; v3.6.8 GOAL-CQ-003 (partial completion)
- **Preconditions**: None
- **Files to modify** (top 10 by count):
  - `v3/src/integrations/browser/agent-browser/client.ts` (32 occurrences)
  - `v3/src/cli/commands/hooks.ts` (17)
  - `v3/src/cli/commands/learning.ts` (14)
  - `v3/src/domains/code-intelligence/services/c4-model/index.ts` (8)
  - `v3/src/mcp/http-server.ts` (8)
  - `v3/src/domains/security-compliance/services/security-auditor.ts` (8)
  - `v3/src/integrations/vibium/client.ts` (8)
  - `v3/src/integrations/agentic-flow/agent-booster/adapter.ts` (7)
  - `v3/src/adapters/a2a/auth/routes.ts` (6)
  - `v3/src/adapters/claude-flow/pretrain-bridge.ts` (5)
  - 93 additional files
- **Agent type**: `coder` (automated regex replacement with validation)
- **Acceptance criteria**:
  - Zero inline `error instanceof Error ? error.message : String(error)` patterns
  - Zero inline `error instanceof Error ? error : new Error(String(error))` patterns
  - All replaced with `toErrorMessage(error)` or `toError(error)`
  - All tests pass
- **Estimated complexity**: M (mechanical across 103 files)
- **Dependencies**: None

---

### Phase 3: P1 -- Complexity Reduction and Code Quality

**Sprint Size**: 2 sprints (4 weeks)
**Estimated Effort**: 50 hours
**Goal**: Reduce the last god file, refactor CC>50 functions, address circular dependencies

---

#### GOAL-CQ-009: Decompose task-executor.ts (2,173 Lines -- Last God File)

- **Description**: Break up the last remaining >2000 line file into focused modules. Extract test execution handler, coverage analysis handler, security scan handler, and requirements validation handler into separate files.
- **Source Finding**: Complexity Report Section 1 (rank 1); v3.6.8 GOAL-CQ-004 carryover
- **Preconditions**: GOAL-FIX-001, GOAL-SEC-008 (fix tests and security first)
- **Files to modify**:
  - `v3/src/coordination/task-executor.ts` (split into 4-5 files)
  - Create `v3/src/coordination/task-handlers/test-execution-handler.ts`
  - Create `v3/src/coordination/task-handlers/coverage-handler.ts`
  - Create `v3/src/coordination/task-handlers/security-handler.ts`
  - Create `v3/src/coordination/task-handlers/requirements-handler.ts`
  - Create `v3/src/coordination/task-handlers/index.ts` (barrel export)
- **Agent type**: `coder` (1 agent per extracted handler)
- **Acceptance criteria**:
  - `task-executor.ts` reduced to <500 lines (orchestration only)
  - Each handler file <500 lines
  - All task-executor tests pass with updated imports
  - No new circular dependencies
- **Estimated complexity**: L
- **Dependencies**: GOAL-FIX-001, GOAL-SEC-008

#### GOAL-CQ-010: Refactor 12 Functions with CC>50

- **Description**: Decompose the 12 critical-complexity functions using Strategy pattern, lookup tables, and extract-method refactoring. This grew from 9 in v3.6.8 to 12 in v3.7.0.
- **Source Finding**: Complexity Report Section 2; v3.6.8 GOAL-CQ-007 (not started)
- **Preconditions**: None
- **Files to modify**:
  - `v3/src/domains/test-execution/services/user-flow-generator.ts` -- `generateTestBlock()` -> Strategy pattern
  - `v3/src/domains/test-generation/services/pattern-matcher.ts` -- `generateMockValue()` and `estimateComplexity()` -> lookup tables
  - `v3/src/mcp/tools/qx-analysis/impact-analyzer.ts` -- `analyze()` -> extract methods
  - `v3/src/domains/test-generation/services/tdd-generator.ts` -- 2 functions -> decompose
  - `v3/src/init/project-analyzer.ts` -- `calculateComplexity()` -> decompose
  - `v3/src/domains/test-generation/generators/base-test-generator.ts` -- `generateTestValue()` -> lookup
  - `v3/src/domains/requirements-validation/` -- analyzers -> extract sub-analyzers
  - 3 new CC>50 functions identified in v3.7.0
- **Agent type**: `coder` (1 agent per function, up to 6 in parallel)
- **Acceptance criteria**:
  - Each function reduced to CC<20
  - Max nesting depth reduced to <=5 in refactored functions
  - All existing tests pass
  - New unit tests for extracted helper functions
- **Estimated complexity**: L
- **Dependencies**: None

#### GOAL-CQ-011: Resolve Bidirectional domains <-> coordination Dependency

- **Description**: Break the circular dependency between `domains` (80 imports from coordination) and `coordination` (13 imports from domains) using event-based communication.
- **Source Finding**: v3.6.8 GOAL-CQ-005 (not started)
- **Preconditions**: GOAL-CQ-009 (task-executor decomposition)
- **Files to modify**:
  - `v3/src/coordination/` files that import from `domains/`
  - Define event contracts for coordination -> domain communication
  - Use existing EventBus for decoupling
- **Agent type**: `coder`, `qe-test-architect`
- **Acceptance criteria**:
  - Zero direct imports from `coordination/` to `domains/`
  - Communication via EventBus or mediator pattern
  - All integration tests pass
- **Estimated complexity**: L
- **Dependencies**: GOAL-CQ-009

#### GOAL-CQ-012: Reduce Files >500 Lines from 412 to <350

- **Description**: Systematically split the 20 largest files between 1500-2000 lines. Each should be decomposed into 2-3 focused modules. This targets a 15% reduction in the >500 line count.
- **Source Finding**: Complexity Report Section 1
- **Preconditions**: GOAL-CQ-009 (task-executor first)
- **Files to modify** (top 20 by size, excluding task-executor):
  - `v3/src/learning/qe-reasoning-bank.ts` (1,941 lines)
  - `v3/src/domains/requirements-validation/qcsd-refinement-plugin.ts` (1,861 lines)
  - `v3/src/domains/contract-testing/services/contract-validator.ts` (1,824 lines)
  - `v3/src/domains/test-generation/services/pattern-matcher.ts` (1,769 lines)
  - `v3/src/domains/learning-optimization/coordinator.ts` (1,750 lines)
  - `v3/src/cli/completions/index.ts` (1,730 lines)
  - `v3/src/coordination/mincut/time-crystal.ts` (1,713 lines)
  - `v3/src/domains/chaos-resilience/coordinator.ts` (1,701 lines)
  - `v3/src/domains/requirements-validation/qcsd-ideation-plugin.ts` (1,698 lines)
  - `v3/src/domains/test-generation/coordinator.ts` (1,673 lines)
  - 10 more files in the 1500-1700 range
- **Agent type**: `coder` (6 agents in parallel, 1 file per agent)
- **Acceptance criteria**:
  - All targeted files reduced to <800 lines
  - Each extracted module has single responsibility
  - Barrel exports maintain backward compatibility
  - All tests pass
  - >500 line file count drops to <350
- **Estimated complexity**: XL (3-5 days with parallel execution)
- **Dependencies**: GOAL-CQ-009

---

### Phase 4: P1 -- Test Coverage for Critical Gaps

**Sprint Size**: 2 sprints (4 weeks)
**Estimated Effort**: 60 hours
**Goal**: Cover the highest-risk untested large files (144 files >500 LOC with no test)

---

#### GOAL-TEST-008: Security Scanner Unit Tests

- **Description**: Write comprehensive unit tests for untested security scanner files. Carried over from v3.6.8 GOAL-TEST-001.
- **Source Finding**: Coverage gap analysis (9 scanner files, 0 tests)
- **Preconditions**: None
- **Files to create**:
  - `v3/tests/unit/domains/security-compliance/scanners/dast-scanner.test.ts`
  - `v3/tests/unit/domains/security-compliance/scanners/dast-auth-testing.test.ts`
  - `v3/tests/unit/domains/security-compliance/scanners/dast-helpers.test.ts`
  - `v3/tests/unit/domains/security-compliance/scanners/dast-injection-testing.test.ts`
  - `v3/tests/unit/domains/security-compliance/scanners/sast-scanner.test.ts`
  - `v3/tests/unit/domains/security-compliance/scanners/dependency-scanner.test.ts`
  - `v3/tests/unit/domains/security-compliance/scanners/scanner-orchestrator.test.ts`
  - `v3/tests/unit/domains/security-compliance/scanners/security-patterns.test.ts`
  - `v3/tests/unit/domains/security-compliance/scanners/semgrep-integration.test.ts`
- **Agent type**: `qe-tdd-red` for stubs, `qe-tdd-green` for validation
- **Acceptance criteria**:
  - Each scanner file has dedicated test with >80% branch coverage
  - Tests cover: happy path, error handling, timeout, malformed input
  - Tests mock external dependencies
- **Estimated complexity**: L
- **Dependencies**: None

#### GOAL-TEST-009: Enterprise Integration Service Tests

- **Description**: Write tests for the 6 untested enterprise integration services, each >700 lines with complex business logic.
- **Source Finding**: Coverage analysis (6 files, 0 tests, avg 770 LOC)
- **Preconditions**: None
- **Files to create**:
  - `v3/tests/unit/domains/enterprise-integration/esb-middleware-service.test.ts`
  - `v3/tests/unit/domains/enterprise-integration/message-broker-service.test.ts`
  - `v3/tests/unit/domains/enterprise-integration/soap-wsdl-service.test.ts`
  - `v3/tests/unit/domains/enterprise-integration/sod-analysis-service.test.ts`
  - `v3/tests/unit/domains/enterprise-integration/odata-service.test.ts`
  - `v3/tests/unit/domains/enterprise-integration/sap-integration-service.test.ts`
- **Agent type**: `qe-tdd-red`
- **Acceptance criteria**:
  - Each service file has dedicated test
  - Tests cover core business logic paths
  - External dependencies mocked
- **Estimated complexity**: L
- **Dependencies**: None

#### GOAL-TEST-010: Strange-Loop and Healing Controller Tests

- **Description**: Write tests for `healing-controller.ts` (906 lines) and `topology-analyzer.ts` (565 lines) which have zero test coverage.
- **Source Finding**: Coverage analysis (critical infrastructure, 0 tests)
- **Preconditions**: None
- **Files to create**:
  - `v3/tests/unit/strange-loop/healing-controller.test.ts`
  - `v3/tests/unit/strange-loop/topology-analyzer.test.ts`
- **Agent type**: `qe-tdd-red`
- **Acceptance criteria**:
  - Healing triggers, recovery flows, and failure scenarios tested
  - Topology analysis algorithms tested with known graphs
  - Error handling and timeouts tested
- **Estimated complexity**: M
- **Dependencies**: None

#### GOAL-TEST-011: Test Execution Domain Services Tests

- **Description**: Write tests for the 5 untested test execution services: retry-handler (824 LOC), test-executor (1,024 LOC), auth-state-manager (503 LOC), step-executors (610 LOC), assertion-handlers (532 LOC).
- **Source Finding**: Coverage analysis (test execution domain, 0 tests for services)
- **Preconditions**: None
- **Files to create**:
  - `v3/tests/unit/domains/test-execution/retry-handler.test.ts`
  - `v3/tests/unit/domains/test-execution/test-executor.test.ts`
  - `v3/tests/unit/domains/test-execution/auth-state-manager.test.ts`
  - `v3/tests/unit/domains/test-execution/step-executors.test.ts`
  - `v3/tests/unit/domains/test-execution/assertion-handlers.test.ts`
- **Agent type**: `qe-tdd-red`
- **Acceptance criteria**:
  - Retry logic tested for backoff, max retries, timeout
  - Test execution lifecycle tested
  - Auth state persistence and expiration tested
  - Step execution for each step type tested
  - Assertion handlers tested with passing and failing cases
- **Estimated complexity**: L
- **Dependencies**: None

#### GOAL-TEST-012: Init Phase and Installer Tests

- **Description**: Write tests for init phases and installer files. Carried over from v3.6.8 GOAL-TEST-004.
- **Source Finding**: Coverage gap (25 of 31 init files untested)
- **Preconditions**: None
- **Files to create**:
  - `v3/tests/unit/init/init-wizard-hooks.test.ts`
  - `v3/tests/unit/init/init-wizard-steps.test.ts`
  - `v3/tests/unit/init/n8n-installer.test.ts`
  - `v3/tests/unit/init/agents-installer.test.ts`
  - Additional phase test files as needed
- **Agent type**: `qe-tdd-red`
- **Acceptance criteria**:
  - Each installer tested for: install flow, rollback on failure, idempotency
  - Init hooks tested for trigger conditions and sequencing
  - Tests mock filesystem and package manager
- **Estimated complexity**: M
- **Dependencies**: None

#### GOAL-TEST-013: Governance Module Unit Tests

- **Description**: Create unit tests for governance files. Carried over from v3.6.8 GOAL-TEST-002.
- **Source Finding**: Coverage gap (15 governance files, limited unit tests)
- **Preconditions**: None
- **Files to create**:
  - `v3/tests/unit/governance/feature-flags.test.ts`
  - `v3/tests/unit/governance/compliance-reporter.test.ts`
  - `v3/tests/unit/governance/ab-benchmarking.test.ts`
  - `v3/tests/unit/governance/constitutional-enforcer.test.ts`
  - Additional governance test files
- **Agent type**: `qe-tdd-red`
- **Acceptance criteria**:
  - Each governance source file has a dedicated unit test
  - Feature flag enable/disable tested
  - Compliance reporting tested with various inputs
  - All tests pass
- **Estimated complexity**: M
- **Dependencies**: None

---

### Phase 5: P2 -- Test Quality and Reliability

**Sprint Size**: 2 sprints (4 weeks)
**Estimated Effort**: 30 hours
**Goal**: Improve test infrastructure quality and reduce flakiness risk

---

#### GOAL-TQ-006: Add vi.useFakeTimers() to Timing-Dependent Tests

- **Description**: Add fake timers to ~45 test files using real setTimeout/Date.now without timer mocking. Carried over from v3.6.8 GOAL-TQ-001.
- **Preconditions**: None
- **Files to modify**: ~45 test files
- **Agent type**: `coder`
- **Acceptance criteria**:
  - All timing-dependent tests use `vi.useFakeTimers()` in beforeEach
  - `vi.useRealTimers()` in afterEach
  - All tests pass
- **Estimated complexity**: M
- **Dependencies**: None

#### GOAL-TQ-007: Add afterEach Cleanup to Test Files Missing It

- **Description**: Add afterEach cleanup blocks with `vi.restoreAllMocks()` to test files that have beforeEach but no afterEach. Carried over from v3.6.8 GOAL-TQ-002.
- **Preconditions**: None
- **Files to modify**: ~160 test files
- **Agent type**: `coder` (automated pattern insertion)
- **Acceptance criteria**:
  - 80%+ of test files with beforeEach also have afterEach
  - afterEach includes `vi.restoreAllMocks()` at minimum
  - All tests pass
- **Estimated complexity**: M
- **Dependencies**: None

#### GOAL-TQ-008: Fix New ReDoS Vulnerabilities

- **Description**: Fix 2 medium-severity ReDoS risks where user-supplied strings are used to construct RegExp objects.
- **Source Finding**: Security Report (SEC-1333, new in v3.7.0)
- **Preconditions**: None
- **Files to modify**: 2 files identified in security report
- **Agent type**: `coder`
- **Acceptance criteria**:
  - User-supplied strings sanitized before RegExp construction
  - Tests added for catastrophic backtracking patterns
- **Estimated complexity**: S
- **Dependencies**: None

---

### Phase 6: P2 -- Code Hygiene and Technical Debt

**Sprint Size**: 1 sprint (2 weeks)
**Estimated Effort**: 15 hours
**Goal**: Address remaining hygiene items and establish regression prevention

---

#### GOAL-HYG-006: Consolidate Magic Numbers

- **Description**: Migrate timeout, size, interval, and threshold values to named constants. Carried over from v3.6.8 GOAL-HYG-002.
- **Preconditions**: None
- **Files to modify**: ~60 files with magic numbers
- **Agent type**: `coder`
- **Acceptance criteria**:
  - All timeout/size/interval values in named constants
  - No bare numeric literals for configuration values
  - All tests pass
- **Estimated complexity**: M
- **Dependencies**: None

#### GOAL-HYG-007: Add Postgres Identifier Validation

- **Description**: Implement identifier validation for PostgreSQL table/column names. Carried over from v3.6.8 GOAL-SEC-005.
- **Preconditions**: None
- **Files to modify**:
  - `v3/src/sync/cloud/postgres-writer.ts`
  - `v3/src/shared/sql-safety.ts`
- **Agent type**: `coder`
- **Acceptance criteria**:
  - All interpolated identifiers validated with regex
  - Tests for SQL injection via identifier manipulation
- **Estimated complexity**: S
- **Dependencies**: None

#### GOAL-HYG-008: Establish CI Quality Gates for Regression Prevention

- **Description**: Add automated quality gates to CI pipeline to prevent regressions on the progress made.
- **Preconditions**: Phases 1-2 complete
- **Files to modify**:
  - `.github/workflows/` (CI configuration)
  - `v3/.eslintrc` or `v3/eslint.config.ts` (add rules)
- **Agent type**: `coder`
- **Acceptance criteria**:
  - `no-console` ESLint rule enforced for src/ (excluding cli/)
  - CI fails on new files >1,500 lines
  - CI fails on new `as any` casts
  - CI reports `console.*` count as metric
  - Test coverage must not decrease
- **Estimated complexity**: M
- **Dependencies**: Phase 1, Phase 2

---

## 3. Swarm Execution Strategy

### 3.1 Phase-Level Swarm Organization

```
Phase 1 (Critical Fixes):   Hierarchical topology, 6 agents
Phase 2 (Regressions):      Hierarchical topology, 8 agents (high parallelism for file count)
Phase 3 (Complexity):       Hierarchical topology, 8 agents (parallel file decomposition)
Phase 4 (Testing):          Mesh topology, 6 agents (independent test writing)
Phase 5 (Test Quality):     Mesh topology, 4 agents
Phase 6 (Hygiene):          Hierarchical topology, 4 agents
```

### 3.2 Agent Assignments

| Phase | Agent Type | Count | Responsibility |
|-------|-----------|-------|---------------|
| 1 | coder | 4 | FIX-001, SEC-008, SEC-009, SEC-010, SEC-011 (parallel streams) |
| 1 | qe-security-scanner | 1 | Validate all security fixes post-implementation |
| 1 | reviewer | 1 | Review command injection fixes for completeness |
| 2 | coder | 6 | Console migration (3 CLI agents + 3 non-CLI agents) |
| 2 | reviewer | 1 | Cross-file consistency review |
| 2 | qe-test-architect | 1 | Validate error handling patterns |
| 3 | coder | 6 | File decomposition (1 file per agent, parallel) |
| 3 | qe-test-architect | 1 | Update test imports |
| 3 | reviewer | 1 | SRP compliance review |
| 4 | qe-tdd-red | 4 | Write test stubs (4 modules in parallel) |
| 4 | qe-tdd-green | 2 | Validate test correctness |
| 5 | coder | 3 | Fake timers, afterEach, ReDoS fixes |
| 5 | qe-flaky-detector | 1 | Validate timer migration |
| 6 | coder | 3 | Magic numbers, SQL safety, CI gates |
| 6 | reviewer | 1 | Quality gate review |

### 3.3 Parallelization Map

```
Phase 1: FIX-001 -> SEC-008 (sequential: fix tests then security)
         SEC-009 || SEC-010 || SEC-011 (all independent, parallel)

Phase 2: HYGIENE-001 || HYGIENE-002 || CQ-008 (all independent, parallel)
         HYGIENE-003 (after HYGIENE-002 -- needs structured logger)

Phase 3: CQ-009 -> CQ-011 (sequential: decompose then decouple)
         CQ-010 (independent, parallel with CQ-009)
         CQ-012 (after CQ-009, parallel with CQ-011)

Phase 4: TEST-008 || TEST-009 || TEST-010 || TEST-011 || TEST-012 || TEST-013 (all independent)

Phase 5: TQ-006 || TQ-007 || TQ-008 (all independent)

Phase 6: HYG-006 || HYG-007 (independent)
         HYG-008 (after Phase 1-2 complete)
```

### 3.4 Memory Sharing Strategy

```bash
# Namespace structure for cross-agent knowledge
npx @claude-flow/cli@latest memory store --namespace "v370-plan" --key "security-fixes" --value "..."
npx @claude-flow/cli@latest memory store --namespace "v370-plan" --key "console-migration-patterns" --value "..."
npx @claude-flow/cli@latest memory store --namespace "v370-plan" --key "file-decomposition-template" --value "..."
npx @claude-flow/cli@latest memory store --namespace "v370-plan" --key "test-stub-patterns" --value "..."

# Shared namespaces:
# - v370-plan/security-fixes          : Command injection fix patterns and validation results
# - v370-plan/console-migration       : CliOutput API, structured logger usage patterns
# - v370-plan/error-coercion          : toErrorMessage/toError migration patterns
# - v370-plan/file-decomposition      : Split patterns, barrel export templates
# - v370-plan/test-patterns           : Test stubs and mocking strategies per domain
```

### 3.5 Swarm Init Commands

```bash
# Phase 1: Critical Fixes (tight coordination needed)
npx @claude-flow/cli@latest swarm init \
  --topology hierarchical \
  --max-agents 6 \
  --strategy specialized

# Phase 2: Console/Error Regression (high parallelism)
npx @claude-flow/cli@latest swarm init \
  --topology hierarchical \
  --max-agents 8 \
  --strategy specialized

# Phase 3: Complexity Reduction (parallel file work)
npx @claude-flow/cli@latest swarm init \
  --topology hierarchical \
  --max-agents 8 \
  --strategy specialized

# Phase 4: Test Coverage (independent test writing)
npx @claude-flow/cli@latest swarm init \
  --topology mesh \
  --max-agents 6 \
  --strategy specialized

# Phase 5-6: Test Quality + Hygiene (smaller scope)
npx @claude-flow/cli@latest swarm init \
  --topology hierarchical \
  --max-agents 4 \
  --strategy specialized
```

---

## 4. Success Metrics and Quality Gates

### 4.1 Phase Quality Gates

| Phase | Gate Criteria | Blocking? |
|-------|--------------|-----------|
| **Phase 1** | Zero failing tests; zero critical security findings; all `execSync` with user input eliminated | YES |
| **Phase 2** | console.* in non-CLI src/ reduced to <50; zero empty catch blocks; error coercion inline count = 0 | YES |
| **Phase 3** | Zero files >2,000 lines; CC>50 functions reduced to <5; files >500 lines < 350 | YES |
| **Phase 4** | 25+ new test files; all pass; security scanners at 80%+ coverage | YES |
| **Phase 5** | Zero ReDoS vulnerabilities; afterEach in 80%+ test files; fake timers in all timing tests | NO (advisory) |
| **Phase 6** | CI quality gates active; magic numbers consolidated; SQL identifiers validated | NO (advisory) |

### 4.2 Target Metrics After Full Execution

| Metric | v3.7.0 Before | After Target | Method of Measurement |
|--------|---------------|-------------|----------------------|
| `as any` casts | 1 | 1 (string literal -- acceptable) | `grep -rn ' as any' v3/src/` |
| Files >500 lines | 412 (41%) | <350 (35%) | `find + wc -l` |
| Files >2000 lines | 1 | 0 | Same |
| Functions CC>50 | 12 | <5 | Complexity analyzer |
| `console.*` in non-CLI src/ | ~1,378 | <50 | grep + exclude cli/ |
| Error coercion (inline) | 273 | 0 | grep for pattern |
| Raw JSON.parse | 20 | 0 | grep |
| Math.random (security IDs) | ~12 | 0 | grep + manual review |
| Silent catch blocks | ~130 | 0 | grep for empty catch |
| Failing tests | 2 | 0 | `npm test` |
| Untested large files (>500 LOC) | 144 | <100 | coverage analysis |
| Critical security findings | 3 | 0 | security rescan |
| High security findings | 4 | 0 | security rescan |
| npm audit vulnerabilities | 0 | 0 | `npm audit` |

### 4.3 Regression Prevention Strategy

1. **CI Quality Gates** (implemented in Phase 6):
   - `no-console` ESLint rule for src/ (excluding cli/)
   - File size warnings at 500 lines, errors at 1,500 lines
   - `as any` count must not increase
   - Test suite must have 0 failures
   - npm audit must pass

2. **ESLint Rules** (progressive enforcement):
   - `no-console` for `v3/src/` with cli/ override (Phase 2)
   - `max-lines` warn at 500, error at 1,500 (Phase 3)
   - Custom `no-raw-json-parse` rule (Phase 1)

3. **Pre-commit Hooks**:
   - Run lint on changed files
   - Run affected tests
   - Warn on new `execSync` with string interpolation

---

## 5. Risk Matrix

### Phase 1: Critical Fixes

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `execFileSync` changes command behavior (no shell features) | Medium | High | Test each command path end-to-end; shell features like pipes need separate handling |
| Fixing tests may mask deeper logic bugs | Low | Medium | Diagnose root cause in handler, not just test assertions |
| `safeJsonParse` rejects valid but unusual JSON | Low | Low | Test with production-representative data |

### Phase 2: Console/Error Regression

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| CliOutput changes CLI output formatting | Medium | Medium | Preserve exact output format; add CLI snapshot tests |
| Structured logger has different semantics than console | Low | Low | Verify log level mapping; test log output |
| Mass replacement introduces import errors | Medium | Low | Run full build + test after each batch |

### Phase 3: Complexity Reduction

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| File decomposition breaks imports across codebase | High | Medium | Use barrel exports; update all imports; build verification |
| CC refactoring changes behavior subtly | Medium | High | 100% test pass rate required; add new tests for extracted functions |
| Circular dependency fix changes event timing | Medium | High | Run full integration test suite |

### Phase 4: Test Coverage

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| New tests are shallow/happy-path only | Medium | Low | Review test quality; require error path coverage |
| Mock-heavy tests hide real bugs | Medium | Medium | Mock at boundaries only; use integration tests for complex flows |
| Test writing slower than estimated | Medium | Low | Prioritize by risk score; ship highest-risk tests first |

### Phase 5-6: Quality and Hygiene

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Fake timer migration breaks timing logic | Medium | Medium | Test each file individually |
| CI gates too strict, block valid PRs | Medium | Low | Start with warnings, escalate to errors after stabilization |
| Magic number extraction changes defaults | Low | High | Review each constant; match exact original values |

### Rollback Plans

| Phase | Rollback Strategy |
|-------|------------------|
| Phase 1 | Each security fix is an independent commit; revert individual commits |
| Phase 2 | Console migration done in batches per module; revert per-module commits |
| Phase 3 | Each file decomposition on a feature branch; independently mergeable |
| Phase 4 | New test files only; deletion reverts to previous state |
| Phase 5 | Test modifications individually revertible |
| Phase 6 | ESLint rules can be set to warn instead of error |

---

## 6. Execution Timeline

```
Week 1-2:   Phase 1 (Critical Fixes: tests, security, JSON.parse, Math.random)
            Phase 2a (HYGIENE-001, HYGIENE-002, CQ-008 -- parallel with Phase 1)
Week 3:     Phase 2b (HYGIENE-003 -- after structured logger)
Week 3-4:   Phase 3a (CQ-009, CQ-010 -- task-executor + CC refactoring)
Week 5-6:   Phase 3b (CQ-011, CQ-012 -- dependencies + file splits)
Week 5-8:   Phase 4 (Test Coverage -- overlaps with Phase 3b, independent)
Week 7-8:   Phase 5 (Test Quality -- overlaps with Phase 4)
Week 8:     Phase 6 (Hygiene and CI gates)
Week 9:     Full regression test + metrics validation + report generation
```

**Total Calendar Time**: ~9 weeks (down from 12 in v3.6.8 plan due to completed work)
**Total Effort**: ~220 hours across all phases
**Estimated Team Size**: 2-3 developers + QE swarm agents

---

## 7. Quick Reference: Goal Dependencies Graph

```
GOAL-FIX-001 ──→ GOAL-SEC-008 ──→ GOAL-CQ-009 ──→ GOAL-CQ-011 ─┐
GOAL-SEC-009 ────────────────────────────────────────────────────┤
GOAL-SEC-010 ────────────────────────────────────────────────────┤ Phase 1
GOAL-SEC-011 ────────────────────────────────────────────────────┘

GOAL-HYGIENE-001 ────────────────────────────────────────────────┐
GOAL-HYGIENE-002 ──→ GOAL-HYGIENE-003 ──────────────────────────┤ Phase 2
GOAL-CQ-008 ────────────────────────────────────────────────────┘

GOAL-CQ-009 ──→ GOAL-CQ-012 (parallel file splits) ────────────┐
GOAL-CQ-009 ──→ GOAL-CQ-011 (dependency decoupling) ───────────┤ Phase 3
GOAL-CQ-010 ── (independent CC refactoring) ────────────────────┘

GOAL-TEST-008 || TEST-009 || TEST-010 || TEST-011               ┐
GOAL-TEST-012 || TEST-013 ── (all independent) ─────────── Phase 4

GOAL-TQ-006 || TQ-007 || TQ-008 ── (all independent) ─── Phase 5

GOAL-HYG-006 || HYG-007 ── (independent) ────────────────┐
GOAL-HYG-008 ── (after Phase 1+2) ───────────────── Phase 6
```

---

## 8. v3.6.8 Goals: Final Disposition

This section provides closure on every goal from the v3.6.8 plan.

| v3.6.8 Goal | Status | Disposition in v3.7.0 Plan |
|-------------|--------|---------------------------|
| SEC-001: Command injection in browser command-executor | COMPLETED | Verified: `spawnSync` with arg arrays |
| SEC-002: Replace JSON.parse with safeJsonParse | 78% COMPLETE | Carried forward as GOAL-SEC-011 (13 remaining) |
| SEC-003: Replace Math.random for ID generation | 20% COMPLETE | Carried forward as GOAL-SEC-010 (12 files) |
| SEC-004: Gate mock auth middleware | COMPLETED | Verified: NODE_ENV whitelist |
| SEC-005: Postgres identifier validation | NOT STARTED | Carried forward as GOAL-HYG-007 |
| SEC-006: Redact password from connection strings | COMPLETED | Verified |
| SEC-007: Fix markdown-it ReDoS | COMPLETED | npm audit clean |
| PERF-001: GOAP A* BinaryHeap | COMPLETED | MinHeap verified in goap-planner.ts |
| PERF-002: Bounded taskTraceContexts | COMPLETED | 10K FIFO cap verified |
| PERF-003: State hash map O(1) | COMPLETED | Map-based lookup verified |
| PERF-004: findProjectRoot single walk | COMPLETED | Module-level cache verified |
| PERF-005: Kernel constructor zero I/O | COMPLETED | Config-only constructor verified |
| PERF-006: Service caches module -> instance | NOT STARTED | Deprioritized (no performance regression) |
| PERF-007: Work-stealing error boundary | COMPLETED | Verified |
| PERF-008: Medium performance batch | PARTIAL | Most items done via PERF-001/003 |
| CQ-001: Fix ConsensusEnabledMixin typing | COMPLETED | `as any` count 103 -> 1 |
| CQ-002: BaseDomainCoordinator abstract class | COMPLETED | 27 coordinators extend it |
| CQ-003: Shared error utilities | 80% COMPLETE | toErrorMessage exists, 273 inline patterns remain -> GOAL-CQ-008 |
| CQ-004: Break top 10 god files | 90% COMPLETE | 10 -> 1 remaining (task-executor) -> GOAL-CQ-009 |
| CQ-005: Resolve bidirectional dependency | NOT STARTED | Carried forward as GOAL-CQ-011 |
| CQ-006: Typed database row interfaces | PARTIAL | Some typed, some remain |
| CQ-007: Refactor CC>50 functions | NOT STARTED | Carried forward as GOAL-CQ-010 (now 12 functions) |
| TEST-001 to TEST-007 | NOT STARTED | Carried forward as GOAL-TEST-008 to TEST-013 (restructured) |
| TQ-001: Fake timers | NOT STARTED | Carried forward as GOAL-TQ-006 |
| TQ-002: afterEach cleanup | NOT STARTED | Carried forward as GOAL-TQ-007 |
| TQ-003: Resolve skipped tests | NOT STARTED | Deferred to v3.7.1 (low priority) |
| TQ-004: E2E tests | PARTIAL | E2E file count grew significantly |
| TQ-005: Split oversized test files | NOT STARTED | Deferred to v3.7.1 |
| HYG-001: Replace console.* with structured logging | NOT STARTED | Replaced by GOAL-HYGIENE-001 and GOAL-HYGIENE-002 |
| HYG-002: Consolidate magic numbers | NOT STARTED | Carried forward as GOAL-HYG-006 |
| HYG-003: Fix deep import paths | COMPLETED | Zero 4+ level imports; path aliases configured |
| HYG-004: Consolidate MCP tool registration | PARTIAL | Improved but not fully consolidated |
| HYG-005: Debug logging in silent catches | NOT STARTED | Carried forward as GOAL-HYGIENE-003 (scope increased 15 -> 130) |

---

## 9. SPARC Phase Mapping

Each improvement goal maps to SPARC methodology phases:

| SPARC Phase | Goals |
|-------------|-------|
| **Specification** | FIX-001 (diagnose root cause), SEC-008/009 (threat model) |
| **Pseudocode** | CQ-010 (design decomposition strategy), CQ-011 (event contract design) |
| **Architecture** | CQ-009 (task handler extraction), HYGIENE-001 (CliOutput API design), CQ-012 (module boundary design) |
| **Refinement** | All TEST-* goals (TDD), CQ-008 (mechanical migration), HYGIENE-002/003 (iterative replacement) |
| **Completion** | HYG-008 (CI gates), all quality gate validations, final regression test |

```bash
# SPARC execution for Phase 1
npx claude-flow sparc run spec-pseudocode "Fix command injection in task-executor.ts"
npx claude-flow sparc tdd "security fix validation tests"

# SPARC execution for Phase 2
npx claude-flow sparc run architect "CliOutput abstraction for CLI layer"
npx claude-flow sparc run refactor "console.* to structured logger migration"

# SPARC execution for Phase 3
npx claude-flow sparc run architect "task-executor.ts decomposition"
npx claude-flow sparc tdd "CC>50 function refactoring"

# SPARC execution for Phase 4
npx claude-flow sparc run test "security scanner comprehensive tests"
npx claude-flow sparc concurrent tdd test-goals.json
```

---

*Plan generated by SPARC-GOAP Planner based on QE Fleet Analysis Reports 01-04 for v3.7.0, with continuity tracking from v3.6.8 plan.*
*2026-02-23*
