/**
 * Redis Storage Backend for Embedding Cache
 *
 * Distributed caching with automatic TTL expiration.
 * Best for multi-process/multi-server deployments.
 *
 * @module code-intelligence/embeddings/backends/RedisBackend
 * @see Issue #146 - Security Hardening: SP-2 Dedicated Embedding Cache
 */

import { Redis } from 'ioredis';
import type { EmbeddingCacheEntry } from '../types.js';
import type {
  EmbeddingStorageBackend,
  RedisBackendConfig,
  BackendStats,
} from './types.js';
import { DEFAULT_TTL_MS, BYTES_PER_ENTRY } from './types.js';

/**
 * Default Redis configuration
 */
const DEFAULT_REDIS_CONFIG: Partial<RedisBackendConfig> = {
  host: 'localhost',
  port: 6379,
  db: 0,
  keyPrefix: 'emb:',
  ttlSeconds: 86400, // 24 hours
  connectTimeoutMs: 5000,
  tls: false,
};

/**
 * Redis-based embedding storage backend
 *
 * Features:
 * - Distributed caching across processes
 * - Automatic TTL expiration via Redis SETEX
 * - Connection pooling via ioredis
 * - Graceful degradation on connection failure
 */
export class RedisStorageBackend implements EmbeddingStorageBackend {
  readonly name = 'redis';
  readonly type = 'redis' as const;

  private client: Redis | null = null;
  private config: Required<RedisBackendConfig>;
  private initialized: boolean = false;
  private healthy: boolean = false;

  constructor(config: RedisBackendConfig) {
    this.config = {
      host: config.host,
      port: config.port,
      password: config.password ?? '',
      db: config.db ?? DEFAULT_REDIS_CONFIG.db!,
      keyPrefix: config.keyPrefix ?? DEFAULT_REDIS_CONFIG.keyPrefix!,
      ttlSeconds: config.ttlSeconds ?? DEFAULT_REDIS_CONFIG.ttlSeconds!,
      connectTimeoutMs: config.connectTimeoutMs ?? DEFAULT_REDIS_CONFIG.connectTimeoutMs!,
      tls: config.tls ?? DEFAULT_REDIS_CONFIG.tls!,
      maxSize: config.maxSize ?? 0,
      defaultTtlMs: config.defaultTtlMs ?? DEFAULT_TTL_MS,
      debug: config.debug ?? false,
      retryStrategy: config.retryStrategy ?? ((times) => Math.min(times * 100, 3000)),
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.client = new Redis({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password || undefined,
        db: this.config.db,
        connectTimeout: this.config.connectTimeoutMs,
        tls: this.config.tls ? {} : undefined,
        retryStrategy: this.config.retryStrategy,
        lazyConnect: true,
      });

      // Set up event handlers
      this.client.on('connect', () => {
        this.healthy = true;
        this.log('Connected to Redis');
      });

      this.client.on('error', (error) => {
        this.healthy = false;
        this.log(`Redis error: ${error.message}`);
      });

      this.client.on('close', () => {
        this.healthy = false;
        this.log('Redis connection closed');
      });

      // Connect
      await this.client.connect();
      await this.client.ping();

      this.initialized = true;
      this.healthy = true;
      this.log('Redis backend initialized');
    } catch (error) {
      this.healthy = false;
      throw new Error(`Failed to initialize Redis backend: ${(error as Error).message}`);
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
    this.initialized = false;
    this.healthy = false;
    this.log('Redis backend closed');
  }

  async isHealthy(): Promise<boolean> {
    if (!this.client || !this.initialized) return false;

    try {
      await this.client.ping();
      this.healthy = true;
      return true;
    } catch {
      this.healthy = false;
      return false;
    }
  }

  async get(key: string): Promise<EmbeddingCacheEntry | null> {
    this.ensureClient();

    try {
      const data = await this.client!.get(this.prefixKey(key));
      if (!data) return null;

      return this.deserialize(data);
    } catch (error) {
      this.log(`Get error: ${(error as Error).message}`);
      return null;
    }
  }

  async set(key: string, entry: EmbeddingCacheEntry): Promise<void> {
    this.ensureClient();

    try {
      const serialized = this.serialize(entry);
      await this.client!.setex(
        this.prefixKey(key),
        this.config.ttlSeconds,
        serialized
      );
    } catch (error) {
      this.log(`Set error: ${(error as Error).message}`);
      throw error;
    }
  }

  async has(key: string): Promise<boolean> {
    this.ensureClient();

    try {
      const exists = await this.client!.exists(this.prefixKey(key));
      return exists === 1;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    this.ensureClient();

    try {
      const result = await this.client!.del(this.prefixKey(key));
      return result === 1;
    } catch {
      return false;
    }
  }

  async clear(): Promise<void> {
    this.ensureClient();

    try {
      // Use SCAN to find all keys with our prefix
      const pattern = `${this.config.keyPrefix}*`;
      let cursor = '0';
      const keysToDelete: string[] = [];

      do {
        const [nextCursor, keys] = await this.client!.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          1000
        );
        cursor = nextCursor;
        keysToDelete.push(...keys);
      } while (cursor !== '0');

      // Delete in batches
      if (keysToDelete.length > 0) {
        const pipeline = this.client!.pipeline();
        for (const key of keysToDelete) {
          pipeline.del(key);
        }
        await pipeline.exec();
      }

      this.log(`Cleared ${keysToDelete.length} keys`);
    } catch (error) {
      this.log(`Clear error: ${(error as Error).message}`);
      throw error;
    }
  }

  async size(): Promise<number> {
    this.ensureClient();

    try {
      const pattern = `${this.config.keyPrefix}*`;
      let cursor = '0';
      let count = 0;

      do {
        const [nextCursor, keys] = await this.client!.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          1000
        );
        cursor = nextCursor;
        count += keys.length;
      } while (cursor !== '0');

      return count;
    } catch {
      return 0;
    }
  }

