# Performance Analysis Report - Agentic QE v3.6.8

**Report ID**: PERF-2026-0216-001
**Date**: 2026-02-16
**Scope**: v3/src/ (942 TypeScript files)
**Analyst**: QE Performance Tester (V3)
**Severity Scale**: CRITICAL / HIGH / MEDIUM / LOW / INFO

---

## Executive Summary

The v3 codebase shows a mature performance posture with several prior optimizations already applied (CircularBuffer for O(1) event history, BinaryHeap in HNSW beam search, binary insertion in Queen task queues, batch SQL for vector metadata). However, this analysis identifies **23 findings** across 10 categories, including 2 critical, 5 high, 9 medium, and 7 low/informational issues. The most impactful findings are the A* open set sort-then-shift pattern in the GOAP planner and the unbounded `taskTraceContexts` Map in the Queen Coordinator.

| Severity | Count | Est. Impact |
|----------|-------|-------------|
| CRITICAL | 2 | Direct performance degradation on hot paths |
| HIGH | 5 | Measurable under load or long-running processes |
| MEDIUM | 9 | Moderate impact; optimization opportunities |
| LOW/INFO | 7 | Minor or future-proofing items |

---

## 1. Memory Leaks

### PERF-001: taskTraceContexts Map grows unbounded on trace failures [CRITICAL]

**File**: `/workspaces/agentic-qe-new/v3/src/coordination/queen-coordinator.ts` (lines 432, 791-794)

**Problem**: The `taskTraceContexts` Map stores a `TraceContext` for every submitted task. Contexts are deleted on completion (line 1469) and failure (line 1578), but if neither event fires (e.g., task times out, domain plugin drops the event, or the task is cancelled before assignment), the entry is never removed. Over hours of operation with stuck/orphaned tasks, this Map grows unbounded.

```typescript
// Line 432: No size limit, no TTL
private readonly taskTraceContexts = new Map<string, TraceContext>();

// Line 791-794: Entry added but only removed in two specific event handlers
this.taskTraceContexts.set(taskId, context);
```

**Recommendation**: Add trace context cleanup to the `cleanupCompletedTasks` method (line 2139). For each cleaned-up task, also delete from `taskTraceContexts`. Additionally, add a max-size guard (e.g., 10,000 entries) with oldest-entry eviction.

---

### PERF-002: Duplicate process exit handlers on module re-import [MEDIUM]

**File**: `/workspaces/agentic-qe-new/v3/src/kernel/unified-memory.ts` (lines 2240-2272)
**File**: `/workspaces/agentic-qe-new/v3/src/kernel/unified-persistence.ts` (lines 300-332)

**Problem**: Both `unified-memory.ts` and `unified-persistence.ts` register `process.on('SIGINT')` and `process.on('SIGTERM')` handlers at module load time. While the `exitHandlersRegistered` guard prevents double-registration within a single module, having TWO modules each register exit handlers means 4 extra process listeners. Node.js warns at 11 listeners (MaxListenersExceededWarning). Combined with CLI commands, MCP entry, and token-bootstrap also registering handlers (6 more locations found), this approaches the warning threshold.

**Recommendation**: Consolidate all process exit cleanup into a single `registerProcessCleanup()` utility in `shared/`. Call it once from the kernel initialization rather than at module load time.

---

### PERF-003: WorkerManager timers not unreffed [LOW]

**File**: `/workspaces/agentic-qe-new/v3/src/workers/worker-manager.ts` (line 420-441)

**Problem**: `scheduleNextRun` uses `setTimeout` but does not call `.unref()` on the returned timer. This means active worker timers will prevent the Node.js process from exiting gracefully. Other timers in the codebase (queen cleanup, hybrid backend cleanup) correctly call `.unref()`.

**Recommendation**: Add `.unref()` to the timer returned by `setTimeout` in `scheduleNextRun`, consistent with the pattern used elsewhere.

---

## 2. Algorithmic Complexity

### PERF-004: GOAP A* open set uses sort-then-shift O(n log n) per iteration [CRITICAL]

**File**: `/workspaces/agentic-qe-new/v3/src/planning/goap-planner.ts` (lines 340-344)

**Problem**: The A* search loop sorts the entire open set on every iteration to extract the minimum-cost node. With `maxIterations = 10000` and potentially thousands of nodes in the open set, this is O(k * n log n) total where k is iterations and n is open set size. This is the single most expensive hot path in the planner.

