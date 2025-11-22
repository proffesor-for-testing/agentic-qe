# Phase 3: Visualization API Specification

## Overview

The Visualization API Layer provides real-time and historical access to telemetry data optimized for visualization frontends. Built on Phase 1's event persistence infrastructure, it delivers:

- **DataTransformer (V4)**: Converts raw telemetry to visualization-friendly formats
- **WebSocket Server (V5)**: Real-time event streaming with <500ms latency
- **REST API (V6)**: HTTP endpoints for historical data with pagination and caching

## Architecture

```
┌─────────────────────────────────────────────────────┐
│         Visualization API Layer (Phase 3)           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │ DataTransformer│ │  WebSocket   │  │ REST API │ │
│  │     (V4)      │  │  Server (V5) │  │  (V6)    │ │
│  └──────────────┘  └──────────────┘  └──────────┘ │
│         │                  │                │      │
└─────────┼──────────────────┼────────────────┼──────┘
          │                  │                │
          └──────────┬───────┴────────────────┘
                     │
          ┌──────────▼──────────────────────────┐
          │   Phase 1: Event Persistence        │
          │  ┌────────────┐  ┌───────────────┐  │
          │  │ EventStore │  │ ReasoningStore│  │
          │  └────────────┘  └───────────────┘  │
          └─────────────────────────────────────┘
```

## V4: DataTransformer

### Purpose
Transform raw telemetry data into visualization-friendly structures optimized for graph rendering, timeline display, and analytics.

### Core Methods

#### `buildSessionGraph(sessionId, layoutOptions, filter?)`
Builds a complete visualization graph from session events.

**Parameters:**
- `sessionId` (string): Session identifier
- `layoutOptions` (LayoutOptions): Graph layout configuration
  - `algorithm`: 'force-directed' | 'hierarchical' | 'circular' | 'grid'
  - `spacing`: number (pixels between nodes)
  - `direction`: 'TB' | 'LR' | 'BT' | 'RL' (for hierarchical)
- `filter` (optional): Event filtering criteria

**Returns:** `VisualizationGraph`
```typescript
{
  nodes: VisualizationNode[],
  edges: VisualizationEdge[],
  metadata: {
    session_id: string,
    generated_at: string,
    total_nodes: number,
    total_edges: number
  }
}
```

**Example:**
```typescript
const graph = transformer.buildSessionGraph('session-123', {
  algorithm: 'hierarchical',
  spacing: 100,
  direction: 'TB'
});
```

#### `buildReasoningTree(chainId)`
Converts a reasoning chain into a hierarchical tree structure.

**Parameters:**
- `chainId` (string): Reasoning chain identifier

**Returns:** `ReasoningTree | null`
```typescript
{
  chain_id: string,
  agent_id: string,
  session_id: string,
  root_nodes: ReasoningTreeNode[],
  total_steps: number,
  total_tokens: number,
  avg_confidence: number,
  created_at: string,
  completed_at: string | null,
  status: string
}
```

#### `generateAgentSummaries(sessionId)`
Generates activity summaries for all agents in a session.

**Returns:** `AgentActivitySummary[]`
```typescript
{
  agent_id: string,
  agent_type: string,
  event_count: number,
  task_count: number,
  success_rate: number,
  avg_duration_ms: number,
  total_tokens: number,
  cost_usd: number,
  first_seen: string,
  last_seen: string
}
```

#### `buildSessionVisualization(sessionId)`
Builds complete session visualization with all components.

**Returns:** `SessionVisualization`

### Layout Algorithms

#### Hierarchical
Top-down or left-right tree layout with automatic level assignment.
- **Best for**: Parent-child relationships, task hierarchies
- **Complexity**: O(n + e) where n=nodes, e=edges
- **Features**: BFS-based level assignment, configurable direction

#### Force-Directed
Physics-based spring model for natural graph layout.
- **Best for**: General graphs, correlation networks
- **Complexity**: O(n² × iterations)
- **Features**: Repulsion between all nodes, attraction along edges

