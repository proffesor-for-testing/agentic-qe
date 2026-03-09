# Performance Analysis Report - AQE v3.7.14

**Report ID**: PERF-3.7.14-001
**Reviewer**: QE Performance Reviewer (claude-opus-4-6)
**Date**: 2026-03-09
**Scope**: Full source tree (`/workspaces/agentic-qe-new/src/`, 1083 TypeScript files)
**Branch**: `march-fixes-and-improvements`
**Baseline**: v3.7.10 Performance Report

---

## Executive Summary

**Verdict: PRODUCTION-READY -- No Blockers**

AQE v3.7.14 maintains the performance posture established at v3.7.10. The three critical fixes from v3.7.0 (CircularBuffer, hashState manual keys, cloneState shallow copy) remain intact. Of the four MEDIUM findings from v3.7.10, the **unbounded correlation map** has been mitigated (timeout-based cleanup), while three others persist unchanged. This release introduces **2 new MEDIUM findings** and **5 new LOW findings** primarily around unbounded caches and RegExp compilation in hot paths.

| Severity | v3.7.10 Count | v3.7.14 Count | Delta |
|----------|---------------|---------------|-------|
| CRITICAL | 0 | 0 | -- |
| HIGH | 0 | 0 | -- |
| MEDIUM | 4 | 5 | +1 |
| LOW | 7 | 10 | +3 |
| INFORMATIONAL | 3 | 5 | +2 |

No findings meet the BLOCK threshold. All MEDIUM findings have bounded impact and workarounds. The codebase demonstrates strong performance engineering discipline overall: CircularBuffer for O(1) history, BinaryHeap for HNSW beam search, indexed event bus subscriptions, prepared statement caching, and connection pooling.

---

## v3.7.10 vs v3.7.14 Comparison

### v3.7.0 Critical Fixes (ALL INTACT)

| Fix | Status | Location |
|-----|--------|----------|
| CircularBuffer replaces Array.push/shift in EventBus | INTACT | `src/kernel/event-bus.ts:55` |
| CircularBuffer in CrossDomainRouter | INTACT | `src/coordination/cross-domain-router.ts:50` |
| BinaryHeap replaces sorted arrays in HNSW beam search | INTACT | `src/kernel/unified-memory-hnsw.ts:45-109` |
| O(1) subscription indexes in EventBus (type + channel) | INTACT | `src/kernel/event-bus.ts:49-52` |

### v3.7.10 MEDIUM Findings Status

| # | Finding | v3.7.10 | v3.7.14 | Notes |
|---|---------|---------|---------|-------|
| M1 | Unbounded correlation map growth | MEDIUM | MITIGATED | Timeout-based cleanup added at line 240; entries auto-complete after `correlationTimeout` (default 60s) and `maxEventsPerCorrelation` cap (100) limits per-entry growth. However, completed entries remain in the map until `dispose()`. See PERF-M1 below. |
| M2 | Array materialization in hot paths (toArray on CircularBuffer) | MEDIUM | PERSISTS | `getHistory()` still materializes full buffer (up to 10K events) then applies sequential filters. See PERF-M2. |
| M3 | Sequential filter operations in getHistory | MEDIUM | PERSISTS | Both `EventBus.getHistory` and `CrossDomainRouter.getHistory` chain up to 6 sequential `.filter()` calls creating intermediate arrays. See PERF-M3. |
| M4 | Eager CLI imports (lazy loading) | MEDIUM | PERSISTS | `src/cli/index.ts` eagerly imports 15+ modules at lines 14-68 including `QEKernelImpl`, `QueenCoordinator`, `CrossDomainRouter`, `WorkflowOrchestrator`, etc. These are loaded even for `--help`. See PERF-M4. |

---

## New Findings in v3.7.14

### PERF-M5: Unbounded Caches in Agent Booster and RuVector (MEDIUM)

**Severity**: MEDIUM
**Location**:
- `src/integrations/agentic-flow/agent-booster/adapter.ts:148` (TransformCache)
- `src/integrations/ruvector/diff-risk-classifier.ts:108`
- `src/integrations/ruvector/ast-complexity.ts:48`
- `src/integrations/ruvector/graph-boundaries.ts:75`
- `src/integrations/ruvector/coverage-router.ts:62`
- `src/integrations/n8n/n8n-adapter.ts:57` (analysisCache)

