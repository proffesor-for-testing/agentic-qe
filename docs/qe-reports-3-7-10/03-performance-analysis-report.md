# AQE v3.7.10 Performance Analysis Report

**Date**: 2026-03-06
**Analyst**: QE Performance Reviewer (V3)
**Scope**: Full codebase performance audit (1,077 TypeScript source files)
**Baseline**: v3.7.0 performance analysis

---

## Executive Summary

The v3.7.10 codebase shows **significant improvement** over the v3.7.0 baseline. The three previously identified MEDIUM/LOW issues have all been addressed:

- **CrossDomainRouter**: Now uses `CircularBuffer` instead of `Array+shift()` -- FIXED
- **hashState()**: Uses structured manual key extraction instead of generic `.sort()` -- FIXED
- **PlanExecutor cloneState**: Uses manual shallow copy instead of `JSON.parse(JSON.stringify)` -- FIXED

The 8 prior performance fixes (MinHeap A*, bounded taskTraceContexts, state hashing, etc.) remain intact.

**New findings for v3.7.10**: 4 MEDIUM issues, 7 LOW issues, 3 INFORMATIONAL items identified.

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL (Block) | 0 | -- |
| HIGH | 0 | -- |
| MEDIUM | 4 | New |
| LOW | 7 | New |
| INFORMATIONAL | 3 | New |

**Verdict**: No blocking performance issues. The codebase is production-ready from a performance standpoint. All MEDIUM issues have bounded worst-case impact and are recommended for future optimization sprints.

---

## 1. Algorithmic Complexity Hotspots

### 1.1 VERIFIED FIX: CrossDomainRouter Event History -- O(1) per event

**File**: `src/coordination/cross-domain-router.ts:50,68,475`

The v3.7.0 finding (Array+shift O(n) per event) is confirmed fixed. The router now uses `CircularBuffer`:

```typescript
// Line 50: Type declaration
private readonly eventHistory: CircularBuffer<DomainEvent>;

// Line 68: Initialization with configurable capacity
this.eventHistory = new CircularBuffer<DomainEvent>(this.maxHistorySize);

// Line 474-475: O(1) push operation
private addToHistory(event: DomainEvent): void {
  // PERF: CircularBuffer handles capacity automatically in O(1)
  this.eventHistory.push(event);
}
```

The `CircularBuffer` at `src/shared/utils/circular-buffer.ts` is correctly implemented with head/tail pointers on a fixed-size array. Push is O(1), no memory reallocation.

**Status**: FIXED (was MEDIUM in v3.7.0)

### 1.2 VERIFIED FIX: hashState() Sort Optimization

**File**: `src/planning/goap-planner.ts:778-806`

The v3.7.0 finding (`.sort()` on every A* expansion) is confirmed fixed. The function now manually extracts known keys into a deterministic structure:

```typescript
// Line 778-805: Manual key extraction, no generic .sort()
private hashState(state: V3WorldState): string {
  const key = {
    coverageLine: Math.round(state.coverage.line),
    coverageBranch: Math.round(state.coverage.branch),
    // ... fixed-shape manual extraction ...
    availableAgents: [...state.fleet.availableAgents].sort().join(','),
  };
  return JSON.stringify(key);
}
```

Note: Line 794 still sorts `availableAgents` array, but this is a small array (agent IDs, typically <15 items) and is unavoidable for deterministic hashing of an unordered set.

**Status**: FIXED (was LOW in v3.7.0)

### 1.3 VERIFIED FIX: cloneState Manual Structured Copy

**File**: `src/planning/goap-planner.ts:814-826`

```typescript
// Line 814-826: Manual shallow clone, no JSON.parse/JSON.stringify
private cloneState(state: V3WorldState): V3WorldState {
  return {
    coverage: { ...state.coverage },
    quality: { ...state.quality },
    fleet: {
      ...state.fleet,
      availableAgents: [...state.fleet.availableAgents],
    },
    resources: { ...state.resources },
    context: { ...state.context },
    patterns: { ...state.patterns },
  };
}
```

**Status**: FIXED (was LOW in v3.7.0)

### 1.4 [MEDIUM] CrossDomainRouter aggregate() Materializes Full History

**File**: `src/coordination/cross-domain-router.ts:249-252`

```typescript
aggregate(windowStart: Date, windowEnd: Date): EventAggregation {
  const events = this.eventHistory.toArray().filter(
    (e) => e.timestamp >= windowStart && e.timestamp <= windowEnd
  );
```