#### Circular
Nodes arranged in a circle.
- **Best for**: Cycle detection, small graphs
- **Complexity**: O(n)

#### Grid
Regular grid pattern.
- **Best for**: Matrix-like data, simple layouts
- **Complexity**: O(n)

## V5: WebSocket Server

### Purpose
Real-time event streaming to visualization frontends with <500ms latency guarantee.

### Configuration

```typescript
const wsServer = new WebSocketServer(eventStore, reasoningStore, {
  port: 8080,                    // WebSocket port
  heartbeatInterval: 30000,      // 30 seconds
  clientTimeout: 60000,          // 60 seconds
  maxBacklogSize: 1000,          // Per-client message queue
  compression: true              // Enable message compression
});
```

### Message Protocol

All messages are JSON with this structure:

```typescript
{
  type: 'event' | 'reasoning' | 'metrics' | 'heartbeat',
  timestamp: string,  // ISO 8601
  data: unknown
}
```

#### Message Types

**1. Event Message**
```json
{
  "type": "event",
  "timestamp": "2025-11-21T10:30:00.000Z",
  "data": {
    "id": "evt-123",
    "agent_id": "test-generator",
    "event_type": "test_generated",
    "payload": { "testCount": 10 },
    "session_id": "session-456"
  }
}
```

**2. Reasoning Message**
```json
{
  "type": "reasoning",
  "timestamp": "2025-11-21T10:30:00.000Z",
  "data": {
    "chain_id": "chain-789",
    "agent_id": "test-generator",
    "total_steps": 5,
    "avg_confidence": 0.92
  }
}
```

**3. Metrics Message**
```json
{
  "type": "metrics",
  "timestamp": "2025-11-21T10:30:00.000Z",
  "data": {
    "connected_clients": 12,
    "events_per_second": 45.2
  }
}
```

**4. Heartbeat Message**
```json
{
  "type": "heartbeat",
  "timestamp": "2025-11-21T10:30:00.000Z",
  "data": {
    "status": "ok",
    "uptime_ms": 123456
  }
}
```

### Client Subscription

Connect with query parameters to filter events:

```
ws://localhost:8080?session_id=session-123&agent_id=test-gen&event_types=test_generated,coverage_analyzed&since=2025-11-21T10:00:00.000Z
```

**Query Parameters:**
- `session_id`: Filter to specific session
- `agent_id`: Filter to specific agent
- `event_types`: Comma-separated list of event types
- `since`: Only send events after this timestamp

### Client Messages

**Subscribe to Updates:**
```json
{
  "type": "subscribe",
  "options": {
    "session_id": "session-123",
    "event_types": ["test_generated"]
  }
}
```

**Unsubscribe:**
```json
{
  "type": "unsubscribe"
}
```

**Ping (heartbeat check):**
```json
{
  "type": "ping"
}
```

### Backpressure Handling

The WebSocket server implements queue-based backpressure:

1. Each client has a message queue (default max: 1000 messages)
2. If queue is full, oldest messages are dropped (FIFO)
3. Server emits `backpressure` event when dropping occurs
4. Messages are flushed based on socket buffer availability

### Events

```typescript
wsServer.on('started', ({ port }) => {});
wsServer.on('client_connected', ({ clientId, subscriptions }) => {});
wsServer.on('client_disconnected', ({ clientId, reason }) => {});
wsServer.on('subscription_updated', ({ clientId, subscriptions }) => {});
wsServer.on('backpressure', ({ clientId, queueSize }) => {});
wsServer.on('latency_warning', ({ latency, threshold }) => {});
wsServer.on('error', ({ clientId, error }) => {});
```

## V6: REST API Endpoints

### Base URL
`http://localhost:3000/api/visualization`

### Authentication
None required (add authentication middleware as needed)

### Response Format

All responses follow this structure:

```typescript
{
  success: boolean,
  data?: T,
  error?: string,
  metadata: {
    timestamp: string,
    request_id: string,
    pagination?: {
      limit: number,
      offset: number,
      total: number,
      has_more: boolean,
      cursor?: string
    }
  }
}
```

