/**
 * R3: Sparse Vector Delta Event Sourcing - Unit Tests
 *
 * Tests for VectorDeltaTracker: genesis, sparse delta recording,
 * rollback, reconstruction, snapshots, batching, pruning, and feature flag.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  VectorDeltaTracker,
  createVectorDeltaTracker,
  type PatternDelta,
  type VectorDeltaTrackerConfig,
} from '../../../../src/integrations/ruvector/vector-delta-tracker';
import {
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
} from '../../../../src/integrations/ruvector/feature-flags';

// ============================================================================
// Helpers
// ============================================================================

/** Create a simple vector of given length with sequential values */
function makeVector(length: number, offset = 0): number[] {
  return Array.from({ length }, (_, i) => (i + offset) * 0.1);
}

/** Create a vector that differs from another in only a few dimensions */
function perturbVector(
  base: number[],
  changes: Array<{ index: number; value: number }>,
): number[] {
  const result = [...base];
  for (const { index, value } of changes) {
    result[index] = value;
  }
  return result;
}

// ============================================================================
// Tests
// ============================================================================

describe('VectorDeltaTracker', () => {
  let tracker: VectorDeltaTracker;

  beforeEach(() => {
    resetRuVectorFeatureFlags();
    tracker = new VectorDeltaTracker();
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  // --------------------------------------------------------------------------
  // Genesis
  // --------------------------------------------------------------------------

  describe('recordGenesis', () => {
    it('should create v0 with all dimensions as changes from zero', () => {
      const vector = [0.1, 0.2, 0.3];
      const delta = tracker.recordGenesis('pat-1', vector);

      expect(delta.version).toBe(0);
      expect(delta.deltaType).toBe('genesis');
      expect(delta.patternId).toBe('pat-1');
      expect(delta.timestamp).toBeGreaterThan(0);

      // All non-zero dimensions should appear as changes from 0
      expect(delta.sparseChanges).toHaveLength(3);
      expect(delta.sparseChanges[0]).toEqual({ index: 0, oldValue: 0, newValue: 0.1 });
      expect(delta.sparseChanges[1]).toEqual({ index: 1, oldValue: 0, newValue: 0.2 });
      expect(delta.sparseChanges[2]).toEqual({ index: 2, oldValue: 0, newValue: 0.3 });
    });

    it('should reject duplicate genesis for same pattern', () => {
      tracker.recordGenesis('pat-1', [1, 2, 3]);
      expect(() => tracker.recordGenesis('pat-1', [4, 5, 6])).toThrow('Genesis already exists');
    });

    it('should allow genesis for different patterns', () => {
      tracker.recordGenesis('pat-1', [1, 2, 3]);
      tracker.recordGenesis('pat-2', [4, 5, 6]);

      expect(tracker.getVersion('pat-1')).toBe(0);
      expect(tracker.getVersion('pat-2')).toBe(0);
    });

    it('should include custom metadata', () => {
      const delta = tracker.recordGenesis('pat-1', [1], { author: 'agent-1' });
      expect(delta.metadata?.author).toBe('agent-1');
    });

    it('should store compressed size as count of sparse changes', () => {
      const delta = tracker.recordGenesis('pat-1', [0.1, 0, 0.3]);
      // Only indices 0 and 2 are non-zero
      expect(delta.compressedSize).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Delta recording (sparse encoding)
  // --------------------------------------------------------------------------

  describe('recordDelta', () => {
    it('should only store changed dimensions (sparse)', () => {
      const v0 = [0.1, 0.2, 0.3, 0.4, 0.5];
      tracker.recordGenesis('pat-1', v0);

      // Only change dimension 1 and 3
      const v1 = perturbVector(v0, [
        { index: 1, value: 0.9 },
        { index: 3, value: 0.8 },
      ]);
      const delta = tracker.recordDelta('pat-1', v0, v1);

      expect(delta.version).toBe(1);
      expect(delta.deltaType).toBe('update');
      expect(delta.sparseChanges).toHaveLength(2);
      expect(delta.sparseChanges[0]).toEqual({ index: 1, oldValue: 0.2, newValue: 0.9 });
      expect(delta.sparseChanges[1]).toEqual({ index: 3, oldValue: 0.4, newValue: 0.8 });
    });

    it('should produce empty sparse changes for identical vectors', () => {
      const v0 = [0.1, 0.2, 0.3];
      tracker.recordGenesis('pat-1', v0);

      const delta = tracker.recordDelta('pat-1', v0, [...v0]);
      expect(delta.sparseChanges).toHaveLength(0);
      expect(delta.compressedSize).toBe(0);
    });

    it('should produce small deltas for small changes (compression ratio)', () => {
      const dimension = 384; // typical embedding dimension
      const v0 = makeVector(dimension);
      tracker.recordGenesis('pat-1', v0);

      // Change only 3 out of 384 dimensions
      const v1 = perturbVector(v0, [
        { index: 10, value: 999 },
        { index: 100, value: 888 },
        { index: 300, value: 777 },
      ]);
      const delta = tracker.recordDelta('pat-1', v0, v1);

      expect(delta.sparseChanges).toHaveLength(3);
      // Compression: 3 changes vs 384 dimensions = ~0.78% of full vector
      const compressionRatio = delta.sparseChanges.length / dimension;
      expect(compressionRatio).toBeLessThan(0.01);
    });

    it('should throw when no genesis exists', () => {
      expect(() => tracker.recordDelta('pat-x', [1], [2])).toThrow('No genesis found');
    });

    it('should respect epsilon threshold for change detection', () => {
      const tracker2 = new VectorDeltaTracker({ epsilon: 0.01 });
      const v0 = [1.0, 2.0, 3.0];
      tracker2.recordGenesis('pat-1', v0);

      // Change dimension 0 by less than epsilon (should be ignored)
      // Change dimension 2 by more than epsilon (should be captured)
      const v1 = [1.005, 2.0, 3.05];
      const delta = tracker2.recordDelta('pat-1', v0, v1);

      expect(delta.sparseChanges).toHaveLength(1);
      expect(delta.sparseChanges[0].index).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Version tracking
  // --------------------------------------------------------------------------

  describe('getVersion', () => {
    it('should return -1 for unknown pattern', () => {
      expect(tracker.getVersion('nonexistent')).toBe(-1);
    });

    it('should return 0 after genesis', () => {
      tracker.recordGenesis('pat-1', [1, 2, 3]);
      expect(tracker.getVersion('pat-1')).toBe(0);
    });

    it('should increment correctly across multiple updates', () => {
      const v0 = [0.1, 0.2, 0.3];
      tracker.recordGenesis('pat-1', v0);
      tracker.recordDelta('pat-1', v0, [0.2, 0.2, 0.3]);
      tracker.recordDelta('pat-1', [0.2, 0.2, 0.3], [0.3, 0.2, 0.3]);
      tracker.recordDelta('pat-1', [0.3, 0.2, 0.3], [0.4, 0.2, 0.3]);

      expect(tracker.getVersion('pat-1')).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // History retrieval
  // --------------------------------------------------------------------------

  describe('getHistory', () => {
    it('should return deltas newest-first', () => {
      const v0 = [1, 2, 3];
      const v1 = [1, 2, 4];
      const v2 = [1, 2, 5];
      tracker.recordGenesis('pat-1', v0);
      tracker.recordDelta('pat-1', v0, v1);
      tracker.recordDelta('pat-1', v1, v2);

      const history = tracker.getHistory('pat-1');
      expect(history).toHaveLength(3);
      expect(history[0].version).toBe(2); // newest first
      expect(history[1].version).toBe(1);
      expect(history[2].version).toBe(0); // oldest last
    });

    it('should respect limit parameter', () => {
      const v0 = [1, 2, 3];
      tracker.recordGenesis('pat-1', v0);
      tracker.recordDelta('pat-1', v0, [1, 2, 4]);
      tracker.recordDelta('pat-1', [1, 2, 4], [1, 2, 5]);

      const history = tracker.getHistory('pat-1', 2);
      expect(history).toHaveLength(2);
      expect(history[0].version).toBe(2);
      expect(history[1].version).toBe(1);
    });

    it('should return empty array for unknown pattern', () => {
      expect(tracker.getHistory('unknown')).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // Rollback
  // --------------------------------------------------------------------------

  describe('rollback', () => {
    it('should rollback to v0 and return genesis vector', () => {
      const v0 = [0.1, 0.2, 0.3];
      const v1 = [0.5, 0.6, 0.7];
      tracker.recordGenesis('pat-1', v0);
      tracker.recordDelta('pat-1', v0, v1);

      const snapshot = tracker.rollback('pat-1', 0);
      expect(snapshot).not.toBeNull();
      expect(snapshot!.version).toBe(0);
      expect(snapshot!.fullVector).toEqual(v0);
    });

    it('should rollback to intermediate version correctly', () => {
      const v0 = [1.0, 2.0, 3.0];
      const v1 = [1.5, 2.0, 3.0]; // change dim 0
      const v2 = [1.5, 2.5, 3.0]; // change dim 1
      const v3 = [1.5, 2.5, 3.5]; // change dim 2

      tracker.recordGenesis('pat-1', v0);
      tracker.recordDelta('pat-1', v0, v1);
      tracker.recordDelta('pat-1', v1, v2);
      tracker.recordDelta('pat-1', v2, v3);

      const snapshot = tracker.rollback('pat-1', 2);
      expect(snapshot).not.toBeNull();
      expect(snapshot!.version).toBe(2);
      expect(snapshot!.fullVector).toEqual(v2);
    });

    it('should return null for non-existent version', () => {
      tracker.recordGenesis('pat-1', [1, 2, 3]);
      expect(tracker.rollback('pat-1', 99)).toBeNull();
      expect(tracker.rollback('pat-1', -1)).toBeNull();
    });

    it('should return null for non-existent pattern', () => {
      expect(tracker.rollback('unknown', 0)).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Snapshots and reconstruction
  // --------------------------------------------------------------------------

  describe('snapshots and reconstructAtVersion', () => {
    it('should create snapshots at snapshotInterval boundaries', () => {
      const cfg: Partial<VectorDeltaTrackerConfig> = { snapshotInterval: 3 };
      const t = new VectorDeltaTracker(cfg);

      let current = [1.0, 2.0, 3.0];
      t.recordGenesis('pat-1', current);

      // Create 6 deltas (versions 1-6)
      for (let i = 1; i <= 6; i++) {
        const next = current.map(v => v + 0.1);
        t.recordDelta('pat-1', current, next);
        current = next;
      }

      // Snapshots should be at: v0 (genesis), v3, v6
      // Verify reconstruction at v3 and v6 is fast (uses snapshots)
      const atV3 = t.reconstructAtVersion('pat-1', 3);
      expect(atV3).not.toBeNull();
      // v0 = [1.0, 2.0, 3.0], each version adds 0.1 to all dims
      // v3 = [1.3, 2.3, 3.3]
      expect(atV3![0]).toBeCloseTo(1.3, 5);
      expect(atV3![1]).toBeCloseTo(2.3, 5);
      expect(atV3![2]).toBeCloseTo(3.3, 5);
    });

    it('should reconstruct using nearest snapshot + forward replay', () => {
      const t = new VectorDeltaTracker({ snapshotInterval: 5 });

      let current = [0.0, 0.0, 0.0, 0.0];
      t.recordGenesis('pat-1', current);

      // Create 7 deltas changing only dimension 0
      for (let i = 1; i <= 7; i++) {
        const next = [...current];
        next[0] = i * 1.0;
        t.recordDelta('pat-1', current, next);
        current = next;
      }

      // Snapshot at v0 and v5
      // To reconstruct v7: use snapshot at v5, apply v6 and v7 deltas
      const atV7 = t.reconstructAtVersion('pat-1', 7);
      expect(atV7).not.toBeNull();
      expect(atV7![0]).toBe(7.0);
      expect(atV7![1]).toBe(0.0);

      // To reconstruct v3: use snapshot at v0, apply v1,v2,v3 deltas
      const atV3 = t.reconstructAtVersion('pat-1', 3);
      expect(atV3).not.toBeNull();
      expect(atV3![0]).toBe(3.0);
    });

    it('should return null for version beyond current', () => {
      tracker.recordGenesis('pat-1', [1, 2, 3]);
      expect(tracker.reconstructAtVersion('pat-1', 5)).toBeNull();
    });

    it('should return null for unknown pattern', () => {
      expect(tracker.reconstructAtVersion('unknown', 0)).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Pruning
  // --------------------------------------------------------------------------

  describe('pruneHistory', () => {
    it('should respect keepVersions parameter', () => {
      const t = new VectorDeltaTracker({ maxHistoryPerPattern: 100 });
      let current = [1.0];
      t.recordGenesis('pat-1', current);

      for (let i = 1; i <= 10; i++) {
        const next = [current[0] + 1];
        t.recordDelta('pat-1', current, next);
        current = next;
      }

      // 11 entries total (genesis + 10 deltas)
      expect(t.getHistory('pat-1')).toHaveLength(11);

      const pruned = t.pruneHistory('pat-1', 5);
      expect(pruned).toBeGreaterThan(0);

      // Should have at most 5 + genesis = 6 (genesis is preserved)
      const remaining = t.getHistory('pat-1');
      expect(remaining.length).toBeLessThanOrEqual(6);
    });

    it('should always preserve genesis', () => {
      const t = new VectorDeltaTracker({ maxHistoryPerPattern: 100 });
      let current = [1.0];
      t.recordGenesis('pat-1', current);

      for (let i = 1; i <= 10; i++) {
        const next = [current[0] + 1];
        t.recordDelta('pat-1', current, next);
        current = next;
      }

      t.pruneHistory('pat-1', 3);

      const history = t.getHistory('pat-1');
      const hasGenesis = history.some(d => d.deltaType === 'genesis');
      expect(hasGenesis).toBe(true);
    });

    it('should return 0 when nothing to prune', () => {
      tracker.recordGenesis('pat-1', [1]);
      expect(tracker.pruneHistory('pat-1', 100)).toBe(0);
    });

    it('should auto-prune via maxHistoryPerPattern config', () => {
      const t = new VectorDeltaTracker({ maxHistoryPerPattern: 5 });
      let current = [1.0];
      t.recordGenesis('pat-1', current);

      for (let i = 1; i <= 10; i++) {
        const next = [current[0] + 1];
        t.recordDelta('pat-1', current, next);
        current = next;
      }

      const history = t.getHistory('pat-1');
      // Should have been auto-pruned to at most 5 + genesis
      expect(history.length).toBeLessThanOrEqual(6);
    });
  });

  // --------------------------------------------------------------------------
  // Stats
  // --------------------------------------------------------------------------

  describe('getStats', () => {
    it('should return accurate counts', () => {
      const v0 = [1, 2, 3];
      const v1 = [1, 2, 4];
      tracker.recordGenesis('pat-1', v0);
      tracker.recordDelta('pat-1', v0, v1);
      tracker.recordGenesis('pat-2', [5, 6, 7]);

      const stats = tracker.getStats();
      expect(stats.totalPatterns).toBe(2);
      expect(stats.totalDeltas).toBe(3); // 2 for pat-1, 1 for pat-2
      expect(stats.avgDeltasPerPattern).toBe(1.5);
    });

    it('should return zeros when empty', () => {
      const stats = tracker.getStats();
      expect(stats.totalPatterns).toBe(0);
      expect(stats.totalDeltas).toBe(0);
      expect(stats.avgDeltasPerPattern).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Batch buffering
  // --------------------------------------------------------------------------

  describe('batch buffering', () => {
    it('should buffer deltas until flush()', () => {
      tracker.recordGenesis('pat-1', [1, 2, 3]);
      tracker.recordDelta('pat-1', [1, 2, 3], [1, 2, 4]);

      expect(tracker.getBufferSize()).toBe(2);

      const flushed = tracker.flush();
      expect(flushed).toHaveLength(2);
      expect(flushed[0].deltaType).toBe('genesis');
      expect(flushed[1].deltaType).toBe('update');

      expect(tracker.getBufferSize()).toBe(0);
    });

    it('should return empty array on flush when buffer is empty', () => {
      expect(tracker.flush()).toEqual([]);
    });

    it('should not affect history when flushing', () => {
      tracker.recordGenesis('pat-1', [1, 2, 3]);
      tracker.flush();

      // History should still be available after flush
      const history = tracker.getHistory('pat-1');
      expect(history).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // Feature flag gate
  // --------------------------------------------------------------------------

  describe('feature flag gate', () => {
    it('should return null from factory when feature flag is disabled', () => {
      setRuVectorFeatureFlags({ useDeltaEventSourcing: false });
      const result = createVectorDeltaTracker();
      expect(result).toBeNull();
    });

    it('should return instance from factory when feature flag is enabled', () => {
      setRuVectorFeatureFlags({ useDeltaEventSourcing: true });
      const result = createVectorDeltaTracker();
      expect(result).toBeInstanceOf(VectorDeltaTracker);
    });

    it('should accept config in factory', () => {
      setRuVectorFeatureFlags({ useDeltaEventSourcing: true });
      const result = createVectorDeltaTracker({ maxHistoryPerPattern: 10 });
      expect(result).toBeInstanceOf(VectorDeltaTracker);
    });
  });

  // --------------------------------------------------------------------------
  // Clear
  // --------------------------------------------------------------------------

  describe('clear', () => {
    it('should remove all data', () => {
      tracker.recordGenesis('pat-1', [1, 2, 3]);
      tracker.recordGenesis('pat-2', [4, 5, 6]);

      tracker.clear();

      expect(tracker.getStats().totalPatterns).toBe(0);
      expect(tracker.getVersion('pat-1')).toBe(-1);
      expect(tracker.getBufferSize()).toBe(0);
    });
  });
});
