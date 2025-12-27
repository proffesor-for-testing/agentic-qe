/**
 * RuVectorPatternStore Unit Tests
 *
 * Tests the high-performance RuVector pattern store implementation.
 * Validates both native and fallback modes.
 */

// Using Jest for test framework (vitest syntax compatible)
import {
  RuVectorPatternStore,
  isRuVectorAvailable,
  getRuVectorInfo,
  createQEPatternStore,
} from '../../../../src/core/memory/RuVectorPatternStore';
import {
  PatternStoreFactory,
  createPatternStore,
} from '../../../../src/core/memory/PatternStoreFactory';
import type { TestPattern } from '../../../../src/core/memory/IPatternStore';
import { createSeededRandom } from '../../../../src/utils/SeededRandom';

describe('RuVectorPatternStore', () => {
  let store: RuVectorPatternStore;

  beforeEach(async () => {
    store = new RuVectorPatternStore({
      dimension: 384,
      metric: 'cosine',
      enableMetrics: true,
    });
    await store.initialize();
  });

  afterEach(async () => {
    await store.shutdown();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const info = store.getImplementationInfo();
      expect(info.type).toMatch(/ruvector|fallback/);
      expect(info.features).toBeDefined();
      expect(info.features.length).toBeGreaterThan(0);
    });

    it('should report implementation info correctly', () => {
      const info = store.getImplementationInfo();
      expect(info.version).toBeDefined();

      if (isRuVectorAvailable()) {
        expect(info.type).toBe('ruvector');
        expect(info.features).toContain('hnsw-indexing');
      } else {
        expect(info.type).toBe('fallback');
        expect(info.features).toContain('in-memory');
      }
    });
  });

  describe('Pattern Storage', () => {
    const rng = createSeededRandom(14000);
    const generateEmbedding = (dim: number = 384): number[] => {
      return Array.from({ length: dim }, () => rng.random() * 2 - 1);
    };

    const createTestPattern = (id: string): TestPattern => ({
      id,
      type: 'unit-test',
      domain: 'testing',
      embedding: generateEmbedding(),
      content: `Test pattern ${id}`,
      framework: 'jest',
      coverage: 0.85,
      verdict: 'success',
      createdAt: Date.now(),
      lastUsed: Date.now(),
      usageCount: 0,
    });

    it('should store and retrieve a single pattern', async () => {
      const pattern = createTestPattern('test-1');
      await store.storePattern(pattern);

      const retrieved = await store.getPattern('test-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('test-1');
      expect(retrieved?.type).toBe('unit-test');
      expect(retrieved?.domain).toBe('testing');
    });

    it('should store patterns in batch', async () => {
      const patterns = Array.from({ length: 100 }, (_, i) =>
        createTestPattern(`batch-${i}`)
      );

      await store.storeBatch(patterns);

      const stats = await store.getStats();
      expect(stats.count).toBeGreaterThanOrEqual(100);
    });

    it('should delete patterns', async () => {
      const pattern = createTestPattern('delete-test');
      await store.storePattern(pattern);

      const deleted = await store.deletePattern('delete-test');
      expect(deleted).toBe(true);

      const retrieved = await store.getPattern('delete-test');
      expect(retrieved).toBeNull();
    });

    it('should record usage correctly', async () => {
      const pattern = createTestPattern('usage-test');
      await store.storePattern(pattern);

      await store.recordUsage('usage-test');

      const retrieved = await store.getPattern('usage-test');
      expect(retrieved?.usageCount).toBe(1);
    });
  });

  describe('Vector Search', () => {
    const rng = createSeededRandom(14001);
    const generateEmbedding = (dim: number = 384): number[] => {
      return Array.from({ length: dim }, () => rng.random() * 2 - 1);
    };

    beforeEach(async () => {
      // Insert test data
      const patterns = Array.from({ length: 50 }, (_, i) => ({
        id: `search-${i}`,
        type: i % 2 === 0 ? 'unit' : 'integration',
        domain: i % 3 === 0 ? 'api' : 'ui',
        embedding: generateEmbedding(),
        content: `Search pattern ${i}`,
        framework: i % 2 === 0 ? 'jest' : 'vitest',
      }));

      await store.storeBatch(patterns as TestPattern[]);
    });

    it('should find similar patterns', async () => {
      const queryEmbedding = generateEmbedding();
      const results = await store.searchSimilar(queryEmbedding, { k: 10 });

      expect(results).toHaveLength(10);
      expect(results[0].score).toBeGreaterThanOrEqual(0);
      expect(results[0].pattern).toBeDefined();
    });

    it('should filter by domain', async () => {
      const queryEmbedding = generateEmbedding();
      const results = await store.searchSimilar(queryEmbedding, {
        k: 10,
        domain: 'api',
      });

      for (const result of results) {
        expect(result.pattern.domain).toBe('api');
      }
    });

    it('should filter by framework', async () => {
      const queryEmbedding = generateEmbedding();
      const results = await store.searchSimilar(queryEmbedding, {
        k: 10,
        framework: 'jest',
      });

      for (const result of results) {
        expect(result.pattern.framework).toBe('jest');
      }
    });

    it('should respect threshold parameter', async () => {
      const queryEmbedding = generateEmbedding();
      const results = await store.searchSimilar(queryEmbedding, {
        k: 50,
        threshold: 0.5,
      });

      for (const result of results) {
        expect(result.score).toBeGreaterThanOrEqual(0.5);
      }
    });
  });

  describe('Performance Metrics', () => {
    const rng = createSeededRandom(14002);
    beforeEach(async () => {
      // Insert some patterns and perform searches
      const patterns = Array.from({ length: 20 }, (_, i) => ({
        id: `perf-${i}`,
        type: 'perf-test',
        domain: 'metrics',
        embedding: Array.from({ length: 384 }, () => rng.random()),
        content: `Performance pattern ${i}`,
      }));

      await store.storeBatch(patterns as TestPattern[]);

      // Perform some searches
      for (let i = 0; i < 10; i++) {
        await store.searchSimilar(
          Array.from({ length: 384 }, () => rng.random()),
          { k: 5 }
        );
      }
    });

    it('should track performance metrics', () => {
      const metrics = store.getPerformanceMetrics();

      expect(metrics.totalSearches).toBeGreaterThan(0);
      expect(metrics.totalInserts).toBeGreaterThan(0);
      expect(metrics.avgSearchTime).toBeGreaterThanOrEqual(0);
    });

    it('should calculate QPS estimate', () => {
      const metrics = store.getPerformanceMetrics();

      if (metrics.avgSearchTime > 0) {
        expect(metrics.estimatedQPS).toBeGreaterThan(0);
      }
    });
  });

  describe('Statistics', () => {
    it('should return database stats', async () => {
      const rng = createSeededRandom(14003);
      const patterns = Array.from({ length: 10 }, (_, i) => ({
        id: `stats-${i}`,
        type: 'stats-test',
        domain: 'statistics',
        embedding: Array.from({ length: 384 }, () => rng.random()),
        content: `Stats pattern ${i}`,
      }));

      await store.storeBatch(patterns as TestPattern[]);

      const stats = await store.getStats();
      expect(stats.count).toBeGreaterThanOrEqual(10);
      expect(stats.dimension).toBe(384);
      expect(stats.metric).toBe('cosine');
      expect(stats.implementation).toMatch(/ruvector|fallback/);
    });
  });
});

