/**
 * R3: Delta Event Sourcing - Unit Tests
 *
 * Tests for DeltaTracker: genesis, delta recording, rollback,
 * history, incremental sync, retention, and reverse patch correctness.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  DeltaTracker,
  type DeltaEvent,
  type DeltaTrackerConfig,
} from '../../../../src/integrations/ruvector/delta-tracker';

// ============================================================================
// Helpers
// ============================================================================

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  return db;
}

function makeTracker(
  db: Database.Database,
  config?: DeltaTrackerConfig,
): DeltaTracker {
  const tracker = new DeltaTracker(db, config);
  tracker.initialize();
  return tracker;
}

// Sample pattern objects for testing
const PATTERN_V0 = { name: 'Login test', confidence: 0.5, tags: ['auth'] };
const PATTERN_V1 = { name: 'Login test', confidence: 0.7, tags: ['auth', 'smoke'] };
const PATTERN_V2 = { name: 'Login test v2', confidence: 0.8, tags: ['auth', 'smoke'] };
const PATTERN_V3 = { name: 'Login test v2', confidence: 0.85, tags: ['auth', 'smoke', 'critical'] };

// ============================================================================
// Tests
// ============================================================================

describe('DeltaTracker', () => {
  let db: Database.Database;
  let tracker: DeltaTracker;

  beforeEach(() => {
    db = createTestDb();
    tracker = makeTracker(db);
  });

  afterEach(() => {
    db.close();
  });

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  describe('initialize', () => {
    it('should create pattern_deltas table', () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pattern_deltas'")
        .all();
      expect(tables).toHaveLength(1);
    });

    it('should create indexes', () => {
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_pattern_deltas%'")
        .all() as Array<{ name: string }>;
      const names = indexes.map((i) => i.name);
      expect(names).toContain('idx_pattern_deltas_pid_version');
      expect(names).toContain('idx_pattern_deltas_timestamp');
    });

    it('should be idempotent', () => {
      tracker.initialize(); // second call should not throw
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pattern_deltas'")
        .all();
      expect(tables).toHaveLength(1);
    });

    it('should throw when calling methods before initialize', () => {
      const raw = new DeltaTracker(db);
      expect(() => raw.getHistory('pat-1')).toThrow('not initialized');
    });
  });

  // --------------------------------------------------------------------------
  // Genesis creation
  // --------------------------------------------------------------------------

  describe('createGenesis', () => {
    it('should store full snapshot at version 0', () => {
      const event = tracker.createGenesis('pat-1', PATTERN_V0);

      expect(event.version).toBe(0);
      expect(event.type).toBe('genesis');
      expect(event.patternId).toBe('pat-1');
      expect(event.patch).toEqual([]);
      expect(event.reversePatch).toEqual([]);
      expect(event.metadata?.snapshot).toEqual(PATTERN_V0);
      expect(event.id).toBeTruthy();
      expect(event.timestamp).toBeGreaterThan(0);
    });

    it('should persist genesis to SQLite', () => {
      tracker.createGenesis('pat-1', PATTERN_V0);

      const row = db.prepare('SELECT * FROM pattern_deltas WHERE pattern_id = ?').get('pat-1') as Record<string, unknown>;
      expect(row).toBeTruthy();
      expect(row.version).toBe(0);
      expect(row.type).toBe('genesis');
    });

    it('should reject duplicate genesis for same pattern', () => {
      tracker.createGenesis('pat-1', PATTERN_V0);
      expect(() => tracker.createGenesis('pat-1', PATTERN_V0)).toThrow('Genesis already exists');
    });

    it('should allow genesis for different patterns', () => {
      tracker.createGenesis('pat-1', PATTERN_V0);
      tracker.createGenesis('pat-2', { name: 'Other' });

      expect(tracker.getCurrentVersion('pat-1')).toBe(0);
      expect(tracker.getCurrentVersion('pat-2')).toBe(0);
    });

    it('should include custom metadata alongside snapshot', () => {
      const event = tracker.createGenesis('pat-1', PATTERN_V0, { author: 'agent-1' });
      expect(event.metadata?.author).toBe('agent-1');
      expect(event.metadata?.snapshot).toEqual(PATTERN_V0);
    });
  });

  // --------------------------------------------------------------------------
  // Delta recording
  // --------------------------------------------------------------------------

  describe('recordDelta', () => {
    it('should create a patch with incremented version', () => {
      tracker.createGenesis('pat-1', PATTERN_V0);
      const event = tracker.recordDelta('pat-1', PATTERN_V0, PATTERN_V1);

      expect(event.version).toBe(1);
      expect(event.type).toBe('update');
      expect(event.patch.length).toBeGreaterThan(0);
      expect(event.reversePatch.length).toBeGreaterThan(0);
    });

    it('should throw when no genesis exists', () => {
      expect(() => tracker.recordDelta('pat-x', {}, {})).toThrow('No genesis found');
    });

    it('should correctly increment versions across multiple updates', () => {
      tracker.createGenesis('pat-1', PATTERN_V0);
      tracker.recordDelta('pat-1', PATTERN_V0, PATTERN_V1);
      tracker.recordDelta('pat-1', PATTERN_V1, PATTERN_V2);
      const event = tracker.recordDelta('pat-1', PATTERN_V2, PATTERN_V3);

      expect(event.version).toBe(3);
      expect(tracker.getCurrentVersion('pat-1')).toBe(3);
    });

    it('should generate valid forward patches', () => {
      tracker.createGenesis('pat-1', PATTERN_V0);
      const event = tracker.recordDelta('pat-1', PATTERN_V0, PATTERN_V1);

      // Verify the forward patch transforms V0 into V1
      const ops = event.patch;
      expect(ops.some((op) => op.path.includes('confidence'))).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Rollback
  // --------------------------------------------------------------------------

  describe('rollback', () => {
    it('should reconstruct state at target version', () => {
      tracker.createGenesis('pat-1', PATTERN_V0);
      tracker.recordDelta('pat-1', PATTERN_V0, PATTERN_V1);
      tracker.recordDelta('pat-1', PATTERN_V1, PATTERN_V2);
      tracker.recordDelta('pat-1', PATTERN_V2, PATTERN_V3);

      const stateAtV1 = tracker.rollback('pat-1', 1);
      expect(stateAtV1).toEqual(PATTERN_V1);
    });

    it('should rollback to genesis (version 0)', () => {
      tracker.createGenesis('pat-1', PATTERN_V0);
      tracker.recordDelta('pat-1', PATTERN_V0, PATTERN_V1);
      tracker.recordDelta('pat-1', PATTERN_V1, PATTERN_V2);

      const stateAtV0 = tracker.rollback('pat-1', 0);
      expect(stateAtV0).toEqual(PATTERN_V0);
    });

    it('should create a rollback event in history', () => {
      tracker.createGenesis('pat-1', PATTERN_V0);
      tracker.recordDelta('pat-1', PATTERN_V0, PATTERN_V1);
      tracker.recordDelta('pat-1', PATTERN_V1, PATTERN_V2);

      tracker.rollback('pat-1', 0);

      const history = tracker.getHistory('pat-1');
      const rollbackEvent = history[history.length - 1];
      expect(rollbackEvent.type).toBe('rollback');
      expect(rollbackEvent.metadata?.rolledBackTo).toBe(0);
    });

    it('should return current state when rolling back to current version', () => {
      tracker.createGenesis('pat-1', PATTERN_V0);
      tracker.recordDelta('pat-1', PATTERN_V0, PATTERN_V1);

      const state = tracker.rollback('pat-1', 1);
      expect(state).toEqual(PATTERN_V1);
    });

    it('should throw for non-existent pattern', () => {
      expect(() => tracker.rollback('pat-x', 0)).toThrow('No history found');
    });

    it('should throw for invalid version number', () => {
      tracker.createGenesis('pat-1', PATTERN_V0);
      tracker.recordDelta('pat-1', PATTERN_V0, PATTERN_V1);

      expect(() => tracker.rollback('pat-1', -1)).toThrow('Invalid rollback version');
      expect(() => tracker.rollback('pat-1', 99)).toThrow('Invalid rollback version');
    });

    it('should handle rollback after 5 updates to version 2', () => {
      const states = [
        PATTERN_V0,
        { ...PATTERN_V0, confidence: 0.6 },
        { ...PATTERN_V0, confidence: 0.7, tags: ['auth', 'regression'] },
        { ...PATTERN_V0, confidence: 0.8, tags: ['auth', 'regression'], name: 'Login v3' },
        { ...PATTERN_V0, confidence: 0.9, tags: ['auth'], name: 'Login v4' },
        { ...PATTERN_V0, confidence: 0.95, tags: [], name: 'Login v5' },
      ];

      tracker.createGenesis('pat-1', states[0]);
      for (let i = 1; i < states.length; i++) {
        tracker.recordDelta('pat-1', states[i - 1], states[i]);
      }

      expect(tracker.getCurrentVersion('pat-1')).toBe(5);

      const stateAtV2 = tracker.rollback('pat-1', 2);
      expect(stateAtV2).toEqual(states[2]);
    });
  });

  // --------------------------------------------------------------------------
  // History
  // --------------------------------------------------------------------------

  describe('getHistory', () => {
    it('should return all deltas in version order', () => {
      tracker.createGenesis('pat-1', PATTERN_V0);
      tracker.recordDelta('pat-1', PATTERN_V0, PATTERN_V1);
      tracker.recordDelta('pat-1', PATTERN_V1, PATTERN_V2);

      const history = tracker.getHistory('pat-1');
      expect(history).toHaveLength(3);
      expect(history[0].version).toBe(0);
      expect(history[1].version).toBe(1);
      expect(history[2].version).toBe(2);
    });

    it('should return empty array for unknown pattern', () => {
      const history = tracker.getHistory('pat-unknown');
      expect(history).toEqual([]);
    });

    it('should isolate history between patterns', () => {
      tracker.createGenesis('pat-1', PATTERN_V0);
      tracker.createGenesis('pat-2', { x: 1 });
      tracker.recordDelta('pat-1', PATTERN_V0, PATTERN_V1);

      expect(tracker.getHistory('pat-1')).toHaveLength(2);
      expect(tracker.getHistory('pat-2')).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // Incremental sync
  // --------------------------------------------------------------------------

  describe('incrementalSync', () => {
    it('should return only deltas after the given timestamp', () => {
      // Use a timestamp clearly in the past so all events are "after" it
      const ancientTimestamp = Date.now() - 10000;
      tracker.createGenesis('pat-1', PATTERN_V0);
      tracker.recordDelta('pat-1', PATTERN_V0, PATTERN_V1);

      const synced = tracker.incrementalSync(ancientTimestamp);
      // Both genesis and update should be after the ancient timestamp
      expect(synced.length).toBe(2);
      for (const event of synced) {
        expect(event.timestamp).toBeGreaterThan(ancientTimestamp);
      }

      // Now use a future timestamp - should return nothing
      const futureTs = Date.now() + 10000;
      expect(tracker.incrementalSync(futureTs)).toEqual([]);
    });

    it('should return empty when no deltas after timestamp', () => {
      tracker.createGenesis('pat-1', PATTERN_V0);
      const futureTimestamp = Date.now() + 100000;
      const synced = tracker.incrementalSync(futureTimestamp);
      expect(synced).toEqual([]);
    });

    it('should return deltas across multiple patterns', () => {
      const t0 = Date.now() - 1;
      tracker.createGenesis('pat-1', PATTERN_V0);
      tracker.createGenesis('pat-2', { x: 1 });

      const synced = tracker.incrementalSync(t0);
      const patternIds = synced.map((e) => e.patternId);
      expect(patternIds).toContain('pat-1');
      expect(patternIds).toContain('pat-2');
    });
  });

  // --------------------------------------------------------------------------
  // Version tracking
  // --------------------------------------------------------------------------

  describe('getCurrentVersion', () => {
    it('should return -1 for unknown pattern', () => {
      expect(tracker.getCurrentVersion('nonexistent')).toBe(-1);
    });

    it('should return 0 after genesis', () => {
      tracker.createGenesis('pat-1', PATTERN_V0);
      expect(tracker.getCurrentVersion('pat-1')).toBe(0);
    });

    it('should return correct version after multiple updates', () => {
      tracker.createGenesis('pat-1', PATTERN_V0);
      tracker.recordDelta('pat-1', PATTERN_V0, PATTERN_V1);
      tracker.recordDelta('pat-1', PATTERN_V1, PATTERN_V2);
      expect(tracker.getCurrentVersion('pat-1')).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Retention
  // --------------------------------------------------------------------------

  describe('retention (maxVersionsPerPattern)', () => {
    it('should prune old deltas when exceeding max', () => {
      const smallTracker = makeTracker(db, { maxVersionsPerPattern: 5 });
      const state = { val: 0 };

      smallTracker.createGenesis('pat-1', { ...state });
      for (let i = 1; i <= 10; i++) {
        const before = { val: i - 1 };
        const after = { val: i };
        smallTracker.recordDelta('pat-1', before, after);
      }

      const history = smallTracker.getHistory('pat-1');
      // Should retain at most 5 entries
      expect(history.length).toBeLessThanOrEqual(5);
    });

    it('should always keep genesis event', () => {
      const smallTracker = makeTracker(db, { maxVersionsPerPattern: 3 });
      const state = { val: 0 };

      smallTracker.createGenesis('pat-1', { ...state });
      for (let i = 1; i <= 10; i++) {
        smallTracker.recordDelta('pat-1', { val: i - 1 }, { val: i });
      }

      const history = smallTracker.getHistory('pat-1');
      const hasGenesis = history.some((e) => e.type === 'genesis' && e.version === 0);
      expect(hasGenesis).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Reverse patch correctness
  // --------------------------------------------------------------------------

  describe('reverse patch correctness', () => {
    it('should produce reverse patches that undo forward patches', () => {
      tracker.createGenesis('pat-1', PATTERN_V0);
      const event = tracker.recordDelta('pat-1', PATTERN_V0, PATTERN_V1);

      // Apply forward to V0 should give V1
      const forwardResult = applyPatchesHelper(PATTERN_V0, event.patch);
      expect(forwardResult).toEqual(PATTERN_V1);

      // Apply reverse to V1 should give V0
      const reverseResult = applyPatchesHelper(PATTERN_V1, event.reversePatch);
      expect(reverseResult).toEqual(PATTERN_V0);
    });

    it('should handle nested object changes correctly', () => {
      const before = { name: 'Test', config: { retries: 3, timeout: 1000 } };
      const after = { name: 'Test', config: { retries: 5, timeout: 2000 } };

      tracker.createGenesis('pat-2', before);
      const event = tracker.recordDelta('pat-2', before, after);

      const forwardResult = applyPatchesHelper(before, event.patch);
      expect(forwardResult).toEqual(after);

      const reverseResult = applyPatchesHelper(after, event.reversePatch);
      expect(reverseResult).toEqual(before);
    });

    it('should handle property additions and removals', () => {
      const before = { name: 'Test', oldProp: 'remove-me' };
      const after = { name: 'Test', newProp: 'added' };

      tracker.createGenesis('pat-3', before);
      const event = tracker.recordDelta('pat-3', before, after);

      const forwardResult = applyPatchesHelper(before, event.patch);
      expect(forwardResult).toEqual(after);

      const reverseResult = applyPatchesHelper(after, event.reversePatch);
      expect(reverseResult).toEqual(before);
    });
  });
});

// ============================================================================
// Test-only helper: apply patches using fast-json-patch
// ============================================================================

function applyPatchesHelper(
  obj: Record<string, unknown>,
  patches: Array<{ op: string; path: string; value?: unknown; from?: string }>,
): Record<string, unknown> {
  // Use dynamic import workaround - import at module level is fine in tests
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fjp = require('fast-json-patch');
  const cloned = fjp.deepClone(obj);
  const result = fjp.applyPatch(cloned, patches);
  return result.newDocument;
}
