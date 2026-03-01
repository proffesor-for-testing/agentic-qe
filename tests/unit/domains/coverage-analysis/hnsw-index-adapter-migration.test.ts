/**
 * ADR-071: HNSW Unification - HNSWIndex -> HnswAdapter Migration Test
 *
 * Verifies that the migrated HNSWIndex (which now delegates to HnswAdapter
 * internally) maintains full backward compatibility with the original
 * QEGNNEmbeddingIndex-based implementation.
 *
 * These tests do NOT require @ruvector/gnn to be available — the
 * ProgressiveHnswBackend inside HnswAdapter falls back to brute-force
 * cosine similarity when native search is unavailable.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  HNSWIndex,
  createHNSWIndex,
  DEFAULT_HNSW_CONFIG,
  type CoverageVectorMetadata,
  type HNSWSearchResult,
} from '../../../../src/domains/coverage-analysis/services/hnsw-index';
import { HnswAdapter } from '../../../../src/kernel/hnsw-adapter';

// ============================================================================
// Minimal MemoryBackend stub for testing
// ============================================================================

function createStubMemoryBackend() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => { store.set(key, value); },
    delete: async (key: string) => { store.delete(key); return true; },
    has: async (key: string) => store.has(key),
    list: async () => Array.from(store.keys()),
    clear: async () => { store.clear(); },
    initialize: async () => {},
    dispose: async () => {},
  };
}

// ============================================================================
// Test Helpers
// ============================================================================

function createTestVector(dimensions: number): number[] {
  const vector = new Array(dimensions).fill(0);
  for (let i = 0; i < dimensions; i++) {
    vector[i] = Math.random();
  }
  return vector;
}

function createCoverageVector(coverage: number, risk: number, dim = 128): number[] {
  const vector = new Array(dim).fill(0);
  vector[0] = coverage;
  vector[1] = coverage * 0.9;
  vector[2] = coverage * 1.1;
  vector[3] = coverage;
  vector[4] = risk;
  vector[5] = risk * 0.8;
  for (let i = 6; i < dim; i++) {
    vector[i] = Math.sin(i * coverage + risk) * 0.5 + 0.5;
  }
  return vector;
}

function createTestMetadata(overrides: Partial<CoverageVectorMetadata> = {}): CoverageVectorMetadata {
  return {
    filePath: 'src/test.ts',
    lineCoverage: 75,
    branchCoverage: 60,
    functionCoverage: 80,
    statementCoverage: 70,
    uncoveredLineCount: 25,
    uncoveredBranchCount: 10,
    riskScore: 0.6,
    lastUpdated: Date.now(),
    totalLines: 100,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('HNSWIndex -> HnswAdapter Migration (ADR-071)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let memory: any;
  let index: HNSWIndex;

  beforeEach(async () => {
    memory = createStubMemoryBackend();
    index = createHNSWIndex(memory, { dimensions: 128, namespace: `test-${Date.now()}` });
  });

  afterEach(async () => {
    await index.clear();
    HnswAdapter.closeAll();
  });

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  describe('initialization', () => {
    it('should initialize without errors', async () => {
      await expect(index.initialize()).resolves.not.toThrow();
    });

    it('should report as native available after initialization', async () => {
      await index.initialize();
      expect(index.isNativeAvailable()).toBe(true);
    });

    it('should be idempotent on multiple initialize calls', async () => {
      await index.initialize();
      await index.initialize();
      expect(index.isNativeAvailable()).toBe(true);
    });

    it('should report backend type as ruvector-gnn', () => {
      expect(index.getBackendType()).toBe('ruvector-gnn');
    });
  });

  // --------------------------------------------------------------------------
  // Insert
  // --------------------------------------------------------------------------

  describe('insert', () => {
    it('should insert a vector with metadata', async () => {
      const vector = createTestVector(128);
      const metadata = createTestMetadata();

      await index.insert('test-key', vector, metadata);

      const stats = await index.getStats();
      expect(stats.vectorCount).toBe(1);
      expect(stats.insertOperations).toBe(1);
    });

    it('should auto-initialize on first insert', async () => {
      // Do NOT call initialize() explicitly
      await index.insert('auto-init-key', createTestVector(128));
      expect(index.isNativeAvailable()).toBe(true);
      const stats = await index.getStats();
      expect(stats.vectorCount).toBe(1);
    });

    it('should handle duplicate key by updating', async () => {
      await index.insert('dup-key', createTestVector(128));
      await index.insert('dup-key', createTestVector(128));

      const stats = await index.getStats();
      expect(stats.vectorCount).toBe(1);
    });

    it('should auto-resize vectors with wrong dimensions (Fix #279)', async () => {
      // 768-dim vector should be resized to 128
      const largeVector = createTestVector(768);
      await index.insert('large-key', largeVector);

      const stats = await index.getStats();
      expect(stats.vectorCount).toBe(1);

      // Should be searchable with a correctly-sized query
      const results = await index.search(createTestVector(128), 1);
      expect(results.length).toBe(1);
      expect(results[0].key).toBe('large-key');
    });

    it('should auto-resize small vectors by zero-padding (Fix #279)', async () => {
      const smallVector = createTestVector(64);
      await index.insert('small-key', smallVector);

      const stats = await index.getStats();
      expect(stats.vectorCount).toBe(1);
    });

    it('should reject vectors with non-finite values', async () => {
      const invalidVector = createTestVector(128);
      invalidVector[50] = NaN;

      await expect(index.insert('test-key', invalidVector)).rejects.toThrow(
        /invalid vector value/i
      );
    });
  });

  // --------------------------------------------------------------------------
  // Search
  // --------------------------------------------------------------------------

  describe('search', () => {
    it('should return empty results for empty index', async () => {
      await index.initialize();
      const results = await index.search(createTestVector(128), 5);
      expect(results).toEqual([]);
    });

    it('should find similar vectors', async () => {
      const vectors = [
        { key: 'high-coverage', lineCoverage: 90, riskScore: 0.2 },
        { key: 'medium-coverage', lineCoverage: 70, riskScore: 0.5 },
        { key: 'low-coverage', lineCoverage: 40, riskScore: 0.8 },
      ];

      for (const v of vectors) {
        const vector = createCoverageVector(v.lineCoverage / 100, v.riskScore);
        await index.insert(v.key, vector, createTestMetadata({
          filePath: `src/${v.key}.ts`,
          lineCoverage: v.lineCoverage,
          riskScore: v.riskScore,
        }));
      }

      // Search for low-coverage pattern
      const queryVector = createCoverageVector(0.4, 0.8);
      const results = await index.search(queryVector, 3);

      expect(results.length).toBe(3);
      // The most similar should be low-coverage
      expect(results[0].key).toBe('low-coverage');
      expect(results[0].score).toBeGreaterThan(0.5);
    });

    it('should return results sorted by similarity (descending)', async () => {
      for (let i = 0; i < 10; i++) {
        const coverage = i * 10;
        const vector = createCoverageVector(coverage / 100, 1 - coverage / 100);
        await index.insert(`file-${i}`, vector);
      }

      const queryVector = createCoverageVector(0.5, 0.5);
      const results = await index.search(queryVector, 5);

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('should respect k limit', async () => {
      for (let i = 0; i < 20; i++) {
        await index.insert(`file-${i}`, createTestVector(128));
      }

      const results = await index.search(createTestVector(128), 5);
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should include metadata in search results', async () => {
      const metadata = createTestMetadata({ filePath: 'src/important.ts' });
      await index.insert('important', createTestVector(128), metadata);

      const results = await index.search(createTestVector(128), 1);
      expect(results[0].metadata).toBeDefined();
      expect(results[0].metadata!.filePath).toBe('src/important.ts');
    });

    it('should return distance as 1 - score', async () => {
      await index.insert('vec-1', createTestVector(128));
      const results = await index.search(createTestVector(128), 1);

      expect(results[0].distance).toBeCloseTo(1 - results[0].score, 10);
    });

    it('should allow search with mismatched query dimensions (Fix #279)', async () => {
      await index.insert('correct-key', createTestVector(128));

      // Search with 768-dim query (should auto-resize)
      const results = await index.search(createTestVector(768), 1);
      expect(results.length).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Batch Insert
  // --------------------------------------------------------------------------

  describe('batchInsert', () => {
    it('should insert multiple vectors efficiently', async () => {
      const items = [];
      for (let i = 0; i < 50; i++) {
        items.push({
          key: `file-${i}`,
          vector: createTestVector(128),
          metadata: createTestMetadata({ filePath: `src/file-${i}.ts` }),
        });
      }

      await index.batchInsert(items);

      const stats = await index.getStats();
      expect(stats.vectorCount).toBe(50);
      expect(stats.insertOperations).toBe(50);
    });
  });

  // --------------------------------------------------------------------------
  // Delete
  // --------------------------------------------------------------------------

  describe('delete', () => {
    it('should delete a vector', async () => {
      await index.insert('test-key', createTestVector(128));

      let stats = await index.getStats();
      expect(stats.vectorCount).toBe(1);

      const deleted = await index.delete('test-key');
      expect(deleted).toBe(true);

      stats = await index.getStats();
      expect(stats.vectorCount).toBe(0);
    });

    it('should return false for non-existent key', async () => {
      await index.initialize();
      const deleted = await index.delete('non-existent');
      expect(deleted).toBe(false);
    });

    it('should remove metadata on delete', async () => {
      const metadata = createTestMetadata();
      await index.insert('with-meta', createTestVector(128), metadata);
      await index.delete('with-meta');

      // Re-insert and search - should not have old metadata
      await index.insert('other', createTestVector(128));
      const results = await index.search(createTestVector(128), 10);
      const oldEntry = results.find(r => r.key === 'with-meta');
      expect(oldEntry).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Stats
  // --------------------------------------------------------------------------

  describe('getStats', () => {
    it('should return accurate statistics', async () => {
      for (let i = 0; i < 10; i++) {
        await index.insert(`file-${i}`, createTestVector(128));
      }

      for (let i = 0; i < 5; i++) {
        await index.search(createTestVector(128), 3);
      }

      const stats = await index.getStats();

      expect(stats.vectorCount).toBe(10);
      expect(stats.insertOperations).toBe(10);
      expect(stats.searchOperations).toBe(5);
      expect(stats.indexSizeBytes).toBeGreaterThan(0);
      expect(stats.backendType).toBe('ruvector-gnn');
      expect(stats.nativeHNSW).toBe(true);
    });

    it('should track search latencies', async () => {
      for (let i = 0; i < 10; i++) {
        await index.insert(`file-${i}`, createTestVector(128));
      }

      for (let i = 0; i < 20; i++) {
        await index.search(createTestVector(128), 5);
      }

      const stats = await index.getStats();
      expect(stats.avgSearchLatencyMs).toBeGreaterThanOrEqual(0);
      expect(stats.p95SearchLatencyMs).toBeGreaterThanOrEqual(0);
      expect(stats.p99SearchLatencyMs).toBeGreaterThanOrEqual(0);
      expect(stats.p99SearchLatencyMs).toBeGreaterThanOrEqual(stats.p95SearchLatencyMs);
    });
  });

  // --------------------------------------------------------------------------
  // Clear
  // --------------------------------------------------------------------------

  describe('clear', () => {
    it('should clear all entries', async () => {
      for (let i = 0; i < 10; i++) {
        await index.insert(`file-${i}`, createTestVector(128));
      }

      let stats = await index.getStats();
      expect(stats.vectorCount).toBe(10);

      await index.clear();

      stats = await index.getStats();
      expect(stats.vectorCount).toBe(0);
    });

    it('should allow re-use after clear', async () => {
      await index.insert('before-clear', createTestVector(128));
      await index.clear();
      await index.insert('after-clear', createTestVector(128));

      const stats = await index.getStats();
      expect(stats.vectorCount).toBe(1);

      const results = await index.search(createTestVector(128), 1);
      expect(results[0].key).toBe('after-clear');
    });
  });

  // --------------------------------------------------------------------------
  // Default Config
  // --------------------------------------------------------------------------

  describe('DEFAULT_HNSW_CONFIG', () => {
    it('should have sensible default values', () => {
      expect(DEFAULT_HNSW_CONFIG.dimensions).toBe(768);
      expect(DEFAULT_HNSW_CONFIG.M).toBe(16);
      expect(DEFAULT_HNSW_CONFIG.efConstruction).toBe(200);
      expect(DEFAULT_HNSW_CONFIG.efSearch).toBe(100);
      expect(DEFAULT_HNSW_CONFIG.metric).toBe('cosine');
    });
  });

  // --------------------------------------------------------------------------
  // 768-dim (production default) verification
  // --------------------------------------------------------------------------

  describe('768-dim production vectors', () => {
    let prodIndex: HNSWIndex;

    beforeEach(() => {
      prodIndex = createHNSWIndex(memory, { namespace: `prod-${Date.now()}` });
      // Uses default 768 dimensions
    });

    afterEach(async () => {
      await prodIndex.clear();
    });

    it('should handle 768-dim vectors (production default)', async () => {
      const vector = createTestVector(768);
      await prodIndex.insert('prod-file', vector, createTestMetadata());

      const stats = await prodIndex.getStats();
      expect(stats.vectorCount).toBe(1);

      const results = await prodIndex.search(createTestVector(768), 1);
      expect(results.length).toBe(1);
      expect(results[0].key).toBe('prod-file');
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('should auto-resize 384-dim vectors to 768-dim', async () => {
      // Insert 384-dim vector (common from MiniLM embeddings)
      const vector384 = createTestVector(384);
      await prodIndex.insert('miniml-file', vector384);

      const stats = await prodIndex.getStats();
      expect(stats.vectorCount).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // HnswAdapter delegation verification
  // --------------------------------------------------------------------------

  describe('HnswAdapter delegation', () => {
    it('should use HnswAdapter internally (not direct QEGNNEmbeddingIndex)', async () => {
      await index.initialize();

      // After initialization, HnswAdapter registry should have our index
      const registeredIndexes = HnswAdapter.listIndexes();
      const hasCoverageIndex = registeredIndexes.some(name => name.startsWith('coverage-'));
      expect(hasCoverageIndex).toBe(true);
    });

    it('should track vectorCount via adapter.size()', async () => {
      await index.insert('a', createTestVector(128));
      await index.insert('b', createTestVector(128));
      await index.insert('c', createTestVector(128));

      const stats = await index.getStats();
      expect(stats.vectorCount).toBe(3);

      await index.delete('b');
      const stats2 = await index.getStats();
      expect(stats2.vectorCount).toBe(2);
    });
  });
});
