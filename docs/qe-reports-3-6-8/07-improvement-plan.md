# v3.6.8 GOAP Improvement Plan

**Date**: 2026-02-16
**Branch**: new-working-branch
**Source**: QE Fleet Analysis Reports 01-06
**Execution Framework**: Claude Flow SPARC-GOAP with Hierarchical Swarms

---

## 1. Executive Summary

### Current State Scores

| Dimension | Score | Key Issue |
|-----------|-------|-----------|
| Code Quality | 5.5/10 | 42% files exceed 500-line limit; 700+ duplicated error patterns |
| Test Quality | 7.2/10 | Strong AAA patterns but 40% file-level coverage gap |
| Security Posture | 6.5/10 | Strong auth/crypto but critical command injection + inconsistent JSON.parse |
| Performance | 7.0/10 | Good optimizations in place but GOAP A* and Queen memory leak are critical |
| Test Coverage | 62% file-level | 303 of 752 source files have no corresponding test |
| Complexity | 4.0/10 | 9 functions with CC>50; 397 files over 500 lines; max nesting=10 |

### Target State Scores (After Full Plan Execution)

| Dimension | Current | Target | Delta |
|-----------|---------|--------|-------|
| Code Quality | 5.5/10 | 7.5/10 | +2.0 |
| Test Quality | 7.2/10 | 8.5/10 | +1.3 |
| Security Posture | 6.5/10 | 8.5/10 | +2.0 |
| Performance | 7.0/10 | 8.5/10 | +1.5 |
| Test Coverage | 62% | 75%+ | +13% |
| Complexity | 4.0/10 | 6.5/10 | +2.5 |

### Aggregate Finding Counts (All Reports)

| Severity | Security | Performance | Code Smells | Complexity | Test Quality | Coverage Gaps | Total |
|----------|----------|-------------|-------------|------------|--------------|---------------|-------|
| Critical | 3 | 2 | 12 | 9 (CC>50) | 2 (modules) | 3 | **31** |
| High | 7 | 5 | 38 | 32 (CC 30-50) | 6 (modules) | 7 | **95** |
| Medium | 12 | 9 | ~230 | 17 (1500-2000 LOC) | ~10 | 5 | **~283** |
| Low | 8 | 7 | ~300 | misc | ~15 | misc | **~330** |

**Total Estimated Technical Debt**: 160-200 hours (code smells) + 80 hours (tests) + 40 hours (security) + 20 hours (performance) = **~300-340 hours**

---

## 2. Improvement Phases

---

### Phase 1: P0 Critical Fixes -- Security & Safety

**Sprint Size**: 1 sprint (2 weeks)
**Estimated Effort**: 40 hours
**Goal**: Eliminate all critical and high-severity security vulnerabilities

---

#### GOAL-SEC-001: Fix Command Injection in Browser Command Executor

- **Description**: Replace `execSync` with string concatenation with `spawn()` using argument arrays. Validate `sessionName` against alphanumeric pattern.
- **Source Finding**: SEC-CMD-001 (Critical, CWE-78)
- **Preconditions**: None
- **Files to modify**:
  - `v3/src/integrations/browser/agent-browser/command-executor.ts` (lines 48, 55, 168-169)
- **Agent type**: `qe-security-scanner` for audit, `coder` for implementation
- **Acceptance criteria**:
  - All `execSync` calls with string interpolation replaced by `spawn()` with argument arrays
  - `sessionName` validated with regex `/^[a-zA-Z0-9_-]+$/`
  - No shell metacharacters can reach `execSync`
  - Existing command-executor tests pass; new tests added for injection attempts
- **Estimated complexity**: M
- **Dependencies**: None

#### GOAL-SEC-002: Replace Inconsistent JSON.parse with safeJsonParse

- **Description**: Replace all `JSON.parse()` calls on external/user input and database-sourced data with the existing `safeJsonParse()` helper. Create ESLint rule to prevent regressions.
- **Source Finding**: SEC-DES-001 (High, CWE-1321)
- **Preconditions**: None
- **Files to modify** (priority subset -- CLI and user-facing paths first):
  - `v3/src/cli/commands/hooks.ts` (line 743) -- CLI user input
  - `v3/src/cli/commands/learning.ts` (line 653) -- file import data
  - `v3/src/kernel/unified-memory.ts` (line 1601) -- database values
  - `v3/src/learning/dream/dream-engine.ts` (line 761) -- database data
  - 93 additional files using raw `JSON.parse()` (full list from grep)
- **Agent type**: `coder` for replacements, `qe-security-scanner` for validation
- **Acceptance criteria**:
  - All `JSON.parse()` on user input, CLI args, file imports, and webhook payloads use `safeJsonParse()`
  - Database-sourced `JSON.parse()` calls wrapped as defense-in-depth
  - ESLint rule `no-raw-json-parse` created and enabled (warn level initially)
  - No test regressions
- **Estimated complexity**: M (97+ files, but mechanical replacement)
- **Dependencies**: None

#### GOAL-SEC-003: Replace Math.random() for ID Generation with crypto.randomUUID()

- **Description**: Replace all `Math.random().toString(36)` patterns in governance and security-adjacent code with `crypto.randomUUID()`.
- **Source Finding**: SEC-CRYPTO-001 (High, CWE-338)
- **Preconditions**: None
- **Files to modify**:
  - `v3/src/governance/compliance-reporter.ts` (line 1016)
  - `v3/src/governance/proof-envelope-integration.ts` (line 781)
  - `v3/src/governance/adversarial-defense-integration.ts` (line 406)
  - `v3/src/adapters/claude-flow/trajectory-bridge.ts` (line 45)
- **Agent type**: `coder`
- **Acceptance criteria**:
  - All ID generation in governance/ and security-adjacent code uses `crypto.randomUUID()` or `crypto.randomBytes()`
  - `Math.random()` usage in RL/benchmark/test-data contexts left unchanged (acceptable use)
  - All existing tests pass
- **Estimated complexity**: S
- **Dependencies**: None

#### GOAL-SEC-004: Gate Mock Auth Middleware Behind NODE_ENV Check

- **Description**: Prevent `mockAuthMiddleware` from being available in production builds.
- **Source Finding**: SEC-AUTH-001 (Medium, CWE-287)
- **Preconditions**: None
- **Files to modify**:
  - `v3/src/adapters/a2a/auth/middleware.ts` (lines 452-467)
- **Agent type**: `coder`
- **Acceptance criteria**:
  - `mockAuthMiddleware` throws or is not exported when `NODE_ENV === 'production'`
  - Test-time usage continues to work
- **Estimated complexity**: S
- **Dependencies**: None

#### GOAL-SEC-005: Add Postgres Identifier Validation

- **Description**: Implement identifier validation for PostgreSQL table and column names in the cloud sync writer.
- **Source Finding**: SEC-SQL-003 (Medium, CWE-89)
- **Preconditions**: None
- **Files to modify**:
  - `v3/src/sync/cloud/postgres-writer.ts` (lines 201-211)
  - `v3/src/shared/sql-safety.ts` (add `validateIdentifier()` function)
