/**
 * AG-UI Event Batcher Unit Tests
 *
 * Comprehensive test suite covering batch size triggers, timeout triggers,
 * priority event bypass, ordering preservation, and metrics tracking.
 *
 * Target: 40+ tests covering all batching scenarios
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EventBatcher,
  createEventBatcher,
  serializeBatch,
  deserializeBatch,
  calculateOptimalBatchConfig,
  getDefaultPriorityEvents,
  withBatching,
  type EventBatcherConfig,
  type EventBatch,
  type BatchMetadata,
} from '../../../../src/adapters/ag-ui/event-batcher.js';
import {
  AGUIEventType,
  type AGUIEvent,
} from '../../../../src/adapters/ag-ui/event-types.js';
import { EventEmitter } from 'events';

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
  messageId: `msg_${Math.random().toString(36).slice(2)}`,
  delta: 'test content',
  ...overrides,
} as AGUIEvent);

const createRunStartedEvent = (): AGUIEvent =>
  createMockEvent(AGUIEventType.RUN_STARTED, {
    threadId: 'thread-1',
    runId: 'run-1',
  });

const createRunFinishedEvent = (): AGUIEvent =>
  createMockEvent(AGUIEventType.RUN_FINISHED, {
    runId: 'run-1',
    outcome: 'success',
  });

const createRunErrorEvent = (): AGUIEvent =>
  createMockEvent(AGUIEventType.RUN_ERROR, {
    runId: 'run-1',
    message: 'Test error',
    code: 'TEST_ERROR',
  });

const createContentEvent = (index?: number): AGUIEvent =>
  createMockEvent(AGUIEventType.TEXT_MESSAGE_CONTENT, {
    delta: `content-${index ?? Math.random()}`,
    eventId: `evt_content_${index ?? Date.now()}`,
  });

const createToolArgsEvent = (): AGUIEvent =>
  createMockEvent(AGUIEventType.TOOL_CALL_ARGS, {
    toolCallId: 'tc-1',
    delta: '{"key":',
  });

const createStateSnapshotEvent = (): AGUIEvent =>
  createMockEvent(AGUIEventType.STATE_SNAPSHOT, {
    state: { key: 'value' },
  });

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createEventBatcher', () => {
  it('should create batcher with default config', () => {
    const batcher = createEventBatcher();

    expect(batcher).toBeInstanceOf(EventBatcher);
    expect(batcher.isEnabled()).toBe(true);
    expect(batcher.getBufferSize()).toBe(0);
  });

  it('should create batcher with custom batch size', () => {
    const batcher = createEventBatcher({ batchSize: 20 });

    // Add 15 events - should not flush
    for (let i = 0; i < 15; i++) {
      batcher.add(createContentEvent(i));
    }

    expect(batcher.getBufferSize()).toBe(15);
    batcher.dispose();
  });

  it('should create batcher with custom batch timeout', async () => {
    const onFlush = vi.fn();
    const batcher = createEventBatcher({ batchTimeout: 20, onFlush });

    batcher.add(createContentEvent());

    // Wait for timeout
    await new Promise((r) => setTimeout(r, 30));

    expect(onFlush).toHaveBeenCalled();
    batcher.dispose();
  });

  it('should create batcher with batching disabled', () => {
    const onFlush = vi.fn();
    const batcher = createEventBatcher({ enabled: false, onFlush });

    batcher.add(createContentEvent());

    // Should emit immediately
    expect(onFlush).toHaveBeenCalled();
    expect(batcher.getBufferSize()).toBe(0);
    batcher.dispose();
  });

  it('should create batcher with custom priority events', () => {
    const batcher = createEventBatcher({
      priorityEvents: [AGUIEventType.CUSTOM],
    });

    expect(batcher.isPriorityEventType(AGUIEventType.CUSTOM)).toBe(true);
    expect(batcher.isPriorityEventType(AGUIEventType.RUN_STARTED)).toBe(false);
    batcher.dispose();
  });

  it('should create batcher with flush callback', () => {
    const onFlush = vi.fn();
    const batcher = createEventBatcher({ onFlush, batchSize: 1 });

    batcher.add(createContentEvent());

    expect(onFlush).toHaveBeenCalled();
    batcher.dispose();
  });
});

// ============================================================================
// Batch Size Trigger Tests
// ============================================================================

describe('EventBatcher - Batch Size Triggers', () => {
  let batcher: EventBatcher;
  let batches: EventBatch[];

  beforeEach(() => {
    batches = [];
    batcher = createEventBatcher({
      batchSize: 5,
      batchTimeout: 1000, // Long timeout to isolate size trigger
      onFlush: (batch) => batches.push(batch),
    });
  });

  afterEach(() => {
    batcher.dispose();
  });

  it('should not flush until batch size is reached', () => {
    for (let i = 0; i < 4; i++) {
      batcher.add(createContentEvent(i));
    }

    expect(batches).toHaveLength(0);
    expect(batcher.getBufferSize()).toBe(4);
  });

  it('should flush when batch size is reached', () => {
    for (let i = 0; i < 5; i++) {
      batcher.add(createContentEvent(i));
    }

    expect(batches).toHaveLength(1);
    expect(batches[0].events).toHaveLength(5);
    expect(batcher.getBufferSize()).toBe(0);
  });

  it('should flush exactly at batch size', () => {
    for (let i = 0; i < 10; i++) {
      batcher.add(createContentEvent(i));
    }

    expect(batches).toHaveLength(2);
    expect(batches[0].events).toHaveLength(5);
    expect(batches[1].events).toHaveLength(5);
  });

  it('should record size as flush reason', () => {
    for (let i = 0; i < 5; i++) {
      batcher.add(createContentEvent(i));
    }

    expect(batches[0].metadata.flushReason).toBe('size');
  });

  it('should handle batch size of 1', () => {
    const singleBatcher = createEventBatcher({
      batchSize: 1,
      onFlush: (batch) => batches.push(batch),
    });

    singleBatcher.add(createContentEvent());
    singleBatcher.add(createContentEvent());

    expect(batches).toHaveLength(2);
    expect(batches[0].events).toHaveLength(1);
    expect(batches[1].events).toHaveLength(1);
    singleBatcher.dispose();
  });
});

// ============================================================================
// Batch Timeout Trigger Tests
// ============================================================================

describe('EventBatcher - Timeout Triggers', () => {
  let batcher: EventBatcher;
  let batches: EventBatch[];

  beforeEach(() => {
    batches = [];
    batcher = createEventBatcher({
      batchSize: 100, // Large size to isolate timeout trigger
      batchTimeout: 30,
      onFlush: (batch) => batches.push(batch),
    });
  });

  afterEach(() => {
    batcher.dispose();
  });

  it('should flush on timeout', async () => {
    batcher.add(createContentEvent());

    expect(batches).toHaveLength(0);

    await new Promise((r) => setTimeout(r, 50));

    expect(batches).toHaveLength(1);
    expect(batches[0].events).toHaveLength(1);
  });

  it('should record timeout as flush reason', async () => {
    batcher.add(createContentEvent());

    await new Promise((r) => setTimeout(r, 50));

    expect(batches[0].metadata.flushReason).toBe('timeout');
  });

  it('should reset timeout when batch size triggers flush', async () => {
    // Add 4 events
    for (let i = 0; i < 4; i++) {
      batcher.add(createContentEvent(i));
    }

    // Wait a bit but not full timeout
    await new Promise((r) => setTimeout(r, 20));

    // Manually flush
    batcher.flush('manual');

    expect(batches).toHaveLength(1);

    // Add one more event
    batcher.add(createContentEvent());

    // Should not flush yet (new timeout started)
    await new Promise((r) => setTimeout(r, 20));
    expect(batches).toHaveLength(1);

    // Wait for new timeout
    await new Promise((r) => setTimeout(r, 20));
    expect(batches).toHaveLength(2);
  });

  it('should batch multiple events within timeout window', async () => {
    // Add all events quickly without delays
    batcher.add(createContentEvent(1));
    batcher.add(createContentEvent(2));
    batcher.add(createContentEvent(3));

    // Wait for timeout to trigger
    await new Promise((r) => setTimeout(r, 50));

    expect(batches).toHaveLength(1);
    expect(batches[0].events).toHaveLength(3);
  });

  it('should calculate correct batch duration', async () => {
    batcher.add(createContentEvent());
    await new Promise((r) => setTimeout(r, 20));
    batcher.add(createContentEvent());

    await new Promise((r) => setTimeout(r, 50));

    // Duration should be at least 20ms (time between first add and flush)
    expect(batches[0].metadata.batchDurationMs).toBeGreaterThanOrEqual(20);
  });
});

// ============================================================================
// Priority Event Bypass Tests
// ============================================================================

describe('EventBatcher - Priority Event Bypass', () => {
  let batcher: EventBatcher;
  let batches: EventBatch[];

  beforeEach(() => {
    batches = [];
    batcher = createEventBatcher({
      batchSize: 10,
      batchTimeout: 1000,
      onFlush: (batch) => batches.push(batch),
    });
  });

  afterEach(() => {
    batcher.dispose();
  });

  it('should emit RUN_STARTED immediately', () => {
    batcher.add(createRunStartedEvent());

    expect(batches).toHaveLength(1);
    expect(batches[0].events[0].type).toBe(AGUIEventType.RUN_STARTED);
    expect(batches[0].metadata.flushReason).toBe('priority');
  });

  it('should emit RUN_FINISHED immediately', () => {
    batcher.add(createRunFinishedEvent());

    expect(batches).toHaveLength(1);
    expect(batches[0].events[0].type).toBe(AGUIEventType.RUN_FINISHED);
  });

  it('should emit RUN_ERROR immediately', () => {
    batcher.add(createRunErrorEvent());

    expect(batches).toHaveLength(1);
    expect(batches[0].events[0].type).toBe(AGUIEventType.RUN_ERROR);
  });

  it('should emit STATE_SNAPSHOT immediately', () => {
    batcher.add(createStateSnapshotEvent());

    expect(batches).toHaveLength(1);
    expect(batches[0].events[0].type).toBe(AGUIEventType.STATE_SNAPSHOT);
  });

  it('should not batch priority events with regular events', () => {
    // Add some regular events
    batcher.add(createContentEvent(1));
    batcher.add(createContentEvent(2));

    // Add priority event - should flush separately
    batcher.add(createRunStartedEvent());

    // Priority event emitted immediately
    expect(batches).toHaveLength(1);
    expect(batches[0].events[0].type).toBe(AGUIEventType.RUN_STARTED);

    // Regular events still in buffer
    expect(batcher.getBufferSize()).toBe(2);
  });

  it('should return false when adding priority events', () => {
    const result = batcher.add(createRunStartedEvent());

    expect(result).toBe(false); // Not batched
  });

  it('should return true when adding regular events', () => {
    const result = batcher.add(createContentEvent());

    expect(result).toBe(true); // Batched
  });

  it('should track priority events in metrics', () => {
    batcher.add(createRunStartedEvent());
    batcher.add(createRunFinishedEvent());
    batcher.add(createContentEvent());

    const metrics = batcher.getMetrics();
    expect(metrics.priorityEvents).toBe(2);
    expect(metrics.batchedEvents).toBe(1);
  });
});

// ============================================================================
// Order Preservation Tests
// ============================================================================

describe('EventBatcher - Order Preservation', () => {
  let batcher: EventBatcher;
  let batches: EventBatch[];

  beforeEach(() => {
    batches = [];
    batcher = createEventBatcher({
      batchSize: 5,
      batchTimeout: 1000,
      onFlush: (batch) => batches.push(batch),
    });
  });

  afterEach(() => {
    batcher.dispose();
  });

  it('should preserve event order within a batch', () => {
    const events: AGUIEvent[] = [];
    for (let i = 0; i < 5; i++) {
      const event = createMockEvent(AGUIEventType.TEXT_MESSAGE_CONTENT, {
        eventId: `evt_${i}`,
        delta: `content_${i}`,
      });
      events.push(event);
      batcher.add(event);
    }

    expect(batches).toHaveLength(1);
    for (let i = 0; i < 5; i++) {
      expect(batches[0].events[i].eventId).toBe(`evt_${i}`);
    }
  });

  it('should preserve order across multiple batches', () => {
    for (let i = 0; i < 12; i++) {
      batcher.add(
        createMockEvent(AGUIEventType.TEXT_MESSAGE_CONTENT, {
          eventId: `evt_${i}`,
        })
      );
    }

    // First batch: 0-4
    // Second batch: 5-9
    expect(batches).toHaveLength(2);
    expect(batches[0].events[0].eventId).toBe('evt_0');
    expect(batches[0].events[4].eventId).toBe('evt_4');
    expect(batches[1].events[0].eventId).toBe('evt_5');
    expect(batches[1].events[4].eventId).toBe('evt_9');
  });

  it('should record correct first/last timestamps', () => {
    const firstEvent = createMockEvent(AGUIEventType.TEXT_MESSAGE_CONTENT, {
      timestamp: '2026-01-01T10:00:00.000Z',
    });
    const lastEvent = createMockEvent(AGUIEventType.TEXT_MESSAGE_CONTENT, {
      timestamp: '2026-01-01T10:00:01.000Z',
    });

    batcher.add(firstEvent);
    for (let i = 0; i < 3; i++) {
      batcher.add(createContentEvent(i));
    }
    batcher.add(lastEvent);

    expect(batches[0].metadata.firstEventTimestamp).toBe('2026-01-01T10:00:00.000Z');
    expect(batches[0].metadata.lastEventTimestamp).toBe('2026-01-01T10:00:01.000Z');
  });
});

// ============================================================================
// Manual Flush Tests
// ============================================================================

describe('EventBatcher - Manual Flush', () => {
  let batcher: EventBatcher;
  let batches: EventBatch[];

  beforeEach(() => {
    batches = [];
    batcher = createEventBatcher({
      batchSize: 100,
      batchTimeout: 10000,
      onFlush: (batch) => batches.push(batch),
    });
  });

  afterEach(() => {
    batcher.dispose();
  });

  it('should flush on manual call', () => {
    for (let i = 0; i < 3; i++) {
      batcher.add(createContentEvent(i));
    }

    batcher.flush();

    expect(batches).toHaveLength(1);
    expect(batches[0].events).toHaveLength(3);
    expect(batches[0].metadata.flushReason).toBe('manual');
  });

  it('should do nothing when buffer is empty', () => {
    batcher.flush();

    expect(batches).toHaveLength(0);
  });

  it('should clear buffer after flush', () => {
    batcher.add(createContentEvent());
    batcher.flush();

    expect(batcher.getBufferSize()).toBe(0);
  });

  it('should cancel pending timeout on flush', async () => {
    batcher.add(createContentEvent());
    batcher.flush();

    // Wait past timeout
    await new Promise((r) => setTimeout(r, 50));

    // Should only have one flush (manual)
    expect(batches).toHaveLength(1);
  });
});

// ============================================================================
// Enable/Disable Tests
// ============================================================================

describe('EventBatcher - Enable/Disable', () => {
  let batcher: EventBatcher;
  let batches: EventBatch[];

  beforeEach(() => {
    batches = [];
    batcher = createEventBatcher({
      batchSize: 10,
      batchTimeout: 1000,
      onFlush: (batch) => batches.push(batch),
    });
  });

  afterEach(() => {
    batcher.dispose();
  });

  it('should emit events immediately when disabled', () => {
    batcher.disable();

    batcher.add(createContentEvent());

    expect(batches).toHaveLength(1);
    expect(batches[0].metadata.flushReason).toBe('disabled');
  });

  it('should flush pending events when disabling', () => {
    batcher.add(createContentEvent(1));
    batcher.add(createContentEvent(2));

    batcher.disable();

    // First batch is the manual flush of pending events
    // Subsequent events are emitted immediately
    expect(batches).toHaveLength(1);
    expect(batches[0].events).toHaveLength(2);
  });

  it('should resume batching when enabled', () => {
    batcher.disable();
    batcher.enable();

    batcher.add(createContentEvent());

    expect(batcher.getBufferSize()).toBe(1);
    expect(batches).toHaveLength(0);
  });

  it('should emit enabled/disabled events', () => {
    const enabledSpy = vi.fn();
    const disabledSpy = vi.fn();

    batcher.on('enabled', enabledSpy);
    batcher.on('disabled', disabledSpy);

    batcher.disable();
    expect(disabledSpy).toHaveBeenCalled();

    batcher.enable();
    expect(enabledSpy).toHaveBeenCalled();
  });

  it('should track enabled state in metrics', () => {
    expect(batcher.getMetrics().enabled).toBe(true);

    batcher.disable();
    expect(batcher.getMetrics().enabled).toBe(false);

    batcher.enable();
    expect(batcher.getMetrics().enabled).toBe(true);
  });
});

// ============================================================================
// Priority Event Configuration Tests
// ============================================================================

describe('EventBatcher - Priority Event Configuration', () => {
  let batcher: EventBatcher;

  beforeEach(() => {
    batcher = createEventBatcher();
  });

  afterEach(() => {
    batcher.dispose();
  });

  it('should add priority event type', () => {
    batcher.addPriorityEvent(AGUIEventType.CUSTOM);

    expect(batcher.isPriorityEventType(AGUIEventType.CUSTOM)).toBe(true);
  });

  it('should remove priority event type', () => {
    batcher.addPriorityEvent(AGUIEventType.CUSTOM);
    batcher.removePriorityEvent(AGUIEventType.CUSTOM);

    expect(batcher.isPriorityEventType(AGUIEventType.CUSTOM)).toBe(false);
  });

  it('should get all priority event types', () => {
    const types = batcher.getPriorityEventTypes();

    expect(types).toContain(AGUIEventType.RUN_STARTED);
    expect(types).toContain(AGUIEventType.RUN_FINISHED);
    expect(types).toContain(AGUIEventType.RUN_ERROR);
  });

  it('should respect modified priority events', () => {
    const batches: EventBatch[] = [];
    batcher = createEventBatcher({
      batchSize: 10,
      onFlush: (b) => batches.push(b),
    });

    // Remove RUN_STARTED from priority
    batcher.removePriorityEvent(AGUIEventType.RUN_STARTED);

    // Should be batched now
    batcher.add(createRunStartedEvent());

    expect(batcher.getBufferSize()).toBe(1);
    expect(batches).toHaveLength(0);
    batcher.dispose();
  });
});

// ============================================================================
// Metrics Tests
// ============================================================================

describe('EventBatcher - Metrics', () => {
  let batcher: EventBatcher;
  let batches: EventBatch[];

  beforeEach(() => {
    batches = [];
    batcher = createEventBatcher({
      batchSize: 5,
      batchTimeout: 1000,
      onFlush: (batch) => batches.push(batch),
    });
  });

  afterEach(() => {
    batcher.dispose();
  });

  it('should track total events', () => {
    for (let i = 0; i < 7; i++) {
      batcher.add(createContentEvent(i));
    }

    expect(batcher.getMetrics().totalEvents).toBe(7);
  });

  it('should track total batches', () => {
    for (let i = 0; i < 12; i++) {
      batcher.add(createContentEvent(i));
    }

    expect(batcher.getMetrics().totalBatches).toBe(2);
  });

  it('should track batched vs priority events', () => {
    batcher.add(createContentEvent());
    batcher.add(createRunStartedEvent());
    batcher.add(createContentEvent());
    batcher.add(createRunErrorEvent());

    const metrics = batcher.getMetrics();
    expect(metrics.batchedEvents).toBe(2);
    expect(metrics.priorityEvents).toBe(2);
  });

  it('should calculate average batch size', () => {
    // Batch 1: 5 events
    for (let i = 0; i < 5; i++) {
      batcher.add(createContentEvent(i));
    }

    // Batch 2: 5 events
    for (let i = 0; i < 5; i++) {
      batcher.add(createContentEvent(i));
    }

    // Should be exactly 5
    expect(batcher.getMetrics().averageBatchSize).toBe(5);
  });

  it('should track flush reasons', () => {
    // Trigger size flush
    for (let i = 0; i < 5; i++) {
      batcher.add(createContentEvent(i));
    }

    // Trigger manual flush
    batcher.add(createContentEvent());
    batcher.flush();

    const metrics = batcher.getMetrics();
    expect(metrics.flushReasons['size']).toBe(1);
    expect(metrics.flushReasons['manual']).toBe(1);
  });

  it('should reset metrics', () => {
    for (let i = 0; i < 5; i++) {
      batcher.add(createContentEvent(i));
    }

    batcher.resetMetrics();

    const metrics = batcher.getMetrics();
    expect(metrics.totalEvents).toBe(0);
    expect(metrics.totalBatches).toBe(0);
  });

  it('should track current buffer size in metrics', () => {
    batcher.add(createContentEvent());
    batcher.add(createContentEvent());

    expect(batcher.getMetrics().currentBufferSize).toBe(2);
  });
});

// ============================================================================
// Batch Metadata Tests
// ============================================================================

describe('EventBatcher - Batch Metadata', () => {
  let batcher: EventBatcher;
  let batches: EventBatch[];

  beforeEach(() => {
    batches = [];
    batcher = createEventBatcher({
      batchSize: 3,
      batchTimeout: 1000,
      onFlush: (batch) => batches.push(batch),
    });
  });

  afterEach(() => {
    batcher.dispose();
  });

  it('should include batch ID', () => {
    for (let i = 0; i < 3; i++) {
      batcher.add(createContentEvent(i));
    }

    expect(batches[0].metadata.batchId).toMatch(/^batch_\d+_/);
  });

  it('should generate unique batch IDs', () => {
    for (let i = 0; i < 6; i++) {
      batcher.add(createContentEvent(i));
    }

    expect(batches[0].metadata.batchId).not.toBe(batches[1].metadata.batchId);
  });

  it('should include event count', () => {
    for (let i = 0; i < 3; i++) {
      batcher.add(createContentEvent(i));
    }

    expect(batches[0].metadata.count).toBe(3);
  });

  it('should include flush timestamp', () => {
    const before = new Date().toISOString();

    for (let i = 0; i < 3; i++) {
      batcher.add(createContentEvent(i));
    }

    const after = new Date().toISOString();

    expect(batches[0].metadata.flushedAt >= before).toBe(true);
    expect(batches[0].metadata.flushedAt <= after).toBe(true);
  });
});

// ============================================================================
// Event Emission Tests
// ============================================================================

describe('EventBatcher - Event Emission', () => {
  let batcher: EventBatcher;

  beforeEach(() => {
    batcher = createEventBatcher({
      batchSize: 2,
      batchTimeout: 1000,
    });
  });

  afterEach(() => {
    batcher.dispose();
  });

  it('should emit batch event', () => {
    const batchSpy = vi.fn();
    batcher.on('batch', batchSpy);

    batcher.add(createContentEvent());
    batcher.add(createContentEvent());

    expect(batchSpy).toHaveBeenCalled();
    expect(batchSpy.mock.calls[0][0].events).toHaveLength(2);
  });

  it('should emit batch event for priority events', () => {
    const batchSpy = vi.fn();
    batcher.on('batch', batchSpy);

    batcher.add(createRunStartedEvent());

    expect(batchSpy).toHaveBeenCalled();
    expect(batchSpy.mock.calls[0][0].events).toHaveLength(1);
  });
});

// ============================================================================
// Utility State Methods Tests
// ============================================================================

describe('EventBatcher - State Methods', () => {
  let batcher: EventBatcher;

  beforeEach(() => {
    batcher = createEventBatcher({
      batchSize: 10,
      batchTimeout: 1000,
    });
  });

  afterEach(() => {
    batcher.dispose();
  });

  it('should return buffer size', () => {
    expect(batcher.getBufferSize()).toBe(0);

    batcher.add(createContentEvent());
    expect(batcher.getBufferSize()).toBe(1);

    batcher.add(createContentEvent());
    expect(batcher.getBufferSize()).toBe(2);
  });

  it('should return pending events', () => {
    const event1 = createContentEvent(1);
    const event2 = createContentEvent(2);

    batcher.add(event1);
    batcher.add(event2);

    const pending = batcher.getPendingEvents();
    expect(pending).toHaveLength(2);
    expect(pending[0]).toBe(event1);
    expect(pending[1]).toBe(event2);
  });

  it('should check for pending events', () => {
    expect(batcher.hasPendingEvents()).toBe(false);

    batcher.add(createContentEvent());

    expect(batcher.hasPendingEvents()).toBe(true);
  });
});

// ============================================================================
// Dispose Tests
// ============================================================================

describe('EventBatcher - Dispose', () => {
  it('should flush pending events on dispose', () => {
    const batches: EventBatch[] = [];
    const batcher = createEventBatcher({
      batchSize: 10,
      onFlush: (b) => batches.push(b),
    });

    batcher.add(createContentEvent());
    batcher.add(createContentEvent());

    batcher.dispose();

    expect(batches).toHaveLength(1);
    expect(batches[0].events).toHaveLength(2);
  });

  it('should clear buffer on dispose', () => {
    const batcher = createEventBatcher();

    batcher.add(createContentEvent());
    batcher.dispose();

    expect(batcher.getBufferSize()).toBe(0);
  });

  it('should remove all listeners on dispose', () => {
    const batcher = createEventBatcher();
    const spy = vi.fn();

    batcher.on('batch', spy);
    batcher.dispose();

    expect(batcher.listenerCount('batch')).toBe(0);
  });
});

// ============================================================================
// addMany Tests
// ============================================================================

describe('EventBatcher - addMany', () => {
  let batcher: EventBatcher;
  let batches: EventBatch[];

  beforeEach(() => {
    batches = [];
    batcher = createEventBatcher({
      batchSize: 5,
      batchTimeout: 1000,
      onFlush: (batch) => batches.push(batch),
    });
  });

  afterEach(() => {
    batcher.dispose();
  });

  it('should add multiple events at once', () => {
    const events = [createContentEvent(1), createContentEvent(2), createContentEvent(3)];

    batcher.addMany(events);

    expect(batcher.getBufferSize()).toBe(3);
  });

  it('should return count of batched events', () => {
    const events = [
      createContentEvent(1),
      createRunStartedEvent(), // Priority - not batched
      createContentEvent(2),
    ];

    const batched = batcher.addMany(events);

    expect(batched).toBe(2);
  });

  it('should trigger flush when batch size exceeded', () => {
    const events = [
      createContentEvent(1),
      createContentEvent(2),
      createContentEvent(3),
      createContentEvent(4),
      createContentEvent(5),
      createContentEvent(6),
    ];

    batcher.addMany(events);

    expect(batches).toHaveLength(1);
    expect(batches[0].events).toHaveLength(5);
    expect(batcher.getBufferSize()).toBe(1);
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('serializeBatch', () => {
  it('should serialize batch with metadata', () => {
    const batch: EventBatch = {
      events: [createContentEvent()],
      metadata: {
        batchId: 'batch_1',
        count: 1,
        firstEventTimestamp: '2026-01-01T00:00:00.000Z',
        lastEventTimestamp: '2026-01-01T00:00:00.000Z',
        flushedAt: '2026-01-01T00:00:01.000Z',
        flushReason: 'size',
        batchDurationMs: 100,
      },
    };

    const serialized = serializeBatch(batch);
    const parsed = JSON.parse(serialized);

    expect(parsed.events).toHaveLength(1);
    expect(parsed.metadata.batchId).toBe('batch_1');
  });

  it('should serialize batch without metadata', () => {
    const batch: EventBatch = {
      events: [createContentEvent()],
      metadata: {
        batchId: 'batch_1',
        count: 1,
        firstEventTimestamp: '2026-01-01T00:00:00.000Z',
        lastEventTimestamp: '2026-01-01T00:00:00.000Z',
        flushedAt: '2026-01-01T00:00:01.000Z',
        flushReason: 'size',
        batchDurationMs: 100,
      },
    };

    const serialized = serializeBatch(batch, false);
    const parsed = JSON.parse(serialized);

    expect(parsed.events).toHaveLength(1);
    expect(parsed.metadata).toBeUndefined();
  });
});

describe('deserializeBatch', () => {
  it('should deserialize batch with metadata', () => {
    const data = JSON.stringify({
      events: [createContentEvent()],
      metadata: {
        batchId: 'batch_1',
        count: 1,
        firstEventTimestamp: '2026-01-01T00:00:00.000Z',
        lastEventTimestamp: '2026-01-01T00:00:00.000Z',
        flushedAt: '2026-01-01T00:00:01.000Z',
        flushReason: 'size',
        batchDurationMs: 100,
      },
    });

    const batch = deserializeBatch(data);

    expect(batch.events).toHaveLength(1);
    expect(batch.metadata.batchId).toBe('batch_1');
  });

  it('should deserialize batch without metadata', () => {
    const event = createContentEvent();
    const data = JSON.stringify({
      events: [event],
    });

    const batch = deserializeBatch(data);

    expect(batch.events).toHaveLength(1);
    expect(batch.metadata.batchId).toBe('deserialized');
    expect(batch.metadata.count).toBe(1);
  });
});

describe('calculateOptimalBatchConfig', () => {
  it('should calculate config for low latency requirements', () => {
    const config = calculateOptimalBatchConfig({
      rttMs: 50,
      eventsPerSecond: 100,
      maxLatencyMs: 50,
    });

    expect(config.batchTimeout).toBeLessThanOrEqual(25);
    expect(config.enabled).toBe(true);
  });

  it('should calculate config for high throughput', () => {
    const config = calculateOptimalBatchConfig({
      rttMs: 100,
      eventsPerSecond: 1000,
      maxLatencyMs: 200,
    });

    expect(config.batchSize).toBeGreaterThan(1);
    expect(config.batchTimeout).toBeLessThanOrEqual(100);
  });

  it('should clamp batch size to reasonable bounds', () => {
    const config = calculateOptimalBatchConfig({
      rttMs: 100,
      eventsPerSecond: 10000,
      maxLatencyMs: 1000,
    });

    expect(config.batchSize).toBeLessThanOrEqual(50);
    expect(config.batchSize).toBeGreaterThanOrEqual(1);
  });
});

describe('getDefaultPriorityEvents', () => {
  it('should return default priority events', () => {
    const events = getDefaultPriorityEvents();

    expect(events).toContain(AGUIEventType.RUN_STARTED);
    expect(events).toContain(AGUIEventType.RUN_FINISHED);
    expect(events).toContain(AGUIEventType.RUN_ERROR);
    expect(events).toContain(AGUIEventType.STATE_SNAPSHOT);
    expect(events).toContain(AGUIEventType.MESSAGES_SNAPSHOT);
  });
});

describe('withBatching', () => {
  it('should create batching wrapper', () => {
    const emitter = new EventEmitter();
    const wrapper = withBatching(emitter, { batchSize: 2 });

    expect(wrapper.batcher).toBeInstanceOf(EventBatcher);
    expect(wrapper.emitter).toBe(emitter);

    wrapper.dispose();
  });

  it('should forward batches to emitter', () => {
    const emitter = new EventEmitter();
    const batchSpy = vi.fn();
    emitter.on('batch', batchSpy);

    const wrapper = withBatching(emitter, { batchSize: 2 });

    wrapper.batcher.add(createContentEvent());
    wrapper.batcher.add(createContentEvent());

    expect(batchSpy).toHaveBeenCalled();

    wrapper.dispose();
  });
});

// ============================================================================
// Stress Tests
// ============================================================================

describe('EventBatcher - Stress Tests', () => {
  it('should handle high throughput (10000 events)', () => {
    const batches: EventBatch[] = [];
    const batcher = createEventBatcher({
      batchSize: 100,
      batchTimeout: 10000,
      onFlush: (batch) => batches.push(batch),
    });

    const startTime = Date.now();

    for (let i = 0; i < 10000; i++) {
      batcher.add(createContentEvent(i));
    }

    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    expect(batches.length).toBe(100); // 10000 / 100

    batcher.dispose();
  });

  it('should handle mixed priority and regular events', () => {
    const batches: EventBatch[] = [];
    const batcher = createEventBatcher({
      batchSize: 10,
      batchTimeout: 10000,
      onFlush: (batch) => batches.push(batch),
    });

    for (let i = 0; i < 100; i++) {
      if (i % 10 === 0) {
        batcher.add(createRunStartedEvent());
      } else {
        batcher.add(createContentEvent(i));
      }
    }

    const metrics = batcher.getMetrics();

    expect(metrics.priorityEvents).toBe(10);
    expect(metrics.batchedEvents).toBe(90);

    batcher.dispose();
  });

  it('should maintain order under rapid batching', () => {
    const batches: EventBatch[] = [];
    const batcher = createEventBatcher({
      batchSize: 10,
      batchTimeout: 10000,
      onFlush: (batch) => batches.push(batch),
    });

    // Add 100 events rapidly
    for (let i = 0; i < 100; i++) {
      batcher.add(
        createMockEvent(AGUIEventType.TEXT_MESSAGE_CONTENT, {
          eventId: `evt_${i.toString().padStart(4, '0')}`,
        })
      );
    }

    // Verify order in all batches
    let expectedIndex = 0;
    for (const batch of batches) {
      for (const event of batch.events) {
        const expectedId = `evt_${expectedIndex.toString().padStart(4, '0')}`;
        expect(event.eventId).toBe(expectedId);
        expectedIndex++;
      }
    }

    batcher.dispose();
  });
});
