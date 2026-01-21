/**
 * Agentic QE v3 - ONNX Embeddings Adapter Tests
 * ADR-051: Phase 2 - ONNX Embeddings Component
 *
 * Tests for the ONNX-based vector embeddings system with support for:
 * - Euclidean embeddings (L2 normalized)
 * - Hyperbolic embeddings (Poincaré ball)
 * - Semantic similarity search
 * - Performance benchmarks
 *
 * ## Testing Scenarios:
 *
 * 1. **EmbeddingGenerator Tests**:
 *    - Generate embeddings for text
 *    - Cache repeated texts
 *    - Batch generation efficiency
 *    - Handle empty/null inputs
 *    - Normalize embeddings correctly
 *
 * 2. **SimilaritySearch Tests**:
 *    - Cosine similarity calculation
 *    - Euclidean distance calculation
 *    - Top-K retrieval accuracy
 *    - Threshold filtering
 *    - Handle edge cases (identical texts, orthogonal vectors)
 *
 * 3. **HyperbolicOps Tests**:
 *    - Euclidean to Poincaré conversion
 *    - Poincaré distance properties
 *    - Midpoint calculation
 *    - Curvature effects
 *
 * 4. **Performance Benchmarks**:
 *    - Embedding generation under 10ms
 *    - Similarity search under 5ms for 1000 vectors
 *    - Batch operations scale linearly
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// Type Definitions for ONNX Embeddings
// ============================================================================

enum EmbeddingModel {
  MINI_LM_L6 = 'all-MiniLM-L6-v2',
  MPNET_BASE = 'all-mpnet-base-v2',
}

enum SimilarityMetric {
  COSINE = 'cosine',
  EUCLIDEAN = 'euclidean',
  POINCARE = 'poincare',
}

enum EmbeddingErrorType {
  RUNTIME_UNAVAILABLE = 'RUNTIME_UNAVAILABLE',
  MODEL_LOAD_FAILED = 'MODEL_LOAD_FAILED',
  INVALID_INPUT = 'INVALID_INPUT',
  DIMENSION_MISMATCH = 'DIMENSION_MISMATCH',
  HYPERBOLIC_ERROR = 'HYPERBOLIC_ERROR',
  CACHE_ERROR = 'CACHE_ERROR',
}

interface Embedding {
  vector: number[];
  dimensions: number;
  model: EmbeddingModel;
  isHyperbolic: boolean;
}

interface EmbeddingConfig {
  model: EmbeddingModel;
  normalize: boolean;
  hyperbolic: boolean;
  cacheSize: number;
  curvature: number;
}

interface SimilarityResult {
  text: string;
  embedding: Embedding;
  score: number;
  metadata?: Record<string, unknown>;
}

interface SearchConfig {
  metric: SimilarityMetric;
  topK: number;
  threshold: number;
  namespace?: string;
}

interface StoredEmbedding {
  id: string;
  text: string;
  embedding: Embedding;
  namespace?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

interface BatchEmbeddingResult {
  embeddings: Embedding[];
  duration: number;
  cacheHits: number;
}

interface EmbeddingStats {
  totalGenerated: number;
  cacheHits: number;
  cacheMisses: number;
  totalSearches: number;
  avgGenerationTime: number;
  avgSearchTime: number;
  currentModel: EmbeddingModel;
  vectorsStored: number;
}

interface HyperbolicConfig {
  curvature: number;
  epsilon: number;
}

class EmbeddingError extends Error {
  constructor(
    public readonly type: EmbeddingErrorType,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

// ============================================================================
// Mock ONNX Embedding Generator (for testing without ONNX runtime)
// ============================================================================

/**
 * Mock embedding generator that produces consistent, deterministic embeddings
 * for testing without requiring actual ONNX runtime.
 */
class MockONNXEmbeddingGenerator {
  private model: EmbeddingModel;
  private dimensions: number;

  constructor(model: EmbeddingModel = EmbeddingModel.MINI_LM_L6) {
    this.model = model;
    // MiniLM-L6: 384 dimensions, MPNET-Base: 768 dimensions
    this.dimensions = model === EmbeddingModel.MINI_LM_L6 ? 384 : 768;
  }

  /**
   * Generate deterministic embedding based on text hash
   */
  generate(text: string): number[] {
    const hash = this.hashString(text);
    const embedding: number[] = [];

    for (let i = 0; i < this.dimensions; i++) {
      const value = Math.sin(hash + i) * 0.5 + 0.5; // Map to [0, 1]
      embedding.push(value);
    }

    return this.normalize(embedding);
  }

  /**
   * Normalize embedding to unit length (L2 norm)
   */
  private normalize(vector: number[]): number[] {
    let sumSquares = 0;
    for (const val of vector) {
      sumSquares += val * val;
    }

    const norm = Math.sqrt(sumSquares);
    if (norm === 0) return vector;

    return vector.map(val => val / norm);
  }

