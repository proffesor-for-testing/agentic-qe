# Coverage Gap Analysis Report

**Generated**: 2026-01-27
**Scope**: /workspaces/agentic-qe/v3
**Analysis Type**: Comprehensive coverage gap detection with risk scoring

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Source Files | 706 |
| Total Test Files | 318 |
| Test-to-Source Ratio | 45% |
| Critical Gaps Identified | 67 |
| High-Risk Untested Files | 23 |
| Estimated Effort to Close | 120-160 hours |

---

## 1. Critical Path Analysis

### 1.1 MCP Tool Handlers (CRITICAL - Risk Score: 0.95)

**Status**: No unit tests for any handler file

| File | Lines | Public APIs | Test Status |
|------|-------|-------------|-------------|
| `src/mcp/handlers/agent-handlers.ts` | 293 | 4 handlers | NO TEST |
| `src/mcp/handlers/core-handlers.ts` | 356 | 5 handlers | NO TEST |
| `src/mcp/handlers/memory-handlers.ts` | 339 | 6 handlers | NO TEST |
| `src/mcp/handlers/task-handlers.ts` | 911 | 10 handlers | NO TEST |
| `src/mcp/handlers/domain-handlers.ts` | - | 11 handlers | NO TEST |
| `src/mcp/handlers/wrapped-domain-handlers.ts` | - | 11 handlers | PARTIAL (integration only) |

**Missing Test Coverage**:
- `handleAgentList()` - List agents by domain/status
- `handleAgentSpawn()` - Spawn new agents with load balancer registration
- `handleAgentMetrics()` - Get real agent performance metrics
- `handleAgentStatus()` - Get specific agent status
- `handleFleetInit()` - Initialize fleet with kernel, router, queen
- `handleFleetStatus()` - Get fleet status with metrics
- `handleFleetHealth()` - Get domain-level health
- `handleMemoryStore()` - Store memory with namespace/TTL
- `handleMemoryRetrieve()` - Retrieve memory with metadata
- `handleMemoryQuery()` - Query memory by pattern
- `handleMemoryDelete()` - Delete memory entries
- `handleMemoryUsage()` - Get memory statistics
- `handleMemoryShare()` - Agent-to-agent knowledge sharing
- `handleTaskSubmit()` - Submit tasks with priority routing
- `handleTaskList()` - List tasks with filters
- `handleTaskStatus()` - Get task execution status
- `handleTaskCancel()` - Cancel running/queued tasks
- `handleTaskOrchestrate()` - High-level task orchestration with model routing
- `handleModelRoute()` - Direct model routing decisions
- `handleRoutingMetrics()` - Get routing statistics

**Risk Assessment**:
- These are the primary entry points for all MCP tool calls
- Errors here affect all downstream domain operations
- No error path testing for fleet-not-initialized scenarios
- No edge case testing for concurrent operations

**Recommended Tests**:
```typescript
// tests/unit/mcp/handlers/agent-handlers.test.ts
describe('handleAgentList', () => {
  it('should return error when fleet not initialized');
  it('should list all agents when no filter');
  it('should filter by domain');
  it('should filter by status');
  it('should apply limit');
});

describe('handleAgentSpawn', () => {
  it('should spawn agent and register with load balancer');
  it('should return error when fleet not initialized');
  it('should return error when max agents reached');
});
```

---

### 1.2 Queen Coordinator Integration (HIGH - Risk Score: 0.88)

**Status**: Unit tests exist, but integration gaps remain

**Tested**:
- Basic task submission
- Work stealing mechanism
- Memory leak fixes (MEM-001, MEM-002)
- Race condition fixes (CC-002)
- Event subscriptions (PAP-003)

**Missing Integration Tests**:
- Queen + Domain Plugin task execution flow
- Queen + MinCut bridge topology health
- Queen + TinyDancer model routing
- Cross-domain protocol execution
- Workflow orchestration end-to-end

**Risk Assessment**:
- The `assignTaskToDomain()` method has complex integration with domain plugins
- `handleTaskCompletion()` callback flow is not integration tested
- TinyDancer routing decisions affect cost and performance

---

### 1.3 Domain Coordinators and Plugins (CRITICAL - Risk Score: 0.92)

**Status**: 12 coordinators and 12 plugins have NO unit tests

