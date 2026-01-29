# V3 Quality Improvement Implementation Plan

**Generated:** 2026-01-27
**Based on:** QE Swarm Analysis (Executive Summary, Code Complexity, Security Audit, Performance Analysis, Test Quality, Coverage Gaps)
**Plan Type:** GOAP (Goal-Oriented Action Planning)
**Execution:** Claude-Flow Swarms

---

## Executive Summary

This implementation plan addresses **67 critical gaps** identified across 6 quality analysis reports. The v3 codebase achieves an overall grade of **B+ (80/100)** but requires targeted improvements in:

1. **Code Complexity** - 24 files exceed 500 LOC; 41 `any` types; 1,200+ lines of duplicated handlers
2. **Test Coverage** - 67 untested critical files; 0% coverage on MCP handlers and domain coordinators
3. **Performance** - O(n) algorithms in hot paths; unbounded collections in spreading-activation
4. **Type Safety** - 178 `any` usages; 2,185 magic numbers

**Total Effort Estimate:** 220-280 hours
**Priority Distribution:** P0 (80h), P1 (80h), P2 (60h), P3 (60h)

---

## Problem Registry

### Critical (P0) - Blocks Production Deployment

| ID | Problem | Source Report | Severity | Impact | Current State |
|----|---------|---------------|----------|--------|---------------|
| P0-001 | `security-scanner.ts` is 2,486 lines | Code Complexity | CRITICAL | Maintainability | Monolithic file |
| P0-002 | `e2e-runner.ts` is 2,416 lines | Code Complexity | CRITICAL | Maintainability | Complex orchestration |
| P0-003 | MCP handlers have 0% test coverage | Coverage Gaps | CRITICAL | Reliability | 7 handler files untested |
| P0-004 | Domain coordinators have 0% test coverage | Coverage Gaps | CRITICAL | Reliability | 12 coordinators untested |
| P0-005 | Domain plugins have 0% test coverage | Coverage Gaps | CRITICAL | Reliability | 12 plugins untested |
| P0-006 | 1,200+ lines of duplicate handler code | Code Complexity | HIGH | DRY violation | domain-handlers.ts |
| P0-007 | 41 `any` type usages in critical files | Code Complexity | HIGH | Type safety | Runtime error risk |

### High Priority (P1) - Address Within 1 Week

| ID | Problem | Source Report | Severity | Impact | Current State |
|----|---------|---------------|----------|--------|---------------|
| P1-001 | Background workers have 0% test coverage | Coverage Gaps | HIGH | Quality gates | 10 workers untested |
| P1-002 | Kernel core has 30% test coverage | Coverage Gaps | HIGH | Foundation stability | 7 files need tests |
| P1-003 | O(n) shift() in event-bus.ts hot path | Performance | HIGH | CPU usage | EventHistory uses array |
| P1-004 | O(n log n) sorting on every task enqueue | Performance | HIGH | CPU usage | Priority queue sorting |
| P1-005 | 54 timing-dependent tests may be flaky | Test Quality | HIGH | CI reliability | Uses setTimeout |
| P1-006 | Empty catch blocks (9 instances) | Code Complexity | HIGH | Error visibility | Silent failures |
| P1-007 | 1,841 console.log in production code | Code Complexity | MEDIUM | Log noise | Needs structured logger |
| P1-008 | 33 TODO/FIXME comments | Executive Summary | MEDIUM | Incomplete features | Technical debt |

### Medium Priority (P2) - Address Within 2 Weeks

| ID | Problem | Source Report | Severity | Impact | Current State |
|----|---------|---------------|----------|--------|---------------|
| P2-001 | Learning system has low test coverage | Coverage Gaps | MEDIUM | Learning quality | 11 files untested |
| P2-002 | Sync system has 0% test coverage | Coverage Gaps | MEDIUM | Data consistency | 6 files untested |
| P2-003 | Unbounded history in spreading-activation | Performance | MEDIUM | Memory leak risk | No cleanup mechanism |
| P2-004 | 2,185 magic numbers | Code Complexity | LOW | Readability | Hardcoded values |
| P2-005 | 20+ deprecated interfaces | Executive Summary | LOW | Migration debt | Cleanup needed |
| P2-006 | Routing system gaps | Coverage Gaps | MEDIUM | Model selection | 3 files untested |
| P2-007 | Error path coverage at 70% | Test Quality | MEDIUM | Error handling | Needs improvement |

### Low Priority (P3) - Address in Maintenance

| ID | Problem | Source Report | Severity | Impact | Current State |
|----|---------|---------------|----------|--------|---------------|
| P3-001 | MCP Tools have minimal coverage | Coverage Gaps | LOW | Tool reliability | 16 dirs untested |
| P3-002 | Strange Loop partial coverage | Coverage Gaps | LOW | Self-healing | 4 files untested |
| P3-003 | Security event logging missing | Security Audit | LOW | Compliance | A09 enhancement |
| P3-004 | SSRF protection enhancement | Security Audit | LOW | Security | A10 enhancement |
| P3-005 | Subscription filtering is O(n) | Performance | LOW | Event dispatch | Needs indexing |

