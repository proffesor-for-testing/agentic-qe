# V3 Performance Review Report

**Version**: v3.6.3
**Date**: 2026-02-11
**Reviewer**: QE Performance Reviewer (V3 Agent - chaos-resilience domain)
**Scope**: `/workspaces/agentic-qe-new/v3/src/` (full codebase)

---

## Executive Summary

This report presents a comprehensive performance analysis of the Agentic QE v3 platform codebase across five dimensions: algorithmic complexity, memory usage patterns, I/O performance, concurrency and parallelism, and startup performance. The analysis covered 16+ critical source files across 7 key subsystems (kernel, coordination, coverage-analysis, MCP, learning, embeddings, routing).

**Overall Assessment: MODERATE RISK -- 3 critical hotspots, 5 high-severity issues, 7+ medium-severity concerns.**

The architecture is generally well-designed with proper use of Maps, Sets, CircularBuffers, and indexed lookups. However, several performance-critical paths contain suboptimal data structure choices that degrade from O(log n) to O(n) or O(n^2), and multiple N+1 query patterns exist in the persistence layer. The most impactful issues are concentrated in the HNSW search implementation (hot path), graph analysis utilities, and vector metadata retrieval.

**Estimated production impact if top 3 issues are fixed**: 10-100x improvement in vector search latency, elimination of database round-trip overhead for metadata retrieval, and safe scaling of graph analysis beyond 1,000 vertices.

---

## Top 10 Performance Hotspots

| Rank | Severity | File | Issue | Complexity | Impact |
|------|----------|------|-------|------------|--------|
| 1 | CRITICAL | `kernel/unified-memory.ts:734-806` | `searchLayerBeam` uses array splice instead of heap | O(n) per insert vs O(log n) | Every HNSW search degraded |
| 2 | CRITICAL | `coordination/mincut/mincut-calculator.ts:219-249` | `findPartitioningPoints` clones entire graph per vertex | O(V * (V+E)) | Stack overflow risk at scale |
| 3 | CRITICAL | `kernel/unified-memory.ts:1522-1567` | `vectorSearch` N+1 queries for metadata | O(n) DB round-trips | Linear DB load growth |
| 4 | HIGH | `learning/dream/spreading-activation.ts:420-452` | `findNovelAssociations` nested loop over active nodes | O(n^2) | Dream cycle slowdown |
| 5 | HIGH | `integrations/embeddings/cache/EmbeddingCache.ts:290-314` | `evictLRU` scans entire cache | O(n) per eviction | Cache thrashing under load |
| 6 | HIGH | `domains/coverage-analysis/services/hnsw-index.ts:359` | Dual vector storage (ruvector + local Map) | 2x memory | OOM risk for large indices |
| 7 | HIGH | `kernel/unified-memory.ts:52-95` | `findProjectRoot` synchronous fs walks | Blocking I/O | Event loop blocked at init |
| 8 | HIGH | `kernel/unified-memory.ts:1353-1368` | `loadVectorIndex` loads ALL vectors at startup | O(n) memory + time | Slow cold start |
| 9 | MEDIUM | `mcp/connection-pool.ts:184-222` | Linear scan for idle connections | O(n) per acquire | Pool bottleneck under concurrency |
| 10 | MEDIUM | `learning/pattern-store.ts:446-475` | `loadPatterns` N+1 individual `memory.get()` calls | O(n) DB round-trips | Slow pattern loading |

---

## 1. Algorithmic Complexity Analysis

### 1.1 CRITICAL: HNSW searchLayerBeam -- O(n) Array Splice in Hot Path

**File**: `/workspaces/agentic-qe-new/v3/src/kernel/unified-memory.ts` (lines 734-806)

The `InMemoryHNSWIndex.searchLayerBeam()` method is called on **every** vector search operation. It maintains candidate and result lists as sorted arrays, using `Array.splice()` to insert elements in sorted order. Each `splice()` call shifts all subsequent elements, making insertion O(n) instead of O(log n) with a proper min-heap or priority queue.

**Current pattern (simplified)**:
```typescript
// O(n) insertion into sorted array via splice
const insertIdx = candidates.findIndex(c => c.distance > distance);
if (insertIdx === -1) {
  candidates.push({ id: neighborId, distance });
} else {
  candidates.splice(insertIdx, 0, { id: neighborId, distance });
}
```

