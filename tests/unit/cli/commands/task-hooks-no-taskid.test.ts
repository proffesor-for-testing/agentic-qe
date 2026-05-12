/**
 * Regression: issue #449
 *
 * post-task must run the full Stream B/D/F learning chain even when
 * --task-id is missing.
 *
 * The shipped PostToolUse hook command is
 *   `npx agentic-qe hooks post-task --task-id "$TOOL_RESULT_agent_id" --success --json`
 * Claude Code does not populate $TOOL_RESULT_agent_id for Task/Agent tools, so
 * options.taskId is empty on every real invocation. The pre-fix code wrapped
 * persistTaskOutcome / updateRoutingOutcomeQuality / updateHookRouterQValue in
 * `if (options.taskId)`, silently killing all three. rl_q_values stayed empty
 * forever.
 *
 * This test mocks hooks-shared and asserts the pipeline still fires with no
 * --task-id. If the gate is reintroduced, persistTaskOutcome / Q-update spies
 * will never be called and the test will fail.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

const {
  persistTaskOutcomeMock,
  updateHookRouterQValueMock,
  updateRoutingOutcomeQualityMock,
  recordOutcomeMock,
} = vi.hoisted(() => ({
  persistTaskOutcomeMock: vi.fn(),
  updateHookRouterQValueMock: vi.fn(),
  updateRoutingOutcomeQualityMock: vi.fn(),
  recordOutcomeMock: vi.fn(),
}));

vi.mock('../../../../src/cli/commands/hooks-handlers/hooks-shared.js', () => ({
  getHooksSystem: vi.fn().mockResolvedValue({
    hookRegistry: { emit: vi.fn().mockResolvedValue([]) },
    reasoningBank: {
      recordOutcome: recordOutcomeMock,
      routeTask: vi.fn().mockResolvedValue({ success: false }),
    },
  }),
  applyHookBusyTimeout: vi.fn(),
  createHybridBackendWithTimeout: vi.fn().mockResolvedValue({
    store: vi.fn(),
    retrieve: vi.fn().mockResolvedValue(null),
    delete: vi.fn(),
    close: vi.fn(),
  }),
  incrementDreamExperience: vi.fn().mockResolvedValue(0),
  checkAndTriggerDream: vi.fn().mockResolvedValue({ triggered: false }),
  persistTaskOutcome: persistTaskOutcomeMock,
  updateHookRouterQValue: updateHookRouterQValueMock,
  updateRoutingOutcomeQuality: updateRoutingOutcomeQualityMock,
  printJson: vi.fn(),
  printSuccess: vi.fn(),
}));

import { registerTaskHooks } from '../../../../src/cli/commands/hooks-handlers/task-hooks.js';

describe('post-task without --task-id (issue #449)', () => {
  beforeEach(() => {
    persistTaskOutcomeMock.mockReset();
    updateHookRouterQValueMock.mockReset();
    updateRoutingOutcomeQualityMock.mockReset();
    recordOutcomeMock.mockReset();

    persistTaskOutcomeMock.mockResolvedValue({
      experienceId: 'exp-test',
      qualityScore: 0.575,
      bridge: {
        selectedPatternIds: ['p1'],
        agent: 'qe-test-architect',
        description: 'd',
        taskType: 'test-generation',
        priority: 'normal',
        domain: 'general',
        complexityBucket: 3,
        estimatedTokenSavings: 0,
        ts: Date.now(),
      },
      stitchedSiblings: 0,
      insightsApplied: 0,
    });
    recordOutcomeMock.mockResolvedValue(undefined);
    updateHookRouterQValueMock.mockResolvedValue(undefined);
    updateRoutingOutcomeQualityMock.mockResolvedValue(undefined);
  });

  it('runs persistTaskOutcome and updateHookRouterQValue when --task-id is absent', async () => {
    const hooks = new Command('hooks');
    registerTaskHooks(hooks);

    await hooks.parseAsync(
      ['post-task', '--success', 'true', '--agent', 'qe-test-architect', '--json'],
      { from: 'user' },
    );

    expect(persistTaskOutcomeMock).toHaveBeenCalledTimes(1);
    const call = persistTaskOutcomeMock.mock.calls[0][0];
    expect(call.agent).toBe('qe-test-architect');
    expect(call.success).toBe(true);
    expect(call.taskId).toMatch(/^hook-\d+$/);

    expect(updateRoutingOutcomeQualityMock).toHaveBeenCalledTimes(1);
    expect(updateHookRouterQValueMock).toHaveBeenCalledTimes(1);
    expect(updateHookRouterQValueMock.mock.calls[0][0]).toMatchObject({
      taskType: 'test-generation',
      domain: 'general',
      agent: 'qe-test-architect',
      success: true,
    });

    expect(recordOutcomeMock).toHaveBeenCalledTimes(1);
    expect(recordOutcomeMock.mock.calls[0][0].patternId).toMatch(/^task:qe-test-architect:hook-\d+$/);
  });

  it('still uses the real --task-id when one is provided', async () => {
    const hooks = new Command('hooks');
    registerTaskHooks(hooks);

    await hooks.parseAsync(
      ['post-task', '--task-id', 'real-task-42', '--success', 'true', '--agent', 'coder', '--json'],
      { from: 'user' },
    );

    expect(persistTaskOutcomeMock).toHaveBeenCalledTimes(1);
    expect(persistTaskOutcomeMock.mock.calls[0][0].taskId).toBe('real-task-42');
    expect(recordOutcomeMock.mock.calls[0][0].patternId).toBe('task:coder:real-task-42');
  });
});
