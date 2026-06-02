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
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

const { persistTaskOutcomeMock, updateHookRouterQValueMock, updateRoutingOutcomeQualityMock, recordOutcomeMock } =
  vi.hoisted(() => ({
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
  printJson: vi.fn(),
  printSuccess: vi.fn(),
}));

import { registerTaskHooks } from '../../../../src/cli/commands/hooks-handlers/task-hooks.js';

describe('post-task --success parsing (issue #508)', () => {
  beforeEach(() => {
    for (const m of [persistTaskOutcomeMock, updateHookRouterQValueMock, updateRoutingOutcomeQualityMock, recordOutcomeMock]) m.mockReset();
    persistTaskOutcomeMock.mockResolvedValue({
      experienceId: 'exp-test', qualityScore: 0.575,
      bridge: { selectedPatternIds: [], agent: 'x', description: 'd', taskType: 'test-generation', priority: 'normal', domain: 'general', complexityBucket: 3, estimatedTokenSavings: 0, ts: Date.now() },
      stitchedSiblings: 0, insightsApplied: 0,
    });
    recordOutcomeMock.mockResolvedValue(undefined);
    updateHookRouterQValueMock.mockResolvedValue(undefined);
    updateRoutingOutcomeQualityMock.mockResolvedValue(undefined);
  });

  it('parses a BARE --success (the exact broken hook form) as success=true, not "--json"', async () => {
    const hooks = new Command('hooks');
    registerTaskHooks(hooks);
    // The literal shipped-hook argv that used to break: bare --success then --json.
    await hooks.parseAsync(['post-task', '--task-id', 't1', '--success', '--json'], { from: 'user' });

    expect(persistTaskOutcomeMock).toHaveBeenCalledTimes(1);
    // Pre-fix this was false (success="--json"); the fix makes it true.
    expect(persistTaskOutcomeMock.mock.calls[0][0].success).toBe(true);
  });

  it('records success=false only when explicitly told (--success false)', async () => {
    const hooks = new Command('hooks');
    registerTaskHooks(hooks);
    await hooks.parseAsync(['post-task', '--task-id', 't1', '--success', 'false', '--json'], { from: 'user' });
    expect(persistTaskOutcomeMock.mock.calls[0][0].success).toBe(false);
  });

  it('flows --agent attribution through (new template form, fixes agent=unknown)', async () => {
    const hooks = new Command('hooks');
    registerTaskHooks(hooks);
    await hooks.parseAsync(
      ['post-task', '--task-id', 't1', '--agent', 'qe-test-architect', '--success', 'true', '--description', 'd', '--json'],
      { from: 'user' },
    );
    expect(persistTaskOutcomeMock.mock.calls[0][0].agent).toBe('qe-test-architect');
    expect(persistTaskOutcomeMock.mock.calls[0][0].success).toBe(true);
  });
});
