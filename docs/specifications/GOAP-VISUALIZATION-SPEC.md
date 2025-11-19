# GOAP Specification: Explainable Agent Behavior Visualization System

**Path 1: Interactive Mind Map & Decision Visualization**

**Version**: 1.0.0
**Created**: 2025-01-19
**Status**: SPECIFICATION

---

## Executive Summary

This specification defines a Goal-Oriented Action Plan (GOAP) for building an Explainable Agent Behavior Visualization System for the Agentic QE Fleet. The system will transform opaque agent decision-making processes into interactive, understandable visualizations that enable developers and QE engineers to trace, debug, and optimize agent behaviors across the software lifecycle.

---

## 1. Goal State Definition

### Primary Goal: Full Transparency of Agent Decision Making

The system achieves success when:

```typescript
interface GoalState {
  // Core visualization capabilities
  visualizationReady: true;
  interactiveMindMapRendered: true;
  qualityMetricsGraphsDisplayed: true;
  lifecycleTrackingActive: true;
  realTimeUpdatesEnabled: true;
  drillDownNavigationWorking: true;

  // Data integration
  agentEventStreamConnected: true;
  goapStateExposed: true;
  reasoningChainsCaptured: true;

  // User experience
  averageRenderTime: number; // < 100ms
  userCanTraceDecision: true;
  exportCapabilityAvailable: true;
}
```

### Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Decision Trace Time | < 5 seconds | Time to trace any agent decision to root cause |
| Render Latency | < 100ms | Time to render visualization updates |
| Coverage | 100% | All 19 QE agents fully visualizable |
| User Comprehension | > 80% | User study: understanding agent decisions |
| Real-time Lag | < 500ms | Delay between event and visualization |

---

## 2. Preconditions Analysis

### 2.1 Required System State

Before building this system, the following must be true:

```typescript
interface Preconditions {
  // Existing infrastructure
  eventBusActive: boolean;          // EventBus.ts must be operational
  goapCoordinationLoaded: boolean;  // GOAPCoordination.ts available
  agentsRegistered: boolean;        // At least one agent spawned
  memoryManagerReady: boolean;      // SwarmMemoryManager functional

  // Data availability
  agentEventsEmitting: boolean;     // Events flowing through EventBus
  worldStateTracked: boolean;       // GOAP world state persisted
  actionHistoryStored: boolean;     // Past actions in memory

  // Development environment
  typescriptCompilerReady: boolean;
  frontendBuildToolsAvailable: boolean;
  testFrameworkConfigured: boolean;
}
```

### 2.2 Current State Assessment

| Precondition | Status | Location |
|--------------|--------|----------|
| EventBus | EXISTS | `/src/core/EventBus.ts` |
| GOAPCoordination | EXISTS | `/src/core/coordination/GOAPCoordination.ts` |
| SwarmMemoryManager | EXISTS | `/src/core/memory/` |
| 19 QE Agents | EXISTS | `/src/agents/` |
| Event Types | EXISTS | `/src/types/events.ts` |
| TypeScript Build | EXISTS | `package.json` |

### 2.3 Gap Analysis

| Gap | Priority | Effort |
|-----|----------|--------|
| No visualization data export | HIGH | Medium |
| Event history not persisted | HIGH | Low |
| No real-time streaming endpoint | HIGH | Medium |
| No frontend application | HIGH | High |
| Decision reasoning not captured | MEDIUM | Medium |

---

## 3. Action Sequence (Implementation Plan)

### Phase 1: Data Layer Foundation

#### Action 1.1: Event History Persistence
```typescript
{
  id: "event-history-persistence",
  cost: 3,
  preconditions: {
    eventBusActive: true,
    memoryManagerReady: true
  },
  effects: {
    eventHistoryPersisted: true,
    queryableEventLog: true
  },
  deliverables: [
    "EventHistoryStore class",
    "Event serialization/deserialization",
    "Time-range queries",
    "Event filtering by type/agent"
  ]
}
```

**Implementation Details:**
- Add SQLite table for event history
- Implement circular buffer (last 10,000 events)
- Create indexed queries for fast retrieval
- Support event correlation by task ID

