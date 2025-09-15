/**
 * Mock EventBus implementation for testing
 */

import { EventEmitter } from 'events';
import { IEventBus } from '../../src/core/types';

export class MockEventBus implements IEventBus {
  private emitter = new EventEmitter();
  public emittedEvents: Array<{ event: string; data: any; timestamp: number }> = [];

  emit(event: string, data: any): void {
    this.emittedEvents.push({
      event,
      data,
      timestamp: Date.now()
    });
    this.emitter.emit(event, data);
  }

  on(event: string, handler: (data: any) => void): void {
    this.emitter.on(event, handler);
  }

  off(event: string, handler: (data: any) => void): void {
    this.emitter.off(event, handler);
  }

  once(event: string, handler: (data: any) => void): void {
    this.emitter.once(event, handler);
  }

  removeAllListeners(event?: string): void {
    this.emitter.removeAllListeners(event);
  }

  listenerCount(event: string): number {
    return this.emitter.listenerCount(event);
  }

  getEmittedEvents(eventName?: string): Array<{ event: string; data: any; timestamp: number }> {
    if (eventName) {
      return this.emittedEvents.filter(e => e.event === eventName);
    }
    return [...this.emittedEvents];
  }

  getLastEmittedEvent(eventName?: string): { event: string; data: any; timestamp: number } | undefined {
    const events = this.getEmittedEvents(eventName);
    return events[events.length - 1];
  }

  reset(): void {
    this.emittedEvents = [];
    this.emitter.removeAllListeners();
  }

  waitForEvent(eventName: string, timeout: number = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.emitter.off(eventName, handler);
        reject(new Error(`Timeout waiting for event: ${eventName}`));
      }, timeout);

      const handler = (data: any) => {
        clearTimeout(timer);
        resolve(data);
      };

      this.emitter.once(eventName, handler);
    });
  }
}