**Recommended fix**: Replace sorted arrays with a binary heap (min-heap for candidates, max-heap for results). This changes per-insertion cost from O(n) to O(log n).

```typescript
// O(log n) insertion with binary heap
class MinHeap<T> {
  private data: T[] = [];
  constructor(private compare: (a: T, b: T) => number) {}
  push(item: T): void { /* heapify-up O(log n) */ }
  pop(): T | undefined { /* heapify-down O(log n) */ }
  peek(): T | undefined { return this.data[0]; }
  get size(): number { return this.data.length; }
}
```

**Impact estimate**: For an index with 10,000 vectors and ef=200 beam width, this reduces per-search operations from ~40,000 element shifts to ~1,500 heap operations -- roughly **25x improvement** in search latency.

---

### 1.2 CRITICAL: findPartitioningPoints -- O(V * (V+E)) Graph Cloning

**File**: `/workspaces/agentic-qe-new/v3/src/coordination/mincut/mincut-calculator.ts` (lines 219-249)

The `findPartitioningPoints()` method identifies articulation points by cloning the **entire graph** for each vertex and testing connectivity after removal. This is O(V * (V+E)) instead of O(V+E) with Tarjan's algorithm.

**Current approach**:
```typescript
for (const vertex of vertices) {
  const testGraph = this.graph.clone();  // O(V+E) clone
  testGraph.removeVertex(vertex);        // O(V) removal
  if (!this.isConnected(testGraph)) {    // O(V+E) BFS
    articulationPoints.push(vertex);
  }
}
// Total: O(V * (V+E))
```

**Recommended fix**: Use Tarjan's bridge-finding algorithm which computes all articulation points in a single DFS pass -- O(V+E).

**Impact estimate**: For a 100-vertex graph with 500 edges, current approach does ~60,000 operations. Tarjan's does ~600. At 1,000 vertices, current approach becomes unusable (~10M operations) while Tarjan's stays at ~6,000. **100-1000x improvement**.

Additionally, line 128 uses `Math.min(...degrees.values())` with the spread operator. For graphs with >10,000 vertices, this will exceed the JavaScript call stack limit and throw a RangeError.

**Fix**: Replace with iterative min:
```typescript
let minDegree = Infinity;
for (const d of degrees.values()) {
  if (d < minDegree) minDegree = d;
}
```

---

### 1.3 HIGH: findNovelAssociations -- O(n^2) Nested Loop

**File**: `/workspaces/agentic-qe-new/v3/src/learning/dream/spreading-activation.ts` (lines 420-452)

The `findNovelAssociations()` method compares all pairs of active nodes using a nested loop:

```typescript
for (let i = 0; i < activeNodes.length; i++) {
  for (let j = i + 1; j < activeNodes.length; j++) {
    // Check co-activation
  }
}
```

With the `MAX_ACTIVATION_HISTORY_ENTRIES` of 10,000, this could produce up to 50 million pair comparisons per dream cycle. In practice, active node counts are typically lower, but under heavy load this becomes a bottleneck.

**Recommended fix**: Use a locality-sensitive hashing (LSH) approach or spatial indexing to find nearby activations, reducing to O(n log n) or O(n) expected time. Alternatively, cap the active node set to a fixed maximum (e.g., 500) before pairwise comparison.

---

### 1.4 HIGH: trimCoActivationCounts -- O(n log n) Full Sort

**File**: `/workspaces/agentic-qe-new/v3/src/learning/dream/spreading-activation.ts` (lines 518-533)

When the co-activation map exceeds `MAX_COACTIVATION_ENTRIES` (50,000), the trim operation sorts ALL entries to find the least-frequent ones to remove:

```typescript
const sorted = Array.from(this.coActivationCounts.entries())
  .sort((a, b) => a[1] - b[1]);
```

**Recommended fix**: Use a partial selection algorithm (quickselect) to find the k-th smallest in O(n), or maintain a min-heap of size k alongside the map for O(1) identification of eviction candidates.

---

### 1.5 MEDIUM: O(n) Linear Scans in SwarmGraph Adjacency Operations

**File**: `/workspaces/agentic-qe-new/v3/src/coordination/mincut/swarm-graph.ts`

Multiple methods use linear search on adjacency lists:

