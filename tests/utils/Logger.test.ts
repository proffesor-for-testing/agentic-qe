/**
 * Tests for Logger
 *
 * Comprehensive test suite for centralized logging system with
 * different log levels, output formats, and file handling.
 *
 * @group unit
 * @group utils
 */

import { Logger, LogLevel } from '@utils/Logger';
import * as fs from 'fs';
import * as path from 'path';

// Mock winston
jest.mock('winston', () => {
  const mFormat = {
    combine: jest.fn(),
    timestamp: jest.fn(),
    errors: jest.fn(() => mFormat),
    json: jest.fn(),
    colorize: jest.fn(),
    simple: jest.fn(),
    printf: jest.fn()
  };

  const mTransports = {
    Console: jest.fn(),
    File: jest.fn()
  };

  const mLogger = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
    child: jest.fn(() => mLogger),
    level: 'info'
  };

  return {
    format: mFormat,
    transports: mTransports,
    createLogger: jest.fn(() => mLogger)
  };
});

// Mock fs for directory creation
jest.mock('fs', () => ({
  existsSync: jest.fn(() => false),
  mkdirSync: jest.fn()
}));

describe('Logger', () => {
  let logger: Logger;
  let mockWinstonLogger: any;

  beforeEach(() => {
    // Clear the singleton
    (Logger as any).instance = null;

    // Get winston mock
    const winston = require('winston');
    mockWinstonLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
      child: jest.fn(function() {
        return mockWinstonLogger;
      }),
      level: 'info'
    };

    winston.createLogger.mockReturnValue(mockWinstonLogger);

    logger = Logger.getInstance();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = Logger.getInstance();
      const instance2 = Logger.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should create logs directory on initialization', () => {
      expect(fs.existsSync).toHaveBeenCalled();
      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  describe('Error Logging', () => {
    it('should log error messages', () => {
      logger.error('Test error message');

      expect(mockWinstonLogger.error).toHaveBeenCalledWith('Test error message', undefined);
    });

    it('should log error with metadata', () => {
      const metadata = { userId: '123', action: 'login' };
      logger.error('Login failed', metadata);

      expect(mockWinstonLogger.error).toHaveBeenCalledWith('Login failed', metadata);
    });

    it('should handle error objects', () => {
      const error = new Error('Test error');
      logger.error('An error occurred', { error });

      expect(mockWinstonLogger.error).toHaveBeenCalledWith(
        'An error occurred',
        expect.objectContaining({ error })
      );
    });
  });

  describe('Warning Logging', () => {
    it('should log warning messages', () => {
      logger.warn('Test warning');

      expect(mockWinstonLogger.warn).toHaveBeenCalledWith('Test warning', undefined);
    });

    it('should log warning with metadata', () => {
      const metadata = { threshold: 80, current: 85 };
      logger.warn('Threshold exceeded', metadata);

      expect(mockWinstonLogger.warn).toHaveBeenCalledWith('Threshold exceeded', metadata);
    });
  });

  describe('Info Logging', () => {
    it('should log info messages', () => {
      logger.info('Test info message');

      expect(mockWinstonLogger.info).toHaveBeenCalledWith('Test info message', undefined);
    });

    it('should log info with metadata', () => {
      const metadata = { operation: 'startup', duration: 1234 };
      logger.info('Application started', metadata);

      expect(mockWinstonLogger.info).toHaveBeenCalledWith('Application started', metadata);
    });
  });

  describe('Debug Logging', () => {
    it('should log debug messages', () => {
      logger.debug('Debug information');

      expect(mockWinstonLogger.debug).toHaveBeenCalledWith('Debug information', undefined);
    });

    it('should log debug with detailed metadata', () => {
      const metadata = {
        requestId: 'req-123',
        headers: { 'content-type': 'application/json' },
        body: { test: 'data' }
      };

      logger.debug('Request received', metadata);

      expect(mockWinstonLogger.debug).toHaveBeenCalledWith('Request received', metadata);
    });
  });

  describe('Generic Log Method', () => {
    it('should log with specified level', () => {
      logger.log(LogLevel.INFO, 'Generic log message');

      expect(mockWinstonLogger.log).toHaveBeenCalledWith(
        LogLevel.INFO,
        'Generic log message',
        undefined
      );
    });

    it('should support all log levels', () => {
      const levels = [LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.DEBUG];

      levels.forEach(level => {
        logger.log(level, `Message at ${level} level`);

        expect(mockWinstonLogger.log).toHaveBeenCalledWith(
          level,
          `Message at ${level} level`,
          undefined
        );
      });
    });

    it('should include metadata with generic log', () => {
      const metadata = { component: 'auth', method: 'POST' };

      logger.log(LogLevel.INFO, 'API call', metadata);

      expect(mockWinstonLogger.log).toHaveBeenCalledWith(
        LogLevel.INFO,
        'API call',
        metadata
      );
    });
  });

  describe('Child Logger', () => {
    it('should create child logger with context', () => {
      const childLogger = logger.child({ module: 'TestModule' });

      expect(childLogger).toBeInstanceOf(Logger);
      expect(mockWinstonLogger.child).toHaveBeenCalledWith({ module: 'TestModule' });
    });

    it('should create child logger with multiple context fields', () => {
      const context = {
        module: 'UserService',
        operation: 'createUser',
        requestId: 'req-456'
      };

      const childLogger = logger.child(context);

      expect(mockWinstonLogger.child).toHaveBeenCalledWith(context);
    });

    it('should allow child logger to log with inherited context', () => {
      const childLogger = logger.child({ module: 'TestModule' });

      childLogger.info('Test message from child');

      expect(mockWinstonLogger.info).toHaveBeenCalledWith('Test message from child', undefined);
    });
  });

  describe('Log Level Management', () => {
    it('should set log level', () => {
      logger.setLevel(LogLevel.DEBUG);

      expect(mockWinstonLogger.level).toBe(LogLevel.DEBUG);
    });

    it('should get current log level', () => {
      mockWinstonLogger.level = LogLevel.INFO;

      const level = logger.getLevel();

      expect(level).toBe(LogLevel.INFO);
    });

    it('should change log level dynamically', () => {
      logger.setLevel(LogLevel.ERROR);
      expect(mockWinstonLogger.level).toBe(LogLevel.ERROR);

      logger.setLevel(LogLevel.DEBUG);
      expect(mockWinstonLogger.level).toBe(LogLevel.DEBUG);

      logger.setLevel(LogLevel.INFO);
      expect(mockWinstonLogger.level).toBe(LogLevel.INFO);
    });
  });

  describe('Log Formats', () => {
    it('should use JSON format for file logging', () => {
      const winston = require('winston');

      expect(winston.format.json).toHaveBeenCalled();
    });

    it('should use colorized format for console', () => {
      const winston = require('winston');

      expect(winston.format.colorize).toHaveBeenCalled();
      expect(winston.format.simple).toHaveBeenCalled();
    });

    it('should include timestamp in logs', () => {
      const winston = require('winston');

      expect(winston.format.timestamp).toHaveBeenCalled();
    });

    it('should include error stack traces', () => {
      const winston = require('winston');

      expect(winston.format.errors).toHaveBeenCalledWith({ stack: true });
    });
  });

  describe('File Transports', () => {
    it('should create file transport for errors', () => {
      const winston = require('winston');

      expect(winston.transports.File).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          filename: expect.stringContaining('error.log')
        })
      );
    });

    it('should create file transport for all logs', () => {
      const winston = require('winston');

      expect(winston.transports.File).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: expect.stringContaining('combined.log')
        })
      );
    });

    it('should configure file size limits', () => {
      const winston = require('winston');

      const fileTransportCalls = winston.transports.File.mock.calls;
      fileTransportCalls.forEach((call: any) => {
        expect(call[0]).toHaveProperty('maxsize');
        expect(call[0]).toHaveProperty('maxFiles');
      });
    });
  });

  describe('Console Transport', () => {
    it('should create console transport', () => {
      const winston = require('winston');

      expect(winston.transports.Console).toHaveBeenCalled();
    });

    it('should use custom format for console', () => {
      const winston = require('winston');

      const consoleCall = winston.transports.Console.mock.calls[0];
      expect(consoleCall[0]).toHaveProperty('format');
    });
  });

  describe('Default Metadata', () => {
    it('should include service name in all logs', () => {
      const winston = require('winston');

      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultMeta: { service: 'agentic-qe-fleet' }
        })
      );
    });
  });

  describe('Environment Configuration', () => {
    it('should respect LOG_LEVEL environment variable', () => {
      const originalEnv = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'debug';

      // Reset singleton and create new instance
      (Logger as any).instance = null;

      const winston = require('winston');
      winston.createLogger.mockClear();

      Logger.getInstance();

      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'debug'
        })
      );

      // Restore
      process.env.LOG_LEVEL = originalEnv;
    });

    it('should use default level if environment variable not set', () => {
      const originalEnv = process.env.LOG_LEVEL;
      delete process.env.LOG_LEVEL;

      // Reset singleton and create new instance
      (Logger as any).instance = null;

      const winston = require('winston');
      winston.createLogger.mockClear();

      Logger.getInstance();

      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info'
        })
      );

      // Restore
      process.env.LOG_LEVEL = originalEnv;
    });
  });

  describe('Directory Creation', () => {
    it('should check if logs directory exists', () => {
      expect(fs.existsSync).toHaveBeenCalledWith(
        expect.stringContaining('logs')
      );
    });

    it('should create logs directory if it does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      // Reset and recreate logger
      (Logger as any).instance = null;
      Logger.getInstance();

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        { recursive: true }
      );
    });

    it('should not create logs directory if it already exists', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.mkdirSync as jest.Mock).mockClear();

      // Reset and recreate logger
      (Logger as any).instance = null;
      Logger.getInstance();

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('Log Message Formatting', () => {
    it('should handle string messages', () => {
      logger.info('Simple string message');

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'Simple string message',
        undefined
      );
    });

    it('should handle messages with special characters', () => {
      const message = 'Message with\nnewlines and\ttabs';
      logger.info(message);

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(message, undefined);
    });

    it('should handle empty messages', () => {
      logger.info('');

      expect(mockWinstonLogger.info).toHaveBeenCalledWith('', undefined);
    });

    it('should handle long messages', () => {
      const longMessage = 'A'.repeat(10000);
      logger.info(longMessage);

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(longMessage, undefined);
    });
  });

  describe('Metadata Handling', () => {
    it('should handle complex nested metadata', () => {
      const complexMeta = {
        level1: {
          level2: {
            level3: {
              data: 'deep'
            }
          }
        },
        array: [1, 2, 3],
        boolean: true,
        number: 42
      };

      logger.info('Complex metadata test', complexMeta);

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'Complex metadata test',
        complexMeta
      );
    });

    it('should handle metadata with circular references gracefully', () => {
      const circular: any = { prop: 'value' };
      circular.self = circular;

      // Should not throw
      expect(() => {
        logger.info('Circular reference test', circular);
      }).not.toThrow();
    });

    it('should handle undefined metadata', () => {
      logger.info('No metadata');

      expect(mockWinstonLogger.info).toHaveBeenCalledWith('No metadata', undefined);
    });

    it('should handle null metadata', () => {
      logger.info('Null metadata', null as any);

      expect(mockWinstonLogger.info).toHaveBeenCalledWith('Null metadata', null);
    });
  });

  describe('Performance', () => {
    it('should handle high-frequency logging', () => {
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        logger.info(`Message ${i}`);
      }

      expect(mockWinstonLogger.info).toHaveBeenCalledTimes(iterations);
    });

    it('should not block on logging calls', () => {
      // Winston logging is non-blocking by nature
      const start = Date.now();

      for (let i = 0; i < 100; i++) {
        logger.info('Test message');
      }

      const duration = Date.now() - start;

      // Should complete quickly (< 100ms for 100 logs in memory)
      expect(duration).toBeLessThan(100);
    });
  });
});