- **Agent type**: `qe-security-scanner`, `coder`
- **Acceptance criteria**:
  - All interpolated identifiers pass through `validateIdentifier()` (regex: `/^[a-z_][a-z0-9_]*$/`)
  - Tests added for SQL injection attempts via identifier manipulation
- **Estimated complexity**: S
- **Dependencies**: None

#### GOAL-SEC-006: Redact Password from Connection Strings

- **Description**: Ensure database passwords are never included in loggable connection strings.
- **Source Finding**: SEC-SEC-001 (High, CWE-522)
- **Preconditions**: None
- **Files to modify**:
  - `v3/src/sync/cloud/tunnel-manager.ts` (lines 227-231)
  - `v3/src/sync/cloud/postgres-writer.ts` (lines 84, 91)
- **Agent type**: `coder`
- **Acceptance criteria**:
  - Connection string construction uses a connection object, not URL with embedded password
  - All `console.log` calls in sync/cloud/ redact credentials
  - No password appears in any log output
- **Estimated complexity**: S
- **Dependencies**: None

#### GOAL-SEC-007: Fix markdown-it ReDoS Vulnerability

- **Description**: Upgrade `markdown-it` to `>=14.1.1` to fix GHSA-38c4-r59v-3vqw.
- **Source Finding**: SEC-DEP-001 (Medium)
- **Preconditions**: None
- **Files to modify**:
  - `v3/package.json` (dependency upgrade)
- **Agent type**: `coder`
- **Acceptance criteria**:
  - `npm audit` shows zero moderate+ vulnerabilities
  - All tests pass after upgrade
- **Estimated complexity**: S
- **Dependencies**: None

---

### Phase 2: P0 Performance & Memory Fixes

**Sprint Size**: 1 sprint (2 weeks, overlaps Phase 1)
**Estimated Effort**: 20 hours
**Goal**: Fix the 2 critical performance issues and 5 high-severity items

---

#### GOAL-PERF-001: Replace GOAP A* Sort-Then-Shift with BinaryHeap

- **Description**: Replace the `openSet.sort()` + `openSet.shift()` pattern in the A* search loop with a BinaryHeap (min-heap by f-score). Reuse the `BinaryHeap` implementation from `unified-memory.ts`.
- **Source Finding**: PERF-004 (Critical)
- **Preconditions**: None
- **Files to modify**:
  - `v3/src/planning/goap-planner.ts` (lines 340-344)
  - Extract/import `BinaryHeap` from `v3/src/kernel/unified-memory.ts` (lines 760-824) into a shared utility
- **Agent type**: `coder`, `qe-tdd-red` for tests
- **Acceptance criteria**:
  - A* loop uses `BinaryHeap.extractMin()` instead of `sort()` + `shift()`
  - All existing GOAP planner tests pass
  - New benchmark test shows measurable speedup (>5x for 1000+ node plans)
- **Estimated complexity**: S
- **Dependencies**: None

#### GOAL-PERF-002: Fix Unbounded taskTraceContexts Memory Leak

- **Description**: Add trace context cleanup to the `cleanupCompletedTasks` method and add a max-size guard (10,000 entries) with oldest-entry eviction.
- **Source Finding**: PERF-001 (Critical)
- **Preconditions**: None
- **Files to modify**:
  - `v3/src/coordination/queen-coordinator.ts` (lines 432, 791-794, 2139+)
- **Agent type**: `coder`
- **Acceptance criteria**:
  - `cleanupCompletedTasks` also cleans `taskTraceContexts`
  - Max size guard of 10,000 entries with FIFO eviction
  - Test verifies contexts are cleaned after task cleanup
- **Estimated complexity**: S
- **Dependencies**: None

#### GOAL-PERF-003: Add State Hash Map for A* Open Set Lookups

- **Description**: Maintain a `Map<string, number>` mapping state hashes to their cost in the open set, converting duplicate-state lookups from O(n) to O(1).
- **Source Finding**: PERF-005 (High)
- **Preconditions**: GOAL-PERF-001 (heap restructure)
- **Files to modify**:
  - `v3/src/planning/goap-planner.ts` (lines 398-399)
- **Agent type**: `coder`
- **Acceptance criteria**:
  - `findIndex` replaced with `Map.get()` for state hash lookups
  - Map updated on insert/remove/update operations
  - All GOAP planner tests pass
- **Estimated complexity**: S
- **Dependencies**: GOAL-PERF-001

#### GOAL-PERF-004: Combine findProjectRoot into Single Walk with Cache

- **Description**: Merge the 3 sequential directory walks into a single upward walk checking all markers at each level. Cache result at module level.
- **Source Finding**: PERF-014 (High)
- **Preconditions**: None
- **Files to modify**:
  - `v3/src/kernel/unified-memory.ts` (lines 60-110)
- **Agent type**: `coder`
- **Acceptance criteria**:
  - Single walk loop checking all 3 markers per directory level
  - Result cached in module-level variable
  - Startup I/O calls reduced by ~66%
  - All kernel tests pass
- **Estimated complexity**: S
- **Dependencies**: None

#### GOAL-PERF-005: Move Sync I/O from Kernel Constructor to initialize()

- **Description**: Defer `findProjectRoot()`, `fs.existsSync`, and `fs.mkdirSync` to the async `initialize()` method.
- **Source Finding**: PERF-015 (High)
- **Preconditions**: GOAL-PERF-004
- **Files to modify**:
  - `v3/src/kernel/kernel.ts` (lines 88-94)
- **Agent type**: `coder`
- **Acceptance criteria**:
  - Constructor stores config only; no sync I/O
  - `initialize()` handles directory creation
  - All kernel tests pass
- **Estimated complexity**: S
- **Dependencies**: GOAL-PERF-004

#### GOAL-PERF-006: Move Service Caches from Module-Level to Instance

- **Description**: Move module-scoped service caches (`coverageAnalyzer`, `securityScanner`, etc.) into `DomainTaskExecutor` as instance properties to prevent cross-contamination.
- **Source Finding**: PERF-017 (High)
- **Preconditions**: None
- **Files to modify**:
  - `v3/src/coordination/task-executor.ts` (lines 109-118)
- **Agent type**: `coder`
- **Acceptance criteria**:
  - Service caches are instance properties, not module-level variables
  - `resetServiceCaches` removed or converted to instance method
  - Multi-kernel tests (if any) pass without cross-contamination
- **Estimated complexity**: S
- **Dependencies**: None

#### GOAL-PERF-007: Add Error Boundary to Work-Stealing Interval

- **Description**: Wrap `triggerWorkStealing` in try/catch with error logging and exponential backoff on consecutive failures.
- **Source Finding**: PERF-018 (High)
- **Preconditions**: None
- **Files to modify**:
  - `v3/src/coordination/queen-coordinator.ts` (lines 2036-2039)
- **Agent type**: `coder`
- **Acceptance criteria**:
  - Async callback wrapped in try/catch
  - Consecutive failure counter with backoff
  - Error logged with context
