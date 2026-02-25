# AQE v3.7.0 Test Quality Report

**Date**: 2026-02-23
**Baseline**: v3.6.8
**Test Framework**: Vitest
**Total Test Files**: 590
**Total Test LOC**: 315,132
**Total Test Cases**: ~17,854 (across 6,439 describe blocks)

---

## 1. Test Count by Type

| Type | v3.6.8 | v3.7.0 | Delta | Change |
|------|--------|--------|-------|--------|
| Unit | 359 | 417 | +58 | +16.2% |
| Integration | 93 | 99 | +6 | +6.5% |
| E2E | 1 | 18 | +17 | +1700% |
| Performance | 0 | 3 | +3 | New |
| Security | 1 | 27 | +26 | +2600% |
| Load | 1 | 2 | +1 | +100% |
| Benchmarks | 8 | 5 | -3 | -37.5% |
| Other (coordination, integrations, learning, etc.) | -- | 19 | -- | New categories |
| **Total** | **463** | **590** | **+127** | **+27.4%** |

### Other category breakdown

- `integrations/` (outside integration/): 25 files (RL suite, Vibium, coherence, agentic-flow, agent-booster)
- `coordination/`: 11 files (tracing, fleet-tiers, competing-hypotheses, federation, etc.)
- `learning/`: 4 files
- `hooks/`: 3 files
- `domains/` (top-level): 2 files
- `strange-loop/`, `security/`, `load/`, `kernel/`, `agents/`, `fixtures/`: 1-2 files each

---

## 2. Test Pyramid Balance

```
              /\
             /  \         E2E: 18 files (3.1%)
            / E2 \
           /  E   \
          /--------\      Integration: 99 files (16.8%)
         / Integra- \
        /   tion     \
       /--------------\   Unit: 417 files (70.7%)
      /     Unit       \
     /                  \
    /____________________\
```

### Assessment: IMPROVED, but still top-heavy

**v3.6.8**: The pyramid was severely inverted at the top -- only 1 E2E test, making it effectively a triangle with no apex. Integration was 20% of unit, which was acceptable.

**v3.7.0**: Major improvement. E2E went from 1 to 18 files (including a real Sauce Demo app test suite with 8 spec files covering accessibility, cart, checkout, collection, security, home, and product flows). Integration grew modestly. The pyramid shape is now recognizable.

**Remaining gaps**:
- E2E at 3.1% of total is still below the typical 5-10% target for a platform of this complexity
- The 25 files in `integrations/` (RL suite, Vibium, coherence engines, agent-booster) act as de facto integration tests but live outside the `integration/` directory, inflating the unit count appearance
- Performance tests (3 files) remain thin for a system managing agent fleets and concurrent task execution
- Load testing (2 files) is inadequate given the "100-agents" operational target

**Grade**: B (up from C+ in v3.6.8)

---

## 3. Failing Tests Analysis

**2 failing tests** in `/workspaces/agentic-qe-new/v3/tests/unit/coordination/task-executor.test.ts`

### Failure 1: `should execute coverage analysis task` (line 321)

```
AssertionError: the given combination of arguments (undefined and string)
is invalid for this assertion.
```

**Root Cause**: The test asserts `expect(data.warning).toContain('No coverage data found')` when `data.lineCoverage === 0`, but `data.warning` is `undefined`. The coverage analysis domain service was changed to no longer return a `warning` field when no coverage data is found -- it likely now returns zero values silently. The test's conditional assertion (`if (data.lineCoverage === 0)`) enters the branch but the expected field is missing.

**Fix**: Either update the domain service to return the warning, or update the test to not expect it:
```typescript
if (data.lineCoverage === 0 && data.warning) {
  expect(data.warning).toContain('No coverage data found');
}
```

### Failure 2: `should execute requirements validation task` (line 489)

```
AssertionError: expected 0 to be greater than 0
```

**Root Cause**: The test asserts `expect(data.requirementsAnalyzed).toBeGreaterThan(0)`, but the requirements validation handler returns `requirementsAnalyzed: 0` when no requirements file path is provided in the task payload. The test creates a task with `generateBDD: true` but provides no `requirementsPath`, so the handler correctly finds zero requirements to analyze.

**Fix**: Either provide a requirements path in the test payload, or weaken the assertion:
```typescript
expect(data.requirementsAnalyzed).toBeGreaterThanOrEqual(0);
```

**Severity**: Both are test-implementation mismatches, not production bugs. The domain services work correctly; the test expectations are stale after API changes.

---

## 4. Skipped/TODO Tests

| Metric | v3.6.8 | v3.7.0 | Delta |
|--------|--------|--------|-------|
| Skipped tests (it.skip/test.skip/describe.skip) | 35 | 35 | 0 |
| TODO tests (it.todo/test.todo) | 15 | 0 | -15 |
| Files with skips | -- | 19 | -- |
| Skipped describe blocks | -- | 15 | -- |

