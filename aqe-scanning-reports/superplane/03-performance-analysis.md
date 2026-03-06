# Superplane Performance Analysis Report

**Project**: Superplane - DevOps Control Plane for Event-Based Workflows
**Date**: 2026-03-06
**Scope**: Go monolith backend (`pkg/`), 197 SQL migrations (`db/migrations/`), React frontend (`web_src/`)

---

## Executive Summary

Superplane is a well-structured Go monolith with a polling-based workflow execution engine backed by PostgreSQL. The architecture is fundamentally sound, with proper use of `SELECT ... FOR UPDATE SKIP LOCKED` for distributed worker coordination and semaphore-based concurrency control. However, the analysis identified **8 critical**, **11 high**, and **6 medium** performance findings across database, concurrency, API, workflow engine, integration, frontend, and observability layers.

The most impactful findings are: (1) the polling-based worker loop architecture that adds 0-1s latency per execution stage, (2) unbounded `ListPendingNodeExecutions()` queries that will degrade at scale, (3) missing database indexes on high-traffic query paths, and (4) a global singleton database connection with no per-request timeout enforcement.

---

## 1. Database Performance

### 1.1 Connection Pooling

**File**: `pkg/database/connection.go`

**CRITICAL: Global singleton without connection lifetime management**

```go
sqlDB.SetMaxOpenConns(dbPoolSize())   // default: 5
sqlDB.SetMaxIdleConns(dbPoolSize())   // default: 5
sqlDB.SetConnMaxIdleTime(30 * time.Minute)
// Missing: SetConnMaxLifetime() is never called
```

Findings:
- **Default pool size of 5 is critically small** for a system running 8+ concurrent workers (EventRouter, NodeExecutor, NodeQueueWorker, NodeRequestWorker, IntegrationRequestWorker, WebhookProvisioner, CanvasCleanupWorker, WebhookCleanupWorker) plus API server threads. Each worker uses semaphores allowing 25 concurrent goroutines, meaning up to 200+ goroutines may compete for 5 database connections.
- **`SetConnMaxLifetime` is never called**, meaning connections are never recycled. This causes problems with load balancers, PgBouncer, or when PostgreSQL restarts -- stale connections accumulate and fail silently.
- **No per-request query timeout**. The GORM logger has a `SlowThreshold` of 200ms for logging, but there is no enforced query timeout via `context.WithTimeout`. A slow query will hold a connection indefinitely.
- **`Conn()` uses a global singleton with no synchronization guard** (`if dbInstance == nil`). While Go's init ordering makes this unlikely to race in practice, the pattern is fragile for test scenarios.

**Recommendation**: Increase default pool to 20-25, add `SetConnMaxLifetime(5 * time.Minute)`, and wrap all database operations with context deadlines.

### 1.2 Missing Database Indexes

**Files**: `db/migrations/*.up.sql`, `pkg/models/*.go`

**CRITICAL: Several high-frequency query patterns lack covering indexes**

Analysis of the 97 migrations against model query patterns reveals these gaps:

| Query Pattern | Model Function | Missing Index |
|---|---|---|
| `workflow_events.state = 'pending' JOIN workflows.deleted_at IS NULL` | `ListPendingCanvasEvents()` | Partial index: `WHERE state = 'pending'` on `workflow_events` |
| `workflow_node_executions.state = 'pending' ORDER BY created_at DESC` | `ListPendingNodeExecutions()` | Partial index: `WHERE state = 'pending'` on `workflow_node_executions` |
| `workflow_node_queue_items(workflow_id, node_id)` | `FirstQueueItem()` with `ORDER BY created_at ASC` | Composite index `(workflow_id, node_id, created_at ASC)` |
| `workflow_nodes.state + type + JOIN queue_items + JOIN workflows` | `ListCanvasNodesReady()` | Composite index `(state, type)` on `workflow_nodes` |
| `workflow_events(workflow_id, node_id, created_at DESC)` with `execution_id IS NULL` | `ListRootCanvasEvents()` | Partial index with `WHERE execution_id IS NULL` |
| `workflow_node_execution_requests.state = 'pending' AND run_at <= now()` | `ListNodeRequests()` | Already has partial index (good) |

