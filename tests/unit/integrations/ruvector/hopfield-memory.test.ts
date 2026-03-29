/**
 * R5: Modern Hopfield Networks — Unit Tests
 *
 * Tests exact recall, capacity, energy ordering, noisy recall,
 * batch recall, empty memory, dimension validation, metadata
 * preservation, capacity eviction, and feature flag gating.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  HopfieldMemory,
  createHopfieldMemory,
  type HopfieldConfig,
  type RecallResult,
} from '../../../../src/integrations/ruvector/hopfield-memory';
import {
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
} from '../../../../src/integrations/ruvector/feature-flags';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Linear congruential generator for deterministic pseudo-random numbers.
 * Same constants as glibc; produces repeatable sequences from a seed.
 */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
    return (s >>> 0) / 0xFFFFFFFF;
  };
}

/** Generate a random Float32Array with values in [-1, 1]. */
function randomVector(dim: number, rng: () => number): Float32Array {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) v[i] = rng() * 2 - 1;
  return v;
}

/** Add Gaussian-like noise to a vector using Box-Muller approximation. */
function addNoise(v: Float32Array, scale: number, rng: () => number): Float32Array {
  const noisy = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) {
    // Simple noise via uniform perturbation (sufficient for recall tests)
    noisy[i] = v[i] + (rng() * 2 - 1) * scale;
  }
  return noisy;
}

// ============================================================================
// Tests
// ============================================================================