---

## Phase 1: Critical Fixes (P0)

### Milestone 1.1: Split Security Scanner into Sub-modules

- **Goal State**: `security-scanner.ts` refactored into 5 focused services, each under 600 LOC
- **Preconditions**:
  - Read and understand current security-scanner.ts (2,486 lines)
  - Map all public exports and consumers
- **Actions**:
  1. Create `/v3/src/domains/security-compliance/services/sast/` directory
  2. Extract SAST analysis to `sast-scanner.ts`
  3. Extract DAST analysis to `dast-scanner.ts`
  4. Extract dependency scanning to `dependency-scanner.ts`
  5. Extract secret detection to `secret-scanner.ts`
  6. Create `scanner-orchestrator.ts` for coordination
  7. Update all imports across codebase
  8. Run existing tests to verify no regression
- **Agent Assignment**:
  - Lead: `system-architect` (design decomposition)
  - Execute: `coder` x 2 (parallel extraction)
  - Verify: `tester` (regression testing)
- **Success Criteria**:
  - [ ] No file exceeds 600 LOC
  - [ ] All existing tests pass
  - [ ] Cyclomatic complexity reduced by 60%
  - [ ] All exports maintain backward compatibility
- **Complexity**: HIGH
- **Estimated Effort**: 16 hours

---

### Milestone 1.2: Split E2E Runner into Orchestrator/Executor

- **Goal State**: `e2e-runner.ts` split into modular components under 600 LOC each
- **Preconditions**:
  - Read and understand current e2e-runner.ts (2,416 lines)
  - Identify browser orchestration vs test execution logic
- **Actions**:
  1. Create `/v3/src/domains/test-execution/services/e2e/` directory
  2. Extract browser orchestration to `browser-orchestrator.ts`
  3. Extract test executor to `test-executor.ts`
  4. Extract result collector to `result-collector.ts`
  5. Extract retry/flaky logic to `retry-handler.ts`
  6. Create coordinator to wire components
  7. Update imports and run tests
- **Agent Assignment**:
  - Lead: `system-architect` (design decomposition)
  - Execute: `coder` x 2 (parallel extraction)
  - Verify: `tester` (regression testing)
- **Success Criteria**:
  - [ ] No file exceeds 600 LOC
  - [ ] All existing tests pass
  - [ ] Browser orchestration isolated for testing
  - [ ] E2E execution maintains same behavior
- **Complexity**: HIGH
- **Estimated Effort**: 12 hours

---

### Milestone 1.3: Create MCP Handler Factory Pattern

- **Goal State**: 11 duplicate handlers replaced with generic factory, reducing 1,200+ lines
- **Preconditions**:
  - Analyze common patterns in domain-handlers.ts
  - Define generic handler interface
- **Actions**:
  1. Create `createDomainHandler<TRequest, TResponse>()` factory function
  2. Define configuration interface with domain, action, validators, mappers
  3. Create domain-specific mappers for each handler
  4. Replace each handler with factory instantiation
  5. Add comprehensive tests for factory
  6. Remove duplicate code
- **Agent Assignment**:
  - Lead: `system-architect` (factory design)
  - Execute: `coder` (factory implementation)
  - Verify: `tester` (factory tests)
- **Success Criteria**:
  - [ ] Single factory function handles all domains
  - [ ] Handler file reduced from ~1,578 to ~400 LOC
  - [ ] All MCP tool calls work identically
  - [ ] Factory has 100% test coverage
- **Complexity**: MEDIUM
- **Estimated Effort**: 16 hours

---

### Milestone 1.4: Add MCP Handler Unit Tests

- **Goal State**: All 7 MCP handler files have comprehensive unit tests with 90%+ coverage
- **Preconditions**:
  - Milestone 1.3 complete (handler factory pattern)
  - Mock fleet initialization available
- **Actions**:
  1. Create `tests/unit/mcp/handlers/agent-handlers.test.ts`
  2. Create `tests/unit/mcp/handlers/core-handlers.test.ts`
  3. Create `tests/unit/mcp/handlers/memory-handlers.test.ts`
  4. Create `tests/unit/mcp/handlers/task-handlers.test.ts`
  5. Test happy paths for all public APIs
  6. Test "fleet not initialized" error paths
  7. Test edge cases (concurrent calls, invalid inputs)
- **Agent Assignment**:
  - Lead: `qe-test-architect` (test design)
  - Execute: `qe-tdd-specialist` x 3 (parallel test writing)
  - Verify: `qe-coverage-specialist` (coverage analysis)
- **Success Criteria**:
  - [ ] 90%+ line coverage for each handler file
  - [ ] All error paths tested
  - [ ] All edge cases tested
  - [ ] Tests are not flaky (no timing dependencies)
- **Complexity**: HIGH
- **Estimated Effort**: 24 hours

---

### Milestone 1.5: Add Domain Coordinator Unit Tests

