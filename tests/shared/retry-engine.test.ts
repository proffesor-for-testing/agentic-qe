/**
 * Tests for the unified retry engine (IMP-03).
 *
 * Uses vitest fake timers so the exponential delays don't slow the suite.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withRetry,
  computeBackoff,
  isRetryableError,
} from '../../src/shared/retry-engine.js';

// ---------------------------------------------------------------------------
// Timer management
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Helper: run `withRetry` while advancing fake timers so the delay
 * promises resolve.  We can't simply `await withRetry(...)` because
 * the retry loop uses real `setTimeout` which is captured by vitest.
 */
function runWithRetry<T>(
  fn: () => Promise<T>,
  options?: Parameters<typeof withRetry>[1],
) {
  // Start the retry but don't await it yet.
  const promise = withRetry(fn, options);

  // Create a ticker that keeps advancing time until the promise settles.
  const ticker = (async () => {
    // Give enough ticks for maxAttempts * maxDelay of timer advances.
    for (let i = 0; i < 100; i++) {
      await vi.advanceTimersByTimeAsync(50_000);
    }
  })();

  // The retry promise should settle before we exhaust the ticker.
  return Promise.race([promise, ticker.then(() => promise)]);
}

// ---------------------------------------------------------------------------
// computeBackoff
// ---------------------------------------------------------------------------

describe('computeBackoff', () => {
  it('returns baseMs for attempt 0 (plus jitter)', () => {
    // With jitter = 0 we get the pure exponential value.
    expect(computeBackoff(0, 1000, 32_000, 0)).toBe(1000);
  });

  it('doubles with each attempt', () => {
    expect(computeBackoff(1, 1000, 32_000, 0)).toBe(2000);
    expect(computeBackoff(2, 1000, 32_000, 0)).toBe(4000);
    expect(computeBackoff(3, 1000, 32_000, 0)).toBe(8000);
  });

  it('caps at maxDelayMs', () => {
    // 1000 * 2^10 = 1024000, but capped at 32000.
    expect(computeBackoff(10, 1000, 32_000, 0)).toBe(32_000);
  });

  it('jitter stays within 0..jitterFraction * exponential', () => {
    // Run many iterations and check bounds.
    for (let i = 0; i < 200; i++) {
      const value = computeBackoff(2, 1000, 32_000, 0.25);
      const exponential = 4000; // 1000 * 2^2
      expect(value).toBeGreaterThanOrEqual(exponential);
      expect(value).toBeLessThanOrEqual(exponential + 0.25 * exponential);
    }
  });

  it('with jitter = 0, returns deterministic exponential', () => {
    const a = computeBackoff(3, 500, 20_000, 0);
    const b = computeBackoff(3, 500, 20_000, 0);
    expect(a).toBe(b);
    expect(a).toBe(4000); // 500 * 2^3
  });
});

// ---------------------------------------------------------------------------
// isRetryableError
// ---------------------------------------------------------------------------