#### Action 1.2: Reasoning Chain Capture
```typescript
{
  id: "reasoning-chain-capture",
  cost: 5,
  preconditions: {
    goapCoordinationLoaded: true,
    eventHistoryPersisted: true
  },
  effects: {
    reasoningChainsCaptured: true,
    decisionAuditTrail: true
  },
  deliverables: [
    "ReasoningCapture middleware",
    "Decision node data structure",
    "Chain linking algorithm",
    "Metadata annotations"
  ]
}
```

**Implementation Details:**
- Intercept GOAP planning events
- Capture A* search path exploration
- Store heuristic calculations
- Link actions to parent goals

#### Action 1.3: Quality Metrics Aggregation
```typescript
{
  id: "quality-metrics-aggregation",
  cost: 4,
  preconditions: {
    agentsRegistered: true,
    reasoningChainsCaptured: true
  },
  effects: {
    qualityMetricsAggregated: true,
    weightedScoresAvailable: true
  },
  deliverables: [
    "MetricsAggregator service",
    "Weighted scoring model",
    "Time-series storage",
    "Dimension categorization"
  ]
}
```

**Implementation Details:**
- Collect metrics: security, performance, maintainability, coverage
- Normalize to 0-100 scale
- Calculate weighted composite scores
- Track trends over time

---

### Phase 2: Visualization Data API

#### Action 2.1: Visualization Data Transformer
```typescript
{
  id: "visualization-data-transformer",
  cost: 4,
  preconditions: {
    eventHistoryPersisted: true,
    reasoningChainsCaptured: true,
    qualityMetricsAggregated: true
  },
  effects: {
    visualizationDataFormatted: true,
    treeStructureGenerated: true
  },
  deliverables: [
    "VisualizationTransformer class",
    "Mind map node generator",
    "Graph edge calculator",
    "Layout algorithm"
  ]
}
```

#### Action 2.2: Real-Time Streaming Endpoint
```typescript
{
  id: "realtime-streaming-endpoint",
  cost: 5,
  preconditions: {
    visualizationDataFormatted: true
  },
  effects: {
    realTimeStreamingAvailable: true,
    websocketEndpointActive: true
  },
  deliverables: [
    "WebSocket server",
    "Event stream multiplexer",
    "Client connection manager",
    "Backpressure handling"
  ]
}
```

#### Action 2.3: REST API for Historical Data
```typescript
{
  id: "rest-api-historical",
  cost: 3,
  preconditions: {
    visualizationDataFormatted: true
  },
  effects: {
    historicalQueryApiReady: true,
    paginationSupported: true
  },
  deliverables: [
    "REST endpoints",
    "Query parameter parsing",
    "Response pagination",
    "Cache layer"
  ]
}
```

---

### Phase 3: Frontend Visualization

#### Action 3.1: Interactive Mind Map Component
```typescript
{
  id: "interactive-mindmap-component",
  cost: 8,
  preconditions: {
    visualizationDataFormatted: true,
    realTimeStreamingAvailable: true
  },
  effects: {
    interactiveMindMapRendered: true,
    zoomPanEnabled: true
  },
  deliverables: [
    "React/D3.js mind map component",
    "Node expand/collapse",
    "Zoom and pan controls",
    "Search and filter"
  ]
}
```

#### Action 3.2: Quality Metrics Graph Panel
```typescript
{
  id: "quality-metrics-graph",
  cost: 6,
  preconditions: {
    qualityMetricsAggregated: true,
    interactiveMindMapRendered: true
  },
  effects: {
    qualityMetricsGraphsDisplayed: true,
    dimensionBreakdownVisible: true
  },
  deliverables: [
    "Radar chart component",
    "Time-series line charts",
    "Dimension drill-down",
    "Threshold indicators"
  ]
}
```

#### Action 3.3: Lifecycle Timeline View
```typescript
{
  id: "lifecycle-timeline-view",
  cost: 5,
  preconditions: {
    interactiveMindMapRendered: true,
    qualityMetricsGraphsDisplayed: true
  },
  effects: {
    lifecycleTrackingActive: true,
    phaseTransitionsVisible: true
  },
  deliverables: [
    "Horizontal timeline component",
    "Phase markers",
    "Event tooltips",
    "Playback controls"
  ]
}
```

