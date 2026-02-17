# Test Quality and Test Suite Optimization Report

**Version**: 3.6.8
**Date**: 2026-02-16
**Scope**: v3/src/ (36 modules, ~752 source files) and v3/tests/ (515 test files, ~16,590 test cases)
**Framework**: Vitest with v8 coverage, forks pool isolation

---

## Executive Summary

The v3 test suite is substantial (515 test files, 16,590 individual test cases) and demonstrates strong engineering practices in most areas. The test pyramid ratio is healthy at 69/22/2 (unit/integration/e2e), with consistent AAA patterns and behavior-focused test naming. However, the analysis reveals significant coverage gaps in 6 modules (agents, memory, init, performance, cli, test-scheduling), 303 untested source files out of 752 (40% file-level gap), and the complete absence of snapshot tests and mutation testing infrastructure. Approximately 50 tests are skipped or marked as todo, and 15 test files exceed 1,300 lines, indicating structural decomposition opportunities.

**Overall Test Quality Score: 7.2/10**

---

## 1. Coverage Gap Analysis

### 1.1 Module-Level Test Ratios

Modules ranked by test-to-source file ratio (test files / source files):

| Module | Source Files | Test Files | Ratio | Risk Level |
|--------|-------------|-----------|-------|------------|
| agents | 8 | 1 | 12% | CRITICAL |
| memory | 8 | 1 | 12% | CRITICAL |
| init | 31 | 6 | 19% | HIGH |
| performance | 5 | 1 | 20% | HIGH |
| cli | 42 | 16 | 38% | MEDIUM |
| test-scheduling | 7 | 3 | 42% | MEDIUM |
| hooks | 5 | 3 | 60% | LOW |
| skills | 1 | 0 | 0% | LOW (small) |
| testing | 3 | 0 | 0% | LOW (infra) |
| workflows | 1 | 0 | 0% | LOW (small) |
| migrations | 1 | 0 | 0% | LOW (small) |
| types | 1 | 0 | 0% | LOW (type-only) |

**Well-covered modules** (>80% ratio): kernel, validation, logging, migration, feedback, early-exit, causal-discovery, routing, optimization, governance, workers, learning.

### 1.2 Untested Source Files (Top Priority)

303 of 752 source files (~40%) have no directly corresponding test file. Key untested files by criticality:

**Critical (Core Infrastructure)**:
- `src/agents/claim-verifier/` - All 5 files untested (file-verifier, output-verifier, test-verifier, claim-verifier-service, interfaces)
- `src/memory/` - 7 of 8 files untested (only 1 test file for the module)
- `src/hooks/quality-gate-enforcer.ts` - Quality gate enforcement logic untested
- `src/hooks/cross-phase-hooks.ts` - Cross-phase coordination untested

**High (Business Logic)**:
- `src/coordination/dynamic-scaling/dynamic-scaler.ts` - Auto-scaling logic
- `src/coordination/consensus/strategies/unanimous-strategy.ts` - Consensus strategy
- `src/coordination/consensus/strategies/weighted-strategy.ts` - Consensus strategy
- `src/domains/test-execution/services/network-mocker.ts` - Network mocking service
- `src/governance/feature-flags.ts` - Feature flag system
- `src/governance/trust-accumulator-integration.ts` - Trust system integration

**Medium (Integrations & Init)**:
- `src/init/agents-installer.ts` - Agent installation workflow
- `src/init/n8n-installer.ts` - n8n integration installer
- `src/integrations/embeddings/` - Multiple embedding subsystems (cache, extensions, HNSW index)
- `src/cli/scheduler/persistent-scheduler.ts` - CLI scheduler persistence
- `src/cli/config/cli-config.ts` - CLI configuration management

### 1.3 Test Pyramid Distribution

| Layer | Files | Percentage | Ideal Target | Status |
|-------|-------|-----------|-------------|--------|
| Unit | 359 | 69% | 70% | ON TARGET |
| Integration | 118 | 22% | 20% | ON TARGET |
| E2E | 14 | 2% | 10% | UNDER-REPRESENTED |
| Other (perf/security/load) | 24 | 4% | - | - |

