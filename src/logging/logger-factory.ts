/**
 * Agentic QE v3 - Logger Factory
 * Milestone 2.7: Structured Logging Facade
 *
 * Factory for creating domain-specific loggers with centralized configuration.
 * Supports runtime level changes and custom logger implementations.
 */

import {
  Logger,
  LogLevel,
  LogContext,
  parseLogLevel,
} from './logger.js';
import {
  ConsoleLogger,
  ConsoleLoggerConfig,
  NullLogger,
  DEFAULT_CONSOLE_LOGGER_CONFIG,
} from './console-logger.js';

/**
 * Configuration options for LoggerFactory
 */
export interface LoggerFactoryConfig {
  /** Default log level for all loggers */
  defaultLevel: LogLevel;
  /** Domain-specific log level overrides */
  domainLevels: Map<string, LogLevel>;
  /** Console logger configuration */
  consoleConfig: Partial<ConsoleLoggerConfig>;
  /** Whether to use NullLogger for completely silent operation */
  silent: boolean;
}

/**
 * Default factory configuration
 */
const DEFAULT_FACTORY_CONFIG: LoggerFactoryConfig = {
  defaultLevel: LogLevel.INFO,
  domainLevels: new Map(),
  consoleConfig: DEFAULT_CONSOLE_LOGGER_CONFIG,
  silent: false,
};

/**
 * Custom logger provider function type
 * Allows injecting custom logger implementations
 */
export type LoggerProvider = (domain: string, level: LogLevel, context?: LogContext) => Logger;

/**
 * LoggerFactory - Centralized logger creation and configuration
 *
 * Usage:
 * ```typescript
 * import { LoggerFactory } from '../logging';
 *
 * // Set global log level
 * LoggerFactory.setLevel(LogLevel.DEBUG);
 *
 * // Create domain-specific logger
 * const logger = LoggerFactory.create('queen-coordinator');
 *
 * // Use logger
 * logger.info('Task submitted', { taskId, priority });
 * logger.error('Task failed', error, { taskId });
 * ```
 */
export class LoggerFactory {
  private static config: LoggerFactoryConfig = { ...DEFAULT_FACTORY_CONFIG };
  private static customProvider: LoggerProvider | null = null;
  private static instances: Map<string, Logger> = new Map();

  /**
   * Set the global default log level
   * Affects all loggers created after this call
   */
  static setLevel(level: LogLevel): void {
    this.config.defaultLevel = level;
    // Clear cached instances so new ones pick up the new level
    this.instances.clear();
  }

  /**
   * Set log level from environment variable or string
   * Convenience method for configuration from env vars
   */
  static setLevelFromString(level: string): void {
    this.setLevel(parseLogLevel(level));
  }

  /**
   * Get the current global log level
   */
  static getLevel(): LogLevel {
    return this.config.defaultLevel;
  }

  /**
   * Set log level for a specific domain
   * Allows fine-grained control over logging verbosity
   */
  static setDomainLevel(domain: string, level: LogLevel): void {
    this.config.domainLevels.set(domain, level);
    // Remove cached instance if exists
    this.instances.delete(domain);
  }

  /**
   * Get the log level for a specific domain
   * Returns domain-specific level or falls back to default
   */
  static getDomainLevel(domain: string): LogLevel {
    return this.config.domainLevels.get(domain) ?? this.config.defaultLevel;
  }

  /**
   * Clear domain-specific level, reverting to default
   */
  static clearDomainLevel(domain: string): void {
    this.config.domainLevels.delete(domain);
    this.instances.delete(domain);
  }

  /**
   * Configure console logger options
   */
  static configure(config: Partial<ConsoleLoggerConfig>): void {
    this.config.consoleConfig = {
      ...this.config.consoleConfig,
      ...config,
    };
    // Clear cached instances
    this.instances.clear();
  }

  /**
   * Enable silent mode (all logging disabled)
   */
  static setSilent(silent: boolean): void {
    this.config.silent = silent;
    this.instances.clear();
  }

  /**
   * Check if silent mode is enabled
   */
  static isSilent(): boolean {
    return this.config.silent;
  }

  /**
   * Register a custom logger provider
   * Useful for testing or custom logging backends
   */
  static setProvider(provider: LoggerProvider | null): void {
    this.customProvider = provider;
    this.instances.clear();
  }

  /**
   * Create a logger for a specific domain
   *
   * @param domain - The domain/namespace for the logger (e.g., 'queen-coordinator', 'test-generation')
   * @param context - Optional default context to include in all log messages
   * @returns Logger instance configured for the domain
   */
  static create(domain: string, context?: LogContext): Logger {
    // Check cache first (only for loggers without custom context)
    if (!context && this.instances.has(domain)) {
      return this.instances.get(domain)!;
    }

    const level = this.getDomainLevel(domain);
    let logger: Logger;

    if (this.config.silent) {
      logger = new NullLogger(domain);
    } else if (this.customProvider) {
      logger = this.customProvider(domain, level, context);
    } else {
      logger = new ConsoleLogger(domain, level, this.config.consoleConfig, context);
    }

    // Cache only loggers without custom context
    if (!context) {
      this.instances.set(domain, logger);
    }

    return logger;
  }

  /**
   * Get a logger (alias for create)
   * Follows common logging library naming conventions
   */
  static getLogger(domain: string, context?: LogContext): Logger {
    return this.create(domain, context);
  }

  /**
   * Reset factory to default configuration
   * Useful for testing
   */
  static reset(): void {
    this.config = {
      defaultLevel: LogLevel.INFO,
      domainLevels: new Map(),
      consoleConfig: { ...DEFAULT_CONSOLE_LOGGER_CONFIG },
      silent: false,
    };
    this.customProvider = null;
    this.instances.clear();
  }

  /**
   * Initialize from environment variables
   *
   * Supported env vars:
   * - LOG_LEVEL: Global log level (DEBUG, INFO, WARN, ERROR, SILENT)
   * - LOG_TIMESTAMP: Include timestamps (true/false)
   * - LOG_PRETTY: Pretty print context (true/false)
   */
  static initFromEnv(): void {
    const level = process.env.LOG_LEVEL;
    if (level) {
      this.setLevelFromString(level);
    }

    const timestamp = process.env.LOG_TIMESTAMP;
    if (timestamp !== undefined) {
      this.configure({ includeTimestamp: timestamp.toLowerCase() === 'true' });
    }

    const pretty = process.env.LOG_PRETTY;
    if (pretty !== undefined) {
      this.configure({ prettyPrint: pretty.toLowerCase() === 'true' });
    }
  }

  /**
   * Get statistics about logger instances
   */
  static getStats(): {
    cachedLoggers: number;
    domains: string[];
    domainOverrides: number;
    currentLevel: LogLevel;
    silent: boolean;
  } {
    return {
      cachedLoggers: this.instances.size,
      domains: Array.from(this.instances.keys()),
      domainOverrides: this.config.domainLevels.size,
      currentLevel: this.config.defaultLevel,
      silent: this.config.silent,
    };
  }
}

/**
 * Convenience function to create a logger
 * Shorthand for LoggerFactory.create()
 */
export function createLogger(domain: string, context?: LogContext): Logger {
  return LoggerFactory.create(domain, context);
}

/**
 * Get logger for a class or module
 * Extracts domain name from class name or uses provided string
 */
export function getLogger(domainOrClass: string | { name: string }, context?: LogContext): Logger {
  const domain = typeof domainOrClass === 'string' ? domainOrClass : domainOrClass.name;
  return LoggerFactory.create(domain, context);
}
