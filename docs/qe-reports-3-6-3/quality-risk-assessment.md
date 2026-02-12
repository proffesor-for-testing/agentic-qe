# Quality Risk Assessment Report -- Agentic QE v3.6.3

**Assessment Date**: 2026-02-11
**Assessed By**: QE Risk Assessor (V3)
**Scope**: `/workspaces/agentic-qe-new/v3/`
**Overall Risk Level**: **MEDIUM-HIGH (0.68)**

---

## Executive Summary

The Agentic QE v3 codebase is an ambitious, architecturally sophisticated platform with 13 bounded contexts, a microkernel, queen-coordinator orchestration, self-healing infrastructure, and multi-model routing. The codebase spans **940 source files** (~475,000 lines) and **774 test files** (~494,000 lines), demonstrating strong test investment.

However, the assessment identifies several structural risks that require attention:

1. **Excessive coordinator complexity** -- The queen-coordinator (2,202 lines) has accumulated too many responsibilities, creating a single point of failure and coupling bottleneck.
2. **Aggressive error suppression** -- At least 25 catch blocks silently swallow errors with "non-fatal" comments, and the queen-coordinator alone has 10 "continuing" warn-and-proceed patterns, masking systemic failures.
3. **45 singletons** across the codebase create hidden coupling and make testing brittle.
4. **Native dependency fragility** -- hnswlib-node, better-sqlite3 (34 import sites), and vibium (13 import sites) are platform-specific C++ addons that can fail silently on certain architectures.
5. **Integration test gap** -- Only 94 integration tests versus 360 unit tests (20:80 ratio) leaves cross-domain interaction under-tested.

### Risk Heat Map

```
                    LIKELIHOOD
              Low    Medium    High    Critical
         +--------+--------+--------+---------+
Critical |        | R-07   | R-01   |         |
         |        |        | R-04   |         |
  I      +--------+--------+--------+---------+
  M High | R-13   | R-03   | R-02   |         |
  P      |        | R-06   | R-05   |         |
  A      +--------+--------+--------+---------+
  C Medium|       | R-09   | R-08   |         |
  T      |        | R-11   | R-10   |         |
         +--------+--------+--------+---------+
  Low    |        | R-12   | R-14   |         |
         +--------+--------+--------+---------+
```

---

## 1. Architectural Risk Analysis

### RISK-A01: Queen Coordinator God Object (Score: 0.85 -- CRITICAL)

**Location**: `/workspaces/agentic-qe-new/v3/src/coordination/queen-coordinator.ts` (2,202 lines)

**Finding**: The QueenCoordinator class has accumulated 14+ responsibilities across 4 ADR phases:
- Task management (submit, cancel, filter, queue, assign)
- Work stealing algorithm
- Agent lifecycle management
- Health monitoring and metrics
- Protocol and workflow execution
- MinCut topology integration (ADR-047)
- TinyDancer model routing (TD-004/005/006)
- Governance integration (ADR-058)
- Circuit breaker management (ADR-064)
- Domain team management (ADR-064)
- Fleet tier selection (ADR-064)
- Pattern training (ADR-064 Phase 3)
- Distributed tracing (ADR-064 Phase 3)
- Competing hypotheses, federation, dynamic scaling (ADR-064 Phase 4)

The constructor takes 8 parameters. The `initialize()` method spans 120 lines with 8 separate try-catch blocks that all continue on failure.

**Risk**: A single bug in the queen-coordinator can cascade across all 13 domains. The 8 nullable subsystem fields (`minCutBridge`, `tinyDancerRouter`, `domainBreakerRegistry`, etc.) create a combinatorial state explosion that is difficult to test.

**Mitigation**:
- [REQUIRED] Extract responsibilities into separate services (TaskManager, WorkStealingService, HealthMonitor, etc.)
- [REQUIRED] Apply the Facade pattern -- the QueenCoordinator should delegate, not implement
- [RECOMMENDED] Introduce a builder pattern for initialization to make optional subsystems explicit

### RISK-A02: Aggressive Error Suppression in Initialization (Score: 0.78 -- HIGH)

**Location**: Multiple files, concentrated in `queen-coordinator.ts` and domain coordinators

