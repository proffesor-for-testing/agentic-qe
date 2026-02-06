/**
 * Agentic QE v3 - Event Bus Implementation
 * Domain event router for cross-domain communication
 *
 * Performance Optimizations (Milestone 2.3):
 * - CircularBuffer for O(1) event history push (replaces O(n) shift)
 * - Subscription indexes for O(1) lookup (replaces O(n) filter)
 */

import {
  DomainEvent,
  DomainName,
  EventHandler,
} from '../shared/types';
import { EventBus, Subscription, EventFilter, EventMiddleware } from './interfaces';
import { CircularBuffer } from '../shared/utils/circular-buffer';
import { EVENT_BUS_CONSTANTS } from './constants.js';

interface SubscriptionEntry {
  id: string;
  eventType: string | '*';
  channel?: DomainName;
  handler: EventHandler;
  active: boolean;
}

export class InMemoryEventBus implements EventBus {
  private subscriptions: Map<string, SubscriptionEntry> = new Map();

  // O(1) subscription indexes - avoids O(n) filter on every publish
  private subscriptionsByEventType: Map<string, Set<string>> = new Map();
  private subscriptionsByChannel: Map<DomainName, Set<string>> = new Map();
  private wildcardSubscriptions: Set<string> = new Set();

  // O(1) bounded history using CircularBuffer - avoids O(n) shift
  private eventHistory: CircularBuffer<DomainEvent>;
  private maxHistorySize = EVENT_BUS_CONSTANTS.MAX_HISTORY_SIZE;
  private subscriptionCounter = 0;

  // ADR-060: Middleware chain for event processing
  private middlewares: EventMiddleware[] = [];

  constructor(maxHistorySize = EVENT_BUS_CONSTANTS.MAX_HISTORY_SIZE) {
    this.maxHistorySize = maxHistorySize;
    this.eventHistory = new CircularBuffer<DomainEvent>(maxHistorySize);
  }

  /**
   * ADR-060: Register an event middleware
   * Middlewares are sorted by priority (lower runs first)
   */
  registerMiddleware(middleware: EventMiddleware): void {
    this.middlewares.push(middleware);
    this.middlewares.sort((a, b) => a.priority - b.priority);
  }

  /**
   * ADR-060: Remove an event middleware by name
   */
  removeMiddleware(name: string): boolean {
    const idx = this.middlewares.findIndex(m => m.name === name);
    if (idx >= 0) {
      this.middlewares.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * ADR-060: Get registered middlewares
   */
  getMiddlewares(): readonly EventMiddleware[] {
    return this.middlewares;
  }

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    // ADR-060: Run onEmit middleware chain
    let processedEvent: DomainEvent<T> | null = event;
    for (const mw of this.middlewares) {
      if (mw.onEmit && processedEvent) {
        processedEvent = await mw.onEmit(processedEvent) as DomainEvent<T> | null;
        if (!processedEvent) return; // Middleware rejected the event
      }
    }

    // Store in history - O(1) with CircularBuffer (auto-evicts oldest)
    this.eventHistory.push(processedEvent);

    // Collect matching subscriptions using O(1) index lookups
    const matchingIds = new Set<string>();

    // Add subscriptions for this specific event type - O(1) lookup
    const typeSubscriptions = this.subscriptionsByEventType.get(processedEvent.type);
    if (typeSubscriptions) {
      for (const id of typeSubscriptions) {
        matchingIds.add(id);
      }
    }

    // Add channel subscriptions for this source - O(1) lookup
    const channelSubscriptions = this.subscriptionsByChannel.get(processedEvent.source);
    if (channelSubscriptions) {
      for (const id of channelSubscriptions) {
        matchingIds.add(id);
      }
    }

    // Add wildcard subscriptions (subscribers to all events) - O(w) where w is wildcard count
    for (const id of this.wildcardSubscriptions) {
      matchingIds.add(id);
    }

    // Filter to active subscriptions and verify match conditions
    const matchingSubscriptions: SubscriptionEntry[] = [];
    for (const id of matchingIds) {
      const sub = this.subscriptions.get(id);
      if (!sub || !sub.active) continue;

      // Verify channel match for channel subscriptions
      if (sub.channel && sub.channel !== processedEvent.source) continue;

      // Verify event type match for type subscriptions
      if (sub.eventType !== '*' && sub.eventType !== processedEvent.type) continue;

      matchingSubscriptions.push(sub);
    }

    // ADR-060: Run onReceive middleware chain for each handler
    let receivedEvent: DomainEvent<T> | null = processedEvent;
    for (const mw of this.middlewares) {
      if (mw.onReceive && receivedEvent) {
        receivedEvent = await mw.onReceive(receivedEvent) as DomainEvent<T> | null;
        if (!receivedEvent) return; // Middleware rejected on receive
      }
    }

    // Execute handlers concurrently
    await Promise.allSettled(
      matchingSubscriptions.map((sub) => sub.handler(receivedEvent!))
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

    // Add to appropriate index for O(1) lookup during publish
    if (eventType === '*') {
      this.wildcardSubscriptions.add(id);
    } else {
      if (!this.subscriptionsByEventType.has(eventType)) {
        this.subscriptionsByEventType.set(eventType, new Set());
      }
      this.subscriptionsByEventType.get(eventType)!.add(id);
    }

    return {
      unsubscribe: () => {
        entry.active = false;
        this.subscriptions.delete(id);
        // Remove from indexes
        if (eventType === '*') {
          this.wildcardSubscriptions.delete(id);
        } else {
          this.subscriptionsByEventType.get(eventType)?.delete(id);
        }
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

    // Add to channel index for O(1) lookup during publish
    if (!this.subscriptionsByChannel.has(domain)) {
      this.subscriptionsByChannel.set(domain, new Set());
    }
    this.subscriptionsByChannel.get(domain)!.add(id);

    return {
      unsubscribe: () => {
        entry.active = false;
        this.subscriptions.delete(id);
        // Remove from channel index
        this.subscriptionsByChannel.get(domain)?.delete(id);
      },
      get active() {
        return entry.active;
      },
    };
  }

  async getHistory(filter?: EventFilter): Promise<DomainEvent[]> {
    // Convert CircularBuffer to array for filtering
    let events = this.eventHistory.toArray();

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
    this.subscriptionsByEventType.clear();
    this.subscriptionsByChannel.clear();
    this.wildcardSubscriptions.clear();
    this.eventHistory.clear();
    this.middlewares = []; // ADR-060: Clear middlewares
  }
}
