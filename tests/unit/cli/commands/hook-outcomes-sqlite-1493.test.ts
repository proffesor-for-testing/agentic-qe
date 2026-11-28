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
import { TrajectoryTracker } from '../../../../src/integrations/agentic-flow/reasoning-bank/trajectory-tracker.js';
import {
  consolidateExperiencesToPatterns,
  discardTaskBridge,
  persistTaskOutcome,
} from '../../../../src/cli/commands/hooks-handlers/hooks-dream-learning.js';
import {
  LEGACY_HOOK_TASK_SOURCE,
  OBSERVED_EXPERIENCE_SQL,
  OBSERVED_HOOK_TASK_SOURCE,
  OBSERVED_TRAJECTORY_SQL,
  legacyHookTrajectorySql,
  observedTrajectorySql,
} from '../../../../src/learning/hook-outcome-provenance.js';
import {
  DREAM_SCHEMA,
  KV_STORE_SCHEMA,
  QE_PATTERNS_SCHEMA_WITHOUT_FTS,
} from '../../../../src/kernel/unified-memory-schemas.js';

// Real unified schema for qe_patterns / qe_pattern_usage / qe_trajectories /
// kv_store / dream_insights, plus the unique pattern-name index that
// SQLitePatternStore adds at runtime (sqlite-persistence.ts). The
// captured_experiences / experience_applications DDL is the one
// persistTaskOutcome itself creates.
const SCHEMA = `
  ${KV_STORE_SCHEMA}
  ${QE_PATTERNS_SCHEMA_WITHOUT_FTS}
  ${DREAM_SCHEMA}
  CREATE UNIQUE INDEX IF NOT EXISTS idx_patterns_unique_name_domain_type
    ON qe_patterns(name, qe_domain, pattern_type);
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
      writeWhenUnlocked: async <T>(fn: () => T) => fn(),
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

    await persistTaskOutcome({ taskId: 't1', agent: 'coder', success: false, bridgeKey: 'bridge-1' });

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

    await persistTaskOutcome({ taskId: 't2', agent: 'coder', success: true, bridgeKey: 'bridge-1' });

    // The observed success is recorded, but 1 observed success is not 3.
    expect(pattern('pat-b')).toEqual({ tier: 'short-term', usage_count: 3, successful_uses: 3 });
  });

  it('still promotes on three observed successes', async () => {
    seedPattern('pat-c', 2, 2);
    seedBridge('pat-c');

    await persistTaskOutcome({ taskId: 't3', agent: 'coder', success: true, bridgeKey: 'bridge-1' });

    expect(pattern('pat-c').tier).toBe('long-term');
  });

  it('never promotes a pattern consolidated from legacy hook experiences', async () => {
    seedPattern('pat-legacy', 5, 5, [LEGACY_HOOK_TASK_SOURCE]);
    seedBridge('pat-legacy');

    await persistTaskOutcome({ taskId: 't4', agent: 'coder', success: true, bridgeKey: 'bridge-1' });

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

  it('consolidates observed experiences beside a legacy-derived pattern of the same name', async () => {
    const month = new Date().toISOString().slice(0, 7);
    // Same (name, qe_domain, pattern_type) consolidation would pick: the
    // unique index made the old "same name, fresh row" insert fail.
    seedPattern('pat-old', 9, 9, [LEGACY_HOOK_TASK_SOURCE], `reviewer-general-${month}`);
    for (let i = 0; i < 3; i++) await persistTaskOutcome({ taskId: `m${i}`, agent: 'reviewer', success: true });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const created = await consolidateExperiencesToPatterns();

    expect(errors.mock.calls.filter((c) => String(c[0]).includes('consolidate'))).toEqual([]);
    errors.mockRestore();
    expect(created).toBe(1);
    expect(pattern('pat-old')).toEqual({ tier: 'short-term', usage_count: 9, successful_uses: 9 });
    expect(db.prepare(`SELECT name, usage_count, successful_uses FROM qe_patterns WHERE id <> 'pat-old'`).all())
      .toEqual([{ name: `reviewer-general-${month}-observed`, usage_count: 3, successful_uses: 3 }]);
    // The observed rows are processed, so they do not retry every session-end.
    expect(db.prepare(`SELECT COUNT(*) AS n FROM captured_experiences WHERE source = ? AND application_count = 0`)
      .get(OBSERVED_HOOK_TASK_SOURCE)).toEqual({ n: 0 });

    // A later session-end reinforces that -observed pattern, not the legacy one.
    for (let i = 3; i < 6; i++) await persistTaskOutcome({ taskId: `m${i}`, agent: 'reviewer', success: true });
    expect(await consolidateExperiencesToPatterns()).toBe(0);
    expect(db.prepare(`SELECT usage_count FROM qe_patterns WHERE name = ?`).get(`reviewer-general-${month}-observed`))
      .toEqual({ usage_count: 6 });
    expect(pattern('pat-old')).toMatchObject({ usage_count: 9 });
  });

  it('marks stitched multi-step trajectories observed and never stitches legacy rows', async () => {
    db.prepare(`INSERT INTO captured_experiences (id, task, agent, domain, success, quality, source)
      VALUES ('exp-legacy-s', 'coder:shared-task', 'coder', 'general', 1, 0.675, ?)`).run(LEGACY_HOOK_TASK_SOURCE);
    await persistTaskOutcome({ taskId: 'shared-task', agent: 'coder', success: true });
    expect(db.prepare(`SELECT COUNT(*) AS n FROM qe_trajectories WHERE id LIKE 'traj-multi-%'`).get()).toEqual({ n: 0 });

    await persistTaskOutcome({ taskId: 'shared-task', agent: 'tester', success: false });

    const multi = db.prepare(`SELECT success, steps_json, metadata_json FROM qe_trajectories WHERE id LIKE 'traj-multi-%'`)
      .all() as Array<{ success: number; steps_json: string; metadata_json: string }>;
    expect(multi).toHaveLength(1);
    expect(JSON.parse(multi[0].metadata_json)).toMatchObject({ outcome: 'observed' });
    expect(JSON.parse(multi[0].steps_json)).toHaveLength(2);
    expect(multi[0].success).toBe(0);
  });

  // Every shape qe_trajectories can hold. Legacy = the exact rows post-task
  // wrote before #1493; everything else, including claude-flow bridge rows
  // that carry ruflo's `traj-<ms>-<base36>` ids, must be kept.
  const LEGACY_IDS = [
    'traj-1791529377439-c19e3c9a', // single step, synthetic hook- task id
    'traj-1791529377440-0a1b2c3d', // single step, real task id
    'traj-multi-1791529377441-deadbeef', // stitched
    'traj-1791529377442-11112222', // ADR-101 provenance only, no outcome
    'traj-1791529377443-33334444', // unparseable metadata
  ];
  const KEPT_IDS = [
    '3f2a9c1e-7b6d-4e5f-9a8b-1c2d3e4f5a6b', // TrajectoryTracker (uuid)
    'TRAJ-1791529377445-c19e3c9a', // legacy shape, but GLOB is case-sensitive
    'traj-1791529377444-55556666', // post-task row marked observed
    'traj-1795000000000-ab12cd', // ruflo trajectory-start id via TrajectoryBridge, NULL metadata
    'traj-1795000000001-abc12345', // ruflo id that happens to look like 8 hex chars
  ];
  const seedTrajectoryZoo = (): void => {
    const insert = db.prepare(`INSERT INTO qe_trajectories (id, task, agent, domain, started_at, ended_at, success,
      steps_json, metadata_json) VALUES (?, ?, ?, 'test-generation', datetime('now'), datetime('now'), 1, ?, ?)`);
    const single = (task: string) => JSON.stringify([{ step: 1, task, success: true }]);
    insert.run(LEGACY_IDS[0], 'general-purpose:hook-1791529377430', 'general-purpose', single('hook-1791529377430'), null);
    insert.run(LEGACY_IDS[1], 'coder:abc', 'coder', single('abc'), null);
    insert.run(LEGACY_IDS[2], 'multi:abc', 'coder',
      JSON.stringify([{ step: 1, task: 'coder:abc', agent: 'coder', success: true }]), null);
    insert.run(LEGACY_IDS[3], 'coder:p1', 'coder', single('p1'), '{"depth":1}');
    insert.run(LEGACY_IDS[4], 'coder:p2', 'coder', single('p2'), 'not json');
    insert.run(KEPT_IDS[0], 'generate tests', 'qe-test-architect', '[]', null);
    insert.run(KEPT_IDS[1], 'general-purpose:hook-1', 'general-purpose', single('hook-1'), null);
    insert.run(KEPT_IDS[2], 'coder:o1', 'coder', single('o1'), '{"outcome":"observed"}');
    const bridgeSteps = JSON.stringify([{ id: 'step-1', action: 'run', result: 'ok', timestamp: 1 }]);
    insert.run(KEPT_IDS[3], 'run the suite', 'qe-test-architect', bridgeSteps, null);
    insert.run(KEPT_IDS[4], 'coder:hook-9', 'coder', bridgeSteps, null);
  };
  const keptBy = (database: Database.Database, sql: string) =>
    (database.prepare(`SELECT id FROM qe_trajectories WHERE ${sql} ORDER BY id`).all() as Array<{ id: string }>)
      .map((r) => r.id);
  const sorted = (ids: string[]) => [...ids].sort();

  it('trajectory predicates exclude exactly the legacy post-task rows', () => {
    seedTrajectoryZoo();

    expect(keptBy(db, OBSERVED_TRAJECTORY_SQL)).toEqual(sorted(KEPT_IDS));
    expect(keptBy(db, observedTrajectorySql(db))).toEqual(sorted(KEPT_IDS));
    expect(keptBy(db, `${legacyHookTrajectorySql()} = 1`)).toEqual(sorted(LEGACY_IDS));
  });

  it('matches the shape the post-task writer really produces (single and stitched)', async () => {
    await persistTaskOutcome({ taskId: 'w1', agent: 'coder', success: true });
    await persistTaskOutcome({ taskId: 'w1', agent: 'tester', success: true });
    expect(keptBy(db, `${legacyHookTrajectorySql()} = 1`)).toEqual([]); // marked observed

    // The same rows without the marker are what pre-#1493 post-task left behind.
    db.exec(`UPDATE qe_trajectories SET metadata_json = NULL`);

    const legacy = keptBy(db, `${legacyHookTrajectorySql()} = 1`);
    expect(legacy).toHaveLength(3);
    expect(legacy.filter((id) => id.startsWith('traj-multi-'))).toHaveLength(1);
  });

  it('applies the same structural test to a table without metadata_json', () => {
    const bare = new Database(':memory:');
    bare.exec(`CREATE TABLE qe_trajectories (id TEXT PRIMARY KEY, task TEXT, agent TEXT, success INTEGER, steps_json TEXT)`);
    const insert = bare.prepare(`INSERT INTO qe_trajectories VALUES (?, ?, ?, 1, ?)`);
    insert.run('traj-1791529377439-c19e3c9a', 'coder:hook-1', 'coder', '[{"step":1,"task":"hook-1","success":true}]');
    insert.run('traj-1795000000000-ab12cd', 'run', 'x', '[{"id":"step-1"}]');
    insert.run('TRAJ-1791529377439-c19e3c9a', 'coder:hook-1', 'coder', '[{"step":1,"task":"hook-1","success":true}]');

    expect(keptBy(bare, observedTrajectorySql(bare))).toEqual(['TRAJ-1791529377439-c19e3c9a', 'traj-1795000000000-ab12cd']);
    bare.close();
  });

  it('TrajectoryTracker keeps bridge rows and drops legacy rows', async () => {
    seedTrajectoryZoo();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const tracker = new TrajectoryTracker();
    await tracker.initialize();
    log.mockRestore();

    const ids = (await tracker.getSuccessfulTrajectories('test-generation' as never, 50)).map((t) => t.id);

    expect(sorted(ids)).toEqual(sorted(KEPT_IDS));
  });

  it('the trajectory judge scores bridge rows and never legacy rows', async () => {
    seedTrajectoryZoo();
    db.exec(`ALTER TABLE qe_trajectories ADD COLUMN feedback TEXT`);
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    vi.stubEnv('ANTHROPIC_BASE_URL', 'http://judge.invalid');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ content: [{ text: '{"quality":0.5,"reasoning":"ok"}' }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { scoreUnjudgedTrajectories } = await import('../../../../src/mcp/handlers/trajectory-judge.js');
      await scoreUnjudgedTrajectories();
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }

    const judged = (db.prepare(`SELECT id FROM qe_trajectories WHERE feedback IS NOT NULL ORDER BY id`).all() as
      Array<{ id: string }>).map((r) => r.id);
    expect(fetchMock).toHaveBeenCalledTimes(KEPT_IDS.length);
    expect(judged).toEqual(sorted(KEPT_IDS));
  });

  it('OBSERVED_EXPERIENCE_SQL keeps every source except the legacy hook rows', () => {
    seedLegacyExperiences('legacy-agent', 2);
    db.prepare(`INSERT INTO captured_experiences (id, task, agent, source) VALUES ('m1', 't', 'a', 'middleware'),
      ('o1', 't', 'a', ?), ('n1', 't', 'a', NULL)`).run(OBSERVED_HOOK_TASK_SOURCE);

    const kept = db.prepare(`SELECT id FROM captured_experiences WHERE ${OBSERVED_EXPERIENCE_SQL} ORDER BY id`).all();

    expect(kept).toEqual([{ id: 'm1' }, { id: 'n1' }, { id: 'o1' }]);
  });

  it('discardTaskBridge retires this task\'s bridge entry without recording anything', async () => {
    seedPattern('pat-d', 0, 0);
    seedBridge('pat-d');
    seedBridge('pat-d', 'bridge-other');

    // #1501: keyed to the task; without a key nothing is removed.
    expect(await discardTaskBridge()).toBe(false);
    expect(await discardTaskBridge('bridge-1')).toBe(true);

    expect(db.prepare(`SELECT key FROM kv_store`).all()).toEqual([{ key: 'bridge-other' }]);
    expect(pattern('pat-d')).toMatchObject({ usage_count: 0 });
    expect(db.prepare(`SELECT COUNT(*) AS n FROM captured_experiences`).get()).toEqual({ n: 0 });
    expect(await discardTaskBridge('bridge-1')).toBe(false);
  });

  it('persistTaskOutcome reads this task\'s bridge entry, not the newest one (#1501)', async () => {
    seedPattern('pat-mine', 0, 0);
    seedPattern('pat-newer', 0, 0);
    seedBridge('pat-mine', 'bridge-mine');
    seedBridge('pat-newer', 'bridge-newer');
    db.prepare(`UPDATE kv_store SET created_at = created_at + 1000 WHERE key = 'bridge-newer'`).run();

    const out = await persistTaskOutcome({ taskId: 'k1', agent: 'coder', success: true, bridgeKey: 'bridge-mine' });

    expect(out.bridge?.selectedPatternIds).toEqual(['pat-mine']);
    expect(pattern('pat-mine')).toMatchObject({ usage_count: 1 });
    expect(pattern('pat-newer')).toMatchObject({ usage_count: 0 });
    expect(db.prepare(`SELECT key FROM kv_store`).all()).toEqual([{ key: 'bridge-newer' }]);

    // No key: no bridge is read, none is consumed.
    expect((await persistTaskOutcome({ taskId: 'k2', agent: 'coder', success: true })).bridge).toBeNull();
    expect(pattern('pat-newer')).toMatchObject({ usage_count: 0 });
  });

  it('consumes a bridge entry that selected no pattern (#1501)', async () => {
    db.prepare(`INSERT INTO kv_store (key, namespace, value, expires_at, created_at) VALUES ('bridge-empty', 'task-bridge', ?, ?, ?)`)
      .run(JSON.stringify({ selectedPatternIds: [], agent: 'coder', description: 'd', taskType: 'test', priority: 'normal',
        domain: 'general', complexityBucket: 1, estimatedTokenSavings: 0, ts: Date.now() }), Date.now() + 600_000, Date.now());

    await persistTaskOutcome({ taskId: 'k3', agent: 'coder', success: true, bridgeKey: 'bridge-empty' });

    expect(db.prepare(`SELECT COUNT(*) AS n FROM kv_store`).get()).toEqual({ n: 0 });
  });
});
