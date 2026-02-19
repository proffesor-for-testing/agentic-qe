/**
 * Kernel Module Constants
 *
 * Centralizes all magic numbers used in kernel components including
 * memory management, database configuration, event bus, and agent coordination.
 *
 * @see ADR-046: Pattern Persistence for Neural Backbone
 * @see ADR-047: MinCut Graph Snapshots
 */

// ============================================================================
// Memory Configuration Constants
// ============================================================================

export const MEMORY_CONSTANTS = {
  /**
   * Memory-mapped I/O size for SQLite database.
   * 64MB provides good balance between performance and memory usage.
   */
  MMAP_SIZE_BYTES: 64 * 1024 * 1024, // 64MB

  /**
   * SQLite cache size in kilobytes.
   * Negative value indicates KB, 32MB total cache.
   */
  CACHE_SIZE_KB: -32000, // 32MB

  /**
   * Maximum time to wait for database lock before failing.
   * 5 seconds handles most contention scenarios.
   */
  BUSY_TIMEOUT_MS: 5000,

  /**
   * Default vector embedding dimensions for HNSW index.
   * 384 dimensions matches common sentence transformers.
   */
  DEFAULT_VECTOR_DIMENSIONS: 768,

  /**
   * Default search result limit for KV store queries.
   * Prevents unbounded result sets.
   */
  DEFAULT_SEARCH_LIMIT: 100,

  /**
   * Interval for cleaning up expired entries from memory stores.
   * 1 minute balances cleanup frequency with performance.
   */
  CLEANUP_INTERVAL_MS: 60000, // 1 minute

  /**
   * Multiplier to convert TTL seconds to milliseconds.
   */
  TTL_MULTIPLIER_MS: 1000,
} as const;

// ============================================================================
// HNSW Index Configuration Constants
// ============================================================================

export const HNSW_CONSTANTS = {
  /**
   * Maximum number of connections per node in HNSW graph.
   * Higher values improve recall but increase memory/build time.
   */
  M_CONNECTIONS: 16,

  /**
   * Size of dynamic candidate list during construction.
   * Higher values improve recall during build at cost of speed.
   */
  EF_CONSTRUCTION: 200,

  /**
   * Size of dynamic candidate list during search.
   * Balance between search speed and recall quality.
   */
  EF_SEARCH: 100,

  /**
   * Default k value for nearest neighbor searches.
   */
  DEFAULT_K_NEIGHBORS: 10,

  /**
   * Vector dimension for coverage analysis embeddings.
   */
  COVERAGE_VECTOR_DIMENSION: 768,
} as const;

// ============================================================================
// Agent Coordination Constants
// ============================================================================

export const AGENT_CONSTANTS = {
  /**
   * Maximum number of concurrent agents allowed.
   * Prevents resource exhaustion in multi-agent scenarios.
   */
  MAX_CONCURRENT_AGENTS: 15,

  /**
   * Default time-to-live for agent cleanup.
   * 1 hour removes stale agent entries.
   */
  DEFAULT_AGENT_TTL_MS: 3600000, // 1 hour

  /**
   * Default timeout for agent operations.
   * 2 minutes allows for complex multi-step operations.
   */
  DEFAULT_AGENT_TIMEOUT_MS: 120000, // 2 minutes

  /**
   * Maximum number of workers in a pool.
   */
  MAX_POOL_SIZE: 10,
} as const;

// ============================================================================
// Event Bus Constants
// ============================================================================

export const EVENT_BUS_CONSTANTS = {
  /**
   * Maximum number of events to retain in history.
   * Prevents unbounded memory growth while keeping recent history.
   */
  MAX_HISTORY_SIZE: 10000,
} as const;

// ============================================================================
// Database Pool Constants
// ============================================================================

export const DATABASE_POOL_CONSTANTS = {
  /**
   * Default connection pool size.
   * Balances concurrency with resource usage.
   */
  DEFAULT_POOL_SIZE: 10,

  /**
   * Extended busy timeout for pool operations.
   * Longer timeout handles high-contention scenarios.
   */
  POOL_BUSY_TIMEOUT_MS: 10000,
} as const;

// ============================================================================
// LLM Token Constants
// ============================================================================

export const LLM_CONSTANTS = {
  /**
   * Default maximum tokens for LLM responses.
   * 4096 covers most use cases without excessive cost.
   */
  DEFAULT_MAX_TOKENS: 4096,

  /**
   * Maximum tokens for analysis tasks.
   */
  ANALYSIS_MAX_TOKENS: 2048,

  /**
   * Maximum prompt context length for truncation.
   */
  MAX_PROMPT_LENGTH: 8000,
} as const;

// ============================================================================
// Time-based Constants
// ============================================================================

export const TIME_CONSTANTS = {
  /**
   * Milliseconds in one second.
   */
  MS_PER_SECOND: 1000,

  /**
   * Milliseconds in one minute.
   */
  MS_PER_MINUTE: 60000,

  /**
   * Milliseconds in one hour.
   */
  MS_PER_HOUR: 3600000, // 60 * 60 * 1000

  /**
   * Milliseconds in one day.
   */
  MS_PER_DAY: 86400000, // 24 * 60 * 60 * 1000

  /**
   * Milliseconds in one week.
   */
  MS_PER_WEEK: 604800000, // 7 * 24 * 60 * 60 * 1000
} as const;

// Type exports for const assertion inference
export type MemoryConstants = typeof MEMORY_CONSTANTS;
export type HNSWConstants = typeof HNSW_CONSTANTS;
export type AgentConstants = typeof AGENT_CONSTANTS;
export type EventBusConstants = typeof EVENT_BUS_CONSTANTS;
export type DatabasePoolConstants = typeof DATABASE_POOL_CONSTANTS;
export type LLMConstants = typeof LLM_CONSTANTS;
export type TimeConstants = typeof TIME_CONSTANTS;
