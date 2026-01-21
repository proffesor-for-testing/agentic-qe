/**
 * Types for Code Intelligence Embedding System
 *
 * Supports nomic-embed-text model via Ollama for local, zero-cost embeddings
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

export interface EmbeddingResult {
  chunkId: string;
  embedding: number[]; // 768 dimensions for nomic-embed-text
  model: string;
  cached: boolean;
  computeTimeMs: number;
}

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

export interface OllamaEmbeddingRequest {
  model: string;
  prompt: string;
}

export interface OllamaEmbeddingResponse {
  embedding: number[];
}

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

export interface CacheStats {
  size: number;
  hitRate: number;
  hits: number;
  misses: number;
}

export interface EmbeddingCacheEntry {
  embedding: number[];
  timestamp: number;
  model: string;
}

export interface BatchProgress {
  current: number;
  total: number;
  percentage: number;
  estimatedTimeRemainingMs?: number;
}

export type ProgressCallback = (progress: BatchProgress) => void;

export const EMBEDDING_CONFIG = {
  MODEL: 'nomic-embed-text',
  DIMENSIONS: 768,
  CONTEXT_WINDOW: 8192,
  BATCH_SIZE: 100,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  TIMEOUT_MS: 30000,
  DEFAULT_OLLAMA_URL: 'http://localhost:11434'
} as const;
