/**
 * ONNX Embeddings Adapter - Hyperbolic Operations
 *
 * Operations in the Poincaré ball model of hyperbolic space.
 * Useful for hierarchical data and tree-like structures.
 *
 * @module onnx-embeddings/hyperbolic-ops
 */

import type { Embedding, HyperbolicConfig } from './types.js';
import { EmbeddingError, EmbeddingErrorType } from './types.js';

/**
 * Hyperbolic geometry operations in the Poincaré ball
 */
export class HyperbolicOps {
  private config: HyperbolicConfig;

  constructor(config: Partial<HyperbolicConfig> = {}) {
    this.config = {
      curvature: config.curvature ?? -1.0,
      epsilon: config.epsilon ?? 1e-7
    };

    if (this.config.curvature >= 0) {
      throw new EmbeddingError(
        EmbeddingErrorType.HYPERBOLIC_ERROR,
        'Curvature must be negative for hyperbolic space'
      );
    }
  }

  /**
   * Convert Euclidean embedding to Poincaré ball
   * Uses exponential map at origin
   */
  euclideanToPoincare(embedding: Embedding): Embedding {
    if (embedding.isHyperbolic) {
      return embedding; // Already hyperbolic
    }

    const vector = embedding.vector;
    const norm = this.norm(vector);

    if (norm < this.config.epsilon) {
      // Already at origin
      return {
        ...embedding,
        isHyperbolic: true
      };
    }

    const c = Math.abs(this.config.curvature);
    const sqrtC = Math.sqrt(c);

    // Exponential map: scale by tanh(sqrt(c) * ||v|| / 2) / (sqrt(c) * ||v||)
    const scale = Math.tanh(sqrtC * norm / 2) / (sqrtC * norm);
    const poincareVector = vector.map(val => val * scale);

    // Verify point is in ball (norm < 1)
    const poincareNorm = this.norm(poincareVector);
    if (poincareNorm >= 1 - this.config.epsilon) {
      throw new EmbeddingError(
        EmbeddingErrorType.HYPERBOLIC_ERROR,
        `Poincaré ball constraint violated: norm = ${poincareNorm}`
      );
    }

    return {
      vector: poincareVector,
      dimensions: embedding.dimensions,
      model: embedding.model,
      isHyperbolic: true
    };
  }

  /**
   * Convert Poincaré ball embedding to Euclidean
   * Uses logarithmic map at origin
   */
  poincareToEuclidean(embedding: Embedding): Embedding {
    if (!embedding.isHyperbolic) {
      return embedding; // Already Euclidean
    }

    const vector = embedding.vector;
    const norm = this.norm(vector);

    if (norm < this.config.epsilon) {
      // At origin
      return {
        ...embedding,
        isHyperbolic: false
      };
    }

    const c = Math.abs(this.config.curvature);
    const sqrtC = Math.sqrt(c);

    // Logarithmic map: scale by (2 / sqrt(c)) * artanh(sqrt(c) * ||v||) / ||v||
    const artanhArg = sqrtC * norm;
    if (artanhArg >= 1) {
      throw new EmbeddingError(
        EmbeddingErrorType.HYPERBOLIC_ERROR,
        'Point is on or outside Poincaré ball boundary'
      );
    }

    const scale = (2 / sqrtC) * Math.atanh(artanhArg) / norm;
    const euclideanVector = vector.map(val => val * scale);

    return {
      vector: euclideanVector,
      dimensions: embedding.dimensions,
      model: embedding.model,
      isHyperbolic: false
    };
  }

  /**
   * Calculate Poincaré distance between two points
   */
  distance(embedding1: Embedding, embedding2: Embedding): number {
    if (embedding1.dimensions !== embedding2.dimensions) {
      throw new EmbeddingError(
        EmbeddingErrorType.DIMENSION_MISMATCH,
        'Embeddings must have same dimensions'
      );
    }

    if (!embedding1.isHyperbolic || !embedding2.isHyperbolic) {
      throw new EmbeddingError(
        EmbeddingErrorType.HYPERBOLIC_ERROR,
        'Both embeddings must be in hyperbolic space'
      );
    }

    const v1 = embedding1.vector;
    const v2 = embedding2.vector;

    const c = Math.abs(this.config.curvature);
    const sqrtC = Math.sqrt(c);

    // Calculate squared norms
    const norm1Sq = this.normSquared(v1);
    const norm2Sq = this.normSquared(v2);

    // Calculate squared Euclidean distance
    const diffNormSq = this.euclideanDistanceSquared(v1, v2);

    // Poincaré distance formula: d = (1/sqrt(c)) * acosh(1 + 2 * ||u-v||^2 / ((1-||u||^2)(1-||v||^2)))
    const numerator = 2 * diffNormSq;
    const denominator = (1 - norm1Sq) * (1 - norm2Sq);

    if (denominator <= this.config.epsilon) {
      // Points are on or near the boundary
      return Infinity;
    }

    const ratio = numerator / denominator;
    const distance = Math.acosh(1 + ratio) / sqrtC;

    return distance;
  }

