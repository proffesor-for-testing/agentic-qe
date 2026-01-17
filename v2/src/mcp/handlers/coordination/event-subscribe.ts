/**
 * Event Subscribe Handler
 *
 * Subscribes to coordination event streams from the QE Event Bus.
 * Supports wildcard patterns and filtering.
 *
 * @version 1.0.0
 */

import { BaseHandler, HandlerResponse } from '../base-handler.js';
import { SecureRandom } from '../../../utils/SecureRandom.js';
import { QEEventBus } from '../../../core/events/QEEventBus.js';
import { SwarmMemoryManager } from '../../../core/memory/SwarmMemoryManager.js';
import { EventHandler } from '../../../core/events/types.js';

export interface EventSubscribeArgs {
  events: string[];
  filter?: Record<string, unknown>;
  action?: 'subscribe' | 'unsubscribe';
  subscriptionId?: string;
}

export interface Subscription {
  subscriptionId: string;
  events: string[];
  filter: Record<string, unknown>;
  createdAt: string;
  active: boolean;
  eventCount?: number;
}

export class EventSubscribeHandler extends BaseHandler {
  private eventBus: QEEventBus;
  private subscriptions: Map<string, Subscription> = new Map();
  private handlers: Map<string, EventHandler[]> = new Map();

  constructor(private memory: SwarmMemoryManager) {
    super();
    this.eventBus = new QEEventBus(memory);
  }

  async handle(args: EventSubscribeArgs): Promise<HandlerResponse> {
    return this.safeHandle(async () => {
      const requestId = this.generateRequestId();

      // Handle unsubscribe action
      if (args.action === 'unsubscribe') {
        if (!args.subscriptionId) {
          return this.createErrorResponse('subscriptionId is required for unsubscribe', requestId);
        }

        const { result: unsubscribed, executionTime } = await this.measureExecutionTime(
          () => this.unsubscribe(args.subscriptionId!)
        );

        this.log('info', `Unsubscribed in ${executionTime.toFixed(2)}ms`, {
          subscriptionId: args.subscriptionId
        });

        return this.createSuccessResponse({ unsubscribed }, requestId);
      }

      // Handle subscribe action (default)
      this.log('info', 'Subscribing to event streams', { requestId, events: args.events });

      // Validate required fields
      this.validateRequired(args, ['events']);

      if (args.events.length === 0) {
        return this.createErrorResponse('Must specify at least one event to subscribe', requestId);
      }

      const { result: subscription, executionTime } = await this.measureExecutionTime(
        () => this.subscribe(args)
      );

      this.log('info', `Subscription created in ${executionTime.toFixed(2)}ms`, {
        subscriptionId: subscription.subscriptionId,
        events: subscription.events.length
      });

      return this.createSuccessResponse(subscription, requestId);
    });
  }

  private async subscribe(args: EventSubscribeArgs): Promise<Subscription> {
    const subscriptionId = `sub-${Date.now()}-${SecureRandom.generateId(3)}`;

    const subscription: Subscription = {
      subscriptionId,
      events: args.events,
      filter: args.filter || {},
      createdAt: new Date().toISOString(),
      active: true,
      eventCount: 0
    };

    // Create handlers for each event
    const handlers: EventHandler[] = [];

    for (const eventPattern of args.events) {
      const handler: EventHandler = async (data: unknown) => {
        // Apply filter if specified
        const dataRecord = data as Record<string, unknown>;
        if (args.filter && Object.keys(args.filter).length > 0) {
          const matches = Object.entries(args.filter).every(([key, value]) => {
            return dataRecord[key] === value;
          });

          if (!matches) return;
        }

        // Increment event count
        subscription.eventCount = (subscription.eventCount || 0) + 1;

        // Store event in subscription history
        await this.memory.store(
          `subscription:${subscriptionId}:event:${Date.now()}`,
          {
            event: eventPattern,
            data,
            timestamp: Date.now()
          },
          {
            partition: 'subscription_events',
            ttl: 3600 // 1 hour
          }
        );
      };

      handlers.push(handler);

      // Handle wildcard subscriptions
      if (eventPattern.includes('*')) {
        // Subscribe to base pattern
        const basePattern = eventPattern.replace(/\*/g, '');
        this.subscribeWildcard(basePattern, handler);
      } else {
        // Direct subscription
        this.eventBus.subscribe(eventPattern, handler);
      }
    }

    // Store handlers for cleanup
    this.handlers.set(subscriptionId, handlers);

    // Store subscription
    this.subscriptions.set(subscriptionId, subscription);

    await this.memory.store(`subscription:${subscriptionId}`, subscription as unknown as Record<string, unknown>, {
      partition: 'subscriptions',
      ttl: 86400 // 24 hours
    });

    return subscription;
  }

  private subscribeWildcard(basePattern: string, handler: EventHandler): void {
    // Subscribe to common event types that match the pattern
    const eventTypes = [
      'agent:spawned',
      'agent:ready',
      'agent:completed',
      'agent:error',
      'test:started',
      'test:progress',
      'test:completed',
      'quality:gate',
      'coverage:analyzed',
      'workflow:created',
      'workflow:started',
      'workflow:completed'
    ];

    for (const eventType of eventTypes) {
      if (eventType.startsWith(basePattern)) {
        this.eventBus.subscribe(eventType, handler);
      }
    }
  }

  private async unsubscribe(subscriptionId: string): Promise<boolean> {
    const subscription = this.subscriptions.get(subscriptionId);

    if (!subscription) {
      throw new Error(`Subscription not found: ${subscriptionId}`);
    }

    // Get handlers for this subscription
    const handlers = this.handlers.get(subscriptionId) || [];

    // Unsubscribe all handlers
    for (let i = 0; i < subscription.events.length; i++) {
      const event = subscription.events[i];
      const handler = handlers[i];

      if (handler) {
        if (event.includes('*')) {
          const basePattern = event.replace(/\*/g, '');
          this.unsubscribeWildcard(basePattern, handler);
        } else {
          this.eventBus.unsubscribe(event, handler);
        }
      }
    }

    // Update subscription status
    subscription.active = false;

    await this.memory.store(`subscription:${subscriptionId}`, subscription as unknown as Record<string, unknown>, {
      partition: 'subscriptions'
    });

    // Cleanup
    this.handlers.delete(subscriptionId);

    return true;
  }

  private unsubscribeWildcard(basePattern: string, handler: EventHandler): void {
    const eventTypes = [
      'agent:spawned',
      'agent:ready',
      'agent:completed',
      'agent:error',
      'test:started',
      'test:progress',
      'test:completed',
      'quality:gate',
      'coverage:analyzed',
      'workflow:created',
      'workflow:started',
      'workflow:completed'
    ];

    for (const eventType of eventTypes) {
      if (eventType.startsWith(basePattern)) {
        this.eventBus.unsubscribe(eventType, handler);
      }
    }
  }

  /**
   * Get subscription by ID
   */
  getSubscription(subscriptionId: string): Subscription | undefined {
    return this.subscriptions.get(subscriptionId);
  }

  /**
   * List all active subscriptions
   */
  listSubscriptions(): Subscription[] {
    return Array.from(this.subscriptions.values()).filter(sub => sub.active);
  }

  /**
   * Shutdown event bus and cleanup all subscriptions
   */
  async shutdown(): Promise<void> {
    // Unsubscribe all active subscriptions
    for (const [subscriptionId] of this.subscriptions) {
      await this.unsubscribe(subscriptionId);
    }

    await this.eventBus.shutdown();
  }
}
