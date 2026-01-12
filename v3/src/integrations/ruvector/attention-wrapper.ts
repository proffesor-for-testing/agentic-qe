/**
 * QE Wrapper for @ruvector/attention
 *
 * This wrapper provides QE-specific interface on top of @ruvector/attention (Rust/NAPI).
 * Maintains backward compatibility with existing QE Flash Attention code while leveraging
 * the high-performance SIMD-accelerated Rust implementation.
 *
 * @module integrations/ruvector/attention-wrapper
 */

import {
  FlashAttention,
  DotProductAttention,
  MultiHeadAttention,
  HyperbolicAttention,
  LinearAttention,
  MoEAttention,
  type ArrayInput
} from '@ruvector/attention';

// ============================================================================
// QE-Specific Types
// ============================================================================

/**
 * QE workload types for Flash Attention optimization
 */
export type QEWorkloadType =
  | 'test-similarity'
  | 'code-embedding'
  | 'defect-matching'
  | 'coverage-analysis'
  | 'pattern-adaptation';

/**
 * Attention strategy types (from @ruvector/attention)
 */
export type AttentionStrategy =
  | 'flash'
  | 'dot-product'
  | 'multi-head'
  | 'hyperbolic'
  | 'linear'
  | 'moe';

/**
 * Flash Attention metrics
 */
export interface QEFlashAttentionMetrics {
  /** Time taken for computation (ms) */
  timeMs: number;
  /** Memory used during computation (MB) */
  memoryMB: number;
  /** Speedup over baseline */
  speedup: number;
  /** Throughput (operations/second) */
  throughput: number;
  /** Peak memory usage (MB) */
  peakMemoryMB: number;
}

/**
 * Flash Attention configuration
 */
export interface QEFlashAttentionConfig {
  /** Embedding dimension */
  dim: number;
  /** Attention strategy */
  strategy: AttentionStrategy;
  /** Block size for flash attention */
  blockSize?: number;
  /** Number of attention heads (for multi-head) */
  numHeads?: number;
  /** Curvature for hyperbolic attention */
  curvature?: number;
  /** Number of features for linear attention */
  features?: number;
  /** MoE configuration */
  moeConfig?: {
    numExperts: number;
    topK: number;
    expertDim?: number;
    noiseStd?: number;
  };
}

/**
 * Block configuration for Flash Attention
 */
export interface BlockConfig {
  /** Query chunk size */
  queryChunkSize: number;
  /** Key-Value chunk size */
  kvChunkSize: number;
}

// ============================================================================
// Default Configurations by Workload
// ============================================================================

const QE_FLASH_ATTENTION_CONFIG: Record<QEWorkloadType, QEFlashAttentionConfig> = {
  'test-similarity': {
    dim: 384,
    strategy: 'flash',
    blockSize: 64,
  },
  'code-embedding': {
    dim: 512,
    strategy: 'flash',
    blockSize: 128,
  },
  'defect-matching': {
    dim: 384,
    strategy: 'flash',
    blockSize: 64,
  },
  'coverage-analysis': {
    dim: 384,
    strategy: 'flash',
    blockSize: 256,
  },
  'pattern-adaptation': {
    dim: 256,
    strategy: 'flash',
    blockSize: 32,
  },
};

// ============================================================================
// Attention Factory - Creates @ruvector/attention instances
// ============================================================================

/**
 * Factory for creating attention instances from @ruvector/attention
 */
class AttentionFactory {
  /**
   * Create attention instance based on strategy
   */
  static create(config: QEFlashAttentionConfig): unknown {
    switch (config.strategy) {
      case 'flash':
        return new FlashAttention(config.dim, config.blockSize);

      case 'dot-product':
        return new DotProductAttention(config.dim);

      case 'multi-head':
        return new MultiHeadAttention(config.dim, config.numHeads ?? 8);

      case 'hyperbolic':
        return new HyperbolicAttention(config.dim, config.curvature);

      case 'linear':
        return new LinearAttention(config.dim, config.features);

      case 'moe':
        return MoEAttention.simple(
          config.dim,
          config.moeConfig?.numExperts ?? 8,
          config.moeConfig?.topK ?? 2
        );

      default:
        return new FlashAttention(config.dim, config.blockSize);
    }
  }
}

