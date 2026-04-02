/**
 * Agentic QE v3 - Unified Retry Engine
 * IMP-03: Retry Engine with Exponential Backoff
 *
 * Provides a single, well-tested retry loop with exponential backoff,
 * jitter, abort signal support, and retryable-error classification.
 *
 * The circuit breaker (circuit-breaker.ts) is a separate concern that
 * receives success/failure signals from callers — this engine does NOT
 * import or depend on it. Integration is planned for a later phase.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 5 */
  maxAttempts: number;
  /** Base delay in milliseconds before the first retry. Default: 1000 */
  baseDelayMs: number;
  /** Upper cap for the computed delay. Default: 32000 */
  maxDelayMs: number;
  /** Fraction of the exponential value added as random jitter (0–1). Default: 0.25 */
  jitterFraction: number;
  /** Optional predicate to override the built-in retryable-error check. */
  retryableErrors?: (error: unknown) => boolean;
  /** Called before each retry sleep — useful for logging / metrics. */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
  /** If the signal fires, the retry loop is cancelled immediately. */
  abortSignal?: AbortSignal;
}

export interface RetryResult<T> {
  /** The successful return value. */
  result: T;
  /** Total number of attempts made (1 = succeeded on first try). */
  attempts: number;
  /** Sum of all actual delays waited (ms). */
  totalDelayMs: number;
  /** Record of each retried error (does NOT include the successful attempt). */
  retriedErrors: Array<{ attempt: number; error: string; delayMs: number }>;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 32_000,
  jitterFraction: 0.25,
};

// ---------------------------------------------------------------------------
// Backoff computation
// ---------------------------------------------------------------------------

/**
 * Compute the delay for a given attempt using exponential backoff + jitter.
 *
 * Formula: `min(baseMs * 2^attempt, maxMs) + random(0, jitterFraction * exponential)`
 *
 * The jitter component is based on the *capped* exponential value so it
 * stays proportional regardless of the cap.
 */
export function computeBackoff(
  attempt: number,
  baseMs: number,
  maxMs: number,
  jitterFraction: number,
): number {
  const exponential = Math.min(baseMs * Math.pow(2, attempt), maxMs);
  const jitter = Math.random() * jitterFraction * exponential;
  return exponential + jitter;
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/** Errno codes that indicate a transient network / OS-level problem. */
const RETRYABLE_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
]);

/** HTTP status codes that are safe to retry. */
const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 503, 529]);

/** HTTP status codes that should NOT be retried (client errors). */
const NON_RETRYABLE_HTTP_STATUSES = new Set([400, 401, 403, 404, 422]);

/**
 * Determine whether an error is transient and therefore worth retrying.
 *
 * Checks — in order:
 * 1. Error `code` property against known errno strings.
 * 2. `status` / `statusCode` property against HTTP status sets.
 * 3. Error message substrings for common transient phrases.
 *
 * Returns `false` for recognised non-retryable client errors (4xx).
 */
export function isRetryableError(error: unknown): boolean {
  if (error == null) return false;

  // --- code property (errno) -------------------------------------------
  const code = (error as Record<string, unknown>).code;
  if (typeof code === 'string' && RETRYABLE_CODES.has(code)) {
    return true;
  }

  // --- HTTP status -----------------------------------------------------
  const status =
    (error as Record<string, unknown>).status ??
    (error as Record<string, unknown>).statusCode;

  if (typeof status === 'number') {
    if (NON_RETRYABLE_HTTP_STATUSES.has(status)) return false;
    if (RETRYABLE_HTTP_STATUSES.has(status)) return true;
  }

  // --- message-based heuristic -----------------------------------------
  const message =
    error instanceof Error
      ? error.message
      : typeof (error as Record<string, unknown>).message === 'string'
        ? ((error as Record<string, unknown>).message as string)
        : '';

  if (message) {
    const lower = message.toLowerCase();
    if (
      lower.includes('econnreset') ||
      lower.includes('econnrefused') ||
      lower.includes('etimedout') ||
      lower.includes('epipe') ||
      lower.includes('rate limit') ||
      lower.includes('too many requests') ||
      lower.includes('service unavailable') ||
      lower.includes('internal server error')
    ) {
      return true;
    }
  }

  // Default: treat unknown errors as retryable to avoid silent failures.
  return true;
}

// ---------------------------------------------------------------------------
// Delay helper
// ---------------------------------------------------------------------------

/**
 * Sleep for `ms` milliseconds, but reject immediately if `signal` fires.
 */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }

    const timer = setTimeout(() => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      reject(signal!.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
    }

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

// ---------------------------------------------------------------------------
// Core retry loop
// ---------------------------------------------------------------------------

/**
 * Execute `fn` with automatic retries on transient errors.
 *
 * On each failure the engine:
 * 1. Checks whether the error is retryable (via `options.retryableErrors`
 *    or the built-in `isRetryableError`).
 * 2. If not retryable, throws immediately.
 * 3. If retryable and attempts remain, computes an exponential-backoff
 *    delay with jitter, calls `onRetry`, then sleeps.
 * 4. If all attempts are exhausted, throws the last error.
 *
 * Supports `AbortSignal` — if the signal fires during a delay the
 * promise rejects with an `AbortError`.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>,
): Promise<RetryResult<T>> {
  // Kill switch: bypass retry entirely when disabled
  if (process.env.AQE_RETRY_DISABLED === 'true') {
    const result = await fn();
    return { result, attempts: 1, totalDelayMs: 0, retriedErrors: [] };
  }

  const opts: RetryOptions = { ...DEFAULT_OPTIONS, ...options };
  const isRetryable = opts.retryableErrors ?? isRetryableError;

  const retriedErrors: RetryResult<T>['retriedErrors'] = [];
  let totalDelayMs = 0;
  let lastError: unknown;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    // Check abort before each attempt.
    if (opts.abortSignal?.aborted) {
      throw opts.abortSignal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
    }

    try {
      const result = await fn();
      return {
        result,
        attempts: attempt + 1,
        totalDelayMs,
        retriedErrors,
      };
    } catch (error: unknown) {
      lastError = error;

      // Last attempt — don't bother checking retryability, just throw.
      if (attempt === opts.maxAttempts - 1) {
        break;
      }

      // Non-retryable errors bubble immediately.
      if (!isRetryable(error)) {
        throw error;
      }

      const backoff = computeBackoff(
        attempt,
        opts.baseDelayMs,
        opts.maxDelayMs,
        opts.jitterFraction,
      );

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      retriedErrors.push({
        attempt: attempt + 1,
        error: errorMessage,
        delayMs: backoff,
      });

      opts.onRetry?.(attempt + 1, error, backoff);

      totalDelayMs += backoff;
      await delay(backoff, opts.abortSignal);
    }
  }

  // All attempts exhausted — throw last error.
  throw lastError;
}
