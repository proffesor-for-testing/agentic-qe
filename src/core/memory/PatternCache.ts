/**
 * LRU Cache for Pattern Queries
 * Issue: #52 - Optimize LearningEngine performance
 *
 * Provides in-memory caching for frequently accessed patterns
 * with LRU eviction and TTL-based expiration.
 *
 * Performance: O(1) get/set operations
 */

import { Pattern } from './SwarmMemoryManager';

export interface CacheEntry {
  patterns: Pattern[];
  timestamp: number;
  hits: number;
}

export interface CacheStats {
  size: number;
  maxSize: number;
  hitRate: number;
  missRate: number;
  totalHits: number;
  totalMisses: number;
  ttl: number;
  evictions: number;
}

export interface PatternCacheConfig {
  maxSize?: number;
  ttl?: number; // milliseconds
  enableStats?: boolean;
}

/**
 * LRU Cache for Pattern Storage
 *
 * Features:
 * - O(1) get/set operations
 * - LRU eviction when capacity reached
 * - TTL-based expiration
 * - Hit rate tracking
 * - Agent-specific invalidation
 */
export class PatternCache {
  private cache = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private readonly ttl: number;
  private readonly enableStats: boolean;

  // Statistics
  private totalHits = 0;
  private totalMisses = 0;
  private evictions = 0;

  constructor(config: PatternCacheConfig = {}) {
    this.maxSize = config.maxSize || 100;
    this.ttl = config.ttl || 60000; // Default: 60 seconds
    this.enableStats = config.enableStats ?? true;
  }

  /**
   * Get patterns from cache
   * Returns null if not found or expired
   *
   * Complexity: O(1)
   */
  get(key: string): Pattern[] | null {
    const entry = this.cache.get(key);

    if (!entry) {
      if (this.enableStats) this.totalMisses++;
      return null;
    }

    // Check TTL expiration
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      if (this.enableStats) this.totalMisses++;
      return null;
    }

    // LRU: Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, {
      ...entry,
      hits: entry.hits + 1
    });

    if (this.enableStats) this.totalHits++;
    return entry.patterns;
  }

  /**
   * Store patterns in cache
   * Evicts least recently used entry if at capacity
   *
   * Complexity: O(1)
   */
  set(key: string, patterns: Pattern[]): void {
    // Evict oldest entry if at max size
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
        if (this.enableStats) this.evictions++;
      }
    }

    this.cache.set(key, {
      patterns,
      timestamp: Date.now(),
      hits: 0
    });
  }

  /**
   * Invalidate all cache entries for a specific agent
   * Called when patterns are updated
   *
   * Complexity: O(n) where n = cache size
   */
  invalidate(agentId: string): void {
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.startsWith(`patterns:${agentId}:`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    if (this.enableStats) {
      this.totalHits = 0;
      this.totalMisses = 0;
      this.evictions = 0;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.totalHits + this.totalMisses;
    const hitRate = total > 0 ? this.totalHits / total : 0;
    const missRate = total > 0 ? this.totalMisses / total : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate,
      missRate,
      totalHits: this.totalHits,
      totalMisses: this.totalMisses,
      ttl: this.ttl,
      evictions: this.evictions
    };
  }

  /**
   * Check if key exists in cache (without affecting LRU order)
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check expiration
    return Date.now() - entry.timestamp <= this.ttl;
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.totalHits = 0;
    this.totalMisses = 0;
    this.evictions = 0;
  }

  /**
   * Get all cache keys (for debugging)
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Manually expire old entries
   * Called periodically to clean up expired entries
   */
  pruneExpired(): number {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
    return keysToDelete.length;
  }

  /**
   * Generate cache key for pattern queries
   */
  static generateKey(agentId: string, minConfidence: number): string {
    return `patterns:${agentId}:${minConfidence}`;
  }
}
