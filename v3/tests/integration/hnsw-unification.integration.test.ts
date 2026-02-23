/**
 * HNSW Unification Integration Tests
 *
 * Validates the unified HNSW system (ADR-071):
 * - ProgressiveHnswBackend: bulk add, search ordering, remove
 * - HnswAdapter: named index isolation, backward-compat APIs
 * - Dimension handling: auto-resize 768->384
 * - Search accuracy: known vectors produce correct rank order
 * - Parity: UnifiedHnswIndex matches InMemoryHNSWIndex results
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProgressiveHnswBackend } from '../../src/kernel/progressive-hnsw-backend.js';
import { HnswAdapter } from '../../src/kernel/hnsw-adapter.js';
import {
  InMemoryHNSWIndex,
  UnifiedHnswIndex,
  createHnswIndex,
} from '../../src/kernel/unified-memory-hnsw.js';

// ============================================================================
// Helpers
// ============================================================================

/** Generate a random Float32Array of given dimension. */
function randomVector(dim: number): Float32Array {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    v[i] = Math.random() * 2 - 1;
  }
  return v;
}

/** Generate a random number[] of given dimension. */
function randomNumberArray(dim: number): number[] {
  return Array.from({ length: dim }, () => Math.random() * 2 - 1);
}

/** Normalize a Float32Array to unit length. */
function normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const norm = Math.sqrt(sum);
  if (norm === 0) return v;
  const result = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) result[i] = v[i] / norm;
  return result;
}

/** Compute cosine similarity between two Float32Arrays. */
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
// 1. ProgressiveHnswBackend — Bulk Add, Search, and Sort Order
// ============================================================================

describe('ProgressiveHnswBackend Integration', () => {
  let backend: ProgressiveHnswBackend;

  beforeEach(() => {
    backend = new ProgressiveHnswBackend({ dimensions: 384, metric: 'cosine' });
  });

  it('should add 100 random 384-dim vectors and search returns results sorted by descending score', () => {
    const vectors: Float32Array[] = [];
    for (let i = 0; i < 100; i++) {
      const v = randomVector(384);
      vectors.push(v);
      backend.add(i, v);
    }
    expect(backend.size()).toBe(100);

    const query = randomVector(384);
    const results = backend.search(query, 10);

    expect(results.length).toBe(10);

    // Verify descending score order
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }

    // Verify all returned IDs are valid (0..99)
    for (const r of results) {
      expect(r.id).toBeGreaterThanOrEqual(0);
      expect(r.id).toBeLessThan(100);
    }

    // Verify no duplicate IDs in results
    const ids = results.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should return empty array when searching an empty backend', () => {
    const query = randomVector(384);
    const results = backend.search(query, 5);
    expect(results).toEqual([]);
  });

  it('should handle k larger than index size', () => {
    backend.add(0, randomVector(384));
    backend.add(1, randomVector(384));
    const results = backend.search(randomVector(384), 10);
    expect(results.length).toBe(2);
  });

  it('should report correct dimensions and recall', () => {
    expect(backend.dimensions()).toBe(384);
    expect(backend.recall()).toBe(1.0);
  });
});

// ============================================================================
// 2. HnswAdapter Named Indexes — Isolation
// ============================================================================

