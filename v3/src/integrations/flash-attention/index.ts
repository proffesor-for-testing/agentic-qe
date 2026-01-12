/**
 * Flash Attention Integration for QE Workloads
 * Provides 2.49x-7.47x speedup for attention-based operations
 * @module flash-attention
 *
 * Per ADR-040:
 * - Test similarity: headsPerBlock: 8, queryChunkSize: 512
 * - Code embedding: headsPerBlock: 4, queryChunkSize: 1024
 * - Defect matching: headsPerBlock: 12, queryChunkSize: 256
 *
 * Performance Targets:
 * - Test embedding: ~50ms → <15ms
 * - Pattern adaptation: ~2ms → <0.05ms (with SONA)
 * - Coverage search: ~100ms → <1ms (with HNSW)
 * - Memory usage: ~200MB → ~80MB
 */

// Types
export type {
  QEWorkloadType,
  AttentionStrategy,
  AttentionBackend,
  BlockConfig,
  FlashAttentionConfig,
  FlashAttentionMetrics,
  BenchmarkResult,
  VectorOperation,
  SIMDCapabilities,
  SONAIntegration
} from './types.js';

// Configuration
export {
  QE_FLASH_ATTENTION_CONFIG,
  QE_SONA_CONFIG,
  QE_PERFORMANCE_TARGETS,
  BLOCK_SIZE_PRESETS,
  getOptimalBlockConfig,
  getQEFlashAttentionConfig
} from './config.js';

// Core implementation
export {
  QEFlashAttention,
  createQEFlashAttention
} from './flash-attention.js';

// WASM-SIMD backend
export {
  WASMSIMDBackend,
  getWASMSIMDBackend
} from './wasm-simd.js';

// Benchmarking
export {
  FlashAttentionBenchmark,
  runFlashAttentionBenchmarks,
  benchmarkWorkload
} from './benchmark.js';

// Constants
export const FLASH_ATTENTION_VERSION = '1.0.0';
export const MIN_SPEEDUP_TARGET = 2.49;
export const MAX_SPEEDUP_TARGET = 7.47;