`toArray()` creates a full copy of up to 10,000 events on every aggregation call, then filters linearly. With `maxHistorySize=10000`, this allocates and discards ~10K-element arrays per call.

**Impact**: O(n) allocation + O(n) filter where n = history size (up to 10,000).
**Recommendation**: Add a `filterInPlace()` method to CircularBuffer that iterates without materializing the full array, or add binary search on sorted timestamps.

### 1.5 [MEDIUM] getHistory() Chains Multiple Linear Filters

**File**: `src/coordination/cross-domain-router.ts:298-320`

```typescript
getHistory(filter?: { ... }): DomainEvent[] {
  let events = this.eventHistory.toArray();          // O(n) copy
  if (filter) {
    if (filter.eventTypes?.length) {
      events = events.filter((e) => filter.eventTypes!.includes(e.type)); // O(n*m)
    }
    if (filter.domains?.length) {
      events = events.filter((e) => filter.domains!.includes(e.source));  // O(n*m)
    }
    // ... more filters ...
  }
  return events;
}
```

Each filter pass creates a new intermediate array. With all filters active, this creates 5 intermediate arrays. Also, `filter.eventTypes!.includes(e.type)` is O(m) per event where m = number of filter types.

**Impact**: O(n * m * f) where n=events, m=filter values, f=filter passes. Worst case: 10K events x 5 filters.
**Recommendation**: Combine into single pass with Set-based lookups for eventTypes/domains.

### 1.6 [LOW] HNSW remove() Uses indexOf + includes in Nested Loops

**File**: `src/kernel/unified-memory-hnsw.ts:396-434`

```typescript
for (const [level, neighbors] of node.neighbors.entries()) {     // O(L levels)
  for (const neighborId of neighbors) {                           // O(M neighbors)
    const neighborList = neighbor.neighbors.get(level);
    const idx = neighborList.indexOf(id);                         // O(M)
    // ...
    for (const otherNeighborId of neighbors) {                    // O(M neighbors)
      if (!neighborList.includes(otherNeighborId)) {              // O(M)
```

This is O(L * M^3) in the worst case where L=levels, M=max connections. However, M is typically 16-32 (HNSW default) and L is ~log(n), so practical impact is limited.

**Impact**: Low. M is small and bounded. This is standard HNSW graph repair.
**Recommendation**: Use Sets for neighbor lists if M grows beyond 64.

### 1.7 [LOW] Regex Compilation in Hot Path -- matchEventType

**File**: `src/coordination/cross-domain-router.ts:414-424`

```typescript
private matchEventType(eventType: string, pattern: string): boolean {
  if (pattern === '*') return true;
  const regexPattern = pattern
    .replace(/\\/g, '\\\\')
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*');
  const regex = new RegExp(`^${regexPattern}$`);  // Compiled per-call
  return regex.test(eventType);
}
```

This compiles a new RegExp on every event for every route/subscription match. Called once per event per subscription.

**Impact**: Low individually, but compounds with high event throughput x many subscriptions.
**Recommendation**: Cache compiled RegExp objects in a Map keyed by pattern string.

### 1.8 [LOW] Repeated .filter() Calls on Same Array

**File**: `src/validation/validation-result-aggregator.ts:309-316`

```typescript
const passRate = outcome.testCaseResults.filter(t => t.passed).length /
  (outcome.testCaseResults.length || 1);
summary.testCount += outcome.testCaseResults.length;
summary.passedTests += outcome.testCaseResults.filter(t => t.passed).length;  // 2nd pass
summary.failedTests += outcome.testCaseResults.filter(t => !t.passed).length; // 3rd pass
```

Three separate linear scans of `testCaseResults` when one loop would suffice.

**Impact**: Low (validation is not a hot path, runs at report time).
**Recommendation**: Single pass counting passed/failed.

### 1.9 [LOW] filter().map() Chains on Priority Files

**File**: `src/integrations/ruvector/fallback.ts:755-757` and `src/integrations/ruvector/coverage-router.ts:438-441`

```typescript
const p0Files = prioritizedFiles.filter((f) => f.priority === 'p0').map((f) => f.filePath);
const p1Files = prioritizedFiles.filter((f) => f.priority === 'p1').map((f) => f.filePath);
const otherFiles = prioritizedFiles.filter((f) => f.priority !== 'p0' && f.priority !== 'p1').map((f) => f.filePath);
```