| Method | Line | Operation | Complexity |
|--------|------|-----------|------------|
| `addToAdjacency` | 480 | `adjacency.find()` duplicate check | O(degree) |
| `removeFromAdjacency` | 493 | `findIndex()` + `splice()` | O(degree) |
| `removeVertex` | 75-98 | Iterates ALL adjacency lists | O(V * avg_degree) |

**Recommended fix**: Store adjacency as `Map<string, Set<{target, weight}>>` with a parallel `Map<string, Map<string, EdgeEntry>>` for O(1) lookup by target. This trades memory for O(1) edge existence checks.

---

### 1.6 MEDIUM: generateUncoveredLineEstimate -- O(n^2) Array.includes

**File**: `/workspaces/agentic-qe-new/v3/src/domains/coverage-analysis/services/sublinear-analyzer.ts` (line 692)

The `generateUncoveredLineEstimate` method uses `lines.includes(line)` inside a loop, resulting in O(n^2) for large uncovered line sets. Should use a Set for O(1) lookups.

---

### 1.7 MEDIUM: detectDomainsFromMessage -- O(D * K * L) String Scanning

**File**: `/workspaces/agentic-qe-new/v3/src/mcp/tool-registry.ts` (lines 510-524)

Iterates all 14 domains with ~15 keywords each, calling `lowerMessage.includes()` for each keyword. Each `includes()` is O(L) where L is message length.

**Current**: O(14 * 15 * L) = O(210 * L) per message.

**Recommended fix**: Build a single Aho-Corasick automaton or trie from all keywords for O(L + matches) single-pass matching. For the current scale (~210 keywords), this is not critical but would matter if domains/keywords grow.

---

### 1.8 Verified O(log n) Claims

| Component | Claim | Verified | Notes |
|-----------|-------|----------|-------|
| HNSW Index (ruvector wrapper) | O(log n) search | PARTIAL | Layer traversal is O(log n) but `searchLayerBeam` splice degrades to O(n) |
| Sublinear Analyzer | O(log n) gap detection | PARTIAL | Sampling is O(sqrt(n)), but `lines.includes` introduces O(n^2) |
| CircularBuffer (event-bus) | O(1) insert | YES | Proper ring buffer implementation |
| Task Classifier | O(1) classification | YES | Fixed factor count, no data-dependent loops |

---

## 2. Memory Usage Patterns

### 2.1 HIGH: Dual Vector Storage -- 2x Memory for HNSW Vectors

**File**: `/workspaces/agentic-qe-new/v3/src/domains/coverage-analysis/services/hnsw-index.ts` (line 359)

Every vector inserted into the HNSW index is stored in **both** the ruvector native index AND a local `vectorStore: Map<string, number[]>`. The local store exists for "backward compatibility" cosine similarity computation. For 10,000 vectors of dimension 384, this wastes approximately:

- 10,000 * 384 * 8 bytes (Float64) = **30.7 MB** of duplicated vector data

**Recommended fix**: Remove the local `vectorStore` and use the ruvector index's built-in similarity computation, or implement a thin retrieval wrapper around ruvector.

---

### 2.2 HIGH: loadVectorIndex Loads All Vectors Into Memory

**File**: `/workspaces/agentic-qe-new/v3/src/kernel/unified-memory.ts` (lines 1353-1368)

At startup, `loadVectorIndex()` executes `SELECT id, vector FROM vectors` loading **every** vector into the in-memory HNSW index. For a mature system with 100,000+ vectors:

- Memory: 100,000 * 384 * 8 = **307 MB** just for vectors
- Time: Sequential insertion of 100,000 vectors into HNSW (each O(log n) with correct heap, currently O(n))

**Recommended fix**: Implement lazy loading with LRU eviction. Load vectors on-demand during search, keeping only the most recently accessed vectors in the in-memory index. Alternatively, use a memory-mapped HNSW library (like hnswlib-node which supports persistence).

---

### 2.3 HIGH: EmbeddingCache O(n) LRU Eviction

**File**: `/workspaces/agentic-qe-new/v3/src/integrations/embeddings/cache/EmbeddingCache.ts` (lines 290-314)

The `evictLRU()` method iterates the **entire** cache Map to find the least-recently-used entry:

```typescript
private evictLRU(): void {
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, entry] of this.cache) {
    if (entry.lastAccessed < oldestTime) {
      oldestTime = entry.lastAccessed;
      oldestKey = key;
    }
  }
  if (oldestKey) this.cache.delete(oldestKey);
}
```

