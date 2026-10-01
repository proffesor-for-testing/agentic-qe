/**
 * Shared error coercion utilities.
 *
 * These replace the duplicated inline patterns found across 700+ files:
 *   - Pattern A: `error instanceof Error ? error.message : String(error)`
 *   - Pattern B: `error instanceof Error ? error : new Error(String(error))`
 */

/**
 * Extract error message from unknown error value.
 */
export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Coerce unknown error value to an Error instance.
 */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * A request was rejected because the caller's input is invalid (a malformed
 * argument, an unknown function name, an unsupported option combination).
 *
 * The failure is deterministic and says nothing about the health of the
 * component that rejected it, so it must not be retried and must not count
 * toward a domain circuit breaker (ADR-064). The marker survives being
 * flattened to a message string via `callerError` on TaskFailed events.
 */
export class CallerInputError extends Error {
  readonly callerError = true as const;

  constructor(message: string) {
    super(message);
    this.name = 'CallerInputError';
  }
}

/** True when `error` is (or is marked as) a caller-input error. */
export function isCallerInputError(error: unknown): boolean {
  return error instanceof CallerInputError
    || (typeof error === 'object' && error !== null && (error as { callerError?: unknown }).callerError === true);
}
