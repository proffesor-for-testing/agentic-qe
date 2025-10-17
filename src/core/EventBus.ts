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
      EventBus.instance = null;
    }
  }

  private readonly logger: Logger;
  private readonly events: Map<string, FleetEvent>;
  private isInitialized: boolean = false;

  constructor() {
    super();
    this.logger = Logger.getInstance();
    this.events = new Map();
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

    // Clear events map
    this.events.clear();

    this.isInitialized = false;
    this.logger.info('EventBus closed successfully');
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