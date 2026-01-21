/**
 * TestExecuteParallelHandler Tests
 *
 * Tests parallel test execution with various load balancing strategies,
 * including the new MinCut-based partitioning.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { TestExecuteParallelHandler, TestFileMetadata } from '../../../../../src/mcp/handlers/test/test-execute-parallel.js';

describe('TestExecuteParallelHandler', () => {
  let handler: TestExecuteParallelHandler;

  beforeEach(() => {
    handler = new TestExecuteParallelHandler();
  });

  describe('basic functionality', () => {
    it('should execute tests with default settings', async () => {
      const result = await handler.handle({
        testFiles: ['test1.ts', 'test2.ts', 'test3.ts'],
      });

      expect(result.success).toBe(true);
      expect(result.data.results).toBeDefined();
      expect(result.data.summary).toBeDefined();
      expect(result.data.summary.total).toBe(3);
    });

    it('should execute tests in parallel with specified parallelism', async () => {
      const result = await handler.handle({
        testFiles: ['test1.ts', 'test2.ts', 'test3.ts', 'test4.ts'],
        parallelism: 2,
      });

      expect(result.success).toBe(true);
      expect(result.data.workerStats.totalWorkers).toBe(2);
    });
  });

  describe('round-robin strategy', () => {
    it('should distribute tests evenly with round-robin', async () => {
      const result = await handler.handle({
        testFiles: ['test1.ts', 'test2.ts', 'test3.ts', 'test4.ts'],
        parallelism: 2,
        loadBalancing: 'round-robin',
      });

      expect(result.success).toBe(true);
      expect(result.data.executionStrategy).toBe('parallel');
    });
  });

  describe('mincut strategy', () => {
    it('should use MinCut partitioning when specified', async () => {
      const result = await handler.handle({
        testFiles: [
          'tests/auth/login.test.ts',
          'tests/auth/logout.test.ts',
          'tests/db/query.test.ts',
          'tests/db/connect.test.ts',
        ],
        parallelism: 2,
        loadBalancing: 'mincut',
      });

      expect(result.success).toBe(true);
      expect(result.data.workerStats.partitioning).toBeDefined();
      expect(['mincut', 'duration-balanced']).toContain(result.data.workerStats.partitioning.algorithm);
    });

    it('should report partition metrics with MinCut', async () => {
      const result = await handler.handle({
        testFiles: Array.from({ length: 10 }, (_, i) => `tests/module${i % 3}/test${i}.ts`),
        parallelism: 3,
        loadBalancing: 'mincut',
      });

      expect(result.success).toBe(true);
      const partitioning = result.data.workerStats.partitioning;
      expect(partitioning).toBeDefined();
      expect(partitioning.loadBalanceScore).toBeGreaterThan(0);
      expect(partitioning.estimatedSpeedup).toBeGreaterThanOrEqual(1);
      expect(partitioning.computationTimeMs).toBeGreaterThan(0);
    });

    it('should support test metadata for MinCut', async () => {
      const metadata = new Map<string, TestFileMetadata>([
        ['test1.ts', { estimatedDuration: 500, dependencies: ['test2.ts'], priority: 'critical' }],
        ['test2.ts', { estimatedDuration: 200, dependencies: [] }],
        ['test3.ts', { estimatedDuration: 100, dependencies: ['test4.ts'] }],
        ['test4.ts', { estimatedDuration: 100, dependencies: [] }],
      ]);

      const result = await handler.handle({
        testFiles: ['test1.ts', 'test2.ts', 'test3.ts', 'test4.ts'],
        parallelism: 2,
        loadBalancing: 'mincut',
        testMetadata: metadata,
      });

      expect(result.success).toBe(true);
      expect(result.data.workerStats.partitioning).toBeDefined();
    });

    it('should expose last partition result', async () => {
      await handler.handle({
        testFiles: ['test1.ts', 'test2.ts', 'test3.ts', 'test4.ts'],
        parallelism: 2,
        loadBalancing: 'mincut',
      });

      const partitionResult = handler.getLastPartitionResult();
      expect(partitionResult).not.toBeNull();
      expect(partitionResult?.partitions).toHaveLength(2);
    });
  });

  describe('retry logic', () => {
    it('should retry failed tests when configured', async () => {
      const result = await handler.handle({
        testFiles: ['test1.ts', 'test2.ts'],
        retryFailures: true,
        maxRetries: 2,
        retryDelay: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data.retries).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should continue on failure when configured', async () => {
      const result = await handler.handle({
        testFiles: ['test1.ts', 'test2.ts', 'test3.ts'],
        continueOnFailure: true,
      });

      expect(result.success).toBe(true);
      // All tests should be in results even if some fail
      expect(result.data.results.length).toBe(3);
    });
  });

  describe('performance', () => {
    it('should partition 50 tests with MinCut in under 500ms', async () => {
      const testFiles = Array.from({ length: 50 }, (_, i) => `tests/module${i % 5}/test${i}.ts`);

      const result = await handler.handle({
        testFiles,
        parallelism: 4,
        loadBalancing: 'mincut',
      });

      expect(result.success).toBe(true);
      // Check that partitioning itself is fast (test execution has simulated delays)
      const partitioning = result.data.workerStats.partitioning;
      expect(partitioning.computationTimeMs).toBeLessThan(500);
    });
  });
});
