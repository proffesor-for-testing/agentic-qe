# AQE V3 Top 10 Remediation Plan

**Generated:** 2026-01-16
**Status:** In Progress
**Total Estimated Effort:** 90 hours

---

## Executive Summary

This document outlines the remediation plan for the Top 10 priorities identified in the QE V3 analysis. Priorities 1-2 (CRITICAL) are being fixed by automated agents. This plan covers Priorities 3-10.

---

## Status Overview

| Priority | ID | Issue | Effort | Status | Sprint |
|----------|-----|-------|--------|--------|--------|
| 1 | PAP-003 | Memory Leak in Queen Coordinator | 2h | 🔄 IN PROGRESS (Agent) | 1 |
| 2 | CC-002 | Race Condition in Task Submission | 4h | 🔄 IN PROGRESS (Agent) | 1 |
| 3 | GOD-001 | God File: CLI Index | 16h | 📋 PLANNED | 2 |
| 4 | GOD-002 | God Class: TestGeneratorService | 20h | 📋 PLANNED | 2 |
| 5 | SEC-001 | Unsafe JSON.parse in CLI | 2h | 📋 PLANNED | 1 |
| 6 | SEC-003 | Missing Authorization in Task Assignment | 8h | 📋 PLANNED | 1 |
| 7 | COV-001 | Kernel Test Coverage Gap | 16h | 📋 PLANNED | 3 |
| 8 | COV-002 | Compatibility Module Untested | 12h | 📋 PLANNED | 3 |
| 9 | PAP-001 | N+1 Query Pattern in Coverage Parsing | 8h | 📋 PLANNED | 4 |
| 10 | SEC-004 | Path Traversal in FileReader | 2h | 📋 PLANNED | 1 |

---

## Sprint 1: Critical Fixes + Security (16 hours)

### Priority 1: PAP-003 - Memory Leak (2h) ✅ Agent Assigned
- **Location:** `v3/src/coordination/queen-coordinator.ts:798-818`
- **Fix:** Store subscription handles, unsubscribe in dispose()
- **Status:** Automated agent fixing

### Priority 2: CC-002 - Race Condition (4h) ✅ Agent Assigned
- **Location:** `v3/src/coordination/queen-coordinator.ts:429-439`
- **Fix:** Implement atomic counter with compare-and-swap
- **Status:** Automated agent fixing

### Priority 5: SEC-001 - Unsafe JSON.parse (2h)
- **Location:** `v3/src/cli/index.ts:941, 998`
- **Issue:** JSON.parse on user input without prototype pollution protection
- **Fix Steps:**
  1. Install `secure-json-parse` package: `npm install secure-json-parse`
  2. Replace `JSON.parse(userInput)` with `secureJsonParse(userInput)`
  3. Add tests for prototype pollution prevention
- **Test:** `npm test -- --run -t "CLI.*JSON"`

### Priority 6: SEC-003 - Missing Authorization (8h)
- **Location:** `v3/src/coordination/queen-coordinator.ts`
- **Issue:** Tasks can be reassigned without authorization checks
- **Fix Steps:**
  1. Add `TaskPermission` interface with `canAssign`, `canReassign`, `canCancel`
  2. Implement `checkTaskPermission(agentId, taskId, action)` method
  3. Add permission checks to `assignTask()`, `reassignTask()`, `cancelTask()`
  4. Add configuration for permission policies
  5. Add audit logging for permission decisions
- **Test:** Create `v3/tests/unit/coordination/task-authorization.test.ts`

### Priority 10: SEC-004 - Path Traversal (2h)
- **Location:** `v3/src/shared/io/file-reader.ts:271-276`
- **Issue:** Path validation not applied from cve-prevention.ts
- **Fix Steps:**
  1. Import `validatePath` from `mcp/security/cve-prevention.ts`
  2. Add validation call in `resolvePath()` function
  3. Throw `PathTraversalError` if validation fails
  4. Add test cases for `../`, `..\\`, and encoded traversal attempts
- **Test:** `npm test -- --run -t "FileReader.*path"`

---

## Sprint 2: God File/Class Decomposition (36 hours)

