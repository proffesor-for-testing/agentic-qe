/**
 * HNSW Unification Tests
 *
 * Validates the unified HNSW index provider (ADR-071):
 * - IHnswIndexProvider interface compliance
 * - add/search/remove operations
 * - Dimension handling (384 and 768)
 * - Fallback when @ruvector/gnn is unavailable
 * - Parity with old RuvectorFlatIndex for same data
 * - recall() estimation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProgressiveHnswBackend } from '../../src/kernel/progressive-hnsw-backend';
import { HnswAdapter } from '../../src/kernel/hnsw-adapter';
import {
  UnifiedHnswIndex,
  createHnswIndex,
  RuvectorFlatIndex,
} from '../../src/kernel/unified-memory-hnsw';
import type {
  IHnswIndexProvider,
  SearchResult,
} from '../../src/kernel/hnsw-index-provider';

// ============================================================================
// Helpers
// ============================================================================

/** Generate a random Float32Array vector of given dimensions. */
function randomVector(dims: number): Float32Array {
  const v = new Float32Array(dims);
  for (let i = 0; i < dims; i++) v[i] = Math.random() - 0.5;
  return v;
}

/** Generate a random number[] vector of given dimensions. */
function randomNumberArray(dims: number): number[] {
  return Array.from({ length: dims }, () => Math.random() - 0.5);
}

/** Cosine similarity between two Float32Arrays. */
function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ============================================================================
// IHnswIndexProvider Interface Compliance
// ============================================================================

