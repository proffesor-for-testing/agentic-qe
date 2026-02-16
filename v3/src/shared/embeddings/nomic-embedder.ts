/**
 * Agentic QE v3 - Nomic Embedder
 * Local, zero-cost embeddings via Ollama with nomic-embed-text model
 *
 * Features:
 * - 768-dimensional embeddings optimized for code
 * - Batch processing with progress tracking
 * - Semantic context formatting for code chunks
 * - Content-hash based caching
 * - Graceful fallback when Ollama is unavailable
 * - Error handling and retries
 */

import { OllamaClient } from './ollama-client';
import { EmbeddingCache } from './embedding-cache';
import { toErrorMessage } from '../error-utils.js';
import {
  CodeChunk,
  EmbeddingResult,
  EmbeddingBatchResult,
  ProgressCallback,
  CacheStats,
  EMBEDDING_CONFIG,
  IEmbeddingProvider,
} from './types';

/**
 * Configuration for NomicEmbedder
 */
export interface NomicEmbedderConfig {
  /** Ollama base URL (default: http://localhost:11434) */
  ollamaBaseUrl?: string;
  /** Batch size for processing (default: 100) */
  batchSize?: number;
  /** Maximum cache size (default: 10000) */
  maxCacheSize?: number;
  /** Enable fallback to pseudo-embeddings when Ollama unavailable */
  enableFallback?: boolean;
  /** Pre-configured cache instance (for dependency injection) */
  cache?: EmbeddingCache;
}

/**
 * Nomic Embedder for generating code embeddings via Ollama
 */
export class NomicEmbedder implements IEmbeddingProvider {
  private client: OllamaClient;
  private cache: EmbeddingCache;
  private batchSize: number;
  private enableFallback: boolean;
  private ollamaAvailable: boolean | null = null;

  /**
   * Create a NomicEmbedder instance
   *
   * @example Basic usage:
   * ```typescript
   * const embedder = new NomicEmbedder();
   * const embedding = await embedder.embed("function add(a, b) { return a + b; }");
   * ```
   *
   * @example With configuration:
   * ```typescript
   * const embedder = new NomicEmbedder({
   *   ollamaBaseUrl: 'http://localhost:11434',
   *   enableFallback: true,
   * });
   * ```
   */
  constructor(config: NomicEmbedderConfig = {}) {
    this.client = new OllamaClient(config.ollamaBaseUrl);
    this.cache = config.cache ?? new EmbeddingCache(config.maxCacheSize);
    this.batchSize = config.batchSize ?? EMBEDDING_CONFIG.BATCH_SIZE;
    this.enableFallback = config.enableFallback ?? true;
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

    // Try Ollama first, fall back to pseudo-embedding if unavailable
    let embedding: number[];

    if (await this.isOllamaAvailable()) {
      embedding = await this.client.generateEmbedding(text);
    } else if (this.enableFallback) {
      embedding = this.generatePseudoEmbedding(text);
    } else {
      throw new Error(
        `Ollama is not available and fallback is disabled. ` +
          `Please run: ollama pull ${EMBEDDING_CONFIG.MODEL}`
      );
    }

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
    // Rough estimate: 1 token ~ 4 characters
    const maxContentLength = EMBEDDING_CONFIG.CONTEXT_WINDOW * 4;
    let content = chunk.content.trim();

    if (context.length + content.length > maxContentLength) {
      const availableLength = maxContentLength - context.length - 3; // -3 for "..."
      content = content.substring(0, availableLength) + '...';
    }

    return context + content;
  }