describe('HopfieldMemory', () => {
  const DIM = 128;

  beforeEach(() => {
    setRuVectorFeatureFlags({ useHopfieldMemory: true });
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  // --------------------------------------------------------------------------
  // 1. Exact recall
  // --------------------------------------------------------------------------

  describe('exact recall', () => {
    it('recalls each of 100 stored patterns with cosine similarity > 0.999', () => {
      const memory = createHopfieldMemory({ dimension: DIM });
      const rng = seededRandom(42);
      const patterns: Float32Array[] = [];

      for (let i = 0; i < 100; i++) {
        const p = randomVector(DIM, rng);
        patterns.push(p);
        memory.store(p);
      }

      for (let i = 0; i < 100; i++) {
        const result = memory.recall(patterns[i]);
        expect(result).not.toBeNull();
        expect(result!.similarity).toBeGreaterThan(0.999);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 2. Capacity
  // --------------------------------------------------------------------------

  describe('capacity', () => {
    it('stores and recalls 1000 patterns in 128-dim correctly', () => {
      const memory = createHopfieldMemory({ dimension: DIM });
      const rng = seededRandom(123);
      const patterns: Float32Array[] = [];

      for (let i = 0; i < 1000; i++) {
        const p = randomVector(DIM, rng);
        patterns.push(p);
        memory.store(p);
      }

      expect(memory.getPatternCount()).toBe(1000);

      // Verify a sample of patterns recall correctly
      const sampleIndices = [0, 99, 500, 999];
      for (const idx of sampleIndices) {
        const result = memory.recall(patterns[idx]);
        expect(result).not.toBeNull();
        expect(result!.similarity).toBeGreaterThan(0.99);
      }
    });

    it('stores and recalls 10K patterns in 128-dim without degradation', () => {
      const memory = createHopfieldMemory({ dimension: DIM, maxPatterns: 10000 });
      const rng = seededRandom(456);
      const patterns: Float32Array[] = [];

      for (let i = 0; i < 10000; i++) {
        const p = randomVector(DIM, rng);
        patterns.push(p);
        memory.store(p, { index: i });
      }

      expect(memory.getPatternCount()).toBe(10000);

      // Verify recall at sample points across the full range
      const sampleIndices = [0, 100, 1000, 5000, 9999];
      for (const idx of sampleIndices) {
        const result = memory.recall(patterns[idx]);
        expect(result).not.toBeNull();
        expect(result!.similarity).toBeGreaterThan(0.95);
        expect(result!.metadata.index).toBe(idx);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 3. Energy ordering
  // --------------------------------------------------------------------------

  describe('energy', () => {
    it('stored patterns have lower energy than random queries', () => {
      const memory = createHopfieldMemory({ dimension: DIM });
      const rng = seededRandom(77);

      // Store 20 patterns
      const storedVecs: Float32Array[] = [];
      for (let i = 0; i < 20; i++) {
        const p = randomVector(DIM, rng);
        storedVecs.push(p);
        memory.store(p);
      }

      // Compute energy for stored patterns
      const storedEnergies = storedVecs.map((p) => memory.getEnergy(p));

      // Compute energy for random (unseen) vectors
      const randomEnergies: number[] = [];
      for (let i = 0; i < 20; i++) {
        const r = randomVector(DIM, rng);
        randomEnergies.push(memory.getEnergy(r));
      }

      const avgStored = storedEnergies.reduce((a, b) => a + b, 0) / storedEnergies.length;
      const avgRandom = randomEnergies.reduce((a, b) => a + b, 0) / randomEnergies.length;

      // Stored patterns should have lower average energy
      expect(avgStored).toBeLessThan(avgRandom);
    });

    it('recall returns an energy value', () => {
      const memory = createHopfieldMemory({ dimension: DIM });
      const rng = seededRandom(88);
      const p = randomVector(DIM, rng);
      memory.store(p);

      const result = memory.recall(p);
      expect(result).not.toBeNull();
      expect(typeof result!.energy).toBe('number');
      expect(Number.isFinite(result!.energy)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Noisy recall
  // --------------------------------------------------------------------------

  describe('noisy recall', () => {
    it('recalls correct pattern from noisy query', () => {
      const memory = createHopfieldMemory({ dimension: DIM });
      const rng = seededRandom(55);

      // Store several distinct patterns
      const patterns: Float32Array[] = [];
      for (let i = 0; i < 10; i++) {
        const p = randomVector(DIM, rng);
        patterns.push(p);
        memory.store(p, { index: i });
      }

      // Query with a noisy version of pattern 5
      const noisyQuery = addNoise(patterns[5], 0.1, rng);
      const result = memory.recall(noisyQuery);

      expect(result).not.toBeNull();
      expect(result!.metadata.index).toBe(5);
      expect(result!.similarity).toBeGreaterThan(0.9);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Batch recall
  // --------------------------------------------------------------------------

  describe('batch recall', () => {
    it('batch-recalls 50 stored patterns, all match', () => {
      const memory = createHopfieldMemory({ dimension: DIM });
      const rng = seededRandom(99);
      const patterns: Float32Array[] = [];

      for (let i = 0; i < 50; i++) {
        const p = randomVector(DIM, rng);
        patterns.push(p);
        memory.store(p, { index: i });
      }

      const results = memory.batchRecall(patterns);
      expect(results.length).toBe(50);

      for (let i = 0; i < 50; i++) {
        expect(results[i]).not.toBeNull();
        expect(results[i]!.similarity).toBeGreaterThan(0.999);
        expect(results[i]!.metadata.index).toBe(i);
      }
    });

    it('batch-recall of empty array returns empty array', () => {
      const memory = createHopfieldMemory({ dimension: DIM });
      expect(memory.batchRecall([])).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Empty memory
  // --------------------------------------------------------------------------

  describe('empty memory', () => {
    it('recall on empty memory returns null', () => {
      const memory = createHopfieldMemory({ dimension: DIM });
      const rng = seededRandom(11);
      const query = randomVector(DIM, rng);

      expect(memory.recall(query)).toBeNull();
    });

    it('getPatternCount is 0 for fresh memory', () => {
      const memory = createHopfieldMemory({ dimension: DIM });
      expect(memory.getPatternCount()).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Dimension validation
  // --------------------------------------------------------------------------

  describe('dimension validation', () => {
    it('store rejects wrong-dimension pattern', () => {
      const memory = createHopfieldMemory({ dimension: DIM });
      const wrong = new Float32Array(DIM + 10);

      expect(() => memory.store(wrong)).toThrow('dimension mismatch');
    });

    it('recall rejects wrong-dimension query', () => {
      const memory = createHopfieldMemory({ dimension: DIM });
      const rng = seededRandom(22);
      memory.store(randomVector(DIM, rng));

      const wrong = new Float32Array(DIM - 1);
      expect(() => memory.recall(wrong)).toThrow('dimension mismatch');
    });

    it('getEnergy rejects wrong-dimension state', () => {
      const memory = createHopfieldMemory({ dimension: DIM });
      const wrong = new Float32Array(64);

      expect(() => memory.getEnergy(wrong)).toThrow('dimension mismatch');
    });

    it('constructor rejects non-positive dimension', () => {
      expect(() => createHopfieldMemory({ dimension: 0 })).toThrow('positive');
      expect(() => createHopfieldMemory({ dimension: -1 })).toThrow('positive');
    });

    it('constructor rejects non-positive beta', () => {
      expect(() => createHopfieldMemory({ beta: 0 })).toThrow('positive');
      expect(() => createHopfieldMemory({ beta: -5 })).toThrow('positive');
    });

    it('constructor rejects non-positive maxPatterns', () => {
      expect(() => createHopfieldMemory({ maxPatterns: 0 })).toThrow('positive');
    });

    it('rejects zero-magnitude pattern', () => {
      const memory = createHopfieldMemory({ dimension: DIM });
      const zeroVec = new Float32Array(DIM); // all zeros
      expect(() => memory.store(zeroVec)).toThrow('zero-magnitude');
    });
  });

  // --------------------------------------------------------------------------
  // 8. Metadata preservation
  // --------------------------------------------------------------------------

  describe('metadata preservation', () => {
    it('stored metadata is returned on recall', () => {
      const memory = createHopfieldMemory({ dimension: DIM });
      const rng = seededRandom(33);
      const pattern = randomVector(DIM, rng);

      const metadata = { id: 'test-pattern', domain: 'security', severity: 'high', count: 42 };
      memory.store(pattern, metadata);

      const result = memory.recall(pattern);
      expect(result).not.toBeNull();
      expect(result!.metadata.id).toBe('test-pattern');
      expect(result!.metadata.domain).toBe('security');
      expect(result!.metadata.severity).toBe('high');
      expect(result!.metadata.count).toBe(42);
    });

    it('default metadata is empty object', () => {
      const memory = createHopfieldMemory({ dimension: DIM });
      const rng = seededRandom(44);
      const pattern = randomVector(DIM, rng);

      memory.store(pattern);

      const result = memory.recall(pattern);
      expect(result).not.toBeNull();
      expect(result!.metadata).toEqual({});
    });
  });

  // --------------------------------------------------------------------------
  // 9. Capacity eviction
  // --------------------------------------------------------------------------

  describe('capacity eviction', () => {
    it('evicts oldest pattern when maxPatterns is exceeded', () => {
      const maxPatterns = 5;
      const memory = createHopfieldMemory({ dimension: DIM, maxPatterns });
      const rng = seededRandom(66);

      const patterns: Float32Array[] = [];
      for (let i = 0; i < maxPatterns + 1; i++) {
        const p = randomVector(DIM, rng);
        patterns.push(p);
        memory.store(p, { index: i });
      }

      // Should not exceed maxPatterns
      expect(memory.getPatternCount()).toBe(maxPatterns);

      // The oldest pattern (index 0) should have been evicted.
      // Query with it; the recalled pattern should NOT match index 0.
      const result = memory.recall(patterns[0]);
      expect(result).not.toBeNull();
      expect(result!.metadata.index).not.toBe(0);

      // The newest pattern (index 5) should still be present
      const newest = memory.recall(patterns[maxPatterns]);
      expect(newest).not.toBeNull();
      expect(newest!.similarity).toBeGreaterThan(0.999);
      expect(newest!.metadata.index).toBe(maxPatterns);
    });
  });

  // --------------------------------------------------------------------------
  // 10. Feature flag gating
  // --------------------------------------------------------------------------

  describe('feature flag', () => {
    it('store throws when useHopfieldMemory is false', () => {
      setRuVectorFeatureFlags({ useHopfieldMemory: false });
      const memory = createHopfieldMemory({ dimension: DIM });
      const pattern = new Float32Array(DIM);

      expect(() => memory.store(pattern)).toThrow('disabled');
    });

    it('recall throws when useHopfieldMemory is false', () => {
      setRuVectorFeatureFlags({ useHopfieldMemory: false });
      const memory = createHopfieldMemory({ dimension: DIM });
      const query = new Float32Array(DIM);

      expect(() => memory.recall(query)).toThrow('disabled');
    });

    it('batchRecall throws when useHopfieldMemory is false', () => {
      setRuVectorFeatureFlags({ useHopfieldMemory: false });
      const memory = createHopfieldMemory({ dimension: DIM });

      expect(() => memory.batchRecall([])).toThrow('disabled');
    });

    it('getPatternCount and clear work regardless of flag', () => {
      const memory = createHopfieldMemory({ dimension: DIM });

      // Store a pattern while enabled
      const pattern = new Float32Array(DIM);
      pattern[0] = 1.0;
      memory.store(pattern);
      expect(memory.getPatternCount()).toBe(1);

      // Disable the flag
      setRuVectorFeatureFlags({ useHopfieldMemory: false });

      // These should still work (no feature flag check)
      expect(memory.getPatternCount()).toBe(1);
      memory.clear();
      expect(memory.getPatternCount()).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Benchmark (ADR-087 requirement)
  // --------------------------------------------------------------------------

  describe('benchmark', () => {
    it('single recall < 1ms for 1K stored patterns', () => {
      const memory = createHopfieldMemory({ dimension: DIM });
      const rng = seededRandom(42);

      // Store 1000 patterns
      for (let i = 0; i < 1000; i++) {
        memory.store(randomVector(DIM, rng));
      }

      const query = randomVector(DIM, rng);

      // Warm up
      memory.recall(query);

      // Measure average over 100 iterations
      const start = performance.now();
      const iterations = 100;
      for (let i = 0; i < iterations; i++) {
        memory.recall(query);
      }
      const elapsed = (performance.now() - start) / iterations;

      // ADR-087 target: < 1ms on production hardware.
      // CI/Codespace VMs may be slower; use 2ms ceiling to avoid flaky failures.
      expect(elapsed).toBeLessThan(2);
    });
  });

  // --------------------------------------------------------------------------
  // Additional edge cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('clear removes all patterns', () => {
      const memory = createHopfieldMemory({ dimension: DIM });
      const rng = seededRandom(77);

      for (let i = 0; i < 10; i++) {
        memory.store(randomVector(DIM, rng));
      }
      expect(memory.getPatternCount()).toBe(10);

      memory.clear();
      expect(memory.getPatternCount()).toBe(0);

      const query = randomVector(DIM, rng);
      expect(memory.recall(query)).toBeNull();
    });

    it('getEnergy on empty memory returns 0.5 (normalized state has unit norm)', () => {
      const memory = createHopfieldMemory({ dimension: DIM });
      const state = new Float32Array(DIM);
      state[0] = 1.0;
      state[1] = 2.0;

      // State is L2-normalized before energy computation, so ||s||^2 = 1.0
      // Expected: 0.5 * 1.0 = 0.5
      const energy = memory.getEnergy(state);
      expect(energy).toBeCloseTo(0.5, 5);
    });

    it('factory function creates working instance with defaults', () => {
      const memory = createHopfieldMemory();
      expect(memory.getPatternCount()).toBe(0);

      const pattern = new Float32Array(DEFAULT_DIMENSION);
      pattern[0] = 1.0;
      memory.store(pattern);
      expect(memory.getPatternCount()).toBe(1);
    });
  });
});

// ============================================================================
// Constants used by edge case tests
// ============================================================================

const DEFAULT_DIMENSION = 128;
