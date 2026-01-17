/**
 * Error Utilities - Type-safe error handling
 *
 * Provides utilities for handling unknown errors in catch blocks
 * without using `any` type.
 *
 * @version 1.0.0
 * @module src/utils/ErrorUtils
 */

/**
 * Extracts error message from unknown error type
 * Use this in catch blocks to replace `catch (error: any)`
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (error: unknown) {
 *   const message = getErrorMessage(error);
 *   logger.error('Operation failed:', message);
 * }
 * ```
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/**
 * Extracts error stack trace from unknown error type
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}

/**
 * Type guard to check if error is an Error instance
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Wraps unknown error into Error instance
 * Preserves original Error instances, wraps others
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(getErrorMessage(error));
}

/**
 * Extracts error code from unknown error type
 * Common in Node.js errors (ENOENT, EACCES, etc.)
 */
export function getErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code: unknown }).code);
  }
  return undefined;
}
