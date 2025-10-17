import { Logger } from '../../../src/utils/Logger';
import * as fs from 'fs-extra';
import * as path from 'path';

describe('Logger Comprehensive Tests', () => {
  let logger: Logger;
  const logDir = path.join(process.cwd(), '.swarm/test-logs');

  beforeEach(async () => {
    await fs.ensureDir(logDir);
    logger = new Logger({ name: 'test-logger', logDir });
  });

  afterEach(async () => {
    await fs.remove(logDir);
  });

  describe('Log Levels', () => {
    it('should log debug messages', () => {
      const result = logger.debug('Debug message', { context: 'test' });
      expect(result).toBeDefined();
    });

    it('should log info messages', () => {
      const result = logger.info('Info message');
      expect(result).toBeDefined();
    });

    it('should log warn messages', () => {
      const result = logger.warn('Warning message');
      expect(result).toBeDefined();
    });

    it('should log error messages', () => {
      const result = logger.error('Error message', new Error('Test error'));
      expect(result).toBeDefined();
    });

    it('should log fatal messages', () => {
      const result = logger.fatal('Fatal error');
      expect(result).toBeDefined();
    });

    it('should respect log level filtering', () => {
      const restrictedLogger = new Logger({ name: 'restricted', level: 'warn' });
      const debugResult = restrictedLogger.debug('Should not appear');
      const warnResult = restrictedLogger.warn('Should appear');
      expect(debugResult).toBeUndefined();
      expect(warnResult).toBeDefined();
    });
  });

  describe('Log Formatting', () => {
    it('should format messages with timestamp', () => {
      const formatted = logger.format('Test message', 'info');
      expect(formatted).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('should include log level in output', () => {
      const formatted = logger.format('Test', 'error');
      expect(formatted).toContain('ERROR');
    });

    it('should include logger name', () => {
      const formatted = logger.format('Test', 'info');
      expect(formatted).toContain('test-logger');
    });

    it('should handle structured data', () => {
      const data = { userId: 123, action: 'login' };
      const formatted = logger.formatStructured('User action', data);
      expect(formatted).toContain('userId');
      expect(formatted).toContain('123');
    });

    it('should format stack traces', () => {
      const error = new Error('Test error');
      const formatted = logger.formatError(error);
      expect(formatted).toContain('Error: Test error');
      expect(formatted).toContain('at ');
    });
  });

  describe('Log Output', () => {
    it('should write to file', async () => {
      logger.info('File test');
      await logger.flush();
      const files = await fs.readdir(logDir);
      expect(files.length).toBeGreaterThan(0);
    });

    it('should write to console', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const consoleLogger = new Logger({ name: 'console', console: true });
      consoleLogger.info('Console test');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should support multiple outputs', async () => {
      const multiLogger = new Logger({
        name: 'multi',
        logDir,
        console: true
      });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      multiLogger.info('Multi output test');
      await multiLogger.flush();
      const files = await fs.readdir(logDir);
      expect(files.length).toBeGreaterThan(0);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Log Rotation', () => {
    it('should rotate logs by size', async () => {
      const rotatingLogger = new Logger({
        name: 'rotating',
        logDir,
        maxSize: 1024
      });
      const largeMessage = 'x'.repeat(500);
      for (let i = 0; i < 5; i++) {
        rotatingLogger.info(largeMessage);
      }
      await rotatingLogger.flush();
      const files = await fs.readdir(logDir);
      expect(files.length).toBeGreaterThan(1);
    });

    it('should rotate logs by time', async () => {
      const timedLogger = new Logger({
        name: 'timed',
        logDir,
        rotateDaily: true
      });
      timedLogger.info('Day 1');
      await timedLogger.forceRotate();
      timedLogger.info('Day 2');
      await timedLogger.flush();
      const files = await fs.readdir(logDir);
      expect(files.length).toBeGreaterThan(1);
    });

    it('should clean old logs', async () => {
      const cleaningLogger = new Logger({
        name: 'cleaning',
        logDir,
        maxFiles: 2
      });
      cleaningLogger.info('Log 1');
      await cleaningLogger.forceRotate();
      cleaningLogger.info('Log 2');
      await cleaningLogger.forceRotate();
      cleaningLogger.info('Log 3');
      await cleaningLogger.flush();
      await cleaningLogger.cleanOldLogs();
      const files = await fs.readdir(logDir);
      expect(files.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Structured Logging', () => {
    it('should log structured data as JSON', () => {
      const data = { user: 'test', action: 'login', timestamp: Date.now() };
      const result = logger.json(data);
      expect(result).toContain('"user":"test"');
    });

    it('should support context enrichment', () => {
      logger.setContext({ requestId: 'req-123' });
      const formatted = logger.info('Test with context');
      expect(formatted).toContain('req-123');
    });

    it('should support nested data', () => {
      const nested = {
        user: { id: 1, name: 'John' },
        metadata: { ip: '127.0.0.1' }
      };
      const result = logger.json(nested);
      expect(result).toContain('"id":1');
    });
  });

  describe('Performance', () => {
    it('should handle high volume logging', async () => {
      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        logger.info(`Message ${i}`);
      }
      await logger.flush();
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000);
    });

    it('should buffer writes efficiently', async () => {
      logger.info('Message 1');
      logger.info('Message 2');
      logger.info('Message 3');
      expect(logger.bufferSize()).toBe(3);
      await logger.flush();
      expect(logger.bufferSize()).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle write failures gracefully', async () => {
      const invalidLogger = new Logger({
        name: 'invalid',
        logDir: '/invalid/path/that/does/not/exist'
      });
      expect(() => {
        invalidLogger.info('Test');
      }).not.toThrow();
    });

    it('should handle circular references', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;
      expect(() => {
        logger.json(circular);
      }).not.toThrow();
    });

    it('should handle non-serializable data', () => {
      const nonSerializable = {
        fn: () => {},
        symbol: Symbol('test')
      };
      expect(() => {
        logger.json(nonSerializable);
      }).not.toThrow();
    });
  });

  describe('Child Loggers', () => {
    it('should create child loggers', () => {
      const child = logger.child({ component: 'auth' });
      const formatted = child.info('Auth message');
      expect(formatted).toContain('auth');
    });

    it('should inherit parent context', () => {
      logger.setContext({ app: 'test-app' });
      const child = logger.child({ module: 'users' });
      const formatted = child.info('User operation');
      expect(formatted).toContain('test-app');
      expect(formatted).toContain('users');
    });
  });

  describe('Log Filtering', () => {
    it('should filter by pattern', () => {
      const filtered = logger.filterLogs(/error/i);
      logger.info('Normal message');
      logger.error('Error message');
      expect(filtered.messages.length).toBe(1);
    });

    it('should filter by level', () => {
      const filtered = logger.filterByLevel('error');
      logger.debug('Debug');
      logger.error('Error');
      expect(filtered.messages.length).toBe(1);
    });
  });

  describe('Log Analysis', () => {
    it('should count log levels', async () => {
      logger.debug('Debug 1');
      logger.info('Info 1');
      logger.info('Info 2');
      logger.error('Error 1');
      const counts = await logger.getLogCounts();
      expect(counts.info).toBe(2);
      expect(counts.error).toBe(1);
    });

    it('should extract error patterns', async () => {
      logger.error('Connection timeout');
      logger.error('Connection timeout');
      logger.error('Invalid input');
      const patterns = await logger.analyzeErrors();
      expect(patterns['Connection timeout']).toBe(2);
    });
  });
});
