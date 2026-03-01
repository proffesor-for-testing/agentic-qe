/**
 * State Delta Cache Unit Tests
 *
 * Tests for pre-computed state delta caching, LRU eviction,
 * cache warming, and fallback computation.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  StateDeltaCache,
  createStateDeltaCache,
  getAgentStatusValues,
  getProgressMilestones,
  getToolStatusValues,
  type StateDeltaCacheConfig,
  type CacheMetrics,
} from '../../../../src/adapters/ag-ui/state-delta-cache.js';
import type { JsonPatchOperation } from '../../../../src/adapters/ag-ui/event-types.js';

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createStateDeltaCache', () => {
  it('should create cache with default config', () => {
    const cache = createStateDeltaCache();
    expect(cache).toBeInstanceOf(StateDeltaCache);
    expect(cache.maxSize).toBe(1000);
  });

  it('should create cache with custom config', () => {
    const cache = createStateDeltaCache({
      maxSize: 500,
      warmOnInit: false,
    });
    expect(cache.maxSize).toBe(500);
    expect(cache.size).toBe(0); // No warming
  });

  it('should create independent instances', () => {
    const cache1 = createStateDeltaCache({ warmOnInit: false });
    const cache2 = createStateDeltaCache({ warmOnInit: false });

    cache1.precompute({ a: 1 }, { a: 2 });
    expect(cache1.size).toBe(1);
    expect(cache2.size).toBe(0);
  });
});

// ============================================================================
// Cache Operations Tests
// ============================================================================

describe('StateDeltaCache', () => {
  let cache: StateDeltaCache;

  beforeEach(() => {
    cache = createStateDeltaCache({
      warmOnInit: false, // Disable for predictable tests
      maxSize: 10,
    });
  });

  // ============================================================================
  // Basic Operations
  // ============================================================================

  describe('getDelta', () => {
    it('should compute delta on cache miss', () => {
      const fromState = { count: 0 };
      const toState = { count: 5 };

      const delta = cache.getDelta(fromState, toState);

      expect(delta).toHaveLength(1);
      expect(delta[0]).toEqual({
        op: 'replace',
        path: '/count',
        value: 5,
      });

      const metrics = cache.getMetrics();
      expect(metrics.misses).toBe(1);
      expect(metrics.hits).toBe(0);
    });

    it('should return cached delta on cache hit', () => {
      const fromState = { count: 0 };
      const toState = { count: 5 };

      // First call - miss
      const delta1 = cache.getDelta(fromState, toState);
      // Second call - hit
      const delta2 = cache.getDelta(fromState, toState);

      expect(delta1).toEqual(delta2);

      const metrics = cache.getMetrics();
      expect(metrics.misses).toBe(1);
      expect(metrics.hits).toBe(1);
    });

    it('should handle add operations', () => {
      const fromState = {};
      const toState = { newField: 'value' };

      const delta = cache.getDelta(fromState, toState);

      expect(delta).toHaveLength(1);
      expect(delta[0]).toEqual({
        op: 'add',
        path: '/newField',
        value: 'value',
      });
    });

    it('should handle remove operations', () => {
      const fromState = { oldField: 'value' };
      const toState = {};

      const delta = cache.getDelta(fromState, toState);

      expect(delta).toHaveLength(1);
      expect(delta[0]).toEqual({
        op: 'remove',
        path: '/oldField',
      });
    });

    it('should handle nested object changes', () => {
      const fromState = { agent: { status: 'idle' } };
      const toState = { agent: { status: 'running' } };

      const delta = cache.getDelta(fromState, toState);

      expect(delta).toHaveLength(1);
      expect(delta[0]).toEqual({
        op: 'replace',
        path: '/agent/status',
        value: 'running',
      });
    });

    it('should handle empty state to complex state', () => {
      const fromState = {};
      const toState = {
        agent: { status: 'running', id: '123' },
        progress: { percent: 50 },
      };

      const delta = cache.getDelta(fromState, toState);

      expect(delta.length).toBeGreaterThan(0);
      expect(delta.some((op) => op.path === '/agent')).toBe(true);
    });

    it('should return empty delta for identical states', () => {
      const state = { count: 5 };

      const delta = cache.getDelta(state, state);

      expect(delta).toHaveLength(0);
    });
  });

  describe('has', () => {
    it('should return false for uncached states', () => {
      const result = cache.has({ a: 1 }, { a: 2 });
      expect(result).toBe(false);
    });

    it('should return true for cached states', () => {
      cache.precompute({ a: 1 }, { a: 2 });
      const result = cache.has({ a: 1 }, { a: 2 });
      expect(result).toBe(true);
    });

    it('should return false for different state order', () => {
      cache.precompute({ a: 1 }, { a: 2 });
      // Different direction
      const result = cache.has({ a: 2 }, { a: 1 });
      expect(result).toBe(false);
    });
  });

  describe('precompute', () => {
    it('should store computed delta in cache', () => {
      const fromState = { status: 'idle' };
      const toState = { status: 'running' };

      cache.precompute(fromState, toState);

      expect(cache.size).toBe(1);
      expect(cache.has(fromState, toState)).toBe(true);
    });

    it('should return the computed delta', () => {
      const fromState = { count: 0 };
      const toState = { count: 100 };

      const delta = cache.precompute(fromState, toState);

      expect(delta).toHaveLength(1);
      expect(delta[0].op).toBe('replace');
    });

    it('should track precomputed entries separately', () => {
      cache.precompute({ a: 1 }, { a: 2 });

      const metrics = cache.getMetrics();
      expect(metrics.preComputedEntries).toBe(1);
    });
  });

  // ============================================================================
  // Cache Invalidation
  // ============================================================================

  describe('invalidate', () => {
    it('should remove specific cache entry', () => {
      const fromState = { a: 1 };
      const toState = { a: 2 };

      cache.precompute(fromState, toState);
      expect(cache.size).toBe(1);

      const removed = cache.invalidate(fromState, toState);
      expect(removed).toBe(true);
      expect(cache.size).toBe(0);
    });

    it('should return false if entry does not exist', () => {
      const removed = cache.invalidate({ x: 1 }, { x: 2 });
      expect(removed).toBe(false);
    });

    it('should remove entry from precomputed tracking', () => {
      cache.precompute({ a: 1 }, { a: 2 });
      cache.invalidate({ a: 1 }, { a: 2 });

      const metrics = cache.getMetrics();
      expect(metrics.preComputedEntries).toBe(0);
    });
  });

  describe('invalidateByPath', () => {
    it('should remove entries matching path prefix', () => {
      cache.precompute(
        { agent: { status: 'idle' } },
        { agent: { status: 'running' } }
      );
      cache.precompute(
        { progress: { percent: 0 } },
        { progress: { percent: 50 } }
      );

      expect(cache.size).toBe(2);

      const removed = cache.invalidateByPath('/agent');
      expect(removed).toBe(1);
      expect(cache.size).toBe(1);
    });

    it('should return 0 if no entries match', () => {
      cache.precompute({ a: 1 }, { a: 2 });

      const removed = cache.invalidateByPath('/nonexistent');
      expect(removed).toBe(0);
      expect(cache.size).toBe(1);
    });
  });

  describe('clear', () => {
    it('should remove all cache entries', () => {
      cache.precompute({ a: 1 }, { a: 2 });
      cache.precompute({ b: 1 }, { b: 2 });

      cache.clear();

      expect(cache.size).toBe(0);
    });

    it('should reset precomputed tracking', () => {
      cache.precompute({ a: 1 }, { a: 2 });
      cache.clear();

      const metrics = cache.getMetrics();
      expect(metrics.preComputedEntries).toBe(0);
    });
  });

  // ============================================================================
  // LRU Eviction
  // ============================================================================

  describe('LRU Eviction', () => {
    it('should evict entries when at capacity', () => {
      const smallCache = createStateDeltaCache({
        maxSize: 3,
        warmOnInit: false,
      });

      // Fill cache
      smallCache.precompute({ a: 1 }, { a: 2 });
      smallCache.precompute({ b: 1 }, { b: 2 });
      smallCache.precompute({ c: 1 }, { c: 2 });
      expect(smallCache.size).toBe(3);

      // Add one more - should evict
      smallCache.precompute({ d: 1 }, { d: 2 });
      expect(smallCache.size).toBe(3);

      const metrics = smallCache.getMetrics();
      expect(metrics.evictions).toBe(1);
    });

    it('should evict least recently accessed entry', async () => {
      const smallCache = createStateDeltaCache({
        maxSize: 3,
        warmOnInit: false,
      });

      // Fill cache
      smallCache.precompute({ a: 1 }, { a: 2 });
      smallCache.precompute({ b: 1 }, { b: 2 });
      smallCache.precompute({ c: 1 }, { c: 2 });

      // Access 'a' and 'c' to make 'b' least recently used
      smallCache.getDelta({ a: 1 }, { a: 2 });
      smallCache.getDelta({ c: 1 }, { c: 2 });

      // Add new entry - should evict 'b'
      smallCache.precompute({ d: 1 }, { d: 2 });

      // 'b' should be gone
      expect(smallCache.has({ b: 1 }, { b: 2 })).toBe(false);
      // 'a' and 'c' should still be there
      expect(smallCache.has({ a: 1 }, { a: 2 })).toBe(true);
      expect(smallCache.has({ c: 1 }, { c: 2 })).toBe(true);
    });

    it('should prefer evicting non-precomputed entries', () => {
      const smallCache = createStateDeltaCache({
        maxSize: 3,
        warmOnInit: false,
      });

      // Add precomputed entry first
      smallCache.precompute({ a: 1 }, { a: 2 });

      // Add computed entries (via getDelta)
      smallCache.getDelta({ b: 1 }, { b: 2 });
      smallCache.getDelta({ c: 1 }, { c: 2 });

      // Add new precomputed - should evict 'b' (oldest non-precomputed)
      smallCache.precompute({ d: 1 }, { d: 2 });

      // Precomputed 'a' should still be there
      expect(smallCache.has({ a: 1 }, { a: 2 })).toBe(true);
    });
  });

  // ============================================================================
  // TTL Expiration
  // ============================================================================

  describe('TTL Expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should expire entries after TTL', () => {
      const ttlCache = createStateDeltaCache({
        maxSize: 10,
        warmOnInit: false,
        ttl: 1000, // 1 second
      });

      ttlCache.precompute({ a: 1 }, { a: 2 });
      expect(ttlCache.has({ a: 1 }, { a: 2 })).toBe(true);

      // Advance time past TTL
      vi.advanceTimersByTime(1500);

      // Should now be expired
      expect(ttlCache.has({ a: 1 }, { a: 2 })).toBe(false);
    });

    it('should recompute on expired entry access', () => {
      const ttlCache = createStateDeltaCache({
        maxSize: 10,
        warmOnInit: false,
        ttl: 1000,
      });

      ttlCache.precompute({ a: 1 }, { a: 2 });

      // Advance time past TTL
      vi.advanceTimersByTime(1500);

      // Should trigger recomputation (miss)
      const delta = ttlCache.getDelta({ a: 1 }, { a: 2 });
      expect(delta).toHaveLength(1);

      const metrics = ttlCache.getMetrics();
      expect(metrics.misses).toBe(1);
    });

    it('should not expire entries when TTL is 0', () => {
      const noTtlCache = createStateDeltaCache({
        maxSize: 10,
        warmOnInit: false,
        ttl: 0, // No TTL
      });

      noTtlCache.precompute({ a: 1 }, { a: 2 });

      // Advance time significantly
      vi.advanceTimersByTime(100000);

      // Should still be cached
      expect(noTtlCache.has({ a: 1 }, { a: 2 })).toBe(true);
    });
  });

  // ============================================================================
  // Cache Warming
  // ============================================================================

  describe('Cache Warming', () => {
    it('should warm cache with agent status transitions', () => {
      const warmedCache = createStateDeltaCache({
        warmOnInit: true,
        maxSize: 100,
      });

      // Check for idle -> running transition
      const fromState = { agent: { status: 'idle' } };
      const toState = { agent: { status: 'running' } };

      const delta = warmedCache.getDelta(fromState, toState);
      expect(delta).toHaveLength(1);

      const metrics = warmedCache.getMetrics();
      expect(metrics.hits).toBe(1); // Should be a cache hit
    });

    it('should warm cache with progress transitions', () => {
      const warmedCache = createStateDeltaCache({
        warmOnInit: true,
        maxSize: 100,
      });

      // Check for 0 -> 25 transition
      const fromState = { progress: { percent: 0 } };
      const toState = { progress: { percent: 25 } };

      warmedCache.getDelta(fromState, toState);

      const metrics = warmedCache.getMetrics();
      expect(metrics.hits).toBe(1);
    });

    it('should warm cache with tool status transitions', () => {
      const warmedCache = createStateDeltaCache({
        warmOnInit: true,
        maxSize: 100,
      });

      // Check for pending -> executing transition
      const fromState = { tool: { status: 'pending' } };
      const toState = { tool: { status: 'executing' } };

      warmedCache.getDelta(fromState, toState);

      const metrics = warmedCache.getMetrics();
      expect(metrics.hits).toBe(1);
    });

    it('should use custom paths for warming', () => {
      const customCache = createStateDeltaCache({
        warmOnInit: true,
        maxSize: 100,
        agentStatusPath: '/custom/agent/state',
        progressPath: '/custom/progress/value',
        toolStatusPath: '/custom/tool/state',
      });

      // Check custom agent path
      const fromState = { custom: { agent: { state: 'idle' } } };
      const toState = { custom: { agent: { state: 'running' } } };

      customCache.getDelta(fromState, toState);

      const metrics = customCache.getMetrics();
      expect(metrics.hits).toBe(1);
    });

    it('should track precomputed entries from warming', () => {
      const warmedCache = createStateDeltaCache({
        warmOnInit: true,
        maxSize: 100,
      });

      const metrics = warmedCache.getMetrics();
      // Should have pre-computed entries from all transitions
      // 7 agent + 7 progress + 5 tool = 19
      expect(metrics.preComputedEntries).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Custom Pre-computation
  // ============================================================================

  describe('precomputeStatusTransition', () => {
    it('should pre-compute custom status transition', () => {
      cache.precomputeStatusTransition('/workflow/status', 'draft', 'published');

      const fromState = { workflow: { status: 'draft' } };
      const toState = { workflow: { status: 'published' } };

      cache.getDelta(fromState, toState);

      const metrics = cache.getMetrics();
      expect(metrics.hits).toBe(1);
    });
  });

  describe('precomputeProgressTransition', () => {
    it('should pre-compute custom progress transition', () => {
      cache.precomputeProgressTransition('/upload/progress', 0, 100);

      const fromState = { upload: { progress: 0 } };
      const toState = { upload: { progress: 100 } };

      cache.getDelta(fromState, toState);

      const metrics = cache.getMetrics();
      expect(metrics.hits).toBe(1);
    });
  });

  describe('precomputeAllTransitions', () => {
    it('should pre-compute all transitions between values', () => {
      const count = cache.precomputeAllTransitions('/color', [
        'red',
        'green',
        'blue',
      ]);

      // 3 values = 3 * 2 = 6 transitions (excluding same-to-same)
      expect(count).toBe(6);
      expect(cache.size).toBe(6);
    });

    it('should skip identical states', () => {
      const count = cache.precomputeAllTransitions('/value', [1, 1, 2]);

      // Only 1->2 and 2->1 should be computed (1->1 skipped)
      expect(count).toBe(4); // 1->2, 2->1, 1->2 (dup), 2->1 (dup) but dedup by map
    });
  });

  // ============================================================================
  // Metrics
  // ============================================================================

  describe('getMetrics', () => {
    it('should return accurate metrics', () => {
      // Generate some cache activity
      cache.getDelta({ a: 1 }, { a: 2 }); // Miss
      cache.getDelta({ a: 1 }, { a: 2 }); // Hit
      cache.getDelta({ b: 1 }, { b: 2 }); // Miss
      cache.precompute({ c: 1 }, { c: 2 }); // Precompute

      const metrics = cache.getMetrics();

      expect(metrics.hits).toBe(1);
      expect(metrics.misses).toBe(2);
      expect(metrics.size).toBe(3);
      expect(metrics.maxSize).toBe(10);
      expect(metrics.hitRate).toBeCloseTo(33.33, 1);
      expect(metrics.evictions).toBe(0);
      expect(metrics.preComputedEntries).toBe(1);
    });

    it('should calculate hit rate correctly', () => {
      // 4 hits, 1 miss = 80% hit rate
      cache.precompute({ a: 1 }, { a: 2 });
      cache.getDelta({ a: 1 }, { a: 2 }); // Hit
      cache.getDelta({ a: 1 }, { a: 2 }); // Hit
      cache.getDelta({ a: 1 }, { a: 2 }); // Hit
      cache.getDelta({ a: 1 }, { a: 2 }); // Hit
      cache.getDelta({ b: 1 }, { b: 2 }); // Miss

      const metrics = cache.getMetrics();
      expect(metrics.hitRate).toBe(80);
    });

    it('should handle zero lookups', () => {
      const metrics = cache.getMetrics();
      expect(metrics.hitRate).toBe(0);
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics to zero', () => {
      cache.getDelta({ a: 1 }, { a: 2 });
      cache.getDelta({ a: 1 }, { a: 2 });

      cache.resetMetrics();

      const metrics = cache.getMetrics();
      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
      expect(metrics.evictions).toBe(0);
    });

    it('should not affect cache contents', () => {
      cache.precompute({ a: 1 }, { a: 2 });
      cache.resetMetrics();

      expect(cache.size).toBe(1);
      expect(cache.has({ a: 1 }, { a: 2 })).toBe(true);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle empty objects', () => {
      const delta = cache.getDelta({}, {});
      expect(delta).toHaveLength(0);
    });

    it('should handle deeply nested state', () => {
      const fromState = {
        level1: {
          level2: {
            level3: {
              value: 'old',
            },
          },
        },
      };
      const toState = {
        level1: {
          level2: {
            level3: {
              value: 'new',
            },
          },
        },
      };

      const delta = cache.getDelta(fromState, toState);

      expect(delta).toHaveLength(1);
      expect(delta[0].path).toBe('/level1/level2/level3/value');
    });

    it('should handle arrays in state', () => {
      const fromState = { items: [1, 2, 3] };
      const toState = { items: [1, 2, 3, 4] };

      const delta = cache.getDelta(fromState, toState);

      expect(delta.length).toBeGreaterThan(0);
    });

    it('should handle special characters in paths', () => {
      const fromState = { 'key/with/slashes': 'old' };
      const toState = { 'key/with/slashes': 'new' };

      const delta = cache.getDelta(fromState, toState);

      expect(delta).toHaveLength(1);
    });

    it('should handle null values', () => {
      const fromState = { value: null };
      const toState = { value: 'not null' };

      const delta = cache.getDelta(fromState, toState);

      expect(delta).toHaveLength(1);
      expect(delta[0].op).toBe('replace');
    });

    it('should handle type changes', () => {
      const fromState = { value: 123 };
      const toState = { value: 'string now' };

      const delta = cache.getDelta(fromState, toState);

      expect(delta).toHaveLength(1);
      expect(delta[0].value).toBe('string now');
    });
  });

  // ============================================================================
  // Memory Bounds
  // ============================================================================

  describe('Memory Bounds', () => {
    it('should respect maxSize limit', () => {
      const boundedCache = createStateDeltaCache({
        maxSize: 5,
        warmOnInit: false,
      });

      // Add more than maxSize entries
      for (let i = 0; i < 10; i++) {
        boundedCache.precompute({ n: i }, { n: i + 100 });
      }

      expect(boundedCache.size).toBe(5);

      const metrics = boundedCache.getMetrics();
      expect(metrics.evictions).toBe(5);
    });

    it('should handle very small maxSize', () => {
      const tinyCache = createStateDeltaCache({
        maxSize: 1,
        warmOnInit: false,
      });

      tinyCache.precompute({ a: 1 }, { a: 2 });
      tinyCache.precompute({ b: 1 }, { b: 2 });

      expect(tinyCache.size).toBe(1);
    });

    it('should handle large number of operations', () => {
      const largeCache = createStateDeltaCache({
        maxSize: 1000,
        warmOnInit: false,
      });

      // Add many entries
      for (let i = 0; i < 500; i++) {
        largeCache.precompute({ index: i }, { index: i + 1 });
      }

      expect(largeCache.size).toBe(500);
    });
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('Utility Functions', () => {
  describe('getAgentStatusValues', () => {
    it('should return all agent status values', () => {
      const values = getAgentStatusValues();
      expect(values).toContain('idle');
      expect(values).toContain('running');
      expect(values).toContain('completed');
      expect(values).toContain('error');
      expect(values).toContain('cancelled');
      expect(values).toHaveLength(5);
    });
  });

  describe('getProgressMilestones', () => {
    it('should return all progress milestones', () => {
      const values = getProgressMilestones();
      expect(values).toContain(0);
      expect(values).toContain(25);
      expect(values).toContain(50);
      expect(values).toContain(75);
      expect(values).toContain(100);
      expect(values).toHaveLength(5);
    });
  });

  describe('getToolStatusValues', () => {
    it('should return all tool status values', () => {
      const values = getToolStatusValues();
      expect(values).toContain('pending');
      expect(values).toContain('executing');
      expect(values).toContain('success');
      expect(values).toContain('failure');
      expect(values).toHaveLength(4);
    });
  });
});

// ============================================================================
// Integration with StateManager
// ============================================================================

describe('Integration Patterns', () => {
  it('should produce valid JSON Patch operations', () => {
    const cache = createStateDeltaCache({ warmOnInit: false });

    const fromState = {
      agent: { status: 'idle', id: 'agent-1' },
      progress: { percent: 0, message: '' },
    };

    const toState = {
      agent: { status: 'running', id: 'agent-1' },
      progress: { percent: 25, message: 'Processing...' },
    };

    const delta = cache.getDelta(fromState, toState);

    // Verify all operations are valid JSON Patch
    for (const op of delta) {
      expect(['add', 'remove', 'replace', 'move', 'copy', 'test']).toContain(
        op.op
      );
      expect(typeof op.path).toBe('string');
      if (op.op !== 'remove') {
        expect(op).toHaveProperty('value');
      }
    }
  });

  it('should work with realistic agent state transitions', () => {
    const cache = createStateDeltaCache({ warmOnInit: true });

    // Simulate agent lifecycle
    const states = [
      { agent: { status: 'idle' }, tool: { status: 'pending' }, progress: { percent: 0 } },
      { agent: { status: 'running' }, tool: { status: 'pending' }, progress: { percent: 0 } },
      { agent: { status: 'running' }, tool: { status: 'executing' }, progress: { percent: 25 } },
      { agent: { status: 'running' }, tool: { status: 'success' }, progress: { percent: 50 } },
      { agent: { status: 'running' }, tool: { status: 'pending' }, progress: { percent: 75 } },
      { agent: { status: 'completed' }, tool: { status: 'pending' }, progress: { percent: 100 } },
    ];

    // Compute all transitions
    for (let i = 0; i < states.length - 1; i++) {
      const delta = cache.getDelta(states[i], states[i + 1]);
      expect(delta.length).toBeGreaterThan(0);
    }

    // Check metrics show cache activity
    const metrics = cache.getMetrics();
    expect(metrics.hits + metrics.misses).toBe(states.length - 1);
  });
});
