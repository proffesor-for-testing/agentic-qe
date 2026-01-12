/**
 * Flash Attention Configuration for QE Workloads (ADR-040)
 * @module flash-attention/config
 */

import type {
  QEWorkloadType,
  FlashAttentionConfig,
  BlockConfig,
  AttentionStrategy,
  AttentionBackend,
  SONAIntegration
} from './types.js';

/**
 * QE-specific Flash Attention configurations
 * Per ADR-040 requirements for optimal QE workload performance
 */
export const QE_FLASH_ATTENTION_CONFIG: Record<QEWorkloadType, FlashAttentionConfig> = {
  /**
   * Test Similarity Search Configuration
   * Optimized for comparing test cases with attention-based similarity
   * Target: 50ms → <15ms (3.33x speedup)
   */
  'test-similarity': {
    backend: 'wasm-simd',
    strategy: 'latency-optimized',
    blocks: {
      headsPerBlock: 8,        // ADR-040 spec
      queryChunkSize: 512,     // ADR-040 spec
      kvChunkSize: 512,
      matmulBlockSize: 128
    },
    dropoutRate: 0.0,
    useCausalMask: false,
    fusedSoftmax: true,
    enableCheckpointing: false,
    targetSpeedup: { min: 2.49, max: 7.47 }
  },

  /**
   * Code Embedding Configuration
   * Optimized for generating code embeddings
   * Target: 50ms → <15ms (3.33x speedup)
   */
  'code-embedding': {
    backend: 'wasm-simd',
    strategy: 'throughput-optimized',
    blocks: {
      headsPerBlock: 4,        // ADR-040 spec
      queryChunkSize: 1024,    // ADR-040 spec (larger for code)
      kvChunkSize: 1024,
      matmulBlockSize: 256
    },
    dropoutRate: 0.0,
    useCausalMask: false,
    fusedSoftmax: true,
    enableCheckpointing: false,
    targetSpeedup: { min: 2.49, max: 7.47 }
  },

  /**
   * Defect Matching Configuration
   * Optimized for pattern matching in defect analysis
   * Target: 20ms → <5ms (4x speedup)
   */
  'defect-matching': {
    backend: 'wasm-simd',
    strategy: 'latency-optimized',
    blocks: {
      headsPerBlock: 12,       // ADR-040 spec (more heads for precision)
      queryChunkSize: 256,     // ADR-040 spec (smaller for patterns)
      kvChunkSize: 256,
      matmulBlockSize: 64
    },
    dropoutRate: 0.0,
    useCausalMask: false,
    fusedSoftmax: true,
    enableCheckpointing: false,
    targetSpeedup: { min: 2.49, max: 7.47 }
  },

  /**
   * Coverage Analysis Configuration
   * Optimized for HNSW-based coverage gap search
   * Target: 100ms → <1ms (100x speedup with HNSW)
   */
  'coverage-analysis': {
    backend: 'wasm-simd',
    strategy: 'memory-efficient',
    blocks: {
      headsPerBlock: 8,
      queryChunkSize: 256,
      kvChunkSize: 512,
      matmulBlockSize: 128
    },
    dropoutRate: 0.0,
    useCausalMask: false,
    fusedSoftmax: true,
    enableCheckpointing: false,
    targetSpeedup: { min: 50, max: 100 } // Higher target with HNSW
  },

  /**
   * Pattern Adaptation Configuration
   * Optimized for SONA-based pattern learning
   * Target: 2ms → <0.05ms (40x speedup with Micro-LoRA)
   */
  'pattern-adaptation': {
    backend: 'wasm-simd',
    strategy: 'latency-optimized',
    blocks: {
      headsPerBlock: 4,        // Minimal heads for speed
      queryChunkSize: 128,     // Small chunks for micro-operations
      kvChunkSize: 128,
      matmulBlockSize: 32
    },
    dropoutRate: 0.0,
    useCausalMask: false,
    fusedSoftmax: true,
    enableCheckpointing: false,
    targetSpeedup: { min: 10, max: 40 } // Higher target with SONA
  }
};

