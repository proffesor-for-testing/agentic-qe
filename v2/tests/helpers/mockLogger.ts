/**
 * Shared Logger Mock Helper
 *
 * Provides consistent Logger mocking across all test files
 * to avoid mock configuration issues.
 */

export interface MockLogger {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
  log: jest.Mock;
  setLevel: jest.Mock;
  getLevel: jest.Mock;
  child: jest.Mock;
}

// Create a single shared mock logger instance
let sharedMockLogger: MockLogger | null = null;

/**
 * Create a mock Logger instance
 */
export function createMockLogger(): MockLogger {
  if (!sharedMockLogger) {
    sharedMockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
      setLevel: jest.fn(),
      getLevel: jest.fn().mockReturnValue('info'),
      child: jest.fn(function(this: any) {
        return this;
      })
    };
  }
  return sharedMockLogger;
}

/**
 * Reset the shared mock logger (call in beforeEach)
 */
export function resetMockLogger(): void {
  if (sharedMockLogger) {
    jest.clearAllMocks();
  }
}

/**
 * Setup Logger mock globally for a test file
 *
 * Usage:
 * ```typescript
 * import { setupLoggerMock } from '../helpers/mockLogger';
 *
 * jest.mock('@utils/Logger', () => setupLoggerMock());
 * ```
 */
export function setupLoggerMock() {
  const mockLogger = createMockLogger();

  return {
    Logger: {
      getInstance: jest.fn(() => mockLogger)
    },
    LogLevel: {
      ERROR: 'error',
      WARN: 'warn',
      INFO: 'info',
      DEBUG: 'debug'
    }
  };
}

/**
 * Get mock Logger instance for assertions
 *
 * Usage in tests:
 * ```typescript
 * const mockLogger = getMockLogger();
 * expect(mockLogger.info).toHaveBeenCalledWith('Expected message');
 * ```
 */
export function getMockLogger(): MockLogger {
  const { Logger } = require('@utils/Logger');
  return Logger.getInstance();
}
