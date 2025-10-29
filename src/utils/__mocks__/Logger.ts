/**
 * Mock Logger for Testing
 *
 * This is a Jest manual mock that automatically replaces the real Logger
 * when jest.mock('@utils/Logger') is called in tests.
 */

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

export class Logger {
  private static mockInstance: Logger | null = null;

  static getInstance(): Logger {
    if (!Logger.mockInstance) {
      Logger.mockInstance = new Logger();
    }
    return Logger.mockInstance;
  }

  static resetInstance(): void {
    Logger.mockInstance = null;
  }

  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
  debug = jest.fn();
  log = jest.fn();
  setLevel = jest.fn();
  getLevel = jest.fn().mockReturnValue('info');
  child = jest.fn(function(this: any) {
    return this;
  });
}
