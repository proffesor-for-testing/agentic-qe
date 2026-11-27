/**
 * #1493 on real SQLite: what post-task writes for an observed outcome, and
 * how rows the hooks wrote from a constant success before #1493 are left out
 * of pattern creation and promotion (read-time only; no row is modified).
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { fakeUnifiedMemoryFactory } = vi.hoisted(() => ({ fakeUnifiedMemoryFactory: vi.fn() }));

vi.mock('../../../../src/kernel/unified-memory.js', () => ({
  getUnifiedMemory: () => fakeUnifiedMemoryFactory(),
  findProjectRoot: () => process.cwd(),
}));
vi.mock('../../../../src/learning/embed-and-insert-pattern.js', () => ({
  ensurePatternEmbedding: vi.fn(async () => undefined),
}));

import Database from 'better-sqlite3';
import {
  consolidateExperiencesToPatterns,
  discardTaskBridge,
  persistTaskOutcome,
} from '../../../../src/cli/commands/hooks-handlers/hooks-dream-learning.js';
import {
  LEGACY_HOOK_TASK_SOURCE,
  OBSERVED_EXPERIENCE_SQL,
  OBSERVED_HOOK_TASK_SOURCE,
} from '../../../../src/learning/hook-outcome-provenance.js';

const SCHEMA = `
  CREATE TABLE captured_experiences (
    id TEXT PRIMARY KEY, task TEXT NOT NULL, agent TEXT NOT NULL, domain TEXT NOT NULL DEFAULT '',
    success INTEGER NOT NULL DEFAULT 0, quality REAL NOT NULL DEFAULT 0.5, duration_ms INTEGER NOT NULL DEFAULT 0,
    model_tier INTEGER, routing_json TEXT, steps_json TEXT, result_json TEXT, error TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT NOT NULL DEFAULT (datetime('now')),
    source TEXT DEFAULT 'middleware', application_count INTEGER DEFAULT 0, avg_token_savings REAL DEFAULT 0,
    embedding BLOB, embedding_dimension INTEGER, embedding_space_id TEXT, tags TEXT, last_applied_at TEXT,
    consolidated_into TEXT, consolidation_count INTEGER DEFAULT 1, quality_updated_at TEXT,
    reuse_success_count INTEGER DEFAULT 0, reuse_failure_count INTEGER DEFAULT 0
  );
  CREATE TABLE experience_applications (
    id TEXT PRIMARY KEY, experience_id TEXT NOT NULL, task TEXT NOT NULL, success INTEGER NOT NULL,
    tokens_saved INTEGER DEFAULT 0, feedback TEXT, applied_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE qe_trajectories (
    id TEXT PRIMARY KEY, task TEXT, agent TEXT, domain TEXT, started_at TEXT, ended_at TEXT,
    success INTEGER, steps_json TEXT, metadata_json TEXT
  );
  CREATE TABLE qe_patterns (
    id TEXT PRIMARY KEY, pattern_type TEXT, qe_domain TEXT, domain TEXT, name TEXT, description TEXT,
    confidence REAL DEFAULT 0.5, usage_count INTEGER DEFAULT 0, successful_uses INTEGER DEFAULT 0,
    success_rate REAL DEFAULT 0.0, quality_score REAL DEFAULT 0.0, tier TEXT DEFAULT 'short-term',
    template_json TEXT, context_json TEXT, created_at TEXT, updated_at TEXT, last_used_at TEXT
  );
  CREATE TABLE qe_pattern_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT, pattern_id TEXT NOT NULL, success INTEGER NOT NULL,
    metrics_json TEXT, feedback TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE kv_store (
    key TEXT, namespace TEXT, value TEXT, expires_at INTEGER, created_at INTEGER, PRIMARY KEY (namespace, key)
  );
  CREATE TABLE dream_insights (id TEXT PRIMARY KEY, applied INTEGER DEFAULT 0, actionable INTEGER DEFAULT 0, created_at TEXT);
`;

describe('hook task outcomes on SQLite (#1493)', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1493-'));
    db = new Database(path.join(tmpDir, 'memory.db'));
    db.exec(SCHEMA);
    fakeUnifiedMemoryFactory.mockReturnValue({
      isInitialized: () => true, initialize: async () => undefined, getDatabase: () => db,
    });
  });

  afterEach(() => {
    try { db.close(); } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const seedPattern = (id: string, uses: number, successes: number, tags: string[] = ['seeded'], name = id): void => {
    db.prepare(`
      INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, confidence, usage_count, successful_uses,
        success_rate, tier, template_json, context_json)
      VALUES (?, 'workflow', 'general', 'general', ?, 0.7, ?, ?, ?, 'short-term', '{}', ?)
    `).run(id, name, uses, successes, uses ? successes / uses : 0, JSON.stringify({ tags }));
  };
  const seedBridge = (patternId: string, key = 'bridge-1'): void => {
    db.prepare(`INSERT INTO kv_store (key, namespace, value, expires_at, created_at) VALUES (?, 'task-bridge', ?, ?, ?)`)
      .run(key, JSON.stringify({ selectedPatternIds: [patternId], agent: 'coder', description: 'd', taskType: 'test',
        priority: 'normal', domain: 'general', complexityBucket: 1, estimatedTokenSavings: 0, ts: Date.now() }),
      Date.now() + 600_000, Date.now());
  };
  const seedLegacyExperiences = (agent: string, n: number): void => {
    const insert = db.prepare(`INSERT INTO captured_experiences (id, task, agent, domain, success, quality, source)
      VALUES (?, ?, ?, 'general', 1, 0.675, ?)`);
    for (let i = 0; i < n; i++) insert.run(`exp-legacy-${agent}-${i}`, `${agent}:hook-${i}`, agent, LEGACY_HOOK_TASK_SOURCE);
  };
  const pattern = (id: string) => db.prepare(`SELECT tier, usage_count, successful_uses FROM qe_patterns WHERE id = ?`)
    .get(id) as { tier: string; usage_count: number; successful_uses: number };

  it('marks every row of an observed outcome as observed', async () => {
    seedPattern('pat-a', 0, 0);
    seedBridge('pat-a');

    await persistTaskOutcome({ taskId: 't1', agent: 'coder', success: false });

    expect(db.prepare(`SELECT source, success FROM captured_experiences`).all())
      .toEqual([{ source: OBSERVED_HOOK_TASK_SOURCE, success: 0 }]);
    const traj = db.prepare(`SELECT metadata_json FROM qe_trajectories`).get() as { metadata_json: string };
    expect(JSON.parse(traj.metadata_json)).toMatchObject({ outcome: 'observed' });
    const usage = db.prepare(`SELECT success, metrics_json FROM qe_pattern_usage`).get() as { success: number; metrics_json: string };
    expect(usage.success).toBe(0);
    expect(JSON.parse(usage.metrics_json)).toMatchObject({
      source: OBSERVED_HOOK_TASK_SOURCE, outcome: 'measured', outcomeBasis: 'hook-observed',
    });
  });

  it('does not count legacy hook fan-out successes toward promotion', async () => {
    // 2 of the 3 successful uses are legacy constant hook successes.
    seedPattern('pat-b', 2, 2);
    const legacy = db.prepare(`INSERT INTO qe_pattern_usage (pattern_id, success, metrics_json) VALUES ('pat-b', 1, ?)`);
    legacy.run(JSON.stringify({ source: LEGACY_HOOK_TASK_SOURCE }));
    legacy.run(JSON.stringify({ source: LEGACY_HOOK_TASK_SOURCE }));
    seedBridge('pat-b');

    await persistTaskOutcome({ taskId: 't2', agent: 'coder', success: true });

    // The observed success is recorded, but 1 observed success is not 3.
    expect(pattern('pat-b')).toEqual({ tier: 'short-term', usage_count: 3, successful_uses: 3 });
  });

  it('still promotes on three observed successes', async () => {
    seedPattern('pat-c', 2, 2);
    seedBridge('pat-c');

    await persistTaskOutcome({ taskId: 't3', agent: 'coder', success: true });

    expect(pattern('pat-c').tier).toBe('long-term');
  });

  it('never promotes a pattern consolidated from legacy hook experiences', async () => {
    seedPattern('pat-legacy', 5, 5, [LEGACY_HOOK_TASK_SOURCE]);
    seedBridge('pat-legacy');

    await persistTaskOutcome({ taskId: 't4', agent: 'coder', success: true });

    expect(pattern('pat-legacy')).toMatchObject({ tier: 'short-term', successful_uses: 6 });
  });

  it('builds no pattern from legacy hook experiences, but does from observed ones', async () => {
    seedLegacyExperiences('legacy-agent', 4);
    for (let i = 0; i < 3; i++) await persistTaskOutcome({ taskId: `r${i}`, agent: 'reviewer', success: true });

    const created = await consolidateExperiencesToPatterns();

    expect(created).toBe(1);
    const rows = db.prepare(`SELECT name, usage_count, context_json FROM qe_patterns`).all() as Array<{
      name: string; usage_count: number; context_json: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toMatch(/^reviewer-general-/);
    expect(rows[0].usage_count).toBe(3);
    expect(JSON.parse(rows[0].context_json).tags).toEqual([OBSERVED_HOOK_TASK_SOURCE]);
    // Legacy rows are not modified.
    expect(db.prepare(`SELECT COUNT(*) AS n FROM captured_experiences WHERE source = ? AND application_count = 0`)
      .get(LEGACY_HOOK_TASK_SOURCE)).toEqual({ n: 4 });
  });

  it('does not merge observed experiences into a legacy-derived pattern of the same name', async () => {
    const month = new Date().toISOString().slice(0, 7);
    seedPattern('pat-old', 9, 9, [LEGACY_HOOK_TASK_SOURCE], `reviewer-general-${month}`);
    for (let i = 0; i < 3; i++) await persistTaskOutcome({ taskId: `m${i}`, agent: 'reviewer', success: true });

    await consolidateExperiencesToPatterns();

    expect(pattern('pat-old')).toEqual({ tier: 'short-term', usage_count: 9, successful_uses: 9 });
    const fresh = db.prepare(`SELECT usage_count, successful_uses FROM qe_patterns WHERE id <> 'pat-old'`).all();
    expect(fresh).toEqual([{ usage_count: 3, successful_uses: 3 }]);
  });

  it('OBSERVED_EXPERIENCE_SQL keeps every source except the legacy hook rows', () => {
    seedLegacyExperiences('legacy-agent', 2);
    db.prepare(`INSERT INTO captured_experiences (id, task, agent, source) VALUES ('m1', 't', 'a', 'middleware'),
      ('o1', 't', 'a', ?), ('n1', 't', 'a', NULL)`).run(OBSERVED_HOOK_TASK_SOURCE);

    const kept = db.prepare(`SELECT id FROM captured_experiences WHERE ${OBSERVED_EXPERIENCE_SQL} ORDER BY id`).all();

    expect(kept).toEqual([{ id: 'm1' }, { id: 'n1' }, { id: 'o1' }]);
  });

  it('discardTaskBridge retires the newest bridge entry without recording anything', async () => {
    seedPattern('pat-d', 0, 0);
    seedBridge('pat-d');

    expect(await discardTaskBridge()).toBe(true);

    expect(db.prepare(`SELECT COUNT(*) AS n FROM kv_store`).get()).toEqual({ n: 0 });
    expect(pattern('pat-d')).toMatchObject({ usage_count: 0 });
    expect(db.prepare(`SELECT COUNT(*) AS n FROM captured_experiences`).get()).toEqual({ n: 0 });
    expect(await discardTaskBridge()).toBe(false);
  });
});