The `ListPendingCanvasEvents()` function performs a JOIN between `workflow_events` and `workflows` filtering on `state = 'pending'` and `deleted_at IS NULL`. While `idx_workflow_events_state` exists, there is no composite index that covers the join condition efficiently. At scale with millions of events, this becomes a sequential scan bottleneck.

**HIGH: `ListPendingNodeExecutions()` returns all pending executions without LIMIT**

```go
func ListPendingNodeExecutions() ([]CanvasNodeExecution, error) {
    var executions []CanvasNodeExecution
    query := database.Conn().
        Where("state = ?", CanvasNodeExecutionStatePending).
        Order("created_at DESC")
    err := query.Find(&executions).Error  // No LIMIT!
    ...
}
```

This fetches ALL pending executions every 1-second tick. Under load with hundreds of pending executions, this wastes memory and network bandwidth. The semaphore limits processing to 25 concurrent, but all rows are still fetched.

**Recommendation**: Add `LIMIT 100` (or configurable batch size) and add partial indexes for `WHERE state = 'pending'` conditions on frequently polled tables.

### 1.3 N+1 Query Patterns

**HIGH: EventRouter.processRootEvent() performs per-edge database lookups**

```go
// pkg/workers/event_router.go:160-164
for _, edge := range outgoingEdges {
    targetNode, err := models.FindCanvasNode(tx, canvas.ID, edge.TargetID)  // N queries
    ...
}
```

For a canvas with many outgoing edges from a single node, this issues N separate `SELECT` queries. Should batch-fetch all target nodes with `FindCanvasNodesByIDs()`.

**HIGH: Serialization layer makes 4 parallel queries per execution list request**

```go
// pkg/grpc/actions/canvases/list_node_executions.go:100-133
wg.Add(4)
go func() { rootEvents, rootEventsErr = models.FindCanvasEvents(rootEventIDs(executions)) }()
go func() { inputEvents, inputEventsErr = models.FindCanvasEvents(eventIDs(executions)) }()
go func() { outputEvents, outputEventsErr = models.FindCanvasEventsForExecutions(executionIDs(executions)) }()
go func() { cancelledByUsers, cancelledByUsersErr = models.FindMaybeDeletedUsersByIDs(cancelledByIDs(executions)) }()
```

This is actually well-designed -- batch queries in parallel. However, `rootEventIDs()` and `eventIDs()` may contain heavy overlap (same events), leading to redundant data fetches. De-duplicating the ID sets before querying would reduce database load.

**MEDIUM: `RoutedInTransaction` saves the entire event record**

```go
func (e *CanvasEvent) RoutedInTransaction(tx *gorm.DB) error {
    e.State = CanvasEventStateRouted
    return tx.Save(e).Error  // Updates ALL columns
}
```

`tx.Save()` generates `UPDATE ... SET` for every column. Should use `tx.Model(e).Update("state", CanvasEventStateRouted)` to only update the state column.

---

## 2. Concurrency

### 2.1 Worker Pool Design

**All 8 workers use the same pattern**: ticker-based polling at 1s intervals with `semaphore.NewWeighted(25)`.

**HIGH: Hardcoded semaphore size of 25 across all workers**

Every worker (NodeExecutor, NodeQueueWorker, EventRouter, NodeRequestWorker, IntegrationRequestWorker, WebhookProvisioner) uses `semaphore.NewWeighted(25)`. These are not configurable via environment variables. For high-throughput deployments, 25 concurrent operations per worker may be insufficient, while for resource-constrained environments it may be too aggressive.

Combined with a DB pool of 5, this means up to 150 goroutines (6 workers x 25) competing for 5 connections. This creates severe connection starvation under load.

**MEDIUM: Polling interval of 1 second is not configurable**

```go
ticker := time.NewTicker(1 * time.Second)
```

All workers poll every 1 second. This adds up to 1 second of latency per workflow stage transition. For a 5-node workflow, this means up to 5 seconds of added latency from polling alone (event routing + queue processing + execution). The interval should be configurable and ideally replaced with a notification-based approach using PostgreSQL `LISTEN/NOTIFY` for latency-sensitive paths.

