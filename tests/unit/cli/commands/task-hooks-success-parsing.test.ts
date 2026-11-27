/**
 * Regression: issue #508
 *
 * The shipped PostToolUse hook ran:
 *   `npx agentic-qe hooks post-task --task-id "$TOOL_RESULT_agent_id" --success --json`
 * With the option declared `--success <bool>` (value REQUIRED), Commander
 * consumed the next token (`--json`) as the success value, so options.success
 * was "--json" → parsed false → every trajectory recorded success=0 and the
 * --json branch was swallowed.
 *
 * The fix declares `--success [bool]` (value OPTIONAL): a bare `--success`
 * yields boolean true and never eats the following `--json`. These tests drive
 * the EXACT broken hook form through registerTaskHooks and assert the action
 * receives success=true (and that --agent attribution flows through).
 *
 * #1493: `--success` is now ignored by every learning stream (installed hooks
 * passed it as a constant). The parsing guarantee still matters: a bare
 * `--success` must not swallow `--json`. Outcomes come from `--outcome`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

const { persistTaskOutcomeMock, updateHookRouterQValueMock, updateRoutingOutcomeQualityMock, recordOutcomeMock, printJsonMock } =
  vi.hoisted(() => ({
    printJsonMock: vi.fn(),
    persistTaskOutcomeMock: vi.fn(),
    updateHookRouterQValueMock: vi.fn(),
    updateRoutingOutcomeQualityMock: vi.fn(),
    recordOutcomeMock: vi.fn(),
  }));

vi.mock('../../../../src/cli/commands/hooks-handlers/hooks-shared.js', () => ({
  getHooksSystem: vi.fn().mockResolvedValue({
    hookRegistry: { emit: vi.fn().mockResolvedValue([]) },
    reasoningBank: { recordOutcome: recordOutcomeMock, routeTask: vi.fn().mockResolvedValue({ success: false }) },
  }),
  applyHookBusyTimeout: vi.fn(),
  createHybridBackendWithTimeout: vi.fn().mockResolvedValue({
    store: vi.fn(), retrieve: vi.fn().mockResolvedValue(null), delete: vi.fn(), close: vi.fn(),
  }),
  incrementDreamExperience: vi.fn().mockResolvedValue(0),
  checkAndTriggerDream: vi.fn().mockResolvedValue({ triggered: false }),
  persistTaskOutcome: persistTaskOutcomeMock,
  updateHookRouterQValue: updateHookRouterQValueMock,
  updateRoutingOutcomeQuality: updateRoutingOutcomeQualityMock,
  discardTaskBridge: vi.fn().mockResolvedValue(false),
  printJson: printJsonMock,
  printSuccess: vi.fn(),
}));

import { registerTaskHooks } from '../../../../src/cli/commands/hooks-handlers/task-hooks.js';

describe('post-task --success parsing (issue #508)', () => {
  beforeEach(() => {
    for (const m of [persistTaskOutcomeMock, updateHookRouterQValueMock, updateRoutingOutcomeQualityMock, recordOutcomeMock, printJsonMock]) m.mockReset();
    persistTaskOutcomeMock.mockResolvedValue({
      experienceId: 'exp-test', qualityScore: 0.575,
      bridge: { selectedPatternIds: [], agent: 'x', description: 'd', taskType: 'test-generation', priority: 'normal', domain: 'general', complexityBucket: 3, estimatedTokenSavings: 0, ts: Date.now() },
      stitchedSiblings: 0, insightsApplied: 0,
    });
    recordOutcomeMock.mockResolvedValue(undefined);
    updateHookRouterQValueMock.mockResolvedValue(undefined);
    updateRoutingOutcomeQualityMock.mockResolvedValue(undefined);
  });

  it('does not let a BARE --success (the exact broken hook form) swallow --json', async () => {
    const hooks = new Command('hooks');
    registerTaskHooks(hooks);
    // The literal shipped-hook argv that used to break: bare --success then --json.
    await hooks.parseAsync(['post-task', '--task-id', 't1', '--success', '--json'], { from: 'user' });

    // --json still selects JSON output (#508) ...
    expect(printJsonMock).toHaveBeenCalledTimes(1);
    // ... and the constant --success records no outcome (#1493).
    expect(printJsonMock.mock.calls[0][0]).toMatchObject({ taskSuccess: null, outcomeObserved: false });
    expect(persistTaskOutcomeMock).not.toHaveBeenCalled();
  });

  it('records no outcome for --success false either (#1493)', async () => {
    const hooks = new Command('hooks');
    registerTaskHooks(hooks);
    await hooks.parseAsync(['post-task', '--task-id', 't1', '--success', 'false', '--json'], { from: 'user' });
    expect(persistTaskOutcomeMock).not.toHaveBeenCalled();
  });

  it('flows --agent attribution through (new template form, fixes agent=unknown)', async () => {
    const hooks = new Command('hooks');
    registerTaskHooks(hooks);
    await hooks.parseAsync(
      ['post-task', '--task-id', 't1', '--agent', 'qe-test-architect', '--outcome', 'success', '--description', 'd', '--json'],
      { from: 'user' },
    );
    expect(persistTaskOutcomeMock.mock.calls[0][0].agent).toBe('qe-test-architect');
    expect(persistTaskOutcomeMock.mock.calls[0][0].success).toBe(true);
  });
});
