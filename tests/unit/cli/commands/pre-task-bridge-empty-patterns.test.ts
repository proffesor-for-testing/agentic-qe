/**
 * Regression: issue #487
 *
 * The pre-task handler used to gate the `task-bridge:*` kv write on
 * `selectedPatternIds.length > 0`. When routing returned no patterns
 * (the typical case for low-confidence prompts), no bridge row was
 * written, post-task's `if (outcome.bridge)` then short-circuited,
 * and `updateHookRouterQValue` never ran — so `rl_q_values` stayed
 * empty even though routing IS happening.
 *
 * The fix: the bridge must write whenever the task has a description,
 * regardless of pattern list length. The Bellman update at the
 * post-task site uses (taskType|priority|domain|complexityBucket) as
 * its state_key and `routing.recommendedAgent` as its action_key —
 * neither requires non-empty `selectedPatternIds`.
 *
 * This test parametrizes over patterns=[] and patterns=[p1,p2] and
 * asserts the bridge row exists in both cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import Database from 'better-sqlite3';

const { umMock, routeTaskMock } = vi.hoisted(() => ({
  umMock: {
    isInitialized: vi.fn().mockReturnValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
    getDatabase: vi.fn(),
  },
  routeTaskMock: vi.fn(),
}));

vi.mock('../../../../src/kernel/unified-memory.js', () => ({
  findProjectRoot: vi.fn(() => '/tmp/pre-task-bridge-test'),
  getUnifiedMemory: vi.fn(() => umMock),
}));

vi.mock('../../../../src/cli/commands/hooks-handlers/hooks-shared.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/cli/commands/hooks-handlers/hooks-shared.js')>();
  return {
    ...actual,
    getHooksSystem: vi.fn().mockResolvedValue({
      hookRegistry: { emit: vi.fn().mockResolvedValue([]) },
      reasoningBank: {
        routeTask: routeTaskMock,
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

import { registerTaskHooks } from '../../../../src/cli/commands/hooks-handlers/task-hooks.js';

function seedSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE kv_store (
      key TEXT NOT NULL,
      namespace TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at INTEGER,
      created_at INTEGER,
      PRIMARY KEY (key, namespace)
    );
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
    );
    CREATE TABLE qe_patterns (
      id TEXT PRIMARY KEY,
      average_token_savings INTEGER DEFAULT 0
    );
  `);
}

describe.each([
  {
    label: 'empty patterns (low-confidence prompt)',
    patterns: [] as Array<{ id: string }>,
  },
  {
    label: 'two matched patterns',
    patterns: [{ id: 'p1' }, { id: 'p2' }],
  },
])('pre-task bridge writes with $label (#487)', ({ patterns }) => {
  let db: Database.Database;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    db = new Database(':memory:');
    seedSchema(db);
    umMock.getDatabase.mockReturnValue(db);

    routeTaskMock.mockReset();
    routeTaskMock.mockResolvedValue({
      success: true,
      value: {
        recommendedAgent: 'qe-test-architect',
        confidence: patterns.length > 0 ? 0.4 : 0.05,
        patterns,
        domains: ['test-generation'],
        alternatives: [],
        guidance: [],
      },
    });

    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Pre-task uses console.log for non-JSON branch; we run with --json,
    // but suppress accidental log noise too.
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    vi.restoreAllMocks();
    db.close();
  });

  it('writes a task-bridge row whenever --description is present', async () => {
    const hooks = new Command('hooks');
    registerTaskHooks(hooks);

    await hooks.parseAsync(
      [
        'pre-task',
        '--task-id',
        'hook-test',
        '--description',
        'trivial probe task for the universal-write path',
        '--json',
      ],
      { from: 'user' },
    );

    const row = db
      .prepare(`SELECT key, namespace, value FROM kv_store WHERE namespace = 'task-bridge'`)
      .get() as { key: string; namespace: string; value: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.key).toMatch(/^task:[0-9a-f]+$/);

    const payload = JSON.parse(row!.value);
    expect(payload.selectedPatternIds).toEqual(patterns.map((p) => p.id));
    expect(payload.agent).toBe('qe-test-architect');
    expect(payload.taskType).toBeTypeOf('string');
    expect(payload.domain).toBe('test-generation');
    expect(typeof payload.complexityBucket).toBe('number');
  });
});

describe('pre-task bridge does not write when description is absent', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    seedSchema(db);
    umMock.getDatabase.mockReturnValue(db);

    routeTaskMock.mockReset();
    routeTaskMock.mockResolvedValue({ success: false });

    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
  });

  it('skips the bridge write when --description is missing', async () => {
    const hooks = new Command('hooks');
    registerTaskHooks(hooks);

    await hooks.parseAsync(['pre-task', '--task-id', 'no-desc', '--json'], { from: 'user' });

    const count = db
      .prepare(`SELECT COUNT(*) AS n FROM kv_store WHERE namespace = 'task-bridge'`)
      .get() as { n: number };

    expect(count.n).toBe(0);
  });
});
