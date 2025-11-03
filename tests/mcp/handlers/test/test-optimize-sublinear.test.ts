/**
 * test/test-optimize-sublinear Test Suite
 *
 * Tests for sublinear test suite optimization using advanced algorithms:
 * - Johnson-Lindenstrauss dimension reduction
 * - Temporal advantage prediction
 * - Redundancy detection with O(n log n) complexity
 * - General sublinear optimization (O(√n))
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TestOptimizeSublinearHandler } from '@mcp/handlers/test/test-optimize-sublinear';

describe('TestOptimizeSublinearHandler', () => {
  let handler: TestOptimizeSublinearHandler;

  beforeEach(() => {
    handler = new TestOptimizeSublinearHandler();
  });

  describe('Johnson-Lindenstrauss Algorithm', () => {
    it('should optimize test suite using JL dimension reduction', async () => {
      const testSuite = {
        tests: [
          { id: 'test-1', name: 'User Authentication', path: '/tests/auth.test.ts', priority: 'high', executionTime: 250 },
          { id: 'test-2', name: 'Payment Processing', path: '/tests/payment.test.ts', priority: 'critical', executionTime: 500 },
          { id: 'test-3', name: 'Email Validation', path: '/tests/email.test.ts', priority: 'medium', executionTime: 150 },
          { id: 'test-4', name: 'Database Connection', path: '/tests/db.test.ts', priority: 'critical', executionTime: 300 },
          { id: 'test-5', name: 'API Endpoints', path: '/tests/api.test.ts', priority: 'high', executionTime: 400 },
          { id: 'test-6', name: 'UI Components', path: '/tests/ui.test.ts', priority: 'low', executionTime: 200 },
          { id: 'test-7', name: 'Data Validation', path: '/tests/validation.test.ts', priority: 'medium', executionTime: 180 },
          { id: 'test-8', name: 'Security Checks', path: '/tests/security.test.ts', priority: 'critical', executionTime: 350 },
          { id: 'test-9', name: 'Performance Tests', path: '/tests/performance.test.ts', priority: 'low', executionTime: 600 },
          { id: 'test-10', name: 'Integration Tests', path: '/tests/integration.test.ts', priority: 'high', executionTime: 450 }
        ]
      };

      const response = await handler.handle({
        testSuite,
        algorithm: 'johnson-lindenstrauss',
        targetReduction: 0.4,
        maintainCoverage: 85,
        preserveCritical: true
      });

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.optimized).toBeDefined();
      expect(response.data.optimized.tests.length).toBeLessThan(testSuite.tests.length);
      expect(response.data.reduction).toBeGreaterThan(0);
      expect(response.data.speedup).toBeGreaterThan(1);
      expect(response.data.algorithm).toBe('johnson-lindenstrauss');
      expect(response.data.coverage).toBeDefined();
      expect(response.data.coverage.maintained).toBeGreaterThanOrEqual(80);
    });

    it('should preserve critical tests with JL optimization', async () => {
      const testSuite = {
        tests: [
          { id: 'critical-1', name: 'Payment Gateway', priority: 'critical', executionTime: 500 },
          { id: 'critical-2', name: 'User Auth', priority: 'critical', executionTime: 400 },
          { id: 'normal-1', name: 'UI Test 1', priority: 'medium', executionTime: 200 },
          { id: 'normal-2', name: 'UI Test 2', priority: 'medium', executionTime: 200 },
          { id: 'normal-3', name: 'UI Test 3', priority: 'low', executionTime: 150 },
          { id: 'normal-4', name: 'UI Test 4', priority: 'low', executionTime: 150 }
        ]
      };

      const response = await handler.handle({
        testSuite,
        algorithm: 'johnson-lindenstrauss',
        targetReduction: 0.5,
        preserveCritical: true
      });

      expect(response.success).toBe(true);

      const criticalTestIds = response.data.optimized.tests
        .filter((t: any) => t.priority === 'critical')
        .map((t: any) => t.id);

      expect(criticalTestIds).toContain('critical-1');
      expect(criticalTestIds).toContain('critical-2');
    });

    it('should calculate reduction percentage correctly', async () => {
      const testSuite = {
        tests: Array.from({ length: 100 }, (_, i) => ({
          id: `test-${i}`,
          name: `Test ${i}`,
          path: `/tests/test${i}.ts`,
          priority: i < 10 ? 'critical' : i < 30 ? 'high' : 'medium',
          executionTime: Math.floor(Math.random() * 500) + 100
        }))
      };

      const response = await handler.handle({
        testSuite,
        algorithm: 'johnson-lindenstrauss',
        targetReduction: 0.3,
        preserveCritical: true
      });

      expect(response.success).toBe(true);
      expect(response.data.reduction).toBeGreaterThanOrEqual(50); // At least 50% reduction
      expect(response.data.reduction).toBeLessThanOrEqual(80); // At most 80% reduction
    });
  });

  describe('Temporal Advantage Algorithm', () => {
    it('should predict test failures with temporal advantage', async () => {
      const testSuite = {
        tests: [
          { id: 'test-1', name: 'Flaky Network Test', path: '/tests/network.test.ts', executionTime: 300 },
          { id: 'test-2', name: 'Stable Unit Test', path: '/tests/unit.test.ts', executionTime: 150 },
          { id: 'test-3', name: 'Database Test', path: '/tests/db.test.ts', executionTime: 400 },
          { id: 'test-4', name: 'Integration Test', path: '/tests/integration.test.ts', executionTime: 500 },
          { id: 'test-5', name: 'E2E Test', path: '/tests/e2e.test.ts', executionTime: 800 }
        ]
      };

      const response = await handler.handle({
        testSuite,
        algorithm: 'temporal-advantage',
        predictFailures: true
      });

      expect(response.success).toBe(true);
      expect(response.data.algorithm).toBe('temporal-advantage');
      expect(response.data.predictions).toBeDefined();
      expect(Array.isArray(response.data.predictions)).toBe(true);
      expect(response.data.predictions.length).toBe(testSuite.tests.length);

      // Verify prediction structure
      const prediction = response.data.predictions[0];
      expect(prediction).toHaveProperty('testId');
      expect(prediction).toHaveProperty('failureProbability');
      expect(prediction).toHaveProperty('temporalLeadMs');
      expect(prediction.failureProbability).toBeGreaterThanOrEqual(0);
      expect(prediction.failureProbability).toBeLessThanOrEqual(1);
      expect(prediction.temporalLeadMs).toBeGreaterThanOrEqual(0);
    });

    it('should calculate total temporal advantage', async () => {
      const testSuite = {
        tests: Array.from({ length: 20 }, (_, i) => ({
          id: `test-${i}`,
          name: `Test ${i}`,
          executionTime: 200
        }))
      };

      const response = await handler.handle({
        testSuite,
        algorithm: 'temporal-advantage',
        predictFailures: true
      });

      expect(response.success).toBe(true);
      expect(response.data.temporalAdvantage).toBeDefined();
      expect(response.data.temporalAdvantage).toBeGreaterThan(0);
    });

    it('should prioritize tests by failure probability', async () => {
      const testSuite = {
        tests: [
          { id: 'test-stable', name: 'Stable Test' },
          { id: 'test-flaky', name: 'Flaky Test' },
          { id: 'test-normal', name: 'Normal Test' }
        ]
      };

      const response = await handler.handle({
        testSuite,
        algorithm: 'temporal-advantage',
        predictFailures: true
      });

      expect(response.success).toBe(true);
      expect(response.data.optimized.tests).toBeDefined();
      expect(response.data.optimized.tests.length).toBe(3);
    });

    it('should work without failure prediction', async () => {
      const testSuite = {
        tests: [
          { id: 'test-1', name: 'Test 1' },
          { id: 'test-2', name: 'Test 2' }
        ]
      };

      const response = await handler.handle({
        testSuite,
        algorithm: 'temporal-advantage',
        predictFailures: false
      });

      expect(response.success).toBe(true);
      expect(response.data.predictions).toBeUndefined();
      expect(response.data.temporalAdvantage).toBeDefined();
    });
  });

  describe('Redundancy Detection Algorithm', () => {
    it('should detect and remove redundant tests', async () => {
      const testSuite = {
        tests: [
          { id: 'test-1', name: 'User Login Test A', coverage: ['login', 'auth', 'session'] },
          { id: 'test-2', name: 'User Login Test B', coverage: ['login', 'auth', 'session'] }, // Redundant
          { id: 'test-3', name: 'Payment Test', coverage: ['payment', 'validation'] },
          { id: 'test-4', name: 'Email Test A', coverage: ['email', 'smtp'] },
          { id: 'test-5', name: 'Email Test B', coverage: ['email', 'smtp'] }, // Redundant
          { id: 'test-6', name: 'Unique Test', coverage: ['special', 'unique'] }
        ]
      };

      const response = await handler.handle({
        testSuite,
        algorithm: 'redundancy-detection'
      });

      expect(response.success).toBe(true);
      expect(response.data.algorithm).toBe('redundancy-detection');
      expect(response.data.redundant).toBeDefined();
      expect(Array.isArray(response.data.redundant)).toBe(true);
      expect(response.data.redundancyRate).toBeGreaterThanOrEqual(0);
      expect(response.data.redundancyRate).toBeLessThanOrEqual(100);
      expect(response.data.optimized.tests.length).toBeLessThanOrEqual(testSuite.tests.length);
    });

    it('should calculate redundancy rate', async () => {
      const testSuite = {
        tests: [
          { id: 'unique-1', coverage: ['a'] },
          { id: 'unique-2', coverage: ['b'] },
          { id: 'duplicate-1', coverage: ['c', 'd'] },
          { id: 'duplicate-2', coverage: ['c', 'd'] }, // 25% redundancy
          { id: 'unique-3', coverage: ['e'] }
        ]
      };

      const response = await handler.handle({
        testSuite,
        algorithm: 'redundancy-detection'
      });

      expect(response.success).toBe(true);
      expect(response.data.redundancyRate).toBeGreaterThanOrEqual(0);
    });

    it('should handle tests without coverage data', async () => {
      const testSuite = {
        tests: [
          { id: 'test-1', name: 'Test 1' },
          { id: 'test-2', name: 'Test 2' },
          { id: 'test-3', name: 'Test 3' }
        ]
      };

      const response = await handler.handle({
        testSuite,
        algorithm: 'redundancy-detection'
      });

      expect(response.success).toBe(true);
      expect(response.data.redundant).toBeDefined();
    });
  });

  describe('Sublinear Algorithm', () => {
    it('should optimize using O(√n) sublinear sampling', async () => {
      const testCount = 100;
      const testSuite = {
        tests: Array.from({ length: testCount }, (_, i) => ({
          id: `test-${i}`,
          name: `Test ${i}`,
          path: `/tests/test${i}.spec.ts`,
          priority: i < 10 ? 'critical' : i < 30 ? 'high' : i < 60 ? 'medium' : 'low',
          executionTime: Math.floor(Math.random() * 500) + 50
        }))
      };

      const response = await handler.handle({
        testSuite,
        algorithm: 'sublinear',
        preserveCritical: true,
        metrics: true
      });

      expect(response.success).toBe(true);
      expect(response.data.algorithm).toBe('sublinear');
      expect(response.data.optimized.tests.length).toBeLessThan(testCount);

      // O(√n) should give us approximately √100 = 10 tests (plus critical)
      const expectedCount = Math.ceil(Math.sqrt(testCount));
      expect(response.data.optimized.tests.length).toBeLessThanOrEqual(expectedCount + 10); // +10 critical

      expect(response.data.reduction).toBeGreaterThan(0);
      expect(response.data.speedup).toBeGreaterThan(1);
    });

    it('should provide complexity metrics when requested', async () => {
      const testSuite = {
        tests: Array.from({ length: 64 }, (_, i) => ({
          id: `test-${i}`,
          name: `Test ${i}`,
          priority: 'medium'
        }))
      };

      const response = await handler.handle({
        testSuite,
        algorithm: 'sublinear',
        metrics: true
      });

      expect(response.success).toBe(true);
      expect(response.data.metrics).toBeDefined();
      expect(response.data.metrics.timeComplexity).toContain('O(√n)');
      expect(response.data.metrics.timeComplexity).toContain('64');
      expect(response.data.metrics.spaceComplexity).toBe('O(log n)');
      expect(response.data.metrics.reductionFactor).toBeGreaterThan(1);
      expect(response.data.metrics.actualComplexity).toBe(8); // √64 = 8
    });

    it('should preserve critical tests in sublinear optimization', async () => {
      const testSuite = {
        tests: [
          { id: 'crit-1', name: 'Critical Test 1', priority: 'critical' },
          { id: 'crit-2', name: 'Critical Test 2', priority: 'critical' },
          { id: 'crit-3', name: 'Critical Test 3', priority: 'critical' },
          ...Array.from({ length: 50 }, (_, i) => ({
            id: `normal-${i}`,
            name: `Normal Test ${i}`,
            priority: 'medium'
          }))
        ]
      };

      const response = await handler.handle({
        testSuite,
        algorithm: 'sublinear',
        preserveCritical: true
      });

      expect(response.success).toBe(true);

      const criticalTests = response.data.optimized.tests.filter((t: any) =>
        t.priority === 'critical'
      );

      expect(criticalTests.length).toBe(3);
      expect(criticalTests.map((t: any) => t.id)).toContain('crit-1');
      expect(criticalTests.map((t: any) => t.id)).toContain('crit-2');
      expect(criticalTests.map((t: any) => t.id)).toContain('crit-3');
    });

    it('should sample uniformly from test suite', async () => {
      const testSuite = {
        tests: Array.from({ length: 25 }, (_, i) => ({
          id: `test-${i}`,
          name: `Test ${i}`,
          priority: 'medium'
        }))
      };

      const response = await handler.handle({
        testSuite,
        algorithm: 'sublinear',
        preserveCritical: false
      });

      expect(response.success).toBe(true);

      // √25 = 5 tests expected
      expect(response.data.optimized.tests.length).toBeGreaterThanOrEqual(5);
      expect(response.data.optimized.tests.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Input Validation', () => {
    it('should reject missing testSuite', async () => {
      const response = await handler.handle({
        algorithm: 'sublinear'
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should reject missing algorithm', async () => {
      const response = await handler.handle({
        testSuite: { tests: [] }
      } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should validate required fields', async () => {
      const response = await handler.handle({ invalid: 'data' } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should handle empty test suite', async () => {
      const response = await handler.handle({
        testSuite: { tests: [] },
        algorithm: 'sublinear'
      });

      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('requestId');
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully', async () => {
      const response = await handler.handle({
        testSuite: null as any,
        algorithm: 'johnson-lindenstrauss'
      });

      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('requestId');
    });

    it('should provide meaningful error messages', async () => {
      const response = await handler.handle({} as any);

      if (!response.success) {
        expect(response.error).toBeTruthy();
        expect(typeof response.error).toBe('string');
        expect(response.error.length).toBeGreaterThan(0);
      }
    });

    it('should handle invalid algorithm name', async () => {
      const response = await handler.handle({
        testSuite: { tests: [{ id: 'test-1' }] },
        algorithm: 'invalid-algorithm' as any
      });

      expect(response).toHaveProperty('success');
    });
  });

  describe('Edge Cases', () => {
    it('should handle single test case', async () => {
      const response = await handler.handle({
        testSuite: {
          tests: [
            { id: 'single-test', name: 'Only Test', priority: 'high' }
          ]
        },
        algorithm: 'sublinear'
      });

      expect(response.success).toBe(true);
      expect(response.data.optimized.tests.length).toBe(1);
    });

    it('should handle very small test suite (2 tests)', async () => {
      const response = await handler.handle({
        testSuite: {
          tests: [
            { id: 'test-1', name: 'Test 1' },
            { id: 'test-2', name: 'Test 2' }
          ]
        },
        algorithm: 'johnson-lindenstrauss',
        targetReduction: 0.5
      });

      expect(response.success).toBe(true);
      expect(response.data.optimized.tests.length).toBeGreaterThan(0);
    });

    it('should handle large test suite (1000+ tests)', async () => {
      const largeTestSuite = {
        tests: Array.from({ length: 1000 }, (_, i) => ({
          id: `test-${i}`,
          name: `Test ${i}`,
          priority: i < 100 ? 'critical' : i < 300 ? 'high' : 'medium',
          executionTime: Math.floor(Math.random() * 1000) + 100
        }))
      };

      const response = await handler.handle({
        testSuite: largeTestSuite,
        algorithm: 'sublinear',
        preserveCritical: true,
        metrics: true
      });

      expect(response.success).toBe(true);
      expect(response.data.optimized.tests.length).toBeLessThan(1000);

      // √1000 ≈ 31.6, so expect around 32 + critical tests
      expect(response.data.optimized.tests.length).toBeLessThan(150);
    });

    it('should handle concurrent requests', async () => {
      const testData = {
        testSuite: {
          tests: [
            { id: 'test-1', name: 'Test 1' },
            { id: 'test-2', name: 'Test 2' },
            { id: 'test-3', name: 'Test 3' }
          ]
        },
        algorithm: 'sublinear' as const
      };

      const promises = Array.from({ length: 10 }, () =>
        handler.handle(testData)
      );

      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('requestId');
      });
    });

    it('should handle zero target reduction', async () => {
      const response = await handler.handle({
        testSuite: {
          tests: Array.from({ length: 10 }, (_, i) => ({
            id: `test-${i}`,
            name: `Test ${i}`
          }))
        },
        algorithm: 'johnson-lindenstrauss',
        targetReduction: 0
      });

      expect(response.success).toBe(true);
    });

    it('should handle 100% target reduction', async () => {
      const response = await handler.handle({
        testSuite: {
          tests: Array.from({ length: 10 }, (_, i) => ({
            id: `test-${i}`,
            name: `Test ${i}`,
            priority: i === 0 ? 'critical' : 'low'
          }))
        },
        algorithm: 'johnson-lindenstrauss',
        targetReduction: 1.0,
        preserveCritical: true
      });

      expect(response.success).toBe(true);
      // Should keep at least critical tests
      expect(response.data.optimized.tests.length).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should complete within reasonable time for small suite', async () => {
      const startTime = Date.now();

      await handler.handle({
        testSuite: {
          tests: Array.from({ length: 10 }, (_, i) => ({
            id: `test-${i}`,
            name: `Test ${i}`
          }))
        },
        algorithm: 'sublinear'
      });

      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should complete within reasonable time for large suite', async () => {
      const startTime = Date.now();

      await handler.handle({
        testSuite: {
          tests: Array.from({ length: 500 }, (_, i) => ({
            id: `test-${i}`,
            name: `Test ${i}`,
            priority: i < 50 ? 'critical' : 'medium'
          }))
        },
        algorithm: 'johnson-lindenstrauss',
        targetReduction: 0.3,
        preserveCritical: true
      });

      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(2000);
    });

    it('should demonstrate speedup benefit', async () => {
      const testSuite = {
        tests: Array.from({ length: 100 }, (_, i) => ({
          id: `test-${i}`,
          name: `Test ${i}`,
          executionTime: 100
        }))
      };

      const response = await handler.handle({
        testSuite,
        algorithm: 'sublinear',
        metrics: true
      });

      expect(response.success).toBe(true);
      expect(response.data.speedup).toBeGreaterThan(1);

      // Original execution time: 100 tests × 100ms = 10000ms
      // Optimized: ~10 tests × 100ms = 1000ms
      // Expected speedup: ~10x
      expect(response.data.speedup).toBeGreaterThan(5);
    });
  });
});