#### Action 3.4: Drill-Down Detail Panel
```typescript
{
  id: "drilldown-detail-panel",
  cost: 4,
  preconditions: {
    lifecycleTrackingActive: true
  },
  effects: {
    drillDownNavigationWorking: true,
    contextualDetailsShown: true
  },
  deliverables: [
    "Collapsible side panel",
    "JSON/YAML viewer",
    "Code snippet display",
    "Action replay"
  ]
}
```

---

### Phase 4: Integration & Polish

#### Action 4.1: MCP Tool Integration
```typescript
{
  id: "mcp-tool-integration",
  cost: 4,
  preconditions: {
    drillDownNavigationWorking: true
  },
  effects: {
    mcpToolsExposed: true,
    cliVisualizationCommand: true
  },
  deliverables: [
    "aqe_visualization_start MCP tool",
    "aqe_visualization_export MCP tool",
    "CLI command: aqe visualize"
  ]
}
```

#### Action 4.2: Export & Sharing
```typescript
{
  id: "export-sharing",
  cost: 3,
  preconditions: {
    mcpToolsExposed: true
  },
  effects: {
    exportCapabilityAvailable: true,
    shareableLinksGenerated: true
  },
  deliverables: [
    "SVG export",
    "PNG screenshot",
    "JSON data export",
    "Shareable permalinks"
  ]
}
```

#### Action 4.3: Performance Optimization
```typescript
{
  id: "performance-optimization",
  cost: 5,
  preconditions: {
    exportCapabilityAvailable: true
  },
  effects: {
    averageRenderTime: true, // < 100ms
    largeDatasetHandled: true
  },
  deliverables: [
    "Virtual scrolling",
    "Canvas rendering for 1000+ nodes",
    "Web worker processing",
    "Incremental updates"
  ]
}
```

---

## 4. Milestones & Checkpoints

### Milestone 1: Data Foundation (Week 1-2)
- [ ] Event history persistence working
- [ ] Reasoning chains captured for test run
- [ ] Quality metrics aggregating correctly
- **Validation**: Query last 100 events, see decision chains

### Milestone 2: API Layer Complete (Week 3)
- [ ] WebSocket streaming events in real-time
- [ ] REST API returning paginated history
- [ ] Data transformer producing valid JSON
- **Validation**: Connect test client, receive live updates

### Milestone 3: Basic Visualization (Week 4-5)
- [ ] Mind map renders agent decisions
- [ ] Nodes expandable/collapsible
- [ ] Basic zoom/pan working
- **Validation**: Visualize a 50-node decision tree

### Milestone 4: Full Feature Set (Week 6-7)
- [ ] Quality metrics graphs integrated
- [ ] Lifecycle timeline functional
- [ ] Drill-down panel showing details
- **Validation**: Trace decision from UI to source

### Milestone 5: Production Ready (Week 8)
- [ ] MCP tools registered
- [ ] Export working (SVG, PNG, JSON)
- [ ] Performance under 100ms render
- **Validation**: 1000+ node visualization, real-time updates

---

## 5. Technology Stack

### Backend
```yaml
Runtime:
  - Node.js 18+
  - TypeScript 5.x

Data Storage:
  - SQLite (better-sqlite3) - Event history
  - In-memory LRU cache - Hot data

Communication:
  - ws (WebSocket library)
  - Express.js (REST API)

Existing Dependencies:
  - EventEmitter (Node.js core)
  - uuid (already in package.json)
  - winston (logging)
```

### Frontend
```yaml
Framework:
  - React 18+ (or Preact for size)
  - TypeScript

Visualization:
  - D3.js v7 - Core visualization
  - @visx/visx - React + D3 primitives
  - Cytoscape.js - Alternative for complex graphs

Charting:
  - Recharts - Quality metrics charts
  - @nivo/radar - Radar charts

UI Components:
  - Tailwind CSS - Styling
  - Headless UI - Accessible components
  - React Flow - Node-based UI (optional)
```

