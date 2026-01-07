/**
 * Agentic QE v3 - Cross-Domain Event Router
 * Routes events between all 12 domains, tracks correlations, and provides aggregation
 */

import { v4 as uuidv4 } from 'uuid';
import {
  DomainName,
  DomainEvent,
  ALL_DOMAINS,
} from '../shared/types';
import { EventBus, Subscription } from '../kernel/interfaces';
import {
  CrossDomainRouter,
  EventCorrelation,
  EventAggregation,
  DomainRoute,
} from './interfaces';

// ============================================================================
// Types
// ============================================================================

interface RouterSubscription {
  id: string;
  type: 'domain' | 'eventType';
  filter: string; // domain name or event type pattern
  handler: (event: DomainEvent) => Promise<void>;
  active: boolean;
}

interface CorrelationEntry {
  correlationId: string;
  events: DomainEvent[];
  domains: Set<DomainName>;
  startedAt: Date;
  lastEventAt: Date;
  complete: boolean;
  timeout: NodeJS.Timeout | null;
}

// ============================================================================
// Cross-Domain Router Implementation
// ============================================================================

export class CrossDomainEventRouter implements CrossDomainRouter {
  private readonly subscriptions = new Map<string, RouterSubscription>();
  private readonly correlations = new Map<string, CorrelationEntry>();
  private readonly eventHistory: DomainEvent[] = [];
  private readonly routes: DomainRoute[] = [];
  private readonly domainSubscriptions = new Map<DomainName, Subscription>();

  private readonly maxHistorySize: number;
  private readonly correlationTimeout: number;
  private readonly maxEventsPerCorrelation: number;
  private initialized = false;

  constructor(
    private readonly eventBus: EventBus,
    options?: {
      maxHistorySize?: number;
      correlationTimeout?: number;
      maxEventsPerCorrelation?: number;
    }
  ) {
    this.maxHistorySize = options?.maxHistorySize ?? 10000;
    this.correlationTimeout = options?.correlationTimeout ?? 60000; // 1 minute
    this.maxEventsPerCorrelation = options?.maxEventsPerCorrelation ?? 100;
  }

  /**
   * Initialize the router by subscribing to all domains
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Subscribe to events from all 12 domains
    for (const domain of ALL_DOMAINS) {
      const subscription = this.eventBus.subscribeToChannel(
        domain,
        async (event) => {
          await this.handleIncomingEvent(event);
        }
      );
      this.domainSubscriptions.set(domain, subscription);
    }

    // Also subscribe to wildcard events
    this.eventBus.subscribe('*', async (event) => {
      // Only process if not already processed via domain channel
      if (!ALL_DOMAINS.includes(event.source)) {
        await this.handleIncomingEvent(event);
      }
    });

    this.initialized = true;
  }

  /**
   * Subscribe to events from a specific domain
   */
  subscribeToDoamin(
    domain: DomainName,
    handler: (event: DomainEvent) => Promise<void>
  ): string {
    const id = `sub_domain_${uuidv4()}`;
    this.subscriptions.set(id, {
      id,
      type: 'domain',
      filter: domain,
      handler,
      active: true,
    });
    return id;
  }

  /**
   * Subscribe to specific event types
   */
  subscribeToEventType(
    eventType: string,
    handler: (event: DomainEvent) => Promise<void>
  ): string {
    const id = `sub_type_${uuidv4()}`;
    this.subscriptions.set(id, {
      id,
      type: 'eventType',
      filter: eventType,
      handler,
      active: true,
    });
    return id;
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: string): boolean {
    const sub = this.subscriptions.get(subscriptionId);
    if (sub) {
      sub.active = false;
      this.subscriptions.delete(subscriptionId);
      return true;
    }
    return false;
  }

  /**
   * Route an event to appropriate handlers
   */
  async route(event: DomainEvent): Promise<void> {
    // Store in history
    this.addToHistory(event);

    // Track correlation
    if (event.correlationId) {
      this.trackCorrelation(event);
    }

    // Find matching subscriptions
    const matchingSubscriptions = this.findMatchingSubscriptions(event);

    // Execute handlers concurrently
    const handlerPromises = matchingSubscriptions.map(async (sub) => {
      try {
        await sub.handler(event);
      } catch (error) {
        console.error(
          `Error in subscription handler ${sub.id}:`,
          error instanceof Error ? error.message : error
        );
      }
    });

    // Apply routes to forward events
    const routePromises = await this.applyRoutes(event);

    await Promise.allSettled([...handlerPromises, ...routePromises]);
  }

  /**
   * Get correlation by ID
   */
  getCorrelation(correlationId: string): EventCorrelation | undefined {
    const entry = this.correlations.get(correlationId);
    if (!entry) {
      return undefined;
    }

    return {
      correlationId: entry.correlationId,
      events: [...entry.events],
      domains: new Set(entry.domains),
      startedAt: entry.startedAt,
      lastEventAt: entry.lastEventAt,
      complete: entry.complete,
    };
  }

  /**
   * Track event for correlation
   */
  trackCorrelation(event: DomainEvent): void {
    if (!event.correlationId) {
      return;
    }

    let entry = this.correlations.get(event.correlationId);

    if (!entry) {
      // Create new correlation entry
      entry = {
        correlationId: event.correlationId,
        events: [],
        domains: new Set(),
        startedAt: event.timestamp,
        lastEventAt: event.timestamp,
        complete: false,
        timeout: null,
      };
      this.correlations.set(event.correlationId, entry);
    }

    // Add event if not at max
    if (entry.events.length < this.maxEventsPerCorrelation) {
      entry.events.push(event);
      entry.domains.add(event.source);
      entry.lastEventAt = event.timestamp;
    }

    // Reset timeout
    if (entry.timeout) {
      clearTimeout(entry.timeout);
    }

    entry.timeout = setTimeout(() => {
      entry!.complete = true;
      entry!.timeout = null;
    }, this.correlationTimeout);
  }

