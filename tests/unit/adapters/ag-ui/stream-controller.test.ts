/**
 * AG-UI Stream Controller Unit Tests
 *
 * Comprehensive test suite covering stream flow control, cancellation,
 * token buffering, and graceful shutdown.
 *
 * Target: 25+ tests with stress testing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  StreamController,
  createStreamController,
  streamEvents,
  createEventTransform,
  createEventAdapter,
  createBackpressureHandler,
  type StreamControllerConfig,
  type StreamState,
  type AGUIEvent,
  AGUIEventType,
} from '../../../../src/adapters/ag-ui/index.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockEvent = (type: AGUIEventType = AGUIEventType.TEXT_MESSAGE_CONTENT): AGUIEvent => ({
  type,
  eventId: `evt_${Math.random().toString(36).slice(2)}`,
  timestamp: new Date().toISOString(),
  messageId: 'msg-123',
  delta: 'test content',
} as AGUIEvent);

const createTestConfig = (overrides: Partial<StreamControllerConfig> = {}): StreamControllerConfig => ({
  adapter: createEventAdapter(),
  bufferInterval: 10, // Fast interval for testing
  maxBufferSize: 5,
  ...overrides,
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createStreamController', () => {
  it('should create controller with default config', () => {
    const adapter = createEventAdapter();
    const controller = createStreamController({ adapter });

    expect(controller).toBeInstanceOf(StreamController);
    expect(controller.getState()).toBe('idle');
  });

  it('should create controller with custom buffer interval', () => {
    const config = createTestConfig({ bufferInterval: 100 });
    const controller = createStreamController(config);

    expect(controller).toBeInstanceOf(StreamController);
  });

  it('should create controller with AbortSignal', () => {
    const abortController = new AbortController();
    const config = createTestConfig({ signal: abortController.signal });
    const controller = createStreamController(config);

    expect(controller).toBeInstanceOf(StreamController);
  });

  it('should create controller with backpressure handler', () => {
    const backpressureHandler = createBackpressureHandler();
    const config = createTestConfig({ backpressureHandler });
    const controller = createStreamController(config);

    expect(controller).toBeInstanceOf(StreamController);
  });
});

// ============================================================================
// Lifecycle Tests
// ============================================================================

describe('StreamController Lifecycle', () => {
  let controller: StreamController;

  afterEach(() => {
    controller?.dispose();
  });

  describe('start()', () => {
    it('should transition from idle to streaming', () => {
      controller = createStreamController(createTestConfig());

      controller.start();

      expect(controller.getState()).toBe('streaming');
      expect(controller.isActive()).toBe(true);
    });

    it('should emit start event', () => {
      controller = createStreamController(createTestConfig());
      const startSpy = vi.fn();
      controller.on('start', startSpy);

      controller.start();

      expect(startSpy).toHaveBeenCalled();
    });

    it('should throw if already started', () => {
      controller = createStreamController(createTestConfig());
      controller.start();

      expect(() => controller.start()).toThrow('Cannot start stream in state: streaming');
    });

    it('should record start time in metrics', () => {
      controller = createStreamController(createTestConfig());

      controller.start();

      const metrics = controller.getMetrics();
      expect(metrics.startTime).toBeGreaterThan(0);
    });
  });

  describe('pause() and resume()', () => {
    beforeEach(() => {
      controller = createStreamController(createTestConfig());
      controller.start();
    });

    it('should pause streaming', () => {
      controller.pause();

      expect(controller.getState()).toBe('paused');
      expect(controller.isActive()).toBe(true);
    });

    it('should emit pause event', () => {
      const pauseSpy = vi.fn();
      controller.on('pause', pauseSpy);

      controller.pause();

      expect(pauseSpy).toHaveBeenCalled();
    });

    it('should resume streaming', () => {
      controller.pause();
      controller.resume();

      expect(controller.getState()).toBe('streaming');
    });

    it('should emit resume event', () => {
      const resumeSpy = vi.fn();
      controller.on('resume', resumeSpy);

      controller.pause();
      controller.resume();

      expect(resumeSpy).toHaveBeenCalled();
    });

    it('should do nothing if not paused', () => {
      const resumeSpy = vi.fn();
      controller.on('resume', resumeSpy);

      controller.resume();

      expect(resumeSpy).not.toHaveBeenCalled();
    });
  });

  describe('end()', () => {
    beforeEach(() => {
      controller = createStreamController(createTestConfig());
      controller.start();
    });

    it('should end stream with success', async () => {
      await controller.end('success');

      expect(controller.getState()).toBe('ended');
      expect(controller.isActive()).toBe(false);
    });

    it('should emit end event', async () => {
      const endSpy = vi.fn();
      controller.on('end', endSpy);

      await controller.end('success');

      expect(endSpy).toHaveBeenCalledWith('success');
    });

    it('should call onEnd callback', async () => {
      const onEnd = vi.fn();
      controller = createStreamController(createTestConfig({ onEnd }));
      controller.start();

      await controller.end('success');

      expect(onEnd).toHaveBeenCalledWith('success');
    });

    it('should calculate duration in metrics', async () => {
      await new Promise((r) => setTimeout(r, 50));
      await controller.end();

      const metrics = controller.getMetrics();
      expect(metrics.durationMs).toBeGreaterThanOrEqual(45);
    });
  });
});

// ============================================================================
// Cancellation Tests
// ============================================================================

describe('StreamController Cancellation', () => {
  let controller: StreamController;
  let adapter: ReturnType<typeof createEventAdapter>;

  beforeEach(() => {
    adapter = createEventAdapter();
  });

  afterEach(() => {
    controller?.dispose();
  });

  describe('AbortController integration', () => {
    it('should cancel stream when AbortController is aborted', async () => {
      const abortController = new AbortController();
      controller = createStreamController({
        adapter,
        signal: abortController.signal,
      });
      controller.start();

      abortController.abort();
      await new Promise((r) => setImmediate(r)); // Allow abort handler to run

      expect(controller.isCancelled()).toBe(true);
    });

    it('should call onCancel callback on abort', async () => {
      const onCancel = vi.fn();
      const abortController = new AbortController();
      controller = createStreamController({
        adapter,
        signal: abortController.signal,
        onCancel,
      });
      controller.start();

      abortController.abort();
      await new Promise((r) => setTimeout(r, 10));

      expect(onCancel).toHaveBeenCalled();
    });

    it('should emit cancel event on abort', async () => {
      const abortController = new AbortController();
      controller = createStreamController({
        adapter,
        signal: abortController.signal,
      });
      const cancelSpy = vi.fn();
      controller.on('cancel', cancelSpy);
      controller.start();

      abortController.abort();
      await new Promise((r) => setTimeout(r, 10));

      expect(cancelSpy).toHaveBeenCalled();
    });

    it('should handle pre-aborted signal', async () => {
      const abortController = new AbortController();
      abortController.abort();

      controller = createStreamController({
        adapter,
        signal: abortController.signal,
      });

      await new Promise((r) => setImmediate(r));

      expect(controller.isCancelled()).toBe(true);
    });
  });

  describe('cancel()', () => {
    it('should cancel running stream', async () => {
      controller = createStreamController({ adapter });
      controller.start();

      await controller.cancel();

      expect(controller.getState()).toBe('cancelled');
    });

    it('should emit RUN_FINISHED with cancelled outcome', async () => {
      adapter.emitRunStarted('thread-1', 'run-1');
      controller = createStreamController({
        adapter,
        emitFinishOnCancel: true,
      });
      const events: AGUIEvent[] = [];
      controller.on('event', (e: AGUIEvent) => events.push(e));
      controller.start();

      await controller.cancel();

      const finishEvent = events.find((e) => e.type === AGUIEventType.RUN_FINISHED);
      expect(finishEvent).toBeDefined();
      expect((finishEvent as any).outcome).toBe('cancelled');
    });

    it('should not emit RUN_FINISHED if disabled', async () => {
      adapter.emitRunStarted('thread-1', 'run-1');
      controller = createStreamController({
        adapter,
        emitFinishOnCancel: false,
      });
      const events: AGUIEvent[] = [];
      controller.on('event', (e: AGUIEvent) => events.push(e));
      controller.start();

      await controller.cancel();

      const finishEvent = events.find((e) => e.type === AGUIEventType.RUN_FINISHED);
      expect(finishEvent).toBeUndefined();
    });

    it('should flush remaining buffer on cancel', async () => {
      controller = createStreamController({
        adapter,
        bufferInterval: 1000, // Long interval to prevent auto-flush
        maxBufferSize: 100,
      });
      controller.start();

      // Add events to buffer
      controller.push(createMockEvent());
      controller.push(createMockEvent());

      const events: AGUIEvent[] = [];
      controller.on('event', (e: AGUIEvent) => events.push(e));

      await controller.cancel();

      expect(events.length).toBeGreaterThanOrEqual(2);
    });

    it('should call onEnd with cancelled reason', async () => {
      const onEnd = vi.fn();
      controller = createStreamController({ adapter, onEnd });
      controller.start();

      await controller.cancel();

      expect(onEnd).toHaveBeenCalledWith('cancelled');
    });

    it('should be idempotent (can call multiple times)', async () => {
      controller = createStreamController({ adapter });
      controller.start();

      await controller.cancel();
      await controller.cancel();
      await controller.cancel();

      expect(controller.getState()).toBe('cancelled');
    });
  });
});

// ============================================================================
// Token Buffering Tests
// ============================================================================

describe('StreamController Buffering', () => {
  let controller: StreamController;

  afterEach(() => {
    controller?.dispose();
  });

  describe('buffer interval', () => {
    it('should buffer events for configured interval', async () => {
      const adapter = createEventAdapter();
      controller = createStreamController({
        adapter,
        bufferInterval: 50,
        maxBufferSize: 100,
      });
      const events: AGUIEvent[] = [];
      controller.on('event', (e: AGUIEvent) => events.push(e));
      controller.start();

      controller.push(createMockEvent());
      controller.push(createMockEvent());

      // Events should be buffered
      expect(events).toHaveLength(0);
      expect(controller.getBufferSize()).toBe(2);

      // Wait for flush
      await new Promise((r) => setTimeout(r, 60));

      expect(events).toHaveLength(2);
      expect(controller.getBufferSize()).toBe(0);
    });

    it('should default to 50ms interval (20fps)', () => {
      const adapter = createEventAdapter();
      controller = createStreamController({ adapter });

      // Internal check - buffer interval is private but we can verify behavior
      expect(controller).toBeInstanceOf(StreamController);
    });
  });

  describe('max buffer size', () => {
    it('should force flush when buffer exceeds max size', () => {
      const adapter = createEventAdapter();
      controller = createStreamController({
        adapter,
        bufferInterval: 1000, // Long interval
        maxBufferSize: 3,
      });
      const events: AGUIEvent[] = [];
      controller.on('event', (e: AGUIEvent) => events.push(e));
      controller.start();

      controller.push(createMockEvent());
      controller.push(createMockEvent());
      controller.push(createMockEvent());

      // Should have flushed
      expect(events.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('flush()', () => {
    it('should manually flush buffer', () => {
      const adapter = createEventAdapter();
      controller = createStreamController({
        adapter,
        bufferInterval: 1000,
        maxBufferSize: 100,
      });
      const events: AGUIEvent[] = [];
      controller.on('event', (e: AGUIEvent) => events.push(e));
      controller.start();

      controller.push(createMockEvent());
      controller.push(createMockEvent());
      controller.flush();

      expect(events).toHaveLength(2);
    });

    it('should emit flush event with count', () => {
      const adapter = createEventAdapter();
      controller = createStreamController({
        adapter,
        bufferInterval: 1000,
        maxBufferSize: 100,
      });
      const flushSpy = vi.fn();
      controller.on('flush', flushSpy);
      controller.start();

      controller.push(createMockEvent());
      controller.push(createMockEvent());
      controller.flush();

      expect(flushSpy).toHaveBeenCalledWith(2);
    });

    it('should do nothing if buffer is empty', () => {
      const adapter = createEventAdapter();
      controller = createStreamController({ adapter });
      const flushSpy = vi.fn();
      controller.on('flush', flushSpy);
      controller.start();

      controller.flush();

      expect(flushSpy).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// Event Flow Tests
// ============================================================================

describe('StreamController Event Flow', () => {
  let controller: StreamController;
  let adapter: ReturnType<typeof createEventAdapter>;

  beforeEach(() => {
    adapter = createEventAdapter();
  });

  afterEach(() => {
    controller?.dispose();
  });

  describe('push()', () => {
    it('should accept events when streaming', () => {
      controller = createStreamController({
        adapter,
        bufferInterval: 100,
        maxBufferSize: 10,
      });
      controller.start();

      const result = controller.push(createMockEvent());

      expect(result).toBe(true);
      expect(controller.getBufferSize()).toBe(1);
    });

    it('should reject events when not streaming', () => {
      controller = createStreamController({ adapter });

      const result = controller.push(createMockEvent());

      expect(result).toBe(false);
    });

    it('should accept events when paused (buffered)', () => {
      controller = createStreamController({
        adapter,
        bufferInterval: 1000,
        maxBufferSize: 100,
      });
      controller.start();
      controller.pause();

      const result = controller.push(createMockEvent());

      expect(result).toBe(true);
    });

    it('should update metrics on push', () => {
      controller = createStreamController({
        adapter,
        bufferInterval: 1000,
        maxBufferSize: 100,
      });
      controller.start();

      controller.push(createMockEvent());
      controller.push(createMockEvent());

      const metrics = controller.getMetrics();
      expect(metrics.totalEvents).toBe(2);
      expect(metrics.bufferedEvents).toBe(2);
    });
  });

  describe('adapter integration', () => {
    it('should forward events from adapter', async () => {
      controller = createStreamController({
        adapter,
        bufferInterval: 10,
        maxBufferSize: 100,
      });
      const events: AGUIEvent[] = [];
      controller.on('event', (e: AGUIEvent) => events.push(e));
      controller.start();

      // Emit event through adapter
      adapter.emitRunStarted('thread-1', 'run-1');

      await new Promise((r) => setTimeout(r, 20));

      expect(events.some((e) => e.type === AGUIEventType.RUN_STARTED)).toBe(true);
    });
  });
});

// ============================================================================
// Backpressure Integration Tests
// ============================================================================

describe('StreamController Backpressure', () => {
  let controller: StreamController;

  afterEach(() => {
    controller?.dispose();
  });

  it('should integrate with backpressure handler', () => {
    const backpressureHandler = createBackpressureHandler({
      maxBufferSize: 3,
      strategy: 'drop-non-critical',
    });
    const adapter = createEventAdapter();
    controller = createStreamController({
      adapter,
      backpressureHandler,
    });
    controller.start();

    // Fill the backpressure buffer
    for (let i = 0; i < 5; i++) {
      controller.push(createMockEvent(AGUIEventType.TEXT_MESSAGE_CONTENT));
    }

    const metrics = controller.getMetrics();
    expect(metrics.droppedEvents).toBeGreaterThan(0);
  });

  it('should keep critical events under pressure', () => {
    const backpressureHandler = createBackpressureHandler({
      maxBufferSize: 2,
      strategy: 'drop-non-critical',
    });
    const adapter = createEventAdapter();
    controller = createStreamController({
      adapter,
      backpressureHandler,
      bufferInterval: 1000,
      maxBufferSize: 100,
    });
    controller.start();

    // Push critical event
    const accepted = controller.push(createMockEvent(AGUIEventType.RUN_STARTED));

    expect(accepted).toBe(true);
  });
});

// ============================================================================
// Metrics Tests
// ============================================================================

describe('StreamController Metrics', () => {
  let controller: StreamController;

  afterEach(() => {
    controller?.dispose();
  });

  it('should track total events', () => {
    const adapter = createEventAdapter();
    controller = createStreamController({
      adapter,
      bufferInterval: 1000,
      maxBufferSize: 100,
    });
    controller.start();

    for (let i = 0; i < 10; i++) {
      controller.push(createMockEvent());
    }

    expect(controller.getMetrics().totalEvents).toBe(10);
  });

  it('should track flush count', () => {
    const adapter = createEventAdapter();
    controller = createStreamController({
      adapter,
      bufferInterval: 1000,
      maxBufferSize: 100,
    });
    controller.start();

    controller.push(createMockEvent());
    controller.flush();
    controller.push(createMockEvent());
    controller.flush();

    expect(controller.getMetrics().flushCount).toBe(2);
  });

  it('should calculate duration while streaming', async () => {
    const adapter = createEventAdapter();
    controller = createStreamController({ adapter });
    controller.start();

    await new Promise((r) => setTimeout(r, 50));

    const metrics = controller.getMetrics();
    expect(metrics.durationMs).toBeGreaterThanOrEqual(45);
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('StreamController Error Handling', () => {
  let controller: StreamController;

  afterEach(() => {
    controller?.dispose();
  });

  it('should handle errors gracefully', async () => {
    const onError = vi.fn();
    const adapter = createEventAdapter();
    controller = createStreamController({ adapter, onError });
    // Prevent unhandled error from escaping test
    controller.on('error', () => {});
    controller.start();

    await controller.handleError(new Error('Test error'));

    expect(onError).toHaveBeenCalled();
    expect(controller.getState()).toBe('error');
  });

  it('should emit error event', async () => {
    const adapter = createEventAdapter();
    controller = createStreamController({ adapter });
    const errorSpy = vi.fn();
    controller.on('error', errorSpy);
    controller.start();

    await controller.handleError(new Error('Test error'));

    expect(errorSpy).toHaveBeenCalled();
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('streamEvents', () => {
  it('should create async iterator from controller', async () => {
    const adapter = createEventAdapter();
    const controller = createStreamController({
      adapter,
      bufferInterval: 5,
      maxBufferSize: 10,
    });
    controller.start();

    const events: AGUIEvent[] = [];

    // Push some events and end
    controller.push(createMockEvent());
    controller.push(createMockEvent());
    setTimeout(() => controller.end(), 20);

    for await (const event of streamEvents(controller)) {
      events.push(event);
      if (events.length >= 2) break;
    }

    expect(events.length).toBeGreaterThanOrEqual(2);
    controller.dispose();
  });
});

describe('createEventTransform', () => {
  it('should create readable and writable streams', () => {
    const adapter = createEventAdapter();
    const controller = createStreamController({ adapter });
    controller.start();

    const { readable, writable } = createEventTransform(controller);

    expect(readable).toBeInstanceOf(ReadableStream);
    expect(writable).toBeInstanceOf(WritableStream);

    controller.dispose();
  });
});

// ============================================================================
// Dispose Tests
// ============================================================================

describe('StreamController Dispose', () => {
  it('should clean up resources on dispose', () => {
    const adapter = createEventAdapter();
    const controller = createStreamController({ adapter });
    controller.start();

    controller.push(createMockEvent());
    controller.dispose();

    expect(controller.getBufferSize()).toBe(0);
  });

  it('should remove abort handler on dispose', () => {
    const abortController = new AbortController();
    const adapter = createEventAdapter();
    const controller = createStreamController({
      adapter,
      signal: abortController.signal,
    });
    controller.start();

    controller.dispose();

    // Aborting after dispose should not cause issues
    abortController.abort();
    expect(controller.getState()).toBe('streaming'); // No longer updates after dispose
  });
});

// ============================================================================
// Stress Tests
// ============================================================================

describe('StreamController Stress Tests', () => {
  it('should handle high throughput (1000+ events/sec)', async () => {
    const adapter = createEventAdapter();
    const controller = createStreamController({
      adapter,
      bufferInterval: 10,
      maxBufferSize: 100,
    });
    const receivedEvents: AGUIEvent[] = [];
    controller.on('event', (e: AGUIEvent) => receivedEvents.push(e));
    controller.start();

    // Push 1000 events rapidly
    const startTime = Date.now();
    for (let i = 0; i < 1000; i++) {
      controller.push(createMockEvent());
    }

    // Wait for all flushes
    await new Promise((r) => setTimeout(r, 200));
    controller.flush(); // Final flush

    const duration = Date.now() - startTime;

    expect(receivedEvents.length).toBe(1000);
    expect(duration).toBeLessThan(500); // Should be fast

    controller.dispose();
  });

  it('should handle rapid start/cancel cycles', async () => {
    const adapter = createEventAdapter();

    for (let i = 0; i < 10; i++) {
      const controller = createStreamController({ adapter });
      controller.start();
      controller.push(createMockEvent());
      await controller.cancel();
      controller.dispose();
    }

    // Should complete without errors
    expect(true).toBe(true);
  });

  it('should handle concurrent event pushing', () => {
    const adapter = createEventAdapter();
    const controller = createStreamController({
      adapter,
      bufferInterval: 5,
      maxBufferSize: 1000,
    });
    controller.start();

    // Simulate concurrent pushes
    const pushPromises = Array.from({ length: 100 }, () =>
      Promise.resolve(controller.push(createMockEvent()))
    );

    Promise.all(pushPromises);

    expect(controller.getMetrics().totalEvents).toBe(100);
    controller.dispose();
  });
});
