/**
 * QE Wrapper for @ruvector/gnn
 *
 * This wrapper provides QE-specific interface on top of @ruvector/gnn (Rust/NAPI).
 * Maintains backward compatibility with existing QE HNSW code while leveraging
 * the high-performance Rust implementation with differentiable search and GNN layers.
 *
 * @module integrations/ruvector/gnn-wrapper
 */

import {
  RuvectorLayer,
  TensorCompress,
  differentiableSearch,
  hierarchicalForward,
  getCompressionLevel,
  init,
  type CompressionLevelConfig,
  type SearchResult
} from '@ruvector/gnn';

import type {
  IEmbedding,
  IHNSWConfig,
  EmbeddingNamespace,
  ISearchOptions,
} from '../embeddings/base/types';

// ============================================================================
// Initialize @ruvector/gnn
// ============================================================================

let gnnInitialized = false;

/**
 * Initialize @ruvector/gnn (call once at startup)
 */
export function initGNN(): string {
  if (!gnnInitialized) {
    const result = init();
    gnnInitialized = true;
    return result;
  }
  return '@ruvector/gnn already initialized';
}

// ============================================================================
// QE-Specific Types
// ============================================================================

/**
 * Differentiable search result with soft weights
 */
export interface QEDifferentiableResult {
  /** Indices of top-k candidates */
  indices: number[];
  /** Soft weights for top-k candidates (sums to 1) */
  weights: number[];
}

/**
 * GNN layer configuration
 */
export interface QEGNNLayerConfig {
  /** Input dimension */
  inputDim: number;
  /** Hidden dimension */
  hiddenDim: number;
  /** Number of attention heads */
  heads: number;
  /** Dropout rate */
  dropout: number;
}

/**
 * Compression level for adaptive embedding compression
 */
export type QECompressionLevel =
  | 'none'
  | 'half'
  | 'pq8'
  | 'pq4'
  | 'binary';

/**
 * Compressed tensor metadata
 */
export interface QECompressedTensor {
  /** Original dimension */
  dimension: number;
  /** Compression level */
  level: QECompressionLevel;
  /** Compressed data (JSON string from @ruvector/gnn) */
  data: string;
  /** Access frequency (0-1) */
  accessFreq: number;
}

// ============================================================================
// HNSW Index Wrapper using @ruvector/gnn
// ============================================================================

/**
 * QE HNSW Index wrapper for @ruvector/gnn
 *
 * Provides backward-compatible interface while using @ruvector/gnn's
 * differentiable search and GNN capabilities.
 */
export class QEGNNEmbeddingIndex {
  private indexes: Map<EmbeddingNamespace, Map<number, IEmbedding>>;
  private config: IHNSWConfig;
  private nextId: Map<EmbeddingNamespace, number>;
  private gnnLayers: Map<string, RuvectorLayer>;
  private compressor: TensorCompress;

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
    this.nextId = new Map();
    this.gnnLayers = new Map();
    this.compressor = new TensorCompress();

