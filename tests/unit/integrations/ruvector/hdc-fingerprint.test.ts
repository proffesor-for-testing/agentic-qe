/**
 * R1: HDC Pattern Fingerprinting - Unit Tests
 *
 * Tests determinism, distance properties, XOR binding associativity,
 * similarity range, batch consistency, and packed-bit storage correctness.
 */

import { describe, it, expect } from 'vitest';
import {
  HdcFingerprinter,
  createHdcFingerprinter,
  type PatternFingerprint,
  type PatternInput,
} from '../../../../src/integrations/ruvector/hdc-fingerprint';

// ============================================================================
// Test Fixtures
// ============================================================================

const PATTERN_A: PatternInput = { id: 'p1', domain: 'security', type: 'xss' };
const PATTERN_B: PatternInput = { id: 'p2', domain: 'api', type: 'flaky' };
const PATTERN_C: PatternInput = { id: 'p3', domain: 'database', type: 'slow', content: 'SELECT *' };

// ============================================================================
// Tests
// ============================================================================

describe('HdcFingerprinter', () => {
  const hdc = createHdcFingerprinter({ dimensions: 10000 });

  // --------------------------------------------------------------------------
  // 1. Determinism
  // --------------------------------------------------------------------------

  describe('determinism', () => {
    it('same input produces identical fingerprints', () => {
      const fp1 = hdc.fingerprint(PATTERN_A);
      const fp2 = hdc.fingerprint(PATTERN_A);

      expect(fp1.hash).toBe(fp2.hash);
      expect(fp1.dimensions).toBe(fp2.dimensions);
      expect(fp1.vector).toEqual(fp2.vector);
    });

    it('deterministic across separate instances with same config', () => {
      const hdc2 = createHdcFingerprinter({ dimensions: 10000 });
      const fp1 = hdc.fingerprint(PATTERN_A);
      const fp2 = hdc2.fingerprint(PATTERN_A);

      expect(fp1.vector).toEqual(fp2.vector);
      expect(fp1.hash).toBe(fp2.hash);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Distance Properties
  // --------------------------------------------------------------------------

  describe('distance properties', () => {
    it('hammingDistance(A, A) === 0', () => {
      const fp = hdc.fingerprint(PATTERN_A);
      expect(hdc.hammingDistance(fp.vector, fp.vector)).toBe(0);
    });

    it('hammingDistance(A, random) ≈ dimensions/2', () => {
      const fpA = hdc.fingerprint(PATTERN_A);
      const fpB = hdc.fingerprint(PATTERN_B);
      const dist = hdc.hammingDistance(fpA.vector, fpB.vector);

      // For 10K dimensions, random distance should be ~5000
      // Allow ±10% tolerance (4500 to 5500)
      expect(dist).toBeGreaterThan(4000);
      expect(dist).toBeLessThan(6000);
    });

    it('hammingDistance is symmetric', () => {
      const fpA = hdc.fingerprint(PATTERN_A);
      const fpB = hdc.fingerprint(PATTERN_B);

      expect(hdc.hammingDistance(fpA.vector, fpB.vector))
        .toBe(hdc.hammingDistance(fpB.vector, fpA.vector));
    });

    it('throws for mismatched vector lengths', () => {
      const short = new Uint8Array(10);
      const long = new Uint8Array(20);

      expect(() => hdc.hammingDistance(short, long)).toThrow('different lengths');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Associativity
  // --------------------------------------------------------------------------

  describe('XOR binding associativity', () => {
    it('bind(A, bind(B, C)) deep-equals bind(bind(A, B), C)', () => {
      const fpA = hdc.fingerprint(PATTERN_A);
      const fpB = hdc.fingerprint(PATTERN_B);
      const fpC = hdc.fingerprint(PATTERN_C);

      const leftAssoc = hdc.compositionalBind(
        hdc.compositionalBind(fpA.vector, fpB.vector),
        fpC.vector
      );
      const rightAssoc = hdc.compositionalBind(
        fpA.vector,
        hdc.compositionalBind(fpB.vector, fpC.vector)
      );

      expect(leftAssoc).toEqual(rightAssoc);
    });

    it('bind(A, A) produces zero vector', () => {
      const fp = hdc.fingerprint(PATTERN_A);
      const bound = hdc.compositionalBind(fp.vector, fp.vector);

      // XOR with self should be all zeros
      const allZero = bound.every((b) => b === 0);
      expect(allZero).toBe(true);
    });

    it('throws for mismatched vector lengths', () => {
      const short = new Uint8Array(10);
      const long = new Uint8Array(20);

      expect(() => hdc.compositionalBind(short, long)).toThrow('different lengths');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Similarity Range
  // --------------------------------------------------------------------------

  describe('similarity range', () => {
    it('similarity is always in [0, 1]', () => {
      const fpA = hdc.fingerprint(PATTERN_A);
      const fpB = hdc.fingerprint(PATTERN_B);
      const fpC = hdc.fingerprint(PATTERN_C);

      const simAA = hdc.similarity(fpA.vector, fpA.vector);
      const simAB = hdc.similarity(fpA.vector, fpB.vector);
      const simBC = hdc.similarity(fpB.vector, fpC.vector);

      expect(simAA).toBeGreaterThanOrEqual(0);
      expect(simAA).toBeLessThanOrEqual(1);
      expect(simAB).toBeGreaterThanOrEqual(0);
      expect(simAB).toBeLessThanOrEqual(1);
      expect(simBC).toBeGreaterThanOrEqual(0);
      expect(simBC).toBeLessThanOrEqual(1);
    });

    it('similarity(A, A) === 1.0 (identical)', () => {
      const fp = hdc.fingerprint(PATTERN_A);
      expect(hdc.similarity(fp.vector, fp.vector)).toBe(1);
    });

    it('similarity(A, random) ≈ 0.5 (random)', () => {
      const fpA = hdc.fingerprint(PATTERN_A);
      const fpB = hdc.fingerprint(PATTERN_B);
      const sim = hdc.similarity(fpA.vector, fpB.vector);

      // For random vectors, similarity should be near 0.5
      expect(sim).toBeGreaterThan(0.35);
      expect(sim).toBeLessThan(0.65);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Batch Consistency
  // --------------------------------------------------------------------------

  describe('batch consistency', () => {
    it('batchFingerprint matches individual fingerprint calls', () => {
      const patterns = [PATTERN_A, PATTERN_B, PATTERN_C];
      const batchResults = hdc.batchFingerprint(patterns);
      const individualResults = patterns.map((p) => hdc.fingerprint(p));

      expect(batchResults.length).toBe(individualResults.length);

      for (let i = 0; i < batchResults.length; i++) {
        expect(batchResults[i].vector).toEqual(individualResults[i].vector);
        expect(batchResults[i].hash).toBe(individualResults[i].hash);
        expect(batchResults[i].dimensions).toBe(individualResults[i].dimensions);
      }
    });

    it('batchFingerprint of empty array returns empty array', () => {
      expect(hdc.batchFingerprint([])).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Different patterns produce different fingerprints
  // --------------------------------------------------------------------------

  describe('uniqueness', () => {
    it('patterns with different ids have hammingDistance > 0', () => {
      const fpA = hdc.fingerprint(PATTERN_A);
      const fpB = hdc.fingerprint(PATTERN_B);

      expect(hdc.hammingDistance(fpA.vector, fpB.vector)).toBeGreaterThan(0);
    });

    it('patterns with different ids produce different hashes', () => {
      const fpA = hdc.fingerprint(PATTERN_A);
      const fpB = hdc.fingerprint(PATTERN_B);

      expect(fpA.hash).not.toBe(fpB.hash);
    });

    it('content difference produces different fingerprint', () => {
      const withContent = hdc.fingerprint({ id: 'x', domain: 'd', type: 't', content: 'abc' });
      const noContent = hdc.fingerprint({ id: 'x', domain: 'd', type: 't' });

      expect(hdc.hammingDistance(withContent.vector, noContent.vector)).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Packed bit storage
  // --------------------------------------------------------------------------

  describe('packed bit storage', () => {
    it('vector length === Math.ceil(dimensions / 8) for default 10000', () => {
      const fp = hdc.fingerprint(PATTERN_A);
      expect(fp.vector.length).toBe(Math.ceil(10000 / 8)); // 1250
    });

    it('vector length is correct for non-byte-aligned dimensions', () => {
      const hdc13 = createHdcFingerprinter({ dimensions: 13 });
      const fp = hdc13.fingerprint(PATTERN_A);
      expect(fp.vector.length).toBe(Math.ceil(13 / 8)); // 2
    });

    it('dimensions field matches config', () => {
      const fp = hdc.fingerprint(PATTERN_A);
      expect(fp.dimensions).toBe(10000);

      const hdc256 = createHdcFingerprinter({ dimensions: 256 });
      const fp256 = hdc256.fingerprint(PATTERN_A);
      expect(fp256.dimensions).toBe(256);
    });

    it('trailing bits are masked for non-byte-aligned dimensions', () => {
      // 13 bits = 1 full byte + 5 used bits in second byte
      // The upper 3 bits of the second byte should be 0
      const hdc13 = createHdcFingerprinter({ dimensions: 13, seed: 42 });
      const fp = hdc13.fingerprint(PATTERN_A);

      // Bits 5-7 of byte[1] should be zero (mask = 0b00011111 = 0x1f)
      expect(fp.vector[1] & 0xe0).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('constructor rejects non-positive dimensions', () => {
      expect(() => createHdcFingerprinter({ dimensions: 0 })).toThrow('positive');
      expect(() => createHdcFingerprinter({ dimensions: -1 })).toThrow('positive');
    });

    it('works with very small dimensions (1 bit)', () => {
      const hdc1 = createHdcFingerprinter({ dimensions: 1 });
      const fp = hdc1.fingerprint(PATTERN_A);
      expect(fp.vector.length).toBe(1);
      expect(fp.dimensions).toBe(1);
    });

    it('hash field is a non-empty hex string', () => {
      const fp = hdc.fingerprint(PATTERN_A);
      expect(fp.hash.length).toBeGreaterThan(0);
      expect(fp.hash).toMatch(/^[0-9a-f]+$/);
    });

    it('custom seed produces different fingerprint than default', () => {
      const hdcSeeded = createHdcFingerprinter({ dimensions: 10000, seed: 99999 });
      const fpDefault = hdc.fingerprint(PATTERN_A);
      const fpSeeded = hdcSeeded.fingerprint(PATTERN_A);

      expect(hdc.hammingDistance(fpDefault.vector, fpSeeded.vector)).toBeGreaterThan(0);
    });
  });
});