| Domain | Coordinator | Plugin | Services Tested |
|--------|------------|--------|-----------------|
| chaos-resilience | NO TEST | NO TEST | YES (3/3) |
| code-intelligence | NO TEST | NO TEST | YES (6/6) |
| contract-testing | NO TEST | NO TEST | YES (3/3) |
| coverage-analysis | NO TEST | NO TEST | PARTIAL (3/5) |
| defect-intelligence | NO TEST | NO TEST | YES (3/3) |
| learning-optimization | NO TEST | NO TEST | YES (4/4) |
| quality-assessment | NO TEST | NO TEST | YES (4/4) |
| requirements-validation | NO TEST | NO TEST | PARTIAL |
| security-compliance | NO TEST | NO TEST | YES (3/3) |
| test-execution | NO TEST | NO TEST | PARTIAL |
| test-generation | NO TEST | NO TEST | PARTIAL |
| visual-accessibility | NO TEST | NO TEST | YES (multiple) |

**Missing Coverage**:
- `coordinator.ts` - Task routing, agent management, health reporting
- `plugin.ts` - Event handling, task execution, lifecycle management

**Risk Assessment**:
- Coordinators are the domain entry points for Queen's task dispatch
- Plugins handle the actual task execution and results
- No testing of `executeTask()` and `canHandleTask()` methods
- No testing of domain-specific health reporting

---

### 1.4 Workers (HIGH - Risk Score: 0.85)

**Status**: 10 background workers have NO unit tests

| Worker | Purpose | Risk |
|--------|---------|------|
| `compliance-checker.ts` | Regulatory compliance monitoring | HIGH |
| `coverage-tracker.ts` | Coverage change detection | MEDIUM |
| `defect-predictor.ts` | ML-based defect prediction | HIGH |
| `flaky-detector.ts` | Flaky test identification | MEDIUM |
| `learning-consolidation.ts` | Pattern consolidation | HIGH |
| `performance-baseline.ts` | Performance regression | MEDIUM |
| `quality-gate.ts` | Quality threshold enforcement | HIGH |
| `regression-monitor.ts` | Regression detection | MEDIUM |
| `security-scan.ts` | Security vulnerability scanning | CRITICAL |
| `test-health.ts` | Test suite health monitoring | MEDIUM |

**Framework Tested**: `base-worker.ts`, `daemon.ts`, `worker-manager.ts` - YES

**Risk Assessment**:
- Workers run in background affecting system state
- Security-scan worker is especially critical
- Learning-consolidation affects pattern quality
- Quality-gate can block deployments

---

### 1.5 Kernel Components (HIGH - Risk Score: 0.82)

**Status**: Core kernel files without tests

| File | Purpose | Risk |
|------|---------|------|
| `kernel.ts` | Main QEKernel implementation | CRITICAL |
| `hybrid-backend.ts` | Memory backend hybrid mode | HIGH |
| `plugin-loader.ts` | Domain plugin loading | HIGH |
| `unified-memory.ts` | Unified memory abstraction | HIGH |
| `unified-persistence.ts` | Persistence layer | HIGH |
| `memory-factory.ts` | Memory backend creation | MEDIUM |
| `unified-memory-migration.ts` | V2 to V3 migration | MEDIUM |

**Tested**:
- `agent-coordinator.ts` - YES
- `event-bus.ts` - YES
- `memory-backend.ts` - YES

**Risk Assessment**:
- `kernel.ts` is the central orchestrator
- `plugin-loader.ts` affects domain availability
- Memory systems affect all data operations

---

### 1.6 Learning System (HIGH - Risk Score: 0.80)

**Status**: Several critical learning files untested

| File | Purpose | Test Status |
|------|---------|-------------|
| `qe-reasoning-bank.ts` | Reasoning patterns | YES |
| `token-tracker.ts` | Token usage | YES |
| `dream-scheduler.ts` | Dream cycle | YES |
| `causal-verifier.ts` | Causal verification | YES |
| `memory-auditor.ts` | Memory audit | YES |
| `experience-capture.ts` | Experience capture | NO TEST |
| `qe-hooks.ts` | QE lifecycle hooks | NO TEST |
| `qe-patterns.ts` | Pattern definitions | NO TEST |
| `pattern-store.ts` | Pattern persistence | NO TEST |
| `qe-guidance.ts` | QE guidance | NO TEST |
| `real-embeddings.ts` | Real embedding generation | NO TEST |
| `real-qe-reasoning-bank.ts` | Real reasoning bank | BENCHMARK ONLY |
| `sqlite-persistence.ts` | SQLite persistence | NO TEST |
| `v2-to-v3-migration.ts` | Migration logic | NO TEST |
| `qe-unified-memory.ts` | Unified memory | NO TEST |
| `aqe-learning-engine.ts` | Main learning engine | NO TEST |