Three to four passes over the same array, each creating intermediate arrays.

**Impact**: Low (file lists are typically <1000 items).
**Recommendation**: Single-pass partition using a Map by priority.

---

## 2. Memory Management

### 2.1 VERIFIED: taskTraceContexts Bounded

**File**: `src/coordination/queen-coordinator.ts:775-780`

```typescript
const MAX_TRACE_CONTEXTS = 10000;
if (this.taskTraceContexts.size >= MAX_TRACE_CONTEXTS) {
  const oldest = this.taskTraceContexts.keys().next().value;
  if (oldest !== undefined) this.taskTraceContexts.delete(oldest);
}
this.taskTraceContexts.set(taskId, context);
```

Additionally, periodic cleanup runs every 300 seconds (line 254-257). This is well-bounded.

**Status**: VERIFIED INTACT from v3.7.0

### 2.2 [MEDIUM] Correlation Map in CrossDomainRouter Has No Size Limit

**File**: `src/coordination/cross-domain-router.ts:207-243`

The `correlations` Map grows indefinitely. Each correlation entry holds an array of up to 100 events. A timeout completes entries after 60 seconds, but completed entries are never removed -- they remain in the Map permanently.

```typescript
// Line 240-243: Timeout marks complete but doesn't delete
entry.timeout = setTimeout(() => {
  entry!.complete = true;       // Marked but never cleaned up
  entry!.timeout = null;
}, this.correlationTimeout);
```

The only cleanup is `dispose()` which clears everything.

**Impact**: MEDIUM. In a long-running process with high event throughput, each unique correlationId adds a permanent entry. With 1000 events/minute each with unique correlationIds, this grows by ~1000 entries/minute with no ceiling.
**Recommendation**: Add periodic eviction of completed correlations, or delete entries after a configurable retention period.

### 2.3 [LOW] Global Embedding Cache Without TTL Eviction

**File**: `src/learning/real-embeddings.ts:71-72,184-191`

```typescript
const embeddingCache = new Map<string, { embedding: number[]; timestamp: number }>();
const CACHE_TTL_MS = 3600000; // 1 hour

// Eviction only on insertion:
if (embeddingCache.size >= fullConfig.maxCacheSize) {
  const oldestKey = embeddingCache.keys().next().value;
  if (oldestKey) embeddingCache.delete(oldestKey);
}
```

The cache is module-global (never destroyed). TTL is only checked on read, never proactively. Stale entries that are never read again persist until evicted by capacity pressure. Each 384-dim embedding is ~3KB, so 10,000 entries = ~30MB.

**Impact**: Low. Size is bounded at 10,000. But stale entries waste memory.
**Recommendation**: Add periodic sweep or check TTL during eviction.

### 2.4 VERIFIED: Process Signal Handlers Are Non-Accumulating

**Files**: `src/kernel/unified-persistence.ts:320-327`, `src/kernel/unified-memory.ts:960-962`, `src/cli/index.ts:1005-1011`

Process signal handlers are registered at module scope or during initialization, not in loops. No risk of handler accumulation.

### 2.5 VERIFIED: All setInterval Timers Have clearInterval Paths

Cross-referencing `setInterval` registrations against their corresponding `clearInterval` calls: all timers have cleanup paths in `dispose()`, `stop()`, or `destroy()` methods. No orphaned intervals detected.

---

## 3. I/O Performance

### 3.1 [MEDIUM] Synchronous File Operations in CLI Commands

Multiple CLI commands use `readFileSync`/`writeFileSync` for artifact output. These are appropriate for CLI tools (not hot paths), but some are in more performance-sensitive areas:

**Acceptable (CLI/init-time only)**:
- `src/cli/commands/ci.ts` -- 10 writeFileSync calls for CI artifacts
- `src/cli/commands/validate.ts` -- writeFileSync for report output
- `src/cli/commands/token-usage.ts` -- writeFileSync for CSV/JSON export
- `src/cli/wizards/test-wizard.ts` -- readFileSync for package.json parsing
- `src/cli/index.ts` -- readFileSync for workflow YAML loading

**Worth noting**:
- `src/coordination/handlers/coverage-handlers.ts:51` -- readFileSync inside a request handler:

```typescript
try { content = fsSync.readFileSync(filePath, 'utf-8'); } catch { /* skip */ }
```

This is a single read per request, acceptable for MCP handler usage.