### Priority 3: GOD-001 - Split CLI Index (16h)
- **Location:** `v3/src/cli/index.ts` (3,241 lines)
- **Issue:** Command handlers, initialization, state management mixed
- **Fix Steps:**

  **Phase 1: Extract Command Handlers (8h)**
  ```
  v3/src/cli/
  ├── index.ts              (slim: ~200 lines, imports/exports)
  ├── commands/
  │   ├── init.ts           (init command)
  │   ├── generate.ts       (test generation commands)
  │   ├── execute.ts        (test execution commands)
  │   ├── coverage.ts       (coverage commands)
  │   ├── security.ts       (security scan commands)
  │   ├── config.ts         (configuration commands)
  │   └── index.ts          (command registry)
  ```

  **Phase 2: Extract State Management (4h)**
  ```
  v3/src/cli/
  ├── state/
  │   ├── cli-state.ts      (CLIState class)
  │   ├── config-loader.ts  (configuration loading)
  │   └── session.ts        (session management)
  ```

  **Phase 3: Extract Utilities (4h)**
  ```
  v3/src/cli/
  ├── helpers/
  │   ├── output.ts         (formatting, colors, spinners)
  │   ├── prompts.ts        (interactive prompts)
  │   ├── validators.ts     (input validation)
  │   └── errors.ts         (CLI error handling)
  ```

- **Test:** Ensure all CLI commands work after refactor
- **Risk:** Medium - many imports may need updating

### Priority 4: GOD-002 - Decompose TestGeneratorService (20h)
- **Location:** `v3/src/domains/test-generation/services/test-generator.ts` (2,750 lines)
- **Issue:** AST parsing, test generation, TDD workflow, property testing mixed
- **Fix Steps:**

  **Phase 1: Extract AST Utilities (6h)**
  ```
  v3/src/domains/test-generation/services/
  ├── ast/
  │   ├── parser.ts           (AST parsing)
  │   ├── analyzer.ts         (code analysis)
  │   ├── transformer.ts      (AST transformations)
  │   └── types.ts            (AST types)
  ```

  **Phase 2: Extract Test Generation Strategies (8h)**
  ```
  v3/src/domains/test-generation/services/
  ├── generators/
  │   ├── unit-test-generator.ts      (unit tests)
  │   ├── integration-test-generator.ts (integration tests)
  │   ├── property-test-generator.ts  (property-based tests)
  │   ├── test-data-generator.ts      (test data/fixtures)
  │   └── generator-factory.ts        (factory pattern)
  ```

  **Phase 3: Extract TDD Workflow (6h)**
  ```
  v3/src/domains/test-generation/services/
  ├── tdd/
  │   ├── red-phase.ts        (write failing test)
  │   ├── green-phase.ts      (make test pass)
  │   ├── refactor-phase.ts   (refactor code)
  │   └── tdd-orchestrator.ts (TDD workflow)
  ```

- **Test:** Run all test-generation domain tests
- **Risk:** High - core functionality, needs careful testing

---

## Sprint 3: Test Coverage Gaps (28 hours)

### Priority 7: COV-001 - Kernel Test Coverage (16h)
- **Location:** `v3/src/kernel/` (11 files, 18% coverage)
- **Issue:** Critical kernel module severely under-tested
- **Target:** Minimum 60% coverage
- **Files to Test:**

  | File | Priority | Estimated Hours |
  |------|----------|-----------------|
  | `unified-memory.ts` | P0 | 4h |
  | `unified-persistence.ts` | P0 | 3h |
  | `agent-coordinator.ts` | P0 | 3h |
  | `memory-backend.ts` | P1 | 2h |
  | `interfaces.ts` | P2 | 1h (type tests) |
  | `kernel-factory.ts` | P1 | 2h |
  | `qe-kernel.ts` | P1 | 1h |

- **Test Pattern:**
  ```typescript
  // v3/tests/unit/kernel/unified-memory.test.ts
  describe('UnifiedMemoryManager', () => {
    describe('initialization', () => { ... });
    describe('CRUD operations', () => { ... });
    describe('vector search', () => { ... });
    describe('transactions', () => { ... });
    describe('error handling', () => { ... });
  });
  ```

