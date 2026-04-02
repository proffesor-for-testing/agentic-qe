import { describe, it, expect, vi } from 'vitest';
import { parallelPrefetch, type PrefetchResult } from '../../src/boot/parallel-prefetch';

describe('parallelPrefetch', () => {
  it('should run all tasks and return completed list', async () => {
    const result = await parallelPrefetch([
      { name: 'task-a', fn: async () => {} },
      { name: 'task-b', fn: async () => {} },
    ]);

    expect(result.completedTasks).toEqual(['task-a', 'task-b']);
    expect(result.failedTasks).toEqual([]);
    expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should isolate failures — one failing task does not block others', async () => {
    const result = await parallelPrefetch([
      { name: 'ok', fn: async () => {} },
      { name: 'fail', fn: async () => { throw new Error('boom'); } },
      { name: 'also-ok', fn: async () => {} },
    ]);

    expect(result.completedTasks).toEqual(['ok', 'also-ok']);
    expect(result.failedTasks).toHaveLength(1);
    expect(result.failedTasks[0].name).toBe('fail');
    expect(result.failedTasks[0].error).toBe('boom');
  });

  it('should handle all tasks failing', async () => {
    const result = await parallelPrefetch([
      { name: 'a', fn: async () => { throw new Error('err-a'); } },
      { name: 'b', fn: async () => { throw new Error('err-b'); } },
    ]);

    expect(result.completedTasks).toEqual([]);
    expect(result.failedTasks).toHaveLength(2);
  });

  it('should handle empty task list', async () => {
    const result = await parallelPrefetch([]);

    expect(result.completedTasks).toEqual([]);
    expect(result.failedTasks).toEqual([]);
    expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should run tasks concurrently (not sequentially)', async () => {
    const start = performance.now();
    const result = await parallelPrefetch([
      { name: 'slow-a', fn: () => new Promise(r => setTimeout(r, 50)) },
      { name: 'slow-b', fn: () => new Promise(r => setTimeout(r, 50)) },
    ]);
    const elapsed = performance.now() - start;

    expect(result.completedTasks).toEqual(['slow-a', 'slow-b']);
    // If sequential, would be >=100ms; parallel should be ~50ms
    expect(elapsed).toBeLessThan(90);
  });

  it('should capture error message from non-Error throws', async () => {
    const result = await parallelPrefetch([
      { name: 'string-throw', fn: async () => { throw 'raw string'; } },
    ]);

    expect(result.failedTasks[0].error).toBe('raw string');
  });

  it('should report totalTimeMs accurately', async () => {
    const result = await parallelPrefetch([
      { name: 'quick', fn: async () => {} },
    ]);

    expect(typeof result.totalTimeMs).toBe('number');
    expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.totalTimeMs).toBeLessThan(1000); // should be very fast
  });
});
