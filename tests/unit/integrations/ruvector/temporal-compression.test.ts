/**
 * Temporal Tensor Compression Service - Unit Tests
 * ADR-085: Temporal Tensor Pattern Compression
 *
 * Tests compression/decompression roundtrip accuracy, tier classification,
 * compression ratios, and feature flag integration.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TemporalCompressionService,
  createTemporalCompressionService,
  cosineSimilarity,
  TIER_CONFIG,
  THEORETICAL_COMPRESSION_RATIOS,
  ACTUAL_FALLBACK_RATIO,
  EXPECTED_COMPRESSION_RATIOS,
  HOT_THRESHOLD_DAYS,
  WARM_THRESHOLD_DAYS,
  type CompressionTier,
  type CompressedVector,
} from '../../../../src/integrations/ruvector/temporal-compression';
import {
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
} from '../../../../src/integrations/ruvector/feature-flags';

// ============================================================================
// Test Fixtures
// ============================================================================

/** Create a random Float32Array with values in [-1, 1] for embedding simulation */
function randomEmbedding(dim: number): Float32Array {
  const vec = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    vec[i] = (Math.random() * 2) - 1;
  }
  return vec;
}

/** Create a constant Float32Array for edge case testing */
function constantEmbedding(dim: number, value: number): Float32Array {
  return new Float32Array(dim).fill(value);
}

/** Create a date N days in the past */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// ============================================================================
// Tests
// ============================================================================