```typescript
while (openSet.length > 0 && iterations < maxIterations) {
  iterations++;
  openSet.sort((a, b) => a.f - b.f);  // O(n log n) per iteration!
  const current = openSet.shift()!;     // O(n) shift
```

**Recommendation**: Replace with a `BinaryHeap` (min-heap by f-score), which is already implemented in `unified-memory.ts` (lines 760-824). This would reduce extraction to O(log n) per iteration. The same `BinaryHeap` class was used to fix the HNSW beam search -- apply the same pattern here.

---

### PERF-005: A* duplicate state check via linear scan of open set [HIGH]

**File**: `/workspaces/agentic-qe-new/v3/src/planning/goap-planner.ts` (lines 398-399)

**Problem**: Checking for existing nodes with the same state hash requires a linear scan of the open set (`findIndex` with `hashState` call per element). With the open set growing to hundreds of nodes, this is O(n) per action per iteration.

```typescript
const existingIdx = openSet.findIndex(
  (n) => this.hashState(n.state) === newStateKey
);
```

**Recommendation**: Maintain a `Map<string, number>` mapping state hashes to their position/cost in the open set. This converts the lookup from O(n) to O(1). When removing/updating nodes, update the map accordingly.

---

### PERF-006: hashState uses JSON.stringify for state hashing [MEDIUM]

**File**: `/workspaces/agentic-qe-new/v3/src/planning/goap-planner.ts` (lines 726-753)

**Problem**: `hashState` constructs an object and serializes it with `JSON.stringify` on every call. It is called once per state deduplication check, which happens for every action expansion in A*. With ~20 actions per iteration and ~1000 iterations, this is ~20,000 JSON.stringify calls per planning run.

**Recommendation**: Use a numeric hash function instead of JSON.stringify. Combine the rounded numeric values into a single integer hash or use a FNV-1a hash over the concatenated string values. Pre-compute the array join for `availableAgents`.

---

### PERF-007: cloneState uses JSON.parse(JSON.stringify()) [MEDIUM]

**File**: `/workspaces/agentic-qe-new/v3/src/planning/goap-planner.ts` (line 759)
**File**: `/workspaces/agentic-qe-new/v3/src/planning/plan-executor.ts` (line 1026)

**Problem**: Deep cloning via JSON round-trip is the slowest cloning method. For the V3WorldState object (which has a known, fixed structure), a structured clone or manual spread would be 5-10x faster.

```typescript
private cloneState(state: V3WorldState): V3WorldState {
  return JSON.parse(JSON.stringify(state));
}
```

**Recommendation**: Implement a manual `cloneState` that spreads each nested object explicitly. The V3WorldState has only 4 top-level properties (`coverage`, `quality`, `fleet`, `resources`, `context`) with shallow nesting -- a manual clone is trivial and avoids serialization overhead.

---

### PERF-008: removeFromQueues scans ALL domain queues [MEDIUM]

**File**: `/workspaces/agentic-qe-new/v3/src/coordination/queen-coordinator.ts` (lines 1954-1964)

**Problem**: `removeFromQueues` iterates over ALL_DOMAINS (14 domains) and calls `findIndex` on each queue, even for domains the task was never added to. With frequent task completion, this creates unnecessary O(14 * n) scans.

```typescript
for (const domain of ALL_DOMAINS) {
  const domainQueue = this.domainQueues.get(domain);
  if (domainQueue) {
    const idx = domainQueue.findIndex(t => t.id === task.id);
    if (idx !== -1) { domainQueue.splice(idx, 1); }
  }
}
```

**Recommendation**: Only scan the task's `targetDomains` instead of `ALL_DOMAINS`. The task object already has `targetDomains` which lists exactly which domain queues it was added to.

---

### PERF-009: getRunningTaskCount and getQueuedTaskCount are O(n) each [MEDIUM]

**File**: `/workspaces/agentic-qe-new/v3/src/coordination/queen-coordinator.ts` (lines 2018-2028)

**Problem**: Both methods convert the entire tasks Map to an array and filter it. They are called from `getHealth()` and `processQueue()` which are invoked frequently. With thousands of tasks over time (before cleanup), this is wasteful.

```typescript
private getRunningTaskCount(): number {
  return Array.from(this.tasks.values())
    .filter(t => t.status === 'running' || t.status === 'assigned')
    .length;
}
```

**Recommendation**: `runningTaskCounter` already exists as an atomic counter. Use it directly instead of recomputing. For queued count, maintain a similar counter or sum the priority queue lengths.

---

### PERF-010: UniformReplayBuffer uses shift() for eviction [LOW]

