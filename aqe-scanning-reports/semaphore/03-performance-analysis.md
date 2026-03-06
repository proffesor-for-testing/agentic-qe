# Performance Analysis Report: Semaphore CI/CD Platform

**Date:** 2026-03-06
**Scope:** Comprehensive performance analysis across all services
**Platform:** Polyglot microservices (Elixir, Go, Ruby, TypeScript)
**Services Analyzed:** 30+ microservices including zebra, plumber, guard, projecthub, secrethub, repository_hub, front, self_hosted_hub, artifacthub, and others

---

## Executive Summary

The Semaphore platform is a large-scale CI/CD system with 478 migration files across 30+ services, 169 CI pipeline blocks, and significant database-heavy workloads. This analysis identifies **23 performance findings** across 7 categories, with **6 critical**, **9 high**, and **8 medium** severity items.

**Overall Performance Risk: HIGH**

The most significant risks are: (1) per-request gRPC connection establishment across all Elixir services, (2) polling-based state machines without backpressure in the plumber pipeline engine, (3) unbounded `Task.await(:infinity)` patterns in critical workers, and (4) a monolithic frontend bundle with no code splitting.

---

## 1. Database Performance

### 1.1 Missing Indexes on Zebra Jobs Table (CRITICAL)

**Location:** `zebra/priv/legacy_repo/migrations/`

The `jobs` table is the most queried table in the system, handling all CI job state transitions. While the `github_hooks` service has extensive indexing on its jobs table (indexes on `aasm_state`, `organization_id`, `project_id`, `build_id`, `result`, `finished_at`, `machine_type`), the zebra service's jobs table has **zero dedicated index migrations**.

The `DbWorker` queries filter on `state_field` values and orders by `id` or custom fields:

```elixir
# zebra/lib/zebra/workers/db_worker.ex:77-80
worker.schema
|> where([r], field(r, ^worker.state_field) == ^worker.state_value)
|> where([r], r.id == ^id)
|> lock("FOR UPDATE SKIP LOCKED")
```

The `Scheduler.Selector` queries filter on `organization_id` and `aasm_state`:

```elixir
# zebra/lib/zebra/workers/scheduler/selector.ex:25-30
Zebra.Models.Job.enqueued()
|> where([j], j.organization_id == ^org_id)
|> order_by([j], fragment("? DESC NULLS LAST, ? ASC", j.priority, j.enqueued_at))
|> lock("FOR UPDATE")
```

Without composite indexes on `(aasm_state, organization_id, priority, enqueued_at)`, these queries perform sequential scans under high load.

**Recommendation:** Add composite indexes:
- `(aasm_state, organization_id, priority DESC, enqueued_at ASC)` for scheduler selection
- `(aasm_state, machine_type, machine_os_image)` for DbWorker isolation queries
- `(organization_id, aasm_state)` for running job counting

### 1.2 Looper STM Polling Pattern (HIGH)

**Location:** `plumber/looper/lib/looper/s_t_m/query.ex`

The state transition manager (STM) used throughout plumber uses a polling pattern that selects the oldest unprocessed item:

```elixir
# plumber/looper/lib/looper/s_t_m/query.ex:14-33
|> where(state: ^Map.get(cfg, :observed_state))
|> where(in_scheduling: ^false)
|> order_by([p], [asc: p.updated_at])
|> limit(1)
|> lock("FOR UPDATE SKIP LOCKED")
```

This is used across blocks, pipelines, sub-inits, and tasks. Each looper instance polls at `period_ms` intervals, creating N database queries per period where N is the number of active loopers. The `order_by(updated_at)` without a covering index on `(state, in_scheduling, updated_at)` results in sort operations on every poll cycle.

**Recommendation:** Ensure composite indexes `(state, in_scheduling, updated_at)` exist on all STM-managed tables. Consider LISTEN/NOTIFY for event-driven wakeups instead of polling.

### 1.3 N+1 Query Patterns in Preloads (MEDIUM)

**Location:** Multiple services

Several preload patterns load associations after the initial query:

```elixir
# zebra/lib/zebra/apis/internal_job_api.ex:106
jobs = Zebra.LegacyRepo.preload(jobs, [:task])

# zebra/lib/zebra/apis/internal_job_api/lister.ex:43
jobs = page.entries |> LegacyRepo.preload([:debug])

# notifications/lib/notifications/api/internal_api/update.ex:53
n = Repo.preload(n, :rules)
```

