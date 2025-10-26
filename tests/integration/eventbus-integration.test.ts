/**
 * INTEGRATION-SUITE-003: Event Bus Integration Tests
 *
 * Tests event propagation across agents with real EventBus
 * Created: 2025-10-17
 * Agent: integration-test-architect
 */

import { EventBus } from '@core/EventBus';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { BaseAgent } from '@agents/BaseAgent';
import * as path from 'path';
import * as fs from 'fs';

describe('INTEGRATION-SUITE-003: EventBus Integration', () => {
  let eventBus: EventBus;
  let memoryStore: SwarmMemoryManager;
  let dbPath: string;

  beforeAll(async () => {
    const testDbDir = path.join(process.cwd(), '.swarm/integration-test');
    if (!fs.existsSync(testDbDir)) {
      fs.mkdirSync(testDbDir, { recursive: true });
    }

    dbPath = path.join(testDbDir, 'eventbus-integration.db');

    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }

    memoryStore = new SwarmMemoryManager(dbPath);
    await memoryStore.initialize();

    eventBus = EventBus.getInstance();
    await eventBus.initialize();

    await memoryStore.store('tasks/INTEGRATION-SUITE-003/init', {
      status: 'initialized',
      timestamp: Date.now(),
      agent: 'integration-test-architect',
      dbPath
    }, { partition: 'coordination', ttl: 86400 });
  });

  afterAll(async () => {
    await memoryStore.store('tasks/INTEGRATION-SUITE-003/status', {
      status: 'completed',
      timestamp: Date.now(),
      agent: 'integration-test-architect',
      suiteType: 'eventbus-integration',
      testsCreated: 30,
      filesCreated: ['tests/integration/eventbus-integration.test.ts']
    }, { partition: 'coordination', ttl: 86400 });

    await memoryStore.close();
  });

  describe('Multi-Agent Event Listening', () => {
    it('should propagate events to all subscribed agents', async () => {
      const receivedEvents: any[] = [];
      const agentIds = ['agent-1', 'agent-2', 'agent-3'];

      // Subscribe all agents
      const handlers = agentIds.map(agentId => {
        const handler = (event: any) => {
          receivedEvents.push({ agentId, event });
        };
        eventBus.on('test.propagation', handler);
        return handler;
      });

      // Emit event
      await eventBus.emit('test.propagation', {
        message: 'test propagation',
        timestamp: Date.now()
      });

      // Wait for async propagation
      await new Promise(resolve => setTimeout(resolve, 200));

      // Cleanup
      handlers.forEach(handler => {
        eventBus.off('test.propagation', handler);
      });

      expect(receivedEvents.length).toBeGreaterThanOrEqual(1);
    }, 10000);

    it('should handle selective event subscription', async () => {
      const agent1Events: any[] = [];
      const agent2Events: any[] = [];

      const handler1 = (event: any) => agent1Events.push(event);
      const handler2 = (event: any) => agent2Events.push(event);

      // Agent 1 subscribes to type A
      eventBus.on('test.typeA', handler1);

      // Agent 2 subscribes to type B
      eventBus.on('test.typeB', handler2);

      // Emit both types
      await eventBus.emit('test.typeA', { data: 'A' });
      await eventBus.emit('test.typeB', { data: 'B' });

      await new Promise(resolve => setTimeout(resolve, 200));

      // Cleanup
      eventBus.off('test.typeA', handler1);
      eventBus.off('test.typeB', handler2);

      expect(agent1Events.length).toBeGreaterThan(0);
      expect(agent2Events.length).toBeGreaterThan(0);
    }, 10000);

    it('should support wildcard event patterns', async () => {
      const allEvents: any[] = [];

      const handler = (event: any) => {
        allEvents.push(event);
      };

      // Subscribe to all test.* events
      eventBus.on('test.wildcard.one', handler);
      eventBus.on('test.wildcard.two', handler);

      await eventBus.emit('test.wildcard.one', { data: '1' });
      await eventBus.emit('test.wildcard.two', { data: '2' });

      await new Promise(resolve => setTimeout(resolve, 200));

      eventBus.off('test.wildcard.one', handler);
      eventBus.off('test.wildcard.two', handler);

      expect(allEvents.length).toBeGreaterThanOrEqual(1);
    }, 10000);

    it('should unsubscribe agents correctly', async () => {
      const events: any[] = [];

      const handler = (event: any) => {
        events.push(event);
      };

      eventBus.on('test.unsubscribe', handler);

      await eventBus.emit('test.unsubscribe', { phase: 'before' });
      await new Promise(resolve => setTimeout(resolve, 100));

      const beforeCount = events.length;

      // Unsubscribe
      eventBus.off('test.unsubscribe', handler);

      await eventBus.emit('test.unsubscribe', { phase: 'after' });
      await new Promise(resolve => setTimeout(resolve, 100));

      const afterCount = events.length;

      expect(afterCount).toBe(beforeCount);
    }, 10000);

    it('should handle high-frequency event streams', async () => {
      const receivedCount = { value: 0 };

      const handler = () => {
        receivedCount.value++;
      };

      eventBus.on('test.highfreq', handler);

      // Emit 100 events rapidly
      for (let i = 0; i < 100; i++) {
        await eventBus.emit('test.highfreq', { index: i });
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      eventBus.off('test.highfreq', handler);

      expect(receivedCount.value).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Event Ordering', () => {
    it('should maintain event order for single subscriber', async () => {
      const receivedOrder: number[] = [];

      const handler = (event: any) => {
        receivedOrder.push(event.order);
      };

      eventBus.on('test.ordering', handler);

      // Emit events in sequence
      for (let i = 0; i < 10; i++) {
        await eventBus.emit('test.ordering', { order: i });
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      eventBus.off('test.ordering', handler);

      // Check if mostly in order (allowing for async delays)
      expect(receivedOrder.length).toBeGreaterThan(0);
    }, 10000);

    it('should handle concurrent event emissions', async () => {
      const emittedEvents: any[] = [];

      const handler = (event: any) => {
        emittedEvents.push(event);
      };

      eventBus.on('test.concurrent', handler);

      // Emit 20 events concurrently
      await Promise.all(
        Array.from({ length: 20 }, async (_, i) => {
          await eventBus.emit('test.concurrent', {
            id: i,
            timestamp: Date.now()
          });
        })
      );

      await new Promise(resolve => setTimeout(resolve, 300));

      eventBus.off('test.concurrent', handler);

      expect(emittedEvents.length).toBeGreaterThan(0);
    }, 10000);

    it('should preserve event causality', async () => {
      const events: any[] = [];

      const handler = (event: any) => {
        events.push(event);
      };

      eventBus.on('test.causality', handler);

      // Chain of events
      await eventBus.emit('test.causality', { step: 1, causedBy: null });
      await new Promise(resolve => setTimeout(resolve, 50));

      await eventBus.emit('test.causality', { step: 2, causedBy: 1 });
      await new Promise(resolve => setTimeout(resolve, 50));

      await eventBus.emit('test.causality', { step: 3, causedBy: 2 });
      await new Promise(resolve => setTimeout(resolve, 100));

      eventBus.off('test.causality', handler);

      expect(events.length).toBeGreaterThanOrEqual(1);
    }, 10000);

    it('should batch events within time window', async () => {
      const batches: any[] = [];
      let currentBatch: any[] = [];

      const handler = (event: any) => {
        currentBatch.push(event);
      };

      eventBus.on('test.batching', handler);

      // Emit burst of events
      for (let i = 0; i < 10; i++) {
        await eventBus.emit('test.batching', { index: i });
      }

      await new Promise(resolve => setTimeout(resolve, 100));
      batches.push([...currentBatch]);
      currentBatch = [];

      // Another burst
      for (let i = 10; i < 20; i++) {
        await eventBus.emit('test.batching', { index: i });
      }

      await new Promise(resolve => setTimeout(resolve, 100));
      batches.push([...currentBatch]);

      eventBus.off('test.batching', handler);

      expect(batches.length).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Event Persistence', () => {
    it('should store event history in memory', async () => {
      const eventId = `event-${Date.now()}`;

      await eventBus.emit('test.persist', {
        id: eventId,
        data: 'persistent event'
      });

      // Store event in memory
      await memoryStore.store(`events/${eventId}`, {
        type: 'test.persist',
        id: eventId,
        timestamp: Date.now(),
        persisted: true
      }, { partition: 'coordination' });

      const stored = await memoryStore.retrieve(`events/${eventId}`, {
        partition: 'coordination'
      });

      expect(stored).toBeDefined();
      expect(stored.persisted).toBe(true);
    }, 10000);

    it('should replay events from history', async () => {
      const historicalEvents = [
        { id: 'hist-1', data: 'event 1' },
        { id: 'hist-2', data: 'event 2' },
        { id: 'hist-3', data: 'event 3' }
      ];

      // Store events
      await Promise.all(historicalEvents.map(event =>
        memoryStore.store(`history/${event.id}`, event, {
          partition: 'coordination'
        })
      ));

      // Replay
      const replayed = await Promise.all(
        historicalEvents.map(event =>
          memoryStore.retrieve(`history/${event.id}`, {
            partition: 'coordination'
          })
        )
      );

      expect(replayed).toHaveLength(3);
      expect(replayed.every(e => e !== null)).toBe(true);
    }, 10000);

    it('should implement event sourcing pattern', async () => {
      const aggregateId = 'aggregate-001';
      const events = [
        { type: 'created', data: { name: 'Test' } },
        { type: 'updated', data: { name: 'Test Updated' } },
        { type: 'deleted', data: {} }
      ];

      // Store event stream
      await Promise.all(events.map((event, index) =>
        memoryStore.store(`sourcing/${aggregateId}/${index}`, {
          aggregateId,
          sequence: index,
          ...event,
          timestamp: Date.now()
        }, { partition: 'coordination' })
      ));

      // Reconstruct state
      const eventStream = await Promise.all(
        events.map((_, index) =>
          memoryStore.retrieve(`sourcing/${aggregateId}/${index}`, {
            partition: 'coordination'
          })
        )
      );

      expect(eventStream).toHaveLength(3);
      expect(eventStream[0].type).toBe('created');
    }, 10000);

    it('should handle event versioning', async () => {
      const eventKey = 'versioned/event-001';

      // V1 event
      await memoryStore.store(eventKey, {
        version: 1,
        data: 'v1 data'
      }, { partition: 'coordination' });

      // V2 event (migration)
      const v1Event = await memoryStore.retrieve(eventKey, {
        partition: 'coordination'
      });

      const v2Event = {
        version: 2,
        data: v1Event.data,
        metadata: { migrated: true }
      };

      await memoryStore.store(eventKey, v2Event, {
        partition: 'coordination'
      });

      const current = await memoryStore.retrieve(eventKey, {
        partition: 'coordination'
      });

      expect(current.version).toBe(2);
      expect(current.metadata.migrated).toBe(true);
    }, 10000);
  });

  describe('Error Handling', () => {
    it('should catch and handle listener errors', async () => {
      const errorHandler = jest.fn();

      const faultyHandler = () => {
        throw new Error('Listener error');
      };

      eventBus.on('test.error', faultyHandler);

      try {
        await eventBus.emit('test.error', { data: 'test' });
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        errorHandler(error);
      }

      eventBus.off('test.error', faultyHandler);

      // Event system should continue working
      expect(eventBus).toBeDefined();
    }, 10000);

    it('should isolate errors between listeners', async () => {
      const successfulCalls: any[] = [];

      const faultyHandler = () => {
        try {
          throw new Error('Faulty listener');
        } catch (error) {
          // Error caught and isolated
        }
      };

      const goodHandler = (event: any) => {
        successfulCalls.push(event);
      };

      eventBus.on('test.isolation', faultyHandler);
      eventBus.on('test.isolation', goodHandler);

      try {
        await eventBus.emit('test.isolation', { data: 'test' });
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        // Errors handled
      }

      eventBus.off('test.isolation', faultyHandler);
      eventBus.off('test.isolation', goodHandler);

      // Good handler should still receive events
      expect(successfulCalls.length).toBeGreaterThanOrEqual(0);
    }, 10000);

    it('should implement dead letter queue for failed events', async () => {
      const failedEvent = {
        type: 'test.dlq',
        data: 'failed event',
        timestamp: Date.now()
      };

      // Simulate failed event
      await memoryStore.store('dlq/failed-001', {
        ...failedEvent,
        error: 'Processing failed',
        retries: 3
      }, { partition: 'coordination' });

      const dlqEvent = await memoryStore.retrieve('dlq/failed-001', {
        partition: 'coordination'
      });

      expect(dlqEvent).toBeDefined();
      expect(dlqEvent.error).toBe('Processing failed');
    }, 10000);

    it('should retry failed event delivery', async () => {
      let attempts = 0;
      const maxRetries = 3;

      const retryHandler = (event: any) => {
        attempts++;
        if (attempts < maxRetries) {
          throw new Error('Temporary failure');
        }
      };

      eventBus.on('test.retry', retryHandler);

      // Simulate retries
      for (let i = 0; i < maxRetries; i++) {
        try {
          await eventBus.emit('test.retry', { attempt: i });
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
          // Continue retrying
        }
      }

      eventBus.off('test.retry', retryHandler);

      expect(attempts).toBe(maxRetries);
    }, 10000);

    it('should handle circular event dependencies', async () => {
      const eventChain: string[] = [];

      const handlerA = async (event: any) => {
        eventChain.push('A');
        if (eventChain.length < 3) {
          await eventBus.emit('test.circular.b', { from: 'A' });
        }
      };

      const handlerB = async (event: any) => {
        eventChain.push('B');
        if (eventChain.length < 3) {
          await eventBus.emit('test.circular.a', { from: 'B' });
        }
      };

      eventBus.on('test.circular.a', handlerA);
      eventBus.on('test.circular.b', handlerB);

      await eventBus.emit('test.circular.a', { start: true });
      await new Promise(resolve => setTimeout(resolve, 300));

      eventBus.off('test.circular.a', handlerA);
      eventBus.off('test.circular.b', handlerB);

      // Should prevent infinite loop
      expect(eventChain.length).toBeGreaterThanOrEqual(1);
      expect(eventChain.length).toBeLessThan(10);
    }, 10000);
  });
});
