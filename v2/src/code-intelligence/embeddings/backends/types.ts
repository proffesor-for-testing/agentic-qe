/**
 * Embedding Storage Backend Interface
 *
 * Defines a pluggable backend interface for embedding cache storage.
 * Supports memory, Redis, and SQLite backends.
 *
 * @module code-intelligence/embeddings/backends/types
 * @see Issue #146 - Security Hardening: SP-2 Dedicated Embedding Cache
 */

import type { EmbeddingCacheEntry } from '../types.js';

/**
 * Backend types supported by the embedding cache
 */
export type BackendType = 'memory' | 'redis' | 'sqlite';

/**
 * Interface for embedding storage backends
 *
 * All backends must implement this interface to be compatible
 * with the EmbeddingCache.
 */
export interface EmbeddingStorageBackend {
  /** Backend name for identification */
  readonly name: string;

  /** Backend type */
  readonly type: BackendType;

  // ============================================
  // Core Operations
  // ============================================

  /**
   * Get an embedding by key
   * @param key Content hash key
   * @returns Cached entry or null if not found
   */
  get(key: string): Promise<EmbeddingCacheEntry | null>;

  /**
   * Store an embedding
   * @param key Content hash key
   * @param entry Cache entry with embedding and metadata
   */
  set(key: string, entry: EmbeddingCacheEntry): Promise<void>;

  /**
   * Check if a key exists
   * @param key Content hash key
   */
  has(key: string): Promise<boolean>;

  /**
   * Delete an entry
   * @param key Content hash key
   * @returns true if entry was deleted
   */
  delete(key: string): Promise<boolean>;

  /**
   * Clear all entries
   */
  clear(): Promise<void>;

  // ============================================
  // Size and Iteration
  // ============================================

  /**
   * Get the number of entries
   */
  size(): Promise<number>;

  /**
   * Iterate over all keys
   */
  keys(): AsyncIterable<string>;

  // ============================================
  // TTL Support
  // ============================================

  /**
   * Remove entries older than specified age
   * @param maxAgeMs Maximum age in milliseconds
   * @returns Number of entries pruned
   */
  pruneExpired(maxAgeMs: number): Promise<number>;

  // ============================================
  // Lifecycle
  // ============================================

  /**
   * Initialize the backend
   * Called before first use
   */
  initialize(): Promise<void>;

  /**
   * Close the backend and release resources
   */
  close(): Promise<void>;

  /**
   * Check if backend is healthy/connected
   */
  isHealthy(): Promise<boolean>;
}

/**
 * Backend statistics
 */
export interface BackendStats {
  /** Backend name */
  name: string;

  /** Backend type */
  type: BackendType;

  /** Number of entries */
  size: number;

  /** Estimated memory usage in bytes */
  memoryUsageBytes?: number;

  /** Whether backend is healthy */
  healthy: boolean;

  /** Last health check timestamp */
  lastHealthCheck?: Date;

  /** Backend-specific metrics */
  metrics?: Record<string, number>;
}

/**
 * Base configuration for all backends
 */
export interface BaseBackendConfig {
  /** Maximum number of entries (0 = unlimited) */
  maxSize?: number;

  /** Default TTL in milliseconds (0 = no expiration) */
  defaultTtlMs?: number;

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Memory backend configuration
 */
export interface MemoryBackendConfig extends BaseBackendConfig {
  /** LRU eviction when maxSize reached */
  enableLru?: boolean;
}

/**
 * Redis backend configuration
 */
export interface RedisBackendConfig extends BaseBackendConfig {
  /** Redis host */
  host: string;

  /** Redis port */
  port: number;

  /** Redis password */
  password?: string;

  /** Redis database number */
  db?: number;

  /** Key prefix for namespacing */
  keyPrefix?: string;

  /** TTL in seconds for Redis SETEX */
  ttlSeconds?: number;

  /** Connection timeout in ms */
  connectTimeoutMs?: number;

  /** Enable TLS */
  tls?: boolean;

  /** Retry strategy */
  retryStrategy?: (times: number) => number | null;
}

/**
 * SQLite backend configuration
 */
export interface SQLiteBackendConfig extends BaseBackendConfig {
  /** Path to SQLite database file */
  dbPath: string;

  /** Table name for cache entries */
  tableName?: string;

  /** Enable WAL mode for better concurrency */
  walMode?: boolean;

  /** Busy timeout in ms */
  busyTimeoutMs?: number;

  /** Run VACUUM on close */
  vacuumOnClose?: boolean;
}

/**
 * Union type for all backend configs
 */
export type BackendConfig = MemoryBackendConfig | RedisBackendConfig | SQLiteBackendConfig;

/**
 * Default TTL: 24 hours
 */
export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Default max size: 10,000 embeddings
 */
export const DEFAULT_MAX_SIZE = 10000;

/**
 * Embedding dimension (nomic-embed-text)
 */
export const EMBEDDING_DIMENSIONS = 768;

/**
 * Estimated bytes per embedding entry
 * 768 floats * 8 bytes + ~100 bytes metadata
 */
export const BYTES_PER_ENTRY = EMBEDDING_DIMENSIONS * 8 + 100;