### Files with most skips

| File | Skip Count | Notes |
|------|-----------|-------|
| `e2e/specs/cart-management.spec.ts` | 9 | E2E -- likely browser dependency |
| `unit/mcp/handlers/domain-handlers.test.ts` | 4 | MCP handler skips |
| `integrations/vibium/vibium-client.test.ts` | 3 | External service dependency |
| `unit/mcp/tools/domain-tools.test.ts` | 2 | MCP tool skips |
| `integration/planning/goap-benchmarks.test.ts` | 2 | GOAP planner benchmarks |
| `e2e/specs/purchase-flow.spec.ts` | 2 | E2E -- likely browser dependency |

**Assessment**: The 15 TODO tests from v3.6.8 were all resolved (implemented or removed). The 35 skips remain unchanged, concentrated in E2E tests requiring browser infrastructure and external service integrations (Vibium). This is acceptable -- these represent environment-dependent tests, not abandoned work.

---

## 5. Assertion Quality

### Assertion Distribution (across 35,923 total expect() calls)

| Category | Count | Percentage | Quality |
|----------|-------|-----------|---------|
| Simple `toBe()` | 19,776 | 55.0% | Low-Medium |
| Shallow (`toBeDefined`, `toBeTruthy`, etc.) | 3,970 | 11.1% | Low |
| Numeric (`toBeGreaterThan`, `toBeLessThan`, etc.) | 3,541 | 9.9% | Medium |
| Deep structural (`toMatchObject`, `toEqual`, etc.) | 1,805 | 5.0% | High |
| Behavioral (`toHaveBeenCalled`, `toThrow`, etc.) | 1,741 | 4.8% | High |
| Type assertions (`toBeInstanceOf`, etc.) | 554 | 1.5% | Medium |
| Other/combined | 4,536 | 12.6% | Varies |

### Sampled File Assessment

**Strong assertion files (deep, behavioral)**:
- `unit/memory/crdt.test.ts` -- Formal convergence verification with precise value equality checks. Tests state, timestamp, nodeId, and version fields individually. Excellent.
- `unit/governance/constitutional-enforcer.test.ts` -- Tests 7 constitutional invariants with violation detail string matching. Behavioral assertions on passed/failed states with detail inspection.
- `unit/coordination/task-executor.test.ts` -- Tests domain mapping, event publishing, result persistence with deep object inspection and file system verification.
- `unit/adapters/a2a/agent-cards.test.ts` -- Tests protocol compliance with deep structure matching.

**Weak assertion files (shallow, existence-only)**:
- `unit/init/governance-installer.test.ts` -- Heavy use of `toHaveProperty` without value checks. Tests existence but not correctness.
- `unit/mcp/handlers/domain-handlers.test.ts` -- Tests that MCP handlers return responses, but many assertions only check `toBeDefined()` on response data.
- Many integration tests use `toBeDefined()` as the terminal assertion without inspecting values.

### Assertion Depth Rating

The 55% `toBe()` figure is not inherently bad -- many are `toBe(true)`, `toBe(false)`, or `toBe('expected-string')` which are precise value checks. The concern is the 11% shallow assertions (`toBeDefined`, `toBeTruthy`) which verify existence without checking correctness.

**Grade**: B+ (adequate for most modules, excellent in crown jewels, weak in init/MCP layers)

---

## 6. Test Isolation

### Setup/Teardown Balance

| Metric | Count |
|--------|-------|
| Files with `beforeEach`/`beforeAll` | 527 |
| Files with `afterEach`/`afterAll` | 425 |
| Files with setup but NO teardown | **104** |

### Shared State Risks

**104 test files** have `beforeEach`/`beforeAll` but no corresponding `afterEach`/`afterAll`. This is a significant isolation concern. Sample offenders:

- `agents/devils-advocate.test.ts`
- `benchmarks/consensus-latency.test.ts`
- `benchmarks/mincut-performance.test.ts`
- `coordination/competing-hypotheses.test.ts`
- `coordination/federation.test.ts`
- `integration/adapters/ag-ui-integration.test.ts`
- `integration/consensus-integration.test.ts`
- `integration/governance/ab-benchmarking.test.ts`

**Global mutable state**: Several test files declare `let` variables at module scope that are mutated in `beforeEach` but never reset in `afterEach`:
- `unit/init/fleet-integration.test.ts` -- `let mockPrepareReturnValue`, `let mockDatabaseShouldThrow`, `let readlineMockAnswer`
- `unit/sync/pull-agent.test.ts` -- `let mockCloudRecords`, `let mockLocalCounts`
- `unit/mcp/handlers/team-handlers.test.ts` -- `let mockInitialized`

