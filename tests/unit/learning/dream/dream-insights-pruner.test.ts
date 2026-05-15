/**
 * Issue #488 C.2 — `dream_insights` retention pruning.
 *
 * The dream_insights schema has no expires_at column and no automatic
 * cleanup. Without periodic pruning the table grows linearly with hook
 * activity. The pruner deletes rows that:
 *   - have `applied = 0` (never used in a pattern update), AND
 *   - are older than the retention window (default 30 days).
 *
 * Applied insights stay forever (audit trail); recently-created insights
 * stay regardless of applied state (might still be picked up).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { pruneStaleDreamInsights } from '../../../../src/learning/dream/dream-insights-pruner';

function seedSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE dream_insights (
      id TEXT PRIMARY KEY,
      cycle_id TEXT NOT NULL,
      insight_type TEXT NOT NULL,
      source_concepts TEXT NOT NULL,
      description TEXT NOT NULL,
      novelty_score REAL DEFAULT 0.5,
      confidence_score REAL DEFAULT 0.5,
      actionable INTEGER DEFAULT 0,
      applied INTEGER DEFAULT 0,
      suggested_action TEXT,
      pattern_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

function insertInsight(
  db: Database.Database,
  id: string,
  fields: { applied?: 0 | 1; ageDays?: number } = {},
) {
  const applied = fields.applied ?? 0;
  const ageDays = fields.ageDays ?? 0;
  db.prepare(
    `INSERT INTO dream_insights (
       id, cycle_id, insight_type, source_concepts, description, applied, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?))`,
  ).run(id, 'cycle-1', 'analogy', '[]', 'test', applied, `-${ageDays} days`);
}

describe('pruneStaleDreamInsights (#488 C.2)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    seedSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('deletes unapplied insights older than the retention window', () => {
    insertInsight(db, 'stale-1', { applied: 0, ageDays: 45 });
    insertInsight(db, 'stale-2', { applied: 0, ageDays: 60 });

    const result = pruneStaleDreamInsights(db, { retentionDays: 30 });

    expect(result.pruned).toBe(2);
    const remaining = db.prepare(`SELECT COUNT(*) AS n FROM dream_insights`).get() as { n: number };
    expect(remaining.n).toBe(0);
  });

  it('KEEPS applied insights regardless of age (they are part of the audit trail)', () => {
    insertInsight(db, 'old-applied', { applied: 1, ageDays: 365 });
    insertInsight(db, 'old-unapplied', { applied: 0, ageDays: 365 });

    const result = pruneStaleDreamInsights(db, { retentionDays: 30 });

    expect(result.pruned).toBe(1);
    const rows = db
      .prepare(`SELECT id, applied FROM dream_insights ORDER BY id`)
      .all() as Array<{ id: string; applied: number }>;
    expect(rows).toEqual([{ id: 'old-applied', applied: 1 }]);
  });

  it('KEEPS recent unapplied insights (within the retention window)', () => {
    insertInsight(db, 'recent', { applied: 0, ageDays: 5 });
    insertInsight(db, 'still-recent', { applied: 0, ageDays: 29 });
    insertInsight(db, 'stale', { applied: 0, ageDays: 31 });

    const result = pruneStaleDreamInsights(db, { retentionDays: 30 });

    expect(result.pruned).toBe(1);
    const ids = (db.prepare(`SELECT id FROM dream_insights ORDER BY id`).all() as Array<{ id: string }>)
      .map((r) => r.id);
    expect(ids).toEqual(['recent', 'still-recent']);
  });

  it('honors a custom retention window', () => {
    insertInsight(db, 'a', { applied: 0, ageDays: 5 });
    insertInsight(db, 'b', { applied: 0, ageDays: 10 });
    insertInsight(db, 'c', { applied: 0, ageDays: 20 });

    const result = pruneStaleDreamInsights(db, { retentionDays: 7 });

    // a is 5 days old → kept. b (10d), c (20d) → pruned.
    expect(result.pruned).toBe(2);
    const ids = (db.prepare(`SELECT id FROM dream_insights ORDER BY id`).all() as Array<{ id: string }>)
      .map((r) => r.id);
    expect(ids).toEqual(['a']);
  });

  it('returns pruned=0 when the table is empty', () => {
    const result = pruneStaleDreamInsights(db, { retentionDays: 30 });
    expect(result.pruned).toBe(0);
  });

  it('returns pruned=0 when the dream_insights table does not exist (fresh init)', () => {
    const freshDb = new Database(':memory:');
    try {
      const result = pruneStaleDreamInsights(freshDb, { retentionDays: 30 });
      expect(result.pruned).toBe(0);
    } finally {
      freshDb.close();
    }
  });

  it('defaults retention to 30 days when no options passed', () => {
    insertInsight(db, 'just-under', { applied: 0, ageDays: 29 });
    insertInsight(db, 'just-over', { applied: 0, ageDays: 31 });

    const result = pruneStaleDreamInsights(db);

    expect(result.pruned).toBe(1);
    const remaining = db.prepare(`SELECT id FROM dream_insights`).get() as { id: string };
    expect(remaining.id).toBe('just-under');
  });

  it('is idempotent — re-running on the already-pruned state changes nothing', () => {
    insertInsight(db, 'stale', { applied: 0, ageDays: 60 });
    insertInsight(db, 'kept', { applied: 1, ageDays: 60 });

    pruneStaleDreamInsights(db, { retentionDays: 30 });
    const second = pruneStaleDreamInsights(db, { retentionDays: 30 });

    expect(second.pruned).toBe(0);
  });
});