- **Estimated complexity**: S
- **Dependencies**: None

#### GOAL-PERF-008: Medium-Priority Performance Quick Wins (Batch)

- **Description**: Batch of smaller performance fixes that can be done together.
- **Source Finding**: PERF-006, PERF-007, PERF-008, PERF-009, PERF-011, PERF-021
- **Preconditions**: GOAL-PERF-001 for PERF-006
- **Files to modify**:
  - `v3/src/planning/goap-planner.ts` -- hoist `dangerousProps` Set (PERF-021), manual `cloneState` (PERF-007)
  - `v3/src/coordination/queen-coordinator.ts` -- scope `removeFromQueues` to `targetDomains` (PERF-008), use atomic counter for running count (PERF-009)
  - `v3/src/kernel/event-bus.ts` -- single-pass event history filtering (PERF-011)
- **Agent type**: `coder`
- **Acceptance criteria**:
  - Each sub-fix passes its module's existing tests
  - No new test regressions
- **Estimated complexity**: M (multiple small changes)
- **Dependencies**: GOAL-PERF-001 (partial)

---

### Phase 3: P1 Code Quality & Refactoring

**Sprint Size**: 2 sprints (4 weeks)
**Estimated Effort**: 80 hours
**Goal**: Address structural code quality issues -- God files, duplication, coupling

---

#### GOAL-CQ-001: Fix ConsensusEnabledMixin Typing

- **Description**: Fix the `ConsensusEnabledMixin` type definition to properly expose `initializeConsensus()`, `disposeConsensus()`, and `isConsensusAvailable()` on the mixed-in type. Eliminate all 20 `(this.consensusMixin as any)` casts.
- **Source Finding**: Code Smells Report, Pattern A (20 occurrences across 7 files)
- **Preconditions**: None
- **Files to modify**:
  - Mixin definition (locate via grep for `ConsensusEnabledMixin`)
  - `v3/src/domains/visual-accessibility/coordinator.ts` (lines 269, 288, 1701)
  - `v3/src/domains/security-compliance/coordinator.ts` (lines 300, 373, 1349)
  - `v3/src/domains/defect-intelligence/coordinator.ts` (lines 219, 231)
  - `v3/src/domains/requirements-validation/coordinator.ts` (lines 280, 343, 1334)
  - `v3/src/domains/test-generation/coordinator.ts` (lines 393, 414, 1595)
  - `v3/src/domains/enterprise-integration/coordinator.ts` (lines 193, 207, 809)
  - `v3/src/domains/code-intelligence/coordinator.ts` (lines 404, 507, 2016)
- **Agent type**: `coder`
- **Acceptance criteria**:
  - Zero `as any` casts for consensus mixin methods
  - TypeScript compiles cleanly with strict mode
  - All coordinator tests pass
- **Estimated complexity**: M
- **Dependencies**: None

#### GOAL-CQ-002: Extract BaseDomainCoordinator Abstract Class

- **Description**: Create `BaseDomainCoordinator` abstract class with template methods for `onInitialize()`, `onDispose()`. Move consensus lifecycle, event subscription management, and health check patterns into the base class.
- **Source Finding**: Code Smells Report, Pattern A (13 coordinator files with duplicated lifecycle)
- **Preconditions**: GOAL-CQ-001 (consensus mixin must be typed first)
- **Files to modify**:
  - Create `v3/src/domains/base-domain-coordinator.ts` (new)
  - All 13 `v3/src/domains/*/coordinator.ts` files
- **Agent type**: `coder`, `qe-test-architect` for test updates
- **Acceptance criteria**:
  - All 13 coordinators extend `BaseDomainCoordinator`
  - Each coordinator reduced by 100-200 lines
  - Zero duplicated lifecycle boilerplate
  - All coordinator tests pass
- **Estimated complexity**: L
- **Dependencies**: GOAL-CQ-001

#### GOAL-CQ-003: Create Shared Error Utilities

- **Description**: Create `toErrorMessage(error: unknown): string` and `toError(error: unknown): Error` shared utilities. Replace 700+ duplicated inline error coercion patterns.
- **Source Finding**: Code Smells Report, Patterns B+C (298 + 426 = 724 occurrences)
- **Preconditions**: None
- **Files to modify**:
  - Create utility in `v3/src/shared/utils/error-utils.ts` (or add to existing shared utils)
  - ~150 files with `error instanceof Error ? error.message : String(error)` pattern
  - ~129 files with `error instanceof Error ? error : new Error(String(error))` pattern
- **Agent type**: `coder` (automated replacement via AST transform or regex)
- **Acceptance criteria**:
  - Shared utility functions created with tests
  - All inline patterns replaced with utility calls
  - No test regressions
  - Grep for old patterns returns zero results
- **Estimated complexity**: M (mechanical but touches many files)
- **Dependencies**: None

#### GOAL-CQ-004: Break Top 10 God Files (>2,000 Lines)

- **Description**: Decompose the 10 files exceeding 2,000 lines into focused modules of <500 lines each.
- **Source Finding**: Complexity Report, Section 1.1; Code Smells Report, Section 1
- **Preconditions**: GOAL-CQ-002 (coordinators will shrink from base class extraction)
- **Files to modify** (each split into 4-5 smaller files):
  - `v3/src/domains/quality-assessment/coordinator.ts` (2,426 lines) -- extract gate evaluation, report generation, RL integration, event handling
  - `v3/src/kernel/unified-memory.ts` (2,272 lines) -- extract HNSW operations, CRDT sync, TTL management, query building
  - `v3/src/domains/security-compliance/services/security-auditor.ts` (2,228 lines) -- extract DAST scan, SAST scan, report generation
  - `v3/src/coordination/workflow-orchestrator.ts` (2,219 lines) -- extract workflow types, execution engine, step management
  - `v3/src/coordination/queen-coordinator.ts` (2,202 lines) -- extract task routing, domain health, TinyDancer integration, lifecycle
  - `v3/src/domains/code-intelligence/coordinator.ts` (2,159 lines) -- extract service orchestration, event handling
  - `v3/src/domains/visual-accessibility/services/accessibility-tester.ts` (2,126 lines) -- extract browser checks, report generation
  - `v3/src/init/init-wizard.ts` (2,113 lines) -- extract phase runners, config generation, CLAUDE.md generator
  - `v3/src/domains/learning-optimization/coordinator.ts` (2,094 lines) -- extract optimization engine, metrics collection
  - `v3/src/cli/commands/learning.ts` (2,048 lines) -- extract subcommand handlers
- **Agent type**: `coder` (one file per agent in parallel swarm)
- **Acceptance criteria**:
  - All 10 files reduced to <500 lines
  - Each extracted module has single responsibility
  - All existing tests pass (imports may need updating)
  - No new circular dependencies introduced
- **Estimated complexity**: L (3-5 days total with parallel execution)
- **Dependencies**: GOAL-CQ-002 (for coordinator files)

