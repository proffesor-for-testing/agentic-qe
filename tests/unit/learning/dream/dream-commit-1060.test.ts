/**
 * #1060: compute, then commit. A dream's writes (activations, insights, final
 * cycle row) land in one synchronous transaction; abandoned cycles are marked
 * interrupted, never deleted.
 *
 * Fixture: fresh SQLite files under the OS temp dir.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  commitDream,
  markAbandonedCycles,
  ABANDONED_CYCLE_GRACE_MS,
  ABANDONED_CYCLE_ERROR,
} from '../../../../src/learning/dream/dream-commit';
import type { DreamCycle } from '../../../../src/learning/dream/types';
import type { DreamInsight } from '../../../../src/learning/dream/insight-generator';

let dir: string;
let dbPath: string;
let db: Database.Database;

function schema(target: Database.Database): void {
  target.exec(`
    CREATE TABLE concept_nodes (id TEXT PRIMARY KEY, activation_level REAL DEFAULT 0, last_activated TEXT);
    CREATE TABLE dream_cycles (id TEXT PRIMARY KEY, start_time TEXT, end_time TEXT, duration_ms INTEGER,
      concepts_processed INTEGER, associations_found INTEGER, insights_generated INTEGER, status TEXT, error TEXT);
    CREATE TABLE dream_insights (id TEXT PRIMARY KEY, cycle_id TEXT, insight_type TEXT, source_concepts TEXT,
      description TEXT, novelty_score REAL, confidence_score REAL, actionable INTEGER, applied INTEGER,
      suggested_action TEXT, pattern_id TEXT);
    CREATE TABLE qe_patterns (id TEXT PRIMARY KEY, confidence REAL, quarantined INTEGER DEFAULT 0);
    CREATE TABLE kv_store (key TEXT PRIMARY KEY, value TEXT);
  `);
}

function cycle(status: DreamCycle['status'] = 'completed'): DreamCycle {
  return {
    id: 'cycle-1', startTime: new Date(), endTime: new Date(), durationMs: 5,
    conceptsProcessed: 2, associationsFound: 1, insightsGenerated: 1, status,
  };
}

const insight: DreamInsight = {
  id: 'insight-1', cycleId: 'cycle-1', type: 'novel_association', sourceConcepts: ['a', 'b'],
  description: 'a and b co-activate', noveltyScore: 0.7, confidenceScore: 0.6, actionable: true,
} as DreamInsight;

const nodes = () => db.prepare('SELECT id, activation_level FROM concept_nodes ORDER BY id').all();
const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aqe-1060-commit-'));
  dbPath = join(dir, 'memory.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  schema(db);
  db.prepare("INSERT INTO concept_nodes (id, activation_level) VALUES ('a', 0.1), ('b', 0.2)").run();
  db.prepare("INSERT INTO dream_cycles (id, start_time, status) VALUES ('cycle-1', ?, 'running')").run(new Date().toISOString());
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('#1060 commitDream', () => {
  it('writes activations, insights and the final cycle row together, and times the transaction', () => {
    const result = commitDream(db, { cycle: cycle(), activations: [['a', 0.9], ['b', 1.7]], insights: [insight] });

    expect(nodes()).toEqual([{ id: 'a', activation_level: 0.9 }, { id: 'b', activation_level: 1 }]);
    expect(count('dream_insights')).toBe(1);
    expect(db.prepare('SELECT status FROM dream_cycles').get()).toEqual({ status: 'completed' });
    expect(result).toMatchObject({ activationsWritten: 2, insightsWritten: 1 });
    expect(result.commitDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('writes nothing when any statement fails', () => {
    db.exec(`CREATE TRIGGER fail_cycle BEFORE UPDATE OF status ON dream_cycles
             BEGIN SELECT RAISE(ABORT, 'injected'); END`);

    expect(() => commitDream(db, { cycle: cycle(), activations: [['a', 0.9]], insights: [insight] })).toThrow('injected');

    expect(nodes()).toEqual([{ id: 'a', activation_level: 0.1 }, { id: 'b', activation_level: 0.2 }]);
    expect(count('dream_insights')).toBe(0);
    expect(db.prepare('SELECT status FROM dream_cycles').get()).toEqual({ status: 'running' });
  });

  it('does not recreate a node deleted while the dream ran', () => {
    db.prepare("DELETE FROM concept_nodes WHERE id = 'b'").run();

    const result = commitDream(db, { cycle: cycle(), activations: [['a', 0.5], ['b', 0.5]], insights: [] });

    expect(result.activationsWritten).toBe(1);
    expect(nodes()).toEqual([{ id: 'a', activation_level: 0.5 }]);
  });

  it('does not overwrite a node a foreground write changed while the dream ran', () => {
    // The dream loaded a=0.1 and b=0.2; a foreground write then set b to 0.6.
    db.prepare("UPDATE concept_nodes SET activation_level = 0.6 WHERE id = 'b'").run();

    const result = commitDream(db, {
      cycle: cycle(),
      activations: [['a', 0.9, 0.1], ['b', 0.9, 0.2]],
      insights: [],
    });

    expect(result).toMatchObject({ activationsWritten: 1, activationsSkipped: 1 });
    expect(nodes()).toEqual([{ id: 'a', activation_level: 0.9 }, { id: 'b', activation_level: 0.6 }]);
  });

  it('creates the cycle row when the dream wrote none up front (commit: false)', () => {
    db.prepare("DELETE FROM dream_cycles").run();

    commitDream(db, { cycle: cycle(), activations: [], insights: [insight] });

    expect(db.prepare('SELECT id, status, insights_generated FROM dream_cycles').all())
      .toEqual([{ id: 'cycle-1', status: 'completed', insights_generated: 1 }]);
    expect(count('dream_insights')).toBe(1);
  });

  it('does not leave a transaction open', () => {
    commitDream(db, { cycle: cycle(), activations: [['a', 0.5]], insights: [] });
    expect(db.inTransaction).toBe(false);
  });
});

describe('#1060 markAbandonedCycles', () => {
  it('marks only cycles running longer than the grace period, and deletes nothing', () => {
    const now = Date.now();
    const insert = db.prepare('INSERT INTO dream_cycles (id, start_time, status) VALUES (?, ?, ?)');
    insert.run('old-running', new Date(now - ABANDONED_CYCLE_GRACE_MS - 60_000).toISOString(), 'running');
    insert.run('old-done', new Date(now - ABANDONED_CYCLE_GRACE_MS - 60_000).toISOString(), 'completed');

    expect(markAbandonedCycles(db, ABANDONED_CYCLE_GRACE_MS, now)).toBe(1);

    const rows = db.prepare('SELECT id, status FROM dream_cycles ORDER BY id').all();
    expect(rows).toEqual([
      { id: 'cycle-1', status: 'running' }, // started just now: another process may be dreaming
      { id: 'old-done', status: 'completed' },
      { id: 'old-running', status: 'interrupted' },
    ]);
    expect(db.prepare("SELECT error FROM dream_cycles WHERE id = 'old-running'").get())
      .toEqual({ error: ABANDONED_CYCLE_ERROR });
    expect(count('dream_cycles')).toBe(3);
    expect(markAbandonedCycles(db, ABANDONED_CYCLE_GRACE_MS, now)).toBe(0);
  });
});
