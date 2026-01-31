# AG-UI, A2A, and A2UI Protocol Implementation Plan

**Version:** 1.0
**Date:** 2026-01-30
**Status:** Planning
**Related Issue:** GitHub #177 - Protocol Modernization Roadmap
**Total Complexity Points:** 46

---

## Executive Summary

This implementation plan details the 8-week roadmap for integrating AG-UI, A2A, and A2UI protocols into the Agentic QE v3 platform. The plan aligns with Issue #177's 4-milestone structure and provides task-level granularity for parallel execution.

### Protocol Overview

| Protocol | Purpose | Current Status | Target |
|----------|---------|----------------|--------|
| **AG-UI** | Agent-User communication | 0% compliant | 100% compliant, 100ms p95 |
| **A2A** | Agent-Agent interoperability | ~20% aligned | Full v0.3 compliance |
| **A2UI** | Declarative UI generation | Not implemented | 15+ components, WCAG 2.2 |

### Milestone Alignment

| Milestone | Issue #177 Reference | This Plan Phase | Points |
|-----------|---------------------|-----------------|--------|
| v2.8.0 - Communication Foundation | Action 1.1, 1.2 | Phase 1 | 8 |
| v2.9.0 - Scale & Visibility | Action 4.1, 4.2 | Phase 4 | 9 |
| v2.10.0 - Protocol Alignment | Action 2.1, 2.2 | Phase 2 | 14 |
| v3.0.0 - Advanced Patterns | Action 2.3, 3.3 | Phase 3, 4 | 15 |

---

## Phase 1: AG-UI Foundation (Weeks 1-2)

**Goal:** Achieve AG-UI 1.0 compliance with SSE transport
**Complexity Points:** 8
**Parallel Opportunities:** Tasks 1.1 and 1.2 can run in parallel

### Task 1.1: Create AG-UI Event Adapter

**Description:** Build adapter layer that maps existing AQE v3 `ToolProgress` events to AG-UI event taxonomy.

**Deliverables:**
- `v3/src/adapters/ag-ui/event-adapter.ts`
- `v3/src/adapters/ag-ui/event-types.ts`
- `v3/src/adapters/ag-ui/index.ts`
- Unit test suite (100% coverage)

**Acceptance Criteria:**
- [ ] Maps `ToolProgress` to `STEP_STARTED`/`STEP_FINISHED`
- [ ] Maps `ToolResult` to `TOOL_CALL_RESULT`
- [ ] Emits all 5 lifecycle events (RUN_STARTED, RUN_FINISHED, RUN_ERROR, STEP_STARTED, STEP_FINISHED)
- [ ] Emits all 3 text events (TEXT_MESSAGE_START, TEXT_MESSAGE_CONTENT, TEXT_MESSAGE_END)
- [ ] Emits all 4 tool events (TOOL_CALL_START, TOOL_CALL_ARGS, TOOL_CALL_END, TOOL_CALL_RESULT)
- [ ] 50+ unit tests passing

**Agent Type:** `qe-test-architect` (for test-first development)

**Dependencies:** None

**Complexity Points:** 3

---

### Task 1.2: Add SSE Endpoint

**Description:** Implement Server-Sent Events endpoint alongside existing WebSocket transport.

**Deliverables:**
- `v3/src/mcp/transport/sse/sse-transport.ts`
- `v3/src/mcp/transport/sse/connection-manager.ts`
- Express route at `/agent/stream`
- Integration test suite