- **Goal State**: All 12 domain coordinators have unit tests with 80%+ coverage
- **Preconditions**:
  - Mock dependencies (EventBus, Memory, Router) available
  - Test patterns established from Milestone 1.4
- **Actions**:
  1. Create shared coordinator test utilities
  2. Create test file for each coordinator (12 files)
  3. Test task routing logic
  4. Test health reporting
  5. Test agent management
  6. Test event handling
  7. Test cross-domain communication
- **Agent Assignment**:
  - Lead: `qe-test-architect` (test design)
  - Execute: `qe-tdd-specialist` x 4 (parallel, 3 coordinators each)
  - Verify: `qe-coverage-specialist` (coverage analysis)
- **Success Criteria**:
  - [ ] 80%+ coverage for each coordinator
  - [ ] Task routing tested for each domain
  - [ ] Error paths tested
  - [ ] Integration with Queen tested
- **Complexity**: HIGH
- **Estimated Effort**: 36 hours

---

### Milestone 1.6: Add Domain Plugin Unit Tests

- **Goal State**: All 12 domain plugins have unit tests with 80%+ coverage
- **Preconditions**:
  - Milestone 1.5 complete (coordinator tests establish patterns)
  - Mock task execution environment available
- **Actions**:
  1. Create shared plugin test utilities
  2. Create test file for each plugin (12 files)
  3. Test `executeTask()` for each domain
  4. Test `canHandleTask()` logic
  5. Test lifecycle methods
  6. Test event handling
  7. Test result callbacks
- **Agent Assignment**:
  - Lead: `qe-test-architect` (test design)
  - Execute: `qe-tdd-specialist` x 4 (parallel, 3 plugins each)
  - Verify: `qe-coverage-specialist` (coverage analysis)
- **Success Criteria**:
  - [ ] 80%+ coverage for each plugin
  - [ ] `executeTask()` tested with various inputs
  - [ ] `canHandleTask()` boundary conditions tested
  - [ ] Lifecycle methods tested
- **Complexity**: HIGH
- **Estimated Effort**: 24 hours

---

### Milestone 1.7: Fix Type Safety Gaps in Critical Files

- **Goal State**: All 41 `any` types in critical files replaced with proper types
- **Preconditions**:
  - Type definitions available for all data structures
  - Understanding of data flow through the system
- **Actions**:
  1. Audit all 41 `any` usages and categorize
  2. Create missing type definitions
  3. Replace `any` with proper types or `unknown` with guards
  4. Focus on high-risk files:
     - `queen-coordinator.ts` (3 instances)
     - `domain-handlers.ts` (5 instances)
     - `init-wizard.ts` (4 instances)
  5. Run TypeScript strict mode check
- **Agent Assignment**:
  - Lead: `system-architect` (type design)
  - Execute: `coder` (type replacement)
  - Verify: `reviewer` (type review)
- **Success Criteria**:
  - [ ] Zero `any` types in critical coordination files
  - [ ] TypeScript compiles without suppressions
  - [ ] All tests pass
- **Complexity**: MEDIUM
- **Estimated Effort**: 8 hours

---

## Phase 2: High Priority (P1)

### Milestone 2.1: Add Background Worker Unit Tests

- **Goal State**: All 10 background workers have unit tests with 70%+ coverage
- **Preconditions**:
  - Mock base-worker framework available
  - Understanding of each worker's purpose
- **Actions**:
  1. Create tests for each worker:
     - `security-scan.ts` (CRITICAL - first priority)
     - `quality-gate.ts` (HIGH)
     - `defect-predictor.ts` (HIGH)
     - `learning-consolidation.ts` (HIGH)
     - `compliance-checker.ts` (HIGH)
     - `coverage-tracker.ts` (MEDIUM)
     - `flaky-detector.ts` (MEDIUM)
     - `performance-baseline.ts` (MEDIUM)
     - `regression-monitor.ts` (MEDIUM)
     - `test-health.ts` (MEDIUM)
  2. Test worker lifecycle
  3. Test processing logic
  4. Test error handling
- **Agent Assignment**:
  - Lead: `qe-test-architect` (test design)
  - Execute: `qe-tdd-specialist` x 2 (parallel)
  - Verify: `qe-security-scanner` (security worker validation)
- **Success Criteria**:
  - [ ] 70%+ coverage for each worker
  - [ ] Security-scan worker fully tested
  - [ ] Error paths tested
  - [ ] No flaky tests
- **Complexity**: HIGH
- **Estimated Effort**: 20 hours

---

### Milestone 2.2: Add Kernel Core Unit Tests

- **Goal State**: All 7 kernel files have unit tests with 80%+ coverage
- **Preconditions**:
  - Mock memory backends available
  - Mock plugin loader available
- **Actions**:
  1. Create `tests/unit/kernel/kernel.test.ts`
  2. Create `tests/unit/kernel/plugin-loader.test.ts`
  3. Create `tests/unit/kernel/hybrid-backend.test.ts`
  4. Create `tests/unit/kernel/unified-memory.test.ts`
  5. Create `tests/unit/kernel/unified-persistence.test.ts`
  6. Create `tests/unit/kernel/memory-factory.test.ts`
  7. Test initialization sequences
  8. Test plugin loading scenarios
  9. Test memory fallbacks