### Build & Tooling
```yaml
Build:
  - Vite - Fast bundling
  - esbuild - TypeScript compilation

Testing:
  - Jest - Unit tests
  - Playwright - E2E tests
  - Storybook - Component development
```

---

## 6. Integration Points

### 6.1 EventBus Integration

```typescript
// Subscribe to all agent events
eventBus.subscribe('agent:*', (event) => {
  visualizationStore.captureEvent(event);
});

// GOAP-specific events
eventBus.subscribe('goap:plan-created', (plan) => {
  visualizationStore.addDecisionTree(plan);
});

eventBus.subscribe('goap:action-completed', (data) => {
  visualizationStore.updateNodeState(data);
});
```

### 6.2 GOAPCoordination Integration

```typescript
// Extend GOAPCoordination to emit visualization events
class VisualizableGOAP extends GOAPCoordination {
  private findPlanAStar(...) {
    // Emit exploration events for visualization
    this.emit('goap:viz:node-explored', {
      state: current.state,
      actions: current.actions,
      cost: current.cost,
      heuristic: current.heuristic
    });
  }
}
```

### 6.3 Agent Memory Integration

```typescript
// Store visualization data in agent memory
await memory.store('viz:decision-tree', decisionTreeData, {
  partition: 'visualization',
  ttl: 86400 // 24 hours
});

// Retrieve for display
const history = await memory.retrieve('viz:decision-tree', {
  partition: 'visualization'
});
```

### 6.4 MCP Tool Registration

```typescript
// Register visualization tools
mcpServer.registerTool({
  name: 'aqe_visualization_start',
  description: 'Start the visualization server',
  parameters: {
    port: { type: 'number', default: 3001 },
    agents: { type: 'array', default: ['all'] }
  },
  handler: async (params) => {
    return visualizationServer.start(params);
  }
});
```

### 6.5 CLI Integration

```bash
# New CLI commands
aqe visualize start --port 3001
aqe visualize export --format svg --output decision-tree.svg
aqe visualize trace <task-id>
```

---

## 7. JSON Schema Definitions

### 7.1 Visualization Node Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "VisualizationNode",
  "type": "object",
  "required": ["id", "type", "label", "timestamp"],
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "description": "Unique node identifier"
    },
    "type": {
      "type": "string",
      "enum": ["goal", "action", "decision", "event", "metric"],
      "description": "Type of visualization node"
    },
    "label": {
      "type": "string",
      "maxLength": 100,
      "description": "Display label for the node"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "When this node was created"
    },
    "agentId": {
      "type": "string",
      "description": "Agent that created this node"
    },
    "parentId": {
      "type": "string",
      "format": "uuid",
      "description": "Parent node for tree structure"
    },
    "state": {
      "type": "string",
      "enum": ["pending", "active", "completed", "failed"],
      "default": "pending"
    },
    "metadata": {
      "type": "object",
      "properties": {
        "cost": { "type": "number" },
        "heuristic": { "type": "number" },
        "preconditions": { "type": "object" },
        "effects": { "type": "object" }
      }
    },
    "qualityMetrics": {
      "$ref": "#/definitions/QualityMetrics"
    },
    "children": {
      "type": "array",
      "items": { "$ref": "#" }
    }
  },
  "definitions": {
    "QualityMetrics": {
      "type": "object",
      "properties": {
        "security": { "type": "number", "minimum": 0, "maximum": 100 },
        "performance": { "type": "number", "minimum": 0, "maximum": 100 },
        "maintainability": { "type": "number", "minimum": 0, "maximum": 100 },
        "coverage": { "type": "number", "minimum": 0, "maximum": 100 },
        "reliability": { "type": "number", "minimum": 0, "maximum": 100 }
      }
    }
  }
}
```

### 7.2 Decision Chain Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "DecisionChain",
  "type": "object",
  "required": ["chainId", "goalId", "nodes", "edges"],
  "properties": {
    "chainId": {
      "type": "string",
      "format": "uuid"
    },
    "goalId": {
      "type": "string",
      "description": "The goal this chain achieves"
    },
    "agentId": {
      "type": "string"
    },
    "startTime": {
      "type": "string",
      "format": "date-time"
    },
    "endTime": {
      "type": "string",
      "format": "date-time"
    },
    "totalCost": {
      "type": "number"
    },
    "status": {
      "type": "string",
      "enum": ["planning", "executing", "completed", "failed"]
    },
    "nodes": {
      "type": "array",
      "items": { "$ref": "#/definitions/ChainNode" }
    },
    "edges": {
      "type": "array",
      "items": { "$ref": "#/definitions/ChainEdge" }
    }
  },
  "definitions": {
    "ChainNode": {
      "type": "object",
      "required": ["id", "type"],
      "properties": {
        "id": { "type": "string" },
        "type": { "type": "string" },
        "data": { "type": "object" },
        "position": {
          "type": "object",
          "properties": {
            "x": { "type": "number" },
            "y": { "type": "number" }
          }
        }
      }
    },
    "ChainEdge": {
      "type": "object",
      "required": ["source", "target"],
      "properties": {
        "id": { "type": "string" },
        "source": { "type": "string" },
        "target": { "type": "string" },
        "type": {
          "type": "string",
          "enum": ["causal", "temporal", "dependency"]
        },
        "weight": { "type": "number" }
      }
    }
  }
}
```

