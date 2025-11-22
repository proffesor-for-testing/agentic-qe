# Phase 3 Visualization Architecture - Executive Summary

**Document**: Complete architecture design for AQE Fleet visualization system
**Location**: `/workspaces/agentic-qe-cf/docs/implementation/phase3/VISUALIZATION-ARCHITECTURE.md`
**Status**: Design Complete - Ready for Implementation
**Date**: 2025-11-21

---

## Key Technology Decisions

### Backend Stack
- **Runtime**: Node.js 18.x LTS (existing project base)
- **Framework**: Express.js 4.x (mature, extensive middleware)
- **WebSocket**: ws 8.x (native protocol, 30KB footprint)
- **Database**: AgentDB (SQLite) - already integrated
- **Cache**: Node.js Map with LRU eviction (500 MB limit)
- **Validation**: AJV 8.x (JSON Schema validation)

### Frontend Stack
- **Framework**: React 18.x (virtual DOM, component reuse)
- **Build Tool**: Vite 5.x (fast HMR, optimized builds)
- **Graph Library**: Cytoscape.js 3.x (WebGL, 10,000+ nodes)
- **Charts**: Recharts 2.x (React-native, declarative)
- **Styling**: Tailwind CSS 3.x (utility-first, minimal bundle)
- **State**: React Query 5.x (server state) + React Context (UI state)

---

## API Contract Summary

### REST API Endpoints (V6)

**Metrics Endpoints**:
- `GET /api/v1/metrics/quality` - Quality gate metrics (coverage, defects, security)
- `GET /api/v1/metrics/performance` - Performance metrics (latency, throughput)
- `GET /api/v1/metrics/cost` - Token usage and cost tracking
- `GET /api/v1/metrics/timeseries` - Historical time series data

**Agent Endpoints**:
- `GET /api/v1/agents` - List all agents (with filters)
- `GET /api/v1/agents/:id` - Agent details and health
- `GET /api/v1/agents/:id/tasks` - Task history for agent

**Task Endpoints**:
- `GET /api/v1/tasks` - List all tasks (with filters)
- `GET /api/v1/tasks/:id` - Task details and results
- `GET /api/v1/tasks/:id/trace` - OpenTelemetry trace visualization

**Topology Endpoints**:
- `GET /api/v1/topology` - Fleet topology information
- `GET /api/v1/topology/graph` - Graph data for visualization
- `GET /api/v1/topology/coordination` - Coordination patterns

### WebSocket Protocol (V5)

**Client → Server**:
- `subscribe` - Subscribe to updates (fleet, agent, metrics, tasks)
- `unsubscribe` - Unsubscribe from channel
- `pong` - Heartbeat response

**Server → Client**:
- `update` - Real-time data update
- `ping` - Heartbeat (every 30s)
- `error` - Error notification

---

## Component Architecture

### Backend Components (V4, V5, V6)

**V4: Data Transformer**
- `TelemetryToVisualizationConverter` - Converts OpenTelemetry data to UI format
- `VisualizationCache` - In-memory LRU cache (500 MB, 5-min TTL)
- Methods: `convertTraceToAgentNode()`, `buildCoordinationGraph()`, `aggregateQualityMetrics()`

**V5: Real-time Streaming**
- `VisualizationWebSocketServer` - WebSocket server (1000 connections)
- `EventStream` - OpenTelemetry event listener and broadcaster
- `MessageQueue` - Buffer for WebSocket messages (10,000 capacity)

**V6: REST API**
- `MetricsController` - Quality, performance, cost endpoints
- `AgentsController` - Agent management endpoints
- `TasksController` - Task tracking endpoints
- `TopologyController` - Fleet topology endpoints
- `DataAccessLayer` - AgentDB and telemetry queries

### Frontend Components

**Core Views**:
- `Dashboard` - Overview with metrics cards and topology graph
- `AgentView` - Agent list and detail pages
- `TaskView` - Task list and trace visualization
- `MetricsView` - Time series charts and analytics
- `AnalyticsView` - Trend analysis and comparisons

**Key Components**:
- `TopologyMindMap` - Cytoscape.js graph (force-directed layout)
- `MetricsChart` - Recharts line/bar charts
- `AgentCard` - Agent status card (real-time updates)
- `TaskTable` - Task list with filtering
- `TraceVisualization` - Span waterfall diagram

---

## Performance Targets

### Latency Requirements
- **Real-time WebSocket update**: <100ms (target), 200ms (max)
- **Graph rendering (100 nodes)**: <100ms (target), 300ms (max)
- **Graph rendering (1000 nodes)**: <500ms (target), 1000ms (max)
- **API response (cached)**: <50ms (target), 100ms (max)
- **API response (uncached)**: <200ms (target), 500ms (max)
- **Initial page load**: <2s (target), 5s (max)

### Throughput Requirements
- **WebSocket connections**: 1000 concurrent (target), 2000 (max)
- **WebSocket messages/sec**: 1000 msg/s (target), 5000 msg/s (max)
- **API requests/min**: 1000 req/min (target), 5000 req/min (max)

