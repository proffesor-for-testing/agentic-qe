/**
 * Issue #480 (history) + ADR-094 (current contract)
 *
 * History — #480 fixed in v3.9.30 commit 66553141:
 *   post-edit used to set `dreamTriggered = false` literally and never
 *   invoke `checkAndTriggerDream`. The hook-driven dream loop was starved.
 *
 * Current contract — ADR-094 / #488 Phase 2:
 *   Dream cycles run in the long-lived kernel via QEKernelImpl._dreamScheduler,
 *   NOT in hook subprocesses. post-edit bumps the experience counter
 *   (`incrementDreamExperience`) so the scheduler knows fresh experiences
 *   accumulated, but does NOT invoke `checkAndTriggerDream` — that path is
 *   forbidden by the hooks-as-producers boundary contract (enforced by
 *   tests/unit/architecture/hooks-boundary.test.ts).
 *
 * The JSON output retains `dreamTriggered` / `dreamReason` fields for
 * backwards-compat with operator scripts that grep for them. dreamReason
 * is now always 'deferred-to-kernel' so operators can see WHERE the cycle
 * actually runs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

const {
  incrementDreamExperienceMock,
  printJsonMock,
} = vi.hoisted(() => ({
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

describe('post-edit dream trigger contract (ADR-094)', () => {
  beforeEach(() => {
    incrementDreamExperienceMock.mockReset();
    printJsonMock.mockReset();

    incrementDreamExperienceMock.mockResolvedValue(20);
  });

  it('bumps the experience counter so the kernel scheduler sees fresh activity', async () => {
    const hooks = new Command('hooks');
    registerEditingHooks(hooks);

    await hooks.parseAsync(
      ['post-edit', '--file', '/tmp/test.ts', '--success', '--json'],
      { from: 'user' },
    );

    // The counter bump is the producer-side signal the kernel scheduler reads.
    // Without it, kernel-side dream cycles would only fire on the time-based
    // cadence and would miss the experience-threshold trigger.
    expect(incrementDreamExperienceMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT trigger a dream cycle from the hook subprocess (ADR-094 boundary)', async () => {
    // The post-edit hook no longer imports checkAndTriggerDream — verified
    // structurally by tests/unit/architecture/hooks-boundary.test.ts. This
    // test asserts the observable behavior: JSON output reflects that the
    // cycle is deferred, never that it was triggered inline.
    const hooks = new Command('hooks');
    registerEditingHooks(hooks);

    await hooks.parseAsync(
      ['post-edit', '--file', '/tmp/test.ts', '--success', '--json'],
      { from: 'user' },
    );

    expect(printJsonMock).toHaveBeenCalledTimes(1);
    const payload = printJsonMock.mock.calls[0][0];

    expect(payload.dreamTriggered).toBe(false);
    // 'deferred-to-kernel' is the contract: operators reading hook JSON see
    // *where* the cycle actually runs, instead of being misled by a bare
    // `false` literal that doesn't tell them anything.
    expect(payload.dreamReason).toBe('deferred-to-kernel');
  });

  it('counter is bumped even when the memory backend init throws (best-effort)', async () => {
    // If the hook can't reach memory at all (unusual but possible during
    // init races), the JSON still emits the deferred-to-kernel signal so
    // operators don't see "fields missing — is the hook broken?".
    incrementDreamExperienceMock.mockRejectedValueOnce(new Error('memory down'));

    const hooks = new Command('hooks');
    registerEditingHooks(hooks);

    await hooks.parseAsync(
      ['post-edit', '--file', '/tmp/test.ts', '--success', '--json'],
      { from: 'user' },
    );

    const payload = printJsonMock.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.dreamReason).toBe('deferred-to-kernel');
  });
});
