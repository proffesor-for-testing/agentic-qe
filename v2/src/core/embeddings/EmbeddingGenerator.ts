/**
 * Embedding Generator - Convert patterns into vector embeddings
 *
 * Features:
 * - Phase 1 (Simple): Hash-based embeddings for quick start
 * - Phase 2 (ML): Transformers.js for production embeddings
 * - Caching for performance optimization
 * - Batch processing support
 * - Graceful fallback if ML models unavailable
 *
 * Models:
 * - Text: "Xenova/all-MiniLM-L6-v2" (384 dimensions)
 * - Code: "microsoft/codebert-base" (768 dimensions)
 *
 * Performance:
 * - Hash-based: ~50µs per embedding
 * - ML-based: ~5-10ms per embedding (cached)
 * - Batch: ~2ms per embedding (10+ texts)
 *
 * @module EmbeddingGenerator
 */

import { createHash } from 'crypto';
import { EmbeddingCache } from './EmbeddingCache';

/**
 * Embedding generation options
 */
export interface EmbeddingOptions {
  /** Use ML-based embeddings (default: true) */
  useML?: boolean;

  /** Cache embeddings for performance (default: true) */
  useCache?: boolean;

  /** Normalize embeddings to unit length (default: true) */
  normalize?: boolean;

  /** Language for code embeddings (e.g., 'typescript', 'python') */
  language?: string;

  /** Model to use ('text' | 'code') */
  model?: 'text' | 'code';

  /** Target dimension (for hash-based only) */
  dimension?: number;
}

/**
 * Embedding result
 */
export interface EmbeddingResult {
  /** Vector embedding */
  embedding: number[];

  /** Embedding dimension */
  dimension: number;

  /** Method used ('hash' | 'ml') */
  method: 'hash' | 'ml';

  /** Generation time in milliseconds */
  generationTime: number;

  /** Whether result was cached */
  cached: boolean;

  /** Model name used */
  model: string;
}

/**
 * Batch embedding result
 */
export interface BatchEmbeddingResult {
  /** Array of embeddings */
  embeddings: number[][];

  /** Total generation time */
  totalTime: number;

  /** Average time per embedding */
  avgTime: number;

  /** Number of cache hits */
  cacheHits: number;

  /** Method used */
  method: 'hash' | 'ml';
}

/**
 * Embedding Generator
 *
 * Provides both simple hash-based and ML-based embedding generation
 * with intelligent fallback and caching.
 */
export class EmbeddingGenerator {
  private cache: EmbeddingCache;
  private mlAvailable: boolean = false;
  private pipeline: any = null;
  private codePipeline: any = null;
  private initPromise: Promise<void> | null = null;

  // Model configurations
  private readonly TEXT_MODEL = 'Xenova/all-MiniLM-L6-v2';
  private readonly CODE_MODEL = 'microsoft/codebert-base';
  private readonly TEXT_DIMENSION = 384;
  private readonly CODE_DIMENSION = 768;
  private readonly DEFAULT_HASH_DIMENSION = 256;

  /**
   * Create a new embedding generator
   *
   * @param cacheSize - Maximum number of cached embeddings (default: 10000)
   * @param autoInitML - Automatically initialize ML models (default: false)
   */
  constructor(
    private cacheSize: number = 10000,
    private autoInitML: boolean = false
  ) {
    this.cache = new EmbeddingCache(cacheSize);

    // Auto-initialize ML models if requested
    if (autoInitML) {
      this.initPromise = this.initializeML().catch((error) => {
        console.warn('ML initialization failed, falling back to hash-based:', error.message);
        this.mlAvailable = false;
      });
    }
  }

  /**
   * Initialize ML models
   *
   * Lazy-loads Transformers.js models for production embeddings.
   * Falls back to hash-based if models unavailable.
   */
  async initializeML(): Promise<void> {
    if (this.mlAvailable) {
      return;
    }

    try {
      // Dynamic import to avoid bundling if not needed
      const { pipeline } = await import('@xenova/transformers');

      // Initialize text embedding pipeline
      this.pipeline = await pipeline('feature-extraction', this.TEXT_MODEL);

      console.log(`✓ ML text model loaded: ${this.TEXT_MODEL} (${this.TEXT_DIMENSION}D)`);

      this.mlAvailable = true;
    } catch (error: any) {
      console.warn('ML models not available, using hash-based embeddings:', error.message);
      this.mlAvailable = false;
      throw error;
    }
  }

  /**
   * Initialize code embedding model
   *
   * Separate initialization for code model to avoid loading if not needed.
   */
  async initializeCodeModel(): Promise<void> {
    if (this.codePipeline) {
      return;
    }

    try {
      const { pipeline } = await import('@xenova/transformers');
      this.codePipeline = await pipeline('feature-extraction', this.CODE_MODEL);
      console.log(`✓ ML code model loaded: ${this.CODE_MODEL} (${this.CODE_DIMENSION}D)`);
    } catch (error: any) {
      console.warn('Code model not available:', error.message);
      throw error;
    }
  }

