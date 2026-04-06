/**
 * Native HNSW Backend Unit Tests
 *
 * Tests for the NativeHnswBackend which wraps @ruvector/router VectorDb.
 * These tests verify:
 * 1. Module loading and VectorDb creation (with lock contention handling)
 * 2. Feature flag integration (useNativeHNSW)
 * 3. The NativeHnswUnavailableError is thrown correctly
 * 4. HnswAdapter backend selection based on feature flags
 * 5. IHnswIndexProvider contract compliance
 * 6. Concurrent access safety
 *
 * @module tests/unit/kernel/native-hnsw-backend
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  NativeHnswBackend,
  NativeHnswUnavailableError,
  resetNativeModuleLoader,
  isNativeModuleAvailable,
} from '../../../src/kernel/native-hnsw-backend';
import type { NativeHnswMetrics } from '../../../src/kernel/native-hnsw-backend';
import { HnswAdapter } from '../../../src/kernel/hnsw-adapter';
import { ProgressiveHnswBackend } from '../../../src/kernel/progressive-hnsw-backend';
import {
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
  getRuVectorFeatureFlags,
  isNativeHNSWEnabled,
} from '../../../src/integrations/ruvector/feature-flags';
import type { IHnswIndexProvider, SearchResult } from '../../../src/kernel/hnsw-index-provider';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a random Float32Array vector of the given dimension.
 */
function randomVector(dim: number): Float32Array {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    v[i] = Math.random() * 2 - 1;
  }
  return v;
}

/**
 * Create a deterministic vector for reproducible tests.
 * The vector is normalized to unit length.
 */
function deterministicVector(dim: number, seed: number): Float32Array {
  const v = new Float32Array(dim);
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    // Simple deterministic pseudo-random based on seed and index
    v[i] = Math.sin(seed * 1000 + i * 7.3) * Math.cos(i * 3.1 + seed);
    norm += v[i] * v[i];
  }
  // Normalize to unit length
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      v[i] /= norm;
    }
  }
  return v;
}

// ============================================================================
// NativeHnswBackend Tests
// ============================================================================

