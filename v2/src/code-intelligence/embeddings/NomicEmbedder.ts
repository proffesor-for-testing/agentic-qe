/**
 * Nomic Embedder for Code Intelligence System v2.0
 *
 * Features:
 * - Local, zero-cost embeddings via Ollama
 * - Batch processing (100 chunks at a time)
 * - Semantic context formatting for code chunks
 * - Embedding caching with content hashing
 * - Progress tracking for large batches
 * - Error handling and retries
 * - Pluggable storage backends (SP-2 - Issue #146)
 */

import { OllamaClient } from './OllamaClient';
import { EmbeddingCache } from './EmbeddingCache';
import {
  EnhancedEmbeddingCache,
  createEmbeddingCache,
  type EmbeddingCacheConfig,
} from './EmbeddingCacheFactory.js';
import type { BackendType } from './backends/types.js';
import {
  CodeChunk,
  EmbeddingResult,
  EmbeddingBatchResult,
  BatchProgress,
  ProgressCallback,
  CacheStats,
  EMBEDDING_CONFIG
} from './types';

/**
 * Cache interface that both EmbeddingCache and EnhancedEmbeddingCache implement
 */
interface IEmbeddingCache {
  get(content: string, model: string): number[] | null | Promise<number[] | null>;
  set(content: string, model: string, embedding: number[]): void | Promise<void>;
  getStats(): CacheStats | Promise<CacheStats & { backendType?: BackendType }>;
  clear(): void | Promise<void>;
}

/**
 * Configuration for NomicEmbedder
 */
export interface NomicEmbedderConfig {
  /** Ollama base URL (default: http://localhost:11434) */
  ollamaBaseUrl?: string;
  /** Batch size for processing (default: 100) */
  batchSize?: number;
  /** Maximum cache size for memory backend (default: 10000) */
  maxCacheSize?: number;
  /**
   * Storage backend type (SP-2 - Issue #146)
   * - 'memory': In-memory with LRU (default, backward compatible)
   * - 'redis': Distributed caching (requires Redis config)
   * - 'sqlite': Persistent local storage
   */
  cacheBackend?: BackendType;
  /** Full cache configuration for advanced setups */
  cacheConfig?: Partial<EmbeddingCacheConfig>;
  /** Pre-configured cache instance (for dependency injection) */
  cache?: EmbeddingCache | EnhancedEmbeddingCache;
}

export class NomicEmbedder {
  private client: OllamaClient;
  private cache: IEmbeddingCache;
  private enhancedCache?: EnhancedEmbeddingCache;
  private batchSize: number;
  private cacheInitialized: boolean = false;

  /**
   * Create a NomicEmbedder instance
   *
   * @example Basic usage (backward compatible):
   * ```typescript
   * const embedder = new NomicEmbedder();
   * ```
   *
   * @example With configuration object:
   * ```typescript
   * const embedder = new NomicEmbedder({
   *   ollamaBaseUrl: 'http://localhost:11434',
   *   cacheBackend: 'sqlite',
   *   cacheConfig: { sqlite: { dbPath: './data/embeddings.db' } }
   * });
   * await embedder.initializeCache();
   * ```
   *
   * @example Legacy constructor (deprecated but supported):
   * ```typescript
   * const embedder = new NomicEmbedder('http://localhost:11434', 5000, 50);
   * ```
   */
  constructor(
    configOrUrl?: NomicEmbedderConfig | string,
    maxCacheSize?: number,
    batchSize: number = EMBEDDING_CONFIG.BATCH_SIZE
  ) {
    // Handle both legacy and new constructor signatures
    if (typeof configOrUrl === 'string' || configOrUrl === undefined) {
      // Legacy constructor: (ollamaBaseUrl?, maxCacheSize?, batchSize?)
      this.client = new OllamaClient(configOrUrl);
      this.cache = new EmbeddingCache(maxCacheSize);
      this.batchSize = batchSize;
      this.cacheInitialized = true; // Simple cache is immediately ready
    } else {
      // New constructor with config object
      const config = configOrUrl;
      this.client = new OllamaClient(config.ollamaBaseUrl);
      this.batchSize = config.batchSize ?? EMBEDDING_CONFIG.BATCH_SIZE;

      if (config.cache) {
        // Use pre-configured cache
        this.cache = config.cache;
        if (config.cache instanceof EnhancedEmbeddingCache) {
          this.enhancedCache = config.cache;
        }
        this.cacheInitialized = true;
      } else if (config.cacheBackend && config.cacheBackend !== 'memory') {
        // Create enhanced cache with specified backend
        this.enhancedCache = createEmbeddingCache({
          backend: config.cacheBackend,
          maxSize: config.maxCacheSize ?? config.cacheConfig?.maxSize,
          ...config.cacheConfig,
        });
        this.cache = this.enhancedCache;
        // Enhanced cache needs initialization
        this.cacheInitialized = false;
      } else {
        // Default: Simple in-memory cache (backward compatible)
        this.cache = new EmbeddingCache(config.maxCacheSize);
        this.cacheInitialized = true;
      }
    }
  }

