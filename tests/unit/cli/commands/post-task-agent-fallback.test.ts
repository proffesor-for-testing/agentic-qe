/**
 * Regression: issue #460
 *
 * post-task resolves `agent = options.agent || 'unknown'`. The shipped hook
 * command is `--agent "$TOOL_RESULT_agent_id"` and Claude Code does NOT
 * expose that env var in PostToolUse context, so options.agent arrives empty
 * and `agent` always lands on 'unknown'. Every rl_q_values row used
 * action_key='unknown', and the router could never learn per-agent
 * differentiation.
 *
 * The pre-task bridge payload already carries `agent: routing.recommendedAgent`
 * which is the correct action key. This test asserts that the post-task
 * pipeline uses `bridge.agent` when --agent is absent, AND that an explicit
 * --agent value still wins (so a user override is respected).
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

const baseBridge = {
  selectedPatternIds: ['p1'],
  agent: 'qe-test-architect',
  description: 'd',
  taskType: 'test-generation',
  priority: 'normal',
  domain: 'test-generation',
  complexityBucket: 3,
  estimatedTokenSavings: 0,
  ts: Date.now(),
};

describe('post-task uses bridge.agent when --agent is absent (#460)', () => {
  beforeEach(() => {
    persistTaskOutcomeMock.mockReset();
    updateHookRouterQValueMock.mockReset();
    updateRoutingOutcomeQualityMock.mockReset();
    recordOutcomeMock.mockReset();

    persistTaskOutcomeMock.mockResolvedValue({
      experienceId: 'exp-test',
      qualityScore: 0.575,
      bridge: baseBridge,
      stitchedSiblings: 0,
      insightsApplied: 0,
    });
    recordOutcomeMock.mockResolvedValue(undefined);
    updateHookRouterQValueMock.mockResolvedValue(undefined);
    updateRoutingOutcomeQualityMock.mockResolvedValue(undefined);
  });

  it('falls back to bridge.agent for Q-learning when --agent is missing', async () => {
    const hooks = new Command('hooks');
    registerTaskHooks(hooks);

    await hooks.parseAsync(['post-task', '--success', 'true', '--json'], { from: 'user' });

    expect(updateHookRouterQValueMock).toHaveBeenCalledTimes(1);
    expect(updateHookRouterQValueMock.mock.calls[0][0].agent).toBe('qe-test-architect');
    expect(updateRoutingOutcomeQualityMock).toHaveBeenCalledTimes(1);
    expect(updateRoutingOutcomeQualityMock.mock.calls[0][0].agent).toBe('qe-test-architect');
  });

  it('falls back to bridge.agent when --agent is the literal empty string', async () => {
    const hooks = new Command('hooks');
    registerTaskHooks(hooks);

    await hooks.parseAsync(
      ['post-task', '--agent', '', '--success', 'true', '--json'],
      { from: 'user' },
    );

    expect(updateHookRouterQValueMock.mock.calls[0][0].agent).toBe('qe-test-architect');
    expect(updateRoutingOutcomeQualityMock.mock.calls[0][0].agent).toBe('qe-test-architect');
  });

  it('respects an explicit --agent over bridge.agent (user override)', async () => {
    const hooks = new Command('hooks');
    registerTaskHooks(hooks);

    await hooks.parseAsync(
      ['post-task', '--agent', 'qe-coverage-specialist', '--success', 'true', '--json'],
      { from: 'user' },
    );

    expect(updateHookRouterQValueMock.mock.calls[0][0].agent).toBe('qe-coverage-specialist');
    expect(updateRoutingOutcomeQualityMock.mock.calls[0][0].agent).toBe('qe-coverage-specialist');
  });

  it('stays on "unknown" when neither --agent nor bridge.agent is available', async () => {
    persistTaskOutcomeMock.mockResolvedValueOnce({
      experienceId: 'exp-test',
      qualityScore: 0.575,
      bridge: { ...baseBridge, agent: '' }, // bridge present but no agent
      stitchedSiblings: 0,
      insightsApplied: 0,
    });

    const hooks = new Command('hooks');
    registerTaskHooks(hooks);

    await hooks.parseAsync(['post-task', '--success', 'true', '--json'], { from: 'user' });

    expect(updateHookRouterQValueMock.mock.calls[0][0].agent).toBe('unknown');
    expect(updateRoutingOutcomeQualityMock.mock.calls[0][0].agent).toBe('unknown');
  });
});