The pyramid is well-shaped for unit and integration layers. E2E tests are significantly under-represented at 2% versus the recommended 10%. The E2E suite covers only Sauce Demo flows (authentication, cart, purchase, search, security) plus one critical-user-journeys file. Core platform workflows (init, agent spawning, test generation, MCP tool usage) lack E2E coverage.

---

## 2. Test Quality Patterns

### 2.1 AAA Pattern Adherence: STRONG

Tests consistently follow Arrange-Act-Assert. Example from `event-bus.test.ts`:

```typescript
it('should deliver events to matching subscribers', async () => {
  // Arrange
  const handler = vi.fn();
  eventBus.subscribe('test.event', handler);
  const event: DomainEvent = { id: '1', type: 'test.event', ... };

  // Act
  await eventBus.publish(event);

  // Assert
  expect(handler).toHaveBeenCalledWith(event);
});
```

The codebase also uses well-structured helper functions and test context factories (`createCoordinatorTestContext`, `createMockMemoryBackend`, `createTestContract`), which keep tests focused.

### 2.2 Test Naming: STRONG

Test names are overwhelmingly behavior-focused using the `should` convention:

- `should deliver events to matching subscribers`
- `should handle database connection failure gracefully`
- `should track failures`
- `should create record for new test`

No instances of implementation-detail-leaking names (e.g., "calls foo method" or "sets internal state"). This is excellent.

### 2.3 Behavior vs Implementation Testing: MOSTLY BEHAVIOR

The majority of tests verify observable behavior (return values, state changes, event emissions). Minor exceptions found:

- `fleet-integration.test.ts` - Tests access internal mock state via module-scoped mutable variables
- `dream-scheduler.test.ts` - Tests call `mockEventBus._emit()` (underscore-prefixed internal method)
- `file-watcher.test.ts` - Tests call `watcher._simulateFileAdd()` (test-specific backdoor)

These are pragmatic compromises for testing event-driven systems, not significant anti-patterns.

### 2.4 Assertion Density: HEALTHY

No test files were found with zero assertions. Every test file contains `expect` calls. The broad search for assertion-free test files returned empty results.

---

## 3. Test Anti-Patterns

### 3.1 Tests with No Assertions: NONE FOUND

All 515 test files contain assertions. This is the ideal result.

### 3.2 Shared Mutable State Between Tests: LOW RISK (6 instances)

Module-scoped mutable `let` variables were found in only 2 files:

| File | Variables | Risk |
|------|----------|------|
| `unit/init/fleet-integration.test.ts` | `mockPrepareReturnValue`, `mockDatabaseShouldThrow`, `readlineMockAnswer` | MEDIUM - Reset in beforeEach but scope is wide |
| `unit/cli/commands/llm-router.test.ts` | `mockConsoleLog`, `mockConsoleError`, `mockExit` | LOW - Console spies, reset pattern |

**Recommendation**: Encapsulate these into test context objects initialized per-test in `beforeEach`.

### 3.3 Overly Broad Module Mocks: MODERATE CONCERN (38 files)

38 test files use `vi.mock()` at module level. Most are reasonable (mocking `fs`, `chalk`, `better-sqlite3`), but 3 files have excessive mocking:

| File | vi.mock() Count | Concern |
|------|----------------|---------|
| `queen-coordinator-race-condition.test.ts` | 12 | Extremely high - mocking 12 modules may hide real integration issues |
| `sync-agent.test.ts` | 5 | Moderate |
| `fleet-integration.test.ts` | 4 | Moderate |

**Risk**: When tests mock too many dependencies, they become "happy-path verifiers" that pass even when real integrations break. The queen-coordinator race-condition test mocking 12 modules is the most concerning, as race conditions are precisely the kind of bug that broad mocking conceals.

### 3.4 Skipped and Todo Tests: 50 TOTAL

| Category | Count | Examples |
|----------|-------|---------|
| Skipped (`it.skip`/`describe.skip`) | 35 | OAuth flow integration (9 skips), infra-healing-docker (5), file-watcher (6) |
| Todo (`it.todo`) | 15 | Across various files |

