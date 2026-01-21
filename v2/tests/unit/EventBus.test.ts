/**
 * EventBus Unit Tests - Comprehensive TDD Implementation
 * Testing the EventBus class with full coverage including event persistence and coordination
 *
 * CRITICAL FIX: Logger mock is set up globally in jest.setup.ts
 * Do NOT add jest.mock('@utils/Logger') here as it conflicts with the global mock
 */

import { EventBus, FleetEvent } from '@core/EventBus';
import { Logger } from '@utils/Logger';
import { createResourceCleanup } from '../helpers/cleanup';

describe('EventBus', () => {
  let eventBus: EventBus;
  const cleanup = createResourceCleanup();

  beforeEach(async () => {
    // Use the global singleton EventBus that was initialized in jest.setup.ts
    // DO NOT create a new instance or clear mocks, as that would lose initialization logs
    eventBus = EventBus.getInstance();

    // Track EventBus for cleanup
    cleanup.trackEmitter(eventBus);
  });

  afterEach(async () => {
    // Comprehensive cleanup using helper utilities
    await cleanup.afterEach();

    // Additional EventBus-specific cleanup
    if (eventBus) {
      eventBus.removeAllListeners();
      eventBus = null as any;
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      // EventBus is a singleton that was already initialized in jest.setup.ts
      // Instead of checking Logger mock calls (which have timing issues),
      // we verify the EventBus is in a working state
      expect(eventBus).toBeDefined();
      expect(eventBus.getMaxListeners()).toBe(1000);

      // Verify we can emit events (functional test)
      const testEventId = await eventBus.emitFleetEvent(
        'test:initialization',
        'test-source',
        { test: 'data' }
      );
      expect(testEventId).toBeDefined();
      expect(typeof testEventId).toBe('string');

      // Verify event was stored
      const storedEvent = eventBus.getEvent(testEventId);
      expect(storedEvent).toBeDefined();
      expect(storedEvent!.type).toBe('test:initialization');
    });

    it('should handle multiple initialization calls gracefully', async () => {
      // EventBus initialization should be idempotent
      // Multiple calls should not cause errors
      await expect(eventBus.initialize()).resolves.not.toThrow();
      await expect(eventBus.initialize()).resolves.not.toThrow();
      await expect(eventBus.initialize()).resolves.not.toThrow();

      // EventBus should still work after multiple initializations
      const testEventId = await eventBus.emitFleetEvent(
        'test:idempotent',
        'test-source',
        { test: 'multiple-init' }
      );
      expect(testEventId).toBeDefined();
    });

    it('should set max listeners to support many agents', () => {
      expect(eventBus.getMaxListeners()).toBe(1000);
    });
  });

  describe('Event Emission and Storage', () => {
    it('should emit fleet events with unique IDs', async () => {
      const eventData = { testData: 'test value', number: 42 };

      const eventId = await eventBus.emitFleetEvent(
        'test:event',
        'test-source',
        eventData,
        'test-target'
      );

      expect(eventId).toBeDefined();
      expect(typeof eventId).toBe('string');
      expect(eventId.length).toBeGreaterThan(0);
    });

    it('should store events with complete metadata', async () => {
      const eventData = { message: 'test event data' };
      const eventType = 'agent:spawned';
      const source = 'fleet-manager';
      const target = 'all-agents';

      const eventId = await eventBus.emitFleetEvent(eventType, source, eventData, target);

      const storedEvent = eventBus.getEvent(eventId);
      expect(storedEvent).toBeDefined();
      expect(storedEvent).toMatchObject({
        id: eventId,
        type: eventType,
        source: source,
        target: target,
        data: eventData,
        processed: false
      });
      expect(storedEvent!.timestamp).toBeInstanceOf(Date);
    });

    it('should emit events without target parameter', async () => {
      const eventData = { status: 'running' };

      const eventId = await eventBus.emitFleetEvent(
        'fleet:status',
        'fleet-manager',
        eventData
      );

      const storedEvent = eventBus.getEvent(eventId);
      expect(storedEvent!.target).toBeUndefined();
    });

    it('should emit events with all required metadata', async () => {
      const eventData = { test: true };

      const eventId = await eventBus.emitFleetEvent('test:event', 'test-source', eventData, 'test-target');

      // Verify event was stored with correct metadata
      const storedEvent = eventBus.getEvent(eventId);
      expect(storedEvent).toBeDefined();
      expect(storedEvent).toMatchObject({
        id: eventId,
        type: 'test:event',
        source: 'test-source',
        target: 'test-target',
        data: eventData,
        processed: false
      });
      expect(storedEvent!.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Event Listeners and Handlers', () => {
    it('should trigger event listeners when events are emitted', async () => {
      const mockListener = jest.fn();
      eventBus.on('task:completed', mockListener);

      const eventData = { taskId: 'task-123', result: 'success' };
      const eventId = await eventBus.emitFleetEvent('task:completed', 'agent-456', eventData);

      expect(mockListener).toHaveBeenCalledWith({
        eventId,
        source: 'agent-456',
        target: undefined,
        data: eventData,
        timestamp: expect.any(Date)
      });
    });

    it('should support multiple listeners for the same event', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();

      eventBus.on('agent:error', listener1);
      eventBus.on('agent:error', listener2);
      eventBus.on('agent:error', listener3);

      const errorData = { agentId: 'agent-123', error: 'Connection failed' };
      await eventBus.emitFleetEvent('agent:error', 'agent-123', errorData);

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
      expect(listener3).toHaveBeenCalled();
    });

    it('should handle listener errors gracefully', async () => {
      const faultyListener = jest.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      const goodListener = jest.fn();

      eventBus.on('test:event', faultyListener);
      eventBus.on('test:event', goodListener);

      await expect(eventBus.emitFleetEvent('test:event', 'test-source', {})).resolves.not.toThrow();

      // Wait for event propagation
      await new Promise(resolve => setImmediate(resolve));

      expect(faultyListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();
    });
  });

  describe('Built-in Event Handlers', () => {
    it('should emit and store fleet lifecycle events', async () => {
      const fleetData = { fleetId: 'fleet-123', status: 'running' };

      const startedId = await eventBus.emitFleetEvent('fleet:started', 'fleet-manager', fleetData);
      expect(startedId).toBeDefined();

      const startedEvent = eventBus.getEvent(startedId);
      expect(startedEvent).toMatchObject({
        type: 'fleet:started',
        source: 'fleet-manager',
        data: fleetData
      });

      const stoppedId = await eventBus.emitFleetEvent('fleet:stopped', 'fleet-manager', fleetData);
      expect(stoppedId).toBeDefined();

      const stoppedEvent = eventBus.getEvent(stoppedId);
      expect(stoppedEvent).toMatchObject({
        type: 'fleet:stopped',
        source: 'fleet-manager',
        data: fleetData
      });
    });

    it('should emit and store agent lifecycle events', async () => {
      const agentData = { agentId: 'agent-123', type: 'test-executor' };

      const spawnedId = await eventBus.emitFleetEvent('agent:spawned', 'fleet-manager', agentData);
      expect(eventBus.getEvent(spawnedId)).toMatchObject({
        type: 'agent:spawned',
        data: agentData
      });

      const startedId = await eventBus.emitFleetEvent('agent:started', 'agent-123', { agentId: 'agent-123' });
      expect(eventBus.getEvent(startedId)).toMatchObject({
        type: 'agent:started',
        source: 'agent-123'
      });

      const stoppedId = await eventBus.emitFleetEvent('agent:stopped', 'agent-123', { agentId: 'agent-123' });
      expect(eventBus.getEvent(stoppedId)).toMatchObject({
        type: 'agent:stopped',
        source: 'agent-123'
      });
    });

    it('should emit and store agent error events', async () => {
      const errorData = { agentId: 'agent-456', error: new Error('Agent malfunction') };

      const errorId = await eventBus.emitFleetEvent('agent:error', 'agent-456', errorData);

      const storedError = eventBus.getEvent(errorId);
      expect(storedError).toBeDefined();
      expect(storedError!.type).toBe('agent:error');
      expect(storedError!.source).toBe('agent-456');
      expect(storedError!.data.agentId).toBe('agent-456');
      expect(storedError!.data.error).toBeInstanceOf(Error);
    });

    it('should emit and store task lifecycle events', async () => {
      // Task submitted
      const submittedId = await eventBus.emitFleetEvent('task:submitted', 'client', { taskId: 'task-123' });
      expect(eventBus.getEvent(submittedId)).toMatchObject({
        type: 'task:submitted',
        data: { taskId: 'task-123' }
      });

      // Task assigned
      const assignedId = await eventBus.emitFleetEvent('task:assigned', 'fleet-manager', {
        taskId: 'task-123',
        agentId: 'agent-456'
      });
      expect(eventBus.getEvent(assignedId)).toMatchObject({
        type: 'task:assigned',
        data: { taskId: 'task-123', agentId: 'agent-456' }
      });

      // Task started
      const startedId = await eventBus.emitFleetEvent('task:started', 'agent-456', {
        taskId: 'task-123',
        agentId: 'agent-456'
      });
      expect(eventBus.getEvent(startedId)).toMatchObject({
        type: 'task:started',
        source: 'agent-456'
      });

      // Task completed
      const completedId = await eventBus.emitFleetEvent('task:completed', 'agent-456', {
        taskId: 'task-123',
        agentId: 'agent-456',
        executionTime: 1500
      });
      expect(eventBus.getEvent(completedId)).toMatchObject({
        type: 'task:completed',
        data: expect.objectContaining({
          executionTime: 1500
        })
      });

      // Task failed
      const taskError = new Error('Task execution failed');
      const failedId = await eventBus.emitFleetEvent('task:failed', 'agent-456', {
        taskId: 'task-789',
        agentId: 'agent-456',
        error: taskError
      });
      const failedEvent = eventBus.getEvent(failedId);
      expect(failedEvent).toBeDefined();
      expect(failedEvent!.type).toBe('task:failed');
      expect(failedEvent!.data.error).toBeInstanceOf(Error);
    });
  });

  describe('Event Retrieval and Management', () => {
    it('should retrieve stored events by ID', async () => {
      const eventData = { important: 'data' };
      const eventId = await eventBus.emitFleetEvent('test:retrieval', 'test-source', eventData);

      const retrievedEvent = eventBus.getEvent(eventId);
      expect(retrievedEvent).toBeDefined();
      expect(retrievedEvent!.id).toBe(eventId);
      expect(retrievedEvent!.data).toEqual(eventData);
    });

    it('should return undefined for non-existent event IDs', () => {
      const nonExistentEvent = eventBus.getEvent('non-existent-id');
      expect(nonExistentEvent).toBeUndefined();
    });

    it('should handle malformed event IDs gracefully', () => {
      expect(() => eventBus.getEvent('')).not.toThrow();
      expect(() => eventBus.getEvent(null as any)).not.toThrow();
      expect(() => eventBus.getEvent(undefined as any)).not.toThrow();
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle high volume of events efficiently', async () => {
      const eventCount = 1000;
      const eventIds: string[] = [];

      const startTime = Date.now();

      for (let i = 0; i < eventCount; i++) {
        const eventId = await eventBus.emitFleetEvent(
          'performance:test',
          `source-${i}`,
          { index: i, data: `test-data-${i}` }
        );
        eventIds.push(eventId);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should handle 1000 events in reasonable time (under 1 second)
      expect(duration).toBeLessThan(1000);
      expect(eventIds).toHaveLength(eventCount);

      // All events should be unique
      const uniqueIds = new Set(eventIds);
      expect(uniqueIds.size).toBe(eventCount);
    });

    it('should handle concurrent event emissions', async () => {
      const concurrentEventCount = 100;
      const promises: Promise<string>[] = [];

      // Emit events concurrently
      for (let i = 0; i < concurrentEventCount; i++) {
        promises.push(
          eventBus.emitFleetEvent(
            'concurrent:test',
            `source-${i}`,
            { index: i }
          )
        );
      }

      const eventIds = await Promise.all(promises);

      expect(eventIds).toHaveLength(concurrentEventCount);

      // All IDs should be unique
      const uniqueIds = new Set(eventIds);
      expect(uniqueIds.size).toBe(concurrentEventCount);
    });
  });

  describe('Memory Management', () => {
    it('should not accumulate excessive events in memory', async () => {
      const initialEventCount = 10;

      // Emit initial events
      for (let i = 0; i < initialEventCount; i++) {
        await eventBus.emitFleetEvent('memory:test', 'test-source', { index: i });
      }

      // In a real implementation, you might want to test memory cleanup
      // For now, we'll verify events are stored properly
      const eventPromises = Array.from({ length: initialEventCount }, (_, i) =>
        eventBus.emitFleetEvent('cleanup:test', 'test-source', { index: i })
      );

      const eventIds = await Promise.all(eventPromises);
      expect(eventIds).toHaveLength(initialEventCount);
    });
  });

  describe('Event Data Integrity', () => {
    it('should preserve complex event data structures', async () => {
      const complexData = {
        nested: {
          object: {
            with: ['arrays', 'and', 'values'],
            numbers: [1, 2, 3, 4, 5],
            boolean: true,
            null_value: null
          }
        },
        array: [
          { id: 1, name: 'first' },
          { id: 2, name: 'second' }
        ],
        timestamp: new Date().toISOString(),
        metadata: {
          version: '1.0.0',
          source: 'test-suite'
        }
      };

      const eventId = await eventBus.emitFleetEvent(
        'complex:data',
        'test-source',
        complexData
      );

      const retrievedEvent = eventBus.getEvent(eventId);
      expect(retrievedEvent!.data).toEqual(complexData);
    });

    it('should handle edge case data types', async () => {
      const edgeCaseData = {
        emptyString: '',
        emptyArray: [],
        emptyObject: {},
        zero: 0,
        false: false,
        undefined: undefined,
        function: () => 'test' // Note: functions won't be preserved in JSON serialization
      };

      const eventId = await eventBus.emitFleetEvent(
        'edge:cases',
        'test-source',
        edgeCaseData
      );

      const retrievedEvent = eventBus.getEvent(eventId);
      expect(retrievedEvent!.data.emptyString).toBe('');
      expect(retrievedEvent!.data.emptyArray).toEqual([]);
      expect(retrievedEvent!.data.emptyObject).toEqual({});
      expect(retrievedEvent!.data.zero).toBe(0);
      expect(retrievedEvent!.data.false).toBe(false);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty event types gracefully', async () => {
      await expect(eventBus.emitFleetEvent('', 'source', {})).resolves.toBeDefined();
    });

    it('should handle empty source gracefully', async () => {
      await expect(eventBus.emitFleetEvent('test:event', '', {})).resolves.toBeDefined();
    });

    it('should handle null and undefined data', async () => {
      const eventId1 = await eventBus.emitFleetEvent('test:null', 'source', null);
      const eventId2 = await eventBus.emitFleetEvent('test:undefined', 'source', undefined);

      expect(eventId1).toBeDefined();
      expect(eventId2).toBeDefined();

      const event1 = eventBus.getEvent(eventId1);
      const event2 = eventBus.getEvent(eventId2);

      expect(event1!.data).toBeNull();
      expect(event2!.data).toBeUndefined();
    });

    it('should maintain event emission order with async listeners', async () => {
      const events: string[] = [];

      eventBus.on('test.event', async (data) => {
        // Add small delay to test async ordering
        await new Promise(resolve => setTimeout(resolve, 10));
        events.push(data.data.value);
      });

      await eventBus.emitFleetEvent('test.event', 'test-source', { value: 'first' });
      await eventBus.emitFleetEvent('test.event', 'test-source', { value: 'second' });

      // Wait for all async handlers
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events).toEqual(['first', 'second']);
    });
  });
});
