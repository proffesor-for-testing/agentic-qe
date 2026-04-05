/**
 * Hyperbolic Pattern Index — HyperbolicHNSW wrapper for pattern search
 * ADR-087, R14: Poincare ball embeddings for hierarchical pattern data
 *
 * Provides an optional hyperbolic search backend for PatternStore.
 * When enabled (via feature flag), patterns with embeddings are indexed
 * into a Poincare ball HNSW structure that naturally preserves
 * parent-child / hierarchical relationships in distance metrics.
 *
 * This is a standalone wrapper to avoid conflicts with other PatternStore
 * modifications (HDC fingerprinting, delta event sourcing, etc.).
 */

import {
  HyperbolicHNSW,
  createHyperbolicHNSW,
  type HyperbolicSearchResult,
  type HyperbolicConfig,
  PoincareOperations,
} from '../integrations/ruvector/hyperbolic-hnsw.js';
import { isHyperbolicHnswEnabled } from '../integrations/ruvector/feature-flags.js';

// ============================================================================
// Hyperbolic Pattern Search Result
// ============================================================================

export interface HyperbolicPatternResult {
  /** Pattern ID */
  patternId: string;
  /** Hyperbolic (Poincare) distance — lower is more similar */
  distance: number;
  /** Metadata stored alongside the point */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Hyperbolic Pattern Index
// ============================================================================

/**
 * Wraps HyperbolicHNSW for pattern-store integration.
 *
 * Lazy-initialized: the underlying HNSW index is only created when the
 * feature flag `useHyperbolicHnsw` is true. All public methods are
 * safe to call when disabled — they return empty results or no-op.
 */
export class HyperbolicPatternIndex {
  private index: HyperbolicHNSW | null = null;
  private initialized = false;
  private readonly config: Partial<HyperbolicConfig>;

  constructor(config?: Partial<HyperbolicConfig>) {
    this.config = config ?? {};
  }

  /**
   * Lazily initialize the hyperbolic index if the feature flag is enabled.
   * Safe to call multiple times — only initializes once.
   *
   * @returns true if the index is available for use
   */
  ensureInitialized(): boolean {
    if (this.initialized) {
      return this.index !== null;
    }
    this.initialized = true;

    if (!isHyperbolicHnswEnabled()) {
      return false;
    }

    try {
      this.index = createHyperbolicHNSW(this.config);
      return this.index !== null;
    } catch (error) {
      console.warn(
        '[HyperbolicPatternIndex] Failed to create HyperbolicHNSW:',
        error instanceof Error ? error.message : error
      );
      this.index = null;
      return false;
    }
  }

  /**
   * Whether the hyperbolic index is currently available.
   */
  get isAvailable(): boolean {
    return this.index !== null;
  }

  /**
   * Index a pattern's embedding into the hyperbolic space.
   *
   * The embedding is projected from Euclidean into the Poincare ball
   * automatically by HyperbolicHNSW.insert().
   *
   * @param patternId - Unique pattern identifier
   * @param embedding - Euclidean embedding vector (will be projected to Poincare ball)
   * @param metadata - Optional metadata to store alongside the point
   */
  indexPattern(
    patternId: string,
    embedding: number[] | Float32Array,
    metadata?: Record<string, unknown>
  ): void {
    if (!this.ensureInitialized() || !this.index) return;

    try {
      const coords = embedding instanceof Float32Array
        ? embedding
        : new Float32Array(embedding);

      // Project Euclidean embedding into Poincare ball before insertion
      const hyperbolicCoords = PoincareOperations.euclideanToHyperbolic(coords);
      this.index.insert(patternId, hyperbolicCoords, metadata);
    } catch (error) {
      // Non-fatal: dimension mismatch or capacity exceeded
      console.debug(
        `[HyperbolicPatternIndex] Failed to index pattern ${patternId}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  /**
   * Search for nearest patterns in hyperbolic space.
   *
   * @param query - Query embedding (Euclidean; will be projected to Poincare ball)
   * @param k - Number of nearest neighbors to return
   * @returns Array of results sorted by ascending hyperbolic distance
   */
  search(query: Float32Array | number[], k: number): HyperbolicPatternResult[] {
    if (!this.ensureInitialized() || !this.index) return [];

    try {
      const coords = query instanceof Float32Array
        ? query
        : new Float32Array(query);

      // Project query into Poincare ball
      const hyperbolicQuery = PoincareOperations.euclideanToHyperbolic(coords);
      const results: HyperbolicSearchResult[] = this.index.search(hyperbolicQuery, k);

      return results.map(r => ({
        patternId: r.id,
        distance: r.distance,
        metadata: r.point.metadata,
      }));
    } catch (error) {
      console.warn(
        '[HyperbolicPatternIndex] Search failed:',
        error instanceof Error ? error.message : error
      );
      return [];
    }
  }

  /**
   * Get index statistics.
   */
  getStats(): { elementCount: number; dimensions: number; curvature: number } | null {
    if (!this.index) return null;
    return this.index.getStats();
  }

  /**
   * Reset the index (for testing / dispose).
   */
  reset(): void {
    this.index = null;
    this.initialized = false;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a HyperbolicPatternIndex with the given config.
 * The index is lazy — it won't allocate until ensureInitialized() is called.
 */
export function createHyperbolicPatternIndex(
  config?: Partial<HyperbolicConfig>
): HyperbolicPatternIndex {
  return new HyperbolicPatternIndex(config);
}
