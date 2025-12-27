/**
 * Types for Code Intelligence Orchestrator
 *
 * Defines the configuration and interfaces for the
 * integrated code intelligence pipeline.
 */

import type { IndexerConfig, WatcherConfig } from '../indexing/types.js';
import type { GraphBuilderConfig } from '../graph/types.js';
import type { HybridSearchConfig } from '../search/types.js';
import type { ChunkingConfig } from '../chunking/types.js';
import type { CodeChunkStoreConfig } from '../storage/CodeChunkStore.js';

/**
 * Database configuration for persistent storage
 */
export interface DatabaseConfig extends CodeChunkStoreConfig {
  /** Enable database storage (default: false for in-memory) */
  enabled?: boolean;
}

export interface OrchestratorConfig {
  /**
   * Root directory to index.
   */
  rootDir: string;

  /**
   * Enable file watching for live updates.
   */
  watchEnabled: boolean;

  /**
   * Enable git-based change detection.
   */
  gitEnabled: boolean;

  /**
   * Database connection string (legacy - use database.connectionString instead).
   */
  databaseUrl?: string;

  /**
   * Database configuration for RuVector storage.
   */
  database?: DatabaseConfig;

  /**
   * Ollama URL for embeddings.
   */
  ollamaUrl: string;

  /**
   * Batch size for parallel processing.
   */
  batchSize: number;

  /**
   * Maximum concurrent operations.
   */
  maxConcurrency: number;

  /**
   * Component configurations.
   */
  indexer?: Partial<IndexerConfig>;
  watcher?: Partial<WatcherConfig>;
  graph?: Partial<GraphBuilderConfig>;
  search?: Partial<HybridSearchConfig>;
  chunker?: Partial<ChunkingConfig>;
  embedder?: {
    model?: string;
    dimensions?: number;
    batchSize?: number;
  };
}

export interface IndexingProgress {
  /** Current phase */
  phase: 'scanning' | 'parsing' | 'chunking' | 'embedding' | 'indexing' | 'complete';

  /** Total files to process */
  totalFiles: number;

  /** Files processed so far */
  processedFiles: number;

  /** Current file being processed */
  currentFile?: string;

  /** Chunks created */
  chunksCreated: number;

  /** Embeddings generated */
  embeddingsGenerated: number;

  /** Relationships extracted */
  relationshipsExtracted: number;

  /** Errors encountered */
  errors: Array<{ file: string; error: string }>;

  /** Start time */
  startTime: number;

  /** Elapsed time in ms */
  elapsedMs: number;

  /** Estimated remaining time in ms */
  estimatedRemainingMs?: number;
}

export interface IndexingResult {
  /** Whether indexing succeeded */
  success: boolean;

  /** Final statistics */
  stats: {
    filesIndexed: number;
    chunksCreated: number;
    embeddingsGenerated: number;
    nodesCreated: number;
    edgesCreated: number;
    totalTimeMs: number;
    averageTimePerFileMs: number;
  };

  /** Files that failed to index */
  failures: Array<{ file: string; error: string }>;
}

export interface QueryContext {
  /** The search query */
  query: string;

  /** Maximum results to return */
  topK: number;

  /** Include graph context (related code) */
  includeGraphContext: boolean;

  /** Graph expansion depth */
  graphDepth: number;

  /** Filter by language */
  language?: string;

  /** Filter by file pattern */
  filePattern?: string;

  /** Filter by entity type */
  entityType?: string;
}

export interface QueryResult {
  /** Search results with context */
  results: Array<{
    /** Chunk ID */
    id: string;

    /** File path */
    filePath: string;

    /** Code content */
    content: string;

    /** Start line */
    startLine: number;

    /** End line */
    endLine: number;

    /** Relevance score */
    score: number;

    /** Entity type if applicable */
    entityType?: string;

    /** Entity name if applicable */
    entityName?: string;

    /** Related code from graph expansion */
    relatedCode?: Array<{
      filePath: string;
      content: string;
      relationship: string;
    }>;
  }>;

  /** Query metadata */
  metadata: {
    query: string;
    totalMatches: number;
    searchTimeMs: number;
    graphExpansionTimeMs?: number;
  };
}

export type ProgressCallback = (progress: IndexingProgress) => void;

export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  rootDir: '.',
  watchEnabled: false,
  gitEnabled: true,
  ollamaUrl: 'http://localhost:11434',
  batchSize: 10,
  maxConcurrency: 4,
};
