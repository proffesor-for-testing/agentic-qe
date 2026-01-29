/**
 * Agentic QE v3 - Logging Module
 * Milestone 2.7: Structured Logging Facade
 *
 * Centralized logging infrastructure for consistent log formatting,
 * level filtering, and domain-specific configuration.
 *
 * Usage:
 * ```typescript
 * import { LoggerFactory, LogLevel } from '../logging';
 *
 * // Configure (typically at application startup)
 * LoggerFactory.setLevel(LogLevel.DEBUG);
 * // Or from environment
 * LoggerFactory.initFromEnv();
 *
 * // Create domain-specific loggers
 * const logger = LoggerFactory.create('queen-coordinator');
 *
 * // Log messages
 * logger.info('Task submitted', { taskId: 'task-123', priority: 'high' });
 * logger.debug('Processing details', { step: 1, duration: 42 });
 * logger.warn('Resource limit approaching', { usage: 0.85 });
 * logger.error('Task failed', error, { taskId: 'task-123' });
 *
 * // Check if level is enabled (avoid expensive message construction)
 * if (logger.isEnabled(LogLevel.DEBUG)) {
 *   logger.debug('Expensive debug info', { data: computeExpensiveData() });
 * }
 *
 * // Create child logger with additional context
 * const childLogger = logger.child({ requestId: 'req-456' });
 * childLogger.info('Processing request'); // includes requestId in all messages
 * ```
 */

// Core types and interfaces
export {
  Logger,
  LogLevel,
  LogContext,
  LOG_LEVEL_NAMES,
  parseLogLevel,
  isLogger,
} from './logger.js';

// Console logger implementation
export {
  ConsoleLogger,
  NullLogger,
  ConsoleLoggerConfig,
  DEFAULT_CONSOLE_LOGGER_CONFIG,
} from './console-logger.js';

// Factory for creating loggers
export {
  LoggerFactory,
  LoggerFactoryConfig,
  LoggerProvider,
  createLogger,
  getLogger,
} from './logger-factory.js';