**Impact**: Low. All sync I/O is in CLI or initialization paths, not in event loops or hot request handlers.

### 3.2 VERIFIED: Database Uses WAL Mode and Connection Pooling

**File**: `src/kernel/unified-memory.ts:329-334`

```typescript
this.db.pragma('journal_mode = WAL');
this.db.pragma(`mmap_size = ${this.config.mmapSize}`);
this.db.pragma(`cache_size = ${this.config.cacheSize}`);
this.db.pragma(`busy_timeout = ${this.config.busyTimeout}`);
```

SQLite is configured with WAL mode (concurrent reads), memory-mapped I/O, and busy timeout. The singleton pattern ensures one connection per process.

---

## 4. Concurrency Issues

### 4.1 Promise.all Usage Review

Found 30 `Promise.all()` call sites. All appear correct:

- Most use `Promise.allSettled` where partial failure is acceptable (e.g., cross-domain-router.ts:182)
- Load testing uses `Promise.all` with proper error boundaries in try/catch blocks
- Agent coordination uses `Promise.all` for batch shutdown (acceptable -- if one fails, they all need to stop)

No missing `await` keywords detected on Promise-returning functions.

### 4.2 [LOW] Queue-Based Pattern Processing Without Backpressure

**File**: `src/integrations/ruvector/persistent-q-router.ts:334`

```typescript
return Promise.all(tasks.map((task) => this.routeTask(task)));
```

Also at `src/integrations/ruvector/q-learning-router.ts:129` and `src/integrations/ruvector/fallback.ts:52`.

These process all tasks concurrently without concurrency limits. With large task batches, this could overwhelm downstream resources.

**Impact**: Low. Task batches are typically small (<50). But under load testing scenarios, unbounded concurrency could be problematic.
**Recommendation**: Add `pLimit` or batch-based concurrency control.

---

## 5. Bundle/Startup Performance

### 5.1 CLI Entry Point Uses Dynamic Imports for Commands

**File**: `src/cli/index.ts:954-991`

```typescript
import { createTestCommand } from './commands/test.js';
import { createCoverageCommand } from './commands/coverage.js';
// ... 14 more command imports at bottom of file
```

These imports are at the bottom of the file (lines 954-991), suggesting they were moved there intentionally. However, they are static imports, meaning all command modules are loaded at startup even for `--version` or `--help`.

**Impact**: Moderate startup overhead for simple commands. Each command module may pull in domain-specific dependencies.
**Recommendation**: Convert to dynamic `await import()` inside the command registration function, so only the invoked command loads its dependencies.

### 5.2 Lazy require() for Native Modules -- Correctly Implemented

**Files**: `src/kernel/unified-memory-hnsw.ts:30`, `src/integrations/ruvector/attention-wrapper.ts:26`, `src/integrations/ruvector/gnn-wrapper.ts:31`

All native module dependencies use lazy `require()` inside try/catch blocks. This correctly prevents startup crashes when optional native modules are unavailable.

---

## 6. Database Performance

### 6.1 Index Coverage Is Comprehensive

**File**: `src/kernel/unified-memory-schemas.ts`

Reviewed all schema definitions. The indexing strategy is thorough:

| Table | Indexes | Coverage |
|-------|---------|----------|
| kv_store | namespace, expires_at | Good -- primary lookup patterns covered |
| vectors | namespace, dimensions | Good |
| rl_q_values | agent_id, algorithm, (agent_id,state_key), domain, updated_at | Excellent |
| goap_actions | category, agent_type | Good |
| goap_plans | status | Good |
| goap_plan_signatures | goal_hash | Good |
| concept_nodes | concept_type, activation_level, pattern_id | Excellent |
| concept_edges | source, target, edge_type, weight DESC | Excellent |
| qe_patterns | qe_domain, pattern_type, tier, quality_score DESC | Excellent |
| mincut_history | timestamp DESC, mincut_value | Good |
| sona_patterns | type, domain, confidence DESC, updated_at DESC | Good |
| witness_chain | action_type, timestamp | Good |
| test_outcomes | pattern_id, generated_by, domain, created_at | Good |
| routing_outcomes | used_agent, created_at | Good |

**No missing indexes detected for frequently queried columns.**

### 6.2 SELECT * Usage

Found `SELECT *` in multiple locations. Most are acceptable:
- Point lookups by PRIMARY KEY (e.g., `SELECT * FROM sona_patterns WHERE id = ?`)
- Migration/export operations that need all columns
- Analytics queries with LIMIT clauses

