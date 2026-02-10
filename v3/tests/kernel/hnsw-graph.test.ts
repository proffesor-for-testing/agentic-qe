/**
 * Agentic QE v3 - HNSW Graph Algorithm Integration Tests
 * Phase 2B: Tests for the REAL InMemoryHNSWIndex via UnifiedMemoryManager
 *
 * These tests exercise the actual HNSW implementation inside unified-memory.ts
 * through the public searchSimilar() API. This ensures the production HNSW
 * graph construction, layer traversal, and beam search are correct.
 *
 * The InMemoryHNSWIndex class is private and must NOT be imported directly.
 * Instead, we test through UnifiedMemoryManager's vectorStore / vectorSearch /
 * vectorDelete / vectorCount public methods, which feed into the real HNSW index.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { cosineSimilarity } from '../../src/shared/utils/vector-math.js';
import {
  UnifiedMemoryManager,
  resetUnifiedMemory,
} from '../../src/kernel/unified-memory.js';

// ============================================================================
// Test Helpers
// ============================================================================

const TEST_DB_DIR = '/tmp/aqe-hnsw-graph-test-' + Date.now();

function getTestDbPath(suffix = ''): string {
  return path.join(TEST_DB_DIR, `hnsw-test${suffix}.db`);
}

function cleanupTestDir(): void {
  try {
    if (fs.existsSync(TEST_DB_DIR)) {
      fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors in test teardown
  }
}

/** Create a deterministic vector pointing in a specific direction */
function createDirectionVector(dims: number, primaryAxis: number, value: number = 1.0): number[] {
  const v = new Array(dims).fill(0);
  v[primaryAxis % dims] = value;
  return v;
}

/** Create a random unit vector of given dimensions */
function createRandomVector(dims: number): number[] {
  const v: number[] = [];
  for (let i = 0; i < dims; i++) {
    v.push(Math.random() * 2 - 1);
  }
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  if (mag > 0) {
    for (let i = 0; i < dims; i++) v[i] /= mag;
  }
  return v;
}

/** Create a vector with a known similarity to a reference (small noise = high similarity) */
function createSimilarVector(ref: number[], noise: number): number[] {
  const v = ref.map(x => x + (Math.random() - 0.5) * noise);
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  if (mag > 0) {
    for (let i = 0; i < v.length; i++) v[i] /= mag;
  }
  return v;
}

const DIMS = 32; // Smaller dimensions for fast tests

// ============================================================================
// HNSW Integration Tests (via UnifiedMemoryManager)
// ============================================================================

