/**
 * Shared retry utilities for LLM providers.
 * IMP-03: Now delegates to the unified retry engine.
 * Preserves the original backoffDelay() signature for backwards compatibility.
 */

import { computeBackoff } from '../retry-engine.js';

/** Default base delay (1 second) */
const DEFAULT_BASE_MS = 1000;
/** Default maximum delay cap (30 seconds) */
const DEFAULT_MAX_MS = 30000;

/**
 * Compute exponential backoff delay: min(base * 2^attempt, max).
 * @deprecated Use `computeBackoff` from `../retry-engine` directly.
 */
export function backoffDelay(
  attempt: number,
  baseMs: number = DEFAULT_BASE_MS,
  maxMs: number = DEFAULT_MAX_MS,
): number {
  return computeBackoff(attempt, baseMs, maxMs, 0);
}

// IMP-03: Re-export unified retry engine for incremental migration
export { computeBackoff, withRetry, isRetryableError } from '../retry-engine.js';
export type { RetryOptions, RetryResult } from '../retry-engine.js';
