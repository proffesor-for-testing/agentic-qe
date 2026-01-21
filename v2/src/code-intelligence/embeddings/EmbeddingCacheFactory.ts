/**
 * Embedding Cache Factory
 *
 * Creates embedding caches with configurable backends and auto-pruning.
 * Provides unified interface for memory, Redis, and SQLite backends.
 *
 * @module code-intelligence/embeddings/EmbeddingCacheFactory
 * @see Issue #146 - Security Hardening: SP-2 Dedicated Embedding Cache
 */

import type { EmbeddingCacheEntry, CacheStats } from './types.js';
import type {
  EmbeddingStorageBackend,
  BackendType,
  MemoryBackendConfig,
  RedisBackendConfig,
  SQLiteBackendConfig,
} from './backends/types.js';
import { DEFAULT_TTL_MS, DEFAULT_MAX_SIZE } from './backends/types.js';
import { MemoryStorageBackend } from './backends/MemoryBackend.js';
import { RedisStorageBackend } from './backends/RedisBackend.js';
import { SQLiteStorageBackend } from './backends/SQLiteBackend.js';
import { createHash } from 'crypto';

/**
 * Cache configuration
 */
export interface EmbeddingCacheConfig {
  /** Storage backend type */
  backend: BackendType;

  /** Maximum number of entries */
  maxSize: number;

  /** Time-to-live in milliseconds */
  ttlMs: number;

  /** Auto-prune interval in milliseconds (0 to disable) */
  autoPruneIntervalMs: number;

  /** Enable debug logging */
  debug: boolean;

  /** Backend-specific configuration */
  memory?: MemoryBackendConfig;
  redis?: RedisBackendConfig;
  sqlite?: SQLiteBackendConfig;
}

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: EmbeddingCacheConfig = {
  backend: 'memory',
  maxSize: DEFAULT_MAX_SIZE,
  ttlMs: DEFAULT_TTL_MS,
  autoPruneIntervalMs: 60 * 60 * 1000, // 1 hour
  debug: false,
};

/**
 * Enhanced Embedding Cache with pluggable backends
 *
 * Features:
 * - Pluggable backends (memory, Redis, SQLite)
 * - Content hash-based deduplication
 * - Automatic TTL-based expiration
 * - Auto-pruning scheduler
 * - Cache statistics
 */
export class EnhancedEmbeddingCache {
  private backend: EmbeddingStorageBackend;
  private config: EmbeddingCacheConfig;
  private pruneInterval: ReturnType<typeof setInterval> | null = null;
  private hits: number = 0;
  private misses: number = 0;
  private initialized: boolean = false;

