/**
 * Regression: #493 follow-up — Date coercion in ProductionIntelService.
 *
 * Mirrors the issue #493 failure mode in the production-intel service's four
 * kv-read seams: ProductionMetric.timestamp, ProductionIncident.startedAt +
 * resolvedAt, and Milestone.achievedAt. After JSON round-trip through
 * `memory.set`/`memory.get`, these arrive as ISO strings. Two failure modes:
 *
 *  1. THROW — `.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())`
 *     raises TypeError at lines 211, 336, 667, and the `incident.resolvedAt.getTime()
 *     - incident.startedAt.getTime()` math at line 798.
 *  2. SILENT — `timeRange.contains(metric.timestamp)` at line 204 silently
 *     drops every metric (string vs Date coercion → NaN → all-false), so
 *     trends and anomaly detection see empty data with no visible error.
 *
 * Fix is the `rehydrateDates` helper applied at each kv-read site. These
 * tests pin the contract by feeding the mock memory backend kv-shape data
 * (ISO strings, not Date instances — matching what a real
 * better-sqlite3-backed memory yields after JSON.parse).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ProductionIntelService,
  type ProductionMetric,
  type ProductionIncident,
} from '../../../../src/domains/learning-optimization/services/production-intel';
import type { MemoryBackend, StoreOptions, VectorSearchResult } from '../../../../src/kernel/interfaces';
import { TimeRange } from '../../../../src/shared/value-objects';
import type { Milestone } from '../../../../src/domains/learning-optimization/interfaces';

/**
 * Build a mock memory backend pre-seeded with kv-shape records — Date fields
 * are ISO strings, not Date instances. This is the exact shape that
 * better-sqlite3 + JSON serialization produces in production.
 */
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

