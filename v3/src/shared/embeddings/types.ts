/**
 * Agentic QE v3 - Embedding Types
 * Types for the embedding system using Nomic via Ollama
 */

/**
 * Code chunk for embedding
 */
export interface CodeChunk {
  id: string;
  fileId: string;
  content: string;
  startLine: number;
  endLine: number;
  type: string;
  name?: string;
  language: string;
  metadata?: Record<string, unknown>;
}

/**
 * Result of embedding a single chunk
 */
export interface EmbeddingResult {
  chunkId: string;
  embedding: number[];
  model: string;
  cached: boolean;
  computeTimeMs: number;
}

/**
 * Result of batch embedding
 */
export interface EmbeddingBatchResult {
  results: EmbeddingResult[];
  stats: {
    totalChunks: number;
    cachedHits: number;
    computedNew: number;
    totalTimeMs: number;
    avgTimePerChunk: number;
  };
}

/**
 * Ollama API embedding request
 */
export interface OllamaEmbeddingRequest {
  model: string;
  prompt: string;
}

/**
 * Ollama API embedding response
 */
export interface OllamaEmbeddingResponse {
  embedding: number[];
}

/**
 * Ollama health/tags response
 */
export interface OllamaHealthResponse {
  models?: Array<{
    name: string;
    model: string;
    size: number;
    digest: string;
    details: {
      format: string;
      family: string;
      families: string[] | null;
      parameter_size: string;
      quantization_level: string;
    };
  }>;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  size: number;
  hitRate: number;
  hits: number;
  misses: number;
}

/**
 * Cache entry structure
 */
export interface EmbeddingCacheEntry {
  embedding: number[];
  timestamp: number;
  model: string;
}

/**
 * Batch progress tracking
 */
export interface BatchProgress {
  current: number;
  total: number;
  percentage: number;
  estimatedTimeRemainingMs?: number;
}

/**
 * Progress callback type
 */
export type ProgressCallback = (progress: BatchProgress) => void;

/**
 * Embedding configuration constants
 */
export const EMBEDDING_CONFIG = {
  /** Default model for embeddings */
  MODEL: 'nomic-embed-text',
  /** Embedding vector dimensions */
  DIMENSIONS: 768,
  /** Maximum context window in tokens */
  CONTEXT_WINDOW: 8192,
  /** Default batch size for processing */
  BATCH_SIZE: 100,
  /** Maximum retry attempts */
  MAX_RETRIES: 3,
  /** Delay between retries in ms */
  RETRY_DELAY_MS: 1000,
  /** Request timeout in ms */
  TIMEOUT_MS: 30000,
  /** Default Ollama URL */
  DEFAULT_OLLAMA_URL: 'http://localhost:11434',
} as const;

/**
 * Interface for embedding providers
 * Provides a simple API for generating embeddings
 */
export interface IEmbeddingProvider {
  /** Generate embedding for text */
  embed(text: string): Promise<number[]>;
  /** Check if provider is available */
  healthCheck(): Promise<boolean>;
  /** Get embedding dimensions */
  getDimensions(): number;
}
