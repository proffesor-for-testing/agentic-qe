/**
 * MinCutPartitioner Unit Tests
 *
 * Tests the MinCut-based test partitioning algorithm for:
 * - Basic partitioning functionality
 * - Dependency handling
 * - Load balancing
 * - Edge cases
 * - Performance characteristics
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { MinCutPartitioner, partitionTests } from '../../../../src/test/partition/MinCutPartitioner.js';
import { TestFile, PartitionConfig, DEFAULT_PARTITION_CONFIG } from '../../../../src/test/partition/types.js';
import { createSeededRandom } from '../../../../src/utils/SeededRandom';

// Test fixtures
function createTestFile(
  path: string,
  duration: number,
  deps: string[] = [],
  dependents: string[] = [],
  options: Partial<TestFile> = {}
): TestFile {
  return {
    path,
    estimatedDuration: duration,
    dependencies: deps,
    dependents,
    flakinessScore: options.flakinessScore ?? 0,
    priority: options.priority ?? 'medium',
    tags: options.tags,
  };
}

describe('MinCutPartitioner', () => {
  let partitioner: MinCutPartitioner;

  beforeEach(() => {
    partitioner = new MinCutPartitioner({ partitionCount: 2 });
  });

  describe('basic functionality', () => {
    it('should create a partitioner with default config', () => {
      const defaultPartitioner = new MinCutPartitioner();
      const config = defaultPartitioner.getConfig();

      expect(config.partitionCount).toBe(DEFAULT_PARTITION_CONFIG.partitionCount);
      expect(config.maxImbalance).toBe(DEFAULT_PARTITION_CONFIG.maxImbalance);
    });

    it('should create a partitioner with custom config', () => {
      const customPartitioner = new MinCutPartitioner({
        partitionCount: 8,
        maxImbalance: 0.2,
      });
      const config = customPartitioner.getConfig();

      expect(config.partitionCount).toBe(8);
      expect(config.maxImbalance).toBe(0.2);
    });

    it('should handle empty test array', async () => {
      const result = await partitioner.partition([]);

      expect(result.partitions).toHaveLength(0);
      expect(result.algorithm).toBe('mincut');
      expect(result.estimatedSpeedup).toBe(1);
    });

    it('should handle single test', async () => {
      const tests = [createTestFile('test1.ts', 100)];
      const result = await partitioner.partition(tests);

      expect(result.partitions).toHaveLength(1);
      expect(result.partitions[0].tests).toHaveLength(1);
      expect(result.partitions[0].tests[0].path).toBe('test1.ts');
    });

    it('should handle fewer tests than partitions', async () => {
      const partitioner4 = new MinCutPartitioner({ partitionCount: 4 });
      const tests = [
        createTestFile('test1.ts', 100),
        createTestFile('test2.ts', 200),
      ];

      const result = await partitioner4.partition(tests);

      expect(result.partitions.length).toBeLessThanOrEqual(4);
      expect(result.partitions.every(p => p.tests.length >= 1)).toBe(true);
    });
  });

  describe('partitioning without dependencies', () => {
    it('should use duration-balanced partitioning when no dependencies', async () => {
      const tests = [
        createTestFile('test1.ts', 100),
        createTestFile('test2.ts', 200),
        createTestFile('test3.ts', 300),
        createTestFile('test4.ts', 400),
      ];

      const result = await partitioner.partition(tests);

      expect(result.algorithm).toBe('duration-balanced');
      expect(result.partitions).toHaveLength(2);
      expect(result.totalCrossPartitionDeps).toBe(0);
    });

    it('should balance durations across partitions', async () => {
      const tests = [
        createTestFile('test1.ts', 100),
        createTestFile('test2.ts', 100),
        createTestFile('test3.ts', 100),
        createTestFile('test4.ts', 100),
      ];

      const result = await partitioner.partition(tests);

      const durations = result.partitions.map(p => p.estimatedDuration);
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);

      // With equal durations, partitions should be balanced
      expect(maxDuration - minDuration).toBeLessThanOrEqual(100);
    });
  });

  describe('partitioning with dependencies', () => {
    it('should use mincut algorithm when dependencies exist', async () => {
      const tests = [
        createTestFile('test1.ts', 100, ['test2.ts']),
        createTestFile('test2.ts', 100, [], ['test1.ts']),
        createTestFile('test3.ts', 100, ['test4.ts']),
        createTestFile('test4.ts', 100, [], ['test3.ts']),
      ];

      const result = await partitioner.partition(tests);

      expect(result.algorithm).toBe('mincut');
      expect(result.partitions).toHaveLength(2);
    });

    it('should minimize cross-partition dependencies', async () => {
      // Tests 1-2 are strongly coupled, tests 3-4 are strongly coupled
      const tests = [
        createTestFile('test1.ts', 100, ['test2.ts']),
        createTestFile('test2.ts', 100, ['test1.ts']),
        createTestFile('test3.ts', 100, ['test4.ts']),
        createTestFile('test4.ts', 100, ['test3.ts']),
      ];

      const result = await partitioner.partition(tests);

      // Optimal partition: {test1, test2} and {test3, test4}
      // This should have 0 cross-partition dependencies
      expect(result.totalCrossPartitionDeps).toBeLessThanOrEqual(2);
    });

    it('should keep related tests together', async () => {
      const tests = [
        createTestFile('auth/login.test.ts', 100, ['auth/utils.test.ts'], [], { tags: ['auth'] }),
        createTestFile('auth/utils.test.ts', 100, [], ['auth/login.test.ts'], { tags: ['auth'] }),
        createTestFile('db/query.test.ts', 100, ['db/connect.test.ts'], [], { tags: ['db'] }),
        createTestFile('db/connect.test.ts', 100, [], ['db/query.test.ts'], { tags: ['db'] }),
      ];

      const result = await partitioner.partition(tests);

      // Related tests (auth together, db together) should minimize cross-deps
      expect(result.totalCrossPartitionDeps).toBeLessThanOrEqual(2);
    });
  });

  describe('partition quality metrics', () => {
    it('should calculate load balance score', async () => {
      const tests = [
        createTestFile('test1.ts', 100),
        createTestFile('test2.ts', 100),
        createTestFile('test3.ts', 100),
        createTestFile('test4.ts', 100),
      ];

      const result = await partitioner.partition(tests);

      // Perfect balance should give score close to 1
      expect(result.loadBalanceScore).toBeGreaterThan(0.8);
    });

    it('should estimate speedup', async () => {
      const tests = [
        createTestFile('test1.ts', 100),
        createTestFile('test2.ts', 100),
        createTestFile('test3.ts', 100),
        createTestFile('test4.ts', 100),
      ];

      const result = await partitioner.partition(tests);

      // With 2 partitions and balanced load, speedup should be close to 2x
      expect(result.estimatedSpeedup).toBeGreaterThan(1.5);
      expect(result.estimatedSpeedup).toBeLessThanOrEqual(2.5);
    });

    it('should track computation time', async () => {
      const tests = [
        createTestFile('test1.ts', 100),
        createTestFile('test2.ts', 100),
      ];

      const result = await partitioner.partition(tests);

      expect(result.computationTimeMs).toBeGreaterThan(0);
      expect(result.computationTimeMs).toBeLessThan(1000); // Should be fast for small inputs
    });
  });

  describe('multi-partition (k > 2)', () => {
    it('should create multiple partitions via recursive bisection', async () => {
      const rng = createSeededRandom(14300);
      const partitioner4 = new MinCutPartitioner({ partitionCount: 4 });
      const tests = Array.from({ length: 20 }, (_, i) =>
        createTestFile(`test${i}.ts`, rng.random() * 100 + 50)
      );

      const result = await partitioner4.partition(tests);

      expect(result.partitions).toHaveLength(4);
      expect(result.partitions.every(p => p.tests.length > 0)).toBe(true);
    });

    it('should balance partitions when using recursive bisection', async () => {
      const partitioner4 = new MinCutPartitioner({ partitionCount: 4 });
      const tests = Array.from({ length: 16 }, (_, i) =>
        createTestFile(`test${i}.ts`, 100) // Equal durations
      );

      const result = await partitioner4.partition(tests);

      // Each partition should have roughly 4 tests
      const sizes = result.partitions.map(p => p.tests.length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(2);
    });
  });

  describe('priority handling', () => {
    it('should keep critical tests with their dependencies', async () => {
      const tests = [
        createTestFile('critical.test.ts', 100, ['helper.test.ts'], [], { priority: 'critical' }),
        createTestFile('helper.test.ts', 100, [], ['critical.test.ts']),
        createTestFile('other1.test.ts', 100),
        createTestFile('other2.test.ts', 100),
      ];

      const result = await partitioner.partition(tests);

      // Find which partition has the critical test
      const criticalPartition = result.partitions.find(p =>
        p.tests.some(t => t.path === 'critical.test.ts')
      );

      // Helper should be in same partition due to dependency and critical priority weight
      expect(criticalPartition?.tests.some(t => t.path === 'helper.test.ts')).toBe(true);
    });
  });

  describe('flaky test handling', () => {
    it('should group flaky tests together for isolation', async () => {
      const tests = [
        createTestFile('flaky1.test.ts', 100, ['flaky2.test.ts'], [], { flakinessScore: 0.5 }),
        createTestFile('flaky2.test.ts', 100, ['flaky1.test.ts'], [], { flakinessScore: 0.5 }),
        createTestFile('stable1.test.ts', 100),
        createTestFile('stable2.test.ts', 100),
      ];

      const result = await partitioner.partition(tests);

      // Flaky tests should be in the same partition
      const flakyPartition = result.partitions.find(p =>
        p.tests.some(t => t.path === 'flaky1.test.ts')
      );

      expect(flakyPartition?.tests.some(t => t.path === 'flaky2.test.ts')).toBe(true);
    });
  });

  describe('convenience function', () => {
    it('should work with partitionTests helper', async () => {
      const tests = [
        createTestFile('test1.ts', 100),
        createTestFile('test2.ts', 200),
        createTestFile('test3.ts', 300),
        createTestFile('test4.ts', 400),
      ];

      const result = await partitionTests(tests, { partitionCount: 2 });

      expect(result.partitions).toHaveLength(2);
      expect(result.algorithm).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle tests with circular dependencies', async () => {
      const tests = [
        createTestFile('a.test.ts', 100, ['b.test.ts']),
        createTestFile('b.test.ts', 100, ['c.test.ts']),
        createTestFile('c.test.ts', 100, ['a.test.ts']),
        createTestFile('d.test.ts', 100),
      ];

      const result = await partitioner.partition(tests);

      expect(result.partitions).toHaveLength(2);
      // All tests should be assigned
      const totalTests = result.partitions.reduce((sum, p) => sum + p.tests.length, 0);
      expect(totalTests).toBe(4);
    });

    it('should handle very unbalanced durations', async () => {
      const tests = [
        createTestFile('slow.test.ts', 10000),
        createTestFile('fast1.test.ts', 10),
        createTestFile('fast2.test.ts', 10),
        createTestFile('fast3.test.ts', 10),
      ];

      const result = await partitioner.partition(tests);

      // One partition gets the slow test, others get fast tests
      expect(result.partitions).toHaveLength(2);
      // Load balance will be poor due to extreme duration difference
      // With greedy duration-balanced: slow test in one, 3 fast in other = (10000, 30) durations
      // Avg = 5015, parallel efficiency = 5015/10000 = ~0.5
      expect(result.loadBalanceScore).toBeLessThanOrEqual(0.55);
    });

    it('should handle dependencies to non-existent tests', async () => {
      const tests = [
        createTestFile('test1.ts', 100, ['nonexistent.ts']), // Dependency doesn't exist in test set
        createTestFile('test2.ts', 100),
        createTestFile('test3.ts', 100),
        createTestFile('test4.ts', 100),
      ];

      const result = await partitioner.partition(tests);

      expect(result.partitions).toHaveLength(2);
      // Should not crash, just ignore non-existent dependencies
      const totalTests = result.partitions.reduce((sum, p) => sum + p.tests.length, 0);
      expect(totalTests).toBe(4);
    });
  });

  describe('performance', () => {
    it('should partition 100 tests in under 500ms', async () => {
      const rng = createSeededRandom(14301);
      const tests = Array.from({ length: 100 }, (_, i) => {
        const deps = i > 0 ? [`test${Math.floor(rng.random() * i)}.ts`] : [];
        return createTestFile(`test${i}.ts`, rng.random() * 100 + 10, deps);
      });

      const partitioner4 = new MinCutPartitioner({ partitionCount: 4 });
      const start = performance.now();
      const result = await partitioner4.partition(tests);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(500);
      expect(result.partitions).toHaveLength(4);
    });

    it('should partition 200 tests in under 2000ms', async () => {
      const rng = createSeededRandom(14302);
      // 200 tests with sparse dependencies (10% chance) is a realistic workload
      // O(V³) algorithm: 200³ = 8M operations vs 500³ = 125M operations
      const tests = Array.from({ length: 200 }, (_, i) => {
        const deps = i > 0 && rng.random() < 0.1 ? [`test${Math.floor(rng.random() * i)}.ts`] : [];
        return createTestFile(`test${i}.ts`, rng.random() * 100 + 10, deps);
      });

      const partitioner8 = new MinCutPartitioner({ partitionCount: 8, timeout: 10000 });
      const start = performance.now();
      const result = await partitioner8.partition(tests);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(2000);
      expect(result.partitions).toHaveLength(8);
    });
  });
});
