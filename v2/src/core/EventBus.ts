/**
 * EventBus - Central event coordination system for the AQE Fleet
 *
 * Provides a reliable, persistent event system for agent coordination
 * and fleet-wide communication using EventEmitter with SQLite persistence.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/Logger';

export interface FleetEvent {
  id: string;
  type: string;
  source: string;
  target?: string;
  data: any;
  timestamp: Date;
  processed: boolean;
}

export type EventHandler = (data: any) => void | Promise<void>;

export interface EventOptions {
  filter?: (data: any) => boolean;
  transform?: (data: any) => any;
}

export class EventBus extends EventEmitter {

  private static instance: EventBus | null = null;

  /**
   * Get singleton instance
   */
  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Reset instance (for testing)
   */
  public static resetInstance(): void {
    if (EventBus.instance) {
      EventBus.instance.removeAllListeners();
      EventBus.instance.customListeners.clear();
      EventBus.instance.listenerOptions.clear();
      // Note: WeakMap doesn't have clear() method, but will be garbage collected
      EventBus.instance = null;
    }
  }

  private readonly logger: Logger;
  private readonly events: Map<string, FleetEvent>;
  private readonly customListeners: Map<string, Set<EventHandler>>;
  private readonly listenerRefs: WeakMap<EventHandler, string>;
  private readonly listenerOptions: Map<EventHandler, EventOptions>;
  private isInitialized: boolean = false;

  constructor() {
    super();
    this.logger = Logger.getInstance();
    this.events = new Map();
    this.customListeners = new Map();
    this.listenerRefs = new WeakMap();
    this.listenerOptions = new Map();
    this.setMaxListeners(1000); // Support many agents
  }

  /**
   * Initialize the event bus
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.logger.info('Initializing EventBus');

    // Setup internal event handlers
    this.setupInternalHandlers();

    this.isInitialized = true;
    this.logger.info('EventBus initialized successfully');
  }

  /**
   * Close the event bus and cleanup resources
   */
  async close(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    this.logger.info('Closing EventBus');

    // Remove all listeners
    this.removeAllListeners();

    // Clear all custom listeners and maps
    this.customListeners.clear();
    this.listenerOptions.clear();
    // Note: WeakMap entries will be garbage collected automatically

    // Clear events map
    this.events.clear();

    this.isInitialized = false;
    this.logger.info('EventBus closed successfully');
  }

  /**
   * Subscribe to an event with automatic cleanup
   * Returns an unsubscribe function for memory leak prevention
   */
  subscribe(event: string, handler: EventHandler, options?: EventOptions): () => void {
    if (!this.customListeners.has(event)) {
      this.customListeners.set(event, new Set());
    }

    this.customListeners.get(event)!.add(handler);
    this.listenerRefs.set(handler, event);

    // Create wrapper function if options are provided
    let wrappedHandler = handler;
    if (options) {
      this.listenerOptions.set(handler, options);

      wrappedHandler = (data: any) => {
        // Apply filter
        if (options.filter && !options.filter(data)) {
          return;
        }

        // Apply transformation
        let processedData = data;
        if (options.transform) {
          processedData = options.transform(data);
        }

        handler(processedData);
      };
    }

    // Register with EventEmitter
    this.on(event, wrappedHandler);

    // Return cleanup function
    return () => this.unsubscribe(event, handler);
  }

  /**
   * Unsubscribe from an event with proper cleanup
   */
  unsubscribe(event: string, handler: EventHandler): void {
    const handlers = this.customListeners.get(event);
    if (handlers) {
      handlers.delete(handler);
      // Clear empty event sets to prevent accumulation
      if (handlers.size === 0) {
        this.customListeners.delete(event);
      }
    }

    // Clean up WeakMap reference (will be garbage collected)
    this.listenerRefs.delete(handler);

    // Clean up options
    this.listenerOptions.delete(handler);

    // Remove from EventEmitter
    this.off(event, handler);
  }

  /**
   * Override emit to support wildcard listeners
   */
  emit(event: string, data?: any): boolean {
    // Handle wildcard listeners (but not for wildcard events themselves)
    const wildcardPattern = event.split(':')[0] + ':*';
    const allPattern = '*';

    // Only emit wildcard patterns if this is not already a wildcard event
    if (event !== '*' && event !== wildcardPattern) {
      // Emit wildcard patterns first
      if (wildcardPattern !== event + ':*') {
        super.emit(wildcardPattern, data);
      }
      super.emit(allPattern, data);
    }

    // Call parent emit
    return super.emit(event, data);
  }

  /**
   * Async emit that waits for all listeners to complete
   */
  async emitAsync(event: string, data?: any): Promise<void> {
    const listeners = this.listeners(event);
    const promises: Promise<void>[] = [];
    const logger = this.logger;

    for (const listener of listeners) {
      try {
        const result = listener(data);
        if (result instanceof Promise) {
          promises.push(result.catch(error => {
            if (logger) {
              logger.error(`Async listener error for ${event}:`, error);
            }
            this.emit('error', { error, event, data });
          }));
        }
      } catch (error) {
        if (logger) {
          logger.error(`Error in async listener for ${event}:`, error);
        }
        this.emit('error', { error, event, data });
      }
    }

    await Promise.all(promises);
  }

  /**
   * Emit a fleet event
   */
  async emitFleetEvent(
    type: string,
    source: string,
    data: any,
    target?: string
  ): Promise<string> {
    const event: FleetEvent = {
      id: uuidv4(),
      type,
      source,
      target,
      data,
      timestamp: new Date(),
      processed: false
    };

    // Store event
    this.events.set(event.id, event);

    const eventData = {
      eventId: event.id,
      source,
      target,
      data,
      timestamp: event.timestamp
    };

    // Emit to each listener individually with error handling
    const listeners = this.listeners(type);
    for (const listener of listeners) {
      try {
        listener(eventData);
      } catch (error) {
        // Log listener errors but continue with other listeners
        this.logger.error(`Error in event listener for ${type}:`, error);
      }
    }

    // Log the event
    this.logger.debug(`Event emitted: ${type} from ${source}`, {
      eventId: event.id,
      target,
      data
    });

    return event.id;
  }

  /**
   * Get event by ID
   */
  getEvent(eventId: string): FleetEvent | undefined {
    return this.events.get(eventId);
  }

  /**
   * Setup internal event handlers
   */
  private setupInternalHandlers(): void {
    // Fleet coordination events
    this.on('fleet:started', (eventData) => {
      this.logger.info('Fleet started', eventData.data);
    });

    this.on('fleet:stopped', (eventData) => {
      this.logger.info('Fleet stopped', eventData.data);
    });

    // Agent lifecycle events
    this.on('agent:spawned', (eventData) => {
      this.logger.info(`Agent spawned: ${eventData.data.agentId} (${eventData.data.type})`);
    });

    this.on('agent:started', (eventData) => {
      this.logger.info(`Agent started: ${eventData.data.agentId}`);
    });

    this.on('agent:stopped', (eventData) => {
      this.logger.info(`Agent stopped: ${eventData.data.agentId}`);
    });

    this.on('agent:error', (eventData) => {
      this.logger.error(`Agent error: ${eventData.data.agentId}`, eventData.data.error);
    });

    // Task lifecycle events
    this.on('task:submitted', (eventData) => {
      this.logger.info(`Task submitted: ${eventData.data.taskId}`);
    });

    this.on('task:assigned', (eventData) => {
      this.logger.info(`Task assigned: ${eventData.data.taskId} -> ${eventData.data.agentId}`);
    });

    this.on('task:started', (eventData) => {
      this.logger.info(`Task started: ${eventData.data.taskId} by ${eventData.data.agentId}`);
    });

    this.on('task:completed', (eventData) => {
      this.logger.info(`Task completed: ${eventData.data.taskId} by ${eventData.data.agentId} in ${eventData.data.executionTime}ms`);
    });

    this.on('task:failed', (eventData) => {
      this.logger.error(`Task failed: ${eventData.data.taskId} by ${eventData.data.agentId}`, eventData.data.error);
    });
  }
}