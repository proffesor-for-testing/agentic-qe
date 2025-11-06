/**
 * analysis/performance-benchmark-run-handler Test Suite
 *
 * Tests for performance benchmarking execution.
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PerformanceBenchmarkRunHandler, type PerformanceBenchmarkRunParams } from '@mcp/handlers/analysis/performance-benchmark-run-handler';

describe('PerformanceBenchmarkRunHandler', () => {
  let handler: PerformanceBenchmarkRunHandler;

  beforeEach(() => {
    handler = new PerformanceBenchmarkRunHandler();
  });

  describe('Happy Path', () => {
    it('should handle valid input successfully', async () => {
      const params: PerformanceBenchmarkRunParams = {
        benchmarkSuite: 'api-endpoints',
        iterations: 100,
        warmupIterations: 10
      };

      const response = await handler.handle(params);

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.suite).toBe('api-endpoints');
      expect(response.data.iterations).toBe(100);
    });

    it('should return expected data structure', async () => {
      const params: PerformanceBenchmarkRunParams = {
        benchmarkSuite: 'database-queries'
      };

      const response = await handler.handle(params);

      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('metadata');
      expect(response.metadata).toHaveProperty('requestId');
      expect(response.data).toHaveProperty('suite');
      expect(response.data).toHaveProperty('iterations');
      expect(response.data).toHaveProperty('averageTime');
      expect(response.data).toHaveProperty('medianTime');
      expect(response.data).toHaveProperty('minTime');
      expect(response.data).toHaveProperty('maxTime');
      expect(response.data).toHaveProperty('throughput');
      expect(response.data).toHaveProperty('standardDeviation');
      expect(response.data).toHaveProperty('completed');
      expect(response.data).toHaveProperty('failed');
    });

    it('should use default iterations when not specified', async () => {
      const params: PerformanceBenchmarkRunParams = {
        benchmarkSuite: 'memory-operations'
      };

      const response = await handler.handle(params);

      expect(response.success).toBe(true);
      expect(response.data.iterations).toBe(100);
    });

    it('should use default warmup iterations when not specified', async () => {
      const params: PerformanceBenchmarkRunParams = {
        benchmarkSuite: 'cpu-intensive-tasks',
        iterations: 50
      };

      const response = await handler.handle(params);

      expect(response.success).toBe(true);
    });

    it('should handle custom iterations and warmup', async () => {
      const params: PerformanceBenchmarkRunParams = {
        benchmarkSuite: 'complex-calculations',
        iterations: 500,
        warmupIterations: 50
      };

      const response = await handler.handle(params);

      expect(response.success).toBe(true);
      expect(response.data.iterations).toBe(500);
    });
  });

  describe('Input Validation', () => {
    it('should reject invalid input', async () => {
      const response = await handler.handle({} as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should validate required fields', async () => {
      const response = await handler.handle({ invalid: 'data' } as any);

      expect(response.success).toBe(false);
    });

    it('should handle missing benchmarkSuite', async () => {
      const response = await handler.handle({ iterations: 100 } as any);

      expect(response.success).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully', async () => {
      const response = await handler.handle({ benchmarkSuite: null } as any);

      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('metadata');
      expect(response.metadata).toHaveProperty('requestId');
    });

    it('should provide meaningful error messages', async () => {
      const response = await handler.handle({} as any);

      if (!response.success) {
        expect(response.error).toBeTruthy();
        expect(typeof response.error).toBe('string');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle minimal iterations', async () => {
      const params: PerformanceBenchmarkRunParams = {
        benchmarkSuite: 'quick-test',
        iterations: 1,
        warmupIterations: 0
      };

      const response = await handler.handle(params);

      expect(response).toHaveProperty('success');
    });

    it('should handle concurrent requests', async () => {
      const params: PerformanceBenchmarkRunParams = {
        benchmarkSuite: 'concurrent-suite',
        iterations: 50
      };

      const promises = Array.from({ length: 10 }, () =>
        handler.handle(params)
      );

      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('metadata');
        expect(result.metadata).toHaveProperty('requestId');
      });
    });

    it('should handle very large iteration counts', async () => {
      const params: PerformanceBenchmarkRunParams = {
        benchmarkSuite: 'stress-test',
        iterations: 10000,
        warmupIterations: 1000
      };

      const response = await handler.handle(params);

      expect(response).toHaveProperty('success');
    });

    it('should calculate performance metrics correctly', async () => {
      const params: PerformanceBenchmarkRunParams = {
        benchmarkSuite: 'metrics-validation',
        iterations: 100
      };

      const response = await handler.handle(params);

      if (response.success) {
        expect(response.data.averageTime).toBeGreaterThan(0);
        expect(response.data.minTime).toBeLessThanOrEqual(response.data.averageTime);
        expect(response.data.maxTime).toBeGreaterThanOrEqual(response.data.averageTime);
        expect(response.data.throughput).toBeGreaterThan(0);
        expect(response.data.standardDeviation).toBeGreaterThanOrEqual(0);
        expect(response.data.completed).toBe(params.iterations);
        expect(response.data.failed).toBe(0);
      }
    });
  });

  describe('Performance', () => {
    it('should complete within reasonable time', async () => {
      const params: PerformanceBenchmarkRunParams = {
        benchmarkSuite: 'timing-test',
        iterations: 100
      };

      const startTime = Date.now();
      await handler.handle(params);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(2000);
    });

    it('should report throughput metrics', async () => {
      const params: PerformanceBenchmarkRunParams = {
        benchmarkSuite: 'throughput-test',
        iterations: 200
      };

      const response = await handler.handle(params);

      if (response.success) {
        expect(response.data.throughput).toBeDefined();
        expect(typeof response.data.throughput).toBe('number');
      }
    });
  });
});