- **Agent Assignment**:
  - Lead: `qe-test-architect` (test design)
  - Execute: `qe-tdd-specialist` x 2 (parallel)
  - Verify: `qe-coverage-specialist` (coverage analysis)
- **Success Criteria**:
  - [ ] 80%+ coverage for kernel.ts
  - [ ] Plugin loading scenarios tested
  - [ ] Memory backend fallbacks tested
  - [ ] Error paths tested
- **Complexity**: HIGH
- **Estimated Effort**: 16 hours

---

### Milestone 2.3: Optimize Event Bus Performance

- **Goal State**: Event bus uses O(1) operations for all hot paths
- **Preconditions**:
  - CircularBuffer utility available (already exists)
  - Event bus tests available
- **Actions**:
  1. Replace `eventHistory` array with CircularBuffer
  2. Create subscription index by event type
  3. Replace O(n) filter with O(1) lookup
  4. Benchmark before/after
- **Agent Assignment**:
  - Lead: `qe-performance-tester` (design)
  - Execute: `coder` (implementation)
  - Verify: `tester` (regression testing)
- **Success Criteria**:
  - [ ] eventHistory uses CircularBuffer
  - [ ] Subscription lookup is O(1)
  - [ ] Benchmark shows 60%+ improvement
  - [ ] All existing tests pass
- **Complexity**: MEDIUM
- **Estimated Effort**: 8 hours

---

### Milestone 2.4: Optimize Task Queue Sorting

- **Goal State**: Task queue uses efficient insertion sort or heap
- **Preconditions**:
  - Understanding of priority queue requirements
  - Queen coordinator tests available
- **Actions**:
  1. Analyze task insertion patterns
  2. Implement insertion sort (for mostly-sorted data) OR
  3. Implement binary heap data structure
  4. Replace O(n log n) sort with O(log n) insertion
  5. Benchmark before/after
- **Agent Assignment**:
  - Lead: `qe-performance-tester` (design)
  - Execute: `coder` (implementation)
  - Verify: `tester` (regression testing)
- **Success Criteria**:
  - [ ] Task insertion is O(log n) or better
  - [ ] Benchmark shows 50%+ improvement
  - [ ] All Queen tests pass
- **Complexity**: MEDIUM
- **Estimated Effort**: 8 hours

---

### Milestone 2.5: Fix Timing-Dependent Tests

- **Goal State**: All 54 timing-dependent tests converted to use fake timers
- **Preconditions**:
  - List of timing-dependent test files
  - vi.useFakeTimers() patterns established
- **Actions**:
  1. Identify all `setTimeout`/`setInterval` usages in tests
  2. Convert to `vi.useFakeTimers()`
  3. Use `vi.advanceTimersByTime()` for deterministic control
  4. Update tests in:
     - `git-aware-selector.test.ts` (11 instances)
     - `morphogenetic-growth.test.ts` (6 instances)
     - `metrics-collector.test.ts` (7 instances)
     - `phase-scheduler.test.ts` (4 instances)
     - And others
  5. Run tests multiple times to verify no flakiness
- **Agent Assignment**:
  - Lead: `qe-test-architect` (patterns)
  - Execute: `qe-flaky-hunter` x 2 (parallel conversion)
  - Verify: `qe-parallel-executor` (repeated execution)
- **Success Criteria**:
  - [ ] Zero setTimeout/setInterval in test assertions
  - [ ] All tests use fake timers
  - [ ] Tests pass 100 consecutive runs
- **Complexity**: MEDIUM
- **Estimated Effort**: 12 hours

---

### Milestone 2.6: Fix Empty Catch Blocks

- **Goal State**: All 9 empty catch blocks have proper error handling
- **Preconditions**:
  - List of empty catch block locations
  - Logger service available
- **Actions**:
  1. Find all empty catch blocks
  2. For each, determine if error should be:
     - Logged and ignored (non-critical)
     - Logged and re-thrown (critical)
     - Handled with fallback
  3. Implement appropriate handling
  4. Add tests for error paths
- **Agent Assignment**:
  - Execute: `coder` (error handling)
  - Verify: `tester` (error path tests)
- **Success Criteria**:
  - [ ] Zero empty catch blocks
  - [ ] All errors logged with context
  - [ ] Critical errors propagated
- **Complexity**: LOW
- **Estimated Effort**: 4 hours

---

### Milestone 2.7: Implement Structured Logging Facade

- **Goal State**: Centralized logger with log levels replaces console.log
- **Preconditions**:
  - Logger interface defined
  - Understanding of log level requirements
- **Actions**:
  1. Create `Logger` interface with levels (debug, info, warn, error)
  2. Create `LoggerFactory` for creating domain-specific loggers
  3. Implement console adapter for backward compatibility
  4. Create PR to replace high-priority console.log (services)
  5. Leave CLI console.log (expected behavior)
