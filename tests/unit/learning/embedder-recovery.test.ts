/**
 * Issue #1204: the shared retry for a failed embedder (used by
 * RealQEReasoningBank, QEReasoningBank and ExperienceReplay).
 *
 * After a failure the consumer runs without vectors. Once the retry interval
 * has passed, the next availability check starts one retry in the background
 * and still answers "unavailable": the triggering call never waits on a slow
 * embedder host. The consumer is available again only after the probe passed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmbedderRecovery } from '../../../src/learning/embedder-recovery.js';

const RETRY_MS = 10_000;

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('EmbedderRecovery (#1204)', () => {
  const later = (ms: number) => vi.setSystemTime(Date.now() + ms);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is available until a failure is recorded, then reports the reason', () => {
    const recovery = new EmbedderRecovery({ retryIntervalMs: RETRY_MS, probe: vi.fn() });

    expect(recovery.isAvailable()).toBe(true);
    expect(recovery.markUnavailable('connect ECONNREFUSED')).toBe(true);
    expect(recovery.markUnavailable('connect ECONNREFUSED')).toBe(false);
    expect(recovery.isAvailable()).toBe(false);
    expect(recovery.unavailableReason).toBe('connect ECONNREFUSED');
  });

  it('does not probe before the retry interval has passed', () => {
    const probe = vi.fn(async () => undefined);
    const recovery = new EmbedderRecovery({ retryIntervalMs: RETRY_MS, probe });
    recovery.markUnavailable('down');
    later(RETRY_MS - 1);

    expect(recovery.isAvailable()).toBe(false);
    expect(probe).not.toHaveBeenCalled();
  });

  it('starts the probe in the background: the triggering check answers unavailable at once', async () => {
    const pending = deferred();
    const probe = vi.fn(() => pending.promise);
    const onRecovered = vi.fn();
    const recovery = new EmbedderRecovery({ retryIntervalMs: RETRY_MS, probe, onRecovered });
    recovery.markUnavailable('down');
    later(RETRY_MS);

    expect(recovery.isAvailable()).toBe(false);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(recovery.isAvailable()).toBe(false);

    pending.resolve();
    await recovery.whenRetrySettled();

    expect(recovery.isAvailable()).toBe(true);
    expect(recovery.unavailableReason).toBeNull();
    expect(onRecovered).toHaveBeenCalledTimes(1);
  });

  it('runs one probe for overlapping checks', async () => {
    const pending = deferred();
    const probe = vi.fn(() => pending.promise);
    const recovery = new EmbedderRecovery({ retryIntervalMs: RETRY_MS, probe });
    recovery.markUnavailable('down');
    later(RETRY_MS);

    recovery.isAvailable();
    recovery.isAvailable();
    recovery.isAvailable();
    pending.resolve();
    await recovery.whenRetrySettled();

    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('stays unavailable when the probe fails, and waits a full interval before the next one', async () => {
    const probe = vi.fn(async () => { throw new Error('still down'); });
    const onRetryFailed = vi.fn();
    const recovery = new EmbedderRecovery({ retryIntervalMs: RETRY_MS, probe, onRetryFailed });
    recovery.markUnavailable('down');
    later(RETRY_MS);

    recovery.isAvailable();
    await recovery.whenRetrySettled();
    later(RETRY_MS - 1);
    recovery.isAvailable();

    expect(recovery.isAvailable()).toBe(false);
    expect(recovery.unavailableReason).toBe('down');
    expect(probe).toHaveBeenCalledTimes(1);
    expect(onRetryFailed).toHaveBeenCalledTimes(1);
    later(1);
    recovery.isAvailable();
    await recovery.whenRetrySettled();
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('keeps a failure recorded while the probe ran, even if the probe then passes', async () => {
    const pending = deferred();
    const recovery = new EmbedderRecovery({ retryIntervalMs: RETRY_MS, probe: () => pending.promise });
    recovery.markUnavailable('down');
    later(RETRY_MS);
    recovery.isAvailable();

    recovery.markUnavailable('failed again');
    pending.resolve();
    await recovery.whenRetrySettled();

    expect(recovery.unavailableReason).toBe('failed again');
  });
});