This is O(n) per eviction. Under cache pressure (cache full, new entries arriving), every insertion triggers an O(n) scan.

**Recommended fix**: Use a doubly-linked list with a Map for O(1) LRU eviction:

```typescript
class LRUCache<K, V> {
  private map = new Map<K, Node<K, V>>();
  private head: Node<K, V> | null = null; // most recent
  private tail: Node<K, V> | null = null; // least recent

  get(key: K): V | undefined { /* move to head, O(1) */ }
  set(key: K, value: V): void { /* add to head, evict tail if full, O(1) */ }
}
```

---

### 2.4 MEDIUM: Unbounded Experience Buffer in Dream Scheduler

**File**: `/workspaces/agentic-qe-new/v3/src/learning/dream/dream-scheduler.ts`

The `experienceBuffer: TaskExperience[]` grows unboundedly between dream cycles. If dream cycles are delayed or disabled, this array grows without limit.

**Recommended fix**: Add a maximum buffer size with oldest-first eviction:
```typescript
private static readonly MAX_EXPERIENCE_BUFFER = 10000;
addExperience(exp: TaskExperience): void {
  this.experienceBuffer.push(exp);
  if (this.experienceBuffer.length > DreamScheduler.MAX_EXPERIENCE_BUFFER) {
    this.experienceBuffer.shift(); // or use circular buffer
  }
}
```

---

### 2.5 MEDIUM: HNSWIndexFactory Static Map -- Potential Memory Leak

**File**: `/workspaces/agentic-qe-new/v3/src/integrations/embeddings/index/HNSWIndex.ts`

The `HNSWIndexFactory` maintains a static `Map` of index instances. If namespaces are created dynamically (e.g., per-user or per-session), these index instances accumulate without cleanup.

**Recommended fix**: Implement a `close(namespace)` or `dispose()` method, and add a `WeakRef`-based eviction policy for inactive indices.

---

### 2.6 MEDIUM: searchLatencies Array Trimming Creates New Arrays

**Files**:
- `/workspaces/agentic-qe-new/v3/src/domains/coverage-analysis/services/hnsw-index.ts` (line 603)
- `/workspaces/agentic-qe-new/v3/src/learning/pattern-store.ts` (line 1187)

Both use `this.searchLatencies = this.searchLatencies.slice(-MAX)` which allocates a new array and discards the old one, creating GC pressure.

**Recommended fix**: Use a CircularBuffer (already available in the event-bus module) for latency tracking.

---

### 2.7 LOW: getHistory Creates Intermediate Arrays

**File**: `/workspaces/agentic-qe-new/v3/src/kernel/event-bus.ts` (lines 229-255)

The `getHistory()` method converts the CircularBuffer to a full array, then applies sequential `.filter()` calls, creating intermediate arrays.

**Recommended fix**: Implement a single-pass iterator over the CircularBuffer with predicate composition.

---

## 3. I/O Performance

### 3.1 CRITICAL: vectorSearch N+1 Database Queries

**File**: `/workspaces/agentic-qe-new/v3/src/kernel/unified-memory.ts` (lines 1522-1567)

The `vectorSearch()` method performs HNSW search (returns IDs + distances), then queries SQLite **individually** for each result's metadata:

```typescript
const results = this.vectorIndex.search(queryVector, limit);
return results.map(result => {
  const row = this.db!.prepare('SELECT metadata FROM vectors WHERE id = ?').get(result.id);
  return { ...result, metadata: row ? JSON.parse(row.metadata) : {} };
});
```

For a search returning 20 results, this executes 21 database queries (1 + 20).

**Recommended fix**: Batch the metadata retrieval into a single query:

```typescript
const ids = results.map(r => r.id);
const placeholders = ids.map(() => '?').join(',');
const rows = this.db!.prepare(
  `SELECT id, metadata FROM vectors WHERE id IN (${placeholders})`
).all(...ids);
const metadataMap = new Map(rows.map(r => [r.id, JSON.parse(r.metadata)]));
```

**Impact**: Reduces 21 DB round-trips to 1. For `limit=100`, reduces 101 queries to 1 -- **100x fewer DB operations**.

Note: The code does use prepared statement caching via `this.preparedStatements`, which partially mitigates the overhead. However, each `.get()` call still incurs SQLite step/reset overhead.

---