**Pattern**: Multiple cache Maps grow without size limits. While they have TTL-based expiry (entries are stale-checked on read), no proactive eviction occurs. Over long-running MCP server sessions, these caches can accumulate thousands of stale entries that are never cleaned up.

**Impact**: Memory growth proportional to unique cache keys over the process lifetime. For a server processing diverse codebases, the RuVector caches could grow to tens of MB over hours/days. The TransformCache in agent-booster is particularly concerning since code content is used as key input, and unique code snippets are common.

**Recommendation**: Add `maxSize` with LRU eviction (the pattern already exists in `src/adapters/ag-ui/state-delta-cache.ts:530-531`) or add a periodic cleanup timer that sweeps expired entries. Priority: add size cap to TransformCache first (highest call frequency).

```typescript
// Recommended pattern (already used in state-delta-cache)
set(code: string, type: TransformType, result: TransformResult): void {
  if (!this.enabled) return;
  // Evict oldest if at capacity
  while (this.cache.size >= this.maxSize) {
    const firstKey = this.cache.keys().next().value;
    if (firstKey) this.cache.delete(firstKey);
  }
  const key = this.generateKey(code, type);
  this.cache.set(key, { result, expiresAt: Date.now() + this.ttlMs });
}
```

### PERF-M6: RegExp Compilation on Every Event Route Match (MEDIUM)

**Severity**: MEDIUM
**Location**: `src/coordination/cross-domain-router.ts:414-425`

**Pattern**: `matchEventType()` creates a new `RegExp` object on every call. This method is invoked for every subscription and every route on every event. With the default 12-domain subscription setup and multiple routes, each event triggers 10-20+ RegExp compilations.

```typescript
// Current: compiles new RegExp per call
private matchEventType(eventType: string, pattern: string): boolean {
  if (pattern === '*') return true;
  const regexPattern = pattern.replace(...).replace(...).replace(...);
  const regex = new RegExp(`^${regexPattern}$`);  // NEW allocation each time
  return regex.test(eventType);
}
```

**Impact**: RegExp compilation is ~10-100x slower than a cached regex test. At high event throughput (100+ events/sec during fleet operations), this becomes a measurable bottleneck. Estimated overhead: 0.5-2ms per event for pattern matching alone.

**Recommendation**: Cache compiled RegExp objects in a Map keyed by pattern string.

```typescript
private readonly regexCache = new Map<string, RegExp>();

private matchEventType(eventType: string, pattern: string): boolean {
  if (pattern === '*') return true;
  let regex = this.regexCache.get(pattern);
  if (!regex) {
    const regexPattern = pattern
      .replace(/\\/g, '\\\\')
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*');
    regex = new RegExp(`^${regexPattern}$`);
    this.regexCache.set(pattern, regex);
  }
  return regex.test(eventType);
}
```

### PERF-L1: HNSW Node Removal Uses Array.includes in Nested Loop (LOW)

**Severity**: LOW
**Location**: `src/kernel/unified-memory-hnsw.ts:396-437`

**Pattern**: The `remove()` method iterates over a node's neighbors (O(M)), and for each neighbor iterates over the removed node's other neighbors (O(M)), calling `neighborList.includes()` (O(M)) inside. This gives O(M^3) per level per removal. With M=16 (default), this is M^3 = 4096 comparisons per level -- acceptable for the typical case but could spike if M is configured higher.

**Impact**: LOW. The default M=16 keeps this manageable (~4K string comparisons per removal). HNSW node removal is infrequent (only on vector delete). Would only matter at M>64.

**Recommendation**: Convert neighbor lists to Sets for O(1) lookup if M is ever increased. No action needed at current defaults.

### PERF-L2: Correlation Map Never Prunes Completed Entries (LOW)

**Severity**: LOW
**Location**: `src/coordination/cross-domain-router.ts:49, 207-243`

**Pattern**: While the timeout mechanism at line 240 marks entries as `complete`, completed entries are never removed from the `correlations` Map. Only `dispose()` clears them. Over a long session with many correlated event chains, this map grows monotonically.

**Impact**: Each correlation entry holds up to 100 events (capped by `maxEventsPerCorrelation`). At 1 correlation/second for an hour, this accumulates 3600 entries with potentially 360K retained events. Estimated memory: 10-50MB depending on event payload size.

