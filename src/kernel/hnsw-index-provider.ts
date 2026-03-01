/**
 * Unified HNSW Index Provider Interface
 *
 * Single interface for ALL vector search operations in AQE v3.
 * Replaces the three fragmented implementations:
 * 1. InMemoryHNSWIndex (TypeScript HNSW)
 * 2. RuvectorFlatIndex (@ruvector/gnn flat search)
 * 3. QEGNNEmbeddingIndex (coverage domain)
 *
 * @see ADR-071: HNSW Implementation Unification
 * @module kernel/hnsw-index-provider
 */

// ============================================================================
// Search Result
// ============================================================================

/**
 * Result from a vector similarity search.
 */
export interface SearchResult {
  /** Numeric identifier for the matched vector */
  id: number;
  /** Similarity score (higher = more similar, range depends on metric) */
  score: number;
  /** Optional metadata associated with this vector */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// HNSW Configuration
// ============================================================================

/**
 * Configuration for an HNSW index instance.
 */
export interface HnswConfig {
  /** Number of vector dimensions (e.g. 384, 768) */
  dimensions: number;
  /** Max connections per node in the HNSW graph (default: 16) */
  M: number;
  /** Build-time candidate list size (default: 200) */
  efConstruction: number;
  /** Query-time candidate list size (default: 100) */
  efSearch: number;
  /** Distance metric */
  metric: 'cosine' | 'euclidean';
}

/**
 * Default HNSW configuration matching existing AQE defaults.
 */
export const DEFAULT_HNSW_CONFIG: HnswConfig = {
  dimensions: 384,
  M: 16,
  efConstruction: 200,
  efSearch: 100,
  metric: 'cosine',
};

// ============================================================================
// IHnswIndexProvider Interface
// ============================================================================

/**
 * Unified HNSW index provider interface.
 *
 * This is the single interface ALL callers must use for vector search.
 * Backed by ProgressiveHnswBackend which uses @ruvector/gnn's
 * differentiableSearch as the primary engine with brute-force fallback.
 */
export interface IHnswIndexProvider {
  /**
   * Add a vector to the index.
   *
   * @param id - Numeric identifier for the vector
   * @param vector - The vector data (must match configured dimensions, or will be auto-resized)
   * @param metadata - Optional metadata to associate with this vector
   */
  add(id: number, vector: Float32Array, metadata?: Record<string, unknown>): void;

  /**
   * Search for the k nearest neighbors of the query vector.
   *
   * @param query - Query vector (must match configured dimensions, or will be auto-resized)
   * @param k - Number of neighbors to return
   * @returns Array of SearchResult sorted by descending score
   */
  search(query: Float32Array, k: number): SearchResult[];

  /**
   * Remove a vector from the index.
   *
   * @param id - The numeric identifier to remove
   * @returns true if the vector was found and removed, false otherwise
   */
  remove(id: number): boolean;

  /**
   * Get the number of vectors currently in the index.
   */
  size(): number;

  /**
   * Get the configured vector dimensions.
   */
  dimensions(): number;

  /**
   * Get the estimated recall of the index (0-1).
   *
   * For brute-force search this returns 1.0 (exact results).
   * For approximate HNSW this returns an estimate based on configuration.
   */
  recall(): number;
}