### 3.2 HIGH: loadPatterns N+1 Individual memory.get() Calls

**File**: `/workspaces/agentic-qe-new/v3/src/learning/pattern-store.ts` (lines 446-475)

The `loadPatterns()` method first searches for pattern keys (up to 10,000), then loads each pattern individually:

```typescript
const keys = await this.memory.search({ pattern: 'patterns/*', limit: 10000 });
for (const key of keys) {
  const pattern = await this.memory.get(key);  // Individual DB query per pattern
  if (pattern) this.addToCache(pattern);
}
```

**Recommended fix**: Implement a `memory.getBatch(keys)` method or use a single SQL query with `WHERE key IN (...)`.

---

### 3.3 HIGH: Synchronous File System Operations Blocking Event Loop

**Files with synchronous fs calls**:

| File | Operations | Context |
|------|-----------|---------|
| `kernel/unified-memory.ts:52-95` | `fs.existsSync` x5-7 in `findProjectRoot` | Constructor (startup) |
| `kernel/kernel.ts:91-93` | `fs.existsSync`, `fs.mkdirSync` | Constructor (startup) |
| `kernel/plugin-loader.ts` | `fs.existsSync` | Plugin resolution |
| CLI handlers (multiple) | Various sync fs ops | Command execution |
| `sync/readers/` | Sync file reads | Data synchronization |

The most impactful is `findProjectRoot()` in `unified-memory.ts` which walks up the directory tree checking for multiple marker files (`package.json`, `.git`, `.agentic-qe/`) at each level. This is called during UnifiedMemory construction, blocking the event loop.

**Recommended fix for hot paths**:
```typescript
// Replace synchronous walk
async function findProjectRoot(startDir: string): Promise<string> {
  let current = startDir;
  while (current !== path.dirname(current)) {
    try {
      await fs.promises.access(path.join(current, 'package.json'));
      return current;
    } catch { current = path.dirname(current); }
  }
  return startDir;
}
```

For constructor-time initialization, consider a static async factory method pattern:
```typescript
class UnifiedMemory {
  private constructor(private rootDir: string, private db: Database) {}

  static async create(options?: Options): Promise<UnifiedMemory> {
    const root = await findProjectRoot(process.cwd());
    const db = await initializeDatabase(root);
    return new UnifiedMemory(root, db);
  }
}
```

---

### 3.4 MEDIUM: EmbeddingCache loadFromDisk Loads All Embeddings

**File**: `/workspaces/agentic-qe-new/v3/src/integrations/embeddings/cache/EmbeddingCache.ts`

The `loadFromDisk()` method executes `SELECT * FROM embeddings` loading all persisted embeddings into the in-memory cache. For large embedding stores, this is both memory-intensive and slow.

**Recommended fix**: Load on-demand with a warm-up phase that preloads the most frequently accessed embeddings based on access statistics.

---

### 3.5 MEDIUM: batchInsert Delete-and-Reinsert for Duplicates

**File**: `/workspaces/agentic-qe-new/v3/src/domains/coverage-analysis/services/hnsw-index.ts` (lines 339-343)

When inserting a vector that already exists, the code deletes the old entry and reinserts. In a batch of N vectors where M are updates, this performs M unnecessary delete+insert cycles.

**Recommended fix**: Check for existence before insertion and use an update path that modifies the vector in-place when supported by the underlying ruvector library.

---

## 4. Concurrency and Parallelism

### 4.1 MEDIUM: Plugin Loading is Sequential

**File**: `/workspaces/agentic-qe-new/v3/src/kernel/plugin-loader.ts` (lines 123-125)

The `loadAll()` method loads plugins sequentially via a `for...of` loop, even though many plugins are independent of each other:

```typescript
for (const name of order) {
  await this.load(name);  // Sequential -- could parallelize independent plugins
}
```

Since plugins are topologically sorted, independent plugins at the same topological level could be loaded in parallel.

**Recommended fix**: Group plugins by topological level and load each level in parallel:
```typescript
const levels = this.groupByTopologicalLevel(order);
for (const level of levels) {
  await Promise.all(level.map(name => this.load(name)));
}
```

---

### 4.2 MEDIUM: Connection Pool Linear Scan for Idle Connections

**File**: `/workspaces/agentic-qe-new/v3/src/mcp/connection-pool.ts` (lines 184-222)

