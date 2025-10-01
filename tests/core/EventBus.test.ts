/**
 * EventBus Test Suite - Core Module Priority #3
 * Tests event system, pub/sub, and inter-agent communication
 */

import { EventBus } from '../../src/core/EventBus';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    jest.clearAllMocks();
    eventBus = new EventBus();
  });

  afterEach(async () => {
    // Wait for all async operations to complete
    await new Promise(resolve => setImmediate(resolve));

    // Remove all listeners to prevent memory leaks
    if (eventBus) {
      eventBus.removeAllListeners();
    }

    // Clear references
    eventBus = null as any;
  });

  describe('basic event operations', () => {
    it('should emit and handle events', () => {
      const handler = jest.fn();
      eventBus.on('test-event', handler);

      eventBus.emit('test-event', { data: 'test' });

      expect(handler).toHaveBeenCalledWith({ data: 'test' });
    });

    it('should handle multiple listeners for same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      eventBus.on('test-event', handler1);
      eventBus.on('test-event', handler2);

      eventBus.emit('test-event', { data: 'test' });

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should remove event listeners', () => {
      const handler = jest.fn();
      eventBus.on('test-event', handler);

      eventBus.off('test-event', handler);
      eventBus.emit('test-event', { data: 'test' });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle one-time listeners', () => {
      const handler = jest.fn();
      eventBus.once('test-event', handler);

      eventBus.emit('test-event', { data: 'test1' });
      eventBus.emit('test-event', { data: 'test2' });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ data: 'test1' });
    });
  });

  describe('async event handling', () => {
    it('should handle async event listeners', async () => {
      const results: string[] = [];

      eventBus.on('async-event', async (data) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push(data.value);
      });

      await eventBus.emitAsync('async-event', { value: 'async-test' });

      expect(results).toContain('async-test');
    });

    it('should wait for all async listeners', async () => {
      const results: string[] = [];

      eventBus.on('async-event', async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        results.push('listener1');
      });

      eventBus.on('async-event', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push('listener2');
      });

      await eventBus.emitAsync('async-event', {});

      expect(results).toHaveLength(2);
      expect(results).toContain('listener1');
      expect(results).toContain('listener2');
    });

    it('should handle async listener errors', async () => {
      const successHandler = jest.fn();
      const errorHandler = jest.fn();

      eventBus.on('error-event', async () => {
        throw new Error('Async error');
      });

      eventBus.on('error-event', successHandler);
      eventBus.on('error', errorHandler);

      await eventBus.emitAsync('error-event', {});

      expect(successHandler).toHaveBeenCalled();
      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('namespaced events', () => {
    it('should handle namespaced events', () => {
      const agentHandler = jest.fn();
      const taskHandler = jest.fn();
      const allHandler = jest.fn();

      eventBus.on('agent:started', agentHandler);
      eventBus.on('task:completed', taskHandler);
      eventBus.on('*', allHandler);

      eventBus.emit('agent:started', { agentId: 'agent-1' });
      eventBus.emit('task:completed', { taskId: 'task-1' });

      expect(agentHandler).toHaveBeenCalledWith({ agentId: 'agent-1' });
      expect(taskHandler).toHaveBeenCalledWith({ taskId: 'task-1' });
      expect(allHandler).toHaveBeenCalledTimes(2);
    });

    it('should support wildcard listeners', () => {
      const wildcardHandler = jest.fn();

      eventBus.on('agent:*', wildcardHandler);

      eventBus.emit('agent:started', { agentId: 'agent-1' });
      eventBus.emit('agent:stopped', { agentId: 'agent-1' });
      eventBus.emit('task:completed', { taskId: 'task-1' });

      expect(wildcardHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('should handle listener errors gracefully', () => {
      const errorHandler = jest.fn();
      const normalHandler = jest.fn();

      eventBus.on('error', errorHandler);
      eventBus.on('test-event', () => {
        throw new Error('Handler error');
      });
      eventBus.on('test-event', normalHandler);

      expect(() => {
        eventBus.emit('test-event', {});
      }).not.toThrow();

      expect(errorHandler).toHaveBeenCalled();
      expect(normalHandler).toHaveBeenCalled();
    });

    it('should provide error context', () => {
      const errorHandler = jest.fn();

      eventBus.on('error', errorHandler);
      eventBus.on('test-event', () => {
        throw new Error('Test error');
      });

      eventBus.emit('test-event', { testData: 'value' });

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
          event: 'test-event',
          data: { testData: 'value' }
        })
      );
    });
  });

  describe('performance and scalability', () => {
    it('should handle high-frequency events', () => {
      const handler = jest.fn();
      eventBus.on('high-freq-event', handler);

      const eventCount = 1000;
      for (let i = 0; i < eventCount; i++) {
        eventBus.emit('high-freq-event', { index: i });
      }

      expect(handler).toHaveBeenCalledTimes(eventCount);
    });

    it('should handle many listeners efficiently', () => {
      const handlerCount = 100;
      const handlers = Array.from({ length: handlerCount }, () => jest.fn());

      handlers.forEach(handler => {
        eventBus.on('many-listeners-event', handler);
      });

      eventBus.emit('many-listeners-event', { data: 'test' });

      handlers.forEach(handler => {
        expect(handler).toHaveBeenCalledWith({ data: 'test' });
      });
    });

    it('should cleanup listeners to prevent memory leaks', () => {
      const handler = jest.fn();

      for (let i = 0; i < 10; i++) {
        eventBus.on('temp-event', handler);
      }

      expect(eventBus.listenerCount('temp-event')).toBe(10);

      eventBus.removeAllListeners('temp-event');
      expect(eventBus.listenerCount('temp-event')).toBe(0);
    });
  });

  describe('event filtering and middleware', () => {
    it('should support event filtering', () => {
      const handler = jest.fn();

      eventBus.on('filtered-event', handler, {
        filter: (data) => data.priority === 'high'
      });

      eventBus.emit('filtered-event', { priority: 'low', data: 'test1' });
      eventBus.emit('filtered-event', { priority: 'high', data: 'test2' });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ priority: 'high', data: 'test2' });
    });

    it('should support event transformation middleware', () => {
      const handler = jest.fn();

      eventBus.on('transform-event', handler, {
        transform: (data) => ({ ...data, transformed: true })
      });

      eventBus.emit('transform-event', { original: 'data' });

      expect(handler).toHaveBeenCalledWith({
        original: 'data',
        transformed: true
      });
    });
  });
});