**Finding**: The queen-coordinator's `initialize()` method has 8 try-catch blocks that all catch errors and `console.warn` with "(continuing)". These cover:
- Governance initialization (line 536)
- Circuit breaker initialization (line 546)
- Domain team initialization (line 558)
- Fleet tier initialization (line 568)
- Trace collector initialization (line 577)
- Phase 4 modules initialization (line 588)

Additionally, `submitTask()` has 3 more suppress-and-continue patterns for governance checks, tier selection, and trace starting.

**Risk**: When multiple subsystems silently fail during initialization, the system operates in a degraded state without clear visibility. The health check may report "healthy" while critical subsystems are non-functional. This creates silent data corruption risks where tasks are assigned without governance checks, tier selection, or tracing.

**Mitigation**:
- [REQUIRED] Implement a degradation registry that tracks which subsystems failed initialization
- [REQUIRED] Surface subsystem failures in the health endpoint with specific degradation markers
- [RECOMMENDED] Add structured logging with severity levels instead of console.warn
- [RECOMMENDED] Implement a startup health gate that requires core subsystems to be healthy

### RISK-A03: Event Bus Lacks Backpressure (Score: 0.72 -- HIGH)

**Location**: `/workspaces/agentic-qe-new/v3/src/kernel/event-bus.ts`

**Finding**: The `InMemoryEventBus.publish()` method (line 95-160) executes all matching handlers concurrently via `Promise.allSettled()` with no backpressure mechanism. Under high load with many subscribers, this can cause:
- Unbounded concurrent handler execution
- Memory pressure from accumulating pending promises
- Event ordering violations when slow handlers overlap

The `eventHistory` uses a `CircularBuffer` (good for bounding size), but the handler execution has no concurrency limit.

**Risk**: Under burst load (e.g., chaos testing or mass agent spawn), the event bus can saturate the Node.js event loop, causing cascading timeouts in health checks and task coordination.

**Mitigation**:
- [REQUIRED] Add configurable concurrency limits for handler execution (semaphore pattern)
- [RECOMMENDED] Implement event priority queuing so critical events (health, governance) are processed first
- [OPTIONAL] Add event bus metrics (queue depth, handler latency percentiles)

### RISK-A04: Cross-Domain Router Unbounded History (Score: 0.75 -- HIGH)

**Location**: `/workspaces/agentic-qe-new/v3/src/coordination/cross-domain-router.ts`

**Finding**: Unlike the event bus which uses a `CircularBuffer`, the `CrossDomainEventRouter` uses a plain array for `eventHistory` (line 49) with `shift()` for trimming (line 475-477). The `shift()` operation on a 10,000-element array is O(n) and allocates a new array copy. Additionally:
- `correlations` Map grows indefinitely -- timeout entries set `complete: true` but never delete the entry
- `aggregate()` method (line 247-284) creates a full copy of all events in the window, which is O(n) for each call

**Risk**: Memory leak from correlation entries never being cleaned up. Performance degradation under sustained event throughput from O(n) shift operations.

**Mitigation**:
- [REQUIRED] Replace `eventHistory` array with `CircularBuffer` (same pattern as event-bus.ts)
- [REQUIRED] Add periodic cleanup of completed/expired correlation entries
- [RECOMMENDED] Add max correlation map size with LRU eviction

### RISK-A05: Singleton Proliferation (Score: 0.70 -- HIGH)

**Finding**: 45 files contain singleton patterns (`static instance`, `getInstance`). Key singletons include:
- `UnifiedPersistenceManager` (database)
- `UnifiedMemoryManager` (memory)
- `SharedMinCutGraph` (topology)
- `InfraHealingOrchestrator` (self-healing)
- `LoggerFactory` (logging)
- `MetricsCollector` (metrics)
- `FeatureFlags` (configuration)
- Various ruvector/embedding providers

**Risk**: Singletons create hidden dependencies between modules, making the system difficult to test in isolation and creating initialization order sensitivity. The `UnifiedPersistenceManager.resetInstance()` pattern (used 1x in production code, needed for every test) indicates testing friction.

**Mitigation**:
- [RECOMMENDED] Migrate to dependency injection for core singletons (kernel, persistence, memory)
- [RECOMMENDED] Use factory functions that accept configuration rather than static getInstance()
- [OPTIONAL] Introduce a service locator as a transitional pattern

### RISK-A06: Self-Healing System Circular Dependency Risk (Score: 0.65 -- MEDIUM-HIGH)

