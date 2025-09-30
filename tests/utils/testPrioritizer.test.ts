/**
 * Test Prioritizer Test Suite - O(log n) Algorithm Validation
 * Tests the sublinear test prioritization and binary heap implementation
 */

import { TestPrioritizer, TestCase, PriorityScore } from './testPrioritizer';

describe('TestPrioritizer', () => {
  let prioritizer: TestPrioritizer;

  beforeEach(() => {
    prioritizer = new TestPrioritizer(50); // Max 50 tests
  });

  describe('O(log n) prioritization algorithm', () => {
    it('should prioritize tests using sublinear algorithm', () => {
      const tests: TestCase[] = generateTestSuite(100);
      const startTime = Date.now();

      const prioritized = prioritizer.prioritizeTests(tests);
      const executionTime = Date.now() - startTime;

      expect(prioritized).toBeDefined();
      expect(prioritized.length).toBeLessThanOrEqual(50);
      expect(executionTime).toBeLessThan(100); // Should be very fast

      // Verify scores are in descending order
      for (let i = 1; i < prioritized.length; i++) {
        expect(prioritized[i].score).toBeLessThanOrEqual(prioritized[i - 1].score);
      }
    });

    it('should scale logarithmically with input size', () => {
      const sizes = [100, 200, 400, 800];
      const executionTimes: number[] = [];

      sizes.forEach(size => {
        const tests = generateTestSuite(size);
        const startTime = Date.now();
        prioritizer.prioritizeTests(tests);
        const executionTime = Date.now() - startTime;
        executionTimes.push(executionTime);
      });

      // Verify sublinear growth
      for (let i = 1; i < executionTimes.length; i++) {
        const growthRatio = executionTimes[i] / executionTimes[i - 1];
        expect(growthRatio).toBeLessThan(1.5); // Much less than linear (2x) growth
      }
    });

    it('should prioritize critical path tests highest', () => {
      const tests: TestCase[] = [
        {
          id: 'critical-1',
          path: 'src/payment/PaymentProcessor.test.js',
          complexity: 3,
          coverage: 15,
          criticalPath: true,
          dependencies: [],
          executionTime: 500
        },
        {
          id: 'normal-1',
          path: 'src/utils/Helper.test.js',
          complexity: 2,
          coverage: 25,
          criticalPath: false,
          dependencies: [],
          executionTime: 200
        },
        {
          id: 'critical-2',
          path: 'src/auth/AuthService.test.js',
          complexity: 5,
          coverage: 10,
          criticalPath: true,
          dependencies: [],
          executionTime: 800
        }
      ];

      const prioritized = prioritizer.prioritizeTests(tests);

      // Critical path tests should be at the top
      expect(prioritized[0].testId).toMatch(/critical-/);
      expect(prioritized[1].testId).toMatch(/critical-/);
      expect(prioritized[2].testId).toBe('normal-1');
    });

    it('should handle empty test suites gracefully', () => {
      const prioritized = prioritizer.prioritizeTests([]);
      expect(prioritized).toEqual([]);
    });
  });

  describe('priority scoring algorithm', () => {
    it('should calculate scores based on multiple factors', () => {
      const test: TestCase = {
        id: 'test-1',
        path: 'src/module/Class.test.js',
        complexity: 3,
        coverage: 20,
        criticalPath: false,
        dependencies: ['test-0'],
        executionTime: 1000
      };

      const tests = [test];
      const prioritized = prioritizer.prioritizeTests(tests);

      expect(prioritized[0].score).toBeGreaterThan(0);
      expect(prioritized[0].reasons).toBeDefined();
      expect(prioritized[0].reasons.length).toBeGreaterThan(0);
    });

    it('should penalize high complexity tests', () => {
      const lowComplexity: TestCase = {
        id: 'low-complexity',
        path: 'test.js',
        complexity: 1,
        coverage: 10,
        criticalPath: false,
        dependencies: [],
        executionTime: 100
      };

      const highComplexity: TestCase = {
        id: 'high-complexity',
        path: 'test.js',
        complexity: 10,
        coverage: 10,
        criticalPath: false,
        dependencies: [],
        executionTime: 100
      };

      const lowResult = prioritizer.prioritizeTests([lowComplexity]);
      const highResult = prioritizer.prioritizeTests([highComplexity]);

      expect(lowResult[0].score).toBeGreaterThan(highResult[0].score);
    });

    it('should prefer fast-executing tests', () => {
      const fastTest: TestCase = {
        id: 'fast-test',
        path: 'test.js',
        complexity: 2,
        coverage: 10,
        criticalPath: false,
        dependencies: [],
        executionTime: 50
      };

      const slowTest: TestCase = {
        id: 'slow-test',
        path: 'test.js',
        complexity: 2,
        coverage: 10,
        criticalPath: false,
        dependencies: [],
        executionTime: 5000
      };

      const fastResult = prioritizer.prioritizeTests([fastTest]);
      const slowResult = prioritizer.prioritizeTests([slowTest]);

      expect(fastResult[0].score).toBeGreaterThan(slowResult[0].score);
    });

    it('should penalize tests with many dependencies', () => {
      const independent: TestCase = {
        id: 'independent',
        path: 'test.js',
        complexity: 2,
        coverage: 10,
        criticalPath: false,
        dependencies: [],
        executionTime: 100
      };

      const dependent: TestCase = {
        id: 'dependent',
        path: 'test.js',
        complexity: 2,
        coverage: 10,
        criticalPath: false,
        dependencies: ['test-1', 'test-2', 'test-3'],
        executionTime: 100
      };

      const independentResult = prioritizer.prioritizeTests([independent]);
      const dependentResult = prioritizer.prioritizeTests([dependent]);

      expect(independentResult[0].score).toBeGreaterThan(dependentResult[0].score);
    });
  });

  describe('binary heap implementation', () => {
    it('should maintain heap property during insertions', () => {
      const tests = generateTestSuite(20);
      const prioritized = prioritizer.prioritizeTests(tests);

      // Verify that each parent has higher or equal priority than children
      for (let i = 0; i < Math.floor(prioritized.length / 2); i++) {
        const leftChild = 2 * i + 1;
        const rightChild = 2 * i + 2;

        if (leftChild < prioritized.length) {
          expect(prioritized[i].score).toBeGreaterThanOrEqual(prioritized[leftChild].score);
        }

        if (rightChild < prioritized.length) {
          expect(prioritized[i].score).toBeGreaterThanOrEqual(prioritized[rightChild].score);
        }
      }
    });

    it('should extract maximum elements correctly', () => {
      const tests = generateTestSuite(10);
      const prioritized = prioritizer.prioritizeTests(tests);

      // Should be in descending order (max-heap extraction)
      for (let i = 1; i < prioritized.length; i++) {
        expect(prioritized[i - 1].score).toBeGreaterThanOrEqual(prioritized[i].score);
      }
    });

    it('should handle duplicate scores correctly', () => {
      const tests: TestCase[] = Array.from({ length: 5 }, (_, i) => ({
        id: `test-${i}`,
        path: 'test.js',
        complexity: 2,
        coverage: 10, // Same coverage for all
        criticalPath: false,
        dependencies: [],
        executionTime: 100
      }));

      const prioritized = prioritizer.prioritizeTests(tests);
      expect(prioritized).toHaveLength(5);

      // All should have similar scores
      const scores = prioritized.map(p => p.score);
      const maxScore = Math.max(...scores);
      const minScore = Math.min(...scores);
      expect(maxScore - minScore).toBeLessThan(5); // Small variation due to rounding
    });
  });

  describe('coverage matrix optimization', () => {
    it('should build coverage matrix efficiently', () => {
      const tests = generateTestSuite(100);
      const startTime = Date.now();

      prioritizer.prioritizeTests(tests);
      const executionTime = Date.now() - startTime;

      expect(executionTime).toBeLessThan(50); // Should be very fast
    });

    it('should identify overlapping coverage areas', () => {
      const tests: TestCase[] = [
        {
          id: 'test-1',
          path: 'src/module/ClassA.test.js',
          complexity: 2,
          coverage: 15,
          criticalPath: false,
          dependencies: [],
          executionTime: 100
        },
        {
          id: 'test-2',
          path: 'src/module/ClassA.integration.test.js',
          complexity: 3,
          coverage: 12,
          criticalPath: false,
          dependencies: [],
          executionTime: 200
        }
      ];

      const prioritized = prioritizer.prioritizeTests(tests);
      expect(prioritized).toHaveLength(2);

      // Should prefer unit test over integration test for same module
      // (lower complexity, faster execution)
      expect(prioritized[0].testId).toBe('test-1');
    });
  });

  describe('memory efficiency', () => {
    it('should handle large test suites without memory issues', () => {
      const largeTestSuite = generateTestSuite(10000);

      expect(() => {
        const prioritized = prioritizer.prioritizeTests(largeTestSuite);
        expect(prioritized.length).toBeLessThanOrEqual(50);
      }).not.toThrow();
    });

    it('should limit output size regardless of input size', () => {
      const prioritizerSmall = new TestPrioritizer(10);
      const tests = generateTestSuite(1000);

      const prioritized = prioritizerSmall.prioritizeTests(tests);
      expect(prioritized.length).toBeLessThanOrEqual(10);
    });
  });

  describe('algorithm correctness', () => {
    it('should select optimal test subset for maximum coverage', () => {
      const tests: TestCase[] = [
        // High coverage, critical path
        { id: 'optimal-1', path: 'critical.test.js', complexity: 2, coverage: 30, criticalPath: true, dependencies: [], executionTime: 100 },
        // High coverage, fast
        { id: 'optimal-2', path: 'fast.test.js', complexity: 1, coverage: 25, criticalPath: false, dependencies: [], executionTime: 50 },
        // Low coverage, slow
        { id: 'suboptimal-1', path: 'slow.test.js', complexity: 5, coverage: 5, criticalPath: false, dependencies: ['dep1', 'dep2'], executionTime: 2000 },
        // Medium coverage, medium complexity
        { id: 'medium-1', path: 'medium.test.js', complexity: 3, coverage: 15, criticalPath: false, dependencies: [], executionTime: 300 }
      ];

      const prioritized = prioritizer.prioritizeTests(tests);

      // Optimal tests should be at the top
      expect(prioritized[0].testId).toBe('optimal-1');
      expect(prioritized[1].testId).toBe('optimal-2');
      expect(prioritized[2].testId).toBe('medium-1');
      expect(prioritized[3].testId).toBe('suboptimal-1');
    });

    it('should provide meaningful reasoning for each score', () => {
      const test: TestCase = {
        id: 'test-with-reasons',
        path: 'src/complex/Module.test.js',
        complexity: 8,
        coverage: 35,
        criticalPath: true,
        dependencies: ['dep1'],
        executionTime: 1500
      };

      const prioritized = prioritizer.prioritizeTests([test]);
      const reasons = prioritized[0].reasons;

      expect(reasons).toContain('Critical path coverage');
      expect(reasons.some(r => r.includes('Coverage impact'))).toBe(true);
      expect(reasons.some(r => r.includes('complexity penalty'))).toBe(true);
      expect(reasons.some(r => r.includes('execution penalty'))).toBe(true);
      expect(reasons.some(r => r.includes('Dependencies'))).toBe(true);
    });
  });
});

// Helper function to generate test suite
function generateTestSuite(size: number): TestCase[] {
  return Array.from({ length: size }, (_, i) => ({
    id: `test-${i}`,
    path: `src/module${Math.floor(i / 10)}/Class${i % 10}.test.js`,
    complexity: Math.floor(Math.random() * 10) + 1,
    coverage: Math.random() * 50 + 5, // 5-55% coverage
    criticalPath: Math.random() < 0.1, // 10% critical path
    dependencies: Array.from(
      { length: Math.floor(Math.random() * 3) },
      (_, j) => `dep-${i}-${j}`
    ),
    executionTime: Math.random() * 2000 + 50 // 50-2050ms
  }));
}