  async *keys(): AsyncIterable<string> {
    this.ensureClient();

    const pattern = `${this.config.keyPrefix}*`;
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.client!.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      );
      cursor = nextCursor;

      for (const key of keys) {
        // Remove prefix before yielding
        yield key.substring(this.config.keyPrefix.length);
      }
    } while (cursor !== '0');
  }

  async pruneExpired(_maxAgeMs: number): Promise<number> {
    // Redis handles TTL expiration automatically
    // This method is a no-op for Redis
    this.log('Redis handles TTL expiration automatically');
    return 0;
  }

  /**
   * Get backend statistics
   */
  async getStats(): Promise<BackendStats> {
    const size = await this.size();

    return {
      name: this.name,
      type: this.type,
      size,
      memoryUsageBytes: size * BYTES_PER_ENTRY,
      healthy: this.healthy,
      lastHealthCheck: new Date(),
      metrics: {
        ttlSeconds: this.config.ttlSeconds,
        db: this.config.db,
      },
    };
  }

  // ============================================
  // Private Methods
  // ============================================

  private prefixKey(key: string): string {
    return `${this.config.keyPrefix}${key}`;
  }

  private serialize(entry: EmbeddingCacheEntry): string {
    // Use MessagePack-style binary encoding for efficiency
    // For now, use JSON (can optimize later)
    return JSON.stringify({
      e: entry.embedding,
      t: entry.timestamp,
      m: entry.model,
    });
  }

  private deserialize(data: string): EmbeddingCacheEntry {
    const parsed = JSON.parse(data);
    return {
      embedding: parsed.e,
      timestamp: parsed.t,
      model: parsed.m,
    };
  }

  private ensureClient(): void {
    if (!this.client || !this.initialized) {
      throw new Error('Redis client not initialized. Call initialize() first.');
    }
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[RedisBackend] ${message}`);
    }
  }
}