    // Initialize @ruvector/gnn if not already done
    initGNN();
  }

  /**
   * Initialize index for a namespace
   */
  initializeIndex(namespace: EmbeddingNamespace): void {
    if (!this.indexes.has(namespace)) {
      this.indexes.set(namespace, new Map());
      this.nextId.set(namespace, 0);
    }
  }

  /**
   * Add embedding to index
   */
  addEmbedding(embedding: IEmbedding, id?: number): number {
    const namespace = embedding.namespace;

    if (!this.indexes.has(namespace)) {
      this.initializeIndex(namespace);
    }

    const index = this.indexes.get(namespace)!;
    const actualId = id ?? this.nextId.get(namespace)!;
    if (id === undefined) {
      this.nextId.set(namespace, actualId + 1);
    }

    index.set(actualId, embedding);
    return actualId;
  }

  /**
   * Add multiple embeddings to index
   */
  addEmbeddingsBatch(
    embeddings: Array<{ embedding: IEmbedding; id?: number }>
  ): number[] {
    const ids: number[] = [];

    for (const item of embeddings) {
      const id = this.addEmbedding(item.embedding, item.id);
      ids.push(id);
    }

    return ids;
  }

  /**
   * Search for similar embeddings using @ruvector/gnn's differentiable search
   */
  search(
    query: IEmbedding,
    options: ISearchOptions = {}
  ): Array<{ id: number; distance: number }> {
    const namespace = options.namespace || query.namespace;

    if (!this.indexes.has(namespace)) {
      return [];
    }

    const index = this.indexes.get(namespace)!;
    const k = options.limit || 10;

    // Convert embeddings to vectors for differentiable search
    const candidates: Array<{ id: number; vector: number[] }> = [];
    for (const [id, embedding] of index.entries()) {
      candidates.push({
        id,
        vector: Array.from(embedding.vector),
      });
    }

    if (candidates.length === 0) {
      return [];
    }

    // Use @ruvector/gnn's differentiable search
    // IMPORTANT: Native bindings require Float32Array, not plain arrays
    // Type assertions needed because TypeScript types say number[] but runtime requires Float32Array
    const queryFloat32 = new Float32Array(query.vector);
    const candidateFloat32s = candidates.map((c) => new Float32Array(c.vector));

    const result = differentiableSearch(
      queryFloat32 as unknown as number[],
      candidateFloat32s as unknown as number[][],
      Math.min(k, candidates.length),
      1.0 // temperature
    );

    // Map indices back to IDs and convert weights to distances
    return result.indices.map((idx, i) => ({
      id: candidates[idx]?.id ?? idx,
      // Convert soft weight to distance (higher weight = lower distance)
      distance: 1 - result.weights[i],
    }));
  }

  /**
   * Differentiable search with soft weights (gradient-friendly)
   *
   * Returns soft weights instead of hard distances, useful for RL gradients.
   */
  differentiableSearchWithWeights(
    query: IEmbedding,
    candidates: Array<{ id: number; embedding: IEmbedding }>,
    k: number,
    temperature: number = 1.0
  ): QEDifferentiableResult {
    // IMPORTANT: Native bindings require Float32Array, not plain arrays
    // Type assertions needed because TypeScript types say number[] but runtime requires Float32Array
    const queryVector = new Float32Array(query.vector);
    const candidateVectors = candidates.map((c) =>
      new Float32Array(c.embedding.vector)
    );

    const result = differentiableSearch(
      queryVector as unknown as number[],
      candidateVectors as unknown as number[][],
      Math.min(k, candidates.length),
      temperature
    );

    return {
      indices: result.indices.map((idx) => candidates[idx]?.id ?? idx),
      weights: result.weights,
    };
  }

  /**
   * Hierarchical forward pass through GNN layers
   *
   * Processes embeddings through multiple GNN layers for hierarchical feature extraction.
   */
  hierarchicalForward(
    query: number[],
    layerEmbeddings: Array<Array<number[]>>,
    layerConfigs: QEGNNLayerConfig[]
  ): number[] {
    // Create GNN layers if not exist
    const layerKey = layerConfigs.map((c) => `${c.inputDim}-${c.hiddenDim}`).join(',');

    if (!this.gnnLayers.has(layerKey)) {
      const layers: RuvectorLayer[] = [];
      for (const config of layerConfigs) {
        const layer = new RuvectorLayer(
          config.inputDim,
          config.hiddenDim,
          config.heads,
          config.dropout
        );
        layers.push(layer);
      }
      // Store first layer for now (can extend to multiple layers)
      this.gnnLayers.set(layerKey, layers[0]);
    }

    const layer = this.gnnLayers.get(layerKey)!;

    // Convert to format expected by @ruvector/gnn
    const gnnLayerJson = layer.toJson();

    // IMPORTANT: Native bindings require Float32Array, not plain arrays
    // Type assertions needed because TypeScript types say number[] but runtime requires Float32Array
    const queryFloat32 = new Float32Array(query);
    const layerEmbeddingsFloat32 = layerEmbeddings.map((layer) =>
      layer.map((emb) => new Float32Array(emb))
    );

    return Array.from(hierarchicalForward(
      queryFloat32 as unknown as number[],
      layerEmbeddingsFloat32 as unknown as number[][][],
      [gnnLayerJson]
    ));
  }

  /**
   * Compress embedding based on access frequency
   *
   * Uses adaptive compression to optimize memory usage:
   * - Hot data (high access): no compression
   * - Warm data (medium access): half precision
   * - Cold data (low access): product quantization
   */
  compressEmbedding(
    embedding: IEmbedding,
    accessFreq: number
  ): QECompressedTensor {
    const rawLevel = getCompressionLevel(accessFreq);
    // Map @ruvector/gnn compression levels to our QE type
    const levelMap: Record<string, QECompressionLevel> = {
      'none': 'none',
      'half': 'half',
      'pq8': 'pq8',
      'pq4': 'pq4',
      'binary': 'binary',
    };
    const level = levelMap[rawLevel] ?? 'none';

    // IMPORTANT: Native bindings require Float32Array, not plain arrays
    // Type assertions needed because TypeScript types say number[] but runtime requires Float32Array
    const vectorFloat32 = new Float32Array(embedding.vector);
    const compressed = this.compressor.compress(
      vectorFloat32 as unknown as number[],
      accessFreq
    );

    return {
      dimension: Array.from(embedding.vector).length,
      level,
      data: compressed,
      accessFreq,
    };
  }

  /**
   * Decompress embedding
   */
  decompressEmbedding(compressed: QECompressedTensor): IEmbedding {
    const vector = this.compressor.decompress(compressed.data);

    // Map @ruvector/gnn compression levels to IEmbedding quantization type
    const quantizationMap: Record<QECompressionLevel, 'none' | 'fp16' | 'int8' | 'binary'> = {
      'none': 'none',
      'half': 'fp16',
      'pq8': 'int8',
      'pq4': 'int8',
      'binary': 'binary',
    };

    return {
      vector,
      dimension: compressed.dimension as 256 | 384 | 512 | 768 | 1024 | 1536,
      namespace: 'code',
      text: '',
      timestamp: Date.now(),
      quantization: quantizationMap[compressed.level] ?? 'none',
    };
  }

  /**
   * Get compression level for access frequency
   */
  getCompressionLevelForFrequency(accessFreq: number): QECompressionLevel {
    return getCompressionLevel(accessFreq) as QECompressionLevel;
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
    if (!this.indexes.has(namespace)) {
      return null;
    }

    const index = this.indexes.get(namespace)!;

    return {
      size: index.size,
      maxElements: 10000,
      dimension: this.config.dimension,
      metric: this.config.metric,
    };
  }

  /**
   * Clear index for namespace
   */
  clearIndex(namespace: EmbeddingNamespace): void {
    this.indexes.delete(namespace);
    this.nextId.delete(namespace);
  }

  /**
   * Clear all indexes
   */
  clearAll(): void {
    this.indexes.clear();
    this.nextId.clear();
  }

  /**
   * Resize index
   */
  resizeIndex(namespace: EmbeddingNamespace): void {
    // @ruvector/gnn doesn't require explicit resizing
    // This is a no-op for backward compatibility
  }

  /**
   * Set search parameter
   */
  setEfSearch(ef: number): void {
    this.config.efSearch = ef;
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
    return this.indexes.has(namespace);
  }

  /**
   * Get all initialized namespaces
   */
  getInitializedNamespaces(): EmbeddingNamespace[] {
    return Array.from(this.indexes.keys());
  }

  /**
   * Get number of elements in index
   */
  getSize(namespace: EmbeddingNamespace): number {
    return this.indexes.get(namespace)?.size ?? 0;
  }

  /**
   * Save index to file
   * Note: @ruvector/gnn uses JSON serialization for layers
   */
  async saveIndex(namespace: EmbeddingNamespace, path: string): Promise<void> {
    // Export embeddings as JSON
    const index = this.indexes.get(namespace);
    if (!index) {
      throw new Error(`Namespace ${namespace} not initialized`);
    }

    const data = Array.from(index.entries()).map(([id, emb]) => ({
      id,
      vector: Array.from(emb.vector),
      metadata: emb.metadata,
    }));

    const fs = await import('fs/promises');
    await fs.writeFile(path, JSON.stringify(data, null, 2));
  }

  /**
   * Load index from file
   */
  async loadIndex(namespace: EmbeddingNamespace, path: string): Promise<void> {
    const fs = await import('fs/promises');
    const content = await fs.readFile(path, 'utf-8');
    const data = JSON.parse(content) as Array<{
      id: number;
      vector: number[];
      metadata?: unknown;
    }>;

    this.initializeIndex(namespace);

    for (const item of data) {
      const embedding: IEmbedding = {
        vector: item.vector,
        dimension: item.vector.length as 256 | 384 | 512 | 768 | 1024 | 1536,
        namespace,
        text: '',
        timestamp: Date.now(),
        quantization: 'none',
        metadata: item.metadata as Record<string, unknown> | undefined,
      };
      this.addEmbedding(embedding, item.id);
    }
  }
}

