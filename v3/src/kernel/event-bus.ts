/**
 * Agentic QE v3 - Event Bus Implementation
 * Domain event router for cross-domain communication
 */

import {
  DomainEvent,
  DomainName,
  EventHandler,
} from '../shared/types';
import { EventBus, Subscription, EventFilter } from './interfaces';

interface SubscriptionEntry {
  id: string;
  eventType: string | '*';
  channel?: DomainName;
  handler: EventHandler;
  active: boolean;
}

export class InMemoryEventBus implements EventBus {
  private subscriptions: Map<string, SubscriptionEntry> = new Map();
  private eventHistory: DomainEvent[] = [];
  private maxHistorySize = 10000;
  private subscriptionCounter = 0;

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    // Store in history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Find matching subscriptions
    const matchingSubscriptions = Array.from(this.subscriptions.values()).filter(
      (sub) => {
        if (!sub.active) return false;

        // Check channel match
        if (sub.channel && sub.channel !== event.source) return false;

        // Check event type match
        if (sub.eventType !== '*' && sub.eventType !== event.type) return false;

        return true;
      }
    );

    // Execute handlers concurrently
    await Promise.allSettled(
      matchingSubscriptions.map((sub) => sub.handler(event))
    );
  }

  subscribe<T>(eventType: string, handler: EventHandler<T>): Subscription {
    const id = `sub_${++this.subscriptionCounter}`;
    const entry: SubscriptionEntry = {
      id,
      eventType,
      handler: handler as EventHandler,
      active: true,
    };
    this.subscriptions.set(id, entry);

    return {
      unsubscribe: () => {
        entry.active = false;
        this.subscriptions.delete(id);
      },
      get active() {
        return entry.active;
      },
    };
  }

  subscribeToChannel(domain: DomainName, handler: EventHandler): Subscription {
    const id = `sub_${++this.subscriptionCounter}`;
    const entry: SubscriptionEntry = {
      id,
      eventType: '*',
      channel: domain,
      handler,
      active: true,
    };
    this.subscriptions.set(id, entry);

    return {
      unsubscribe: () => {
        entry.active = false;
        this.subscriptions.delete(id);
      },
      get active() {
        return entry.active;
      },
    };
  }

  async getHistory(filter?: EventFilter): Promise<DomainEvent[]> {
    let events = [...this.eventHistory];

    if (filter) {
      if (filter.eventTypes?.length) {
        events = events.filter((e) => filter.eventTypes!.includes(e.type));
      }
      if (filter.sources?.length) {
        events = events.filter((e) => filter.sources!.includes(e.source));
      }
      if (filter.fromTimestamp) {
        events = events.filter((e) => e.timestamp >= filter.fromTimestamp!);
      }
      if (filter.toTimestamp) {
        events = events.filter((e) => e.timestamp <= filter.toTimestamp!);
      }
      if (filter.correlationId) {
        events = events.filter((e) => e.correlationId === filter.correlationId);
      }
      if (filter.limit) {
        events = events.slice(-filter.limit);
      }
    }

    return events;
  }

  async dispose(): Promise<void> {
    this.subscriptions.clear();
    this.eventHistory = [];
  }
}