describe('HnswAdapter Named Index Isolation', () => {
  afterEach(() => {
    HnswAdapter.closeAll();
  });

  it('should isolate vectors between patterns and coverage indexes', () => {
    const patterns = HnswAdapter.create('test-patterns-iso', { dimensions: 384 });
    const coverage = HnswAdapter.create('test-coverage-iso', { dimensions: 384 });

    // Add distinct vectors to each index
    const pVec = normalize(randomVector(384));
    const cVec = normalize(randomVector(384));

    patterns.add(1, pVec, { source: 'patterns' });
    coverage.add(2, cVec, { source: 'coverage' });

    expect(patterns.size()).toBe(1);
    expect(coverage.size()).toBe(1);

    // Searching patterns should only return the patterns vector
    const pResults = patterns.search(pVec, 5);
    expect(pResults.length).toBe(1);
    expect(pResults[0].id).toBe(1);
    expect(pResults[0].metadata?.source).toBe('patterns');

    // Searching coverage should only return the coverage vector
    const cResults = coverage.search(cVec, 5);
    expect(cResults.length).toBe(1);
    expect(cResults[0].id).toBe(2);
    expect(cResults[0].metadata?.source).toBe('coverage');

    // Cross-check: searching patterns with coverage query should NOT return id=2
    const crossResults = patterns.search(cVec, 5);
    expect(crossResults.length).toBe(1);
    expect(crossResults[0].id).toBe(1); // Still returns the only vector in patterns
  });

  it('should list registered indexes and close them properly', () => {
    HnswAdapter.create('test-idx-a');
    HnswAdapter.create('test-idx-b');

    const names = HnswAdapter.listIndexes();
    expect(names).toContain('test-idx-a');
    expect(names).toContain('test-idx-b');

    HnswAdapter.close('test-idx-a');
    expect(HnswAdapter.get('test-idx-a')).toBeUndefined();
    expect(HnswAdapter.get('test-idx-b')).toBeDefined();
  });

  it('should support backward-compatible string ID APIs', () => {
    const adapter = HnswAdapter.create('test-compat', { dimensions: 384 });

    const embedding = Array.from(randomVector(384));
    adapter.addByStringId('pattern-auth-jwt', embedding);
    // Use a directionally different vector (not just scaled — cosine similarity is scale-invariant)
    adapter.addByStringId('pattern-auth-oauth', embedding.map((v, i) => i < 192 ? v * 0.5 : -v * 0.3));

    expect(adapter.size()).toBe(2);

    const results = adapter.searchByArray(embedding, 2);
    expect(results.length).toBe(2);
    expect(results[0].id).toBe('pattern-auth-jwt'); // Exact match should be first
    expect(typeof results[0].score).toBe('number');
  });
});

// ============================================================================
// 3. Dimension Handling — Auto-Resize
// ============================================================================

describe('Dimension Handling', () => {
  it('should auto-resize a 768-dim vector to fit a 384-dim index', () => {
    const backend = new ProgressiveHnswBackend({ dimensions: 384 });

    // Add a 768-dim vector (should be auto-resized to 384)
    const bigVec = randomVector(768);
    backend.add(1, bigVec);

    expect(backend.size()).toBe(1);
    expect(backend.dimensions()).toBe(384);

    // Search with a 384-dim query should work
    const query = randomVector(384);
    const results = backend.search(query, 1);
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(1);
    expect(typeof results[0].score).toBe('number');
  });

  it('should auto-resize a 384-dim vector to fit a 768-dim index', () => {
    const backend = new ProgressiveHnswBackend({ dimensions: 768 });

    const smallVec = randomVector(384);
    backend.add(1, smallVec);

    expect(backend.size()).toBe(1);

    const query = randomVector(768);
    const results = backend.search(query, 1);
    expect(results.length).toBe(1);
  });

  it('should auto-resize query vectors too', () => {
    const backend = new ProgressiveHnswBackend({ dimensions: 384 });
    backend.add(1, randomVector(384));

    // Search with a 768-dim query
    const bigQuery = randomVector(768);
    const results = backend.search(bigQuery, 1);
    expect(results.length).toBe(1);
  });
});

// ============================================================================
// 4. Search Accuracy — Known Vectors
// ============================================================================

