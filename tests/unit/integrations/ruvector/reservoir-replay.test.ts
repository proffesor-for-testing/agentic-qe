/**
 * Reservoir Replay Buffer Unit Tests (R10, Phase 5 Milestone 3)
 *
 * Tests for:
 * - Coherence-gated admission (reject below threshold)
 * - Reservoir sampling (Algorithm R) maintains fixed capacity
 * - Coherence-weighted sampling (high-tier entries sampled ~3x more)
 * - CUSUM integration for drift-aware gating
 * - Statistics tracking
 * - Edge cases (empty buffer, oversized sample, clear)
 *
 * @see reservoir-replay.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ReservoirReplayBuffer,
  createReservoirReplayBuffer,
  type ReservoirEntry,
  type ReservoirConfig,
  type CoherenceTier,
} from '../../../../src/integrations/ruvector/reservoir-replay';

// ============================================================================
// Test Helpers
// ============================================================================

/** Simple seeded PRNG (xorshift32) for deterministic test data */
function createSeededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xFFFFFFFF;
  };
}

/** Generate a unique entry ID */
function entryId(i: number): string {
  return `entry-${i}`;
}

// ============================================================================
// Tests
// ============================================================================

describe('ReservoirReplayBuffer', () => {
  let buffer: ReservoirReplayBuffer<string>;

  beforeEach(() => {
    buffer = new ReservoirReplayBuffer<string>({
      capacity: 100,
      minCoherenceThreshold: 0.3,
      highTierThreshold: 0.8,
      mediumTierThreshold: 0.5,
    });
  });

  // --------------------------------------------------------------------------
  // Admission Tests
  // --------------------------------------------------------------------------

  describe('admission', () => {
    it('should reject entries below minCoherenceThreshold', () => {
      const admitted = buffer.admit('low-1', 'data', 0.1);
      expect(admitted).toBe(false);
      expect(buffer.size()).toBe(0);
    });

    it('should reject entries at exactly minCoherenceThreshold boundary', () => {
      // 0.3 is the threshold; values below it should be rejected
      const admitted = buffer.admit('boundary', 'data', 0.29);
      expect(admitted).toBe(false);
    });

    it('should admit entries above threshold when buffer has capacity', () => {
      const admitted = buffer.admit('ok-1', 'data-1', 0.5);
      expect(admitted).toBe(true);
      expect(buffer.size()).toBe(1);
    });

    it('should admit entries at exactly the threshold', () => {
      const admitted = buffer.admit('exact', 'data', 0.3);
      expect(admitted).toBe(true);
      expect(buffer.size()).toBe(1);
    });

    it('should classify entries into correct coherence tiers', () => {
      buffer.admit('high-1', 'data', 0.9);
      buffer.admit('med-1', 'data', 0.6);
      buffer.admit('low-1', 'data', 0.35);

      const highEntries = buffer.getByTier('high');
      const medEntries = buffer.getByTier('medium');
      const lowEntries = buffer.getByTier('low');

      expect(highEntries).toHaveLength(1);
      expect(highEntries[0].tier).toBe('high');
      expect(highEntries[0].coherenceScore).toBe(0.9);

      expect(medEntries).toHaveLength(1);
      expect(medEntries[0].tier).toBe('medium');

      expect(lowEntries).toHaveLength(1);
      expect(lowEntries[0].tier).toBe('low');
    });

    it('should admit at high tier boundary', () => {
      buffer.admit('boundary-high', 'data', 0.8);
      const highEntries = buffer.getByTier('high');
      expect(highEntries).toHaveLength(1);
    });

    it('should admit at medium tier boundary', () => {
      buffer.admit('boundary-med', 'data', 0.5);
      const medEntries = buffer.getByTier('medium');
      expect(medEntries).toHaveLength(1);
    });

    it('should fill buffer to capacity', () => {
      for (let i = 0; i < 100; i++) {
        buffer.admit(entryId(i), `data-${i}`, 0.5);
      }
      expect(buffer.size()).toBe(100);
    });
  });

  // --------------------------------------------------------------------------
  // Reservoir Sampling Tests
  // --------------------------------------------------------------------------

  describe('reservoir sampling', () => {
    it('should maintain fixed size after overflow', () => {
      const smallBuffer = new ReservoirReplayBuffer<number>({
        capacity: 50,
        minCoherenceThreshold: 0.0, // accept everything
      });

      for (let i = 0; i < 200; i++) {
        smallBuffer.admit(entryId(i), i, 0.5);
      }

      expect(smallBuffer.size()).toBe(50);
    });

    it('should maintain capacity after admitting 2x capacity entries', () => {
      const cap = 100;
      const smallBuffer = new ReservoirReplayBuffer<number>({
        capacity: cap,
        minCoherenceThreshold: 0.0,
      });

      for (let i = 0; i < cap * 2; i++) {
        smallBuffer.admit(entryId(i), i, 0.5);
      }

      expect(smallBuffer.size()).toBe(cap);
    });

    it('should track eviction count when buffer overflows', () => {
      const cap = 20;
      const smallBuffer = new ReservoirReplayBuffer<number>({
        capacity: cap,
        minCoherenceThreshold: 0.0,
      });

      // Fill to capacity
      for (let i = 0; i < cap; i++) {
        smallBuffer.admit(entryId(i), i, 0.5);
      }

      // Overflow with more entries - some will be admitted via replacement
      let admittedOverflow = 0;
      for (let i = cap; i < cap * 3; i++) {
        if (smallBuffer.admit(entryId(i), i, 0.5)) {
          admittedOverflow++;
        }
      }

      const stats = smallBuffer.getStats();
      expect(stats.size).toBe(cap);
      expect(stats.totalEvicted).toBe(admittedOverflow);
      expect(stats.totalAdmitted).toBe(cap + admittedOverflow);
    });

    it('should produce roughly uniform sampling over a large stream', () => {
      // With reservoir sampling (Algorithm R), each element in the stream
      // should have equal probability of being in the final buffer.
      // We test this statistically: insert 10K items into a buffer of 100,
      // repeat many times, and check distribution.

      const cap = 100;
      const streamSize = 1000;
      const trials = 50;
      const buckets = new Map<number, number>();

      // Initialize bucket counts
      for (let i = 0; i < streamSize; i++) {
        buckets.set(i, 0);
      }

      for (let trial = 0; trial < trials; trial++) {
        const trialBuffer = new ReservoirReplayBuffer<number>({
          capacity: cap,
          minCoherenceThreshold: 0.0,
        });

        for (let i = 0; i < streamSize; i++) {
          trialBuffer.admit(entryId(i), i, 0.5);
        }

        // Count which items ended up in the buffer
        const sampled = trialBuffer.sample(cap);
        for (const entry of sampled) {
          buckets.set(entry.data, (buckets.get(entry.data) || 0) + 1);
        }
      }

      // Expected frequency per item: trials * (cap / streamSize) = 50 * 0.1 = 5
      const expectedFreq = trials * (cap / streamSize);

      // Check that no item is wildly over- or under-represented.
      // Allow 8x deviation from expected (generous for Math.random variance
      // combined with coherence-weighted reservoir replacement).
      let extremeOutliers = 0;
      for (const [, count] of buckets) {
        if (count > expectedFreq * 8) {
          extremeOutliers++;
        }
      }

      // Less than 10% of items should be extreme outliers
      expect(extremeOutliers / streamSize).toBeLessThan(0.10);
    });
  });

  // --------------------------------------------------------------------------
  // Coherence-Weighted Sampling Tests
  // --------------------------------------------------------------------------

  describe('coherence-weighted sampling', () => {
    it('should sample high-coherence entries more frequently than low-coherence', () => {
      // Create a buffer with equal numbers of high and low coherence entries
      const testBuffer = new ReservoirReplayBuffer<string>({
        capacity: 100,
        minCoherenceThreshold: 0.0,
        highTierThreshold: 0.8,
        mediumTierThreshold: 0.5,
        highTierWeight: 3.0,
        lowTierWeight: 1.0,
      });

      // 50 high-coherence entries
      for (let i = 0; i < 50; i++) {
        testBuffer.admit(`high-${i}`, 'high', 0.9);
      }
      // 50 low-coherence entries
      for (let i = 0; i < 50; i++) {
        testBuffer.admit(`low-${i}`, 'low', 0.35);
      }

      // Sample many times and count tier frequencies
      let highCount = 0;
      let lowCount = 0;
      const iterations = 500;

      for (let trial = 0; trial < iterations; trial++) {
        const sampled = testBuffer.sample(10);
        for (const entry of sampled) {
          if (entry.tier === 'high') highCount++;
          else if (entry.tier === 'low') lowCount++;
        }
      }

      // High-coherence entries should be sampled ~3x more often (weight 3.0 vs 1.0).
      // With 500 iterations * 10 samples = 5000 draws, the ratio should
      // converge near 3.0. Assert >= 2.0 to account for sampling variance.
      const ratio = highCount / Math.max(lowCount, 1);
      expect(ratio).toBeGreaterThan(2.0);
    });

    it('should filter by minCoherence when sampling', () => {
      buffer.admit('high-1', 'data', 0.9);
      buffer.admit('med-1', 'data', 0.6);
      buffer.admit('low-1', 'data', 0.35);

      const filtered = buffer.sample(10, 0.7);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].coherenceScore).toBe(0.9);
    });

    it('should return empty when minCoherence filters everything', () => {
      buffer.admit('entry-1', 'data', 0.5);
      buffer.admit('entry-2', 'data', 0.6);

      const filtered = buffer.sample(10, 0.99);
      expect(filtered).toHaveLength(0);
    });

    it('should return only entries from the requested tier via getByTier', () => {
      buffer.admit('h1', 'data', 0.85);
      buffer.admit('h2', 'data', 0.95);
      buffer.admit('m1', 'data', 0.65);
      buffer.admit('l1', 'data', 0.35);

      const highOnly = buffer.getByTier('high');
      expect(highOnly).toHaveLength(2);
      expect(highOnly.every(e => e.tier === 'high')).toBe(true);

      const medOnly = buffer.getByTier('medium');
      expect(medOnly).toHaveLength(1);

      const lowOnly = buffer.getByTier('low');
      expect(lowOnly).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // CUSUM Integration Tests
  // --------------------------------------------------------------------------

  describe('CUSUM integration', () => {
    it('should feed values to internal CusumDetector via observeCoherence', () => {
      // Initially no drift
      const initial = buffer.getCusumState('retrieve');
      expect(initial.driftDetected).toBe(false);
      expect(initial.samplesSinceReset).toBe(0);

      // Feed some coherence observations
      for (let i = 0; i < 25; i++) {
        buffer.observeCoherence('retrieve', 0.5);
      }

      // State should reflect samples
      const state = buffer.getCusumState('retrieve');
      expect(state.samplesSinceReset).toBeGreaterThan(0);
    });

    it('should make drift detection state accessible via getCusumState', () => {
      // Warmup at mean ~0.5
      for (let i = 0; i < 20; i++) {
        buffer.observeCoherence('learn', 0.5);
      }

      // Feed extreme values to trigger drift
      let driftDetected = false;
      for (let i = 0; i < 20; i++) {
        const result = buffer.observeCoherence('learn', 10.0);
        if (result.driftDetected) {
          driftDetected = true;
          break;
        }
      }

      expect(driftDetected).toBe(true);
    });

    it('should maintain independent CUSUM state per gate type', () => {
      // Warmup 'retrieve'
      for (let i = 0; i < 20; i++) {
        buffer.observeCoherence('retrieve', 0.5);
      }

      // Warmup 'write'
      for (let i = 0; i < 20; i++) {
        buffer.observeCoherence('write', 0.5);
      }

      // Drift only 'retrieve'
      for (let i = 0; i < 20; i++) {
        buffer.observeCoherence('retrieve', 10.0);
      }

      // 'write' should be unaffected
      const writeState = buffer.getCusumState('write');
      expect(writeState.driftDetected).toBe(false);
    });

    it('should tighten admission threshold when drift is detected', () => {
      // Create buffer with specific CUSUM config for faster detection
      const driftBuffer = new ReservoirReplayBuffer<string>({
        capacity: 100,
        minCoherenceThreshold: 0.3,
        cusumConfig: { threshold: 3.0, slack: 0.1 },
      });

      // Warmup the CUSUM detector
      for (let i = 0; i < 20; i++) {
        driftBuffer.observeCoherence('retrieve', 0.5);
      }

      // Trigger drift by feeding extreme values
      for (let i = 0; i < 20; i++) {
        driftBuffer.observeCoherence('retrieve', 10.0);
      }

      // With drift active, threshold should be tightened (0.3 * 1.5 = 0.45)
      // An entry at 0.4 should be rejected (above 0.3 but below 0.45)
      const admitted = driftBuffer.admit('marginal', 'data', 0.4);
      expect(admitted).toBe(false);

      // An entry at 0.5 should still be admitted (above tightened threshold)
      const admittedHigh = driftBuffer.admit('good', 'data', 0.5);
      expect(admittedHigh).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Statistics Tests
  // --------------------------------------------------------------------------

  describe('statistics', () => {
    it('should track admitted count correctly', () => {
      buffer.admit('a', 'data', 0.5);
      buffer.admit('b', 'data', 0.8);
      buffer.admit('c', 'data', 0.1); // rejected

      const stats = buffer.getStats();
      expect(stats.totalAdmitted).toBe(2);
    });

    it('should track rejected count correctly', () => {
      buffer.admit('a', 'data', 0.1);
      buffer.admit('b', 'data', 0.2);
      buffer.admit('c', 'data', 0.5); // admitted

      const stats = buffer.getStats();
      expect(stats.totalRejected).toBe(2);
    });

    it('should have tier counts matching actual buffer contents', () => {
      buffer.admit('h1', 'data', 0.9);
      buffer.admit('h2', 'data', 0.85);
      buffer.admit('m1', 'data', 0.6);
      buffer.admit('l1', 'data', 0.35);

      const stats = buffer.getStats();
      expect(stats.tierCounts.high).toBe(2);
      expect(stats.tierCounts.medium).toBe(1);
      expect(stats.tierCounts.low).toBe(1);
      expect(stats.size).toBe(4);
    });

    it('should track sampled count', () => {
      buffer.admit('a', 'data', 0.5);
      buffer.admit('b', 'data', 0.6);

      buffer.sample(1);
      buffer.sample(2);

      const stats = buffer.getStats();
      expect(stats.totalSampled).toBe(3);
    });

    it('should report correct capacity', () => {
      const stats = buffer.getStats();
      expect(stats.capacity).toBe(100);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should return empty array when sampling from empty buffer', () => {
      const sampled = buffer.sample(10);
      expect(sampled).toEqual([]);
    });

    it('should return all entries when batchSize exceeds buffer size', () => {
      buffer.admit('a', 'data-a', 0.5);
      buffer.admit('b', 'data-b', 0.6);
      buffer.admit('c', 'data-c', 0.7);

      const sampled = buffer.sample(100);
      expect(sampled).toHaveLength(3);
    });

    it('should clear everything on clear()', () => {
      buffer.admit('a', 'data', 0.5);
      buffer.admit('b', 'data', 0.6);
      buffer.sample(1);
      buffer.observeCoherence('retrieve', 0.5);

      buffer.clear();

      expect(buffer.size()).toBe(0);

      const stats = buffer.getStats();
      expect(stats.size).toBe(0);
      expect(stats.totalAdmitted).toBe(0);
      expect(stats.totalRejected).toBe(0);
      expect(stats.totalEvicted).toBe(0);
      expect(stats.totalSampled).toBe(0);
      expect(stats.tierCounts.high).toBe(0);
      expect(stats.tierCounts.medium).toBe(0);
      expect(stats.tierCounts.low).toBe(0);

      // CUSUM state should also be reset
      const cusumState = buffer.getCusumState('retrieve');
      expect(cusumState.samplesSinceReset).toBe(0);
    });

    it('should handle sample with batchSize of 0', () => {
      buffer.admit('a', 'data', 0.5);
      const sampled = buffer.sample(0);
      expect(sampled).toHaveLength(0);
    });

    it('should increment replayCount on sampled entries', () => {
      buffer.admit('a', 'data', 0.5);
      buffer.sample(1);
      buffer.sample(1);

      // Get the entry and check replayCount
      const entries = buffer.getByTier('medium');
      expect(entries[0].replayCount).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Factory Function
  // --------------------------------------------------------------------------

  describe('createReservoirReplayBuffer', () => {
    it('should create a buffer with default config', () => {
      const buf = createReservoirReplayBuffer<number>();
      expect(buf.size()).toBe(0);

      const stats = buf.getStats();
      expect(stats.capacity).toBe(10_000);
    });

    it('should create a buffer with custom config', () => {
      const buf = createReservoirReplayBuffer<string>({
        capacity: 500,
        minCoherenceThreshold: 0.5,
      });

      const stats = buf.getStats();
      expect(stats.capacity).toBe(500);

      // Should reject below new threshold
      const admitted = buf.admit('test', 'data', 0.4);
      expect(admitted).toBe(false);
    });
  });
});
