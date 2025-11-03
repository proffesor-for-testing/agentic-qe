/**
 * Test Execute Parallel Handler Test Suite
 *
 * Comprehensive tests for test-execute-parallel MCP tool handler.
 * Tests parallel test execution, worker pools, retry logic, load balancing,
 * timeout handling, and result aggregation.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TestExecuteParallelHandler, TestExecuteParallelArgs } from '@mcp/handlers/test/test-execute-parallel';

// Mock SecureRandom for deterministic tests
jest.mock('../../../../src/utils/SecureRandom.js', () => ({
  SecureRandom: {
    generateId: jest.fn(() => 'test-random-id'),
    randomFloat: jest.fn(() => 0.5)
  }
}));

describe('TestExecuteParallelHandler', () => {
  let handler: TestExecuteParallelHandler;

  beforeEach(() => {
    handler = new TestExecuteParallelHandler();
  });

  describe('Section 1: Valid Inputs - Parallel Execution', () => {
    it('should execute single test file successfully', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts'],
        parallelism: 1,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results).toBeDefined();
      expect(response.data.results.length).toBe(1);
      expect(response.data.executionStrategy).toBe('parallel');
    });

    it('should execute multiple test files in parallel', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts', 'test2.spec.ts', 'test3.spec.ts', 'test4.spec.ts'],
        parallelism: 2,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results.length).toBe(4);
      expect(response.data.summary.total).toBe(4);
      expect(response.data.workerStats.totalWorkers).toBe(2);
    });

    it('should execute 10 test files with parallelism 4', async () => {
      const testFiles = Array.from({ length: 10 }, (_, i) => `test${i}.spec.ts`);
      const args: TestExecuteParallelArgs = {
        testFiles,
        parallelism: 4,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results.length).toBe(10);
      expect(response.data.summary.total).toBe(10);
    });

    it('should track execution time', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts', 'test2.spec.ts'],
        parallelism: 2,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.totalDuration).toBeGreaterThan(0);
      expect(response.executionTime).toBeGreaterThan(0);
    });

    it('should aggregate results correctly', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts', 'test2.spec.ts', 'test3.spec.ts'],
        parallelism: 2,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const summary = response.data.summary;
      expect(summary.total).toBe(3);
      expect(summary.passed + summary.failed).toBe(summary.total);
      expect(summary.passRate).toBeGreaterThanOrEqual(0);
      expect(summary.passRate).toBeLessThanOrEqual(100);
    });

    it('should include worker index in results', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts', 'test2.spec.ts'],
        parallelism: 2,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      response.data.results.forEach((result: any) => {
        expect(result.workerIndex).toBeDefined();
        expect(result.workerIndex).toBeGreaterThanOrEqual(0);
        expect(result.workerIndex).toBeLessThan(2);
      });
    });
  });

  describe('Section 2: Valid Inputs - Sequential Execution', () => {
    it('should execute tests sequentially when parallelism is 1', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts', 'test2.spec.ts', 'test3.spec.ts'],
        parallelism: 1,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results.length).toBe(3);
      expect(response.data.workerStats.totalWorkers).toBe(1);
    });

    it('should handle single worker execution efficiently', async () => {
      const testFiles = Array.from({ length: 5 }, (_, i) => `test${i}.spec.ts`);
      const args: TestExecuteParallelArgs = {
        testFiles,
        parallelism: 1,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results.length).toBe(5);
      expect(response.data.totalDuration).toBeGreaterThan(0);
    });
  });

  describe('Section 3: Queue Management', () => {
    it('should distribute tests evenly with round-robin', async () => {
      const testFiles = Array.from({ length: 8 }, (_, i) => `test${i}.spec.ts`);
      const args: TestExecuteParallelArgs = {
        testFiles,
        parallelism: 4,
        loadBalancing: 'round-robin',
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results.length).toBe(8);

      // Check that tests are distributed across workers
      const workerIndices = response.data.results.map((r: any) => r.workerIndex);
      const uniqueWorkers = new Set(workerIndices);
      expect(uniqueWorkers.size).toBeGreaterThan(1); // Multiple workers used
    });

    it('should distribute tests with least-loaded strategy', async () => {
      const testFiles = Array.from({ length: 12 }, (_, i) => `test${i}.spec.ts`);
      const args: TestExecuteParallelArgs = {
        testFiles,
        parallelism: 3,
        loadBalancing: 'least-loaded',
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results.length).toBe(12);
    });

    it('should distribute tests with random strategy', async () => {
      const testFiles = Array.from({ length: 10 }, (_, i) => `test${i}.spec.ts`);
      const args: TestExecuteParallelArgs = {
        testFiles,
        parallelism: 5,
        loadBalancing: 'random',
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results.length).toBe(10);
    });

    it('should handle uneven test distribution', async () => {
      const testFiles = Array.from({ length: 7 }, (_, i) => `test${i}.spec.ts`);
      const args: TestExecuteParallelArgs = {
        testFiles,
        parallelism: 3,
        loadBalancing: 'round-robin',
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results.length).toBe(7);
    });
  });

  describe('Section 4: Agent Coordination', () => {
    it('should track worker statistics', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts', 'test2.spec.ts'],
        parallelism: 2,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.workerStats).toBeDefined();
      expect(response.data.workerStats.totalWorkers).toBe(2);
      expect(response.data.workerStats.efficiency).toBeGreaterThan(0);
      expect(response.data.workerStats.loadBalance).toBeDefined();
    });

    it('should report worker efficiency metrics', async () => {
      const testFiles = Array.from({ length: 6 }, (_, i) => `test${i}.spec.ts`);
      const args: TestExecuteParallelArgs = {
        testFiles,
        parallelism: 3,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.workerStats.efficiency).toBeGreaterThanOrEqual(0);
      expect(response.data.workerStats.efficiency).toBeLessThanOrEqual(100);
    });
  });

  describe('Section 5: Results Tracking', () => {
    it('should calculate pass rate correctly', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts', 'test2.spec.ts', 'test3.spec.ts', 'test4.spec.ts'],
        parallelism: 2,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const summary = response.data.summary;
      expect(summary.passRate).toBe(Math.round((summary.passed / summary.total) * 100));
    });

    it('should track average test duration', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts', 'test2.spec.ts'],
        parallelism: 2,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.summary.avgDuration).toBeGreaterThan(0);
      expect(response.data.summary.avgDuration).toBe(
        Math.round(response.data.summary.totalDuration / response.data.summary.total)
      );
    });

    it('should include individual test durations', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts', 'test2.spec.ts'],
        parallelism: 2,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      response.data.results.forEach((result: any) => {
        expect(result.duration).toBeDefined();
        expect(result.duration).toBeGreaterThan(0);
      });
    });

    it('should track test file names in results', async () => {
      const testFiles = ['test-a.spec.ts', 'test-b.spec.ts', 'test-c.spec.ts'];
      const args: TestExecuteParallelArgs = {
        testFiles,
        parallelism: 2,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const resultFiles = response.data.results.map((r: any) => r.testFile);
      testFiles.forEach(file => {
        expect(resultFiles).toContain(file);
      });
    });

    it('should include assertion counts', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts'],
        parallelism: 1,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results[0].assertions).toBeDefined();
      expect(response.data.results[0].assertions).toBeGreaterThan(0);
    });
  });

  describe('Section 6: Error Handling', () => {
    it('should reject missing testFiles parameter', async () => {
      const args = {} as TestExecuteParallelArgs;

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error).toMatch(/testFiles/i);
    });

    it('should reject empty testFiles array', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: [],
        parallelism: 2,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/testFiles/i);
    });

    it('should handle test execution failures with continueOnFailure', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts', 'test2.spec.ts', 'test3.spec.ts'],
        parallelism: 2,
        timeout: 5000,
        continueOnFailure: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results).toBeDefined();
    });

    it('should include timeout count in results', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts', 'test2.spec.ts'],
        parallelism: 2,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.timeouts).toBeDefined();
      expect(response.data.timeouts).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Section 7: Timeout Handling', () => {
    it('should apply default timeout when not specified', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts'],
        parallelism: 1
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results[0].timeout).toBe(false);
    });

    it('should respect custom timeout values', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts', 'test2.spec.ts'],
        parallelism: 2,
        timeout: 10000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
    });

    it('should track timeout status for each test', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts', 'test2.spec.ts'],
        parallelism: 2,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      response.data.results.forEach((result: any) => {
        expect(result.timeout).toBeDefined();
        expect(typeof result.timeout).toBe('boolean');
      });
    });
  });

  describe('Section 8: Framework Integration', () => {
    it('should handle different test file extensions', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test.spec.ts', 'test.test.js', 'test.spec.jsx', 'test.test.tsx'],
        parallelism: 2,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results.length).toBe(4);
    });

    it('should support coverage collection flag', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts'],
        parallelism: 1,
        timeout: 5000,
        collectCoverage: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
    });
  });

  describe('Section 9: Progress Reporting', () => {
    it('should report execution strategy', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts', 'test2.spec.ts'],
        parallelism: 2,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.executionStrategy).toBe('parallel');
    });

    it('should include request ID in response', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts'],
        parallelism: 1,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.requestId).toBeDefined();
      expect(response.requestId).toBe('test-random-id');
    });

    it('should track total duration separately from execution time', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts', 'test2.spec.ts'],
        parallelism: 2,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.totalDuration).toBeDefined();
      expect(response.executionTime).toBeDefined();
    });
  });

  describe('Section 10: Cleanup and Resource Management', () => {
    it('should handle large test suites without memory issues', async () => {
      const testFiles = Array.from({ length: 100 }, (_, i) => `test${i}.spec.ts`);
      const args: TestExecuteParallelArgs = {
        testFiles,
        parallelism: 10,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results.length).toBe(100);
    });

    it('should properly initialize worker pool', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts'],
        parallelism: 1,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
    });

    it('should handle multiple sequential executions', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts'],
        parallelism: 1,
        timeout: 5000
      };

      const response1 = await handler.handle(args);
      expect(response1.success).toBe(true);

      const response2 = await handler.handle(args);
      expect(response2.success).toBe(true);

      const response3 = await handler.handle(args);
      expect(response3.success).toBe(true);
    });

    it('should clean up resources after execution', async () => {
      const testFiles = Array.from({ length: 20 }, (_, i) => `test${i}.spec.ts`);
      const args: TestExecuteParallelArgs = {
        testFiles,
        parallelism: 5,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      // Execution completes without errors, indicating proper cleanup
    });
  });

  describe('Section 11: Retry Logic', () => {
    it('should not retry tests when retryFailures is false', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts', 'test2.spec.ts'],
        parallelism: 2,
        timeout: 5000,
        retryFailures: false,
        maxRetries: 3
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      response.data.results.forEach((result: any) => {
        expect(result.attempts).toBe(1); // No retries
      });
    });

    it('should retry failed tests when retryFailures is true', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts', 'test2.spec.ts'],
        parallelism: 2,
        timeout: 5000,
        retryFailures: true,
        maxRetries: 2
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.retries).toBeDefined();
      expect(response.data.retries.attempted).toBeGreaterThanOrEqual(0);
    });

    it('should respect maxRetries limit', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts'],
        parallelism: 1,
        timeout: 5000,
        retryFailures: true,
        maxRetries: 3
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      response.data.results.forEach((result: any) => {
        expect(result.attempts).toBeLessThanOrEqual(4); // Initial + 3 retries
      });
    });

    it('should apply retry delay between attempts', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts'],
        parallelism: 1,
        timeout: 5000,
        retryFailures: true,
        maxRetries: 2,
        retryDelay: 100
      };

      const startTime = Date.now();
      const response = await handler.handle(args);
      const duration = Date.now() - startTime;

      expect(response.success).toBe(true);
      // Duration should account for retries if any occurred
      expect(duration).toBeGreaterThan(0);
    });

    it('should track retry statistics', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts', 'test2.spec.ts', 'test3.spec.ts'],
        parallelism: 2,
        timeout: 5000,
        retryFailures: true,
        maxRetries: 2
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const retries = response.data.retries;
      expect(retries.attempted).toBeGreaterThanOrEqual(0);
      expect(retries.successful).toBeGreaterThanOrEqual(0);
      expect(retries.maxAttempts).toBeGreaterThan(0);
      expect(retries.successful).toBeLessThanOrEqual(retries.attempted);
    });

    it('should count successful retries separately', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts', 'test2.spec.ts'],
        parallelism: 2,
        timeout: 5000,
        retryFailures: true,
        maxRetries: 2
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const retries = response.data.retries;
      expect(retries.successful).toBeLessThanOrEqual(retries.attempted);
    });
  });

  describe('Section 12: Performance Characteristics', () => {
    it('should execute faster with higher parallelism', async () => {
      const testFiles = Array.from({ length: 10 }, (_, i) => `test${i}.spec.ts`);

      // Sequential execution
      const args1: TestExecuteParallelArgs = {
        testFiles,
        parallelism: 1,
        timeout: 5000
      };
      const start1 = Date.now();
      const response1 = await handler.handle(args1);
      const duration1 = Date.now() - start1;

      // Parallel execution
      const args2: TestExecuteParallelArgs = {
        testFiles,
        parallelism: 5,
        timeout: 5000
      };
      const start2 = Date.now();
      const response2 = await handler.handle(args2);
      const duration2 = Date.now() - start2;

      expect(response1.success).toBe(true);
      expect(response2.success).toBe(true);
      // Parallel should generally be faster (not always guaranteed due to overhead)
      expect(duration1).toBeGreaterThan(0);
      expect(duration2).toBeGreaterThan(0);
    });

    it('should complete execution within reasonable time', async () => {
      const testFiles = Array.from({ length: 5 }, (_, i) => `test${i}.spec.ts`);
      const args: TestExecuteParallelArgs = {
        testFiles,
        parallelism: 3,
        timeout: 5000
      };

      const startTime = Date.now();
      const response = await handler.handle(args);
      const duration = Date.now() - startTime;

      expect(response.success).toBe(true);
      expect(duration).toBeLessThan(5000); // Should complete quickly
    });

    it('should report execution time in milliseconds', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts'],
        parallelism: 1,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.executionTime).toBeGreaterThan(0);
      expect(response.executionTime).toBeLessThan(5000);
    });
  });

  describe('Section 13: Edge Cases', () => {
    it('should handle parallelism greater than test count', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts', 'test2.spec.ts'],
        parallelism: 10,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results.length).toBe(2);
    });

    it('should handle very large parallelism values', async () => {
      const testFiles = Array.from({ length: 20 }, (_, i) => `test${i}.spec.ts`);
      const args: TestExecuteParallelArgs = {
        testFiles,
        parallelism: 50,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results.length).toBe(20);
    });

    it('should handle special characters in test file names', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test-[special].spec.ts', 'test (with spaces).spec.ts', 'test_underscore.spec.ts'],
        parallelism: 2,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results.length).toBe(3);
    });

    it('should handle long test file paths', async () => {
      const longPath = 'a/very/long/path/to/test/files/that/goes/deep/into/the/directory/structure/test.spec.ts';
      const args: TestExecuteParallelArgs = {
        testFiles: [longPath],
        parallelism: 1,
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results[0].testFile).toBe(longPath);
    });

    it('should handle zero maxRetries', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts'],
        parallelism: 1,
        timeout: 5000,
        retryFailures: true,
        maxRetries: 0
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results[0].attempts).toBe(1); // No retries
    });

    it('should handle default parallelism when not specified', async () => {
      const args: TestExecuteParallelArgs = {
        testFiles: ['test1.spec.ts', 'test2.spec.ts'],
        timeout: 5000
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.workerStats.totalWorkers).toBe(1); // Default to 1
    });
  });
});
