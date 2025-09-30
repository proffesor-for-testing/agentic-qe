/**
 * Logger - Centralized logging system for the AQE Fleet
 *
 * Provides structured logging with different levels and output formats
 * for comprehensive fleet monitoring and debugging.
 */

import winston from 'winston';
import path from 'path';

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
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'agentic-qe-fleet' },
      transports: [
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
        }),

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
      ]
    });

    // Create logs directory if it doesn't exist
    this.ensureLogsDirectory();
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
    this.logger.error(message, meta);
  }

  /**
   * Log warning message
   */
  warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  /**
   * Log info message
   */
  info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  /**
   * Log debug message
   */
  debug(message: string, meta?: any): void {
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
    const fs = require('fs');
    const logsDir = path.join(process.cwd(), 'logs');

    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  }
}