/**
 * Embedding Generation Module
 *
 * Provides text and code embedding generation with:
 * - Hash-based embeddings (fast, deterministic)
 * - ML-based embeddings (production-quality)
 * - LRU caching for performance
 * - Batch processing support
 *
 * @module embeddings
 */

export {
  EmbeddingGenerator,
  EmbeddingOptions,
  EmbeddingResult,
  BatchEmbeddingResult
} from './EmbeddingGenerator';

export {
  EmbeddingCache,
  CacheStats
} from './EmbeddingCache';

// Re-export for convenience
export { EmbeddingGenerator as default } from './EmbeddingGenerator';
