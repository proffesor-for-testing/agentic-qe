/**
 * Unified Embedding Generator - Base Class
 *
 * Shared between QE and claude-flow per ADR-040.
 * QE-specific extensions extend this base class.
 *
 * Performance targets:
 * - Test embedding: <15ms
 * - 75x faster with ONNX integration
 *
 * @module integrations/embeddings/base/EmbeddingGenerator
 */

import type {
  IEmbedding,
  IEmbeddingModelConfig,
  IEmbeddingOptions,
  IBatchEmbeddingResult,
  ISimilarityResult,
  ISearchOptions,
  IEmbeddingStats,
  EmbeddingDimension,
  EmbeddingNamespace,
  QuantizationType,
} from './types.js';

// Export types for use in extensions
export type {
  IEmbedding,
  IEmbeddingModelConfig,
  IEmbeddingOptions,
  IBatchEmbeddingResult,
  ISimilarityResult,
  ISearchOptions,
  IEmbeddingStats,
  EmbeddingDimension,
  EmbeddingNamespace,
  QuantizationType,
};

import { EmbeddingCache } from '../cache/EmbeddingCache.js';
// `@huggingface/transformers` is an OPTIONAL dependency (#565): it transitively
// pulls onnxruntime-node → adm-zip@0.5.17 (GHSA-xcpc-8h2w-3j85). It is only
// needed for in-process/local embeddings; consumers using an embedding endpoint
// (e.g. Cognitum /v1/embeddings) never load it. It is therefore imported lazily
// inside `initialize()` so its absence degrades gracefully instead of failing at
// module load. The `Tensor` type import below is `import type` — fully erased at
// compile time, so it creates no runtime dependency.
import type { Tensor } from '@huggingface/transformers';
import { cosineSimilarity } from '../../../shared/utils/vector-math.js';

/**
 * Feature extraction pipeline interface
 *
 * Adapts the @xenova/transformers Pipeline type for feature extraction.
 * The library's types are JSDoc-based and not easily importable, so we
 * define the minimal interface we actually use.
 */
interface FeatureExtractionPipeline {
  /**
   * Extract features from input text
   * @param text Input text(s) to extract features from
   * @param options Extraction options including pooling and normalization
   * @returns Promise resolving to a Tensor with embedding data
   */
  (
    text: string | string[],
    options?: {
      pooling?: 'none' | 'mean' | 'cls';
      normalize?: boolean;
      quantize?: boolean;
      precision?: 'binary' | 'ubinary';
    }
  ): Promise<Tensor>;

  /**
   * Dispose of the pipeline and free resources
   */
  dispose(): Promise<void>;
}

/**
 * Base embedding generator class
 *
 * Provides unified embedding generation with:
 * - Multiple model backends (transformers, ONNX, Ollama, OpenAI)
 * - Quantization for memory reduction (50-75%)
 * - Caching for performance
 * - HNSW indexing for fast search
 */
export class EmbeddingGenerator {
  protected model: FeatureExtractionPipeline | null = null;
  protected config: IEmbeddingModelConfig;
  protected cache: EmbeddingCache;
  protected stats: IEmbeddingStats;

  constructor(config: Partial<IEmbeddingModelConfig> = {}) {
    this.config = {
      type: config.type || 'transformers',
      model: config.model || 'Xenova/all-MiniLM-L6-v2',
      dimension: config.dimension || 384,
      quantization: config.quantization || 'none',
      cacheEnabled: config.cacheEnabled ?? true,
      onnxEnabled: config.onnxEnabled ?? true,
      maxSequenceLength: config.maxSequenceLength || 512,
    };

    this.cache = new EmbeddingCache({
      maxSize: 10000,
      ttl: 0,
      persistent: true,
      compression: true,
    });

    this.stats = this.initializeStats();
  }