**Risk Assessment**:
- `qe-hooks.ts` affects all QE lifecycle events
- `pattern-store.ts` affects pattern persistence and retrieval
- `v2-to-v3-migration.ts` is one-time but critical for upgrades

---

### 1.7 Routing System (MEDIUM - Risk Score: 0.70)

**Status**: Good coverage but gaps in critical files

| File | Test Status |
|------|-------------|
| `qe-agent-registry.ts` | YES |
| `qe-task-router.ts` | YES |
| `queen-integration.ts` | YES |
| `routing-feedback.ts` | YES |
| `task-classifier.ts` | NO TEST |
| `tiny-dancer-router.ts` | NO TEST |
| `routing-config.ts` | NO TEST |

**Risk Assessment**:
- `tiny-dancer-router.ts` is critical for model selection
- `task-classifier.ts` affects routing decisions
- These affect cost and performance

---

### 1.8 Sync System (HIGH - Risk Score: 0.78)

**Status**: No tests for sync components

| File | Purpose | Risk |
|------|---------|------|
| `sync-agent.ts` | Main sync agent | HIGH |
| `claude-flow-bridge.ts` | Claude-Flow integration | HIGH |
| `cloud/postgres-writer.ts` | Cloud database sync | CRITICAL |
| `cloud/tunnel-manager.ts` | Secure tunnel management | CRITICAL |
| `readers/json-reader.ts` | JSON data reading | MEDIUM |
| `readers/sqlite-reader.ts` | SQLite data reading | MEDIUM |

**Risk Assessment**:
- Sync components affect data consistency
- Cloud sync involves security-sensitive operations
- No testing of failure scenarios

---

### 1.9 MCP Tools (MEDIUM - Risk Score: 0.65)

**Status**: 16 tool directories, only 1 has tests

**Tested**:
- `analysis/token-usage.ts` - YES

**Untested Tool Directories**:
- chaos-resilience
- code-intelligence
- coherence
- contract-testing
- coverage-analysis
- defect-intelligence
- embeddings
- learning-optimization
- mincut
- planning
- quality-assessment
- requirements-validation
- security-compliance
- test-execution
- test-generation
- visual-accessibility

**Note**: Domain handlers test some functionality indirectly

---

### 1.10 Strange Loop System (MEDIUM - Risk Score: 0.60)

**Status**: Partial coverage

| File | Test Status |
|------|-------------|
| `strange-loop.ts` | YES |
| `belief-reconciler.ts` | YES |
| `healing-controller.ts` | NO TEST |
| `self-model.ts` | NO TEST |
| `swarm-observer.ts` | NO TEST |
| `topology-analyzer.ts` | NO TEST |

---

## 2. Integration Test Gaps

### 2.1 Missing Integration Tests

| Integration Point | Risk | Estimated Effort |
|------------------|------|------------------|
| MCP Handler + Queen Coordinator | CRITICAL | 8h |
| Queen + Domain Plugin execution | CRITICAL | 12h |
| Memory Handler + Kernel Memory | HIGH | 6h |
| Task Handler + TinyDancer Routing | HIGH | 8h |
| Sync Agent + Cloud Database | HIGH | 8h |
| Worker Manager + Background Workers | MEDIUM | 6h |
| Fleet Init + All Domains | HIGH | 10h |

### 2.2 Existing Integration Tests (Good Coverage)

- LLM Provider failover and multi-provider
- MCP server integration
- Memory persistence
- Consensus engine integration
- Protocol executor
- Cross-domain routing
- Queen-TinyDancer wiring
- Browser integration
- Token tracking

---

## 3. Error Handling Paths Without Tests

### 3.1 Fleet Not Initialized Scenarios

All MCP handlers check `isFleetInitialized()` but none test this error path:

```typescript
// Pattern repeated in all handlers
if (!isFleetInitialized()) {
  return {
    success: false,
    error: 'Fleet not initialized. Call fleet_init first.',
  };
}
```

**Recommended**: Add tests for each handler's not-initialized response

### 3.2 Domain Plugin Errors

- Plugin loading failures
- Plugin execution timeouts
- Plugin health degradation

### 3.3 Memory Operation Errors

- Store failures (disk full, permission denied)
- Retrieval of missing keys
- Namespace conflicts
- TTL expiration edge cases

### 3.4 Task Execution Errors

- Task timeout handling
- Retry exhaustion
- Agent spawn failures
- Domain rejection scenarios

---

