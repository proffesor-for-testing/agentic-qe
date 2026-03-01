/**
 * Agentic QE v3 - LRU Cache for LLM Responses
 * ADR-011: LLM Provider System for Quality Engineering
 *
 * Provides efficient caching of LLM responses to reduce costs and latency
 * for repeated queries. Uses LRU (Least Recently Used) eviction policy.
 */

import {
  CacheEntry,
  LLMCacheConfig,
  LLMCacheStats,
  LLMResponse,
  EmbeddingResponse,
  CompletionResponse,
} from './interfaces';

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: LLMCacheConfig = {
  maxSize: 1000,
  defaultTtlMs: 3600000, // 1 hour
  enableLRU: true,
  cacheGenerations: true,
  cacheEmbeddings: true,
  cacheCompletions: true,
};

/**
 * Type for cacheable response types
 */
export type CacheableResponse = LLMResponse | EmbeddingResponse | CompletionResponse;

/**
 * LRU Cache implementation for LLM responses
 */
export class LLMCache<T = CacheableResponse> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private accessOrder: string[] = [];
  private readonly config: LLMCacheConfig;
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;

  constructor(config: Partial<LLMCacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  /**
   * Generate a cache key from request parameters
   */
  static generateKey(
    type: 'generation' | 'embedding' | 'completion',
    input: string,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
    }
  ): string {
    const parts = [
      type,
      options?.model ?? 'default',
      String(options?.temperature ?? 0.7),
      String(options?.maxTokens ?? 0),
      options?.systemPrompt ?? '',
      input,
    ];

    // Simple hash function
    const str = parts.join('|');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `${type}:${Math.abs(hash).toString(36)}`;
  }

  /**
   * Get a cached value
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check TTL expiration
    if (entry.ttlMs > 0) {
      const age = Date.now() - entry.createdAt.getTime();
      if (age > entry.ttlMs) {
        this.delete(key);
        this.misses++;
        return undefined;
      }
    }

    // Update access tracking for LRU
    this.hits++;
    entry.lastAccessedAt = new Date();
    entry.accessCount++;

    if (this.config.enableLRU) {
      this.updateAccessOrder(key);
    }

    return entry.value;
  }

  /**
   * Store a value in the cache
   */
  set(key: string, value: T, ttlMs?: number): void {
    // Evict if at capacity
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      value,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 1,
      ttlMs: ttlMs ?? this.config.defaultTtlMs,
      keyHash: key,
    };

    this.cache.set(key, entry);

    if (this.config.enableLRU) {
      this.updateAccessOrder(key);
    }
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check TTL
    if (entry.ttlMs > 0) {
      const age = Date.now() - entry.createdAt.getTime();
      if (age > entry.ttlMs) {
        this.delete(key);
        return false;
      }
    }

    return true;
  }

  /**
   * Delete a cached value
   */
  delete(key: string): boolean {
    const existed = this.cache.delete(key);

    if (existed) {
      const index = this.accessOrder.indexOf(key);
      if (index !== -1) {
        this.accessOrder.splice(index, 1);
      }
    }

    return existed;
  }

  /**
   * Clear all cached values
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): LLMCacheStats {
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? this.hits / totalRequests : 0;

    // Estimate memory usage (rough approximation)
    let memoryUsageBytes = 0;
    for (const entry of this.cache.values()) {
      memoryUsageBytes += this.estimateSize(entry.value);
    }

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate,
      evictions: this.evictions,
      memoryUsageBytes,
    };
  }

  /**
   * Get all cached keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get entries for export/persistence
   */
  entries(): Array<[string, CacheEntry<T>]> {
    return Array.from(this.cache.entries());
  }

  /**
   * Import entries from persistence
   */
  import(entries: Array<[string, CacheEntry<T>]>): void {
    for (const [key, entry] of entries) {
      // Reconstruct dates
      entry.createdAt = new Date(entry.createdAt);
      entry.lastAccessedAt = new Date(entry.lastAccessedAt);
      this.cache.set(key, entry);
      this.accessOrder.push(key);
    }

    // Evict if over capacity
    while (this.cache.size > this.config.maxSize) {
      this.evictLRU();
    }
  }

  /**
   * Prune expired entries
   */
  pruneExpired(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.ttlMs > 0) {
        const age = now - entry.createdAt.getTime();
        if (age > entry.ttlMs) {
          this.delete(key);
          pruned++;
        }
      }
    }

    return pruned;
  }

  /**
   * Update the LRU access order
   */
  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  /**
   * Evict the least recently used entry
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) {
      // Fallback: delete first entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
        this.evictions++;
      }
      return;
    }

    const lruKey = this.accessOrder.shift();
    if (lruKey) {
      this.cache.delete(lruKey);
      this.evictions++;
    }
  }

  /**
   * Estimate the size of a cached value in bytes
   */
  private estimateSize(value: unknown): number {
    if (value === null || value === undefined) {
      return 0;
    }

    const json = JSON.stringify(value);
    // 2 bytes per character (UTF-16)
    return json.length * 2;
  }
}