#### GOAL-CQ-005: Resolve Bidirectional domains <-> coordination Dependency

- **Description**: Break the circular dependency between `domains` (80 imports from coordination) and `coordination` (13 imports from domains) by introducing event-based communication for the coordination->domain direction.
- **Source Finding**: Complexity Report, Section 5.3, Finding 3
- **Preconditions**: GOAL-CQ-002, GOAL-CQ-004
- **Files to modify**:
  - `v3/src/coordination/` files that import from `domains/`
  - Define domain event contracts for coordination->domain communication
  - Use existing EventBus for decoupling
- **Agent type**: `coder`, `qe-test-architect`
- **Acceptance criteria**:
  - Zero direct imports from `coordination/` to `domains/`
  - Communication via EventBus or mediator pattern
  - All integration tests pass
  - Dependency graph is acyclic for this pair
- **Estimated complexity**: L
- **Dependencies**: GOAL-CQ-002, GOAL-CQ-004

#### GOAL-CQ-006: Typed Database Row Interfaces

- **Description**: Define row-type interfaces for all SQL queries. Replace 15+ `as any[]` casts on database results.
- **Source Finding**: Code Smells Report, Pattern C (15 occurrences)
- **Preconditions**: None
- **Files to modify**:
  - `v3/src/feedback/test-outcome-tracker.ts`
  - `v3/src/feedback/coverage-learner.ts`
  - `v3/src/routing/routing-feedback.ts`
  - `v3/src/learning/real-qe-reasoning-bank.ts`
  - `v3/src/integrations/rl-suite/persistence/q-value-store.ts`
  - `v3/src/integrations/agentic-flow/reasoning-bank/pattern-evolution.ts`
  - `v3/src/integrations/agentic-flow/reasoning-bank/experience-replay.ts`
  - `v3/src/integrations/agentic-flow/reasoning-bank/trajectory-tracker.ts`
- **Agent type**: `coder`
- **Acceptance criteria**:
  - Each SQL query has a corresponding row-type interface
  - Zero `as any[]` casts on database results
  - TypeScript compiles cleanly
- **Estimated complexity**: M
- **Dependencies**: None

#### GOAL-CQ-007: Refactor Top 9 Functions with CC>50

- **Description**: Decompose the 9 most complex functions using Strategy pattern, lookup tables, and extract-method refactoring.
- **Source Finding**: Complexity Report, Section 2.1 (CC 51-91)
- **Preconditions**: None (can run parallel to other Phase 3 work)
- **Files to modify**:
  - `v3/src/domains/test-execution/services/user-flow-generator.ts:1048` -- `generateTestBlock()` CC=91 -> Strategy pattern
  - `v3/src/domains/test-generation/services/pattern-matcher.ts:420` -- `generateMockValue()` CC=88 -> lookup table
  - `v3/src/domains/test-generation/services/pattern-matcher.ts:853` -- `estimateComplexity()` CC=86 -> decompose
  - `v3/src/mcp/tools/qx-analysis/impact-analyzer.ts:20` -- `analyze()` CC=77 -> extract domain analysis methods
  - `v3/src/domains/test-generation/services/tdd-generator.ts:275` -- `inferImplementationFromBehavior()` CC=75 -> decompose
  - `v3/src/init/project-analyzer.ts:565` -- `calculateComplexity()` CC=72 -> decompose
  - `v3/src/domains/test-generation/generators/base-test-generator.ts:64` -- `generateTestValue()` CC=60 -> lookup table
  - `v3/src/domains/test-generation/services/tdd-generator.ts:63` -- `generateAssertionsFromBehavior()` CC=54 -> decompose
  - `v3/src/domains/requirements-validation/.../brutal-honesty-analyzer.ts:288` -- `analyzeRequirements()` CC=51 -> extract sub-analyzers
- **Agent type**: `coder` (one function per agent in parallel)
- **Acceptance criteria**:
  - Each function reduced to CC<20
  - Max nesting depth reduced to <=5
  - All existing tests pass
  - New unit tests for extracted functions
- **Estimated complexity**: L
- **Dependencies**: None

---

### Phase 4: P1 Test Coverage -- Critical Gaps

**Sprint Size**: 2 sprints (4 weeks)
**Estimated Effort**: 60 hours
**Goal**: Cover the highest-risk untested modules identified in reports 05 and 06

---

#### GOAL-TEST-001: Security Scanner Unit Tests (9 files, ~40 tests)

- **Description**: Write comprehensive unit tests for all 9 untested security scanner files.
- **Source Finding**: Coverage Gap Report, Section 2.7.10 (Risk Score: 100)
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
- **Source files under test**:
  - `v3/src/domains/security-compliance/services/scanners/` (all 9 files)
  - `v3/src/domains/security-compliance/services/semgrep-integration.ts`
- **Agent type**: `qe-tdd-red` for test stubs, `qe-tdd-green` for implementation validation
- **Acceptance criteria**:
  - Each scanner file has dedicated test file with >80% branch coverage
  - Tests cover: happy path, error handling, timeout scenarios, malformed input
  - Tests use mocks for external dependencies (network, filesystem)
- **Estimated complexity**: L
- **Dependencies**: None

#### GOAL-TEST-002: Governance Unit Tests (15 files, ~25 tests)

- **Description**: Create unit-level isolation tests for all governance files (currently only integration tests exist).
- **Source Finding**: Coverage Gap Report, Section 2.10; Queen Summary, P0 recommendation #1
- **Preconditions**: None
- **Files to create**:
  - `v3/tests/unit/governance/feature-flags.test.ts`
  - `v3/tests/unit/governance/compliance-reporter.test.ts`
  - `v3/tests/unit/governance/ab-benchmarking.test.ts`
  - `v3/tests/unit/governance/continue-gate-integration.test.ts`
  - `v3/tests/unit/governance/memory-write-gate-integration.test.ts`
  - `v3/tests/unit/governance/queen-governance-adapter.test.ts`
  - `v3/tests/unit/governance/constitutional-enforcer.test.ts`
  - `v3/tests/unit/governance/trust-accumulator-integration.test.ts`
  - (additional files as needed for remaining governance source files)
- **Agent type**: `qe-tdd-red`, `qe-test-architect`
- **Acceptance criteria**:
  - Each governance source file has a dedicated unit test
  - Tests verify behavior in isolation (mock dependencies)
  - Feature flag enable/disable, compliance reporting, A/B benchmarking all tested
- **Estimated complexity**: M
- **Dependencies**: None

#### GOAL-TEST-003: Agent Claim-Verifier Unit Tests (3 files, ~12 tests)

- **Description**: Write unit tests for the 3 untested claim verifier files.
- **Source Finding**: Coverage Gap Report, Section 2.2 (Risk Score: 75)
- **Preconditions**: None
- **Files to create**:
  - `v3/tests/unit/agents/claim-verifier/file-verifier.test.ts`
  - `v3/tests/unit/agents/claim-verifier/output-verifier.test.ts`
  - `v3/tests/unit/agents/claim-verifier/test-verifier.test.ts`