**File**: `/workspaces/agentic-qe-new/v3/src/neural-optimizer/replay-buffer.ts` (line 401)

**Problem**: `UniformReplayBuffer.push` calls `this.buffer.shift()` when at capacity, which is O(n) for arrays. At high buffer capacities (e.g., 10,000), this becomes noticeable.

```typescript
push(experience: Experience): void {
  if (this.buffer.length >= this.capacity) {
    this.buffer.shift();  // O(n)
  }
  this.buffer.push(experience);
}
```

**Recommendation**: Use a circular buffer (write index wrapping around) for O(1) insertion, matching the pattern used in the PrioritizedReplayBuffer.

---

## 3. Database Performance

### PERF-011: Event history getHistory performs up to 5 sequential filter passes [MEDIUM]

**File**: `/workspaces/agentic-qe-new/v3/src/kernel/event-bus.ts` (lines 229-255)

**Problem**: `getHistory` converts the CircularBuffer to an array, then applies up to 5 separate `.filter()` calls sequentially. Each pass creates a new array. For a history size of 1,000 events with all filters active, this allocates 5 intermediate arrays.

```typescript
let events = this.eventHistory.toArray();
if (filter.eventTypes?.length) {
  events = events.filter((e) => filter.eventTypes!.includes(e.type));
}
if (filter.sources?.length) {
  events = events.filter((e) => filter.sources!.includes(e.source));
}
// ... 3 more filter passes
```

**Recommendation**: Combine all filter conditions into a single pass with a compound predicate function. This reduces from O(5n) to O(n) with no intermediate allocations.

---

### PERF-012: SQLite prepared statement cache not used for frequent KV operations [MEDIUM]

**File**: `/workspaces/agentic-qe-new/v3/src/kernel/unified-memory.ts` (lines 1576-1601)

**Problem**: The `kvSet` and `kvGet` methods create ad-hoc prepared statements on every call via `this.db!.prepare(...)`. While better-sqlite3 internally caches prepared statements, the pattern bypasses the explicit `preparedStatements` Map that exists for this purpose (line 2053-2062). Explicit caching provides a more predictable fast path.

**Recommendation**: Use `this.prepare('kv_set', sql)` for the 6 KV operations (`kvSet`, `kvGet`, `kvDelete`, `kvExists`, `kvSearch`, `kvCleanupExpired`). This ensures the statement is compiled exactly once and reused.

---

### PERF-013: kv_store retention uses subquery DELETE which can be slow [LOW]

**File**: `/workspaces/agentic-qe-new/v3/src/kernel/hybrid-backend.ts` (lines 386-393)

**Problem**: The retention cleanup query uses a correlated subquery (`WHERE rowid NOT IN (SELECT rowid FROM kv_store ORDER BY rowid DESC LIMIT 5000)`). On large tables, this subquery executes a full table scan.

**Recommendation**: Use a two-step approach: first query the rowid threshold with `SELECT rowid FROM kv_store ORDER BY rowid DESC LIMIT 1 OFFSET 4999`, then `DELETE FROM kv_store WHERE rowid < ?`. This is O(1) for the threshold lookup (using the rowid index) and O(deleted) for the actual deletion.

---

## 4. I/O Bottlenecks

### PERF-014: findProjectRoot calls fs.existsSync up to 3x per directory level [HIGH]

**File**: `/workspaces/agentic-qe-new/v3/src/kernel/unified-memory.ts` (lines 60-110)

**Problem**: `findProjectRoot` walks up the directory tree checking for `.agentic-qe`, `.git`, and `package.json` in three separate loops. Each level involves synchronous filesystem calls. In a deep project tree (e.g., 10 levels), this means up to 30 `fs.existsSync` calls during initialization. Since this function is called by both `UnifiedMemoryManager` and `UnifiedPersistenceManager` constructors, it runs at least twice per startup.

```typescript
// Loop 1: Walk up looking for .agentic-qe (all levels)
while (checkDir !== root) { fs.existsSync(path.join(checkDir, '.agentic-qe')); ... }
// Loop 2: Walk up looking for .git (all levels)
while (checkDir !== root) { fs.existsSync(path.join(checkDir, '.git')); ... }
// Loop 3: Walk up looking for package.json (all levels)
while (checkDir !== root) { fs.existsSync(path.join(checkDir, 'package.json')); ... }
```

