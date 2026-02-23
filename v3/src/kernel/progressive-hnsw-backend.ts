/**
 * Progressive HNSW Backend
 *
 * Unified HNSW backend implementing IHnswIndexProvider. Uses @ruvector/gnn's
 * differentiableSearch as the primary search engine with brute-force cosine
 * similarity fallback when @ruvector/gnn is unavailable.
 *
 * Progressive loading:
 * - Construction: instant (no vectors loaded)
 * - First add: vectors stored in flat arrays
 * - Search: uses @ruvector/gnn differentiableSearch for ranking, then
 *   computes exact cosine similarity for scores
 *
 * Handles dimension mismatch by auto-resizing vectors (384<->768).
 *
 * @see ADR-071: HNSW Implementation Unification
 * @module kernel/progressive-hnsw-backend
 */

import type {
  IHnswIndexProvider,
  SearchResult,
  HnswConfig,
} from './hnsw-index-provider.js';
import { DEFAULT_HNSW_CONFIG } from './hnsw-index-provider.js';

// ============================================================================
// @ruvector/gnn lazy loading
// ============================================================================

let ruvectorDifferentiableSearch: ((
  query: unknown,
  candidates: unknown[],
  k: number,
  temperature: number
) => { indices: number[]; weights: number[] }) | null = null;

let ruvectorInit: (() => string) | null = null;
let ruvectorInitialized = false;

function ensureRuvectorLoaded(): boolean {
  if (ruvectorInitialized) return ruvectorDifferentiableSearch !== null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const gnn = require('@ruvector/gnn');
    ruvectorDifferentiableSearch = gnn.differentiableSearch;
    ruvectorInit = gnn.init;
    if (ruvectorInit) {
      try {
        ruvectorInit();
      } catch {
        // Already initialized
      }
    }
    ruvectorInitialized = true;
    return true;
  } catch {
    ruvectorInitialized = true;
    return false;
  }
}

// ============================================================================
// Vector math helpers
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

function euclideanDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Resize a vector to the target dimensions.
 * Shrink: average adjacent values. Grow: zero-pad.
 */
function resizeVector(vector: Float32Array, targetDim: number): Float32Array {
  if (vector.length === targetDim) return vector;

  const result = new Float32Array(targetDim);

  if (vector.length > targetDim) {
    // Shrink by averaging adjacent values
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
    // Grow by zero-padding
    for (let i = 0; i < vector.length; i++) {
      result[i] = vector[i];
    }
  }

  return result;
}

// ============================================================================
// Stored vector entry
// ============================================================================

interface VectorEntry {
  id: number;
  vector: Float32Array;
  norm: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// ProgressiveHnswBackend
// ============================================================================

/**
 * Progressive HNSW backend using @ruvector/gnn differentiableSearch.
 *
 * Provides a unified vector search implementation that:
 * - Uses @ruvector/gnn for fast native search when available
 * - Falls back to brute-force cosine similarity when unavailable
 * - Auto-resizes dimension mismatches (384 <-> 768)
 * - Returns 1.0 recall for brute-force, estimated recall for HNSW
 */
export class ProgressiveHnswBackend implements IHnswIndexProvider {
  private readonly config: HnswConfig;
  private entries: VectorEntry[] = [];
  private idToIndex: Map<number, number> = new Map();
  private hasRuvector: boolean = false;
  private loaded: boolean = false;

  constructor(config?: Partial<HnswConfig>) {
    this.config = { ...DEFAULT_HNSW_CONFIG, ...config };
  }

  /**
   * Lazily load the @ruvector/gnn backend on first operation.
   */
  private ensureLoaded(): void {
    if (this.loaded) return;
    this.hasRuvector = ensureRuvectorLoaded();
    this.loaded = true;
  }

  /**
   * Normalize a vector to the configured dimensions, resizing if needed.
   */
  private normalizeVector(vector: Float32Array): Float32Array {
    if (vector.length === this.config.dimensions) return vector;
    return resizeVector(vector, this.config.dimensions);
  }

