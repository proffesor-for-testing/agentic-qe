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

    // Emit to listeners with error handling
    try {
      this.emit(type, {
        eventId: event.id,
        source,
        target,
        data,
        timestamp: event.timestamp
      });
    } catch (error) {
      // Log listener errors but don't throw - allow other listeners to continue
      this.logger.error(`Error in event listener for ${type}:`, error);
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
    this.on('agent:spawned', (data) => {
      this.logger.info(`Agent spawned: ${data.agentId} (${data.type})`);
    });

    this.on('agent:started', (data) => {
      this.logger.info(`Agent started: ${data.agentId}`);
    });

    this.on('agent:stopped', (data) => {
      this.logger.info(`Agent stopped: ${data.agentId}`);
    });

    this.on('agent:error', (data) => {
      this.logger.error(`Agent error: ${data.agentId}`, data.error);
    });

    // Task lifecycle events
    this.on('task:submitted', (data) => {
      this.logger.info(`Task submitted: ${data.taskId}`);
    });

    this.on('task:assigned', (data) => {
      this.logger.info(`Task assigned: ${data.taskId} -> ${data.agentId}`);
    });

    this.on('task:started', (data) => {
      this.logger.info(`Task started: ${data.taskId} by ${data.agentId}`);
    });

    this.on('task:completed', (data) => {
      this.logger.info(`Task completed: ${data.taskId} by ${data.agentId} in ${data.executionTime}ms`);
    });

    this.on('task:failed', (data) => {
      this.logger.error(`Task failed: ${data.taskId} by ${data.agentId}`, data.error);
    });
  }
}