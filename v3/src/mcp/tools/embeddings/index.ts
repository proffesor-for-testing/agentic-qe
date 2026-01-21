/**
 * Agentic QE v3 - ONNX Embeddings MCP Tools
 * ADR-051: Expose ONNX embeddings through MCP
 *
 * Tools:
 * - qe/embeddings/generate - Generate embedding vectors
 * - qe/embeddings/compare  - Compare text similarity
 * - qe/embeddings/search   - Semantic search
 * - qe/embeddings/store    - Store embeddings
 * - qe/embeddings/stats    - System statistics
 */

export {
  EmbeddingGenerateTool,
  EmbeddingCompareTool,
  EmbeddingSearchTool,
  EmbeddingStoreTool,
  EmbeddingStatsTool,
  embeddingGenerateTool,
  embeddingCompareTool,
  embeddingSearchTool,
  embeddingStoreTool,
  embeddingStatsTool,
  resetEmbeddingAdapter,
  type EmbeddingGenerateParams,
  type EmbeddingGenerateResult,
  type EmbeddingCompareParams,
  type EmbeddingCompareResult,
  type EmbeddingSearchParams,
  type EmbeddingSearchResult,
  type EmbeddingStoreParams,
  type EmbeddingStoreResult,
  type EmbeddingStatsResult,
} from './embedding';