/**
 * HNSW index factory for managing multiple indexes
 */
export class QEGNNIndexFactory {
  private static instances: Map<string, QEGNNEmbeddingIndex> = new Map();

  /**
   * Get or create an index instance
   */
  static getInstance(
    name: string,
    config?: Partial<IHNSWConfig>
  ): QEGNNEmbeddingIndex {
    if (!this.instances.has(name)) {
      this.instances.set(name, new QEGNNEmbeddingIndex(config));
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

// ============================================================================
// GNN Layer Factory
// ============================================================================

/**
 * Factory for creating GNN layers
 */
export class GNNLayerFactory {
  private static layers: Map<string, RuvectorLayer> = new Map();

  /**
   * Get or create a GNN layer
   */
  static getLayer(config: QEGNNLayerConfig): RuvectorLayer {
    const key = `${config.inputDim}-${config.hiddenDim}-${config.heads}-${config.dropout}`;

    if (!this.layers.has(key)) {
      const layer = new RuvectorLayer(
        config.inputDim,
        config.hiddenDim,
        config.heads,
        config.dropout
      );
      this.layers.set(key, layer);
    }

    return this.layers.get(key)!;
  }

  /**
   * Create layer from JSON
   */
  static layerFromJson(json: string): RuvectorLayer {
    return RuvectorLayer.fromJson(json);
  }

  /**
   * Clear cached layers
   */
  static clearCache(): void {
    this.layers.clear();
  }
}

// ============================================================================
// Tensor Compression Factory
// ============================================================================

/**
 * Factory for tensor compression operations
 */
export class TensorCompressionFactory {
  private static compressor = new TensorCompress();

  /**
   * Compress tensor with specific level
   */
  static compressWithLevel(
    embedding: number[] | Float32Array,
    level: QECompressionLevel
  ): string {
    const config: CompressionLevelConfig = {
      levelType: level,
      scale: 1.0,
      subvectors: level === 'pq8' ? 8 : level === 'pq4' ? 16 : undefined,
      centroids: level === 'pq8' ? 256 : undefined,
      outlierThreshold: level === 'pq4' ? 3.0 : undefined,
      threshold: level === 'binary' ? 0.0 : undefined,
    };

    // IMPORTANT: Native bindings require Float32Array, not plain arrays
    // Type assertions needed because TypeScript types say number[] but runtime requires Float32Array
    const embeddingFloat32 = embedding instanceof Float32Array
      ? embedding
      : new Float32Array(embedding);

    return this.compressor.compressWithLevel(embeddingFloat32 as unknown as number[], config);
  }

  /**
   * Decompress tensor
   */
  static decompress(compressedJson: string): number[] {
    return this.compressor.decompress(compressedJson);
  }

  /**
   * Get compression level for frequency
   */
  static getLevel(accessFreq: number): QECompressionLevel {
    return getCompressionLevel(accessFreq) as QECompressionLevel;
  }
}

// ============================================================================
// Re-exports from @ruvector/gnn for advanced users
// ============================================================================

export {
  RuvectorLayer,
  TensorCompress,
  differentiableSearch,
  hierarchicalForward,
  getCompressionLevel,
  init,
  type CompressionLevelConfig,
  type SearchResult,
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert to Float32Array for @ruvector/gnn native bindings
 *
 * IMPORTANT: @ruvector/gnn native functions require Float32Array, not plain arrays.
 * This helper ensures proper type conversion.
 */
export function toFloat32Array(
  input: number[] | Float32Array | IEmbedding
): Float32Array {
  if (input instanceof Float32Array) {
    return input;
  }
  if ('vector' in input) {
    // IEmbedding
    if (input.vector instanceof Float32Array) {
      return input.vector;
    }
    return new Float32Array(input.vector);
  }
  // Plain number array
  return new Float32Array(input);
}

/**
 * Convert embedding to plain number array for @ruvector/gnn
 */
export function toNumberArray(
  embedding: IEmbedding | Float32Array | Int8Array | Uint8Array
): number[] {
  if ('vector' in embedding) {
    return Array.from(embedding.vector);
  }
  return Array.from(embedding);
}

/**
 * Convert plain number array to IEmbedding
 */
export function toIEmbedding(
  vector: number[],
  namespace: EmbeddingNamespace = 'code'
): IEmbedding {
  return {
    vector,
    dimension: vector.length as 256 | 384 | 512 | 768 | 1024 | 1536,
    namespace,
    text: '',
    timestamp: Date.now(),
    quantization: 'none',
  };
}

/**
 * Batch differentiable search for multiple queries
 */
export function batchDifferentiableSearch(
  queries: Array<number[] | Float32Array>,
  candidateEmbeddings: Array<number[] | Float32Array>,
  k: number,
  temperature: number = 1.0
): QEDifferentiableResult[] {
  const results: QEDifferentiableResult[] = [];

  // IMPORTANT: Native bindings require Float32Array, not plain arrays
  // Pre-convert candidates once for efficiency
  // Type assertions needed because TypeScript types say number[] but runtime requires Float32Array
  const candidatesFloat32 = candidateEmbeddings.map((c) =>
    c instanceof Float32Array ? c : new Float32Array(c)
  );

  for (const query of queries) {
    const queryFloat32 = query instanceof Float32Array ? query : new Float32Array(query);
    const result = differentiableSearch(
      queryFloat32 as unknown as number[],
      candidatesFloat32 as unknown as number[][],
      k,
      temperature
    );
    results.push({
      indices: result.indices,
      weights: result.weights,
    });
  }

  return results;
}
