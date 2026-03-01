/**
 * Integration Tests: RVCOW Dream Branching System
 * ADR-069: RVCOW Dream Cycle Branching
 *
 * Tests the full branch lifecycle using real in-memory SQLite with the actual
 * qe_patterns schema. Validates that SQLite SAVEPOINT/RELEASE/ROLLBACK semantics
 * correctly isolate and merge dream cycle mutations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import {
  RVCOWBranchManager,
  type Branch,
  type ValidationThresholds,
  DEFAULT_VALIDATION_THRESHOLDS,
} from '../../src/learning/dream/rvcow-branch-manager.js';
import {
  SpeculativeDreamer,
  type DreamStrategy,
} from '../../src/learning/dream/speculative-dreamer.js';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create an in-memory SQLite database with the qe_patterns table.
 * Uses the same schema as unified-memory-schemas.ts (QE_PATTERNS_SCHEMA).
 */
function createTestDb(): DatabaseType {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS qe_patterns (
      id TEXT PRIMARY KEY,
      pattern_type TEXT NOT NULL,
      qe_domain TEXT NOT NULL,
      domain TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      confidence REAL DEFAULT 0.5,
      usage_count INTEGER DEFAULT 0,
      success_rate REAL DEFAULT 0.0,
      quality_score REAL DEFAULT 0.0,
      tier TEXT DEFAULT 'short-term',
      template_json TEXT,
      context_json TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      last_used_at TEXT,
      successful_uses INTEGER DEFAULT 0,
      tokens_used INTEGER,
      input_tokens INTEGER,
      output_tokens INTEGER,
      latency_ms REAL,
      reusable INTEGER DEFAULT 0,
      reuse_count INTEGER DEFAULT 0,
      average_token_savings REAL DEFAULT 0,
      total_tokens_saved INTEGER
    );
  `);

  return db;
}

/**
 * Insert a pattern into the qe_patterns table.
 */
function insertPattern(
  db: DatabaseType,
  id: string,
  confidence: number = 0.85,
  name: string = `pattern-${id}`,
): void {
  db.prepare(`
    INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, confidence, quality_score)
    VALUES (?, 'unit-test', 'testing', 'testing', ?, ?, ?, 0.7)
  `).run(id, name, `Description for ${name}`, confidence);
}

/**
 * Count all patterns in the database.
 */
function countPatterns(db: DatabaseType): number {
  const row = db.prepare('SELECT COUNT(*) as cnt FROM qe_patterns').get() as { cnt: number };
  return row.cnt;
}

/**
 * Get all pattern IDs from the database.
 */
function getPatternIds(db: DatabaseType): string[] {
  const rows = db.prepare('SELECT id FROM qe_patterns ORDER BY id').all() as { id: string }[];
  return rows.map(r => r.id);
}

/**
 * Seed the database with a set of baseline patterns.
 */
function seedBaseline(db: DatabaseType, count: number, confidenceBase: number = 0.85): void {
  for (let i = 0; i < count; i++) {
    insertPattern(db, `baseline-${i}`, confidenceBase, `baseline-pattern-${i}`);
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('RVCOW Dream Branching Integration', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  // --------------------------------------------------------------------------
  // 1. Full branch lifecycle: create -> work -> validate -> merge
  // --------------------------------------------------------------------------

  describe('Full branch lifecycle (create -> merge)', () => {
    it('should persist patterns after createBranch, insert, validate, mergeBranch', () => {
      seedBaseline(db, 10);
      const manager = new RVCOWBranchManager(db);

      // Create branch
      const branch = manager.createBranch('dream-cycle-1');
      expect(branch.status).toBe('active');
      expect(branch.baselineSnapshot.patternCount).toBe(10);

      // Insert new patterns inside the branch
      insertPattern(db, 'dream-new-1', 0.9);
      insertPattern(db, 'dream-new-2', 0.88);

      // Validate -- should pass since we only added patterns (no degradation)
      const validation = manager.validateBranch(branch);
      expect(validation.passed).toBe(true);
      expect(validation.patternCountDelta).toBe(2);
      expect(validation.reason).toBe('All quality checks passed');

      // Merge
      manager.mergeBranch(branch);
      expect(branch.status).toBe('merged');

      // Verify patterns persist after merge
      expect(countPatterns(db)).toBe(12);
      const ids = getPatternIds(db);
      expect(ids).toContain('dream-new-1');
      expect(ids).toContain('dream-new-2');
    });

    it('should emit branch events throughout lifecycle', () => {
      seedBaseline(db, 5);
      const manager = new RVCOWBranchManager(db);

      const events: string[] = [];
      manager.onEvent((event) => {
        events.push(event);
      });

      const branch = manager.createBranch('event-test');
      insertPattern(db, 'evt-1', 0.9);
      manager.mergeBranch(branch);

      expect(events).toEqual([
        'dream:branch_created',
        'dream:branch_merged',
      ]);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Branch discard: create -> work -> discard (rollback)
  // --------------------------------------------------------------------------

  describe('Branch discard (rollback)', () => {
    it('should roll back patterns after createBranch, insert, discardBranch', () => {
      seedBaseline(db, 10);
      const manager = new RVCOWBranchManager(db);

      const branch = manager.createBranch('discard-cycle');

      // Insert patterns inside the branch
      insertPattern(db, 'discard-1', 0.9);
      insertPattern(db, 'discard-2', 0.88);
      expect(countPatterns(db)).toBe(12); // Visible before discard

      // Discard
      manager.discardBranch(branch);
      expect(branch.status).toBe('discarded');

      // Verify patterns were rolled back
      expect(countPatterns(db)).toBe(10);
      const ids = getPatternIds(db);
      expect(ids).not.toContain('discard-1');
      expect(ids).not.toContain('discard-2');
    });

    it('should emit branch_discarded event', () => {
      seedBaseline(db, 5);
      const manager = new RVCOWBranchManager(db);

      const events: string[] = [];
      manager.onEvent((event) => {
        events.push(event);
      });

      const branch = manager.createBranch('discard-event');
      insertPattern(db, 'tmp', 0.9);
      manager.discardBranch(branch);

      expect(events).toContain('dream:branch_discarded');
    });

    it('should not affect patterns inserted before the branch', () => {
      seedBaseline(db, 5);
      const manager = new RVCOWBranchManager(db);

      const branch = manager.createBranch('safe-discard');
      insertPattern(db, 'branch-only', 0.9);
      manager.discardBranch(branch);

      // Original 5 still present
      expect(countPatterns(db)).toBe(5);
      for (let i = 0; i < 5; i++) {
        expect(getPatternIds(db)).toContain(`baseline-${i}`);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 3. Validation thresholds
  // --------------------------------------------------------------------------

  describe('Validation thresholds', () => {
    it('should fail validation when pattern count drops beyond threshold', () => {
      seedBaseline(db, 20);
      const thresholds: ValidationThresholds = {
        maxPatternCountDrop: 0.05,    // 5% = 1 pattern max loss from 20
        maxAvgConfidenceDrop: 0.02,
        maxHighConfidenceLoss: 0.05,
      };
      const manager = new RVCOWBranchManager(db, thresholds);

      const branch = manager.createBranch('validation-fail');

      // Delete 3 patterns (15% drop, exceeds 5% threshold)
      db.prepare('DELETE FROM qe_patterns WHERE id IN (?, ?, ?)').run(
        'baseline-0', 'baseline-1', 'baseline-2'
      );
      expect(countPatterns(db)).toBe(17);

      const validation = manager.validateBranch(branch);
      expect(validation.passed).toBe(false);
      expect(validation.reason).toContain('Pattern count dropped');
      expect(validation.patternCountDelta).toBe(-3);

      // Discard the failed branch
      manager.discardBranch(branch);
      expect(countPatterns(db)).toBe(20); // Rolled back
    });

    it('should fail validation when avg confidence drops beyond threshold', () => {
      // Seed 10 high-confidence patterns
      seedBaseline(db, 10, 0.9);
      const thresholds: ValidationThresholds = {
        maxPatternCountDrop: 0.5,       // Lenient on count
        maxAvgConfidenceDrop: 0.02,     // Strict on confidence
        maxHighConfidenceLoss: 0.5,     // Lenient on high-conf loss
      };
      const manager = new RVCOWBranchManager(db, thresholds);

      const branch = manager.createBranch('conf-drop');

      // Add many low-confidence patterns to drag down the average
      for (let i = 0; i < 30; i++) {
        insertPattern(db, `low-conf-${i}`, 0.1);
      }

      const validation = manager.validateBranch(branch);
      expect(validation.passed).toBe(false);
      expect(validation.reason).toContain('Avg confidence dropped');
      expect(validation.avgConfidenceDelta).toBeLessThan(-0.02);

      manager.discardBranch(branch);
    });

    it('should fail validation when too many high-confidence patterns are lost', () => {
      // Seed 20 high-confidence patterns (confidence >= 0.8)
      seedBaseline(db, 20, 0.9);
      const thresholds: ValidationThresholds = {
        maxPatternCountDrop: 0.5,       // Lenient
        maxAvgConfidenceDrop: 1.0,      // Lenient
        maxHighConfidenceLoss: 0.05,    // Strict: max 5% high-conf loss = 1 from 20
      };
      const manager = new RVCOWBranchManager(db, thresholds);

      const branch = manager.createBranch('high-conf-loss');

      // Lower confidence of 3 patterns below 0.8 threshold (15% loss > 5%)
      db.prepare('UPDATE qe_patterns SET confidence = 0.3 WHERE id = ?').run('baseline-0');
      db.prepare('UPDATE qe_patterns SET confidence = 0.3 WHERE id = ?').run('baseline-1');
      db.prepare('UPDATE qe_patterns SET confidence = 0.3 WHERE id = ?').run('baseline-2');

      const validation = manager.validateBranch(branch);
      expect(validation.passed).toBe(false);
      expect(validation.reason).toContain('high-confidence patterns lost');
      expect(validation.highConfidenceLost).toBe(3);

      manager.discardBranch(branch);
      // Verify rollback restored original confidence
      const row = db.prepare('SELECT confidence FROM qe_patterns WHERE id = ?').get('baseline-0') as { confidence: number };
      expect(row.confidence).toBe(0.9);
    });

    it('should pass validation when changes are within thresholds', () => {
      seedBaseline(db, 20, 0.85);
      const manager = new RVCOWBranchManager(db);

      const branch = manager.createBranch('within-threshold');

      // Add more good patterns -- strictly positive changes
      insertPattern(db, 'good-1', 0.9);
      insertPattern(db, 'good-2', 0.92);

      const validation = manager.validateBranch(branch);
      expect(validation.passed).toBe(true);
      expect(validation.patternCountDelta).toBe(2);

      manager.mergeBranch(branch);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Multiple sequential branches
  // --------------------------------------------------------------------------

  describe('Multiple sequential branches', () => {
    it('should persist changes from two sequential create-merge cycles', () => {
      seedBaseline(db, 5);
      const manager = new RVCOWBranchManager(db);

      // First branch
      const branch1 = manager.createBranch('seq-1');
      insertPattern(db, 'seq1-a', 0.9);
      insertPattern(db, 'seq1-b', 0.88);
      const v1 = manager.validateBranch(branch1);
      expect(v1.passed).toBe(true);
      manager.mergeBranch(branch1);
      expect(countPatterns(db)).toBe(7);

      // Second branch
      const branch2 = manager.createBranch('seq-2');
      insertPattern(db, 'seq2-a', 0.91);
      insertPattern(db, 'seq2-b', 0.87);
      insertPattern(db, 'seq2-c', 0.93);
      const v2 = manager.validateBranch(branch2);
      expect(v2.passed).toBe(true);
      manager.mergeBranch(branch2);
      expect(countPatterns(db)).toBe(10);

      // Verify all patterns from both branches persist
      const ids = getPatternIds(db);
      expect(ids).toContain('seq1-a');
      expect(ids).toContain('seq1-b');
      expect(ids).toContain('seq2-a');
      expect(ids).toContain('seq2-b');
      expect(ids).toContain('seq2-c');
    });

    it('should handle merge then discard without cross-contamination', () => {
      seedBaseline(db, 5);
      const manager = new RVCOWBranchManager(db);

      // First branch: merge
      const branch1 = manager.createBranch('merge-first');
      insertPattern(db, 'merged-1', 0.9);
      manager.mergeBranch(branch1);
      expect(countPatterns(db)).toBe(6);

      // Second branch: discard
      const branch2 = manager.createBranch('discard-second');
      insertPattern(db, 'discarded-1', 0.88);
      expect(countPatterns(db)).toBe(7);
      manager.discardBranch(branch2);

      // Only the first branch's pattern should persist
      expect(countPatterns(db)).toBe(6);
      const ids = getPatternIds(db);
      expect(ids).toContain('merged-1');
      expect(ids).not.toContain('discarded-1');
    });

    it('should capture correct baselines for each sequential branch', () => {
      const manager = new RVCOWBranchManager(db);

      // No patterns initially
      const branch1 = manager.createBranch('base-check-1');
      expect(branch1.baselineSnapshot.patternCount).toBe(0);

      insertPattern(db, 'p1', 0.85);
      insertPattern(db, 'p2', 0.9);
      manager.mergeBranch(branch1);

      // Second branch baseline should reflect merged patterns
      const branch2 = manager.createBranch('base-check-2');
      expect(branch2.baselineSnapshot.patternCount).toBe(2);
      expect(branch2.baselineSnapshot.highConfidenceCount).toBe(2); // both >= 0.8

      manager.mergeBranch(branch2);
    });
  });

  // --------------------------------------------------------------------------
  // 5. SpeculativeDreamer
  // --------------------------------------------------------------------------

  describe('SpeculativeDreamer', () => {
    it('should run 2 strategies and merge the winning one', async () => {
      seedBaseline(db, 10, 0.85);
      const dreamer = new SpeculativeDreamer(db);

      const strategies: DreamStrategy[] = [
        {
          name: 'strategy-add-few',
          description: 'Adds a few high-confidence patterns',
          activationConfig: { decayRate: 0.1 },
        },
        {
          name: 'strategy-add-many',
          description: 'Adds many high-confidence patterns',
          activationConfig: { decayRate: 0.05 },
        },
      ];

      // Track how many times executor is called per strategy
      let executionCount = 0;

      const result = await dreamer.dream(strategies, async (configOverrides) => {
        executionCount++;
        if (configOverrides.decayRate === 0.1) {
          // Strategy 1: add 2 patterns
          insertPattern(db, `strat1-${executionCount}-a`, 0.88);
          insertPattern(db, `strat1-${executionCount}-b`, 0.86);
          return 2;
        } else {
          // Strategy 2: add 5 patterns with higher confidence
          for (let i = 0; i < 5; i++) {
            insertPattern(db, `strat2-${executionCount}-${i}`, 0.92);
          }
          return 5;
        }
      });

      // Both strategies should have been evaluated
      expect(result.strategies).toHaveLength(2);
      expect(result.strategies.every(s => s.validation.passed)).toBe(true);

      // Winner should be the one that added more value (higher score)
      expect(result.winner).not.toBeNull();
      expect(result.winner!.selected).toBe(true);

      // The winning strategy's changes should be merged
      // (the final re-execution merged patterns into the DB)
      expect(countPatterns(db)).toBeGreaterThan(10);
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should discard all strategies when none pass validation', async () => {
      seedBaseline(db, 20, 0.9);

      // Very strict thresholds
      const strictThresholds: ValidationThresholds = {
        maxPatternCountDrop: 0.0,   // No pattern loss allowed
        maxAvgConfidenceDrop: 0.001, // Nearly zero confidence drop
        maxHighConfidenceLoss: 0.0,  // No high-conf loss
      };
      const dreamer = new SpeculativeDreamer(db, strictThresholds);

      const strategies: DreamStrategy[] = [
        {
          name: 'destructive-1',
          activationConfig: { decayRate: 0.2 },
        },
        {
          name: 'destructive-2',
          activationConfig: { decayRate: 0.3 },
        },
      ];

      const result = await dreamer.dream(strategies, async () => {
        // Delete patterns to fail validation
        db.prepare('DELETE FROM qe_patterns WHERE id = ?').run('baseline-0');
        return 0;
      });

      // No winner -- all failed
      expect(result.winner).toBeNull();
      expect(result.strategies.every(s => !s.selected)).toBe(true);

      // Original data should be untouched (all branches were discarded)
      expect(countPatterns(db)).toBe(20);
    });

    it('should isolate strategy branches from each other', async () => {
      seedBaseline(db, 10, 0.85);
      const dreamer = new SpeculativeDreamer(db);

      const patternsSeenDuringExec: number[] = [];

      const strategies: DreamStrategy[] = [
        { name: 's1', activationConfig: { decayRate: 0.1 } },
        { name: 's2', activationConfig: { decayRate: 0.2 } },
      ];

      await dreamer.dream(strategies, async () => {
        // Each strategy should start with the same baseline (10 patterns)
        // because the previous branch was discarded
        const count = countPatterns(db);
        patternsSeenDuringExec.push(count);

        // Add patterns
        insertPattern(db, `iso-${Date.now()}-${Math.random()}`, 0.88);
        insertPattern(db, `iso-${Date.now()}-${Math.random()}`, 0.87);
        return 2;
      });

      // Both strategies should have started from the same baseline of 10
      expect(patternsSeenDuringExec[0]).toBe(10);
      expect(patternsSeenDuringExec[1]).toBe(10);
    });

    it('should handle executor errors gracefully', async () => {
      seedBaseline(db, 10, 0.85);
      const dreamer = new SpeculativeDreamer(db);

      let callCount = 0;
      const strategies: DreamStrategy[] = [
        { name: 'error-strategy', activationConfig: { decayRate: 0.1 } },
        { name: 'good-strategy', activationConfig: { decayRate: 0.2 } },
      ];

      const result = await dreamer.dream(strategies, async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Simulated dream failure');
        }
        // Second strategy succeeds
        insertPattern(db, `good-${callCount}`, 0.9);
        return 1;
      });

      // First strategy should show as failed
      expect(result.strategies[0].validation.passed).toBe(false);
      expect(result.strategies[0].validation.reason).toContain('error');

      // Second strategy should pass and be selected as winner
      expect(result.strategies[1].validation.passed).toBe(true);
      expect(result.winner).not.toBeNull();
      expect(result.winner!.strategy.name).toBe('good-strategy');
    });
  });

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------

  describe('Edge cases', () => {
    it('should throw when creating a duplicate branch name', () => {
      const manager = new RVCOWBranchManager(db);
      manager.createBranch('dup');

      expect(() => manager.createBranch('dup')).toThrow("Branch 'dup' already exists");
    });

    it('should throw when merging/discarding a non-existent branch', () => {
      const manager = new RVCOWBranchManager(db);
      const fakeBranch: Branch = {
        name: 'ghost',
        createdAt: new Date(),
        status: 'active',
        baselineSnapshot: {
          patternCount: 0,
          avgConfidence: 0,
          highConfidenceCount: 0,
          capturedAt: new Date(),
        },
      };

      expect(() => manager.mergeBranch(fakeBranch)).toThrow("Branch 'ghost' not found");
      expect(() => manager.discardBranch(fakeBranch)).toThrow("Branch 'ghost' not found");
    });

    it('should handle empty database baseline correctly', () => {
      const manager = new RVCOWBranchManager(db);
      const baseline = manager.captureBaseline();

      expect(baseline.patternCount).toBe(0);
      expect(baseline.avgConfidence).toBe(0);
      expect(baseline.highConfidenceCount).toBe(0);
    });

    it('should list active branches and clear them on merge/discard', () => {
      const manager = new RVCOWBranchManager(db);

      // SQLite savepoints are stack-based (LIFO), so we must release
      // in reverse order: the most recently created savepoint first.
      const b1 = manager.createBranch('list-1');
      const b2 = manager.createBranch('list-2');
      expect(manager.listBranches()).toHaveLength(2);

      // Discard b2 first (most recent savepoint)
      manager.discardBranch(b2);
      expect(manager.listBranches()).toHaveLength(1);

      // Then merge b1
      manager.mergeBranch(b1);
      expect(manager.listBranches()).toHaveLength(0);
    });

    it('should sanitize branch names with special characters', () => {
      seedBaseline(db, 3);
      const manager = new RVCOWBranchManager(db);

      // Names with special characters should be sanitized for savepoint identifiers
      const branch = manager.createBranch('dream/cycle:1@test');
      insertPattern(db, 'special-name-test', 0.9);
      manager.mergeBranch(branch);

      expect(countPatterns(db)).toBe(4);
    });

    it('should remove event listeners correctly', () => {
      const manager = new RVCOWBranchManager(db);
      const events: string[] = [];
      const listener = (event: string) => { events.push(event); };

      manager.onEvent(listener);
      manager.createBranch('with-listener');
      expect(events).toHaveLength(1);

      manager.offEvent(listener);
      const branch2 = manager.createBranch('without-listener');
      // Should not get another event after removing listener
      expect(events).toHaveLength(1);

      manager.discardBranch(branch2);
    });
  });
});