describe('IHnswIndexProvider Interface Compliance', () => {
  let provider: IHnswIndexProvider;

  beforeEach(() => {
    provider = new ProgressiveHnswBackend({ dimensions: 384 });
  });

  it('should implement add()', () => {
    expect(typeof provider.add).toBe('function');
    provider.add(1, randomVector(384));
    expect(provider.size()).toBe(1);
  });

  it('should implement search()', () => {
    expect(typeof provider.search).toBe('function');
    provider.add(1, randomVector(384));
    const results = provider.search(randomVector(384), 1);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(1);
    expect(results[0]).toHaveProperty('id');
    expect(results[0]).toHaveProperty('score');
  });

  it('should implement remove()', () => {
    expect(typeof provider.remove).toBe('function');
    provider.add(1, randomVector(384));
    expect(provider.remove(1)).toBe(true);
    expect(provider.size()).toBe(0);
  });

  it('should implement size()', () => {
    expect(typeof provider.size).toBe('function');
    expect(provider.size()).toBe(0);
  });

  it('should implement dimensions()', () => {
    expect(typeof provider.dimensions).toBe('function');
    expect(provider.dimensions()).toBe(384);
  });

  it('should implement recall()', () => {
    expect(typeof provider.recall).toBe('function');
    const r = provider.recall();
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// ProgressiveHnswBackend Operations
// ============================================================================

describe('ProgressiveHnswBackend', () => {
  let backend: ProgressiveHnswBackend;

  beforeEach(() => {
    backend = new ProgressiveHnswBackend({ dimensions: 384, metric: 'cosine' });
  });

  describe('add/search/remove', () => {
    it('should add and search vectors', () => {
      const v1 = randomVector(384);
      const v2 = randomVector(384);
      backend.add(1, v1);
      backend.add(2, v2);

      const results = backend.search(v1, 2);
      expect(results.length).toBe(2);
      // v1 should be most similar to itself
      expect(results[0].id).toBe(1);
      expect(results[0].score).toBeCloseTo(1.0, 1);
    });

    it('should return empty array when searching empty index', () => {
      const results = backend.search(randomVector(384), 5);
      expect(results).toEqual([]);
    });

    it('should handle duplicate IDs by overwriting', () => {
      const v1 = randomVector(384);
      const v2 = randomVector(384);
      backend.add(1, v1);
      backend.add(1, v2); // overwrite

      expect(backend.size()).toBe(1);
      const results = backend.search(v2, 1);
      expect(results[0].id).toBe(1);
      expect(results[0].score).toBeCloseTo(1.0, 1);
    });

    it('should remove vectors', () => {
      backend.add(1, randomVector(384));
      backend.add(2, randomVector(384));
      expect(backend.size()).toBe(2);

      expect(backend.remove(1)).toBe(true);
      expect(backend.size()).toBe(1);

      expect(backend.remove(99)).toBe(false);
    });

    it('should not return removed vectors in search results', () => {
      const v1 = randomVector(384);
      backend.add(1, v1);
      backend.add(2, randomVector(384));
      backend.remove(1);

      const results = backend.search(v1, 5);
      expect(results.every(r => r.id !== 1)).toBe(true);
    });

    it('should store and return metadata', () => {
      const meta = { label: 'test', priority: 1 };
      backend.add(1, randomVector(384), meta);

      const results = backend.search(randomVector(384), 1);
      expect(results[0].metadata).toEqual(meta);
    });

    it('should limit results to k', () => {
      for (let i = 0; i < 20; i++) {
        backend.add(i, randomVector(384));
      }
      const results = backend.search(randomVector(384), 5);
      expect(results.length).toBe(5);
    });

    it('should return results sorted by descending score', () => {
      for (let i = 0; i < 10; i++) {
        backend.add(i, randomVector(384));
      }
      const results = backend.search(randomVector(384), 10);
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });
  });

  describe('dimension handling', () => {
    it('should work with 384-dimensional vectors', () => {
      const b = new ProgressiveHnswBackend({ dimensions: 384 });
      const v = randomVector(384);
      b.add(1, v);
      const results = b.search(v, 1);
      expect(results.length).toBe(1);
      expect(results[0].score).toBeCloseTo(1.0, 1);
    });

    it('should work with 768-dimensional vectors', () => {
      const b = new ProgressiveHnswBackend({ dimensions: 768 });
      const v = randomVector(768);
      b.add(1, v);
      const results = b.search(v, 1);
      expect(results.length).toBe(1);
      expect(results[0].score).toBeCloseTo(1.0, 1);
    });

    it('should auto-resize 768-dim vector into 384-dim index', () => {
      const b = new ProgressiveHnswBackend({ dimensions: 384 });
      const v768 = randomVector(768);
      // Should not throw - auto-resizes
      b.add(1, v768);
      expect(b.size()).toBe(1);

      // Search with a 768-dim query should also auto-resize
      const results = b.search(v768, 1);
      expect(results.length).toBe(1);
    });

    it('should auto-resize 384-dim vector into 768-dim index', () => {
      const b = new ProgressiveHnswBackend({ dimensions: 768 });
      const v384 = randomVector(384);
      b.add(1, v384);
      expect(b.size()).toBe(1);

      const results = b.search(v384, 1);
      expect(results.length).toBe(1);
    });
  });

  describe('recall estimation', () => {
    it('should return recall between 0 and 1', () => {
      const r = backend.recall();
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    });

    it('should return 1.0 for brute-force search', () => {
      // ProgressiveHnswBackend uses flat search, so recall is always 1.0
      expect(backend.recall()).toBe(1.0);
    });
  });

  describe('clear', () => {
    it('should clear all vectors', () => {
      for (let i = 0; i < 10; i++) {
        backend.add(i, randomVector(384));
      }
      expect(backend.size()).toBe(10);
      backend.clear();
      expect(backend.size()).toBe(0);
      expect(backend.search(randomVector(384), 5)).toEqual([]);
    });
  });

  describe('euclidean metric', () => {
    it('should use euclidean distance when configured', () => {
      const b = new ProgressiveHnswBackend({
        dimensions: 384,
        metric: 'euclidean',
      });
      const v1 = randomVector(384);
      const v2 = randomVector(384);
      b.add(1, v1);
      b.add(2, v2);

      const results = b.search(v1, 2);
      expect(results.length).toBe(2);
      // v1 should be nearest to itself (score = -0 = highest)
      expect(results[0].id).toBe(1);
    });
  });
});

// ============================================================================
// HnswAdapter
// ============================================================================

describe('HnswAdapter', () => {
  afterEach(() => {
    HnswAdapter.closeAll();
  });

  it('should create named indexes via factory', () => {
    const patterns = HnswAdapter.create('patterns');
    const coverage = HnswAdapter.create('coverage');

    expect(patterns.getName()).toBe('patterns');
    expect(coverage.getName()).toBe('coverage');
    expect(patterns.dimensions()).toBe(384);
    expect(coverage.dimensions()).toBe(768);
  });

  it('should return same instance for same name', () => {
    const a = HnswAdapter.create('patterns');
    const b = HnswAdapter.create('patterns');
    expect(a).toBe(b);
  });

  it('should support backward-compatible string ID operations', () => {
    const adapter = HnswAdapter.create('test-compat');
    const v1 = randomNumberArray(384);
    const v2 = randomNumberArray(384);

    adapter.addByStringId('vec-1', v1);
    adapter.addByStringId('vec-2', v2);

    const results = adapter.searchByArray(v1, 2);
    expect(results.length).toBe(2);
    expect(results[0].id).toBe('vec-1');
    expect(results[0].score).toBeCloseTo(1.0, 1);
  });

  it('should remove by string ID', () => {
    const adapter = HnswAdapter.create('test-remove');
    adapter.addByStringId('vec-1', randomNumberArray(384));
    expect(adapter.size()).toBe(1);

    expect(adapter.removeByStringId('vec-1')).toBe(true);
    expect(adapter.size()).toBe(0);
    expect(adapter.removeByStringId('vec-1')).toBe(false);
  });

  it('should list registered indexes', () => {
    HnswAdapter.create('idx-a');
    HnswAdapter.create('idx-b');
    const names = HnswAdapter.listIndexes();
    expect(names).toContain('idx-a');
    expect(names).toContain('idx-b');
  });

  it('should close specific indexes', () => {
    HnswAdapter.create('close-test');
    HnswAdapter.close('close-test');
    expect(HnswAdapter.get('close-test')).toBeUndefined();
  });

  it('should implement IHnswIndexProvider via numeric IDs', () => {
    const adapter = HnswAdapter.create('iface-test', { dimensions: 384 });
    const v = randomVector(384);
    adapter.add(42, v);
    expect(adapter.size()).toBe(1);

    const results = adapter.search(v, 1);
    expect(results[0].id).toBe(42);
    expect(results[0].score).toBeCloseTo(1.0, 1);

    expect(adapter.remove(42)).toBe(true);
    expect(adapter.size()).toBe(0);
  });
});

// ============================================================================
// UnifiedHnswIndex (backward-compatible wrapper)
// ============================================================================

describe('UnifiedHnswIndex', () => {
  afterEach(() => {
    HnswAdapter.closeAll();
  });

  it('should add and search with string IDs like old implementations', () => {
    const index = new UnifiedHnswIndex('unified-test', { dimensions: 384 });
    const v1 = randomNumberArray(384);
    const v2 = randomNumberArray(384);

    index.add('pattern-1', v1);
    index.add('pattern-2', v2);

    const results = index.search(v1, 2);
    expect(results.length).toBe(2);
    expect(results[0].id).toBe('pattern-1');
  });

  it('should remove by string ID', () => {
    const index = new UnifiedHnswIndex('unified-remove', { dimensions: 384 });
    index.add('vec-1', randomNumberArray(384));
    expect(index.size()).toBe(1);
    expect(index.remove('vec-1')).toBe(true);
    expect(index.size()).toBe(0);
  });

  it('should clear all vectors', () => {
    const index = new UnifiedHnswIndex('unified-clear', { dimensions: 384 });
    for (let i = 0; i < 5; i++) {
      index.add(`v-${i}`, randomNumberArray(384));
    }
    expect(index.size()).toBe(5);
    index.clear();
    expect(index.size()).toBe(0);
  });

  it('should expose recall()', () => {
    const index = new UnifiedHnswIndex('unified-recall', { dimensions: 384 });
    expect(index.recall()).toBe(1.0);
  });

  it('should expose the underlying provider', () => {
    const index = new UnifiedHnswIndex('unified-provider', { dimensions: 384 });
    const provider = index.getProvider();
    expect(provider).toBeInstanceOf(HnswAdapter);
  });
});

// ============================================================================
// createHnswIndex Factory
// ============================================================================

describe('createHnswIndex factory', () => {
  afterEach(() => {
    HnswAdapter.closeAll();
  });

  it('should create a UnifiedHnswIndex with default config', () => {
    const index = createHnswIndex();
    expect(index).toBeInstanceOf(UnifiedHnswIndex);
    index.add('test', randomNumberArray(384));
    expect(index.size()).toBe(1);
  });

  it('should create a named index with custom dimensions', () => {
    const index = createHnswIndex({ name: 'coverage', dimensions: 768 });
    index.add('file-1', randomNumberArray(768));
    const results = index.search(randomNumberArray(768), 1);
    expect(results.length).toBe(1);
  });
});

// ============================================================================
// Parity with RuvectorFlatIndex
// ============================================================================

describe('Parity with RuvectorFlatIndex', () => {
  afterEach(() => {
    HnswAdapter.closeAll();
  });

  it('should return same top-1 result as RuvectorFlatIndex for identical data', () => {
    const dims = 384;
    const numVectors = 50;

    // Generate shared test data
    const vectors: number[][] = [];
    const ids: string[] = [];
    for (let i = 0; i < numVectors; i++) {
      vectors.push(randomNumberArray(dims));
      ids.push(`vec-${i}`);
    }
    const query = randomNumberArray(dims);

    // Old: RuvectorFlatIndex
    const oldIndex = new RuvectorFlatIndex();
    for (let i = 0; i < numVectors; i++) {
      oldIndex.add(ids[i], vectors[i]);
    }
    const oldResults = oldIndex.search(query, 5);

    // New: UnifiedHnswIndex
    const newIndex = createHnswIndex({ name: 'parity-test', dimensions: dims });
    for (let i = 0; i < numVectors; i++) {
      newIndex.add(ids[i], vectors[i]);
    }
    const newResults = newIndex.search(query, 5);

    // Both should return same number of results
    expect(newResults.length).toBe(oldResults.length);

    // Top-1 should be the same vector (exact match expected since both
    // use brute-force under the hood)
    expect(newResults[0].id).toBe(oldResults[0].id);

    // Scores should be very close (both compute cosine similarity)
    expect(newResults[0].score).toBeCloseTo(oldResults[0].score, 4);
  });

  it('should return same results for all top-5 as RuvectorFlatIndex', () => {
    const dims = 384;
    const numVectors = 30;

    const vectors: number[][] = [];
    const ids: string[] = [];
    for (let i = 0; i < numVectors; i++) {
      vectors.push(randomNumberArray(dims));
      ids.push(`v-${i}`);
    }
    const query = randomNumberArray(dims);

    const oldIndex = new RuvectorFlatIndex();
    for (let i = 0; i < numVectors; i++) {
      oldIndex.add(ids[i], vectors[i]);
    }
    const oldResults = oldIndex.search(query, 5);

    const newIndex = createHnswIndex({ name: 'parity-top5', dimensions: dims });
    for (let i = 0; i < numVectors; i++) {
      newIndex.add(ids[i], vectors[i]);
    }
    const newResults = newIndex.search(query, 5);

    // All top-5 IDs should match (order may differ for ties, but IDs
    // should be the same set)
    const oldIds = new Set(oldResults.map(r => r.id));
    const newIds = new Set(newResults.map(r => r.id));
    expect(newIds).toEqual(oldIds);
  });
});

// ============================================================================
// Fallback behavior
// ============================================================================

describe('Fallback behavior', () => {
  it('should still work with brute-force when no ruvector is loaded', () => {
    // ProgressiveHnswBackend always has a brute-force fallback
    const backend = new ProgressiveHnswBackend({ dimensions: 384 });
    const v1 = randomVector(384);
    const v2 = randomVector(384);

    backend.add(1, v1);
    backend.add(2, v2);

    const results = backend.search(v1, 2);
    expect(results.length).toBe(2);
    // Self-similarity should be highest
    expect(results[0].id).toBe(1);
    expect(results[0].score).toBeCloseTo(1.0, 1);
  });
});