describe('isRetryableError', () => {
  it('classifies ECONNRESET as retryable', () => {
    const err = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    expect(isRetryableError(err)).toBe(true);
  });

  it('classifies ECONNREFUSED as retryable', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    expect(isRetryableError(err)).toBe(true);
  });

  it('classifies ETIMEDOUT as retryable', () => {
    const err = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
    expect(isRetryableError(err)).toBe(true);
  });

  it('classifies HTTP 429 as retryable', () => {
    const err = Object.assign(new Error('Too Many Requests'), { status: 429 });
    expect(isRetryableError(err)).toBe(true);
  });

  it('classifies HTTP 503 as retryable', () => {
    const err = Object.assign(new Error('Service Unavailable'), { status: 503 });
    expect(isRetryableError(err)).toBe(true);
  });

  it('classifies HTTP 500 as retryable', () => {
    const err = Object.assign(new Error('Internal Server Error'), { status: 500 });
    expect(isRetryableError(err)).toBe(true);
  });

  it('classifies HTTP 404 as non-retryable', () => {
    const err = Object.assign(new Error('Not Found'), { status: 404 });
    expect(isRetryableError(err)).toBe(false);
  });

  it('classifies HTTP 401 as non-retryable', () => {
    const err = Object.assign(new Error('Unauthorized'), { status: 401 });
    expect(isRetryableError(err)).toBe(false);
  });

  it('classifies HTTP 400 as non-retryable', () => {
    const err = Object.assign(new Error('Bad Request'), { status: 400 });
    expect(isRetryableError(err)).toBe(false);
  });

  it('classifies HTTP 422 as non-retryable', () => {
    const err = Object.assign(new Error('Unprocessable Entity'), { status: 422 });
    expect(isRetryableError(err)).toBe(false);
  });

  it('returns true for unknown errors (safe default)', () => {
    expect(isRetryableError(new Error('something unexpected'))).toBe(true);
  });

  it('returns false for null/undefined', () => {
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// withRetry
// ---------------------------------------------------------------------------

describe('withRetry', () => {
  it('succeeds on first attempt — returns attempts: 1, totalDelayMs: 0', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await runWithRetry(fn, { maxAttempts: 3 });

    expect(result.result).toBe('ok');
    expect(result.attempts).toBe(1);
    expect(result.totalDelayMs).toBe(0);
    expect(result.retriedErrors).toHaveLength(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures and succeeds on attempt 3', async () => {
    const transientError = Object.assign(new Error('connection reset'), {
      code: 'ECONNRESET',
    });

    const fn = vi
      .fn()
      .mockRejectedValueOnce(transientError)
      .mockRejectedValueOnce(transientError)
      .mockResolvedValue('recovered');

    const result = await runWithRetry(fn, {
      maxAttempts: 5,
      baseDelayMs: 100,
      maxDelayMs: 10_000,
      jitterFraction: 0,
    });

    expect(result.result).toBe('recovered');
    expect(result.attempts).toBe(3);
    expect(result.retriedErrors).toHaveLength(2);
    expect(result.retriedErrors[0].attempt).toBe(1);
    expect(result.retriedErrors[1].attempt).toBe(2);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws last error when all attempts fail', async () => {
    const err = Object.assign(new Error('always fails'), {
      code: 'ECONNREFUSED',
    });
    const fn = vi.fn().mockRejectedValue(err);

    await expect(
      runWithRetry(fn, {
        maxAttempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 10_000,
        jitterFraction: 0,
      }),
    ).rejects.toThrow('always fails');

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws immediately for non-retryable errors without further attempts', async () => {
    const clientError = Object.assign(new Error('Not Found'), { status: 404 });

    const fn = vi.fn().mockRejectedValue(clientError);

    await expect(
      runWithRetry(fn, { maxAttempts: 5 }),
    ).rejects.toThrow('Not Found');

    // Should only have been called once — no retry.
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls onRetry callback before each retry', async () => {
    const err = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    const onRetry = vi.fn();

    const fn = vi
      .fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValue('done');

    await runWithRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 10_000,
      jitterFraction: 0,
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, err, 100); // attempt 1, delay = 100
  });

  it('respects AbortSignal and cancels pending retry', async () => {
    const controller = new AbortController();
    const err = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });

    const fn = vi.fn().mockRejectedValue(err);

    // Abort after first failure's delay begins.
    const onRetry = vi.fn().mockImplementation(() => {
      // Abort while the delay is pending.
      controller.abort();
    });

    await expect(
      runWithRetry(fn, {
        maxAttempts: 5,
        baseDelayMs: 5000,
        maxDelayMs: 32_000,
        jitterFraction: 0,
        abortSignal: controller.signal,
        onRetry,
      }),
    ).rejects.toThrow(/abort/i);

    // Should have attempted once, then been aborted during the delay.
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('respects already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();

    const fn = vi.fn().mockResolvedValue('should not run');

    await expect(
      runWithRetry(fn, { abortSignal: controller.signal }),
    ).rejects.toThrow(/abort/i);

    expect(fn).not.toHaveBeenCalled();
  });

  it('uses custom retryableErrors predicate', async () => {
    // Treat ALL errors as non-retryable — should throw on first failure.
    const fn = vi.fn().mockRejectedValue(new Error('nope'));

    await expect(
      runWithRetry(fn, {
        maxAttempts: 5,
        retryableErrors: () => false,
      }),
    ).rejects.toThrow('nope');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('accumulates totalDelayMs across retries', async () => {
    const err = Object.assign(new Error('retry me'), { code: 'EPIPE' });

    const fn = vi
      .fn()
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValue('ok');

    const result = await runWithRetry(fn, {
      maxAttempts: 5,
      baseDelayMs: 100,
      maxDelayMs: 10_000,
      jitterFraction: 0,
    });

    // Delay for attempt 0 = 100, attempt 1 = 200 → total = 300
    expect(result.totalDelayMs).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// Backwards compatibility (re-export shim in src/shared/llm/retry.ts)
// ---------------------------------------------------------------------------

describe('backwards compatibility shim', () => {
  it('backoffDelay matches the original deterministic formula', async () => {
    // Dynamic import so we test the actual shim module.
    const { backoffDelay } = await import(
      '../../src/shared/llm/retry.js'
    );

    expect(backoffDelay(0)).toBe(1000);
    expect(backoffDelay(1)).toBe(2000);
    expect(backoffDelay(2)).toBe(4000);
    expect(backoffDelay(3)).toBe(8000);
    expect(backoffDelay(4)).toBe(16_000);
    expect(backoffDelay(5)).toBe(30_000); // capped at default 30000
    expect(backoffDelay(10)).toBe(30_000);
  });

  it('backoffDelay accepts custom base and max', async () => {
    const { backoffDelay } = await import(
      '../../src/shared/llm/retry.js'
    );

    expect(backoffDelay(0, 500, 5000)).toBe(500);
    expect(backoffDelay(3, 500, 5000)).toBe(4000);
    expect(backoffDelay(4, 500, 5000)).toBe(5000); // capped
  });

  it('re-exports withRetry and isRetryableError', async () => {
    const shim = await import('../../src/shared/llm/retry.js');

    expect(typeof shim.withRetry).toBe('function');
    expect(typeof shim.isRetryableError).toBe('function');
    expect(typeof shim.computeBackoff).toBe('function');
  });
});
