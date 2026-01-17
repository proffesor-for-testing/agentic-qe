/**
 * Code Intelligence Retrieval Module
 *
 * Semantic search for code using embeddings.
 * Optimized for AST-chunked code with multi-chunk retrieval.
 */

export { SemanticRetriever } from './SemanticRetriever.js';
export {
  RetrievalConfig,
  RetrievalResult,
  RetrievalResponse,
  RetrievalStats,
  StoredChunk,
  DEFAULT_RETRIEVAL_CONFIG,
  PRECISION_RETRIEVAL_CONFIG,
  RECALL_RETRIEVAL_CONFIG,
} from './types.js';
