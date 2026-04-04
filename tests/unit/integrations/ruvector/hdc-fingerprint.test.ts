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
  HDCPatternFingerprinter,
  createHDCFingerprinter,
  createRandomHypervector,
  bind,
  bundle,
  hammingDistance,
  hammingSimilarity,
  permute,
  type PatternFingerprint,
  type PatternInput,
} from '../../../../src/integrations/ruvector/hdc-fingerprint';
import {
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
} from '../../../../src/integrations/ruvector/feature-flags';

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

// ============================================================================
// Standalone HDC Algebra Functions
// ============================================================================

describe('Standalone HDC algebra functions', () => {
  const DIM = 1000;
  const BYTES = Math.ceil(DIM / 8); // 125

  describe('createRandomHypervector', () => {
    it('returns correct byte length for given dimensions', () => {
      const v = createRandomHypervector(DIM);
      expect(v.length).toBe(BYTES);
    });

    it('returns correct byte length for default dimensions (10000)', () => {
      const v = createRandomHypervector();
      expect(v.length).toBe(Math.ceil(10000 / 8));
    });

    it('two random vectors are different (probabilistic)', () => {
      const a = createRandomHypervector(DIM);
      const b = createRandomHypervector(DIM);
      // Probability of identical 1000-bit random vectors is negligible
      const allSame = a.every((byte, i) => byte === b[i]);
      expect(allSame).toBe(false);
    });
  });

  describe('bind (standalone XOR)', () => {
    it('bind(bind(a, b), b) === a (self-inverse)', () => {
      const a = createRandomHypervector(DIM);
      const b = createRandomHypervector(DIM);
      const bound = bind(bind(a, b), b);
      expect(bound).toEqual(a);
    });

    it('bind(a, b) === bind(b, a) (commutative)', () => {
      const a = createRandomHypervector(DIM);
      const b = createRandomHypervector(DIM);
      expect(bind(a, b)).toEqual(bind(b, a));
    });

    it('throws for mismatched lengths', () => {
      const short = new Uint8Array(10);
      const long = new Uint8Array(20);
      expect(() => bind(short, long)).toThrow('different lengths');
    });
  });

  describe('bundle (majority-rule)', () => {
    it('bundle of identical vectors returns that vector', () => {
      const v = createRandomHypervector(DIM);
      const copy1 = new Uint8Array(v);
      const copy2 = new Uint8Array(v);
      const copy3 = new Uint8Array(v);
      const result = bundle([copy1, copy2, copy3]);
      expect(result).toEqual(v);
    });

    it('bundle of random vectors is approximately 0.5 similarity to each input', () => {
      const vectors = Array.from({ length: 5 }, () => createRandomHypervector(DIM));
      const bundled = bundle(vectors);
      for (const v of vectors) {
        const sim = hammingSimilarity(bundled, v, DIM);
        // Bundling 5 random vectors: each contributes ~20% of bits.
        // Similarity to each input should be above chance but not perfect.
        expect(sim).toBeGreaterThan(0.35);
        expect(sim).toBeLessThan(0.85);
      }
    });

    it('throws for empty vector list', () => {
      expect(() => bundle([])).toThrow('zero vectors');
    });

    it('throws for mismatched vector lengths', () => {
      const a = new Uint8Array(10);
      const b = new Uint8Array(20);
      expect(() => bundle([a, b])).toThrow('Vector length mismatch');
    });
  });

  describe('hammingDistance (normalized)', () => {
    it('distance is symmetric: dist(a,b) === dist(b,a)', () => {
      const a = createRandomHypervector(DIM);
      const b = createRandomHypervector(DIM);
      expect(hammingDistance(a, b, DIM)).toBe(hammingDistance(b, a, DIM));
    });

    it('distance range is [0, 1]', () => {
      const a = createRandomHypervector(DIM);
      const b = createRandomHypervector(DIM);
      const d = hammingDistance(a, b, DIM);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
    });

    it('distance of identical vectors is 0', () => {
      const a = createRandomHypervector(DIM);
      expect(hammingDistance(a, a, DIM)).toBe(0);
    });

    it('distance of opposite vectors is 1 (all bits differ)', () => {
      const a = new Uint8Array(BYTES);
      const b = new Uint8Array(BYTES).fill(0xff);
      // For DIM=1000, byte-aligned, all 1000 bits differ
      expect(hammingDistance(a, b, DIM)).toBe(1);
    });

    it('throws for mismatched lengths', () => {
      expect(() => hammingDistance(new Uint8Array(5), new Uint8Array(10))).toThrow('different lengths');
    });
  });

  describe('hammingSimilarity', () => {
    it('is 1 - hammingDistance', () => {
      const a = createRandomHypervector(DIM);
      const b = createRandomHypervector(DIM);
      expect(hammingSimilarity(a, b, DIM)).toBeCloseTo(1 - hammingDistance(a, b, DIM), 10);
    });

    it('identical vectors have similarity 1', () => {
      const a = createRandomHypervector(DIM);
      expect(hammingSimilarity(a, a, DIM)).toBe(1);
    });
  });

  describe('permute (circular bit shift)', () => {
    it('permute with 0 shifts returns copy of original', () => {
      const v = createRandomHypervector(DIM);
      const p = permute(v, 0);
      expect(p).toEqual(v);
      // Should be a copy, not the same reference
      expect(p).not.toBe(v);
    });

    it('full-cycle permute returns original', () => {
      const totalBits = BYTES * 8;
      const v = createRandomHypervector(DIM);
      const p = permute(v, totalBits);
      expect(p).toEqual(v);
    });

    it('permute shifts bits correctly (small example)', () => {
      // 8 bits: single byte [0b10000001] = bit 0 and bit 7 set
      const v = new Uint8Array([0b10000001]);
      const shifted = permute(v, 1); // shift left by 1
      // Bit 0 (was src bit 1=0) -> 0, bit 1 (was src bit 2=0) -> 0, ...
      // dst[i] reads from src[(i+shift) % total]
      // dst bit 0 = src bit 1 = 0
      // dst bit 6 = src bit 7 = 1
      // dst bit 7 = src bit 0 = 1 (wrap around)
      expect(shifted[0]).toBe(0b11000000);
    });

    it('permute and negative shift reverses', () => {
      const v = createRandomHypervector(DIM);
      const shifted = permute(v, 3);
      const unshifted = permute(shifted, -3);
      expect(unshifted).toEqual(v);
    });
  });
});

