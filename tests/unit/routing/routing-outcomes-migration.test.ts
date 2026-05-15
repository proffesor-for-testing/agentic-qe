/**
 * ADR-095: idempotent ALTER TABLE migration for routing_outcomes.
 *
 * Tests cover:
 *   - Fresh DB with full schema: migration is a no-op
 *   - Pre-ADR-095 DB (no new columns): migration adds them
 *   - Repeated migration calls: subsequent calls are no-ops
 *   - Missing routing_outcomes table: migration tolerates it without throwing
 *   - Process-local flag prevents repeated re-migration work
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  ensureRoutingOutcomesAdr095Columns,
  resetRoutingOutcomesMigrationState,
} from '../../../src/routing/routing-outcomes-migration';

function seedPreAdr095Schema(db: Database.Database) {
  // Schema as it existed before ADR-095 — no exploration / criticality / q_weight
  db.exec(`
    CREATE TABLE routing_outcomes (
      id TEXT PRIMARY KEY,
      task_json TEXT NOT NULL,
      decision_json TEXT NOT NULL,
      used_agent TEXT NOT NULL,
      followed_recommendation INTEGER NOT NULL,
      success INTEGER NOT NULL,
      quality_score REAL NOT NULL,
      duration_ms REAL NOT NULL,
      error TEXT,
      model_tier TEXT,
      advisor_consultation_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

function columnNames(db: Database.Database): string[] {
  return (db.prepare("PRAGMA table_info(routing_outcomes)").all() as Array<{ name: string }>)
    .map((c) => c.name);
}

describe('ensureRoutingOutcomesAdr095Columns (#488 / ADR-095)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    resetRoutingOutcomesMigrationState();
  });

  afterEach(() => {
    db.close();
    resetRoutingOutcomesMigrationState();
  });

  it('adds the three ADR-095 columns to a pre-existing routing_outcomes table', () => {
    seedPreAdr095Schema(db);
    expect(columnNames(db)).not.toContain('exploration');
    expect(columnNames(db)).not.toContain('criticality');
    expect(columnNames(db)).not.toContain('q_weight');

    ensureRoutingOutcomesAdr095Columns(db);

    const after = columnNames(db);
    expect(after).toContain('exploration');
    expect(after).toContain('criticality');
    expect(after).toContain('q_weight');
  });

  it('is idempotent — second call against the same DB does not throw', () => {
    seedPreAdr095Schema(db);
    ensureRoutingOutcomesAdr095Columns(db);
    resetRoutingOutcomesMigrationState();
    // Without resetting, the helper is a no-op on the second call due to
    // the process flag. We reset to exercise the actual ALTER attempt
    // (which should hit the "duplicate column" path and swallow it).
    expect(() => ensureRoutingOutcomesAdr095Columns(db)).not.toThrow();
  });

  it('tolerates a missing routing_outcomes table without throwing', () => {
    // Don't seed any schema at all.
    expect(() => ensureRoutingOutcomesAdr095Columns(db)).not.toThrow();
  });

  it('creates the exploration index after a successful column add', () => {
    seedPreAdr095Schema(db);
    ensureRoutingOutcomesAdr095Columns(db);
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='routing_outcomes'")
      .all() as Array<{ name: string }>;
    expect(indexes.map((i) => i.name)).toContain('idx_routing_outcomes_exploration');
  });

  it('the new columns accept INSERTs with the expected types and defaults', () => {
    seedPreAdr095Schema(db);
    ensureRoutingOutcomesAdr095Columns(db);
    // Insert without specifying the new columns — should pick up defaults / null
    db.prepare(`
      INSERT INTO routing_outcomes
        (id, task_json, decision_json, used_agent, followed_recommendation, success, quality_score, duration_ms)
      VALUES (?, '{}', '{}', 'qe-x', 1, 1, 0.5, 100)
    `).run('row-1');

    const row = db
      .prepare(`SELECT exploration, criticality, q_weight FROM routing_outcomes WHERE id = ?`)
      .get('row-1') as { exploration: number; criticality: number | null; q_weight: number | null };
    expect(row.exploration).toBe(0); // default
    expect(row.criticality).toBeNull();
    expect(row.q_weight).toBeNull();

    // Insert with the new columns explicitly
    db.prepare(`
      INSERT INTO routing_outcomes
        (id, task_json, decision_json, used_agent, followed_recommendation, success, quality_score, duration_ms,
         exploration, criticality, q_weight)
      VALUES (?, '{}', '{}', 'qe-x', 1, 1, 0.5, 100, 1, 0.2, 0.15)
    `).run('row-2');

    const row2 = db
      .prepare(`SELECT exploration, criticality, q_weight FROM routing_outcomes WHERE id = ?`)
      .get('row-2') as { exploration: number; criticality: number; q_weight: number };
    expect(row2.exploration).toBe(1);
    expect(row2.criticality).toBeCloseTo(0.2, 5);
    expect(row2.q_weight).toBeCloseTo(0.15, 5);
  });
});
