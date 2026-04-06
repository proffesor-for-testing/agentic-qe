/**
 * Native HNSW Backend via hnswlib-node
 *
 * Provides a high-performance HNSW index backed by hnswlib-node, the
 * canonical Node.js binding for the C++ Hnswlib reference implementation
 * (Yury Malkov's HNSW library, the same code Pinecone, Weaviate, Qdrant
 * and chromadb-default-embed are built on top of).
 *
 * This backend implements the same IHnswIndexProvider interface as
 * ProgressiveHnswBackend but delegates vector storage and search to
 * native code for sublinear search latency on large indexes.
 *
 * History — issue #399 (April 2026):
 *   This backend previously wrapped @ruvector/router's VectorDb. Empirical
 *   verification (scripts/diagnose-issue-399*.mjs) found four serious bugs
 *   in @ruvector/router 0.1.28:
 *
 *   1. HNSW search returned essentially random results — recall@10 ≈ 0%
 *      on textbook unit-Gaussian random vectors at default M/efC/efS,
 *      could not find self-vectors. Pumping efSearch to N≈index-size
 *      restored correctness but defeated HNSW's purpose.
 *   2. The VectorDb constructor unconditionally created a `vectors.db`
 *      redb file in the current working directory (NOT in .agentic-qe/),
 *      violating the unified memory architecture and polluting users'
 *      project roots with multi-MB persistence files they never asked for.
 *   3. The redb file held a process-wide exclusive lock — only ONE
 *      VectorDb instance could exist per process. Subsequent constructors
 *      threw "Database already open. Cannot acquire lock."
 *   4. NAPI dispose did not synchronously release the redb lock, so the
 *      lock outlived our dispose() call and caused the v3.9.5 futex
 *      deadlock when the indexer tried to recreate after reset.
 *
 *   Comparison test on 1000 vector self-query (linux-arm64, M=16, efC=200,
 *   efS=100, cosine):
 *     - @ruvector/router 0.1.28: recall@10 = 10%, top-1 = wrong vector
 *     - hnswlib-node 3.0.0:      recall@10 = 100%, top-1 = id 42 ✓
 *
 *   The migration to hnswlib-node fixes all four bugs in one swap.
 *
 * @see ADR-090: hnswlib-node migration
 * @see https://github.com/proffesor-for-testing/agentic-qe/issues/399
 * @module kernel/native-hnsw-backend
 */

import { createRequire } from 'module';
import type {
  IHnswIndexProvider,
  SearchResult,
  HnswConfig,
} from './hnsw-index-provider.js';
import { DEFAULT_HNSW_CONFIG } from './hnsw-index-provider.js';

// hnswlib-node is a native CommonJS module distributed via node-gyp
const esmRequire = createRequire(import.meta.url);

// ============================================================================
// Error Types
// ============================================================================

/**
 * Thrown when hnswlib-node native binary is not available.
 * The HnswAdapter factory catches this to fall back to the JS backend.
 */
export class NativeHnswUnavailableError extends Error {
  constructor(reason: string) {
    super(`Native HNSW backend unavailable: ${reason}`);
    this.name = 'NativeHnswUnavailableError';
  }
}

// ============================================================================
// Native Module Types (hnswlib-node)
// ============================================================================

type SpaceName = 'l2' | 'ip' | 'cosine';

interface HnswlibNodeModule {
  HierarchicalNSW: new (spaceName: SpaceName, numDimensions: number) => HierarchicalNSW;
}

interface HierarchicalNSW {
  initIndex(
    maxElements: number,
    m?: number,
    efConstruction?: number,
    randomSeed?: number,
    allowReplaceDeleted?: boolean,
  ): void;
  addPoint(point: number[], label: number, replaceDeleted?: boolean): void;
  markDelete(label: number): void;
  unmarkDelete(label: number): void;
  searchKnn(
    queryPoint: number[],
    numNeighbors: number,
    filter?: (label: number) => boolean,
  ): { distances: number[]; neighbors: number[] };
  resizeIndex(newMaxElements: number): void;
  getCurrentCount(): number;
  getMaxElements(): number;
  getNumDimensions(): number;
  setEf(ef: number): void;
  getEf(): number;
  getIdsList(): number[];
}