## 4. Risk-Scored Gap Priority List

| Priority | Component | Risk Score | Files | Effort (h) |
|----------|-----------|------------|-------|------------|
| P0 | MCP Handlers | 0.95 | 7 | 24 |
| P0 | Domain Coordinators | 0.92 | 12 | 36 |
| P0 | Domain Plugins | 0.92 | 12 | 24 |
| P1 | Security-scan Worker | 0.90 | 1 | 4 |
| P1 | Queen Integration Tests | 0.88 | - | 16 |
| P1 | Background Workers | 0.85 | 10 | 20 |
| P1 | Kernel Core | 0.82 | 7 | 16 |
| P2 | Learning System | 0.80 | 11 | 20 |
| P2 | Sync System | 0.78 | 6 | 12 |
| P2 | Routing (classifier/router) | 0.70 | 3 | 8 |
| P3 | MCP Tools | 0.65 | 16 dirs | 32 |
| P3 | Strange Loop | 0.60 | 4 | 8 |

---

## 5. Recommended Test Additions

### 5.1 Immediate Priority (P0) - Estimated 84 hours

1. **MCP Handler Unit Tests** (24h)
   - Create `tests/unit/mcp/handlers/agent-handlers.test.ts`
   - Create `tests/unit/mcp/handlers/core-handlers.test.ts`
   - Create `tests/unit/mcp/handlers/memory-handlers.test.ts`
   - Create `tests/unit/mcp/handlers/task-handlers.test.ts`
   - Test all public APIs with happy path and error cases

2. **Domain Coordinator Tests** (36h)
   - Create coordinator tests for all 12 domains
   - Test task routing, health reporting, agent management
   - Test event handling and cross-domain communication

3. **Domain Plugin Tests** (24h)
   - Create plugin tests for all 12 domains
   - Test `executeTask()`, `canHandleTask()`, lifecycle methods
   - Test event handling and result callbacks

### 5.2 High Priority (P1) - Estimated 56 hours

1. **Integration Tests** (16h)
   - MCP Handler + Queen end-to-end
   - Fleet initialization with all domains
   - Task execution through full pipeline

2. **Worker Tests** (24h)
   - Unit tests for all 10 workers
   - Focus on security-scan worker first

3. **Kernel Core Tests** (16h)
   - `kernel.ts` initialization and lifecycle
   - `plugin-loader.ts` loading scenarios
   - `hybrid-backend.ts` fallback behavior

### 5.3 Medium Priority (P2) - Estimated 40 hours

1. **Learning System** (20h)
   - `qe-hooks.ts` lifecycle hooks
   - `pattern-store.ts` persistence
   - `v2-to-v3-migration.ts` migration scenarios

2. **Sync System** (12h)
   - `sync-agent.ts` sync operations
   - Cloud writer error handling
   - Tunnel management security

3. **Routing** (8h)
   - `tiny-dancer-router.ts` tier selection
   - `task-classifier.ts` classification accuracy

### 5.4 Lower Priority (P3) - Estimated 40 hours

1. **MCP Tools** (32h)
   - Add tests for most critical tool directories
   - Focus on security and chaos tools first

2. **Strange Loop** (8h)
   - Complete coverage for healing/observer components

---

## 6. Coverage Improvement Targets

| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| Overall Test/Source Ratio | 45% | 70% | 25% |
| MCP Handler Coverage | 0% | 90% | 90% |
| Domain Coordinator Coverage | 0% | 80% | 80% |
| Domain Plugin Coverage | 0% | 80% | 80% |
| Worker Coverage | 0% | 70% | 70% |
| Kernel Coverage | 30% | 80% | 50% |
| Integration Test Coverage | Good | Excellent | +20% |

---

## 7. Semantic Gap Analysis

### 7.1 Missing Error Handler Tests

Based on code analysis, these error handling patterns lack test coverage:

1. **Fleet state validation** - All handlers
2. **Domain health degradation** - Queen coordinator
3. **Agent spawn rejection** - Load balancer limits
4. **Task timeout handling** - Task executor
5. **Memory namespace conflicts** - Memory handlers
6. **Plugin initialization failures** - Plugin loader

### 7.2 Missing Edge Case Tests

1. **Concurrent task submission** - Race conditions
2. **Work stealing under load** - Load balancing
3. **Memory TTL expiration** - Time-based cleanup
4. **Agent failover** - Agent recovery
5. **Cross-domain event routing** - Event bus routing

### 7.3 Missing Integration Point Tests