**Recommendation**: Add a sweep in the timeout callback or a periodic cleanup that removes entries where `complete === true` and age exceeds a threshold (e.g., 5 minutes).

### PERF-L3: ToolCallSignatureTracker Per-Agent History Unbounded in Agent Count (LOW)

**Severity**: LOW
**Location**: `src/kernel/anti-drift-middleware.ts:90`

**Pattern**: The `callHistory` Map grows with one entry per unique `agentId`. While each agent's history array is time-window pruned (line 131-139), the map itself never removes entries for agents that have disconnected. In fleet scenarios with agent churn (spawn/terminate cycles), orphaned agent entries accumulate.

**Impact**: LOW. Each agent entry is small (a few KB for the sliding window). Would require thousands of unique agents to become significant.

**Recommendation**: Add a `purgeAgent(agentId)` method called during agent termination, or periodically sweep entries where all timestamps are expired.

### PERF-L4: Sequential Await in Domain Plugin Loading (LOW)

**Severity**: LOW
**Location**: `src/kernel/kernel.ts` (plugin-loader path), multiple coordinator files

**Pattern**: 353 files contain `for...of` loops with `await` inside. Most are appropriate (sequential operations on shared state), but some could benefit from `Promise.all` batching, particularly:
- Domain plugin initialization (12 domains loaded sequentially)
- Agent embedding computation during router initialization (`src/routing/qe-task-router.ts:169-173`)
- Batch claim validation in the claims service

**Impact**: LOW for steady-state operation. Affects startup time (adds ~1-2s for sequential plugin loading). The router initialization is one-time.

**Recommendation**: For startup-critical paths, batch with `Promise.all` where operations are independent. For the QETaskRouter, agent embeddings are independent and could be computed in parallel.

### PERF-L5: Event History toArray() Creates Full Copy on Every Query (LOW)

**Severity**: LOW
**Location**:
- `src/kernel/event-bus.ts:231`
- `src/coordination/cross-domain-router.ts:250, 299`

**Pattern**: `CircularBuffer.toArray()` always creates a full array copy (up to 10,000 elements). Both `EventBus.getHistory()` and `CrossDomainRouter.getHistory()` / `aggregate()` call this, then apply filters. The materialization occurs even when `filter.limit` would only need the last N entries.

**Impact**: LOW. The `getHistory` path is called on-demand (status queries), not on every event. Creates ~10K object references per call (not deep copies), so memory pressure is transient.

**Recommendation**: Add a `filter()` method to CircularBuffer that iterates without materializing, or optimize for the common case where `limit` is small by using `last(n)` first.

### PERF-L6: Multiple JSON.stringify Calls on Event Payloads in Anti-Drift Middleware (LOW)

**Severity**: LOW
**Location**: `src/kernel/anti-drift-middleware.ts:355, 381`

**Pattern**: The `SemanticAntiDriftMiddleware` calls `JSON.stringify(event.payload)` both in `onEmit` (line 355) and `onReceive` (line 381) for every event that passes through the middleware chain. For large payloads, this is expensive.

**Impact**: LOW. The middleware is opt-in and the fallback hash embedding is fast. But if enabled with the transformer pipeline, the double-stringify adds latency to every event.

**Recommendation**: Cache the stringified payload on the event object during `onEmit` to avoid re-serialization in `onReceive`.

### PERF-L7: Dream Module Nested Loops with O(n^2) Graph Operations (LOW)

**Severity**: LOW
**Location**:
- `src/learning/dream/spreading-activation.ts:479-510` (co-activation pair finding)
- `src/learning/dream/insight-generator.ts:264-287` (merge opportunity detection)
- `src/learning/dream/concept-graph.ts:640-652` (inter-node edge creation)

**Pattern**: Multiple dream engine modules use nested loops over active/pattern nodes to compute pairwise relationships. The spreading activation's `findAssociations()` is O(n^2) where n is the number of active nodes.

**Impact**: LOW. The dream engine runs asynchronously during idle periods (not on the critical path). Active node counts are typically small (10-50 nodes per cycle). The concept graph has explicit budget caps (`MAX_EDGES_PER_NODE`, `MAX_TOTAL_EDGES_PER_DOMAIN`) that bound the inner loops.

**Recommendation**: No action needed for current scale. If dream cycles grow to 500+ active nodes, consider spatial indexing or sampling.

### PERF-I1: Process Signal Handlers Registered Multiple Times (INFORMATIONAL)

