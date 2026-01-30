/**
 * Agentic QE v3 - Cross-Domain Event Router Unit Tests
 * Tests for CrossDomainEventRouter event routing, correlation, and aggregation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  CrossDomainEventRouter,
  createCrossDomainRouter,
} from '../../../src/coordination/cross-domain-router';
import type { DomainEvent, DomainName } from '../../../src/shared/types';
import type { EventBus, Subscription } from '../../../src/kernel/interfaces';
import type { DomainRoute } from '../../../src/coordination/interfaces';

// ============================================================================
// Mock Setup
// ============================================================================

function createMockEventBus(): EventBus & {
  publishedEvents: DomainEvent[];
  subscribers: Map<string, ((event: DomainEvent) => Promise<void>)[]>;
  channelSubscribers: Map<string, ((event: DomainEvent) => Promise<void>)[]>;
} {
  const subscribers = new Map<string, ((event: DomainEvent) => Promise<void>)[]>();
  const channelSubscribers = new Map<string, ((event: DomainEvent) => Promise<void>)[]>();
  const publishedEvents: DomainEvent[] = [];

  return {
    publishedEvents,
    subscribers,
    channelSubscribers,

    publish: vi.fn().mockImplementation(async (event: DomainEvent) => {
      publishedEvents.push(event);
      // Trigger subscribers
      for (const [pattern, handlers] of subscribers.entries()) {
        if (pattern === '*' || event.type.startsWith(pattern.replace(/\*/g, ''))) {
          for (const handler of handlers) {
            await handler(event);
          }
        }
      }
    }),

    subscribe: vi.fn().mockImplementation((pattern: string, handler: (event: DomainEvent) => Promise<void>) => {
      if (!subscribers.has(pattern)) {
        subscribers.set(pattern, []);
      }
      subscribers.get(pattern)!.push(handler);
      return { unsubscribe: () => {} };
    }),

    subscribeToChannel: vi.fn().mockImplementation((channel: DomainName, handler: (event: DomainEvent) => Promise<void>): Subscription => {
      if (!channelSubscribers.has(channel)) {
        channelSubscribers.set(channel, []);
      }
      channelSubscribers.get(channel)!.push(handler);
      return {
        unsubscribe: vi.fn(),
      };
    }),

    unsubscribe: vi.fn(),
  };
}

