/**
 * Types for Code Intelligence Retrieval System
 *
 * Supports multi-chunk retrieval with configurable top-k
 * to balance semantic precision with context completeness.
 */

export interface RetrievalConfig {
  /**
   * Number of top chunks to retrieve per query.
   * Higher values = more context but potentially less precision.
   * Recommended: 3-5 for AST-chunked code (smaller semantic units)
   * Default: 5
   */
  topK: number;

  /**
   * Minimum similarity score threshold (0-1).
   * Chunks below this score are filtered out.
   * Default: 0.5
   */
  minSimilarity: number;

  /**
   * Whether to deduplicate results from the same file.
   * When true, consecutive chunks from same file are merged.
   * Default: true
   */
  deduplicateByFile: boolean;

  /**
   * Maximum number of chunks to return from same file.
   * Prevents single large file from dominating results.
   * Default: 3
   */
  maxChunksPerFile: number;

  /**
   * Whether to include surrounding context for each chunk.
   * Expands results to include adjacent chunks.
   * Default: false
   */
  includeContext: boolean;

  /**
   * Number of chunks before/after to include as context.
   * Only used when includeContext is true.
   * Default: 1
   */
  contextWindow: number;
}

export interface RetrievalResult {
  /** Unique chunk identifier */
  chunkId: string;

  /** File path containing this chunk */
  filePath: string;

  /** Chunk content */
  content: string;

  /** Start line in original file */
  startLine: number;

  /** End line in original file */
  endLine: number;

  /** Cosine similarity score (0-1) */
  similarity: number;

  /** Entity type (function, class, method, etc.) */
  entityType: string;

  /** Entity name if available */
  entityName?: string;

  /** Language of the code */
  language: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface RetrievalResponse {
  /** Retrieved chunks, ordered by relevance */
  results: RetrievalResult[];

  /** Query that was searched */
  query: string;

  /** Time taken for retrieval in milliseconds */
  retrievalTimeMs: number;

  /** Statistics about the retrieval */
  stats: RetrievalStats;
}

export interface RetrievalStats {
  /** Total chunks searched */
  totalChunksSearched: number;

  /** Chunks that passed similarity threshold */
  chunksAboveThreshold: number;

  /** Final chunks returned (after dedup/limits) */
  chunksReturned: number;

  /** Unique files in results */
  uniqueFiles: number;

  /** Average similarity of returned chunks */
  avgSimilarity: number;
}

export interface StoredChunk {
  id: string;
  fileId: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  entityType: string;
  entityName?: string;
  language: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}

/**
 * Default retrieval configuration optimized for AST-chunked code.
 * Uses top-k=5 to compensate for smaller semantic chunks.
 */
export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  topK: 5,              // Retrieve 5 chunks (recommended for AST chunking)
  minSimilarity: 0.5,   // 50% similarity threshold
  deduplicateByFile: true,
  maxChunksPerFile: 3,
  includeContext: false,
  contextWindow: 1,
};

/**
 * High-precision configuration for specific queries.
 * Use when you need exact matches over broad context.
 */
export const PRECISION_RETRIEVAL_CONFIG: RetrievalConfig = {
  topK: 3,
  minSimilarity: 0.7,   // Higher threshold
  deduplicateByFile: true,
  maxChunksPerFile: 2,
  includeContext: false,
  contextWindow: 0,
};

/**
 * High-recall configuration for exploratory queries.
 * Use when you want to find all potentially relevant code.
 */
export const RECALL_RETRIEVAL_CONFIG: RetrievalConfig = {
  topK: 10,             // More results
  minSimilarity: 0.4,   // Lower threshold
  deduplicateByFile: false,
  maxChunksPerFile: 5,
  includeContext: true,
  contextWindow: 2,
};