### 2.2 Lock Contention

**The `SKIP LOCKED` pattern is correctly used across all workers**:
- `LockCanvasNode()` -- NodeQueueWorker
- `LockCanvasEvent()` -- EventRouter
- `LockAndProcessNodeExecution()` -- NodeExecutor
- `LockNodeRequest()` -- NodeRequestWorker
- `LockWebhook()` -- WebhookProvisioner

This is a solid design choice. Workers skip locked records instead of waiting, preventing convoy effects. The only concern is that under heavy contention, items may be repeatedly skipped and starved, but the 1-second polling cycle mitigates this.

### 2.3 Transaction Scope

**HIGH: Long-running transactions in NodeExecutor.executeComponentNode()**

```go
func (w *NodeExecutor) LockAndProcessNodeExecution(id uuid.UUID) error {
    return database.Conn().Transaction(func(tx *gorm.DB) error {
        // Lock record
        // Execute component (may make external HTTP calls)
        // Save result
    })
}
```

The transaction wraps the entire component execution, including potential HTTP calls to external services (via `component.Execute(ctx)`). If an external service is slow (e.g., GitHub API, Slack), this holds a database transaction open for the duration. At 25 concurrent executions, this can exhaust the connection pool and cause cascading failures.

**Recommendation**: Split into two phases: (1) Lock and mark as "started" in a short transaction, (2) Execute component outside of a transaction, (3) Update result in a new transaction.

---

## 3. API Performance

### 3.1 HTTP Server Configuration

**File**: `pkg/public/server.go`

```go
s.httpServer = &http.Server{
    ReadTimeout:  5 * time.Second,
    WriteTimeout: 30 * time.Second,
    IdleTimeout:  60 * time.Second,
}
```

The timeout configuration is reasonable. The 15-second handler timeout (`timeoutHandlerTimeout`) is defined but its application across all routes was not verified.

### 3.2 Unbounded List Endpoints

**CRITICAL: `ListCanvases` has no pagination**

```go
// pkg/grpc/actions/canvases/list_canvases.go
func ListCanvases(...) (*pb.ListCanvasesResponse, error) {
    canvases, err := models.ListCanvases(organizationID, includeTemplates)
    // Returns ALL canvases for an organization with no limit/offset
}
```

For organizations with hundreds of canvases, this returns the entire dataset. The underlying query has no `LIMIT`:

```go
func ListCanvases(orgID string, includeTemplates bool) ([]Canvas, error) {
    err := query.Order("name ASC").Find(&canvases).Error  // No LIMIT
}
```

**HIGH: `ListDeletedCanvases` returns all soft-deleted canvases globally**

```go
func ListDeletedCanvases() ([]Canvas, error) {
    err := database.Conn().Unscoped().
        Where("deleted_at IS NOT NULL").
        Find(&canvases).Error  // ALL deleted canvases across ALL organizations
}
```

The CanvasCleanupWorker calls this every 30 seconds. Over time, if cleanup falls behind, this query returns an ever-growing result set.

### 3.3 Response Size Controls

- Webhook payloads are properly limited to 64KB (`MaxEventSize = 64 * 1024`)
- External HTTP responses are limited to 8MB (`DefaultMaxHTTPResponseBytes = 8 * 1024 * 1024`)
- The `LimitedReadCloser` in `pkg/registry/http.go` correctly enforces streaming size limits

### 3.4 WebSocket Security

**MEDIUM: WebSocket upgrade has no origin checking**

```go
upgrader: &websocket.Upgrader{
    CheckOrigin: func(r *http.Request) bool {
        return true  // TODO: implement origin checking
    },
}
```

While noted with a TODO, this allows cross-origin WebSocket connections, which is a CSRF vector.

---

## 4. Workflow Execution Engine

### 4.1 Execution Pipeline Architecture

The workflow execution follows a 3-stage pipeline, each stage polled at 1-second intervals:

```
Event Created -> EventRouter (polls pending events, creates queue items)
                     |
                     v  [0-1s polling delay]
Queue Item -> NodeQueueWorker (polls ready nodes with queue items, creates executions)
                     |
                     v  [0-1s polling delay]
Execution -> NodeExecutor (polls pending executions, runs component logic)
                     |
                     v  [0-1s polling delay]
Output Events -> EventRouter (routes to downstream nodes)
```

**CRITICAL: Cumulative polling latency of up to 3 seconds per node execution**

Each workflow node transition traverses 3 polling stages. For a linear 5-node workflow, the minimum latency from trigger to final output is approximately `5 * 3 = 15 seconds` from polling delays alone, regardless of actual processing time.

**Recommendation**: Implement push-based notification between workers using channels or PostgreSQL `LISTEN/NOTIFY` to reduce inter-stage latency to near-zero.

### 4.2 Execution Chain Depth

Blueprint nodes create child executions recursively. There is no depth limit on blueprint nesting. A deeply nested blueprint structure (Blueprint A contains Blueprint B contains Blueprint C...) creates deep execution chains with multiplicative polling delays.

### 4.3 Cleanup Worker Design

**The CanvasCleanupWorker is well-designed with batched deletion**:
- Limits to 500 resources per tick
- Uses batched `DELETE ... LIMIT` queries
- Processes nodes incrementally across multiple cycles
- Only hard-deletes after all child resources are removed

This prevents large delete operations from causing lock contention.

---

## 5. External Integration Performance

### 5.1 HTTP Client Configuration

**File**: `pkg/registry/http.go`

The centralized `HTTPContext` is well-configured:
- 30-second timeout
- HTTP/2 support enabled
- Connection pooling (100 max idle connections)
- SSRF protection (blocked hosts, private IP validation, DNS rebinding protection)
- Response size limits (8MB default)
- Redirect limit (10 hops)

### 5.2 Integration-Specific Clients

**HIGH: Several integrations create HTTP clients without timeouts**

| Integration | File | Issue |
|---|---|---|
| Discord | `pkg/integrations/discord/client.go:201` | Uses `http.DefaultClient.Do(req)` -- no timeout |
| Telegram | `pkg/integrations/telegram/client.go:208` | Uses `http.DefaultClient.Do(req)` -- no timeout |
| Slack | `pkg/integrations/slack/client.go:179` | Creates `&http.Client{}` -- no timeout |
| GitHub | `pkg/integrations/github/client.go:25` | Uses `http.DefaultTransport` -- no timeout on client |

These bypass the centralized `HTTPContext` and its timeout/SSRF protections. A hung external API call from these integrations will hold a database transaction open indefinitely (per the transaction scope issue in Section 2.3).

### 5.3 Retry Strategy

**File**: `pkg/retry/retry.go`

```go
func WithConstantWait(f func() error, options Options) error {
```

The retry utility uses **constant backoff** only. There is no exponential backoff or jitter. For external API calls that fail due to rate limiting, constant retry can make the problem worse.

### 5.4 Circuit Breakers

Only one integration (`pkg/integrations/aws/ecs/service.go`) references circuit breaker concepts. There is no global circuit breaker pattern. If an external service (e.g., GitHub, Slack) goes down, all workflows using that integration will fail with full retry cycles, potentially overwhelming the worker pool.

---

## 6. Frontend Performance

### 6.1 Bundle Architecture

**File**: `web_src/package.json`, `web_src/vite.config.ts`

**HIGH: No code splitting or lazy loading for routes**

```tsx
// web_src/src/App.tsx -- All page imports are static
import { Login } from "./pages/auth/Login";
import HomePage from "./pages/home";
import { WorkflowPageV2 } from "./pages/workflowv2";
import { OrganizationSettings } from "./pages/organization/settings";
// ... all loaded eagerly
```

All page components are imported statically at the top of `App.tsx`. For 649 TypeScript/TSX files with heavy dependencies (Monaco Editor, XYFlow/ReactFlow, ELK layout engine), this creates a single large bundle.

