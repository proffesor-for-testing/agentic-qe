/**
 * Regression: issue #480
 *
 * post-edit fires FAR more often than post-task during Claude Code + AQE
 * sessions (every Edit/Write tool use vs only Task/Agent matchers). Without
 * post-edit invoking `checkAndTriggerDream`, the hook-driven dream loop is
 * starved — `dream-scheduler:hook-state.experienceCount` increments forever
 * but `lastDreamTime` stays null and `dream_insights.applied` stays at 0.
 *
 * The bug was: post-edit only called `incrementDreamExperience` and emitted
 * `dreamTriggered: false` as a literal. This test asserts the fix mirrors
 * post-task's behavior — both call `checkAndTriggerDream` and surface the
 * full {triggered, reason, insightsGenerated, insightsApplied} shape.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

const {
  checkAndTriggerDreamMock,
  incrementDreamExperienceMock,
  printJsonMock,
} = vi.hoisted(() => ({
  checkAndTriggerDreamMock: vi.fn(),
  incrementDreamExperienceMock: vi.fn(),
  printJsonMock: vi.fn(),
}));

vi.mock('../../../../src/cli/commands/hooks-handlers/hooks-shared.js', () => ({
  getHooksSystem: vi.fn().mockResolvedValue({
    hookRegistry: {
      emit: vi.fn().mockResolvedValue([{ success: true, patternsLearned: 0 }]),
    },
    reasoningBank: {
      recordOutcome: vi.fn().mockResolvedValue(undefined),
    },
  }),
  createHybridBackendWithTimeout: vi.fn().mockResolvedValue({
    store: vi.fn(),
    retrieve: vi.fn().mockResolvedValue(null),
    delete: vi.fn(),
    close: vi.fn(),
  }),
  incrementDreamExperience: incrementDreamExperienceMock,
  checkAndTriggerDream: checkAndTriggerDreamMock,
  persistCommandExperience: vi.fn().mockResolvedValue(undefined),
  printJson: printJsonMock,
  printSuccess: vi.fn(),
  printError: vi.fn(),
  printGuidance: vi.fn(),
  readStdinJsonEvent: vi.fn().mockResolvedValue(null),
  extractFilePathFromEvent: vi.fn().mockReturnValue(null),
}));

vi.mock('../../../../src/kernel/unified-memory.js', () => ({
  findProjectRoot: vi.fn(() => '/tmp/post-edit-dream-trigger-test'),
}));

import { registerEditingHooks } from '../../../../src/cli/commands/hooks-handlers/editing-hooks.js';

describe('post-edit dream trigger (#480)', () => {
  beforeEach(() => {
    checkAndTriggerDreamMock.mockReset();
    incrementDreamExperienceMock.mockReset();
    printJsonMock.mockReset();

    incrementDreamExperienceMock.mockResolvedValue(20);
  });

  it('invokes checkAndTriggerDream on every post-edit invocation', async () => {
    checkAndTriggerDreamMock.mockResolvedValue({
      triggered: false,
      reason: 'too-soon',
    });

    const hooks = new Command('hooks');
    registerEditingHooks(hooks);

    await hooks.parseAsync(
      ['post-edit', '--file', '/tmp/test.ts', '--success', '--json'],
      { from: 'user' },
    );

    // The whole point of #480: post-edit MUST invoke the trigger.
    expect(incrementDreamExperienceMock).toHaveBeenCalledTimes(1);
    expect(checkAndTriggerDreamMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces the full dream-trigger shape in JSON output (no bare false literal)', async () => {
    checkAndTriggerDreamMock.mockResolvedValue({
      triggered: true,
      reason: 'experience-threshold',
      insightsGenerated: 6,
      insightsApplied: 2,
    });

    const hooks = new Command('hooks');
    registerEditingHooks(hooks);

    await hooks.parseAsync(
      ['post-edit', '--file', '/tmp/test.ts', '--success', '--json'],
      { from: 'user' },
    );

    expect(printJsonMock).toHaveBeenCalledTimes(1);
    const payload = printJsonMock.mock.calls[0][0];

    // Before the #480 fix this collapsed to `dreamTriggered: false` (literal)
    // with no other dream fields. After the fix the JSON mirrors post-task.
    expect(payload.dreamTriggered).toBe(true);
    expect(payload.dreamReason).toBe('experience-threshold');
    expect(payload.dreamInsights).toBe(6);
    expect(payload.dreamInsightsApplied).toBe(2);
  });

  it('still emits dreamTriggered: false when trigger conditions are not met', async () => {
    checkAndTriggerDreamMock.mockResolvedValue({
      triggered: false,
      reason: 'conditions-not-met',
    });

    const hooks = new Command('hooks');
    registerEditingHooks(hooks);

    await hooks.parseAsync(
      ['post-edit', '--file', '/tmp/test.ts', '--success', '--json'],
      { from: 'user' },
    );

    const payload = printJsonMock.mock.calls[0][0];
    expect(payload.dreamTriggered).toBe(false);
    // Operators must be able to distinguish "not triggered because of state"
    // from "not triggered because we never tried" — that's the visibility
    // half of the fix.
    expect(payload.dreamReason).toBe('conditions-not-met');
  });
});
