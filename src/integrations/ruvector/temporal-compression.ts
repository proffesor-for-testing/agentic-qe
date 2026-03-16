/**
 * Temporal Tensor Compression Service
 * ADR-085: Temporal Tensor Pattern Compression
 *
 * Compresses pattern embeddings based on access patterns using tiered
 * quantization. Hot patterns retain full precision, while cold patterns
 * are aggressively compressed to save memory.
 *
 * TypeScript implementation using Int8Array (4x compression for all tiers).
 * No native package exists — this IS the production implementation.
 *
 * Tiers (logical bit depths, stored as Int8Array):
 * - HOT  (last 7 days):   8-bit quantization  (4x compression)
 * - WARM (7-30 days):     5-bit quantization   (4x actual, 6.4x theoretical)
 * - COLD (30+ days):      3-bit quantization   (4x actual, 10.7x theoretical)
 *
 * All tiers deliver 4x compression because Int8Array uses 1 byte per
 * element regardless of logical bit depth.
 *
 * @module integrations/ruvector/temporal-compression
 */

import { LoggerFactory } from '../../logging/index.js';
import { getRuVectorFeatureFlags } from './feature-flags.js';

const logger = LoggerFactory.create('temporal-compression');

// ============================================================================
// Types
// ============================================================================

/** Access-frequency tier for a pattern embedding */
export type CompressionTier = 'hot' | 'warm' | 'cold';

/**
 * Compressed vector representation.
 * Stores quantized data alongside the parameters needed for decompression.
 */
export interface CompressedVector {
  /** Quantized integer data */
  readonly data: Int8Array;
  /** Scale factor used during quantization */
  readonly scale: number;
  /** Offset (minimum value) used during quantization */
  readonly offset: number;
  /** Compression tier applied */
  readonly tier: CompressionTier;
  /** Original vector dimensionality */
  readonly originalLength: number;
  /** Bit depth used for quantization */
  readonly bitDepth: number;
  /** Original byte size (float32 = 4 bytes per element) */
  readonly originalByteSize: number;
  /** Compressed byte size (actual storage: data.byteLength) */
  readonly compressedByteSize: number;
  /** Actual byte size in memory (always data.byteLength — 1 byte per Int8 element) */
  readonly actualByteSize: number;
  /** Theoretical byte size if true bit-packing were used (native only) */
  readonly theoreticalByteSize: number;
}

/**
 * Compression statistics for monitoring
 */