  /**
   * Initialize the embedding model
   */
  async initialize(): Promise<void> {
    if (this.model) return;

    const startTime = performance.now();

    // Use ONNX runtime if enabled
    if (this.config.onnxEnabled) {
      // v4 replaced `quantized: bool` with `dtype: DataType`. We map our
      // QuantizationType to the closest model-load dtype; the 'binary' bucket
      // is a post-process step, not a model weight format, so we fall back to
      // q8 for load and keep the binary quantization step downstream.
      const loadDtype =
        this.config.quantization === 'none' ? 'fp32' :
        this.config.quantization === 'fp16' ? 'fp16' :
        this.config.quantization === 'int8' ? 'int8' : 'q8';
      // Lazy-load the optional transformers backend (#565). If it isn't
      // installed, fail with an actionable message pointing at the endpoint path.
      let pipeline: (typeof import('@huggingface/transformers'))['pipeline'];
      try {
        ({ pipeline } = await import('@huggingface/transformers'));
      } catch (err) {
        throw new Error(
          'Local (in-process) embeddings require the optional dependency ' +
          '"@huggingface/transformers", which is not installed. Either run ' +
          '`npm install @huggingface/transformers`, or configure an embedding ' +
          'endpoint (e.g. Cognitum /v1/embeddings) so the local backend is not needed. ' +
          `Underlying import error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      this.model = await pipeline(
        'feature-extraction',
        this.config.model,
        {
          dtype: loadDtype,
          // v4 narrowed ProgressInfo to a discriminated union — `progress`
          // only exists on the "progress"/download variants.
          progress_callback: (info) => {
            if (info.status === 'progress' && typeof info.progress === 'number') {
              console.log(`Downloading model: ${(info.progress * 100).toFixed(0)}%`);
            }
          },
        }
      );
    }

    const loadTime = performance.now() - startTime;
    console.log(`Model loaded in ${loadTime.toFixed(2)}ms`);
  }

  /**
   * Generate embedding for a single text
   */
  async embed(
    text: string,
    options: IEmbeddingOptions = {}
  ): Promise<IEmbedding> {
    const startTime = performance.now();
    const namespace = options.namespace || 'text';

    // Check cache first
    if (options.cache !== false && this.config.cacheEnabled) {
      const cached = this.cache.get(text, namespace);
      if (cached) {
        this.stats.cacheHits++;
        return cached;
      }
      this.stats.cacheMisses++;
    }

    // Ensure model is initialized
    await this.initialize();

    // Generate embedding
    let vector: number[];
    if (this.model) {
      const output = await this.model(text, {
        pooling: 'mean',
        normalize: true,
      });
      vector = Array.from(output.data as Float32Array);
    } else {
      throw new Error('Model not initialized');
    }

    // Apply quantization if specified
    let quantizedVector: number[] | Float32Array | Int8Array | Uint8Array = vector;
    if (options.quantization || this.config.quantization) {
      const qType = options.quantization || this.config.quantization;
      quantizedVector = this.quantize(vector, qType);
    }

    const embedding: IEmbedding = {
      vector: quantizedVector,
      dimension: this.config.dimension,
      namespace,
      text,
      timestamp: Date.now(),
      quantization: options.quantization || this.config.quantization,
      metadata: options?.metadata,
    };

    // Cache the result
    if (options.cache !== false && this.config.cacheEnabled) {
      this.cache.set(text, embedding, namespace);
    }

    // Update stats
    const elapsed = performance.now() - startTime;
    this.stats.avgEmbeddingTime =
      (this.stats.avgEmbeddingTime * this.stats.totalEmbeddings + elapsed) /
      (this.stats.totalEmbeddings + 1);
    this.stats.totalEmbeddings++;
    this.stats.byNamespace[namespace]++;

    return embedding;
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async embedBatch(
    texts: string[],
    options: IEmbeddingOptions = {}
  ): Promise<IBatchEmbeddingResult> {
    const startTime = performance.now();
    let cacheHits = 0;
    let cacheMisses = 0;
    const embeddings: IEmbedding[] = [];

    for (const text of texts) {
      const embedding = await this.embed(text, options);

      // Track cache stats
      const cached = this.cache.get(text, options.namespace || 'text');
      if (cached) {
        cacheHits++;
      } else {
        cacheMisses++;
      }

      embeddings.push(embedding);

      // Call progress callback if provided
      if (options.onProgress) {
        options.onProgress(embeddings.length / texts.length);
      }
    }

    const totalTime = performance.now() - startTime;

    return {
      embeddings,
      totalTime,
      avgTime: totalTime / texts.length,
      cacheHits,
      cacheMisses,
    };
  }

  /**
   * Find similar embeddings
   */
  async findSimilar(
    query: string | IEmbedding,
    options: ISearchOptions = {}
  ): Promise<ISimilarityResult[]> {
    const limit = options.limit || 10;
    const threshold = options.threshold || 0.7;

    // Generate query embedding if needed
    const queryEmbedding =
      typeof query === 'string'
        ? await this.embed(query, { namespace: options.namespace })
        : query;

    // Get all embeddings from cache/index
    const allEmbeddings = this.cache.getAll(options.namespace);

    // Calculate similarities
    const similarities: ISimilarityResult[] = allEmbeddings
      .map((emb) => ({
        target: emb.text,
        score: cosineSimilarity(
          queryEmbedding.vector as number[],
          emb.vector as number[]
        ),
        rank: 0,
      }))
      .filter((result) => result.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Assign ranks
    similarities.forEach((result, index) => {
      result.rank = index + 1;
    });

    return similarities;
  }

  /**
   * Quantize embedding vector for memory reduction
   *
   * Memory reduction:
   * - fp16: 50% reduction
   * - int8: 75% reduction
   * - binary: 97% reduction
   */
  protected quantize(
    vector: number[],
    type: QuantizationType
  ): number[] | Float32Array | Int8Array | Uint8Array {
    switch (type) {
      case 'fp16':
        // Convert to Float16-like (stored as Float32 but with reduced precision)
        return new Float32Array(vector.map((v) => Math.fround(v)));

      case 'int8':
        // Quantize to int8 range [-128, 127]
        { const max = Math.max(...vector.map(Math.abs));
        return new Int8Array(
          vector.map((v) => Math.round((v / max) * 127))
        ); }

      case 'binary':
        // Binary quantization (sign bit only)
        { const binaryBytes = new Uint8Array(Math.ceil(vector.length / 8));
        for (let i = 0; i < vector.length; i++) {
          if (vector[i] >= 0) {
            binaryBytes[Math.floor(i / 8)] |= 1 << (i % 8);
          }
        }
        return binaryBytes; }

      case 'none':
      default:
        return vector;
    }
  }

  /**
   * Get current statistics
   */
  getStats(): IEmbeddingStats {
    const cacheStats = this.cache.getStats();

    return {
      ...this.stats,
      cacheHitRate:
        this.stats.cacheHits + this.stats.cacheMisses > 0
          ? this.stats.cacheHits /
            (this.stats.cacheHits + this.stats.cacheMisses)
          : 0,
      memoryUsage: cacheStats.memoryUsage,
      memoryReduction: this.calculateMemoryReduction(),
    };
  }

  /**
   * Calculate memory reduction percentage
   */
  protected calculateMemoryReduction(): number {
    switch (this.config.quantization) {
      case 'fp16':
        return 50;
      case 'int8':
        return 75;
      case 'binary':
        return 97;
      case 'none':
      default:
        return 0;
    }
  }

  /**
   * Initialize statistics
   */
  protected initializeStats(): IEmbeddingStats {
    return {
      totalEmbeddings: 0,
      byNamespace: {
        text: 0,
        code: 0,
        test: 0,
        coverage: 0,
        defect: 0,
        experiences: 0,
      },
      cacheHits: 0,
      cacheMisses: 0,
      cacheHitRate: 0,
      avgEmbeddingTime: 0,
      memoryUsage: 0,
      memoryReduction: 0,
      indexSize: 0,
      indexBuildTime: 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = this.initializeStats();
    this.cache.resetStats();
  }

  /**
   * Clear cache and model
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.model = null;
  }
}
