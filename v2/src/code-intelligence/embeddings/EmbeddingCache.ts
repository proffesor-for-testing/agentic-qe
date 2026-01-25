/**
 * Embedding Cache with Content Hash-Based Deduplication
 *
 * Caches embeddings by content hash to avoid recomputing for unchanged chunks
 * Features:
 * - SHA-256 content hashing
 * - LRU eviction policy
 * - Cache statistics tracking
 * - Memory-efficient storage
 */

import { createHash } from 'crypto';
import { EmbeddingCacheEntry, CacheStats } from './types';

export class EmbeddingCache {
  private cache: Map<string, EmbeddingCacheEntry>;
  private maxSize: number;
  private hits: number;
  private misses: number;

  constructor(maxSize: number = 10000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Generate SHA-256 hash of content for cache key
   */
  private hashContent(content: string, model: string): string {
    return createHash('sha256')
      .update(`${model}:${content}`)
      .digest('hex');
  }

  /**
   * Get cached embedding if available
   */
  get(content: string, model: string): number[] | null {
    const key = this.hashContent(content, model);
    const entry = this.cache.get(key);

    if (entry) {
      this.hits++;
      // Move to end (LRU update)
      this.cache.delete(key);
      this.cache.set(key, entry);
      return entry.embedding;
    }

    this.misses++;
    return null;
  }

  /**
   * Store embedding in cache
   */
  set(content: string, model: string, embedding: number[]): void {
    const key = this.hashContent(content, model);

    // Evict oldest entry if cache is full (LRU)
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    const entry: EmbeddingCacheEntry = {
      embedding,
      timestamp: Date.now(),
      model
    };

    this.cache.set(key, entry);
  }

  /**
   * Check if embedding exists in cache
   */
  has(content: string, model: string): boolean {
    const key = this.hashContent(content, model);
    return this.cache.has(key);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;

    return {
      size: this.cache.size,
      hitRate,
      hits: this.hits,
      misses: this.misses
    };
  }

  /**
   * Clear all cached embeddings
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Remove entries older than specified age
   */
  evictOlderThan(ageMs: number): number {
    const now = Date.now();
    const threshold = now - ageMs;
    let evicted = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < threshold) {
        this.cache.delete(key);
        evicted++;
      }
    }

    return evicted;
  }

  /**
   * Get memory usage estimate in bytes
   */
  getMemoryUsageEstimate(): number {
    // Each embedding is 768 floats (8 bytes each) + overhead
    const embeddingSize = 768 * 8;
    const entryOverhead = 100; // Rough estimate for metadata
    return this.cache.size * (embeddingSize + entryOverhead);
  }

  /**
   * Export cache for persistence
   */
  export(): Array<{ key: string; entry: EmbeddingCacheEntry }> {
    return Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      entry
    }));
  }

  /**
   * Import cache from persistence
   */
  import(data: Array<{ key: string; entry: EmbeddingCacheEntry }>): void {
    this.cache.clear();
    for (const { key, entry } of data) {
      if (this.cache.size < this.maxSize) {
        this.cache.set(key, entry);
      }
    }
  }

  /**
   * Batch check for multiple contents
   */
  batchHas(
    contents: string[],
    model: string
  ): Map<string, boolean> {
    const results = new Map<string, boolean>();

    for (const content of contents) {
      const key = this.hashContent(content, model);
      results.set(content, this.cache.has(key));
    }

    return results;
  }

  /**
   * Batch get for multiple contents
   */
  batchGet(
    contents: string[],
    model: string
  ): Map<string, number[] | null> {
    const results = new Map<string, number[] | null>();

    for (const content of contents) {
      results.set(content, this.get(content, model));
    }

    return results;
  }

  /**
   * Warmup cache with common patterns
   */
  warmup(entries: Array<{ content: string; model: string; embedding: number[] }>): void {
    for (const { content, model, embedding } of entries) {
      this.set(content, model, embedding);
    }
  }
}