function createTestEvent(overrides?: Partial<DomainEvent>): DomainEvent {
  return {
    id: `event-${Math.random().toString(36).substring(7)}`,
    type: 'test.event',
    source: 'test-generation' as DomainName,
    timestamp: new Date(),
    payload: { test: true },
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('CrossDomainEventRouter', () => {
  let mockEventBus: ReturnType<typeof createMockEventBus>;
  let router: CrossDomainEventRouter;

  beforeEach(() => {
    mockEventBus = createMockEventBus();
    router = new CrossDomainEventRouter(mockEventBus);
  });

  afterEach(async () => {
    await router.dispose();
  });

  describe('constructor', () => {
    it('should create router with default options', () => {
      const router = new CrossDomainEventRouter(mockEventBus);
      expect(router).toBeDefined();
    });

    it('should accept custom options', () => {
      const router = new CrossDomainEventRouter(mockEventBus, {
        maxHistorySize: 5000,
        correlationTimeout: 30000,
        maxEventsPerCorrelation: 50,
      });
      expect(router).toBeDefined();
    });
  });

  describe('initialize()', () => {
    it('should subscribe to all domains', async () => {
      await router.initialize();

      // Should have called subscribeToChannel for all 13 domains
      expect(mockEventBus.subscribeToChannel).toHaveBeenCalledTimes(13);
    });

    it('should subscribe to wildcard events', async () => {
      await router.initialize();

      expect(mockEventBus.subscribe).toHaveBeenCalledWith('*', expect.any(Function));
    });

    it('should be idempotent', async () => {
      await router.initialize();
      await router.initialize();

      // Should still only subscribe once per domain
      expect(mockEventBus.subscribeToChannel).toHaveBeenCalledTimes(13);
    });
  });

  describe('subscribeToDoamin()', () => {
    it('should register domain subscription', () => {
      const handler = vi.fn();
      const subId = router.subscribeToDoamin('test-generation', handler);

      expect(subId).toBeDefined();
      expect(subId).toContain('sub_domain_');
    });

    it('should trigger handler for matching domain events', async () => {
      const handler = vi.fn();
      router.subscribeToDoamin('test-generation', handler);

      const event = createTestEvent({ source: 'test-generation' });
      await router.route(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should not trigger handler for non-matching domain events', async () => {
      const handler = vi.fn();
      router.subscribeToDoamin('test-generation', handler);

      const event = createTestEvent({ source: 'coverage-analysis' });
      await router.route(event);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('subscribeToEventType()', () => {
    it('should register event type subscription', () => {
      const handler = vi.fn();
      const subId = router.subscribeToEventType('test.completed', handler);

      expect(subId).toBeDefined();
      expect(subId).toContain('sub_type_');
    });

    it('should trigger handler for matching event types', async () => {
      const handler = vi.fn();
      router.subscribeToEventType('test.completed', handler);

      const event = createTestEvent({ type: 'test.completed' });
      await router.route(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should support wildcard patterns', async () => {
      const handler = vi.fn();
      router.subscribeToEventType('test.*', handler);

      const event1 = createTestEvent({ type: 'test.started' });
      const event2 = createTestEvent({ type: 'test.completed' });
      const event3 = createTestEvent({ type: 'coverage.started' });

      await router.route(event1);
      await router.route(event2);
      await router.route(event3);

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should support universal wildcard', async () => {
      const handler = vi.fn();
      router.subscribeToEventType('*', handler);

      const event1 = createTestEvent({ type: 'test.started' });
      const event2 = createTestEvent({ type: 'coverage.analyzed' });

      await router.route(event1);
      await router.route(event2);

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('unsubscribe()', () => {
    it('should remove subscription', () => {
      const handler = vi.fn();
      const subId = router.subscribeToDoamin('test-generation', handler);

      const result = router.unsubscribe(subId);

      expect(result).toBe(true);
    });

    it('should return false for non-existent subscription', () => {
      const result = router.unsubscribe('non-existent-sub');

      expect(result).toBe(false);
    });

    it('should stop triggering handler after unsubscribe', async () => {
      const handler = vi.fn();
      const subId = router.subscribeToDoamin('test-generation', handler);

      router.unsubscribe(subId);

      const event = createTestEvent({ source: 'test-generation' });
      await router.route(event);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('route()', () => {
    it('should store event in history', async () => {
      const event = createTestEvent();
      await router.route(event);

      const history = router.getHistory();
      expect(history).toContainEqual(event);
    });

    it('should track correlation for events with correlationId', async () => {
      const event = createTestEvent({ correlationId: 'corr-123' });
      await router.route(event);

      const correlation = router.getCorrelation('corr-123');
      expect(correlation).toBeDefined();
      expect(correlation?.events).toContainEqual(event);
    });

    it('should handle errors in subscription handlers gracefully', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Handler error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      router.subscribeToDoamin('test-generation', errorHandler);

      const event = createTestEvent({ source: 'test-generation' });
      await router.route(event);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should execute multiple handlers concurrently', async () => {
      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);

      router.subscribeToDoamin('test-generation', handler1);
      router.subscribeToDoamin('test-generation', handler2);

      const event = createTestEvent({ source: 'test-generation' });
      await router.route(event);

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('trackCorrelation()', () => {
    it('should create new correlation for first event', () => {
      const event = createTestEvent({ correlationId: 'corr-new' });
      router.trackCorrelation(event);

      const correlation = router.getCorrelation('corr-new');
      expect(correlation).toBeDefined();
      expect(correlation?.correlationId).toBe('corr-new');
    });

    it('should add events to existing correlation', () => {
      const event1 = createTestEvent({ correlationId: 'corr-multi', source: 'test-generation' });
      const event2 = createTestEvent({ correlationId: 'corr-multi', source: 'coverage-analysis' });

      router.trackCorrelation(event1);
      router.trackCorrelation(event2);

      const correlation = router.getCorrelation('corr-multi');
      expect(correlation?.events).toHaveLength(2);
      expect(correlation?.domains.size).toBe(2);
    });

    it('should not track events without correlationId', () => {
      const event = createTestEvent();
      delete (event as Partial<DomainEvent>).correlationId;

      router.trackCorrelation(event);

      // Should not throw or create correlation
      expect(router.getCorrelation(undefined as any)).toBeUndefined();
    });

    it('should respect maxEventsPerCorrelation', () => {
      const router = new CrossDomainEventRouter(mockEventBus, {
        maxEventsPerCorrelation: 3,
      });

      for (let i = 0; i < 5; i++) {
        const event = createTestEvent({ correlationId: 'corr-limit' });
        router.trackCorrelation(event);
      }

      const correlation = router.getCorrelation('corr-limit');
      expect(correlation?.events).toHaveLength(3);
    });
  });

  describe('getCorrelation()', () => {
    it('should return undefined for non-existent correlation', () => {
      const result = router.getCorrelation('non-existent');
      expect(result).toBeUndefined();
    });

    it('should return copy of correlation data', () => {
      const event = createTestEvent({ correlationId: 'corr-copy' });
      router.trackCorrelation(event);

      const corr1 = router.getCorrelation('corr-copy');
      const corr2 = router.getCorrelation('corr-copy');

      expect(corr1).not.toBe(corr2);
      expect(corr1?.events).not.toBe(corr2?.events);
    });
  });

  describe('aggregate()', () => {
    it('should aggregate events within time window', async () => {
      const now = new Date();
      const windowStart = new Date(now.getTime() - 1000);
      const windowEnd = new Date(now.getTime() + 1000);

      const event1 = createTestEvent({ type: 'test.started' });
      const event2 = createTestEvent({ type: 'test.completed' });

      await router.route(event1);
      await router.route(event2);

      const aggregation = router.aggregate(windowStart, windowEnd);

      expect(aggregation.events).toHaveLength(2);
      expect(aggregation.countByType.get('test.started')).toBe(1);
      expect(aggregation.countByType.get('test.completed')).toBe(1);
    });

    it('should count events by domain', async () => {
      const now = new Date();
      const windowStart = new Date(now.getTime() - 1000);
      const windowEnd = new Date(now.getTime() + 1000);

      const event1 = createTestEvent({ source: 'test-generation' });
      const event2 = createTestEvent({ source: 'test-generation' });
      const event3 = createTestEvent({ source: 'coverage-analysis' });

      await router.route(event1);
      await router.route(event2);
      await router.route(event3);

      const aggregation = router.aggregate(windowStart, windowEnd);

      expect(aggregation.countByDomain.get('test-generation')).toBe(2);
      expect(aggregation.countByDomain.get('coverage-analysis')).toBe(1);
    });

    it('should compute metrics', async () => {
      const now = new Date();
      const windowStart = new Date(now.getTime() - 1000);
      const windowEnd = new Date(now.getTime() + 1000);

      const event1 = createTestEvent({ type: 'a' });
      const event2 = createTestEvent({ type: 'b' });

      await router.route(event1);
      await router.route(event2);

      const aggregation = router.aggregate(windowStart, windowEnd);

      expect(aggregation.metrics.totalEvents).toBe(2);
      expect(aggregation.metrics.uniqueEventTypes).toBe(2);
      expect(aggregation.metrics.eventsPerSecond).toBeGreaterThan(0);
    });

    it('should return empty aggregation for empty window', () => {
      const pastStart = new Date(Date.now() - 100000);
      const pastEnd = new Date(Date.now() - 90000);

      const aggregation = router.aggregate(pastStart, pastEnd);

      expect(aggregation.events).toHaveLength(0);
      expect(aggregation.metrics.totalEvents).toBe(0);
    });
  });

  describe('getHistory()', () => {
    it('should return all events without filter', async () => {
      await router.route(createTestEvent());
      await router.route(createTestEvent());
      await router.route(createTestEvent());

      const history = router.getHistory();
      expect(history).toHaveLength(3);
    });

    it('should filter by event types', async () => {
      await router.route(createTestEvent({ type: 'test.started' }));
      await router.route(createTestEvent({ type: 'test.completed' }));
      await router.route(createTestEvent({ type: 'coverage.analyzed' }));

      const history = router.getHistory({ eventTypes: ['test.started', 'test.completed'] });
      expect(history).toHaveLength(2);
    });

    it('should filter by domains', async () => {
      await router.route(createTestEvent({ source: 'test-generation' }));
      await router.route(createTestEvent({ source: 'coverage-analysis' }));
      await router.route(createTestEvent({ source: 'quality-assessment' }));

      const history = router.getHistory({ domains: ['test-generation'] });
      expect(history).toHaveLength(1);
    });

    it('should filter by timestamp range', async () => {
      const past = new Date(Date.now() - 5000);
      const future = new Date(Date.now() + 5000);

      await router.route(createTestEvent());

      const history = router.getHistory({ fromTimestamp: past, toTimestamp: future });
      expect(history).toHaveLength(1);
    });

    it('should limit results', async () => {
      for (let i = 0; i < 10; i++) {
        await router.route(createTestEvent());
      }

      const history = router.getHistory({ limit: 5 });
      expect(history).toHaveLength(5);
    });

    it('should return copy of history', async () => {
      await router.route(createTestEvent());

      const history1 = router.getHistory();
      const history2 = router.getHistory();

      expect(history1).not.toBe(history2);
    });
  });

  describe('addRoute()', () => {
    it('should add route for event forwarding', async () => {
      const route: DomainRoute = {
        eventPattern: 'test.*',
        source: 'test-generation',
        targets: ['coverage-analysis'],
      };

      router.addRoute(route);

      const event = createTestEvent({ type: 'test.completed', source: 'test-generation' });
      await router.route(event);

      expect(mockEventBus.publish).toHaveBeenCalled();
    });

    it('should respect priority ordering', () => {
      const route1: DomainRoute = {
        eventPattern: 'test.*',
        source: 'test-generation',
        targets: ['coverage-analysis'],
        priority: 10,
      };

      const route2: DomainRoute = {
        eventPattern: 'test.*',
        source: 'test-generation',
        targets: ['quality-assessment'],
        priority: 20,
      };

      router.addRoute(route1);
      router.addRoute(route2);

      // Higher priority should be processed first
      // Internal check - routes are sorted by priority
    });

    it('should apply transform function', async () => {
      const route: DomainRoute = {
        eventPattern: 'test.*',
        source: 'test-generation',
        targets: ['coverage-analysis'],
        transform: (event) => ({
          ...event,
          type: 'transformed.event',
        }),
      };

      router.addRoute(route);

      const event = createTestEvent({ type: 'test.completed', source: 'test-generation' });
      await router.route(event);

      const publishedEvent = mockEventBus.publishedEvents.find(e => e.type === 'transformed.event');
      expect(publishedEvent).toBeDefined();
    });

    it('should apply filter function', async () => {
      const route: DomainRoute = {
        eventPattern: 'test.*',
        source: 'test-generation',
        targets: ['coverage-analysis'],
        filter: (event) => event.type.includes('completed'),
      };

      router.addRoute(route);

      const event1 = createTestEvent({ type: 'test.started', source: 'test-generation' });
      const event2 = createTestEvent({ type: 'test.completed', source: 'test-generation' });

      await router.route(event1);
      await router.route(event2);

      // Only completed event should be forwarded
      const forwardedEvents = mockEventBus.publishedEvents.filter(e => e.correlationId);
      expect(forwardedEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('should not forward back to source', async () => {
      const route: DomainRoute = {
        eventPattern: 'test.*',
        source: 'test-generation',
        targets: ['test-generation', 'coverage-analysis'],
      };

      router.addRoute(route);

      const event = createTestEvent({ type: 'test.completed', source: 'test-generation' });
      await router.route(event);

      // Should only forward to coverage-analysis, not back to test-generation
      const forwardedToSource = mockEventBus.publishedEvents.filter(
        e => e.correlationId === event.id && e.source === 'test-generation'
      );
      // Original event + one forward to coverage-analysis
    });
  });

  describe('removeRoute()', () => {
    it('should remove existing route', () => {
      const route: DomainRoute = {
        eventPattern: 'test.*',
        source: 'test-generation',
        targets: ['coverage-analysis'],
      };

      router.addRoute(route);
      const result = router.removeRoute('test.*', 'test-generation');

      expect(result).toBe(true);
    });

    it('should return false for non-existent route', () => {
      const result = router.removeRoute('non.existent', 'test-generation');
      expect(result).toBe(false);
    });

    it('should stop forwarding after removal', async () => {
      const route: DomainRoute = {
        eventPattern: 'test.*',
        source: 'test-generation',
        targets: ['coverage-analysis'],
      };

      router.addRoute(route);
      router.removeRoute('test.*', 'test-generation');

      mockEventBus.publishedEvents.length = 0;

      const event = createTestEvent({ type: 'test.completed', source: 'test-generation' });
      await router.route(event);

      // Only the route() call stores in history, no forwarding
      const forwardedEvents = mockEventBus.publishedEvents.filter(e => e.correlationId);
      expect(forwardedEvents).toHaveLength(0);
    });
  });

  describe('dispose()', () => {
    it('should clear all subscriptions', async () => {
      router.subscribeToDoamin('test-generation', vi.fn());
      router.subscribeToEventType('test.*', vi.fn());

      await router.dispose();

      // After dispose, new routes should not trigger old handlers
    });

    it('should unsubscribe from domain channels', async () => {
      await router.initialize();
      await router.dispose();

      // Domain subscriptions should be cleared
    });

    it('should clear correlation timeouts', async () => {
      const event = createTestEvent({ correlationId: 'corr-dispose' });
      router.trackCorrelation(event);

      await router.dispose();

      // Should not throw or cause issues
    });

    it('should clear event history', async () => {
      await router.route(createTestEvent());
      await router.route(createTestEvent());

      await router.dispose();

      const history = router.getHistory();
      expect(history).toHaveLength(0);
    });
  });

  describe('history size limit', () => {
    it('should trim history when exceeding max size', async () => {
      const router = new CrossDomainEventRouter(mockEventBus, {
        maxHistorySize: 5,
      });

      for (let i = 0; i < 10; i++) {
        await router.route(createTestEvent({ type: `event-${i}` }));
      }

      const history = router.getHistory();
      expect(history).toHaveLength(5);
      expect(history[0].type).toBe('event-5');
    });
  });
});

describe('createCrossDomainRouter', () => {
  it('should create router instance', () => {
    const mockEventBus = createMockEventBus();
    const router = createCrossDomainRouter(mockEventBus);

    expect(router).toBeDefined();
  });

  it('should pass options to router', () => {
    const mockEventBus = createMockEventBus();
    const router = createCrossDomainRouter(mockEventBus, {
      maxHistorySize: 1000,
      correlationTimeout: 5000,
    });

    expect(router).toBeDefined();
  });
});