  /**
   * Generate embeddings for multiple text strings (IEmbeddingProvider interface)
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      const embedding = await this.embed(text);
      results.push(embedding);
    }
    return results;
  }

  /**
   * Generate embeddings for multiple code chunks with batching and progress tracking
   */
  async embedCodeChunks(
    chunks: CodeChunk[],
    progressCallback?: ProgressCallback
  ): Promise<EmbeddingBatchResult> {
    const startTime = Date.now();
    const results: EmbeddingResult[] = [];
    let cachedHits = 0;
    let computedNew = 0;

    // Check Ollama availability once before starting
    const useOllama = await this.isOllamaAvailable();

    if (useOllama) {
      await this.client.ensureModelAvailable();
    } else if (!this.enableFallback) {
      throw new Error(
        `Ollama is not available and fallback is disabled. ` +
          `Please run: ollama pull ${EMBEDDING_CONFIG.MODEL}`
      );
    }

    // Process in batches
    for (let i = 0; i < chunks.length; i += this.batchSize) {
      const batch = chunks.slice(i, Math.min(i + this.batchSize, chunks.length));
      const batchResults = await this.processBatch(batch, useOllama);

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
          estimatedTimeRemainingMs,
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
        avgTimePerChunk: totalTimeMs / chunks.length,
      },
    };
  }

  /**
   * Process a single batch of chunks
   */
  private async processBatch(
    chunks: CodeChunk[],
    useOllama: boolean
  ): Promise<EmbeddingResult[]> {
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
          computeTimeMs: Date.now() - chunkStartTime,
        };
      }

      // Generate new embedding
      try {
        let embedding: number[];

        if (useOllama) {
          embedding = await this.client.generateEmbedding(formattedText);
        } else {
          embedding = this.generatePseudoEmbedding(formattedText);
        }

        // Cache the result
        this.cache.set(formattedText, EMBEDDING_CONFIG.MODEL, embedding);

        return {
          chunkId: chunk.id,
          embedding,
          model: useOllama ? EMBEDDING_CONFIG.MODEL : 'pseudo-embedding',
          cached: false,
          computeTimeMs: Date.now() - chunkStartTime,
        };
      } catch (error) {
        throw new Error(
          `Failed to generate embedding for chunk ${chunk.id}: ${toErrorMessage(error)}`
        );
      }
    });

    const batchResults = await Promise.all(promises);
    results.push(...batchResults);

    return results;
  }

  /**
   * Check if Ollama is available (cached check)
   */
  private async isOllamaAvailable(): Promise<boolean> {
    if (this.ollamaAvailable !== null) {
      return this.ollamaAvailable;
    }

    this.ollamaAvailable = await this.client.healthCheck();
    return this.ollamaAvailable;
  }

  /**
   * Reset the Ollama availability cache
   */
  resetOllamaCheck(): void {
    this.ollamaAvailable = null;
  }

  /**
   * Generate a pseudo-embedding based on code features
   * Used as fallback when Ollama is not available
   */
  private generatePseudoEmbedding(text: string): number[] {
    const embedding = new Array(EMBEDDING_CONFIG.DIMENSIONS).fill(0);

    // Extract tokens
    const tokens = text.split(/\s+|[^\w]+/).filter((t) => t.length > 0);

    // Combine token-based features
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      for (let j = 0; j < token.length && j < embedding.length; j++) {
        embedding[(i + j) % embedding.length] += token.charCodeAt(j) / 1000;
      }
    }

    // Add code-specific signals
    const signals: [RegExp, number][] = [
      [/class\s+\w+/, 0],
      [/function\s+\w+/, 1],
      [/async\s+|await\s+|Promise/, 2],
      [/interface\s+\w+/, 3],
      [/export\s+/, 4],
      [/import\s+/, 5],
      [/try\s*{/, 6],
      [/\.(map|filter|reduce)\(/, 7],
    ];

    for (const [pattern, idx] of signals) {
      if (pattern.test(text)) {
        embedding[idx] += 0.5;
      }
    }

    // Normalize to unit vector
    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0)) || 1;
    return embedding.map((v) => v / magnitude);
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
  getCacheStats(): CacheStats {
    return this.cache.getStats();
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
   * Get embedding dimensions
   */
  getDimensions(): number {
    return EMBEDDING_CONFIG.DIMENSIONS;
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
      maxRetries: EMBEDDING_CONFIG.MAX_RETRIES,
      enableFallback: this.enableFallback,
    };
  }
}

/**
 * Create a NomicEmbedder instance
 * Factory function for convenience
 */
export function createNomicEmbedder(config?: NomicEmbedderConfig): NomicEmbedder {
  return new NomicEmbedder(config);
}