/**
 * Specialized cache for LLM responses with request-specific key generation
 */
export class LLMResponseCache {
  private generationCache: LLMCache<LLMResponse>;
  private embeddingCache: LLMCache<EmbeddingResponse>;
  private completionCache: LLMCache<CompletionResponse>;
  private readonly config: LLMCacheConfig;

  constructor(config: Partial<LLMCacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
    this.generationCache = new LLMCache<LLMResponse>(config);
    this.embeddingCache = new LLMCache<EmbeddingResponse>(config);
    this.completionCache = new LLMCache<CompletionResponse>(config);
  }

  /**
   * Get a cached generation response
   */
  getGeneration(
    input: string,
    options?: { model?: string; temperature?: number; maxTokens?: number; systemPrompt?: string }
  ): LLMResponse | undefined {
    if (!this.config.cacheGenerations) {
      return undefined;
    }
    const key = LLMCache.generateKey('generation', input, options);
    return this.generationCache.get(key);
  }

  /**
   * Cache a generation response
   */
  setGeneration(
    input: string,
    response: LLMResponse,
    options?: { model?: string; temperature?: number; maxTokens?: number; systemPrompt?: string },
    ttlMs?: number
  ): void {
    if (!this.config.cacheGenerations) {
      return;
    }
    const key = LLMCache.generateKey('generation', input, options);
    this.generationCache.set(key, response, ttlMs);
  }

  /**
   * Get a cached embedding response
   */
  getEmbedding(
    text: string,
    options?: { model?: string }
  ): EmbeddingResponse | undefined {
    if (!this.config.cacheEmbeddings) {
      return undefined;
    }
    const key = LLMCache.generateKey('embedding', text, options);
    return this.embeddingCache.get(key);
  }

  /**
   * Cache an embedding response
   */
  setEmbedding(
    text: string,
    response: EmbeddingResponse,
    options?: { model?: string },
    ttlMs?: number
  ): void {
    if (!this.config.cacheEmbeddings) {
      return;
    }
    const key = LLMCache.generateKey('embedding', text, options);
    this.embeddingCache.set(key, response, ttlMs);
  }

  /**
   * Get a cached completion response
   */
  getCompletion(
    prompt: string,
    options?: { model?: string; temperature?: number; maxTokens?: number }
  ): CompletionResponse | undefined {
    if (!this.config.cacheCompletions) {
      return undefined;
    }
    const key = LLMCache.generateKey('completion', prompt, options);
    return this.completionCache.get(key);
  }

  /**
   * Cache a completion response
   */
  setCompletion(
    prompt: string,
    response: CompletionResponse,
    options?: { model?: string; temperature?: number; maxTokens?: number },
    ttlMs?: number
  ): void {
    if (!this.config.cacheCompletions) {
      return;
    }
    const key = LLMCache.generateKey('completion', prompt, options);
    this.completionCache.set(key, response, ttlMs);
  }

  /**
   * Get combined cache statistics
   */
  getStats(): {
    generation: LLMCacheStats;
    embedding: LLMCacheStats;
    completion: LLMCacheStats;
    total: LLMCacheStats;
  } {
    const genStats = this.generationCache.getStats();
    const embStats = this.embeddingCache.getStats();
    const compStats = this.completionCache.getStats();

    const totalHits = genStats.hits + embStats.hits + compStats.hits;
    const totalMisses = genStats.misses + embStats.misses + compStats.misses;
    const totalRequests = totalHits + totalMisses;

    return {
      generation: genStats,
      embedding: embStats,
      completion: compStats,
      total: {
        size: genStats.size + embStats.size + compStats.size,
        maxSize: this.config.maxSize * 3,
        hits: totalHits,
        misses: totalMisses,
        hitRate: totalRequests > 0 ? totalHits / totalRequests : 0,
        evictions: genStats.evictions + embStats.evictions + compStats.evictions,
        memoryUsageBytes:
          genStats.memoryUsageBytes +
          embStats.memoryUsageBytes +
          compStats.memoryUsageBytes,
      },
    };
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.generationCache.clear();
    this.embeddingCache.clear();
    this.completionCache.clear();
  }

  /**
   * Prune expired entries from all caches
   */
  pruneExpired(): number {
    return (
      this.generationCache.pruneExpired() +
      this.embeddingCache.pruneExpired() +
      this.completionCache.pruneExpired()
    );
  }
}
