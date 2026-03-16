/**
 * QE Dashboard - Browser-based intelligence dashboard (Task 4.6)
 *
 * Provides WASM-accelerated vector storage and pattern exploration
 * for visualizing QE intelligence data in the browser.
 *
 * @module integrations/browser/qe-dashboard
 */

// Vector Store
export {
  WasmVectorStore,
  cosineSimilarity,
  type SearchResult,
  type StoreStats,
} from './wasm-vector-store.js';

// Clustering
export {
  kMeansClustering,
  generateEmbedding,
  generateQueryEmbedding,
  EMBEDDING_DIM,
  type EmbeddablePattern,
} from './clustering.js';

// Pattern Explorer
export {
  PatternExplorer,
  type Pattern,
  type PatternCluster,
  type DomainStats,
  type DashboardData,
} from './pattern-explorer.js';
