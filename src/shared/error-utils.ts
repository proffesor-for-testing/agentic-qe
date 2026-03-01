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