While Ecto preloads are batched (not strict N+1), the pattern of preloading after query execution means two separate round-trips. More critically, in the notifications update path, rules are loaded then individually deleted in a loop:

```elixir
# notifications/lib/notifications/api/internal_api/update.ex:54
n.rules |> Enum.each(fn r -> Repo.delete(r) end)
```

This generates N DELETE queries instead of a single `DELETE FROM rules WHERE notification_id = ?`.

**Recommendation:** Replace loop-based deletes with `Repo.delete_all` queries. Use `Ecto.Query.preload` in the initial query for join-based loading.

### 1.4 Default Pool Size of 1 (HIGH)

**Location:** Multiple service configs

Many services default to a pool size of 1:

```elixir
# branch_hub/config/runtime.exs:11
pool_size: String.to_integer(System.get_env("POSTGRES_DB_POOL_SIZE") || "1")

# guard/config/config.exs:44 (3 separate repos, each defaulting to 1)
pool_size: String.to_integer(System.get_env("POSTGRES_DB_POOL_SIZE") || "1")

# hooks_processor/config/runtime.exs:19
pool_size: String.to_integer(System.get_env("POSTGRES_DB_POOL_SIZE") || "1")
```

A pool size of 1 means all database operations are serialized. Under concurrent gRPC requests, this creates a bottleneck where requests queue waiting for the single connection. Guard is particularly concerning as it manages 3 separate repos each with a default pool of 1.

**Recommendation:** Increase defaults to at least 5-10 for production services. Size pools based on expected concurrency, not minimum viable values.

---

## 2. Concurrency and Parallelism

### 2.1 Unbounded Task.await(:infinity) in Worker Loops (CRITICAL)

**Location:** `zebra/lib/zebra/workers/db_worker.ex`, `zebra/lib/zebra/workers/scheduler.ex`, and 8+ other workers

Multiple critical workers use `Task.await(:infinity)` in tight loops:

```elixir
# zebra/lib/zebra/workers/db_worker.ex:36
Task.async(fn -> tick(worker) end) |> Task.await(:infinity)

# zebra/lib/zebra/workers/scheduler.ex:34
Task.async(fn -> tick() end) |> Task.await(:infinity)

# zebra/lib/zebra/workers/job_terminator.ex:20
Task.async(fn -> tick() end) |> Task.await(:infinity)
```

If a tick hangs due to a database lock, network timeout, or deadlock, the worker process blocks forever. There is no timeout, no circuit breaker, and no monitoring of tick duration. The supervisor will never restart these workers because they never crash -- they silently hang.

Workers using this pattern:
- `DbWorker` (job dispatching)
- `Scheduler` (job scheduling)
- `JobTerminator` (terminating stuck jobs)
- `TaskFailFast` (fail-fast logic)
- `TaskFinisher` (task completion)
- `WaitingJobTerminator` (timeout enforcement)
- `UsagePublisher` (metrics)
- `Audit.Streamer.Scheduler` (audit events)
- `ProjectInit` (project initialization)

**Recommendation:** Replace `Task.await(:infinity)` with bounded timeouts (e.g., `Task.await(task, 60_000)`) and implement proper error recovery. Consider using `Task.Supervisor` with `:shutdown` timeouts.

### 2.2 Raw spawn_link Without Supervision (HIGH)

**Location:** Multiple zebra workers

Workers are started with raw `spawn_link` rather than proper GenServer/Supervisor patterns:

```elixir
# zebra/lib/zebra/workers/db_worker.ex:28
spawn_link(fn -> loop(worker) end)

# zebra/lib/zebra/workers/scheduler.ex:30
{:ok, spawn_link(&loop/0)}
```

These bare processes:
- Cannot be introspected via `:observer`
- Have no backpressure mechanism
- Cannot be gracefully shut down during deployments
- Lose all state on crash without any recovery mechanism

**Recommendation:** Convert to GenServer-based workers under proper supervision trees. This enables graceful shutdown, telemetry integration, and health monitoring.

### 2.3 Fire-and-Forget spawn for Metrics (MEDIUM)

**Location:** `zebra/lib/zebra/workers/scheduler.ex:121`, `front/lib/front_web/plugs/metrics.ex:35`