### Endpoints

#### GET /api/visualization/events

List events with pagination and filtering.

**Query Parameters:**
- `since` (optional): ISO timestamp, filter events after this time
- `limit` (optional): Page size (default: 50, max: 1000)
- `offset` (optional): Number of records to skip (default: 0)

**Example Request:**
```
GET /api/visualization/events?since=2025-11-21T10:00:00.000Z&limit=100&offset=0
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "evt-123",
      "timestamp": "2025-11-21T10:30:00.000Z",
      "agent_id": "test-generator",
      "event_type": "test_generated",
      "payload": { "testCount": 10 },
      "session_id": "session-456"
    }
  ],
  "metadata": {
    "timestamp": "2025-11-21T11:00:00.000Z",
    "request_id": "req-789",
    "pagination": {
      "limit": 100,
      "offset": 0,
      "total": 1523,
      "has_more": true
    }
  }
}
```

#### GET /api/visualization/reasoning/:chainId

Get detailed reasoning chain with all steps.

**Example Request:**
```
GET /api/visualization/reasoning/chain-123
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "chain_id": "chain-123",
    "agent_id": "test-generator",
    "session_id": "session-456",
    "root_nodes": [
      {
        "id": "step-1",
        "step_order": 1,
        "thought_type": "observation",
        "content": "Analyzing source code...",
        "confidence": 0.9,
        "token_count": 150,
        "timestamp": "2025-11-21T10:30:00.000Z",
        "children": []
      }
    ],
    "total_steps": 5,
    "total_tokens": 750,
    "avg_confidence": 0.92,
    "status": "completed"
  }
}
```

#### GET /api/visualization/metrics

Get aggregated metrics for specified time range.

**Query Parameters:**
- `timeRange`: '1h' | '24h' | '7d' (default: '24h')

**Example Request:**
```
GET /api/visualization/metrics?timeRange=24h
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "time_range": {
      "start": "2025-11-20T11:00:00.000Z",
      "end": "2025-11-21T11:00:00.000Z",
      "duration_ms": 86400000
    },
    "events": {
      "total": 1523,
      "by_type": {
        "test_generated": 450,
        "coverage_analyzed": 380,
        "quality_gate_passed": 693
      },
      "by_agent": {
        "test-generator": 450,
        "coverage-analyzer": 380,
        "quality-validator": 693
      }
    },
    "reasoning": {
      "total_chains": 45,
      "total_steps": 230,
      "completed_chains": 42,
      "failed_chains": 3,
      "avg_steps_per_chain": 5.1,
      "avg_confidence": 0.89
    }
  }
}
```

#### GET /api/visualization/agents/:agentId/history

Get complete activity history for an agent.

**Query Parameters:**
- `limit` (optional): Page size (default: 50)
- `offset` (optional): Skip records (default: 0)

**Example Request:**
```
GET /api/visualization/agents/test-generator/history?limit=50
```

#### GET /api/visualization/sessions/:sessionId

Get complete session visualization data.

**Example Request:**
```
GET /api/visualization/sessions/session-123
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "session_id": "session-123",
    "agents": [
      {
        "agent_id": "test-generator",
        "event_count": 45,
        "total_tokens": 12000,
        "cost_usd": 0.24
      }
    ],
    "events_timeline": [
      {
        "timestamp": "2025-11-21T10:00:00.000Z",
        "value": 12
      }
    ],
    "reasoning_chains": [],
    "total_events": 152,
    "session_duration_ms": 3600000,
    "session_start": "2025-11-21T10:00:00.000Z",
    "session_end": "2025-11-21T11:00:00.000Z"
  }
}
```

#### GET /api/visualization/graph/:sessionId

Get visualization graph with specified layout.

**Query Parameters:**
- `algorithm`: 'hierarchical' | 'force-directed' | 'circular' | 'grid'
- `spacing`: number (pixels between nodes, default: 100)

