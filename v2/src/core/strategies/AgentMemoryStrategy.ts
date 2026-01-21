/**
 * AgentMemoryStrategy - Strategy interface for agent memory operations
 *
 * Handles storage, retrieval, and persistence of agent memory.
 * Supports both local and shared (cross-agent) memory.
 * Part of Phase 2 (B1.3b) layered architecture refactoring.
 *
 * @module core/strategies/AgentMemoryStrategy
 * @version 1.0.0
 */

import type { QEAgentType } from '../../types';

/**
 * Memory storage options
 */
export interface MemoryOptions {
  /** Time-to-live in milliseconds (0 = never expires) */
  ttl?: number;
  /** Namespace for grouping related entries */
  namespace?: string;
  /** Persist to disk (vs memory-only) */
  persist?: boolean;
  /** Priority for cache eviction */
  priority?: 'low' | 'normal' | 'high' | 'critical';
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Memory entry for bulk operations
 */
export interface MemoryEntry {
  key: string;
  value: unknown;
  options?: MemoryOptions;
}

/**
 * Memory query options
 */
export interface MemoryQueryOptions {
  /** Filter by namespace */
  namespace?: string;
  /** Filter by key pattern (glob) */
  pattern?: string;
  /** Maximum results */
  limit?: number;
  /** Include metadata in results */
  includeMetadata?: boolean;
}

/**
 * Memory statistics
 */
export interface MemoryStats {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  missRate: number;
  evictionCount: number;
  lastCleanup: Date;
}

/**
 * AgentMemoryStrategy interface
 *
 * Implementations:
 * - DefaultMemoryStrategy: SQLite-backed storage
 * - CachedMemoryStrategy: Binary cache layer (Phase 1)
 * - DistributedMemoryStrategy: S3/Redis backend (Phase 4)
 */
export interface AgentMemoryStrategy {
  // === Basic Operations ===

  /**
   * Store a value in agent memory
   * @param key - Unique key for the value
   * @param value - Value to store (will be serialized)
   * @param options - Storage options
   */
  store(key: string, value: unknown, options?: MemoryOptions): Promise<void>;

  /**
   * Retrieve a value from agent memory
   * @param key - Key to retrieve
   * @returns Stored value or undefined if not found
   */
  retrieve<T = unknown>(key: string): Promise<T | undefined>;

  /**
   * Delete a value from agent memory
   * @param key - Key to delete
   * @returns True if deleted, false if not found
   */
  delete(key: string): Promise<boolean>;

  /**
   * Check if a key exists
   * @param key - Key to check
   */
  exists(key: string): Promise<boolean>;

  // === Shared Memory (Cross-Agent) ===

  /**
   * Store a value in shared memory (accessible by other agents)
   * @param agentType - Agent type namespace
   * @param key - Key within the namespace
   * @param value - Value to store
   * @param options - Storage options
   */
  storeShared(
    agentType: QEAgentType,
    key: string,
    value: unknown,
    options?: MemoryOptions
  ): Promise<void>;

  /**
   * Retrieve a value from another agent's shared memory
   * @param agentType - Target agent type
   * @param key - Key to retrieve
   */
  retrieveShared<T = unknown>(agentType: QEAgentType, key: string): Promise<T | undefined>;

  // === Bulk Operations ===

  /**
   * Store multiple entries atomically
   * @param entries - Entries to store
   */
  bulkStore(entries: MemoryEntry[]): Promise<void>;

  /**
   * Retrieve multiple values
   * @param keys - Keys to retrieve
   * @returns Map of key to value (missing keys omitted)
   */
  bulkRetrieve<T = unknown>(keys: string[]): Promise<Map<string, T>>;

  /**
   * Delete multiple keys
   * @param keys - Keys to delete
   * @returns Number of deleted entries
   */
  bulkDelete(keys: string[]): Promise<number>;

  // === Query Operations ===

  /**
   * Query memory entries
   * @param options - Query options
   */
  query<T = unknown>(options: MemoryQueryOptions): Promise<MemoryEntry[]>;

  /**
   * List all keys matching a pattern
   * @param pattern - Glob pattern (e.g., "cache/*")
   */
  listKeys(pattern?: string): Promise<string[]>;

  // === Lifecycle ===

  /**
   * Initialize the memory strategy
   */
  initialize(): Promise<void>;

  /**
   * Close connections and cleanup
   */
  close(): Promise<void>;

  /**
   * Clear all agent memory (use with caution)
   */
  clear(): Promise<void>;

  // === Metrics ===

  /**
   * Get memory statistics
   */
  getStats(): Promise<MemoryStats>;
}

/**
 * Factory function type for creating memory strategies
 */
export type MemoryStrategyFactory = (
  config?: Record<string, unknown>
) => AgentMemoryStrategy;
