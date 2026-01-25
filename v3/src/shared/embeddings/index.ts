/**
 * Agentic QE v3 - Embeddings Module
 *
 * Provides local, zero-cost embeddings via Ollama and nomic-embed-text model
 *
 * Features:
 * - 768-dimensional embeddings optimized for code
 * - Batch processing with progress tracking
 * - Semantic context formatting
 * - Content-hash based caching
 * - Graceful fallback when Ollama is unavailable
 * - Error handling and retries
 *
 * Usage:
 * ```typescript
 * import { NomicEmbedder, createNomicEmbedder } from './embeddings';
 *
 * const embedder = new NomicEmbedder();
 *
 * // Single embedding
 * const embedding = await embedder.embed("function example() {}");
 *
 * // Batch embeddings with progress
 * const result = await embedder.embedBatch(chunks, (progress) => {
 *   console.log(`${progress.percentage.toFixed(1)}% complete`);
 * });
 * ```
 */

export { NomicEmbedder, createNomicEmbedder } from './nomic-embedder';
export type { NomicEmbedderConfig } from './nomic-embedder';

export { OllamaClient } from './ollama-client';
export { EmbeddingCache } from './embedding-cache';

export type {
  CodeChunk,
  EmbeddingResult,
  EmbeddingBatchResult,
  OllamaEmbeddingRequest,
  OllamaEmbeddingResponse,
  OllamaHealthResponse,
  CacheStats,
  EmbeddingCacheEntry,
  BatchProgress,
  ProgressCallback,
  IEmbeddingProvider,
} from './types';

export { EMBEDDING_CONFIG } from './types';