- **Agent Assignment**:
  - Lead: `system-architect` (logger design)
  - Execute: `coder` (implementation)
  - Verify: `tester` (logger tests)
- **Success Criteria**:
  - [ ] Logger facade with log levels
  - [ ] Services use structured logging
  - [ ] CLI retains console.log
  - [ ] Log output includes context
- **Complexity**: MEDIUM
- **Estimated Effort**: 12 hours

---

## Phase 3: Medium Priority (P2)

### Milestone 3.1: Add Learning System Tests

- **Goal State**: Learning system files have 70%+ test coverage
- **Preconditions**:
  - Mock memory and persistence available
  - Understanding of learning patterns
- **Actions**:
  1. Create tests for:
     - `qe-hooks.ts` (lifecycle hooks)
     - `pattern-store.ts` (persistence)
     - `experience-capture.ts` (capture flow)
     - `qe-guidance.ts` (guidance logic)
     - `v2-to-v3-migration.ts` (migration)
  2. Test pattern learning flow
  3. Test cross-domain transfer
- **Agent Assignment**:
  - Lead: `qe-test-architect`
  - Execute: `qe-tdd-specialist` x 2
  - Verify: `qe-learning-coordinator` (learning validation)
- **Success Criteria**:
  - [ ] 70%+ coverage for learning files
  - [ ] Pattern store persistence tested
  - [ ] Migration scenarios tested
- **Complexity**: MEDIUM
- **Estimated Effort**: 20 hours

---

### Milestone 3.2: Add Sync System Tests

- **Goal State**: Sync system files have unit tests with 70%+ coverage
- **Preconditions**:
  - Mock database available
  - Mock tunnel manager available
- **Actions**:
  1. Create `tests/unit/sync/sync-agent.test.ts`
  2. Create `tests/unit/sync/claude-flow-bridge.test.ts`
  3. Create `tests/unit/sync/cloud/postgres-writer.test.ts`
  4. Create `tests/unit/sync/cloud/tunnel-manager.test.ts`
  5. Test sync operations
  6. Test error handling
  7. Test security (tunnel management)
- **Agent Assignment**:
  - Lead: `qe-test-architect`
  - Execute: `qe-tdd-specialist`
  - Verify: `qe-security-scanner` (security tests)
- **Success Criteria**:
  - [ ] 70%+ coverage for sync files
  - [ ] Cloud writer tested
  - [ ] Tunnel security tested
- **Complexity**: MEDIUM
- **Estimated Effort**: 12 hours

---

### Milestone 3.3: Add Bounds to Spreading Activation

- **Goal State**: Spreading activation history has bounds and cleanup
- **Preconditions**:
  - Understanding of dream cycle patterns
  - Performance tests available
- **Actions**:
  1. Add `MAX_HISTORY_ENTRIES` constant
  2. Implement `trimHistory()` method
  3. Call trim after each activation cycle
  4. Add tests for bounds
- **Agent Assignment**:
  - Execute: `coder` (implementation)
  - Verify: `qe-performance-tester` (memory testing)
- **Success Criteria**:
  - [ ] History bounded at MAX entries
  - [ ] Memory stable in long sessions
  - [ ] Dream cycle unaffected
- **Complexity**: LOW
- **Estimated Effort**: 4 hours

---

### Milestone 3.4: Extract Magic Numbers to Constants

- **Goal State**: High-priority magic numbers (timeouts, sizes) extracted to named constants
- **Preconditions**:
  - List of magic number locations
  - Naming conventions defined
- **Actions**:
  1. Focus on top 100 occurrences in critical files
  2. Create constants files per module
  3. Use descriptive names with units
  4. Add JSDoc comments explaining values
- **Agent Assignment**:
  - Execute: `coder` (extraction)
  - Verify: `reviewer` (code review)
- **Success Criteria**:
  - [ ] Top 100 magic numbers extracted
  - [ ] Constants have meaningful names
  - [ ] Comments explain rationale
- **Complexity**: LOW
- **Estimated Effort**: 8 hours

---

### Milestone 3.5: Add Routing System Tests

- **Goal State**: Routing files (TinyDancer, classifier) have 80%+ coverage
- **Preconditions**:
  - Understanding of routing logic
  - Mock model providers available
- **Actions**:
  1. Create `tests/unit/routing/tiny-dancer-router.test.ts`
  2. Create `tests/unit/routing/task-classifier.test.ts`
  3. Create `tests/unit/routing/routing-config.test.ts`
  4. Test tier selection logic
  5. Test classification accuracy
- **Agent Assignment**:
  - Lead: `qe-test-architect`
  - Execute: `qe-tdd-specialist`
  - Verify: `qe-coverage-specialist`
- **Success Criteria**:
  - [ ] 80%+ coverage for routing
  - [ ] TinyDancer tier selection tested
  - [ ] Classifier accuracy validated
- **Complexity**: MEDIUM
- **Estimated Effort**: 8 hours

---

