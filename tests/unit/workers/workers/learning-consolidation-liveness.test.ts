/**
 * Issue #491 Bug 4a — liveness contract for LearningConsolidationWorker.
 *
 * Before this fix, `recordLoopHealth(success:true)` sat *after*
 * `collectPatterns()`. `collectPatterns()` throws on installs with nothing
 * to consolidate (the common case for fresh users), so the liveness ping
 * was never reached and `aqe learning loop-health` permanently displayed
 * `LearningConsolidationWorker ○ never-ran` even when the worker ran
 * every cycle. The bridge has the right shape (drainSafe uses try/finally)
 * and shows up correctly — the worker did not.
 *
 * The contract this test pins:
 *   1. A throw inside the worker body MUST still result in
 *      recordLoopHealth being called (with success:false).
 *   2. A successful run records success:true.
 *   3. A throw inside recordLoopHealth itself MUST be swallowed (it must
 *      never shadow the worker's real error or crash the daemon).
 *
 * If any of these regresses, the dashboard goes blind again.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LearningConsolidationWorker } from '../../../../src/workers/workers/learning-consolidation';
import * as loopHealthModule from '../../../../src/learning/loop-health';
import type { WorkerContext, WorkerMemory } from '../../../../src/workers/interfaces';

function makeMemory(): WorkerMemory {
  const store = new Map<string, unknown>();
  return {
    async get<T>(key: string): Promise<T | undefined> {
      return store.get(key) as T | undefined;
    },
    async set<T>(key: string, value: T): Promise<void> {
      store.set(key, value);
    },
    async search(pattern: string): Promise<string[]> {
      const prefix = pattern.replace(/\*+$/, '');
      return Array.from(store.keys()).filter((k) => k.startsWith(prefix));
    },
  };
}

function makeContext(memory: WorkerMemory): WorkerContext {
  const logCalls: Array<{ level: string; message: string; meta?: unknown }> = [];
  const logger = {
    debug: (m: string, meta?: unknown) => logCalls.push({ level: 'debug', message: m, meta }),
    info: (m: string, meta?: unknown) => logCalls.push({ level: 'info', message: m, meta }),
    warn: (m: string, meta?: unknown) => logCalls.push({ level: 'warn', message: m, meta }),
    error: (m: string, meta?: unknown) => logCalls.push({ level: 'error', message: m, meta }),
  };
  return {
    eventBus: {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as WorkerContext['eventBus'],
    memory,
    logger,
    domains: {
      getDomainAPI: () => undefined,
      getDomainHealth: () => ({ status: 'healthy', errors: [] }),
    },
    signal: new AbortController().signal,
  };
}

describe('Issue #491 Bug 4a — LearningConsolidationWorker liveness contract', () => {
  let worker: LearningConsolidationWorker;
  let recordSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    worker = new LearningConsolidationWorker();
    recordSpy = vi.spyOn(loopHealthModule, 'recordLoopHealth');
    recordSpy.mockClear();
  });

  it('records loop-health with success:false when collectPatterns throws', async () => {
    // collectPatterns is the documented throw site from the issue — on an
    // empty install it raises `No learning patterns to consolidate yet`.
    const collectErr = new Error('No learning patterns to consolidate yet');
    vi.spyOn(
      worker as unknown as { collectPatterns: () => Promise<unknown> },
      'collectPatterns'
    ).mockRejectedValueOnce(collectErr);

    const memory = makeMemory();
    const ctx = makeContext(memory);

    // doExecute is protected — we go through it via reflection since the
    // public entrypoint also rolls up retry/error tracking we don't want
    // to assert on here.
    await expect(
      (worker as unknown as { doExecute: (ctx: WorkerContext) => Promise<unknown> }).doExecute(ctx)
    ).rejects.toThrow('No learning patterns to consolidate yet');

    // The contract: even on throw, liveness was recorded.
    expect(recordSpy).toHaveBeenCalledTimes(1);
    const [callMemory, component, status] = recordSpy.mock.calls[0]!;
    expect(callMemory).toBe(memory);
    expect(component).toBe('learningWorker');
    expect(status).toMatchObject({ success: false });
    expect((status as { error?: string }).error).toContain('No learning patterns');
  });

  it('records loop-health with success:true on a successful tick', async () => {
    // Stub the inner phases so a real DB / domain isn't needed — we only
    // want to assert the happy-path liveness signal.
    vi.spyOn(
      worker as unknown as { collectPatterns: () => Promise<unknown[]> },
      'collectPatterns'
    ).mockResolvedValue([]);
    vi.spyOn(
      worker as unknown as { consolidatePatterns: () => Promise<unknown> },
      'consolidatePatterns'
    ).mockResolvedValue({
      patternsAnalyzed: 0,
      patternsPruned: 0,
      patternsConsolidated: 0,
      patternsDeprecated: 0,
      newInsights: 0,
      crossDomainPatterns: 0,
    });
    vi.spyOn(
      worker as unknown as { runDreamCycle: () => Promise<unknown> },
      'runDreamCycle'
    ).mockResolvedValue({ insights: 0, patternsCreated: 0 });

    const memory = makeMemory();
    const ctx = makeContext(memory);

    await (worker as unknown as { doExecute: (ctx: WorkerContext) => Promise<unknown> }).doExecute(ctx);

    expect(recordSpy).toHaveBeenCalledTimes(1);
    const [, component, status] = recordSpy.mock.calls[0]!;
    expect(component).toBe('learningWorker');
    expect(status).toMatchObject({ success: true });
  });

  it('does not shadow the original error when recordLoopHealth itself throws', async () => {
    // Worker throws AND the liveness recorder throws. The user must see
    // the original error, not the bookkeeping error.
    const collectErr = new Error('original worker failure');
    vi.spyOn(
      worker as unknown as { collectPatterns: () => Promise<unknown> },
      'collectPatterns'
    ).mockRejectedValueOnce(collectErr);

    recordSpy.mockRejectedValueOnce(new Error('memory backend is on fire'));

    const ctx = makeContext(makeMemory());

    await expect(
      (worker as unknown as { doExecute: (ctx: WorkerContext) => Promise<unknown> }).doExecute(ctx)
    ).rejects.toThrow('original worker failure');
  });
});