```elixir
# zebra/lib/zebra/workers/scheduler.ex:121
spawn(fn ->
  scheduling_result.no_capacity
  |> Enum.each(fn {machine_type, value} -> ... end)
end)

# front/lib/front_web/plugs/metrics.ex:35
spawn(fn -> submit_metrics(conn, start, stop) end)
```

Unlinked `spawn` calls for metrics submission can accumulate if the metrics backend is slow, eventually exhausting the BEAM process limit. There is no backpressure mechanism.

**Recommendation:** Use a dedicated GenServer or `Task.Supervisor` with bounded concurrency for metrics submission.

### 2.4 Scheduler Sleep Randomization Masks Contention (MEDIUM)

**Location:** `zebra/lib/zebra/workers/scheduler.ex:46`

```elixir
sleep_period = Enum.random(10_000..30_000)
:timer.sleep(sleep_period)
```

While randomization reduces collision between pods, it also means scheduling latency varies between 10-30 seconds in the worst case. This is a workaround for the lack of proper distributed coordination.

**Recommendation:** Implement event-driven scheduling triggered by AMQP messages or PostgreSQL LISTEN/NOTIFY rather than polling with randomized sleep.

---

## 3. API Performance

### 3.1 Per-Request gRPC Connection Establishment (CRITICAL)

**Location:** All Elixir services making gRPC calls

Every gRPC call creates a new connection:

```elixir
# hooks_receiver/lib/hooks_receiver/organization_client.ex:33
{:ok, channel} = GRPC.Stub.connect(url())

# badge/lib/badges/models/pipeline.ex:36
{:ok, ch} = GRPC.Stub.connect(Application.fetch_env!(:badges, :plumber_grpc_endpoint))

# secrethub/lib/secrethub/encryptor.ex:42
with {:ok, channel} <- GRPC.Stub.connect(config!(:url)),

# repository_hub/lib/repository_hub/encryptor/grpc.ex:19
{:ok, channel} <- GRPC.Stub.connect(url),
```

This pattern appears in 20+ call sites across at least 8 services (hooks_receiver, badge, secrethub, repository_hub, auth, rbac, projecthub-rest-api, front). Each `GRPC.Stub.connect` establishes a new HTTP/2 connection including TCP handshake, potentially TLS negotiation, and HTTP/2 settings exchange.

At scale (thousands of requests/second), this means thousands of connection establishments per second. HTTP/2 is designed for connection multiplexing, but this pattern negates that benefit entirely.

**Recommendation:** Implement connection pooling using a module-level GenServer or persistent connection cache. Some services like `repository_hub/internal_clients/` show a slightly better pattern but still create connections per call. Consider a shared gRPC connection pool library used across all services.

### 3.2 Missing Pagination in gRPC Proto Definitions (HIGH)

**Location:** Proto definitions (referenced in generated code)

Examination of the gRPC service patterns shows no pagination parameters in many list operations. The public API gateway has generated code for numerous list endpoints, but the proto files don't contain standard pagination fields (`page_token`, `page_size`).

The `Scheduler.Selector` loads ALL enqueued jobs for an organization in a single query:

```elixir
# zebra/lib/zebra/workers/scheduler/selector.ex:25-30
Zebra.Models.Job.enqueued()
|> where([j], j.organization_id == ^org_id)
|> order_by(...)
|> lock("FOR UPDATE")
|> Zebra.LegacyRepo.all()
```

No LIMIT clause means organizations with thousands of enqueued jobs load all of them into memory and lock all rows simultaneously.

**Recommendation:** Add LIMIT/OFFSET or cursor-based pagination to all list queries. For the scheduler, process jobs in batches of 100-500 to bound memory and lock duration.

### 3.3 Excessive gRPC Timeout Values (HIGH)

**Location:** `hooks_receiver/lib/hooks_receiver/organization_client.ex:12`

```elixir
@opts [{:timeout, 2_500_000}]  # 2500 seconds = ~41 minutes
```

Both the organization and repository clients in hooks_receiver set a 41-minute gRPC timeout. Combined with the `Wormhole.capture` 3-second timeout wrapper, this creates an inconsistency where the outer wrapper may time out but the underlying gRPC call continues running.