describe('InMemoryHNSWIndex (via UnifiedMemoryManager public API)', () => {
  let manager: UnifiedMemoryManager;
  let testDbCounter = 0;

  beforeEach(async () => {
    resetUnifiedMemory();
    if (!fs.existsSync(TEST_DB_DIR)) {
      fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    }
    testDbCounter++;
    manager = UnifiedMemoryManager.getInstance({
      dbPath: getTestDbPath(`-${testDbCounter}`),
      walMode: false, // Simpler for tests, avoids WAL cleanup
    });
    await manager.initialize();
  });

  afterEach(() => {
    resetUnifiedMemory();
    cleanupTestDir();
  });

  // --------------------------------------------------------------------------
  // Basic Store and Search
  // --------------------------------------------------------------------------

  describe('store and search', () => {
    it('should store a vector and find it via search', async () => {
      const vec = createDirectionVector(DIMS, 0);
      await manager.vectorStore('v1', vec);

      const results = await manager.vectorSearch(vec, 1);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('v1');
      expect(results[0].score).toBeCloseTo(1.0, 3);
    });

    it('should return the nearest vector by cosine similarity', async () => {
      const query = createDirectionVector(DIMS, 0);

      // v-near: very close to the query direction
      const nearVec = createDirectionVector(DIMS, 0);
      nearVec[1] = 0.1; // Slightly off-axis

      // v-far: orthogonal direction
      const farVec = createDirectionVector(DIMS, 1);

      await manager.vectorStore('v-near', nearVec);
      await manager.vectorStore('v-far', farVec);

      const results = await manager.vectorSearch(query, 2);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('v-near');
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it('should return k=1 single closest result', async () => {
      await manager.vectorStore('a', createDirectionVector(DIMS, 0));
      await manager.vectorStore('b', createDirectionVector(DIMS, 1));
      await manager.vectorStore('c', createDirectionVector(DIMS, 2));

      const results = await manager.vectorSearch(createDirectionVector(DIMS, 0), 1);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('a');
    });

    it('should return all items when k > index size', async () => {
      await manager.vectorStore('a', createDirectionVector(DIMS, 0));
      await manager.vectorStore('b', createDirectionVector(DIMS, 1));

      const results = await manager.vectorSearch(createDirectionVector(DIMS, 0), 10);

      expect(results).toHaveLength(2);
    });
  });

  // --------------------------------------------------------------------------
  // Empty Index and Edge Cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should return empty array when searching an empty index', async () => {
      const results = await manager.vectorSearch(createDirectionVector(DIMS, 0), 5);
      expect(results).toEqual([]);
    });

    it('should handle single-vector index correctly', async () => {
      await manager.vectorStore('only', createDirectionVector(DIMS, 3));

      const results = await manager.vectorSearch(createDirectionVector(DIMS, 3), 5);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('only');
      expect(results[0].score).toBeCloseTo(1.0, 3);
    });

    it('should update the vector when storing a duplicate ID', async () => {
      // Store pointing along axis 0
      await manager.vectorStore('dup', createDirectionVector(DIMS, 0));
      // Replace with axis 1
      await manager.vectorStore('dup', createDirectionVector(DIMS, 1));

      const count = await manager.vectorCount();
      expect(count).toBe(1);

      // Search for axis 1 should find it with high similarity
      const results = await manager.vectorSearch(createDirectionVector(DIMS, 1), 1);
      expect(results[0].id).toBe('dup');
      expect(results[0].score).toBeCloseTo(1.0, 3);

      // Search for axis 0 should yield low similarity since vector was replaced
      const results2 = await manager.vectorSearch(createDirectionVector(DIMS, 0), 1);
      expect(results2[0].score).toBeLessThan(0.5);
    });
  });

  // --------------------------------------------------------------------------
  // Deletion
  // --------------------------------------------------------------------------

  describe('delete', () => {
    it('should remove a vector so it is no longer returned in search', async () => {
      await manager.vectorStore('a', createDirectionVector(DIMS, 0));
      await manager.vectorStore('b', createDirectionVector(DIMS, 1));

      await manager.vectorDelete('a');

      const count = await manager.vectorCount();
      expect(count).toBe(1);

      const results = await manager.vectorSearch(createDirectionVector(DIMS, 0), 5);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('b');
    });

    it('should return false when deleting a nonexistent ID', async () => {
      const deleted = await manager.vectorDelete('ghost');
      expect(deleted).toBe(false);
    });

    it('should still find remaining vectors after removing the first stored vector', async () => {
      await manager.vectorStore('first', createDirectionVector(DIMS, 0));
      await manager.vectorStore('second', createDirectionVector(DIMS, 1));

      const deleted = await manager.vectorDelete('first');
      expect(deleted).toBe(true);

      const count = await manager.vectorCount();
      expect(count).toBe(1);

      const results = await manager.vectorSearch(createDirectionVector(DIMS, 1), 1);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('second');
    });

    it('should produce an empty index after deleting all vectors', async () => {
      await manager.vectorStore('a', createDirectionVector(DIMS, 0));
      await manager.vectorStore('b', createDirectionVector(DIMS, 1));

      await manager.vectorDelete('a');
      await manager.vectorDelete('b');

      const count = await manager.vectorCount();
      expect(count).toBe(0);

      const results = await manager.vectorSearch(createDirectionVector(DIMS, 0), 1);
      expect(results).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // Limit Parameter
  // --------------------------------------------------------------------------

  describe('limit parameter', () => {
    it('should respect the k limit when more results exist', async () => {
      for (let i = 0; i < 10; i++) {
        await manager.vectorStore(`vec-${i}`, createRandomVector(DIMS));
      }

      const results = await manager.vectorSearch(createRandomVector(DIMS), 3);
      expect(results).toHaveLength(3);
    });

    it('should return fewer than k when index has fewer vectors', async () => {
      await manager.vectorStore('a', createDirectionVector(DIMS, 0));
      await manager.vectorStore('b', createDirectionVector(DIMS, 1));

      const results = await manager.vectorSearch(createDirectionVector(DIMS, 0), 50);
      expect(results).toHaveLength(2);
    });
  });

  // --------------------------------------------------------------------------
  // Cosine Similarity Ordering
  // --------------------------------------------------------------------------

  describe('cosine similarity ordering', () => {
    it('should order results by descending cosine similarity', async () => {
      const query = createDirectionVector(DIMS, 0);

      // Identical to query (sim ~ 1.0)
      await manager.vectorStore('identical', createDirectionVector(DIMS, 0));

      // 45-degree angle (sim ~ 0.707)
      const angled45 = new Array(DIMS).fill(0);
      angled45[0] = 1;
      angled45[1] = 1;
      await manager.vectorStore('angled45', angled45);

      // Orthogonal (sim ~ 0.0)
      await manager.vectorStore('orthogonal', createDirectionVector(DIMS, 1));

      // Opposite (sim ~ -1.0)
      await manager.vectorStore('opposite', createDirectionVector(DIMS, 0, -1.0));

      const results = await manager.vectorSearch(query, 4);

      expect(results).toHaveLength(4);

      // Verify descending order
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
      }

      // Most similar should be 'identical'
      expect(results[0].id).toBe('identical');
      expect(results[0].score).toBeCloseTo(1.0, 3);
    });

    it('should cluster similar vectors above dissimilar ones in results', async () => {
      const baseVec = createDirectionVector(DIMS, 0);

      // Add 3 very similar vectors (small noise)
      for (let i = 0; i < 3; i++) {
        await manager.vectorStore(`similar-${i}`, createSimilarVector(baseVec, 0.05));
      }
      // Add 3 dissimilar vectors (different axes)
      for (let i = 0; i < 3; i++) {
        await manager.vectorStore(`different-${i}`, createDirectionVector(DIMS, i + 5));
      }

      const results = await manager.vectorSearch(baseVec, 6);

      // Top 3 results should all be the 'similar-*' vectors
      const top3Ids = results.slice(0, 3).map(r => r.id);
      for (const id of top3Ids) {
        expect(id).toMatch(/^similar-/);
      }
    });

    it('should return ~0 similarity for orthogonal vectors', async () => {
      // Store a vector along axis 0
      await manager.vectorStore('x-axis', createDirectionVector(DIMS, 0));

      // Search with a vector along axis 1 (orthogonal)
      const results = await manager.vectorSearch(createDirectionVector(DIMS, 1), 1);

      expect(results).toHaveLength(1);
      expect(results[0].score).toBeCloseTo(0.0, 1);
    });
  });

  // --------------------------------------------------------------------------
  // Threshold / Score Filtering
  // --------------------------------------------------------------------------

  describe('threshold filtering via post-search', () => {
    it('should allow client-side filtering by score threshold', async () => {
      const query = createDirectionVector(DIMS, 0);

      // High similarity
      await manager.vectorStore('close', createDirectionVector(DIMS, 0));
      // Low similarity (orthogonal)
      await manager.vectorStore('far', createDirectionVector(DIMS, 1));

      const allResults = await manager.vectorSearch(query, 10);
      const threshold = 0.5;
      const filtered = allResults.filter(r => r.score >= threshold);

      expect(filtered.length).toBeGreaterThanOrEqual(1);
      expect(filtered.every(r => r.score >= threshold)).toBe(true);
      // The 'far' vector (orthogonal, sim~0) should not pass threshold
      expect(filtered.find(r => r.id === 'far')).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Metadata Round-Trip
  // --------------------------------------------------------------------------

  describe('metadata', () => {
    it('should store and return metadata alongside vector search results', async () => {
      const vec = createDirectionVector(DIMS, 0);
      const meta = { label: 'test-vector', importance: 0.9 };

      await manager.vectorStore('with-meta', vec, 'default', meta);

      const results = await manager.vectorSearch(vec, 1);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('with-meta');
      expect(results[0].metadata).toEqual(meta);
    });
  });

  // --------------------------------------------------------------------------
  // Performance / Scale
  // --------------------------------------------------------------------------

  describe('performance', () => {
    it('should search among 100+ vectors within reasonable time', async () => {
      // Insert 100 random vectors
      for (let i = 0; i < 100; i++) {
        await manager.vectorStore(`vec-${i}`, createRandomVector(DIMS));
      }

      const count = await manager.vectorCount();
      expect(count).toBe(100);

      const query = createRandomVector(DIMS);
      const start = performance.now();
      const results = await manager.vectorSearch(query, 10);
      const elapsed = performance.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(10);

      // Search should complete in well under 1 second
      expect(elapsed).toBeLessThan(1000);
    });

    it('should maintain correct count after mixed store/delete operations', async () => {
      for (let i = 0; i < 20; i++) {
        await manager.vectorStore(`v-${i}`, createRandomVector(DIMS));
      }
      expect(await manager.vectorCount()).toBe(20);

      // Delete even-numbered
      for (let i = 0; i < 20; i += 2) {
        await manager.vectorDelete(`v-${i}`);
      }
      expect(await manager.vectorCount()).toBe(10);

      // Add new ones
      for (let i = 20; i < 30; i++) {
        await manager.vectorStore(`v-${i}`, createRandomVector(DIMS));
      }
      expect(await manager.vectorCount()).toBe(20);
    });
  });

  // --------------------------------------------------------------------------
  // Cosine Similarity Utility (direct, not via manager)
  // --------------------------------------------------------------------------

  describe('cosineSimilarity utility', () => {
    it('should return 1.0 for identical vectors', () => {
      const v = [1, 2, 3];
      expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 10);
    });

    it('should return -1.0 for opposite vectors', () => {
      const v = [1, 0, 0];
      const neg = [-1, 0, 0];
      expect(cosineSimilarity(v, neg)).toBeCloseTo(-1.0, 10);
    });

    it('should return 0.0 for orthogonal vectors', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 10);
    });

    it('should throw on mismatched dimensions', () => {
      expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/length mismatch/i);
    });
  });
});