**Location**: `/workspaces/agentic-qe-new/v3/src/strange-loop/strange-loop.ts`

**Finding**: The StrangeLoopOrchestrator has a potential for circular healing loops. The `runCycle()` method (line 256-371):
1. Observes swarm state
2. Checks coherence
3. Decides on healing actions
4. Executes healing actions

However, healing actions that restart agents will trigger new events, which trigger new observations, which may trigger more healing actions. While the interval-based scheduling provides some natural throttling, there is no explicit circuit breaker or cooldown mechanism to prevent healing storms.

The `collapseRiskHistory` (line 951-957) uses `shift()` on a plain array, though the size is typically small.

**Mitigation**:
- [REQUIRED] Add a healing action cooldown per agent/domain to prevent healing storms
- [RECOMMENDED] Implement a "healing budget" per cycle that limits the number of concurrent healing actions
- [RECOMMENDED] Add an explicit loop detection mechanism for healing cycles

### RISK-A07: Tier-Based Routing Fallback Gaps (Score: 0.62 -- MEDIUM-HIGH)

**Location**: `/workspaces/agentic-qe-new/v3/src/routing/` (9 files)

**Finding**: The TinyDancer routing system routes tasks to different model tiers (WASM/Haiku/Sonnet/Opus). If the routing decision fails, the queen-coordinator falls back to the default `'task-worker'` type (line 1816). However:
- No metrics are collected on routing failures vs successes
- The WASM tier (agent-booster) is a native dependency that may not be available on all platforms
- No circuit breaker exists for the routing layer itself -- if TinyDancer repeatedly fails, it still gets called for every task

**Mitigation**:
- [RECOMMENDED] Add routing decision metrics (hit rate per tier, fallback frequency)
- [RECOMMENDED] Add a circuit breaker for the routing layer
- [OPTIONAL] Implement graceful degradation from Opus to Sonnet to Haiku on budget exhaustion

---

## 2. Integration Risk Analysis

### RISK-I01: Native Dependency Fragility (Score: 0.80 -- HIGH)

**Dependencies at risk**:
- `better-sqlite3` v12.5.0 -- Imported in **34 files**. C++ addon requiring node-gyp build
- `hnswlib-node` v3.0.0 -- Imported in **2 files** (HNSWIndex, real-qe-reasoning-bank). C++ addon
- `vibium` v0.1.2 -- Imported in **13 files** (test-execution, visual-accessibility). Browser automation
- `@ruvector/gnn` v0.1.19 -- Native Rust addon with platform-specific overrides
- `prime-radiant-advanced-wasm` v0.1.3 -- WASM module for coherence checking

**Risk**: These native dependencies:
1. May fail to install on Alpine Linux (musl libc) -- hence the npm overrides for gnn
2. Require matching Node.js ABI version -- major Node.js upgrades will break
3. Can crash the process (SIGSEGV) rather than throwing catchable errors
4. Make the package non-portable across architectures without explicit platform support

The `optionalDependencies` section mitigates some of this for `@claude-flow/browser` and `@ruvector/*` platform variants.

**Mitigation**:
- [REQUIRED] Add process-level crash handlers (SIGSEGV) that can restart gracefully
- [REQUIRED] Implement runtime feature detection for all native modules with in-memory fallbacks
- [RECOMMENDED] Add preinstall checks (partially done in `scripts/preinstall.cjs`) for all native deps
- [RECOMMENDED] Publish pre-built binaries for common platforms (linux-x64, darwin-arm64)

### RISK-I02: Cross-Domain Event Handling Failures (Score: 0.72 -- HIGH)

**Finding**: Domain events pass through 3 layers: EventBus -> CrossDomainRouter -> QueenCoordinator subscriptions. At each layer, errors are caught independently:
1. EventBus uses `Promise.allSettled()` -- failures are silenced
2. CrossDomainRouter catches per-handler with `console.error` only
3. QueenCoordinator's `handleDomainEvent` can throw from `processQueue()` which is fire-and-forget

The spelling error `subscribeToDoamin` in `/workspaces/agentic-qe-new/v3/src/coordination/cross-domain-router.ts` (line 104) indicates this API surface has not been thoroughly reviewed.

**Risk**: A failing event handler in one domain can silently drop events intended for other domains. The 3-layer catch chain means errors are caught 3 times with 3 different strategies, making it impossible to know the true error rate.