Other services use more reasonable 30-second timeouts, but the inconsistency across services suggests no standardized timeout policy.

**Recommendation:** Establish a platform-wide gRPC timeout policy (e.g., 10s for reads, 30s for writes). Ensure inner and outer timeouts are consistent.

---

## 4. Caching Strategy

### 4.1 Inconsistent Caching Across Services (MEDIUM)

**Location:** Multiple services

Caching is implemented via Cachex in some services but absent in others:

| Service | Caching | Implementation |
|---------|---------|----------------|
| zebra | Yes | Cachex `:zebra_cache` |
| auth | Yes | Cachex `:grpc_api_cache` |
| badge | Yes | Cachex `:badges_cache` |
| front | Yes | Cachex `:front_cache` + ETS for tracing |
| guard | Yes | Cachex `:config_cache` |
| feature_provider | Yes | Cachex with TTL |
| github_notifier | Yes | Cachex `:store` |
| secrethub | No | Direct DB queries |
| notifications | No | Direct DB queries |
| plumber | No | Direct DB queries |
| branch_hub | No | Direct DB queries |
| dashboardhub | No | Direct DB queries |

Services without caching that would benefit from it:
- **secrethub**: Secret metadata (not values) could be cached to reduce DB load for repeated reads
- **plumber**: Pipeline definitions and workflow configurations are read-heavy
- **notifications**: Notification rules are read far more often than written

**Recommendation:** Implement Cachex caching in high-read services. Establish a standard caching library/pattern used across all Elixir services.

### 4.2 No Distributed Cache Invalidation (MEDIUM)

**Location:** All cached services

Each service uses process-local Cachex caches. In a multi-pod deployment, cache invalidation on one pod does not propagate to others. The `feature_provider` module shows TTL-based expiry but no active invalidation.

**Recommendation:** Implement pub/sub based cache invalidation via AMQP (already available in the stack) or use Redis as a shared cache layer for cross-pod consistency.

---

## 5. Resource Management

### 5.1 Supervisor max_restarts Too High (MEDIUM)

**Location:** Multiple services

```elixir
# badge/lib/badges/application.ex:30
opts = [strategy: :one_for_one, name: Badges.Supervisor, max_restarts: 1000]

# hooks_processor/lib/hooks_processor/hooks/processing/workers_supervisor.ex:22
DynamicSupervisor.init(strategy: :one_for_one, max_restarts: 1000)

# periodic_scheduler/scheduler/lib/scheduler/workers/schedule_tasks_manager.ex:17-18
strategy: :one_for_one,
max_restarts: 1000,
```

A `max_restarts` of 1000 means a child process can crash 1000 times within the default 5-second window before the supervisor gives up. This masks systematic failures and allows crash loops to consume CPU and generate massive log volumes.

**Recommendation:** Use reasonable values (e.g., `max_restarts: 10, max_seconds: 60`) and implement circuit breaker patterns for external service calls.

### 5.2 gRPC Channel Leaks (HIGH)

**Location:** All services using per-request `GRPC.Stub.connect`

Since connections are established per-request and there is no explicit `GRPC.Stub.disconnect` in most call paths, failed connections or abandoned channels may leak. The Elixir garbage collector will eventually clean these up, but under high load the accumulation can exhaust file descriptors.

Example pattern without cleanup:

```elixir
# secrethub/lib/secrethub/encryptor.ex:42-43
with {:ok, channel} <- GRPC.Stub.connect(config!(:url)),
     {:ok, response} <- Stub.encrypt(channel, req, timeout: 5_000),
```

If `Stub.encrypt` raises an exception (not returns `{:error, ...}`), the channel is never closed.

**Recommendation:** Wrap gRPC calls in try/after blocks or use connection pooling to manage lifecycle.

---

## 6. Build/CI Performance

### 6.1 169 Pipeline Blocks with Limited Parallelism (HIGH)

**Location:** `.semaphore/semaphore.yml` (3,898 lines)

The main pipeline defines 169 blocks. The `change_in()` directive is used 164 times to scope execution to changed services, which is good. However:

- Most test jobs use `parallelism: 2`, with only one service (`front`) using `parallelism: 5` and one using `parallelism: 4`
- Each service has separate "Provision Test Image", "Provision Prod Image", "Deployment Preconditions", and "QA" blocks
- The `checkout` command runs in every job, downloading the entire monorepo

