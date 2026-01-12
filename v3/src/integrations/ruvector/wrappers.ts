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
  type QEWorkloadType,
  type AttentionStrategy,
  type QEFlashAttentionMetrics,
  type QEFlashAttentionConfig,
  type BlockConfig,

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
 * Check if @ruvector packages are available
 */
export function checkRuvectorPackagesAvailable(): {
  sona: boolean;
  attention: boolean;
  gnn: boolean;
  all: boolean;
} {
  const results = { sona: false, attention: false, gnn: false, all: false };

  try {
    require('@ruvector/sona');
    results.sona = true;
  } catch {}

  try {
    require('@ruvector/attention');
    results.attention = true;
  } catch {}

  try {
    require('@ruvector/gnn');
    results.gnn = true;
  } catch {}

  results.all = results.sona && results.attention && results.gnn;
  return results;
}

/**
 * Initialize all @ruvector packages
 */
export async function initAllRuvectorPackages(): Promise<string[]> {
  const results: string[] = [];

  // Initialize GNN
  try {
    const { initGNN } = await import('./gnn-wrapper.js');
    results.push(initGNN());
  } catch (error) {
    results.push(`Failed to initialize GNN: ${(error as Error).message}`);
  }

  // SONA and attention don't require explicit initialization
  results.push('SONA: Ready (no initialization required)');
  results.push('Attention: Ready (no initialization required)');

  return results;
}