**Recommendation**: Combine all three checks into a single upward walk. At each level, check all three markers simultaneously. Cache the result in a module-level variable so subsequent calls return immediately. The `AQE_PROJECT_ROOT` env var fast path already exists -- ensure it is set during init to avoid re-walking.

---

### PERF-015: Synchronous fs operations in Kernel constructor [HIGH]

**File**: `/workspaces/agentic-qe-new/v3/src/kernel/kernel.ts` (lines 88-94)

**Problem**: The `QEKernelImpl` constructor calls `findProjectRoot()` (which uses `fs.existsSync` synchronously), then calls `fs.existsSync` and `fs.mkdirSync` synchronously. Constructor-time I/O blocks the event loop and makes the kernel construction time unpredictable.

```typescript
constructor(config: Partial<KernelConfig> = {}) {
  const projectRoot = findProjectRoot();           // sync I/O
  const dataDir = this._config.dataDir || path.join(projectRoot, '.agentic-qe');
  if (!fs.existsSync(dataDir)) {                   // sync I/O
    fs.mkdirSync(dataDir, { recursive: true });    // sync I/O
  }
```

**Recommendation**: Move directory creation to the async `initialize()` method. The constructor should only store configuration; all I/O should be deferred to initialization.

---

### PERF-016: discoverSourceFiles uses recursive walkDir without concurrency [LOW]

**File**: `/workspaces/agentic-qe-new/v3/src/coordination/task-executor.ts` (lines 1005-1074)

**Problem**: `discoverSourceFiles` recursively walks directories using `await walkDir(fullPath)` sequentially. For large codebases with thousands of files across deep directory trees, this is slower than necessary.

**Recommendation**: Use `fs.promises.readdir` with `{ withFileTypes: true, recursive: true }` (Node.js 20+) for a single-call recursive listing, or batch subdirectory walks with `Promise.all` for parallel I/O.

---

## 5. Concurrency Issues

### PERF-017: Module-level service caches in task-executor are shared mutable state [HIGH]

**File**: `/workspaces/agentic-qe-new/v3/src/coordination/task-executor.ts` (lines 109-118)

**Problem**: Service instances (`coverageAnalyzer`, `securityScanner`, etc.) are cached in module-level variables. If multiple `DomainTaskExecutor` instances are created with different kernels (e.g., in tests or multi-tenant scenarios), they share the same service instances, which were initialized with the first kernel's memory backend. This causes cross-contamination.

```typescript
let coverageAnalyzer: CoverageAnalyzerService | null = null;
let securityScanner: SecurityScannerService | null = null;
// ... shared across all DomainTaskExecutor instances
```

**Recommendation**: Move service caches into the `DomainTaskExecutor` class as instance properties. The `resetServiceCaches` function already exists but requires manual invocation -- making caches instance-scoped eliminates the issue structurally.

---

### PERF-018: WorkStealing timer async callback lacks error boundary [MEDIUM]

**File**: `/workspaces/agentic-qe-new/v3/src/coordination/queen-coordinator.ts` (lines 2036-2039)

**Problem**: The `startWorkStealing` method uses `setInterval` with an async callback. If `triggerWorkStealing` throws an unhandled rejection, it will emit an `unhandledRejection` event but the timer continues. There is no error boundary or backoff.

```typescript
private startWorkStealing(): void {
  this.workStealingTimer = setInterval(async () => {
    await this.triggerWorkStealing(); // unhandled rejection risk
  }, this.config.workStealing.checkInterval);
}
```

**Recommendation**: Wrap the callback in a try/catch with error logging. Add exponential backoff if consecutive work-stealing attempts fail.

---

## 6. Resource Management

### PERF-019: HNSW index rebuilds from scratch on vector load [MEDIUM]

**File**: `/workspaces/agentic-qe-new/v3/src/kernel/unified-memory.ts` (lines 1544-1561)

**Problem**: `loadVectorIndex` loads all vectors from SQLite and inserts them one-by-one into the HNSW index. Each insertion is O(log n) with HNSW, making the total load O(n log n). For 10,000+ vectors, this takes seconds and blocks the first search request.

**Recommendation**: Consider serializing the HNSW graph structure to disk (as a BLOB in SQLite) and restoring it directly, converting startup from O(n log n) to O(n). Alternatively, build the index in a background microtask to avoid blocking.

---

## 7. Caching Opportunities

### PERF-020: getDomainLoad recomputes running tasks via full Map scan [LOW]

**File**: `/workspaces/agentic-qe-new/v3/src/coordination/queen-coordinator.ts` (lines 929-934)

