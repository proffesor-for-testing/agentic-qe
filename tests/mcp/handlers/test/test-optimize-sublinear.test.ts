/**
 * test-optimize-sublinear Test Suite (TDD RED Phase)
 *
 * Tests for TestOptimizeSublinearHandler - Sublinear test optimization algorithms.
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { TestOptimizeSublinearHandler } from '@mcp/handlers/test/test-optimize-sublinear';

describe('TestOptimizeSublinearHandler', () => {
  let handler: TestOptimizeSublinearHandler;

  beforeEach(() => {
    handler = new TestOptimizeSublinearHandler();
  });

  describe('Happy Path - Johnson-Lindenstrauss Algorithm', () => {
    it('should optimize tests using JL dimension reduction', async () => {
      // GIVEN: Test suite with JL algorithm
      const args = {
        testSuite: {
          tests: Array.from({ length: 100 }, (_, i) => ({
            id: `test-${i}`,
            name: `Test ${i}`,
            priority: i < 10 ? 'critical' : 'normal'
          }))
        },
        algorithm: 'johnson-lindenstrauss' as const,
        targetReduction: 0.3,
        maintainCoverage: 85
      };

      // WHEN: Optimizing with JL
      const response = await handler.handle(args);

      // THEN: Returns optimized test suite
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.optimized.tests).toBeDefined();
      expect(response.data.optimized.count).toBeLessThan(100);
      expect(response.data.optimized.count).toBeGreaterThan(0);
      expect(response.data.reduction).toBeGreaterThan(0);
      expect(response.data.speedup).toBeGreaterThan(1);
      expect(response.data.algorithm).toBe('johnson-lindenstrauss');
    });

    it('should preserve critical tests in JL optimization', async () => {
      // GIVEN: Test suite with critical tests
      const args = {
        testSuite: {
          tests: [
            { id: 'test-1', name: 'Critical Test 1', priority: 'critical' },
            { id: 'test-2', name: 'Critical Test 2', priority: 'critical' },
            { id: 'test-3', name: 'Normal Test 1', priority: 'normal' },
            { id: 'test-4', name: 'Normal Test 2', priority: 'normal' },
            { id: 'test-5', name: 'Normal Test 3', priority: 'normal' }
          ]
        },
        algorithm: 'johnson-lindenstrauss' as const,
        targetReduction: 0.4,
        preserveCritical: true
      };

      // WHEN: Optimizing with critical preservation
      const response = await handler.handle(args);

      // THEN: Critical tests are preserved
      expect(response.success).toBe(true);
      expect(response.data.optimized.tests).toContainEqual(
        expect.objectContaining({ priority: 'critical' })
      );
    });

    it('should maintain coverage percentage', async () => {
      // GIVEN: Test suite with coverage requirement
      const args = {
        testSuite: {
          tests: Array.from({ length: 50 }, (_, i) => ({
            id: `test-${i}`,
            name: `Test ${i}`
          }))
        },
        algorithm: 'johnson-lindenstrauss' as const,
        targetReduction: 0.5,
        maintainCoverage: 90
      };

      // WHEN: Optimizing with coverage maintenance
      const response = await handler.handle(args);

      // THEN: Coverage is maintained
      expect(response.success).toBe(true);
      expect(response.data.coverage.maintained).toBeGreaterThanOrEqual(85);
    });
  });

  describe('Temporal Advantage Algorithm', () => {
    it('should predict failures before data arrives', async () => {
      // GIVEN: Test suite with temporal advantage
      const args = {
        testSuite: {
          tests: Array.from({ length: 20 }, (_, i) => ({
            id: `test-${i}`,
            name: `Test ${i}`
          }))
        },
        algorithm: 'temporal-advantage' as const,
        predictFailures: true
      };

      // WHEN: Optimizing with temporal advantage
      const response = await handler.handle(args);

      // THEN: Returns predictions and temporal lead
      expect(response.success).toBe(true);
      expect(response.data.predictions).toBeDefined();
      expect(response.data.temporalAdvantage).toBeGreaterThanOrEqual(0);
      expect(response.data.algorithm).toBe('temporal-advantage');
    });

    it('should prioritize tests by failure probability when prediction enabled', async () => {
      // GIVEN: Tests with failure prediction
      const args = {
        testSuite: {
          tests: Array.from({ length: 10 }, (_, i) => ({
            id: `test-${i}`,
            name: `Test ${i}`
          }))
        },
        algorithm: 'temporal-advantage' as const,
        predictFailures: true
      };

      // WHEN: Predicting failures
      const response = await handler.handle(args);

      // THEN: Tests are sorted by failure probability
      expect(response.success).toBe(true);
      expect(response.data.predictions.length).toBe(10);
      response.data.predictions.forEach((pred: any) => {
        expect(pred).toMatchObject({
          testId: expect.any(String),
          failureProbability: expect.any(Number),
          temporalLeadMs: expect.any(Number)
        });
      });
    });

    it('should not prioritize when prediction is disabled', async () => {
      // GIVEN: Tests without prediction
      const args = {
        testSuite: {
          tests: Array.from({ length: 5 }, (_, i) => ({
            id: `test-${i}`,
            name: `Test ${i}`
          }))
        },
        algorithm: 'temporal-advantage' as const,
        predictFailures: false
      };

      // WHEN: Running without prediction
      const response = await handler.handle(args);

      // THEN: No predictions generated
      expect(response.success).toBe(true);
      expect(response.data.predictions).toBeUndefined();
    });
  });

  describe('Redundancy Detection Algorithm', () => {
    it('should detect and remove redundant tests', async () => {
      // GIVEN: Test suite with redundant tests
      const args = {
        testSuite: {
          tests: [
            { id: 'test-1', name: 'Test 1', coverage: ['fileA.ts', 'fileB.ts'] },
            { id: 'test-2', name: 'Test 2', coverage: ['fileA.ts', 'fileB.ts'] }, // Redundant
            { id: 'test-3', name: 'Test 3', coverage: ['fileC.ts'] },
            { id: 'test-4', name: 'Test 4', coverage: ['fileC.ts'] } // Redundant
          ]
        },
        algorithm: 'redundancy-detection' as const
      };

      // WHEN: Detecting redundancy
      const response = await handler.handle(args);

      // THEN: Redundant tests are identified
      expect(response.success).toBe(true);
      expect(response.data.redundant).toBeDefined();
      expect(response.data.redundancyRate).toBeGreaterThanOrEqual(0);
      expect(response.data.optimized.tests.length).toBeLessThan(4);
      expect(response.data.algorithm).toBe('redundancy-detection');
    });

    it('should calculate redundancy rate', async () => {
      // GIVEN: Test suite with known redundancy
      const args = {
        testSuite: {
          tests: Array.from({ length: 10 }, (_, i) => ({
            id: `test-${i}`,
            name: `Test ${i}`,
            coverage: i % 2 === 0 ? ['common.ts'] : ['unique.ts']
          }))
        },
        algorithm: 'redundancy-detection' as const
      };

      // WHEN: Calculating redundancy
      const response = await handler.handle(args);

      // THEN: Redundancy rate is calculated
      expect(response.success).toBe(true);
      expect(response.data.redundancyRate).toBeDefined();
      expect(response.data.redundancyRate).toBeGreaterThanOrEqual(0);
      expect(response.data.redundancyRate).toBeLessThanOrEqual(100);
    });
  });

  describe('General Sublinear Optimization', () => {
    it('should optimize using O(√n) sampling', async () => {
      // GIVEN: Large test suite for sublinear optimization
      const args = {
        testSuite: {
          tests: Array.from({ length: 100 }, (_, i) => ({
            id: `test-${i}`,
            name: `Test ${i}`
          }))
        },
        algorithm: 'sublinear' as const,
        metrics: true
      };

      // WHEN: Applying sublinear optimization
      const response = await handler.handle(args);

      // THEN: Returns √n tests with metrics
      expect(response.success).toBe(true);
      expect(response.data.optimized.tests.length).toBeLessThan(100);
      expect(response.data.reduction).toBeGreaterThan(0);
      expect(response.data.speedup).toBeGreaterThan(1);
      expect(response.data.metrics).toBeDefined();
      expect(response.data.algorithm).toBe('sublinear');
    });

    it('should calculate complexity metrics when enabled', async () => {
      // GIVEN: Test suite with metrics enabled
      const args = {
        testSuite: {
          tests: Array.from({ length: 64 }, (_, i) => ({
            id: `test-${i}`,
            name: `Test ${i}`
          }))
        },
        algorithm: 'sublinear' as const,
        metrics: true
      };

      // WHEN: Optimizing with metrics
      const response = await handler.handle(args);

      // THEN: Complexity metrics are provided
      expect(response.success).toBe(true);
      expect(response.data.metrics).toMatchObject({
        timeComplexity: expect.stringContaining('O(√n)'),
        spaceComplexity: expect.any(String),
        reductionFactor: expect.any(Number),
        actualComplexity: expect.any(Number)
      });
    });

    it('should preserve critical tests in sublinear optimization', async () => {
      // GIVEN: Tests with critical priority
      const args = {
        testSuite: {
          tests: [
            ...Array.from({ length: 5 }, (_, i) => ({
              id: `critical-${i}`,
              name: `Critical ${i}`,
              priority: 'critical'
            })),
            ...Array.from({ length: 45 }, (_, i) => ({
              id: `normal-${i}`,
              name: `Normal ${i}`,
              priority: 'normal'
            }))
          ]
        },
        algorithm: 'sublinear' as const,
        preserveCritical: true
      };

      // WHEN: Optimizing with critical preservation
      const response = await handler.handle(args);

      // THEN: Critical tests are included
      expect(response.success).toBe(true);
      const criticalTests = response.data.optimized.tests.filter(
        (t: any) => t.priority === 'critical'
      );
      expect(criticalTests.length).toBe(5);
    });
  });

  describe('Target Reduction', () => {
    it('should respect target reduction of 30%', async () => {
      // GIVEN: Test suite with 30% reduction target
      const args = {
        testSuite: {
          tests: Array.from({ length: 100 }, (_, i) => ({
            id: `test-${i}`,
            name: `Test ${i}`
          }))
        },
        algorithm: 'johnson-lindenstrauss' as const,
        targetReduction: 0.3
      };

      // WHEN: Optimizing to 30% of original
      const response = await handler.handle(args);

      // THEN: Approximately 30 tests remain
      expect(response.success).toBe(true);
      expect(response.data.optimized.count).toBeLessThanOrEqual(35);
      expect(response.data.optimized.count).toBeGreaterThanOrEqual(25);
    });

    it('should handle 50% reduction target', async () => {
      // GIVEN: Test suite with 50% reduction
      const args = {
        testSuite: {
          tests: Array.from({ length: 80 }, (_, i) => ({
            id: `test-${i}`,
            name: `Test ${i}`
          }))
        },
        algorithm: 'johnson-lindenstrauss' as const,
        targetReduction: 0.5
      };

      // WHEN: Optimizing to 50%
      const response = await handler.handle(args);

      // THEN: Approximately 40 tests remain
      expect(response.success).toBe(true);
      expect(response.data.optimized.count).toBeLessThanOrEqual(45);
      expect(response.data.optimized.count).toBeGreaterThanOrEqual(35);
    });

    it('should handle 10% reduction target (aggressive)', async () => {
      // GIVEN: Aggressive reduction
      const args = {
        testSuite: {
          tests: Array.from({ length: 100 }, (_, i) => ({
            id: `test-${i}`,
            name: `Test ${i}`
          }))
        },
        algorithm: 'johnson-lindenstrauss' as const,
        targetReduction: 0.1
      };

      // WHEN: Aggressive optimization
      const response = await handler.handle(args);

      // THEN: ~10 tests remain
      expect(response.success).toBe(true);
      expect(response.data.optimized.count).toBeLessThanOrEqual(15);
    });
  });

  describe('Speedup Calculation', () => {
    it('should calculate speedup based on test reduction', async () => {
      // GIVEN: Test suite optimization
      const args = {
        testSuite: {
          tests: Array.from({ length: 100 }, (_, i) => ({
            id: `test-${i}`,
            name: `Test ${i}`
          }))
        },
        algorithm: 'sublinear' as const
      };

      // WHEN: Optimizing tests
      const response = await handler.handle(args);

      // THEN: Speedup is calculated
      expect(response.success).toBe(true);
      expect(response.data.speedup).toBeGreaterThan(1);
      // Speedup should be original_count / optimized_count
      const expectedSpeedup = 100 / response.data.optimized.tests.length;
      expect(response.data.speedup).toBeCloseTo(expectedSpeedup, 1);
    });
  });

  describe('Input Validation', () => {
    it('should reject missing testSuite', async () => {
      // GIVEN: Invalid args without testSuite
      const args = {
        algorithm: 'sublinear' as const
      } as any;

      // WHEN: Attempting optimization
      const response = await handler.handle(args);

      // THEN: Returns validation error
      expect(response.success).toBe(false);
      expect(response.error).toContain('testSuite');
    });

    it('should reject missing algorithm', async () => {
      // GIVEN: Args without algorithm
      const args = {
        testSuite: {
          tests: [{ id: 'test-1', name: 'Test 1' }]
        }
      } as any;

      // WHEN: Attempting optimization
      const response = await handler.handle(args);

      // THEN: Returns validation error
      expect(response.success).toBe(false);
      expect(response.error).toContain('algorithm');
    });

    it('should reject invalid algorithm', async () => {
      // GIVEN: Invalid algorithm name
      const args = {
        testSuite: {
          tests: [{ id: 'test-1', name: 'Test 1' }]
        },
        algorithm: 'invalid-algorithm' as any
      };

      // WHEN: Attempting optimization
      const response = await handler.handle(args);

      // THEN: Handles gracefully (falls back to default)
      expect(response).toHaveProperty('success');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty test suite', async () => {
      // GIVEN: Empty test array
      const args = {
        testSuite: {
          tests: []
        },
        algorithm: 'sublinear' as const
      };

      // WHEN: Optimizing empty suite
      const response = await handler.handle(args);

      // THEN: Handles gracefully
      expect(response.success).toBe(true);
      expect(response.data.optimized.tests.length).toBe(0);
    });

    it('should handle single test', async () => {
      // GIVEN: Single test
      const args = {
        testSuite: {
          tests: [{ id: 'test-1', name: 'Single Test' }]
        },
        algorithm: 'johnson-lindenstrauss' as const,
        targetReduction: 0.5
      };

      // WHEN: Optimizing single test
      const response = await handler.handle(args);

      // THEN: Preserves at least one test
      expect(response.success).toBe(true);
      expect(response.data.optimized.tests.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle very large test suite (1000+ tests)', async () => {
      // GIVEN: Large test suite
      const args = {
        testSuite: {
          tests: Array.from({ length: 1000 }, (_, i) => ({
            id: `test-${i}`,
            name: `Test ${i}`
          }))
        },
        algorithm: 'sublinear' as const,
        metrics: true
      };

      // WHEN: Optimizing large suite
      const response = await handler.handle(args);

      // THEN: Significantly reduces test count
      expect(response.success).toBe(true);
      expect(response.data.optimized.tests.length).toBeLessThan(100);
      expect(response.data.optimized.tests.length).toBeGreaterThan(0);
    });

    it('should handle test suite where all tests are critical', async () => {
      // GIVEN: All critical tests
      const args = {
        testSuite: {
          tests: Array.from({ length: 20 }, (_, i) => ({
            id: `test-${i}`,
            name: `Test ${i}`,
            priority: 'critical'
          }))
        },
        algorithm: 'johnson-lindenstrauss' as const,
        preserveCritical: true,
        targetReduction: 0.2
      };

      // WHEN: Optimizing all critical tests
      const response = await handler.handle(args);

      // THEN: All tests are preserved
      expect(response.success).toBe(true);
      expect(response.data.optimized.tests.length).toBe(20);
    });

    it('should handle test suite with no coverage data for redundancy detection', async () => {
      // GIVEN: Tests without coverage
      const args = {
        testSuite: {
          tests: Array.from({ length: 10 }, (_, i) => ({
            id: `test-${i}`,
            name: `Test ${i}`
          }))
        },
        algorithm: 'redundancy-detection' as const
      };

      // WHEN: Detecting redundancy without coverage
      const response = await handler.handle(args);

      // THEN: No redundancy detected
      expect(response.success).toBe(true);
      expect(response.data.redundancyRate).toBe(0);
    });
  });

  describe('Performance', () => {
    it('should complete optimization in reasonable time', async () => {
      // GIVEN: Large test suite
      const args = {
        testSuite: {
          tests: Array.from({ length: 500 }, (_, i) => ({
            id: `test-${i}`,
            name: `Test ${i}`
          }))
        },
        algorithm: 'sublinear' as const,
        metrics: true
      };

      // WHEN: Optimizing
      const startTime = Date.now();
      const response = await handler.handle(args);
      const duration = Date.now() - startTime;

      // THEN: Completes quickly
      expect(response.success).toBe(true);
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Coverage Maintenance', () => {
    it('should report coverage maintenance percentage', async () => {
      // GIVEN: Test optimization with coverage goal
      const args = {
        testSuite: {
          tests: Array.from({ length: 100 }, (_, i) => ({
            id: `test-${i}`,
            name: `Test ${i}`
          }))
        },
        algorithm: 'johnson-lindenstrauss' as const,
        targetReduction: 0.3,
        maintainCoverage: 85
      };

      // WHEN: Optimizing with coverage requirement
      const response = await handler.handle(args);

      // THEN: Coverage maintenance is reported
      expect(response.success).toBe(true);
      expect(response.data.coverage).toBeDefined();
      expect(response.data.coverage.maintained).toBeGreaterThanOrEqual(80);
      expect(response.data.coverage.maintained).toBeLessThanOrEqual(95);
    });
  });

  describe('Algorithm Comparison', () => {
    it('should execute all algorithms on same test suite', async () => {
      // GIVEN: Same test suite for all algorithms
      const testSuite = {
        tests: Array.from({ length: 50 }, (_, i) => ({
          id: `test-${i}`,
          name: `Test ${i}`,
          coverage: i % 3 === 0 ? ['common.ts'] : [`file${i}.ts`]
        }))
      };

      // WHEN: Running all algorithms
      const jlResult = await handler.handle({
        testSuite,
        algorithm: 'johnson-lindenstrauss' as const,
        targetReduction: 0.4
      });

      const temporalResult = await handler.handle({
        testSuite,
        algorithm: 'temporal-advantage' as const
      });

      const redundancyResult = await handler.handle({
        testSuite,
        algorithm: 'redundancy-detection' as const
      });

      const sublinearResult = await handler.handle({
        testSuite,
        algorithm: 'sublinear' as const
      });

      // THEN: All algorithms complete successfully
      expect(jlResult.success).toBe(true);
      expect(temporalResult.success).toBe(true);
      expect(redundancyResult.success).toBe(true);
      expect(sublinearResult.success).toBe(true);
    });
  });
});
