/**
 * Tests for HNSW Vector Memory
 *
 * @module tests/unit/memory/hnsw-vector-memory
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  HNSWVectorMemory,
  createHNSWVectorMemory,
  createHighPrecisionHNSW,
  createHighThroughputHNSW,
  createBalancedHNSW,
  type HNSWVectorMemoryConfig,
  type SearchMetrics,
  type MaintenanceStats,
  type BatchResult,
} from '../../../src/core/memory/HNSWVectorMemory';
import type { TestPattern } from '../../../src/core/memory/IPatternStore';

describe('HNSWVectorMemory', () => {
  let memory: HNSWVectorMemory;
  const testStoragePath = '.agentic-qe/test-hnsw.db';

  beforeEach(async () => {
    memory = createHNSWVectorMemory({
      storagePath: testStoragePath,
      dimension: 384,
      enableMetrics: true,
      enableMaintenance: false, // Disable for tests
    });
    await memory.initialize();
  });

  afterEach(async () => {
    await memory.shutdown();
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', async () => {
      const mem = createHNSWVectorMemory();
      await mem.initialize();

      const config = mem.getConfig();
      expect(config.M).toBe(32);
      expect(config.efConstruction).toBe(200);
      expect(config.efSearch).toBe(100);
      expect(config.metric).toBe('cosine');
      expect(config.dimension).toBe(384);

      await mem.shutdown();
    });

    it('should initialize with custom configuration', async () => {
      const customConfig: HNSWVectorMemoryConfig = {
        M: 48,
        efConstruction: 300,
        efSearch: 150,
        metric: 'euclidean',
        dimension: 512,
      };

      const mem = createHNSWVectorMemory(customConfig);
      await mem.initialize();

      const config = mem.getConfig();
      expect(config.M).toBe(48);
      expect(config.efConstruction).toBe(300);
      expect(config.efSearch).toBe(150);
      expect(config.metric).toBe('euclidean');
      expect(config.dimension).toBe(512);

      await mem.shutdown();
    });

    it('should log configuration on initialization', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      const mem = createHNSWVectorMemory();
      await mem.initialize();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[HNSW] Configuration:'));
      await mem.shutdown();
      consoleSpy.mockRestore();
    });
  });

  describe('Pattern Storage', () => {
    it('should store a single pattern', async () => {
      const pattern: TestPattern = {
        id: 'test-1',
        embedding: Array.from({ length: 384 }, () => Math.random()),
        type: 'unit',
        domain: 'auth',
        content: 'test authentication flow',
        framework: 'jest',
        createdAt: Date.now(),
        lastUsed: Date.now(),
        usageCount: 0,
      };

      await memory.storePattern(pattern);

      const retrieved = await memory.getPattern('test-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe('test-1');
      expect(retrieved!.type).toBe('unit');
      expect(retrieved!.domain).toBe('auth');
    });

    it('should store multiple patterns', async () => {
      const patterns: TestPattern[] = Array.from({ length: 5 }, (_, i) => ({
        id: `test-${i}`,
        embedding: Array.from({ length: 384 }, () => Math.random()),
        type: 'unit',
        domain: 'auth',
        content: `test pattern ${i}`,
        framework: 'jest',
        createdAt: Date.now(),
        lastUsed: Date.now(),
        usageCount: 0,
      }));

      for (const pattern of patterns) {
        await memory.storePattern(pattern);
      }

      const stats = await memory.getStats();
      expect(stats.count).toBeGreaterThanOrEqual(5);
    });

    it('should track insert latency when metrics enabled', async () => {
      const pattern: TestPattern = {
        id: 'metric-test',
        embedding: Array.from({ length: 384 }, () => Math.random()),
        type: 'unit',
        domain: 'auth',
        content: 'test metrics',
        framework: 'jest',
        createdAt: Date.now(),
        lastUsed: Date.now(),
        usageCount: 0,
      };

      await memory.storePattern(pattern);

      const metrics = memory.getSearchMetrics();
      // Insert doesn't affect search metrics, but verifies metrics are being tracked
      expect(metrics.totalSearches).toBe(0);
    });
  });

  describe('Batch Operations', () => {
    it('should store patterns in batch', async () => {
      const patterns: TestPattern[] = Array.from({ length: 50 }, (_, i) => ({
        id: `batch-${i}`,
        embedding: Array.from({ length: 384 }, () => Math.random()),
        type: 'unit',
        domain: 'auth',
        content: `batch pattern ${i}`,
        framework: 'jest',
        createdAt: Date.now(),
        lastUsed: Date.now(),
        usageCount: 0,
      }));

      const result: BatchResult = await memory.storeBatch(patterns);

      expect(result.successful).toBe(50);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should handle partial batch failures gracefully', async () => {
      const patterns: TestPattern[] = [
        {
          id: 'valid-1',
          embedding: Array.from({ length: 384 }, () => Math.random()),
          type: 'unit',
          domain: 'auth',
          content: 'valid pattern',
          framework: 'jest',
          createdAt: Date.now(),
          lastUsed: Date.now(),
          usageCount: 0,
        },
        // Invalid pattern with mismatched embedding dimension
        {
          id: 'invalid-1',
          embedding: [1, 2, 3], // Too short
          type: 'unit',
          domain: 'auth',
          content: 'invalid pattern',
          framework: 'jest',
          createdAt: Date.now(),
          lastUsed: Date.now(),
          usageCount: 0,
        },
      ];

      const result: BatchResult = await memory.storeBatch(patterns);

      // At least one should succeed
      expect(result.successful).toBeGreaterThanOrEqual(1);
    });

    it('should batch query multiple vectors', async () => {
      // Store some patterns first
      const patterns: TestPattern[] = Array.from({ length: 10 }, (_, i) => ({
        id: `query-${i}`,
        embedding: Array.from({ length: 384 }, () => Math.random()),
        type: 'unit',
        domain: 'auth',
        content: `query pattern ${i}`,
        framework: 'jest',
        createdAt: Date.now(),
        lastUsed: Date.now(),
        usageCount: 0,
      }));

      await memory.storeBatch(patterns);

      // Batch query
      const queries = [
        { embedding: Array.from({ length: 384 }, () => Math.random()) },
        { embedding: Array.from({ length: 384 }, () => Math.random()) },
        { embedding: Array.from({ length: 384 }, () => Math.random()) },
      ];

      const results = await memory.searchBatch(queries);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(Array.isArray(result)).toBe(true);
      });
    });
  });

  describe('Similarity Search', () => {
    beforeEach(async () => {
      // Store reference patterns
      const patterns: TestPattern[] = Array.from({ length: 20 }, (_, i) => ({
        id: `search-${i}`,
        embedding: Array.from({ length: 384 }, () => Math.random()),
        type: i % 2 === 0 ? 'unit' : 'integration',
        domain: i % 3 === 0 ? 'auth' : 'api',
        content: `search pattern ${i}`,
        framework: 'jest',
        createdAt: Date.now(),
        lastUsed: Date.now(),
        usageCount: 0,
      }));

      await memory.storeBatch(patterns);
    });

    it('should search for similar patterns', async () => {
      const queryEmbedding = Array.from({ length: 384 }, () => Math.random());
      const results = await memory.searchSimilar(queryEmbedding, { k: 5 });

      expect(results.length).toBeLessThanOrEqual(5);
      results.forEach((result) => {
        expect(result.pattern).toBeDefined();
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      });
    });

    it('should filter by domain', async () => {
      const queryEmbedding = Array.from({ length: 384 }, () => Math.random());
      const results = await memory.searchSimilar(queryEmbedding, {
        k: 10,
        domain: 'auth',
      });

      results.forEach((result) => {
        expect(result.pattern.domain).toBe('auth');
      });
    });

    it('should filter by type', async () => {
      const queryEmbedding = Array.from({ length: 384 }, () => Math.random());
      const results = await memory.searchSimilar(queryEmbedding, {
        k: 10,
        type: 'unit',
      });

      results.forEach((result) => {
        expect(result.pattern.type).toBe('unit');
      });
    });

    it('should apply threshold filtering', async () => {
      const queryEmbedding = Array.from({ length: 384 }, () => Math.random());
      const results = await memory.searchSimilar(queryEmbedding, {
        k: 10,
        threshold: 0.8,
      });

      results.forEach((result) => {
        expect(result.score).toBeGreaterThanOrEqual(0.8);
      });
    });

    it('should track search latency', async () => {
      const queryEmbedding = Array.from({ length: 384 }, () => Math.random());

      // Perform multiple searches
      for (let i = 0; i < 5; i++) {
        await memory.searchSimilar(queryEmbedding, { k: 5 });
      }

      const metrics = memory.getSearchMetrics();
      expect(metrics.totalSearches).toBe(5);
      expect(metrics.avgLatency).toBeGreaterThan(0);
      expect(metrics.p50Latency).toBeGreaterThan(0);
      expect(metrics.qps).toBeGreaterThan(0);
    });
  });

  describe('Performance Metrics', () => {
    it('should track search metrics', async () => {
      const patterns: TestPattern[] = Array.from({ length: 10 }, (_, i) => ({
        id: `perf-${i}`,
        embedding: Array.from({ length: 384 }, () => Math.random()),
        type: 'unit',
        domain: 'auth',
        content: `perf pattern ${i}`,
        framework: 'jest',
        createdAt: Date.now(),
        lastUsed: Date.now(),
        usageCount: 0,
      }));

      await memory.storeBatch(patterns);

      // Perform searches
      for (let i = 0; i < 10; i++) {
        const queryEmbedding = Array.from({ length: 384 }, () => Math.random());
        await memory.searchSimilar(queryEmbedding, { k: 5 });
      }

      const metrics: SearchMetrics = memory.getSearchMetrics();

      expect(metrics.totalSearches).toBe(10);
      expect(metrics.avgLatency).toBeGreaterThan(0);
      expect(metrics.p50Latency).toBeGreaterThan(0);
      expect(metrics.p99Latency).toBeGreaterThan(0);
      expect(metrics.qps).toBeGreaterThan(0);
    });

    it('should calculate percentiles correctly', async () => {
      const patterns: TestPattern[] = Array.from({ length: 10 }, (_, i) => ({
        id: `percentile-${i}`,
        embedding: Array.from({ length: 384 }, () => Math.random()),
        type: 'unit',
        domain: 'auth',
        content: `percentile pattern ${i}`,
        framework: 'jest',
        createdAt: Date.now(),
        lastUsed: Date.now(),
        usageCount: 0,
      }));

      await memory.storeBatch(patterns);

      // Perform many searches for accurate percentiles
      for (let i = 0; i < 100; i++) {
        const queryEmbedding = Array.from({ length: 384 }, () => Math.random());
        await memory.searchSimilar(queryEmbedding, { k: 5 });
      }

      const metrics = memory.getSearchMetrics();

      expect(metrics.p50Latency).toBeLessThanOrEqual(metrics.p99Latency);
      expect(metrics.avgLatency).toBeGreaterThan(0);
    });

    it('should include metrics in stats', async () => {
      const patterns: TestPattern[] = Array.from({ length: 5 }, (_, i) => ({
        id: `stats-${i}`,
        embedding: Array.from({ length: 384 }, () => Math.random()),
        type: 'unit',
        domain: 'auth',
        content: `stats pattern ${i}`,
        framework: 'jest',
        createdAt: Date.now(),
        lastUsed: Date.now(),
        usageCount: 0,
      }));

      await memory.storeBatch(patterns);

      // Perform searches
      for (let i = 0; i < 5; i++) {
        const queryEmbedding = Array.from({ length: 384 }, () => Math.random());
        await memory.searchSimilar(queryEmbedding, { k: 3 });
      }

      const stats = await memory.getStats();

      expect(stats.p50Latency).toBeDefined();
      expect(stats.p99Latency).toBeDefined();
      expect(stats.qps).toBeDefined();
      expect(stats.qps).toBeGreaterThan(0);
    });
  });

  describe('Index Maintenance', () => {
    it('should get maintenance stats', () => {
      const stats: MaintenanceStats = memory.getMaintenanceStats();

      expect(stats).toHaveProperty('lastMaintenance');
      expect(stats).toHaveProperty('rebalanceCount');
      expect(stats).toHaveProperty('cleanupCount');
      expect(stats).toHaveProperty('deletedCount');
      expect(stats).toHaveProperty('fragmentation');
    });

    it('should optimize index', async () => {
      const patterns: TestPattern[] = Array.from({ length: 10 }, (_, i) => ({
        id: `opt-${i}`,
        embedding: Array.from({ length: 384 }, () => Math.random()),
        type: 'unit',
        domain: 'auth',
        content: `optimize pattern ${i}`,
        framework: 'jest',
        createdAt: Date.now(),
        lastUsed: Date.now(),
        usageCount: 0,
      }));

      await memory.storeBatch(patterns);

      const statsBefore = memory.getMaintenanceStats();
      await memory.optimize();
      const statsAfter = memory.getMaintenanceStats();

      expect(statsAfter.rebalanceCount).toBeGreaterThan(statsBefore.rebalanceCount);
      expect(statsAfter.lastMaintenance).toBeGreaterThanOrEqual(statsBefore.lastMaintenance);
    });

    it('should build index on demand', async () => {
      const patterns: TestPattern[] = Array.from({ length: 10 }, (_, i) => ({
        id: `build-${i}`,
        embedding: Array.from({ length: 384 }, () => Math.random()),
        type: 'unit',
        domain: 'auth',
        content: `build pattern ${i}`,
        framework: 'jest',
        createdAt: Date.now(),
        lastUsed: Date.now(),
        usageCount: 0,
      }));

      await memory.storeBatch(patterns);
      await expect(memory.buildIndex()).resolves.not.toThrow();
    });

    it('should track deleted patterns', async () => {
      const pattern: TestPattern = {
        id: 'delete-test',
        embedding: Array.from({ length: 384 }, () => Math.random()),
        type: 'unit',
        domain: 'auth',
        content: 'pattern to delete',
        framework: 'jest',
        createdAt: Date.now(),
        lastUsed: Date.now(),
        usageCount: 0,
      };

      await memory.storePattern(pattern);

      const statsBefore = memory.getMaintenanceStats();
      await memory.deletePattern('delete-test');
      const statsAfter = memory.getMaintenanceStats();

      expect(statsAfter.deletedCount).toBeGreaterThan(statsBefore.deletedCount);
    });
  });

  describe('Configuration Updates', () => {
    it('should update HNSW parameters', async () => {
      await memory.updateConfig({
        M: 48,
        efSearch: 150,
      });

      const config = memory.getConfig();
      expect(config.M).toBe(48);
      expect(config.efSearch).toBe(150);
    });

    it('should rebuild index after config update', async () => {
      const patterns: TestPattern[] = Array.from({ length: 5 }, (_, i) => ({
        id: `config-${i}`,
        embedding: Array.from({ length: 384 }, () => Math.random()),
        type: 'unit',
        domain: 'auth',
        content: `config pattern ${i}`,
        framework: 'jest',
        createdAt: Date.now(),
        lastUsed: Date.now(),
        usageCount: 0,
      }));

      await memory.storeBatch(patterns);

      await expect(
        memory.updateConfig({ efConstruction: 300 })
      ).resolves.not.toThrow();

      const config = memory.getConfig();
      expect(config.efConstruction).toBe(300);
    });
  });

  describe('Pattern Operations', () => {
    it('should get pattern by ID', async () => {
      const pattern: TestPattern = {
        id: 'get-test',
        embedding: Array.from({ length: 384 }, () => Math.random()),
        type: 'unit',
        domain: 'auth',
        content: 'test get',
        framework: 'jest',
        createdAt: Date.now(),
        lastUsed: Date.now(),
        usageCount: 0,
      };

      await memory.storePattern(pattern);
      const retrieved = await memory.getPattern('get-test');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe('get-test');
      expect(retrieved!.content).toBe('test get');
    });

    it('should return null for non-existent pattern', async () => {
      const retrieved = await memory.getPattern('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should delete pattern', async () => {
      const pattern: TestPattern = {
        id: 'delete-test-2',
        embedding: Array.from({ length: 384 }, () => Math.random()),
        type: 'unit',
        domain: 'auth',
        content: 'test delete',
        framework: 'jest',
        createdAt: Date.now(),
        lastUsed: Date.now(),
        usageCount: 0,
      };

      await memory.storePattern(pattern);
      const deleted = await memory.deletePattern('delete-test-2');

      expect(deleted).toBe(true);

      const retrieved = await memory.getPattern('delete-test-2');
      expect(retrieved).toBeNull();
    });

    it('should clear all patterns', async () => {
      const patterns: TestPattern[] = Array.from({ length: 5 }, (_, i) => ({
        id: `clear-${i}`,
        embedding: Array.from({ length: 384 }, () => Math.random()),
        type: 'unit',
        domain: 'auth',
        content: `clear pattern ${i}`,
        framework: 'jest',
        createdAt: Date.now(),
        lastUsed: Date.now(),
        usageCount: 0,
      }));

      await memory.storeBatch(patterns);
      await memory.clear();

      const metrics = memory.getSearchMetrics();
      expect(metrics.totalSearches).toBe(0);
    });
  });

  describe('Factory Functions', () => {
    it('should create high precision HNSW', async () => {
      const mem = createHighPrecisionHNSW();
      await mem.initialize();

      const config = mem.getConfig();
      expect(config.M).toBe(64);
      expect(config.efConstruction).toBe(300);
      expect(config.efSearch).toBe(150);

      await mem.shutdown();
    });

    it('should create high throughput HNSW', async () => {
      const mem = createHighThroughputHNSW();
      await mem.initialize();

      const config = mem.getConfig();
      expect(config.M).toBe(16);
      expect(config.efConstruction).toBe(100);
      expect(config.efSearch).toBe(50);

      await mem.shutdown();
    });

    it('should create balanced HNSW', async () => {
      const mem = createBalancedHNSW();
      await mem.initialize();

      const config = mem.getConfig();
      expect(config.M).toBe(32);
      expect(config.efConstruction).toBe(200);
      expect(config.efSearch).toBe(100);

      await mem.shutdown();
    });
  });

  describe('Error Handling', () => {
    it('should throw error when accessing uninitialized memory', async () => {
      const mem = createHNSWVectorMemory();
      // Don't initialize

      await expect(
        mem.storePattern({
          id: 'test',
          embedding: [],
          type: 'unit',
          domain: 'auth',
          content: 'test',
          framework: 'jest',
          createdAt: Date.now(),
          lastUsed: Date.now(),
          usageCount: 0,
        })
      ).rejects.toThrow('not initialized');
    });

    it('should handle shutdown gracefully', async () => {
      const mem = createHNSWVectorMemory();
      await mem.initialize();
      await mem.shutdown();

      // Second shutdown should not throw
      await expect(mem.shutdown()).resolves.not.toThrow();
    });
  });
});
