import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  disposeHooksSystem,
  state,
} from '../../../../src/cli/commands/hooks-handlers/hooks-shared.js';
import type { QEReasoningBank } from '../../../../src/learning/qe-reasoning-bank.js';

describe('hook process cleanup', () => {
  afterEach(async () => {
    await disposeHooksSystem();
  });

  it('disposes the reasoning bank and clears hook singleton state', async () => {
    const dispose = vi.fn().mockResolvedValue(undefined);
    state.reasoningBank = { dispose } as unknown as QEReasoningBank;
    state.hookRegistry = {} as never;
    state.coherenceService = {} as never;
    state.sessionId = 'hook-session';
    state.initialized = true;
    state.initializationPromise = Promise.resolve();

    await disposeHooksSystem();

    expect(dispose).toHaveBeenCalledOnce();
    expect(state).toMatchObject({
      reasoningBank: null,
      hookRegistry: null,
      coherenceService: null,
      sessionId: null,
      initialized: false,
      initializationPromise: null,
    });
  });

  it('still clears state when component disposal fails', async () => {
    state.reasoningBank = {
      dispose: vi.fn().mockRejectedValue(new Error('close failed')),
    } as unknown as QEReasoningBank;
    state.initialized = true;

    await expect(disposeHooksSystem()).resolves.toBeUndefined();
    expect(state.reasoningBank).toBeNull();
    expect(state.initialized).toBe(false);
  });
});