### Milestone 3.6: Improve Error Path Coverage to 85%

- **Goal State**: Error path coverage improved from 70% to 85%
- **Preconditions**:
  - Error scenarios identified
  - Mock error injection available
- **Actions**:
  1. Identify missing error scenarios from Test Quality report
  2. Add tests for:
     - Memory backend failures
     - Concurrent modification errors
     - Resource exhaustion
     - Partial failure recovery
     - Timeout cascades
  3. Use error injection patterns
- **Agent Assignment**:
  - Lead: `qe-test-architect`
  - Execute: `qe-chaos-engineer` (error injection)
  - Verify: `qe-coverage-specialist`
- **Success Criteria**:
  - [ ] Error path coverage at 85%+
  - [ ] All major services have error tests
  - [ ] Recovery scenarios tested
- **Complexity**: MEDIUM
- **Estimated Effort**: 12 hours

---

## Phase 4: Lower Priority (P3)

### Milestone 4.1: Add MCP Tool Tests

- **Goal State**: Critical MCP tool directories have 70%+ coverage
- **Preconditions**:
  - Phase 1 and 2 complete
  - Tool execution patterns established
- **Actions**:
  1. Create tests for security-compliance tools
  2. Create tests for chaos-resilience tools
  3. Create tests for test-generation tools
  4. Create tests for coverage-analysis tools
- **Agent Assignment**:
  - Execute: `qe-tdd-specialist` x 2
  - Verify: `qe-coverage-specialist`
- **Success Criteria**:
  - [ ] 70%+ coverage for critical tools
  - [ ] Security tools fully tested
- **Complexity**: MEDIUM
- **Estimated Effort**: 20 hours

---

### Milestone 4.2: Complete Strange Loop Tests

- **Goal State**: Strange Loop components have 80%+ coverage
- **Preconditions**:
  - Existing strange-loop tests as reference
- **Actions**:
  1. Create `tests/unit/strange-loop/healing-controller.test.ts`
  2. Create `tests/unit/strange-loop/self-model.test.ts`
  3. Create `tests/unit/strange-loop/swarm-observer.test.ts`
  4. Create `tests/unit/strange-loop/topology-analyzer.test.ts`
- **Agent Assignment**:
  - Execute: `qe-tdd-specialist`
  - Verify: `qe-coverage-specialist`
- **Success Criteria**:
  - [ ] 80%+ coverage for strange-loop
  - [ ] Self-healing tested
- **Complexity**: LOW
- **Estimated Effort**: 8 hours

---

### Milestone 4.3: Add Security Event Logging

- **Goal State**: Security events are logged for compliance (OWASP A09)
- **Preconditions**:
  - Structured logger from Milestone 2.7
  - Security audit requirements understood
- **Actions**:
  1. Create SecurityEventLogger
  2. Log authentication attempts
  3. Log rate limit violations
  4. Log command execution
  5. Log path traversal attempts
- **Agent Assignment**:
  - Lead: `qe-security-auditor`
  - Execute: `coder`
  - Verify: `qe-security-scanner`
- **Success Criteria**:
  - [ ] All security events logged
  - [ ] Logs include timestamps and context
  - [ ] A09 compliance achieved
- **Complexity**: MEDIUM
- **Estimated Effort**: 8 hours

---

### Milestone 4.4: Add SSRF Protection

- **Goal State**: SSRF protection layer implemented (OWASP A10)
- **Preconditions**:
  - URL validation patterns available
- **Actions**:
  1. Create URL allowlist/blocklist
  2. Block private IP ranges
  3. Add DNS rebinding protection
  4. Add tests for SSRF prevention
- **Agent Assignment**:
  - Lead: `qe-security-auditor`
  - Execute: `coder`
  - Verify: `qe-security-scanner`
- **Success Criteria**:
  - [ ] SSRF protection implemented
  - [ ] Private IPs blocked
  - [ ] A10 compliance achieved
- **Complexity**: MEDIUM
- **Estimated Effort**: 8 hours

---

### Milestone 4.5: Add Subscription Pre-indexing

- **Goal State**: Event bus subscriptions indexed by type for O(1) lookup
- **Preconditions**:
  - Event bus tests available
  - Performance benchmarks available
- **Actions**:
  1. Create subscription index Map<EventType, Set<Subscription>>
  2. Update subscribe() to add to index
  3. Update unsubscribe() to remove from index
  4. Update publish() to use index lookup
- **Agent Assignment**:
  - Execute: `coder`
  - Verify: `qe-performance-tester`
- **Success Criteria**:
  - [ ] Subscription lookup is O(1)
  - [ ] Memory overhead acceptable
  - [ ] All tests pass
- **Complexity**: LOW
- **Estimated Effort**: 4 hours

---

## Dependency Graph