**Mitigation**:
- [REQUIRED] Implement dead-letter queue for events that fail handler delivery
- [REQUIRED] Add event delivery metrics (delivered/failed/dropped per domain)
- [RECOMMENDED] Fix the `subscribeToDoamin` typo as part of API surface audit
- [RECOMMENDED] Unify error handling strategy across all 3 layers

### RISK-I03: MCP Server Availability (Score: 0.68 -- MEDIUM-HIGH)

**Location**: `/workspaces/agentic-qe-new/v3/src/mcp/server.ts` and transport layer

**Finding**: The MCP server registers 33+ tools but has no:
- Health check endpoint for external monitoring
- Rate limiting at the server level (exists in `security/rate-limiter.ts` but not wired by default)
- Graceful degradation when the underlying fleet is initializing
- Request timeout enforcement at the transport layer

The `invoke()` method (line 732-741) throws generic `Error` on failure, losing tool-specific error context. The `disposeFleet()` call in `dispose()` is a global function that affects all consumers.

**Mitigation**:
- [REQUIRED] Wire rate limiter into default MCP server configuration
- [RECOMMENDED] Add MCP-level health check tool
- [RECOMMENDED] Add request timeout at transport layer (SSE, WebSocket connections)
- [OPTIONAL] Implement per-tool circuit breakers for domain tools

### RISK-I04: Database Connection Lifecycle (Score: 0.65 -- MEDIUM-HIGH)

**Location**: `/workspaces/agentic-qe-new/v3/src/kernel/unified-persistence.ts`

**Finding**: The `UnifiedPersistenceManager` registers process exit handlers (`SIGINT`, `SIGTERM`, `beforeExit`) at module load time (line 332). The `close()` method only marks `initialized = false` but does NOT close the underlying database connection (line 257-262: "Don't close the underlying UnifiedMemoryManager as it's a singleton shared with other components").

This means:
1. The database connection is never explicitly closed during normal operation
2. WAL files may not be checkpointed before exit
3. The process exit handlers call `instance.close()` which only sets a flag
4. Under Docker/Kubernetes, SIGTERM may not propagate correctly to child processes

**Risk**: WAL file corruption on ungraceful shutdown. Stale lock files preventing restart. Database size growth from un-checkpointed WAL.

**Mitigation**:
- [REQUIRED] Implement proper database shutdown that checkpoints WAL and closes connections
- [REQUIRED] Add WAL checkpoint on periodic timer (every N minutes or N operations)
- [RECOMMENDED] Add database file lock detection on startup with recovery
- [RECOMMENDED] Test shutdown behavior under SIGTERM and container stop scenarios

---

## 3. Test Quality Assessment

### RISK-T01: Over-Mocking in Integration Tests (Score: 0.70 -- HIGH)

**Finding**: Analysis of test files shows **583+ mock declarations** across 40 test files using `vi.mock`, `vi.fn`, and `vi.spyOn`. Many integration tests heavily mock their dependencies:
- `mincut-queen-integration.test.ts` -- 30 mock calls in an "integration" test
- `dream-scheduler.test.ts` -- 35 mock calls
- `causal-graph-verification.test.ts` -- 28 mock calls
- Coherence engine tests average 25+ mocks each

**Risk**: Tests that mock everything test the mock framework, not the system. Integration tests with 30+ mocks are unit tests in disguise and will not catch real integration failures. The 94:360 integration-to-unit test ratio confirms that true integration coverage is thin.

**Mitigation**:
- [REQUIRED] Establish a "max mock count" policy for integration tests (suggest: max 5 external mocks)
- [REQUIRED] Add true end-to-end tests for critical paths (fleet init -> task submit -> domain execute -> result)
- [RECOMMENDED] Create shared test fixtures that provide real implementations for common dependencies
- [RECOMMENDED] Use database-backed in-memory SQLite for integration tests instead of mocking persistence

### RISK-T02: Flaky Test Indicators (Score: 0.65 -- MEDIUM-HIGH)

**Finding**: 30 test files contain `setTimeout`/`setInterval` calls (88 total occurrences), indicating timing-dependent tests. Key files:
- `queen-domain-wiring.test.ts` -- 8 timeout calls
- `qcsd-refinement.test.ts` -- 11 timeout calls
- `domain-circuit-breaker.test.ts` -- 7 timeout calls
- `queen-pattern-training.test.ts` -- 8 timeout calls