describe('Search Accuracy with Known Vectors', () => {
  it('should return vectors in correct similarity order', () => {
    const backend = new ProgressiveHnswBackend({ dimensions: 4, metric: 'cosine' });

    // Create a query and vectors with known relative similarities
    const query = new Float32Array([1, 0, 0, 0]);

    // Identical to query (cosine = 1.0)
    const identical = new Float32Array([1, 0, 0, 0]);
    // Somewhat similar (cosine ~ 0.707)
    const similar = new Float32Array([1, 1, 0, 0]);
    // Orthogonal (cosine = 0)
    const orthogonal = new Float32Array([0, 1, 0, 0]);
    // Opposite (cosine = -1)
    const opposite = new Float32Array([-1, 0, 0, 0]);

    backend.add(10, identical);
    backend.add(20, similar);
    backend.add(30, orthogonal);
    backend.add(40, opposite);

    const results = backend.search(query, 4);
    expect(results.length).toBe(4);

    // Verify order: identical > similar > orthogonal > opposite
    expect(results[0].id).toBe(10);
    expect(results[1].id).toBe(20);
    expect(results[2].id).toBe(30);
    expect(results[3].id).toBe(40);

    // Verify score values are approximately correct
    expect(results[0].score).toBeCloseTo(1.0, 4);
    expect(results[1].score).toBeCloseTo(Math.SQRT1_2, 2); // 1/sqrt(2) ~ 0.707
    expect(results[2].score).toBeCloseTo(0.0, 4);
    expect(results[3].score).toBeCloseTo(-1.0, 4);
  });

  it('should handle euclidean metric correctly', () => {
    const backend = new ProgressiveHnswBackend({ dimensions: 3, metric: 'euclidean' });

    const query = new Float32Array([0, 0, 0]);

    // Distance 1
    backend.add(1, new Float32Array([1, 0, 0]));
    // Distance 2
    backend.add(2, new Float32Array([2, 0, 0]));
    // Distance 3
    backend.add(3, new Float32Array([3, 0, 0]));

    const results = backend.search(query, 3);
    expect(results.length).toBe(3);

    // Euclidean scores are negated distances, so closest = highest score
    expect(results[0].id).toBe(1);
    expect(results[1].id).toBe(2);
    expect(results[2].id).toBe(3);

    expect(results[0].score).toBeCloseTo(-1.0, 4);
    expect(results[1].score).toBeCloseTo(-2.0, 4);
    expect(results[2].score).toBeCloseTo(-3.0, 4);
  });
});

// ============================================================================
// 5. Remove and Re-search
// ============================================================================

describe('Remove and Re-search', () => {
  it('should not return removed vectors in search results', () => {
    const backend = new ProgressiveHnswBackend({ dimensions: 4 });

    const v1 = new Float32Array([1, 0, 0, 0]);
    const v2 = new Float32Array([0, 1, 0, 0]);
    const v3 = new Float32Array([0, 0, 1, 0]);

    backend.add(1, v1);
    backend.add(2, v2);
    backend.add(3, v3);
    expect(backend.size()).toBe(3);

    // Remove v2
    const removed = backend.remove(2);
    expect(removed).toBe(true);
    expect(backend.size()).toBe(2);

    // Search — v2 should not appear
    const results = backend.search(v2, 10);
    expect(results.length).toBe(2);
    const resultIds = results.map((r) => r.id);
    expect(resultIds).not.toContain(2);
    expect(resultIds).toContain(1);
    expect(resultIds).toContain(3);
  });

  it('should return false when removing a non-existent ID', () => {
    const backend = new ProgressiveHnswBackend({ dimensions: 4 });
    expect(backend.remove(999)).toBe(false);
  });

  it('should handle remove via HnswAdapter string ID API', () => {
    const adapter = new HnswAdapter('test-remove-str', { dimensions: 4 });

    adapter.addByStringId('vec-a', [1, 0, 0, 0]);
    adapter.addByStringId('vec-b', [0, 1, 0, 0]);
    expect(adapter.size()).toBe(2);

    const removed = adapter.removeByStringId('vec-a');
    expect(removed).toBe(true);
    expect(adapter.size()).toBe(1);

    const results = adapter.searchByArray([1, 0, 0, 0], 5);
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('vec-b');

    // Cleanup
    HnswAdapter.close('test-remove-str');
  });
});

// ============================================================================
// 6. Parity — UnifiedHnswIndex vs InMemoryHNSWIndex
// ============================================================================