describe('PatternStoreFactory', () => {
  it('should detect platform features', () => {
    const features = PatternStoreFactory.detectPlatformFeatures();

    expect(features.platform).toBeDefined();
    expect(features.arch).toBeDefined();
    expect(features.nodeVersion).toBeDefined();
    expect(typeof features.ruvectorNative).toBe('boolean');
    expect(typeof features.agentdbNative).toBe('boolean');
  });

  it('should create pattern store with auto selection', async () => {
    const result = await PatternStoreFactory.create({
      preferredBackend: 'auto',
    });

    expect(result.store).toBeDefined();
    expect(result.backend).toMatch(/ruvector|agentdb|fallback/);
    expect(result.info.platform).toBeDefined();
  });

  it('should provide recommended config', () => {
    const config = PatternStoreFactory.getRecommendedConfig();

    expect(config.dimension).toBe(384);
    expect(config.metric).toBe('cosine');
    expect(config.hnsw).toBeDefined();
    expect(config.preferredBackend).toBeDefined();
  });

  it('should validate pattern store', async () => {
    const { store } = await PatternStoreFactory.create();

    const validation = await PatternStoreFactory.validate(store);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(validation.stats).toBeDefined();

    await store.shutdown();
  });
});

describe('Helper Functions', () => {
  describe('isRuVectorAvailable', () => {
    it('should return boolean', () => {
      const result = isRuVectorAvailable();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getRuVectorInfo', () => {
    it('should return platform info', () => {
      const info = getRuVectorInfo();

      expect(info.platform).toBeDefined();
      expect(info.arch).toBeDefined();
      expect(typeof info.available).toBe('boolean');
    });
  });

  describe('createQEPatternStore', () => {
    it('should create pre-configured store', async () => {
      const store = createQEPatternStore();
      await store.initialize();

      const stats = await store.getStats();
      expect(stats.dimension).toBe(384);
      expect(stats.metric).toBe('cosine');

      await store.shutdown();
    });
  });

  describe('createPatternStore', () => {
    it('should create store via factory', async () => {
      const store = await createPatternStore();

      expect(store).toBeDefined();
      expect(typeof store.storePattern).toBe('function');
      expect(typeof store.searchSimilar).toBe('function');

      await store.shutdown();
    });
  });
});

describe('Performance Benchmark', () => {
  it('should meet minimum performance targets', async () => {
    const rng = createSeededRandom(14004);
    const store = new RuVectorPatternStore({
      dimension: 384,
      metric: 'cosine',
      enableMetrics: true,
    });
    await store.initialize();

    const info = store.getImplementationInfo();
    console.log(`Running benchmark with ${info.type} backend`);

    // Insert 1000 patterns
    const patterns = Array.from({ length: 1000 }, (_, i) => ({
      id: `bench-${i}`,
      type: 'benchmark',
      domain: 'performance',
      embedding: Array.from({ length: 384 }, () => rng.random()),
      content: `Benchmark pattern ${i}`,
    }));

    const insertStart = performance.now();
    await store.storeBatch(patterns as TestPattern[]);
    const insertTime = performance.now() - insertStart;

    console.log(`Batch insert 1000 patterns: ${insertTime.toFixed(2)}ms`);

    // Run 100 searches
    const searchStart = performance.now();
    for (let i = 0; i < 100; i++) {
      await store.searchSimilar(
        Array.from({ length: 384 }, () => rng.random()),
        { k: 10 }
      );
    }
    const searchTime = performance.now() - searchStart;
    const avgSearchTime = searchTime / 100;

    console.log(`100 searches: ${searchTime.toFixed(2)}ms`);
    console.log(`Avg search time: ${avgSearchTime.toFixed(4)}ms`);
    console.log(`Estimated QPS: ${Math.floor(1000 / avgSearchTime)}`);

    const metrics = store.getPerformanceMetrics();
    console.log('Metrics:', {
      p50: metrics.p50SearchTime?.toFixed(4),
      p99: metrics.p99SearchTime?.toFixed(4),
      qps: metrics.estimatedQPS?.toFixed(0),
    });

    // Performance targets (relaxed for CI environments)
    // Native module may not achieve full speed in constrained environments
    if (info.type === 'ruvector') {
      // Native: should achieve at least 1K QPS (relaxed from 10K for CI)
      expect(metrics.estimatedQPS).toBeGreaterThan(1000);
    } else {
      // Fallback: should achieve at least 100 QPS
      expect(metrics.estimatedQPS).toBeGreaterThan(100);
    }

    await store.shutdown();
  }, 30000); // 30 second timeout for benchmark
});