  constructor(backend: EmbeddingStorageBackend, config: Partial<EmbeddingCacheConfig> = {}) {
    this.backend = backend;
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  /**
   * Initialize the cache and start auto-pruning
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.backend.initialize();

    // Start auto-pruning if configured
    if (this.config.autoPruneIntervalMs > 0) {
      this.startAutoPrune();
    }

    this.initialized = true;
    this.log('Cache initialized');
  }

  /**
   * Close the cache and stop auto-pruning
   */
  async close(): Promise<void> {
    this.stopAutoPrune();
    await this.backend.close();
    this.initialized = false;
    this.log('Cache closed');
  }

  /**
   * Generate content hash for cache key
   */
  hashContent(content: string, model: string): string {
    return createHash('sha256')
      .update(`${model}:${content}`)
      .digest('hex');
  }

  /**
   * Get cached embedding
   */
  async get(content: string, model: string): Promise<number[] | null> {
    const key = this.hashContent(content, model);
    const entry = await this.backend.get(key);

    if (entry) {
      this.hits++;
      return entry.embedding;
    }

    this.misses++;
    return null;
  }

  /**
   * Store embedding in cache
   */
  async set(content: string, model: string, embedding: number[]): Promise<void> {
    const key = this.hashContent(content, model);

    const entry: EmbeddingCacheEntry = {
      embedding,
      timestamp: Date.now(),
      model,
    };

    await this.backend.set(key, entry);
  }

  /**
   * Check if embedding is cached
   */
  async has(content: string, model: string): Promise<boolean> {
    const key = this.hashContent(content, model);
    return this.backend.has(key);
  }

  /**
   * Delete cached embedding
   */
  async delete(content: string, model: string): Promise<boolean> {
    const key = this.hashContent(content, model);
    return this.backend.delete(key);
  }

  /**
   * Clear all cached embeddings
   */
  async clear(): Promise<void> {
    await this.backend.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats & { backendType: BackendType }> {
    const size = await this.backend.size();
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;

    return {
      size,
      hitRate,
      hits: this.hits,
      misses: this.misses,
      backendType: this.config.backend,
    };
  }

  /**
   * Batch check for multiple contents
   */
  async batchHas(contents: string[], model: string): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    // Process in parallel with Promise.all
    const checks = contents.map(async (content) => {
      const exists = await this.has(content, model);
      return { content, exists };
    });

    const resolved = await Promise.all(checks);
    for (const { content, exists } of resolved) {
      results.set(content, exists);
    }

    return results;
  }

  /**
   * Batch get for multiple contents
   */
  async batchGet(contents: string[], model: string): Promise<Map<string, number[] | null>> {
    const results = new Map<string, number[] | null>();

    const gets = contents.map(async (content) => {
      const embedding = await this.get(content, model);
      return { content, embedding };
    });

    const resolved = await Promise.all(gets);
    for (const { content, embedding } of resolved) {
      results.set(content, embedding);
    }

    return results;
  }

  /**
   * Prune expired entries
   */
  async prune(): Promise<number> {
    return this.backend.pruneExpired(this.config.ttlMs);
  }

  /**
   * Check if backend is healthy
   */
  async isHealthy(): Promise<boolean> {
    return this.backend.isHealthy();
  }

  /**
   * Get backend name
   */
  getBackendName(): string {
    return this.backend.name;
  }

  // ============================================
  // Auto-Pruning
  // ============================================

  private startAutoPrune(): void {
    if (this.pruneInterval) return;

    this.pruneInterval = setInterval(async () => {
      try {
        const pruned = await this.prune();
        if (pruned > 0) {
          this.log(`Auto-pruned ${pruned} expired entries`);
        }
      } catch (error) {
        this.log(`Auto-prune error: ${(error as Error).message}`);
      }
    }, this.config.autoPruneIntervalMs);

    this.log(`Auto-pruning started (interval: ${this.config.autoPruneIntervalMs}ms)`);
  }

  private stopAutoPrune(): void {
    if (this.pruneInterval) {
      clearInterval(this.pruneInterval);
      this.pruneInterval = null;
      this.log('Auto-pruning stopped');
    }
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[EmbeddingCache:${this.backend.name}] ${message}`);
    }
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a backend instance based on configuration
 */
export function createBackend(config: EmbeddingCacheConfig): EmbeddingStorageBackend {
  switch (config.backend) {
    case 'memory':
      return new MemoryStorageBackend({
        maxSize: config.maxSize,
        defaultTtlMs: config.ttlMs,
        debug: config.debug,
        ...config.memory,
      });

    case 'redis':
      if (!config.redis) {
        throw new Error('Redis backend requires redis configuration');
      }
      return new RedisStorageBackend({
        ...config.redis,
        maxSize: config.maxSize,
        defaultTtlMs: config.ttlMs,
        debug: config.debug,
      });

    case 'sqlite':
      if (!config.sqlite) {
        throw new Error('SQLite backend requires sqlite configuration');
      }
      return new SQLiteStorageBackend({
        ...config.sqlite,
        maxSize: config.maxSize,
        defaultTtlMs: config.ttlMs,
        debug: config.debug,
      });

    default:
      throw new Error(`Unknown backend type: ${config.backend}`);
  }
}

/**
 * Create an embedding cache with the specified configuration
 */
export function createEmbeddingCache(
  config: Partial<EmbeddingCacheConfig> = {}
): EnhancedEmbeddingCache {
  const fullConfig = { ...DEFAULT_CACHE_CONFIG, ...config };
  const backend = createBackend(fullConfig);
  return new EnhancedEmbeddingCache(backend, fullConfig);
}

/**
 * Create a memory-backed embedding cache
 */
export function createMemoryCache(
  options: Partial<MemoryBackendConfig> = {}
): EnhancedEmbeddingCache {
  return createEmbeddingCache({
    backend: 'memory',
    memory: options,
  });
}

/**
 * Create a Redis-backed embedding cache
 */
export function createRedisCache(
  options: RedisBackendConfig
): EnhancedEmbeddingCache {
  return createEmbeddingCache({
    backend: 'redis',
    redis: options,
  });
}

/**
 * Create a SQLite-backed embedding cache
 */
export function createSQLiteCache(
  options: SQLiteBackendConfig
): EnhancedEmbeddingCache {
  return createEmbeddingCache({
    backend: 'sqlite',
    sqlite: options,
  });
}