The `acquire()` method iterates the entire `connectionQueue` array to find an idle connection:

```typescript
for (const conn of this.connectionQueue) {
  if (conn.state === 'idle') { ... }
}
```

Under high concurrency with many connections, this linear scan becomes a bottleneck. Additionally:
- `trackAcquisitionTime` uses `shift()` on an array -- O(n) due to element shifting
- `prune` uses `indexOf` + `splice` on the connection queue -- O(n) per removal

**Recommended fix**: Maintain separate idle and active Sets (or a deque for idle):
```typescript
private idle = new Set<Connection>();
private active = new Set<Connection>();

acquire(): Connection {
  const conn = this.idle.values().next().value;  // O(1)
  if (conn) {
    this.idle.delete(conn);
    this.active.add(conn);
    return conn;
  }
  // ... create new connection
}
```

---

### 4.3 MEDIUM: addEmbeddingsBatch Sequential Within Namespace

**File**: `/workspaces/agentic-qe-new/v3/src/integrations/embeddings/index/HNSWIndex.ts` (lines 130-141)

The `addEmbeddingsBatch` method processes embeddings sequentially within each namespace. Since HNSW insertion involves layer traversal and neighbor updates, parallelizing across namespaces (but sequential within) would improve throughput for multi-namespace scenarios.

---

### 4.4 LOW: Race Condition in EmbeddingCache Initialization

**File**: `/workspaces/agentic-qe-new/v3/src/integrations/embeddings/cache/EmbeddingCache.ts` (line 121)

The constructor calls `this.unifiedMemory.initialize().then(...)` asynchronously. This means `get()` and `set()` calls that occur before initialization completes will operate without a persistent backend -- silently using only in-memory storage.

**Recommended fix**: Use an initialization promise gate:
```typescript
private initPromise: Promise<void>;

constructor() {
  this.initPromise = this.initialize();
}

async get(key: string): Promise<Embedding | undefined> {
  await this.initPromise;  // Wait for init before any operation
  // ...
}
```

---

## 5. Startup Performance

### 5.1 HIGH: Eager Import of All 14 Domain Factories

**File**: `/workspaces/agentic-qe-new/v3/src/kernel/kernel.ts` (lines 29-42)

All 14 domain plugin factories are imported at module level:

```typescript
import { createTestGenerationDomain } from '../domains/test-generation/index.js';
import { createTestExecutionDomain } from '../domains/test-execution/index.js';
import { createCoverageAnalysisDomain } from '../domains/coverage-analysis/index.js';
// ... 11 more imports
```

Each import triggers the full module evaluation chain for that domain, including any transitive dependencies. This means the kernel cannot start until all domain modules are parsed and evaluated.

**Recommended fix**: Use dynamic imports with lazy loading:

```typescript
private readonly domainLoaders: Map<string, () => Promise<DomainFactory>> = new Map([
  ['test-generation', () => import('../domains/test-generation/index.js')
    .then(m => m.createTestGenerationDomain)],
  ['coverage-analysis', () => import('../domains/coverage-analysis/index.js')
    .then(m => m.createCoverageAnalysisDomain)],
  // ...
]);

async loadDomain(name: string): Promise<Domain> {
  const loader = this.domainLoaders.get(name);
  if (!loader) throw new Error(`Unknown domain: ${name}`);
  const factory = await loader();
  return factory(this.config);
}
```

---

### 5.2 HIGH: Full Vector Index Load at Startup

**File**: `/workspaces/agentic-qe-new/v3/src/kernel/unified-memory.ts` (lines 1353-1368)

As discussed in section 2.2, `loadVectorIndex()` loads all vectors into memory during initialization. For a system with 50,000 vectors of dimension 384, this means:

- **Parse time**: 50,000 JSON.parse calls for vector data
- **Insertion time**: 50,000 HNSW insertions (each currently O(n) due to splice issue)
- **Memory**: ~153 MB allocated before any user request is served

**Recommended fix**: Defer vector loading until first search, or implement progressive background loading after the system accepts its first request.

---

### 5.3 MEDIUM: topologicalSort Uses Array.includes for Dependency Check

**File**: `/workspaces/agentic-qe-new/v3/src/kernel/plugin-loader.ts` (line 146)

The topological sort implementation checks `domains.includes(dep)` which is O(n) per check. With D domains and average K dependencies each, this is O(D * K * D) = O(D^2 * K).

