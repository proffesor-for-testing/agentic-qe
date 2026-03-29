/**
 * R5: Modern Hopfield Networks — Associative Pattern Memory
 *
 * Exponential-capacity content-addressable memory for exact pattern recall.
 * Complements HNSW approximate nearest neighbor with exact retrieval:
 * - HNSW: "What patterns are similar?" (approximate)
 * - Hopfield: "Did we see exactly this pattern before?" (exact)
 *
 * Based on Ramsauer et al. 2020 "Hopfield Networks is All You Need".
 * TypeScript implementation; WASM upgrade path via @ruvector/hopfield-wasm.
 *
 * @module integrations/ruvector/hopfield-memory
 */

import { getRuVectorFeatureFlags } from './feature-flags.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the Hopfield associative memory
 */
export interface HopfieldConfig {
  /** Pattern dimension. Default: 128 */
  dimension: number;
  /** Inverse temperature beta controlling sharpness of retrieval. Higher = more exact. Default: 8.0 */
  beta: number;
  /** Maximum number of stored patterns. Default: 10000 */
  maxPatterns: number;
}

/**
 * A pattern stored in Hopfield memory with associated metadata
 */
export interface StoredPattern {
  /** The pattern vector */
  pattern: Float32Array;
  /** Associated metadata */
  metadata: Record<string, unknown>;
  /** Timestamp of storage */
  storedAt: number;
}

/**
 * Result of a Hopfield recall operation
 */
export interface RecallResult {
  /** Retrieved pattern (closest stored pattern) */
  pattern: Float32Array;
  /** Metadata associated with the retrieved pattern */
  metadata: Record<string, unknown>;
  /** Hopfield energy of the retrieval (lower = more confident) */
  energy: number;
  /** Cosine similarity between query and retrieved pattern */
  similarity: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_DIMENSION = 128;
const DEFAULT_BETA = 8.0;
const DEFAULT_MAX_PATTERNS = 10000;

// ============================================================================
// HopfieldMemory
// ============================================================================

/**
 * Modern Hopfield Network for associative pattern memory.
 *
 * Update rule: new_state = X * softmax(beta * X^T * query).
 * High beta (default 8.0) makes softmax approach argmax for exact recall.
 */
export class HopfieldMemory {
  private readonly dimension: number;
  private readonly beta: number;
  private readonly maxPatterns: number;
  private readonly patterns: StoredPattern[];

