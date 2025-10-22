/**
 * Logger - Centralized logging system for the AQE Fleet
 *
 * Provides structured logging with different levels and output formats
 * for comprehensive fleet monitoring and debugging.
 */

import winston from 'winston';
import path from 'path';
import * as fs from 'fs';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

export class Logger {
  private static instance: Logger;
  private logger: winston.Logger;

  private constructor() {
    try {
      // Create logs directory first (before creating winston logger)
      this.ensureLogsDirectory();

      const transports: winston.transport[] = [
        // Write all logs to console
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
            winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
              const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
              return `${timestamp} [${service}] ${level}: ${message}${metaStr}`;
            })
          )
        })
      ];

      // Only add file transports if not in test environment
      if (process.env.NODE_ENV !== 'test') {
        try {
          transports.push(
            // Write error logs to error.log
            new winston.transports.File({
              filename: path.join(process.cwd(), 'logs', 'error.log'),
              level: 'error',
              maxsize: 5242880, // 5MB
              maxFiles: 5
            }),

            // Write all logs to combined.log
            new winston.transports.File({
              filename: path.join(process.cwd(), 'logs', 'combined.log'),
              maxsize: 5242880, // 5MB
              maxFiles: 5
            })
          );
        } catch (error) {
          // Silently fall back to console-only logging if file transports fail
          console.warn('File logging disabled:', error);
        }
      }

      this.logger = winston.createLogger({
        level: process.env.LOG_LEVEL || 'info',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        ),
        defaultMeta: { service: 'agentic-qe-fleet' },
        transports
      });
    } catch (error) {
      console.error('FATAL: Failed to create Winston logger:', error);
      // Create a minimal fallback logger
      this.logger = {
        error: (msg: string, meta?: any) => console.error(msg, meta),
        warn: (msg: string, meta?: any) => console.warn(msg, meta),
        info: (msg: string, meta?: any) => console.log(msg, meta),
        debug: (msg: string, meta?: any) => console.debug(msg, meta),
        log: (level: string, msg: string, meta?: any) => console.log(`[${level}]`, msg, meta),
        level: 'info',
        child: () => this.logger
      } as any;
    }
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Log error message
   */
  error(message: string, meta?: any): void {
    if (!this.logger) {
      console.error('[LOGGER NOT INITIALIZED]', message, meta);
      return;
    }
    this.logger.error(message, meta);
  }

  /**
   * Log warning message
   */
  warn(message: string, meta?: any): void {
    if (!this.logger) {
      console.warn('[LOGGER NOT INITIALIZED]', message, meta);
      return;
    }
    this.logger.warn(message, meta);
  }

  /**
   * Log info message
   */
  info(message: string, meta?: any): void {
    if (!this.logger) {
      console.log('[LOGGER NOT INITIALIZED]', message, meta);
      return;
    }
    this.logger.info(message, meta);
  }

  /**
   * Log debug message
   */
  debug(message: string, meta?: any): void {
    if (!this.logger) {
      console.debug('[LOGGER NOT INITIALIZED]', message, meta);
      return;
    }
    this.logger.debug(message, meta);
  }

  /**
   * Log with specific level
   */
  log(level: LogLevel, message: string, meta?: any): void {
    this.logger.log(level, message, meta);
  }

  /**
   * Create child logger with additional context
   */
  child(meta: any): Logger {
    const childLogger = new Logger();
    childLogger.logger = this.logger.child(meta);
    return childLogger;
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.logger.level = level;
  }

  /**
   * Get current log level
   */
  getLevel(): string {
    return this.logger.level;
  }

  /**
   * Ensure logs directory exists
   */
  private ensureLogsDirectory(): void {
    // Skip in test environment
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    try {
      const logsDir = path.join(process.cwd(), 'logs');

      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
    } catch (error) {
      // Silently fail - will use console-only logging
      console.warn('Could not create logs directory:', error);
    }
  }
}