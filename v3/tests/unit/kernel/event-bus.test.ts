/**
 * Agentic QE v3 - Event Bus Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InMemoryEventBus } from '../../../src/kernel/event-bus';
import { DomainEvent } from '../../../src/shared/types';

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
});
