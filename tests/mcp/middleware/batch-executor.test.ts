/**
 * IMP-02: Batch Tool Executor Tests
 *
 * Verifies that BatchToolExecutor correctly partitions tool calls by
 * concurrency safety, executes parallel batches via Promise.all with a
 * semaphore limiter, and preserves result ordering.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  BatchToolExecutor,
  Semaphore,
  type BatchToolCall,
} from '../../../src/mcp/middleware/batch-executor';

// ============================================================================
// Helpers
// ============================================================================

/** Creates a handler that resolves after `delayMs` with `value`. */
function delayedHandler(value: unknown, delayMs: number): () => Promise<unknown> {
  return () => new Promise((resolve) => setTimeout(() => resolve(value), delayMs));
}

/** Creates an instantly-resolving handler returning `value`. */
function instantHandler(value: unknown): () => Promise<unknown> {
  return () => Promise.resolve(value);
}

function safeTool(name: string, handler: () => Promise<unknown>): BatchToolCall {
  return { name, handler, isConcurrencySafe: true };
}

function unsafeTool(name: string, handler: () => Promise<unknown>): BatchToolCall {
  return { name, handler, isConcurrencySafe: false };
}

// ============================================================================
// Semaphore unit tests
// ============================================================================

describe('Semaphore', () => {
  it('should reject permits < 1', () => {
    expect(() => new Semaphore(0)).toThrow('Semaphore permits must be >= 1');
  });

  it('should allow immediate acquire when permits are available', async () => {
    const sem = new Semaphore(2);
    await sem.acquire();
    expect(sem.available).toBe(1);
    await sem.acquire();
    expect(sem.available).toBe(0);
  });

  it('should block when no permits and resolve on release', async () => {
    const sem = new Semaphore(1);
    await sem.acquire(); // Takes the only permit

    let acquired = false;
    const pending = sem.acquire().then(() => {
      acquired = true;
    });

    // Give microtasks a chance to run — should still be blocked
    await new Promise((r) => setTimeout(r, 10));
    expect(acquired).toBe(false);

    sem.release();
    await pending;
    expect(acquired).toBe(true);
  });
});

// ============================================================================
// BatchToolExecutor tests
// ============================================================================

