/**
 * Flash Attention Types for QE Workloads
 * @module flash-attention/types
 */

/**
 * QE workload types with specific optimization profiles
 */
export type QEWorkloadType =
  | 'test-similarity'      // Test case similarity search
  | 'code-embedding'       // Code embedding generation
  | 'defect-matching'      // Defect pattern matching
  | 'coverage-analysis'    // Coverage gap analysis
  | 'pattern-adaptation';  // SONA pattern adaptation

/**
 * Attention optimization strategy
 */
export type AttentionStrategy =
  | 'memory-efficient'    // Minimize memory usage (50-75% reduction)
  | 'latency-optimized'   // Minimize latency (<100ms target)
  | 'throughput-optimized'; // Maximize throughput

/**
 * Backend implementation for Flash Attention
 */
export type AttentionBackend =
  | 'wasm-simd'           // WASM with SIMD acceleration
  | 'native'              // Native Node.js addon
  | 'gpu'                 // GPU-accelerated (WebGPU/CUDA)
  | 'hybrid';             // Adaptive backend selection

/**
 * Block size configuration for Flash Attention
 */
export interface BlockConfig {
  /** Number of attention heads per block */
  headsPerBlock: number;
  /** Query chunk size for block-wise attention */
  queryChunkSize: number;
  /** Key/Value chunk size */
  kvChunkSize: number;
  /** Block size for matrix multiplication */
  matmulBlockSize: number;
}

/**
 * Flash Attention optimization parameters
 */
export interface FlashAttentionConfig {
  /** Backend implementation */
  backend: AttentionBackend;
  /** Optimization strategy */
  strategy: AttentionStrategy;
  /** Block configuration */
  blocks: BlockConfig;
  /** Dropout rate (0.0 for inference) */
  dropoutRate: number;
  /** Use causal mask for autoregressive models */
  useCausalMask: boolean;
  /** Enable softmax fusion */
  fusedSoftmax: boolean;
  /** Enable gradient checkpointing (training only) */
  enableCheckpointing: boolean;
  /** Target speedup multiplier */
  targetSpeedup: { min: number; max: number };
}

/**
 * Performance metrics for Flash Attention
 */
export interface FlashAttentionMetrics {
  /** Execution time in milliseconds */
  timeMs: number;
  /** Memory usage in MB */
  memoryMB: number;
  /** Achieved speedup over baseline */
  speedup: number;
  /** Throughput (tokens/second) */
  throughput: number;
  /** Peak memory usage in MB */
  peakMemoryMB: number;
  /** Cache hit rate */
  cacheHitRate?: number;
}

/**
 * Benchmark comparison results
 */
export interface BenchmarkResult {
  /** Workload type */
  workload: QEWorkloadType;
  /** Baseline metrics (without Flash Attention) */
  baseline: FlashAttentionMetrics;
  /** Flash Attention metrics */
  flash: FlashAttentionMetrics;
  /** Achieved speedup */
  speedup: number;
  /** Memory reduction percentage */
  memoryReduction: number;
  /** Meets target (2.49x-7.47x) */
  meetsTarget: boolean;
}

/**
 * Vector operation types for SIMD optimization
 */
export type VectorOperation =
  | 'matmul'              // Matrix multiplication
  | 'vecadd'              // Vector addition
  | 'embedding'           // Embedding lookup
  | 'softmax'             // Softmax operation
  | 'layer-norm';         // Layer normalization

/**
 * SIMD capability detection results
 */
export interface SIMDCapabilities {
  /** SIMD support is available */
  supported: boolean;
  /** SIMD128 support */
  simd128: boolean;
  /** Relaxed SIMD support */
  relaxedSimd: boolean;
  /** Available vector operations */
  vectorOps: VectorOperation[];
  /** Expected speedup range */
  expectedSpeedup: { min: number; max: number };
}

/**
 * SONA integration for pattern adaptation
 */
export interface SONAIntegration {
  /** Enable SONA for adaptive learning */
  enabled: boolean;
  /** Micro-LoRA rank for fast adaptation */
  microLoRARank: number;
  /** Target adaptation time */
  targetAdaptationMs: number;
  /** Pattern cache size */
  patternCacheSize: number;
}