**Recommended fix**: Convert domains array to a Set for O(1) lookups:
```typescript
const domainSet = new Set(domains);
// Then: domainSet.has(dep) instead of domains.includes(dep)
```

---

### 5.4 MEDIUM: Pattern Store Loads Up to 10,000 Patterns at Init

**File**: `/workspaces/agentic-qe-new/v3/src/learning/pattern-store.ts` (lines 446-475)

The pattern store's initialization phase loads up to 10,000 patterns with individual database queries (N+1 as noted in section 3.2). This compounds startup latency.

**Recommended fix**: Implement tiered loading -- load the top 100 most-used patterns eagerly, defer the rest to background loading or on-demand retrieval.

---

### 5.5 LOW: Hard-coded maxElements in HNSW Index

**File**: `/workspaces/agentic-qe-new/v3/src/integrations/embeddings/index/HNSWIndex.ts` (line 69)

The hnswlib-node index is created with `maxElements: 10000`. If this limit is reached, insertions will fail or require index rebuilding (which involves creating a new index with a larger size and reinserting all elements).

**Recommended fix**: Make `maxElements` configurable and implement auto-resize with a growth factor (e.g., 2x) when 80% capacity is reached.

---

## 6. Data Structure Recommendations

| Current | Recommended | Where | Benefit |
|---------|-------------|-------|---------|
| Sorted array + splice | Binary min/max heap | `searchLayerBeam` | O(n) -> O(log n) per insert |
| Full array scan for LRU | Doubly-linked list + Map | `EmbeddingCache.evictLRU` | O(n) -> O(1) per eviction |
| Array + indexOf/splice | Set or Map | `ConnectionPool` idle tracking | O(n) -> O(1) per acquire/release |
| Array.includes in loops | Set.has | `sublinear-analyzer`, `plugin-loader` | O(n) -> O(1) per lookup |
| Full sort for top-k | Quickselect or bounded heap | `trimCoActivationCounts` | O(n log n) -> O(n) for trim |
| Linear adjacency search | Map<target, edge> | `SwarmGraph` operations | O(degree) -> O(1) per lookup |
| CircularBuffer -> array -> filter | Iterator with predicates | `EventBus.getHistory` | Eliminates intermediate arrays |

---

## 7. Positive Findings

Not all findings are negative. The codebase demonstrates several good performance practices:

| Component | Practice | Assessment |
|-----------|----------|------------|
| Event Bus | CircularBuffer for history, indexed subscriptions | Well-optimized O(1) publish |
| Task Classifier | Fixed-factor classification, no data-dependent loops | Properly O(1) |
| DAG Scheduler | Efficient topological sort with level-based grouping | Clean O(V+E) implementation |
| Unified Memory | Prepared statement caching for SQL | Reduces parse overhead |
| Unified Memory | WAL mode for SQLite | Enables concurrent reads |
| Pattern Store | Lazy HNSW loading with timeout protection (ADR-048) | Good resource management |
| Tool Registry | Map-based category and domain indexes | O(1) tool lookup |
| Vector Math | Single-pass cosine similarity with 3 accumulators | Properly optimized |

---

## 8. Prioritized Recommendations

### P0 -- Fix Before Next Release (Critical Production Impact)

| # | Issue | File | Effort | Impact |
|---|-------|------|--------|--------|
| 1 | Replace sorted array with binary heap in `searchLayerBeam` | `kernel/unified-memory.ts` | Medium (2-3 days) | 25x search improvement |
| 2 | Batch vectorSearch metadata retrieval into single SQL query | `kernel/unified-memory.ts` | Low (0.5 day) | 100x fewer DB queries |
| 3 | Replace graph cloning with Tarjan's algorithm in `findPartitioningPoints` | `coordination/mincut/mincut-calculator.ts` | Medium (1-2 days) | 100-1000x for large graphs |
| 4 | Fix `Math.min(...spread)` stack overflow risk | `coordination/mincut/mincut-calculator.ts` | Low (10 min) | Prevents crash at >10K vertices |

### P1 -- Fix in Next Sprint (High Severity)