### 7.3 Lifecycle Event Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "LifecycleEvent",
  "type": "object",
  "required": ["eventId", "phase", "timestamp"],
  "properties": {
    "eventId": {
      "type": "string",
      "format": "uuid"
    },
    "phase": {
      "type": "string",
      "enum": [
        "requirements",
        "design",
        "test-generation",
        "test-execution",
        "code-analysis",
        "deployment-validation",
        "monitoring"
      ]
    },
    "agentId": {
      "type": "string"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time"
    },
    "duration": {
      "type": "number",
      "description": "Duration in milliseconds"
    },
    "artifacts": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "type": { "type": "string" },
          "path": { "type": "string" },
          "hash": { "type": "string" }
        }
      }
    },
    "transitions": {
      "type": "object",
      "properties": {
        "from": { "type": "string" },
        "to": { "type": "string" },
        "trigger": { "type": "string" }
      }
    }
  }
}
```

### 7.4 Real-Time Update Message Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "RealtimeUpdateMessage",
  "type": "object",
  "required": ["type", "timestamp"],
  "properties": {
    "type": {
      "type": "string",
      "enum": [
        "node:added",
        "node:updated",
        "node:removed",
        "edge:added",
        "metric:updated",
        "phase:changed",
        "sync:full"
      ]
    },
    "timestamp": {
      "type": "string",
      "format": "date-time"
    },
    "payload": {
      "oneOf": [
        { "$ref": "#/definitions/NodePayload" },
        { "$ref": "#/definitions/EdgePayload" },
        { "$ref": "#/definitions/MetricPayload" },
        { "$ref": "#/definitions/SyncPayload" }
      ]
    },
    "sequence": {
      "type": "integer",
      "description": "Monotonic sequence number for ordering"
    }
  },
  "definitions": {
    "NodePayload": {
      "type": "object",
      "properties": {
        "node": { "$ref": "VisualizationNode" }
      }
    },
    "EdgePayload": {
      "type": "object",
      "properties": {
        "edge": { "type": "object" }
      }
    },
    "MetricPayload": {
      "type": "object",
      "properties": {
        "nodeId": { "type": "string" },
        "metrics": { "type": "object" }
      }
    },
    "SyncPayload": {
      "type": "object",
      "properties": {
        "nodes": { "type": "array" },
        "edges": { "type": "array" }
      }
    }
  }
}
```

---

## 8. Success Criteria Validation

### 8.1 Functional Criteria

| ID | Criterion | Validation Method | Pass Condition |
|----|-----------|-------------------|----------------|
| F1 | Display decision tree | Visual inspection | Tree renders with correct hierarchy |
| F2 | Interactive expand/collapse | User interaction | Nodes toggle on click |
| F3 | Quality metrics visible | Chart inspection | All 5 dimensions shown |
| F4 | Real-time updates | Stopwatch test | Updates within 500ms |
| F5 | Drill-down to action | Navigation test | Can reach raw action data |
| F6 | Trace requirements to deployment | E2E test | Full chain visible |
| F7 | Export visualization | File inspection | Valid SVG/PNG output |

