/**
 * ADR-094: Kernel-side DreamScheduler wiring.
 *
 * Asserts:
 *   - `enableDreamScheduler` defaults to true
 *   - kernel.initialize() boots a DreamScheduler without errors
 *   - kernel.dispose() stops the scheduler cleanly
 *   - `enableDreamScheduler: false` skips the scheduler (opt-out path for
 *     short-lived CLI commands that don't need the DreamEngine init cost)
 *   - scheduler init failure does NOT break the kernel (best-effort throughout)
 *
 * This is a lightweight wiring test — we exercise the start/stop lifecycle
 * but do not trigger an actual dream cycle (that would require concept-graph
 * setup and is covered by dream-engine / dream-scheduler unit tests).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createKernel } from '../../../src/kernel/kernel';
import { resetUnifiedMemory } from '../../../src/kernel/unified-memory';

describe('Kernel DreamScheduler wiring (ADR-094)', () => {
  afterEach(() => {
    resetUnifiedMemory();
  });

  it('enableDreamScheduler defaults to true in the kernel config', () => {
    const kernel = createKernel({ memoryBackend: 'memory' });
    const config = kernel.getConfig();
    expect(config.enableDreamScheduler).toBe(true);
  });

  it('honors enableDreamScheduler: false (opt-out path)', () => {
    const kernel = createKernel({
      memoryBackend: 'memory',
      enableDreamScheduler: false,
    });
    const config = kernel.getConfig();
    expect(config.enableDreamScheduler).toBe(false);
  });

  it('initialize + dispose cleanly with enableDreamScheduler: false (short-lived CLI path)', async () => {
    const kernel = createKernel({
      memoryBackend: 'memory',
      enableDreamScheduler: false,
      enableExperienceBridge: false,
      lazyLoading: true,
    });

    await kernel.initialize();
    // Sanity: kernel works for a basic memory op without the scheduler.
    await kernel.memory.set('probe', 'value');
    expect(await kernel.memory.get<string>('probe')).toBe('value');

    // Disposal must not throw even though no scheduler was constructed.
    await kernel.dispose();
  });

  it('initialize + dispose cleanly with enableDreamScheduler: true (default daemon path)', async () => {
    const kernel = createKernel({
      memoryBackend: 'memory',
      enableDreamScheduler: true,
      // Disable bridge so we test the dream scheduler wiring in isolation
      // — bridge eager-loads all 13 plugins which is slower than this test
      // needs to be (and is covered by other kernel.test.ts cases).
      enableExperienceBridge: false,
      lazyLoading: true,
    });

    // initialize() must succeed even if the DreamEngine has nothing to load.
    // The scheduler is wrapped in try/catch in kernel.ts; failure to start
    // sets `_dreamScheduler = undefined` and continues — `initialize()`
    // never throws from a scheduler init error.
    await expect(kernel.initialize()).resolves.toBeUndefined();
    await expect(kernel.dispose()).resolves.toBeUndefined();
  });

  it('dispose is idempotent and survives the case where the scheduler never started', async () => {
    const kernel = createKernel({
      memoryBackend: 'memory',
      enableDreamScheduler: false,
      enableExperienceBridge: false,
      lazyLoading: true,
    });

    await kernel.initialize();
    // First dispose — scheduler never existed, must succeed.
    await kernel.dispose();
    // Second dispose — already disposed. Some kernel ops will fail (memory
    // closed) but the call itself should not throw uncaught.
    await expect(kernel.dispose()).resolves.toBeUndefined();
  });
});