Additionally, 150 test skip markers (`describe.skip`, `it.skip`, `test.skip`) exist across 20 test files, with notably `early-exit-decision.test.ts` having 40 skipped tests.

**Risk**: Timing-dependent tests are inherently flaky in CI environments. The 150 skipped tests represent either deferred functionality or tests that were too flaky to run, both indicating test debt.

**Mitigation**:
- [REQUIRED] Replace `setTimeout` in tests with deterministic clock control (`vi.useFakeTimers`)
- [REQUIRED] Audit all 150 skipped tests -- either fix or remove with tracking issue
- [RECOMMENDED] Implement a flaky test quarantine system (exists in `test-scheduling/flaky-tracking/`)
- [RECOMMENDED] Add CI test stability metrics (pass rate over 10 runs)

### RISK-T03: Shared Mutable State in Test Files (Score: 0.55 -- MEDIUM)

**Finding**: 13 test files contain patterns suggesting shared mutable state between tests (`shared.*state`, `global.*var`, module-level `let` arrays). The test mock file `/workspaces/agentic-qe-new/v3/tests/mocks/index.ts` is shared across many test suites.

The singleton pattern in production code forces test cleanup in `afterEach`/`afterAll` hooks. Missing cleanup leads to test ordering dependencies.

**Mitigation**:
- [RECOMMENDED] Ensure every test file uses `beforeEach` to create fresh instances
- [RECOMMENDED] Add `afterEach` singleton reset calls explicitly in shared test utilities
- [OPTIONAL] Run tests with `--shuffle` to detect ordering dependencies

### RISK-T04: Missing Error Path Coverage (Score: 0.60 -- MEDIUM)

**Finding**: While there is a dedicated `tests/unit/error-paths/` directory (5 test files), the coverage is limited to:
- consensus-engine-errors
- task-executor-errors
- memory-backend-errors
- unified-memory-errors
- coordinator-errors

Missing error path tests for:
- MCP server tool invocation failures
- Cross-domain routing failures
- Self-healing action failures
- Native dependency load failures (hnswlib, vibium)
- Database corruption/WAL recovery
- Circuit breaker state transitions under concurrent load

**Mitigation**:
- [REQUIRED] Add error path tests for MCP server (external API surface)
- [RECOMMENDED] Add chaos-style tests for database corruption scenarios
- [RECOMMENDED] Add native dependency failure simulation tests

---

## 4. Operational Risk Analysis

### RISK-O01: Memory Leak Vectors (Score: 0.75 -- HIGH)

**Finding**: Multiple memory retention risks identified:

| Vector | Location | Mechanism |
|--------|----------|-----------|
| Correlation entries | cross-domain-router.ts:48 | Never deleted after timeout, only marked `complete` |
| Task trace contexts | queen-coordinator.ts:432 | `taskTraceContexts` Map only cleaned on completion/failure |
| Event listeners | strange-loop.ts:117 | `eventListeners` Map accumulates listeners with no cleanup |
| Subscription entries | event-bus.ts:47 | Active subscriptions not cleaned on domain unload |
| Domain queues | queen-coordinator.ts:383 | `domainQueues` Map entries never shrink |
| `as any` casts | 106 occurrences across 30 files | Bypass type checking, may mask object retention |

The queen-coordinator's MEM-001 and MEM-002 fixes (CircularBuffer, task cleanup timer) address some historical leaks, indicating this has been a recurring problem.

**Mitigation**:
- [REQUIRED] Add correlation entry cleanup to CrossDomainEventRouter
- [REQUIRED] Add periodic cleanup of orphaned trace contexts
- [RECOMMENDED] Implement memory pressure monitoring via `process.memoryUsage()`
- [RECOMMENDED] Add memory leak detection in CI (run tests with `--expose-gc` and check heap growth)

### RISK-O02: Concurrency Race Conditions (Score: 0.72 -- HIGH)

**Finding**: While the queen-coordinator has explicit CC-002 fixes for the `runningTaskCounter` race condition, other areas lack similar protection:

1. **Work stealing** (line 969-1015): `triggerWorkStealing()` modifies `idleDomains` by calling `shift()` in a loop. If work stealing is triggered concurrently (timer + manual trigger), the same task could be stolen twice.