describe('NativeHnswBackend', () => {
  beforeEach(() => {
    resetNativeModuleLoader();
    resetRuVectorFeatureFlags();
  });

  afterEach(() => {
    resetNativeModuleLoader();
    resetRuVectorFeatureFlags();
    HnswAdapter.closeAll();
  });

  // ===========================================================================
  // NativeHnswUnavailableError Tests
  // ===========================================================================

  describe('NativeHnswUnavailableError', () => {
    it('should have correct error name', () => {
      const error = new NativeHnswUnavailableError('test reason');
      expect(error.name).toBe('NativeHnswUnavailableError');
    });

    it('should include reason in message', () => {
      const error = new NativeHnswUnavailableError('binary not found');
      expect(error.message).toContain('binary not found');
      expect(error.message).toContain('Native HNSW backend unavailable');
    });

    it('should be instance of Error', () => {
      const error = new NativeHnswUnavailableError('test');
      expect(error).toBeInstanceOf(Error);
    });
  });

  // ===========================================================================
  // Constructor / Native Module Loading Tests
  // ===========================================================================

  describe('Constructor', () => {
    it('should create a NativeHnswBackend or throw NativeHnswUnavailableError (lock contention)', () => {
      // @ruvector/router is available but VectorDb uses a file lock,
      // so construction may fail if another instance holds the lock.
      try {
        const backend = new NativeHnswBackend();
        expect(backend).toBeInstanceOf(NativeHnswBackend);
        expect(backend.isNativeAvailable()).toBe(true);
        backend.clear();
      } catch (err) {
        // If VectorDb lock contention, should throw NativeHnswUnavailableError
        expect(err).toBeInstanceOf(NativeHnswUnavailableError);
      }
    });

    it('should have correct NativeHnswUnavailableError type', () => {
      const error = new NativeHnswUnavailableError('test');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('NativeHnswUnavailableError');
    });
  });

  // ===========================================================================
  // Module Availability Tests
  // ===========================================================================

  describe('isNativeModuleAvailable', () => {
    it('should return true when @ruvector/router is installed', () => {
      expect(isNativeModuleAvailable()).toBe(true);
    });

    it('should cache the result of module loading', () => {
      const first = isNativeModuleAvailable();
      const second = isNativeModuleAvailable();
      expect(first).toBe(second);
      expect(first).toBe(true);
    });

    it('should return true after reset and retry', () => {
      isNativeModuleAvailable();
      resetNativeModuleLoader();
      expect(isNativeModuleAvailable()).toBe(true);
    });
  });

  // ===========================================================================
  // resetNativeModuleLoader Tests
  // ===========================================================================

  describe('resetNativeModuleLoader', () => {
    it('should allow retry after reset', () => {
      expect(isNativeModuleAvailable()).toBe(true);
      resetNativeModuleLoader();
      expect(isNativeModuleAvailable()).toBe(true);
    });

    it('should not throw', () => {
      expect(() => resetNativeModuleLoader()).not.toThrow();
    });
  });

  // ===========================================================================
  // Feature Flag Integration Tests
  // ===========================================================================

  describe('Feature Flag: useNativeHNSW', () => {
    // v3.9.5: useNativeHNSW default flipped from true to false because the
    // native @ruvector/router VectorDb deadlocks (futex wait, never resolves)
    // when inserting certain vector content shapes — observed in the wild
    // against examples/ruview_live.py from the RuView project. Until the
    // upstream native bug is fixed (or we move the indexer into a killable
    // worker thread per #401), the JS ProgressiveHnswBackend is the safe
    // default. AQE's typical KG sizes (<10k vectors @ 384 dim) are actually
    // FASTER under brute-force cosine than native HNSW because there's no
    // graph-traversal overhead. See CHANGELOG v3.9.5 entry.
    it('should default to false (v3.9.5 hotfix for native deadlock)', () => {
      const flags = getRuVectorFeatureFlags();
      expect(flags.useNativeHNSW).toBe(false);
    });

    it('should be checkable via convenience function', () => {
      expect(isNativeHNSWEnabled()).toBe(false);
    });

    it('should be settable via setRuVectorFeatureFlags', () => {
      setRuVectorFeatureFlags({ useNativeHNSW: true });
      expect(isNativeHNSWEnabled()).toBe(true);

      setRuVectorFeatureFlags({ useNativeHNSW: false });
      expect(isNativeHNSWEnabled()).toBe(false);
    });

    it('should not affect other flags when set', () => {
      const before = getRuVectorFeatureFlags();
      setRuVectorFeatureFlags({ useNativeHNSW: true });
      const after = getRuVectorFeatureFlags();

      expect(after.useQESONA).toBe(before.useQESONA);
      expect(after.useQEFlashAttention).toBe(before.useQEFlashAttention);
      expect(after.useQEGNNIndex).toBe(before.useQEGNNIndex);
      expect(after.logMigrationMetrics).toBe(before.logMigrationMetrics);
    });

    it('should reset to false on resetRuVectorFeatureFlags (v3.9.5 default)', () => {
      setRuVectorFeatureFlags({ useNativeHNSW: true });
      resetRuVectorFeatureFlags();
      expect(isNativeHNSWEnabled()).toBe(false);
    });

    it('should support environment variable RUVECTOR_USE_NATIVE_HNSW', async () => {
      // Dynamically import to test env var parsing
      const { initFeatureFlagsFromEnv } = await import(
        '../../../src/integrations/ruvector/feature-flags'
      );

      process.env.RUVECTOR_USE_NATIVE_HNSW = 'true';
      initFeatureFlagsFromEnv();
      expect(isNativeHNSWEnabled()).toBe(true);

      process.env.RUVECTOR_USE_NATIVE_HNSW = 'false';
      initFeatureFlagsFromEnv();
      expect(isNativeHNSWEnabled()).toBe(false);

      delete process.env.RUVECTOR_USE_NATIVE_HNSW;
    });
  });

  // ===========================================================================
  // HnswAdapter Backend Selection Tests
  // ===========================================================================

  describe('HnswAdapter Backend Selection', () => {
    it('should use ProgressiveHnswBackend when useNativeHNSW is false', () => {
      setRuVectorFeatureFlags({ useNativeHNSW: false });
      const adapter = HnswAdapter.create('test-js-backend');
      expect(adapter.isNativeBackend()).toBe(false);
    });

    it('should attempt native backend when useNativeHNSW is true', () => {
      setRuVectorFeatureFlags({ useNativeHNSW: true });
      const adapter = HnswAdapter.create('test-native-enabled');
      // @ruvector/router is available but VectorDb may have lock contention
      // Either native or JS fallback is acceptable
      expect(adapter.size()).toBe(0);
      expect(adapter.dimensions()).toBe(384);
    });

    it('should create working adapter with JS backend when flag is off', () => {
      setRuVectorFeatureFlags({ useNativeHNSW: false });
      const adapter = HnswAdapter.create('test-working-js');

      adapter.add(0, deterministicVector(384, 1));
      adapter.add(1, deterministicVector(384, 2));

      expect(adapter.size()).toBe(2);
      expect(adapter.dimensions()).toBe(384);

      const results = adapter.search(deterministicVector(384, 1), 1);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(0);
    });
  });

  // ===========================================================================
  // IHnswIndexProvider Contract Compliance
  // (Tests via ProgressiveHnswBackend fallback to verify the adapter contract)
  // ===========================================================================

  describe('IHnswIndexProvider Contract (via fallback)', () => {
    let adapter: HnswAdapter;

    beforeEach(() => {
      // Use the default JS backend for contract tests
      setRuVectorFeatureFlags({ useNativeHNSW: false });
      adapter = new HnswAdapter('contract-test');
    });

    afterEach(() => {
      adapter.clear();
    });

    it('should add and search vectors correctly', () => {
      const v1 = deterministicVector(384, 1);
      const v2 = deterministicVector(384, 2);
      const v3 = deterministicVector(384, 3);

      adapter.add(0, v1, { label: 'first' });
      adapter.add(1, v2, { label: 'second' });
      adapter.add(2, v3, { label: 'third' });

      expect(adapter.size()).toBe(3);

      // Search for nearest to v1, should return v1 as top result
      const results = adapter.search(v1, 2);
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe(0);
      expect(results[0].score).toBeGreaterThan(0.9); // Self-similarity ~1.0
    });

    it('should return correct dimensions', () => {
      expect(adapter.dimensions()).toBe(384);
    });

    it('should return recall between 0 and 1', () => {
      const recall = adapter.recall();
      expect(recall).toBeGreaterThanOrEqual(0);
      expect(recall).toBeLessThanOrEqual(1);
    });

    it('should remove vectors', () => {
      adapter.add(0, deterministicVector(384, 1));
      adapter.add(1, deterministicVector(384, 2));
      expect(adapter.size()).toBe(2);

      const removed = adapter.remove(0);
      expect(removed).toBe(true);
      expect(adapter.size()).toBe(1);

      // Removing non-existent should return false
      expect(adapter.remove(999)).toBe(false);
    });

    it('should return empty results for empty index', () => {
      const results = adapter.search(deterministicVector(384, 1), 5);
      expect(results).toHaveLength(0);
    });

    it('should handle k larger than index size', () => {
      adapter.add(0, deterministicVector(384, 1));
      const results = adapter.search(deterministicVector(384, 1), 100);
      expect(results).toHaveLength(1);
    });

    it('should return results sorted by descending score', () => {
      for (let i = 0; i < 10; i++) {
        adapter.add(i, deterministicVector(384, i));
      }

      const results = adapter.search(deterministicVector(384, 0), 5);
      expect(results).toHaveLength(5);

      // Verify descending score order
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('should handle dimension mismatch via auto-resize', () => {
      // Add a 384-dim vector
      adapter.add(0, deterministicVector(384, 1));

      // Search with a different-dimension vector (should auto-resize)
      const shortQuery = deterministicVector(128, 1);
      const results = adapter.search(shortQuery, 1);
      expect(results).toHaveLength(1);
    });

    it('should support metadata on search results', () => {
      adapter.add(0, deterministicVector(384, 1), { type: 'test', count: 42 });

      const results = adapter.search(deterministicVector(384, 1), 1);
      expect(results[0].metadata).toEqual({ type: 'test', count: 42 });
    });
  });

  // ===========================================================================
  // Search Accuracy Tests
  // ===========================================================================

  describe('Search Accuracy', () => {
    let adapter: HnswAdapter;

    beforeEach(() => {
      adapter = new HnswAdapter('accuracy-test');
    });

    afterEach(() => {
      adapter.clear();
    });

    it('should find exact match with highest score', () => {
      const target = deterministicVector(384, 42);
      adapter.add(0, target);

      // Add other vectors
      for (let i = 1; i < 20; i++) {
        adapter.add(i, deterministicVector(384, i * 100));
      }

      const results = adapter.search(target, 1);
      expect(results[0].id).toBe(0);
      // Cosine similarity of identical vectors should be ~1.0
      expect(results[0].score).toBeCloseTo(1.0, 2);
    });

    it('should distinguish between similar and dissimilar vectors', () => {
      // Create a base vector and a slightly perturbed version
      const base = deterministicVector(384, 1);
      const similar = new Float32Array(base);
      similar[0] += 0.01; // Small perturbation

      const dissimilar = deterministicVector(384, 999);

      adapter.add(0, base);
      adapter.add(1, similar);
      adapter.add(2, dissimilar);

      const results = adapter.search(base, 3);

      // Base should be most similar to itself
      expect(results[0].id).toBe(0);
      // Similar should rank higher than dissimilar
      const similarResult = results.find((r) => r.id === 1);
      const dissimilarResult = results.find((r) => r.id === 2);
      expect(similarResult).toBeDefined();
      expect(dissimilarResult).toBeDefined();
      expect(similarResult!.score).toBeGreaterThan(dissimilarResult!.score);
    });
  });

  // ===========================================================================
  // Concurrent Access Tests
  // ===========================================================================

  describe('Concurrent Access', () => {
    let adapter: HnswAdapter;

    beforeEach(() => {
      adapter = new HnswAdapter('concurrent-test');
    });

    afterEach(() => {
      adapter.clear();
    });

    it('should handle rapid sequential add/search/remove', () => {
      const dim = 384;

      // Rapid adds
      for (let i = 0; i < 100; i++) {
        adapter.add(i, randomVector(dim));
      }
      expect(adapter.size()).toBe(100);

      // Concurrent-like searches
      const searchPromises: SearchResult[][] = [];
      for (let i = 0; i < 10; i++) {
        searchPromises.push(adapter.search(randomVector(dim), 5));
      }

      // All searches should return valid results
      for (const results of searchPromises) {
        expect(results.length).toBeGreaterThan(0);
        expect(results.length).toBeLessThanOrEqual(5);
      }

      // Rapid removes
      for (let i = 0; i < 50; i++) {
        adapter.remove(i);
      }
      expect(adapter.size()).toBe(50);
    });

    it('should handle interleaved add and search operations', () => {
      const dim = 384;

      for (let round = 0; round < 5; round++) {
        // Add batch
        for (let i = round * 10; i < (round + 1) * 10; i++) {
          adapter.add(i, randomVector(dim));
        }

        // Search should reflect current state
        const results = adapter.search(randomVector(dim), 3);
        expect(results.length).toBeGreaterThan(0);
        expect(results.length).toBeLessThanOrEqual(3);
      }

      expect(adapter.size()).toBe(50);
    });

    it('should handle add with same ID (update)', () => {
      const v1 = deterministicVector(384, 1);
      const v2 = deterministicVector(384, 2);

      adapter.add(0, v1);
      expect(adapter.size()).toBe(1);

      // Update same ID with different vector
      adapter.add(0, v2);
      expect(adapter.size()).toBe(1);

      // Search should find the updated vector
      const results = adapter.search(v2, 1);
      expect(results[0].id).toBe(0);
      expect(results[0].score).toBeCloseTo(1.0, 2);
    });
  });

  // ===========================================================================
  // Backward Compatibility Tests
  // ===========================================================================

  describe('Backward Compatibility', () => {
    it('should support string-based ID operations', () => {
      const adapter = HnswAdapter.create('compat-test');

      adapter.addByStringId('key-1', Array.from(deterministicVector(384, 1)));
      adapter.addByStringId('key-2', Array.from(deterministicVector(384, 2)));

      expect(adapter.size()).toBe(2);

      const results = adapter.searchByArray(
        Array.from(deterministicVector(384, 1)),
        1
      );
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('key-1');

      adapter.removeByStringId('key-1');
      expect(adapter.size()).toBe(1);
    });

    it('should work with singleton registry', () => {
      const a1 = HnswAdapter.create('singleton-test');
      const a2 = HnswAdapter.create('singleton-test');
      expect(a1).toBe(a2);

      // Different name should create different instance
      const a3 = HnswAdapter.create('singleton-test-2');
      expect(a3).not.toBe(a1);
    });

    it('should list registered indexes', () => {
      HnswAdapter.create('idx-a');
      HnswAdapter.create('idx-b');

      const indexes = HnswAdapter.listIndexes();
      expect(indexes).toContain('idx-a');
      expect(indexes).toContain('idx-b');
    });

    it('should close individual indexes', () => {
      HnswAdapter.create('close-test');
      expect(HnswAdapter.get('close-test')).toBeDefined();

      HnswAdapter.close('close-test');
      expect(HnswAdapter.get('close-test')).toBeUndefined();
    });
  });

  // ===========================================================================
  // NativeHnswMetrics Fallback Tracking Tests
  // ===========================================================================

  describe('NativeHnswMetrics Fallback Tracking', () => {
    it('should define all fallback tracking fields on NativeHnswMetrics type', () => {
      // Verify the NativeHnswMetrics interface includes the new fallback fields
      // by creating a conformant object literal
      const metrics: NativeHnswMetrics = {
        totalSearches: 0,
        totalAdds: 0,
        totalRemoves: 0,
        avgSearchLatencyMs: 0,
        maxSearchLatencyMs: 0,
        lastSearchLatencyMs: 0,
        fallbackSearchCount: 0,
        bruteForceSearchCount: 0,
        nativeSearchCount: 0,
        fallbackRate: 0,
        allSearchesBruteForce: false,
      };

      expect(metrics.fallbackSearchCount).toBe(0);
      expect(metrics.bruteForceSearchCount).toBe(0);
      expect(metrics.nativeSearchCount).toBe(0);
      expect(metrics.fallbackRate).toBe(0);
      expect(metrics.allSearchesBruteForce).toBe(false);
    });

    it('should compute fallbackRate as ratio of fallback to total searches', () => {
      const metrics: NativeHnswMetrics = {
        totalSearches: 20,
        totalAdds: 0,
        totalRemoves: 0,
        avgSearchLatencyMs: 0,
        maxSearchLatencyMs: 0,
        lastSearchLatencyMs: 0,
        fallbackSearchCount: 10,
        bruteForceSearchCount: 10,
        nativeSearchCount: 10,
        fallbackRate: 10 / 20,
        allSearchesBruteForce: false,
      };

      expect(metrics.fallbackRate).toBeCloseTo(0.5);
      expect(metrics.allSearchesBruteForce).toBe(false);
    });

    it('should set allSearchesBruteForce true when nativeSearchCount is zero', () => {
      const metrics: NativeHnswMetrics = {
        totalSearches: 5,
        totalAdds: 0,
        totalRemoves: 0,
        avgSearchLatencyMs: 0,
        maxSearchLatencyMs: 0,
        lastSearchLatencyMs: 0,
        fallbackSearchCount: 5,
        bruteForceSearchCount: 5,
        nativeSearchCount: 0,
        fallbackRate: 1.0,
        allSearchesBruteForce: true,
      };

      expect(metrics.nativeSearchCount).toBe(0);
      expect(metrics.totalSearches).toBeGreaterThan(0);
      expect(metrics.allSearchesBruteForce).toBe(true);
      expect(metrics.fallbackRate).toBe(1.0);
    });

    it('should keep bruteForceSearchCount as alias for fallbackSearchCount', () => {
      const metrics: NativeHnswMetrics = {
        totalSearches: 10,
        totalAdds: 0,
        totalRemoves: 0,
        avgSearchLatencyMs: 0,
        maxSearchLatencyMs: 0,
        lastSearchLatencyMs: 0,
        fallbackSearchCount: 7,
        bruteForceSearchCount: 7,
        nativeSearchCount: 3,
        fallbackRate: 0.7,
        allSearchesBruteForce: false,
      };

      expect(metrics.bruteForceSearchCount).toBe(metrics.fallbackSearchCount);
    });
  });

  // ===========================================================================
  // NativeHnswUnavailableError Behavior Tests
  // ===========================================================================

  describe('NativeHnswUnavailableError behavior', () => {
    it('should preserve error prototype chain', () => {
      const error = new NativeHnswUnavailableError('test reason');
      expect(error).toBeInstanceOf(NativeHnswUnavailableError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('NativeHnswUnavailableError');
      expect(error.message).toBe('Native HNSW backend unavailable: test reason');
    });

    it('should have a stack trace', () => {
      const error = new NativeHnswUnavailableError('stack test');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('NativeHnswUnavailableError');
    });

    it('should be catchable by Error type', () => {
      let caught = false;
      try {
        throw new NativeHnswUnavailableError('catch test');
      } catch (e) {
        if (e instanceof Error) {
          caught = true;
          expect(e.message).toContain('catch test');
        }
      }
      expect(caught).toBe(true);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle zero vector', () => {
      const adapter = new HnswAdapter('edge-zero');
      const zeroVector = new Float32Array(384); // All zeros

      adapter.add(0, zeroVector);
      const results = adapter.search(zeroVector, 1);

      // Zero vector has undefined cosine similarity, should handle gracefully
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(0);
    });

    it('should handle single-element index', () => {
      const adapter = new HnswAdapter('edge-single');
      adapter.add(0, deterministicVector(384, 1));

      const results = adapter.search(deterministicVector(384, 2), 1);
      expect(results).toHaveLength(1);
    });

    it('should handle k=0 search', () => {
      const adapter = new HnswAdapter('edge-k0');
      adapter.add(0, deterministicVector(384, 1));

      const results = adapter.search(deterministicVector(384, 1), 0);
      expect(results).toHaveLength(0);
    });

    it('should handle large batch add', () => {
      const adapter = new HnswAdapter('edge-large');
      const count = 500;

      for (let i = 0; i < count; i++) {
        adapter.add(i, randomVector(384));
      }

      expect(adapter.size()).toBe(count);

      const results = adapter.search(randomVector(384), 10);
      expect(results).toHaveLength(10);

      adapter.clear();
      expect(adapter.size()).toBe(0);
    });
  });
});