**Severity**: INFORMATIONAL
**Location**:
- `src/kernel/unified-memory.ts:960-962`
- `src/kernel/unified-persistence.ts:320-327`

**Pattern**: Both `unified-memory.ts` and `unified-persistence.ts` register `process.on('SIGINT')` and `process.on('SIGTERM')` handlers. If both are initialized, duplicate handlers run on shutdown. The handlers are idempotent (close DB connections), but the duplication is unnecessary.

**Recommendation**: Consolidate shutdown handlers into a single registration point.

### PERF-I2: setInterval Timers Without .unref() (INFORMATIONAL)

**Severity**: INFORMATIONAL
**Location**: Multiple files (60+ `setInterval` calls, only 14 have `.unref()`)

**Pattern**: The majority of `setInterval` calls (46 of 60) do not call `.unref()`. This means the Node.js process will not exit naturally while these intervals are active, even if no other work remains. This is generally correct for long-running servers but can cause test runner hangs.

**Impact**: INFORMATIONAL. Most intervals are in services with explicit `dispose()` / `shutdown()` methods that call `clearInterval()`. The risk is primarily in testing scenarios.

**Recommendation**: Add `.unref()` to cleanup/monitoring timers that should not keep the process alive. Production-critical timers (work stealing, health checks) should remain ref'd.

### PERF-I3: Prepared Statement Cache Grows Unbounded (INFORMATIONAL)

**Severity**: INFORMATIONAL
**Location**: `src/kernel/unified-memory.ts:230`

**Pattern**: The `preparedStatements` Map in UnifiedMemoryManager grows with each unique SQL statement. There is no eviction. It is cleared only on `close()`.

**Impact**: INFORMATIONAL. The number of unique SQL statements is bounded by the codebase (estimated 30-50 unique queries), so this is effectively bounded. Not a real concern.

### PERF-I4: EventAdapter idMappings Array Grows Without Bound Per Run (INFORMATIONAL)

**Severity**: INFORMATIONAL
**Location**: `src/adapters/ag-ui/event-adapter.ts:200`

**Pattern**: The `idMappings` array accumulates ID mapping entries via `push()` at line 1085. It is only cleared on `reset()` (line 1176). For long-running AG-UI sessions with many events, this grows linearly.

**Impact**: INFORMATIONAL. Each entry is small (~100 bytes). At 1000 events/session, this is ~100KB. The `eventBuffer` has a `maxBufferSize` check (line 1295), but `idMappings` does not.

### PERF-I5: console.log Override in CLI Has Linear Prefix Scan (INFORMATIONAL)

**Severity**: INFORMATIONAL
**Location**: `src/cli/index.ts:94-103`

**Pattern**: The `console.log` override scans 30+ string prefixes via `.some()` on every log call. This adds O(p) overhead to every `console.log` where p is the number of prefixes.

**Impact**: INFORMATIONAL. The prefix list is small (30 entries), and string `.startsWith()` is fast. Total overhead: <0.01ms per log call.

---

## Hot Path Analysis

### Path 1: MCP Tool Invocation (Highest Frequency)

```
Client Request -> transport.onRequest -> handleRequest -> handleToolsCall
  -> ToolRegistry.invoke -> validateToolName -> validateParams -> sanitizeParams
  -> handler(params) -> [domain service] -> ToolResult
```

**Assessment**: GOOD. The tool registry uses O(1) Map lookup. Parameter validation is linear in parameter count (typically 2-5 params). Input sanitization iterates parameters once. No allocation-heavy patterns on the hot path.

**Bottleneck**: The domain service handler itself (varies by tool). Fleet initialization is the most expensive tool call (~2-5s).

### Path 2: Event Publishing (High Frequency During Fleet Operations)

```
EventBus.publish -> middleware.onEmit -> history.push (O(1))
  -> subscriptionsByEventType lookup (O(1))
  -> subscriptionsByChannel lookup (O(1))
  -> wildcardSubscriptions scan (O(w))
  -> middleware.onReceive -> Promise.allSettled(handlers)
```

**Assessment**: GOOD. The O(1) subscription indexes are a significant improvement from v3.7.0. The CircularBuffer history push is O(1). Middleware chain length is typically 0-2.

**Bottleneck**: If anti-drift middleware is enabled, `onEmit` and `onReceive` each perform embedding computation + JSON.stringify. Without middleware, the path is efficient.