- **Source files under test**:
  - `v3/src/agents/claim-verifier/verifiers/file-verifier.ts`
  - `v3/src/agents/claim-verifier/verifiers/output-verifier.ts`
  - `v3/src/agents/claim-verifier/verifiers/test-verifier.ts`
- **Agent type**: `qe-tdd-red`
- **Acceptance criteria**:
  - Each verifier tested for: correct verification, false claim detection, error handling, edge cases
  - Tests mock filesystem and process operations
- **Estimated complexity**: S
- **Dependencies**: None

#### GOAL-TEST-004: Init Phase Tests (13 phase files + installers)

- **Description**: Create unit tests for the 13 init phase files and 4 installer files.
- **Source Finding**: Coverage Gap Report, Section 2.12 (25 of 31 files untested)
- **Preconditions**: None
- **Files to create**:
  - `v3/tests/unit/init/phases/` directory with test files for phases 01-13
  - `v3/tests/unit/init/agents-installer.test.ts`
  - `v3/tests/unit/init/governance-installer.test.ts`
  - `v3/tests/unit/init/n8n-installer.test.ts`
  - `v3/tests/unit/init/skills-installer.test.ts`
  - `v3/tests/unit/init/orchestrator.test.ts`
  - `v3/tests/unit/init/token-bootstrap.test.ts`
- **Agent type**: `qe-tdd-red`, `qe-test-architect`
- **Acceptance criteria**:
  - Each phase file tested for: successful execution, error handling, skip conditions
  - Each installer tested for: installation flow, rollback on failure, idempotency
  - Tests mock filesystem and package manager operations
- **Estimated complexity**: L
- **Dependencies**: None

#### GOAL-TEST-005: Memory Module Unit Tests (7 files, ~30 tests)

- **Description**: Create unit tests for the 7 untested memory module files.
- **Source Finding**: Test Quality Report, Section 1.1 (12% ratio -- Critical)
- **Preconditions**: None
- **Files to create**:
  - `v3/tests/unit/memory/cross-phase-memory.test.ts`
  - `v3/tests/unit/memory/g-counter.test.ts`
  - `v3/tests/unit/memory/lww-register.test.ts`
  - `v3/tests/unit/memory/or-set.test.ts`
  - `v3/tests/unit/memory/pn-counter.test.ts`
  - `v3/tests/unit/memory/convergence-tracker.test.ts`
- **Agent type**: `qe-tdd-red`
- **Acceptance criteria**:
  - Each CRDT type tested for: convergence, commutativity, idempotency
  - Cross-phase memory tested for: data persistence across phases, cleanup
  - Storage invariant: write-then-read returns original value
- **Estimated complexity**: M
- **Dependencies**: None

#### GOAL-TEST-006: Hooks Module Tests (2 files, ~8 tests)

- **Description**: Create tests for `cross-phase-hooks.ts` and `quality-gate-enforcer.ts`.
- **Source Finding**: Coverage Gap Report, Section 2.11; Test Quality Report
- **Preconditions**: None
- **Files to create**:
  - `v3/tests/unit/hooks/cross-phase-hooks.test.ts`
  - `v3/tests/unit/hooks/quality-gate-enforcer.test.ts`
- **Agent type**: `qe-tdd-red`
- **Acceptance criteria**:
  - Hook triggering at phase boundaries tested
  - Quality gate blocking/allowing transitions tested
  - Hook priority ordering tested
  - Failure handling tested
- **Estimated complexity**: S
- **Dependencies**: None

#### GOAL-TEST-007: Coverage Analysis Core Services (4 files, ~15 tests)

- **Description**: Test the coverage analysis pipeline's own untested core files.
- **Source Finding**: Coverage Gap Report, Section 2.7.4 (Risk Score: 48)
- **Preconditions**: None
- **Files to create**:
  - `v3/tests/unit/domains/coverage-analysis/coverage-analyzer.test.ts`
  - `v3/tests/unit/domains/coverage-analysis/coverage-parser.test.ts`
  - `v3/tests/unit/domains/coverage-analysis/gap-detector.test.ts`
  - `v3/tests/unit/domains/coverage-analysis/risk-scorer.test.ts`
- **Agent type**: `qe-tdd-red`
- **Acceptance criteria**:
  - Istanbul JSON and lcov format parsing tested
  - Gap detection for lines, branches, functions tested
  - Risk scoring algorithms tested with known inputs
  - Malformed input handling tested
- **Estimated complexity**: M
- **Dependencies**: None

---

### Phase 5: P2 Test Quality Improvements

**Sprint Size**: 2 sprints (4 weeks)
**Estimated Effort**: 50 hours
**Goal**: Improve test reliability, reduce flakiness risk, and add missing test infrastructure

---

#### GOAL-TQ-001: Add vi.useFakeTimers() to 45 Timing-Dependent Test Files

- **Description**: Add `vi.useFakeTimers()` to the ~45 test files that use real `setTimeout`/`Date.now`/`sleep` without fake timers.
- **Source Finding**: Test Quality Report, Section 5.2 (83 timing files, only 38 use fake timers)
- **Preconditions**: None
- **Files to modify**: ~45 test files (full list from grep for `setTimeout|Date.now|sleep` in tests/ minus those already using `vi.useFakeTimers`)
- **High-risk files** (prioritize):
  - `v3/tests/unit/test-scheduling/phase-scheduler.test.ts`
  - `v3/tests/unit/strange-loop/infra-healing/*.test.ts`
  - `v3/tests/unit/causal-discovery/*.test.ts`
- **Agent type**: `qe-flaky-detector`, `coder`
- **Acceptance criteria**:
  - All timing-dependent tests use `vi.useFakeTimers()` in `beforeEach` and `vi.useRealTimers()` in `afterEach`
  - No real `setTimeout` delays in unit tests
  - All tests still pass
- **Estimated complexity**: M
- **Dependencies**: None

#### GOAL-TQ-002: Add afterEach Cleanup to 160+ Test Files

- **Description**: Add `afterEach` cleanup blocks to the ~160 test files that have `beforeEach` but no `afterEach`.
- **Source Finding**: Test Quality Report, Section 5.4 (57% afterEach coverage, target 80%+)
- **Preconditions**: None
- **Files to modify**: ~160 test files with `beforeEach` but no `afterEach`
- **Agent type**: `coder` (automated pattern: add afterEach with `vi.restoreAllMocks()` and resource cleanup)
- **Acceptance criteria**:
  - 80%+ of test files with `beforeEach` also have `afterEach`
  - `afterEach` includes `vi.restoreAllMocks()` at minimum
  - Tests that create timers, event listeners, or DB connections clean them up
  - All tests pass
- **Estimated complexity**: M
- **Dependencies**: None

#### GOAL-TQ-003: Resolve or Remove Skipped/TODO Tests

