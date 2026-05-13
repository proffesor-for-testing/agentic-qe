/**
 * SQLitePatternStore.getAggregateOutcomeStats — DB-backed fallback (#454)
 *
 * QEReasoningBank.getStats() previously reported only in-memory counters,
 * which always read zero in hook subprocesses (fresh node = fresh counters).
 * This regression suite proves the SQL aggregates over routing_outcomes /
 * qe_pattern_usage / qe_patterns are correct and tolerant of missing tables.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { SQLitePatternStore } from '../../../src/learning/sqlite-persistence.js';

describe('SQLitePatternStore.getAggregateOutcomeStats', () => {
  let tmpDir: string;
  let store: SQLitePatternStore;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-stats-fallback-'));
    store = new SQLitePatternStore({
      useUnified: false,
      dbPath: path.join(tmpDir, 'patterns.db'),
    });
    await store.initialize();
  });

  afterEach(async () => {
    try {
      store.close();
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('returns all zeros when no rows or tables exist', () => {
    // Legacy-mode SQLitePatternStore creates qe_pattern_usage but not
    // routing_outcomes — the safeGet path must swallow the missing table.
    const agg = store.getAggregateOutcomeStats();
    expect(agg.routingRequests).toBe(0);
    expect(agg.avgRoutingConfidence).toBe(0);
    expect(agg.learningOutcomes).toBe(0);
    expect(agg.successfulOutcomes).toBe(0);
    expect(agg.avgPatternSuccessRate).toBe(0);
  });

  it('aggregates routing_outcomes when the table exists', () => {
    const db = store.getDatabase();
    if (!db) throw new Error('expected db');

    db.exec(`
      CREATE TABLE routing_outcomes (
        id TEXT PRIMARY KEY,
        task_json TEXT,
        decision_json TEXT,
        used_agent TEXT,
        followed_recommendation INTEGER,
        success INTEGER,
        quality_score REAL,
        duration_ms INTEGER,
        error TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // 2 closed rows (quality_score >= 0) and 1 sentinel (quality_score = -1).
    // Sentinel must be counted in total but excluded from avgConfidence.
    db.prepare(
      `INSERT INTO routing_outcomes
       (id, success, quality_score) VALUES (?, ?, ?)`
    ).run('r1', 1, 0.8);
    db.prepare(
      `INSERT INTO routing_outcomes
       (id, success, quality_score) VALUES (?, ?, ?)`
    ).run('r2', 0, 0.4);
    db.prepare(
      `INSERT INTO routing_outcomes
       (id, success, quality_score) VALUES (?, ?, ?)`
    ).run('r3-sentinel', 0, -1);

    const agg = store.getAggregateOutcomeStats();
    expect(agg.routingRequests).toBe(3);
    expect(agg.avgRoutingConfidence).toBeCloseTo(0.6, 5); // (0.8 + 0.4) / 2
    expect(agg.successfulRoutings).toBe(1);
  });

  it('aggregates qe_pattern_usage success counts', () => {
    const db = store.getDatabase();
    if (!db) throw new Error('expected db');

    const insert = db.prepare(
      `INSERT INTO qe_pattern_usage (pattern_id, success) VALUES (?, ?)`
    );
    insert.run('p1', 1);
    insert.run('p1', 1);
    insert.run('p1', 0);
    insert.run('p2', 1);

    const agg = store.getAggregateOutcomeStats();
    expect(agg.learningOutcomes).toBe(4);
    expect(agg.successfulOutcomes).toBe(3);
  });

  it('returns avg(success_rate) from qe_patterns when rows have total_uses > 0', () => {
    const db = store.getDatabase();
    if (!db) throw new Error('expected db');

    const insert = db.prepare(`
      INSERT INTO qe_patterns
        (id, pattern_type, qe_domain, domain, name, description, success_rate, usage_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run('a', 'test-template', 'test-generation', 'test-generation', 'A', 'd', 0.9, 5);
    insert.run('b', 'test-template', 'test-generation', 'test-generation', 'B', 'd', 0.7, 5);
    // Pattern with 0 uses should NOT be included in average
    insert.run('c', 'test-template', 'test-generation', 'test-generation', 'C', 'd', 0.1, 0);

    const agg = store.getAggregateOutcomeStats();
    expect(agg.avgPatternSuccessRate).toBeCloseTo(0.8, 5);
  });
});
