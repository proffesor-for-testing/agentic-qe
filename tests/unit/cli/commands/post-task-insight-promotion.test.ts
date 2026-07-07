/**
 * Regression: system-integrity remediation follow-up (2026-07-06)
 *
 * persistTaskOutcome() previously bumped `dream_insights.applied =
 * COALESCE(applied, 0) + 1` on the 3 most-recently-created actionable rows on
 * every successful task, regardless of whether any insight was genuinely
 * promoted to a real qe_patterns row. That is semantically incompatible with
 * dream-engine.ts's real applyInsight(), which treats `applied` as a boolean
 * and sets it to exactly 1 on real promotion — proven still live in production
 * via `applied` values up to 16 (only possible via unconditional increment).
 * It also never drained the backlog: the query re-selected the same newest 3
 * rows every time instead of the actual pending (applied=0) ones.
 *
 * This test asserts the fixed behavior: persistTaskOutcome() now calls the
 * SAME genuine promotion path (DreamEngine.applyInsight()) that
 * checkAndTriggerDream already uses, only for actually-pending
 * (actionable=1, applied=0) insights — never re-touching already-applied rows
 * regardless of how many more successful tasks run afterward.
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { fakeUnifiedMemoryFactory } = vi.hoisted(() => ({
  fakeUnifiedMemoryFactory: vi.fn(),
}));

const { applyInsightMock, initializeMock, closeMock } = vi.hoisted(() => ({
  applyInsightMock: vi.fn(),
  initializeMock: vi.fn(),
  closeMock: vi.fn(),
}));

vi.mock('../../../../src/kernel/unified-memory.js', () => ({
  getUnifiedMemory: () => fakeUnifiedMemoryFactory(),
  findProjectRoot: () => process.cwd(),
}));

vi.mock('../../../../src/learning/dream/index.js', () => ({
  createDreamEngine: vi.fn(() => ({
    initialize: initializeMock,
    applyInsight: applyInsightMock,
    close: closeMock,
  })),
}));

import Database from 'better-sqlite3';
import { persistTaskOutcome } from '../../../../src/cli/commands/hooks-handlers/hooks-dream-learning.js';

describe('persistTaskOutcome applies real pending dream insights, not a fake counter', () => {
  let tmpDir: string;
  let db: Database.Database;

  const createSchema = (database: Database.Database): void => {
    database.exec(`
      CREATE TABLE captured_experiences (
        id TEXT PRIMARY KEY, task TEXT NOT NULL, agent TEXT, domain TEXT,
        success INTEGER, quality REAL, duration_ms INTEGER, model_tier TEXT,
        started_at TEXT, completed_at TEXT, source TEXT, consolidated_into TEXT
      );
      CREATE TABLE experience_applications (
        id TEXT PRIMARY KEY, experience_id TEXT, task TEXT, success INTEGER,
        tokens_saved INTEGER, feedback TEXT, applied_at TEXT
      );
      CREATE TABLE qe_trajectories (
        id TEXT PRIMARY KEY, task TEXT, agent TEXT, domain TEXT,
        started_at TEXT, ended_at TEXT, success INTEGER, steps_json TEXT
      );
      CREATE TABLE qe_patterns (
        id TEXT PRIMARY KEY, pattern_type TEXT, qe_domain TEXT, domain TEXT, name TEXT,
        description TEXT, confidence REAL DEFAULT 0.5, usage_count INTEGER DEFAULT 0,
        successful_uses INTEGER DEFAULT 0, success_rate REAL DEFAULT 0.0,
        quality_score REAL DEFAULT 0.0, tier TEXT DEFAULT 'short-term',
        last_used_at TEXT, created_at TEXT, updated_at TEXT
      );
      CREATE TABLE qe_pattern_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT, pattern_id TEXT NOT NULL, success INTEGER NOT NULL,
        metrics_json TEXT, feedback TEXT, recorded_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE kv_store (
        key TEXT, namespace TEXT, value TEXT, expires_at INTEGER, created_at INTEGER,
        PRIMARY KEY (namespace, key)
      );
      CREATE TABLE dream_insights (
        id TEXT PRIMARY KEY,
        applied INTEGER DEFAULT 0,
        actionable INTEGER DEFAULT 0,
        created_at TEXT
      );
    `);
  };

  beforeEach(() => {
    applyInsightMock.mockReset();
    initializeMock.mockReset();
    closeMock.mockReset();
    initializeMock.mockResolvedValue(undefined);
    closeMock.mockResolvedValue(undefined);

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-insight-promotion-'));
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

  it('calls applyInsight only for pending (applied=0) actionable rows on a successful task', async () => {
    db.prepare(`
      INSERT INTO dream_insights (id, applied, actionable, created_at)
      VALUES ('insight-pending', 0, 1, datetime('now'))
    `).run();
    db.prepare(`
      INSERT INTO dream_insights (id, applied, actionable, created_at)
      VALUES ('insight-already-applied', 1, 1, datetime('now'))
    `).run();
    db.prepare(`
      INSERT INTO dream_insights (id, applied, actionable, created_at)
      VALUES ('insight-not-actionable', 0, 0, datetime('now'))
    `).run();

    applyInsightMock.mockResolvedValue({ success: true, patternId: 'real-pattern-1' });

    const result = await persistTaskOutcome({
      taskId: 'hook-test',
      agent: 'qe-test-architect',
      success: true,
    });

    expect(applyInsightMock).toHaveBeenCalledTimes(1);
    expect(applyInsightMock).toHaveBeenCalledWith('insight-pending');
    expect(result.insightsApplied).toBe(1);
  });

  it('does NOT re-apply an already-applied insight on a later successful task (no blind re-increment)', async () => {
    db.prepare(`
      INSERT INTO dream_insights (id, applied, actionable, created_at)
      VALUES ('insight-already-applied', 1, 1, datetime('now'))
    `).run();

    const result = await persistTaskOutcome({
      taskId: 'hook-test-2',
      agent: 'qe-test-architect',
      success: true,
    });

    expect(applyInsightMock).not.toHaveBeenCalled();
    expect(result.insightsApplied).toBe(0);
  });

  it('does not touch dream_insights at all when the task fails', async () => {
    db.prepare(`
      INSERT INTO dream_insights (id, applied, actionable, created_at)
      VALUES ('insight-pending', 0, 1, datetime('now'))
    `).run();

    const result = await persistTaskOutcome({
      taskId: 'hook-test-3',
      agent: 'qe-test-architect',
      success: false,
    });

    expect(applyInsightMock).not.toHaveBeenCalled();
    expect(result.insightsApplied).toBe(0);
  });

  it('does not count a failed applyInsight call toward insightsApplied', async () => {
    db.prepare(`
      INSERT INTO dream_insights (id, applied, actionable, created_at)
      VALUES ('insight-pending', 0, 1, datetime('now'))
    `).run();
    applyInsightMock.mockResolvedValue({ success: false, error: 'already applied' });

    const result = await persistTaskOutcome({
      taskId: 'hook-test-4',
      agent: 'qe-test-architect',
      success: true,
    });

    expect(applyInsightMock).toHaveBeenCalledTimes(1);
    expect(result.insightsApplied).toBe(0);
  });
});