- **Description**: Fix or remove the 35 skipped tests and 15 TODO tests.
- **Source Finding**: Test Quality Report, Section 3.4 (50 total)
- **Preconditions**: None
- **Files to modify**:
  - `v3/tests/integration/adapters/a2a/oauth-flow.integration.test.ts` (9 skips)
  - `v3/tests/unit/adapters/a2a/discovery/file-watcher.test.ts` (6 skips)
  - `v3/tests/integration/infra-healing-docker.test.ts` (5 skips -- Docker-dependent, create CI Docker job or remove)
  - `v3/tests/unit/mcp/handlers/domain-handlers.test.ts` (4 skips)
  - Various TODO test files
- **Agent type**: `qe-tdd-green`, `coder`
- **Acceptance criteria**:
  - Zero `it.skip` tests that have been skipped for >30 days
  - Zero `it.todo` without a tracking issue
  - Docker-dependent tests conditionally skipped with CI annotation
  - OAuth tests either fixed or documented with blocking issue
- **Estimated complexity**: M
- **Dependencies**: None

#### GOAL-TQ-004: Add E2E Tests for Core Platform Workflows

- **Description**: Create E2E tests for critical user journeys: init workflow, agent spawning, test generation, MCP tool usage.
- **Source Finding**: Test Quality Report, Section 1.3 (E2E at 2%, target 10%); Queen Summary, P0 #2
- **Preconditions**: Phase 1-2 security and performance fixes
- **Files to create**:
  - `v3/tests/e2e/platform-init.e2e.test.ts`
  - `v3/tests/e2e/agent-lifecycle.e2e.test.ts`
  - `v3/tests/e2e/test-generation-flow.e2e.test.ts`
  - `v3/tests/e2e/mcp-tool-invocation.e2e.test.ts`
- **Agent type**: `qe-test-architect`, `qe-tdd-red`
- **Acceptance criteria**:
  - E2E tests exercise full user journey from start to finish
  - Tests can run in CI without external service dependencies
  - Each test completes within 30 seconds
  - E2E ratio increases from 2% to 5%+
- **Estimated complexity**: L
- **Dependencies**: Phase 1, Phase 2

#### GOAL-TQ-005: Split 15 Oversized Test Files

- **Description**: Decompose the 15 test files exceeding 1,300 lines into focused, smaller test files.
- **Source Finding**: Test Quality Report, Section 3.5
- **Preconditions**: None
- **Files to modify**:
  - `v3/tests/unit/domains/visual-accessibility/vibium-visual-testing.test.ts` (1,822 lines)
  - `v3/tests/unit/adapters/a2ui/renderer.test.ts` (1,532 lines)
  - `v3/tests/unit/adapters/ag-ui/json-patch.test.ts` (1,516 lines)
  - (12 more files from Test Quality Report Section 3.5)
- **Agent type**: `coder`
- **Acceptance criteria**:
  - Each test file <500 lines
  - No test cases lost during split
  - All tests pass
- **Estimated complexity**: M
- **Dependencies**: None

---

### Phase 6: P2 Code Hygiene

**Sprint Size**: 2 sprints (4 weeks)
**Estimated Effort**: 50 hours
**Goal**: Systematic cleanup of code smells and hygiene issues

---

#### GOAL-HYG-001: Replace 216 console.* Calls with Structured Logging

- **Description**: Replace all `console.log/warn/error` calls with the structured logger from `v3/src/logging/`.
- **Source Finding**: Code Smells Report, Section 8 (216 calls across 30+ files)
- **Preconditions**: None
- **Files to modify** (worst offenders first):
  - `v3/src/performance/run-gates.ts` (29 calls)
  - `v3/src/learning/dream/dream-scheduler.ts` (22 calls)
  - `v3/src/learning/real-qe-reasoning-bank.ts` (21 calls)
  - `v3/src/strange-loop/strange-loop.ts` (15 calls)
  - `v3/src/kernel/unified-memory-migration.ts` (14 calls)
  - `v3/src/learning/qe-reasoning-bank.ts` (13 calls)
  - `v3/src/learning/qe-unified-memory.ts` (13 calls)
  - ~23 additional files
- **Agent type**: `coder`
- **Acceptance criteria**:
  - Zero `console.log/warn/error` calls in production source (src/) files
  - All replaced with appropriate logger methods (debug/info/warn/error)
  - ESLint rule `no-console` enabled for src/ directory
  - All tests pass
- **Estimated complexity**: M
- **Dependencies**: None

#### GOAL-HYG-002: Consolidate Magic Numbers into Named Constants

- **Description**: Migrate all timeout, size, interval, and threshold values to `kernel/constants.ts` or module-level named constants.
- **Source Finding**: Code Smells Report, Section 4 (60+ occurrences)
- **Preconditions**: None
- **Files to modify**:
  - `v3/src/kernel/constants.ts` (add new constants)
  - `v3/src/validation/parallel-eval-runner.ts` (lines 65-67)
  - `v3/src/kernel/unified-persistence.ts` (lines 52-54)
  - `v3/src/performance/optimizer.ts` (lines 129-143)
  - `v3/src/integrations/ruvector/persistent-q-router.ts` (lines 102-103)
  - `v3/src/kernel/memory-factory.ts` (lines 234-247)
  - ~55 additional files
- **Agent type**: `coder`
- **Acceptance criteria**:
  - All timeout/size/interval/threshold values either in `kernel/constants.ts` or as module-level `const`
  - No bare numeric literals for configuration values
  - All tests pass
- **Estimated complexity**: M
- **Dependencies**: None

#### GOAL-HYG-003: Fix Deep Import Paths with Path Aliases

- **Description**: Replace 23+ deep relative imports (4+ levels) with TypeScript path aliases.
- **Source Finding**: Code Smells Report, Section 7 (23 occurrences)
- **Preconditions**: None
- **Files to modify**:
  - `v3/tsconfig.json` (add path aliases for `@shared/*`, `@kernel/*`, `@integrations/*`)
  - 23+ files with `../../../../` import paths
- **Agent type**: `coder`
- **Acceptance criteria**:
  - Zero import paths with `../../../../` or deeper
  - Path aliases configured and working
  - Build succeeds
  - All tests pass
- **Estimated complexity**: M
- **Dependencies**: None

#### GOAL-HYG-004: Consolidate MCP Tool Registration

- **Description**: Replace 6 identical registration loops with a single loop over combined tool arrays.
- **Source Finding**: Code Smells Report, Pattern D (6 identical loops)
- **Preconditions**: None
- **Files to modify**:
  - `v3/src/mcp/server.ts` (lines 676-703)
- **Agent type**: `coder`
- **Acceptance criteria**:
  - Single registration loop: `for (const tool of [...CORE_TOOLS, ...TASK_TOOLS, ...]) { register(tool); }`
  - Fix tool handler type mismatch to eliminate `as any` casts
  - All MCP tests pass
- **Estimated complexity**: S
- **Dependencies**: None

#### GOAL-HYG-005: Add Debug-Level Logging to Silent Catch Blocks