| # | Issue | File | Effort | Impact |
|---|-------|------|--------|--------|
| 5 | Implement proper O(1) LRU eviction in EmbeddingCache | `integrations/embeddings/cache/EmbeddingCache.ts` | Medium (1 day) | O(n) -> O(1) eviction |
| 6 | Remove dual vector storage | `domains/coverage-analysis/services/hnsw-index.ts` | Medium (1-2 days) | 50% memory reduction for vectors |
| 7 | Convert synchronous fs operations to async in kernel init | `kernel/unified-memory.ts`, `kernel/kernel.ts` | Medium (1-2 days) | Non-blocking startup |
| 8 | Implement lazy/progressive vector index loading | `kernel/unified-memory.ts` | High (3-5 days) | Faster cold start, lower memory |
| 9 | Batch pattern loading with single DB query | `learning/pattern-store.ts` | Low (0.5 day) | Fewer DB round-trips |

### P2 -- Address When Convenient (Medium Severity)

| # | Issue | File | Effort | Impact |
|---|-------|------|--------|--------|
| 10 | Parallelize independent plugin loading by topological level | `kernel/plugin-loader.ts` | Low (0.5 day) | Faster startup |
| 11 | Use separate idle/active Sets in connection pool | `mcp/connection-pool.ts` | Low (1 day) | O(1) connection acquisition |
| 12 | Lazy-load domain factories with dynamic imports | `kernel/kernel.ts` | Medium (1-2 days) | Faster module evaluation |
| 13 | Cap active nodes before pairwise comparison in spreading activation | `learning/dream/spreading-activation.ts` | Low (0.5 day) | Prevent O(n^2) blowup |
| 14 | Use Set instead of Array.includes in hot loops | Multiple files | Low (1 day total) | O(1) membership tests |
| 15 | Add initialization gate to EmbeddingCache | `integrations/embeddings/cache/EmbeddingCache.ts` | Low (0.5 day) | Prevent silent data loss |

### P3 -- Nice to Have (Low Severity)

| # | Issue | File | Effort | Impact |
|---|-------|------|--------|--------|
| 16 | Replace searchLatencies arrays with CircularBuffer | Multiple files | Low (0.5 day) | Less GC pressure |
| 17 | Single-pass getHistory with iterator predicates | `kernel/event-bus.ts` | Low (0.5 day) | Fewer intermediate arrays |
| 18 | Make HNSW maxElements configurable with auto-resize | `integrations/embeddings/index/HNSWIndex.ts` | Medium (1 day) | Handle index growth |
| 19 | Bound experience buffer in dream scheduler | `learning/dream/dream-scheduler.ts` | Low (10 min) | Prevent unbounded growth |
| 20 | Use Aho-Corasick for domain keyword detection | `mcp/tool-registry.ts` | High (2-3 days) | Only beneficial at scale |

---

## 9. Estimated Aggregate Impact

If P0 and P1 recommendations are implemented:

| Metric | Current (estimated) | After Fixes | Improvement |
|--------|-------------------|-------------|-------------|
| Vector search latency (10K vectors) | ~50ms | ~2ms | 25x |
| Vector search DB queries (top-20) | 21 queries | 1 query | 21x |
| Graph analysis (1K vertices) | ~10s | ~10ms | 1000x |
| Embedding cache eviction | O(n) | O(1) | Cache-size-independent |
| Vector memory (10K vectors, dim 384) | ~61 MB | ~31 MB | 50% reduction |
| Cold start (50K vectors) | ~30s+ | ~2s (lazy) | 15x |
| Pattern loading (1K patterns) | ~1K DB queries | ~1 DB query | 1000x |

---

## 10. Methodology

This review was conducted by analyzing source code statically across the following dimensions:

1. **File enumeration**: All `.ts` files under `v3/src/` were cataloged (~150+ files)
2. **Critical path analysis**: 16+ files read in detail across 7 key subsystems
3. **Anti-pattern grep searches**: Automated scans for synchronous fs operations, sequential awaits in loops, and `.filter().map()` chains
4. **Complexity verification**: Manual Big O analysis of core algorithms (HNSW search, graph analysis, spreading activation)
5. **Data structure audit**: Evaluated appropriateness of chosen data structures for each use case

**Limitations**: This is a static analysis. Runtime profiling with production-representative data would provide more precise impact measurements. The latency estimates are based on algorithmic complexity analysis, not measured benchmarks.

---

*Report generated by V3 QE Performance Reviewer -- chaos-resilience domain (ADR-011)*
*Analysis timestamp: 2026-02-11T00:00:00Z*
