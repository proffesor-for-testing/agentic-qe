/**
 * Dream Branching Unit Tests
 * ADR-069: RVCOW Dream Cycle Branching
 *
 * Tests for RVCOWBranchManager and SpeculativeDreamer using
 * in-memory SQLite databases (never touches real memory.db).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import {
  RVCOWBranchManager,
  type Branch,
  type QualityBaseline,
  type ValidationResult,
  type BranchEvent,
  DEFAULT_VALIDATION_THRESHOLDS,
} from '../../../../src/learning/dream/rvcow-branch-manager.js';
import {
  SpeculativeDreamer,
  type DreamStrategy,
  BUILT_IN_STRATEGIES,
} from '../../../../src/learning/dream/speculative-dreamer.js';
import type { DreamEngine, DreamCycleResult, DreamRunOptions } from '../../../../src/learning/dream/dream-engine.js';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create an in-memory SQLite database with the qe_patterns table.
 */
function createTestDb(): DatabaseType {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE qe_patterns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      qe_domain TEXT DEFAULT 'testing',
      pattern_type TEXT DEFAULT 'testing',
      confidence REAL DEFAULT 0.5,
      success_rate REAL DEFAULT 0.5,
      quality_score REAL DEFAULT 0.5,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  return db;
}

/**
 * Seed the test database with patterns.
 */
function seedPatterns(db: DatabaseType, count: number, baseConfidence = 0.7): void {
  const stmt = db.prepare(
    'INSERT INTO qe_patterns (id, name, confidence) VALUES (?, ?, ?)'
  );
  for (let i = 0; i < count; i++) {
    const confidence = Math.min(1.0, baseConfidence + (i % 5) * 0.05);
    stmt.run(`pattern-${i}`, `Test Pattern ${i}`, confidence);
  }
}

// ============================================================================
// RVCOWBranchManager Tests
// ============================================================================

