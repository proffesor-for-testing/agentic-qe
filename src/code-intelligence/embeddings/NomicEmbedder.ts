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
 */

import { OllamaClient } from './OllamaClient';
import { EmbeddingCache } from './EmbeddingCache';
import {
  CodeChunk,
  EmbeddingResult,
  EmbeddingBatchResult,
  BatchProgress,
  ProgressCallback,
  EMBEDDING_CONFIG
} from './types';

export class NomicEmbedder {
  private client: OllamaClient;
  private cache: EmbeddingCache;
  private batchSize: number;

  constructor(
    ollamaBaseUrl?: string,
    maxCacheSize?: number,
    batchSize: number = EMBEDDING_CONFIG.BATCH_SIZE
  ) {
    this.client = new OllamaClient(ollamaBaseUrl);
    this.cache = new EmbeddingCache(maxCacheSize);
    this.batchSize = batchSize;
  }

  /**
   * Generate embedding for a single text string
   */
  async embed(text: string): Promise<number[]> {
    // Check cache first
    const cached = this.cache.get(text, EMBEDDING_CONFIG.MODEL);
    if (cached) {
      return cached;
    }

    // Generate new embedding
    const embedding = await this.client.generateEmbedding(text);

    // Cache result
    this.cache.set(text, EMBEDDING_CONFIG.MODEL, embedding);

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

      // Check cache
      const cachedEmbedding = this.cache.get(formattedText, EMBEDDING_CONFIG.MODEL);

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

        // Cache the result
        this.cache.set(formattedText, EMBEDDING_CONFIG.MODEL, embedding);

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
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Get cache memory usage estimate
   */
  getCacheMemoryUsage(): number {
    return this.cache.getMemoryUsageEstimate();
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
   */
  evictOldCacheEntries(ageMs: number): number {
    return this.cache.evictOlderThan(ageMs);
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
  estimateBatchTime(
    chunkCount: number,
    assumedTimePerEmbeddingMs: number = 100
  ): number {
    const cacheStats = this.getCacheStats();
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
