/**
 * Code Intelligence Embeddings Module
 *
 * Provides local, zero-cost embeddings via Ollama and nomic-embed-text model
 *
 * Features:
 * - 768-dimensional embeddings optimized for code
 * - Batch processing with progress tracking
 * - Semantic context formatting
 * - Content-hash based caching
 * - Error handling and retries
 *
 * Usage:
 * ```typescript
 * import { NomicEmbedder } from './embeddings';
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

export { NomicEmbedder } from './NomicEmbedder';
export { OllamaClient } from './OllamaClient';
export { EmbeddingCache } from './EmbeddingCache';

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
  ProgressCallback
} from './types';

export { EMBEDDING_CONFIG } from './types';
