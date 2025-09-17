/**
 * Logger utility for Agentic QE framework
 * Provides structured logging with levels, formatting, and context
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  context: string;
  message: string;
  data?: any;
  error?: Error;
}

export interface LoggerOptions {
  level?: LogLevel;
  context?: string;
  logFile?: string;
  useColors?: boolean;
  timestamps?: boolean;
}

/**
 * Logger class for structured logging
 */
export class Logger {
  private level: LogLevel;
  private context: string;
  private logFile?: string;
  private useColors: boolean;
  private timestamps: boolean;
  private static instances = new Map<string, Logger>();

  constructor(context: string = 'default', options: LoggerOptions = {}) {
    this.context = context;
    this.level = options.level ?? LogLevel.INFO;
    this.logFile = options.logFile;
    this.useColors = options.useColors ?? true;
    this.timestamps = options.timestamps ?? true;

    // Store instance for singleton pattern per context
    Logger.instances.set(context, this);
  }

  /**
   * Get logger instance for context
   */
  static getInstance(context: string = 'default'): Logger {
    if (!Logger.instances.has(context)) {
      new Logger(context);
    }
    return Logger.instances.get(context)!;
  }

  /**
   * Format log message
   */
  private format(entry: LogEntry): string {
    const levelStr = LogLevel[entry.level];
    const timestamp = this.timestamps ? `[${entry.timestamp.toISOString()}]` : '';
    const contextStr = `[${entry.context}]`;

    let message = `${timestamp} ${levelStr} ${contextStr} ${entry.message}`;

    if (entry.data) {
      message += `\n${JSON.stringify(entry.data, null, 2)}`;
    }

    if (entry.error) {
      message += `\n${entry.error.stack || entry.error.message}`;
    }

    return message;
  }

  /**
   * Apply colors to console output
   */
  private colorize(message: string, level: LogLevel): string {
    if (!this.useColors) return message;

    switch (level) {
      case LogLevel.DEBUG:
        return chalk.gray(message);
      case LogLevel.INFO:
        return chalk.blue(message);
      case LogLevel.WARN:
        return chalk.yellow(message);
      case LogLevel.ERROR:
        return chalk.red(message);
      case LogLevel.FATAL:
        return chalk.bgRed.white(message);
      default:
        return message;
    }
  }

  /**
   * Write log entry
   */
  private write(entry: LogEntry): void {
    if (entry.level < this.level) return;

    const formatted = this.format(entry);
    const colorized = this.colorize(formatted, entry.level);

    // Console output
    if (entry.level >= LogLevel.ERROR) {
      console.error(colorized);
    } else {
      console.log(colorized);
    }

    // File output
    if (this.logFile) {
      fs.appendFileSync(this.logFile, formatted + '\n');
    }
  }

  /**
   * Log methods
   */
  debug(message: string, data?: any): void {
    this.write({
      timestamp: new Date(),
      level: LogLevel.DEBUG,
      context: this.context,
      message,
      data
    });
  }

  info(message: string, data?: any): void {
    this.write({
      timestamp: new Date(),
      level: LogLevel.INFO,
      context: this.context,
      message,
      data
    });
  }

  warn(message: string, data?: any): void {
    this.write({
      timestamp: new Date(),
      level: LogLevel.WARN,
      context: this.context,
      message,
      data
    });
  }

  error(message: string, error?: Error | string | any, data?: any): void {
    const errorObj = error instanceof Error ? error :
                     typeof error === 'string' ? new Error(error) :
                     error?.message ? error : undefined;

    this.write({
      timestamp: new Date(),
      level: LogLevel.ERROR,
      context: this.context,
      message,
      data,
      error: errorObj
    });
  }

  fatal(message: string, error?: Error, data?: any): void {
    this.write({
      timestamp: new Date(),
      level: LogLevel.FATAL,
      context: this.context,
      message,
      data,
      error
    });
  }

  /**
   * Create child logger with sub-context
   */
  child(subContext: string): Logger {
    return new Logger(`${this.context}:${subContext}`, {
      level: this.level,
      logFile: this.logFile,
      useColors: this.useColors,
      timestamps: this.timestamps
    });
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }
}

/**
 * Configure global logger settings
 */
export function configureLogger(options: {
  level?: LogLevel | string;
  console?: boolean;
  file?: { enabled: boolean; path?: string };
}): void {
  const level = typeof options.level === 'string'
    ? LogLevel[options.level.toUpperCase() as keyof typeof LogLevel]
    : options.level || LogLevel.INFO;

  // Configure default loggers
  [logger, testLogger, agentLogger, cliLogger].forEach(log => {
    log.setLevel(level);
  });
}

// Export singleton instances for common contexts
export const logger = new Logger('aqe');
export const testLogger = new Logger('test');
export const agentLogger = new Logger('agent');
export const cliLogger = new Logger('cli');