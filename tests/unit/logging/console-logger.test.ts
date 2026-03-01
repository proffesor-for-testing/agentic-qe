/**
 * ConsoleLogger Tests
 * Milestone 2.7: Structured Logging Facade
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ConsoleLogger,
  NullLogger,
  DEFAULT_CONSOLE_LOGGER_CONFIG,
} from '../../../src/logging/console-logger.js';
import { LogLevel } from '../../../src/logging/logger.js';

describe('ConsoleLogger', () => {
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('level filtering', () => {
    it('should log all levels when set to DEBUG', () => {
      const logger = new ConsoleLogger('test', LogLevel.DEBUG);

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should filter DEBUG when level is INFO', () => {
      const logger = new ConsoleLogger('test', LogLevel.INFO);

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should filter DEBUG and INFO when level is WARN', () => {
      const logger = new ConsoleLogger('test', LogLevel.WARN);

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should only log ERROR when level is ERROR', () => {
      const logger = new ConsoleLogger('test', LogLevel.ERROR);

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should log nothing when level is SILENT', () => {
      const logger = new ConsoleLogger('test', LogLevel.SILENT);

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('isEnabled', () => {
    it('should return true for enabled levels', () => {
      const logger = new ConsoleLogger('test', LogLevel.INFO);

      expect(logger.isEnabled(LogLevel.INFO)).toBe(true);
      expect(logger.isEnabled(LogLevel.WARN)).toBe(true);
      expect(logger.isEnabled(LogLevel.ERROR)).toBe(true);
    });

    it('should return false for disabled levels', () => {
      const logger = new ConsoleLogger('test', LogLevel.INFO);

      expect(logger.isEnabled(LogLevel.DEBUG)).toBe(false);
    });

    it('should return false for all levels when SILENT', () => {
      const logger = new ConsoleLogger('test', LogLevel.SILENT);

      expect(logger.isEnabled(LogLevel.DEBUG)).toBe(false);
      expect(logger.isEnabled(LogLevel.INFO)).toBe(false);
      expect(logger.isEnabled(LogLevel.WARN)).toBe(false);
      expect(logger.isEnabled(LogLevel.ERROR)).toBe(false);
    });
  });

  describe('domain prefix', () => {
    it('should include domain in log output', () => {
      const logger = new ConsoleLogger('queen-coordinator', LogLevel.INFO, {
        includeTimestamp: false,
        includeLevel: false,
      });

      logger.info('test message');

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[queen-coordinator]')
      );
    });

    it('should return domain from getDomain', () => {
      const logger = new ConsoleLogger('my-domain', LogLevel.INFO);
      expect(logger.getDomain()).toBe('my-domain');
    });
  });

  describe('context formatting', () => {
    it('should include context in log output', () => {
      const logger = new ConsoleLogger('test', LogLevel.INFO, {
        includeTimestamp: false,
        includeLevel: false,
      });

      logger.info('task submitted', { taskId: 'task-123', priority: 'high' });

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('"taskId":"task-123"')
      );
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('"priority":"high"')
      );
    });

    it('should not include context when not provided', () => {
      const logger = new ConsoleLogger('test', LogLevel.INFO, {
        includeTimestamp: false,
        includeLevel: false,
      });

      logger.info('simple message');

      const output = consoleInfoSpy.mock.calls[0][0];
      expect(output).toBe('[test] simple message');
    });

    it('should handle complex context objects', () => {
      const logger = new ConsoleLogger('test', LogLevel.DEBUG, {
        includeTimestamp: false,
        includeLevel: false,
      });

      logger.debug('complex', {
        nested: { deep: { value: 42 } },
        array: [1, 2, 3],
        null: null,
      });

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('"nested"')
      );
    });
  });

  describe('error handling', () => {
    it('should include error details in output', () => {
      const logger = new ConsoleLogger('test', LogLevel.ERROR, {
        includeTimestamp: false,
        includeLevel: false,
      });

      const error = new Error('Something went wrong');
      logger.error('task failed', error, { taskId: 'task-123' });

      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain('[test]');
      expect(output).toContain('task failed');
      expect(output).toContain('"errorName":"Error"');
      expect(output).toContain('"errorMessage":"Something went wrong"');
      expect(output).toContain('"taskId":"task-123"');
    });

    it('should include stack trace in error output', () => {
      const logger = new ConsoleLogger('test', LogLevel.ERROR, {
        includeTimestamp: false,
        includeLevel: false,
      });

      const error = new Error('Stack trace test');
      logger.error('error with stack', error);

      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain('"stack"');
    });

    it('should handle error without Error object', () => {
      const logger = new ConsoleLogger('test', LogLevel.ERROR, {
        includeTimestamp: false,
        includeLevel: false,
      });

      logger.error('error without object');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain('error without object');
    });
  });

  describe('timestamp formatting', () => {
    it('should include timestamp when configured', () => {
      const logger = new ConsoleLogger('test', LogLevel.INFO, {
        includeTimestamp: true,
        includeLevel: false,
        timestampFormat: 'short',
      });

      logger.info('message');

      const output = consoleInfoSpy.mock.calls[0][0];
      // Short format: [HH:MM:SS.mmm]
      expect(output).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/);
    });

    it('should use ISO format when configured', () => {
      const logger = new ConsoleLogger('test', LogLevel.INFO, {
        includeTimestamp: true,
        includeLevel: false,
        timestampFormat: 'iso',
      });

      logger.info('message');

      const output = consoleInfoSpy.mock.calls[0][0];
      // ISO format: [2024-01-01T00:00:00.000Z]
      expect(output).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
    });

    it('should exclude timestamp when disabled', () => {
      const logger = new ConsoleLogger('test', LogLevel.INFO, {
        includeTimestamp: false,
        includeLevel: false,
      });

      logger.info('message');

      const output = consoleInfoSpy.mock.calls[0][0];
      expect(output).toBe('[test] message');
    });
  });

  describe('level formatting', () => {
    it('should include level name when configured', () => {
      const logger = new ConsoleLogger('test', LogLevel.DEBUG, {
        includeTimestamp: false,
        includeLevel: true,
      });

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(consoleDebugSpy.mock.calls[0][0]).toContain('[DEBUG]');
      expect(consoleInfoSpy.mock.calls[0][0]).toContain('[INFO ]');
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('[WARN ]');
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('[ERROR]');
    });
  });

  describe('child logger', () => {
    it('should create child with inherited context', () => {
      const logger = new ConsoleLogger('test', LogLevel.INFO, {
        includeTimestamp: false,
        includeLevel: false,
      });

      const child = logger.child({ requestId: 'req-123' });
      child.info('child message');

      const output = consoleInfoSpy.mock.calls[0][0];
      expect(output).toContain('"requestId":"req-123"');
    });

    it('should merge child context with message context', () => {
      const logger = new ConsoleLogger('test', LogLevel.INFO, {
        includeTimestamp: false,
        includeLevel: false,
      });

      const child = logger.child({ requestId: 'req-123' });
      child.info('message', { taskId: 'task-456' });

      const output = consoleInfoSpy.mock.calls[0][0];
      expect(output).toContain('"requestId":"req-123"');
      expect(output).toContain('"taskId":"task-456"');
    });

    it('should override inherited context with message context', () => {
      const logger = new ConsoleLogger('test', LogLevel.INFO, {
        includeTimestamp: false,
        includeLevel: false,
      });

      const child = logger.child({ value: 'inherited' });
      child.info('message', { value: 'overridden' });

      const output = consoleInfoSpy.mock.calls[0][0];
      expect(output).toContain('"value":"overridden"');
      expect(output).not.toContain('"value":"inherited"');
    });

    it('should inherit domain from parent', () => {
      const logger = new ConsoleLogger('parent-domain', LogLevel.INFO);
      const child = logger.child({});

      expect(child.getDomain()).toBe('parent-domain');
    });
  });

  describe('default configuration', () => {
    it('should use INFO level by default', () => {
      const logger = new ConsoleLogger('test');

      expect(logger.isEnabled(LogLevel.DEBUG)).toBe(false);
      expect(logger.isEnabled(LogLevel.INFO)).toBe(true);
    });

    it('should have sensible default config', () => {
      expect(DEFAULT_CONSOLE_LOGGER_CONFIG.includeTimestamp).toBe(true);
      expect(DEFAULT_CONSOLE_LOGGER_CONFIG.includeLevel).toBe(true);
      expect(DEFAULT_CONSOLE_LOGGER_CONFIG.timestampFormat).toBe('short');
      expect(DEFAULT_CONSOLE_LOGGER_CONFIG.prettyPrint).toBe(false);
    });
  });
});

describe('NullLogger', () => {
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should not output anything', () => {
    const logger = new NullLogger();

    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');
    logger.error('error', new Error('test'));

    expect(consoleInfoSpy).not.toHaveBeenCalled();
  });

  it('should return false for all isEnabled checks', () => {
    const logger = new NullLogger();

    expect(logger.isEnabled(LogLevel.DEBUG)).toBe(false);
    expect(logger.isEnabled(LogLevel.INFO)).toBe(false);
    expect(logger.isEnabled(LogLevel.WARN)).toBe(false);
    expect(logger.isEnabled(LogLevel.ERROR)).toBe(false);
  });

  it('should return domain from getDomain', () => {
    const logger = new NullLogger('my-domain');
    expect(logger.getDomain()).toBe('my-domain');
  });

  it('should return itself from child', () => {
    const logger = new NullLogger();
    const child = logger.child({ context: 'value' });

    expect(child).toBe(logger);
  });

  it('should use default domain when not specified', () => {
    const logger = new NullLogger();
    expect(logger.getDomain()).toBe('null');
  });
});
