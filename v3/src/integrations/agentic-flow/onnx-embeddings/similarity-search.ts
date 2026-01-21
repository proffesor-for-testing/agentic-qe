/**
 * ONNX Embeddings Adapter - Similarity Search
 *
 * Semantic similarity search with multiple distance metrics.
 * Supports cosine similarity, Euclidean distance, and Poincaré distance.
 *
 * @module onnx-embeddings/similarity-search
 */

import type {
  Embedding,
  StoredEmbedding,
  SimilarityResult,
  SearchConfig
} from './types.js';
import { SimilarityMetric, EmbeddingError, EmbeddingErrorType } from './types.js';

/**
 * Performs semantic similarity search across stored embeddings
 */
export class SimilaritySearch {
  private embeddings: Map<string, StoredEmbedding>;
  private searchCount = 0;
  private searchTimes: number[] = [];

  constructor() {
    this.embeddings = new Map();
  }

  /**
   * Store an embedding for later search
   */
  store(embedding: StoredEmbedding): void {
    this.embeddings.set(embedding.id, embedding);
  }

  /**
   * Store multiple embeddings
   */
  storeBatch(embeddings: StoredEmbedding[]): void {
    for (const embedding of embeddings) {
      this.store(embedding);
    }
  }

  /**
   * Remove an embedding by ID
   */
  remove(id: string): boolean {
    return this.embeddings.delete(id);
  }

  /**
   * Clear all stored embeddings
   */
  clear(): void {
    this.embeddings.clear();
  }