**Acceptance Criteria:**
- [ ] SSE endpoint at `/agent/stream` accepting POST requests
- [ ] Correct headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`
- [ ] Event format: `data: {json}\n\n`
- [ ] Connection lifecycle handling (open, error, close)
- [ ] Auto-reconnect support for clients
- [ ] 30+ integration tests passing

**Agent Type:** `qe-coder` (implementation) + `qe-test-architect` (tests)

**Dependencies:** None (parallel with Task 1.1)

**Complexity Points:** 2

---

### Task 1.3: Implement STATE_SNAPSHOT/STATE_DELTA

**Description:** Add state synchronization capability using JSON Patch (RFC 6902).

**Deliverables:**
- `v3/src/adapters/ag-ui/state-manager.ts`
- `v3/src/adapters/ag-ui/json-patch-utils.ts`
- STATE_SNAPSHOT event emission
- STATE_DELTA incremental updates

**Acceptance Criteria:**
- [ ] STATE_SNAPSHOT emits complete agent state on connection
- [ ] STATE_DELTA uses RFC 6902 JSON Patch operations
- [ ] Supports `add`, `replace`, `remove` operations
- [ ] Atomic patch application with rollback on error
- [ ] Reconnection triggers fresh STATE_SNAPSHOT
- [ ] 40+ unit tests passing

**Agent Type:** `qe-coder`

**Dependencies:** Task 1.1 (event adapter)

**Complexity Points:** 2

---

### Task 1.4: Add Backpressure and Cancellation

**Description:** Implement flow control and client cancellation handling.

**Deliverables:**
- `v3/src/adapters/ag-ui/stream-controller.ts`
- `v3/src/adapters/ag-ui/backpressure-handler.ts`
- AbortController integration
- Token buffering for slow clients

**Acceptance Criteria:**
- [ ] Client cancellation via AbortController aborts agent runs
- [ ] Token buffering at 50ms intervals (60fps equivalent)
- [ ] Backpressure detection when buffer exceeds threshold
- [ ] Graceful degradation (skip non-critical events)
- [ ] Latency target: <100ms p95 achieved
- [ ] 25+ tests including stress tests

**Agent Type:** `qe-performance-tester`

**Dependencies:** Tasks 1.1, 1.2, 1.3

**Complexity Points:** 1

---

## Phase 2: A2A Protocol Alignment (Weeks 3-4)

**Goal:** Achieve A2A v0.3 compliance with agent discovery
**Complexity Points:** 14
**Parallel Opportunities:** Tasks 2.1, 2.2, and 2.3 can run in parallel

### Task 2.1: Define Agent Capability Cards Schema

**Description:** Create A2A-compatible Agent Cards for all 68 QE agents.

**Deliverables:**
- `v3/src/adapters/a2a/agent-cards/schema.ts`
- `v3/src/adapters/a2a/agent-cards/generator.ts`
- Agent card JSON files for 68 agents
- Card validation utility

**Acceptance Criteria:**
- [ ] Schema matches A2A v0.3 specification
- [ ] Generator parses agent markdown files
- [ ] Cards include: name, description, version, url, capabilities, skills
- [ ] Skills extracted from agent markdown sections
- [ ] 68 valid agent cards generated
- [ ] JSON Schema validation passing
- [ ] 50+ unit tests

**Agent Type:** `qe-architect` (schema) + `qe-coder` (generator)

**Dependencies:** None

**Complexity Points:** 5

---

### Task 2.2: Implement JSON-RPC 2.0 Message Envelope

**Description:** Add JSON-RPC 2.0 message format for A2A communication.

**Deliverables:**
- `v3/src/adapters/a2a/jsonrpc/envelope.ts`
- `v3/src/adapters/a2a/jsonrpc/methods.ts`
- `v3/src/adapters/a2a/jsonrpc/errors.ts`
- Request/response serialization

**Acceptance Criteria:**
- [ ] Request format: `{ jsonrpc: "2.0", id, method, params }`
- [ ] Response format: `{ jsonrpc: "2.0", id, result }` or `{ jsonrpc: "2.0", id, error }`
- [ ] Standard error codes: -32700, -32600, -32601, -32602, -32603
- [ ] A2A error codes: -32001 to -32042
- [ ] Methods: message/send, message/stream, tasks/get, tasks/list, tasks/cancel
- [ ] 40+ unit tests

**Agent Type:** `qe-coder`

**Dependencies:** None (parallel with 2.1)

**Complexity Points:** 3

---

### Task 2.3: Add Agent Discovery Endpoint

**Description:** Implement RFC 8615 well-known URI for agent discovery.

**Deliverables:**
- Express route at `/.well-known/agent.json`
- Per-agent routes at `/a2a/:agentId/.well-known/agent.json`
- Authenticated extended card endpoint
- Discovery service

**Acceptance Criteria:**
- [ ] `/.well-known/agent.json` returns aggregate platform card
- [ ] Per-agent endpoints return individual cards
- [ ] Authenticated endpoint returns extended card with rate limits
- [ ] Proper Content-Type and caching headers
- [ ] 404 for unknown agents with A2A error format
- [ ] 30+ integration tests

**Agent Type:** `qe-coder` + `qe-security-scanner` (auth)

**Dependencies:** Task 2.1 (agent cards)

**Complexity Points:** 3

---

### Task 2.4: Implement Task Negotiation Protocol

**Description:** Add A2A task lifecycle management.

**Deliverables:**
- `v3/src/adapters/a2a/tasks/task-manager.ts`
- `v3/src/adapters/a2a/tasks/task-router.ts`
- Task state machine (submitted -> working -> completed/failed)
- SSE streaming for task updates

**Acceptance Criteria:**
- [ ] Task states: submitted, working, input_required, auth_required, completed, failed, canceled, rejected
- [ ] Task artifacts with multipart support (TextPart, FilePart, DataPart)
- [ ] Context ID for multi-turn conversations
- [ ] Integration with existing Queen Coordinator
- [ ] SSE endpoint at `/a2a/tasks/:taskId/subscribe`
- [ ] 60+ tests including state machine tests

**Agent Type:** `qe-architect` (design) + `qe-coder` (implementation)

**Dependencies:** Tasks 2.1, 2.2, 2.3

**Complexity Points:** 3

---

## Phase 3: A2UI Declarative UI (Weeks 5-6)

**Goal:** Implement A2UI v0.8 with QE component catalog
**Complexity Points:** 15
**Parallel Opportunities:** Tasks 3.1 and 3.2 can run in parallel

### Task 3.1: Create A2UI Component Catalog

**Description:** Define standard and QE-specific component catalog.

**Deliverables:**
- `v3/src/adapters/a2ui/catalog/standard-catalog.ts`
- `v3/src/adapters/a2ui/catalog/qe-catalog.ts`
- `v3/src/adapters/a2ui/catalog/component-schemas.ts`
- Component validation utility

**Acceptance Criteria:**
- [ ] 15+ standard components: Row, Column, List, Text, Image, Icon, Button, TextField, CheckBox, DateTimeInput, Slider, Card, Tabs, Modal, Divider
- [ ] 6+ QE components: CoverageGauge, TestStatusBadge, VulnerabilityCard, QualityGateIndicator, A11yFindingCard, TestTimeline
- [ ] JSON Schema for each component
- [ ] Validation function for component payloads
- [ ] 80+ unit tests

**Agent Type:** `qe-ui-specialist` + `qe-test-architect`

**Dependencies:** None

**Complexity Points:** 4

---

### Task 3.2: Implement Surface Rendering Engine

**Description:** Build A2UI message generator for QE surfaces.

**Deliverables:**
- `v3/src/adapters/a2ui/renderer/surface-generator.ts`
- `v3/src/adapters/a2ui/renderer/component-builder.ts`
- `v3/src/adapters/a2ui/renderer/message-types.ts`
- QE surface templates (coverage, tests, security, a11y)

**Acceptance Criteria:**
- [ ] surfaceUpdate message generation
- [ ] dataModelUpdate message generation
- [ ] beginRendering/deleteSurface lifecycle
- [ ] Flat adjacency list structure (not nested)
- [ ] Component ID references
- [ ] 4 QE surface templates implemented
- [ ] 50+ unit tests

**Agent Type:** `qe-coder`

**Dependencies:** None (parallel with 3.1)

**Complexity Points:** 3

---

### Task 3.3: Add Data Binding with BoundValue Types

**Description:** Implement static and dynamic data binding.

**Deliverables:**
- `v3/src/adapters/a2ui/data/bound-value.ts`
- `v3/src/adapters/a2ui/data/json-pointer-resolver.ts`
- `v3/src/adapters/a2ui/data/reactive-store.ts`
- Data binding documentation

**Acceptance Criteria:**
- [ ] literalString for static values
- [ ] path for dynamic JSON Pointer (RFC 6901)
- [ ] Combined literalString + path for defaults
- [ ] Reactive updates when data changes
- [ ] Children binding: explicitList and template
- [ ] 40+ unit tests

**Agent Type:** `qe-coder`

**Dependencies:** Tasks 3.1, 3.2

**Complexity Points:** 2

---

### Task 3.4: Integrate with AG-UI State Events

**Description:** Connect A2UI state to AG-UI synchronization.

**Deliverables:**
- `v3/src/adapters/a2ui/integration/agui-sync.ts`
- State flow: AG-UI STATE_DELTA -> A2UI component updates
- CUSTOM event emission for surface updates

**Acceptance Criteria:**
- [ ] STATE_SNAPSHOT initializes A2UI surfaces
- [ ] STATE_DELTA updates bound component values
- [ ] A2UI surface updates emit via AG-UI CUSTOM events
- [ ] Bidirectional sync working
- [ ] 30+ integration tests

**Agent Type:** `qe-integration-specialist`

**Dependencies:** Tasks 1.3 (AG-UI state), 3.3 (data binding)

**Complexity Points:** 3

---

### Task 3.5: WCAG 2.2 Accessibility Compliance

**Description:** Ensure A2UI components meet accessibility standards.

**Deliverables:**
- `v3/src/adapters/a2ui/accessibility/aria-attributes.ts`
- `v3/src/adapters/a2ui/accessibility/wcag-validator.ts`
- Accessibility documentation
- Audit report

**Acceptance Criteria:**
- [ ] ARIA role, label, describedBy attributes
- [ ] aria-live regions for dynamic content
- [ ] Keyboard navigation support
- [ ] WCAG 2.2 Level AA compliance
- [ ] Screen reader testing passed
- [ ] Automated accessibility tests
- [ ] 25+ tests

**Agent Type:** `qe-accessibility-auditor`

**Dependencies:** Tasks 3.1, 3.2

**Complexity Points:** 3

---

## Phase 4: Scale & Integration (Weeks 7-8)

**Goal:** Validate 100+ agent coordination and performance
**Complexity Points:** 9

### Task 4.1: Test 100+ Agent Coordination

**Description:** Load test the platform with 100+ concurrent agents.

**Deliverables:**
- Load test scripts
- Performance metrics dashboard
- Scaling recommendations
- Bottleneck analysis

**Acceptance Criteria:**
- [ ] 100+ agents coordinated simultaneously
- [ ] Memory usage < 4GB at scale
- [ ] No agent starvation or deadlocks
- [ ] Queen Coordinator handles load
- [ ] Gossip protocol stable at scale
- [ ] Performance report generated

**Agent Type:** `qe-performance-tester` + `qe-chaos-engineer`

**Dependencies:** Phases 1-3 complete

**Complexity Points:** 3

---

### Task 4.2: Implement CRDT-Based Distributed Memory

**Description:** Add CRDT for eventually consistent state across agents.

**Deliverables:**
- `v3/src/memory/crdt/crdt-store.ts`
- `v3/src/memory/crdt/convergence-tracker.ts`
- Integration with existing vector clocks
- Cross-partition access

**Acceptance Criteria:**
- [ ] LWW (Last-Write-Wins) register implemented
- [ ] G-Counter for aggregations
- [ ] Merge function for conflict resolution
- [ ] Eventual consistency verified
- [ ] Integration with AgentDB
- [ ] 50+ tests including convergence tests

**Agent Type:** `qe-architect` + `qe-coder`

**Dependencies:** Phase 1-3 complete

**Complexity Points:** 3

---

### Task 4.3: Performance Optimization

**Description:** Achieve 100ms p95 latency target across all protocols.

**Deliverables:**
- Performance profiling report
- Optimization patches
- Benchmark suite
- CI performance gates

**Acceptance Criteria:**
- [ ] AG-UI streaming: <100ms p95 (from 500ms)
- [ ] A2A task submission: <200ms p95
- [ ] A2UI surface generation: <150ms p95
- [ ] Memory allocation optimized
- [ ] Token throughput > 1000 tokens/sec
- [ ] CI gates for performance regression

**Agent Type:** `qe-performance-tester`

**Dependencies:** Tasks 4.1

**Complexity Points:** 2

---

### Task 4.4: Integration Testing Across Protocols

**Description:** End-to-end testing of all three protocols working together.

**Deliverables:**
- E2E test suite
- Protocol interop tests
- CI/CD integration
- Release validation checklist

**Acceptance Criteria:**
- [ ] AG-UI -> A2A -> A2UI flow working
- [ ] External agent can discover QE agents via A2A
- [ ] External agent can request QE task
- [ ] QE results rendered via A2UI
- [ ] State sync maintained across protocols
- [ ] 100+ E2E tests passing
- [ ] CI pipeline green

**Agent Type:** `qe-test-architect` + `qe-integration-specialist`

**Dependencies:** Tasks 4.1, 4.2, 4.3

**Complexity Points:** 1

---

## Gantt Chart

```
Week 1-2: AG-UI Foundation
  [=====] Task 1.1: Event Adapter (3 pts)
  [=====] Task 1.2: SSE Endpoint (2 pts) [PARALLEL with 1.1]
  [  ===] Task 1.3: State Sync (2 pts)
  [    =] Task 1.4: Backpressure (1 pt)