No N+1 query patterns detected. All relationship loading uses JOINs or batch queries.

### 6.3 Prepared Statement Caching

**File**: `src/kernel/unified-memory.ts:230`

```typescript
private preparedStatements: Map<string, Statement> = new Map();
```

Statements are cached via a Map. This avoids repeated compilation overhead for frequently-used queries.

---

## 7. Caching Effectiveness

### 7.1 LRU Cache Implementation

**File**: `src/performance/optimizer.ts:376-481`

The LRU cache uses Map's insertion-order guarantee. Implementation is correct:
- Get: delete + re-set for LRU ordering
- Set: evict oldest when at capacity
- TTL: checked on read, expired entries removed

Default sizes: `DEFAULT_CACHE_MAX_SIZE` entries with TTL. The three protocol caches (surfaceCache, taskCache, eventCache) are properly sized.

### 7.2 [LOW] State Delta Cache Sorts Keys on Every Hash

**File**: `src/adapters/ag-ui/state-delta-cache.ts:520-523`

```typescript
private hashState(state: Record<string, unknown>): string {
  const serialized = JSON.stringify(state, Object.keys(state).sort());
  return createHash('sha256').update(serialized).digest('hex').substring(0, 16);
}
```

This calls `Object.keys().sort()` on every state hash computation, then SHA-256 hashes the result. For state objects with many keys, this adds overhead.

**Impact**: Low. State objects are typically small (<20 keys). SHA-256 dominates the cost.

### 7.3 [INFORMATIONAL] Anti-Drift Middleware History Uses shift()

**File**: `src/kernel/anti-drift-middleware.ts:399`

```typescript
if (this.history.length > this.config.maxHistorySize) this.history.shift();
```

This is a bounded array with `maxHistorySize` (typically 100-1000). The `shift()` on small arrays has negligible overhead.

### 7.4 [INFORMATIONAL] Multiple Workers Use shift() for Bounded History

**Files**: `src/workers/workers/regression-monitor.ts:89`, `src/workers/workers/quality-gate.ts:86`, `src/workers/workers/performance-baseline.ts:406`, `src/workers/base-worker.ts:124,133`

All use `shift()` on arrays bounded to 100-1000 elements. This is acceptable -- the cost of `shift()` on arrays <1000 is negligible (<0.01ms).

### 7.5 [INFORMATIONAL] CircularBuffer.percentile() Copies and Sorts

**File**: `src/shared/utils/circular-buffer.ts:62-66`

```typescript
percentile(p: number): T | undefined {
  if (this.count === 0) return undefined;
  const sorted = this.toArray().sort((a, b) => Number(a) - Number(b));
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx];
}
```

Creates a full copy then sorts it. O(n log n) per call. This is fine for occasional percentile computation but would be expensive if called frequently on large buffers.

---

## 8. Prior Fix Verification Summary

All 8 v3.7.0 fixes verified intact:

| # | Fix | File | Status |
|---|-----|------|--------|
| 1 | MinHeap for A* open set | `src/planning/goap-planner.ts` | INTACT |
| 2 | Bounded taskTraceContexts | `src/coordination/queen-coordinator.ts:775-780` | INTACT |
| 3 | State hashing optimization | `src/planning/goap-planner.ts:778-806` | IMPROVED |
| 4 | cloneState manual copy | `src/planning/goap-planner.ts:814-826` | IMPROVED |
| 5 | CircularBuffer for event history | `src/coordination/cross-domain-router.ts:50,68` | IMPROVED |
| 6 | Periodic task cleanup (300s) | `src/coordination/queen-coordinator.ts:254-257` | INTACT |
| 7 | Prototype pollution guard | `src/planning/goap-planner.ts:748-753` | INTACT |
| 8 | Module-level DANGEROUS_PROPS Set | `src/planning/goap-planner.ts` | INTACT |

---

## 9. New Issues Summary

### MEDIUM (4)

| ID | Issue | File:Line | Impact |
|----|-------|-----------|--------|
| PERF-010-01 | aggregate() materializes full CircularBuffer | `cross-domain-router.ts:250` | O(n) alloc per call, n=10K |
| PERF-010-02 | getHistory() chains multiple linear filters | `cross-domain-router.ts:298-320` | O(n*m*f) multi-pass |
| PERF-010-03 | Correlation Map never evicts completed entries | `cross-domain-router.ts:207-243` | Unbounded memory growth |
| PERF-010-04 | CLI static imports load all commands at startup | `cli/index.ts:954-991` | Startup latency for simple commands |