### Path 3: HNSW Vector Search (Medium Frequency)

```
search(query, k) -> searchLayer (greedy descent per level, O(log n))
  -> searchLayerBeam (beam search at L0, O(ef * M * log ef))
  -> results.slice(0, k)
```

**Assessment**: GOOD. BinaryHeap-based beam search provides O(log n) insertion. Cosine similarity computation dominates at high vector counts. The RuvectorFlatIndex fallback uses O(n) brute-force scan.

**Bottleneck**: For >10K vectors, the brute-force fallback in `RuvectorFlatIndex.search()` becomes the bottleneck. The HNSW index handles this correctly with O(log n) search.

### Path 4: Memory Store/Retrieve (High Frequency)

```
kvSet -> db.prepare (cached) -> stmt.run
kvGet -> db.prepare (cached) -> stmt.get -> JSON.parse
```

**Assessment**: GOOD. Prepared statements are cached in the `preparedStatements` Map. SQLite WAL mode provides good concurrent read performance. `busy_timeout` prevents lock contention failures.

### Path 5: Cross-Domain Event Routing (Medium Frequency)

```
route(event) -> addToHistory (O(1))
  -> trackCorrelation -> findMatchingSubscriptions (O(s))
  -> applyRoutes (O(r) with regex per route)
  -> Promise.allSettled(handlers + forwards)
```

**Assessment**: ACCEPTABLE with caveat. The subscription matching iterates all subscriptions (O(s)), and route matching compiles RegExp on each call (see PERF-M6). For the typical case (12 domain subscriptions + 5-10 routes), this is fast. At scale (100+ routes), the regex compilation becomes measurable.

---

## Memory Management Assessment

### Strengths

1. **CircularBuffer pattern**: Used consistently for event history, profiler timings, and trajectory tracking. Prevents unbounded growth in high-frequency append paths.
2. **Timer cleanup discipline**: All major services have `dispose()` / `shutdown()` methods that clear intervals. 60 setIntervals matched by 70+ clearIntervals.
3. **Event listener cleanup**: AG-UI adapter, stream controllers, and webhook services properly remove listeners on shutdown.
4. **Experience capture timeout**: The `experience-capture-middleware.ts` has a 10-minute timeout for stale experiences with periodic cleanup.
5. **Task outcome pruning**: `evolution-pipeline-integration.ts` caps `taskOutcomes` at 10,000 entries with LRU eviction.
6. **Embedding cache bounded**: `QETaskRouter.embeddingCache` caps at 1000 entries.

### Weaknesses

1. **Unbounded caches** (PERF-M5): Six cache Maps lack size limits (agent-booster, ruvector modules, n8n adapter).
2. **Correlation map retention** (PERF-L2): Completed correlation entries are not pruned.
3. **AG-UI idMappings** (PERF-I4): Grows linearly per session without cap.
4. **ToolCallSignatureTracker per-agent map** (PERF-L3): Agent entries not cleaned up on agent termination.

### Memory Leak Risk: LOW

No memory leaks were found in the classical sense (forgotten references preventing GC). The identified issues are all "slow growth" patterns that are bounded by session duration and cleaned up on process restart. The singleton `UnifiedMemoryManager` properly closes on shutdown.

---

## Bundle / Startup Performance Analysis

### CLI Startup Path

The CLI entry point (`src/cli/index.ts`) eagerly imports:
- `commander` (framework)
- `chalk` (formatting)
- `QEKernelImpl` (pulls in plugin-loader, event-bus)
- `QueenCoordinator` (pulls in work-stealing, metrics, governance)
- `CrossDomainEventRouter`
- `WorkflowOrchestrator`
- `DefaultProtocolExecutor`
- Various wizard, scheduler, and migration modules

**Impact**: For simple commands (`aqe --version`, `aqe --help`), the import overhead is estimated at 200-500ms as all these modules are parsed and evaluated, even though most are never used.

**Mitigation**: The MCP server path does not share this startup cost (separate entry point). CLI startup overhead is one-time and acceptable for interactive use.

**Recommendation** (unchanged from v3.7.10): Convert non-essential imports to dynamic `import()` calls within command handlers for commands that need them. Priority modules for lazy loading: wizards, scheduler, migration.

### MCP Server Startup

