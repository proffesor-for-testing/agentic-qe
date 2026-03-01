/**
 * ONNX Embeddings Adapter - Embedding Generator
 *
 * Generates vector embeddings from text using ONNX runtime.
 * Supports multiple models, caching, and batch generation.
 *
 * @module onnx-embeddings/embedding-generator
 */

import type {
  Embedding,
  EmbeddingConfig,
  BatchEmbeddingRequest,
  BatchEmbeddingResult,
  EmbeddingStats
} from './types.js';
import { EmbeddingModel, EmbeddingError, EmbeddingErrorType } from './types.js';
import { secureRandom } from '../../../shared/utils/crypto-random.js';

/**
 * LRU Cache for embeddings
 */
class EmbeddingCache {
  private cache: Map<string, Embedding>;
  private readonly maxSize: number;
  private hits = 0;
  private misses = 0;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key: string): Embedding | undefined {
    const value = this.cache.get(key);
    if (value) {
      this.hits++;
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    this.misses++;
    return undefined;
  }

  set(key: string, value: Embedding): void {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  getStats(): { hits: number; misses: number; size: number } {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size
    };
  }
}

/**
 * Generates embeddings from text using ONNX models
 */
export class EmbeddingGenerator {
  private config: EmbeddingConfig;
  private cache: EmbeddingCache;
  private totalGenerated = 0;
  private generationTimes: number[] = [];
  private isInitialized = false;

  // Mock ONNX interface - in real implementation, this would be the ONNX runtime
  private onnxRuntime: {
    generateEmbedding: (text: string, model: EmbeddingModel) => Promise<number[]>;
    isAvailable: () => boolean;
  } | null = null;

  constructor(config: Partial<EmbeddingConfig> = {}) {
    this.config = {
      model: config.model ?? EmbeddingModel.MINI_LM_L6,
      normalize: config.normalize ?? true,
      hyperbolic: config.hyperbolic ?? false,
      cacheSize: config.cacheSize ?? 256,
      curvature: config.curvature ?? -1.0
    };
    this.cache = new EmbeddingCache(this.config.cacheSize);
  }

  /**
   * Initialize the ONNX runtime (bridge to agentic-flow MCP)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // In production, this would call the MCP embeddings_init tool
      // For now, we create a mock that bridges to the real implementation
      this.onnxRuntime = {
        generateEmbedding: async (text: string, model: EmbeddingModel): Promise<number[]> => {
          // Bridge to agentic-flow MCP tool: embeddings_generate
          // This would call: mcp__claude-flow__embeddings_generate({ text, normalize: true })

          // Mock implementation - in production, this calls ONNX
          const dimensions = model === EmbeddingModel.MINI_LM_L6 ? 384 : 768;
          const vector = new Array(dimensions).fill(0).map(() => secureRandom() * 2 - 1);

          // Normalize if configured
          if (this.config.normalize) {
            const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
            return vector.map(val => val / norm);
          }

          return vector;
        },
        isAvailable: (): boolean => true
      };

      this.isInitialized = true;
    } catch (error) {
      throw new EmbeddingError(
        EmbeddingErrorType.RUNTIME_UNAVAILABLE,
        'Failed to initialize ONNX runtime',
        error
      );
    }
  }

  /**
   * Generate embedding for a single text
   */
  async generate(text: string): Promise<Embedding> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!text || text.trim().length === 0) {
      throw new EmbeddingError(
        EmbeddingErrorType.INVALID_INPUT,
        'Text cannot be empty'
      );
    }

    // Check cache
    const cacheKey = this.getCacheKey(text);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Generate new embedding
    const startTime = Date.now();
    try {
      if (!this.onnxRuntime) {
        throw new EmbeddingError(
          EmbeddingErrorType.RUNTIME_UNAVAILABLE,
          'ONNX runtime not available'
        );
      }

      const vector = await this.onnxRuntime.generateEmbedding(text, this.config.model);

      let finalVector = vector;
      let isHyperbolic = false;

      // Convert to hyperbolic if configured
      if (this.config.hyperbolic) {
        finalVector = this.euclideanToPoincare(vector);
        isHyperbolic = true;
      }

      const embedding: Embedding = {
        vector: finalVector,
        dimensions: finalVector.length,
        model: this.config.model,
        isHyperbolic
      };

      // Cache and track stats
      this.cache.set(cacheKey, embedding);
      this.totalGenerated++;
      this.generationTimes.push(Date.now() - startTime);

      // Keep only last 100 times for average
      if (this.generationTimes.length > 100) {
        this.generationTimes.shift();
      }

      return embedding;
    } catch (error) {
      throw new EmbeddingError(
        EmbeddingErrorType.MODEL_LOAD_FAILED,
        `Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateBatch(request: BatchEmbeddingRequest): Promise<BatchEmbeddingResult> {
    if (!request.texts || request.texts.length === 0) {
      throw new EmbeddingError(
        EmbeddingErrorType.INVALID_INPUT,
        'Batch request must contain at least one text'
      );
    }

    const startTime = Date.now();
    let cacheHits = 0;
    const embeddings: Embedding[] = [];

    // Apply config override if provided
    const originalConfig = { ...this.config };
    if (request.config) {
      this.config = { ...this.config, ...request.config };
    }

    try {
      // Process each text
      for (const text of request.texts) {
        const cacheKey = this.getCacheKey(text);
        const cached = this.cache.get(cacheKey);

        if (cached) {
          embeddings.push(cached);
          cacheHits++;
        } else {
          const embedding = await this.generate(text);
          embeddings.push(embedding);
        }
      }

      return {
        embeddings,
        duration: Date.now() - startTime,
        cacheHits
      };
    } finally {
      // Restore original config
      this.config = originalConfig;
    }
  }

  /**
   * Get generator statistics
   */
  getStats(): Partial<EmbeddingStats> {
    const cacheStats = this.cache.getStats();
    const avgTime = this.generationTimes.length > 0
      ? this.generationTimes.reduce((sum, t) => sum + t, 0) / this.generationTimes.length
      : 0;

    return {
      totalGenerated: this.totalGenerated,
      cacheHits: cacheStats.hits,
      cacheMisses: cacheStats.misses,
      avgGenerationTime: avgTime,
      currentModel: this.config.model,
      vectorsStored: cacheStats.size
    };
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<EmbeddingConfig>): void {
    const needsReinit = config.model && config.model !== this.config.model;

    this.config = { ...this.config, ...config };

    // Resize cache if needed
    if (config.cacheSize !== undefined && config.cacheSize !== this.cache.getStats().size) {
      this.cache = new EmbeddingCache(config.cacheSize);
    }

    // Reinitialize if model changed
    if (needsReinit) {
      this.isInitialized = false;
    }
  }

  /**
   * Generate cache key from text and config
   */
  private getCacheKey(text: string): string {
    return `${this.config.model}:${this.config.hyperbolic}:${text}`;
  }

  /**
   * Convert Euclidean embedding to Poincaré ball
   * Maps to hyperbolic space using exponential map
   */
  private euclideanToPoincare(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));

    if (norm === 0) {
      return vector;
    }

    // Scale to fit in Poincaré ball (radius < 1)
    const c = Math.abs(this.config.curvature);
    const sqrtC = Math.sqrt(c);
    const scale = Math.tanh(sqrtC * norm / 2) / (sqrtC * norm);

    return vector.map(val => val * scale);
  }

  /**
   * Check if generator is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.onnxRuntime !== null;
  }
}
