/**
 * Types for Hybrid Search System
 *
 * Combines BM25 keyword search with vector similarity
 * using Reciprocal Rank Fusion (RRF) for optimal results.
 */

export interface SearchResult {
  /** Chunk or document ID */
  id: string;

  /** File path */
  filePath: string;

  /** Content snippet */
  content: string;

  /** Start line */
  startLine: number;

  /** End line */
  endLine: number;

  /** Final combined score */
  score: number;

  /** BM25 score component */
  bm25Score?: number;

  /** Vector similarity score component */
  vectorScore?: number;

  /** Entity type if applicable */
  entityType?: string;

  /** Entity name if applicable */
  entityName?: string;

  /** Highlighted matches for display */
  highlights?: string[];
}

export interface SearchResponse {
  /** Search results ordered by relevance */
  results: SearchResult[];

  /** Original query */
  query: string;

  /** Total matches found */
  totalMatches: number;

  /** Search execution time (ms) */
  searchTimeMs: number;

  /** Search statistics */
  stats: SearchStats;
}

export interface SearchStats {
  /** BM25 candidates evaluated */
  bm25Candidates: number;

  /** Vector candidates evaluated */
  vectorCandidates: number;

  /** Final results after fusion */
  fusedResults: number;

  /** BM25 search time (ms) */
  bm25TimeMs: number;

  /** Vector search time (ms) */
  vectorTimeMs: number;

  /** Fusion time (ms) */
  fusionTimeMs: number;
}

export interface HybridSearchConfig {
  /**
   * Number of results to return.
   * Default: 10
   */
  topK: number;

  /**
   * Weight for BM25 scores (0-1).
   * Default: 0.5
   */
  bm25Weight: number;

  /**
   * Weight for vector scores (0-1).
   * Default: 0.5
   */
  vectorWeight: number;

  /**
   * RRF constant k for rank fusion.
   * Higher = more weight to lower ranks.
   * Default: 60
   */
  rrfK: number;

  /**
   * Minimum score threshold.
   * Default: 0.1
   */
  minScore: number;

  /**
   * Whether to use RRF or weighted sum.
   * Default: true (use RRF)
   */
  useRRF: boolean;

  /**
   * Number of candidates to fetch from each method.
   * Default: 50
   */
  candidateMultiplier: number;

  /**
   * Whether to include highlights.
   * Default: true
   */
  includeHighlights: boolean;
}

export interface BM25Config {
  /**
   * Term frequency saturation parameter.
   * Higher = diminishing returns for term frequency.
   * Default: 1.2
   */
  k1: number;

  /**
   * Length normalization parameter.
   * 0 = no normalization, 1 = full normalization.
   * Default: 0.75
   */
  b: number;

  /**
   * Minimum document frequency for term inclusion.
   * Default: 1
   */
  minDocFreq: number;

  /**
   * Maximum document frequency ratio for term exclusion.
   * Terms in more than this ratio of docs are excluded.
   * Default: 0.9
   */
  maxDocFreqRatio: number;
}

export interface BM25Index {
  /** Document count */
  docCount: number;

  /** Average document length */
  avgDocLength: number;

  /** Term -> document frequency */
  documentFrequency: Map<string, number>;

  /** Document ID -> term frequencies */
  termFrequencies: Map<string, Map<string, number>>;

  /** Document ID -> document length */
  documentLengths: Map<string, number>;

  /** Document ID -> original content */
  documents: Map<string, BM25Document>;
}

export interface BM25Document {
  /** Document ID */
  id: string;

  /** File path */
  filePath: string;

  /** Original content */
  content: string;

  /** Start line */
  startLine: number;

  /** End line */
  endLine: number;

  /** Tokenized terms */
  terms: string[];

  /** Entity type */
  entityType?: string;

  /** Entity name */
  entityName?: string;
}

export interface VectorSearchConfig {
  /**
   * Similarity metric.
   * Default: 'cosine'
   */
  metric: 'cosine' | 'euclidean' | 'dot';

  /**
   * Minimum similarity threshold.
   * Default: 0.5
   */
  minSimilarity: number;

  /**
   * Whether to normalize vectors.
   * Default: true
   */
  normalize: boolean;
}

export interface RRFConfig {
  /**
   * RRF constant k.
   * Lower = more weight to top ranks.
   * Default: 60
   */
  k: number;

  /**
   * Minimum number of sources agreeing on result.
   * Default: 1
   */
  minSourceAgreement: number;
}

export interface RRFRanking {
  /** Document ID */
  id: string;

  /** Ranks from each source [bm25Rank, vectorRank] */
  ranks: number[];

  /** RRF score */
  rrfScore: number;

  /** Original scores [bm25Score, vectorScore] */
  originalScores: number[];
}

export const DEFAULT_HYBRID_SEARCH_CONFIG: HybridSearchConfig = {
  topK: 10,
  bm25Weight: 0.5,
  vectorWeight: 0.5,
  rrfK: 60,
  minScore: 0.1,
  useRRF: true,
  candidateMultiplier: 5,
  includeHighlights: true,
};

export const DEFAULT_BM25_CONFIG: BM25Config = {
  k1: 1.2,
  b: 0.75,
  minDocFreq: 1,
  maxDocFreqRatio: 0.9,
};

export const DEFAULT_VECTOR_SEARCH_CONFIG: VectorSearchConfig = {
  metric: 'cosine',
  minSimilarity: 0.5,
  normalize: true,
};

export const DEFAULT_RRF_CONFIG: RRFConfig = {
  k: 60,
  minSourceAgreement: 1,
};