export interface CompressionStats {
  /** Total vectors compressed */
  totalCompressed: number;
  /** Vectors by tier */
  byTier: Record<CompressionTier, number>;
  /** Average compression ratio per tier */
  avgCompressionRatio: Record<CompressionTier, number>;
  /** Total bytes saved */
  totalBytesSaved: number;
  /** Total original bytes */
  totalOriginalBytes: number;
  /** Total compressed bytes */
  totalCompressedBytes: number;
  /** Whether using native implementation */
  usingNative: boolean;
  /** Whether native bit-packing is in use (false in TS fallback) */
  usesNativeBitPacking: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Hot tier: accessed within the last 7 days */
const HOT_THRESHOLD_DAYS = 7;

/** Warm tier: accessed within the last 30 days */
const WARM_THRESHOLD_DAYS = 30;

/** Quantization parameters per tier */
const TIER_CONFIG: Record<CompressionTier, { bitDepth: number; min: number; max: number }> = {
  hot:  { bitDepth: 8, min: -128, max: 127 },
  warm: { bitDepth: 5, min: -16,  max: 15 },
  cold: { bitDepth: 3, min: -4,   max: 3 },
};

/** Theoretical compression ratios assuming true bit-packing (native only) */
const THEORETICAL_COMPRESSION_RATIOS: Record<CompressionTier, number> = {
  hot:  4.0,   // 32-bit -> 8-bit = 4x
  warm: 6.4,   // 32-bit -> 5-bit ~ 6.4x
  cold: 10.7,  // 32-bit -> 3-bit ~ 10.7x
};

/** Actual compression ratio in the TypeScript fallback (Float32 -> Int8 = 4x for all tiers) */
const ACTUAL_FALLBACK_RATIO = 4.0;

// ============================================================================
// Native module detection
// ============================================================================

/** Whether native ruvector-temporal-tensor is available */
let nativeAvailable: boolean | null = null;
let nativeModule: NativeTemporalTensor | null = null;

/**
 * Native module interface (expected from ruvector-temporal-tensor)
 */
interface NativeTemporalTensor {
  compress(vector: Float32Array, bitDepth: number): {
    data: Int8Array;
    scale: number;
    offset: number;
  };
  decompress(data: Int8Array, scale: number, offset: number, length: number): Float32Array;
}

/**
 * Check native module availability.
 * No native package exists for temporal compression — always returns false.
 * The TypeScript implementation IS the production implementation.
 */
async function tryLoadNativeModule(): Promise<boolean> {
  if (nativeAvailable !== null) return nativeAvailable;
  nativeAvailable = false;
  nativeModule = null;
  return false;
}

// ============================================================================
// TypeScript Fallback Quantization
// ============================================================================

/**
 * Quantize a float32 vector to the specified bit depth.
 *
 * Maps values linearly from [min, max] of the input to the integer range
 * determined by the bit depth (stored as Int8Array for uniformity).
 */
function quantize(vector: Float32Array, tier: CompressionTier): { data: Int8Array; scale: number; offset: number } {
  const config = TIER_CONFIG[tier];
  const range = config.max - config.min; // integer range for this bit depth

  if (vector.length === 0) {
    return { data: new Int8Array(0), scale: 1, offset: 0 };
  }

  // Find min/max of input vector
  let vMin = vector[0];
  let vMax = vector[0];
  for (let i = 1; i < vector.length; i++) {
    if (vector[i] < vMin) vMin = vector[i];
    if (vector[i] > vMax) vMax = vector[i];
  }

  // Avoid division by zero for constant vectors
  const vRange = vMax - vMin;
  const scale = vRange === 0 ? 1 : vRange / range;
  const offset = vMin;

  const data = new Int8Array(vector.length);
  for (let i = 0; i < vector.length; i++) {
    // Map float -> integer range, then shift to [config.min, config.max]
    const normalized = vRange === 0 ? 0 : (vector[i] - offset) / scale;
    let quantized = Math.round(normalized) + config.min;
    // Clamp to valid range
    quantized = Math.max(config.min, Math.min(config.max, quantized));
    data[i] = quantized;
  }

  return { data, scale, offset };
}

/**
 * Dequantize an Int8Array back to Float32Array using stored scale and offset.
 */
function dequantize(data: Int8Array, scale: number, offset: number, tier: CompressionTier): Float32Array {
  const config = TIER_CONFIG[tier];
  const result = new Float32Array(data.length);

  for (let i = 0; i < data.length; i++) {
    result[i] = (data[i] - config.min) * scale + offset;
  }

  return result;
}

// ============================================================================
// Temporal Compression Service
// ============================================================================

/**
 * Temporal Compression Service
 *
 * Provides tiered quantization of pattern embedding vectors based on
 * how recently they were accessed. Supports both a native Rust/NAPI
 * implementation and a pure TypeScript fallback.
 */
export class TemporalCompressionService {
  private stats: CompressionStats = {
    totalCompressed: 0,
    byTier: { hot: 0, warm: 0, cold: 0 },
    avgCompressionRatio: { hot: 0, warm: 0, cold: 0 },
    totalBytesSaved: 0,
    totalOriginalBytes: 0,
    totalCompressedBytes: 0,
    usingNative: false,
    usesNativeBitPacking: false,
  };

  /** Running sum of ratios per tier for average calculation */
  private ratioSums: Record<CompressionTier, number> = { hot: 0, warm: 0, cold: 0 };

  private initialized = false;

  /**
   * Initialize the service, attempting to load the native module.
   * Safe to call multiple times; subsequent calls are no-ops.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    const native = await tryLoadNativeModule();
    this.stats.usingNative = native;
    this.stats.usesNativeBitPacking = native;
    this.initialized = true;
  }

  /**
   * Check if the temporal compression feature flag is enabled.
   */
  isEnabled(): boolean {
    const flags = getRuVectorFeatureFlags();
    return (flags as Record<string, unknown>).useTemporalCompression === true;
  }

  /**
   * Classify a last-access date into a compression tier.
   *
   * @param lastAccessDate - When the pattern was last accessed
   * @returns The compression tier for the pattern
   */
  classifyTier(lastAccessDate: Date): CompressionTier {
    const now = Date.now();
    const daysSinceAccess = (now - lastAccessDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceAccess < HOT_THRESHOLD_DAYS) return 'hot';
    if (daysSinceAccess < WARM_THRESHOLD_DAYS) return 'warm';
    return 'cold';
  }