  /**
   * Initialize the cache backend (required for Redis/SQLite)
   * No-op for simple in-memory cache
   */
  async initializeCache(): Promise<void> {
    if (this.cacheInitialized) {
      return;
    }

    if (this.enhancedCache) {
      await this.enhancedCache.initialize();
    }

    this.cacheInitialized = true;
  }

  /**
   * Close the cache backend and release resources
   */
  async closeCache(): Promise<void> {
    if (this.enhancedCache) {
      await this.enhancedCache.close();
    }
    this.cacheInitialized = false;
  }

  /**
   * Check if using enhanced cache with pluggable backend
   */
  isUsingEnhancedCache(): boolean {
    return this.enhancedCache !== undefined;
  }

  /**
   * Get the cache backend type
   */
  getCacheBackendType(): string {
    if (this.enhancedCache) {
      return this.enhancedCache.getBackendName();
    }
    return 'memory';
  }

  /**
   * Generate embedding for a single text string
   */
  async embed(text: string): Promise<number[]> {
    // Ensure cache is initialized
    if (!this.cacheInitialized) {
      await this.initializeCache();
    }

    // Check cache first (handle both sync and async)
    const cachedResult = this.cache.get(text, EMBEDDING_CONFIG.MODEL);
    const cached = cachedResult instanceof Promise ? await cachedResult : cachedResult;
    if (cached) {
      return cached;
    }

    // Generate new embedding
    const embedding = await this.client.generateEmbedding(text);

    // Cache result (handle both sync and async)
    const setResult = this.cache.set(text, EMBEDDING_CONFIG.MODEL, embedding);
    if (setResult instanceof Promise) {
      await setResult;
    }

    return embedding;
  }

  /**
   * Format code chunk for semantic embedding
   * Format: "[language] [type] [name]: [content]"
   */
  formatForEmbedding(chunk: CodeChunk): string {
    const parts: string[] = [];

    // Add language
    if (chunk.language) {
      parts.push(chunk.language);
    }

    // Add type (function, class, method, etc.)
    if (chunk.type) {
      parts.push(chunk.type);
    }

    // Add name if available
    if (chunk.name) {
      parts.push(chunk.name);
    }

    // Build context prefix
    const context = parts.length > 0 ? `${parts.join(' ')}: ` : '';

    // Truncate content if needed (8192 token limit)
    // Rough estimate: 1 token ≈ 4 characters
    const maxContentLength = EMBEDDING_CONFIG.CONTEXT_WINDOW * 4;
    let content = chunk.content.trim();

    if (context.length + content.length > maxContentLength) {
      const availableLength = maxContentLength - context.length - 3; // -3 for "..."
      content = content.substring(0, availableLength) + '...';
    }

    return context + content;
  }

  /**
   * Generate embeddings for multiple code chunks with batching
   */
  async embedBatch(
    chunks: CodeChunk[],
    progressCallback?: ProgressCallback
  ): Promise<EmbeddingBatchResult> {
    // Ensure cache is initialized
    if (!this.cacheInitialized) {
      await this.initializeCache();
    }

    const startTime = Date.now();
    const results: EmbeddingResult[] = [];
    let cachedHits = 0;
    let computedNew = 0;

    // Ensure Ollama is available before starting
    await this.client.ensureModelAvailable();

    // Process in batches
    for (let i = 0; i < chunks.length; i += this.batchSize) {
      const batch = chunks.slice(i, Math.min(i + this.batchSize, chunks.length));
      const batchResults = await this.processBatch(batch);

      results.push(...batchResults);

      // Update statistics
      for (const result of batchResults) {
        if (result.cached) {
          cachedHits++;
        } else {
          computedNew++;
        }
      }

      // Report progress
      if (progressCallback) {
        const current = i + batch.length;
        const total = chunks.length;
        const elapsed = Date.now() - startTime;
        const avgTimePerChunk = elapsed / current;
        const remaining = total - current;
        const estimatedTimeRemainingMs = remaining * avgTimePerChunk;

        progressCallback({
          current,
          total,
          percentage: (current / total) * 100,
          estimatedTimeRemainingMs
        });
      }
    }

    const totalTimeMs = Date.now() - startTime;

    return {
      results,
      stats: {
        totalChunks: chunks.length,
        cachedHits,
        computedNew,
        totalTimeMs,
        avgTimePerChunk: totalTimeMs / chunks.length
      }
    };
  }

