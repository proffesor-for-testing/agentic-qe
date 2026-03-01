/**
 * HNSW Adapter
 *
 * Wraps ProgressiveHnswBackend and provides backward-compatible APIs for
 * existing callers that use InMemoryHNSWIndex or RuvectorFlatIndex interfaces.
 *
 * Named indexes: patterns, qe-memory, learning, coverage
 *
 * @see ADR-071: HNSW Implementation Unification
 * @module kernel/hnsw-adapter
 */

import type {
  IHnswIndexProvider,
  SearchResult,
  HnswConfig,
} from './hnsw-index-provider.js';
import { DEFAULT_HNSW_CONFIG } from './hnsw-index-provider.js';
import { ProgressiveHnswBackend } from './progressive-hnsw-backend.js';

// ============================================================================
// Named Index Registry
// ============================================================================

/**
 * Well-known index names used across the AQE platform.
 */
export type HnswIndexName = 'patterns' | 'qe-memory' | 'learning' | 'coverage';

/**
 * Default configurations for each named index.
 */
const INDEX_DEFAULTS: Record<HnswIndexName, Partial<HnswConfig>> = {
  'patterns': {
    dimensions: 384,
    M: 16,
    efConstruction: 200,
    efSearch: 100,
    metric: 'cosine',
  },
  'qe-memory': {
    dimensions: 384,
    M: 16,
    efConstruction: 200,
    efSearch: 100,
    metric: 'cosine',
  },
  'learning': {
    dimensions: 384,
    M: 16,
    efConstruction: 200,
    efSearch: 50,
    metric: 'cosine',
  },
  'coverage': {
    dimensions: 768,
    M: 16,
    efConstruction: 200,
    efSearch: 100,
    metric: 'cosine',
  },
};

// ============================================================================
// Singleton Registry
// ============================================================================

const registry: Map<string, IHnswIndexProvider> = new Map();

// ============================================================================
// HnswAdapter
// ============================================================================

/**
 * Adapter that wraps ProgressiveHnswBackend and provides backward-compatible
 * APIs matching the old InMemoryHNSWIndex and RuvectorFlatIndex interfaces.
 *
 * This adapter bridges the gap between the new IHnswIndexProvider interface
 * and existing callers that use string-based IDs and number[] vectors.
 */
export class HnswAdapter implements IHnswIndexProvider {
  private readonly backend: ProgressiveHnswBackend;
  private readonly indexName: string;

  /** Maps string keys to numeric IDs (for backward compat with old APIs) */
  private stringToNumericId: Map<string, number> = new Map();
  private numericToStringId: Map<number, string> = new Map();
  private nextAutoId = 0;

  constructor(name: string, config?: Partial<HnswConfig>) {
    this.indexName = name;
    const defaults = INDEX_DEFAULTS[name as HnswIndexName] ?? {};
    this.backend = new ProgressiveHnswBackend({ ...defaults, ...config });
  }

  // ============================================================================
  // IHnswIndexProvider implementation
  // ============================================================================

  add(
    id: number,
    vector: Float32Array,
    metadata?: Record<string, unknown>
  ): void {
    this.backend.add(id, vector, metadata);
  }

  search(query: Float32Array, k: number): SearchResult[] {
    return this.backend.search(query, k);
  }

  remove(id: number): boolean {
    return this.backend.remove(id);
  }

  size(): number {
    return this.backend.size();
  }

  dimensions(): number {
    return this.backend.dimensions();
  }

  recall(): number {
    return this.backend.recall();
  }

  // ============================================================================
  // Backward-compatible APIs (InMemoryHNSWIndex style: string IDs, number[])
  // ============================================================================

  /**
   * Add a vector using a string ID (backward compat with InMemoryHNSWIndex).
   *
   * @param id - String identifier
   * @param embedding - Vector as number[]
   */
  addByStringId(id: string, embedding: number[]): void {
    let numericId = this.stringToNumericId.get(id);
    if (numericId !== undefined) {
      // Update existing
      this.backend.remove(numericId);
    } else {
      numericId = this.nextAutoId++;
      this.stringToNumericId.set(id, numericId);
      this.numericToStringId.set(numericId, id);
    }
    this.backend.add(numericId, new Float32Array(embedding));
  }

  /**
   * Search using a number[] query (backward compat with InMemoryHNSWIndex).
   *
   * @param query - Query vector as number[]
   * @param k - Number of results
   * @returns Results with string IDs and scores
   */
  searchByArray(
    query: number[],
    k: number
  ): Array<{ id: string; score: number }> {
    const results = this.backend.search(new Float32Array(query), k);
    return results.map((r) => ({
      id: this.numericToStringId.get(r.id) ?? String(r.id),
      score: r.score,
    }));
  }

  /**
   * Remove by string ID (backward compat with InMemoryHNSWIndex).
   */
  removeByStringId(id: string): boolean {
    const numericId = this.stringToNumericId.get(id);
    if (numericId === undefined) return false;
    const removed = this.backend.remove(numericId);
    if (removed) {
      this.stringToNumericId.delete(id);
      this.numericToStringId.delete(numericId);
    }
    return removed;
  }

  /**
   * Clear all vectors from the index.
   */
  clear(): void {
    this.backend.clear();
    this.stringToNumericId.clear();
    this.numericToStringId.clear();
    this.nextAutoId = 0;
  }

  /**
   * Check whether @ruvector/gnn is available.
   */
  isRuvectorAvailable(): boolean {
    return this.backend.isRuvectorAvailable();
  }

  /**
   * Get the index name.
   */
  getName(): string {
    return this.indexName;
  }

  // ============================================================================
  // Factory
  // ============================================================================

  /**
   * Create or retrieve a named HNSW index.
   *
   * Uses a singleton registry so the same name always returns the same instance.
   *
   * @param name - Index name (e.g. 'patterns', 'qe-memory', 'learning', 'coverage')
   * @param config - Optional configuration overrides
   * @returns IHnswIndexProvider instance
   */
  static create(name: string, config?: Partial<HnswConfig>): HnswAdapter {
    const existing = registry.get(name);
    if (existing instanceof HnswAdapter) {
      return existing;
    }

    const adapter = new HnswAdapter(name, config);
    registry.set(name, adapter);
    return adapter;
  }

  /**
   * Get an existing named index, or undefined if not created.
   */
  static get(name: string): HnswAdapter | undefined {
    const existing = registry.get(name);
    return existing instanceof HnswAdapter ? existing : undefined;
  }

  /**
   * Close and remove a named index from the registry.
   */
  static close(name: string): void {
    const existing = registry.get(name);
    if (existing instanceof HnswAdapter) {
      existing.clear();
    }
    registry.delete(name);
  }

  /**
   * Close all named indexes.
   */
  static closeAll(): void {
    for (const [name] of registry) {
      HnswAdapter.close(name);
    }
    registry.clear();
  }

  /**
   * List all registered index names.
   */
  static listIndexes(): string[] {
    return Array.from(registry.keys());
  }
}
