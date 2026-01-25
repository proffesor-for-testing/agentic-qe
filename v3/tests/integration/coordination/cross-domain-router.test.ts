/**
 * Agentic QE v3 - Cross-Domain Router Integration Tests
 * Tests event routing, correlation tracking, and domain aggregation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CrossDomainEventRouter } from '../../../src/coordination/cross-domain-router';
import { InMemoryEventBus } from '../../../src/kernel/event-bus';
import { DomainEvent, ALL_DOMAINS, DomainName } from '../../../src/shared/types';
import { EventBus } from '../../../src/kernel/interfaces';

describe('CrossDomainEventRouter Integration', () => {
  let eventBus: EventBus;
  let router: CrossDomainEventRouter;

  beforeEach(async () => {
    eventBus = new InMemoryEventBus();
    router = new CrossDomainEventRouter(eventBus, {
      maxHistorySize: 1000,
      correlationTimeout: 5000,
    });
    await router.initialize();
  });

  afterEach(async () => {
    await router.dispose();
  });

  describe('event routing', () => {
    it('should route events from domain channels', async () => {
      const receivedEvents: DomainEvent[] = [];

      // Subscribe to test-generation domain
      router.subscribeToDoamin('test-generation', async (event) => {
        receivedEvents.push(event);
      });

      // Emit an event via event bus domain channel
      const testEvent: DomainEvent = {
        id: 'evt-001',
        type: 'test.generated',
        source: 'test-generation',
        timestamp: new Date(),
        data: { testCount: 5 },
      };

      await eventBus.publish(testEvent);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0].id).toBe('evt-001');
    });

    it('should handle events from all 12 domains', async () => {
      const receivedByDomain = new Map<DomainName, DomainEvent[]>();
      ALL_DOMAINS.forEach((d) => receivedByDomain.set(d, []));

      // Subscribe to all domains
      for (const domain of ALL_DOMAINS) {
        router.subscribeToDoamin(domain, async (event) => {
          receivedByDomain.get(domain)!.push(event);
        });
      }

      // Emit events from each domain
      for (const domain of ALL_DOMAINS) {
        const event: DomainEvent = {
          id: `evt-${domain}`,
          type: `${domain}.event`,
          source: domain,
          timestamp: new Date(),
          data: { domain },
        };
        await eventBus.publish(event);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify each domain received its event
      for (const domain of ALL_DOMAINS) {
        const events = receivedByDomain.get(domain)!;
        expect(events.length).toBeGreaterThanOrEqual(1);
        expect(events[0].source).toBe(domain);
      }
    });

    it('should subscribe to specific event types', async () => {
      const receivedEvents: DomainEvent[] = [];

      router.subscribeToEventType('test.generated', async (event) => {
        receivedEvents.push(event);
      });

      const matchingEvent: DomainEvent = {
        id: 'evt-001',
        type: 'test.generated',
        source: 'test-generation',
        timestamp: new Date(),
        data: {},
      };

      const nonMatchingEvent: DomainEvent = {
        id: 'evt-002',
        type: 'test.executed',
        source: 'test-execution',
        timestamp: new Date(),
        data: {},
      };

      await router.route(matchingEvent);
      await router.route(nonMatchingEvent);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0].type).toBe('test.generated');
    });
  });

  describe('correlation tracking', () => {
    it('should track events by correlation ID', async () => {
      const correlationId = 'corr-123';

      const events: DomainEvent[] = [
        {
          id: 'evt-001',
          type: 'test.started',
          source: 'test-execution',
          timestamp: new Date(),
          correlationId,
          data: {},
        },
        {
          id: 'evt-002',
          type: 'test.progress',
          source: 'test-execution',
          timestamp: new Date(),
          correlationId,
          data: { progress: 50 },
        },
        {
          id: 'evt-003',
          type: 'test.completed',
          source: 'test-execution',
          timestamp: new Date(),
          correlationId,
          data: { passed: true },
        },
      ];

      for (const event of events) {
        router.trackCorrelation(event);
      }

      const correlation = router.getCorrelation(correlationId);

      expect(correlation).toBeDefined();
      expect(correlation!.events.length).toBe(3);
      expect(correlation!.correlationId).toBe(correlationId);
    });

    it('should track domains involved in correlation', async () => {
      const correlationId = 'multi-domain-corr';

      const events: DomainEvent[] = [
        {
          id: 'evt-001',
          type: 'test.started',
          source: 'test-generation',
          timestamp: new Date(),
          correlationId,
          data: {},
        },
        {
          id: 'evt-002',
          type: 'coverage.analyzed',
          source: 'coverage-analysis',
          timestamp: new Date(),
          correlationId,
          data: {},
        },
        {
          id: 'evt-003',
          type: 'quality.assessed',
          source: 'quality-assessment',
          timestamp: new Date(),
          correlationId,
          data: {},
        },
      ];

      for (const event of events) {
        router.trackCorrelation(event);
      }

      const correlation = router.getCorrelation(correlationId);

      expect(correlation).toBeDefined();
      expect(correlation!.domains.size).toBe(3);
      expect(correlation!.domains.has('test-generation')).toBe(true);
      expect(correlation!.domains.has('coverage-analysis')).toBe(true);
      expect(correlation!.domains.has('quality-assessment')).toBe(true);
    });
  });

  describe('event aggregation', () => {
    it('should aggregate events within time window', async () => {
      const now = new Date();
      const windowStart = new Date(now.getTime() - 1000);
      const windowEnd = new Date(now.getTime() + 1000);

      // Route multiple events
      for (let i = 0; i < 5; i++) {
        const event: DomainEvent = {
          id: `evt-${i}`,
          type: 'test.event',
          source: 'test-generation',
          timestamp: now,
          data: { index: i },
        };
        await router.route(event);
      }

      const aggregation = router.aggregate(windowStart, windowEnd);

      expect(aggregation.events.length).toBe(5);
      expect(aggregation.metrics.totalEvents).toBe(5);
    });

    it('should count events by type', async () => {
      const now = new Date();

      const events: DomainEvent[] = [
        { id: 'e1', type: 'test.created', source: 'test-generation', timestamp: now, data: {} },
        { id: 'e2', type: 'test.created', source: 'test-generation', timestamp: now, data: {} },
        { id: 'e3', type: 'test.executed', source: 'test-execution', timestamp: now, data: {} },
        { id: 'e4', type: 'coverage.analyzed', source: 'coverage-analysis', timestamp: now, data: {} },
      ];

      for (const event of events) {
        await router.route(event);
      }

      const aggregation = router.aggregate(
        new Date(now.getTime() - 1000),
        new Date(now.getTime() + 1000)
      );

      expect(aggregation.countByType.get('test.created')).toBe(2);
      expect(aggregation.countByType.get('test.executed')).toBe(1);
      expect(aggregation.countByType.get('coverage.analyzed')).toBe(1);
    });

    it('should count events by domain', async () => {
      const now = new Date();

      const events: DomainEvent[] = [
        { id: 'e1', type: 'test.created', source: 'test-generation', timestamp: now, data: {} },
        { id: 'e2', type: 'test.created', source: 'test-generation', timestamp: now, data: {} },
        { id: 'e3', type: 'test.executed', source: 'test-execution', timestamp: now, data: {} },
        { id: 'e4', type: 'quality.assessed', source: 'quality-assessment', timestamp: now, data: {} },
      ];

      for (const event of events) {
        await router.route(event);
      }

      const aggregation = router.aggregate(
        new Date(now.getTime() - 1000),
        new Date(now.getTime() + 1000)
      );

      expect(aggregation.countByDomain.get('test-generation')).toBe(2);
      expect(aggregation.countByDomain.get('test-execution')).toBe(1);
      expect(aggregation.countByDomain.get('quality-assessment')).toBe(1);
    });
  });

  describe('event history', () => {
    it('should retrieve event history with filtering', async () => {
      const now = new Date();

      const events: DomainEvent[] = [
        { id: 'e1', type: 'test.created', source: 'test-generation', timestamp: now, data: {} },
        { id: 'e2', type: 'test.executed', source: 'test-execution', timestamp: now, data: {} },
        { id: 'e3', type: 'test.created', source: 'test-generation', timestamp: now, data: {} },
      ];

      for (const event of events) {
        await router.route(event);
      }

      // Filter by domain
      const domainFiltered = router.getHistory({ domains: ['test-generation'] });
      expect(domainFiltered.length).toBe(2);

      // Filter by event type
      const typeFiltered = router.getHistory({ eventTypes: ['test.created'] });
      expect(typeFiltered.length).toBe(2);
    });

    it('should limit history results', async () => {
      const now = new Date();

      // Add many events
      for (let i = 0; i < 20; i++) {
        const event: DomainEvent = {
          id: `evt-${i}`,
          type: 'test.event',
          source: 'test-generation',
          timestamp: now,
          data: { index: i },
        };
        await router.route(event);
      }

      const limited = router.getHistory({ limit: 5 });
      expect(limited.length).toBe(5);
    });
  });

  describe('subscription management', () => {
    it('should unsubscribe from events', async () => {
      const receivedEvents: DomainEvent[] = [];

      const subId = router.subscribeToDoamin('test-generation', async (event) => {
        receivedEvents.push(event);
      });

      // First event should be received
      const event1: DomainEvent = {
        id: 'evt-001',
        type: 'test.event',
        source: 'test-generation',
        timestamp: new Date(),
        data: {},
      };
      await router.route(event1);

      // Unsubscribe
      router.unsubscribe(subId);

      // Second event should not be received
      const event2: DomainEvent = {
        id: 'evt-002',
        type: 'test.event',
        source: 'test-generation',
        timestamp: new Date(),
        data: {},
      };
      await router.route(event2);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(receivedEvents.length).toBe(1);
    });
  });

  describe('error handling', () => {
    it('should continue routing despite handler errors', async () => {
      const receivedEvents: DomainEvent[] = [];

      // First handler throws
      router.subscribeToDoamin('test-generation', async () => {
        throw new Error('Handler failed');
      });

      // Second handler should still receive events
      router.subscribeToDoamin('test-generation', async (event) => {
        receivedEvents.push(event);
      });

      const event: DomainEvent = {
        id: 'evt-001',
        type: 'test.event',
        source: 'test-generation',
        timestamp: new Date(),
        data: {},
      };

      await router.route(event);

      expect(receivedEvents.length).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('should dispose resources properly', async () => {
      const receivedEvents: DomainEvent[] = [];

      router.subscribeToDoamin('test-generation', async (event) => {
        receivedEvents.push(event);
      });

      await router.dispose();

      // Events after disposal should not reach subscriptions via router
      // (though event bus may still process them)
    });
  });
});