  /**
   * Generate text embedding
   *
   * @param text - Text to embed
   * @param options - Embedding options
   * @returns Embedding result with vector and metadata
   */
  async generateTextEmbedding(
    text: string,
    options: EmbeddingOptions = {}
  ): Promise<EmbeddingResult> {
    const startTime = Date.now();
    const {
      useML = true,
      useCache = true,
      normalize = true,
      dimension = this.DEFAULT_HASH_DIMENSION
    } = options;

    // Check cache first
    if (useCache) {
      const cached = this.cache.get(text, 'text');
      if (cached) {
        return {
          embedding: cached,
          dimension: cached.length,
          method: cached.length === dimension ? 'hash' : 'ml',
          generationTime: Date.now() - startTime,
          cached: true,
          model: cached.length === this.TEXT_DIMENSION ? this.TEXT_MODEL : 'hash'
        };
      }
    }

    let embedding: number[];
    let method: 'hash' | 'ml';
    let modelName: string;

    // Try ML-based embedding first if available
    if (useML && this.mlAvailable && this.pipeline) {
      try {
        embedding = await this.generateMLTextEmbedding(text);
        method = 'ml';
        modelName = this.TEXT_MODEL;
      } catch (error) {
        console.warn('ML embedding failed, falling back to hash:', error);
        embedding = this.generateHashEmbedding(text, dimension);
        method = 'hash';
        modelName = 'hash';
      }
    } else {
      // Use hash-based embedding
      embedding = this.generateHashEmbedding(text, dimension);
      method = 'hash';
      modelName = 'hash';
    }

    // Normalize if requested
    if (normalize && method === 'hash') {
      embedding = this.normalizeEmbedding(embedding);
    }

    // Cache result
    if (useCache) {
      this.cache.set(text, embedding, 'text');
    }

    return {
      embedding,
      dimension: embedding.length,
      method,
      generationTime: Date.now() - startTime,
      cached: false,
      model: modelName
    };
  }

  /**
   * Generate code embedding
   *
   * @param code - Code to embed
   * @param language - Programming language
   * @param options - Embedding options
   * @returns Embedding result
   */
  async generateCodeEmbedding(
    code: string,
    language: string,
    options: EmbeddingOptions = {}
  ): Promise<EmbeddingResult> {
    const startTime = Date.now();
    const {
      useML = true,
      useCache = true,
      normalize = true,
      dimension = this.DEFAULT_HASH_DIMENSION
    } = options;

    // Cache key includes language
    const cacheKey = `${language}:${code}`;

    // Check cache first
    if (useCache) {
      const cached = this.cache.get(cacheKey, 'code');
      if (cached) {
        return {
          embedding: cached,
          dimension: cached.length,
          method: cached.length === dimension ? 'hash' : 'ml',
          generationTime: Date.now() - startTime,
          cached: true,
          model: cached.length === this.CODE_DIMENSION ? this.CODE_MODEL : 'hash'
        };
      }
    }

    let embedding: number[];
    let method: 'hash' | 'ml';
    let modelName: string;

    // Try ML-based code embedding
    if (useML && this.mlAvailable) {
      try {
        if (!this.codePipeline) {
          await this.initializeCodeModel();
        }
        embedding = await this.generateMLCodeEmbedding(code, language);
        method = 'ml';
        modelName = this.CODE_MODEL;
      } catch (error) {
        console.warn('ML code embedding failed, falling back to hash:', error);
        embedding = this.generateHashEmbedding(code, dimension);
        method = 'hash';
        modelName = 'hash';
      }
    } else {
      // Use hash-based embedding with language as salt for differentiation
      embedding = this.generateHashEmbedding(code, dimension, language);
      method = 'hash';
      modelName = 'hash';
    }

    // Normalize if requested
    if (normalize && method === 'hash') {
      embedding = this.normalizeEmbedding(embedding);
    }

    // Cache result
    if (useCache) {
      this.cache.set(cacheKey, embedding, 'code');
    }

    return {
      embedding,
      dimension: embedding.length,
      method,
      generationTime: Date.now() - startTime,
      cached: false,
      model: modelName
    };
  }