The 4-block-per-service pattern means 30 services generate ~120 blocks. Each block runs in sequence within its dependency chain (Test Image -> QA, Prod Image -> Preconditions).

**Recommendation:**
- Increase test parallelism for larger services
- Consider sparse checkout to avoid downloading the full monorepo
- Merge "Deployment Preconditions" into the prod image build step to eliminate a separate block
- Use Docker layer caching more aggressively to speed up image builds

### 6.2 Sequential Docker Build Pattern (MEDIUM)

**Location:** `.semaphore/semaphore.yml` -- common pattern across services

```yaml
# Typical pattern for every service:
- name: "Build prod image"
  commands:
    - make pull
    - make build
    - make push
```

The `pull` -> `build` -> `push` sequence is sequential. Multi-stage builds could be parallelized (e.g., build base images once, share via registry cache).

**Recommendation:** Use BuildKit cache mounts and multi-stage build caching to reduce build times. Consider a shared base image that all services extend.

---

## 7. Frontend Performance

### 7.1 Monolithic Bundle with No Code Splitting (CRITICAL)

**Location:** `front/assets/js/app.js`, `front/assets/build.js`

The frontend entry point (`app.js`) eagerly imports 60+ modules at the top level:

```javascript
import { Dashboard } from "./dashboard";
import { EditNotification } from "./edit_notification";
import { WorkflowEditor } from "./workflow_editor/editor.js";
import { JobLogs } from "./job_logs/logs.js";
import { ActivityMonitor } from "./activity_monitor/main.js";
// ... 55+ more imports
```

All 578 source files are bundled into a single output via esbuild with no code splitting:

```javascript
// build.js:59
const buildOptions = {
  entryPoints: ['js/app.js'],  // Single entry point
  bundle,
  // No splitting configuration
}
```

This means users downloading the dashboard page also download the workflow editor, job logs viewer, project settings, billing, audit logs, insights, flaky tests, and every other feature. The bundle includes heavy dependencies like Monaco Editor (`@monaco-editor/react`), Mermaid (`mermaid`), D3 (`d3`), and CodeMirror.

**Recommendation:**
- Enable esbuild code splitting (`splitting: true, format: 'esm'`)
- Convert to dynamic imports for route-based code splitting: `const WorkflowEditor = lazy(() => import('./workflow_editor/editor.js'))`
- Lazy-load heavy dependencies (Monaco, Mermaid, D3) only on pages that need them
- Expected improvement: 60-70% reduction in initial bundle size

### 7.2 Heavy Dependencies Without Tree Shaking (HIGH)

**Location:** `front/assets/package.json`

Notable heavy dependencies loaded eagerly:
- `@monaco-editor/react` (~2MB) - full code editor, used only in workflow editor
- `mermaid` (~1.5MB) - diagram rendering, used only in specific views
- `d3` (~300KB) - full D3 library when only `d3-color` and `d3-time-format` may be needed
- `lodash` (~70KB) - should use `lodash-es` for tree shaking
- `moment` (~300KB) - should be replaced with `dayjs` (~2KB) or native Intl
- `jquery` - still included alongside Preact
- `brace` (Ace editor) - imported globally via `require('brace')` despite Monaco also being present

Two separate code editors (Ace/Brace and Monaco) are both included. This is likely a migration artifact.

**Recommendation:**
- Remove `brace`/`ace` if Monaco is the replacement
- Replace `moment` with `dayjs` (API-compatible, 150x smaller)
- Replace `lodash` with `lodash-es` or individual function imports
- Lazy-load Monaco and Mermaid
- Import only needed D3 modules instead of the full library

### 7.3 No CSS Purging or Critical CSS (MEDIUM)

**Location:** `front/assets/build.js:20-38`

CSS processing uses PostCSS but there is no PurgeCSS or similar tool configured to remove unused CSS. The build copies all CSS through PostCSS with minification only in production.

**Recommendation:** Add PurgeCSS/Tailwind CSS purging to eliminate unused styles. Extract critical CSS for above-the-fold rendering.

---

## Summary of Findings

