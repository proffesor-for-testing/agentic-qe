/**
 * AG-UI Integration Tests
 *
 * Verifies that EventBatcher and StateDeltaCache are ACTUALLY INTEGRATED
 * into EventAdapter and StateManager respectively.
 *
 * These tests verify the wiring, not just the isolated components.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createEventAdapter,
  createStateManager,
  type AGUIEvent,
  type EventBatch,
  AGUIEventType,
} from '../../../src/adapters/ag-ui/index.js';

describe('AG-UI Integration: EventBatcher Wiring', () => {
  it('should have EventBatcher enabled by default', () => {
    const adapter = createEventAdapter();
    expect(adapter.isBatchingEnabled()).toBe(true);
    expect(adapter.getEventBatcher()).not.toBeNull();
  });

  it('should batch non-priority events', () => {
    const adapter = createEventAdapter({
      batcherConfig: {
        batchSize: 3,
        batchTimeout: 1000, // Long timeout so we test size-based flush
      },
    });

    const batches: EventBatch[] = [];
    adapter.on('batchFlush', (batch: EventBatch) => batches.push(batch));

    // Emit 3 TEXT_MESSAGE_CONTENT events (non-priority, should batch)
    adapter.emitTextMessageContent('msg-1', 'Hello ');
    adapter.emitTextMessageContent('msg-1', 'World ');
    adapter.emitTextMessageContent('msg-1', '!');

    // Should have triggered a batch flush (batchSize: 3)
    expect(batches.length).toBe(1);
    expect(batches[0].events.length).toBe(3);
    expect(batches[0].metadata.flushReason).toBe('size');
  });

  it('should emit priority events immediately (not batched)', () => {
    const adapter = createEventAdapter({
      batcherConfig: {
        batchSize: 10, // Large batch size
        batchTimeout: 1000, // Long timeout
      },
    });

    const events: AGUIEvent[] = [];
    adapter.on('event', (e: AGUIEvent) => events.push(e));

    // RUN_STARTED is a priority event, should emit immediately
    adapter.emitRunStarted('thread-1', 'run-1');

    // Should have emitted immediately without batching
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(AGUIEventType.RUN_STARTED);
  });

  it('should track batcher metrics', () => {
    const adapter = createEventAdapter({
      batcherConfig: {
        batchSize: 2,
      },
    });

    // Emit some events
    adapter.emitTextMessageContent('msg-1', 'test1');
    adapter.emitTextMessageContent('msg-1', 'test2'); // Triggers batch
    adapter.emitRunStarted('thread-1'); // Priority event

    const metrics = adapter.getBatcherMetrics();
    expect(metrics).not.toBeNull();
    expect(metrics!.totalEvents).toBe(3);
    expect(metrics!.priorityEvents).toBe(1);
    expect(metrics!.batchedEvents).toBe(2);
    expect(metrics!.totalBatches).toBeGreaterThanOrEqual(1);
  });

  it('should allow disabling batching', () => {
    const adapter = createEventAdapter({
      enableBatching: false,
    });

    expect(adapter.isBatchingEnabled()).toBe(false);
    expect(adapter.getEventBatcher()).toBeNull();
  });

  it('should flush batcher on manual request', () => {
    const adapter = createEventAdapter({
      batcherConfig: {
        batchSize: 100, // Large batch
        batchTimeout: 10000, // Long timeout
      },
    });

    const batches: EventBatch[] = [];
    adapter.on('batchFlush', (batch: EventBatch) => batches.push(batch));

    // Add some events
    adapter.emitTextMessageContent('msg-1', 'test1');
    adapter.emitTextMessageContent('msg-1', 'test2');

    // No batch yet (haven't hit size or timeout)
    expect(batches.length).toBe(0);

    // Manual flush
    adapter.flushBatcher();

    // Now we should have a batch
    expect(batches.length).toBe(1);
    expect(batches[0].metadata.flushReason).toBe('manual');
  });
});

describe('AG-UI Integration: StateDeltaCache Wiring', () => {
  it('should have StateDeltaCache enabled by default', () => {
    const manager = createStateManager();
    expect(manager.isCacheEnabled()).toBe(true);
    expect(manager.getDeltaCache()).not.toBeNull();
  });

  it('should use cache for setState delta computation', () => {
    const manager = createStateManager({
      enableCache: true,
    });

    // Get initial metrics
    const initialMetrics = manager.getCacheMetrics();
    expect(initialMetrics).not.toBeNull();

    // First setState - should be a cache miss
    manager.setState({ status: 'running' });

    const afterFirst = manager.getCacheMetrics()!;
    expect(afterFirst.misses).toBe(1);

    // Same transition again - should be a cache hit
    manager.reset(); // Back to initial state
    manager.setState({ status: 'running' });

    const afterSecond = manager.getCacheMetrics()!;
    expect(afterSecond.hits).toBe(1);
  });

  it('should track cache metrics', () => {
    const manager = createStateManager();

    // Perform some state changes
    manager.setState({ a: 1 });
    manager.setState({ a: 2 });
    manager.setState({ a: 3 });

    const metrics = manager.getCacheMetrics();
    expect(metrics).not.toBeNull();
    expect(metrics!.size).toBeGreaterThan(0);
    expect(metrics!.misses + metrics!.hits).toBe(3);
  });

  it('should allow disabling cache', () => {
    const manager = createStateManager({
      enableCache: false,
    });

    expect(manager.isCacheEnabled()).toBe(false);
    expect(manager.getDeltaCache()).toBeNull();
    expect(manager.getCacheMetrics()).toBeNull();
  });

  it('should support pre-computing transitions', () => {
    const manager = createStateManager();

    // Pre-compute a known transition
    const delta = manager.precomputeTransition(
      { status: 'idle' },
      { status: 'running' }
    );

    expect(delta).not.toBeNull();
    expect(delta!.length).toBeGreaterThan(0);

    // Verify it's in cache
    const metrics = manager.getCacheMetrics()!;
    expect(metrics.size).toBeGreaterThan(0);
  });

  it('should warm cache with common transitions', () => {
    const manager = createStateManager();

    // Cache should be warmed on construction (default behavior)
    const metrics = manager.getCacheMetrics()!;

    // Warming includes agent status, progress, and tool status transitions
    expect(metrics.preComputedEntries).toBeGreaterThan(0);
  });

  it('should clear cache on request', () => {
    const manager = createStateManager();

    // Do some operations to add to cache
    manager.setState({ test: 1 });
    manager.setState({ test: 2 });

    const beforeClear = manager.getCacheMetrics()!;
    expect(beforeClear.size).toBeGreaterThan(0);

    // Clear cache
    manager.clearCache();

    const afterClear = manager.getCacheMetrics()!;
    expect(afterClear.size).toBe(0);
  });
});

describe('AG-UI Integration: Full Pipeline', () => {
  it('should handle complete event flow with batching and state caching', () => {
    const adapter = createEventAdapter({
      batcherConfig: {
        batchSize: 5,
        batchTimeout: 50,
      },
    });
    const stateManager = createStateManager();

    const events: AGUIEvent[] = [];
    const batches: EventBatch[] = [];

    adapter.on('event', (e: AGUIEvent) => events.push(e));
    adapter.on('batchFlush', (b: EventBatch) => batches.push(b));

    // Simulate agent lifecycle
    adapter.emitRunStarted('thread-1', 'run-1'); // Priority - immediate

    // State changes
    stateManager.setState({ agent: { status: 'running' } });
    const delta1 = stateManager.setState({ agent: { status: 'running' }, progress: 25 });
    const delta2 = stateManager.setState({ agent: { status: 'running' }, progress: 50 });

    // Emit state delta events (non-priority, will batch)
    adapter.emitStateDelta(delta1, stateManager.getVersion());
    adapter.emitStateDelta(delta2, stateManager.getVersion());

    // Complete
    adapter.emitRunFinished('run-1', 'success'); // Priority - immediate

    // Flush remaining
    adapter.flushBatcher();

    // Verify events were received
    expect(events.some(e => e.type === AGUIEventType.RUN_STARTED)).toBe(true);
    expect(events.some(e => e.type === AGUIEventType.RUN_FINISHED)).toBe(true);
    expect(events.some(e => e.type === AGUIEventType.STATE_DELTA)).toBe(true);

    // Verify state cache was used
    const cacheMetrics = stateManager.getCacheMetrics()!;
    expect(cacheMetrics.misses + cacheMetrics.hits).toBeGreaterThan(0);

    // Verify batching occurred
    const batcherMetrics = adapter.getBatcherMetrics()!;
    expect(batcherMetrics.totalEvents).toBeGreaterThan(0);
  });
});
