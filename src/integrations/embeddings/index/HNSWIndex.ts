/**
 * HNSW Index for Fast Similarity Search
 *
 * Shared HNSW indexing between QE and claude-flow per ADR-040.
 * Performance: 150x-12,500x faster than linear search
 *
 * When useUnifiedHnsw feature flag is enabled (ADR-071), all namespaces
 * are routed through the unified HnswAdapter backend instead of hnswlib-node.
 *
 * @module integrations/embeddings/index/HNSWIndex
 */

import type {
  IEmbedding,
  IHNSWConfig,
  EmbeddingNamespace,
  ISearchOptions,
} from '../base/types.js';

// ESM/CJS interop: hnswlib-node is CommonJS, we import via default export
// This pattern matches real-qe-reasoning-bank.ts for consistency
import hnswlib from 'hnswlib-node';
const { HierarchicalNSW } = hnswlib as { HierarchicalNSW: typeof import('hnswlib-node').HierarchicalNSW };

// ADR-071 Phase 2C: Always use unified HnswAdapter backend.
// The hnswlib-node legacy path below is retained as dead code for
// emergency rollback only — production always takes the adapter path.
function isUnifiedHnswActive(): boolean {
  return true;
}

/**
 * HNSW index manager
 *
 * Provides fast approximate nearest neighbor search using HNSW algorithm.
 * 150x-12,500x faster than linear search for large embedding collections.
 */
export class HNSWEmbeddingIndex {
  private indexes: Map<EmbeddingNamespace, InstanceType<typeof HierarchicalNSW>>;
  private config: IHNSWConfig;
  private initialized: Set<EmbeddingNamespace>;
  private nextId: Map<EmbeddingNamespace, number>;
  // ADR-071: Unified backend adapters per namespace (when useUnifiedHnsw=true)
  private unifiedAdapters: Map<EmbeddingNamespace, import('../../../kernel/hnsw-adapter.js').HnswAdapter> | null = null;
  private readonly useUnified: boolean;

  constructor(config: Partial<IHNSWConfig> = {}) {
    this.config = {
      M: config.M || 16,
      efConstruction: config.efConstruction || 200,
      efSearch: config.efSearch || 50,
      dimension: config.dimension || 384,
      metric: config.metric || 'cosine',
      quantization: config.quantization || 'none',
    };

    this.indexes = new Map();
    this.initialized = new Set();
    this.nextId = new Map();
    this.useUnified = isUnifiedHnswActive();
    if (this.useUnified) {
      this.unifiedAdapters = new Map();
    }
  }

