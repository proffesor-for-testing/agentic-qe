/**
 * Native HNSW Backend via @ruvector/router VectorDb
 *
 * Provides a high-performance HNSW index backed by the Rust-based
 * @ruvector/router library. This backend implements the same
 * IHnswIndexProvider interface as ProgressiveHnswBackend but delegates
 * vector storage and search to native code for lower latency and
 * higher throughput.
 *
 * When @ruvector/router is unavailable (e.g., unsupported platform,
 * missing binary), construction throws NativeHnswUnavailableError so the
 * caller (HnswAdapter factory) can fall back to the JS backend.
 *
 * @see ADR-081: Native HNSW NAPI Integration
 * @module kernel/native-hnsw-backend
 */

import { createRequire } from 'module';
import type {
  IHnswIndexProvider,
  SearchResult,
  HnswConfig,
} from './hnsw-index-provider.js';
import { DEFAULT_HNSW_CONFIG } from './hnsw-index-provider.js';

// Use createRequire for @ruvector/router (native CJS/NAPI module)
const esmRequire = createRequire(import.meta.url);

// ============================================================================
// Error Types
// ============================================================================

/**
 * Thrown when @ruvector/router native binary is not available.
 * The HnswAdapter factory catches this to fall back to the JS backend.
 */
export class NativeHnswUnavailableError extends Error {
  constructor(reason: string) {
    super(`Native HNSW backend unavailable: ${reason}`);
    this.name = 'NativeHnswUnavailableError';
  }
}

// ============================================================================
// Native Module Types (@ruvector/router)
// ============================================================================

/**
 * Minimal interface for the @ruvector/router native module.
 * This allows us to type-check without requiring the package at compile time.
 */
interface RuVectorRouterModule {
  VectorDb: new (config: {
    dimensions: number;
    distanceMetric?: number;
    hnswM?: number;
    hnswEfConstruction?: number;
    hnswEfSearch?: number;
  }) => RuVectorDb;
  DistanceMetric: {
    Euclidean: number;
    Cosine: number;
    DotProduct: number;
    Manhattan: number;
  };
}

interface RuVectorDb {
  insert(id: string, vector: Float32Array | number[]): void;
  search(query: Float32Array | number[], k: number): Array<{ id: string; score: number }>;
  delete(id: string): void;
  count(): number;
}

// ============================================================================
// Native Module Loader
// ============================================================================

let nativeModule: RuVectorRouterModule | null = null;
let nativeLoadAttempted = false;
let nativeLoadError: string | null = null;

/**
 * Attempt to load the @ruvector/router native module.
 * Caches the result so subsequent calls are instant.
 */
