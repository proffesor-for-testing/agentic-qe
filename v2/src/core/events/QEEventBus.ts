import { EventEmitter } from 'events';
import { SwarmMemoryManager } from '../memory/SwarmMemoryManager';
import { EventHandler } from './types';

/**
 * QE Event Bus for real-time agent coordination
 *
 * Provides event-driven communication between agents with optional
 * persistence to SwarmMemoryManager for event history and auditing.
 */
export class QEEventBus extends EventEmitter {
  private memory?: SwarmMemoryManager;
  private isActive: boolean = true;

  constructor(memory?: SwarmMemoryManager) {
    super();
    this.memory = memory;
    this.setMaxListeners(100); // Allow many subscribers
  }

  /**
   * Subscribe to an event type
   * @param event Event name to subscribe to
   * @param handler Handler function to call when event is emitted
   */
  subscribe<T = any>(event: string, handler: EventHandler<T>): void {
    this.on(event, handler);
  }

  /**
   * Unsubscribe from an event type
   * @param event Event name to unsubscribe from
   * @param handler Handler function to remove
   */
  unsubscribe<T = any>(event: string, handler: EventHandler<T>): void {
    this.off(event, handler);
  }

  /**
   * Emit an event to all subscribers and optionally persist to memory
   * @param event Event name to emit
   * @param data Event data payload
   */
  async emitAsync(event: string, data: any): Promise<boolean> {
    if (!this.isActive) {
      return false;
    }

    // Add timestamp if not present
    const eventData = {
      ...data,
      timestamp: data.timestamp || Date.now()
    };

    // Emit to all synchronous listeners
    const hasListeners = super.emit(event, eventData);

    // Persist to memory if available
    if (this.memory) {
      try {
        await this.memory.store(`events:${event}:${Date.now()}`, eventData, {
          partition: 'events',
          ttl: 2592000 // 30 days in seconds
        });
      } catch (error) {
        // Log error but don't fail the emit
        console.error(`Failed to persist event ${event} to memory:`, error);
      }
    }

    return hasListeners;
  }

  /**
   * Emit an event once - will be automatically unsubscribed after first call
   * @param event Event name to subscribe to
   * @param handler Handler function
   */
  subscribeOnce<T = any>(event: string, handler: EventHandler<T>): this {
    super.once(event, handler);
    return this;
  }

  /**
   * Get all event names currently being listened to
   */
  getEventNames(): (string | symbol)[] {
    return this.eventNames();
  }

  /**
   * Get listener count for a specific event
   * @param event Event name
   */
  getListenerCount(event: string): number {
    return this.listenerCount(event);
  }

  /**
   * Remove all listeners for a specific event or all events
   * @param event Optional event name - if not provided, removes all listeners
   */
  removeAllListeners(event?: string): this {
    return super.removeAllListeners(event);
  }

  /**
   * Shutdown the event bus and stop emitting events
   */
  async shutdown(): Promise<void> {
    this.isActive = false;
    this.removeAllListeners();
  }

  /**
   * Check if event bus is active
   */
  isEventBusActive(): boolean {
    return this.isActive;
  }
}