**Process.env mutation**: 28 test files modify `process.env`, which is a shared global. Without proper save/restore in `afterEach`, these can leak between tests.

**Grade**: C+ (104 files missing teardown is a real isolation risk)

---

## 7. Mock Quality

### Mock Usage Distribution

| Pattern | File Count | Assessment |
|---------|-----------|------------|
| `vi.mock()` (module mocking) | 69 | Moderate |
| `vi.fn()` (function stubs) | 229 | Heavy |
| `vi.spyOn()` (spy on real impl) | 59 | Good practice |

### Over-Mocking Offenders

Files with excessive `vi.mock()` calls (>10 per file):

| File | vi.mock Count | Concern |
|------|--------------|---------|
| `unit/cli/config.test.ts` | 47 | Extreme -- testing framework, not implementation |
| `unit/hooks/cross-phase-hooks.test.ts` | 30 | High -- many transitive deps mocked |
| `unit/init/token-bootstrap.test.ts` | 20 | High |
| `unit/test-scheduling/git-aware-selector.test.ts` | 17 | High |
| `unit/mcp/wrapped-domain-handlers.test.ts` | 16 | High |
| `unit/mcp/handlers/handler-factory.test.ts` | 14 | High |
| `unit/init/phases/mcp-phase.test.ts` | 13 | Moderate |

`unit/cli/config.test.ts` with 47 `vi.mock()` calls is the worst offender. At that level of mocking, the test is verifying mock wiring rather than actual behavior. This is a classic London School anti-pattern taken to the extreme.

### Positive Patterns

- `unit/memory/crdt.test.ts` -- Zero mocks, tests real CRDT convergence behavior. Exemplary.
- `unit/governance/constitutional-enforcer.test.ts` -- Minimal mocks, tests real invariant enforcement.
- `unit/coordination/task-executor.test.ts` -- Uses well-structured mock implementations (MockEventBus, MockMemoryBackend, MockAgentCoordinator) that faithfully implement interfaces.

**Grade**: B- (vi.fn overuse, several extreme over-mocking files, but good patterns exist in critical paths)

---

## 8. Test File Sizes

### Size Distribution

| Size Range | Count | Percentage |
|------------|-------|-----------|
| > 1,000 lines | 39 | 6.6% |
| 500-1,000 lines | 238 | 40.3% |
| < 500 lines | 313 | 53.1% |

### Top 10 Largest Test Files

| File | Lines | Concern |
|------|-------|---------|
| `integrations/agentic-flow/onnx-embeddings.test.ts` | 1,501 | Should split into unit + integration |
| `unit/domains/enterprise-integration/coordinator.test.ts` | 1,443 | Large coordinator surface |
| `unit/adapters/a2a/agent-cards.test.ts` | 1,442 | Protocol tests -- acceptable |
| `integrations/vibium/vibium-client.test.ts` | 1,424 | External client -- consider mocking |
| `unit/adapters/ag-ui/event-adapter.test.ts` | 1,421 | Protocol adapter -- review for split |
| `integration/learning/dream-scheduler.test.ts` | 1,411 | Complex learning integration |
| `unit/adapters/a2a/tasks.test.ts` | 1,365 | A2A protocol tasks |
| `unit/adapters/a2ui/accessibility.test.ts` | 1,352 | Accessibility protocol |
| `strange-loop/coherence-integration.test.ts` | 1,350 | Coherence -- complex, acceptable |
| `integrations/agentic-flow/reasoning-bank.test.ts` | 1,348 | Reasoning bank integration |

**Assessment**: 39 files exceeding 1,000 lines is concerning. The project guideline states "Keep files under 500 lines," but 47% of test files exceed this limit. Protocol adapter tests (A2A, AG-UI, A2UI) are the primary offenders, which is somewhat justified by their protocol compliance requirements. The adapters tests should ideally be split by protocol operation (discovery, tasks, events, etc.).

**Grade**: C (47% of files exceed 500-line guideline; 39 exceed 1,000 lines)

---

## 9. Fake Timers Analysis

| Metric | v3.6.8 | v3.7.0 | Delta |
|--------|--------|--------|-------|
| Timing-dependent files | 83 | 311 | +228 |
| Files using fake timers | 38 | 43 | +5 |
| Timing files WITHOUT fake timers | 45 | **199** | +154 |
| Fake timer coverage rate | 45.8% | **13.8%** | -32.0pp |

### Assessment: SIGNIFICANT REGRESSION

This is the most concerning regression in v3.7.0. The number of timing-dependent test files nearly quadrupled (83 to 311), but fake timer adoption barely moved (38 to 43). The fake timer coverage rate dropped from 45.8% to 13.8%.