**Problem**: `getDomainLoad` is called multiple times during work stealing (for every idle and busy domain check). Each call filters the entire tasks Map.

```typescript
getDomainLoad(domain: DomainName): number {
  const queue = this.domainQueues.get(domain) || [];
  const runningTasks = Array.from(this.tasks.values())
    .filter(t => t.assignedDomain === domain && t.status === 'running');
  return queue.length + runningTasks.length;
}
```

**Recommendation**: Maintain a `Map<DomainName, number>` counter for running tasks per domain, incrementing on assignment and decrementing on completion/failure. This converts each call from O(n) to O(1).

---

### PERF-021: setStateValue creates dangerousProps Set on every call [LOW]

**File**: `/workspaces/agentic-qe-new/v3/src/planning/goap-planner.ts` (line 673)

**Problem**: The prototype pollution guard creates `new Set(['__proto__', 'constructor', 'prototype'])` on every invocation. During A* search, `setStateValue` is called thousands of times via `applyEffect`.

**Recommendation**: Hoist the `dangerousProps` Set to a module-level constant (it never changes).

---

## 8. Async Anti-patterns

### PERF-022: Fire-and-forget async in metrics collection interval [LOW]

**File**: `/workspaces/agentic-qe-new/v3/src/coordination/queen-coordinator.ts` (lines 2042-2087)

**Problem**: The `startMetricsCollection` interval callback is async but the `setInterval` does not handle rejections. If `memory.set` fails or `dynamicScaler.execute` throws, the rejection is unhandled. The internal `try/catch` blocks mitigate some cases but not all paths (e.g., `this.memory.set` on line 2047 is not wrapped).

**Recommendation**: Wrap the entire interval callback body in a top-level try/catch.

---

## 9. Bundle Size

### PERF-023: 14 domain plugin factories imported eagerly in kernel.ts [INFO]

**File**: `/workspaces/agentic-qe-new/v3/src/kernel/kernel.ts` (lines 30-43)

**Problem**: All 14 domain plugin factories are imported at the top of `kernel.ts`, even though `lazyLoading: true` is the default. This means the module graph for all 14 domains is resolved at import time, increasing startup bundle size and initialization time.

```typescript
import { createTestGenerationPlugin } from '../domains/test-generation/plugin';
import { createTestExecutionPlugin } from '../domains/test-execution/plugin';
// ... 12 more imports
```

**Recommendation**: Use dynamic `import()` inside the factory registration lambda when `lazyLoading` is enabled. This defers module resolution until the domain is actually requested.

---

## 10. Hot Path Analysis

### Hot Path 1: Event Bus publish()

**File**: `/workspaces/agentic-qe-new/v3/src/kernel/event-bus.ts`
**Verdict**: Well-optimized. Uses O(1) subscription indexes, CircularBuffer for history, and `Promise.allSettled` for concurrent handler execution. The middleware chain is linear but typically has only 1-2 middlewares. No action needed.

### Hot Path 2: KV Store get/set

**File**: `/workspaces/agentic-qe-new/v3/src/kernel/unified-memory.ts`
**Verdict**: Good. Uses SQLite with WAL mode, mmap, and proper indexing. The main optimization opportunity is prepared statement caching (PERF-012).

### Hot Path 3: Vector search

**File**: `/workspaces/agentic-qe-new/v3/src/kernel/unified-memory.ts`
**Verdict**: Well-optimized. HNSW provides O(log n) ANN search. BinaryHeap replaces sorted arrays in beam search. Batch SQL query for metadata enrichment avoids N+1. Lazy loading defers index build until first search. The main concern is the one-time O(n log n) index load (PERF-019).

### Hot Path 4: Task submission and assignment

**File**: `/workspaces/agentic-qe-new/v3/src/coordination/queen-coordinator.ts`
**Verdict**: Good. Binary insertion for task queuing (O(log n)). Atomic counter for concurrency control. The main concern is the O(n) domain load computation (PERF-020) and O(14n) removeFromQueues (PERF-008).

### Hot Path 5: GOAP planning A* search

**File**: `/workspaces/agentic-qe-new/v3/src/planning/goap-planner.ts`
**Verdict**: Needs optimization. The sort-then-shift pattern (PERF-004) and linear state lookup (PERF-005) are the two highest-impact findings in this report. Plan reuse mitigates some cases but does not eliminate the hot path.

---

## Summary of Recommendations by Priority

### Immediate (CRITICAL)

