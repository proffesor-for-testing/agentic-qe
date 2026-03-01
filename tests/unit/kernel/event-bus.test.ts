/**
 * Agentic QE v3 - Event Bus Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InMemoryEventBus } from '../../../src/kernel/event-bus';
import { DomainEvent, DomainName } from '../../../src/shared/types';

describe('InMemoryEventBus', () => {
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
  });

  afterEach(async () => {
    await eventBus.dispose();
  });

  describe('publish', () => {
    it('should deliver events to matching subscribers', async () => {
      const handler = vi.fn();
      eventBus.subscribe('test.event', handler);

      const event: DomainEvent = {
        id: '1',
        type: 'test.event',
        timestamp: new Date(),
        source: 'test-generation',
        payload: { data: 'test' },
      };

      await eventBus.publish(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should not deliver events to non-matching subscribers', async () => {
      const handler = vi.fn();
      eventBus.subscribe('other.event', handler);

      const event: DomainEvent = {
        id: '1',
        type: 'test.event',
        timestamp: new Date(),
        source: 'test-generation',
        payload: {},
      };

      await eventBus.publish(event);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should store events in history', async () => {
      const event: DomainEvent = {
        id: '1',
        type: 'test.event',
        timestamp: new Date(),
        source: 'test-generation',
        payload: {},
      };

      await eventBus.publish(event);

      const history = await eventBus.getHistory();
      expect(history).toContainEqual(event);
    });
  });

  describe('subscribe', () => {
    it('should return a subscription that can be unsubscribed', async () => {
      const handler = vi.fn();
      const subscription = eventBus.subscribe('test.event', handler);

      expect(subscription.active).toBe(true);

      subscription.unsubscribe();

      expect(subscription.active).toBe(false);

      // Handler should not be called after unsubscribe
      await eventBus.publish({
        id: '1',
        type: 'test.event',
        timestamp: new Date(),
        source: 'test-generation',
        payload: {},
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('subscribeToChannel', () => {
    it('should receive all events from a specific domain', async () => {
      const handler = vi.fn();
      eventBus.subscribeToChannel('test-generation', handler);

      const event1: DomainEvent = {
        id: '1',
        type: 'event.one',
        timestamp: new Date(),
        source: 'test-generation',
        payload: {},
      };

      const event2: DomainEvent = {
        id: '2',
        type: 'event.two',
        timestamp: new Date(),
        source: 'test-generation',
        payload: {},
      };

      const event3: DomainEvent = {
        id: '3',
        type: 'event.three',
        timestamp: new Date(),
        source: 'coverage-analysis',
        payload: {},
      };

      await eventBus.publish(event1);
      await eventBus.publish(event2);
      await eventBus.publish(event3);

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith(event1);
      expect(handler).toHaveBeenCalledWith(event2);
    });
  });

  describe('getHistory', () => {
    it('should filter by event type', async () => {
      await eventBus.publish({
        id: '1',
        type: 'type.a',
        timestamp: new Date(),
        source: 'test-generation',
        payload: {},
      });

      await eventBus.publish({
        id: '2',
        type: 'type.b',
        timestamp: new Date(),
        source: 'test-generation',
        payload: {},
      });

      const history = await eventBus.getHistory({ eventTypes: ['type.a'] });

      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('type.a');
    });

    it('should filter by source', async () => {
      await eventBus.publish({
        id: '1',
        type: 'test.event',
        timestamp: new Date(),
        source: 'test-generation',
        payload: {},
      });

      await eventBus.publish({
        id: '2',
        type: 'test.event',
        timestamp: new Date(),
        source: 'coverage-analysis',
        payload: {},
      });

      const history = await eventBus.getHistory({ sources: ['test-generation'] });

      expect(history).toHaveLength(1);
      expect(history[0].source).toBe('test-generation');
    });

    it('should respect limit', async () => {
      for (let i = 0; i < 10; i++) {
        await eventBus.publish({
          id: String(i),
          type: 'test.event',
          timestamp: new Date(),
          source: 'test-generation',
          payload: { index: i },
        });
      }

      const history = await eventBus.getHistory({ limit: 3 });

      expect(history).toHaveLength(3);
    });
  });

  describe('performance (O(1) operations)', () => {
    it('should maintain bounded history size with O(1) push', async () => {
      // Create event bus with small history for testing
      const smallBus = new InMemoryEventBus(100);

      // Publish more events than the history size
      for (let i = 0; i < 150; i++) {
        await smallBus.publish({
          id: String(i),
          type: 'test.event',
          timestamp: new Date(),
          source: 'test-generation',
          payload: { index: i },
        });
      }

      const history = await smallBus.getHistory();

      // Should be bounded to 100 (oldest events evicted)
      expect(history).toHaveLength(100);

      // First event should be index 50 (0-49 evicted)
      expect(history[0].payload).toEqual({ index: 50 });

      await smallBus.dispose();
    });

    it('should use O(1) subscription lookup for event type matching', async () => {
      // Create many subscriptions to different event types
      const handlers: ReturnType<typeof vi.fn>[] = [];
      for (let i = 0; i < 100; i++) {
        const handler = vi.fn();
        handlers.push(handler);
        eventBus.subscribe(`event.type.${i}`, handler);
      }

      // Publish event to specific type
      await eventBus.publish({
        id: '1',
        type: 'event.type.50',
        timestamp: new Date(),
        source: 'test-generation',
        payload: {},
      });

      // Only handler 50 should be called
      for (let i = 0; i < 100; i++) {
        if (i === 50) {
          expect(handlers[i]).toHaveBeenCalledTimes(1);
        } else {
          expect(handlers[i]).not.toHaveBeenCalled();
        }
      }
    });

    it('should use O(1) subscription lookup for channel matching', async () => {
      const domains: DomainName[] = [
        'test-generation',
        'coverage-analysis',
        'quality-assessment',
        'defect-intelligence',
      ];

      // Subscribe to each domain
      const handlers = domains.map((domain) => {
        const handler = vi.fn();
        eventBus.subscribeToChannel(domain, handler);
        return handler;
      });

      // Publish event from coverage-analysis
      await eventBus.publish({
        id: '1',
        type: 'any.event',
        timestamp: new Date(),
        source: 'coverage-analysis',
        payload: {},
      });

      // Only coverage-analysis handler should be called
      expect(handlers[0]).not.toHaveBeenCalled(); // test-generation
      expect(handlers[1]).toHaveBeenCalledTimes(1); // coverage-analysis
      expect(handlers[2]).not.toHaveBeenCalled(); // quality-assessment
      expect(handlers[3]).not.toHaveBeenCalled(); // defect-intelligence
    });

    it('should clean up indexes on unsubscribe', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const sub1 = eventBus.subscribe('test.event', handler1);
      const sub2 = eventBus.subscribe('test.event', handler2);

      // Unsubscribe first handler
      sub1.unsubscribe();

      await eventBus.publish({
        id: '1',
        type: 'test.event',
        timestamp: new Date(),
        source: 'test-generation',
        payload: {},
      });

      // Only handler2 should be called
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should handle wildcard subscriptions correctly', async () => {
      const wildcardHandler = vi.fn();
      const specificHandler = vi.fn();

      eventBus.subscribe('*', wildcardHandler);
      eventBus.subscribe('specific.event', specificHandler);

      await eventBus.publish({
        id: '1',
        type: 'specific.event',
        timestamp: new Date(),
        source: 'test-generation',
        payload: {},
      });

      await eventBus.publish({
        id: '2',
        type: 'other.event',
        timestamp: new Date(),
        source: 'test-generation',
        payload: {},
      });

      // Wildcard should receive both events
      expect(wildcardHandler).toHaveBeenCalledTimes(2);
      // Specific should only receive one
      expect(specificHandler).toHaveBeenCalledTimes(1);
    });

    it('should perform well with high publish volume', async () => {
      const handler = vi.fn();
      eventBus.subscribe('test.event', handler);

      const startTime = performance.now();

      // Publish 1000 events
      for (let i = 0; i < 1000; i++) {
        await eventBus.publish({
          id: String(i),
          type: 'test.event',
          timestamp: new Date(),
          source: 'test-generation',
          payload: { index: i },
        });
      }

      const duration = performance.now() - startTime;

      // Should complete in reasonable time (< 500ms for 1000 events)
      expect(duration).toBeLessThan(500);
      expect(handler).toHaveBeenCalledTimes(1000);
    });
  });
});