describe('RVCOWBranchManager', () => {
  let db: DatabaseType;
  let manager: RVCOWBranchManager;

  beforeEach(() => {
    db = createTestDb();
    manager = new RVCOWBranchManager(db);
  });

  afterEach(() => {
    db.close();
  });

  // --------------------------------------------------------------------------
  // Branch Creation & Listing
  // --------------------------------------------------------------------------

  describe('createBranch', () => {
    it('should create a branch and list it as active', () => {
      const branch = manager.createBranch('test-branch');

      expect(branch.name).toBe('test-branch');
      expect(branch.status).toBe('active');
      expect(branch.createdAt).toBeInstanceOf(Date);
      expect(branch.baselineSnapshot).toBeDefined();
      expect(branch.baselineSnapshot.patternCount).toBe(0);

      const branches = manager.listBranches();
      expect(branches).toHaveLength(1);
      expect(branches[0].name).toBe('test-branch');
    });

    it('should capture correct baseline when patterns exist', () => {
      seedPatterns(db, 20, 0.85);
      const branch = manager.createBranch('with-data');

      expect(branch.baselineSnapshot.patternCount).toBe(20);
      expect(branch.baselineSnapshot.avgConfidence).toBeGreaterThan(0.8);
      expect(branch.baselineSnapshot.highConfidenceCount).toBeGreaterThan(0);
    });

    it('should throw on duplicate branch name', () => {
      manager.createBranch('dup');
      expect(() => manager.createBranch('dup')).toThrow("Branch 'dup' already exists");
    });

    it('should support multiple concurrent branches', () => {
      manager.createBranch('branch-a');
      manager.createBranch('branch-b');
      manager.createBranch('branch-c');

      expect(manager.listBranches()).toHaveLength(3);
    });
  });

  // --------------------------------------------------------------------------
  // Validation
  // --------------------------------------------------------------------------

  describe('validateBranch', () => {
    it('should pass when no quality degradation occurs', () => {
      seedPatterns(db, 50, 0.7);
      const branch = manager.createBranch('validate-pass');

      // Add a pattern during the dream (improvement)
      db.prepare('INSERT INTO qe_patterns (id, name, confidence) VALUES (?, ?, ?)').run(
        'dream-new', 'Dream Discovery', 0.9
      );

      const result = manager.validateBranch(branch);
      expect(result.passed).toBe(true);
      expect(result.patternCountDelta).toBe(1);
      expect(result.reason).toContain('passed');
    });

    it('should fail when too many patterns are removed', () => {
      seedPatterns(db, 100, 0.7);
      const branch = manager.createBranch('validate-fail-count');

      // Remove 10% of patterns (threshold is 5%)
      for (let i = 0; i < 10; i++) {
        db.prepare('DELETE FROM qe_patterns WHERE id = ?').run(`pattern-${i}`);
      }

      const result = manager.validateBranch(branch);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('Pattern count dropped');
      expect(result.patternCountDelta).toBe(-10);
    });

    it('should fail when average confidence drops too much', () => {
      seedPatterns(db, 50, 0.9);
      const branch = manager.createBranch('validate-fail-conf');

      // Dramatically reduce confidence on many patterns
      db.exec('UPDATE qe_patterns SET confidence = 0.1');

      const result = manager.validateBranch(branch);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('confidence dropped');
    });

    it('should fail when high-confidence patterns are quarantined', () => {
      // Create 20 high-confidence patterns
      const stmt = db.prepare(
        'INSERT INTO qe_patterns (id, name, confidence) VALUES (?, ?, ?)'
      );
      for (let i = 0; i < 20; i++) {
        stmt.run(`hc-${i}`, `High Conf ${i}`, 0.95);
      }

      const branch = manager.createBranch('validate-fail-hc');

      // Remove 3 of 20 high-confidence patterns (15%, threshold is 5%)
      db.prepare('DELETE FROM qe_patterns WHERE id = ?').run('hc-0');
      db.prepare('DELETE FROM qe_patterns WHERE id = ?').run('hc-1');
      db.prepare('DELETE FROM qe_patterns WHERE id = ?').run('hc-2');

      const result = manager.validateBranch(branch);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('high-confidence patterns lost');
    });

    it('should accept a custom baseline', () => {
      seedPatterns(db, 30, 0.7);
      const branch = manager.createBranch('custom-baseline');

      const customBaseline: QualityBaseline = {
        patternCount: 25,
        avgConfidence: 0.6,
        highConfidenceCount: 5,
        capturedAt: new Date(),
      };

      const result = manager.validateBranch(branch, customBaseline);
      // 30 patterns vs 25 baseline -- improvement, should pass
      expect(result.passed).toBe(true);
      expect(result.patternCountDelta).toBe(5);
    });
  });

  // --------------------------------------------------------------------------
  // Merge
  // --------------------------------------------------------------------------

  describe('mergeBranch', () => {
    it('should persist changes after merge', () => {
      seedPatterns(db, 10, 0.7);
      const branch = manager.createBranch('merge-test');

      // Add pattern in branch
      db.prepare('INSERT INTO qe_patterns (id, name, confidence) VALUES (?, ?, ?)').run(
        'branch-pat', 'Branch Pattern', 0.9
      );

      manager.mergeBranch(branch);

      // Pattern should still exist after merge
      const row = db.prepare('SELECT * FROM qe_patterns WHERE id = ?').get('branch-pat');
      expect(row).toBeDefined();

      // Branch should no longer be listed
      expect(manager.listBranches()).toHaveLength(0);
      expect(branch.status).toBe('merged');
    });

    it('should throw on non-existent branch', () => {
      const fakeBranch: Branch = {
        name: 'nonexistent',
        createdAt: new Date(),
        status: 'active',
        baselineSnapshot: { patternCount: 0, avgConfidence: 0, highConfidenceCount: 0, capturedAt: new Date() },
      };
      expect(() => manager.mergeBranch(fakeBranch)).toThrow("Branch 'nonexistent' not found");
    });
  });

  // --------------------------------------------------------------------------
  // Discard
  // --------------------------------------------------------------------------

  describe('discardBranch', () => {
    it('should roll back all changes on discard', () => {
      seedPatterns(db, 10, 0.7);
      const countBefore = (db.prepare('SELECT COUNT(*) as cnt FROM qe_patterns').get() as { cnt: number }).cnt;

      const branch = manager.createBranch('discard-test');

      // Make changes within the branch
      db.prepare('INSERT INTO qe_patterns (id, name, confidence) VALUES (?, ?, ?)').run(
        'will-vanish', 'Gone Pattern', 0.9
      );
      db.prepare('DELETE FROM qe_patterns WHERE id = ?').run('pattern-0');
      db.exec('UPDATE qe_patterns SET confidence = 0.1 WHERE id = \'pattern-1\'');

      manager.discardBranch(branch);

      // All changes should be rolled back
      const countAfter = (db.prepare('SELECT COUNT(*) as cnt FROM qe_patterns').get() as { cnt: number }).cnt;
      expect(countAfter).toBe(countBefore);

      // Deleted pattern should be back
      const restored = db.prepare('SELECT * FROM qe_patterns WHERE id = ?').get('pattern-0');
      expect(restored).toBeDefined();

      // Inserted pattern should be gone
      const vanished = db.prepare('SELECT * FROM qe_patterns WHERE id = ?').get('will-vanish');
      expect(vanished).toBeUndefined();

      // Updated pattern should have original confidence
      const original = db.prepare('SELECT confidence FROM qe_patterns WHERE id = ?').get('pattern-1') as { confidence: number };
      expect(original.confidence).toBeGreaterThan(0.1);

      // Branch should no longer be listed
      expect(manager.listBranches()).toHaveLength(0);
      expect(branch.status).toBe('discarded');
    });

    it('should leave no trace of discarded branch operations', () => {
      seedPatterns(db, 5, 0.8);

      // Take a snapshot of all data before
      const dataBefore = db.prepare('SELECT id, name, confidence FROM qe_patterns ORDER BY id').all();

      const branch = manager.createBranch('no-trace');

      // Make various modifications
      db.prepare('INSERT INTO qe_patterns (id, name, confidence) VALUES (?, ?, ?)').run(
        'trace-1', 'Should Not Exist', 0.5
      );
      db.exec('UPDATE qe_patterns SET confidence = confidence - 0.3');

      manager.discardBranch(branch);

      // Take a snapshot after
      const dataAfter = db.prepare('SELECT id, name, confidence FROM qe_patterns ORDER BY id').all();

      expect(dataAfter).toEqual(dataBefore);
    });
  });

  // --------------------------------------------------------------------------
  // Events
  // --------------------------------------------------------------------------

  describe('events', () => {
    it('should emit branch lifecycle events', () => {
      const events: Array<{ event: BranchEvent; branchName: string }> = [];
      manager.onEvent((event, branch) => {
        events.push({ event, branchName: branch.name });
      });

      const branch = manager.createBranch('event-test');
      manager.mergeBranch(branch);

      expect(events).toHaveLength(2);
      expect(events[0].event).toBe('dream:branch_created');
      expect(events[1].event).toBe('dream:branch_merged');
    });

    it('should emit discard event', () => {
      const events: BranchEvent[] = [];
      manager.onEvent((event) => {
        events.push(event);
      });

      const branch = manager.createBranch('discard-event');
      manager.discardBranch(branch);

      expect(events).toContain('dream:branch_discarded');
    });

    it('should support removing listeners', () => {
      const events: BranchEvent[] = [];
      const listener = (event: BranchEvent) => { events.push(event); };
      manager.onEvent(listener);

      manager.createBranch('remove-listener-1');
      manager.offEvent(listener);
      manager.createBranch('remove-listener-2');

      // Should only have the first event
      expect(events).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle empty database', () => {
      const branch = manager.createBranch('empty-db');
      expect(branch.baselineSnapshot.patternCount).toBe(0);
      expect(branch.baselineSnapshot.avgConfidence).toBe(0);

      const result = manager.validateBranch(branch);
      expect(result.passed).toBe(true);
    });

    it('should sanitize special characters in branch names', () => {
      // Should not throw even with special chars
      const branch = manager.createBranch('dream-2026/02/22 12:00:00');
      expect(branch.name).toBe('dream-2026/02/22 12:00:00');
      manager.discardBranch(branch);
    });
  });
});