describe('TemporalCompressionService', () => {
  let service: TemporalCompressionService;

  beforeEach(() => {
    service = createTemporalCompressionService();
    resetRuVectorFeatureFlags();
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  // --------------------------------------------------------------------------
  // Tier Classification
  // --------------------------------------------------------------------------

  describe('classifyTier', () => {
    it('should classify recent access as HOT', () => {
      expect(service.classifyTier(daysAgo(0))).toBe('hot');
      expect(service.classifyTier(daysAgo(1))).toBe('hot');
      expect(service.classifyTier(daysAgo(6))).toBe('hot');
    });

    it('should classify 7-30 day old access as WARM', () => {
      expect(service.classifyTier(daysAgo(7))).toBe('warm');
      expect(service.classifyTier(daysAgo(15))).toBe('warm');
      expect(service.classifyTier(daysAgo(29))).toBe('warm');
    });

    it('should classify 30+ day old access as COLD', () => {
      expect(service.classifyTier(daysAgo(30))).toBe('cold');
      expect(service.classifyTier(daysAgo(90))).toBe('cold');
      expect(service.classifyTier(daysAgo(365))).toBe('cold');
    });

    it('should handle future dates as HOT', () => {
      const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24);
      expect(service.classifyTier(futureDate)).toBe('hot');
    });
  });

  // --------------------------------------------------------------------------
  // Compression / Decompression Roundtrip
  // --------------------------------------------------------------------------

  describe('compress and decompress', () => {
    const EMBEDDING_DIM = 384; // typical embedding dimension

    it('should roundtrip HOT tier with high fidelity (cosine > 0.99)', () => {
      const original = randomEmbedding(EMBEDDING_DIM);
      const compressed = service.compress(original, 'hot');
      const restored = service.decompress(compressed);

      expect(restored.length).toBe(original.length);
      const similarity = cosineSimilarity(original, restored);
      expect(similarity).toBeGreaterThan(0.99);
    });

    it('should roundtrip WARM tier with good fidelity (cosine > 0.97)', () => {
      const original = randomEmbedding(EMBEDDING_DIM);
      const compressed = service.compress(original, 'warm');
      const restored = service.decompress(compressed);

      expect(restored.length).toBe(original.length);
      const similarity = cosineSimilarity(original, restored);
      expect(similarity).toBeGreaterThan(0.97);
    });

    it('should roundtrip COLD tier with acceptable fidelity (cosine > 0.95)', () => {
      const original = randomEmbedding(EMBEDDING_DIM);
      const compressed = service.compress(original, 'cold');
      const restored = service.decompress(compressed);

      expect(restored.length).toBe(original.length);
      const similarity = cosineSimilarity(original, restored);
      expect(similarity).toBeGreaterThan(0.95);
    });

    it('should handle empty vectors', () => {
      const empty = new Float32Array(0);
      const compressed = service.compress(empty, 'hot');
      const restored = service.decompress(compressed);

      expect(restored.length).toBe(0);
      expect(compressed.originalLength).toBe(0);
    });

    it('should handle constant vectors', () => {
      const constant = constantEmbedding(128, 0.5);
      const compressed = service.compress(constant, 'hot');
      const restored = service.decompress(compressed);

      expect(restored.length).toBe(constant.length);
      // All values should be approximately equal to the constant
      for (let i = 0; i < restored.length; i++) {
        expect(restored[i]).toBeCloseTo(0.5, 0);
      }
    });

    it('should handle single-element vectors', () => {
      const single = new Float32Array([0.42]);
      const compressed = service.compress(single, 'warm');
      const restored = service.decompress(compressed);

      expect(restored.length).toBe(1);
    });

    it('should preserve vector length across all tiers', () => {
      const original = randomEmbedding(256);

      for (const tier of ['hot', 'warm', 'cold'] as CompressionTier[]) {
        const compressed = service.compress(original, tier);
        const restored = service.decompress(compressed);
        expect(restored.length).toBe(original.length);
        expect(compressed.originalLength).toBe(original.length);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Compressed Vector Metadata
  // --------------------------------------------------------------------------

  describe('compressed vector metadata', () => {
    it('should record correct tier in compressed output', () => {
      const vec = randomEmbedding(64);

      expect(service.compress(vec, 'hot').tier).toBe('hot');
      expect(service.compress(vec, 'warm').tier).toBe('warm');
      expect(service.compress(vec, 'cold').tier).toBe('cold');
    });

    it('should record correct bit depth per tier', () => {
      const vec = randomEmbedding(64);

      expect(service.compress(vec, 'hot').bitDepth).toBe(8);
      expect(service.compress(vec, 'warm').bitDepth).toBe(5);
      expect(service.compress(vec, 'cold').bitDepth).toBe(3);
    });

    it('should calculate original byte size as length * 4', () => {
      const vec = randomEmbedding(100);
      const compressed = service.compress(vec, 'hot');
      expect(compressed.originalByteSize).toBe(100 * 4);
    });

    it('should calculate compressed byte size as actual Int8Array storage', () => {
      const vec = randomEmbedding(128);

      // All tiers: Int8Array uses 1 byte per element = 128 bytes
      const hotCompressed = service.compress(vec, 'hot');
      expect(hotCompressed.compressedByteSize).toBe(128);
      expect(hotCompressed.actualByteSize).toBe(128);

      const warmCompressed = service.compress(vec, 'warm');
      expect(warmCompressed.compressedByteSize).toBe(128);
      expect(warmCompressed.actualByteSize).toBe(128);

      const coldCompressed = service.compress(vec, 'cold');
      expect(coldCompressed.compressedByteSize).toBe(128);
      expect(coldCompressed.actualByteSize).toBe(128);
    });

    it('should calculate theoretical byte size based on bit depth', () => {
      const vec = randomEmbedding(128);

      // HOT: 128 * 8 bits / 8 = 128 bytes (same as actual for 8-bit)
      const hotCompressed = service.compress(vec, 'hot');
      expect(hotCompressed.theoreticalByteSize).toBe(Math.ceil(128 * 8 / 8));

      // WARM: 128 * 5 bits / 8 = 80 bytes (smaller than actual)
      const warmCompressed = service.compress(vec, 'warm');
      expect(warmCompressed.theoreticalByteSize).toBe(Math.ceil(128 * 5 / 8));

      // COLD: 128 * 3 bits / 8 = 48 bytes (smaller than actual)
      const coldCompressed = service.compress(vec, 'cold');
      expect(coldCompressed.theoreticalByteSize).toBe(Math.ceil(128 * 3 / 8));
    });
  });

  // --------------------------------------------------------------------------
  // Compression Ratios
  // --------------------------------------------------------------------------

  describe('compression ratios', () => {
    it('should achieve approximately 4x compression for HOT tier', () => {
      const vec = randomEmbedding(384);
      const compressed = service.compress(vec, 'hot');
      const ratio = compressed.originalByteSize / compressed.compressedByteSize;

      expect(ratio).toBeCloseTo(4.0, 0);
    });

    it('should achieve approximately 4x compression for WARM tier (TS fallback)', () => {
      const vec = randomEmbedding(384);
      const compressed = service.compress(vec, 'warm');
      const ratio = compressed.originalByteSize / compressed.compressedByteSize;

      // In TS fallback, Int8Array is 1 byte per element = 4x for all tiers
      expect(ratio).toBeCloseTo(4.0, 0);
    });

    it('should achieve approximately 4x compression for COLD tier (TS fallback)', () => {
      const vec = randomEmbedding(384);
      const compressed = service.compress(vec, 'cold');
      const ratio = compressed.originalByteSize / compressed.compressedByteSize;

      // In TS fallback, Int8Array is 1 byte per element = 4x for all tiers
      expect(ratio).toBeCloseTo(4.0, 0);
    });

    it('should report approximately equal compression across all tiers in TS fallback', () => {
      const vec = randomEmbedding(256);
      const hotResult = service.compress(vec, 'hot');
      const warmResult = service.compress(vec, 'warm');
      const coldResult = service.compress(vec, 'cold');

      const hot = hotResult.originalByteSize / hotResult.compressedByteSize;
      const warm = warmResult.originalByteSize / warmResult.compressedByteSize;
      const cold = coldResult.originalByteSize / coldResult.compressedByteSize;

      // All tiers give ~4x in TS fallback (Int8Array storage)
      expect(hot).toBeCloseTo(4.0, 0);
      expect(warm).toBeCloseTo(4.0, 0);
      expect(cold).toBeCloseTo(4.0, 0);
    });
  });

  // --------------------------------------------------------------------------
  // Compression Stats
  // --------------------------------------------------------------------------

  describe('getCompressionStats', () => {
    it('should start with zero stats', () => {
      const stats = service.getCompressionStats();
      expect(stats.totalCompressed).toBe(0);
      expect(stats.byTier.hot).toBe(0);
      expect(stats.byTier.warm).toBe(0);
      expect(stats.byTier.cold).toBe(0);
      expect(stats.totalBytesSaved).toBe(0);
    });

    it('should track compressions per tier', () => {
      const vec = randomEmbedding(64);

      service.compress(vec, 'hot');
      service.compress(vec, 'hot');
      service.compress(vec, 'warm');
      service.compress(vec, 'cold');

      const stats = service.getCompressionStats();
      expect(stats.totalCompressed).toBe(4);
      expect(stats.byTier.hot).toBe(2);
      expect(stats.byTier.warm).toBe(1);
      expect(stats.byTier.cold).toBe(1);
    });

    it('should track total bytes saved', () => {
      const vec = randomEmbedding(100);

      service.compress(vec, 'cold');
      const stats = service.getCompressionStats();

      expect(stats.totalOriginalBytes).toBe(100 * 4); // 400 bytes
      expect(stats.totalCompressedBytes).toBeLessThan(stats.totalOriginalBytes);
      expect(stats.totalBytesSaved).toBe(stats.totalOriginalBytes - stats.totalCompressedBytes);
    });

    it('should calculate average compression ratio per tier', () => {
      const vec = randomEmbedding(128);

      service.compress(vec, 'hot');
      service.compress(vec, 'hot');

      const stats = service.getCompressionStats();
      // In TS fallback, all tiers get ~4x (Float32 -> Int8)
      expect(stats.avgCompressionRatio.hot).toBeGreaterThan(3.5);
      expect(stats.avgCompressionRatio.hot).toBeLessThan(4.5);
    });

    it('should reset stats correctly', () => {
      const vec = randomEmbedding(64);
      service.compress(vec, 'hot');

      service.resetStats();
      const stats = service.getCompressionStats();
      expect(stats.totalCompressed).toBe(0);
      expect(stats.totalBytesSaved).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Feature Flag Integration
  // --------------------------------------------------------------------------

  describe('feature flag integration', () => {
    it('should report disabled when flag is explicitly off', () => {
      setRuVectorFeatureFlags({ useTemporalCompression: false });
      expect(service.isEnabled()).toBe(false);
    });

    it('should report enabled when flag is on', () => {
      setRuVectorFeatureFlags({ useTemporalCompression: true });
      expect(service.isEnabled()).toBe(true);
    });

    it('should toggle based on flag changes', () => {
      setRuVectorFeatureFlags({ useTemporalCompression: false });
      expect(service.isEnabled()).toBe(false);

      setRuVectorFeatureFlags({ useTemporalCompression: true });
      expect(service.isEnabled()).toBe(true);

      setRuVectorFeatureFlags({ useTemporalCompression: false });
      expect(service.isEnabled()).toBe(false);
    });

    it('should still allow compression/decompression even when flag is off', () => {
      // The flag controls lifecycle integration, not the service itself.
      // Direct calls to compress/decompress always work.
      const vec = randomEmbedding(64);
      const compressed = service.compress(vec, 'hot');
      const restored = service.decompress(compressed);
      expect(restored.length).toBe(vec.length);
    });
  });

  // --------------------------------------------------------------------------
  // Memory Savings Calculation
  // --------------------------------------------------------------------------

  describe('memory savings', () => {
    it('should report ~75% savings for a batch of cold embeddings (TS fallback)', () => {
      const dim = 384;
      const count = 100;

      for (let i = 0; i < count; i++) {
        service.compress(randomEmbedding(dim), 'cold');
      }

      const stats = service.getCompressionStats();
      const expectedOriginalTotal = count * dim * 4; // 153,600 bytes
      expect(stats.totalOriginalBytes).toBe(expectedOriginalTotal);

      // All tiers save ~75% in TS fallback (4x compression: 1 - 1/4 = 0.75)
      const savingsPercent = stats.totalBytesSaved / stats.totalOriginalBytes;
      expect(savingsPercent).toBeGreaterThan(0.70);
      expect(savingsPercent).toBeLessThan(0.80);
    });

    it('should report ~75% savings for warm embeddings (TS fallback)', () => {
      const dim = 384;
      for (let i = 0; i < 50; i++) {
        service.compress(randomEmbedding(dim), 'warm');
      }

      const stats = service.getCompressionStats();
      const savingsPercent = stats.totalBytesSaved / stats.totalOriginalBytes;
      // Warm tier saves ~75% in TS fallback (4x compression)
      expect(savingsPercent).toBeGreaterThan(0.70);
      expect(savingsPercent).toBeLessThan(0.80);
    });

    it('should report ~75% savings for hot embeddings', () => {
      const dim = 384;
      for (let i = 0; i < 50; i++) {
        service.compress(randomEmbedding(dim), 'hot');
      }

      const stats = service.getCompressionStats();
      const savingsPercent = stats.totalBytesSaved / stats.totalOriginalBytes;
      // Hot tier saves ~75% (4x compression)
      expect(savingsPercent).toBeGreaterThan(0.70);
      expect(savingsPercent).toBeLessThan(0.80);
    });
  });

  // --------------------------------------------------------------------------
  // Cosine Similarity Utility
  // --------------------------------------------------------------------------

  describe('cosineSimilarity', () => {
    it('should return 1.0 for identical vectors', () => {
      const vec = randomEmbedding(64);
      expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0, 5);
    });

    it('should return -1.0 for opposite vectors', () => {
      const vec = randomEmbedding(64);
      const neg = new Float32Array(vec.length);
      for (let i = 0; i < vec.length; i++) neg[i] = -vec[i];
      expect(cosineSimilarity(vec, neg)).toBeCloseTo(-1.0, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      // e1 and e2 are orthogonal basis vectors
      const e1 = new Float32Array([1, 0, 0, 0]);
      const e2 = new Float32Array([0, 1, 0, 0]);
      expect(cosineSimilarity(e1, e2)).toBeCloseTo(0.0, 5);
    });

    it('should return 0 for empty vectors', () => {
      expect(cosineSimilarity(new Float32Array(0), new Float32Array(0))).toBe(0);
    });

    it('should return 0 for different-length vectors', () => {
      const a = new Float32Array([1, 2, 3]);
      const b = new Float32Array([1, 2]);
      expect(cosineSimilarity(a, b)).toBe(0);
    });

    it('should return 0 for zero vectors', () => {
      const zero = new Float32Array([0, 0, 0]);
      const vec = new Float32Array([1, 2, 3]);
      expect(cosineSimilarity(zero, vec)).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  describe('initialize', () => {
    it('should be safe to call multiple times', async () => {
      await service.initialize();
      await service.initialize(); // no-op
      // Should still work fine
      const vec = randomEmbedding(32);
      const compressed = service.compress(vec, 'hot');
      expect(compressed.tier).toBe('hot');
    });

    it('should indicate native module is not available in test env', async () => {
      await service.initialize();
      const stats = service.getCompressionStats();
      // In test environment, native module is not installed
      expect(stats.usingNative).toBe(false);
    });

    it('should report usesNativeBitPacking as false in test env', async () => {
      await service.initialize();
      const stats = service.getCompressionStats();
      expect(stats.usesNativeBitPacking).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Quantization Edge Cases
  // --------------------------------------------------------------------------

  describe('quantization edge cases', () => {
    it('should handle vectors with very small range', () => {
      const vec = new Float32Array([0.5, 0.50001, 0.49999, 0.5, 0.5]);
      const compressed = service.compress(vec, 'cold');
      const restored = service.decompress(compressed);

      expect(restored.length).toBe(5);
      // Values should be approximately 0.5
      for (let i = 0; i < restored.length; i++) {
        expect(restored[i]).toBeCloseTo(0.5, 2);
      }
    });

    it('should handle vectors with negative values', () => {
      const vec = new Float32Array([-1, -0.5, 0, 0.5, 1]);
      const compressed = service.compress(vec, 'hot');
      const restored = service.decompress(compressed);

      expect(restored.length).toBe(5);
      const similarity = cosineSimilarity(vec, restored);
      expect(similarity).toBeGreaterThan(0.99);
    });

    it('should handle large-dimension vectors (1024)', () => {
      const vec = randomEmbedding(1024);
      const compressed = service.compress(vec, 'warm');
      const restored = service.decompress(compressed);

      expect(restored.length).toBe(1024);
      const similarity = cosineSimilarity(vec, restored);
      expect(similarity).toBeGreaterThan(0.95);
    });

    it('should handle all-zero vectors', () => {
      const vec = constantEmbedding(64, 0);
      const compressed = service.compress(vec, 'cold');
      const restored = service.decompress(compressed);

      expect(restored.length).toBe(64);
      // All values should be 0 (or very close)
      for (let i = 0; i < restored.length; i++) {
        expect(Math.abs(restored[i])).toBeLessThan(0.01);
      }
    });
  });

  // --------------------------------------------------------------------------
  // TIER_CONFIG constants
  // --------------------------------------------------------------------------

  describe('TIER_CONFIG constants', () => {
    it('should define correct bit depths', () => {
      expect(TIER_CONFIG.hot.bitDepth).toBe(8);
      expect(TIER_CONFIG.warm.bitDepth).toBe(5);
      expect(TIER_CONFIG.cold.bitDepth).toBe(3);
    });

    it('should define correct integer ranges', () => {
      expect(TIER_CONFIG.hot.min).toBe(-128);
      expect(TIER_CONFIG.hot.max).toBe(127);

      expect(TIER_CONFIG.warm.min).toBe(-16);
      expect(TIER_CONFIG.warm.max).toBe(15);

      expect(TIER_CONFIG.cold.min).toBe(-4);
      expect(TIER_CONFIG.cold.max).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // EXPECTED_COMPRESSION_RATIOS
  // --------------------------------------------------------------------------

  describe('THEORETICAL_COMPRESSION_RATIOS', () => {
    it('should define theoretical ratios for all tiers', () => {
      expect(THEORETICAL_COMPRESSION_RATIOS.hot).toBe(4.0);
      expect(THEORETICAL_COMPRESSION_RATIOS.warm).toBe(6.4);
      expect(THEORETICAL_COMPRESSION_RATIOS.cold).toBe(10.7);
    });

    it('should still export EXPECTED_COMPRESSION_RATIOS as backwards-compatible alias', () => {
      expect(EXPECTED_COMPRESSION_RATIOS.hot).toBe(4.0);
      expect(EXPECTED_COMPRESSION_RATIOS.warm).toBe(6.4);
      expect(EXPECTED_COMPRESSION_RATIOS.cold).toBe(10.7);
    });

    it('should define ACTUAL_FALLBACK_RATIO as 4.0', () => {
      expect(ACTUAL_FALLBACK_RATIO).toBe(4.0);
    });
  });

  // --------------------------------------------------------------------------
  // Threshold constants
  // --------------------------------------------------------------------------

  describe('threshold constants', () => {
    it('should set HOT threshold to 7 days', () => {
      expect(HOT_THRESHOLD_DAYS).toBe(7);
    });

    it('should set WARM threshold to 30 days', () => {
      expect(WARM_THRESHOLD_DAYS).toBe(30);
    });
  });
});