Notable clusters of skipped tests:
- `integration/adapters/a2a/oauth-flow.integration.test.ts` - 9 skipped tests (likely waiting for OAuth server setup)
- `unit/adapters/a2a/discovery/file-watcher.test.ts` - 6 skipped tests
- `integration/infra-healing-docker.test.ts` - 5 skipped tests (Docker-dependent)
- `unit/mcp/handlers/domain-handlers.test.ts` - 4 skipped tests

**Recommendation**: Skipped tests should either be fixed or removed. Tests skipped for >30 days are test debt.

### 3.5 Test Files Exceeding Size Limits: 15 FILES > 1,300 LINES

| File | Lines | Recommendation |
|------|-------|---------------|
| `visual-accessibility/vibium-visual-testing.test.ts` | 1,822 | Split by feature area |
| `adapters/a2ui/renderer.test.ts` | 1,532 | Split by rendering concern |
| `adapters/ag-ui/json-patch.test.ts` | 1,516 | Split: operations, error cases, edge cases |
| `integrations/agentic-flow/onnx-embeddings.test.ts` | 1,501 | Split: init, embedding, search |
| `domains/enterprise-integration/coordinator.test.ts` | 1,443 | Split by workflow |
| `adapters/a2a/agent-cards.test.ts` | 1,438 | Split: creation, discovery, validation |
| `integrations/vibium/vibium-client.test.ts` | 1,424 | Split: API, streaming, error handling |
| `adapters/ag-ui/event-adapter.test.ts` | 1,421 | Split by event type |
| `integration/learning/dream-scheduler.test.ts` | 1,410 | Split: scheduling, execution, learning |
| `adapters/a2a/tasks.test.ts` | 1,365 | Split: CRUD, lifecycle, error paths |

Large test files are harder to navigate, slower to execute (full file must parse), and more likely to accumulate shared state issues.

### 3.6 Duplicate Test Names: PRESENT

29 tests share the exact name `should return error when fleet is not initialized` across different files. While within different `describe` blocks, identical names across the suite make failure triage harder. Other duplicates: `should have correct name` (19), `should dispose without errors` (14), `should initialize successfully` (12).

**Recommendation**: Add module/class context to test names to improve failure diagnostics.

---

## 4. Test Suite Structure

### 4.1 Organization Alignment: STRONG

The test directory mirrors the source structure well:

```
tests/
  unit/           -> Maps to src/ modules (adapters, cli, coordination, domains, ...)
  integration/    -> Cross-module integration (adapters, browser, cli, coordination, ...)
  e2e/            -> End-to-end Playwright specs
  benchmarks/     -> Performance benchmarks (.bench.ts)
  security/       -> Security-specific tests
  load/           -> Load testing
  performance/    -> (empty - tests live in benchmarks/)
  fixtures/       -> Shared test fixtures
  mocks/          -> Shared mocks (only index.ts)
```

**Issues**:
- `tests/performance/` is empty; performance tests live in `tests/benchmarks/`
- `tests/mocks/` contains only `index.ts` -- underutilized
- `tests/integrations/` (plural) exists alongside `tests/integration/` (singular) -- confusing dual directories
- Some integration-level tests live in `tests/unit/` (e.g., `unit/init/fleet-integration.test.ts`)

### 4.2 Test Fixtures: ADEQUATE

Fixtures exist at:
- `tests/fixtures/` - Shared fixtures (a2a, sample-project, sample-validation-results.json)
- `tests/benchmarks/fixtures/` - Benchmark-specific fixtures
- `tests/e2e/fixtures/` - E2E test fixtures
- `tests/e2e/sauce-demo/fixtures/` - Sauce Demo page objects

Test utility files are present but scattered:
- `tests/unit/domains/plugin-test-utils.ts`
- `tests/unit/domains/coordinator-test-utils.ts`
- `tests/unit/mcp/handlers/handler-test-utils.ts`
- `tests/unit/kernel/kernel-test-utils.ts`