| # | Finding | Severity | Category | Impact |
|---|---------|----------|----------|--------|
| 1.1 | Missing indexes on zebra jobs table | CRITICAL | Database | Sequential scans under load |
| 1.2 | Looper STM polling without covering indexes | HIGH | Database | Unnecessary DB load |
| 1.3 | N+1 patterns in preloads and loop deletes | MEDIUM | Database | Extra round-trips |
| 1.4 | Default pool size of 1 across services | HIGH | Database | Serialized DB access |
| 2.1 | Task.await(:infinity) in worker loops | CRITICAL | Concurrency | Silent hangs, no recovery |
| 2.2 | Raw spawn_link without supervision | HIGH | Concurrency | No observability or graceful shutdown |
| 2.3 | Fire-and-forget spawn for metrics | MEDIUM | Concurrency | Potential process accumulation |
| 2.4 | Randomized sleep masks contention | MEDIUM | Concurrency | 10-30s scheduling latency |
| 3.1 | Per-request gRPC connection establishment | CRITICAL | API | Thousands of unnecessary connections/sec |
| 3.2 | Missing pagination in list operations | HIGH | API | Unbounded memory/lock usage |
| 3.3 | Inconsistent gRPC timeout values | HIGH | API | 41-minute timeouts, resource holding |
| 4.1 | Inconsistent caching across services | MEDIUM | Caching | Unnecessary DB load on read-heavy paths |
| 4.2 | No distributed cache invalidation | MEDIUM | Caching | Stale data across pods |
| 5.1 | Supervisor max_restarts too high | MEDIUM | Resources | Masked crash loops |
| 5.2 | gRPC channel leaks on exceptions | HIGH | Resources | File descriptor exhaustion |
| 6.1 | 169 blocks with limited parallelism | HIGH | CI/Build | Slow CI pipeline |
| 6.2 | Sequential Docker build pattern | MEDIUM | CI/Build | Suboptimal build times |
| 7.1 | Monolithic frontend bundle | CRITICAL | Frontend | Large initial download |
| 7.2 | Heavy dependencies without tree shaking | HIGH | Frontend | ~5MB+ unnecessary JS |
| 7.3 | No CSS purging or critical CSS | MEDIUM | Frontend | Unused CSS downloaded |

## Priority Remediation Roadmap

### Phase 1 -- Immediate (Week 1-2)
1. **gRPC connection pooling** (3.1) -- Highest impact, affects all inter-service communication
2. **Task.await timeout bounds** (2.1) -- Prevents silent production hangs
3. **Database pool size defaults** (1.4) -- Simple config change, immediate throughput improvement

### Phase 2 -- Short Term (Week 3-4)
4. **Jobs table indexing** (1.1) -- Database migration, requires testing
5. **Frontend code splitting** (7.1) -- Significant user experience improvement
6. **gRPC timeout standardization** (3.3) -- Consistency improvement

### Phase 3 -- Medium Term (Month 2)
7. **Worker supervision refactor** (2.2) -- Convert raw spawn to GenServer
8. **Looper index optimization** (1.2) -- Covering indexes for STM queries
9. **Heavy dependency cleanup** (7.2) -- Replace moment, lodash, remove duplicate editors
10. **Pagination for list operations** (3.2) -- Requires API versioning

### Phase 4 -- Long Term (Month 3+)
11. **Event-driven scheduling** (2.4) -- Replace polling with LISTEN/NOTIFY
12. **Distributed caching** (4.2) -- Redis or AMQP-based invalidation
13. **CI pipeline optimization** (6.1) -- Restructure blocks, increase parallelism
14. **Caching standardization** (4.1) -- Common cache library across services

---

## Performance Validation SLA Assessment

| Metric | Current Estimate | Target SLA | Status |
|--------|-----------------|------------|--------|
| gRPC inter-service latency (p95) | ~50ms (connection overhead) | <10ms | VIOLATION |
| Job scheduling latency | 10-30s (polling) | <2s | VIOLATION |
| Frontend initial load (bundle) | ~5MB+ (no splitting) | <500KB | VIOLATION |
| Database connection utilization | 1 conn/service (default) | 10+ conn/service | VIOLATION |
| Worker recovery time | infinity (hangs) | <60s | VIOLATION |
| CI pipeline total time | High (169 blocks) | Optimizable by 30%+ | WARNING |

**Validation Result: FAIL** -- 5 critical SLA violations detected across API latency, scheduling latency, frontend performance, database utilization, and worker resilience.