| ID | Fix | Estimated Effort | Impact |
|----|-----|-----------------|--------|
| PERF-004 | Replace A* open set sort+shift with BinaryHeap | 2 hours | 10-50x speedup for GOAP planning |
| PERF-001 | Add trace context cleanup + max-size guard | 1 hour | Prevents OOM in long-running Queen |

### High Priority

| ID | Fix | Estimated Effort | Impact |
|----|-----|-----------------|--------|
| PERF-005 | Add state hash Map for A* open set lookups | 1 hour | O(1) vs O(n) per expansion |
| PERF-014 | Combine findProjectRoot into single walk + cache | 1 hour | 3x fewer sync I/O calls at startup |
| PERF-015 | Move sync I/O from kernel constructor to initialize() | 30 min | Non-blocking construction |
| PERF-017 | Move service caches from module-level to instance | 1 hour | Eliminates cross-contamination |
| PERF-018 | Add error boundary to work-stealing interval | 30 min | Prevents unhandled rejections |

### Medium Priority

| ID | Fix | Estimated Effort | Impact |
|----|-----|-----------------|--------|
| PERF-002 | Consolidate process exit handlers | 1 hour | Fewer process listeners |
| PERF-006 | Numeric hash function for state hashing | 1 hour | ~5x faster hashing |
| PERF-007 | Manual cloneState for V3WorldState | 30 min | ~5x faster deep clone |
| PERF-008 | Scope removeFromQueues to targetDomains | 15 min | 14x fewer queue scans |
| PERF-009 | Use existing atomic counter for running task count | 15 min | O(1) vs O(n) |
| PERF-011 | Single-pass event history filtering | 30 min | 5x fewer array allocations |
| PERF-012 | Use prepared statement cache for KV ops | 30 min | Faster SQL execution |
| PERF-019 | Background HNSW index build | 2 hours | Non-blocking first search |
| PERF-022 | Top-level try/catch in metrics interval | 15 min | Prevents unhandled rejections |

### Low Priority

| ID | Fix | Estimated Effort | Impact |
|----|-----|-----------------|--------|
| PERF-003 | unref() on worker timers | 5 min | Clean process exit |
| PERF-010 | Circular buffer for UniformReplayBuffer | 30 min | O(1) vs O(n) eviction |
| PERF-013 | Two-step kv_store retention DELETE | 30 min | Faster cleanup |
| PERF-016 | Concurrent directory walking | 1 hour | Faster file discovery |
| PERF-020 | Per-domain running task counter | 30 min | O(1) load queries |
| PERF-021 | Hoist dangerousProps Set to module level | 5 min | Eliminates repeated allocation |
| PERF-023 | Dynamic imports for lazy domain loading | 2 hours | Faster cold start |

---

## Positive Findings (Already Optimized)

The following areas demonstrate good performance engineering practices already in place:

1. **CircularBuffer** for event history (O(1) push, bounded memory) -- `event-bus.ts`
2. **BinaryHeap** for HNSW beam search (O(log n) insert/extract) -- `unified-memory.ts`
3. **Binary insertion** for Queen task queues (O(log n) vs O(n log n) sort) -- `queen-coordinator.ts`
4. **Batch SQL** for vector metadata enrichment (single query vs N+1) -- `unified-memory.ts`
5. **Lazy vector index loading** (deferred from startup to first search) -- `unified-memory.ts`
6. **Subscription indexes** for O(1) event type/channel lookup -- `event-bus.ts`
7. **Atomic task counter** for concurrent task tracking -- `queen-coordinator.ts`
8. **Task cleanup timer** with retention period -- `queen-coordinator.ts`
9. **SumTree** for O(log n) priority sampling in replay buffer -- `replay-buffer.ts`
10. **WAL mode + mmap** for SQLite performance -- `unified-memory.ts`
11. **Prepared statement caching** infrastructure (exists, partially used) -- `unified-memory.ts`
12. **Timer .unref()** pattern consistently applied for cleanup intervals

---

## Test Methodology

This analysis was conducted through static code review of the v3/src/ directory, examining:

- All files in `kernel/`, `coordination/`, `workers/`, `hooks/`, `neural-optimizer/`, `optimization/`, `performance/`, `planning/`, and `memory/` modules
- Pattern searches across all 942 TypeScript files for known anti-patterns
- Cross-referencing with existing performance fixes (MEM-001, MEM-002, CC-002, PERF-001, PAP-003)
- Algorithmic complexity analysis of hot path code
- Resource lifecycle tracking (timers, handlers, connections)

---

*Report generated by QE Performance Tester v3 -- 2026-02-16*