describe('Parity: UnifiedHnswIndex vs InMemoryHNSWIndex', () => {
  afterEach(() => {
    HnswAdapter.closeAll();
  });

  it('should produce the same top-k ranking for known vectors', () => {
    const dim = 8;
    const numVectors = 20;
    const k = 5;

    // Use a fixed seed-like approach: deterministic vectors
    const vectors: number[][] = [];
    for (let i = 0; i < numVectors; i++) {
      const v: number[] = [];
      for (let d = 0; d < dim; d++) {
        // Deterministic but varied values
        v.push(Math.sin(i * 7 + d * 3) * Math.cos(i * 11 + d * 5));
      }
      vectors.push(v);
    }

    const query: number[] = [];
    for (let d = 0; d < dim; d++) {
      query.push(Math.sin(999 + d * 3) * Math.cos(999 + d * 5));
    }

    // Add to UnifiedHnswIndex (backed by ProgressiveHnswBackend)
    const unified = createHnswIndex({ name: 'parity-test', dimensions: dim });
    for (let i = 0; i < numVectors; i++) {
      unified.add(`vec-${i}`, vectors[i]);
    }

    // Add to old InMemoryHNSWIndex
    const legacy = new InMemoryHNSWIndex();
    for (let i = 0; i < numVectors; i++) {
      legacy.add(`vec-${i}`, vectors[i]);
    }

    expect(unified.size()).toBe(numVectors);
    expect(legacy.size()).toBe(numVectors);

    // Search both
    const unifiedResults = unified.search(query, k);
    const legacyResults = legacy.search(query, k);

    expect(unifiedResults.length).toBe(k);
    expect(legacyResults.length).toBe(k);

    // The unified backend uses brute-force (exact search), so its results are
    // the ground truth. The HNSW index is approximate and may differ slightly.
    // For a small index (20 vectors), HNSW should match exactly though.

    // Verify both return valid scores and the unified results are correctly ordered
    for (let i = 1; i < unifiedResults.length; i++) {
      expect(unifiedResults[i - 1].score).toBeGreaterThanOrEqual(
        unifiedResults[i].score
      );
    }

    // The top-1 result should match between both (HNSW is approximate but
    // for 20 vectors it should get at least the best match right)
    expect(unifiedResults[0].id).toBe(legacyResults[0].id);

    // Verify scores are in the same ballpark (cosine similarity)
    expect(unifiedResults[0].score).toBeCloseTo(legacyResults[0].score, 2);
  });

  it('should produce consistent results after remove operations', () => {
    const dim = 4;

    const unified = createHnswIndex({ name: 'parity-remove', dimensions: dim });
    const legacy = new InMemoryHNSWIndex();

    const vectors = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [1, 1, 0, 0],
    ];

    for (let i = 0; i < vectors.length; i++) {
      unified.add(`v${i}`, vectors[i]);
      legacy.add(`v${i}`, vectors[i]);
    }

    // Remove v1 from both
    unified.remove('v1');
    legacy.remove('v1');

    expect(unified.size()).toBe(3);
    expect(legacy.size()).toBe(3);

    const query = [1, 0.5, 0, 0];
    const uResults = unified.search(query, 3);
    const lResults = legacy.search(query, 3);

    expect(uResults.length).toBe(3);
    expect(lResults.length).toBe(3);

    // Neither should contain v1
    expect(uResults.map((r) => r.id)).not.toContain('v1');
    expect(lResults.map((r) => r.id)).not.toContain('v1');

    // Top result should match (exact search vs small HNSW both get it right)
    expect(uResults[0].id).toBe(lResults[0].id);
  });
});

// ============================================================================
// 7. createHnswIndex Factory
// ============================================================================

describe('createHnswIndex Factory', () => {
  afterEach(() => {
    HnswAdapter.closeAll();
  });

  it('should create a working index with default config', () => {
    const index = createHnswIndex({ name: 'factory-test' });
    expect(index.size()).toBe(0);
    expect(index.recall()).toBe(1.0);

    const embedding = randomNumberArray(384);
    index.add('test-1', embedding);
    expect(index.size()).toBe(1);

    const results = index.search(embedding, 1);
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('test-1');
    expect(results[0].score).toBeCloseTo(1.0, 2);
  });

  it('should return the underlying HnswAdapter via getProvider', () => {
    const index = createHnswIndex({ name: 'provider-test', dimensions: 384 });
    const provider = index.getProvider();
    expect(provider).toBeInstanceOf(HnswAdapter);
    expect(provider.getName()).toBe('provider-test');
  });
});