  add(
    id: number,
    vector: Float32Array,
    metadata?: Record<string, unknown>
  ): void {
    this.ensureLoaded();

    const normalized = this.normalizeVector(vector);
    const norm = computeNorm(normalized);

    // Handle duplicate: overwrite existing entry
    if (this.idToIndex.has(id)) {
      const idx = this.idToIndex.get(id)!;
      this.entries[idx] = { id, vector: normalized, norm, metadata };
      return;
    }

    const idx = this.entries.length;
    this.entries.push({ id, vector: normalized, norm, metadata });
    this.idToIndex.set(id, idx);
  }

  search(query: Float32Array, k: number): SearchResult[] {
    this.ensureLoaded();

    if (this.entries.length === 0) return [];

    const normalizedQuery = this.normalizeVector(query);
    const queryNorm = computeNorm(normalizedQuery);
    const actualK = Math.min(k, this.entries.length);

    // Determine if dimensions match for native search
    const storedDim =
      this.entries.length > 0 ? this.entries[0].vector.length : 0;
    const dimensionsMatch = normalizedQuery.length === storedDim;

    // Try @ruvector/gnn differentiableSearch first
    if (this.hasRuvector && dimensionsMatch && ruvectorDifferentiableSearch) {
      try {
        const candidateVectors = this.entries.map((e) => e.vector);
        const result = ruvectorDifferentiableSearch(
          normalizedQuery as unknown as number[],
          candidateVectors as unknown as number[][],
          actualK,
          1.0
        );

        return result.indices.map((idx) => {
          const entry = this.entries[idx];
          // Compute actual cosine similarity for the score
          const score =
            this.config.metric === 'cosine'
              ? fastCosineSimilarity(
                  normalizedQuery,
                  entry.vector,
                  queryNorm,
                  entry.norm
                )
              : -euclideanDistance(normalizedQuery, entry.vector);

          return {
            id: entry.id,
            score,
            metadata: entry.metadata,
          };
        });
      } catch {
        // Fall through to brute-force
      }
    }

    // Brute-force fallback
    return this.bruteForcSearch(normalizedQuery, queryNorm, actualK);
  }

  /**
   * Brute-force cosine similarity search as fallback.
   */
  private bruteForcSearch(
    query: Float32Array,
    queryNorm: number,
    k: number
  ): SearchResult[] {
    const scored: SearchResult[] = [];

    for (const entry of this.entries) {
      let score: number;
      if (this.config.metric === 'cosine') {
        score = fastCosineSimilarity(query, entry.vector, queryNorm, entry.norm);
      } else {
        score = -euclideanDistance(query, entry.vector);
      }

      scored.push({
        id: entry.id,
        score,
        metadata: entry.metadata,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  remove(id: number): boolean {
    const idx = this.idToIndex.get(id);
    if (idx === undefined) return false;

    // Swap with last element for O(1) removal
    const lastIdx = this.entries.length - 1;
    if (idx !== lastIdx) {
      const lastEntry = this.entries[lastIdx];
      this.entries[idx] = lastEntry;
      this.idToIndex.set(lastEntry.id, idx);
    }

    this.entries.pop();
    this.idToIndex.delete(id);
    return true;
  }

  size(): number {
    return this.entries.length;
  }

  dimensions(): number {
    return this.config.dimensions;
  }

  recall(): number {
    // Brute-force = exact search = 1.0 recall
    // @ruvector/gnn differentiableSearch is also brute-force-based (flat index)
    // so recall is 1.0 in both cases
    if (!this.hasRuvector) return 1.0;
    return 1.0;
  }

  /**
   * Check whether @ruvector/gnn is available as the search backend.
   */
  isRuvectorAvailable(): boolean {
    this.ensureLoaded();
    return this.hasRuvector;
  }

  /**
   * Get the current configuration.
   */
  getConfig(): Readonly<HnswConfig> {
    return { ...this.config };
  }

  /**
   * Clear all vectors from the index.
   */
  clear(): void {
    this.entries = [];
    this.idToIndex.clear();
  }
}