// ============================================================================
// SpeculativeDreamer Tests (#1060: commit:false per strategy, commit the best)
// ============================================================================

describe('SpeculativeDreamer', () => {
  function fakeResult(name: string, insightScores: number[]): DreamCycleResult {
    return {
      cycle: {
        id: `cycle-${name}`, startTime: new Date(), conceptsProcessed: 3, associationsFound: 1,
        insightsGenerated: insightScores.length, status: 'completed',
      },
      insights: insightScores.map((score, i) => ({
        id: `${name}-${i}`, cycleId: `cycle-${name}`, type: 'novel_association',
        sourceConcepts: [], description: '', noveltyScore: 1, confidenceScore: score, actionable: false,
      })) as DreamCycleResult['insights'],
      activationStats: { totalIterations: 1, peakActivation: 1, nodesActivated: 3 },
      patternsCreated: 0,
      pending: { cycle: {} as DreamCycleResult['cycle'], activations: [], insights: [] },
    };
  }

  function fakeEngine(outcomes: Record<string, DreamCycleResult | Error>) {
    const byDecay = new Map(Object.entries(outcomes));
    return {
      dream: vi.fn(async (_durationMs: number | undefined, options: DreamRunOptions) => {
        const outcome = byDecay.get(String(options.activationConfig?.decayRate));
        if (!outcome) throw new Error('unexpected strategy');
        if (outcome instanceof Error) throw outcome;
        return outcome;
      }),
      commitDreamResult: vi.fn(() => 1.5),
    };
  }

  const strategies: DreamStrategy[] = [
    { name: 'strategy-a', activationConfig: { decayRate: 0.1 } },
    { name: 'strategy-b', activationConfig: { decayRate: 0.2 } },
  ];

  it('runs every strategy without committing, then commits only the best', async () => {
    const weak = fakeResult('a', [0.5]);
    const strong = fakeResult('b', [0.9, 0.8]);
    const engine = fakeEngine({ '0.1': weak, '0.2': strong });

    const result = await new SpeculativeDreamer(engine as unknown as DreamEngine).dream(strategies, { durationMs: 200 });

    expect(engine.dream).toHaveBeenCalledTimes(2);
    for (const call of engine.dream.mock.calls) {
      expect(call[0]).toBe(200);
      expect(call[1]).toMatchObject({ commit: false });
    }
    expect(engine.commitDreamResult).toHaveBeenCalledTimes(1);
    expect(engine.commitDreamResult).toHaveBeenCalledWith(strong);
    expect(result.winner?.strategy.name).toBe('strategy-b');
    expect(result.winner?.selected).toBe(true);
    expect(result.strategies[0].selected).toBe(false);
    expect(result.commitDurationMs).toBe(1.5);
  });

  it('skips a failed strategy and commits a working one', async () => {
    const good = fakeResult('b', [0.6]);
    const engine = fakeEngine({ '0.1': new Error('Dream exploded'), '0.2': good });

    const result = await new SpeculativeDreamer(engine as unknown as DreamEngine).dream(strategies);

    expect(result.strategies[0]).toMatchObject({ result: null, error: 'Dream exploded', selected: false });
    expect(result.winner?.strategy.name).toBe('strategy-b');
    expect(engine.commitDreamResult).toHaveBeenCalledWith(good);
  });

  it('commits nothing when every strategy fails', async () => {
    const engine = fakeEngine({ '0.1': new Error('x'), '0.2': new Error('y') });

    const result = await new SpeculativeDreamer(engine as unknown as DreamEngine).dream(strategies);

    expect(result.winner).toBeNull();
    expect(engine.commitDreamResult).not.toHaveBeenCalled();
  });

  it('reports no winner when the commit fails', async () => {
    const engine = fakeEngine({ '0.1': fakeResult('a', [0.5]), '0.2': fakeResult('b', [0.4]) });
    engine.commitDreamResult.mockImplementation(() => { throw new Error('engine closed'); });

    const result = await new SpeculativeDreamer(engine as unknown as DreamEngine).dream(strategies);

    expect(result.winner).toBeNull();
    expect(result.strategies[0]).toMatchObject({ selected: false, error: 'engine closed' });
  });

  it('should reject empty strategy list', async () => {
    const engine = fakeEngine({});
    await expect(new SpeculativeDreamer(engine as unknown as DreamEngine).dream([])).rejects.toThrow('At least one strategy');
  });

  it('should reject too many strategies', async () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ name: `s-${i}`, activationConfig: {} }));
    const engine = fakeEngine({});
    await expect(new SpeculativeDreamer(engine as unknown as DreamEngine).dream(many)).rejects.toThrow('Maximum 5 strategies');
  });

  it('should use built-in strategies', () => {
    expect(BUILT_IN_STRATEGIES).toHaveLength(3);
    expect(BUILT_IN_STRATEGIES[0].name).toBe('aggressive-exploration');
    expect(BUILT_IN_STRATEGIES[1].name).toBe('conservative-consolidation');
    expect(BUILT_IN_STRATEGIES[2].name).toBe('balanced-discovery');
  });
});