describe('ProductionIntelService — kv-Date rehydration (#493 follow-up)', () => {
  let service: ProductionIntelService;

  describe('getMetricsHistory (lines 204 silent + 211 throw)', () => {
    it('includes metrics in the time window when timestamp arrives as ISO string', async () => {
      // Two metrics, one inside the window, one outside. Both kv-shape.
      // Pre-fix: timeRange.contains silently rejects both → empty result.
      // Post-fix: only the in-window one is included.
      const insideIso = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago
      const outsideIso = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25h ago
      const metricInside = {
        id: 'm1',
        name: 'latency_p99',
        value: 120,
        unit: 'ms',
        domain: 'test-execution',
        tags: [],
        timestamp: insideIso,
      };
      const metricOutside = { ...metricInside, id: 'm2', timestamp: outsideIso };

      const seed: Record<string, unknown> = {
        // The index entries — getMetricsHistory iterates `production:metric:*`
        // and each value is the metricId string.
        'production:metric:m1': metricInside,
        'production:metric:m2': metricOutside,
        // index pointers (also stored — `memory.get<string>` first dereferences)
        'production:metric:index:latency_p99:m1': 'm1',
        'production:metric:index:latency_p99:m2': 'm2',
      };
      service = new ProductionIntelService(makeKvMemory(seed));

      const window = TimeRange.create(
        new Date(Date.now() - 24 * 60 * 60 * 1000),
        new Date(),
      );

      const result = await service.getMetricsHistory('latency_p99', window);

      expect(result.success).toBe(true);
      if (!result.success) return;
      // Both throw-bug AND silent-bug are now fixed: the in-window metric is
      // returned, the out-of-window one is correctly filtered out.
      expect(result.value).toHaveLength(1);
      expect(result.value[0]!.id).toBe('m1');
      // Caller receives a real Date (downstream `.getTime()` consumers rely
      // on this).
      expect(result.value[0]!.timestamp).toBeInstanceOf(Date);
    });

    it('does NOT throw `getTime is not a function` on the sort step', async () => {
      // Stress the sort path specifically: 3 metrics all in-window.
      const now = Date.now();
      const seed: Record<string, unknown> = {};
      for (let i = 0; i < 3; i++) {
        const id = `m${i}`;
        seed[`production:metric:index:foo:${id}`] = id;
        seed[`production:metric:${id}`] = {
          id,
          name: 'foo',
          value: i,
          unit: 'count',
          domain: 'test-execution',
          tags: [],
          timestamp: new Date(now - i * 60 * 60 * 1000).toISOString(),
        };
      }
      service = new ProductionIntelService(makeKvMemory(seed));

      const result = await service.getMetricsHistory(
        'foo',
        TimeRange.create(new Date(now - 24 * 60 * 60 * 1000), new Date(now)),
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value).toHaveLength(3);
      // Sorted ascending — oldest first.
      expect(result.value[0]!.id).toBe('m2');
      expect(result.value[2]!.id).toBe('m0');
    });
  });

  describe('getRecentIncidents (line 336 throw)', () => {
    it('sorts kv-shape incidents by startedAt descending without throwing', async () => {
      const now = Date.now();
      const old: ProductionIncident = {
        id: 'i-old',
        severity: 'high',
        title: 'old',
        description: '',
        domain: 'test-execution',
        metrics: {},
        startedAt: new Date(now - 5 * 60 * 60 * 1000).toISOString() as unknown as Date,
      };
      const recent: ProductionIncident = {
        id: 'i-recent',
        severity: 'critical',
        title: 'recent',
        description: '',
        domain: 'test-execution',
        metrics: {},
        startedAt: new Date(now - 60 * 60 * 1000).toISOString() as unknown as Date,
      };
      service = new ProductionIntelService(
        makeKvMemory({
          'production:incident:i-old': old,
          'production:incident:i-recent': recent,
        }),
      );

      const result = await service.getRecentIncidents();

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value).toHaveLength(2);
      expect(result.value[0]!.id).toBe('i-recent'); // most recent first
      expect(result.value[0]!.startedAt).toBeInstanceOf(Date);
    });
  });

  describe('getRecentMilestones (line 667 throw)', () => {
    it('sorts kv-shape milestones by achievedAt without throwing', async () => {
      const now = Date.now();
      const m1: Milestone = {
        name: 'first-100-tests',
        domain: 'test-generation',
        achievedAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString() as unknown as Date,
      };
      const m2: Milestone = {
        name: 'first-coverage-90',
        domain: 'coverage-analysis',
        achievedAt: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString() as unknown as Date,
      };
      service = new ProductionIntelService(
        makeKvMemory({
          'production:milestone:1': m1,
          'production:milestone:2': m2,
        }),
      );

      const result = await service.getRecentMilestones(5);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value).toHaveLength(2);
      expect(result.value[0]!.name).toBe('first-coverage-90'); // most recent first
      expect(result.value[0]!.achievedAt).toBeInstanceOf(Date);
    });
  });

  describe('resolveIncident (line 798 throw)', () => {
    it('handles a kv-shape incident through resolve → updateExperienceWithResolution', async () => {
      // The bug chain: memory.get returns kv-shape incident → spread into
      // `resolved` → passed to updateExperienceWithResolution → `.getTime()`
      // math on startedAt throws because spread preserves the string.
      const startedAtIso = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const incident: ProductionIncident = {
        id: 'i-1',
        severity: 'critical',
        title: 'service down',
        description: 'production outage',
        domain: 'test-execution',
        metrics: { error_rate: 0.8 },
        startedAt: startedAtIso as unknown as Date,
      };
      service = new ProductionIntelService(
        makeKvMemory({ 'production:incident:i-1': incident }),
      );

      const result = await service.resolveIncident('i-1', 'database timeout', 'increased pool size');

      // No throw, success, and the rehydrated startedAt is now usable by
      // downstream Date math.
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.startedAt).toBeInstanceOf(Date);
      expect(result.value.resolvedAt).toBeInstanceOf(Date);
      // Sanity: resolve duration is a finite positive number.
      const duration =
        (result.value.resolvedAt as Date).getTime() -
        (result.value.startedAt as Date).getTime();
      expect(Number.isFinite(duration)).toBe(true);
      expect(duration).toBeGreaterThan(0);
    });
  });
});
