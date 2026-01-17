/**
 * Process Exit Utility
 *
 * Wraps process.exit() for testability. In tests, this can be mocked
 * to prevent the test process from exiting.
 */

export class ProcessExit {
  /**
   * Exit the process with the given exit code
   * @param code Exit code (default: 1)
   */
  static exit(code: number = 1): never {
    // In tests, this will be mocked to throw an error instead
    // This allows tests to catch the exit attempt
    process.exit(code);

    // TypeScript requires 'never' return type to satisfy control flow
    throw new Error('Process should have exited');
  }

  /**
   * Check if we're running in a test environment
   */
  static isTest(): boolean {
    return process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
  }

  /**
   * Exit only if not in test environment
   * In tests, this throws an error that can be caught
   */
  static exitIfNotTest(code: number = 1): void {
    if (this.isTest()) {
      throw new Error(`Process exit requested with code ${code}`);
    }
    this.exit(code);
  }
}
