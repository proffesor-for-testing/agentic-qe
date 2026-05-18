/**
 * Regression: #493 follow-up — Date coercion in MetricsOptimizerService.
 *
 * `getMetricsHistory` reads `MetricsSnapshot` rows from kv. Each row has a
 * `timestamp: Date` field that arrives as an ISO string after JSON round-trip.
 * Pre-fix, `snapshots.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())`
 * at line 401 throws `TypeError: timestamp.getTime is not a function` once
 * any snapshot exists in the kv. Post-fix (rehydrateDates at the read seam),
 * the sort works and callers receive real Date instances.
 */

import { describe, it, expect, vi } from 'vitest';
import { MetricsOptimizerService } from '../../../../src/domains/learning-optimization/services/metrics-optimizer';
import type { MetricsSnapshot } from '../../../../src/domains/learning-optimization/services/metrics-optimizer';
import type { MemoryBackend, StoreOptions, VectorSearchResult } from '../../../../src/kernel/interfaces';

function makeKvMemory(seed: Record<string, unknown>): MemoryBackend {
  const storage = new Map<string, unknown>(Object.entries(seed));
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockImplementation(async (key: string, value: unknown, _options?: StoreOptions) => {
      storage.set(key, value);
    }),
    get: vi.fn().mockImplementation(async <T>(key: string): Promise<T | undefined> => {
      return storage.get(key) as T | undefined;
    }),
    delete: vi.fn().mockImplementation(async (key: string) => storage.delete(key)),
    has: vi.fn().mockImplementation(async (key: string) => storage.has(key)),
    search: vi.fn().mockImplementation(async (pattern: string, _limit?: number) => {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return Array.from(storage.keys()).filter((k) => regex.test(k));
    }),
    vectorSearch: vi.fn().mockResolvedValue([] as VectorSearchResult[]),
    storeVector: vi.fn().mockResolvedValue(undefined),
  };
}

describe('MetricsOptimizerService — kv-Date rehydration (#493 follow-up)', () => {
  it('sorts kv-shape snapshots by timestamp without throwing', async () => {
    const strategyId = 'strategy-A';
    const now = Date.now();
    // Three snapshots, all with ISO-string timestamps (post-JSON shape).
    // Insert out-of-order so the sort actually has to do work.
    const middle: MetricsSnapshot = {
      strategyId,
      metrics: { accuracy: 0.85 },
      timestamp: new Date(now - 2 * 60 * 60 * 1000).toISOString() as unknown as Date,
      samples: 100,
    };
    const oldest: MetricsSnapshot = {
      strategyId,
      metrics: { accuracy: 0.7 },
      timestamp: new Date(now - 5 * 60 * 60 * 1000).toISOString() as unknown as Date,
      samples: 50,
    };
    const newest: MetricsSnapshot = {
      strategyId,
      metrics: { accuracy: 0.9 },
      timestamp: new Date(now - 30 * 60 * 1000).toISOString() as unknown as Date,
      samples: 200,
    };

    const service = new MetricsOptimizerService(
      makeKvMemory({
        [`learning:metrics:history:${strategyId}:1`]: middle,
        [`learning:metrics:history:${strategyId}:2`]: oldest,
        [`learning:metrics:history:${strategyId}:3`]: newest,
      }),
    );

    const result = await service.getMetricsHistory(strategyId);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toHaveLength(3);
    // Sorted ascending by timestamp — pre-fix this would not run at all.
    expect(result.value[0]!.samples).toBe(50); // oldest first
    expect(result.value[1]!.samples).toBe(100);
    expect(result.value[2]!.samples).toBe(200);
    // Every returned timestamp is a real Date — downstream callers expect this.
    for (const snap of result.value) {
      expect(snap.timestamp).toBeInstanceOf(Date);
    }
  });

  it('handles an empty kv (the common fresh-install case) without throwing', async () => {
    const service = new MetricsOptimizerService(makeKvMemory({}));
    const result = await service.getMetricsHistory('strategy-X');

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toEqual([]);
  });
});
