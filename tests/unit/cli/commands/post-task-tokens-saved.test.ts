/**
 * Regression: issue #463
 *
 * The post-task hook's base experience_applications insert hardcoded
 * tokens_saved=0 on every row. The column is intended to measure
 * learning ROI but was permanently useless. qualityScore is already
 * computed in the same transaction (0.34 = failure+slow, 0.675 = success+fast),
 * so scale it by 100 until a real per-task token-delta calculation lands.
 *
 *   qualityScore = 0.25*successScore + 0.325 + 0.10*durationTier
 *   durationTier = 1.0 (<100ms), 0.8 (<500ms), 0.6 (<2000ms),
 *                  0.4 (<5000ms), 0.2 (<10000ms), 0.1 (>=10000ms)
 *
 * This test seeds an isolated unified-memory DB, calls persistTaskOutcome
 * for several (success, duration) combinations, and asserts the base
 * experience_applications row carries tokens_saved == round(quality*100).
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { fakeUnifiedMemoryFactory } = vi.hoisted(() => ({
  fakeUnifiedMemoryFactory: vi.fn(),
}));

vi.mock('../../../../src/kernel/unified-memory.js', () => ({
  getUnifiedMemory: () => fakeUnifiedMemoryFactory(),
  findProjectRoot: () => process.cwd(),
}));

import Database from 'better-sqlite3';
import { persistTaskOutcome } from '../../../../src/cli/commands/hooks-handlers/hooks-dream-learning.js';

const createSchema = (db: Database.Database): void => {
  db.exec(`
    CREATE TABLE captured_experiences (
      id TEXT PRIMARY KEY,
      task TEXT NOT NULL,
      agent TEXT,
      domain TEXT,
      success INTEGER,
      quality REAL,
      duration_ms INTEGER,
      model_tier TEXT,
      started_at TEXT,
      completed_at TEXT,
      source TEXT,
      consolidated_into TEXT
    );
    CREATE TABLE experience_applications (
      id TEXT PRIMARY KEY,
      experience_id TEXT,
      task TEXT,
      success INTEGER,
      tokens_saved INTEGER,
      feedback TEXT,
      applied_at TEXT
    );
    CREATE TABLE qe_trajectories (
      id TEXT PRIMARY KEY,
      task TEXT,
      agent TEXT,
      domain TEXT,
      started_at TEXT,
      ended_at TEXT,
      success INTEGER,
      steps_json TEXT
    );
    CREATE TABLE qe_patterns (
      id TEXT PRIMARY KEY, pattern_type TEXT, qe_domain TEXT, domain TEXT,
      name TEXT, description TEXT, confidence REAL DEFAULT 0.5,
      usage_count INTEGER DEFAULT 0, successful_uses INTEGER DEFAULT 0,
      success_rate REAL DEFAULT 0.0, quality_score REAL DEFAULT 0.0,
      tier TEXT DEFAULT 'short-term', last_used_at TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE kv_store (
      key TEXT, namespace TEXT, value TEXT, expires_at INTEGER,
      created_at INTEGER, PRIMARY KEY (namespace, key)
    );
    CREATE TABLE dream_insights (
      id TEXT PRIMARY KEY, applied INTEGER DEFAULT 0,
      actionable INTEGER DEFAULT 0, created_at TEXT
    );
  `);
};

describe('post-task populates tokens_saved with qualityScore * 100 (#463)', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-tokens-saved-'));
    db = new Database(path.join(tmpDir, 'unified.db'));
    createSchema(db);
    fakeUnifiedMemoryFactory.mockReturnValue({
      isInitialized: () => true,
      initialize: async () => undefined,
      getDatabase: () => db,
    });
  });

  afterEach(() => {
    try { db.close(); } catch { /* ignore */ }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  /**
   * Pull the base experience_applications row (the first one inserted —
   * before any per-pattern bridge fan-out). The base row uses the bare
   * taskField (no `:pattern:` suffix), so we can find it deterministically.
   */
  const readBaseRow = (taskField: string) =>
    db
      .prepare(
        `SELECT tokens_saved FROM experience_applications
         WHERE task = ? ORDER BY applied_at ASC LIMIT 1`,
      )
      .get(taskField) as { tokens_saved: number };

  it('success + fast (<100ms): tokens_saved = round(0.675 * 100) = 68', async () => {
    await persistTaskOutcome({
      taskId: 'hook-1',
      agent: 'qe-test-architect',
      success: true,
      durationMs: 50,
    });

    const row = readBaseRow('qe-test-architect:hook-1');
    // qualityScore = 0.25*1 + 0.325 + 0.10*1.0 = 0.675 → round(67.5) = 68
    expect(row.tokens_saved).toBe(68);
  });

  it('failure + slow (>=10000ms): tokens_saved = round(0.335 * 100) = 34', async () => {
    await persistTaskOutcome({
      taskId: 'hook-2',
      agent: 'qe-test-architect',
      success: false,
      durationMs: 15000,
    });

    const row = readBaseRow('qe-test-architect:hook-2');
    // qualityScore = 0.25*0 + 0.325 + 0.10*0.1 = 0.335 → round(33.5) = 34
    expect(row.tokens_saved).toBe(34);
  });

  it('success + mid (<2000ms): tokens_saved = round(0.635 * 100) = 64', async () => {
    await persistTaskOutcome({
      taskId: 'hook-3',
      agent: 'qe-test-architect',
      success: true,
      durationMs: 1500,
    });

    const row = readBaseRow('qe-test-architect:hook-3');
    // qualityScore = 0.25*1 + 0.325 + 0.10*0.6 = 0.635 → round(63.5) = 64
    expect(row.tokens_saved).toBe(64);
  });

  it('is never zero for any (success, duration) combination', async () => {
    await persistTaskOutcome({
      taskId: 'hook-zero-check',
      agent: 'qe-test-architect',
      success: false,
      durationMs: 999999, // worst case (>=10000ms)
    });

    const row = readBaseRow('qe-test-architect:hook-zero-check');
    expect(row.tokens_saved).toBeGreaterThan(0);
  });
});
