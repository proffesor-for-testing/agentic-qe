/**
 * #1481: the installed hooks passed a constant `--success true`. Routing
 * outcomes from the hooks are recorded only when a result was observed
 * (`--outcome success|failure`, or an explicit `--success false`).
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
import { resolveObservedHookOutcome } from '../../../../src/routing/routing-outcomes-migration.js';

async function postTask(...args: string[]) {
  const hooks = new Command('hooks');
  registerTaskHooks(hooks);
  await hooks.parseAsync(['post-task', '--agent', 'qe-test-architect', '--description', 'write tests', ...args, '--json'], { from: 'user' });
}

describe('post-task records routing outcomes only when observed (#1481)', () => {
  beforeEach(() => {
    for (const m of [persistTaskOutcomeMock, updateHookRouterQValueMock, updateRoutingOutcomeQualityMock, recordOutcomeMock]) m.mockReset();
    persistTaskOutcomeMock.mockResolvedValue({
      experienceId: 'exp-test', qualityScore: 0.575,
      bridge: { selectedPatternIds: [], agent: 'x', description: 'd', taskType: 'test-generation', priority: 'normal', domain: 'general', complexityBucket: 3, estimatedTokenSavings: 0, ts: Date.now() },
      stitchedSiblings: 0, insightsApplied: 0,
    });
  });

  it.each([
    ['the installed constant --success true', ['--success', 'true']],
    ['a bare --success', ['--success']],
    ['no result flag (the new installed command)', []],
  ])('leaves the routing sentinel and Q-value alone for %s', async (_label, flags) => {
    await postTask(...flags);

    expect(updateRoutingOutcomeQualityMock).not.toHaveBeenCalled();
    expect(updateHookRouterQValueMock).not.toHaveBeenCalled();
    // Non-routing learning streams keep their previous reading of --success.
    expect(persistTaskOutcomeMock.mock.calls[0][0].success).toBe(true);
  });

  it.each([
    [['--outcome', 'success'], true],
    [['--outcome', 'failure'], false],
    [['--success', 'false'], false],
  ])('records an observed result for %j', async (flags, success) => {
    await postTask(...flags);

    expect(updateRoutingOutcomeQualityMock).toHaveBeenCalledTimes(1);
    expect(updateRoutingOutcomeQualityMock.mock.calls[0][0].success).toBe(success);
    expect(updateHookRouterQValueMock.mock.calls[0][0].success).toBe(success);
  });

  it('rejects an --outcome that is not success or failure', () => {
    expect(() => resolveObservedHookOutcome({ outcome: 'maybe' })).toThrow('--outcome must be');
    expect(resolveObservedHookOutcome({ success: 'true' })).toBeNull();
    expect(resolveObservedHookOutcome({ success: true })).toBeNull();
    expect(resolveObservedHookOutcome({})).toBeNull();
  });
});

describe('installed hook commands report no constant result (#1481)', () => {
  it.each([
    ['src/init/phases/07-hooks.ts'],
    ['src/init/init-wizard-hooks.ts'],
    ['.codex/hooks/aqe-codex-hook.cjs'],
  ])('%s does not pass --success to post-route or post-task', async (file) => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const text = readFileSync(resolve(__dirname, '../../../..', file), 'utf8');

    const routingHookLines = text.split('\n').filter((l) => /post-route|post-task/.test(l) && /aqe-hook|runAqe/.test(l));
    expect(routingHookLines.length).toBeGreaterThan(0);
    for (const line of routingHookLines) expect(line).not.toMatch(/--success|'true'/);
  });
});