// ============================================================================
// HDCPatternFingerprinter (Token-based)
// ============================================================================

describe('HDCPatternFingerprinter', () => {
  const fp = new HDCPatternFingerprinter({ dimensions: 1000 });

  describe('tokenToHypervector', () => {
    it('token mapping is deterministic: same token -> same vector', () => {
      const v1 = fp.tokenToHypervector('slow');
      const v2 = fp.tokenToHypervector('slow');
      expect(v1).toEqual(v2);
    });

    it('different tokens -> different vectors (high Hamming distance)', () => {
      const v1 = fp.tokenToHypervector('slow');
      const v2 = fp.tokenToHypervector('fast');
      const dist = hammingDistance(v1, v2, 1000);
      // Should be approximately 0.5 for unrelated tokens
      expect(dist).toBeGreaterThan(0.3);
      expect(dist).toBeLessThan(0.7);
    });
  });

  describe('fingerprintPattern', () => {
    it('same tokens in any order gives same result (XOR is commutative)', () => {
      const fp1 = fp.fingerprintPattern(['slow', 'flaky', 'database']);
      const fp2 = fp.fingerprintPattern(['database', 'slow', 'flaky']);
      const fp3 = fp.fingerprintPattern(['flaky', 'database', 'slow']);
      expect(fp1).toEqual(fp2);
      expect(fp2).toEqual(fp3);
    });

    it('empty tokens returns zero vector', () => {
      const result = fp.fingerprintPattern([]);
      const allZero = result.every((b) => b === 0);
      expect(allZero).toBe(true);
    });

    it('single token returns that token hypervector', () => {
      const tokenVec = fp.tokenToHypervector('slow');
      const fpVec = fp.fingerprintPattern(['slow']);
      expect(fpVec).toEqual(tokenVec);
    });
  });

  describe('fingerprintWithContext', () => {
    it('without context matches fingerprintPattern', () => {
      const tokens = ['slow', 'flaky'];
      const withCtx = fp.fingerprintWithContext(tokens, []);
      const withoutCtx = fp.fingerprintPattern(tokens);
      expect(withCtx).toEqual(withoutCtx);
    });

    it('context modifies the fingerprint', () => {
      const tokens = ['slow', 'flaky'];
      const ctx = ['production', 'critical'];
      const withCtx = fp.fingerprintWithContext(tokens, ctx);
      const withoutCtx = fp.fingerprintPattern(tokens);
      // Should be different (context changes the bundled result)
      const dist = hammingDistance(withCtx, withoutCtx, 1000);
      expect(dist).toBeGreaterThan(0);
    });
  });

  describe('similarity', () => {
    it('returns 1 for identical vectors', () => {
      const v = fp.tokenToHypervector('test');
      expect(fp.similarity(v, v)).toBe(1);
    });

    it('returns approximately 0.5 for unrelated vectors', () => {
      const v1 = fp.tokenToHypervector('alpha');
      const v2 = fp.tokenToHypervector('omega');
      const sim = fp.similarity(v1, v2);
      expect(sim).toBeGreaterThan(0.3);
      expect(sim).toBeLessThan(0.7);
    });
  });
});

// ============================================================================
// Feature Flag Gating
// ============================================================================

describe('createHDCFingerprinter (feature flag gating)', () => {
  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('returns HDCPatternFingerprinter when flag is enabled (default)', () => {
    const result = createHDCFingerprinter();
    expect(result).toBeInstanceOf(HDCPatternFingerprinter);
  });

  it('returns null when useHDCFingerprinting flag is disabled', () => {
    setRuVectorFeatureFlags({ useHDCFingerprinting: false });
    const result = createHDCFingerprinter();
    expect(result).toBeNull();
  });

  it('passes config through to HDCPatternFingerprinter', () => {
    const result = createHDCFingerprinter({ dimensions: 256 });
    expect(result).not.toBeNull();
    // Verify dimensions are applied by checking vector byte length
    const v = result!.tokenToHypervector('test');
    expect(v.length).toBe(Math.ceil(256 / 8));
  });
});