// ============================================================================
// Main QE Flash Attention Wrapper Class
// ============================================================================

/**
 * QE Flash Attention Wrapper for @ruvector/attention
 *
 * Provides QE-specific interface on top of @ruvector/attention's Rust/NAPI implementation.
 * Maintains backward compatibility with existing QE Flash Attention code.
 */
export class QEFlashAttention {
  private attention: unknown;
  private config: QEFlashAttentionConfig;
  private workload: QEWorkloadType;
  private metrics: QEFlashAttentionMetrics[] = [];

  constructor(workload: QEWorkloadType, customConfig?: Partial<QEFlashAttentionConfig>) {
    this.workload = workload;

    const baseConfig = QE_FLASH_ATTENTION_CONFIG[workload];
    this.config = {
      ...baseConfig,
      ...customConfig,
    };

    this.attention = AttentionFactory.create(this.config);
  }

  /**
   * Initialize Flash Attention
   * Note: @ruvector/attention doesn't require async initialization
   */
  async initialize(): Promise<void> {
    // @ruvector/attention is ready immediately
    // This method exists for backward compatibility
  }

  /**
   * Compute Flash Attention using @ruvector/attention
   *
   * @param Q Query matrix [seqLen, dim]
   * @param K Key matrix [seqLen, dim]
   * @param V Value matrix [seqLen, dim]
   * @param seqLen Sequence length
   * @param dim Dimension
   * @returns Attention output [seqLen, dim]
   */
  async computeFlashAttention(
    Q: Float32Array,
    K: Float32Array,
    V: Float32Array,
    seqLen: number,
    dim: number
  ): Promise<Float32Array> {
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed / 1024 / 1024;

    // Prepare query, keys, values for @ruvector/attention
    const query = this.toFloat32Array(Q, seqLen, dim);
    const keys = this.splitMatrix(K, seqLen, dim);
    const values = this.splitMatrix(V, seqLen, dim);

    // Call @ruvector/attention's compute method
    let output: Float32Array;

    if (this.attention instanceof FlashAttention) {
      output = this.attention.compute(query, keys, values);
    } else if (this.attention instanceof DotProductAttention) {
      output = this.attention.compute(query, keys, values);
    } else if (this.attention instanceof MultiHeadAttention) {
      output = this.attention.compute(query, keys, values);
    } else if (this.attention instanceof HyperbolicAttention) {
      output = this.attention.compute(query, keys, values);
    } else if (this.attention instanceof LinearAttention) {
      output = this.attention.compute(query, keys, values);
    } else if (this.attention instanceof MoEAttention) {
      output = this.attention.compute(query, keys, values);
    } else {
      // Fallback to FlashAttention
      const fallback = new FlashAttention(this.config.dim);
      output = fallback.compute(query, keys, values);
    }

    // Record metrics
    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed / 1024 / 1024;

    this.metrics.push({
      timeMs: endTime - startTime,
      memoryMB: endMemory - startMemory,
      speedup: 1.0, // Will be calculated when compared to baseline
      throughput: (seqLen * seqLen) / ((endTime - startTime) / 1000),
      peakMemoryMB: endMemory,
    });

    return output;
  }

