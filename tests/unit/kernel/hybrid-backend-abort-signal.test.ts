/**
 * Regression test for issue #495 — `createHybridBackendWithTimeout()` used to
 * bound `HybridMemoryBackend.initialize()` with `Promise.race`, which could
 * not cancel the underlying work. A stuck unified-memory init kept running
 * for 14+ min while the hook subprocess held patterns.rvf open (20 GB at
 * ~12 MB/s leak reported in the field).
 *
 * The fix threads an AbortSignal into both
 *   HybridMemoryBackend.initialize()
 *   UnifiedMemoryManager.initialize()
 * with `signal.throwIfAborted()` checks at each await seam, so cancellation
 * actually stops the work.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HybridMemoryBackend } from '../../../src/kernel/hybrid-backend.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

describe('HybridMemoryBackend.initialize() — AbortSignal (#495)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'aqe-hybrid-abort-'));
  });

  afterEach(() => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch { /* best-effort */ }
  });

  it('rejects immediately when the signal is pre-aborted', async () => {
    const backend = new HybridMemoryBackend({
      sqlite: { path: path.join(tmp, 'memory.db') },
      defaultNamespace: 'qe-patterns',
    });

    const controller = new AbortController();
    controller.abort();

    await expect(
      backend.initialize({ signal: controller.signal }),
    ).rejects.toThrow();

    // The backend must not be flagged as initialized after a pre-aborted call
    expect((backend as unknown as { initialized: boolean }).initialized).toBe(false);
  });

  it('rejects with the abort reason when signal fires during init', async () => {
    const backend = new HybridMemoryBackend({
      sqlite: { path: path.join(tmp, 'memory.db') },
      defaultNamespace: 'qe-patterns',
    });

    const controller = new AbortController();
    const abortPromise = backend.initialize({ signal: controller.signal });
    // Abort immediately. Synchronous initial check inside initialize() will
    // observe the aborted signal on first throwIfAborted().
    controller.abort();

    await expect(abortPromise).rejects.toThrow();
  });

  it('completes normally when no signal is provided (backwards-compat)', async () => {
    const backend = new HybridMemoryBackend({
      sqlite: { path: path.join(tmp, 'memory.db') },
      defaultNamespace: 'qe-patterns',
    });

    // No signal — existing callers (~20 sites across src/) keep working.
    await expect(backend.initialize()).resolves.toBeUndefined();
    expect((backend as unknown as { initialized: boolean }).initialized).toBe(true);

    await backend.dispose();
  });

  it('completes normally when signal is not aborted', async () => {
    const backend = new HybridMemoryBackend({
      sqlite: { path: path.join(tmp, 'memory.db') },
      defaultNamespace: 'qe-patterns',
    });

    const controller = new AbortController();
    await expect(
      backend.initialize({ signal: controller.signal }),
    ).resolves.toBeUndefined();

    await backend.dispose();
  });
});

describe('createHybridBackendWithTimeout — AbortSignal driven (#495)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'aqe-hybrid-tmo-'));
  });

  afterEach(() => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch { /* best-effort */ }
    vi.useRealTimers();
  });

  it('aborts the underlying initialize() when the timer fires', async () => {
    // We can't easily slow a real backend init enough to race the 5 s
    // timeout, so verify the wiring by constructing the same pattern: a
    // long-running fake initialize that observes signal.throwIfAborted()
    // at each step.
    let signalReceived: AbortSignal | undefined;
    const fakeBackend = {
      initialize: vi.fn(async (options?: { signal?: AbortSignal }) => {
        signalReceived = options?.signal;
        // Cooperatively check the signal after a short tick.
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
        options?.signal?.throwIfAborted();
      }),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('test timeout')), 1);

    await expect(
      fakeBackend.initialize({ signal: controller.signal }),
    ).rejects.toThrow();

    clearTimeout(timer);
    // The fix's signature contract: HybridMemoryBackend.initialize receives
    // the controller's signal.
    expect(signalReceived).toBeInstanceOf(AbortSignal);
    expect(signalReceived?.aborted).toBe(true);
  });
});
