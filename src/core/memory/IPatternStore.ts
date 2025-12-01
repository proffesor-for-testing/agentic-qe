/**
 * IPatternStore - Unified Interface for Pattern Storage
 *
 * Provides a common abstraction for high-performance vector pattern storage,
 * supporting multiple backends:
 * - RuVector (@ruvector/core): 170x faster search, 192K QPS
 * - AgentDB: Full-featured with learning capabilities
 * - In-memory fallback: For platforms without native support
 *
 * @module core/memory/IPatternStore
 * @version 1.0.0
 */

/**
 * Vector entry for storage
 */
export interface VectorEntry {
  id: string;
  vector: number[] | Float32Array;
  metadata?: Record<string, any>;
}

/**
 * Search query parameters
 */
export interface SearchQuery {
  vector: number[] | Float32Array;
  k?: number;
  filter?: Record<string, any>;
  threshold?: number;
}

/**
 * Search result with similarity score
 */
export interface SearchResult {
  id: string;
  score: number;
  vector?: number[] | Float32Array;
  metadata?: Record<string, any>;
}

/**
 * Test pattern with embedding for vector storage
 */
export interface TestPattern {
  id: string;
  type: string;
  domain: string;
  embedding: number[];
  content: string;
  framework?: string;
  coverage?: number;
  flakinessScore?: number;
  verdict?: 'success' | 'failure' | 'flaky';
  createdAt?: number;
  lastUsed?: number;
  usageCount?: number;
  metadata?: Record<string, any>;
}

/**
 * Search options for pattern retrieval
 */
export interface PatternSearchOptions {
  k?: number;
  threshold?: number;
  domain?: string;
  type?: string;
  framework?: string;
  useMMR?: boolean;
  mmrLambda?: number;
}

/**
 * Search result with pattern data
 */
export interface PatternSearchResult {
  pattern: TestPattern;
  score: number;
}

/**
 * Database statistics
 */
export interface PatternStoreStats {
  count: number;
  dimension: number;
  metric: string;
  implementation: 'ruvector' | 'agentdb' | 'fallback';
  memoryUsage?: number;
  indexType?: string;
  qps?: number;
  p50Latency?: number;
  p99Latency?: number;
}

/**
 * Pattern store configuration
 */
export interface PatternStoreConfig {
  dimension?: number;
  metric?: 'cosine' | 'euclidean' | 'dot';
  storagePath?: string;
  autoPersist?: boolean;
  hnsw?: {
    m?: number;
    efConstruction?: number;
    efSearch?: number;
  };
  /** Preferred backend: 'ruvector' | 'agentdb' | 'auto' */
  preferredBackend?: 'ruvector' | 'agentdb' | 'auto';
  /** Enable performance tracking */
  enableMetrics?: boolean;
}

/**
 * IPatternStore - Unified interface for pattern storage backends
 *
 * This interface enables:
 * - Seamless switching between RuVector and AgentDB
 * - Feature detection for platform-specific optimizations
 * - Consistent API across all implementations
 */
export interface IPatternStore {
  /**
   * Initialize the pattern store
   */
  initialize(): Promise<void>;

  /**
   * Store a single test pattern
   */
  storePattern(pattern: TestPattern): Promise<void>;

  /**
   * Store multiple patterns in batch (optimized for high throughput)
   */
  storeBatch(patterns: TestPattern[]): Promise<void>;

  /**
   * Search for similar patterns by embedding
   */
  searchSimilar(
    queryEmbedding: number[],
    options?: PatternSearchOptions
  ): Promise<PatternSearchResult[]>;

  /**
   * Get a pattern by ID
   */
  getPattern(id: string): Promise<TestPattern | null>;

  /**
   * Delete a pattern by ID
   */
  deletePattern(id: string): Promise<boolean>;

  /**
   * Record pattern usage (updates lastUsed and usageCount)
   */
  recordUsage(id: string): Promise<void>;

  /**
   * Build or rebuild the search index
   */
  buildIndex(): Promise<void>;

  /**
   * Optimize storage (compaction, reindexing)
   */
  optimize(): Promise<void>;

  /**
   * Get database statistics
   */
  getStats(): Promise<PatternStoreStats>;

  /**
   * Clear all patterns
   */
  clear(): Promise<void>;

  /**
   * Shutdown and release resources
   */
  shutdown(): Promise<void>;

  /**
   * Get implementation info
   */
  getImplementationInfo(): {
    type: 'ruvector' | 'agentdb' | 'fallback';
    version: string;
    features: string[];
  };
}

/**
 * Pattern store event types
 */
export type PatternStoreEvent =
  | { type: 'pattern_stored'; id: string; timestamp: number }
  | { type: 'pattern_deleted'; id: string; timestamp: number }
  | { type: 'search_completed'; queryTime: number; resultsCount: number }
  | { type: 'index_rebuilt'; duration: number }
  | { type: 'optimization_completed'; duration: number };

/**
 * Pattern store with event support
 */
export interface IPatternStoreWithEvents extends IPatternStore {
  /**
   * Subscribe to pattern store events
   */
  on(event: PatternStoreEvent['type'], callback: (event: PatternStoreEvent) => void): void;

  /**
   * Unsubscribe from pattern store events
   */
  off(event: PatternStoreEvent['type'], callback: (event: PatternStoreEvent) => void): void;
}