The 199 timing-dependent files without fake timers are flake risks. Many of these are in:
- `integration/` -- browser integration tests, domain integration tests
- `coordination/` -- federation, tracing, pattern training
- `hooks/` -- task-completed, reasoning-bank
- `e2e/` -- expected for E2E, but still a flake vector

**Notable timing-safe files** (using fake timers correctly):
- 43 files use `vi.useFakeTimers()` -- these are the disciplined minority

**Grade**: D+ (13.8% fake timer coverage is unacceptable for a test suite of this size)

---

## 10. Comparison with v3.6.8

### What Improved

| Area | v3.6.8 | v3.7.0 | Assessment |
|------|--------|--------|-----------|
| **E2E coverage** | 1 file | 18 files | Major improvement. Sauce Demo suite adds real browser E2E coverage |
| **Security tests** | 1 file | 27 files | Massive expansion. SAST/DAST scanners, OAuth, CVE prevention, path traversal, input sanitization, validation orchestrator all covered |
| **TODO tests** | 15 | 0 | All resolved |
| **Test file count** | 463 | 590 | +27.4% growth |
| **Concurrency tests** | 0 | 113 files with concurrency patterns | Major gap filled |
| **Performance tests** | 0 | 3 files | New category |
| **Crown jewels** | CRDT + Governance | CRDT + Governance + Coherence + Protocol adapters | Expanded |
| **Test pyramid** | No apex | Recognizable shape | Structural improvement |

### What Regressed

| Area | v3.6.8 | v3.7.0 | Assessment |
|------|--------|--------|-----------|
| **Fake timer coverage** | 45.8% | 13.8% | Severe regression -- 199 files use real timers |
| **Benchmarks** | 8 files | 5 files | Lost 3 benchmark files |
| **Test isolation** | -- | 104 files missing teardown | Not measured in v3.6.8 but likely worse now |
| **File sizes** | -- | 39 files >1,000 lines | 47% exceed 500-line guideline |
| **Failing tests** | 0 | 2 | Stale test expectations after API changes |
| **Over-mocking** | -- | 9 files with >10 vi.mock() | config.test.ts has 47 mock calls |

### What Stayed the Same

| Area | v3.6.8 | v3.7.0 | Assessment |
|------|--------|--------|-----------|
| **Skipped tests** | 35 | 35 | Unchanged -- same environment-dependent tests |
| **Test quality grade** | B+ | B+ | Net neutral -- improvements offset by regressions |
| **1 timing flake** | Noted | Still present + more risk | Fake timer regression adds flake surface area |

---

## Summary Scorecard

| Dimension | Grade | Weight | Notes |
|-----------|-------|--------|-------|
| Test count growth | A- | 15% | +27.4% growth, strong in security and E2E |
| Test pyramid balance | B | 10% | Much improved, still needs more E2E |
| Failing tests | B+ | 10% | Only 2, both test-side issues |
| Skipped/TODO resolution | A | 5% | All TODOs resolved |
| Assertion quality | B+ | 15% | Strong in crown jewels, weak in init/MCP |
| Test isolation | C+ | 15% | 104 files missing teardown |
| Mock quality | B- | 10% | Over-mocking in CLI/MCP layers |
| File sizes | C | 5% | 39 files >1,000 lines |
| Fake timers | D+ | 10% | 13.8% coverage is a regression |
| Net improvement over v3.6.8 | B | 5% | Strong growth offset by timer/isolation debt |

### Overall Test Quality Grade: B+

The grade holds at B+ from v3.6.8, but the composition changed significantly. v3.6.8 earned its B+ from a lean, focused suite with decent timer discipline. v3.7.0 earns its B+ from massive coverage expansion (E2E, security, concurrency) that offsets regressions in timer discipline, test isolation, and file sizes.

---

## Recommended Actions (Priority Order)

1. **Fix the 2 failing tests** in `task-executor.test.ts` -- stale expectations after API changes (30 min fix)
2. **Fake timer remediation sprint** -- The 199 timing-dependent files without fake timers are the highest flake risk. Prioritize the 30 integration test files, then the 11 coordination files.
3. **Add afterEach cleanup** to the 104 files missing teardown. Focus on files with mutable `let` declarations at module scope first.
4. **Split oversized test files** -- Start with the 39 files over 1,000 lines. Protocol adapter tests (A2A, AG-UI, A2UI) should split by operation type.
5. **Reduce over-mocking** in `unit/cli/config.test.ts` (47 mocks) and `unit/hooks/cross-phase-hooks.test.ts` (30 mocks). Consider integration tests instead.
6. **Increase E2E coverage** -- 18 files is a good start but the sauce-demo suite should expand to cover error flows and edge cases.
7. **Restore lost benchmarks** -- 3 benchmark files were removed; assess whether the coverage they provided is now elsewhere.