- **Description**: Add `debug`-level logging to the ~15 catch blocks that currently suppress errors silently.
- **Source Finding**: Code Smells Report, Section 5 (~15 occurrences)
- **Preconditions**: GOAL-HYG-001 (structured logging)
- **Files to modify**:
  - `v3/src/kernel/unified-persistence.ts` (lines 312-313)
  - `v3/src/kernel/unified-memory.ts` (lines 2137-2138)
  - `v3/src/kernel/hybrid-backend.ts` (lines 376-377)
  - `v3/src/sync/readers/sqlite-reader.ts` (lines 159-160)
  - ~11 additional files
- **Agent type**: `coder`
- **Acceptance criteria**:
  - All catch blocks have at minimum `logger.debug()` with context
  - No completely empty catch blocks
  - `sqlite-reader.ts` returns 0 with a debug log, not silently
- **Estimated complexity**: S
- **Dependencies**: GOAL-HYG-001

---

## 3. Swarm Execution Strategy

### 3.1 Phase-Level Swarm Organization

```
Phase 1 (Security):     Hierarchical topology, 4 agents
Phase 2 (Performance):  Hierarchical topology, 3 agents
Phase 3 (Refactoring):  Hierarchical topology, 8 agents (parallel file decomposition)
Phase 4 (Testing):      Mesh topology, 6 agents (independent test writing)
Phase 5 (Test Quality): Mesh topology, 4 agents
Phase 6 (Hygiene):      Hierarchical topology, 4 agents (cross-file consistency)
```

### 3.2 Agent Assignments

| Phase | Agent Type | Count | Responsibility |
|-------|-----------|-------|---------------|
| 1 | qe-security-scanner | 1 | Validate all security fixes post-implementation |
| 1 | coder | 3 | Implement SEC-001 through SEC-007 (3 parallel streams) |
| 2 | coder | 2 | PERF-001 through PERF-008 (2 parallel streams) |
| 2 | qe-tdd-red | 1 | Write benchmark tests for performance fixes |
| 3 | coder | 6 | File decomposition (1 file per agent, up to 6 parallel) |
| 3 | qe-test-architect | 1 | Update test imports and verify test pass after refactoring |
| 3 | reviewer | 1 | Review extracted modules for SRP compliance |
| 4 | qe-tdd-red | 4 | Write test stubs (4 modules in parallel) |
| 4 | qe-tdd-green | 2 | Validate test correctness and coverage |
| 5 | coder | 3 | Fake timers, afterEach, test splits (parallel streams) |
| 5 | qe-test-architect | 1 | E2E test design and validation |
| 6 | coder | 3 | Console replacement, magic numbers, deep imports (parallel) |
| 6 | reviewer | 1 | Cross-file consistency review |

### 3.3 Parallelization Map

```
Phase 1: SEC-001 || SEC-002 || SEC-003 || SEC-004
         SEC-005 || SEC-006 || SEC-007 (independent, all parallel)

Phase 2: PERF-001 -> PERF-003 (sequential dependency)
         PERF-002 || PERF-004 -> PERF-005 (partial chain)
         PERF-006 || PERF-007 (independent)
         PERF-008 (after PERF-001)

Phase 3: CQ-001 -> CQ-002 -> CQ-004 (chain for coordinators)
         CQ-003 || CQ-006 || CQ-007 (independent, all parallel)
         CQ-005 (after CQ-002 and CQ-004)

Phase 4: TEST-001 || TEST-002 || TEST-003 || TEST-005 || TEST-006 || TEST-007 (all independent)
         TEST-004 (after Phase 3 coordinator refactoring)

Phase 5: TQ-001 || TQ-002 || TQ-003 || TQ-005 (all independent)
         TQ-004 (after Phase 1 + Phase 2)

Phase 6: HYG-001 || HYG-002 || HYG-003 || HYG-004 (all independent)
         HYG-005 (after HYG-001)
```

### 3.4 Memory Sharing Strategy

```bash
# Namespace structure for cross-agent learning
npx @claude-flow/cli@latest memory store --namespace "improvement-plan" --key "phase-1-patterns" --value "..."
npx @claude-flow/cli@latest memory store --namespace "improvement-plan" --key "refactoring-patterns" --value "..."

# Shared namespaces:
# - improvement-plan/security-fixes    : Security fix patterns and validation results
# - improvement-plan/refactoring       : File decomposition patterns (e.g., coordinator extraction template)
# - improvement-plan/test-patterns     : Test stub templates and mocking strategies
# - improvement-plan/hygiene           : Replacement patterns for console.log, magic numbers, etc.
```

### 3.5 Swarm Init Commands

```bash
# Phase 1-2: Security + Performance (tight coordination)
npx @claude-flow/cli@latest swarm init \
  --topology hierarchical \
  --max-agents 6 \
  --strategy specialized

# Phase 3: Refactoring (parallel file work with coordination)
npx @claude-flow/cli@latest swarm init \
  --topology hierarchical \
  --max-agents 8 \
  --strategy specialized

# Phase 4-5: Testing (independent test writing)
npx @claude-flow/cli@latest swarm init \
  --topology mesh \
  --max-agents 6 \
  --strategy specialized

# Phase 6: Hygiene (cross-file consistency)
npx @claude-flow/cli@latest swarm init \
  --topology hierarchical \
  --max-agents 4 \
  --strategy specialized
```

---

## 4. Success Metrics & Quality Gates

### 4.1 Phase Quality Gates

| Phase | Gate Criteria | Blocking? |
|-------|--------------|-----------|
| **Phase 1** | Zero critical/high security findings on rescan; `npm audit` clean; all tests pass | YES |
| **Phase 2** | GOAP benchmark >5x faster; no OOM in 1-hour Queen run; all tests pass | YES |
| **Phase 3** | Zero files >2,000 lines; zero `as any` consensus casts; all tests pass; build succeeds | YES |
| **Phase 4** | 58 new test files created; all new tests pass; security-compliance scanners 80%+ coverage | YES |
| **Phase 5** | Zero `it.skip` >30 days old; `afterEach` in 80%+ test files; E2E ratio >5% | NO (advisory) |
| **Phase 6** | Zero `console.*` in src/; all timeouts use named constants; zero `../../../../` imports | NO (advisory) |

### 4.2 Target Metrics After Full Execution

| Metric | Before | After | Method of Measurement |
|--------|--------|-------|----------------------|
| Files >500 lines | 397 (42%) | <250 (26%) | `find v3/src -name '*.ts' \| xargs wc -l` |
| Files >2,000 lines | 10 | 0 | Same |
| Functions CC >50 | 9 | 0 | Complexity analyzer rescan |
| Functions CC >20 | 41 | <15 | Same |
| Max nesting depth | 10 | <=6 | Same |
| `as any` casts | 103 | <30 | `grep -r 'as any' v3/src/ \| wc -l` |
| `console.*` calls | 216 | 0 | `grep -rn 'console\.' v3/src/ \| wc -l` |
| Error coercion patterns | 724 | 0 | grep for inline pattern |
| File-level test coverage | 62% | 75%+ | Coverage report |
| Untested source files | 303 | <200 | Coverage gap rescan |
| E2E test ratio | 2% | 5%+ | Test file count |
| Security findings (critical+high) | 10 | 0 | Security rescan |
| npm audit vulnerabilities | 1 | 0 | `npm audit` |