  /**
   * Search for similar embeddings
   */
  async search(
    queryEmbedding: Embedding,
    config: Partial<SearchConfig> = {}
  ): Promise<SimilarityResult[]> {
    const startTime = Date.now();

    const searchConfig: SearchConfig = {
      metric: config.metric ?? SimilarityMetric.COSINE,
      topK: config.topK ?? 5,
      threshold: config.threshold ?? 0.5,
      namespace: config.namespace
    };

    try {
      // Filter by namespace if specified
      let candidates = Array.from(this.embeddings.values());
      if (searchConfig.namespace) {
        candidates = candidates.filter(e => e.namespace === searchConfig.namespace);
      }

      // Calculate similarities
      const results: Array<{ stored: StoredEmbedding; score: number }> = [];

      for (const stored of candidates) {
        // Check dimension compatibility
        if (stored.embedding.dimensions !== queryEmbedding.dimensions) {
          continue;
        }

        const score = this.calculateSimilarity(
          queryEmbedding.vector,
          stored.embedding.vector,
          searchConfig.metric
        );

        // Apply threshold (note: for distances, lower is better)
        const meetsThreshold = searchConfig.metric === 'cosine'
          ? score >= searchConfig.threshold
          : score <= searchConfig.threshold;

        if (meetsThreshold) {
          results.push({ stored, score });
        }
      }

      // Sort results
      // Cosine: higher is better, distances: lower is better
      const sortMultiplier = searchConfig.metric === 'cosine' ? -1 : 1;
      results.sort((a, b) => sortMultiplier * (a.score - b.score));

      // Take top K
      const topResults = results.slice(0, searchConfig.topK);

      // Convert to SimilarityResult
      const similarityResults: SimilarityResult[] = topResults.map(({ stored, score }) => ({
        text: stored.text,
        embedding: stored.embedding,
        score,
        metadata: stored.metadata
      }));

      // Track stats
      this.searchCount++;
      this.searchTimes.push(Date.now() - startTime);
      if (this.searchTimes.length > 100) {
        this.searchTimes.shift();
      }

      return similarityResults;
    } catch (error) {
      throw new EmbeddingError(
        EmbeddingErrorType.DIMENSION_MISMATCH,
        `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Find the most similar embedding
   */
  async findMostSimilar(
    queryEmbedding: Embedding,
    config: Partial<SearchConfig> = {}
  ): Promise<SimilarityResult | null> {
    const results = await this.search(queryEmbedding, { ...config, topK: 1 });
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Calculate similarity between two vectors
   */
  calculateSimilarity(
    vector1: number[],
    vector2: number[],
    metric: SimilarityMetric
  ): number {
    if (vector1.length !== vector2.length) {
      throw new EmbeddingError(
        EmbeddingErrorType.DIMENSION_MISMATCH,
        `Vector dimensions do not match: ${vector1.length} vs ${vector2.length}`
      );
    }

    switch (metric) {
      case 'cosine':
        return this.cosineSimilarity(vector1, vector2);
      case 'euclidean':
        return this.euclideanDistance(vector1, vector2);
      case 'poincare':
        return this.poincareDistance(vector1, vector2);
      default:
        throw new EmbeddingError(
          EmbeddingErrorType.INVALID_INPUT,
          `Unknown similarity metric: ${metric}`
        );
    }
  }

  /**
   * Get search statistics
   */
  getStats(): { searchCount: number; avgSearchTime: number; storedCount: number } {
    const avgTime = this.searchTimes.length > 0
      ? this.searchTimes.reduce((sum, t) => sum + t, 0) / this.searchTimes.length
      : 0;

    return {
      searchCount: this.searchCount,
      avgSearchTime: avgTime,
      storedCount: this.embeddings.size
    };
  }

  /**
   * Get all stored embeddings (optionally filtered by namespace)
   */
  getAll(namespace?: string): StoredEmbedding[] {
    const all = Array.from(this.embeddings.values());
    return namespace ? all.filter(e => e.namespace === namespace) : all;
  }

  /**
   * Get stored embedding by ID
   */
  get(id: string): StoredEmbedding | undefined {
    return this.embeddings.get(id);
  }

  /**
   * Calculate cosine similarity (range: [-1, 1], higher is more similar)
   */
  private cosineSimilarity(v1: number[], v2: number[]): number {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < v1.length; i++) {
      dotProduct += v1[i] * v2[i];
      norm1 += v1[i] * v1[i];
      norm2 += v2[i] * v2[i];
    }

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  /**
   * Calculate Euclidean distance (L2 norm, lower is more similar)
   */
  private euclideanDistance(v1: number[], v2: number[]): number {
    let sum = 0;
    for (let i = 0; i < v1.length; i++) {
      const diff = v1[i] - v2[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  /**
   * Calculate Poincaré distance in hyperbolic space
   * Uses the Poincaré ball model with curvature c = -1
   */
  private poincareDistance(v1: number[], v2: number[], curvature = -1): number {
    const c = Math.abs(curvature);
    const sqrtC = Math.sqrt(c);

    // Calculate squared norms
    const norm1Sq = v1.reduce((sum, val) => sum + val * val, 0);
    const norm2Sq = v2.reduce((sum, val) => sum + val * val, 0);

    // Calculate squared distance in Euclidean space
    let diffNormSq = 0;
    for (let i = 0; i < v1.length; i++) {
      const diff = v1[i] - v2[i];
      diffNormSq += diff * diff;
    }

    // Poincaré distance formula
    const numerator = 2 * diffNormSq;
    const denominator = (1 - norm1Sq) * (1 - norm2Sq);

    if (denominator <= 0) {
      // Points are on or outside the boundary
      return Infinity;
    }

    const ratio = numerator / denominator;
    const distance = Math.acosh(1 + ratio) / sqrtC;

    return distance;
  }

  /**
   * Batch search for multiple query embeddings
   */
  async searchBatch(
    queryEmbeddings: Embedding[],
    config: Partial<SearchConfig> = {}
  ): Promise<SimilarityResult[][]> {
    const results: SimilarityResult[][] = [];

    for (const query of queryEmbeddings) {
      const result = await this.search(query, config);
      results.push(result);
    }

    return results;
  }

  /**
   * Find embeddings within a certain distance/similarity threshold
   */
  async findInRadius(
    queryEmbedding: Embedding,
    radius: number,
    metric: SimilarityMetric = SimilarityMetric.COSINE
  ): Promise<SimilarityResult[]> {
    return this.search(queryEmbedding, {
      metric,
      threshold: radius,
      topK: this.embeddings.size // Return all within threshold
    });
  }
}