  /**
   * Compress a float32 embedding vector according to the specified tier.
   *
   * @param vector - The original float32 embedding
   * @param tier - Compression tier to apply
   * @returns Compressed vector with metadata for decompression
   */
  compress(vector: Float32Array, tier: CompressionTier): CompressedVector {
    const originalByteSize = vector.length * 4; // float32 = 4 bytes

    let data: Int8Array;
    let scale: number;
    let offset: number;

    if (nativeAvailable && nativeModule) {
      const result = nativeModule.compress(vector, TIER_CONFIG[tier].bitDepth);
      data = result.data;
      scale = result.scale;
      offset = result.offset;
    } else {
      const result = quantize(vector, tier);
      data = result.data;
      scale = result.scale;
      offset = result.offset;
    }

    const effectiveBitsPerElement = TIER_CONFIG[tier].bitDepth;

    // Actual storage: Int8Array uses 1 byte per element regardless of logical bit depth.
    // Theoretical: what a true bit-packing implementation would achieve.
    const actualByteSize = data.byteLength;
    const theoreticalByteSize = Math.ceil((vector.length * effectiveBitsPerElement) / 8);
    const compressedByteSize = actualByteSize;

    const ratio = compressedByteSize > 0 ? originalByteSize / compressedByteSize : 1;

    // Update stats
    this.stats.totalCompressed++;
    this.stats.byTier[tier]++;
    this.ratioSums[tier] += ratio;
    this.stats.avgCompressionRatio[tier] = this.ratioSums[tier] / this.stats.byTier[tier];
    this.stats.totalOriginalBytes += originalByteSize;
    this.stats.totalCompressedBytes += compressedByteSize;
    this.stats.totalBytesSaved += (originalByteSize - compressedByteSize);

    return {
      data,
      scale,
      offset,
      tier,
      originalLength: vector.length,
      bitDepth: effectiveBitsPerElement,
      originalByteSize,
      compressedByteSize,
      actualByteSize,
      theoreticalByteSize,
    };
  }

  /**
   * Decompress a compressed vector back to Float32Array.
   *
   * The output is an approximation of the original due to quantization loss.
   * Consumers receive a standard Float32Array transparently.
   *
   * @param compressed - The compressed vector to restore
   * @returns Reconstructed Float32Array
   */
  decompress(compressed: CompressedVector): Float32Array {
    if (nativeAvailable && nativeModule) {
      return nativeModule.decompress(
        compressed.data,
        compressed.scale,
        compressed.offset,
        compressed.originalLength,
      );
    }

    return dequantize(compressed.data, compressed.scale, compressed.offset, compressed.tier);
  }

  /**
   * Get current compression statistics for monitoring.
   */
  getCompressionStats(): CompressionStats {
    return { ...this.stats };
  }

  /**
   * Reset compression statistics. Useful for testing or periodic reporting.
   */
  resetStats(): void {
    this.stats = {
      totalCompressed: 0,
      byTier: { hot: 0, warm: 0, cold: 0 },
      avgCompressionRatio: { hot: 0, warm: 0, cold: 0 },
      totalBytesSaved: 0,
      totalOriginalBytes: 0,
      totalCompressedBytes: 0,
      usingNative: this.stats.usingNative,
      usesNativeBitPacking: this.stats.usesNativeBitPacking,
    };
    this.ratioSums = { hot: 0, warm: 0, cold: 0 };
  }
}

// ============================================================================
// Cosine Similarity Utility (for quality validation)
// ============================================================================

/**
 * Compute cosine similarity between two vectors.
 * Returns a value in [-1, 1] where 1 means identical direction.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// ============================================================================
// Singleton & Factory
// ============================================================================

let sharedInstance: TemporalCompressionService | null = null;

/**
 * Get or create the shared TemporalCompressionService singleton.
 */
export async function getTemporalCompressionService(): Promise<TemporalCompressionService> {
  if (!sharedInstance) {
    sharedInstance = new TemporalCompressionService();
    await sharedInstance.initialize();
  }
  return sharedInstance;
}

/**
 * Create a new TemporalCompressionService (non-singleton, for testing).
 */
export function createTemporalCompressionService(): TemporalCompressionService {
  return new TemporalCompressionService();
}

/**
 * Reset the shared singleton. Primarily for test cleanup.
 */
export function resetTemporalCompressionService(): void {
  sharedInstance = null;
}

// ============================================================================
// Exports
// ============================================================================

export { TIER_CONFIG, THEORETICAL_COMPRESSION_RATIOS, ACTUAL_FALLBACK_RATIO, HOT_THRESHOLD_DAYS, WARM_THRESHOLD_DAYS };

/**
 * @deprecated Use THEORETICAL_COMPRESSION_RATIOS instead.
 * Kept for backwards compatibility with existing consumers.
 */
export const EXPECTED_COMPRESSION_RATIOS = THEORETICAL_COMPRESSION_RATIOS;
