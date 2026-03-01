/**
 * LoggerFactory Tests
 * Milestone 2.7: Structured Logging Facade
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LoggerFactory,
  createLogger,
  getLogger,
} from '../../../src/logging/logger-factory.js';
import { LogLevel, Logger } from '../../../src/logging/logger.js';
import { ConsoleLogger, NullLogger } from '../../../src/logging/console-logger.js';

describe('LoggerFactory', () => {
  beforeEach(() => {
    LoggerFactory.reset();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    LoggerFactory.reset();
    vi.restoreAllMocks();
  });

  describe('create', () => {
    it('should create a ConsoleLogger', () => {
      const logger = LoggerFactory.create('test-domain');

      expect(logger).toBeInstanceOf(ConsoleLogger);
      expect(logger.getDomain()).toBe('test-domain');
    });

    it('should use default INFO level', () => {
      const logger = LoggerFactory.create('test');

      expect(logger.isEnabled(LogLevel.DEBUG)).toBe(false);
      expect(logger.isEnabled(LogLevel.INFO)).toBe(true);
    });

    it('should cache loggers for the same domain', () => {
      const logger1 = LoggerFactory.create('cached');
      const logger2 = LoggerFactory.create('cached');

      expect(logger1).toBe(logger2);
    });

    it('should not cache loggers with custom context', () => {
      const logger1 = LoggerFactory.create('not-cached', { key: 'value' });
      const logger2 = LoggerFactory.create('not-cached', { key: 'value' });

      expect(logger1).not.toBe(logger2);
    });
  });

  describe('setLevel', () => {
    it('should change the global log level', () => {
      LoggerFactory.setLevel(LogLevel.DEBUG);

      const logger = LoggerFactory.create('test');
      expect(logger.isEnabled(LogLevel.DEBUG)).toBe(true);
    });

    it('should clear cached instances on level change', () => {
      const logger1 = LoggerFactory.create('test');
      LoggerFactory.setLevel(LogLevel.DEBUG);
      const logger2 = LoggerFactory.create('test');

      expect(logger1).not.toBe(logger2);
    });

    it('should return current level from getLevel', () => {
      LoggerFactory.setLevel(LogLevel.WARN);
      expect(LoggerFactory.getLevel()).toBe(LogLevel.WARN);
    });
  });

  describe('setLevelFromString', () => {
    it('should parse DEBUG level', () => {
      LoggerFactory.setLevelFromString('DEBUG');
      expect(LoggerFactory.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('should parse WARN level case-insensitively', () => {
      LoggerFactory.setLevelFromString('warn');
      expect(LoggerFactory.getLevel()).toBe(LogLevel.WARN);
    });

    it('should default to INFO for unknown values', () => {
      LoggerFactory.setLevel(LogLevel.ERROR); // Set to something else first
      LoggerFactory.setLevelFromString('invalid');
      expect(LoggerFactory.getLevel()).toBe(LogLevel.INFO);
    });
  });

  describe('domain-specific levels', () => {
    it('should override level for specific domain', () => {
      LoggerFactory.setLevel(LogLevel.INFO);
      LoggerFactory.setDomainLevel('verbose-domain', LogLevel.DEBUG);

      const normalLogger = LoggerFactory.create('normal-domain');
      const verboseLogger = LoggerFactory.create('verbose-domain');

      expect(normalLogger.isEnabled(LogLevel.DEBUG)).toBe(false);
      expect(verboseLogger.isEnabled(LogLevel.DEBUG)).toBe(true);
    });

    it('should return domain level from getDomainLevel', () => {
      LoggerFactory.setDomainLevel('custom', LogLevel.ERROR);
      expect(LoggerFactory.getDomainLevel('custom')).toBe(LogLevel.ERROR);
    });

    it('should fall back to default for domains without override', () => {
      LoggerFactory.setLevel(LogLevel.WARN);
      expect(LoggerFactory.getDomainLevel('no-override')).toBe(LogLevel.WARN);
    });

    it('should clear domain level with clearDomainLevel', () => {
      LoggerFactory.setLevel(LogLevel.INFO);
      LoggerFactory.setDomainLevel('test', LogLevel.DEBUG);
      LoggerFactory.clearDomainLevel('test');

      expect(LoggerFactory.getDomainLevel('test')).toBe(LogLevel.INFO);
    });
  });

  describe('configure', () => {
    it('should update console logger configuration', () => {
      LoggerFactory.configure({ includeTimestamp: false, includeLevel: false });

      const logger = LoggerFactory.create('test');
      logger.info('message');

      expect(console.info).toHaveBeenCalledWith('[test] message');
    });

    it('should clear cached instances on configure', () => {
      const logger1 = LoggerFactory.create('test');
      LoggerFactory.configure({ prettyPrint: true });
      const logger2 = LoggerFactory.create('test');

      expect(logger1).not.toBe(logger2);
    });
  });

  describe('silent mode', () => {
    it('should create NullLogger when silent', () => {
      LoggerFactory.setSilent(true);
      const logger = LoggerFactory.create('test');

      expect(logger).toBeInstanceOf(NullLogger);
    });

    it('should return silent status from isSilent', () => {
      expect(LoggerFactory.isSilent()).toBe(false);
      LoggerFactory.setSilent(true);
      expect(LoggerFactory.isSilent()).toBe(true);
    });

    it('should clear cached instances on silent toggle', () => {
      const logger1 = LoggerFactory.create('test');
      LoggerFactory.setSilent(true);
      const logger2 = LoggerFactory.create('test');

      expect(logger1).not.toBe(logger2);
    });
  });

  describe('custom provider', () => {
    it('should use custom provider when set', () => {
      const customLogger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        isEnabled: () => true,
        getDomain: () => 'custom',
        child: () => customLogger,
      };

      LoggerFactory.setProvider(() => customLogger);
      const logger = LoggerFactory.create('test');

      expect(logger).toBe(customLogger);
    });

    it('should clear provider with null', () => {
      const customLogger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        isEnabled: () => true,
        getDomain: () => 'custom',
        child: () => customLogger,
      };

      LoggerFactory.setProvider(() => customLogger);
      LoggerFactory.setProvider(null);

      const logger = LoggerFactory.create('test');
      expect(logger).toBeInstanceOf(ConsoleLogger);
    });

    it('should pass domain and level to provider', () => {
      const provider = vi.fn().mockReturnValue(new NullLogger());
      LoggerFactory.setLevel(LogLevel.WARN);
      LoggerFactory.setProvider(provider);

      LoggerFactory.create('my-domain');

      expect(provider).toHaveBeenCalledWith('my-domain', LogLevel.WARN, undefined);
    });
  });

  describe('getLogger', () => {
    it('should be an alias for create', () => {
      const logger1 = LoggerFactory.create('test');
      // Clear cache to get fresh instance
      LoggerFactory.reset();
      const logger2 = LoggerFactory.getLogger('test');

      expect(logger1.getDomain()).toBe(logger2.getDomain());
    });
  });

  describe('reset', () => {
    it('should restore default configuration', () => {
      LoggerFactory.setLevel(LogLevel.DEBUG);
      LoggerFactory.setDomainLevel('test', LogLevel.ERROR);
      LoggerFactory.setSilent(true);

      LoggerFactory.reset();

      expect(LoggerFactory.getLevel()).toBe(LogLevel.INFO);
      expect(LoggerFactory.isSilent()).toBe(false);
    });

    it('should clear cached instances', () => {
      const logger1 = LoggerFactory.create('test');
      LoggerFactory.reset();
      const logger2 = LoggerFactory.create('test');

      expect(logger1).not.toBe(logger2);
    });
  });

  describe('initFromEnv', () => {
    it('should set level from LOG_LEVEL env var', () => {
      process.env.LOG_LEVEL = 'DEBUG';
      LoggerFactory.initFromEnv();

      expect(LoggerFactory.getLevel()).toBe(LogLevel.DEBUG);

      delete process.env.LOG_LEVEL;
    });

    it('should handle missing env vars gracefully', () => {
      delete process.env.LOG_LEVEL;
      delete process.env.LOG_TIMESTAMP;
      delete process.env.LOG_PRETTY;

      // Should not throw
      expect(() => LoggerFactory.initFromEnv()).not.toThrow();
    });
  });

  describe('getStats', () => {
    it('should return factory statistics', () => {
      LoggerFactory.create('domain1');
      LoggerFactory.create('domain2');
      LoggerFactory.setDomainLevel('override', LogLevel.DEBUG);

      const stats = LoggerFactory.getStats();

      expect(stats.cachedLoggers).toBe(2);
      expect(stats.domains).toContain('domain1');
      expect(stats.domains).toContain('domain2');
      expect(stats.domainOverrides).toBe(1);
      expect(stats.currentLevel).toBe(LogLevel.INFO);
      expect(stats.silent).toBe(false);
    });
  });
});

describe('createLogger', () => {
  beforeEach(() => {
    LoggerFactory.reset();
  });

  afterEach(() => {
    LoggerFactory.reset();
  });

  it('should be a shorthand for LoggerFactory.create', () => {
    const logger = createLogger('test-domain');

    expect(logger.getDomain()).toBe('test-domain');
    expect(logger).toBeInstanceOf(ConsoleLogger);
  });

  it('should accept context parameter', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    LoggerFactory.configure({ includeTimestamp: false, includeLevel: false });

    const logger = createLogger('test', { requestId: 'req-123' });
    logger.info('message');

    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining('"requestId":"req-123"')
    );
  });
});

describe('getLogger', () => {
  beforeEach(() => {
    LoggerFactory.reset();
  });

  afterEach(() => {
    LoggerFactory.reset();
  });

  it('should accept string domain', () => {
    const logger = getLogger('string-domain');
    expect(logger.getDomain()).toBe('string-domain');
  });

  it('should extract name from class', () => {
    class MyService {}

    const logger = getLogger(MyService);
    expect(logger.getDomain()).toBe('MyService');
  });

  it('should work with object having name property', () => {
    const logger = getLogger({ name: 'ObjectName' });
    expect(logger.getDomain()).toBe('ObjectName');
  });
});
