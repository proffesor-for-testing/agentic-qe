/**
 * Agentic QE v3 - Console Logger Implementation
 * Milestone 2.7: Structured Logging Facade
 *
 * Default logger implementation that outputs to console with:
 * - Level filtering
 * - Domain prefixing
 * - Timestamp formatting
 * - Structured context formatting
 * - Error stack trace handling
 */

import {
  Logger,
  LogLevel,
  LogContext,
  LOG_LEVEL_NAMES,
} from './logger.js';

/**
 * Configuration options for ConsoleLogger
 */
export interface ConsoleLoggerConfig {
  /** Include timestamps in log output */
  includeTimestamp: boolean;
  /** Include log level name in output */
  includeLevel: boolean;
  /** Format for timestamps (iso or short) */
  timestampFormat: 'iso' | 'short';
  /** Pretty print context objects with indentation */
  prettyPrint: boolean;
  /** Maximum depth for context object stringification */
  maxContextDepth: number;
}

/**
 * Default configuration for ConsoleLogger
 */
export const DEFAULT_CONSOLE_LOGGER_CONFIG: ConsoleLoggerConfig = {
  includeTimestamp: true,
  includeLevel: true,
  timestampFormat: 'short',
  prettyPrint: false,
  maxContextDepth: 3,
};

/**
 * Console-based Logger implementation
 *
 * Outputs formatted log messages to the console with level filtering.
 * Messages below the configured level threshold are silently ignored.
 */
export class ConsoleLogger implements Logger {
  private readonly domain: string;
  private readonly level: LogLevel;
  private readonly config: ConsoleLoggerConfig;
  private readonly inheritedContext: LogContext;

  constructor(
    domain: string,
    level: LogLevel = LogLevel.INFO,
    config: Partial<ConsoleLoggerConfig> = {},
    inheritedContext: LogContext = {}
  ) {
    this.domain = domain;
    this.level = level;
    this.config = { ...DEFAULT_CONSOLE_LOGGER_CONFIG, ...config };
    this.inheritedContext = inheritedContext;
  }

  debug(message: string, context?: LogContext): void {
    if (this.level <= LogLevel.DEBUG) {
      this.output(LogLevel.DEBUG, message, context);
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.level <= LogLevel.INFO) {
      this.output(LogLevel.INFO, message, context);
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.level <= LogLevel.WARN) {
      this.output(LogLevel.WARN, message, context);
    }
  }

  error(message: string, error?: Error, context?: LogContext): void {
    if (this.level <= LogLevel.ERROR) {
      const errorContext: LogContext = { ...context };

      if (error) {
        errorContext.errorName = error.name;
        errorContext.errorMessage = error.message;
        if (error.stack) {
          errorContext.stack = error.stack;
        }
        // Capture any additional properties on the error
        // Use type assertion for ES2022 Error.cause compatibility
        const errorWithCause = error as Error & { cause?: unknown };
        if (errorWithCause.cause !== undefined) {
          errorContext.cause = String(errorWithCause.cause);
        }
      }

      this.output(LogLevel.ERROR, message, errorContext);
    }
  }

  isEnabled(level: LogLevel): boolean {
    return this.level <= level;
  }

  getDomain(): string {
    return this.domain;
  }

  child(context: LogContext): Logger {
    return new ConsoleLogger(
      this.domain,
      this.level,
      this.config,
      { ...this.inheritedContext, ...context }
    );
  }

  /**
   * Format and output a log message to the appropriate console method
   */
  private output(level: LogLevel, message: string, context?: LogContext): void {
    const formattedMessage = this.format(level, message, context);

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formattedMessage);
        break;
      case LogLevel.INFO:
        console.info(formattedMessage);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage);
        break;
      case LogLevel.ERROR:
        console.error(formattedMessage);
        break;
    }
  }

  /**
   * Format a log message with all configured components
   */
  private format(level: LogLevel, message: string, context?: LogContext): string {
    const parts: string[] = [];

    // Add timestamp if configured
    if (this.config.includeTimestamp) {
      parts.push(this.formatTimestamp());
    }

    // Add level if configured
    if (this.config.includeLevel) {
      parts.push(this.formatLevel(level));
    }

    // Add domain
    parts.push(`[${this.domain}]`);

    // Add message
    parts.push(message);

    // Add context if provided
    const mergedContext = this.mergeContext(context);
    if (mergedContext && Object.keys(mergedContext).length > 0) {
      parts.push(this.formatContext(mergedContext));
    }

    return parts.join(' ');
  }

  /**
   * Format current timestamp according to configuration
   */
  private formatTimestamp(): string {
    const now = new Date();

    if (this.config.timestampFormat === 'iso') {
      return `[${now.toISOString()}]`;
    }

    // Short format: HH:MM:SS.mmm
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const millis = String(now.getMilliseconds()).padStart(3, '0');
    return `[${hours}:${minutes}:${seconds}.${millis}]`;
  }

  /**
   * Format log level with consistent width
   */
  private formatLevel(level: LogLevel): string {
    const name = LOG_LEVEL_NAMES[level];
    return `[${name.padEnd(5)}]`;
  }

  /**
   * Merge inherited context with provided context
   */
  private mergeContext(context?: LogContext): LogContext | undefined {
    if (!context && Object.keys(this.inheritedContext).length === 0) {
      return undefined;
    }

    return {
      ...this.inheritedContext,
      ...context,
    };
  }

  /**
   * Format context object for display
   */
  private formatContext(context: LogContext): string {
    try {
      if (this.config.prettyPrint) {
        return '\n' + JSON.stringify(context, this.createReplacer(), 2);
      }
      return JSON.stringify(context, this.createReplacer());
    } catch {
      return '[unserializable context]';
    }
  }

  /**
   * Create a JSON replacer that handles circular references and depth limiting
   */
  private createReplacer(): (key: string, value: unknown) => unknown {
    const seen = new WeakSet();
    let depth = 0;

    return (_key: string, value: unknown) => {
      // Handle depth limiting
      if (typeof value === 'object' && value !== null) {
        if (depth >= this.config.maxContextDepth) {
          return '[object]';
        }

        // Handle circular references
        if (seen.has(value)) {
          return '[circular]';
        }
        seen.add(value);
        depth++;
      }

      // Handle special types
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
      }

      if (typeof value === 'bigint') {
        return value.toString();
      }

      if (typeof value === 'function') {
        return '[function]';
      }

      if (typeof value === 'symbol') {
        return value.toString();
      }

      return value;
    };
  }
}

/**
 * No-op Logger implementation for use when logging is disabled
 *
 * All methods do nothing, providing zero overhead when logging is turned off.
 */
export class NullLogger implements Logger {
  private readonly domain: string;

  constructor(domain: string = 'null') {
    this.domain = domain;
  }

  debug(_message: string, _context?: LogContext): void {
    // No-op
  }

  info(_message: string, _context?: LogContext): void {
    // No-op
  }

  warn(_message: string, _context?: LogContext): void {
    // No-op
  }

  error(_message: string, _error?: Error, _context?: LogContext): void {
    // No-op
  }

  isEnabled(_level: LogLevel): boolean {
    return false;
  }

  getDomain(): string {
    return this.domain;
  }

  child(_context: LogContext): Logger {
    return this;
  }
}