### 4.3 Regression Prevention Strategy

1. **CI Quality Gates**: Add to CI pipeline after Phase 1:
   - `npm audit --audit-level=high` must pass
   - No new files >1,000 lines (warn at 500)
   - No new functions with CC>20 (using complexity analyzer)
   - Test coverage must not decrease

2. **ESLint Rules** (add progressively):
   - `no-console` for `v3/src/` (Phase 6)
   - `no-raw-json-parse` custom rule (Phase 1)
   - `max-lines` set to 500 per file (Phase 3)

3. **Pre-commit Hooks**:
   - Run lint on changed files
   - Run affected tests

---

## 5. Risk Matrix

### Phase 1: Security Fixes

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `safeJsonParse` breaks legitimate parse patterns | Medium | Medium | Test each replacement; keep `JSON.parse` for trusted internal data where perf matters |
| `spawn()` migration changes command behavior | Low | High | Test each command executor with real browser integration test before merging |
| `markdown-it` upgrade has breaking changes | Low | Low | Run full test suite; markdown rendering is non-critical path |

### Phase 2: Performance Fixes

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| BinaryHeap changes GOAP plan quality (different tie-breaking) | Medium | Medium | Verify benchmark plans match expected quality; tie-break by insertion order |
| Moving sync I/O to initialize() breaks consumers that read before init | Medium | High | Grep for all `new QEKernelImpl` usages; ensure all call `initialize()` |
| Service cache change breaks singleton assumptions in plugins | Low | Medium | Search for `resetServiceCaches` callers; update accordingly |

### Phase 3: Refactoring

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| File decomposition breaks import paths across codebase | High | Medium | Update all imports; use barrel exports from original file paths |
| BaseDomainCoordinator introduces inheritance complexity | Medium | Medium | Keep base class thin; use composition over inheritance where possible |
| Circular dependency fix changes event timing | Medium | High | Run full integration test suite; monitor for race conditions |

### Phase 4: Test Coverage

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| New tests are shallow/happy-path only | Medium | Low | Use mutation testing on new tests (Stryker) to validate kill rate |
| Mock-heavy tests pass but hide real bugs | Medium | Medium | Use TDD London School; keep mocks at boundaries only |
| Test writing velocity slower than expected | Medium | Low | Prioritize by risk score; ship highest-risk tests first |

### Phase 5: Test Quality

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Fake timer migration breaks timing-sensitive logic | Medium | Medium | Test each file individually; keep `vi.useRealTimers()` in afterEach |
| Removing skipped tests loses coverage intent | Low | Low | Create tracking issues for each removed skip |
| E2E tests are flaky in CI | High | Medium | Use retry mechanism; run E2E in dedicated CI job with longer timeout |

### Phase 6: Code Hygiene

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Structured logger has different semantics than console | Low | Low | Verify logger output format; update log parsing if needed |
| Path aliases break build tooling (bundler, test runner) | Medium | Medium | Configure vitest and tsc path resolution; test build before merging |
| Named constants change default values accidentally | Low | High | Review each constant extraction; match exact original values |

### Rollback Plans

| Phase | Rollback Strategy |
|-------|------------------|
| Phase 1 | Each security fix is an independent commit; revert individual commits if issues arise |
| Phase 2 | Performance fixes are isolated; revert specific commits; old code is preserved as comments during transition |
| Phase 3 | Refactoring done on feature branches per God file; each branch independently mergeable; revert branch if tests fail |
| Phase 4 | New test files only; deletion of new files reverts to previous state; no source code changes |
| Phase 5 | Test modifications only; git revert on individual test file commits |
| Phase 6 | Mechanical replacements are individually revertible; ESLint rules can be set to warn instead of error |

---

## 6. Execution Timeline

```
Week 1-2:   Phase 1 (Security) + Phase 2 (Performance) -- parallel execution
Week 3-4:   Phase 3a (CQ-001, CQ-003, CQ-006, CQ-007) -- independent refactoring
Week 5-6:   Phase 3b (CQ-002, CQ-004, CQ-005) -- dependent coordinator work
Week 5-8:   Phase 4 (Testing) -- overlaps with Phase 3b, independent streams
Week 7-10:  Phase 5 (Test Quality) -- overlaps with Phase 4
Week 9-12:  Phase 6 (Hygiene) -- final cleanup pass
Week 12:    Full regression test + metrics validation + report generation
```

**Total Calendar Time**: ~12 weeks (3 months)
**Total Effort**: ~300 hours across all phases
**Estimated Team Size**: 2-3 developers + QE swarm agents

---

## 7. Quick Reference: Goal Dependencies Graph

```
GOAL-SEC-001 ─────────────────────────────────┐
GOAL-SEC-002 ─────────────────────────────────┤
GOAL-SEC-003 ─────────────────────────────────┤
GOAL-SEC-004 ─────────────────────────────────┤ ── Phase 1 Gate ──┐
GOAL-SEC-005 ─────────────────────────────────┤                    │
GOAL-SEC-006 ─────────────────────────────────┤                    │
GOAL-SEC-007 ─────────────────────────────────┘                    │
                                                                    │
GOAL-PERF-001 ──→ GOAL-PERF-003 ──→ GOAL-PERF-008 ──┐             │
GOAL-PERF-002 ────────────────────────────────────────┤             │
GOAL-PERF-004 ──→ GOAL-PERF-005 ──────────────────────┤ Phase 2 ──┤
GOAL-PERF-006 ────────────────────────────────────────┤  Gate      │
GOAL-PERF-007 ────────────────────────────────────────┘             │
                                                                    │
GOAL-CQ-001 ──→ GOAL-CQ-002 ──→ GOAL-CQ-004 ──→ GOAL-CQ-005 ─┐  │
GOAL-CQ-003 ───────────────────────────────────────────────────┤   │
GOAL-CQ-006 ───────────────────────────────────────────────────┤ P3│
GOAL-CQ-007 ───────────────────────────────────────────────────┘   │
                                                                    │
GOAL-TEST-001 through TEST-007 ────── (all independent) ──── P4 ──┤
                                                                    │
GOAL-TQ-001 through TQ-003, TQ-005 ── (independent) ──────── P5 ──┤
GOAL-TQ-004 ────────────────── (depends on P1+P2) ───────────┘    │
                                                                    │
GOAL-HYG-001 ──→ GOAL-HYG-005 ────────────────────────── P6 ──────┘
GOAL-HYG-002 ── (independent) ──────────────────────────┘
GOAL-HYG-003 ── (independent) ──────────────────────────┘
GOAL-HYG-004 ── (independent) ──────────────────────────┘
```

---

*Plan generated by SPARC-GOAP Planner based on QE Fleet Analysis Reports 01-06 for v3.6.8*
*2026-02-16*
