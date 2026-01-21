/**
 * ONNX Embeddings Adapter - Type Definitions
 *
 * Provides type-safe interfaces for ONNX-based vector embeddings with
 * support for Euclidean and hyperbolic (Poincaré ball) embeddings.
 *
 * @module onnx-embeddings/types
 */

/**
 * Supported ONNX embedding models
 */
export enum EmbeddingModel {
  /** Lightweight model, 384 dimensions, fast inference */
  MINI_LM_L6 = 'all-MiniLM-L6-v2',
  /** Larger model, 768 dimensions, higher quality */
  MPNET_BASE = 'all-mpnet-base-v2'
}

/**
 * Similarity metrics for semantic search
 */
export enum SimilarityMetric {
  /** Cosine similarity (default, range: [-1, 1]) */
  COSINE = 'cosine',
  /** Euclidean distance (L2 norm) */
  EUCLIDEAN = 'euclidean',
  /** Poincaré distance (hyperbolic space) */
  POINCARE = 'poincare'
}

/**
 * Vector embedding representation
 */
export interface Embedding {
  /** The embedding vector (normalized) */
  vector: number[];
  /** Dimensionality of the embedding */
  dimensions: number;
  /** Model used to generate the embedding */
  model: EmbeddingModel;
  /** Whether this is a hyperbolic embedding */
  isHyperbolic: boolean;
}

/**
 * Configuration for embedding generation
 */
export interface EmbeddingConfig {
  /** Model to use for generation */
  model: EmbeddingModel;
  /** Whether to L2 normalize embeddings */
  normalize: boolean;
  /** Enable hyperbolic (Poincaré ball) embeddings */
  hyperbolic: boolean;
  /** Cache size for LRU cache (0 to disable) */
  cacheSize: number;
  /** Poincaré ball curvature (negative value) */
  curvature: number;
}

/**
 * Result from similarity search
 */
export interface SimilarityResult {
  /** The matching text */
  text: string;
  /** The embedding vector */
  embedding: Embedding;
  /** Similarity score (higher is better for cosine, lower for distances) */
  score: number;
  /** Original metadata if provided */
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for similarity search
 */
export interface SearchConfig {
  /** Similarity metric to use */
  metric: SimilarityMetric;
  /** Number of top results to return */
  topK: number;
  /** Minimum similarity threshold (0-1 for cosine) */
  threshold: number;
  /** Search in specific namespace */
  namespace?: string;
}

/**
 * Configuration for hyperbolic operations
 */
export interface HyperbolicConfig {
  /** Poincaré ball curvature (must be negative) */
  curvature: number;
  /** Epsilon for numerical stability */
  epsilon: number;
}

/**
 * Statistics for ONNX embedding operations
 */
export interface EmbeddingStats {
  /** Total embeddings generated */
  totalGenerated: number;
  /** Cache hits */
  cacheHits: number;
  /** Cache misses */
  cacheMisses: number;
  /** Total searches performed */
  totalSearches: number;
  /** Average generation time (ms) */
  avgGenerationTime: number;
  /** Average search time (ms) */
  avgSearchTime: number;
  /** Model currently in use */
  currentModel: EmbeddingModel;
  /** Total vectors stored */
  vectorsStored: number;
}

/**
 * Stored embedding with metadata
 */
export interface StoredEmbedding {
  /** Unique identifier */
  id: string;
  /** Original text */
  text: string;
  /** The embedding */
  embedding: Embedding;
  /** Optional namespace for organization */
  namespace?: string;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  /** Timestamp of creation */
  createdAt: number;
}

/**
 * Batch embedding generation request
 */
export interface BatchEmbeddingRequest {
  /** Texts to embed */
  texts: string[];
  /** Configuration override */
  config?: Partial<EmbeddingConfig>;
}

/**
 * Batch embedding generation result
 */
export interface BatchEmbeddingResult {
  /** Generated embeddings (same order as input) */
  embeddings: Embedding[];
  /** Time taken (ms) */
  duration: number;
  /** Number of cache hits */
  cacheHits: number;
}

/**
 * Health status of ONNX embedding system
 */
export interface EmbeddingHealth {
  /** Whether ONNX runtime is available */
  available: boolean;
  /** Current model loaded */
  modelLoaded: EmbeddingModel | null;
  /** Error message if unavailable */
  error?: string;
  /** System information */
  system: {
    /** Available memory (bytes) */
    memory: number;
    /** CPU thread count */
    threads: number;
  };
}

/**
 * Error types for embedding operations
 */
export enum EmbeddingErrorType {
  /** ONNX runtime not available */
  RUNTIME_UNAVAILABLE = 'RUNTIME_UNAVAILABLE',
  /** Model loading failed */
  MODEL_LOAD_FAILED = 'MODEL_LOAD_FAILED',
  /** Invalid input text */
  INVALID_INPUT = 'INVALID_INPUT',
  /** Vector dimension mismatch */
  DIMENSION_MISMATCH = 'DIMENSION_MISMATCH',
  /** Hyperbolic operation failed */
  HYPERBOLIC_ERROR = 'HYPERBOLIC_ERROR',
  /** Cache operation failed */
  CACHE_ERROR = 'CACHE_ERROR'
}

/**
 * Custom error for embedding operations
 */
export class EmbeddingError extends Error {
  constructor(
    public readonly type: EmbeddingErrorType,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'EmbeddingError';
  }
}