/**
 * SONA integration configuration for QE workloads
 */
export const QE_SONA_CONFIG: Record<QEWorkloadType, SONAIntegration> = {
  'test-similarity': {
    enabled: true,
    microLoRARank: 4,
    targetAdaptationMs: 0.05,
    patternCacheSize: 1000
  },
  'code-embedding': {
    enabled: true,
    microLoRARank: 2,
    targetAdaptationMs: 0.03,
    patternCacheSize: 5000
  },
  'defect-matching': {
    enabled: true,
    microLoRARank: 8,         // Higher rank for defect patterns
    targetAdaptationMs: 0.05,
    patternCacheSize: 2000
  },
  'coverage-analysis': {
    enabled: false,           // HNSW handles this
    microLoRARank: 2,
    targetAdaptationMs: 0.01,
    patternCacheSize: 100
  },
  'pattern-adaptation': {
    enabled: true,
    microLoRARank: 2,         // Micro-LoRA for fastest adaptation
    targetAdaptationMs: 0.05, // V3 target
    patternCacheSize: 10000
  }
};

/**
 * Performance targets for QE workloads
 */
export const QE_PERFORMANCE_TARGETS = {
  'test-similarity': {
    latency: { before: 50, after: 15 }, // ms
    memory: { before: 200, after: 80 },  // MB
    throughput: { min: 1000 } // tokens/sec
  },
  'code-embedding': {
    latency: { before: 50, after: 15 },
    memory: { before: 200, after: 80 },
    throughput: { min: 2000 }
  },
  'defect-matching': {
    latency: { before: 20, after: 5 },
    memory: { before: 150, after: 50 },
    throughput: { min: 500 }
  },
  'coverage-analysis': {
    latency: { before: 100, after: 1 }, // With HNSW
    memory: { before: 100, after: 30 },
    throughput: { min: 10000 }
  },
  'pattern-adaptation': {
    latency: { before: 2, after: 0.05 }, // With SONA
    memory: { before: 50, after: 20 },
    throughput: { min: 20000 }
  }
};

/**
 * Block size presets for different sequence lengths
 */
export const BLOCK_SIZE_PRESETS: Record<number, BlockConfig> = {
  128: {
    headsPerBlock: 4,
    queryChunkSize: 128,
    kvChunkSize: 128,
    matmulBlockSize: 32
  },
  256: {
    headsPerBlock: 8,
    queryChunkSize: 256,
    kvChunkSize: 256,
    matmulBlockSize: 64
  },
  512: {
    headsPerBlock: 8,
    queryChunkSize: 512,
    kvChunkSize: 512,
    matmulBlockSize: 128
  },
  1024: {
    headsPerBlock: 4,
    queryChunkSize: 1024,
    kvChunkSize: 1024,
    matmulBlockSize: 256
  },
  2048: {
    headsPerBlock: 4,
    queryChunkSize: 1024,
    kvChunkSize: 2048,
    matmulBlockSize: 256
  },
  4096: {
    headsPerBlock: 2,
    queryChunkSize: 1024,
    kvChunkSize: 4096,
    matmulBlockSize: 512
  }
};

/**
 * Get optimal block configuration for sequence length
 */
export function getOptimalBlockConfig(seqLength: number): BlockConfig {
  // Find closest preset
  const presetLengths = Object.keys(BLOCK_SIZE_PRESETS).map(Number).sort((a, b) => a - b);

  for (const length of presetLengths) {
    if (seqLength <= length) {
      return BLOCK_SIZE_PRESETS[length];
    }
  }

  // Use largest preset if sequence is very long
  return BLOCK_SIZE_PRESETS[4096];
}

/**
 * Get Flash Attention config for workload with customization
 */
export function getQEFlashAttentionConfig(
  workload: QEWorkloadType,
  custom?: Partial<FlashAttentionConfig>
): FlashAttentionConfig {
  const base = QE_FLASH_ATTENTION_CONFIG[workload];

  if (!custom) {
    return base;
  }

  return {
    ...base,
    ...custom,
    blocks: {
      ...base.blocks,
      ...custom.blocks
    }
  };
}
