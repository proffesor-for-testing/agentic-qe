/**
 * Agentic QE v3 - HNSW Index Tests
 *
 * Tests for the HNSW (Hierarchical Navigable Small World) index wrapper
 * that provides O(log n) vector search for coverage gap detection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  HNSWIndex,
  createHNSWIndex,
  DEFAULT_HNSW_CONFIG,
  type CoverageVectorMetadata,
} from '../../../../src/domains/coverage-analysis/services/hnsw-index';
import { HybridMemoryBackend } from '../../../../src/kernel/hybrid-backend';
import { checkRuvectorPackagesAvailable } from '../../../../src/integrations/ruvector/wrappers';
import { resetUnifiedMemory } from '../../../../src/kernel/unified-memory';

// Check if @ruvector/gnn native operations work (not just import)
const canTest = checkRuvectorPackagesAvailable();

describe.runIf(canTest.gnn)('HNSWIndex', () => {
  let memory: HybridMemoryBackend;
  let index: HNSWIndex;

  beforeEach(async () => {
    // Reset unified memory singleton for test isolation
    resetUnifiedMemory();

    // Create HybridMemoryBackend which uses UnifiedMemoryManager
    memory = new HybridMemoryBackend({
      sqlite: { path: ':memory:' },  // Use in-memory SQLite for tests
      enableFallback: true,
    });
    await memory.initialize();

    index = createHNSWIndex(memory, { dimensions: 128 });
  });

  afterEach(async () => {
    await index.clear();
    await memory.dispose();
    resetUnifiedMemory();
  });

  describe('insert', () => {
    it('should insert a vector with metadata', async () => {
      const vector = createTestVector(128);
      const metadata: CoverageVectorMetadata = {
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
      };

      await index.insert('test-key', vector, metadata);

      const stats = await index.getStats();
      expect(stats.vectorCount).toBe(1);
      expect(stats.insertOperations).toBe(1);
    });

    it('should reject vectors with wrong dimensions', async () => {
      const wrongVector = createTestVector(64); // Wrong dimension

      await expect(index.insert('test-key', wrongVector)).rejects.toThrow(
        /dimension mismatch/i
      );
    });

    it('should reject vectors with non-finite values', async () => {
      const invalidVector = createTestVector(128);
      invalidVector[50] = NaN;

      await expect(index.insert('test-key', invalidVector)).rejects.toThrow(
        /invalid vector value/i
      );
    });
  });

  describe('search', () => {
    it('should find similar vectors', async () => {
      // Insert test vectors with different characteristics
      const vectors = [
        { key: 'high-coverage', lineCoverage: 90, riskScore: 0.2 },
        { key: 'medium-coverage', lineCoverage: 70, riskScore: 0.5 },
        { key: 'low-coverage', lineCoverage: 40, riskScore: 0.8 },
      ];

      for (const v of vectors) {
        const vector = createCoverageVector(v.lineCoverage / 100, v.riskScore);
        await index.insert(v.key, vector, {
          filePath: `src/${v.key}.ts`,
          lineCoverage: v.lineCoverage,
          branchCoverage: v.lineCoverage - 10,
          functionCoverage: v.lineCoverage + 5,
          statementCoverage: v.lineCoverage,
          uncoveredLineCount: 100 - v.lineCoverage,
          uncoveredBranchCount: Math.floor((100 - v.lineCoverage) / 2),
          riskScore: v.riskScore,
          lastUpdated: Date.now(),
          totalLines: 100,
        });
      }

      // Search for low-coverage pattern
      const queryVector = createCoverageVector(0.4, 0.8);
      const results = await index.search(queryVector, 3);

      expect(results.length).toBe(3);
      // The most similar should be low-coverage
      expect(results[0].key).toBe('low-coverage');
      expect(results[0].score).toBeGreaterThan(0.5);
    });

    it('should return results sorted by similarity', async () => {
      // Insert multiple vectors
      for (let i = 0; i < 10; i++) {
        const coverage = i * 10;
        const vector = createCoverageVector(coverage / 100, 1 - coverage / 100);
        await index.insert(`file-${i}`, vector);
      }

      const queryVector = createCoverageVector(0.5, 0.5);
      const results = await index.search(queryVector, 5);

      // Results should be sorted by score (descending)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('should respect k limit', async () => {
      // Insert many vectors
      for (let i = 0; i < 20; i++) {
        await index.insert(`file-${i}`, createTestVector(128));
      }

      const results = await index.search(createTestVector(128), 5);
      expect(results.length).toBeLessThanOrEqual(5);
    });
  });

  describe('batchInsert', () => {
    it('should insert multiple vectors efficiently', async () => {
      const items = [];
      for (let i = 0; i < 50; i++) {
        items.push({
          key: `file-${i}`,
          vector: createTestVector(128),
          metadata: {
            filePath: `src/file-${i}.ts`,
            lineCoverage: Math.random() * 100,
            branchCoverage: Math.random() * 100,
            functionCoverage: Math.random() * 100,
            statementCoverage: Math.random() * 100,
            uncoveredLineCount: Math.floor(Math.random() * 100),
            uncoveredBranchCount: Math.floor(Math.random() * 50),
            riskScore: Math.random(),
            lastUpdated: Date.now(),
            totalLines: 100,
          } as CoverageVectorMetadata,
        });
      }

      await index.batchInsert(items);

      const stats = await index.getStats();
      expect(stats.vectorCount).toBe(50);
      expect(stats.insertOperations).toBe(50);
    });
  });

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
      const deleted = await index.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', async () => {
      // Insert some vectors
      for (let i = 0; i < 10; i++) {
        await index.insert(`file-${i}`, createTestVector(128));
      }

      // Perform some searches
      for (let i = 0; i < 5; i++) {
        await index.search(createTestVector(128), 3);
      }

      const stats = await index.getStats();

      expect(stats.vectorCount).toBe(10);
      expect(stats.insertOperations).toBe(10);
      expect(stats.searchOperations).toBe(5);
      expect(stats.indexSizeBytes).toBeGreaterThan(0);
    });

    it('should track search latencies', async () => {
      // Insert vectors
      for (let i = 0; i < 100; i++) {
        await index.insert(`file-${i}`, createTestVector(128));
      }

      // Perform searches
      for (let i = 0; i < 20; i++) {
        await index.search(createTestVector(128), 10);
      }

      const stats = await index.getStats();

      expect(stats.avgSearchLatencyMs).toBeGreaterThan(0);
      // Use approximate comparison to handle numerical precision issues
      // p95 should be at least as large as avg (within small tolerance for rounding)
      expect(stats.p95SearchLatencyMs).toBeGreaterThanOrEqual(stats.avgSearchLatencyMs * 0.99);
      expect(stats.p99SearchLatencyMs).toBeGreaterThanOrEqual(stats.p95SearchLatencyMs * 0.99);
    });
  });

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
  });

  describe('DEFAULT_HNSW_CONFIG', () => {
    it('should have sensible default values', () => {
      expect(DEFAULT_HNSW_CONFIG.dimensions).toBe(128);
      expect(DEFAULT_HNSW_CONFIG.M).toBe(16);
      expect(DEFAULT_HNSW_CONFIG.efConstruction).toBe(200);
      expect(DEFAULT_HNSW_CONFIG.efSearch).toBe(100);
      expect(DEFAULT_HNSW_CONFIG.metric).toBe('cosine');
    });
  });
});

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

function createCoverageVector(coverage: number, risk: number): number[] {
  const vector = new Array(128).fill(0);

  // Encode coverage metrics
  vector[0] = coverage;
  vector[1] = coverage * 0.9; // branch
  vector[2] = coverage * 1.1; // function
  vector[3] = coverage; // statement

  // Encode risk
  vector[4] = risk;
  vector[5] = risk * 0.8;

  // Fill remaining with derived features
  for (let i = 6; i < 128; i++) {
    vector[i] = Math.sin(i * coverage + risk) * 0.5 + 0.5;
  }

  return vector;
}