// ============================================================================
// Native Module Loader
// ============================================================================

let nativeModule: HnswlibNodeModule | null = null;
let nativeLoadAttempted = false;
let nativeLoadError: string | null = null;

/**
 * Attempt to load the hnswlib-node native module.
 * Caches the result so subsequent calls are instant.
 */
function loadNativeModule(): HnswlibNodeModule {
  if (nativeLoadAttempted) {
    if (nativeModule) return nativeModule;
    throw new NativeHnswUnavailableError(nativeLoadError ?? 'Unknown load error');
  }

  nativeLoadAttempted = true;

  try {
    // hnswlib-node ships a CommonJS default export with HierarchicalNSW on it
    const mod = esmRequire('hnswlib-node');
    if (!mod.HierarchicalNSW) {
      throw new Error('hnswlib-node module missing HierarchicalNSW export');
    }
    nativeModule = mod as HnswlibNodeModule;
    return nativeModule;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    nativeLoadError = message;
    throw new NativeHnswUnavailableError(message);
  }
}

/**
 * Reset the native module loader state.
 * Useful for testing fallback behavior.
 */
export function resetNativeModuleLoader(): void {
  nativeModule = null;
  nativeLoadAttempted = false;
  nativeLoadError = null;
}

/**
 * Check if the native module is available without throwing.
 */