### Resource Constraints
- **Backend memory**: 512 MB (runs alongside AQE Fleet)
- **Cache size**: 500 MB (in-memory LRU)
- **Frontend bundle**: <500 KB gzipped

---

## Data Flow Architecture

```
OpenTelemetry Traces/Metrics
           ↓
   TelemetryCollector
           ↓
   DataTransformer (V4)
           ↓
    ┌──────┴──────┐
    ↓             ↓
REST API (V6)   WebSocket (V5)
    ↓             ↓
    └──────┬──────┘
           ↓
    Frontend (React)
           ↓
    ┌──────┴──────┐
    ↓             ↓
React Query    WebSocket Client
(HTTP Cache)   (Real-time)
    ↓             ↓
    └──────┬──────┘
           ↓
     UI Components
```

---

## Architecture Decision Records

### ADR-001: WebSocket Library
- **Decision**: Use `ws` library
- **Rationale**: Pure WebSocket protocol, minimal overhead (30KB), 10,000+ connections
- **Trade-off**: No automatic fallback (acceptable for modern browsers)

### ADR-002: Graph Visualization
- **Decision**: Use Cytoscape.js
- **Rationale**: Purpose-built for graphs, WebGL renderer, 15+ layout algorithms
- **Trade-off**: Less flexible than D3.js (but specialized for our use case)

### ADR-003: State Management
- **Decision**: React Query (server state) + React Context (UI state)
- **Rationale**: React Query excels at server state, Context sufficient for UI
- **Trade-off**: Two approaches (but for different concerns)

### ADR-004: Deployment
- **Decision**: Start with embedded server, support separate process
- **Rationale**: MVP simplicity, future scalability option
- **Trade-off**: Initial resource contention (acceptable for MVP)

---

## Implementation Plan

| Task | Duration | Dependencies |
|------|----------|--------------|
| V4: Data Transformer | 1 week | Phase 2 complete |
| V5: WebSocket Server | 1 week | V4 complete |
| V6: REST API | 1 week | V4 complete |
| Frontend Setup | 3 days | - |
| TopologyMindMap Component | 1 week | V6 complete |
| Metrics Dashboard | 1 week | V6 complete |
| Real-time Integration | 1 week | V5, Frontend complete |
| Performance Testing | 1 week | All components |
| Security Audit | 3 days | All components |
| Documentation | 1 week | All components |

**Total Duration**: 6-8 weeks

---

## Success Criteria

**Functionality**:
- [ ] All REST API endpoints respond with correct data
- [ ] WebSocket handles 1000 concurrent connections
- [ ] Graph renders agent topology with real-time updates
- [ ] Metrics dashboard shows quality/performance/cost data
- [ ] Time series charts display historical trends

**Performance**:
- [ ] Graph renders 100 nodes in <100ms
- [ ] API responds in <200ms (uncached)
- [ ] WebSocket updates arrive in <100ms
- [ ] Initial page load completes in <2s
- [ ] All metrics meet targets (see Performance Targets above)

**Security**:
- [ ] All endpoints protected with JWT authentication
- [ ] RBAC enforced for sensitive operations
- [ ] Rate limiting prevents abuse (1000 req/min)
- [ ] Input validation prevents injection attacks

---

## Next Steps for Implementation Team

1. **Review Architecture Document**: Read full design at `/workspaces/agentic-qe-cf/docs/implementation/phase3/VISUALIZATION-ARCHITECTURE.md`

2. **Set Up Development Environment**:
   - Install dependencies: React, Vite, Cytoscape.js, Recharts, ws, Express
   - Configure TypeScript for both frontend and backend
   - Set up Tailwind CSS and build pipeline

3. **Backend Development** (Weeks 1-3):
   - Implement Data Transformer (V4)
   - Build WebSocket Server (V5)
   - Create REST API endpoints (V6)
   - Write unit tests for each component

4. **Frontend Development** (Weeks 2-5):
   - Set up React project with Vite
   - Create component hierarchy
   - Implement TopologyMindMap with Cytoscape.js
   - Build metrics dashboard with Recharts
   - Integrate React Query for state management

5. **Integration** (Week 6):
   - Connect frontend to backend APIs
   - Test real-time WebSocket updates
   - Verify data flow end-to-end

6. **Testing & Optimization** (Week 7):
   - Performance testing (load 1000 nodes, 1000 concurrent connections)
   - Security audit (penetration testing, OWASP compliance)
   - Fix any issues identified

7. **Documentation & Deployment** (Week 8):
   - Write user guide and API documentation
   - Create deployment guides (Docker, embedded)
   - Package for release

---

## Memory Namespace

All architectural decisions stored in: `aqe/phase3/visualization/architecture/*`

- `technology-stack` - Backend and frontend technology choices
- `api-endpoints` - REST API endpoint structure
- `performance-targets` - Latency, throughput, and resource limits
- `components` - Component architecture and data flow

---

**Architecture Design Complete**
Next: Begin V4 (Data Transformer) implementation