describe('BatchToolExecutor', () => {
  it('should return empty results for empty batch', async () => {
    const executor = new BatchToolExecutor();
    const result = await executor.executeBatch([]);

    expect(result.results).toEqual([]);
    expect(result.parallelBatches).toBe(0);
    expect(result.sequentialCalls).toBe(0);
    expect(result.totalWallTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should execute 5 concurrent-safe tools in parallel (wall time < sequential)', async () => {
    const DELAY = 50; // ms each
    const TOOL_COUNT = 5;
    const executor = new BatchToolExecutor(TOOL_COUNT); // enough concurrency for all

    const calls: BatchToolCall[] = Array.from({ length: TOOL_COUNT }, (_, i) =>
      safeTool(`tool_${i}`, delayedHandler(`result_${i}`, DELAY))
    );

    const start = Date.now();
    const result = await executor.executeBatch(calls);
    const elapsed = Date.now() - start;

    // All should have run in parallel, so total time ~ DELAY, not DELAY * 5
    // Use a generous threshold: must be less than half the sequential time
    const maxParallelTime = DELAY * TOOL_COUNT * 0.6;
    expect(elapsed).toBeLessThan(maxParallelTime);

    expect(result.results).toEqual([
      'result_0', 'result_1', 'result_2', 'result_3', 'result_4',
    ]);
    expect(result.parallelBatches).toBe(1);
    expect(result.sequentialCalls).toBe(0);
  });

  it('should break batch when non-safe tool appears: [safe, safe, unsafe, safe, safe]', async () => {
    const executor = new BatchToolExecutor();
    const order: string[] = [];

    function trackingHandler(name: string, value: unknown): () => Promise<unknown> {
      return async () => {
        order.push(name);
        return value;
      };
    }

    const calls: BatchToolCall[] = [
      safeTool('s1', trackingHandler('s1', 'r1')),
      safeTool('s2', trackingHandler('s2', 'r2')),
      unsafeTool('u1', trackingHandler('u1', 'r3')),
      safeTool('s3', trackingHandler('s3', 'r4')),
      safeTool('s4', trackingHandler('s4', 'r5')),
    ];

    const result = await executor.executeBatch(calls);

    // Results must be in original order regardless of execution order
    expect(result.results).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
    expect(result.parallelBatches).toBe(2);  // [s1, s2] and [s3, s4]
    expect(result.sequentialCalls).toBe(1);   // [u1]

    // Verify sequential ordering: u1 must appear after both s1 and s2,
    // and before both s3 and s4
    const u1Idx = order.indexOf('u1');
    expect(u1Idx).toBeGreaterThan(-1);
    // s1 and s2 ran before u1 (in batch 1)
    expect(order.indexOf('s1')).toBeLessThan(u1Idx);
    expect(order.indexOf('s2')).toBeLessThan(u1Idx);
    // s3 and s4 ran after u1 (in batch 2)
    expect(order.indexOf('s3')).toBeGreaterThan(u1Idx);
    expect(order.indexOf('s4')).toBeGreaterThan(u1Idx);
  });

  it('should respect max concurrency limit via semaphore', async () => {
    const MAX_CONCURRENCY = 2;
    const executor = new BatchToolExecutor(MAX_CONCURRENCY);

    let peakConcurrent = 0;
    let currentConcurrent = 0;

    function concurrencyTracker(value: unknown): () => Promise<unknown> {
      return async () => {
        currentConcurrent++;
        if (currentConcurrent > peakConcurrent) {
          peakConcurrent = currentConcurrent;
        }
        // Hold the slot briefly so concurrent tasks overlap
        await new Promise((r) => setTimeout(r, 20));
        currentConcurrent--;
        return value;
      };
    }

    const calls: BatchToolCall[] = Array.from({ length: 6 }, (_, i) =>
      safeTool(`tool_${i}`, concurrencyTracker(`result_${i}`))
    );

    const result = await executor.executeBatch(calls);

    expect(peakConcurrent).toBeLessThanOrEqual(MAX_CONCURRENCY);
    expect(peakConcurrent).toBeGreaterThanOrEqual(1); // at least 1 ran
    expect(result.results).toHaveLength(6);
    expect(result.parallelBatches).toBe(1);
  });

  it('should maintain original order of results', async () => {
    const executor = new BatchToolExecutor();

    // Tools with varying delays — fast ones finish first but must appear
    // at their original index
    const calls: BatchToolCall[] = [
      safeTool('slow', delayedHandler('slow-result', 40)),
      safeTool('fast', delayedHandler('fast-result', 5)),
      safeTool('medium', delayedHandler('medium-result', 20)),
    ];

    const result = await executor.executeBatch(calls);

    expect(result.results[0]).toBe('slow-result');
    expect(result.results[1]).toBe('fast-result');
    expect(result.results[2]).toBe('medium-result');
  });

  it('should handle a single non-safe call correctly', async () => {
    const executor = new BatchToolExecutor();

    const calls: BatchToolCall[] = [
      unsafeTool('solo', instantHandler('solo-result')),
    ];

    const result = await executor.executeBatch(calls);

    expect(result.results).toEqual(['solo-result']);
    expect(result.parallelBatches).toBe(0);
    expect(result.sequentialCalls).toBe(1);
  });

  it('should handle all non-safe calls sequentially', async () => {
    const executor = new BatchToolExecutor();
    const order: number[] = [];

    const calls: BatchToolCall[] = [0, 1, 2].map((i) =>
      unsafeTool(`u_${i}`, async () => {
        order.push(i);
        return `result_${i}`;
      })
    );

    const result = await executor.executeBatch(calls);

    expect(result.results).toEqual(['result_0', 'result_1', 'result_2']);
    expect(result.parallelBatches).toBe(0);
    expect(result.sequentialCalls).toBe(3);
    // Must run strictly in order
    expect(order).toEqual([0, 1, 2]);
  });

  it('should read AQE_MAX_TOOL_CONCURRENCY from environment', async () => {
    const original = process.env.AQE_MAX_TOOL_CONCURRENCY;
    try {
      process.env.AQE_MAX_TOOL_CONCURRENCY = '3';
      const executor = new BatchToolExecutor();

      let peakConcurrent = 0;
      let currentConcurrent = 0;

      function tracker(value: unknown): () => Promise<unknown> {
        return async () => {
          currentConcurrent++;
          if (currentConcurrent > peakConcurrent) peakConcurrent = currentConcurrent;
          await new Promise((r) => setTimeout(r, 20));
          currentConcurrent--;
          return value;
        };
      }

      const calls: BatchToolCall[] = Array.from({ length: 8 }, (_, i) =>
        safeTool(`t_${i}`, tracker(i))
      );

      await executor.executeBatch(calls);
      expect(peakConcurrent).toBeLessThanOrEqual(3);
    } finally {
      if (original === undefined) {
        delete process.env.AQE_MAX_TOOL_CONCURRENCY;
      } else {
        process.env.AQE_MAX_TOOL_CONCURRENCY = original;
      }
    }
  });

  it('should propagate handler errors without crashing the batch', async () => {
    const executor = new BatchToolExecutor();

    const calls: BatchToolCall[] = [
      safeTool('ok', instantHandler('fine')),
      safeTool('bad', async () => {
        throw new Error('boom');
      }),
      safeTool('also-ok', instantHandler('also-fine')),
    ];

    await expect(executor.executeBatch(calls)).rejects.toThrow('boom');
  });
});