  /**
   * Calculate hyperbolic midpoint between two points
   * Uses the geodesic midpoint formula
   */
  midpoint(embedding1: Embedding, embedding2: Embedding): Embedding {
    if (embedding1.dimensions !== embedding2.dimensions) {
      throw new EmbeddingError(
        EmbeddingErrorType.DIMENSION_MISMATCH,
        'Embeddings must have same dimensions'
      );
    }

    if (!embedding1.isHyperbolic || !embedding2.isHyperbolic) {
      throw new EmbeddingError(
        EmbeddingErrorType.HYPERBOLIC_ERROR,
        'Both embeddings must be in hyperbolic space'
      );
    }

    const v1 = embedding1.vector;
    const v2 = embedding2.vector;

    // For simplicity, we use the Möbius addition at t=0.5
    // More accurate would be to follow the geodesic, but this is a good approximation
    const midpointVector = this.mobiusAddition(
      v1,
      this.mobiusScalarMultiply(this.mobiusAddition(this.mobiusNegate(v1), v2), 0.5)
    );

    return {
      vector: midpointVector,
      dimensions: embedding1.dimensions,
      model: embedding1.model,
      isHyperbolic: true
    };
  }

  /**
   * Möbius addition in Poincaré ball
   * u ⊕ v = ((1 + 2c⟨u,v⟩ + c||v||²)u + (1 - c||u||²)v) / (1 + 2c⟨u,v⟩ + c²||u||²||v||²)
   */
  private mobiusAddition(u: number[], v: number[]): number[] {
    const c = Math.abs(this.config.curvature);
    const dotProduct = this.dot(u, v);
    const uNormSq = this.normSquared(u);
    const vNormSq = this.normSquared(v);

    const numerator1Coeff = 1 + 2 * c * dotProduct + c * vNormSq;
    const numerator2Coeff = 1 - c * uNormSq;
    const denominator = 1 + 2 * c * dotProduct + c * c * uNormSq * vNormSq;

    if (Math.abs(denominator) < this.config.epsilon) {
      throw new EmbeddingError(
        EmbeddingErrorType.HYPERBOLIC_ERROR,
        'Möbius addition denominator is zero'
      );
    }

    const result = u.map((uVal, i) => (numerator1Coeff * uVal + numerator2Coeff * v[i]) / denominator);

    return result;
  }

  /**
   * Möbius scalar multiplication: r ⊗ v
   */
  private mobiusScalarMultiply(v: number[], r: number): number[] {
    const c = Math.abs(this.config.curvature);
    const sqrtC = Math.sqrt(c);
    const normV = this.norm(v);

    if (normV < this.config.epsilon) {
      return v; // Zero vector
    }

    const tanhArg = sqrtC * normV;
    if (Math.abs(tanhArg) >= 1) {
      throw new EmbeddingError(
        EmbeddingErrorType.HYPERBOLIC_ERROR,
        'Möbius scalar multiplication out of bounds'
      );
    }

    const scale = (Math.tanh(r * Math.atanh(tanhArg)) / (sqrtC * normV));
    return v.map(val => val * scale);
  }

  /**
   * Negate vector in Poincaré ball (just negate coordinates)
   */
  private mobiusNegate(v: number[]): number[] {
    return v.map(val => -val);
  }

  /**
   * Project vector onto Poincaré ball (ensure ||v|| < 1)
   */
  projectToBall(vector: number[]): number[] {
    const norm = this.norm(vector);
    if (norm >= 1 - this.config.epsilon) {
      // Scale to be just inside the ball
      const scale = (1 - this.config.epsilon) / norm;
      return vector.map(val => val * scale);
    }
    return vector;
  }

  /**
   * Calculate vector norm (L2 norm)
   */
  private norm(vector: number[]): number {
    return Math.sqrt(this.normSquared(vector));
  }

  /**
   * Calculate squared norm
   */
  private normSquared(vector: number[]): number {
    return vector.reduce((sum, val) => sum + val * val, 0);
  }

  /**
   * Calculate dot product
   */
  private dot(v1: number[], v2: number[]): number {
    return v1.reduce((sum, val, i) => sum + val * v2[i], 0);
  }

  /**
   * Calculate squared Euclidean distance
   */
  private euclideanDistanceSquared(v1: number[], v2: number[]): number {
    return v1.reduce((sum, val, i) => {
      const diff = val - v2[i];
      return sum + diff * diff;
    }, 0);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HyperbolicConfig>): void {
    if (config.curvature !== undefined && config.curvature >= 0) {
      throw new EmbeddingError(
        EmbeddingErrorType.HYPERBOLIC_ERROR,
        'Curvature must be negative'
      );
    }
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): HyperbolicConfig {
    return { ...this.config };
  }
}