### 8.2 Performance Criteria

| ID | Criterion | Test Method | Pass Condition |
|----|-----------|-------------|----------------|
| P1 | Initial load time | Lighthouse | < 2 seconds |
| P2 | Render 100 nodes | Performance API | < 100ms |
| P3 | Render 1000 nodes | Performance API | < 500ms |
| P4 | Memory usage | DevTools | < 100MB for 1000 nodes |
| P5 | Real-time update lag | Timestamp comparison | < 500ms end-to-end |

### 8.3 Integration Criteria

| ID | Criterion | Test Method | Pass Condition |
|----|-----------|-------------|----------------|
| I1 | EventBus events captured | Unit test | All event types stored |
| I2 | GOAP plans visualized | Integration test | Plan tree matches execution |
| I3 | All 19 agents supported | Matrix test | Each agent visualizable |
| I4 | MCP tools callable | MCP test | Tools execute successfully |
| I5 | CLI commands work | Shell test | Commands return expected output |

### 8.4 User Experience Criteria

| ID | Criterion | Test Method | Pass Condition |
|----|-----------|-------------|----------------|
| U1 | Decision traceable | User study | 80% success in 5 minutes |
| U2 | Navigation intuitive | Heuristic evaluation | No major usability issues |
| U3 | Information hierarchy clear | Card sort | Logical grouping achieved |
| U4 | Responsive design | Device test | Works on 1024px+ screens |

---

## 9. Risk Analysis & Mitigation

### High Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Performance with large trees | High | Medium | Canvas rendering, virtualization |
| Complex GOAP paths hard to visualize | High | High | Automatic layout algorithms, filtering |
| Real-time sync issues | Medium | Medium | Sequence numbers, reconciliation |

### Medium Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Browser compatibility | Medium | Low | Target Chrome/Firefox/Safari latest |
| Memory leaks | Medium | Medium | Strict cleanup, WeakMap usage |
| Learning curve for users | Medium | Medium | Progressive disclosure, tutorials |

---

## 10. Implementation Priority Matrix

### Must Have (P0)
- Event history persistence
- Basic mind map rendering
- Node expand/collapse
- Single agent visualization

### Should Have (P1)
- Quality metrics graphs
- Real-time updates
- Lifecycle timeline
- Drill-down panel

### Could Have (P2)
- Export capabilities
- Performance optimization
- MCP tool integration
- Search and filter

### Won't Have (v1)
- Collaborative viewing
- AI-generated explanations
- 3D visualization
- Mobile support

---

## 11. Appendix: File Structure

```
src/
  visualization/
    core/
      EventHistoryStore.ts
      ReasoningCapture.ts
      MetricsAggregator.ts
      VisualizationTransformer.ts
    api/
      WebSocketServer.ts
      RestEndpoints.ts
      StreamMultiplexer.ts
    types/
      visualization.types.ts
      schemas/
        node.schema.json
        chain.schema.json
        lifecycle.schema.json
        realtime.schema.json
    index.ts

frontend/
  src/
    components/
      MindMap/
        MindMap.tsx
        MindMapNode.tsx
        MindMapControls.tsx
      MetricsPanel/
        RadarChart.tsx
        TimeSeriesChart.tsx
      Timeline/
        LifecycleTimeline.tsx
        PhaseMarker.tsx
      DetailPanel/
        DrillDownPanel.tsx
        JsonViewer.tsx
    hooks/
      useVisualizationSocket.ts
      useDecisionChain.ts
    stores/
      visualizationStore.ts
    App.tsx
    main.tsx
  package.json
  vite.config.ts
```

---

## 12. Next Steps

1. **Immediate**: Review specification with team
2. **Week 1**: Begin Phase 1 - Data Layer Foundation
3. **Week 2**: Complete event history and reasoning capture
4. **Week 3**: Build API layer
5. **Week 4-5**: Develop frontend components
6. **Week 6-7**: Integrate and add features
7. **Week 8**: Performance optimization and release

---

**End of Specification**

*This document serves as the authoritative GOAP plan for building the Explainable Agent Behavior Visualization System. Updates should be tracked through version control with clear change logs.*
