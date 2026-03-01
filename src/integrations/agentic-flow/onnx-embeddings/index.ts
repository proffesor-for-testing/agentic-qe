/**
 * ONNX Embeddings Adapter
 *
 * Fast local vector embeddings with hyperbolic space support.
 * Bridges to agentic-flow MCP tools for production use.
 *
 * @module onnx-embeddings
 *
 * @example Basic Usage
 * ```typescript
 * import { createONNXEmbeddingsAdapter } from '@agentic-qe/integrations/agentic-flow/onnx-embeddings';
 *
 * const adapter = createONNXEmbeddingsAdapter();
 * await adapter.initialize();
 *
 * // Generate embedding
 * const embedding = await adapter.generateEmbedding('Hello world');
 *
 * // Search for similar texts
 * await adapter.generateAndStore('Machine learning is fascinating');
 * await adapter.generateAndStore('Deep learning models are powerful');
 * await adapter.generateAndStore('I love pizza');
 *
 * const results = await adapter.searchByText('AI and neural networks', {
 *   topK: 2,
 *   threshold: 0.5
 * });
 * ```
 *
 * @example Hyperbolic Embeddings
 * ```typescript
 * const adapter = createONNXEmbeddingsAdapter({
 *   embedding: {
 *     hyperbolic: true,
 *     curvature: -1.0
 *   }
 * });
 *
 * const embedding = await adapter.generateEmbedding('Hierarchical data');
 * console.log(embedding.isHyperbolic); // true
 *
 * // Calculate hyperbolic distance
 * const emb1 = await adapter.generateEmbedding('Parent node');
 * const emb2 = await adapter.generateEmbedding('Child node');
 * const distance = adapter.hyperbolicDistance(emb1, emb2);
 * ```
 *
 * @example Batch Operations
 * ```typescript
 * const result = await adapter.generateBatch({
 *   texts: ['First text', 'Second text', 'Third text'],
 *   config: { normalize: true }
 * });
 *
 * console.log(`Generated ${result.embeddings.length} embeddings in ${result.duration}ms`);
 * console.log(`Cache hits: ${result.cacheHits}`);
 * ```
 */

// Main adapter
export { ONNXEmbeddingsAdapter, createONNXEmbeddingsAdapter } from './adapter.js';
export type { ONNXEmbeddingsAdapterConfig } from './adapter.js';

// Core components
export { EmbeddingGenerator } from './embedding-generator.js';
export { SimilaritySearch } from './similarity-search.js';
export { HyperbolicOps } from './hyperbolic-ops.js';

// Types
export type {
  Embedding,
  EmbeddingConfig,
  StoredEmbedding,
  SimilarityResult,
  SearchConfig,
  BatchEmbeddingRequest,
  BatchEmbeddingResult,
  EmbeddingStats,
  EmbeddingHealth,
  HyperbolicConfig
} from './types.js';

export {
  EmbeddingModel,
  SimilarityMetric,
  EmbeddingErrorType,
  EmbeddingError
} from './types.js';