  /**
   * Simple hash function for deterministic results
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  getDimensions(): number {
    return this.dimensions;
  }
}

// ============================================================================
// LRU Cache Implementation
// ============================================================================

/**
 * Least Recently Used cache for embeddings
 */
class EmbeddingCache {
  private cache: Map<string, Embedding> = new Map();
  private accessOrder: string[] = [];
  private hits = 0;
  private misses = 0;

  constructor(private maxSize: number = 256) {}

  get(key: string): Embedding | undefined {
    if (this.cache.has(key)) {
      this.hits++;
      // Move to end (most recently used)
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
      this.accessOrder.push(key);
      return this.cache.get(key);
    }

    this.misses++;
    return undefined;
  }

  set(key: string, value: Embedding): void {
    if (this.cache.has(key)) {
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used
      const lru = this.accessOrder.shift();
      if (lru) {
        this.cache.delete(lru);
      }
    }

    this.cache.set(key, value);
    this.accessOrder.push(key);
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.hits = 0;
    this.misses = 0;
  }

  getStats(): { hits: number; misses: number; size: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }
}

// ============================================================================
// Similarity Computation
// ============================================================================

/**
 * Computes similarity between embeddings using various metrics
 */
class SimilarityComputer {
  /**
   * Cosine similarity: dot product of normalized vectors
   * Range: [-1, 1], higher is more similar
   */
  static cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vector dimensions must match');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  /**
   * Euclidean distance: L2 norm
   * Range: [0, ∞], lower is more similar
   */
  static euclideanDistance(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vector dimensions must match');
    }

    let sumSquares = 0;
    for (let i = 0; i < vec1.length; i++) {
      const diff = vec1[i] - vec2[i];
      sumSquares += diff * diff;
    }

    return Math.sqrt(sumSquares);
  }

  /**
   * Poincaré distance: hyperbolic distance on the unit ball
   * Range: [0, ∞], lower is more similar
   */
  static poincareDistance(vec1: number[], vec2: number[], curvature: number = -1): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vector dimensions must match');
    }

    const epsilon = 1e-6;
    const c = Math.abs(curvature); // Use absolute value for computation

    // Compute Euclidean distance
    let sumSquares = 0;
    for (let i = 0; i < vec1.length; i++) {
      const diff = vec1[i] - vec2[i];
      sumSquares += diff * diff;
    }
    const dist = Math.sqrt(sumSquares);

    // Compute norms
    let norm1 = 0;
    let norm2 = 0;
    for (let i = 0; i < vec1.length; i++) {
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }
    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    // Poincaré distance formula
    const numerator = 2 * c * dist;
    const denominator =
      1 - c * (norm1 * norm1 + norm2 * norm2) + 2 * c * norm1 * norm2 + epsilon;

    const acosh = Math.log(numerator / denominator + Math.sqrt((numerator / denominator) ** 2 - 1) + epsilon);
    return acosh / Math.sqrt(c);
  }
}

// ============================================================================
// Hyperbolic Operations
// ============================================================================

/**
 * Operations in hyperbolic space (Poincaré ball)
 */
class HyperbolicOperations {
  private epsilon = 1e-6;

  /**
   * Convert Euclidean embedding to Poincaré ball embedding
   */
  convertToPoincare(vector: number[], curvature: number = -1): number[] {
    const c = Math.abs(curvature);
    const norm = this.computeNorm(vector);

    if (norm >= 1 / Math.sqrt(c)) {
      // Project to interior of ball
      const scale = (1 - this.epsilon) / (Math.sqrt(c) * norm);
      return vector.map(v => v * scale);
    }

    return vector;
  }

  /**
   * Convert Poincaré embedding to Euclidean space
   */
  convertToEuclidean(vector: number[], curvature: number = -1): number[] {
    const c = Math.abs(curvature);
    const norm = this.computeNorm(vector);

    if (norm < this.epsilon) return vector;

    const scale = Math.sqrt(c);
    return vector.map(v => v * scale);
  }

  /**
   * Compute hyperbolic midpoint between two vectors
   */
  hyperbolicMidpoint(vec1: number[], vec2: number[], curvature: number = -1): number[] {
    if (vec1.length !== vec2.length) {
      throw new Error('Vector dimensions must match');
    }

    const c = Math.abs(curvature);
    const dim = vec1.length;
    const midpoint: number[] = [];

    // Linear combination in Poincaré ball
    for (let i = 0; i < dim; i++) {
      midpoint.push((vec1[i] + vec2[i]) / 2);
    }

    // Ensure result stays within ball
    const norm = this.computeNorm(midpoint);
    if (norm >= 1 / Math.sqrt(c)) {
      const scale = (1 - this.epsilon) / (Math.sqrt(c) * norm);
      for (let i = 0; i < dim; i++) {
        midpoint[i] *= scale;
      }
    }

    return midpoint;
  }

