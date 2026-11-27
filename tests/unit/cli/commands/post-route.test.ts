/**
 * Regression: issue #451
 *
 * `aqe hooks post-route` is the Stop-hook counterpart to UserPromptSubmit/route.
 * It must:
 *   1. Close the most-recent unresolved route sentinel (quality_score = -1
 *      and no `"taskId"` in task_json).
 *   2. Leave pre-task sentinels (task_json contains `"taskId"`) untouched —
 *      those are closed by post-task via updateRoutingOutcomeQuality.
 *   3. Be a safe no-op when no route sentinel exists.
 *   4. Apply the canonical 6-dim quality formula collapsed for unknown
 *      duration: 0.325 + 0.25*success + 0.10*1.0 = 0.675 (success) / 0.425 (fail).
 *
 * If the discriminator regresses (e.g. someone removes `task_json NOT LIKE
 * '%"taskId"%'`) post-route will start eating pre-task sentinels and Stream D
 * will silently miscredit duration to the wrong row.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import Database from 'better-sqlite3';

const { umMock } = vi.hoisted(() => {
  return {
    umMock: {
      isInitialized: vi.fn().mockReturnValue(true),
      initialize: vi.fn().mockResolvedValue(undefined),
      getDatabase: vi.fn(),
    },
  };
});

vi.mock('../../../../src/kernel/unified-memory.js', () => ({
  findProjectRoot: vi.fn(() => '/tmp/post-route-test'),
  getUnifiedMemory: vi.fn(() => umMock),
}));

vi.mock('../../../../src/cli/commands/hooks-handlers/hooks-shared.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/cli/commands/hooks-handlers/hooks-shared.js')>();
  return {
    ...actual,
    getHooksSystem: vi.fn().mockResolvedValue({
      hookRegistry: { emit: vi.fn().mockResolvedValue([]) },
      reasoningBank: {
        routeTask: vi.fn().mockResolvedValue({ success: false }),
      },
    }),
    createHybridBackendWithTimeout: vi.fn().mockResolvedValue({
      store: vi.fn(),
      retrieve: vi.fn().mockResolvedValue(null),
      delete: vi.fn(),
      close: vi.fn(),
    }),
    incrementDreamExperience: vi.fn().mockResolvedValue(0),
    applyHookBusyTimeout: vi.fn(),
  };
});

import { registerRoutingHooks } from '../../../../src/cli/commands/hooks-handlers/routing-hooks.js';
import { createRoutingFeedbackCollector } from '../../../../src/routing/routing-feedback.js';

function seedRoutingOutcomes(db: Database.Database) {
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
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

function insertRouteSentinel(db: Database.Database, id: string, createdAt: string) {
  db.prepare(`
    INSERT INTO routing_outcomes
      (id, task_json, decision_json, used_agent, followed_recommendation, success, quality_score, duration_ms, error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    JSON.stringify({ description: 'do a thing', domain: null }),
    JSON.stringify({ recommended: 'qe-test-architect', confidence: 0.4 }),
    'qe-test-architect',
    1,
    0,
    -1,
    0,
    'low-confidence',
    createdAt,
  );
}

function insertPreTaskSentinel(db: Database.Database, id: string, createdAt: string) {
  db.prepare(`
    INSERT INTO routing_outcomes
      (id, task_json, decision_json, used_agent, followed_recommendation, success, quality_score, duration_ms, error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    JSON.stringify({ description: 'spawn agent', taskId: 'hook-12345' }),
    JSON.stringify({ recommended: 'coder', confidence: 0.7 }),
    'coder',
    1,
    0,
    -1,
    0,
    null,
    createdAt,
  );
}

describe('post-route (issue #451)', () => {
  let db: Database.Database;
  let stdoutLines: string[];
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    db = new Database(':memory:');
    seedRoutingOutcomes(db);
    umMock.getDatabase.mockReturnValue(db);

    stdoutLines = [];
    logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      stdoutLines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
    db.close();
  });

  function parseJsonOutput() {
    const joined = stdoutLines.join('\n');
    return JSON.parse(joined.trim());
  }

  it('closes the most-recent route sentinel and leaves pre-task sentinels alone', async () => {
    // All three rows are seeded with dates >5 minutes in the past, so #465's
    // stale-sweep is active. The route sentinels are owned by post-route and
    // both close via the sweep + LIMIT-1; pre-task sentinels are isolated
    // from both passes by the `task_json NOT LIKE '%"taskId"%'` discriminator.
    insertRouteSentinel(db, 'route-old', '2026-05-12 10:00:00');
    insertPreTaskSentinel(db, 'pre-task-mid', '2026-05-12 10:01:00');
    insertRouteSentinel(db, 'route-new', '2026-05-12 10:02:00');

    const hooks = new Command('hooks');
    registerRoutingHooks(hooks);
    await hooks.parseAsync(['post-route', '--outcome', 'success', '--json'], { from: 'user' });

    const out = parseJsonOutput();
    expect(out).toMatchObject({ success: true, resolved: true, turnSuccess: true });
    expect(out.qualityScore).toBeCloseTo(0.675, 5);

    const rows = db.prepare('SELECT id, success, quality_score, error FROM routing_outcomes ORDER BY id').all() as Array<{ id: string; success: number; quality_score: number; error: string | null }>;
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

    // LIMIT-1 path: most-recent route sentinel closed with the turn's qualityScore.
    expect(byId['route-new']).toMatchObject({ success: 1 });
    expect(byId['route-new'].quality_score).toBeCloseTo(0.675, 5);
    expect(byId['route-new'].error).toBe('observed'); // #1481: observed hook close

    // #465 sweep: older route sentinels close with the conservative base
    // score and stale-sentinel tag instead of staying at -1 forever.
    expect(byId['route-old']).toMatchObject({ success: 0, error: 'stale-sentinel' });
    expect(byId['route-old'].quality_score).toBeCloseTo(0.325, 5);

    // The LIMIT-1 close never takes a pre-task sentinel. This one is over 30
    // minutes old, so post-task can no longer close it and the sweep retires
    // it (#1481).
    expect(byId['pre-task-mid']).toMatchObject({ success: 0, error: 'stale-sentinel' });
  });

  it('uses quality_score = 0.425 when --outcome failure', async () => {
    insertRouteSentinel(db, 'route-fail', '2026-05-12 10:00:00');

    const hooks = new Command('hooks');
    registerRoutingHooks(hooks);
    await hooks.parseAsync(['post-route', '--outcome', 'failure', '--json'], { from: 'user' });

    const out = parseJsonOutput();
    expect(out).toMatchObject({ success: true, resolved: true, turnSuccess: false });
    expect(out.qualityScore).toBeCloseTo(0.425, 5);

    const row = db.prepare('SELECT success, quality_score FROM routing_outcomes WHERE id = ?').get('route-fail') as { success: number; quality_score: number };
    expect(row.success).toBe(0);
    expect(row.quality_score).toBeCloseTo(0.425, 5);
  });

  it('is a no-op when no route sentinel exists (only pre-task sentinels present)', async () => {
    // Younger than 30 minutes, so post-task still owns it and the sweep skips it.
    insertPreTaskSentinel(db, 'pre-task-only', new Date(Date.now() - 60_000).toISOString().replace('T', ' ').slice(0, 19));

    const hooks = new Command('hooks');
    registerRoutingHooks(hooks);
    await hooks.parseAsync(['post-route', '--outcome', 'success', '--json'], { from: 'user' });

    const out = parseJsonOutput();
    expect(out).toMatchObject({ success: true, resolved: false });

    const row = db.prepare('SELECT success, quality_score FROM routing_outcomes WHERE id = ?').get('pre-task-only') as { success: number; quality_score: number };
    expect(row.success).toBe(0);
    expect(row.quality_score).toBe(-1);
  });

  it('is a no-op on second invocation when only one route sentinel was outstanding', async () => {
    insertRouteSentinel(db, 'route-once', '2026-05-12 10:00:00');

    const hooks = new Command('hooks');
    registerRoutingHooks(hooks);
    await hooks.parseAsync(['post-route', '--outcome', 'success', '--json'], { from: 'user' });
    expect(parseJsonOutput()).toMatchObject({ resolved: true });

    stdoutLines = [];
    await hooks.parseAsync(['post-route', '--outcome', 'success', '--json'], { from: 'user' });
    expect(parseJsonOutput()).toMatchObject({ resolved: false });
  });

  // #1481: the installed Stop hook passed a constant --success true. It
  // observes nothing, so the sentinel must not become a success.
  it.each([
    ['the installed constant --success true', ['--success', 'true']],
    ['--success false (ignored for routing; use --outcome)', ['--success', 'false']],
    ['no result flag (the new installed command)', []],
  ])('leaves the sentinel open for %s', async (_label, flags) => {
    insertRouteSentinel(db, 'route-turn', '2026-05-12 10:00:00');

    const hooks = new Command('hooks');
    registerRoutingHooks(hooks);
    await hooks.parseAsync(['post-route', ...flags, '--json'], { from: 'user' });

    expect(parseJsonOutput()).toMatchObject({
      success: true, resolved: false, observed: false, qualityScore: null, turnSuccess: null,
    });
    // The seeded row is >5 minutes old, so the stale sweep retires it.
    const row = db.prepare('SELECT success, error FROM routing_outcomes WHERE id = ?').get('route-turn') as { success: number; error: string };
    expect(row).toEqual({ success: 0, error: 'stale-sentinel' });
  });

  it('an unobserved turn adds no outcome to routing accuracy', async () => {
    insertRouteSentinel(db, 'route-turn', new Date().toISOString().replace('T', ' ').slice(0, 19));

    const hooks = new Command('hooks');
    registerRoutingHooks(hooks);
    await hooks.parseAsync(['post-route', '--success', 'true', '--json'], { from: 'user' });

    const collector = createRoutingFeedbackCollector(100);
    await collector.initialize();
    const accuracy = collector.analyzeRoutingAccuracy();
    expect(accuracy.totalOutcomes).toBe(0);
    expect(accuracy.successRate).toBeNull();
  });

  it('records an observed --outcome and tags the hook row as observed', async () => {
    insertRouteSentinel(db, 'route-turn', '2026-05-12 10:00:00');

    const hooks = new Command('hooks');
    registerRoutingHooks(hooks);
    await hooks.parseAsync(['post-route', '--outcome', 'failure', '--json'], { from: 'user' });

    expect(parseJsonOutput()).toMatchObject({ resolved: true, observed: true, turnSuccess: false });
    const row = db.prepare('SELECT success, quality_score, error FROM routing_outcomes WHERE id = ?').get('route-turn') as { success: number; quality_score: number; error: string };
    expect(row.success).toBe(0);
    expect(row.error).toBe('observed');

    const collector = createRoutingFeedbackCollector(100);
    await collector.initialize();
    const accuracy = collector.analyzeRoutingAccuracy();
    expect(accuracy.totalOutcomes).toBe(1);
    expect(accuracy.successRate).toBe(0);
    // The hook row's followed_recommendation is a placeholder, so it does not
    // feed follow/override stats.
    expect(accuracy.followKnownOutcomes).toBe(0);
    expect(accuracy.overrideRate).toBeNull();
  });

  it('rejects an --outcome that is not success or failure', async () => {
    insertRouteSentinel(db, 'route-turn', '2026-05-12 10:00:00');

    const hooks = new Command('hooks');
    registerRoutingHooks(hooks);
    await hooks.parseAsync(['post-route', '--outcome', 'maybe', '--json'], { from: 'user' });

    expect(parseJsonOutput()).toMatchObject({ success: false });
    const row = db.prepare('SELECT quality_score FROM routing_outcomes WHERE id = ?').get('route-turn') as { quality_score: number };
    expect(row.quality_score).toBe(-1);
  });
});

// #1481 round 2: repro from review. An unobserved post-task leaves its
// pre-task sentinel open; once it is 2h old the next post-route sweeps it.
describe('post-route sweeps orphaned pre-task sentinels (#1481)', () => {
  let db: Database.Database;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    db = new Database(':memory:');
    seedRoutingOutcomes(db);
    umMock.getDatabase.mockReturnValue(db);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    db.close();
  });

  it('retires a 2h-old pre-task sentinel and the route sentinel', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString().replace('T', ' ').slice(0, 19);
    insertPreTaskSentinel(db, 'pre-task-orphan', twoHoursAgo);
    insertRouteSentinel(db, 'route-orphan', twoHoursAgo);

    const hooks = new Command('hooks');
    registerRoutingHooks(hooks);
    await hooks.parseAsync(['post-route', '--json'], { from: 'user' });

    const out = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0]));
    expect(out.staleSwept).toBe(2);
    const rows = db.prepare('SELECT id, quality_score, error FROM routing_outcomes ORDER BY id').all();
    expect(rows).toEqual([
      { id: 'pre-task-orphan', quality_score: 0.325, error: 'stale-sentinel' },
      { id: 'route-orphan', quality_score: 0.325, error: 'stale-sentinel' },
    ]);
  });
});