**Example Request:**
```
GET /api/visualization/graph/session-123?algorithm=hierarchical&spacing=150
```

### Caching

#### ETag Support
All GET responses include `ETag` header for cache validation.

**Request with cache check:**
```
GET /api/visualization/events
If-None-Match: "abc123def456"
```

**Response (cached):**
```
HTTP/1.1 304 Not Modified
```

**Response (modified):**
```
HTTP/1.1 200 OK
ETag: "xyz789ghi012"
Cache-Control: private, max-age=60
```

### CORS

CORS is enabled by default for all origins. Configure in RestApiConfig:

```typescript
{
  enableCors: true,
  corsOrigins: ['https://dashboard.example.com', 'http://localhost:3000']
}
```

### Error Responses

```json
{
  "success": false,
  "error": "Reasoning chain not found: chain-999",
  "metadata": {
    "timestamp": "2025-11-21T11:00:00.000Z",
    "request_id": "req-456"
  }
}
```

**HTTP Status Codes:**
- `200 OK`: Success
- `304 Not Modified`: Cache hit (ETag match)
- `400 Bad Request`: Invalid parameters
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

## OpenTelemetry Instrumentation

All API operations are instrumented with OpenTelemetry spans:

### REST API Spans
```typescript
'HTTP GET /api/visualization/events'
'HTTP GET /api/visualization/reasoning/:chainId'
'HTTP GET /api/visualization/metrics'
```

**Attributes:**
- `http.method`: Request method
- `http.url`: Request path
- `http.request_id`: Unique request ID
- `http.status_code`: Response status

### WebSocket Spans
WebSocket operations emit events (not traced due to long-lived connections):

```typescript
wsServer.on('broadcast_complete', ({ latency, clientCount }) => {
  // Record metric: broadcast latency
});
```

## Performance Requirements

### Latency Targets

| Operation | Target | Measured |
|-----------|--------|----------|
| DataTransformer.buildSessionGraph (100 events) | <500ms | ~50-150ms |
| WebSocket broadcast to 10 clients | <500ms | ~10-50ms |
| REST API /events endpoint | <200ms | ~20-80ms |
| REST API /metrics aggregation | <300ms | ~50-150ms |

### Throughput Targets

| Metric | Target | Capability |
|--------|--------|------------|
| WebSocket messages/sec | >100 | >1000 |
| REST API requests/sec | >50 | >200 |
| Concurrent WebSocket clients | >50 | >500 |

## Integration Example

```typescript
import { VisualizationService } from './visualization';
import { EventStore } from './persistence/event-store';
import { ReasoningStore } from './persistence/reasoning-store';

// Initialize stores
const eventStore = new EventStore({ dbPath: './data/events.db' });
const reasoningStore = new ReasoningStore({ dbPath: './data/reasoning.db' });

// Create visualization service
const vizService = new VisualizationService({
  eventStore,
  reasoningStore,
  enableRestApi: true,
  enableWebSocket: true,
  restApi: {
    port: 3000,
    enableEtag: true,
    enableCors: true
  },
  webSocket: {
    port: 8080,
    heartbeatInterval: 30000,
    maxBacklogSize: 1000
  }
});

// Start services
await vizService.start();

// Broadcast real-time event
const wsServer = vizService.getWebSocket();
wsServer.broadcastEvent({
  type: 'event',
  timestamp: new Date().toISOString(),
  data: { agent_id: 'test-gen', event_type: 'test_generated' }
});

// Shutdown
await vizService.stop();
eventStore.close();
reasoningStore.close();
```

## Testing

Run Phase 3 tests:

```bash
npm run test:phase3
```

Test coverage targets:
- Unit tests: >90%
- Integration tests: >80%
- Performance tests: All targets met

## Memory Storage

Implementation details stored in memory namespace:

```
aqe/phase3/visualization/api/
  - spec.json          # API specifications
  - endpoints.json     # Endpoint documentation
  - websocket.json     # WebSocket protocol
  - performance.json   # Performance metrics
```