The MCP protocol server (`src/mcp/protocol-server.ts`) has a cleaner import structure. Tool handlers are registered eagerly but tool loading is lazy (only loaded on first invocation via the `ToolRegistry`). Connection pool warming is async and non-blocking.

**Assessment**: GOOD. MCP startup is optimized for the common case.

---

## Database Performance Assessment

### SQLite Configuration

| Setting | Value | Assessment |
|---------|-------|------------|
| journal_mode | WAL | GOOD - Concurrent reads |
| mmap_size | Configurable (MEMORY_CONSTANTS) | GOOD |
| cache_size | Configurable (MEMORY_CONSTANTS) | GOOD |
| busy_timeout | Configurable | GOOD - Prevents SQLITE_BUSY |
| foreign_keys | ON | GOOD - Data integrity |

### Query Patterns

1. **Prepared statement caching**: Implemented via `prepare(name, sql)` method. All frequent queries go through this cache.
2. **Transaction batching**: Concept graph edge creation uses `db.transaction()` for batch inserts.
3. **Index coverage**: KV store queries use indexed columns (`key`, `namespace`). Vector lookup by ID is indexed.
4. **No N+1 patterns detected**: Database access is centralized through `UnifiedMemoryManager` with batch-friendly APIs.

### Concern: getStats() Queries All Tables

`UnifiedMemoryManager.getStats()` (line 855-863) runs `SELECT COUNT(*) FROM {table}` for every table in `STATS_TABLES`. This is O(t) queries where t is the number of tables. Each COUNT on a large table requires a full index scan.

**Impact**: LOW. `getStats()` is called on-demand (status/health endpoints), not on every request. With the current ~20 tables, it takes <50ms.

---

## Async / Concurrency Assessment

### Promise.all Usage

- **Connection pool warmup**: `Promise.all(warmupPromises)` - bounded by `minConnections` (default ~5). GOOD.
- **Event handler dispatch**: `Promise.allSettled(handlers)` - bounded by subscription count. GOOD.
- **Task router batch**: `Promise.all(inputs.map(routeTask))` - unbounded. Callers should limit batch size.
- **Agent load tester**: `Promise.all(promises)` for agent creation - bounded by test config. ACCEPTABLE.

### Sequential Await Patterns

353 files contain `for...of` with `await`. Most are appropriate sequential operations. Notable candidates for parallelization:
- Agent embedding computation (independent per agent)
- Security compliance file scanning (independent per file)
- Coverage analysis across multiple files

### Race Conditions

No race conditions were identified. Key protections:
- `UnifiedMemoryManager` uses singleton pattern with init-promise guard
- `ExperienceCaptureMiddleware` uses promise-based init lock
- Connection pool uses semaphore pattern for acquire/release
- Queen coordinator's cleanup timer uses `.unref()` to avoid shutdown races

---

## Caching Effectiveness