  constructor(config?: Partial<HopfieldConfig>) {
    this.dimension = config?.dimension ?? DEFAULT_DIMENSION;
    this.beta = config?.beta ?? DEFAULT_BETA;
    this.maxPatterns = config?.maxPatterns ?? DEFAULT_MAX_PATTERNS;
    this.patterns = [];

    if (this.dimension <= 0) {
      throw new Error(`Hopfield dimension must be positive, got ${this.dimension}`);
    }
    if (this.beta <= 0) {
      throw new Error(`Hopfield beta must be positive, got ${this.beta}`);
    }
    if (this.maxPatterns <= 0) {
      throw new Error(`Hopfield maxPatterns must be positive, got ${this.maxPatterns}`);
    }
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /** Store a pattern. L2-normalizes, validates dimension; evicts oldest if at capacity. */
  store(pattern: Float32Array, metadata?: Record<string, unknown>): void {
    this.assertEnabled();

    if (pattern.length !== this.dimension) {
      throw new Error(
        `Pattern dimension mismatch: expected ${this.dimension}, got ${pattern.length}`
      );
    }

    // Reject zero-magnitude vectors (would be unretrievable after normalization)
    const mag = this.dotProduct(pattern, pattern);
    if (mag === 0) {
      throw new Error('Cannot store zero-magnitude pattern in Hopfield memory');
    }

    // L2-normalize for consistent softmax attention weights
    const normalized = this.normalize(pattern);

    // Evict oldest if at capacity
    if (this.patterns.length >= this.maxPatterns) {
      this.patterns.shift();
    }

    this.patterns.push({
      pattern: normalized,
      metadata: metadata ?? {},
      storedAt: Date.now(),
    });
  }

  /**
   * Recall the closest stored pattern via softmax(beta * X^T * query).
   * Returns null if empty.
   *
   * Note: With normalized patterns and beta=8, softmax strongly concentrates
   * on the nearest pattern (argmax), making this equivalent to a single
   * Hopfield fixed-point iteration that converges immediately (Ramsauer 2020,
   * Theorem 3). Full iterative convergence is unnecessary at high beta.
   */
  recall(query: Float32Array): RecallResult | null {
    this.assertEnabled();

    if (query.length !== this.dimension) {
      throw new Error(
        `Query dimension mismatch: expected ${this.dimension}, got ${query.length}`
      );
    }

    if (this.patterns.length === 0) {
      return null;
    }

    // L2-normalize query for magnitude-invariant comparison
    const normalizedQuery = this.normalize(query);

    // Compute logits: beta * X^T * normalizedQuery
    const logits = new Float32Array(this.patterns.length);
    for (let i = 0; i < this.patterns.length; i++) {
      logits[i] = this.beta * this.dotProduct(this.patterns[i].pattern, normalizedQuery);
    }

    // Softmax to get attention weights
    const weights = this.softmax(logits);

    // Find the pattern with the highest attention weight
    let bestIdx = 0;
    let bestWeight = weights[0];
    for (let i = 1; i < weights.length; i++) {
      if (weights[i] > bestWeight) {
        bestWeight = weights[i];
        bestIdx = i;
      }
    }

    const matched = this.patterns[bestIdx];
    const energy = this.getEnergy(normalizedQuery);
    const similarity = this.cosineSimilarity(normalizedQuery, matched.pattern);

    return {
      pattern: new Float32Array(matched.pattern),
      metadata: { ...matched.metadata },
      energy,
      similarity,
    };
  }

  /** Recall multiple queries in batch. */
  batchRecall(queries: Float32Array[]): (RecallResult | null)[] {
    this.assertEnabled();
    return queries.map((q) => this.recall(q));
  }

  /** Get the number of stored patterns. */
  getPatternCount(): number {
    return this.patterns.length;
  }

  /** Remove all stored patterns. */
  clear(): void {
    this.patterns.length = 0;
  }

  /**
   * Hopfield energy: E = -lse(beta, X^T * state) + 0.5 * ||state||^2.
   * Lower energy = closer to a stored pattern. State is L2-normalized first.
   */
  getEnergy(state: Float32Array): number {
    if (state.length !== this.dimension) {
      throw new Error(
        `State dimension mismatch: expected ${this.dimension}, got ${state.length}`
      );
    }

    // L2-normalize state for consistent energy computation
    const normalizedState = this.normalize(state);

    if (this.patterns.length === 0) {
      // Only the quadratic term remains; normalized state has ||s||^2 = 1
      return 0.5 * this.dotProduct(normalizedState, normalizedState);
    }

    // Compute z_i = X^T * normalizedState (dot products with each stored pattern)
    const z = new Float32Array(this.patterns.length);
    for (let i = 0; i < this.patterns.length; i++) {
      z[i] = this.dotProduct(this.patterns[i].pattern, normalizedState);
    }

    // Numerically stable lse: (1/beta) * (max + log(sum(exp(beta*z_i - max))))
    const scaledZ = new Float32Array(this.patterns.length);
    let maxVal = -Infinity;
    for (let i = 0; i < this.patterns.length; i++) {
      scaledZ[i] = this.beta * z[i];
      if (scaledZ[i] > maxVal) maxVal = scaledZ[i];
    }

    let sumExp = 0;
    for (let i = 0; i < this.patterns.length; i++) {
      sumExp += Math.exp(scaledZ[i] - maxVal);
    }

    const lse = (1 / this.beta) * (maxVal + Math.log(sumExp));

    // E = -lse + 0.5 * ||normalizedState||^2
    const normSq = this.dotProduct(normalizedState, normalizedState);
    return -lse + 0.5 * normSq;
  }

  // --------------------------------------------------------------------------
  // Internal Helpers
  // --------------------------------------------------------------------------

  /** Numerically stable softmax: subtract max before exp to avoid overflow. */
  private softmax(logits: Float32Array): Float32Array {
    const result = new Float32Array(logits.length);

    // Find max for numerical stability
    let maxVal = -Infinity;
    for (let i = 0; i < logits.length; i++) {
      if (logits[i] > maxVal) maxVal = logits[i];
    }

    // Compute exp(x - max) and sum
    let sum = 0;
    for (let i = 0; i < logits.length; i++) {
      result[i] = Math.exp(logits[i] - maxVal);
      sum += result[i];
    }

    // Normalize
    if (sum > 0) {
      for (let i = 0; i < result.length; i++) {
        result[i] /= sum;
      }
    }

    return result;
  }

  /** Dot product of two Float32Arrays. */
  private dotProduct(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  /** Cosine similarity in [-1, 1]. */
  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    const dot = this.dotProduct(a, b);
    const normA = Math.sqrt(this.dotProduct(a, a));
    const normB = Math.sqrt(this.dotProduct(b, b));

    if (normA === 0 || normB === 0) return 0;
    return dot / (normA * normB);
  }

  /** L2 normalization. Returns unit-length copy (or zero vector if input is zero). */
  private normalize(v: Float32Array): Float32Array {
    const norm = Math.sqrt(this.dotProduct(v, v));
    const result = new Float32Array(v.length);
    if (norm > 0) {
      for (let i = 0; i < v.length; i++) {
        result[i] = v[i] / norm;
      }
    }
    return result;
  }

  /** Assert that the useHopfieldMemory feature flag is enabled. */
  private assertEnabled(): void {
    if (!getRuVectorFeatureFlags().useHopfieldMemory) {
      throw new Error('Hopfield memory is disabled (useHopfieldMemory feature flag is false)');
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/** Create a HopfieldMemory with the given configuration. */
export function createHopfieldMemory(
  config?: Partial<HopfieldConfig>
): HopfieldMemory {
  return new HopfieldMemory(config);
}