Key heavy dependencies:
- `@monaco-editor/react` -- ~2MB+ (code editor)
- `@xyflow/react` + `elkjs` -- ~500KB (graph rendering)
- `react-diff-view` -- ~200KB (diff viewer)
- `@tabler/icons-react` -- ~300KB (icon library, depends on tree-shaking)

**Recommendation**: Use `React.lazy()` and `Suspense` for route-level code splitting. At minimum, lazy-load `WorkflowPageV2` (the canvas editor with Monaco + XYFlow) and `OrganizationSettings`.

### 6.2 React Query Configuration

```tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000,  // 5 minutes
      gcTime: 10 * 60 * 1000,    // 10 minutes
    },
  },
});
```

This is well-configured. The 5-minute stale time prevents excessive re-fetching, and the garbage collection time is reasonable.

### 6.3 Build Configuration

- **Vite 6.4** with React plugin (good)
- Target is `es2020` (acceptable browser coverage)
- Source maps disabled in production (good)
- No explicit manual chunk splitting configured (rollupOptions is commented out)

---

## 7. Observability

### 7.1 OpenTelemetry Setup

**File**: `pkg/telemetry/metrics.go`, `pkg/telemetry/periodic.go`

**Metrics coverage is good for worker health**:
- `queue_worker.tick.duration.seconds`
- `queue_worker.tick.nodes.ready`
- `executor_worker.tick.duration.seconds`
- `executor_worker.tick.nodes.pending`
- `event_worker.tick.duration.seconds`
- `event_worker.tick.events.pending`
- `node_request_worker.tick.duration.seconds`
- `db.locks.count`
- `db.long_queries.count`
- `queue_items.stuck.count`

**MEDIUM: No distributed tracing**

```go
// pkg/telemetry/sentry.go
err := sentry.Init(sentry.ClientOptions{
    EnableTracing: false,  // Tracing explicitly disabled
})
```

Sentry tracing is explicitly disabled. The OTel setup only exports metrics, not traces. For a workflow engine where a single event traverses multiple workers and external services, distributed tracing is essential for debugging latency.

**MEDIUM: OTel collector only exports to debug**

```yaml
# otel-collector-config.dev.yaml
exporters:
  debug:
    verbosity: basic
```

The dev configuration only exports to debug/stdout. While this is appropriate for development, there is no production configuration file visible for exporting to Prometheus/Grafana/Datadog.

### 7.2 Periodic Health Reporting

The `Periodic` reporter (every 60 seconds) monitors:
- Database lock count (via `pg_locks`)
- Long-running queries (> 1 minute via `pg_stat_activity`)
- Stuck queue items (nodes with queue items but no active executions)

This is a solid operational health check. The stuck queue items query is particularly valuable for detecting workflow stalls.

### 7.3 Missing Metrics

- **No HTTP request latency/throughput metrics** for the public API
- **No per-integration latency metrics** for external service calls
- **No queue depth metrics** (total pending events, total pending executions)
- **No error rate metrics** per worker or per integration
- **No database connection pool utilization metrics**

---

## Findings Summary

