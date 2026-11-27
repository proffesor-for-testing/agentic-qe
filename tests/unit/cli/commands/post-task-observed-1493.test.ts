/**
 * #1493: the installed hooks pass a constant `--success true` to post-task.
 * Apart from routing (#1481), post-task fed that value into the
 * QEAgentCompletion handlers, ReasoningBank pattern outcomes and the
 * experience pipeline (captured_experiences). Now every one of those streams
 * records only an observed `--outcome success|failure`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  recordOutcome: vi.fn(),
  persistTaskOutcome: vi.fn(),
  discardTaskBridge: vi.fn(),
  incrementDreamExperience: vi.fn(),
  updateHookRouterQValue: vi.fn(),
  updateRoutingOutcomeQuality: vi.fn(),
  printJson: vi.fn(),
}));

vi.mock('../../../../src/cli/commands/hooks-handlers/hooks-shared.js', () => ({
  getHooksSystem: vi.fn().mockResolvedValue({
    hookRegistry: { emit: mocks.emit },
    reasoningBank: { recordOutcome: mocks.recordOutcome, routeTask: vi.fn().mockResolvedValue({ success: false }) },
  }),
  applyHookBusyTimeout: vi.fn(),
  createHybridBackendWithTimeout: vi.fn().mockResolvedValue({
    store: vi.fn(), retrieve: vi.fn().mockResolvedValue(null), delete: vi.fn(), close: vi.fn(),
  }),
  incrementDreamExperience: mocks.incrementDreamExperience,
  checkAndTriggerDream: vi.fn().mockResolvedValue({ triggered: false }),
  persistTaskOutcome: mocks.persistTaskOutcome,
  discardTaskBridge: mocks.discardTaskBridge,
  updateHookRouterQValue: mocks.updateHookRouterQValue,
  updateRoutingOutcomeQuality: mocks.updateRoutingOutcomeQuality,
  printJson: mocks.printJson,
  printSuccess: vi.fn(),
}));

import { registerTaskHooks } from '../../../../src/cli/commands/hooks-handlers/task-hooks.js';
import { QE_HOOK_EVENTS } from '../../../../src/learning/qe-hooks.js';

async function postTask(...args: string[]): Promise<void> {
  const hooks = new Command('hooks');
  registerTaskHooks(hooks);
  await hooks.parseAsync(['post-task', '--task-id', 't-1493', '--agent', 'coder', ...args, '--json'], { from: 'user' });
}

describe('post-task learning streams record only observed outcomes (#1493)', () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    mocks.emit.mockResolvedValue([]);
    mocks.recordOutcome.mockResolvedValue(undefined);
    mocks.discardTaskBridge.mockResolvedValue(true);
    mocks.incrementDreamExperience.mockResolvedValue(1);
    mocks.persistTaskOutcome.mockResolvedValue({
      experienceId: 'exp-1493', qualityScore: 0.6, bridge: null, stitchedSiblings: 0, insightsApplied: 0,
    });
  });

  it.each([
    ['the installed constant --success true', ['--success', 'true']],
    ['a bare --success', ['--success']],
    ['--success false', ['--success', 'false']],
    ['no result flag', []],
  ])('records no outcome in any stream for %s', async (_label, flags) => {
    await postTask(...flags);

    expect(mocks.emit).not.toHaveBeenCalled();
    expect(mocks.recordOutcome).not.toHaveBeenCalled();
    expect(mocks.persistTaskOutcome).not.toHaveBeenCalled();
    expect(mocks.incrementDreamExperience).not.toHaveBeenCalled();
    // The task's pre-task bridge entry is retired, not credited later.
    expect(mocks.discardTaskBridge).toHaveBeenCalledTimes(1);
    expect(mocks.printJson.mock.calls[0][0]).toMatchObject({
      success: true, taskSuccess: null, outcomeObserved: false, patternsLearned: 0,
    });
  });

  it.each([
    [['--outcome', 'success'], true],
    [['--outcome', 'failure'], false],
    [['--success', 'true', '--outcome', 'failure'], false],
  ])('feeds the observed result of %j into every stream', async (flags, success) => {
    await postTask(...flags);

    expect(mocks.discardTaskBridge).not.toHaveBeenCalled();
    expect(mocks.emit).toHaveBeenCalledTimes(1);
    expect(mocks.emit.mock.calls[0][0]).toBe(QE_HOOK_EVENTS.QEAgentCompletion);
    expect(mocks.emit.mock.calls[0][1].success).toBe(success);

    expect(mocks.recordOutcome).toHaveBeenCalledTimes(1);
    expect(mocks.recordOutcome.mock.calls[0][0]).toMatchObject({
      success,
      metrics: { outcome: 'measured', outcomeBasis: 'hook-observed' },
    });

    expect(mocks.persistTaskOutcome).toHaveBeenCalledTimes(1);
    expect(mocks.persistTaskOutcome.mock.calls[0][0]).toMatchObject({ success, agent: 'coder' });
    expect(mocks.incrementDreamExperience).toHaveBeenCalledTimes(1);
    expect(mocks.printJson.mock.calls[0][0]).toMatchObject({ taskSuccess: success, outcomeObserved: true });
  });
});
