/**
 * Timer Test Utilities
 *
 * Helper functions for testing code that uses setTimeout/setInterval
 * with Jest's fake timers for deterministic, reliable tests.
 *
 * @example
 * ```typescript
 * import { withFakeTimers, advanceAndFlush } from '../helpers/timerTestUtils';
 *
 * it('should test with fake timers', async () => {
 *   await withFakeTimers(async (timers) => {
 *     const cache = new Cache({ ttl: 100 });
 *     cache.set('key', 'value');
 *     timers.advance(150);
 *     expect(cache.get('key')).toBeNull();
 *   });
 * });
 * ```
 */

/**
 * Timer control interface provided to test callbacks
 */
export interface TimerControl {
  /**
   * Advance time by specified milliseconds
   */
  advance(ms: number): void;

  /**
   * Advance time and flush pending promises
   */
  advanceAsync(ms: number): Promise<void>;

  /**
   * Run all pending timers
   */
  runAll(): void;

  /**
   * Run all pending timers with async handling
   */
  runAllAsync(): Promise<void>;

  /**
   * Run only currently pending timers (not newly scheduled ones)
   */
  runPending(): void;

  /**
   * Clear all pending timers without executing them
   */
  clear(): void;

  /**
   * Set the system time for Date.now()
   */
  setSystemTime(date: Date | number): void;

  /**
   * Get the current fake time in milliseconds
   */
  now(): number;
}

/**
 * Wrapper that sets up and tears down fake timers automatically.
 *
 * Ensures proper cleanup even if the test throws an error.
 *
 * @param fn - Test function that receives timer controls
 * @returns Promise that resolves when test completes
 *
 * @example
 * ```typescript
 * it('should expire after TTL', async () => {
 *   await withFakeTimers(async (timers) => {
 *     const item = createWithTTL(100);
 *     expect(item.isExpired()).toBe(false);
 *
 *     timers.advance(150);
 *
 *     expect(item.isExpired()).toBe(true);
 *   });
 * });
 * ```
 */