2. **Task queue processing** (line 1966-1997): `processQueue()` takes a task from the queue with `shift()`, increments the counter, then calls `assignTask()`. If `assignTask()` triggers events that call `processQueue()` re-entrantly, the counter check on line 1968 may be stale.

3. **Database access**: The `UnifiedMemoryManager` uses WAL mode for better concurrency, but `busyTimeout` is set to 5000ms. Multiple concurrent memory operations from different domains could pile up.

**Mitigation**:
- [REQUIRED] Add re-entrancy guard to `processQueue()` (flag that prevents concurrent execution)
- [REQUIRED] Add mutex/lock to `triggerWorkStealing()` to prevent concurrent execution
- [RECOMMENDED] Add database operation timeout monitoring
- [RECOMMENDED] Stress test concurrent task submission with 50+ simultaneous tasks

### RISK-O03: Unhandled Promise Rejections (Score: 0.68 -- MEDIUM-HIGH)

**Finding**: No `process.on('unhandledRejection')` or `process.on('uncaughtException')` handlers found in the source code. Fire-and-forget async patterns exist in:
- `queen-coordinator.ts` line 1499: `this.taskCompletedHook.onTaskCompleted(taskResult).catch(hookErr => ...)`
- `queen-coordinator.ts` line 2078: `this.dynamicScaler.execute(decision).catch(scaleErr => ...)`
- Multiple `console.warn` catch blocks that don't re-throw

The event bus uses `Promise.allSettled()` which handles rejections, but the cross-domain router's `route()` method (line 166-181) has handler errors caught with `console.error` only.

**Mitigation**:
- [REQUIRED] Add global unhandled rejection handler in the MCP entry point and CLI entry point
- [RECOMMENDED] Replace fire-and-forget async calls with a background task queue that tracks failures
- [RECOMMENDED] Add promise rejection metrics to the queen coordinator

### RISK-O04: Configuration Drift Risk (Score: 0.58 -- MEDIUM)

**Finding**: Configuration comes from multiple sources:
- `DEFAULT_CONFIG` in `kernel.ts` (line 64-71)
- `DEFAULT_CONFIG` in `queen-coordinator.ts` (line 352-373)
- `DEFAULT_UNIFIED_CONFIG` in `unified-persistence.ts` (line 49-55)
- `DEFAULT_STRANGE_LOOP_CONFIG` in `strange-loop/types.ts`
- `DEFAULT_DOMAIN_BREAKER_CONFIG` in `domain-circuit-breaker.ts` (line 28-35)
- Individual domain coordinator configs
- `.agentic-qe/config.yaml` file

No central configuration validation ensures consistency. For example, `maxConcurrentAgents` in the kernel default is `AGENT_CONSTANTS.MAX_CONCURRENT_AGENTS`, but the queen-coordinator has a hardcoded error message "Maximum concurrent agents reached (15)" (line 1035) that may diverge from the actual limit.

**Mitigation**:
- [RECOMMENDED] Centralize all configuration defaults in a single configuration schema
- [RECOMMENDED] Add configuration validation on startup that checks cross-cutting constraints
- [OPTIONAL] Implement configuration change tracking with audit log

---

## 5. Business Risk Mapping

### Domain Business Impact Classification

| Domain | Business Impact | Justification | Risk Score |
|--------|----------------|---------------|------------|
| `coordination` (queen) | **CRITICAL** | Single point of orchestration for all 13 domains. Failure halts all operations. | 0.85 |
| `test-execution` | **CRITICAL** | Core value proposition. Failed test execution = no quality signal. | 0.72 |
| `security-compliance` | **CRITICAL** | Security gate. Bypass = potential vulnerability in production. | 0.68 |
| `quality-assessment` | **HIGH** | Quality gate decisions. Coordinator is 2,426 lines (largest domain file). | 0.65 |
| `test-generation` | **HIGH** | Primary user-facing capability. | 0.58 |
| `defect-intelligence` | **HIGH** | Predictive analytics. Incorrect predictions erode trust. | 0.55 |
| `coverage-analysis` | **HIGH** | Coverage gaps directly impact quality decisions. | 0.52 |
| `code-intelligence` | **MEDIUM** | Supporting capability. Coordinator is 2,156 lines. | 0.50 |
| `requirements-validation` | **MEDIUM** | Includes QCSD ideation/refinement. Two large plugins (1,860 + 1,697 lines). | 0.48 |
| `learning-optimization` | **MEDIUM** | ML optimization. Failure degrades but doesn't halt operations. | 0.45 |
| `contract-testing` | **MEDIUM** | API contract validation. Niche but important for API teams. | 0.42 |
| `visual-accessibility` | **LOW** | Browser-dependent testing. Graceful degradation acceptable. | 0.40 |
| `chaos-resilience` | **LOW** | Chaos testing is opt-in. Failure impact is minimal. | 0.35 |
| `enterprise-integration` | **LOW** | External integration. Isolated failure domain. | 0.30 |

