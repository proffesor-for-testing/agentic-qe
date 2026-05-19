/**
 * Regression: issue #499 — `rl_q_values` is never trained from the routing
 * surface, so the `route` hook's `qWeight` is structurally pinned at 0.
 *
 * Two complementary fixes verified here:
 *
 *   Fix #1 (post-route side): when post-route resolves a route sentinel in
 *     `routing_outcomes`, it must also call `updateHookRouterQValue` with a
 *     state_key derived from the sentinel's task description — using the
 *     SAME helpers (`deriveTaskType`, `deriveComplexityBucket`,
 *     `detectQEDomains`) the route hook used at insertion time. Writer and
 *     reader address the identical row in `rl_q_values`.
 *
 *   Fix #2 (post-task side): the `if (outcome.bridge)` gate at
 *     task-hooks.ts:381 silently dropped the Bellman Q-update whenever the
 *     pre-task bridge wasn't matched. Direct Bash/Edit sessions never spawn
 *     Task tools, so `outcome.bridge` was almost always absent on real
 *     projects (Jordi's reproduction: 139 routing_outcomes rows vs 2
 *     rl_q_values rows). Drop the gate; derive state_key from
 *     `options.description` when bridge is absent.
 *
 * If either fix regresses, the corresponding spy assertions fail and the
 * `route` hook returns to `qWeight: 0` indefinitely.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import Database from 'better-sqlite3';

const {
  umMock,
  updateHookRouterQValueMock,
  persistTaskOutcomeMock,
  updateRoutingOutcomeQualityMock,
  recordOutcomeMock,
} = vi.hoisted(() => ({
  umMock: {
    isInitialized: vi.fn().mockReturnValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
    getDatabase: vi.fn(),
  },
  updateHookRouterQValueMock: vi.fn().mockResolvedValue(undefined),
  persistTaskOutcomeMock: vi.fn(),
  updateRoutingOutcomeQualityMock: vi.fn().mockResolvedValue(undefined),
  recordOutcomeMock: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../../../../src/kernel/unified-memory.js', () => ({
  findProjectRoot: vi.fn(() => '/tmp/route-q-loop-test'),
  getUnifiedMemory: vi.fn(() => umMock),
}));

vi.mock('../../../../src/cli/commands/hooks-handlers/hooks-shared.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/cli/commands/hooks-handlers/hooks-shared.js')>();
  return {
    ...actual,
    getHooksSystem: vi.fn().mockResolvedValue({
      hookRegistry: { emit: vi.fn().mockResolvedValue([]) },
      reasoningBank: {
        recordOutcome: recordOutcomeMock,
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
    checkAndTriggerDream: vi.fn().mockResolvedValue({ triggered: false }),
    applyHookBusyTimeout: vi.fn(),
    persistTaskOutcome: persistTaskOutcomeMock,
    updateHookRouterQValue: updateHookRouterQValueMock,
    updateRoutingOutcomeQuality: updateRoutingOutcomeQualityMock,
  };
});

import { registerRoutingHooks } from '../../../../src/cli/commands/hooks-handlers/routing-hooks.js';
import { registerTaskHooks } from '../../../../src/cli/commands/hooks-handlers/task-hooks.js';

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

function insertRouteSentinel(
  db: Database.Database,
  id: string,
  description: string,
  usedAgent: string,
  createdAt: string,
) {
  db.prepare(`
    INSERT INTO routing_outcomes
      (id, task_json, decision_json, used_agent, followed_recommendation, success, quality_score, duration_ms, error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    JSON.stringify({ description, domain: null }),
    JSON.stringify({ recommended: usedAgent, confidence: 0.5 }),
    usedAgent,
    1,
    0,
    -1,
    0,
    null,
    createdAt,
  );
}

describe('post-route trains rl_q_values from resolved route sentinels (issue #499 fix #1)', () => {
  let db: Database.Database;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    db = new Database(':memory:');
    seedRoutingOutcomes(db);
    umMock.getDatabase.mockReturnValue(db);
    updateHookRouterQValueMock.mockReset().mockResolvedValue(undefined);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    db.close();
  });

  it('calls updateHookRouterQValue with state derived from the sentinel description', async () => {
    // Mirror the route hook's exact derivation order (qe-reasoning-bank.ts:530-535):
    //   taskType:        deriveTaskType(description)
    //   priority:        'normal'
    //   domain:          detectQEDomains(description)[0] ?? 'any'
    //   complexityBucket: deriveComplexityBucket(description)
    // Asserting on the helpers' outputs directly keeps the test robust to
    // heuristic tuning while still pinning the alignment contract.
    const description = 'Write unit tests for the UserService class';
    insertRouteSentinel(db, 'route-1', description, 'qe-test-architect', '2026-05-19 10:00:00');

    const { deriveTaskType, deriveComplexityBucket } = await import(
      '../../../../src/learning/agent-routing.js'
    );
    const { detectQEDomains } = await import('../../../../src/learning/qe-patterns.js');
    const expectedTaskType = deriveTaskType(description);
    const expectedDomain = detectQEDomains(description)[0] ?? 'any';
    const expectedBucket = deriveComplexityBucket(description);

    const hooks = new Command('hooks');
    registerRoutingHooks(hooks);
    await hooks.parseAsync(['post-route', '--success', 'true', '--json'], { from: 'user' });

    expect(updateHookRouterQValueMock).toHaveBeenCalledTimes(1);
    expect(updateHookRouterQValueMock.mock.calls[0][0]).toEqual({
      taskType: expectedTaskType,
      priority: 'normal',
      domain: expectedDomain,
      complexityBucket: expectedBucket,
      agent: 'qe-test-architect',
      success: true,
    });
  });

  it('does not call updateHookRouterQValue when no route sentinel exists', async () => {
    const hooks = new Command('hooks');
    registerRoutingHooks(hooks);
    await hooks.parseAsync(['post-route', '--success', 'true', '--json'], { from: 'user' });

    expect(updateHookRouterQValueMock).not.toHaveBeenCalled();
  });

  it('passes the resolved success bit through to the Q-update', async () => {
    insertRouteSentinel(db, 'route-fail', 'Analyze coverage gaps', 'qe-coverage-analyzer', '2026-05-19 10:00:00');

    const hooks = new Command('hooks');
    registerRoutingHooks(hooks);
    await hooks.parseAsync(['post-route', '--success', 'false', '--json'], { from: 'user' });

    expect(updateHookRouterQValueMock).toHaveBeenCalledTimes(1);
    expect(updateHookRouterQValueMock.mock.calls[0][0]).toMatchObject({
      agent: 'qe-coverage-analyzer',
      success: false,
    });
  });

  it('swallows malformed task_json without crashing the Stop hook', async () => {
    // Insert a sentinel with task_json that doesn't parse — Stop hooks must
    // never crash the host shell.
    db.prepare(`
      INSERT INTO routing_outcomes
        (id, task_json, decision_json, used_agent, followed_recommendation, success, quality_score, duration_ms, error, created_at)
      VALUES ('route-bad', 'not-json-{{', '{}', 'qe-test-architect', 1, 0, -1, 0, NULL, '2026-05-19 10:00:00')
    `).run();

    const hooks = new Command('hooks');
    registerRoutingHooks(hooks);
    await expect(
      hooks.parseAsync(['post-route', '--success', 'true', '--json'], { from: 'user' }),
    ).resolves.not.toThrow();

    // Sentinel still got resolved (the UPDATE happens before the Q-derivation
    // try/catch), but no Q-update fired since description couldn't be parsed.
    expect(updateHookRouterQValueMock).not.toHaveBeenCalled();
  });
});

describe('post-task trains rl_q_values even when outcome.bridge is absent (issue #499 fix #2)', () => {
  beforeEach(() => {
    updateHookRouterQValueMock.mockReset().mockResolvedValue(undefined);
    persistTaskOutcomeMock.mockReset();
    recordOutcomeMock.mockReset().mockResolvedValue({ success: true });
    updateRoutingOutcomeQualityMock.mockReset().mockResolvedValue(undefined);
  });

  it('fires Q-update with state derived from --description when bridge missing', async () => {
    // Direct Bash/Edit work: pre-task didn't fire, so persistTaskOutcome
    // returns no bridge. Before the fix, the `if (outcome.bridge)` gate
    // swallowed the Q-update entirely. After the fix, we derive from
    // options.description.
    persistTaskOutcomeMock.mockResolvedValue({
      experienceId: 'exp-1',
      qualityScore: 0.675,
      bridge: undefined,
    });

    const hooks = new Command('hooks');
    registerTaskHooks(hooks);
    await hooks.parseAsync(
      [
        'post-task',
        '--agent', 'qe-test-architect',
        '--success', 'true',
        '--description', 'Generate vitest unit tests for the auth module',
        '--json',
      ],
      { from: 'user' },
    );

    expect(updateHookRouterQValueMock).toHaveBeenCalledTimes(1);
    const call = updateHookRouterQValueMock.mock.calls[0][0];
    expect(call.agent).toBe('qe-test-architect');
    expect(call.success).toBe(true);
    expect(call.priority).toBe('normal');
    // Don't pin the heuristic outputs — assert they're well-formed and the
    // call fires; alignment with the reader side is tested in the post-route
    // suite above where it actually matters.
    expect(typeof call.taskType).toBe('string');
    expect(typeof call.domain).toBe('string');
    expect(typeof call.complexityBucket).toBe('number');
  });

  it('prefers the bridge-supplied state when bridge IS present', async () => {
    // Bridge present (pre-task ran): use its structural derivation verbatim
    // so this code path stays bit-identical to the pre-#499 behavior when
    // the bridge wins.
    persistTaskOutcomeMock.mockResolvedValue({
      experienceId: 'exp-2',
      qualityScore: 0.675,
      bridge: {
        selectedPatternIds: ['p1'],
        agent: 'qe-test-architect',
        description: 'bridge desc',
        taskType: 'coverage-analysis',
        priority: 'high',
        domain: 'security-compliance',
        complexityBucket: 7,
        estimatedTokenSavings: 0,
        ts: Date.now(),
      },
    });

    const hooks = new Command('hooks');
    registerTaskHooks(hooks);
    await hooks.parseAsync(
      [
        'post-task',
        '--agent', 'qe-test-architect',
        '--success', 'true',
        '--description', 'this description must lose to the bridge',
        '--json',
      ],
      { from: 'user' },
    );

    expect(updateHookRouterQValueMock).toHaveBeenCalledTimes(1);
    expect(updateHookRouterQValueMock.mock.calls[0][0]).toMatchObject({
      taskType: 'coverage-analysis',
      priority: 'high',
      domain: 'security-compliance',
      complexityBucket: 7,
    });
  });

  it('still skips Q-update when neither bridge nor description is available', async () => {
    persistTaskOutcomeMock.mockResolvedValue({
      experienceId: 'exp-3',
      qualityScore: 0.675,
      bridge: undefined,
    });

    const hooks = new Command('hooks');
    registerTaskHooks(hooks);
    await hooks.parseAsync(
      ['post-task', '--agent', 'qe-test-architect', '--success', 'true', '--json'],
      { from: 'user' },
    );

    // Without bridge AND without description we have no signal to derive
    // state from; firing the update would land every entry at a single
    // "unknown" state and pollute the table.
    expect(updateHookRouterQValueMock).not.toHaveBeenCalled();
  });
});