function loadNativeModule(): RuVectorRouterModule {
  if (nativeLoadAttempted) {
    if (nativeModule) return nativeModule;
    throw new NativeHnswUnavailableError(nativeLoadError ?? 'Unknown load error');
  }

  nativeLoadAttempted = true;

  try {
    // Use createRequire for the optional native NAPI dependency
    const mod = esmRequire('@ruvector/router');
    // Verify the module has the expected API
    if (!mod.VectorDb || !mod.DistanceMetric) {
      throw new Error('@ruvector/router module missing VectorDb or DistanceMetric exports');
    }
    nativeModule = mod as RuVectorRouterModule;
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

function computeNorm(v: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

function fastCosineSimilarity(
  a: Float32Array,
  b: Float32Array,
  normA: number,
  normB: number
): number {
  const denom = normA * normB;
  if (denom === 0) return 0;
  let dot = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) dot += a[i] * b[i];
  return dot / denom;
}

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

// ============================================================================
// Metrics
// ============================================================================

export interface NativeHnswMetrics {
  totalSearches: number;
  totalAdds: number;
  totalRemoves: number;
  avgSearchLatencyMs: number;
  maxSearchLatencyMs: number;
  lastSearchLatencyMs: number;
  fallbackSearchCount: number;
  bruteForceSearchCount: number;
  nativeSearchCount: number;
  fallbackRate: number;
  allSearchesBruteForce: boolean;
}

// ============================================================================
// NativeHnswBackend
// ============================================================================

/**
 * Native HNSW backend using @ruvector/router VectorDb.
 *
 * Provides the same IHnswIndexProvider interface as ProgressiveHnswBackend
 * but delegates all vector operations to a Rust-based HNSW implementation
 * for improved performance.
 *
 * Note: @ruvector/router VectorDb uses string IDs while IHnswIndexProvider
 * uses numeric IDs. Conversion is done via String(id) and Number(id).
 * VectorDb search returns distance scores (lower = closer) which are
 * converted to similarity scores (higher = closer) for consistency.
 */
export class NativeHnswBackend implements IHnswIndexProvider {
  private readonly config: HnswConfig;
  private nativeDb: RuVectorDb | null = null;
  private readonly metadataStore: Map<number, Record<string, unknown>> = new Map();
  private readonly vectorStore: Map<number, Float32Array> = new Map();
  private readonly normStore: Map<number, number> = new Map();
  private operationLock: Promise<void> = Promise.resolve();
  private highFallbackWarningEmitted = false;
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
   * @throws {NativeHnswUnavailableError} If @ruvector/router is not available
   */
  constructor(config?: Partial<HnswConfig>) {
    this.config = { ...DEFAULT_HNSW_CONFIG, ...config };

    // Attempt to load native module and create VectorDb immediately.
    // If the native module is unavailable or the database can't be opened,
    // this throws NativeHnswUnavailableError so the factory can fall back
    // to ProgressiveHnswBackend.
    const native = loadNativeModule();
    const distanceMetric = this.config.metric === 'cosine'
      ? native.DistanceMetric.Cosine
      : native.DistanceMetric.Euclidean;

    try {
      this.nativeDb = new native.VectorDb({
        dimensions: this.config.dimensions,
        distanceMetric,
        hnswM: this.config.M,
        hnswEfConstruction: this.config.efConstruction,
        hnswEfSearch: this.config.efSearch,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new NativeHnswUnavailableError(`VectorDb creation failed: ${message}`);
    }
  }

  // ============================================================================
  // IHnswIndexProvider Implementation
  // ============================================================================

  add(
    id: number,
    vector: Float32Array,
    metadata?: Record<string, unknown>
  ): void {
    const normalized = this.normalizeVector(vector);
    const norm = computeNorm(normalized);

    // Remove existing entry if updating
    if (this.vectorStore.has(id)) {
      try { this.nativeDb!.delete(String(id)); } catch { /* ignore if not found */ }
    }

    this.nativeDb!.insert(String(id), normalized);
    this.vectorStore.set(id, normalized);
    this.normStore.set(id, norm);

    if (metadata) {
      this.metadataStore.set(id, metadata);
    }

    this._metrics.totalAdds++;
  }

  search(query: Float32Array, k: number): SearchResult[] {
    const start = performance.now();

    if (this.vectorStore.size === 0) return [];

    const normalizedQuery = this.normalizeVector(query);
    const queryNorm = computeNorm(normalizedQuery);
    const actualK = Math.min(k, this.vectorStore.size);

    let results: SearchResult[];

    try {
      const nativeResults = this.nativeDb!.search(normalizedQuery, actualK);

      // Convert native distance scores to similarity scores.
      // @ruvector/router returns { id: string, score: number } where
      // score is a distance (lower = closer). We convert string IDs
      // back to numbers and compute cosine similarity for consistency.
      results = nativeResults.map((nr) => {
        const numericId = Number(nr.id);
        const storedVector = this.vectorStore.get(numericId);
        const storedNorm = this.normStore.get(numericId) ?? 0;

        // Compute cosine similarity for consistent scoring with ProgressiveHnswBackend
        let score: number;
        if (this.config.metric === 'cosine' && storedVector) {
          score = fastCosineSimilarity(normalizedQuery, storedVector, queryNorm, storedNorm);
        } else {
          // For euclidean, negate the distance (higher = closer)
          score = -nr.score;
        }

        return {
          id: numericId,
          score,
          metadata: this.metadataStore.get(numericId),
        };
      });

      // Sort by descending score for consistency
      results.sort((a, b) => b.score - a.score);

      this._metrics.nativeSearchCount++;
    } catch {
      // If native search fails, fall back to brute-force over stored vectors
      this._metrics.fallbackSearchCount++;
      this._metrics.bruteForceSearchCount++;
      console.warn(
        `[NativeHNSW] FALLBACK: Using brute-force linear scan (@ruvector/router search failed). Index size: ${this.vectorStore.size}`
      );
      results = this.bruteForceSearch(normalizedQuery, queryNorm, actualK);
    }

    const elapsed = performance.now() - start;
    this.updateSearchMetrics(elapsed);

    // Compute derived fallback metrics
    this._metrics.fallbackRate =
      this._metrics.fallbackSearchCount / this._metrics.totalSearches;
    this._metrics.allSearchesBruteForce =
      this._metrics.nativeSearchCount === 0 && this._metrics.totalSearches > 0;

    // One-time warning when fallback rate is dangerously high
    if (
      !this.highFallbackWarningEmitted &&
      this._metrics.fallbackRate > 0.5 &&
      this._metrics.totalSearches >= 10
    ) {
      this.highFallbackWarningEmitted = true;
      console.error(
        `[NativeHNSW] WARNING: ${(this._metrics.fallbackRate * 100).toFixed(0)}% of searches are using brute-force fallback. Native HNSW may not be functioning correctly. Consider rebuilding the index or checking @ruvector/router installation.`
      );
    }

    if (elapsed > 50) {
      console.warn(
        `[NativeHNSW] search took ${elapsed.toFixed(1)}ms (k=${k}, results=${results.length})`
      );
    }

    return results;
  }

  remove(id: number): boolean {
    if (!this.vectorStore.has(id)) return false;

    try {
      this.nativeDb!.delete(String(id));
    } catch {
      // Native remove failed; clean up local state anyway
    }

    this.vectorStore.delete(id);
    this.normStore.delete(id);
    this.metadataStore.delete(id);
    this._metrics.totalRemoves++;

    return true;
  }

  size(): number {
    return this.vectorStore.size;
  }

  dimensions(): number {
    return this.config.dimensions;
  }

  recall(): number {
    // HNSW is approximate, estimate recall based on efSearch/M ratio
    // Higher efSearch relative to M means better recall
    const ratio = this.config.efSearch / this.config.M;
    if (ratio >= 10) return 0.99;
    if (ratio >= 5) return 0.97;
    if (ratio >= 3) return 0.95;
    return 0.90;
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
   * Deletes all entries from the native VectorDb.
   */
  clear(): void {
    if (!this.nativeDb) return;
    // Delete all entries from native DB
    for (const id of this.vectorStore.keys()) {
      try { this.nativeDb.delete(String(id)); } catch { /* ignore */ }
    }

    this.vectorStore.clear();
    this.normStore.clear();
    this.metadataStore.clear();
  }

  /**
   * Dispose of the native VectorDb handle so NAPI garbage collection can
   * reclaim the underlying Rust-side index. After dispose(), this backend
   * instance must not be used. The HnswAdapter registry is expected to
   * drop its reference as part of `HnswAdapter.close(name)`.
   *
   * This is the load-bearing fix for the v3.9.1 regression where
   * `resetUnifiedMemory()` would null the UnifiedMemoryManager but leave
   * a stale NativeHnswBackend alive in the HnswAdapter registry.
   */
  dispose(): void {
    // Clear local mirrors first so `clear()` on a dead nativeDb is a no-op.
    this.vectorStore.clear();
    this.normStore.clear();
    this.metadataStore.clear();
    // Drop the native handle. Rust-side VectorDb is reclaimed by NAPI GC.
    this.nativeDb = null;
  }

  /**
   * Check if the native backend is operational.
   */
  isNativeAvailable(): boolean {
    return this.nativeDb !== null;
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

  /**
   * Brute-force fallback search over locally stored vectors.
   * Used when native search throws an unexpected error.
   */
  private bruteForceSearch(
    query: Float32Array,
    queryNorm: number,
    k: number
  ): SearchResult[] {
    const scored: SearchResult[] = [];

    for (const [id, vector] of this.vectorStore) {
      const norm = this.normStore.get(id) ?? computeNorm(vector);
      const score =
        this.config.metric === 'cosine'
          ? fastCosineSimilarity(query, vector, queryNorm, norm)
          : -(function () {
              let sum = 0;
              const len = Math.min(query.length, vector.length);
              for (let i = 0; i < len; i++) {
                const diff = query[i] - vector[i];
                sum += diff * diff;
              }
              return Math.sqrt(sum);
            })();

      scored.push({
        id,
        score,
        metadata: this.metadataStore.get(id),
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
}
