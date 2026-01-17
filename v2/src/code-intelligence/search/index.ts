/**
 * Hybrid Search Module
 *
 * Combines BM25 keyword search with vector similarity
 * using Reciprocal Rank Fusion.
 */

export { HybridSearchEngine } from './HybridSearchEngine.js';
export type { VectorSearchProvider } from './HybridSearchEngine.js';
export { BM25Search } from './BM25Search.js';
export { RRFFusion } from './RRFFusion.js';
export { VectorSearch } from './VectorSearch.js';
export type { VectorDocument, VectorSearchConfig as VectorSearchImplConfig } from './VectorSearch.js';
export {
  SearchResult,
  SearchResponse,
  SearchStats,
  HybridSearchConfig,
  BM25Config,
  BM25Index,
  BM25Document,
  VectorSearchConfig,
  RRFConfig,
  RRFRanking,
  DEFAULT_HYBRID_SEARCH_CONFIG,
  DEFAULT_BM25_CONFIG,
  DEFAULT_VECTOR_SEARCH_CONFIG,
  DEFAULT_RRF_CONFIG,
} from './types.js';
