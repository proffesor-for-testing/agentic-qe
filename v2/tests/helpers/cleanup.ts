/**
 * Test Cleanup Helpers - Memory Leak Prevention
 *
 * Provides utilities to track and cleanup resources in tests:
 * - Event listeners
 * - Agent instances
 * - Timers
 * - Event emitters
 */

import { EventEmitter } from 'events';

/**
 * Event Listener Tracker
 * Automatically tracks and cleans up event listeners
 */
export class EventListenerTracker {
  private listeners: Array<{
    emitter: EventEmitter;
    event: string;
    handler: Function;
  }> = [];

  /**
   * Register an event listener and track it for cleanup
   */
  on(emitter: EventEmitter, event: string, handler: Function): void {
    emitter.on(event, handler as any);
    this.listeners.push({ emitter, event, handler });
  }

  /**
   * Register a one-time listener
   */
  once(emitter: EventEmitter, event: string, handler: Function): void {
    emitter.once(event, handler as any);
    // Don't track once listeners as they auto-remove
  }

  /**
   * Remove a specific listener
   */
  off(emitter: EventEmitter, event: string, handler: Function): void {
    emitter.off(event, handler as any);
    this.listeners = this.listeners.filter(
      l => !(l.emitter === emitter && l.event === event && l.handler === handler)
    );
  }

  /**
   * Cleanup all tracked listeners
   */
  async cleanup(): Promise<void> {
    // Wait for any pending async operations
    await new Promise(resolve => setImmediate(resolve));

    // Remove all tracked listeners
    this.listeners.forEach(({ emitter, event, handler }) => {
      try {
        emitter.off(event, handler as any);
      } catch (error) {
        // Ignore errors if emitter is already destroyed
      }
    });

    this.listeners = [];
  }

  /**
   * Get count of tracked listeners
   */
  get count(): number {
    return this.listeners.length;
  }
}

/**
 * Agent Instance Tracker
 * Tracks agent instances and ensures proper shutdown
 */
export class AgentTracker {
  private agents: Array<{ shutdown: () => Promise<void> }> = [];

  /**
   * Track an agent instance
   */
  track<T extends { shutdown: () => Promise<void> }>(agent: T): T {
    this.agents.push(agent);
    return agent;
  }

  /**
   * Create and track an agent
   */
  create<T extends { shutdown: () => Promise<void> }>(
    AgentClass: new (...args: any[]) => T,
    ...args: any[]
  ): T {
    const agent = new AgentClass(...args);
    this.agents.push(agent);
    return agent;
  }

  /**
   * Shutdown all tracked agents
   */
  async cleanup(): Promise<void> {
    await Promise.all(
      this.agents.map(agent =>
        agent.shutdown().catch(err => {
          console.warn('Agent shutdown error:', err);
        })
      )
    );

    this.agents = [];
  }

  /**
   * Get count of tracked agents
   */
  get count(): number {
    return this.agents.length;
  }
}

/**
 * Timer Tracker
 * Tracks setTimeout/setInterval and ensures cleanup
 */
export class TimerTracker {
  private timers: Array<NodeJS.Timeout> = [];
  private intervals: Array<NodeJS.Timeout> = [];

  /**
   * Safe setTimeout with automatic tracking
   */
  setTimeout(fn: () => void, delay: number): NodeJS.Timeout {
    const timerId = setTimeout(() => {
      fn();
      this.timers = this.timers.filter(id => id !== timerId);
    }, delay);
    this.timers.push(timerId);
    return timerId;
  }

  /**
   * Safe setInterval with automatic tracking
   */
  setInterval(fn: () => void, delay: number): NodeJS.Timeout {
    const intervalId = setInterval(fn, delay);
    this.intervals.push(intervalId);
    return intervalId;
  }

  /**
   * Clear a specific timeout
   */
  clearTimeout(timerId: NodeJS.Timeout): void {
    clearTimeout(timerId);
    this.timers = this.timers.filter(id => id !== timerId);
  }