### Priority 8: COV-002 - Compatibility Module Tests (12h)
- **Location:** `v3/src/compatibility/` (5 files, 0% coverage)
- **Issue:** V2 compatibility layer completely untested
- **Target:** 80% coverage (critical for migration)
- **Test Strategy:**

  **Phase 1: Unit Tests (6h)**
  - Test each adapter in isolation
  - Mock V2 interfaces
  - Test edge cases and error handling

  **Phase 2: Integration Tests (6h)**
  - Test V2 to V3 migration scenarios
  - Test backward compatibility with V2 clients
  - Test configuration migration

- **Test Files to Create:**
  ```
  v3/tests/unit/compatibility/
  ├── v2-adapter.test.ts
  ├── config-migrator.test.ts
  ├── api-translator.test.ts
  └── backward-compat.test.ts

  v3/tests/integration/compatibility/
  ├── v2-v3-migration.test.ts
  └── client-compatibility.test.ts
  ```

---

## Sprint 4: Performance Optimization (8 hours)

### Priority 9: PAP-001 - N+1 Query Pattern (8h)
- **Location:** `v3/src/coordination/task-executor.ts:670-768`
- **Issue:** O(n*m) complexity for coverage file parsing
- **Impact:** 10-100x slowdown for large codebases
- **Fix Steps:**

  **Phase 1: Analyze Current Implementation (2h)**
  - Profile the coverage parsing code
  - Identify all N+1 query patterns
  - Document current data flow

  **Phase 2: Implement Single-Pass Algorithm (4h)**
  ```typescript
  // Before (O(n*m)):
  for (const file of files) {
    for (const line of file.lines) {
      coverage.push(getCoverageForLine(file, line));  // DB query per line
    }
  }

  // After (O(n)):
  const coverageMap = new Map<string, LineCoverage[]>();
  const allCoverage = await getCoverageForFiles(files);  // Single query
  for (const cov of allCoverage) {
    if (!coverageMap.has(cov.file)) coverageMap.set(cov.file, []);
    coverageMap.get(cov.file)!.push(cov);
  }
  ```

  **Phase 3: Add Benchmarks (2h)**
  - Create benchmark test with 1000+ files
  - Verify improvement is at least 10x
  - Add regression test to prevent future N+1 patterns

---

## Sprint 5: Remaining Items (Future)

Reserved for:
- Medium/Low priority items not in Top 10
- Technical debt from sprint 1-4
- Additional coverage improvements
- Performance fine-tuning

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| God file refactor breaks CLI | High | Create comprehensive CLI integration tests first |
| TestGeneratorService decomposition affects test quality | High | Run full test suite after each phase |
| Kernel tests reveal hidden bugs | Medium | Fix bugs as part of coverage work |
| Performance fix changes behavior | Low | Use property-based tests to verify consistency |

---

## Success Criteria

### Sprint 1 Complete When:
- [ ] PAP-003 and CC-002 fixed by agents
- [ ] SEC-001, SEC-003, SEC-004 fixed
- [ ] All security tests passing
- [ ] No new critical/high security findings

### Sprint 2 Complete When:
- [ ] CLI index.ts < 300 lines
- [ ] TestGeneratorService < 500 lines
- [ ] All extracted modules have tests
- [ ] No functionality regressions

### Sprint 3 Complete When:
- [ ] Kernel coverage > 60%
- [ ] Compatibility coverage > 80%
- [ ] CI passes with new tests
- [ ] Coverage report shows improvements

### Sprint 4 Complete When:
- [ ] Coverage parsing benchmark shows >10x improvement
- [ ] No N+1 patterns in hot paths
- [ ] Performance regression tests added

---

## Automation Recommendations

The following tasks are good candidates for agent-based automation:

1. **SEC-001** (JSON.parse fix) - Simple pattern replacement
2. **SEC-004** (Path traversal) - Single file fix
3. **COV-001/002** (Test coverage) - Test generation agents
4. **PAP-001** (N+1 fix) - Performance optimization agent

---

*Plan generated from QE V3 Executive Summary analysis*