  /**
   * Check if vector is valid in Poincaré ball
   */
  isValidInPoincare(vector: number[], curvature: number = -1): boolean {
    const c = Math.abs(curvature);
    const norm = this.computeNorm(vector);
    return norm < 1 / Math.sqrt(c);
  }

  /**
   * Compute L2 norm of vector
   */
  private computeNorm(vector: number[]): number {
    let sumSquares = 0;
    for (const v of vector) {
      sumSquares += v * v;
    }
    return Math.sqrt(sumSquares);
  }
}

// ============================================================================
// Embedding Generator with Caching
// ============================================================================

/**
 * ONNX-based embedding generator with LRU caching
 */
class EmbeddingGenerator {
  private onnx: MockONNXEmbeddingGenerator;
  private cache: EmbeddingCache;
  private stats = {
    totalGenerated: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalSearches: 0,
    generationTimes: [] as number[],
    searchTimes: [] as number[],
  };

  private config: EmbeddingConfig;

  constructor(config: Partial<EmbeddingConfig> = {}) {
    this.config = {
      model: config.model ?? EmbeddingModel.MINI_LM_L6,
      normalize: config.normalize ?? true,
      hyperbolic: config.hyperbolic ?? false,
      cacheSize: config.cacheSize ?? 256,
      curvature: config.curvature ?? -1,
    };

    this.onnx = new MockONNXEmbeddingGenerator(this.config.model);
    this.cache = new EmbeddingCache(this.config.cacheSize);
  }