  /**
   * Clear a specific interval
   */
  clearInterval(intervalId: NodeJS.Timeout): void {
    clearInterval(intervalId);
    this.intervals = this.intervals.filter(id => id !== intervalId);
  }

  /**
   * Cleanup all tracked timers
   */
  cleanup(): void {
    this.timers.forEach(clearTimeout);
    this.intervals.forEach(clearInterval);
    this.timers = [];
    this.intervals = [];
  }

  /**
   * Get count of active timers
   */
  get count(): { timers: number; intervals: number } {
    return {
      timers: this.timers.length,
      intervals: this.intervals.length
    };
  }
}

/**
 * Resource Cleanup Manager
 * Combines all cleanup utilities for comprehensive resource management
 */
export class ResourceCleanup {
  public events: EventListenerTracker;
  public agents: AgentTracker;
  public timers: TimerTracker;
  private emitters: Set<EventEmitter>;

  constructor() {
    this.events = new EventListenerTracker();
    this.agents = new AgentTracker();
    this.timers = new TimerTracker();
    this.emitters = new Set();
  }

  /**
   * Track an event emitter for cleanup
   */
  trackEmitter(emitter: EventEmitter): EventEmitter {
    this.emitters.add(emitter);
    return emitter;
  }

  /**
   * Cleanup all resources
   */
  async cleanup(): Promise<void> {
    // Cleanup in order: agents first, then events, then timers
    await this.agents.cleanup();
    await this.events.cleanup();
    this.timers.cleanup();

    // Remove all listeners from tracked emitters
    this.emitters.forEach(emitter => {
      try {
        emitter.removeAllListeners();
      } catch (error) {
        // Ignore if already destroyed
      }
    });
    this.emitters.clear();

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * Get cleanup statistics
   */
  getStats(): {
    listeners: number;
    agents: number;
    timers: { timers: number; intervals: number };
    emitters: number;
  } {
    return {
      listeners: this.events.count,
      agents: this.agents.count,
      timers: this.timers.count,
      emitters: this.emitters.size
    };
  }
}

/**
 * Create a resource cleanup manager for a test suite
 * Usage in tests:
 *
 * ```typescript
 * import { createResourceCleanup } from '../helpers/cleanup';
 *
 * describe('MyTest', () => {
 *   const cleanup = createResourceCleanup();
 *
 *   afterEach(async () => {
 *     await cleanup.afterEach();
 *   });
 *
 *   it('test', () => {
 *     const emitter = cleanup.trackEmitter(new EventEmitter());
 *     cleanup.events.on(emitter, 'event', handler);
 *   });
 * });
 * ```
 */
export function createResourceCleanup() {
  const resource = new ResourceCleanup();

  return {
    // Expose individual trackers
    events: resource.events,
    agents: resource.agents,
    timers: resource.timers,
    trackEmitter: (emitter: EventEmitter) => resource.trackEmitter(emitter),

    // Cleanup method for afterEach
    afterEach: async () => {
      await resource.cleanup();
    },

    // Get statistics
    getStats: () => resource.getStats()
  };
}

/**
 * Global cleanup utilities for use in jest.setup.ts
 */
export const globalCleanup = {
  /**
   * Enhanced afterEach for global setup
   */
  setupGlobalAfterEach(): void {
    afterEach(async () => {
      // Wait for async operations
      await new Promise(resolve => setImmediate(resolve));

      // Clear all mocks
      jest.clearAllMocks();

      // Run registered cleanups
      if (global.testCleanup) {
        await Promise.all(
          global.testCleanup.map(cleanup =>
            Promise.resolve(cleanup()).catch(err => {
              console.warn('Cleanup error:', err);
            })
          )
        );
        global.testCleanup = [];
      }

      // Force GC if available
      if (global.gc) {
        global.gc();
      }
    });
  }
};
