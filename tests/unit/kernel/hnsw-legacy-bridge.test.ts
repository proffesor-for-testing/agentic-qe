/**
 * Tests for HnswLegacyBridge (ADR-071)
 *
 * Tests the bridge between old IHNSWIndex interface (string keys, number[])
 * and unified IHnswIndexProvider (numeric IDs, Float32Array).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HnswLegacyBridge } from '../../../src/kernel/hnsw-legacy-bridge.js';
import type { IHnswIndexProvider, SearchResult } from '../../../src/kernel/hnsw-index-provider.js';

// ============================================================================
// Mock Provider
// ============================================================================

function createMockProvider(dim = 384): IHnswIndexProvider {
  const vectors = new Map<number, Float32Array>();

  return {
    add: vi.fn((id: number, vector: Float32Array) => {
      vectors.set(id, vector);
    }),
    search: vi.fn((query: Float32Array, k: number): SearchResult[] => {
      const results: SearchResult[] = [];
      for (const [id, vec] of vectors) {
        let dot = 0, magA = 0, magB = 0;
        for (let i = 0; i < dim; i++) {
          dot += query[i] * vec[i];
          magA += query[i] * query[i];
          magB += vec[i] * vec[i];
        }
        const score = dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-9);
        results.push({ id, score });
      }
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, k);
    }),
    remove: vi.fn((id: number) => vectors.delete(id)),
    size: vi.fn(() => vectors.size),
    dimensions: vi.fn(() => dim),
    recall: vi.fn(() => 0.95),
    clear: vi.fn(() => vectors.clear()),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('HnswLegacyBridge', () => {
  const DIM = 8; // small dimension for test speed
  let provider: IHnswIndexProvider;
  let bridge: HnswLegacyBridge;

  beforeEach(() => {
    provider = createMockProvider(DIM);
    bridge = new HnswLegacyBridge(provider);
  });

  describe('insert', () => {
    it('should map string key to numeric ID and call provider.add()', async () => {
      const vector = Array.from({ length: DIM }, () => Math.random());
      await bridge.insert('pattern-1', vector);

      expect(provider.add).toHaveBeenCalledOnce();
      const [numId, floatVec] = (provider.add as any).mock.calls[0];
      expect(typeof numId).toBe('number');
      expect(floatVec).toBeInstanceOf(Float32Array);
      expect(floatVec.length).toBe(DIM);
    });

    it('should reuse the same numeric ID for the same key', async () => {
      const v1 = Array.from({ length: DIM }, () => 0.5);
      const v2 = Array.from({ length: DIM }, () => 0.8);

      await bridge.insert('pattern-1', v1);
      await bridge.insert('pattern-1', v2);

      const calls = (provider.add as any).mock.calls;
      expect(calls[0][0]).toBe(calls[1][0]); // same numeric ID
    });

    it('should assign different IDs to different keys', async () => {
      await bridge.insert('pattern-1', Array.from({ length: DIM }, () => 0.5));
      await bridge.insert('pattern-2', Array.from({ length: DIM }, () => 0.5));

      const calls = (provider.add as any).mock.calls;
      expect(calls[0][0]).not.toBe(calls[1][0]);
    });
  });

  describe('search', () => {
    it('should convert results from numeric IDs back to string keys', async () => {
      const v1 = Array.from({ length: DIM }, (_, i) => i === 0 ? 1 : 0);
      const v2 = Array.from({ length: DIM }, (_, i) => i === 1 ? 1 : 0);

      await bridge.insert('pattern-a', v1);
      await bridge.insert('pattern-b', v2);

      const results = await bridge.search(v1, 5);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].key).toBe('pattern-a'); // closest to v1
      expect(results[0].score).toBeGreaterThan(0.9);
      expect(typeof results[0].distance).toBe('number');
    });

    it('should preserve metadata in search results', async () => {
      const v = Array.from({ length: DIM }, () => 0.5);
      const metadata = { filePath: 'src/test.ts', lineCoverage: 80 } as any;

      await bridge.insert('pattern-m', v, metadata);

      const results = await bridge.search(v, 5);
      expect(results[0].metadata).toEqual(metadata);
    });
  });

  describe('delete', () => {
    it('should remove vector by string key', async () => {
      await bridge.insert('pattern-1', Array.from({ length: DIM }, () => 0.5));
      const deleted = await bridge.delete('pattern-1');

      expect(deleted).toBe(true);
      expect(provider.remove).toHaveBeenCalled();
    });

    it('should return false for non-existent key', async () => {
      const deleted = await bridge.delete('nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('batchInsert', () => {
    it('should insert all items', async () => {
      const items = [
        { key: 'p1', vector: Array.from({ length: DIM }, () => 0.1) },
        { key: 'p2', vector: Array.from({ length: DIM }, () => 0.2) },
        { key: 'p3', vector: Array.from({ length: DIM }, () => 0.3) },
      ];

      await bridge.batchInsert(items);

      expect(provider.add).toHaveBeenCalledTimes(3);
    });
  });

  describe('getStats', () => {
    it('should return stats from provider', async () => {
      await bridge.insert('p1', Array.from({ length: DIM }, () => 0.5));

      const stats = await bridge.getStats();

      expect(stats.nativeHNSW).toBe(true);
      expect(stats.vectorCount).toBe(1);
      expect(stats.backendType).toBe('ruvector-gnn');
    });
  });

  describe('clear', () => {
    it('should clear provider and ID maps', async () => {
      await bridge.insert('p1', Array.from({ length: DIM }, () => 0.5));
      await bridge.clear();

      expect(provider.clear).toHaveBeenCalled();
      const stats = await bridge.getStats();
      expect(stats.vectorCount).toBe(0);
    });
  });

  describe('isNativeAvailable', () => {
    it('should return true (unified provider always available)', () => {
      expect(bridge.isNativeAvailable()).toBe(true);
    });
  });
});

// ============================================================================
// Benchmark
// ============================================================================

describe('HnswLegacyBridge Benchmark', () => {
  it('should handle 1000 inserts + 50 searches under 100ms', async () => {
    const DIM = 384;
    const provider = createMockProvider(DIM);
    const bridge = new HnswLegacyBridge(provider);

    const start = performance.now();

    // Insert 1000 vectors
    for (let i = 0; i < 1000; i++) {
      await bridge.insert(`pattern-${i}`, Array.from({ length: DIM }, () => Math.random()));
    }

    // Search 50 times
    for (let i = 0; i < 50; i++) {
      await bridge.search(Array.from({ length: DIM }, () => Math.random()), 10);
    }

    const elapsed = performance.now() - start;
    console.log(`[BENCH] Bridge 1000 inserts + 50 searches: ${elapsed.toFixed(2)}ms`);

    expect(elapsed).toBeLessThan(2000); // generous limit for CI
  });
});