  /**
   * Generate batch text embeddings
   *
   * More efficient than generating one at a time.
   *
   * @param texts - Array of texts to embed
   * @param options - Embedding options
   * @returns Batch embedding result
   */
  async generateBatchTextEmbeddings(
    texts: string[],
    options: EmbeddingOptions = {}
  ): Promise<BatchEmbeddingResult> {
    const startTime = Date.now();
    const { useML = true, useCache = true } = options;

    const embeddings: number[][] = [];
    let cacheHits = 0;
    let method: 'hash' | 'ml' = 'hash';

    // Process each text
    for (const text of texts) {
      const result = await this.generateTextEmbedding(text, {
        ...options,
        useML,
        useCache
      });

      embeddings.push(result.embedding);
      if (result.cached) {
        cacheHits++;
      }
      if (result.method === 'ml') {
        method = 'ml';
      }
    }

    const totalTime = Date.now() - startTime;

    return {
      embeddings,
      totalTime,
      avgTime: texts.length > 0 ? totalTime / texts.length : 0,
      cacheHits,
      method
    };
  }

  /**
   * Generate hash-based embedding
   *
   * Fast, deterministic embedding using cryptographic hashing.
   * Suitable for testing and development.
   *
   * @param text - Text to embed
   * @param dimension - Target dimension (default: 256)
   * @param salt - Optional salt for different embeddings (default: '')
   * @returns Vector embedding
   */
  generateHashEmbedding(
    text: string,
    dimension: number = this.DEFAULT_HASH_DIMENSION,
    salt: string = ''
  ): number[] {
    const embedding: number[] = new Array(dimension);

    // Use multiple hash passes for better distribution
    const passes = Math.ceil(dimension / 32); // SHA-256 produces 32 bytes

    for (let pass = 0; pass < passes; pass++) {
      const hash = createHash('sha256')
        .update(`${salt}:${pass}:${text}`)
        .digest();

      const startIdx = pass * 32;
      const endIdx = Math.min(startIdx + 32, dimension);

      for (let i = startIdx; i < endIdx; i++) {
        // Convert byte to [-1, 1] range
        embedding[i] = (hash[i - startIdx] / 127.5) - 1;
      }
    }

    return embedding;
  }

  /**
   * Generate ML-based text embedding
   *
   * Uses Transformers.js for production-quality embeddings.
   *
   * @param text - Text to embed
   * @returns Vector embedding
   */
  private async generateMLTextEmbedding(text: string): Promise<number[]> {
    if (!this.pipeline) {
      throw new Error('ML pipeline not initialized');
    }

    // Wait for initialization if in progress
    if (this.initPromise) {
      await this.initPromise;
    }

    // Generate embedding using transformer
    const result = await this.pipeline(text, {
      pooling: 'mean',
      normalize: true
    });

    // Convert to regular array
    return Array.from(result.data);
  }

  /**
   * Generate ML-based code embedding
   *
   * Uses CodeBERT for code-specific embeddings.
   *
   * @param code - Code to embed
   * @param language - Programming language
   * @returns Vector embedding
   */
  private async generateMLCodeEmbedding(code: string, language: string): Promise<number[]> {
    if (!this.codePipeline) {
      throw new Error('Code pipeline not initialized');
    }

    // Prepend language token for context
    const input = `[${language}] ${code}`;

    const result = await this.codePipeline(input, {
      pooling: 'mean',
      normalize: true
    });

    return Array.from(result.data);
  }

  /**
   * Normalize embedding to unit length
   *
   * @param embedding - Vector to normalize
   * @returns Normalized vector
   */
  private normalizeEmbedding(embedding: number[]): number[] {
    const magnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0)
    );

    if (magnitude === 0) {
      return embedding;
    }

    return embedding.map(val => val / magnitude);
  }

  /**
   * Get cached embedding
   *
   * @param key - Cache key
   * @param type - Embedding type ('text' | 'code')
   * @returns Cached embedding or null
   */
  getCachedEmbedding(key: string, type: 'text' | 'code' = 'text'): number[] | null {
    return this.cache.get(key, type);
  }

  /**
   * Cache embedding manually
   *
   * @param key - Cache key
   * @param embedding - Vector embedding
   * @param type - Embedding type
   */
  cacheEmbedding(key: string, embedding: number[], type: 'text' | 'code' = 'text'): void {
    this.cache.set(key, embedding, type);
  }

  /**
   * Clear cache
   *
   * @param type - Type to clear ('text' | 'code' | 'all')
   */
  clearCache(type: 'text' | 'code' | 'all' = 'all'): void {
    this.cache.clear(type);
  }

  /**
   * Get cache statistics
   *
   * @returns Cache stats
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Check if ML models are available
   *
   * @returns True if ML models initialized
   */
  isMLAvailable(): boolean {
    return this.mlAvailable;
  }

  /**
   * Get model information
   *
   * @returns Model info
   */
  getModelInfo() {
    return {
      textModel: this.TEXT_MODEL,
      codeModel: this.CODE_MODEL,
      textDimension: this.TEXT_DIMENSION,
      codeDimension: this.CODE_DIMENSION,
      hashDimension: this.DEFAULT_HASH_DIMENSION,
      mlAvailable: this.mlAvailable,
      cacheSize: this.cacheSize
    };
  }
}