1. **Queen -> Domain Plugin -> Result Callback**
2. **Memory Store -> Unified Persistence -> SQLite**
3. **Task Router -> TinyDancer -> Model Selection**
4. **Sync Agent -> Cloud Writer -> PostgreSQL**

---

## 8. Appendix: File Inventory

### 8.1 Untested Source Files (67 total)

<details>
<summary>Click to expand full list</summary>

**MCP Handlers (7)**
- src/mcp/handlers/agent-handlers.ts
- src/mcp/handlers/core-handlers.ts
- src/mcp/handlers/domain-handlers.ts
- src/mcp/handlers/index.ts
- src/mcp/handlers/memory-handlers.ts
- src/mcp/handlers/task-handlers.ts
- src/mcp/handlers/wrapped-domain-handlers.ts

**Domain Coordinators (12)**
- src/domains/chaos-resilience/coordinator.ts
- src/domains/code-intelligence/coordinator.ts
- src/domains/contract-testing/coordinator.ts
- src/domains/coverage-analysis/coordinator.ts
- src/domains/defect-intelligence/coordinator.ts
- src/domains/learning-optimization/coordinator.ts
- src/domains/quality-assessment/coordinator.ts
- src/domains/requirements-validation/coordinator.ts
- src/domains/security-compliance/coordinator.ts
- src/domains/test-execution/coordinator.ts
- src/domains/test-generation/coordinator.ts
- src/domains/visual-accessibility/coordinator.ts

**Domain Plugins (12)**
- src/domains/chaos-resilience/plugin.ts
- src/domains/code-intelligence/plugin.ts
- src/domains/contract-testing/plugin.ts
- src/domains/coverage-analysis/plugin.ts
- src/domains/defect-intelligence/plugin.ts
- src/domains/learning-optimization/plugin.ts
- src/domains/quality-assessment/plugin.ts
- src/domains/requirements-validation/plugin.ts
- src/domains/security-compliance/plugin.ts
- src/domains/test-execution/plugin.ts
- src/domains/test-generation/plugin.ts
- src/domains/visual-accessibility/plugin.ts

**Workers (10)**
- src/workers/workers/compliance-checker.ts
- src/workers/workers/coverage-tracker.ts
- src/workers/workers/defect-predictor.ts
- src/workers/workers/flaky-detector.ts
- src/workers/workers/learning-consolidation.ts
- src/workers/workers/performance-baseline.ts
- src/workers/workers/quality-gate.ts
- src/workers/workers/regression-monitor.ts
- src/workers/workers/security-scan.ts
- src/workers/workers/test-health.ts

**Kernel (7)**
- src/kernel/hybrid-backend.ts
- src/kernel/kernel.ts
- src/kernel/memory-factory.ts
- src/kernel/plugin-loader.ts
- src/kernel/unified-memory-migration.ts
- src/kernel/unified-memory.ts
- src/kernel/unified-persistence.ts

**Learning (11)**
- src/learning/aqe-learning-engine.ts
- src/learning/experience-capture.ts
- src/learning/pattern-store.ts
- src/learning/qe-guidance.ts
- src/learning/qe-hooks.ts
- src/learning/qe-patterns.ts
- src/learning/qe-unified-memory.ts
- src/learning/real-embeddings.ts
- src/learning/real-qe-reasoning-bank.ts
- src/learning/sqlite-persistence.ts
- src/learning/v2-to-v3-migration.ts

**Sync (4)**
- src/sync/claude-flow-bridge.ts
- src/sync/sync-agent.ts
- src/sync/cloud/postgres-writer.ts
- src/sync/cloud/tunnel-manager.ts

**Strange Loop (4)**
- src/strange-loop/healing-controller.ts
- src/strange-loop/self-model.ts
- src/strange-loop/swarm-observer.ts
- src/strange-loop/topology-analyzer.ts

</details>

---

## 9. Conclusion

The v3 codebase has good test coverage for individual services but significant gaps in:

1. **MCP entry points** - The handlers that receive all external requests
2. **Domain orchestration** - Coordinators and plugins that execute domain logic
3. **Background workers** - Critical for continuous quality monitoring
4. **Core kernel** - Foundation components that everything depends on

**Immediate Action Required**:
- Add unit tests for MCP handlers (blocks safe deployment)
- Add integration tests for Queen -> Domain -> Result flow
- Add tests for security-scan worker (compliance risk)

**Total Estimated Effort**: 120-160 hours to reach 70% coverage target

---

*Report generated by QE Gap Detector v3*
*Analysis methodology: Static file comparison + semantic gap detection*