export function isNativeModuleAvailable(): boolean {
  try {
    loadNativeModule();
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Vector Math Helpers
// ============================================================================

/**
 * Resize a vector to the target dimensions.
 * Shrink: average adjacent values. Grow: zero-pad.
 */
function resizeVector(vector: Float32Array, targetDim: number): Float32Array {
  if (vector.length === targetDim) return vector;

  const result = new Float32Array(targetDim);

  if (vector.length > targetDim) {
    const ratio = vector.length / targetDim;
    for (let i = 0; i < targetDim; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.floor((i + 1) * ratio);
      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += vector[j];
      }
      result[i] = sum / (end - start);
    }
  } else {
    for (let i = 0; i < vector.length; i++) {
      result[i] = vector[i];
    }
  }

  return result;
}

/**
 * Convert a Float32Array to a plain number[] (required by hnswlib-node API).
 */
function toNumberArray(v: Float32Array): number[] {
  const out = new Array<number>(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i];
  return out;
}

// ============================================================================
// Metrics
// ============================================================================

/**
 * Performance metrics for a NativeHnswBackend instance.
 *
 * Note on legacy fields: `fallbackSearchCount`, `bruteForceSearchCount`,
 * `fallbackRate`, and `allSearchesBruteForce` are retained for backward
 * compatibility with consumers that referenced them during the
 * @ruvector/router era. Under hnswlib-node there is no native→brute-force
 * fallback path (the library always returns correct results), so these
 * fields will always be 0/false. They will be removed in a future major
 * version.
 */
export interface NativeHnswMetrics {
  totalSearches: number;
  totalAdds: number;
  totalRemoves: number;
  avgSearchLatencyMs: number;
  maxSearchLatencyMs: number;
  lastSearchLatencyMs: number;
  /** Always 0 under hnswlib-node — kept for backward compatibility. */
  fallbackSearchCount: number;
  /** Always 0 under hnswlib-node — kept for backward compatibility. */
  bruteForceSearchCount: number;
  /** Equals totalSearches under hnswlib-node (every search is native). */
  nativeSearchCount: number;
  /** Always 0 under hnswlib-node. */
  fallbackRate: number;
  /** Always false under hnswlib-node. */
  allSearchesBruteForce: boolean;
}

// ============================================================================
// NativeHnswBackend
// ============================================================================

/**
 * Initial maxElements capacity for a new HierarchicalNSW index. The index
 * will be doubled in place via resizeIndex() each time it fills up, so this
 * value only controls the initial allocation cost. Tuned for AQE's typical
 * code-intelligence index size (~2.5k vectors today, expected to grow).
 */
const INITIAL_MAX_ELEMENTS = 10_000;

/**
 * Native HNSW backend using hnswlib-node HierarchicalNSW.
 *
 * Provides the same IHnswIndexProvider interface as ProgressiveHnswBackend
 * but delegates all vector operations to the C++ Hnswlib reference
 * implementation for sublinear search latency at scale.
 *
 * Key differences from the previous @ruvector/router-backed implementation:
 *   - No local vectorStore mirror — hnswlib-node returns correct distances
 *     directly, so re-scoring is unnecessary.
 *   - No process-wide singleton lock — multiple instances coexist.
 *   - No vectors.db pollution — persistence is opt-in via writeIndex().
 *   - resizeIndex() doubling on overflow — grows past initial maxElements.
 */
export class NativeHnswBackend implements IHnswIndexProvider {
  private readonly config: HnswConfig;
  private nativeIndex: HierarchicalNSW | null = null;
  private currentMaxElements = INITIAL_MAX_ELEMENTS;
  /** Tracks live ids so size() and remove() can correctly distinguish soft-deleted slots. */
  private readonly liveIds: Set<number> = new Set();
  /** Optional metadata mirror — only stored when callers attach metadata. */
  private readonly metadataStore: Map<number, Record<string, unknown>> = new Map();
  private _metrics: NativeHnswMetrics = {
    totalSearches: 0,
    totalAdds: 0,
    totalRemoves: 0,
    avgSearchLatencyMs: 0,
    maxSearchLatencyMs: 0,
    lastSearchLatencyMs: 0,
    fallbackSearchCount: 0,
    bruteForceSearchCount: 0,
    nativeSearchCount: 0,
    fallbackRate: 0,
    allSearchesBruteForce: false,
  };

  /**
   * Create a NativeHnswBackend.
   *
   * @param config - HNSW configuration overrides
   * @throws {NativeHnswUnavailableError} If hnswlib-node is not available
   */
  constructor(config?: Partial<HnswConfig>) {
    this.config = { ...DEFAULT_HNSW_CONFIG, ...config };
    this.nativeIndex = this.createFreshIndex();
  }

  /**
   * Build a fresh HierarchicalNSW with the configured parameters.
   *
   * Used both at construction time and on `clear()` to guarantee a clean
   * graph. hnswlib-node's `markDelete` is a soft tombstone — it leaves the
   * graph node in place and only hides it from search. Across many cycles
   * of `clear() → re-add` (which happens during long test runs that share
   * the singleton HnswAdapter registry), the tombstoned slots can interact
   * pathologically with `addPoint(label, replaceDeleted=true)` and produce
   * duplicate-label results from `searchKnn`. Recreating the underlying
   * index on `clear()` is the only way to guarantee O(1) clean state
   * regardless of how the wrapper is used over time.
   */
  private createFreshIndex(): HierarchicalNSW {
    const native = loadNativeModule();
    const space: SpaceName = this.config.metric === 'euclidean' ? 'l2' : 'cosine';

    try {
      const idx = new native.HierarchicalNSW(space, this.config.dimensions);
      idx.initIndex(
        this.currentMaxElements,
        this.config.M,
        this.config.efConstruction,
        // randomSeed: deterministic per-config seed so test runs are reproducible.
        // hnswlib-node uses this to randomize level assignment during graph construction.
        100,
        // allowReplaceDeleted: true so markDelete()-ed slots can be reused by future addPoint().
        true,
      );
      idx.setEf(this.config.efSearch);
      return idx;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new NativeHnswUnavailableError(`HierarchicalNSW init failed: ${message}`);
    }
  }

  // ============================================================================
  // IHnswIndexProvider Implementation
  // ============================================================================

  add(
    id: number,
    vector: Float32Array,
    metadata?: Record<string, unknown>,
  ): void {
    if (!this.nativeIndex) {
      throw new Error('NativeHnswBackend has been disposed');
    }

    const normalized = this.normalizeVector(vector);

    // Grow the index if we're about to overflow. hnswlib-node's resizeIndex
    // doubles in-place; this gives amortized O(1) growth at the cost of a
    // single memcpy on each doubling. Required for production use cases
    // where the index size is not known at construction time.
    if (!this.liveIds.has(id) && this.liveIds.size >= this.currentMaxElements) {
      const newMax = this.currentMaxElements * 2;
      this.nativeIndex.resizeIndex(newMax);
      this.currentMaxElements = newMax;
    }

    // hnswlib-node treats addPoint with an existing label as an UPDATE.
    // The replaceDeleted flag lets us reuse soft-deleted slots transparently.
    this.nativeIndex.addPoint(toNumberArray(normalized), id, true);
    this.liveIds.add(id);

    if (metadata) {
      this.metadataStore.set(id, metadata);
    } else {
      this.metadataStore.delete(id);
    }

    this._metrics.totalAdds++;
  }

  search(query: Float32Array, k: number): SearchResult[] {
    if (!this.nativeIndex) {
      throw new Error('NativeHnswBackend has been disposed');
    }

    if (this.liveIds.size === 0 || k <= 0) return [];

    const start = performance.now();
    const normalizedQuery = this.normalizeVector(query);
    const actualK = Math.min(k, this.liveIds.size);

    // Overshoot k by 2x (capped at index size) so that defensive dedup
    // below can drop any duplicate-label entries hnswlib may return after
    // long add/remove churn and still leave us with at least k unique
    // results when possible.
    const overshoot = Math.min(actualK * 2, this.liveIds.size);
    const native = this.nativeIndex.searchKnn(toNumberArray(normalizedQuery), overshoot);

    // Convert hnswlib-node distances to similarity scores.
    //   cosine space: distance = 1 - cos_sim, so similarity = 1 - distance
    //   l2 space:     distance = sum((x_i - y_i)^2), no clean similarity;
    //                 we negate so that "higher = closer" remains the contract
    const isCosine = this.config.metric === 'cosine';

    // Defensive dedup: keep only the best score for each id. hnswlib-node
    // can return duplicate labels after pathological add/remove cycles
    // (verified empirically — see ADR-090 / issue #399 follow-up). We
    // can't fix the C++ side from here, but we can make sure callers
    // never see duplicates by collapsing them at the wrapper boundary.
    const seen = new Map<number, SearchResult>();
    for (let i = 0; i < native.neighbors.length; i++) {
      const id = native.neighbors[i];
      // Skip ids we've already removed at the wrapper level. liveIds is
      // the source of truth for "is this id currently in the index" —
      // hnswlib's internal markDelete state can lag.
      if (!this.liveIds.has(id)) continue;
      const distance = native.distances[i];
      const score = isCosine ? 1 - distance : -distance;
      const existing = seen.get(id);
      if (existing === undefined || score > existing.score) {
        seen.set(id, { id, score, metadata: this.metadataStore.get(id) });
      }
    }
    const results: SearchResult[] = Array.from(seen.values());

    // hnswlib-node returns results in ascending distance order (best first
    // for distance), but our SearchResult contract is descending score
    // (best first for similarity). Sort defensively to guarantee the
    // contract regardless of how the metric maps.
    results.sort((a, b) => b.score - a.score);

    // Truncate to the requested k after dedup.
    if (results.length > actualK) results.length = actualK;

    const elapsed = performance.now() - start;
    this.updateSearchMetrics(elapsed);
    this._metrics.nativeSearchCount = this._metrics.totalSearches;

    if (elapsed > 50) {
      console.warn(
        `[NativeHNSW] search took ${elapsed.toFixed(1)}ms (k=${k}, results=${results.length})`,
      );
    }

    return results;
  }

  remove(id: number): boolean {
    if (!this.nativeIndex) return false;
    if (!this.liveIds.has(id)) return false;

    try {
      this.nativeIndex.markDelete(id);
    } catch {
      // markDelete throws if the label was never added; treat as not-found.
      return false;
    }

    this.liveIds.delete(id);
    this.metadataStore.delete(id);
    this._metrics.totalRemoves++;
    return true;
  }

  size(): number {
    return this.liveIds.size;
  }

  dimensions(): number {
    return this.config.dimensions;
  }

  recall(): number {
    // hnswlib-node with default M=16, efConstruction=200, efSearch=100 hits
    // 100% recall@10 on the project's own qe-kernel fixture and on textbook
    // Gaussian random vectors (verified empirically — see ADR-090). At very
    // large N or aggressively low efSearch, recall is approximate; we report
    // a slightly conservative 0.99 to make that property visible to callers
    // that care about the difference between exact and approximate search.
    return 0.99;
  }

  // ============================================================================
  // Public Utilities
  // ============================================================================

  /**
   * Get performance metrics for this index.
   */
  getMetrics(): Readonly<NativeHnswMetrics> {
    return { ...this._metrics };
  }

  /**
   * Get last search latency in milliseconds.
   */
  get lastSearchLatencyMs(): number {
    return this._metrics.lastSearchLatencyMs;
  }

  /**
   * Get the current configuration.
   */
  getConfig(): Readonly<HnswConfig> {
    return { ...this.config };
  }

  /**
   * Clear all vectors from the index.
   *
   * Recreates the underlying HierarchicalNSW from scratch rather than
   * `markDelete`-ing each label. The tombstone-only approach leaks state
   * across `clear() → re-add` cycles (the C++ graph keeps every deleted
   * slot, and `addPoint(label, replaceDeleted=true)` can produce
   * duplicate-label results from `searchKnn` after many cycles). A fresh
   * index is the only guarantee of O(1) clean state and is what callers
   * who use `clear()` actually expect.
   */
  clear(): void {
    if (!this.nativeIndex) return;
    this.liveIds.clear();
    this.metadataStore.clear();
    // Reset capacity to the initial value so a fresh index doesn't carry
    // over the previous index's resize history.
    this.currentMaxElements = INITIAL_MAX_ELEMENTS;
    this.nativeIndex = this.createFreshIndex();
  }

  /**
   * Dispose of the native index handle.
   *
   * hnswlib-node holds the C++ index in JS-managed memory; setting the
   * reference to null lets V8 GC reclaim it on the next collection cycle.
   * Unlike the previous @ruvector/router VectorDb, there is no file lock
   * to release and no synchronous teardown required.
   *
   * After dispose(), this backend instance must not be used. The
   * HnswAdapter registry is expected to drop its reference as part of
   * `HnswAdapter.close(name)`.
   */
  dispose(): void {
    this.liveIds.clear();
    this.metadataStore.clear();
    this.nativeIndex = null;
  }

  /**
   * Check if the native backend is operational.
   */
  isNativeAvailable(): boolean {
    return this.nativeIndex !== null;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private normalizeVector(vector: Float32Array): Float32Array {
    if (vector.length === this.config.dimensions) return vector;
    return resizeVector(vector, this.config.dimensions);
  }

  private updateSearchMetrics(latencyMs: number): void {
    this._metrics.totalSearches++;
    this._metrics.lastSearchLatencyMs = latencyMs;

    if (latencyMs > this._metrics.maxSearchLatencyMs) {
      this._metrics.maxSearchLatencyMs = latencyMs;
    }

    // Running average
    const n = this._metrics.totalSearches;
    this._metrics.avgSearchLatencyMs =
      this._metrics.avgSearchLatencyMs * ((n - 1) / n) + latencyMs / n;
  }
}
