/**
 * Embedding Cache - LRU cache for embedding vectors
 *
 * Features:
 * - LRU eviction policy
 * - Separate namespaces for text and code
 * - Memory-efficient storage
 * - Cache statistics
 *
 * Performance:
 * - Get: O(1)
 * - Set: O(1)
 * - Memory: ~4KB per 1000 cached embeddings (256D)
 *
 * @module EmbeddingCache
 */

/**
 * Cache entry
 */
interface CacheEntry {
  /** Vector embedding */
  embedding: number[];

  /** Last access timestamp */
  lastAccess: number;

  /** Access count */
  accessCount: number;

  /** Entry size in bytes */
  size: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Text embeddings cached */
  textCount: number;

  /** Code embeddings cached */
  codeCount: number;

  /** Total entries */
  totalCount: number;

  /** Cache hits */
  hits: number;

  /** Cache misses */
  misses: number;

  /** Hit rate percentage */
  hitRate: number;

  /** Memory usage in bytes */
  memoryUsage: number;

  /** Maximum capacity */
  maxSize: number;
}

/**
 * Embedding Cache
 *
 * LRU cache for storing embedding vectors with separate namespaces
 * for text and code embeddings.
 */
export class EmbeddingCache {
  private textCache: Map<string, CacheEntry>;
  private codeCache: Map<string, CacheEntry>;
  private hits: number = 0;
  private misses: number = 0;

  /**
   * Create a new embedding cache
   *
   * @param maxSize - Maximum number of entries per namespace (default: 10000)
   */
  constructor(private maxSize: number = 10000) {
    this.textCache = new Map();
    this.codeCache = new Map();
  }

  /**
   * Get cached embedding
   *
   * @param key - Cache key
   * @param type - Namespace ('text' | 'code')
   * @returns Cached embedding or null
   */
  get(key: string, type: 'text' | 'code' = 'text'): number[] | null {
    const cache = type === 'text' ? this.textCache : this.codeCache;
    const entry = cache.get(key);

    if (entry) {
      // Update access stats
      entry.lastAccess = Date.now();
      entry.accessCount++;

      // Move to end (most recently used)
      cache.delete(key);
      cache.set(key, entry);

      this.hits++;
      return entry.embedding;
    }

    this.misses++;
    return null;
  }

  /**
   * Set cached embedding
   *
   * @param key - Cache key
   * @param embedding - Vector embedding
   * @param type - Namespace ('text' | 'code')
   */
  set(key: string, embedding: number[], type: 'text' | 'code' = 'text'): void {
    const cache = type === 'text' ? this.textCache : this.codeCache;

    // Check if we need to evict
    if (cache.size >= this.maxSize && !cache.has(key)) {
      this.evictLRU(cache);
    }

    // Calculate entry size (rough estimate)
    const size = embedding.length * 8 + key.length * 2 + 24; // 8 bytes per number, 2 per char, 24 overhead

    // Store entry
    cache.set(key, {
      embedding: [...embedding], // Clone array
      lastAccess: Date.now(),
      accessCount: 0,
      size
    });
  }

  /**
   * Check if key exists
   *
   * @param key - Cache key
   * @param type - Namespace
   * @returns True if key exists
   */
  has(key: string, type: 'text' | 'code' = 'text'): boolean {
    const cache = type === 'text' ? this.textCache : this.codeCache;
    return cache.has(key);
  }

  /**
   * Delete cached entry
   *
   * @param key - Cache key
   * @param type - Namespace
   * @returns True if deleted
   */
  delete(key: string, type: 'text' | 'code' = 'text'): boolean {
    const cache = type === 'text' ? this.textCache : this.codeCache;
    return cache.delete(key);
  }

  /**
   * Clear cache
   *
   * @param type - Type to clear ('text' | 'code' | 'all')
   */
  clear(type: 'text' | 'code' | 'all' = 'all'): void {
    if (type === 'text' || type === 'all') {
      this.textCache.clear();
    }
    if (type === 'code' || type === 'all') {
      this.codeCache.clear();
    }
    if (type === 'all') {
      this.hits = 0;
      this.misses = 0;
    }
  }

  /**
   * Evict least recently used entry
   *
   * @param cache - Cache to evict from
   */
  private evictLRU(cache: Map<string, CacheEntry>): void {
    // First entry is the least recently used (Map maintains insertion order)
    const firstKey = cache.keys().next().value;
    if (firstKey) {
      cache.delete(firstKey);
    }
  }

  /**
   * Get cache statistics
   *
   * @returns Cache stats
   */
  getStats(): CacheStats {
    const textCount = this.textCache.size;
    const codeCount = this.codeCache.size;
    const totalCount = textCount + codeCount;
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0;

    // Calculate memory usage
    let memoryUsage = 0;
    for (const entry of this.textCache.values()) {
      memoryUsage += entry.size;
    }
    for (const entry of this.codeCache.values()) {
      memoryUsage += entry.size;
    }

    return {
      textCount,
      codeCount,
      totalCount,
      hits: this.hits,
      misses: this.misses,
      hitRate,
      memoryUsage,
      maxSize: this.maxSize * 2 // Total max size (both namespaces)
    };
  }

  /**
   * Get most frequently accessed entries
   *
   * @param type - Namespace
   * @param limit - Number of entries to return
   * @returns Array of [key, accessCount] tuples
   */
  getMostAccessed(type: 'text' | 'code' = 'text', limit: number = 10): Array<[string, number]> {
    const cache = type === 'text' ? this.textCache : this.codeCache;
    const entries = Array.from(cache.entries());

    return entries
      .sort((a, b) => b[1].accessCount - a[1].accessCount)
      .slice(0, limit)
      .map(([key, entry]) => [key, entry.accessCount]);
  }

  /**
   * Get cache size in bytes
   *
   * @param type - Namespace ('text' | 'code' | 'all')
   * @returns Memory usage in bytes
   */
  getSize(type: 'text' | 'code' | 'all' = 'all'): number {
    let size = 0;

    if (type === 'text' || type === 'all') {
      for (const entry of this.textCache.values()) {
        size += entry.size;
      }
    }

    if (type === 'code' || type === 'all') {
      for (const entry of this.codeCache.values()) {
        size += entry.size;
      }
    }

    return size;
  }

  /**
   * Optimize cache by removing least used entries
   *
   * @param threshold - Minimum access count to keep
   * @param type - Namespace ('text' | 'code' | 'all')
   * @returns Number of entries removed
   */
  optimize(threshold: number = 1, type: 'text' | 'code' | 'all' = 'all'): number {
    let removed = 0;

    const optimizeCache = (cache: Map<string, CacheEntry>) => {
      const toRemove: string[] = [];
      for (const [key, entry] of cache.entries()) {
        if (entry.accessCount < threshold) {
          toRemove.push(key);
        }
      }
      for (const key of toRemove) {
        cache.delete(key);
        removed++;
      }
    };

    if (type === 'text' || type === 'all') {
      optimizeCache(this.textCache);
    }
    if (type === 'code' || type === 'all') {
      optimizeCache(this.codeCache);
    }

    return removed;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }
}
