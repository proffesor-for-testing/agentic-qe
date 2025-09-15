/**
 * Mock Logger implementation for testing
 */

import { ILogger } from '../../src/core/types';

export class MockLogger implements ILogger {
  public debugCalls: Array<{ message: string; context?: any }> = [];
  public infoCalls: Array<{ message: string; context?: any }> = [];
  public warnCalls: Array<{ message: string; context?: any }> = [];
  public errorCalls: Array<{ message: string; context?: any }> = [];

  debug(message: string, context?: any): void {
    this.debugCalls.push({ message, context });
  }

  info(message: string, context?: any): void {
    this.infoCalls.push({ message, context });
  }

  warn(message: string, context?: any): void {
    this.warnCalls.push({ message, context });
  }

  error(message: string, context?: any): void {
    this.errorCalls.push({ message, context });
  }

  reset(): void {
    this.debugCalls = [];
    this.infoCalls = [];
    this.warnCalls = [];
    this.errorCalls = [];
  }

  getLastCall(level: 'debug' | 'info' | 'warn' | 'error'): { message: string; context?: any } | undefined {
    const calls = this[`${level}Calls`];
    return calls[calls.length - 1];
  }

  getAllCalls(): Array<{ level: string; message: string; context?: any }> {
    return [
      ...this.debugCalls.map(call => ({ level: 'debug', ...call })),
      ...this.infoCalls.map(call => ({ level: 'info', ...call })),
      ...this.warnCalls.map(call => ({ level: 'warn', ...call })),
      ...this.errorCalls.map(call => ({ level: 'error', ...call })),
    ];
  }
}