**Recommendation**: Consolidate test utilities under `tests/helpers/` or `tests/support/` for better discoverability.

### 4.3 Unit/Integration Separation: MOSTLY CLEAN

The separation is clear in most cases. Minor boundary violations:
- `tests/unit/init/fleet-integration.test.ts` is in unit/ but tests integration behavior
- `tests/strange-loop/` and `tests/agents/` sit at the top level outside the unit/integration hierarchy

### 4.4 Integration Test Isolation: WELL-DESIGNED

`tests/integration/setup.ts` implements proper DB isolation:
- Creates a temporary directory per test file
- Sets `AQE_PROJECT_ROOT` to the temp directory
- Resets `UnifiedMemoryManager` singleton between files
- Cleans up temp directories in `afterAll`

This is a strong pattern that prevents test pollution.

---

## 5. Test Performance Analysis

### 5.1 Vitest Configuration: WELL-OPTIMIZED

```typescript
pool: 'forks',                    // Process isolation (prevents HNSW segfaults)
fileParallelism: !process.env.CI, // Parallel locally, serial in CI (OOM prevention)
maxForks: 2,                      // Conservative fork limit
testTimeout: 10000,               // 10s per test
hookTimeout: 15000,               // 15s for setup/teardown
bail: process.env.CI ? 5 : 0,    // Fail fast in CI after 5 failures
```

The OOM mitigation is thorough with `NODE_OPTIONS='--max-old-space-size=1024'` in the npm test script.

### 5.2 Timing-Dependent Tests: 83 FILES

83 unit test files reference `setTimeout`, `Date.now`, `sleep`, or `new Date()`. Only 38 of those use `vi.useFakeTimers()`. This leaves approximately 45 test files that may have real timing dependencies, making them potential flakiness sources.

**High-risk files** (timing-dependent without fake timers):
- `unit/test-scheduling/phase-scheduler.test.ts` - Scheduler timing
- `unit/strange-loop/infra-healing/*.test.ts` - Recovery timing
- `unit/causal-discovery/*.test.ts` - Temporal causality analysis

### 5.3 Test Segmentation for Speed

The package.json splits tests into tiers:
- `test:unit:fast` - Lightweight unit tests (adapters, shared, cli, etc.)
- `test:unit:heavy` - Heavy unit tests (domains, coordination, integrations)
- `test:unit:mcp` - MCP-specific tests

This is good for CI parallelization. However, no explicit `test:smoke` script exists for rapid feedback.

### 5.4 Cleanup Coverage

| Metric | Count | Percentage |
|--------|-------|-----------|
| Tests with `beforeEach` | 452 | 88% |
| Tests with `afterEach` | 290 | 57% |

The 33% gap between `beforeEach` and `afterEach` usage suggests some tests are not cleaning up resources (event listeners, timers, database connections). Tests that create but do not dispose resources can cause:
- Memory leaks during test runs
- Port conflicts
- File descriptor exhaustion

---

## 6. Missing Test Types

### 6.1 Property-Based Tests: PRESENT (10 files)

Property-based tests using fast-check patterns exist in 10 files, primarily in:
- `tests/unit/domains/test-generation/` (coordinator, plugin, test-generator-di)
- `tests/unit/domains/defect-intelligence/` (root-cause-analyzer, pattern-learner)
- `tests/unit/coordination/mincut/` (causal-discovery, morphogenetic-growth)
- `tests/unit/coordination/protocols/defect-investigation`

Coverage is limited to test-generation and defect-intelligence domains. Modules that would benefit from property-based testing but lack it:
- **Validation** (`src/validation/`) - Input validation is a classic property-based testing target
- **Routing** (`src/routing/`) - Route selection invariants
- **Memory** (`src/memory/`) - Storage invariants (write then read = original value)
- **Optimization** (`src/optimization/`) - Algorithm correctness properties
- **Shared utilities** (`src/shared/`) - Data transformation invariants

### 6.2 Mutation Testing: NOT CONFIGURED

