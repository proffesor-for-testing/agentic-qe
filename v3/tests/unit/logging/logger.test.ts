/**
 * Logger Interface Tests
 * Milestone 2.7: Structured Logging Facade
 */

import { describe, it, expect } from 'vitest';
import {
  LogLevel,
  LOG_LEVEL_NAMES,
  parseLogLevel,
  isLogger,
} from '../../../src/logging/logger.js';
import { ConsoleLogger, NullLogger } from '../../../src/logging/console-logger.js';

describe('LogLevel', () => {
  describe('enum values', () => {
    it('should have DEBUG as the lowest value (most verbose)', () => {
      expect(LogLevel.DEBUG).toBe(0);
    });

    it('should have INFO higher than DEBUG', () => {
      expect(LogLevel.INFO).toBeGreaterThan(LogLevel.DEBUG);
    });

    it('should have WARN higher than INFO', () => {
      expect(LogLevel.WARN).toBeGreaterThan(LogLevel.INFO);
    });

    it('should have ERROR higher than WARN', () => {
      expect(LogLevel.ERROR).toBeGreaterThan(LogLevel.WARN);
    });

    it('should have SILENT as the highest value (no output)', () => {
      expect(LogLevel.SILENT).toBeGreaterThan(LogLevel.ERROR);
    });

    it('should maintain ordering for level filtering', () => {
      const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.SILENT];
      for (let i = 0; i < levels.length - 1; i++) {
        expect(levels[i]).toBeLessThan(levels[i + 1]);
      }
    });
  });

  describe('LOG_LEVEL_NAMES', () => {
    it('should have a name for each level', () => {
      expect(LOG_LEVEL_NAMES[LogLevel.DEBUG]).toBe('DEBUG');
      expect(LOG_LEVEL_NAMES[LogLevel.INFO]).toBe('INFO');
      expect(LOG_LEVEL_NAMES[LogLevel.WARN]).toBe('WARN');
      expect(LOG_LEVEL_NAMES[LogLevel.ERROR]).toBe('ERROR');
      expect(LOG_LEVEL_NAMES[LogLevel.SILENT]).toBe('SILENT');
    });
  });
});

describe('parseLogLevel', () => {
  it('should parse DEBUG level', () => {
    expect(parseLogLevel('debug')).toBe(LogLevel.DEBUG);
    expect(parseLogLevel('DEBUG')).toBe(LogLevel.DEBUG);
    expect(parseLogLevel('Debug')).toBe(LogLevel.DEBUG);
  });

  it('should parse INFO level', () => {
    expect(parseLogLevel('info')).toBe(LogLevel.INFO);
    expect(parseLogLevel('INFO')).toBe(LogLevel.INFO);
  });

  it('should parse WARN level', () => {
    expect(parseLogLevel('warn')).toBe(LogLevel.WARN);
    expect(parseLogLevel('WARN')).toBe(LogLevel.WARN);
    expect(parseLogLevel('warning')).toBe(LogLevel.WARN);
    expect(parseLogLevel('WARNING')).toBe(LogLevel.WARN);
  });

  it('should parse ERROR level', () => {
    expect(parseLogLevel('error')).toBe(LogLevel.ERROR);
    expect(parseLogLevel('ERROR')).toBe(LogLevel.ERROR);
  });

  it('should parse SILENT level and aliases', () => {
    expect(parseLogLevel('silent')).toBe(LogLevel.SILENT);
    expect(parseLogLevel('SILENT')).toBe(LogLevel.SILENT);
    expect(parseLogLevel('none')).toBe(LogLevel.SILENT);
    expect(parseLogLevel('off')).toBe(LogLevel.SILENT);
  });

  it('should default to INFO for unknown values', () => {
    expect(parseLogLevel('unknown')).toBe(LogLevel.INFO);
    expect(parseLogLevel('')).toBe(LogLevel.INFO);
    expect(parseLogLevel('VERBOSE')).toBe(LogLevel.INFO);
  });
});

describe('isLogger', () => {
  it('should return true for ConsoleLogger', () => {
    const logger = new ConsoleLogger('test', LogLevel.INFO);
    expect(isLogger(logger)).toBe(true);
  });

  it('should return true for NullLogger', () => {
    const logger = new NullLogger();
    expect(isLogger(logger)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isLogger(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isLogger(undefined)).toBe(false);
  });

  it('should return false for plain objects', () => {
    expect(isLogger({})).toBe(false);
    expect(isLogger({ debug: () => {} })).toBe(false);
  });

  it('should return false for non-objects', () => {
    expect(isLogger('logger')).toBe(false);
    expect(isLogger(123)).toBe(false);
    expect(isLogger(true)).toBe(false);
  });

  it('should return true for objects with all Logger methods', () => {
    const customLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      isEnabled: () => true,
      getDomain: () => 'test',
      child: () => customLogger,
    };
    expect(isLogger(customLogger)).toBe(true);
  });
});
