/**
 * BrowserResultAdapter - Adapts browser operation results to AQE v3 Result type
 *
 * This adapter converts browser client responses (from agent-browser or Vibium)
 * into the standard Result<T, E> type used throughout AQE v3. It provides:
 * - Success/error wrapping for type safety
 * - Async operation handling
 * - Browser-specific error conversion
 * - Consistent error messages
 */

import type { Result } from '../shared/types/index.js';
import type { BrowserError } from '../integrations/browser/types.js';

// ============================================================================
// BrowserResultAdapter
// ============================================================================

/**
 * Adapter for converting browser operations to Result types
 */
export class BrowserResultAdapter {
  /**
   * Wrap a successful value in an ok Result
   * @param value The successful value
   * @returns Result with success=true
   */
  static wrapSuccess<T>(value: T): Result<T, BrowserError> {
    return { success: true, value };
  }

  /**
   * Wrap an error in an err Result
   * @param error The error (Error, BrowserError, string, or unknown)
   * @returns Result with success=false
   */
  static wrapError<T>(error: Error | BrowserError | string | unknown): Result<T, BrowserError> {
    if (error instanceof Error) {
      // If it's a BrowserError, use it directly
      if ('tool' in error && 'code' in error) {
        return { success: false, error: error as BrowserError };
      }
      // Convert generic Error to BrowserError
      const browserError: BrowserError = {
        name: 'BrowserError',
        message: error.message,
        code: 'UNKNOWN_ERROR',
        tool: 'agent-browser', // Default tool
        cause: error,
      } as BrowserError;
      return { success: false, error: browserError };
    }

    if (typeof error === 'string') {
      // Convert string error to BrowserError
      const browserError: BrowserError = {
        name: 'BrowserError',
        message: error,
        code: 'STRING_ERROR',
        tool: 'agent-browser',
      } as BrowserError;
      return { success: false, error: browserError };
    }

    // Handle unknown error types
    const browserError: BrowserError = {
      name: 'BrowserError',
      message: String(error),
      code: 'UNKNOWN_ERROR_TYPE',
      tool: 'agent-browser',
    } as BrowserError;
    return { success: false, error: browserError };
  }

  /**
   * Wrap an async operation and convert to Result
   * @param promise Promise to wrap
   * @returns Result with the promise's resolved value or rejection error
   */
  static async wrapAsync<T>(promise: Promise<T>): Promise<Result<T, BrowserError>> {
    try {
      const value = await promise;
      return this.wrapSuccess(value);
    } catch (error) {
      return this.wrapError<T>(error);
    }
  }

  /**
   * Convert a browser client response (which is already a Result) to ensure type safety
   * @param response Browser client Result
   * @returns Typed Result
   */
  static fromBrowserResponse<T>(
    response: Result<T, BrowserError>
  ): Result<T, BrowserError> {
    if (response.success) {
      return this.wrapSuccess(response.value);
    }
    // At this point, TypeScript knows response is a failure case
    // Explicitly cast to access the error property
    const failureResponse = response as { success: false; error: BrowserError };
    return { success: false, error: failureResponse.error };
  }
}

/**
 * Factory function to create a BrowserResultAdapter instance
 * (Currently stateless, but allows for future stateful adapters)
 */
export function createBrowserResultAdapter(): typeof BrowserResultAdapter {
  return BrowserResultAdapter;
}
