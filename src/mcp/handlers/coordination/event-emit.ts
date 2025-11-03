/**
 * Event Emit Handler
 *
 * Emits coordination events to the QE Event Bus.
 * Supports custom events and typed event payloads.
 *
 * @version 1.0.0
 */

import { BaseHandler, HandlerResponse } from '../base-handler.js';
import { SecureRandom } from '../../../utils/SecureRandom.js';
import { QEEventBus } from '../../../core/events/QEEventBus.js';
import { SwarmMemoryManager } from '../../../core/memory/SwarmMemoryManager.js';

export interface EventEmitArgs {
  event: string;
  data: Record<string, any>;
  metadata?: {
    source?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
  };
}

export interface EmittedEvent {
  eventId: string;
  event: string;
  timestamp: number;
  data: Record<string, any>;
  metadata: {
    source: string;
    priority: string;
  };
  delivered: boolean;
  listenerCount: number;
}

export class EventEmitHandler extends BaseHandler {
  private eventBus: QEEventBus;

  constructor(private memory: SwarmMemoryManager) {
    super();
    this.eventBus = new QEEventBus(memory);
  }

  async handle(args: EventEmitArgs): Promise<HandlerResponse> {
    return this.safeHandle(async () => {
      const requestId = this.generateRequestId();
      this.log('info', 'Emitting coordination event', { requestId, event: args.event });

      // Validate required fields
      this.validateRequired(args, ['event', 'data']);

      const { result: emitted, executionTime } = await this.measureExecutionTime(
        () => this.emitEvent(args)
      );

      this.log('info', `Event emitted in ${executionTime.toFixed(2)}ms`, {
        eventId: emitted.eventId,
        event: emitted.event,
        listenerCount: emitted.listenerCount
      });

      return this.createSuccessResponse(emitted, requestId);
    });
  }

  private async emitEvent(args: EventEmitArgs): Promise<EmittedEvent> {
    const eventId = `event-${Date.now()}-${SecureRandom.generateId(3)}`;
    const timestamp = Date.now();

    // Add timestamp to data if not present
    const eventData = {
      ...args.data,
      timestamp: args.data.timestamp || timestamp
    };

    // Get listener count before emission
    const listenerCount = this.eventBus.getListenerCount(args.event);

    // Emit event
    const delivered = await this.eventBus.emit(args.event, eventData);

    const emitted: EmittedEvent = {
      eventId,
      event: args.event,
      timestamp,
      data: eventData,
      metadata: {
        source: args.metadata?.source || 'mcp-event-emit',
        priority: args.metadata?.priority || 'medium'
      },
      delivered,
      listenerCount
    };

    // Store event in memory for history
    await this.memory.store(`event:emitted:${eventId}`, emitted, {
      partition: 'events',
      ttl: 86400 // 24 hours
    });

    // Post hint to blackboard for event notification
    await this.memory.postHint({
      key: `aqe/events/${args.event}`,
      value: {
        eventId,
        timestamp,
        data: eventData
      },
      ttl: 300 // 5 minutes
    });

    return emitted;
  }

  /**
   * Get event bus instance for testing
   */
  getEventBus(): QEEventBus {
    return this.eventBus;
  }

  /**
   * Shutdown event bus
   */
  async shutdown(): Promise<void> {
    await this.eventBus.shutdown();
  }
}
