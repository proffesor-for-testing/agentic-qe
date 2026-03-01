/**
 * Agentic QE v3 - Logger Interface
 * Milestone 2.7: Structured Logging Facade
 *
 * Provides a centralized logging abstraction to replace direct console.log calls
 * throughout services, enabling consistent log formatting, level filtering,
 * and future extensibility (file logging, remote logging, etc.).
 */

/**
 * Log levels ordered by verbosity (lower = more verbose)
 */
export enum LogLevel {
  /** Detailed debugging information for development */
  DEBUG = 0,
  /** General informational messages about application flow */
  INFO = 1,
  /** Warning conditions that are not errors but may need attention */
  WARN = 2,
  /** Error conditions that should be investigated */
  ERROR = 3,
  /** No logging - completely silent */
  SILENT = 4,
}

/**
 * String representation of log levels for display
 */
export const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.SILENT]: 'SILENT',
};

/**
 * Parse a string to LogLevel (case-insensitive)
 */
export function parseLogLevel(level: string): LogLevel {
  const normalized = level.toUpperCase();
  switch (normalized) {
    case 'DEBUG':
      return LogLevel.DEBUG;
    case 'INFO':
      return LogLevel.INFO;
    case 'WARN':
    case 'WARNING':
      return LogLevel.WARN;
    case 'ERROR':
      return LogLevel.ERROR;
    case 'SILENT':
    case 'NONE':
    case 'OFF':
      return LogLevel.SILENT;
    default:
      return LogLevel.INFO;
  }
}

/**
 * Contextual metadata that can be attached to log entries
 */
export type LogContext = Record<string, unknown>;

/**
 * Logger interface defining the contract for all logger implementations
 *
 * Each method accepts:
 * - message: The log message (human-readable)
 * - context: Optional structured data for machine parsing
 *
 * The error() method additionally accepts an Error object for stack trace logging.
 */
export interface Logger {
  /**
   * Log detailed debugging information
   * Use for development-time diagnostics that would be too verbose in production
   */
  debug(message: string, context?: LogContext): void;

  /**
   * Log general informational messages
   * Use for significant events in normal application flow
   */
  info(message: string, context?: LogContext): void;

  /**
   * Log warning conditions
   * Use for recoverable issues that may need attention
   */
  warn(message: string, context?: LogContext): void;

  /**
   * Log error conditions
   * Use for failures that require investigation
   *
   * @param message - Human-readable error description
   * @param error - Optional Error object for stack trace
   * @param context - Optional structured metadata
   */
  error(message: string, error?: Error, context?: LogContext): void;

  /**
   * Check if a given log level is enabled
   * Useful for avoiding expensive log message construction
   */
  isEnabled(level: LogLevel): boolean;

  /**
   * Get the domain/namespace this logger is associated with
   */
  getDomain(): string;

  /**
   * Create a child logger with additional context
   * The child inherits the parent's configuration but adds context to all messages
   */
  child(context: LogContext): Logger;
}

/**
 * Type guard to check if an object implements Logger interface
 */
export function isLogger(obj: unknown): obj is Logger {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const candidate = obj as Record<string, unknown>;
  return (
    typeof candidate.debug === 'function' &&
    typeof candidate.info === 'function' &&
    typeof candidate.warn === 'function' &&
    typeof candidate.error === 'function' &&
    typeof candidate.isEnabled === 'function' &&
    typeof candidate.getDomain === 'function' &&
    typeof candidate.child === 'function'
  );
}
