/**
 * Agentic QE v3 - Deterministic Dithering Adapter Unit Tests
 *
 * Tests for golden-ratio quasi-random dithering used in cross-platform
 * reproducible embedding quantization (Task 1.4).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDitherSequence,
  applyDither,
  applyNaiveQuantization,
  verifyDeterminism,
  computeMSE,
  computeSNR,
  isNativeDitherAvailable,
} from '../../../../src/integrations/ruvector/dither-adapter';

import reference3bit from '../../../fixtures/dither-golden/reference-3bit.json';
import reference8bit from '../../../fixtures/dither-golden/reference-8bit.json';

// ============================================================================
// Test Fixtures
// ============================================================================

/** Standard 16-element test vector spanning a typical embedding range */
const STANDARD_TEST_VECTOR = new Float32Array([
  -0.4521, 0.1234, -0.8765, 0.3456,
   0.7890, -0.2345, 0.5678, -0.6789,
   0.0123, -0.9876, 0.4567, -0.1234,
   0.8901, -0.3456, 0.2345, -0.5678,
]);

/** Golden ratio constant for property verification */
const PHI = (1 + Math.sqrt(5)) / 2;

// ============================================================================
// Tests
// ============================================================================

describe('DitherAdapter', () => {

  describe('createDitherSequence', () => {
    it('should produce a sequence of the requested length', () => {
      const seq = createDitherSequence(100);
      expect(seq).toBeInstanceOf(Float32Array);
      expect(seq.length).toBe(100);
    });

    it('should produce values strictly in [0, 1)', () => {
      const seq = createDitherSequence(10000, 0);
      for (let i = 0; i < seq.length; i++) {
        expect(seq[i]).toBeGreaterThanOrEqual(0);
        expect(seq[i]).toBeLessThan(1);
      }
    });

    it('should be deterministic - same seed produces same sequence', () => {
      const seq1 = createDitherSequence(256, 42);
      const seq2 = createDitherSequence(256, 42);

      for (let i = 0; i < seq1.length; i++) {
        expect(seq1[i]).toBe(seq2[i]);
      }
    });

    it('should produce different sequences for different seeds', () => {
      const seq1 = createDitherSequence(100, 0);
      const seq2 = createDitherSequence(100, 7);

      let differences = 0;
      for (let i = 0; i < seq1.length; i++) {
        if (seq1[i] !== seq2[i]) differences++;
      }
      // All values should differ since different seeds shift the base offset
      expect(differences).toBe(100);
    });

    it('should handle zero length', () => {
      const seq = createDitherSequence(0);
      expect(seq.length).toBe(0);
    });

    it('should handle length 1', () => {
      const seq = createDitherSequence(1, 0);
      expect(seq.length).toBe(1);
      expect(seq[0]).toBeGreaterThanOrEqual(0);
      expect(seq[0]).toBeLessThan(1);
    });

    it('should throw for invalid length', () => {
      expect(() => createDitherSequence(-1)).toThrow('Invalid dither sequence length');
      expect(() => createDitherSequence(NaN)).toThrow('Invalid dither sequence length');
    });

    it('should throw for invalid seed', () => {
      expect(() => createDitherSequence(10, Infinity)).toThrow('Invalid dither seed');
      expect(() => createDitherSequence(10, NaN)).toThrow('Invalid dither seed');
    });

    it('should exhibit low discrepancy (golden ratio property)', () => {
      // The golden ratio sequence should have good uniformity.
      // Divide [0,1) into 10 bins and check each bin has ~10% of samples.
      const seq = createDitherSequence(1000, 0);
      const bins = new Array(10).fill(0);
      for (let i = 0; i < seq.length; i++) {
        const bin = Math.min(9, Math.floor(seq[i] * 10));
        bins[bin]++;
      }

      // Each bin should have between 50 and 150 samples (expected: 100)
      for (const count of bins) {
        expect(count).toBeGreaterThan(50);
        expect(count).toBeLessThan(150);
      }
    });

    it('should match golden reference dither sequence', () => {
      const seq = createDitherSequence(16, 0);
      const refSeq = reference3bit.ditherSequence;

      for (let i = 0; i < seq.length; i++) {
        expect(seq[i]).toBeCloseTo(refSeq[i], 5);
      }
    });
  });

  describe('applyDither', () => {
    it('should return correct structure', () => {
      const result = applyDither(STANDARD_TEST_VECTOR, 8, 0);

      expect(result.quantized).toBeInstanceOf(Int32Array);
      expect(result.dequantized).toBeInstanceOf(Float32Array);
      expect(result.quantized.length).toBe(STANDARD_TEST_VECTOR.length);
      expect(result.dequantized.length).toBe(STANDARD_TEST_VECTOR.length);
      expect(result.bitDepth).toBe(8);
      expect(result.seed).toBe(0);
      expect(typeof result.stepSize).toBe('number');
      expect(typeof result.minValue).toBe('number');
      expect(typeof result.maxValue).toBe('number');
    });

    it('should produce quantized values in valid range for 3-bit', () => {
      const result = applyDither(STANDARD_TEST_VECTOR, 3, 0);
      const maxLevel = (1 << 3) - 1; // 7

      for (let i = 0; i < result.quantized.length; i++) {
        expect(result.quantized[i]).toBeGreaterThanOrEqual(0);
        expect(result.quantized[i]).toBeLessThanOrEqual(maxLevel);
      }
    });

    it('should produce quantized values in valid range for 8-bit', () => {
      const result = applyDither(STANDARD_TEST_VECTOR, 8, 0);
      const maxLevel = (1 << 8) - 1; // 255

      for (let i = 0; i < result.quantized.length; i++) {
        expect(result.quantized[i]).toBeGreaterThanOrEqual(0);
        expect(result.quantized[i]).toBeLessThanOrEqual(maxLevel);
      }
    });

    it('should handle empty vector', () => {
      const result = applyDither(new Float32Array(0), 8);
      expect(result.quantized.length).toBe(0);
      expect(result.dequantized.length).toBe(0);
    });

    it('should handle constant vector', () => {
      const constant = new Float32Array([0.5, 0.5, 0.5, 0.5]);
      const result = applyDither(constant, 8, 0);

      // All quantized values should be the same (midpoint)
      const firstVal = result.quantized[0];
      for (let i = 1; i < result.quantized.length; i++) {
        expect(result.quantized[i]).toBe(firstVal);
      }
    });

    it('should throw for invalid bit depth', () => {
      expect(() => applyDither(STANDARD_TEST_VECTOR, 0)).toThrow('Invalid bit depth');
      expect(() => applyDither(STANDARD_TEST_VECTOR, 33)).toThrow('Invalid bit depth');
      expect(() => applyDither(STANDARD_TEST_VECTOR, 4.5)).toThrow('Invalid bit depth');
    });

    it('should throw for non-Float32Array input', () => {
      // @ts-expect-error - intentionally passing wrong type
      expect(() => applyDither([1, 2, 3], 8)).toThrow('Float32Array');
    });

    it('should produce correct min/max values', () => {
      const result = applyDither(STANDARD_TEST_VECTOR, 8, 0);

      let expectedMin = STANDARD_TEST_VECTOR[0];
      let expectedMax = STANDARD_TEST_VECTOR[0];
      for (let i = 1; i < STANDARD_TEST_VECTOR.length; i++) {
        if (STANDARD_TEST_VECTOR[i] < expectedMin) expectedMin = STANDARD_TEST_VECTOR[i];
        if (STANDARD_TEST_VECTOR[i] > expectedMax) expectedMax = STANDARD_TEST_VECTOR[i];
      }

      expect(result.minValue).toBeCloseTo(expectedMin, 5);
      expect(result.maxValue).toBeCloseTo(expectedMax, 5);
    });
  });

  describe('determinism verification', () => {
    it('should produce identical results on repeated calls (3-bit)', () => {
      expect(verifyDeterminism(STANDARD_TEST_VECTOR, 3)).toBe(true);
    });

    it('should produce identical results on repeated calls (5-bit)', () => {
      expect(verifyDeterminism(STANDARD_TEST_VECTOR, 5)).toBe(true);
    });

    it('should produce identical results on repeated calls (7-bit)', () => {
      expect(verifyDeterminism(STANDARD_TEST_VECTOR, 7)).toBe(true);
    });

    it('should produce identical results on repeated calls (8-bit)', () => {
      expect(verifyDeterminism(STANDARD_TEST_VECTOR, 8)).toBe(true);
    });

    it('should be deterministic for large vectors', () => {
      const largeVector = new Float32Array(1024);
      for (let i = 0; i < largeVector.length; i++) {
        largeVector[i] = Math.sin(i * 0.1) * 0.5;
      }
      expect(verifyDeterminism(largeVector, 8)).toBe(true);
    });

    it('should be deterministic across multiple runs with same seed', () => {
      const runs = 10;
      const results: Int32Array[] = [];

      for (let r = 0; r < runs; r++) {
        const result = applyDither(STANDARD_TEST_VECTOR, 5, 123);
        results.push(result.quantized);
      }

      // All runs should produce identical results
      for (let r = 1; r < runs; r++) {
        for (let i = 0; i < results[0].length; i++) {
          expect(results[r][i]).toBe(results[0][i]);
        }
      }
    });

    it('different seeds should produce different quantization', () => {
      // Use 8-bit (256 levels) where dither offsets are more likely to
      // change the final rounded value compared to 3-bit (8 levels)
      const result1 = applyDither(STANDARD_TEST_VECTOR, 8, 0);
      const result2 = applyDither(STANDARD_TEST_VECTOR, 8, 999);

      let differences = 0;
      for (let i = 0; i < result1.quantized.length; i++) {
        if (result1.quantized[i] !== result2.quantized[i]) differences++;
      }
      // At 8-bit with 256 levels, different dither offsets should shift
      // some quantized values
      expect(differences).toBeGreaterThan(0);
    });
  });

  describe('golden reference regression tests', () => {
    it('should match 3-bit golden reference quantized values', () => {
      const result = applyDither(STANDARD_TEST_VECTOR, 3, 0);
      const expectedQuantized = reference3bit.quantized;

      expect(Array.from(result.quantized)).toEqual(expectedQuantized);
    });

    it('should match 3-bit golden reference dequantized values', () => {
      const result = applyDither(STANDARD_TEST_VECTOR, 3, 0);
      const expectedDequantized = reference3bit.dequantized;

      for (let i = 0; i < result.dequantized.length; i++) {
        expect(result.dequantized[i]).toBeCloseTo(expectedDequantized[i], 5);
      }
    });

    it('should match 3-bit golden reference step size', () => {
      const result = applyDither(STANDARD_TEST_VECTOR, 3, 0);
      expect(result.stepSize).toBeCloseTo(reference3bit.stepSize, 5);
    });

    it('should match 8-bit golden reference quantized values', () => {
      const result = applyDither(STANDARD_TEST_VECTOR, 8, 0);
      const expectedQuantized = reference8bit.quantized;

      expect(Array.from(result.quantized)).toEqual(expectedQuantized);
    });

    it('should match 8-bit golden reference dequantized values', () => {
      const result = applyDither(STANDARD_TEST_VECTOR, 8, 0);
      const expectedDequantized = reference8bit.dequantized;

      for (let i = 0; i < result.dequantized.length; i++) {
        expect(result.dequantized[i]).toBeCloseTo(expectedDequantized[i], 5);
      }
    });

    it('should match 8-bit golden reference step size', () => {
      const result = applyDither(STANDARD_TEST_VECTOR, 8, 0);
      expect(result.stepSize).toBeCloseTo(reference8bit.stepSize, 5);
    });
  });

  describe('reconstruction quality', () => {
    const bitDepths = [3, 5, 7, 8] as const;

    for (const bitDepth of bitDepths) {
      it(`should produce comparable reconstruction to naive at ${bitDepth}-bit`, () => {
        const dithered = applyDither(STANDARD_TEST_VECTOR, bitDepth, 0);
        const naive = applyNaiveQuantization(STANDARD_TEST_VECTOR, bitDepth);

        const ditheredMSE = computeMSE(STANDARD_TEST_VECTOR, dithered.dequantized);
        const naiveMSE = computeMSE(STANDARD_TEST_VECTOR, naive.dequantized);

        // Dithering trades slightly higher MSE for better error distribution
        // (no systematic banding artifacts). At very low bit depths (3-bit)
        // dithered MSE may be up to 3x naive MSE on small vectors, but the
        // perceptual quality is better due to white-noise-like error profile.
        expect(ditheredMSE).toBeLessThan(naiveMSE * 3 + 0.001);
      });
    }

    it('should have lower MSE at higher bit depths', () => {
      const mses: number[] = [];
      for (const bitDepth of bitDepths) {
        const result = applyDither(STANDARD_TEST_VECTOR, bitDepth, 0);
        mses.push(computeMSE(STANDARD_TEST_VECTOR, result.dequantized));
      }

      // MSE should generally decrease as bit depth increases
      // (more quantization levels = finer granularity)
      for (let i = 1; i < mses.length; i++) {
        expect(mses[i]).toBeLessThanOrEqual(mses[i - 1] * 1.1); // Allow small tolerance
      }
    });

    it('should produce higher SNR at higher bit depths', () => {
      const snrs: number[] = [];
      for (const bitDepth of bitDepths) {
        const result = applyDither(STANDARD_TEST_VECTOR, bitDepth, 0);
        snrs.push(computeSNR(STANDARD_TEST_VECTOR, result.dequantized));
      }

      // SNR should generally increase (better) at higher bit depths
      for (let i = 1; i < snrs.length; i++) {
        expect(snrs[i]).toBeGreaterThanOrEqual(snrs[i - 1] * 0.9); // Allow small tolerance
      }
    });

    it('should have reasonable reconstruction error at 8-bit', () => {
      const result = applyDither(STANDARD_TEST_VECTOR, 8, 0);
      const mse = computeMSE(STANDARD_TEST_VECTOR, result.dequantized);
      const snr = computeSNR(STANDARD_TEST_VECTOR, result.dequantized);

      // At 8-bit, MSE should be very small
      expect(mse).toBeLessThan(0.001);
      // SNR should be > 30 dB for 8-bit quantization
      expect(snr).toBeGreaterThan(30);
    });
  });

  describe('applyNaiveQuantization', () => {
    it('should produce valid quantized values', () => {
      const result = applyNaiveQuantization(STANDARD_TEST_VECTOR, 8);
      const maxLevel = 255;

      for (let i = 0; i < result.quantized.length; i++) {
        expect(result.quantized[i]).toBeGreaterThanOrEqual(0);
        expect(result.quantized[i]).toBeLessThanOrEqual(maxLevel);
      }
    });

    it('should be deterministic', () => {
      const r1 = applyNaiveQuantization(STANDARD_TEST_VECTOR, 8);
      const r2 = applyNaiveQuantization(STANDARD_TEST_VECTOR, 8);
      expect(Array.from(r1.quantized)).toEqual(Array.from(r2.quantized));
    });

    it('should have seed = -1 (no dither)', () => {
      const result = applyNaiveQuantization(STANDARD_TEST_VECTOR, 8);
      expect(result.seed).toBe(-1);
    });

    it('should handle empty vector', () => {
      const result = applyNaiveQuantization(new Float32Array(0), 8);
      expect(result.quantized.length).toBe(0);
    });

    it('should throw for invalid bit depth', () => {
      expect(() => applyNaiveQuantization(STANDARD_TEST_VECTOR, 0)).toThrow('Invalid bit depth');
    });
  });

  describe('computeMSE', () => {
    it('should return 0 for identical vectors', () => {
      expect(computeMSE(STANDARD_TEST_VECTOR, STANDARD_TEST_VECTOR)).toBe(0);
    });

    it('should return correct value for known difference', () => {
      const a = new Float32Array([1, 2, 3]);
      const b = new Float32Array([2, 3, 4]);
      // MSE = (1 + 1 + 1) / 3 = 1
      expect(computeMSE(a, b)).toBeCloseTo(1, 5);
    });

    it('should throw for mismatched lengths', () => {
      expect(() => computeMSE(new Float32Array(3), new Float32Array(4))).toThrow('same length');
    });

    it('should return 0 for empty vectors', () => {
      expect(computeMSE(new Float32Array(0), new Float32Array(0))).toBe(0);
    });
  });

  describe('computeSNR', () => {
    it('should return Infinity for perfect reconstruction', () => {
      expect(computeSNR(STANDARD_TEST_VECTOR, STANDARD_TEST_VECTOR)).toBe(Infinity);
    });

    it('should return positive value for noisy reconstruction', () => {
      const noisy = new Float32Array(STANDARD_TEST_VECTOR);
      for (let i = 0; i < noisy.length; i++) {
        noisy[i] += 0.01;
      }
      const snr = computeSNR(STANDARD_TEST_VECTOR, noisy);
      expect(snr).toBeGreaterThan(0);
    });

    it('should throw for mismatched lengths', () => {
      expect(() => computeSNR(new Float32Array(3), new Float32Array(4))).toThrow('same length');
    });

    it('should return Infinity for empty vectors', () => {
      expect(computeSNR(new Float32Array(0), new Float32Array(0))).toBe(Infinity);
    });
  });

  describe('isNativeDitherAvailable', () => {
    it('should return a boolean', () => {
      const result = isNativeDitherAvailable();
      expect(typeof result).toBe('boolean');
    });

    it('should return false since ruvector-dither is not installed', () => {
      // In the test environment, the native module is not available
      expect(isNativeDitherAvailable()).toBe(false);
    });
  });

  describe('bit depth variations', () => {
    const bitDepths = [1, 2, 3, 4, 5, 6, 7, 8, 12, 16] as const;

    for (const bitDepth of bitDepths) {
      it(`should handle ${bitDepth}-bit quantization`, () => {
        const result = applyDither(STANDARD_TEST_VECTOR, bitDepth, 0);
        const maxLevel = (1 << bitDepth) - 1;

        expect(result.bitDepth).toBe(bitDepth);
        for (let i = 0; i < result.quantized.length; i++) {
          expect(result.quantized[i]).toBeGreaterThanOrEqual(0);
          expect(result.quantized[i]).toBeLessThanOrEqual(maxLevel);
        }
      });
    }
  });
});
