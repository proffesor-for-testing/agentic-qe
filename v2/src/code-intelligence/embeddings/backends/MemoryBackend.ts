/**
 * Memory Storage Backend for Embedding Cache
 *
 * In-memory storage with LRU eviction. Best for single-process
 * applications with moderate cache sizes.
 *
 * @module code-intelligence/embeddings/backends/MemoryBackend
 * @see Issue #146 - Security Hardening: SP-2 Dedicated Embedding Cache
 */

import type { EmbeddingCacheEntry } from '../types.js';
import type {
  EmbeddingStorageBackend,
  MemoryBackendConfig,
  BackendStats,
} from './types.js';
import { DEFAULT_MAX_SIZE, DEFAULT_TTL_MS, BYTES_PER_ENTRY } from './types.js';

/**
 * Memory-based embedding storage backend
 *
 * Features:
 * - LRU eviction when maxSize is reached
 * - O(1) get/set operations
 * - Automatic TTL-based expiration
 */
export class MemoryStorageBackend implements EmbeddingStorageBackend {
  readonly name = 'memory';
  readonly type = 'memory' as const;

  private cache: Map<string, EmbeddingCacheEntry>;
  private config: Required<MemoryBackendConfig>;
  private initialized: boolean = false;

  constructor(config: MemoryBackendConfig = {}) {
    this.config = {
      maxSize: config.maxSize ?? DEFAULT_MAX_SIZE,
      defaultTtlMs: config.defaultTtlMs ?? DEFAULT_TTL_MS,
      debug: config.debug ?? false,
      enableLru: config.enableLru ?? true,
    };

    this.cache = new Map();
  }

  async initialize(): Promise<void> {
    this.initialized = true;
    this.log('Memory backend initialized');
  }

  async close(): Promise<void> {
    this.cache.clear();
    this.initialized = false;
    this.log('Memory backend closed');
  }

  async isHealthy(): Promise<boolean> {
    return this.initialized;
  }

  async get(key: string): Promise<EmbeddingCacheEntry | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }

    // LRU: Move to end
    if (this.config.enableLru) {
      this.cache.delete(key);
      this.cache.set(key, entry);
    }

    return entry;
  }

  async set(key: string, entry: EmbeddingCacheEntry): Promise<void> {
    // Evict oldest if at capacity
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
        this.log(`Evicted oldest entry: ${firstKey.substring(0, 16)}...`);
      }
    }

    this.cache.set(key, entry);
  }

  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.log('Cache cleared');
  }

  async size(): Promise<number> {
    return this.cache.size;
  }

  async *keys(): AsyncIterable<string> {
    for (const key of this.cache.keys()) {
      yield key;
    }
  }

  async pruneExpired(maxAgeMs: number): Promise<number> {
    const now = Date.now();
    const threshold = now - maxAgeMs;
    let pruned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < threshold) {
        this.cache.delete(key);
        pruned++;
      }
    }

    if (pruned > 0) {
      this.log(`Pruned ${pruned} expired entries`);
    }

    return pruned;
  }

  /**
   * Get backend statistics
   */
  getStats(): BackendStats {
    return {
      name: this.name,
      type: this.type,
      size: this.cache.size,
      memoryUsageBytes: this.cache.size * BYTES_PER_ENTRY,
      healthy: this.initialized,
      lastHealthCheck: new Date(),
      metrics: {
        maxSize: this.config.maxSize,
        utilization: (this.cache.size / this.config.maxSize) * 100,
      },
    };
  }

  /**
   * Get all entries (for export/migration)
   */
  async exportAll(): Promise<Array<{ key: string; entry: EmbeddingCacheEntry }>> {
    const entries: Array<{ key: string; entry: EmbeddingCacheEntry }> = [];

    for (const [key, entry] of this.cache.entries()) {
      if (!this.isExpired(entry)) {
        entries.push({ key, entry });
      }
    }

    return entries;
  }

  /**
   * Import entries (for migration)
   */
  async importAll(
    entries: Array<{ key: string; entry: EmbeddingCacheEntry }>
  ): Promise<number> {
    let imported = 0;

    for (const { key, entry } of entries) {
      if (!this.isExpired(entry) && this.cache.size < this.config.maxSize) {
        this.cache.set(key, entry);
        imported++;
      }
    }

    this.log(`Imported ${imported} entries`);
    return imported;
  }

  // ============================================
  // Private Methods
  // ============================================

  private isExpired(entry: EmbeddingCacheEntry): boolean {
    if (this.config.defaultTtlMs === 0) return false;
    return Date.now() - entry.timestamp > this.config.defaultTtlMs;
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[MemoryBackend] ${message}`);
    }
  }
}