| ID | Severity | Category | Finding |
|---|---|---|---|
| PERF-01 | CRITICAL | Database | DB pool size default of 5 with 200+ potential goroutines |
| PERF-02 | CRITICAL | Database | `SetConnMaxLifetime` never called -- stale connections |
| PERF-03 | CRITICAL | Database | Missing partial indexes on `state = 'pending'` columns |
| PERF-04 | CRITICAL | Database | `ListPendingNodeExecutions()` has no LIMIT clause |
| PERF-05 | CRITICAL | API | `ListCanvases` returns unbounded results (no pagination) |
| PERF-06 | CRITICAL | API | `ListDeletedCanvases` queries all deleted canvases globally |
| PERF-07 | CRITICAL | Engine | Polling architecture adds 0-3s latency per workflow stage |
| PERF-08 | CRITICAL | Concurrency | Component execution holds DB transaction open during HTTP calls |
| PERF-09 | HIGH | Concurrency | Hardcoded semaphore size (25) not configurable |
| PERF-10 | HIGH | Concurrency | 1-second polling interval not configurable |
| PERF-11 | HIGH | Database | N+1 queries in EventRouter.processRootEvent() |
| PERF-12 | HIGH | Database | `tx.Save()` updates all columns instead of targeted updates |
| PERF-13 | HIGH | Integration | Discord/Telegram/Slack/GitHub clients bypass timeout controls |
| PERF-14 | HIGH | Integration | No circuit breaker for external service failures |
| PERF-15 | HIGH | Integration | Constant-only retry (no exponential backoff/jitter) |
| PERF-16 | HIGH | Frontend | No route-level code splitting (all 649 files in single bundle) |
| PERF-17 | HIGH | Frontend | Heavy deps (Monaco, XYFlow, ELK) loaded eagerly |
| PERF-18 | HIGH | Database | Redundant event ID fetches in execution serialization |
| PERF-19 | HIGH | Database | Missing composite index on queue items `(workflow_id, node_id, created_at)` |
| PERF-20 | MEDIUM | Observability | Distributed tracing disabled (Sentry `EnableTracing: false`) |
| PERF-21 | MEDIUM | Observability | No HTTP request latency metrics for public API |
| PERF-22 | MEDIUM | Observability | No per-integration latency or error rate metrics |
| PERF-23 | MEDIUM | API | WebSocket `CheckOrigin` allows all origins |
| PERF-24 | MEDIUM | Engine | No depth limit on nested blueprint execution chains |
| PERF-25 | MEDIUM | Observability | No database connection pool utilization metrics |

---

## Priority Recommendations

### Immediate (P0 -- This Sprint)

1. **Increase DB pool size** to 20-25 and add `SetConnMaxLifetime(5 * time.Minute)` in `pkg/database/connection.go`
2. **Add LIMIT to all polling queries**: `ListPendingNodeExecutions()`, `ListPendingCanvasEvents()`, `ListDeletedCanvases()`
3. **Add partial indexes** for `workflow_node_executions WHERE state = 'pending'` and `workflow_events WHERE state = 'pending'`
4. **Split transaction scope** in `NodeExecutor.LockAndProcessNodeExecution()` so external HTTP calls happen outside the transaction

### Short-term (P1 -- Next 2 Sprints)

5. **Make worker parameters configurable** via environment variables (semaphore size, polling interval, batch size)
6. **Add timeout to integration HTTP clients** (Discord, Telegram, Slack, GitHub) or route them through the centralized `HTTPContext`
7. **Implement route-level code splitting** in the React frontend with `React.lazy()`
8. **Add pagination** to `ListCanvases` gRPC endpoint
9. **Batch-fetch target nodes** in `EventRouter.processRootEvent()` instead of per-edge queries
10. **Add exponential backoff with jitter** to the retry utility

### Medium-term (P2 -- Next Quarter)

11. **Replace polling with push-based notification** using PostgreSQL `LISTEN/NOTIFY` or Redis pub/sub for inter-worker communication
12. **Enable distributed tracing** via OpenTelemetry traces across worker pipelines
13. **Add HTTP request metrics** (latency histograms, error counters) to the public API server
14. **Implement circuit breakers** for external integration calls
15. **Add connection pool metrics** to the periodic telemetry reporter

---

## Appendix: Architecture Strengths

The analysis also identified several architectural strengths worth preserving:

- **`SELECT ... FOR UPDATE SKIP LOCKED`**: Excellent distributed worker coordination pattern that avoids lock contention
- **Semaphore-based concurrency limiting**: Prevents worker goroutine explosion
- **Centralized HTTP client** (`pkg/registry/http.go`): Comprehensive SSRF protection, response size limits, DNS rebinding defense
- **Batched cleanup worker**: The CanvasCleanupWorker's incremental deletion strategy is production-grade
- **Parallel serialization queries**: The `list_node_executions.go` parallel WaitGroup pattern for fetching associated data is efficient
- **RabbitMQ for event distribution**: The EventDistributer correctly uses per-replica queue names for fan-out to WebSocket connections
- **Webhook body size limits**: Proper use of `http.MaxBytesReader` in webhook handling
- **React Query caching**: Well-configured stale/GC times that prevent excessive API calls