### Single Points of Failure

| Component | Failure Impact | Recovery Capability | Recovery Time |
|-----------|---------------|-------------------|---------------|
| Queen Coordinator | All task processing stops | Manual restart required | 30s-2min |
| UnifiedMemoryManager (SQLite) | All state lost/inaccessible | Auto-recovery via WAL | 5s-30s |
| EventBus | All domain communication stops | Automatic on restart | 5s-10s |
| HNSW Index | Vector search unavailable | Fallback to keyword search | Immediate |
| MinCut Graph (singleton) | Topology health blind | Graceful degradation | Immediate |

### Monitoring/Observability Gaps

1. **No external health check endpoint** -- The MCP server has no `/health` route for load balancer probes
2. **No structured logging** -- All logging is `console.log`/`console.warn`/`console.error` with no log levels, correlation IDs, or structured JSON
3. **No distributed tracing export** -- The `TraceCollector` (ADR-064 Phase 3) collects traces internally but has no export to Jaeger/Zipkin/OTLP
4. **No alerting thresholds** -- Circuit breaker state changes log to console but trigger no alerts
5. **No SLI/SLO tracking** -- No measurement of task latency P50/P95/P99 or success rates over time

---

## 6. Risk Matrix Summary

| ID | Risk | Likelihood | Impact | Score | Category |
|----|------|-----------|--------|-------|----------|
| R-01 | Queen coordinator god object | HIGH | CRITICAL | 0.85 | Architectural |
| R-02 | Native dependency fragility | HIGH | HIGH | 0.80 | Integration |
| R-03 | Aggressive error suppression | MEDIUM | CRITICAL | 0.78 | Architectural |
| R-04 | Cross-domain router memory leak | HIGH | CRITICAL | 0.75 | Operational |
| R-05 | Memory leak vectors | HIGH | HIGH | 0.75 | Operational |
| R-06 | Event bus lacks backpressure | MEDIUM | HIGH | 0.72 | Architectural |
| R-07 | Cross-domain event failures | MEDIUM | CRITICAL | 0.72 | Integration |
| R-08 | Concurrency race conditions | HIGH | MEDIUM | 0.72 | Operational |
| R-09 | Over-mocking in integration tests | MEDIUM | HIGH | 0.70 | Test Quality |
| R-10 | Singleton proliferation | HIGH | MEDIUM | 0.70 | Architectural |
| R-11 | MCP server availability gaps | MEDIUM | MEDIUM-HIGH | 0.68 | Integration |
| R-12 | Unhandled promise rejections | MEDIUM | MEDIUM | 0.68 | Operational |
| R-13 | Flaky test indicators | MEDIUM | HIGH | 0.65 | Test Quality |
| R-14 | Database connection lifecycle | HIGH | MEDIUM | 0.65 | Integration |

---

## 7. Prioritized Mitigation Recommendations

### Priority 1 -- Immediate (Sprint 1-2)

| # | Mitigation | Risk(s) Addressed | Effort | Impact |
|---|-----------|-------------------|--------|--------|
| M-01 | Add correlation entry cleanup to CrossDomainEventRouter | R-04, R-05 | LOW | HIGH |
| M-02 | Replace eventHistory array with CircularBuffer in router | R-04 | LOW | HIGH |
| M-03 | Add re-entrancy guard to processQueue() | R-08 | LOW | HIGH |
| M-04 | Add global unhandled rejection handler | R-12 | LOW | MEDIUM |
| M-05 | Wire rate limiter into MCP server default config | R-11 | LOW | MEDIUM |
| M-06 | Implement degradation registry for failed subsystems | R-03, R-07 | MEDIUM | HIGH |

### Priority 2 -- Near-term (Sprint 3-4)

