/**
 * Shared retry utilities for LLM providers.
 * Extracts the common exponential backoff pattern used across all providers.
 */

/** Default base delay (1 second) */
const DEFAULT_BASE_MS = 1000;
/** Default maximum delay cap (30 seconds) */
const DEFAULT_MAX_MS = 30000;

/**
 * Compute exponential backoff delay: min(base * 2^attempt, max).
 * Used by all LLM provider retry loops.
 */
export function backoffDelay(
  attempt: number,
  baseMs: number = DEFAULT_BASE_MS,
  maxMs: number = DEFAULT_MAX_MS,
): number {
  return Math.min(baseMs * Math.pow(2, attempt), maxMs);
}