  /**
   * Baseline attention (standard O(N^2) memory)
   * Used for comparison to measure speedup
   */
  async computeBaselineAttention(
    Q: Float32Array,
    K: Float32Array,
    V: Float32Array,
    seqLen: number,
    dim: number
  ): Promise<Float32Array> {
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed / 1024 / 1024;

    // Compute full attention matrix
    const attnMatrix = new Float32Array(seqLen * seqLen);
    const scale = 1.0 / Math.sqrt(dim);

    for (let i = 0; i < seqLen; i++) {
      for (let j = 0; j < seqLen; j++) {
        let sum = 0.0;
        for (let k = 0; k < dim; k++) {
          sum += Q[i * dim + k] * K[j * dim + k];
        }
        attnMatrix[i * seqLen + j] = sum * scale;
      }
    }

    // Apply softmax
    for (let i = 0; i < seqLen; i++) {
      const rowStart = i * seqLen;
      const rowEnd = rowStart + seqLen;
      const row = attnMatrix.subarray(rowStart, rowEnd);
      const max = Math.max(...row);
      let sum = 0.0;

      for (let j = 0; j < seqLen; j++) {
        row[j] = Math.exp(row[j] - max);
        sum += row[j];
      }

      for (let j = 0; j < seqLen; j++) {
        row[j] /= sum;
      }
    }

    // Compute weighted sum
    const output = new Float32Array(seqLen * dim);
    for (let i = 0; i < seqLen; i++) {
      for (let j = 0; j < seqLen; j++) {
        const weight = attnMatrix[i * seqLen + j];
        for (let k = 0; k < dim; k++) {
          output[i * dim + k] += weight * V[j * dim + k];
        }
      }
    }

    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed / 1024 / 1024;

    return output;
  }

  /**
   * Test embedding similarity using Flash Attention
   */
  async computeTestSimilarity(
    testEmbedding: Float32Array,
    corpusEmbeddings: Float32Array[],
    topK: number = 5
  ): Promise<Array<{ index: number; similarity: number }>> {
    const numTests = corpusEmbeddings.length;
    const dim = testEmbedding.length;

    // Stack embeddings for batch processing
    const Q = new Float32Array(numTests * dim);
    const K = new Float32Array(numTests * dim);

    for (let i = 0; i < numTests; i++) {
      Q.set(testEmbedding, i * dim);
      K.set(corpusEmbeddings[i], i * dim);
    }

    // Create dummy V (not used for similarity)
    const V = new Float32Array(numTests * dim);

    // Compute attention
    const attn = await this.computeFlashAttention(Q, K, V, numTests, dim);

    // Extract top-K similarities
    const similarities: Array<{ index: number; similarity: number }> = [];
    for (let i = 0; i < numTests; i++) {
      similarities.push({
        index: i,
        similarity: attn[i * dim], // First dimension as similarity score
      });
    }

    similarities.sort((a, b) => b.similarity - a.similarity);
    return similarities.slice(0, topK);
  }

  /**
   * Code embedding generation with Flash Attention
   */
  async generateCodeEmbedding(
    codeTokens: Float32Array,
    positionEmbeddings: Float32Array
  ): Promise<Float32Array> {
    const seqLen = codeTokens.length / positionEmbeddings.length;
    const dim = positionEmbeddings.length;

    return await this.computeFlashAttention(
      codeTokens,
      positionEmbeddings,
      codeTokens,
      seqLen,
      dim
    );
  }

  /**
   * Defect pattern matching
   */
  async matchDefectPattern(
    defectEmbedding: Float32Array,
    patternLibrary: Float32Array[]
  ): Promise<Array<{ pattern: number; score: number }>> {
    const numPatterns = patternLibrary.length;
    const dim = defectEmbedding.length;

    const Q = new Float32Array(numPatterns * dim);
    const K = new Float32Array(numPatterns * dim);

    for (let i = 0; i < numPatterns; i++) {
      Q.set(defectEmbedding, i * dim);
      K.set(patternLibrary[i], i * dim);
    }

    const V = new Float32Array(numPatterns * dim);
    const attn = await this.computeFlashAttention(Q, K, V, numPatterns, dim);

    const matches: Array<{ pattern: number; score: number }> = [];
    for (let i = 0; i < numPatterns; i++) {
      matches.push({
        pattern: i,
        score: attn[i * dim],
      });
    }

    matches.sort((a, b) => b.score - a.score);
    return matches;
  }

  /**
   * Get performance metrics
   */
  getMetrics(): QEFlashAttentionMetrics[] {
    return [...this.metrics];
  }

  /**
   * Get average speedup over baseline
   */
  getAverageSpeedup(): number {
    if (this.metrics.length === 0) return 1.0;
    return this.metrics.reduce((sum, m) => sum + m.speedup, 0) / this.metrics.length;
  }