| # | Mitigation | Risk(s) Addressed | Effort | Impact |
|---|-----------|-------------------|--------|--------|
| M-07 | Extract queen coordinator into composed services | R-01 | HIGH | CRITICAL |
| M-08 | Add dead-letter queue for failed event delivery | R-07 | MEDIUM | HIGH |
| M-09 | Implement proper database shutdown with WAL checkpoint | R-14 | MEDIUM | HIGH |
| M-10 | Add runtime feature detection for native dependencies | R-02 | MEDIUM | HIGH |
| M-11 | Establish max-mock policy and add true integration tests | R-09 | MEDIUM | HIGH |
| M-12 | Replace setTimeout in tests with fake timers | R-13 | MEDIUM | MEDIUM |

### Priority 3 -- Medium-term (Sprint 5-8)

| # | Mitigation | Risk(s) Addressed | Effort | Impact |
|---|-----------|-------------------|--------|--------|
| M-13 | Add event bus backpressure/concurrency limits | R-06 | MEDIUM | HIGH |
| M-14 | Add healing action cooldown to StrangeLoop | RISK-A06 | MEDIUM | MEDIUM |
| M-15 | Migrate core singletons to dependency injection | R-10 | HIGH | HIGH |
| M-16 | Add structured logging with correlation IDs | Observability | HIGH | HIGH |
| M-17 | Add external health check endpoint | Observability | LOW | MEDIUM |
| M-18 | Centralize configuration with validation | R-O04 | MEDIUM | MEDIUM |

### Priority 4 -- Long-term (Sprint 9+)

| # | Mitigation | Risk(s) Addressed | Effort | Impact |
|---|-----------|-------------------|--------|--------|
| M-19 | Implement distributed tracing export (OTLP) | Observability | HIGH | HIGH |
| M-20 | Add SLI/SLO tracking for task latency | Observability | MEDIUM | MEDIUM |
| M-21 | Add memory leak detection in CI pipeline | R-05 | MEDIUM | MEDIUM |
| M-22 | Publish pre-built native binaries | R-02 | HIGH | MEDIUM |

---

## 8. Risk Score Summary

| Category | Score | Rating |
|----------|-------|--------|
| Architectural Risk | 0.73 | HIGH |
| Integration Risk | 0.71 | HIGH |
| Test Quality Risk | 0.63 | MEDIUM-HIGH |
| Operational Risk | 0.68 | MEDIUM-HIGH |
| **Overall Project Risk** | **0.68** | **MEDIUM-HIGH** |

### Score Methodology

Risk scores are calculated using weighted multi-factor analysis:

| Factor | Weight | Description |
|--------|--------|-------------|
| Code complexity | 0.20 | Cyclomatic complexity, file size, responsibility count |
| Coverage gaps | 0.20 | Integration test ratio, error path coverage, skip count |
| Dependency risk | 0.15 | Native dependency count, version constraints, platform coverage |
| Change velocity | 0.15 | File churn indicators, accumulated ADR count, feature flag density |
| Historical defects | 0.15 | MEM-001/002 fixes, CC-002 fix, PAP-003 fix indicate recurring patterns |
| Singleton coupling | 0.15 | Hidden dependency count, reset-for-test frequency |

### Key Strengths Observed

Despite the identified risks, the codebase demonstrates several quality strengths:

1. **No `.only()` test markers** -- Zero instances found, indicating good test hygiene
2. **Dedicated error path tests** -- 5 error path test files show awareness of failure modes
3. **CircularBuffer adoption** -- Event bus and queen coordinator use bounded buffers (MEM-001 fix)
4. **Circuit breaker pattern** -- Domain-level circuit breakers (ADR-064) are well-implemented
5. **Audit logging** -- The `TaskAuditLogger` provides structured task lifecycle tracking
6. **Process exit handlers** -- Database cleanup on SIGINT/SIGTERM (though incomplete)
7. **Binary insertion** -- PERF-001 fix uses O(log n) binary insertion instead of O(n log n) sort
8. **Task cleanup timer** -- MEM-002 fix prevents indefinite task map growth

---

*Report generated by QE Risk Assessor v3 -- Agentic QE v3.6.3*
*Assessment methodology: Multi-factor risk scoring with configurable weights (ADR-004)*
*Confidence: 0.87 (based on static analysis depth and codebase coverage)*