No Stryker configuration or mutation testing infrastructure exists. An agent definition (`qe-mutation-tester.md`) and skill (`skills/mutation-testing/`) are present but are not wired into the test pipeline.

**Impact**: Without mutation testing, there is no way to verify that existing tests would catch real bugs. High line coverage can coexist with low mutation scores if tests only exercise happy paths.

### 6.3 Snapshot Tests: NONE

Zero snapshot tests across the entire suite. Candidates for snapshot testing:
- `adapters/ag-ui/` - JSON patch operations, event serialization
- `adapters/a2a/agent-cards` - Agent card JSON structure
- `domains/contract-testing/` - Contract validation output
- `mcp/` - MCP tool response structures
- `cli/` - CLI help text and formatted output

### 6.4 Contract Tests: MINIMAL (1 file)

One contract test file exists: `tests/unit/domains/contract-testing/contract-validator.test.ts`. This tests the contract validation service itself but does not test actual inter-service contracts between the bounded contexts (e.g., test-generation <-> test-execution, kernel <-> domains).

### 6.5 Load/Stress Tests: MINIMAL

- `tests/load/100-agents.test.ts` - Tests 100+ agent coordination
- No load tests for: MCP tool throughput, memory backend under concurrent writes, event bus under high volume

### 6.6 Security Tests: MINIMAL (1 file)

Only `tests/security/oauth-security.test.ts` exists. Missing security test coverage for:
- Input sanitization (SQL injection in memory backend queries)
- Path traversal in file operations
- SSRF in URL handling
- Secrets in log output
- RBAC/authorization boundaries

---

## 7. Optimization Recommendations

### 7.1 Tests to Add (Coverage Gaps) -- Priority Order

**P0 - Critical (agents, memory, hooks)**:
1. `src/agents/claim-verifier/` - 5 untested files; this verifies agent output integrity
2. `src/memory/` - 7 untested files; core persistence layer
3. `src/hooks/quality-gate-enforcer.ts` - Quality enforcement must be tested
4. `src/hooks/cross-phase-hooks.ts` - Cross-phase coordination logic

**P1 - High (consensus, governance, init)**:
5. `src/coordination/consensus/strategies/` - Untested consensus strategies
6. `src/coordination/dynamic-scaling/dynamic-scaler.ts` - Auto-scaling logic
7. `src/governance/feature-flags.ts` - Feature flag correctness
8. `src/init/agents-installer.ts` and `src/init/n8n-installer.ts` - Installation workflows
9. Additional E2E tests for core platform workflows (init, agent spawn, test generation)

**P2 - Medium (embeddings, CLI)**:
10. `src/integrations/embeddings/` - 4+ untested embedding subsystems
11. `src/cli/scheduler/persistent-scheduler.ts` - Scheduler persistence
12. `src/cli/config/cli-config.ts` - CLI configuration

### 7.2 Tests to Refactor (Quality Improvements)

| Action | Target | Rationale |
|--------|--------|-----------|
| Split | 15 test files >1,300 lines | Faster execution, easier maintenance |
| Add fake timers | ~45 timing-dependent test files | Eliminate flakiness risk |
| Add afterEach | ~160 test files missing cleanup | Prevent resource leaks |
| Reduce vi.mock | `queen-coordinator-race-condition.test.ts` (12 mocks) | Over-mocking hides integration bugs |
| Fix shared state | `fleet-integration.test.ts` module-scoped lets | Prevent order-dependent failures |
| Resolve skipped | 35 skipped tests | Either fix or remove; test debt accrues |
| Deduplicate names | 29x "should return error when fleet is not initialized" | Improve failure triage |

### 7.3 Tests to Remove (Redundant)

No clearly redundant tests identified. The 29 identically-named tests (`should return error when fleet is not initialized`) appear in different files testing different modules, so they test different code paths despite identical names. No removals recommended at this time.

### 7.4 Missing Test Infrastructure to Add