  /**
   * Process a single batch of chunks
   */
  private async processBatch(chunks: CodeChunk[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];

    // Process chunks concurrently within the batch
    const promises = chunks.map(async (chunk): Promise<EmbeddingResult> => {
      const formattedText = this.formatForEmbedding(chunk);
      const chunkStartTime = Date.now();

      // Check cache (handle both sync and async)
      const cacheResult = this.cache.get(formattedText, EMBEDDING_CONFIG.MODEL);
      const cachedEmbedding = cacheResult instanceof Promise ? await cacheResult : cacheResult;

      if (cachedEmbedding) {
        return {
          chunkId: chunk.id,
          embedding: cachedEmbedding,
          model: EMBEDDING_CONFIG.MODEL,
          cached: true,
          computeTimeMs: Date.now() - chunkStartTime
        };
      }

      // Generate new embedding
      try {
        const embedding = await this.client.generateEmbedding(formattedText);

        // Cache the result (handle both sync and async)
        const setResult = this.cache.set(formattedText, EMBEDDING_CONFIG.MODEL, embedding);
        if (setResult instanceof Promise) {
          await setResult;
        }

        return {
          chunkId: chunk.id,
          embedding,
          model: EMBEDDING_CONFIG.MODEL,
          cached: false,
          computeTimeMs: Date.now() - chunkStartTime
        };
      } catch (error) {
        throw new Error(
          `Failed to generate embedding for chunk ${chunk.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

    const batchResults = await Promise.all(promises);
    results.push(...batchResults);

    return results;
  }

  /**
   * Clear the embedding cache
   */
  async clearCache(): Promise<void> {
    const result = this.cache.clear();
    if (result instanceof Promise) {
      await result;
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<CacheStats & { backendType?: BackendType }> {
    const result = this.cache.getStats();
    if (result instanceof Promise) {
      return await result;
    }
    return result;
  }

  /**
   * Get cache memory usage estimate
   * Note: Only available for simple in-memory cache
   */
  getCacheMemoryUsage(): number {
    // Only simple EmbeddingCache has this method
    if (this.cache instanceof EmbeddingCache) {
      return this.cache.getMemoryUsageEstimate();
    }
    // For enhanced cache, estimate based on stats
    const stats = (this.cache as EmbeddingCache).getStats?.();
    if (stats && typeof stats === 'object' && 'size' in stats) {
      // Rough estimate: 768 floats * 8 bytes + 100 bytes overhead per entry
      return (stats as CacheStats).size * (768 * 8 + 100);
    }
    return 0;
  }

  /**
   * Verify Ollama connection and model availability
   */
  async healthCheck(): Promise<boolean> {
    return await this.client.healthCheck();
  }

  /**
   * Get Ollama server information
   */
  async getServerInfo() {
    return await this.client.getServerInfo();
  }

  /**
   * Evict old cache entries
   * Note: For enhanced cache with Redis/SQLite, TTL-based expiration is automatic
   */
  async evictOldCacheEntries(ageMs: number): Promise<number> {
    // Simple EmbeddingCache has evictOlderThan
    if (this.cache instanceof EmbeddingCache) {
      return this.cache.evictOlderThan(ageMs);
    }
    // Enhanced cache uses prune method
    if (this.enhancedCache) {
      return this.enhancedCache.prune();
    }
    return 0;
  }

  /**
   * Warmup cache with common code patterns
   */
  async warmupCache(chunks: CodeChunk[]): Promise<void> {
    await this.embedBatch(chunks);
  }

  /**
   * Batch format chunks without generating embeddings (for testing)
   */
  batchFormat(chunks: CodeChunk[]): string[] {
    return chunks.map(chunk => this.formatForEmbedding(chunk));
  }

  /**
   * Estimate total time for embedding batch
   */
  async estimateBatchTime(
    chunkCount: number,
    assumedTimePerEmbeddingMs: number = 100
  ): Promise<number> {
    const cacheStats = await this.getCacheStats();
    const expectedCacheHitRate = cacheStats.hitRate || 0;
    const expectedCacheMisses = chunkCount * (1 - expectedCacheHitRate);

    return expectedCacheMisses * assumedTimePerEmbeddingMs;
  }

  /**
   * Get configuration info
   */
  getConfig() {
    return {
      model: EMBEDDING_CONFIG.MODEL,
      dimensions: EMBEDDING_CONFIG.DIMENSIONS,
      contextWindow: EMBEDDING_CONFIG.CONTEXT_WINDOW,
      batchSize: this.batchSize,
      maxRetries: EMBEDDING_CONFIG.MAX_RETRIES
    };
  }
}