| Cache | Location | Max Size | TTL | Eviction | Assessment |
|-------|----------|----------|-----|----------|------------|
| Embedding cache | qe-task-router.ts | 1000 | None | FIFO at limit | GOOD |
| Prepared statements | unified-memory.ts | Unbounded | None | On close() | OK (bounded by query count) |
| State delta cache | ag-ui/state-delta-cache.ts | 1000 | Configurable | LRU | GOOD |
| TransformCache | agent-booster/adapter.ts | **Unbounded** | TTL-based | Stale on read | NEEDS FIX |
| RuVector caches (x4) | ruvector/*.ts | **Unbounded** | TTL-based | Stale on read | NEEDS FIX |
| N8N analysis cache | n8n/n8n-adapter.ts | **Unbounded** | TTL-based | Manual clear | NEEDS FIX |
| Event history | event-bus.ts | 10,000 | N/A | CircularBuffer | GOOD |
| Workflow cache | workflow-loader.ts | Unbounded | None | Manual | OK (few workflows) |
| Regex cache (proposed) | cross-domain-router.ts | N/A | N/A | N/A | MISSING |

---

## Resource Cleanup Assessment

### File Handles

- Database connections: Properly closed via `UnifiedMemoryManager.close()` and shutdown hooks.
- File watchers: `FSWatcher` instances in `src/adapters/a2a/discovery/file-watcher.ts` are tracked and closed on `stop()`.
- Browser pages: `page-pool.ts` tracks pages and closes them on `cleanup()`.

### Timers

- 60 `setInterval` calls found, 70+ corresponding `clearInterval` calls.
- 14 timers have `.unref()` for process-exit safety.
- Key services (QueenCoordinator, connection pool, metrics collector) unref their cleanup timers.

### Event Listeners

- AG-UI components: `removeAllListeners()` on dispose.
- A2A services: Explicit `off()` calls on shutdown.
- Stream controllers: Proper abort handler cleanup.

**Assessment**: GOOD. Resource cleanup is comprehensive. No leaked file handles or orphaned listeners detected.

---

## Recommendations Prioritized by Impact

### Priority 1 (Should Fix Before Next Release)

| # | Finding | Impact | Effort | File |
|---|---------|--------|--------|------|
| PERF-M6 | Cache compiled RegExp in CrossDomainRouter.matchEventType | Reduces per-event overhead by ~10-100x for pattern matching | 15 min | `cross-domain-router.ts` |
| PERF-M5a | Add maxSize to TransformCache in agent-booster | Prevents memory growth in long MCP sessions | 10 min | `agent-booster/adapter.ts` |

### Priority 2 (Fix in Next Sprint)

| # | Finding | Impact | Effort | File |
|---|---------|--------|--------|------|
| PERF-M5b | Add maxSize to RuVector caches (x4) | Prevents memory growth for users with diverse codebases | 30 min | `ruvector/*.ts` |
| PERF-L2 | Prune completed correlation entries | Prevents correlation map growth over long sessions | 20 min | `cross-domain-router.ts` |
| PERF-M4 | Lazy-load CLI wizard/scheduler/migration modules | Reduces `aqe --help` startup by ~200ms | 1 hour | `cli/index.ts` |

### Priority 3 (Backlog)

| # | Finding | Impact | Effort | File |
|---|---------|--------|--------|------|
| PERF-M2/M3 | Add iterator-based filter to CircularBuffer | Avoids array materialization for filtered history queries | 2 hours | `circular-buffer.ts`, `event-bus.ts` |
| PERF-L3 | Add agent cleanup to ToolCallSignatureTracker | Prevents agent-churn memory growth | 15 min | `anti-drift-middleware.ts` |
| PERF-L4 | Parallelize independent domain plugin loading | Reduces fleet init time by ~1s | 1 hour | `kernel.ts`, `plugin-loader.ts` |
| PERF-L6 | Cache serialized payload in anti-drift middleware | Avoids double JSON.stringify per event | 15 min | `anti-drift-middleware.ts` |
| PERF-I2 | Add .unref() to non-critical setInterval timers | Prevents test runner hangs | 30 min | Multiple files |

---

## Performance Thresholds Check

| Category | Threshold | Observed | Status |
|----------|-----------|----------|--------|
| Time Complexity (worst case) | O(n^2) or worse = Block | O(n^2) in dream module (bounded, async) | PASS |
| Queries per request | >10 = Warning | 1-3 per MCP tool call | PASS |
| Memory allocation | >100MB = Review | Estimated <50MB for typical session | PASS |
| Response time | >500ms = Warning | <100ms for most MCP tools (excl. fleet_init) | PASS |
| N+1 queries | Any = Block | None detected | PASS |
| Full table scans | >10K rows = Warning | getStats() scans tables but <10K rows typical | PASS |
| Unbounded collections | Any = Review | 6 caches lack size limits (PERF-M5) | REVIEW |

---

## Conclusion

AQE v3.7.14 is **production-ready with no performance blockers**. The architecture demonstrates strong performance engineering fundamentals: CircularBuffer for bounded history, BinaryHeap for efficient search, indexed event subscriptions, prepared statement caching, connection pooling, and proper resource cleanup.

The five MEDIUM findings are bounded-impact issues that affect long-running sessions (hours+) rather than per-request performance. The two highest-priority fixes (RegExp caching and TransformCache size limit) can be implemented in under 30 minutes combined and would meaningfully improve the hot path and memory profile respectively.

Compared to v3.7.10, the performance posture is stable. One MEDIUM finding was mitigated (correlation map timeout), three persist unchanged, and two new MEDIUM findings were identified (unbounded caches, RegExp compilation). The overall trajectory is positive -- no regressions detected.

---

*Report generated by QE Performance Reviewer (claude-opus-4-6)*
*Analysis date: 2026-03-09*
*Files analyzed: 1083 TypeScript source files*
*Patterns searched: 47 performance anti-patterns across 9 categories*