| Infrastructure | Current State | Recommendation |
|---------------|--------------|----------------|
| Mutation testing | Agent/skill defined, not wired | Add Stryker config, run on P0 modules |
| Snapshot tests | 0 files | Add for serialization-heavy modules (a2a, ag-ui, mcp) |
| Smoke test script | Missing | Add `test:smoke` npm script (~30 critical tests, <30s) |
| Test utility consolidation | 4 scattered util files | Move to `tests/helpers/` |
| Test coverage gate | Coverage config exists, no CI gate | Add minimum coverage threshold to CI (e.g., 80%) |
| Flakiness monitoring | `FlakyTestTracker` exists in src | Wire into CI pipeline to track flaky test trends |

### 7.5 Performance Optimizations

1. **Consolidate `tests/integration/` and `tests/integrations/`** into a single directory to simplify CI parallelization
2. **Remove empty `tests/performance/`** directory (tests live in `tests/benchmarks/`)
3. **Add `--reporter=verbose` only for CI**, use default reporter locally for speed
4. **Consider `poolMatchGlobs`** in vitest config to run pure-logic tests with `threads` pool (faster than `forks`) while keeping HNSW-dependent tests on `forks`

---

## 8. Flakiness Risk Assessment

### High-Risk Patterns Found

| Pattern | Files | Mitigation |
|---------|-------|-----------|
| Real `setTimeout` in tests | ~45 files | Replace with `vi.useFakeTimers()` |
| `Date.now()` for timing assertions | ~20 files | Use deterministic time injection |
| Module-scope mutable state | 2 files | Scope to `beforeEach` |
| Database-dependent tests without isolation | Integration tests | Already mitigated by `setup.ts` |
| Docker-dependent tests | `infra-healing-docker.test.ts` | Already skipped; add Docker CI job |

### Low-Risk Indicators (Good Practices Found)

- Process isolation via `forks` pool prevents HNSW segfaults
- `AQE_PROJECT_ROOT` env override prevents test DB pollution
- `UnifiedMemoryManager.resetInstance()` prevents singleton leakage
- Bail-on-failure in CI prevents cascade test failures
- All tests have assertions (no false-green tests)

---

## 9. Metrics Summary

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Total test files | 515 | - | - |
| Total test cases | 16,590 | - | - |
| Unit test ratio | 69% | 70% | ON TARGET |
| Integration test ratio | 22% | 20% | ON TARGET |
| E2E test ratio | 2% | 10% | BELOW TARGET |
| Files with no test | 303/752 (40%) | <20% | BELOW TARGET |
| Modules with <50% ratio | 6/36 | 0 | NEEDS WORK |
| Skipped tests | 35 | 0 | NEEDS WORK |
| Todo tests | 15 | 0 | NEEDS WORK |
| Files >1,300 lines | 15 | 0 | NEEDS WORK |
| Property-based test files | 10 | 20+ | BELOW TARGET |
| Snapshot test files | 0 | 10+ | MISSING |
| Mutation testing | Not configured | Configured | MISSING |
| Tests with afterEach cleanup | 57% | >80% | BELOW TARGET |

---

## 10. Prioritized Action Plan

### Sprint 1 (Immediate -- This Release)
1. Add tests for `src/agents/claim-verifier/` (5 files, ~20 tests)
2. Add tests for `src/memory/` (7 files, ~30 tests)
3. Fix 35 skipped tests or create tracking issues
4. Add `afterEach` cleanup to 50 highest-risk test files

### Sprint 2 (Next Release)
5. Add tests for `src/hooks/` (2 untested files)
6. Add tests for `src/governance/feature-flags.ts`
7. Split 5 largest test files (>1,500 lines)
8. Add `vi.useFakeTimers()` to 45 timing-dependent test files
9. Add snapshot tests for serialization modules (a2a, ag-ui, mcp)

### Sprint 3 (Following Release)
10. Configure Stryker mutation testing on kernel and coordination modules
11. Add E2E tests for core platform workflows
12. Add property-based tests for validation and routing modules
13. Consolidate `tests/integrations/` into `tests/integration/`
14. Create `tests/helpers/` for shared test utilities

---

*Report generated by QE Test Architect v3 -- Agentic QE v3.6.8*
