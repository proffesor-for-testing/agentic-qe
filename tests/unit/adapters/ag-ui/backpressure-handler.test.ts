/**
 * AG-UI Backpressure Handler Unit Tests
 *
 * Comprehensive test suite covering backpressure detection, strategies,
 * metrics tracking, and event prioritization.
 *
 * Target: 25+ tests with stress testing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BackpressureHandler,
  createBackpressureHandler,
  createBackpressureConsumer,
  isCriticalEventCategory,
  getRecommendedStrategy,
  type BackpressureHandlerConfig,
  type BackpressureStrategy,
  type AGUIEvent,
  AGUIEventType,
  getEventCategory,
} from '../../../../src/adapters/ag-ui/index.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockEvent = (
  type: AGUIEventType = AGUIEventType.TEXT_MESSAGE_CONTENT,
  overrides: Partial<AGUIEvent> = {}
): AGUIEvent => ({
  type,
  eventId: `evt_${Math.random().toString(36).slice(2)}`,
  timestamp: new Date().toISOString(),
  messageId: 'msg-123',
  delta: 'test content',
  ...overrides,
} as AGUIEvent);

const createLifecycleEvent = (): AGUIEvent =>
  createMockEvent(AGUIEventType.RUN_STARTED, {
    threadId: 'thread-1',
    runId: 'run-1',
  });

const createToolEvent = (): AGUIEvent =>
  createMockEvent(AGUIEventType.TOOL_CALL_START, {
    toolCallId: 'tc-1',
    toolCallName: 'test_tool',
  });

const createContentEvent = (): AGUIEvent =>
  createMockEvent(AGUIEventType.TEXT_MESSAGE_CONTENT, {
    delta: 'streaming content',
  });

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createBackpressureHandler', () => {
  it('should create handler with default config', () => {
    const handler = createBackpressureHandler();

    expect(handler).toBeInstanceOf(BackpressureHandler);
    expect(handler.getBufferSize()).toBe(0);
    expect(handler.isUnderPressure()).toBe(false);
  });

  it('should create handler with custom maxBufferSize', () => {
    const handler = createBackpressureHandler({ maxBufferSize: 50 });

    const metrics = handler.getMetrics();
    expect(metrics.maxBufferSize).toBe(50);
  });

  it('should create handler with buffer strategy', () => {
    const handler = createBackpressureHandler({ strategy: 'buffer' });

    const metrics = handler.getMetrics();
    expect(metrics.strategy).toBe('buffer');
  });

  it('should create handler with drop-non-critical strategy', () => {
    const handler = createBackpressureHandler({ strategy: 'drop-non-critical' });

    const metrics = handler.getMetrics();
    expect(metrics.strategy).toBe('drop-non-critical');
  });

  it('should create handler with pause-producer strategy', () => {
    const handler = createBackpressureHandler({ strategy: 'pause-producer' });

    const metrics = handler.getMetrics();
    expect(metrics.strategy).toBe('pause-producer');
  });

  it('should create handler with callbacks', () => {
    const onPressure = vi.fn();
    const onRelieve = vi.fn();
    const handler = createBackpressureHandler({ onPressure, onRelieve });

    expect(handler).toBeInstanceOf(BackpressureHandler);
  });
});

// ============================================================================
// Buffer Strategy Tests
// ============================================================================

describe('BackpressureHandler - Buffer Strategy', () => {
  let handler: BackpressureHandler;

  beforeEach(() => {
    handler = createBackpressureHandler({
      maxBufferSize: 5,
      strategy: 'buffer',
      highWatermark: 80,
      lowWatermark: 50,
    });
  });

  it('should accept events under buffer limit', () => {
    const result = handler.push(createContentEvent());

    expect(result).toBe(true);
    expect(handler.getBufferSize()).toBe(1);
  });

  it('should buffer multiple events', () => {
    for (let i = 0; i < 4; i++) {
      handler.push(createContentEvent());
    }

    expect(handler.getBufferSize()).toBe(4);
  });

  it('should reject non-critical events when buffer is full', () => {
    // Fill buffer
    for (let i = 0; i < 5; i++) {
      handler.push(createContentEvent());
    }

    // Try to push one more non-critical event
    const result = handler.push(createContentEvent());

    expect(result).toBe(false);
    expect(handler.getBufferSize()).toBe(5);
  });

  it('should accept critical events when buffer is full', () => {
    // Fill buffer
    for (let i = 0; i < 5; i++) {
      handler.push(createContentEvent());
    }

    // Push critical event
    const result = handler.push(createLifecycleEvent());

    expect(result).toBe(true);
    expect(handler.getBufferSize()).toBe(6);
  });

  it('should track dropped events', () => {
    // Fill buffer
    for (let i = 0; i < 5; i++) {
      handler.push(createContentEvent());
    }

    // Try to push more
    handler.push(createContentEvent());
    handler.push(createContentEvent());

    const metrics = handler.getMetrics();
    expect(metrics.droppedCount).toBe(2);
  });
});

// ============================================================================
// Drop Non-Critical Strategy Tests
// ============================================================================

describe('BackpressureHandler - Drop Non-Critical Strategy', () => {
  let handler: BackpressureHandler;

  beforeEach(() => {
    handler = createBackpressureHandler({
      maxBufferSize: 3,
      strategy: 'drop-non-critical',
    });
  });

  it('should keep lifecycle events under pressure', () => {
    // Fill buffer
    for (let i = 0; i < 3; i++) {
      handler.push(createContentEvent());
    }

    // Push lifecycle event
    const result = handler.push(createLifecycleEvent());

    expect(result).toBe(true);
  });

  it('should drop TEXT_MESSAGE_CONTENT under pressure', () => {
    // Fill buffer
    for (let i = 0; i < 3; i++) {
      handler.push(createLifecycleEvent());
    }

    // Push content event
    const result = handler.push(createContentEvent());

    expect(result).toBe(false);
    const metrics = handler.getMetrics();
    expect(metrics.droppedCount).toBe(1);
  });

  it('should drop TOOL_CALL_ARGS under pressure', () => {
    // Fill buffer
    for (let i = 0; i < 3; i++) {
      handler.push(createLifecycleEvent());
    }

    // Push args event
    const argsEvent = createMockEvent(AGUIEventType.TOOL_CALL_ARGS, {
      toolCallId: 'tc-1',
      delta: '{"key":',
    });
    const result = handler.push(argsEvent);

    expect(result).toBe(false);
  });

  it('should keep TOOL_CALL_START under pressure', () => {
    // Fill buffer
    for (let i = 0; i < 3; i++) {
      handler.push(createContentEvent());
    }

    // Push tool start event
    const result = handler.push(createToolEvent());

    expect(result).toBe(true);
  });

  it('should keep STATE_SNAPSHOT under pressure', () => {
    // Fill buffer
    for (let i = 0; i < 3; i++) {
      handler.push(createContentEvent());
    }

    // Push snapshot event
    const snapshotEvent = createMockEvent(AGUIEventType.STATE_SNAPSHOT, {
      state: { key: 'value' },
    });
    const result = handler.push(snapshotEvent);

    expect(result).toBe(true);
  });

  it('should track dropped events by type', () => {
    // Fill buffer
    for (let i = 0; i < 3; i++) {
      handler.push(createLifecycleEvent());
    }

    // Drop various event types
    handler.push(createContentEvent());
    handler.push(createContentEvent());
    handler.push(createMockEvent(AGUIEventType.TOOL_CALL_ARGS));

    const metrics = handler.getMetrics();
    expect(metrics.droppedByType[AGUIEventType.TEXT_MESSAGE_CONTENT]).toBe(2);
    expect(metrics.droppedByType[AGUIEventType.TOOL_CALL_ARGS]).toBe(1);
  });
});

// ============================================================================
// Pause Producer Strategy Tests
// ============================================================================

describe('BackpressureHandler - Pause Producer Strategy', () => {
  let handler: BackpressureHandler;

  beforeEach(() => {
    handler = createBackpressureHandler({
      maxBufferSize: 3,
      strategy: 'pause-producer',
    });
  });

  it('should signal pause when buffer is full', () => {
    const pauseSpy = vi.fn();
    handler.on('pause', pauseSpy);

    // Fill buffer
    for (let i = 0; i < 3; i++) {
      handler.push(createContentEvent());
    }

    // Push one more to trigger pause
    handler.push(createContentEvent());

    expect(handler.isProducerPaused()).toBe(true);
    expect(pauseSpy).toHaveBeenCalled();
  });

  it('should track pause count', () => {
    // Fill and trigger pause
    for (let i = 0; i < 4; i++) {
      handler.push(createContentEvent());
    }

    const metrics = handler.getMetrics();
    expect(metrics.pauseCount).toBe(1);
  });

  it('should resume producer when drained', () => {
    const resumeSpy = vi.fn();
    handler.on('resume', resumeSpy);

    // Fill and trigger pause
    for (let i = 0; i < 4; i++) {
      handler.push(createContentEvent());
    }

    // Drain buffer
    handler.pull();
    handler.resumeProducer();

    expect(handler.isProducerPaused()).toBe(false);
    expect(resumeSpy).toHaveBeenCalled();
  });

  it('should track total pause time', async () => {
    // Fill and trigger pause
    for (let i = 0; i < 4; i++) {
      handler.push(createContentEvent());
    }

    await new Promise((r) => setTimeout(r, 50));

    // Resume
    handler.resumeProducer();

    const metrics = handler.getMetrics();
    expect(metrics.totalPauseTimeMs).toBeGreaterThanOrEqual(45);
  });
});

// ============================================================================
// Watermark Tests
// ============================================================================

describe('BackpressureHandler Watermarks', () => {
  it('should enter pressure state at high watermark', () => {
    const handler = createBackpressureHandler({
      maxBufferSize: 10,
      highWatermark: 80,
    });

    // Push to 80% capacity (8 events)
    for (let i = 0; i < 8; i++) {
      handler.push(createContentEvent());
    }

    expect(handler.isUnderPressure()).toBe(true);
  });

  it('should exit pressure state at low watermark', () => {
    const handler = createBackpressureHandler({
      maxBufferSize: 10,
      highWatermark: 80,
      lowWatermark: 50,
    });

    // Fill to high watermark (80% of 10 = 8 events)
    for (let i = 0; i < 8; i++) {
      handler.push(createContentEvent());
    }
    expect(handler.isUnderPressure()).toBe(true);

    // Pull 2 to leave 6 events (60%, still above 50% low watermark)
    handler.pull(2);
    expect(handler.isUnderPressure()).toBe(true); // 60% > 50%

    // Pull 2 more to leave 4 events (40%, below 50% low watermark)
    handler.pull(2);
    expect(handler.isUnderPressure()).toBe(false); // 40% <= 50%
  });

  it('should emit pressure event', () => {
    const onPressure = vi.fn();
    const handler = createBackpressureHandler({
      maxBufferSize: 5,
      highWatermark: 80,
      onPressure,
    });

    // Push to 80% capacity - with 5 max, 80% = 4 events needed
    // After pushing 4 events: 4/5 = 80%, should trigger pressure
    for (let i = 0; i < 4; i++) {
      handler.push(createContentEvent());
    }

    expect(onPressure).toHaveBeenCalled();
    expect(onPressure.mock.calls[0][0].underPressure).toBe(true);
  });

  it('should emit relieve event', () => {
    const onRelieve = vi.fn();
    const handler = createBackpressureHandler({
      maxBufferSize: 10,
      highWatermark: 80,
      lowWatermark: 50,
      onRelieve,
    });

    // Enter pressure state - need 80% = 8 events to trigger
    for (let i = 0; i < 8; i++) {
      handler.push(createContentEvent());
    }
    expect(handler.isUnderPressure()).toBe(true);

    // Exit pressure state - need to get to <= 50% = 5 events
    // Pull 4 to leave 4 events (40%)
    handler.pull(4);

    expect(onRelieve).toHaveBeenCalled();
    expect(onRelieve.mock.calls[0][0].underPressure).toBe(false);
  });
});

// ============================================================================
// Memory Limit Tests
// ============================================================================

describe('BackpressureHandler Memory Limits', () => {
  it('should respect memory limit', () => {
    const handler = createBackpressureHandler({
      maxBufferSize: 1000,
      maxMemoryBytes: 100, // Very small limit for testing
      strategy: 'buffer',
    });

    // Push events until memory limit is hit
    let accepted = 0;
    for (let i = 0; i < 10; i++) {
      if (handler.push(createContentEvent())) {
        accepted++;
      }
    }

    expect(accepted).toBeLessThan(10);
    expect(handler.getMemoryUsage()).toBeLessThanOrEqual(100);
  });

  it('should track memory usage', () => {
    const handler = createBackpressureHandler({
      maxBufferSize: 100,
      maxMemoryBytes: 10 * 1024 * 1024, // 10MB
    });

    handler.push(createContentEvent());

    expect(handler.getMemoryUsage()).toBeGreaterThan(0);
  });
});

// ============================================================================
// Pull API Tests
// ============================================================================

describe('BackpressureHandler Pull API', () => {
  let handler: BackpressureHandler;

  beforeEach(() => {
    handler = createBackpressureHandler({ maxBufferSize: 10 });
  });

  it('should pull all events by default', () => {
    for (let i = 0; i < 5; i++) {
      handler.push(createContentEvent());
    }

    const events = handler.pull();

    expect(events).toHaveLength(5);
    expect(handler.getBufferSize()).toBe(0);
  });

  it('should pull specified count', () => {
    for (let i = 0; i < 5; i++) {
      handler.push(createContentEvent());
    }

    const events = handler.pull(3);

    expect(events).toHaveLength(3);
    expect(handler.getBufferSize()).toBe(2);
  });

  it('should pull one event with pullOne', () => {
    for (let i = 0; i < 3; i++) {
      handler.push(createContentEvent());
    }

    const event = handler.pullOne();

    expect(event).toBeDefined();
    expect(handler.getBufferSize()).toBe(2);
  });

  it('should return undefined when buffer empty', () => {
    const event = handler.pullOne();

    expect(event).toBeUndefined();
  });

  it('should reduce memory usage on pull', () => {
    for (let i = 0; i < 5; i++) {
      handler.push(createContentEvent());
    }
    const initialMemory = handler.getMemoryUsage();

    handler.pull(3);

    expect(handler.getMemoryUsage()).toBeLessThan(initialMemory);
  });
});

// ============================================================================
// Clear and State Tests
// ============================================================================

describe('BackpressureHandler State Management', () => {
  it('should clear buffer', () => {
    const handler = createBackpressureHandler({ maxBufferSize: 10 });

    for (let i = 0; i < 5; i++) {
      handler.push(createContentEvent());
    }

    handler.clear();

    expect(handler.getBufferSize()).toBe(0);
    expect(handler.getMemoryUsage()).toBe(0);
  });

  it('should exit pressure state on clear', () => {
    const handler = createBackpressureHandler({
      maxBufferSize: 5,
      highWatermark: 80,
    });

    // Enter pressure state - 80% of 5 = 4 events
    for (let i = 0; i < 4; i++) {
      handler.push(createContentEvent());
    }
    // Verify we're at 80% utilization
    expect(handler.getMetrics().utilizationPercent).toBe(80);
    expect(handler.isUnderPressure()).toBe(true);

    handler.clear();

    expect(handler.isUnderPressure()).toBe(false);
  });

  it('should check hasEvents correctly', () => {
    const handler = createBackpressureHandler();

    expect(handler.hasEvents()).toBe(false);

    handler.push(createContentEvent());

    expect(handler.hasEvents()).toBe(true);
  });
});

// ============================================================================
// Metrics Tests
// ============================================================================

describe('BackpressureHandler Metrics', () => {
  it('should track processed count', () => {
    const handler = createBackpressureHandler();

    for (let i = 0; i < 10; i++) {
      handler.push(createContentEvent());
    }

    expect(handler.getMetrics().processedCount).toBe(10);
  });

  it('should calculate utilization percent', () => {
    const handler = createBackpressureHandler({ maxBufferSize: 10 });

    for (let i = 0; i < 5; i++) {
      handler.push(createContentEvent());
    }

    expect(handler.getMetrics().utilizationPercent).toBe(50);
  });

  it('should include current state in metrics', () => {
    const handler = createBackpressureHandler({ maxBufferSize: 5 });

    for (let i = 0; i < 3; i++) {
      handler.push(createContentEvent());
    }

    const metrics = handler.getMetrics();
    expect(metrics.bufferSize).toBe(3);
    expect(metrics.memoryUsageBytes).toBeGreaterThan(0);
  });
});

// ============================================================================
// Event Priority Tests
// ============================================================================

describe('BackpressureHandler Event Priority', () => {
  it('should use custom critical events', () => {
    const handler = createBackpressureHandler({
      maxBufferSize: 2,
      strategy: 'drop-non-critical',
      eventPriority: {
        critical: [AGUIEventType.CUSTOM],
      },
    });

    // Fill buffer
    for (let i = 0; i < 2; i++) {
      handler.push(createContentEvent());
    }

    // Custom event should be accepted
    const customEvent = createMockEvent(AGUIEventType.CUSTOM, {
      name: 'test',
      value: {},
    });
    const result = handler.push(customEvent);

    expect(result).toBe(true);
  });

  it('should use custom droppable events', () => {
    const handler = createBackpressureHandler({
      maxBufferSize: 2,
      strategy: 'drop-non-critical',
      eventPriority: {
        droppable: [AGUIEventType.RAW],
      },
    });

    // Fill buffer
    for (let i = 0; i < 2; i++) {
      handler.push(createContentEvent());
    }

    // RAW event should be dropped
    const rawEvent = createMockEvent(AGUIEventType.RAW, {
      event: {},
    });
    const result = handler.push(rawEvent);

    expect(result).toBe(false);
  });
});

// ============================================================================
// Event Emission Tests
// ============================================================================

describe('BackpressureHandler Events', () => {
  it('should emit drop event', () => {
    const handler = createBackpressureHandler({
      maxBufferSize: 2,
      strategy: 'drop-non-critical',
    });
    const dropSpy = vi.fn();
    handler.on('drop', dropSpy);

    // Fill and trigger drop
    for (let i = 0; i < 3; i++) {
      handler.push(createContentEvent());
    }

    expect(dropSpy).toHaveBeenCalled();
  });

  it('should emit pressure event', () => {
    const handler = createBackpressureHandler({
      maxBufferSize: 5,
      highWatermark: 80,
    });
    const pressureSpy = vi.fn();
    handler.on('pressure', pressureSpy);

    // Trigger pressure - 80% of 5 = 4 events needed
    for (let i = 0; i < 4; i++) {
      handler.push(createContentEvent());
    }

    expect(pressureSpy).toHaveBeenCalled();
  });

  it('should emit relieve event', () => {
    const handler = createBackpressureHandler({
      maxBufferSize: 10,
      highWatermark: 80,
      lowWatermark: 50,
    });
    const relieveSpy = vi.fn();
    handler.on('relieve', relieveSpy);

    // Enter pressure - need 80% = 8 events
    for (let i = 0; i < 8; i++) {
      handler.push(createContentEvent());
    }
    expect(handler.isUnderPressure()).toBe(true);

    // Exit pressure - pull 4 to leave 4 (40% < 50%)
    handler.pull(4);

    expect(relieveSpy).toHaveBeenCalled();
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('isCriticalEventCategory', () => {
  it('should return true for lifecycle category', () => {
    expect(isCriticalEventCategory('lifecycle')).toBe(true);
  });

  it('should return true for tool category', () => {
    expect(isCriticalEventCategory('tool')).toBe(true);
  });

  it('should return false for text category', () => {
    expect(isCriticalEventCategory('text')).toBe(false);
  });

  it('should return false for state category', () => {
    expect(isCriticalEventCategory('state')).toBe(false);
  });

  it('should return false for special category', () => {
    expect(isCriticalEventCategory('special')).toBe(false);
  });
});

describe('getRecommendedStrategy', () => {
  it('should return drop-non-critical for realtime', () => {
    expect(getRecommendedStrategy('realtime')).toBe('drop-non-critical');
  });

  it('should return pause-producer for reliable', () => {
    expect(getRecommendedStrategy('reliable')).toBe('pause-producer');
  });

  it('should return buffer for balanced', () => {
    expect(getRecommendedStrategy('balanced')).toBe('buffer');
  });
});

describe('createBackpressureConsumer', () => {
  it('should create consumer that processes events', async () => {
    const handler = createBackpressureHandler();
    const processedEvents: AGUIEvent[] = [];

    const consumer = createBackpressureConsumer(
      handler,
      (event) => {
        processedEvents.push(event);
      },
      { pullInterval: 10, batchSize: 5 }
    );

    // Push events
    for (let i = 0; i < 10; i++) {
      handler.push(createContentEvent());
    }

    // Start consumer
    consumer.start();

    await new Promise((r) => setTimeout(r, 50));

    consumer.stop();

    expect(processedEvents.length).toBeGreaterThan(0);
  });

  it('should track running state', () => {
    const handler = createBackpressureHandler();
    const consumer = createBackpressureConsumer(handler, () => {});

    expect(consumer.isRunning()).toBe(false);

    consumer.start();
    expect(consumer.isRunning()).toBe(true);

    consumer.stop();
    expect(consumer.isRunning()).toBe(false);
  });
});

// ============================================================================
// Stress Tests
// ============================================================================

describe('BackpressureHandler Stress Tests', () => {
  it('should handle high throughput (10000 events)', () => {
    const handler = createBackpressureHandler({
      maxBufferSize: 1000,
      strategy: 'buffer',
    });

    const startTime = Date.now();

    for (let i = 0; i < 10000; i++) {
      handler.push(createContentEvent());
      if (handler.getBufferSize() > 500) {
        handler.pull(100);
      }
    }

    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    expect(handler.getMetrics().processedCount).toBe(10000);
  });

  it('should handle rapid push/pull cycles', () => {
    const handler = createBackpressureHandler({ maxBufferSize: 100 });

    for (let cycle = 0; cycle < 100; cycle++) {
      // Push batch
      for (let i = 0; i < 50; i++) {
        handler.push(createContentEvent());
      }
      // Pull batch
      handler.pull(40);
    }

    expect(handler.getBufferSize()).toBeGreaterThan(0);
    expect(handler.getMetrics().processedCount).toBe(5000);
  });

  it('should maintain consistency under pressure', () => {
    const handler = createBackpressureHandler({
      maxBufferSize: 10,
      strategy: 'drop-non-critical',
      highWatermark: 80,
      lowWatermark: 50,
    });

    let dropped = 0;
    handler.on('drop', () => dropped++);

    // Rapid push with occasional pulls
    for (let i = 0; i < 1000; i++) {
      handler.push(createContentEvent());
      if (i % 10 === 0) {
        handler.pull(3);
      }
    }

    const metrics = handler.getMetrics();
    expect(metrics.processedCount).toBe(1000);
    expect(metrics.droppedCount).toBe(dropped);
    expect(metrics.droppedCount + handler.getBufferSize()).toBeLessThanOrEqual(1000);
  });
});
