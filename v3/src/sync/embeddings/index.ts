/**
 * Sync Embeddings Module
 * Cloud Sync Plan Phase 3: Embedding Generation
 *
 * Generates embeddings for patterns to enable vector similarity search
 * in cloud PostgreSQL with ruvector.
 */

export {
  SyncEmbeddingGenerator,
  createSyncEmbeddingGenerator,
  type PatternRecord,
  type PatternEmbeddingResult,
  type EmbeddingBatchStats,
} from './sync-embedding-generator.js';