export async function withFakeTimers(
  fn: (timers: TimerControl) => void | Promise<void>
): Promise<void> {
  jest.useFakeTimers();

  const startTime = Date.now();

  const timers: TimerControl = {
    advance(ms: number): void {
      jest.advanceTimersByTime(ms);
    },

    async advanceAsync(ms: number): Promise<void> {
      await jest.advanceTimersByTimeAsync(ms);
    },

    runAll(): void {
      jest.runAllTimers();
    },

    async runAllAsync(): Promise<void> {
      jest.runAllTimers();
      // Flush pending microtasks
      await Promise.resolve();
    },

    runPending(): void {
      jest.runOnlyPendingTimers();
    },

    clear(): void {
      jest.clearAllTimers();
    },

    setSystemTime(date: Date | number): void {
      jest.setSystemTime(date);
    },

    now(): number {
      return Date.now();
    },
  };

  try {
    await fn(timers);
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
}

/**
 * Advance time and flush pending promises.
 *
 * Use this when your code mixes promises with timers.
 * Must be called within a fake timer context.
 *
 * @param ms - Milliseconds to advance
 * @returns Promise that resolves after time advancement and promise flushing
 *
 * @example
 * ```typescript
 * it('should handle async with timers', async () => {
 *   jest.useFakeTimers();
 *
 *   const promise = asyncOperationWithTimeout();
 *   await advanceAndFlush(100);
 *
 *   const result = await promise;
 *   expect(result).toBeDefined();
 *
 *   jest.useRealTimers();
 * });
 * ```
 */
export async function advanceAndFlush(ms: number): Promise<void> {
  // Use the async variant which handles promise flushing
  await jest.advanceTimersByTimeAsync(ms);
}

/**
 * Run all timers with proper async handling.
 *
 * Runs all pending timers and flushes the microtask queue.
 * Must be called within a fake timer context.
 *
 * @returns Promise that resolves after all timers run
 *
 * @example
 * ```typescript
 * it('should run all scheduled operations', async () => {
 *   jest.useFakeTimers();
 *
 *   const results: number[] = [];
 *   setTimeout(() => results.push(1), 100);
 *   setTimeout(() => results.push(2), 200);
 *
 *   await runAllTimersAsync();
 *
 *   expect(results).toEqual([1, 2]);
 *
 *   jest.useRealTimers();
 * });
 * ```
 */
export async function runAllTimersAsync(): Promise<void> {
  // Run all timers
  jest.runAllTimers();

  // Flush microtask queue multiple times to handle nested promises
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

/**
 * Run pending timers with async handling.
 *
 * Only runs currently scheduled timers, not ones scheduled during execution.
 * Useful for testing step-by-step timer behavior.
 *
 * @returns Promise that resolves after pending timers run
 *
 * @example
 * ```typescript
 * jest.useFakeTimers();
 *
 * setTimeout(() => {
 *   // This schedules another timer
 *   setTimeout(() => console.log('nested'), 100);
 * }, 100);
 *
 * await runPendingTimersAsync();
 * // Only first timer ran, nested timer still pending
 *
 * await runPendingTimersAsync();
 * // Now nested timer ran
 * ```
 */
export async function runPendingTimersAsync(): Promise<void> {
  jest.runOnlyPendingTimers();
  await Promise.resolve();
}

/**
 * Wait for next tick in fake timer context.
 *
 * Useful for flushing the microtask queue without advancing time.
 *
 * @returns Promise that resolves on next tick
 */
export async function nextTick(): Promise<void> {
  await Promise.resolve();
}

/**
 * Create a deferred promise that can be resolved/rejected externally.
 *
 * Useful for testing code that waits for external events.
 *
 * @returns Object with promise and resolve/reject functions
 *
 * @example
 * ```typescript
 * const { promise, resolve } = createDeferred<string>();
 *
 * setTimeout(() => resolve('done'), 100);
 *
 * jest.advanceTimersByTime(100);
 * const result = await promise;
 * expect(result).toBe('done');
 * ```
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Test helper for retry logic with fake timers.
 *
 * Advances time through each retry delay and tracks attempts.
 *
 * @param retryDelays - Array of delays between retries (ms)
 * @param callback - Called after each time advancement
 * @returns Promise that resolves after all delays processed
 *
 * @example
 * ```typescript
 * jest.useFakeTimers();
 *
 * const attempts: number[] = [];
 * const fn = jest.fn().mockImplementation(() => {
 *   attempts.push(Date.now());
 *   throw new Error('fail');
 * });
 *
 * const retryPromise = retryWithBackoff(fn, [100, 200, 400]);
 *
 * await simulateRetryDelays([100, 200, 400], () => {
 *   // Called after each delay
 * });
 *
 * // Verify exponential backoff timing
 * expect(attempts[1] - attempts[0]).toBe(100);
 * expect(attempts[2] - attempts[1]).toBe(200);
 * ```
 */
export async function simulateRetryDelays(
  retryDelays: number[],
  callback?: (delayIndex: number, elapsed: number) => void
): Promise<void> {
  let elapsed = 0;

  for (let i = 0; i < retryDelays.length; i++) {
    const delay = retryDelays[i];
    await advanceAndFlush(delay);
    elapsed += delay;

    if (callback) {
      callback(i, elapsed);
    }
  }
}

/**
 * Assert that a timeout error is thrown after specified duration.
 *
 * @param promiseFn - Function that returns a promise with timeout
 * @param timeoutMs - Expected timeout duration
 * @param errorMatch - Optional error message/pattern to match
 *
 * @example
 * ```typescript
 * await assertTimeout(
 *   () => fetchWithTimeout('/api', 5000),
 *   5000,
 *   'Timeout'
 * );
 * ```
 */
export async function assertTimeout(
  promiseFn: () => Promise<unknown>,
  timeoutMs: number,
  errorMatch?: string | RegExp
): Promise<void> {
  jest.useFakeTimers();

  try {
    const promise = promiseFn();

    // Advance past timeout
    await advanceAndFlush(timeoutMs + 1);

    await expect(promise).rejects.toThrow(errorMatch);
  } finally {
    jest.useRealTimers();
  }
}

/**
 * Create a mock that simulates async operation with delay.
 *
 * @param delay - Delay before resolving (ms)
 * @param value - Value to resolve with
 * @returns Jest mock function
 *
 * @example
 * ```typescript
 * const mockFetch = createDelayedMock(100, { data: 'result' });
 *
 * jest.useFakeTimers();
 * const promise = mockFetch();
 *
 * jest.advanceTimersByTime(100);
 * const result = await promise;
 *
 * expect(result).toEqual({ data: 'result' });
 * ```
 */
export function createDelayedMock<T>(
  delay: number,
  value: T
): jest.Mock<() => Promise<T>> {
  return jest.fn().mockImplementation(
    () =>
      new Promise<T>((resolve) => {
        setTimeout(() => resolve(value), delay);
      })
  );
}

/**
 * Create a mock that fails N times then succeeds.
 *
 * Useful for testing retry logic.
 *
 * @param failCount - Number of times to fail
 * @param successValue - Value to return on success
 * @param errorMessage - Error message for failures
 * @returns Jest mock function
 *
 * @example
 * ```typescript
 * const mockApi = createRetryMock(2, 'success', 'Network error');
 *
 * await expect(mockApi()).rejects.toThrow('Network error');
 * await expect(mockApi()).rejects.toThrow('Network error');
 * await expect(mockApi()).resolves.toBe('success');
 * ```
 */
export function createRetryMock<T>(
  failCount: number,
  successValue: T,
  errorMessage = 'Mock failure'
): jest.Mock<() => Promise<T>> {
  let attempts = 0;

  return jest.fn().mockImplementation(() => {
    attempts++;
    if (attempts <= failCount) {
      return Promise.reject(new Error(errorMessage));
    }
    return Promise.resolve(successValue);
  });
}

/**
 * Wait for a condition to be true, with fake timer support.
 *
 * @param condition - Function that returns true when condition met
 * @param options - Configuration options
 * @returns Promise that resolves when condition met
 *
 * @example
 * ```typescript
 * jest.useFakeTimers();
 *
 * let ready = false;
 * setTimeout(() => { ready = true; }, 500);
 *
 * const waitPromise = waitForCondition(() => ready, {
 *   interval: 100,
 *   timeout: 1000,
 * });
 *
 * jest.advanceTimersByTime(600);
 * await waitPromise;
 * ```
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  options: {
    interval?: number;
    timeout?: number;
  } = {}
): Promise<void> {
  const { interval = 50, timeout = 5000 } = options;
  const startTime = Date.now();

  while (!(await condition())) {
    if (Date.now() - startTime > timeout) {
      throw new Error(`Condition not met within ${timeout}ms`);
    }
    await advanceAndFlush(interval);
  }
}