Week 3-4: A2A Protocol Alignment
  [=====] Task 2.1: Agent Cards (5 pts)
  [===  ] Task 2.2: JSON-RPC 2.0 (3 pts) [PARALLEL with 2.1]
  [===  ] Task 2.3: Discovery (3 pts) [PARALLEL with 2.1]
  [   ==] Task 2.4: Task Negotiation (3 pts)

Week 5-6: A2UI Declarative UI
  [====] Task 3.1: Component Catalog (4 pts)
  [=== ] Task 3.2: Surface Rendering (3 pts) [PARALLEL with 3.1]
  [  ==] Task 3.3: Data Binding (2 pts)
  [ ===] Task 3.4: AG-UI Integration (3 pts)
  [  ==] Task 3.5: WCAG 2.2 (3 pts)

Week 7-8: Scale & Integration
  [===] Task 4.1: 100+ Agent Test (3 pts)
  [===] Task 4.2: CRDT Memory (3 pts)
  [ ==] Task 4.3: Performance (2 pts)
  [  =] Task 4.4: E2E Testing (1 pt)
```

---

## Critical Path

The critical path through the plan:

1. **Task 1.1** (Event Adapter) -> **Task 1.3** (State Sync) -> **Task 1.4** (Backpressure)
2. **Task 2.1** (Agent Cards) -> **Task 2.4** (Task Negotiation)
3. **Task 3.1** (Catalog) + **Task 3.2** (Rendering) -> **Task 3.4** (AG-UI Integration)
4. All Phase 3 tasks -> **Task 4.4** (E2E Testing)

**Critical Path Duration:** 8 weeks

---

## Parallel Execution Opportunities

### Week 1-2 Parallelism
- **Task 1.1** and **Task 1.2** have no dependencies (can start immediately)
- 2 agents can work simultaneously
- Saves: ~1 week

### Week 3-4 Parallelism
- **Task 2.1**, **Task 2.2**, and **Task 2.3** can run in parallel
- 3 agents can work simultaneously
- Saves: ~1 week

### Week 5-6 Parallelism
- **Task 3.1** and **Task 3.2** can run in parallel
- **Task 3.5** can start once 3.1 completes (parallel with 3.3, 3.4)
- 2-3 agents can work simultaneously
- Saves: ~0.5 weeks

---

## Resource Allocation

### Agent Types Required

| Agent Type | Tasks | Total Hours |
|------------|-------|-------------|
| qe-test-architect | 1.1, 3.1, 4.4 | 40 |
| qe-coder | 1.2, 1.3, 2.2, 2.3, 3.2, 3.3, 4.2 | 80 |
| qe-architect | 2.1, 2.4, 4.2 | 30 |
| qe-performance-tester | 1.4, 4.1, 4.3 | 25 |
| qe-accessibility-auditor | 3.5 | 15 |
| qe-integration-specialist | 3.4, 4.4 | 20 |
| qe-security-scanner | 2.3 | 10 |
| qe-chaos-engineer | 4.1 | 10 |

**Total Agent Hours:** ~230 hours over 8 weeks

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| AG-UI spec changes during implementation | Medium | Medium | Pin to v1.0, monitor updates |
| A2A v0.4 release with breaking changes | Low | High | Abstract protocol layer |
| Performance target not achievable | Medium | Medium | Early profiling, incremental optimization |
| WCAG 2.2 audit failures | Low | Medium | Use existing accessible patterns |
| 100+ agent coordination bottlenecks | Medium | High | Early load testing, scaling plan |

---

## Success Metrics Summary

### Phase 1: AG-UI Foundation
- [ ] 19 AG-UI event types implemented
- [ ] SSE endpoint functional
- [ ] <100ms p95 latency
- [ ] State sync working

### Phase 2: A2A Protocol
- [ ] 68 agent cards generated
- [ ] JSON-RPC 2.0 messages
- [ ] Discovery at `/.well-known/agent.json`
- [ ] Task lifecycle complete

### Phase 3: A2UI Declarative UI
- [ ] 15+ standard components
- [ ] 6+ QE components
- [ ] WCAG 2.2 Level AA
- [ ] AG-UI state sync

### Phase 4: Scale & Integration
- [ ] 100+ agents coordinated
- [ ] CRDT memory working
- [ ] <100ms p95 across protocols
- [ ] E2E tests passing

---

## References

### Architecture Decision Records
- [ADR-053: AG-UI Protocol Adoption](/v3/implementation/adrs/ADR-053-ag-ui-protocol.md)
- [ADR-054: A2A Protocol Integration](/v3/implementation/adrs/ADR-054-a2a-protocol.md)
- [ADR-055: A2UI Declarative UI Strategy](/v3/implementation/adrs/ADR-055-a2ui-declarative-ui.md)

### Research Reports
- [V3 AQE Status Analysis](/docs/research/v3-aqe-status-analysis-2026.md)
- [AG-UI Best Practices](/docs/research/ag-ui-best-practices-2026.md)
- [A2A Protocol Best Practices](/docs/research/a2a-protocol-best-practices-2026.md)
- [A2UI Best Practices](/docs/research/a2ui-best-practices-2026.md)

### External Documentation
- [AG-UI Protocol Specification](https://docs.ag-ui.com/)
- [A2A Protocol Specification](https://a2a-protocol.org/latest/specification/)
- [A2UI Specification](https://a2ui.org/specification/v0.8-a2ui/)

---

*Implementation Plan created: 2026-01-30*
*Review Cycle: Weekly checkpoint at end of each phase*
