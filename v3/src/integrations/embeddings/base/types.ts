/**
 * Unified Embedding Types - Shared between QE and claude-flow
 *
 * Per ADR-040: Code deduplication strategy
 * - Base types shared between QE and claude-flow
 * - QE-specific extensions in separate module
 *
 * @module integrations/embeddings/base/types
 */

/**
 * Embedding vector dimension
 */
export type EmbeddingDimension = 256 | 384 | 512 | 768 | 1024 | 1536;

/**
 * Embedding namespace for separation
 */
export type EmbeddingNamespace = 'text' | 'code' | 'test' | 'coverage' | 'defect';

/**
 * Quantization type for memory reduction
 */
export type QuantizationType = 'none' | 'fp16' | 'int8' | 'binary';

/**
 * Base embedding interface
 */
export interface IEmbedding {
  /** Vector data */
  vector: number[] | Float32Array | Int8Array | Uint8Array;
  /** Dimension */
  dimension: EmbeddingDimension;
  /** Namespace */
  namespace: EmbeddingNamespace;
  /** Original text */
  text: string;
  /** Timestamp */
  timestamp: number;
  /** Quantization type */
  quantization: QuantizationType;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Embedding model type
 */
export type EmbeddingModelType =
  | 'transformers'
  | 'onnx'
  | 'ollama'
  | 'openai'
  | 'cohere'
  | 'voyageai';

/**
 * Embedding model config
 */
export interface IEmbeddingModelConfig {
  /** Model type */
  type: EmbeddingModelType;
  /** Model name */
  model: string;
  /** Dimension */
  dimension: EmbeddingDimension;
  /** Quantization */
  quantization: QuantizationType;
  /** Cache enabled */
  cacheEnabled: boolean;
  /** ONNX runtime enabled */
  onnxEnabled: boolean;
  /** Maximum sequence length */
  maxSequenceLength: number;
  /** Default namespace */
  namespace?: EmbeddingNamespace;
}

/**
 * Embedding generator options
 */
export interface IEmbeddingOptions {
  /** Namespace */
  namespace?: EmbeddingNamespace;
  /** Quantization type */
  quantization?: QuantizationType;
  /** Cache result */
  cache?: boolean;
  /** Progress callback */
  onProgress?: (progress: number) => void;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Batch embedding result
 */
export interface IBatchEmbeddingResult {
  /** Embeddings */
  embeddings: IEmbedding[];
  /** Total time in ms */
  totalTime: number;
  /** Average time per embedding */
  avgTime: number;
  /** Cache hits */
  cacheHits: number;
  /** Cache misses */
  cacheMisses: number;
}

/**
 * Similarity result
 */
export interface ISimilarityResult {
  /** Target text/embedding */
  target: string;
  /** Similarity score (0-1) */
  score: number;
  /** Rank */
  rank: number;
}

/**
 * Search options
 */
export interface ISearchOptions {
  /** Maximum results */
  limit?: number;
  /** Minimum similarity threshold */
  threshold?: number;
  /** Namespace filter */
  namespace?: EmbeddingNamespace;
  /** Include metadata */
  includeMetadata?: boolean;
}

/**
 * HNSW index configuration
 */
export interface IHNSWConfig {
  /** Maximum connections per node */
  M: number;
  /** Construction parameter */
  efConstruction: number;
  /** Search parameter */
  efSearch: number;
  /** Vector dimension */
  dimension: EmbeddingDimension;
  /** Metric */
  metric: 'cosine' | 'euclidean' | 'dotproduct';
  /** Quantization */
  quantization: QuantizationType;
}

/**
 * Cache configuration
 */
export interface ICacheConfig {
  /** Maximum entries per namespace */
  maxSize: number;
  /** TTL in seconds (0 = no expiry) */
  ttl: number;
  /** Persistent storage */
  persistent: boolean;
  /** Storage path */
  storagePath?: string;
  /** Compression */
  compression: boolean;
}

/**
 * Embedding statistics
 */
export interface IEmbeddingStats {
  /** Total embeddings stored */
  totalEmbeddings: number;
  /** Embeddings by namespace */
  byNamespace: Record<EmbeddingNamespace, number>;
  /** Cache hits */
  cacheHits: number;
  /** Cache misses */
  cacheMisses: number;
  /** Cache hit rate */
  cacheHitRate: number;
  /** Average embedding time (ms) */
  avgEmbeddingTime: number;
  /** Total memory usage (bytes) */
  memoryUsage: number;
  /** Memory reduction via quantization (%) */
  memoryReduction: number;
  /** HNSW index size */
  indexSize: number;
  /** Index build time (ms) */
  indexBuildTime: number;
}

/**
 * Performance targets from ADR-040
 */
export const PERFORMANCE_TARGETS = {
  /** Test embedding time */
  testEmbeddingMs: 15,
  /** Speedup with ONNX */
  onnxSpeedup: 75,
  /** Memory reduction with quantization */
  quantizationReductionMin: 50,
  quantizationReductionMax: 75,
  /** HNSW search speedup */
  hnswSpeedupMin: 150,
  hnswSpeedupMax: 12500,
} as const;
