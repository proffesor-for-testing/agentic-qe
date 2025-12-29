# Goal-Oriented Action Plan: Agentic QE Fleet Enhancement

**Version**: 1.0.0
**Created**: 2025-12-28
**Status**: Planning Phase
**GOAP Algorithm**: A* Search with Precondition/Effect Analysis

---

## Executive Summary

This GOAP document outlines a strategic enhancement plan for the Agentic QE Fleet (v2.7.0) based on modern agent communication protocols, specifically targeting integration with emerging standards like [AG-UI](https://docs.ag-ui.com/introduction), [A2A](https://a2aprotocol.ai/blog/a2a-mcp-ag-ui), and [A2UI](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/).

---

## Current State Assessment

### Fleet Composition (v2.7.0)
- **21 Core QE Agents**: Test generation, coverage, performance, security, etc.
- **15 n8n Workflow Testing Agents**: Contributed by @fndlalit
- **11 QE Subagents**: TDD specialists, code reviewers
- **46 QE Skills**: Comprehensive testing methodology coverage
- **91+ MCP Tools**: With lazy loading (87% context reduction)

### Current Communication Architecture
| Component | Implementation | Status |
|-----------|---------------|--------|
| Agent Coordination | Memory namespace (`aqe/*`) | Production |
| Consensus Protocol | `consensus_propose` / `consensus_vote` | Production |
| Experience Sharing | Gossip protocol with vector clocks | Production |
| Real-time Streaming | WebSocket + AsyncGenerator | Production |
| Visualization | WebSocket server (500ms latency) | Production |

### Identified Gaps
1. **No AG-UI integration**: Frontend communication relies on custom WebSocket protocol
2. **Limited streaming semantics**: Progress events lack standardized format
3. **Agent-to-agent protocol**: Custom gossip protocol, not aligned with A2A
4. **UI component rendering**: No declarative UI capability (A2UI pattern)
5. **Scalability ceiling**: 50+ agents not thoroughly tested in production

---

## Goal State Definition

### Primary Goal
Modernize the Agentic QE Fleet to support standardized agent protocols while maintaining backward compatibility and enhancing scalability to 100+ concurrent agents.

### Goal Decomposition

```
GOAL: Modern Agent Protocol Fleet
├── SUB-GOAL 1: Agent Communication Enhancement
│   ├── Real-time streaming with AG-UI semantics
│   ├── SSE/WebSocket dual-mode support
│   └── Standardized event taxonomy
├── SUB-GOAL 2: Protocol Modernization
│   ├── AG-UI protocol adapter
│   ├── A2A-aligned inter-agent messaging
│   └── A2UI declarative UI components
├── SUB-GOAL 3: Fleet Scalability
│   ├── 100+ agent coordination
│   ├── Intelligent resource allocation
│   └── Distributed memory patterns
└── SUB-GOAL 4: Developer Experience
    ├── Enhanced visualization dashboard
    ├── Distributed tracing
    └── Simplified agent spawning
```

---

## GOAP Action Library

### Phase 1: Agent Communication Enhancement

#### Action 1.1: AG-UI Protocol Adapter

| Property | Value |
|----------|-------|
| **Preconditions** | WebSocket infrastructure exists, MCP server operational |
| **Effects** | Agents can emit AG-UI compatible events |
| **Cost** | Medium (3-4 complexity points) |
| **Priority** | High |

**Success Criteria**:
- [ ] AG-UI event wrapper for existing streaming types
- [ ] SSE endpoint alongside WebSocket
- [ ] Event taxonomy aligned with AG-UI spec (`TEXT_MESSAGE_START`, `TOOL_CALL_START`, etc.)

**Dependencies**: None (foundational)

**Risk Assessment**:
- **Technical Risk**: Low - AG-UI is an event-based protocol compatible with our AsyncGenerator pattern
- **Integration Risk**: Medium - Requires careful mapping of existing `ToolProgress` to AG-UI events
- **Mitigation**: Implement as adapter layer, not replacement

**Implementation Notes**:
```typescript
// Current: src/mcp/streaming/types.ts
interface ToolProgress {
  type: 'progress';
  message: string;
  percent: number;
}

// Target: AG-UI aligned events
interface AgentEvent {
  type: 'TEXT_MESSAGE_START' | 'TOOL_CALL_START' | 'STATE_DELTA' | 'MESSAGES_SNAPSHOT';
  rawEvent: StreamEvent;
  // AG-UI metadata
}
```

---

#### Action 1.2: Bidirectional Streaming Enhancement

| Property | Value |
|----------|-------|
| **Preconditions** | Action 1.1 complete |
| **Effects** | Full duplex agent-client communication |
| **Cost** | Medium (3 complexity points) |
| **Priority** | High |

**Success Criteria**:
- [ ] Client can send interrupts/cancellation
- [ ] State synchronization messages supported
- [ ] Backpressure handling improved

**Dependencies**: Action 1.1

**Risk Assessment**:
- **Technical Risk**: Medium - Bidirectional state sync requires careful conflict resolution
- **Integration Risk**: Low - WebSocketServer already supports message handling
- **Mitigation**: Leverage existing vector clock infrastructure from `ExperienceSharingProtocol`

---

#### Action 1.3: Event-Driven Architecture Refinement

| Property | Value |
|----------|-------|
| **Preconditions** | Actions 1.1, 1.2 complete |
| **Effects** | Unified event bus for all agent communications |
| **Cost** | Medium-High (4 complexity points) |
| **Priority** | Medium |

**Success Criteria**:
- [ ] Central event bus with pub/sub
- [ ] Event replay capability
- [ ] Event persistence for debugging

**Dependencies**: Actions 1.1, 1.2

---

### Phase 2: Protocol Modernization

#### Action 2.1: A2A Protocol Alignment

| Property | Value |
|----------|-------|
| **Preconditions** | Existing gossip protocol operational |
| **Effects** | Inter-agent messages follow A2A semantics |
| **Cost** | High (5 complexity points) |
| **Priority** | Medium |

**Success Criteria**:
- [ ] Agent capability cards (A2A format)
- [ ] Task negotiation protocol
- [ ] Agent discovery mechanism

**Dependencies**: None (can parallel with Phase 1)

**Risk Assessment**:
- **Technical Risk**: Medium - A2A is still evolving
- **Integration Risk**: High - Requires rethinking `ExperienceSharingProtocol`
- **Mitigation**: Implement as optional layer, maintain backward compatibility

**Implementation Approach**:
```typescript
// A2A Agent Card (aligned with current TopologyNode)
interface AgentCard {
  name: string;
  description: string;
  url: string;  // New: agent endpoint URL
  capabilities: string[];  // Maps to TopologyNode.type + skills
  defaultInputModes: string[];
  defaultOutputModes: string[];
}
```

---

#### Action 2.2: Message Format Standardization

| Property | Value |
|----------|-------|
| **Preconditions** | Action 2.1 complete |
| **Effects** | All agent messages use standardized envelope |
| **Cost** | Medium (3 complexity points) |
| **Priority** | Medium |

**Success Criteria**:
- [ ] JSON-RPC 2.0 message envelope
- [ ] Schema validation with existing Ajv infrastructure
- [ ] Message versioning support

**Dependencies**: Action 2.1

---

#### Action 2.3: A2UI Declarative UI Components

| Property | Value |
|----------|-------|
| **Preconditions** | Action 1.1 complete, frontend visualization exists |
| **Effects** | Agents can return structured UI components |
| **Cost** | High (5 complexity points) |
| **Priority** | Low-Medium |

**Success Criteria**:
- [ ] Component catalog (cards, tables, charts)
- [ ] Native rendering in visualization dashboard
- [ ] Accessibility compliance maintained

**Dependencies**: Action 1.1

**Risk Assessment**:
- **Technical Risk**: Medium - A2UI is Google's new spec, still maturing
- **Integration Risk**: Low - Visualization dashboard already renders graphs
- **Mitigation**: Start with subset (test result cards, coverage charts)

---

### Phase 3: Fleet Scalability

#### Action 3.1: 100+ Agent Coordination

| Property | Value |
|----------|-------|
| **Preconditions** | Current 50+ agent tests pass |
| **Effects** | Fleet operates efficiently at 100+ scale |
| **Cost** | High (6 complexity points) |
| **Priority** | High |

**Success Criteria**:
- [ ] Hierarchical coordination validated at 100 agents
- [ ] Memory footprint stays under 4GB
- [ ] Coordination latency under 100ms

**Dependencies**: Phase 1 complete

**Risk Assessment**:
- **Technical Risk**: High - Exponential complexity in mesh topologies
- **Mitigation**: MinCut topology analysis (already in v2.6.6) guides partitioning

**Implementation Strategy**:
1. Leverage existing `TopologyMinCutAnalyzer` for partition optimization
2. Implement coordinator election using consensus protocol
3. Add adaptive topology switching (mesh -> hierarchical at scale)

---

#### Action 3.2: Resource Allocation Intelligence

| Property | Value |
|----------|-------|
| **Preconditions** | Action 3.1 complete |
| **Effects** | Optimal resource distribution across agents |
| **Cost** | Medium-High (4 complexity points) |
| **Priority** | Medium |

**Success Criteria**:
- [ ] ML-based task complexity estimation (exists in v2.6.2)
- [ ] Dynamic agent spawning based on load
- [ ] Memory quota enforcement

**Dependencies**: Action 3.1

---

#### Action 3.3: Distributed Memory Patterns

| Property | Value |
|----------|-------|
| **Preconditions** | Actions 3.1, 3.2 complete |
| **Effects** | Memory shared efficiently across 100+ agents |
| **Cost** | High (5 complexity points) |
| **Priority** | Medium |

**Success Criteria**:
- [ ] CRDT-based shared state (complement to vector clocks)
- [ ] Memory eviction policies
- [ ] Cross-partition memory access

**Dependencies**: Actions 3.1, 3.2

---

### Phase 4: Developer Experience

#### Action 4.1: Enhanced Visualization Dashboard

| Property | Value |
|----------|-------|
| **Preconditions** | Phase 1 complete, frontend exists |
| **Effects** | Rich real-time agent activity visualization |
| **Cost** | Medium (3 complexity points) |
| **Priority** | High |

**Success Criteria**:
- [ ] Agent dependency graph with real-time updates
- [ ] Test execution heatmaps
- [ ] Memory usage sparklines

**Dependencies**: Phase 1

---

#### Action 4.2: Distributed Tracing

| Property | Value |
|----------|-------|
| **Preconditions** | OpenTelemetry infrastructure exists |
| **Effects** | End-to-end trace visibility |
| **Cost** | Medium (3 complexity points) |
| **Priority** | Medium-High |

**Success Criteria**:
- [ ] Trace propagation across all 21 agents
- [ ] Jaeger/Zipkin export (already have OpenTelemetry deps)
- [ ] Correlation with test results

**Dependencies**: None

**Note**: OpenTelemetry dependencies already present in package.json (v2.7.0)

---

#### Action 4.3: Simplified Agent Spawning

| Property | Value |
|----------|-------|
| **Preconditions** | Actions 2.1, 2.2 complete |
| **Effects** | Single-line agent invocation |
| **Cost** | Low (2 complexity points) |
| **Priority** | High |

**Success Criteria**:
- [ ] `aqe spawn <agent-type>` CLI command
- [ ] Agent templates with sensible defaults
- [ ] Auto-coordination enrollment

**Dependencies**: Actions 2.1, 2.2

---

## Optimal Action Sequence (A* Path)

Based on GOAP A* analysis with cost and heuristic distance:

```
START STATE
    │
    ├─[1]─> Action 1.1: AG-UI Protocol Adapter (cost: 3)
    │           │
    ├─[2]─> Action 1.2: Bidirectional Streaming (cost: 3)
    │           │
    ├─[3]─> Action 4.2: Distributed Tracing (cost: 3) [parallel]
    │           │
    ├─[4]─> Action 3.1: 100+ Agent Coordination (cost: 6)
    │           │
    ├─[5]─> Action 4.1: Enhanced Visualization (cost: 3)
    │           │
    ├─[6]─> Action 2.1: A2A Protocol Alignment (cost: 5)
    │           │
    ├─[7]─> Action 2.2: Message Standardization (cost: 3)
    │           │
    ├─[8]─> Action 4.3: Simplified Spawning (cost: 2)
    │           │
    ├─[9]─> Action 1.3: Event Architecture (cost: 4)
    │           │
    ├─[10]─> Action 3.2: Resource Allocation (cost: 4)
    │           │
    ├─[11]─> Action 3.3: Distributed Memory (cost: 5)
    │           │
    └─[12]─> Action 2.3: A2UI Components (cost: 5)
                │
            GOAL STATE
```

**Total Path Cost**: 46 complexity points
**Estimated Milestones**: 3-4 release cycles

---

## Milestone Roadmap

### Milestone 1: Communication Foundation (v2.8.0)
**Actions**: 1.1, 1.2, 4.2
**Success Criteria**:
- AG-UI event emission working
- Bidirectional streaming operational
- Trace correlation visible in dashboards

**Complexity**: 9 points
**Risk**: Low-Medium

---

### Milestone 2: Scale & Visibility (v2.9.0)
**Actions**: 3.1, 4.1
**Success Criteria**:
- 100 agent coordination tested
- Enhanced visualization with real-time graphs

**Complexity**: 9 points
**Risk**: Medium-High

---

### Milestone 3: Protocol Alignment (v2.10.0)
**Actions**: 2.1, 2.2, 4.3
**Success Criteria**:
- A2A-compatible agent discovery
- Standardized message formats
- One-line agent spawning

**Complexity**: 10 points
**Risk**: Medium

---

### Milestone 4: Advanced Patterns (v3.0.0)
**Actions**: 1.3, 3.2, 3.3, 2.3
**Success Criteria**:
- Full event-driven architecture
- Intelligent resource allocation
- Distributed CRDT memory
- A2UI component rendering

**Complexity**: 18 points
**Risk**: Medium-High

---

## Risk Matrix

| Risk Category | Risk Description | Probability | Impact | Mitigation |
|--------------|------------------|-------------|--------|------------|
| **Protocol Volatility** | AG-UI/A2A specs still evolving | Medium | High | Implement adapter layers, not rewrites |
| **Backward Compatibility** | Breaking existing integrations | Medium | High | Feature flags, gradual rollout |
| **Performance Regression** | Added layers increase latency | Low | Medium | Benchmark gates in CI |
| **Resource Constraints** | DevPod/Codespaces memory limits | High | Medium | Continue batched testing policy |
| **Integration Complexity** | Multiple protocols interacting | Medium | Medium | Clear interface boundaries |

---

## Success Metrics

### Quantitative
| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Agent scalability | 50 | 100+ | Load test |
| Streaming latency | 500ms | 100ms | p95 timing |
| Context reduction | 87% | 90% | Token count |
| Test coverage | 85%+ | 90%+ | Jest coverage |

### Qualitative
- Developer feedback on spawning experience
- Community adoption of AG-UI endpoints
- Visualization dashboard usability

---

## OODA Loop Integration

This GOAP plan includes continuous monitoring via OODA:

1. **Observe**: Monitor protocol spec changes, community adoption, performance metrics
2. **Orient**: Analyze deviations from expected outcomes after each milestone
3. **Decide**: Replan if major spec changes or blockers emerge
4. **Act**: Execute next action in sequence, trigger replanning if needed

---

## References

- [AG-UI Protocol Documentation](https://docs.ag-ui.com/introduction)
- [A2A vs MCP vs AG-UI Comparison](https://a2aprotocol.ai/blog/a2a-mcp-ag-ui)
- [AG-UI and A2UI Integration Guide](https://www.copilotkit.ai/blog/ag-ui-and-a2ui-explained-how-the-emerging-agentic-stack-fits-together)
- [Google A2UI Announcement](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/)
- Current Implementation: `/workspaces/agentic-qe/src/mcp/streaming/`
- Fleet Topology: `/workspaces/agentic-qe/src/fleet/topology/`
- Experience Sharing: `/workspaces/agentic-qe/src/learning/ExperienceSharingProtocol.ts`
- Visualization: `/workspaces/agentic-qe/src/visualization/api/WebSocketServer.ts`

---

**Generated by**: GOAP Specialist via Agentic QE Fleet
**Algorithm**: A* Search with Precondition/Effect Modeling
