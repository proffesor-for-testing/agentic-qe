/**
 * Regression: issue #465
 *
 * post-route closed routing_outcomes sentinels one at a time (LIMIT 1).
 * Sessions that terminated without firing Stop — compact, kill, crash —
 * left their sentinels at quality_score=-1 forever, and newer sessions
 * kept pre-empting them in the ORDER BY DESC ordering. The reporter saw
 * 122/149 rows stuck at -1, inverting AVG(quality_score) from a real
 * +0.666 to an observed -0.717.
 *
 * Fix: after the LIMIT-1 close, run a sweep UPDATE on sentinels older than
 * 5 minutes, setting quality_score=0.325 (conservative base) and tagging
 * error='stale-sentinel' so precision-sensitive queries can filter them.
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';

const { fakeUnifiedMemoryFactory } = vi.hoisted(() => ({
  fakeUnifiedMemoryFactory: vi.fn(),
}));

vi.mock('../../../../src/kernel/unified-memory.js', () => ({
  getUnifiedMemory: () => fakeUnifiedMemoryFactory(),
  findProjectRoot: () => process.cwd(),
}));

// hooks-shared.ts builds a CoherenceService and ReasoningBank on import;
// only stub the few helpers that post-route actually calls. (Re-importing
// the actual module would pull in heavy WASM init we don't need.)
vi.mock('../../../../src/cli/commands/hooks-handlers/hooks-shared.js', () => ({
  applyHookBusyTimeout: vi.fn(),
  getHooksSystem: vi.fn(),
  createHybridBackendWithTimeout: vi.fn(),
  incrementDreamExperience: vi.fn(),
  printJson: (data: unknown) => {
    // capture in a global the tests can read
    (globalThis as unknown as { __lastJson: unknown }).__lastJson = data;
  },
  printError: vi.fn(),
  printGuidance: vi.fn(),
  readStdinJsonEvent: vi.fn(),
}));

import Database from 'better-sqlite3';
import { registerRoutingHooks } from '../../../../src/cli/commands/hooks-handlers/routing-hooks.js';

const createSchema = (db: Database.Database): void => {
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
};

const insertSentinel = (
  db: Database.Database,
  id: string,
  createdAtExpr: string,
  taskJson = '{"description":"x"}',
): void => {
  // created_at must be a SQL expression (e.g. datetime('now','-10 minutes')),
  // not a parameter — better-sqlite3's bound parameters are sent as TEXT
  // and the sweep predicate compares them as ISO strings.
  db.prepare(
    `INSERT INTO routing_outcomes
      (id, task_json, used_agent, followed_recommendation,
       success, quality_score, duration_ms, error, created_at)
     VALUES (?, ?, 'qe-test-architect', 1, 0, -1, 0, NULL, ${createdAtExpr})`,
  ).run(id, taskJson);
};

const lastJson = () =>
  (globalThis as unknown as { __lastJson: Record<string, unknown> }).__lastJson;

describe('post-route sweeps stale sentinels (#465)', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-post-route-'));
    db = new Database(path.join(tmpDir, 'unified.db'));
    createSchema(db);
    fakeUnifiedMemoryFactory.mockReturnValue({
      isInitialized: () => true,
      initialize: async () => undefined,
      getDatabase: () => db,
    });
    (globalThis as unknown as { __lastJson: unknown }).__lastJson = undefined;
  });

  afterEach(() => {
    try { db.close(); } catch { /* ignore */ }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  const runPostRoute = async (success = true): Promise<void> => {
    const hooks = new Command('hooks');
    registerRoutingHooks(hooks);
    await hooks.parseAsync(
      ['post-route', '--success', String(success), '--json'],
      { from: 'user' },
    );
  };

  it('closes the fresh sentinel via LIMIT-1 AND sweeps the stale ones', async () => {
    // 1 fresh sentinel (now-ish) → resolved by LIMIT-1 close
    // 3 old sentinels (>5 minutes old) → resolved by stale-sweep
    insertSentinel(db, 'fresh', "datetime('now', '-10 seconds')");
    insertSentinel(db, 'stale-1', "datetime('now', '-10 minutes')");
    insertSentinel(db, 'stale-2', "datetime('now', '-1 hour')");
    insertSentinel(db, 'stale-3', "datetime('now', '-3 days')");

    await runPostRoute(true);

    const json = lastJson();
    expect(json).toMatchObject({ resolved: true, staleSwept: 3 });

    // Fresh row: closed with successful turn's qualityScore = 0.675
    const fresh = db
      .prepare(`SELECT success, quality_score, error FROM routing_outcomes WHERE id = 'fresh'`)
      .get() as { success: number; quality_score: number; error: string | null };
    expect(fresh.success).toBe(1);
    expect(fresh.quality_score).toBeCloseTo(0.675, 5);
    expect(fresh.error).toBeNull();

    // Stale rows: closed with conservative base (0.325), tagged stale-sentinel
    const stales = db
      .prepare(
        `SELECT id, success, quality_score, error FROM routing_outcomes WHERE id LIKE 'stale-%' ORDER BY id`,
      )
      .all() as Array<{ id: string; success: number; quality_score: number; error: string | null }>;
    for (const row of stales) {
      expect(row.success).toBe(0);
      expect(row.quality_score).toBeCloseTo(0.325, 5);
      expect(row.error).toBe('stale-sentinel');
    }

    // No row should remain at -1
    const unresolved = db
      .prepare(`SELECT COUNT(*) AS n FROM routing_outcomes WHERE quality_score = -1`)
      .get() as { n: number };
    expect(unresolved.n).toBe(0);
  });

  it('reports staleSwept: 0 when no old sentinels exist', async () => {
    insertSentinel(db, 'only-fresh', "datetime('now', '-10 seconds')");

    await runPostRoute(true);

    expect(lastJson()).toMatchObject({ resolved: true, staleSwept: 0 });
  });

  it('does not touch already-resolved rows', async () => {
    // Already resolved with a real quality score
    db.prepare(
      `INSERT INTO routing_outcomes
        (id, task_json, used_agent, followed_recommendation,
         success, quality_score, duration_ms, error, created_at)
       VALUES ('resolved-old', '{"description":"x"}', 'qe-test-architect', 1, 1, 0.8, 100, NULL, datetime('now', '-1 day'))`,
    ).run();
    insertSentinel(db, 'fresh', "datetime('now', '-10 seconds')");

    await runPostRoute(true);

    const resolved = db
      .prepare(`SELECT quality_score, error FROM routing_outcomes WHERE id = 'resolved-old'`)
      .get() as { quality_score: number; error: string | null };
    expect(resolved.quality_score).toBeCloseTo(0.8, 5);
    expect(resolved.error).toBeNull();
  });

  it('skips pre-task sentinels (task_json LIKE %"taskId"%) — those are owned by post-task', async () => {
    // Pre-task sentinels carry "taskId" in task_json and are owned by
    // post-task / updateRoutingOutcomeQuality. The discriminator
    // `task_json NOT LIKE '%"taskId"%'` is applied to BOTH the LIMIT-1
    // close AND the stale sweep, so even a pre-task sentinel that's been
    // sitting around for hours stays untouched here. This mirrors the
    // symmetric ownership split established in #451.
    insertSentinel(db, 'pre-task-old', "datetime('now', '-1 hour')", '{"taskId":"abc"}');
    insertSentinel(db, 'pre-task-fresh', "datetime('now', '-10 seconds')", '{"taskId":"xyz"}');
    insertSentinel(db, 'fresh-route', "datetime('now', '-5 seconds')");

    await runPostRoute(true);

    // The route sentinel resolves via LIMIT-1
    const fresh = db
      .prepare(`SELECT quality_score FROM routing_outcomes WHERE id = 'fresh-route'`)
      .get() as { quality_score: number };
    expect(fresh.quality_score).toBeCloseTo(0.675, 5);

    // Both pre-task sentinels stay at -1 — old one rejected by sweep
    // discriminator, fresh one rejected by LIMIT-1 discriminator.
    const preTasks = db
      .prepare(`SELECT id, quality_score, error FROM routing_outcomes WHERE id LIKE 'pre-task-%'`)
      .all() as Array<{ id: string; quality_score: number; error: string | null }>;
    for (const row of preTasks) {
      expect(row.quality_score).toBe(-1);
      expect(row.error).not.toBe('stale-sentinel');
    }
  });
});