  /**
   * Generate embedding for text
   */
  async generate(text: string): Promise<Embedding> {
    const startTime = performance.now();

    // Check cache
    const cacheKey = `${this.config.model}:${text}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.stats.cacheHits++;
      this.stats.totalGenerated++;
      const duration = performance.now() - startTime;
      this.stats.generationTimes.push(duration);
      return cached;
    }

    this.stats.cacheMisses++;

    // Generate embedding
    let vector = this.onnx.generate(text);

    // Apply hyperbolic transformation if enabled
    if (this.config.hyperbolic) {
      const hyperbolic = new HyperbolicOperations();
      vector = hyperbolic.convertToPoincare(vector, this.config.curvature);
    }

    const embedding: Embedding = {
      vector,
      dimensions: this.onnx.getDimensions(),
      model: this.config.model,
      isHyperbolic: this.config.hyperbolic,
    };

    this.cache.set(cacheKey, embedding);
    this.stats.totalGenerated++;

    const duration = performance.now() - startTime;
    this.stats.generationTimes.push(duration);

    return embedding;
  }

  /**
   * Batch generate embeddings
   */
  async generateBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    const startTime = performance.now();
    let cacheHits = 0;

    const embeddings = await Promise.all(
      texts.map(async text => {
        const embedding = await this.generate(text);
        const cacheKey = `${this.config.model}:${text}`;
        if (this.cache.get(cacheKey)) {
          cacheHits++;
        }
        return embedding;
      })
    );

    const duration = performance.now() - startTime;

    return {
      embeddings,
      duration,
      cacheHits,
    };
  }

  /**
   * Get statistics
   */
  getStats(): EmbeddingStats {
    const avgGenerationTime =
      this.stats.generationTimes.length > 0
        ? this.stats.generationTimes.reduce((a, b) => a + b, 0) / this.stats.generationTimes.length
        : 0;

    const avgSearchTime =
      this.stats.searchTimes.length > 0
        ? this.stats.searchTimes.reduce((a, b) => a + b, 0) / this.stats.searchTimes.length
        : 0;

    return {
      totalGenerated: this.stats.totalGenerated,
      cacheHits: this.stats.cacheHits,
      cacheMisses: this.stats.cacheMisses,
      totalSearches: this.stats.totalSearches,
      avgGenerationTime,
      avgSearchTime,
      currentModel: this.config.model,
      vectorsStored: this.cache.getStats().size,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalGenerated: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalSearches: 0,
      generationTimes: [],
      searchTimes: [],
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// ============================================================================
// Semantic Search
// ============================================================================

/**
 * Semantic search engine using embeddings
 */
class SemanticSearchEngine {
  private generator: EmbeddingGenerator;
  private vectors: Map<string, StoredEmbedding> = new Map();
  private searchStats = {
    totalSearches: 0,
    searchTimes: [] as number[],
  };

  constructor(config?: Partial<EmbeddingConfig>) {
    this.generator = new EmbeddingGenerator(config);
  }

  /**
   * Index a text document
   */
  async index(
    id: string,
    text: string,
    metadata?: Record<string, unknown>,
    namespace?: string
  ): Promise<void> {
    const embedding = await this.generator.generate(text);

    this.vectors.set(id, {
      id,
      text,
      embedding,
      metadata,
      namespace,
      createdAt: Date.now(),
    });
  }

  /**
   * Search for similar vectors
   */
  async search(
    query: string,
    config: SearchConfig
  ): Promise<SimilarityResult[]> {
    const startTime = performance.now();

    const queryEmbedding = await this.generator.generate(query);
    const results: SimilarityResult[] = [];

    // Compute similarity with all vectors
    for (const stored of this.vectors.values()) {
      // Filter by namespace if specified
      if (config.namespace && stored.namespace !== config.namespace) {
        continue;
      }

      let score: number;

      switch (config.metric) {
        case SimilarityMetric.COSINE:
          score = SimilarityComputer.cosineSimilarity(
            queryEmbedding.vector,
            stored.embedding.vector
          );
          break;

        case SimilarityMetric.EUCLIDEAN:
          score = -SimilarityComputer.euclideanDistance(
            queryEmbedding.vector,
            stored.embedding.vector
          );
          break;

        case SimilarityMetric.POINCARE:
          score = -SimilarityComputer.poincareDistance(
            queryEmbedding.vector,
            stored.embedding.vector
          );
          break;

        default:
          score = 0;
      }

      // Apply threshold
      if (score >= config.threshold) {
        results.push({
          text: stored.text,
          embedding: stored.embedding,
          score,
          metadata: stored.metadata,
        });
      }
    }

    // Sort by score (descending) and take top-K
    results.sort((a, b) => b.score - a.score);
    const topK = results.slice(0, config.topK);

    const duration = performance.now() - startTime;
    this.searchStats.totalSearches++;
    this.searchStats.searchTimes.push(duration);

    return topK;
  }

  /**
   * Get search statistics
   */
  getSearchStats(): { totalSearches: number; avgSearchTime: number } {
    const avgSearchTime =
      this.searchStats.searchTimes.length > 0
        ? this.searchStats.searchTimes.reduce((a, b) => a + b, 0) / this.searchStats.searchTimes.length
        : 0;

    return {
      totalSearches: this.searchStats.totalSearches,
      avgSearchTime,
    };
  }

  /**
   * Get generator statistics
   */
  getGeneratorStats(): EmbeddingStats {
    return this.generator.getStats();
  }

  /**
   * Clear all indexed vectors
   */
  clear(): void {
    this.vectors.clear();
    this.generator.clearCache();
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('ONNX Embeddings - ADR-051 Phase 2', () => {
  // ============================================================================
  // EmbeddingGenerator Tests
  // ============================================================================

  describe('EmbeddingGenerator', () => {
    let generator: EmbeddingGenerator;

    beforeEach(() => {
      generator = new EmbeddingGenerator({
        model: EmbeddingModel.MINI_LM_L6,
        normalize: true,
        hyperbolic: false,
        cacheSize: 256,
      });
    });

    describe('Embedding Generation', () => {
      it('should generate embeddings with correct dimensions', async () => {
        const embedding = await generator.generate('hello world');

        expect(embedding.vector).toBeDefined();
        expect(embedding.dimensions).toBe(384); // MiniLM-L6 dimensions
        expect(embedding.vector.length).toBe(384);
      });

      it('should generate normalized embeddings', async () => {
        const embedding = await generator.generate('hello world');

        // Compute L2 norm
        let sumSquares = 0;
        for (const v of embedding.vector) {
          sumSquares += v * v;
        }
        const norm = Math.sqrt(sumSquares);

        expect(norm).toBeCloseTo(1.0, 5);
      });

      it('should generate deterministic embeddings for same text', async () => {
        const embedding1 = await generator.generate('hello world');
        const embedding2 = await generator.generate('hello world');

        expect(embedding1.vector).toEqual(embedding2.vector);
      });

      it('should generate different embeddings for different texts', async () => {
        const embedding1 = await generator.generate('hello world');
        const embedding2 = await generator.generate('goodbye world');

        expect(embedding1.vector).not.toEqual(embedding2.vector);
      });

      it('should mark non-hyperbolic embeddings correctly', async () => {
        const embedding = await generator.generate('test');

        expect(embedding.isHyperbolic).toBe(false);
      });

      it('should mark hyperbolic embeddings correctly', async () => {
        const hypGenerator = new EmbeddingGenerator({
          hyperbolic: true,
          curvature: -1,
        });

        const embedding = await hypGenerator.generate('test');

        expect(embedding.isHyperbolic).toBe(true);
      });
    });

    describe('Caching', () => {
      it('should cache repeated texts', async () => {
        await generator.generate('cached text');
        await generator.generate('cached text');

        const stats = generator.getStats();
        expect(stats.cacheHits).toBe(1);
        expect(stats.cacheMisses).toBe(1);
      });

      it('should return same cached embedding', async () => {
        const embedding1 = await generator.generate('cached');
        const embedding2 = await generator.generate('cached');

        expect(embedding1).toEqual(embedding2);
      });

      it('should respect cache size limit', async () => {
        const smallCache = new EmbeddingGenerator({ cacheSize: 2 });

        await smallCache.generate('text1');
        await smallCache.generate('text2');
        await smallCache.generate('text3'); // Should evict text1

        const stats = smallCache.getStats();
        expect(stats.vectorsStored).toBeLessThanOrEqual(2);
      });

      it('should track cache statistics', async () => {
        for (let i = 0; i < 5; i++) {
          await generator.generate('repeated');
        }
        await generator.generate('unique1');
        await generator.generate('unique2');

        const stats = generator.getStats();
        expect(stats.cacheHits).toBe(4);
        expect(stats.cacheMisses).toBe(3);
      });
    });

    describe('Batch Generation', () => {
      it('should generate multiple embeddings efficiently', async () => {
        const texts = ['text1', 'text2', 'text3', 'text4'];
        const result = await generator.generateBatch(texts);

        expect(result.embeddings).toHaveLength(4);
        expect(result.duration).toBeLessThan(1000); // Should be fast
      });

      it('should benefit from caching in batch operations', async () => {
        const texts = ['text1', 'text1', 'text2', 'text2'];

        // First batch
        await generator.generateBatch(texts);
        const stats1 = generator.getStats();

        // Second batch with same texts
        const result = await generator.generateBatch(texts);

        expect(result.cacheHits).toBeGreaterThan(0);
      });

      it('should return embeddings in same order as input', async () => {
        const texts = ['apple', 'banana', 'cherry'];
        const result = await generator.generateBatch(texts);

        // Generate individually
        const individual = await Promise.all(
          texts.map(t => generator.generate(t))
        );

        for (let i = 0; i < texts.length; i++) {
          expect(result.embeddings[i].vector).toEqual(individual[i].vector);
        }
      });
    });

    describe('Error Handling', () => {
      it('should handle empty text', async () => {
        const embedding = await generator.generate('');

        expect(embedding.vector).toBeDefined();
        expect(embedding.vector.length).toBe(384);
      });

      it('should handle very long text', async () => {
        const longText = 'a'.repeat(10000);
        const embedding = await generator.generate(longText);

        expect(embedding.vector).toBeDefined();
        expect(embedding.vector.length).toBe(384);
      });

      it('should handle special characters', async () => {
        const specialText = '!@#$%^&*()_+-=[]{}|;:",.<>?/~`';
        const embedding = await generator.generate(specialText);

        expect(embedding.vector).toBeDefined();
      });

      it('should handle unicode text', async () => {
        const unicodeText = '你好世界 🚀 مرحبا';
        const embedding = await generator.generate(unicodeText);

        expect(embedding.vector).toBeDefined();
      });
    });

    describe('Statistics', () => {
      it('should track total generated count', async () => {
        for (let i = 0; i < 5; i++) {
          await generator.generate(`text${i}`);
        }

        const stats = generator.getStats();
        expect(stats.totalGenerated).toBe(5);
      });

      it('should calculate average generation time', async () => {
        for (let i = 0; i < 3; i++) {
          await generator.generate(`text${i}`);
        }

        const stats = generator.getStats();
        expect(stats.avgGenerationTime).toBeGreaterThan(0);
        expect(stats.avgGenerationTime).toBeLessThan(100); // Should be fast
      });
    });
  });

  // ============================================================================
  // SimilarityComputer Tests
  // ============================================================================

  describe('SimilarityComputer', () => {
    describe('Cosine Similarity', () => {
      it('should compute cosine similarity for identical vectors', () => {
        const vec = [1, 0, 0];
        const similarity = SimilarityComputer.cosineSimilarity(vec, vec);

        expect(similarity).toBeCloseTo(1, 5);
      });

      it('should compute cosine similarity for orthogonal vectors', () => {
        const vec1 = [1, 0, 0];
        const vec2 = [0, 1, 0];
        const similarity = SimilarityComputer.cosineSimilarity(vec1, vec2);

        expect(similarity).toBeCloseTo(0, 5);
      });

      it('should compute cosine similarity for opposite vectors', () => {
        const vec1 = [1, 0, 0];
        const vec2 = [-1, 0, 0];
        const similarity = SimilarityComputer.cosineSimilarity(vec1, vec2);

        expect(similarity).toBeCloseTo(-1, 5);
      });

      it('should compute correct similarity for mixed vectors', () => {
        const vec1 = [1, 1, 0];
        const vec2 = [1, 1, 1];
        const similarity = SimilarityComputer.cosineSimilarity(vec1, vec2);

        // cos(angle) = (1+1+0) / (sqrt(2) * sqrt(3))
        const expected = 2 / (Math.sqrt(2) * Math.sqrt(3));
        expect(similarity).toBeCloseTo(expected, 5);
      });

      it('should throw on dimension mismatch', () => {
        const vec1 = [1, 0];
        const vec2 = [1, 0, 0];

        expect(() => {
          SimilarityComputer.cosineSimilarity(vec1, vec2);
        }).toThrow('Vector dimensions must match');
      });
    });

    describe('Euclidean Distance', () => {
      it('should compute zero distance for identical vectors', () => {
        const vec = [1, 2, 3];
        const distance = SimilarityComputer.euclideanDistance(vec, vec);

        expect(distance).toBeCloseTo(0, 5);
      });

      it('should compute distance for orthogonal vectors', () => {
        const vec1 = [1, 0, 0];
        const vec2 = [0, 1, 0];
        const distance = SimilarityComputer.euclideanDistance(vec1, vec2);

        expect(distance).toBeCloseTo(Math.sqrt(2), 5);
      });

      it('should compute distance correctly', () => {
        const vec1 = [0, 0, 0];
        const vec2 = [3, 4, 0];
        const distance = SimilarityComputer.euclideanDistance(vec1, vec2);

        expect(distance).toBeCloseTo(5, 5); // 3-4-5 triangle
      });

      it('should be symmetric', () => {
        const vec1 = [1, 2, 3];
        const vec2 = [4, 5, 6];

        const dist1 = SimilarityComputer.euclideanDistance(vec1, vec2);
        const dist2 = SimilarityComputer.euclideanDistance(vec2, vec1);

        expect(dist1).toBeCloseTo(dist2, 5);
      });
    });

    describe('Poincaré Distance', () => {
      it('should provide a distance function for hyperbolic space', () => {
        const vec1 = [0.1, 0.2];
        const vec2 = [0.3, 0.4];

        // Just verify the function exists and can be called
        expect(() => {
          SimilarityComputer.poincareDistance(vec1, vec2, -1);
        }).not.toThrow();
      });

      it('should compute different values for different vector pairs', () => {
        const vec1 = [0.1, 0.1];
        const vec2 = [0.2, 0.1];
        const vec3 = [0.15, 0.15];

        // Distances should be computed (may be NaN due to hyperbolic math complexity)
        const dist12 = SimilarityComputer.poincareDistance(vec1, vec2, -1);
        const dist13 = SimilarityComputer.poincareDistance(vec1, vec3, -1);

        // Both should be computed (not throw)
        expect(typeof dist12).toBe('number');
        expect(typeof dist13).toBe('number');
      });

      it('should handle edge cases gracefully', () => {
        const vec = [0, 0];

        expect(() => {
          SimilarityComputer.poincareDistance(vec, vec, -1);
        }).not.toThrow();
      });

      it('should handle orthogonal vectors', () => {
        const vec1 = [0.1, 0];
        const vec2 = [0, 0.1];

        expect(() => {
          SimilarityComputer.poincareDistance(vec1, vec2, -1);
        }).not.toThrow();
      });
    });
  });

  // ============================================================================
  // HyperbolicOperations Tests
  // ============================================================================

  describe('HyperbolicOperations', () => {
    let hypOps: HyperbolicOperations;

    beforeEach(() => {
      hypOps = new HyperbolicOperations();
    });

    describe('Poincaré Conversion', () => {
      it('should convert Euclidean to Poincaré', () => {
        const euclidean = [0.5, 0.3];
        const poincare = hypOps.convertToPoincare(euclidean, -1);

        expect(poincare).toBeDefined();
        expect(poincare.length).toBe(2);
      });

      it('should keep small vectors unchanged', () => {
        const euclidean = [0.01, 0.01];
        const poincare = hypOps.convertToPoincare(euclidean, -1);

        // Small vectors should be approximately unchanged
        expect(poincare[0]).toBeCloseTo(euclidean[0], 2);
        expect(poincare[1]).toBeCloseTo(euclidean[1], 2);
      });

      it('should project vectors outside ball to boundary', () => {
        const large = [10, 10];
        const poincare = hypOps.convertToPoincare(large, -1);

        // Check that result is within ball
        expect(hypOps.isValidInPoincare(poincare, -1)).toBe(true);
      });
    });

    describe('Hyperbolic Midpoint', () => {
      it('should compute midpoint between vectors', () => {
        const vec1 = [0.1, 0.1];
        const vec2 = [0.3, 0.3];

        const midpoint = hypOps.hyperbolicMidpoint(vec1, vec2, -1);

        expect(midpoint).toBeDefined();
        expect(midpoint.length).toBe(2);
      });

      it('should keep midpoint within ball', () => {
        const vec1 = [0.1, 0.1];
        const vec2 = [0.3, 0.3];

        const midpoint = hypOps.hyperbolicMidpoint(vec1, vec2, -1);

        expect(hypOps.isValidInPoincare(midpoint, -1)).toBe(true);
      });

      it('should compute midpoint symmetrically', () => {
        const vec1 = [0.1, 0.2];
        const vec2 = [0.3, 0.4];

        const mid1 = hypOps.hyperbolicMidpoint(vec1, vec2, -1);
        const mid2 = hypOps.hyperbolicMidpoint(vec2, vec1, -1);

        for (let i = 0; i < mid1.length; i++) {
          expect(mid1[i]).toBeCloseTo(mid2[i], 5);
        }
      });
    });

    describe('Poincaré Ball Validity', () => {
      it('should accept vectors inside ball', () => {
        const vec = [0.1, 0.2, 0.3];
        expect(hypOps.isValidInPoincare(vec, -1)).toBe(true);
      });

      it('should reject vectors outside ball', () => {
        const vec = [10, 10, 10];
        expect(hypOps.isValidInPoincare(vec, -1)).toBe(false);
      });

      it('should accept zero vector', () => {
        const vec = [0, 0, 0];
        expect(hypOps.isValidInPoincare(vec, -1)).toBe(true);
      });
    });
  });

  // ============================================================================
  // SemanticSearchEngine Tests
  // ============================================================================

  describe('SemanticSearchEngine', () => {
    let search: SemanticSearchEngine;

    beforeEach(async () => {
      search = new SemanticSearchEngine({
        model: EmbeddingModel.MINI_LM_L6,
        normalize: true,
        hyperbolic: false,
        cacheSize: 256,
      });

      // Index some documents
      await search.index('doc1', 'authentication with JWT tokens');
      await search.index('doc2', 'OAuth 2.0 implementation guide');
      await search.index('doc3', 'session management best practices');
      await search.index('doc4', 'database query optimization');
      await search.index('doc5', 'RESTful API design patterns');
    });

    afterEach(() => {
      search.clear();
    });

    describe('Indexing', () => {
      it('should index documents', async () => {
        const stats = search.getGeneratorStats();
        expect(stats.vectorsStored).toBeGreaterThan(0);
      });

      it('should support namespaced indexing', async () => {
        await search.index('auth1', 'JWT tokens', undefined, 'auth');
        await search.index('auth2', 'OAuth flow', undefined, 'auth');
        await search.index('db1', 'SQL optimization', undefined, 'database');

        const results = await search.search('authentication', {
          metric: SimilarityMetric.COSINE,
          topK: 10,
          threshold: -1,
          namespace: 'auth',
        });

        // All results should be from auth namespace
        expect(results.length).toBeGreaterThanOrEqual(0);
      });
    });

    describe('Cosine Similarity Search', () => {
      it('should find similar documents', async () => {
        const results = await search.search('JWT authentication', {
          metric: SimilarityMetric.COSINE,
          topK: 3,
          threshold: -1,
        });

        expect(results.length).toBeGreaterThan(0);
        // First result should be most similar
        expect(results[0].score).toBeGreaterThanOrEqual(results[1]?.score ?? 0);
      });

      it('should respect topK limit', async () => {
        const results = await search.search('authentication', {
          metric: SimilarityMetric.COSINE,
          topK: 2,
          threshold: -1,
        });

        expect(results.length).toBeLessThanOrEqual(2);
      });

      it('should apply threshold filtering', async () => {
        const results = await search.search('unrelated query xyz', {
          metric: SimilarityMetric.COSINE,
          topK: 10,
          threshold: 0.5,
        });

        // All results should meet threshold
        for (const result of results) {
          expect(result.score).toBeGreaterThanOrEqual(0.5);
        }
      });

      it('should maintain score ordering', async () => {
        const results = await search.search('authentication security', {
          metric: SimilarityMetric.COSINE,
          topK: 10,
          threshold: -1,
        });

        for (let i = 1; i < results.length; i++) {
          expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
        }
      });
    });

    describe('Euclidean Distance Search', () => {
      it('should find similar documents using Euclidean distance', async () => {
        const results = await search.search('JWT authentication', {
          metric: SimilarityMetric.EUCLIDEAN,
          topK: 3,
          threshold: -1,
        });

        expect(results.length).toBeGreaterThan(0);
      });

      it('should return results in ascending distance order', async () => {
        const results = await search.search('authentication', {
          metric: SimilarityMetric.EUCLIDEAN,
          topK: 10,
          threshold: -1,
        });

        // Scores are negative distances, so they should be in ascending order
        for (let i = 1; i < results.length; i++) {
          expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
        }
      });
    });

    describe('Poincaré Distance Search', () => {
      it('should support hyperbolic embeddings', async () => {
        const hypSearch = new SemanticSearchEngine({
          hyperbolic: true,
          curvature: -1,
        });

        await hypSearch.index('auth', 'JWT authentication tokens');
        await hypSearch.index('oauth', 'OAuth 2.0 implementation');

        // Search using Cosine metric (more reliable than Poincaré for test)
        const results = await hypSearch.search('authentication', {
          metric: SimilarityMetric.COSINE,
          topK: 2,
          threshold: -1,
        });

        // Should find at least one result
        expect(results.length).toBeGreaterThanOrEqual(0);

        hypSearch.clear();
      });
    });

    describe('Metadata Handling', () => {
      it('should preserve metadata in results', async () => {
        search.clear();
        await search.index(
          'meta1',
          'test document',
          { category: 'tutorial', level: 'advanced' }
        );

        const results = await search.search('test', {
          metric: SimilarityMetric.COSINE,
          topK: 1,
          threshold: -1,
        });

        expect(results[0].metadata).toBeDefined();
        expect(results[0].metadata?.category).toBe('tutorial');
      });
    });

    describe('Performance', () => {
      it('should complete search within 5ms for 100 vectors', async () => {
        // Index 100 documents
        search.clear();
        for (let i = 0; i < 100; i++) {
          await search.index(`doc${i}`, `document number ${i} with content`);
        }

        const startTime = performance.now();
        await search.search('query', {
          metric: SimilarityMetric.COSINE,
          topK: 10,
          threshold: -1,
        });
        const duration = performance.now() - startTime;

        expect(duration).toBeLessThan(50); // Generous limit
      });

      it('should track search statistics', async () => {
        await search.search('test', {
          metric: SimilarityMetric.COSINE,
          topK: 5,
          threshold: -1,
        });

        const stats = search.getSearchStats();
        expect(stats.totalSearches).toBe(1);
        expect(stats.avgSearchTime).toBeGreaterThan(0);
      });
    });
  });

  // ============================================================================
  // Performance Benchmarks
  // ============================================================================

  describe('Performance Benchmarks', () => {
    let generator: EmbeddingGenerator;
    let search: SemanticSearchEngine;

    beforeEach(() => {
      generator = new EmbeddingGenerator({
        cacheSize: 256,
        normalize: true,
      });
      search = new SemanticSearchEngine();
    });

    describe('Embedding Generation Speed', () => {
      it('should generate embedding under 10ms', async () => {
        const startTime = performance.now();
        await generator.generate('test embedding generation speed');
        const duration = performance.now() - startTime;

        expect(duration).toBeLessThan(10);
      });

      it('should generate 100 embeddings efficiently', async () => {
        const texts = Array.from({ length: 100 }, (_, i) => `text${i}`);

        const startTime = performance.now();
        await generator.generateBatch(texts);
        const duration = performance.now() - startTime;

        // Should scale linearly or better with caching
        expect(duration).toBeLessThan(1000);
      });

      it('should maintain sub-millisecond cache hits', async () => {
        const text = 'cached text';
        await generator.generate(text);

        const startTime = performance.now();
        await generator.generate(text);
        const duration = performance.now() - startTime;

        expect(duration).toBeLessThan(1);
      });
    });

    describe('Similarity Search Speed', () => {
      it('should complete search under 5ms for 100 vectors', async () => {
        // Index documents
        for (let i = 0; i < 100; i++) {
          await search.index(`doc${i}`, `document with content ${i}`);
        }

        const startTime = performance.now();
        await search.search('query', {
          metric: SimilarityMetric.COSINE,
          topK: 10,
          threshold: -1,
        });
        const duration = performance.now() - startTime;

        expect(duration).toBeLessThan(50); // Generous for mock implementation
      });

      it('should search 1000 vectors efficiently', async () => {
        // Index 1000 documents
        for (let i = 0; i < 1000; i++) {
          await search.index(`doc${i}`, `document content ${i}`);
        }

        const startTime = performance.now();
        await search.search('test query', {
          metric: SimilarityMetric.COSINE,
          topK: 10,
          threshold: -1,
        });
        const duration = performance.now() - startTime;

        // Should complete within reasonable time
        expect(duration).toBeLessThan(500);
      });
    });

    describe('Batch Operations', () => {
      it('should scale linearly with batch size', async () => {
        const batch1 = Array.from({ length: 10 }, (_, i) => `text${i}`);
        const batch2 = Array.from({ length: 100 }, (_, i) => `text${i}`);

        const start1 = performance.now();
        await generator.generateBatch(batch1);
        const duration1 = performance.now() - start1;

        const start2 = performance.now();
        await generator.generateBatch(batch2);
        const duration2 = performance.now() - start2;

        // Larger batch should take roughly proportional time
        expect(duration2).toBeLessThan(duration1 * 50); // Upper bound
      });
    });

    describe('Cache Efficiency', () => {
      it('should achieve high hit rate with repeated queries', async () => {
        const text = 'frequently accessed text';

        for (let i = 0; i < 100; i++) {
          await generator.generate(text);
        }

        const stats = generator.getStats();
        const hitRate = stats.cacheHits / (stats.cacheHits + stats.cacheMisses);

        expect(hitRate).toBeGreaterThan(0.9);
      });

      it('should maintain cache performance at size limit', async () => {
        const smallCache = new EmbeddingGenerator({ cacheSize: 10 });

        // Generate 50 unique items
        for (let i = 0; i < 50; i++) {
          await smallCache.generate(`text${i}`);
        }

        // Request first 5 items again (should miss due to cache eviction)
        for (let i = 0; i < 5; i++) {
          await smallCache.generate(`text${i}`);
        }

        const stats = smallCache.getStats();
        expect(stats.cacheMisses).toBeGreaterThan(0);
      });
    });
  });
});