  /**
   * Initialize index for a namespace
   */
  initializeIndex(namespace: EmbeddingNamespace): void {
    if (this.initialized.has(namespace)) {
      return;
    }

    // ADR-071: Route through unified HnswAdapter when flag is enabled
    if (this.useUnified && this.unifiedAdapters) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { HnswAdapter } = require('../../../kernel/hnsw-adapter.js');
        const adapter = new HnswAdapter(`embedding-${namespace}`, {
          dimensions: this.config.dimension,
          M: this.config.M,
          efConstruction: this.config.efConstruction,
          efSearch: this.config.efSearch,
          metric: this.config.metric === 'dotproduct' ? 'cosine' : (this.config.metric as 'cosine' | 'euclidean'),
        });
        this.unifiedAdapters.set(namespace, adapter);
        this.initialized.add(namespace);
        this.nextId.set(namespace, 0);
        return;
      } catch {
        // Fall through to hnswlib-node
      }
    }

    // Legacy path: hnswlib-node
    // Map our metric names to hnswlib-node space names
    const spaceMap: Record<string, 'l2' | 'ip' | 'cosine'> = {
      'cosine': 'cosine',
      'euclidean': 'l2',
      'dotproduct': 'ip',
    };

    const space = spaceMap[this.config.metric] || 'cosine';

    const index = new HierarchicalNSW(space, this.config.dimension);

    index.initIndex({
      maxElements: 10000,
      m: this.config.M,
      efConstruction: this.config.efConstruction,
    });

    this.indexes.set(namespace, index);
    this.initialized.add(namespace);
    this.nextId.set(namespace, 0);
  }

  /**
   * Add embedding to index
   */
  addEmbedding(embedding: IEmbedding, id?: number): number {
    const namespace = embedding.namespace;

    if (!this.initialized.has(namespace)) {
      this.initializeIndex(namespace);
    }

    // Use provided ID or auto-increment
    const actualId = id ?? this.nextId.get(namespace)!;
    if (id === undefined) {
      this.nextId.set(namespace, actualId + 1);
    }

    // ADR-071: Route through unified backend
    const adapter = this.unifiedAdapters?.get(namespace);
    if (adapter) {
      const vector = embedding.vector instanceof Float32Array
        ? embedding.vector
        : new Float32Array(this.toFloatArray(embedding.vector));
      adapter.add(actualId, vector);
      return actualId;
    }

    // Legacy path
    const index = this.indexes.get(namespace)!;
    const vector = this.toFloatArray(embedding.vector);
    index.addPoint(vector, actualId);

    return actualId;
  }

  /**
   * Add multiple embeddings to index
   */
  addEmbeddingsBatch(embeddings: Array<{ embedding: IEmbedding; id?: number }>): number[] {
    // ADR-071: Route each item through addEmbedding() which handles unified routing
    return embeddings.map(item => this.addEmbedding(item.embedding, item.id));
  }

  /**
   * Search for similar embeddings
   */
  search(
    query: IEmbedding,
    options: ISearchOptions = {}
  ): Array<{ id: number; distance: number }> {
    const namespace = options.namespace || query.namespace;

    if (!this.initialized.has(namespace)) {
      return [];
    }

    const k = options.limit || 10;

    // ADR-071: Route through unified backend
    const adapter = this.unifiedAdapters?.get(namespace);
    if (adapter) {
      const queryVector = query.vector instanceof Float32Array
        ? query.vector
        : new Float32Array(this.toFloatArray(query.vector));
      const results = adapter.search(queryVector, k);
      return results.map(r => ({
        id: r.id,
        distance: 1 - r.score, // convert similarity to distance
      }));
    }

    // Legacy path
    const index = this.indexes.get(namespace)!;
    const queryVector = this.toFloatArray(query.vector);
    const result = index.searchKnn(queryVector, k);

    // Convert hnswlib-node result format to our format
    return result.neighbors.map((id: number, i: number) => ({
      id,
      distance: result.distances[i],
    }));
  }

  /**
   * Get index statistics
   */
  getIndexStats(namespace: EmbeddingNamespace): {
    size: number;
    maxElements: number;
    dimension: number;
    metric: string;
  } | null {
    if (!this.initialized.has(namespace)) {
      return null;
    }

    // ADR-071: Use unified adapter stats
    const adapter = this.unifiedAdapters?.get(namespace);
    if (adapter) {
      return {
        size: adapter.size(),
        maxElements: 10000,
        dimension: adapter.dimensions(),
        metric: this.config.metric,
      };
    }

    const index = this.indexes.get(namespace)!;

    return {
      size: index.getCurrentCount(), // Note: This may not be available in all versions
      maxElements: 10000, // We set this during init
      dimension: this.config.dimension,
      metric: this.config.metric,
    };
  }

  /**
   * Save index to file.
   * Not supported when using unified backend (HnswAdapter manages persistence).
   */
  async saveIndex(namespace: EmbeddingNamespace, path: string): Promise<void> {
    if (!this.initialized.has(namespace)) {
      throw new Error(`Namespace ${namespace} not initialized`);
    }

    // ADR-071: Unified backend manages its own persistence
    if (this.unifiedAdapters?.has(namespace)) {
      console.warn(
        `[HNSWEmbeddingIndex] saveIndex() is a no-op for namespace '${namespace}' — ` +
        `unified HnswAdapter manages persistence internally.`,
      );
      return;
    }

    const index = this.indexes.get(namespace)!;
    await index.writeIndex(path);
  }

  /**
   * Load index from file.
   * Not supported when using unified backend (HnswAdapter manages persistence).
   */
  async loadIndex(namespace: EmbeddingNamespace, path: string): Promise<void> {
    // ADR-071: Unified backend manages its own persistence
    if (this.useUnified) {
      console.warn(
        `[HNSWEmbeddingIndex] loadIndex() is a no-op for namespace '${namespace}' — ` +
        `unified HnswAdapter manages persistence internally. Initialize via initializeIndex() instead.`,
      );
      return;
    }

    const spaceMap: Record<string, 'l2' | 'ip' | 'cosine'> = {
      'cosine': 'cosine',
      'euclidean': 'l2',
      'dotproduct': 'ip',
    };

    const space = spaceMap[this.config.metric] || 'cosine';
    const index = new HierarchicalNSW(space, this.config.dimension);

    await index.readIndex(path);

    this.indexes.set(namespace, index);
    this.initialized.add(namespace);
  }

  /**
   * Clear index for namespace
   */
  clearIndex(namespace: EmbeddingNamespace): void {
    if (this.initialized.has(namespace)) {
      // ADR-071: Clear unified adapter if present
      const adapter = this.unifiedAdapters?.get(namespace);
      if (adapter) {
        adapter.clear?.();
        this.unifiedAdapters!.delete(namespace);
      }
      this.indexes.delete(namespace);
      this.initialized.delete(namespace);
      this.nextId.delete(namespace);
    }
  }

  /**
   * Clear all indexes
   */
  clearAll(): void {
    // ADR-071: Clear all unified adapters
    if (this.unifiedAdapters) {
      for (const adapter of this.unifiedAdapters.values()) {
        adapter.clear?.();
      }
      this.unifiedAdapters.clear();
    }
    this.indexes.clear();
    this.initialized.clear();
    this.nextId.clear();
  }

  /**
   * Resize index if needed (recreate with new size)
   */
  resizeIndex(namespace: EmbeddingNamespace, newSize: number): void {
    if (!this.initialized.has(namespace)) {
      return;
    }

    // Clear and recreate
    this.clearIndex(namespace);
    this.initializeIndex(namespace);
  }

  /**
   * Set search parameter (ef) - not directly supported by hnswlib-node API
   * This is a placeholder for future implementation
   */
  setEfSearch(ef: number): void {
    this.config.efSearch = ef;
    // Note: hnswlib-node doesn't expose setEf directly
    // This would need to be handled at search time or with index recreation
  }

  /**
   * Convert embedding vector to float array
   * hnswlib-node expects plain number[], not Float32Array
   */
  private toFloatArray(
    vector: number[] | Float32Array | Int8Array | Uint8Array
  ): number[] {
    if (Array.isArray(vector)) {
      return vector;
    }

    if (vector instanceof Float32Array) {
      return Array.from(vector);
    }

    if (vector instanceof Int8Array) {
      // Dequantize int8 to plain number array (range: -128 to 127)
      const result: number[] = new Array(vector.length);
      for (let i = 0; i < vector.length; i++) {
        result[i] = vector[i] / 128;
      }
      return result;
    }

    if (vector instanceof Uint8Array) {
      // Dequantize uint8 to plain number array (range: 0 to 255)
      const result: number[] = new Array(vector.length);
      for (let i = 0; i < vector.length; i++) {
        result[i] = (vector[i] - 128) / 128;
      }
      return result;
    }

    // This should never happen with proper typing, but TypeScript's exhaustiveness check
    // requires handling all cases. The type system ensures vector is one of the above.
    throw new Error(`Unsupported vector type: ${typeof vector}`);
  }

  /**
   * Get current configuration
   */
  getConfig(): IHNSWConfig {
    return { ...this.config };
  }

  /**
   * Check if namespace is initialized
   */
  isInitialized(namespace: EmbeddingNamespace): boolean {
    return this.initialized.has(namespace);
  }

  /**
   * Get all initialized namespaces
   */
  getInitializedNamespaces(): EmbeddingNamespace[] {
    return Array.from(this.initialized);
  }

  /**
   * Get number of elements in index
   */
  getSize(namespace: EmbeddingNamespace): number {
    if (!this.initialized.has(namespace)) {
      return 0;
    }
    // ADR-071: Use unified adapter size when available
    const adapter = this.unifiedAdapters?.get(namespace);
    if (adapter) {
      return adapter.size();
    }
    return this.nextId.get(namespace) || 0;
  }
}

/**
 * HNSW index factory for managing multiple indexes
 */
export class HNSWIndexFactory {
  private static instances: Map<string, HNSWEmbeddingIndex> = new Map();

  /**
   * Get or create an index instance
   */
  static getInstance(
    name: string,
    config?: Partial<IHNSWConfig>
  ): HNSWEmbeddingIndex {
    if (!this.instances.has(name)) {
      this.instances.set(name, new HNSWEmbeddingIndex(config));
    }
    return this.instances.get(name)!;
  }

  /**
   * Close an index instance
   */
  static closeInstance(name: string): void {
    const instance = this.instances.get(name);
    if (instance) {
      instance.clearAll();
      this.instances.delete(name);
    }
  }

  /**
   * Close all instances
   */
  static closeAll(): void {
    for (const instance of this.instances.values()) {
      instance.clearAll();
    }
    this.instances.clear();
  }
}