  /**
   * Get aggregated events for a time window
   */
  aggregate(windowStart: Date, windowEnd: Date): EventAggregation {
    const events = this.eventHistory.filter(
      (e) => e.timestamp >= windowStart && e.timestamp <= windowEnd
    );

    const countByType = new Map<string, number>();
    const countByDomain = new Map<DomainName, number>();

    for (const event of events) {
      // Count by type
      countByType.set(event.type, (countByType.get(event.type) ?? 0) + 1);

      // Count by domain
      countByDomain.set(
        event.source,
        (countByDomain.get(event.source) ?? 0) + 1
      );
    }

    // Compute metrics
    const metrics: Record<string, number> = {
      totalEvents: events.length,
      uniqueEventTypes: countByType.size,
      uniqueDomains: countByDomain.size,
      eventsPerSecond: events.length > 0
        ? events.length / ((windowEnd.getTime() - windowStart.getTime()) / 1000)
        : 0,
    };

    return {
      id: uuidv4(),
      windowStart,
      windowEnd,
      events,
      countByType,
      countByDomain,
      metrics,
    };
  }

  /**
   * Get event history with optional filtering
   */
  getHistory(filter?: {
    eventTypes?: string[];
    domains?: DomainName[];
    fromTimestamp?: Date;
    toTimestamp?: Date;
    limit?: number;
  }): DomainEvent[] {
    let events = [...this.eventHistory];

    if (filter) {
      if (filter.eventTypes?.length) {
        events = events.filter((e) => filter.eventTypes!.includes(e.type));
      }
      if (filter.domains?.length) {
        events = events.filter((e) => filter.domains!.includes(e.source));
      }
      if (filter.fromTimestamp) {
        events = events.filter((e) => e.timestamp >= filter.fromTimestamp!);
      }
      if (filter.toTimestamp) {
        events = events.filter((e) => e.timestamp <= filter.toTimestamp!);
      }
      if (filter.limit) {
        events = events.slice(-filter.limit);
      }
    }

    return events;
  }

  /**
   * Add a route for event forwarding
   */
  addRoute(route: DomainRoute): void {
    // Insert by priority (higher priority first)
    const priority = route.priority ?? 0;
    const index = this.routes.findIndex((r) => (r.priority ?? 0) < priority);
    if (index === -1) {
      this.routes.push(route);
    } else {
      this.routes.splice(index, 0, route);
    }
  }

  /**
   * Remove a route
   */
  removeRoute(eventPattern: string, source?: DomainName): boolean {
    const index = this.routes.findIndex(
      (r) =>
        r.eventPattern === eventPattern &&
        (source === undefined || r.source === source)
    );
    if (index !== -1) {
      this.routes.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    // Clear all subscriptions
    this.subscriptions.clear();

    // Unsubscribe from domain channels
    for (const subscription of this.domainSubscriptions.values()) {
      subscription.unsubscribe();
    }
    this.domainSubscriptions.clear();

    // Clear correlation timeouts
    for (const entry of this.correlations.values()) {
      if (entry.timeout) {
        clearTimeout(entry.timeout);
      }
    }
    this.correlations.clear();

    // Clear history
    this.eventHistory.length = 0;

    this.initialized = false;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Handle incoming events from the event bus
   */
  private async handleIncomingEvent(event: DomainEvent): Promise<void> {
    await this.route(event);
  }

  /**
   * Find subscriptions matching an event
   */
  private findMatchingSubscriptions(event: DomainEvent): RouterSubscription[] {
    const matching: RouterSubscription[] = [];

    for (const sub of this.subscriptions.values()) {
      if (!sub.active) continue;

      if (sub.type === 'domain' && sub.filter === event.source) {
        matching.push(sub);
      } else if (sub.type === 'eventType') {
        if (this.matchEventType(event.type, sub.filter)) {
          matching.push(sub);
        }
      }
    }

    return matching;
  }

  /**
   * Match event type against pattern (supports wildcards)
   */
  private matchEventType(eventType: string, pattern: string): boolean {
    if (pattern === '*') return true;

    // Support patterns like "test-execution.*" or "*.TestRunCompleted"
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(eventType);
  }

  /**
   * Apply routes to forward events
   */
  private async applyRoutes(event: DomainEvent): Promise<Promise<void>[]> {
    const promises: Promise<void>[] = [];

    for (const route of this.routes) {
      // Check source match
      const sourceMatch =
        route.source === '*' ||
        route.source === event.source ||
        (Array.isArray(route.source) && route.source.includes(event.source));

      if (!sourceMatch) continue;

      // Check event pattern match
      if (!this.matchEventType(event.type, route.eventPattern)) continue;

      // Check filter
      if (route.filter && !route.filter(event)) continue;

      // Transform event if needed
      const eventToSend = route.transform ? route.transform(event) : event;

      // Forward to targets
      for (const target of route.targets) {
        // Don't forward back to source
        if (target === event.source) continue;

        promises.push(
          this.eventBus.publish({
            ...eventToSend,
            // Add routing metadata
            id: uuidv4(),
            correlationId: event.correlationId ?? event.id,
          })
        );
      }
    }

    return promises;
  }

  /**
   * Add event to history
   */
  private addToHistory(event: DomainEvent): void {
    this.eventHistory.push(event);

    // Trim history if needed
    while (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createCrossDomainRouter(
  eventBus: EventBus,
  options?: {
    maxHistorySize?: number;
    correlationTimeout?: number;
    maxEventsPerCorrelation?: number;
  }
): CrossDomainRouter {
  return new CrossDomainEventRouter(eventBus, options);
}