```
Phase 1 (P0):
  1.1 Split Security Scanner ─────────────────────────────────────┐
  1.2 Split E2E Runner ───────────────────────────────────────────┤
  1.3 Create Handler Factory ─────────────────┬───────────────────┤
                                              │                   │
                                              v                   │
  1.4 Add MCP Handler Tests ──────────────────┤                   │
                                              │                   │
                                              v                   v
  1.5 Add Coordinator Tests ──────────────────┼───> Phase 2 (P1)
                                              │
                                              v
  1.6 Add Plugin Tests ───────────────────────┤
  1.7 Fix Type Safety ────────────────────────┘

Phase 2 (P1):
  2.1 Add Worker Tests
  2.2 Add Kernel Tests
  2.3 Optimize Event Bus ────────────────────────────────────────┐
  2.4 Optimize Task Queue                                        │
  2.5 Fix Timing Tests                                           │
  2.6 Fix Empty Catches                                          │
  2.7 Implement Logger ──────────────────────────────────────────┼───> Phase 3 (P2)
                                                                 │
Phase 3 (P2):                                                    │
  3.1 Add Learning Tests                                         │
  3.2 Add Sync Tests                                             │
  3.3 Add Spreading Bounds                                       │
  3.4 Extract Magic Numbers                                      │
  3.5 Add Routing Tests                                          │
  3.6 Improve Error Coverage ────────────────────────────────────┼───> Phase 4 (P3)
                                                                 │
Phase 4 (P3):                                                    │
  4.1 Add MCP Tool Tests                                         │
  4.2 Complete Strange Loop                                      │
  4.3 Add Security Logging ──────────────────────────────────────┘
  4.4 Add SSRF Protection
  4.5 Add Subscription Index
```

---

## Swarm Execution Strategy

### Team Alpha: Code Refactoring Swarm (Milestones 1.1, 1.2, 1.3)

```yaml
topology: hierarchical
max_agents: 8
strategy: specialized

agents:
  - role: coordinator
    type: system-architect
    tasks: [design decomposition, interface definition]

  - role: coder-1
    type: coder
    tasks: [security-scanner extraction]

  - role: coder-2
    type: coder
    tasks: [e2e-runner extraction]

  - role: coder-3
    type: coder
    tasks: [handler factory implementation]

  - role: tester
    type: tester
    tasks: [regression testing]

  - role: reviewer
    type: reviewer
    tasks: [code review, merge approval]

execution_order:
  parallel: [1.1, 1.2]
  sequential: [1.3]
```

### Team Beta: Test Coverage Swarm (Milestones 1.4, 1.5, 1.6, 2.1, 2.2)

```yaml
topology: mesh
max_agents: 12
strategy: specialized

agents:
  - role: architect
    type: qe-test-architect
    tasks: [test design, pattern definition]

  - role: tdd-1
    type: qe-tdd-specialist
    tasks: [handler tests]

  - role: tdd-2
    type: qe-tdd-specialist
    tasks: [coordinator tests 1-4]

  - role: tdd-3
    type: qe-tdd-specialist
    tasks: [coordinator tests 5-8]

  - role: tdd-4
    type: qe-tdd-specialist
    tasks: [coordinator tests 9-12]

  - role: tdd-5
    type: qe-tdd-specialist
    tasks: [plugin tests 1-6]

  - role: tdd-6
    type: qe-tdd-specialist
    tasks: [plugin tests 7-12]

  - role: tdd-7
    type: qe-tdd-specialist
    tasks: [worker tests]

  - role: tdd-8
    type: qe-tdd-specialist
    tasks: [kernel tests]

  - role: coverage
    type: qe-coverage-specialist
    tasks: [coverage analysis, gap detection]

  - role: flaky-hunter
    type: qe-flaky-hunter
    tasks: [timing test conversion]

execution_order:
  sequential: [1.4]  # Establish patterns
  parallel: [1.5, 1.6, 2.1, 2.2]  # Execute in parallel
```

### Team Gamma: Performance Optimization Swarm (Milestones 2.3, 2.4, 4.5)

```yaml
topology: hierarchical
max_agents: 4
strategy: specialized

agents:
  - role: analyst
    type: qe-performance-tester
    tasks: [benchmark, profile, analyze]

  - role: optimizer-1
    type: coder
    tasks: [event-bus optimization]

  - role: optimizer-2
    type: coder
    tasks: [task-queue optimization]

  - role: verifier
    type: tester
    tasks: [regression testing]

execution_order:
  parallel: [2.3, 2.4, 4.5]
```

### Team Delta: Security Enhancement Swarm (Milestones 4.3, 4.4)

```yaml
topology: hierarchical
max_agents: 4
strategy: specialized

agents:
  - role: auditor
    type: qe-security-auditor
    tasks: [requirement analysis, compliance check]

  - role: implementer
    type: coder
    tasks: [security logging, SSRF protection]

  - role: scanner
    type: qe-security-scanner
    tasks: [vulnerability testing]

execution_order:
  sequential: [4.3, 4.4]
```

---

## Verification Checkpoints

### Phase 1 Completion Criteria

Before proceeding to Phase 2:

- [ ] Security scanner split into 5 files, each <600 LOC
- [ ] E2E runner split into 4 files, each <600 LOC
- [ ] Handler factory implemented and tested
- [ ] All MCP handlers have 90%+ coverage
- [ ] All domain coordinators have 80%+ coverage
- [ ] All domain plugins have 80%+ coverage
- [ ] Zero `any` types in critical files
- [ ] All existing tests still pass

**Verification Command:**
```bash
cd /workspaces/agentic-qe/v3 && npm test -- --run --coverage
```

### Phase 2 Completion Criteria

Before proceeding to Phase 3:

- [ ] All background workers have 70%+ coverage
- [ ] Kernel core has 80%+ coverage
- [ ] Event bus uses O(1) operations
- [ ] Task queue sorting optimized
- [ ] Zero timing-dependent tests without fake timers
- [ ] Zero empty catch blocks
- [ ] Structured logger implemented

**Verification Command:**
```bash
cd /workspaces/agentic-qe/v3 && npm test -- --run --coverage && npm run benchmark:performance
```

### Phase 3 Completion Criteria

Before proceeding to Phase 4:

- [ ] Learning system has 70%+ coverage
- [ ] Sync system has 70%+ coverage
- [ ] Spreading activation has bounds
- [ ] Top 100 magic numbers extracted
- [ ] Routing system has 80%+ coverage
- [ ] Error path coverage at 85%+

### Phase 4 Completion Criteria

Plan complete:

- [ ] Critical MCP tools have 70%+ coverage
- [ ] Strange Loop has 80%+ coverage
- [ ] Security event logging implemented
- [ ] SSRF protection implemented
- [ ] Subscription indexing implemented

---

## Success Metrics

### Code Quality Targets

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Files >500 LOC | 24 | <10 | <10 |
| `any` types | 178 | <20 | <20 |
| Empty catch blocks | 9 | 0 | 0 |
| Console.log (services) | 500+ | 0 | 0 |
| Code duplication (handlers) | 1,200 | <200 | <200 |

### Test Coverage Targets

| Component | Before | After | Target |
|-----------|--------|-------|--------|
| MCP Handlers | 0% | 90% | 90% |
| Domain Coordinators | 0% | 80% | 80% |
| Domain Plugins | 0% | 80% | 80% |
| Background Workers | 0% | 70% | 70% |
| Kernel Core | 30% | 80% | 80% |
| Overall | 45% | 70% | 70% |

### Performance Targets

| Operation | Before | After | Improvement |
|-----------|--------|-------|-------------|
| Event publish | O(n) | O(1) | -80% CPU |
| Task enqueue | O(n log n) | O(log n) | -50% CPU |
| Subscription lookup | O(n) | O(1) | -60% CPU |

---

## Execution Timeline

```
Week 1: Phase 1 (P0) - Critical Fixes
  - Day 1-2: Milestones 1.1, 1.2 (file splitting) - Team Alpha
  - Day 3: Milestone 1.3 (handler factory) - Team Alpha
  - Day 4-5: Milestones 1.4, 1.5, 1.6 (tests) - Team Beta

Week 2: Phase 2 (P1) - High Priority
  - Day 1-2: Milestones 2.1, 2.2 (worker/kernel tests) - Team Beta
  - Day 2-3: Milestones 2.3, 2.4 (performance) - Team Gamma
  - Day 4: Milestones 2.5, 2.6 (test fixes, empty catches)
  - Day 5: Milestone 2.7 (logger)

Week 3-4: Phase 3 (P2) - Medium Priority
  - Milestones 3.1-3.6 in parallel across teams

Week 5+: Phase 4 (P3) - Lower Priority
  - As bandwidth permits
```

---

## Appendix: File Paths for Implementation

### Phase 1 Target Files

**Split targets:**
- `/workspaces/agentic-qe/v3/src/domains/security-compliance/services/security-scanner.ts`
- `/workspaces/agentic-qe/v3/src/domains/test-execution/services/e2e-runner.ts`

**Handler refactoring:**
- `/workspaces/agentic-qe/v3/src/mcp/handlers/domain-handlers.ts`

**Test targets:**
- `/workspaces/agentic-qe/v3/src/mcp/handlers/*.ts`
- `/workspaces/agentic-qe/v3/src/domains/*/coordinator.ts`
- `/workspaces/agentic-qe/v3/src/domains/*/plugin.ts`

### Phase 2 Target Files

**Worker tests:**
- `/workspaces/agentic-qe/v3/src/workers/workers/*.ts`

**Kernel tests:**
- `/workspaces/agentic-qe/v3/src/kernel/kernel.ts`
- `/workspaces/agentic-qe/v3/src/kernel/plugin-loader.ts`
- `/workspaces/agentic-qe/v3/src/kernel/unified-memory.ts`

**Performance optimization:**
- `/workspaces/agentic-qe/v3/src/kernel/event-bus.ts`
- `/workspaces/agentic-qe/v3/src/coordination/queen-coordinator.ts`

---

*Implementation Plan generated by GOAP Specialist*
*Based on QE Swarm Analysis Reports*
*Ready for claude-flow swarm execution*
