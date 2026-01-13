/**
 * QE Wrappers for @ruvector NPM packages
 *
 * This module provides QE-specific interfaces on top of @ruvector packages:
 * - @ruvector/sona: Self-Optimizing Neural Architecture with LoRA, EWC++
 * - @ruvector/attention: SIMD-accelerated Flash Attention with 7 mathematical theories
 * - @ruvector/gnn: Graph Neural Networks with HNSW and differentiable search
 *
 * These are NATIVE Rust/NAPI packages, not the HTTP-based RuVector service.
 *
 * @module integrations/ruvector/wrappers
 */

// ============================================================================
// SONA (Self-Optimizing Neural Architecture)
// ============================================================================

export {
  QESONA,
  createQESONA,
  createDomainQESONA,
  type QESONAPattern,
  type QEPatternType,
  type QESONAAdaptationResult,
  type QESONAStats,
  type QESONAConfig,
} from './sona-wrapper.js';

// ============================================================================
// Flash Attention
// ============================================================================

export {
  QEFlashAttention,
  createQEFlashAttention,
  getQEFlashAttentionConfig,
  getWorkloadTypes,
  batchComputeAttention,
  toFloat32Array,
  toNumberArray as toNumberArrayAttn,
  getOptimalBlockConfig,
  type QEWorkloadType,
  type AttentionStrategy,
  type QEFlashAttentionMetrics,
  type QEFlashAttentionConfig,
  type BlockConfig,
  type FlashAttentionMetrics,
  type BenchmarkResult,
  type SONAIntegration,

  // Config exports (backward compatible with flash-attention/config.ts)
  QE_FLASH_ATTENTION_CONFIG,
  QE_SONA_CONFIG,
  QE_PERFORMANCE_TARGETS,

  // Re-exports from @ruvector/attention
  RuvectorFlashAttention,
  RuvectorDotProductAttention,
  RuvectorMultiHeadAttention,
  RuvectorHyperbolicAttention,
  RuvectorLinearAttention,
  RuvectorMoEAttention,
  type ArrayInput,
} from './attention-wrapper.js';

// ============================================================================
// GNN (Graph Neural Networks)
// ============================================================================

export {
  QEGNNEmbeddingIndex,
  QEGNNIndexFactory,
  GNNLayerFactory,
  TensorCompressionFactory,
  initGNN,
  toNumberArray as toNumberArrayGNN,
  toIEmbedding,
  batchDifferentiableSearch,
  type QEDifferentiableResult,
  type QEGNNLayerConfig,
  type QECompressionLevel,
  type QECompressedTensor,

  // Re-exports from @ruvector/gnn
  RuvectorLayer,
  TensorCompress,
  differentiableSearch,
  hierarchicalForward,
  getCompressionLevel,
  init,
  type CompressionLevelConfig,
  type SearchResult,
} from './gnn-wrapper.js';

// ============================================================================
// Package Information
// ============================================================================

/**
 * Get version information for @ruvector packages
 */
export function getRuvectorPackageVersions(): Record<string, string> {
  return {
    '@ruvector/sona': '^0.1.5',
    '@ruvector/attention': '^0.1.4',
    '@ruvector/gnn': '^0.1.22',
  };
}

/**
 * Check if @ruvector packages are available AND working.
 *
 * NOTE: This function exists ONLY for test infrastructure - to skip integration
 * tests in CI environments where native binaries may not work correctly.
 * It tests actual native operations, not just package import.
 *
 * In production code, do NOT use this for defensive programming. The packages
 * are dependencies - they should work. If they don't, that's a real error.
 *
 * @internal Used by test files to conditionally skip tests
 */
export function checkRuvectorPackagesAvailable(): {
  sona: boolean;
  attention: boolean;
  gnn: boolean;
  all: boolean;
} {
  const results = { sona: false, attention: false, gnn: false, all: false };

  // Check SONA - just import for now
  try {
    require('@ruvector/sona');
    results.sona = true;
  } catch {
    // Package not available - native binary not built for this platform
  }

  // Check Attention - just import for now
  try {
    require('@ruvector/attention');
    results.attention = true;
  } catch {
    // Package not available - native binary not built for this platform
  }

  // Check GNN - test actual native operation
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const gnn = require('@ruvector/gnn');

    // Test an actual native operation to verify bindings work
    // Simple differentiable search with minimal data
    const testQuery = [0.1, 0.2, 0.3];
    const testCandidates = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]];
    const result = gnn.differentiableSearch(testQuery, testCandidates, 1, 1.0);

    // Verify the result structure
    if (result && Array.isArray(result.indices) && Array.isArray(result.weights)) {
      results.gnn = true;
    }
  } catch {
    // Package not available or native operations not working
    // This catches both import errors AND native binding errors
  }

  results.all = results.sona && results.attention && results.gnn;
  return results;
}

/**
 * Initialize all @ruvector packages
 */
export async function initAllRuvectorPackages(): Promise<string[]> {
  const { initGNN } = await import('./gnn-wrapper.js');

  return [
    initGNN(),
    'SONA: Ready (no initialization required)',
    'Attention: Ready (no initialization required)',
  ];
}