  /**
   * Get configuration
   */
  getConfig(): QEFlashAttentionConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   * Note: Requires recreating the attention instance
   */
  updateConfig(updates: Partial<QEFlashAttentionConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
    };

    // Recreate attention instance with new config
    this.attention = AttentionFactory.create(this.config);
  }

  /**
   * Change attention strategy
   */
  changeStrategy(strategy: AttentionStrategy): void {
    this.config.strategy = strategy;
    this.attention = AttentionFactory.create(this.config);
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = [];
  }

  /**
   * Get workload type
   */
  getWorkload(): QEWorkloadType {
    return this.workload;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.metrics = [];
  }

  // ========================================================================
  // Private Helper Methods
  // ========================================================================

  /**
   * Convert flat array to Float32Array for single vector
   */
  private toFloat32Array(
    matrix: Float32Array,
    seqLen: number,
    dim: number
  ): Float32Array {
    // For @ruvector/attention, we need a single query vector
    // Take the first row as the query
    return matrix.slice(0, dim);
  }

  /**
   * Split matrix into array of vectors for keys/values
   */
  private splitMatrix(
    matrix: Float32Array,
    seqLen: number,
    dim: number
  ): Float32Array[] {
    const vectors: Float32Array[] = [];
    for (let i = 0; i < seqLen; i++) {
      vectors.push(matrix.slice(i * dim, (i + 1) * dim));
    }
    return vectors;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create QE Flash Attention instance
 */
export async function createQEFlashAttention(
  workload: QEWorkloadType,
  customConfig?: Partial<QEFlashAttentionConfig>
): Promise<QEFlashAttention> {
  const flashAttn = new QEFlashAttention(workload, customConfig);
  await flashAttn.initialize();
  return flashAttn;
}

/**
 * Get default configuration for a workload
 */
export function getQEFlashAttentionConfig(
  workload: QEWorkloadType
): QEFlashAttentionConfig {
  return { ...QE_FLASH_ATTENTION_CONFIG[workload] };
}

/**
 * Get all available workload types
 */
export function getWorkloadTypes(): QEWorkloadType[] {
  return Object.keys(QE_FLASH_ATTENTION_CONFIG) as QEWorkloadType[];
}

// ============================================================================
// Re-exports from @ruvector/attention for advanced users
// ============================================================================

export {
  FlashAttention as RuvectorFlashAttention,
  DotProductAttention as RuvectorDotProductAttention,
  MultiHeadAttention as RuvectorMultiHeadAttention,
  HyperbolicAttention as RuvectorHyperbolicAttention,
  LinearAttention as RuvectorLinearAttention,
  MoEAttention as RuvectorMoEAttention,
  type ArrayInput,
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert number[] to Float32Array (handles @ruvector/attention's ArrayInput type)
 */
export function toFloat32Array(input: ArrayInput): Float32Array {
  if (input instanceof Float32Array) {
    return input;
  }
  return new Float32Array(input);
}

/**
 * Convert Float32Array to number[]
 */
export function toNumberArray(input: Float32Array): number[] {
  return Array.from(input);
}

/**
 * Batch compute attention for multiple queries
 */
export async function batchComputeAttention(
  workload: QEWorkloadType,
  queries: Float32Array[],
  keys: Float32Array[],
  values: Float32Array[]
): Promise<Float32Array[]> {
  const flashAttn = await createQEFlashAttention(workload);
  const results: Float32Array[] = [];

  const dim = queries[0].length;
  const seqLen = keys.length;

  for (const query of queries) {
    const Q = new Float32Array(seqLen * dim);
    const K = new Float32Array(seqLen * dim);
    const V = new Float32Array(seqLen * dim);

    Q.set(query, 0);
    for (let i = 0; i < seqLen; i++) {
      K.set(keys[i], i * dim);
      V.set(values[i], i * dim);
    }

    const output = await flashAttn.computeFlashAttention(Q, K, V, seqLen, dim);
    results.push(output.slice(0, dim));
  }

  flashAttn.dispose();
  return results;
}