### LOW (7)

| ID | Issue | File:Line | Impact |
|----|-------|-----------|--------|
| PERF-010-05 | HNSW remove() indexOf+includes in nested loops | `unified-memory-hnsw.ts:396-434` | O(L*M^3), M small |
| PERF-010-06 | Regex compiled per matchEventType call | `cross-domain-router.ts:414-424` | Per-event overhead |
| PERF-010-07 | Triple .filter() on testCaseResults | `validation-result-aggregator.ts:309-316` | 3x linear scans |
| PERF-010-08 | Multi-pass filter().map() on priority files | `fallback.ts:755-757`, `coverage-router.ts:438-441` | 4x linear scans |
| PERF-010-09 | State delta cache sorts keys per hash | `state-delta-cache.ts:520-523` | Sort + SHA-256 per call |
| PERF-010-10 | Embedding cache no proactive TTL eviction | `real-embeddings.ts:71-191` | Stale entries waste ~30MB |
| PERF-010-11 | Promise.all without concurrency limit | `persistent-q-router.ts:334` et al. | Unbounded parallelism |

### INFORMATIONAL (3)

| ID | Issue | File:Line | Note |
|----|-------|-----------|------|
| PERF-010-12 | Anti-drift shift() on bounded array | `anti-drift-middleware.ts:399` | Acceptable at <1K elements |
| PERF-010-13 | Worker shift() on bounded arrays | Multiple workers | Acceptable at 100 elements |
| PERF-010-14 | CircularBuffer.percentile() sort | `circular-buffer.ts:62-66` | Acceptable if called infrequently |

---

## 10. Recommendations

### Immediate (Before Next Release)

None required. All issues are bounded and non-blocking.

### Next Sprint

1. **PERF-010-03**: Add correlation eviction. After timeout fires and marks `complete=true`, schedule a delayed deletion (e.g., 5 minutes after completion) to allow late-arriving queries.

2. **PERF-010-06**: Cache compiled RegExp in a Map keyed by pattern. Simple fix, prevents redundant regex compilation on every event.

### Future Optimization

3. **PERF-010-01/02**: Add filtered iteration to CircularBuffer to avoid full materialization.

4. **PERF-010-04**: Convert static command imports to dynamic `await import()` for faster CLI startup.

5. **PERF-010-11**: Add concurrency-limited `Promise.all` wrapper for task routing.

---

## 11. Performance Architecture Assessment

### Strengths

- **Unified SQLite with WAL**: Single DB, well-indexed, WAL mode for concurrent reads
- **CircularBuffer adoption**: Properly replaces Array+shift anti-pattern
- **Prepared statement caching**: Avoids repeated SQL compilation
- **Bounded data structures**: taskTraceContexts, worker histories, all have size limits
- **LRU cache with TTL**: Well-implemented Map-based LRU with expiry
- **Lazy native module loading**: Optional deps don't crash startup
- **Singleton patterns**: UnifiedMemoryManager, kernel -- prevent duplicate resource allocation

### Areas for Growth

- **No connection pooling for external services**: Single SQLite connection is fine, but if external DB adapters are added, pooling will be needed
- **No request-scoped resource tracking**: Long-lived Maps/Sets don't track which request created them
- **Timing-dependent tests**: 199 files noted in v3.7.0 baseline still likely present (not re-audited in this analysis -- requires separate test infrastructure review)

---

## Appendix: Methodology

1. **Algorithmic complexity**: Grep for nested loops, `.filter().map()`, `.indexOf()`/`.includes()` in loops, `.sort()` in hot paths, `Array.shift()`/`.splice(0,...)` patterns
2. **Memory management**: Grep for unbounded Map/Set/Array growth, missing cleanup in dispose/destroy, event listener registration without removal, global caches without eviction
3. **I/O**: Grep for `readFileSync`/`writeFileSync` in non-CLI code, check for buffering and pooling
4. **Concurrency**: Review `Promise.all` usage, check for missing `await`, verify error boundaries
5. **Database**: Review schema indexes against query patterns, check for `SELECT *`, N+1 patterns
6. **Caching**: Review LRU sizing, TTL enforcement, cache invalidation patterns
7. **Baseline verification**: Read each previously-fixed file to confirm fixes remain intact
