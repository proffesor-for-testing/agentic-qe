/**
 * Unit tests for MinCut Test Suite Optimizer
 * Task 2.3: RVF Integration Plan
 *
 * Validates that mincut-based analysis correctly identifies critical vs
 * skippable tests, handles edge cases, and produces valid execution orders.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MinCutTestOptimizerImpl,
  createMinCutTestOptimizer,
  type TestNode,
  type TestOptimizationResult,
  type MinCutTestOptimizer,
} from '../../src/domains/test-execution/services/mincut-test-optimizer';

describe('MinCutTestOptimizer', () => {
  let optimizer: MinCutTestOptimizer;

  beforeEach(() => {
    optimizer = createMinCutTestOptimizer();
  });

  // ==========================================================================
  // Helper Functions
  // ==========================================================================

  function makeTest(
    id: string,
    coveredFiles: string[],
    durationMs: number = 100
  ): TestNode {
    return {
      testId: id,
      testFile: `tests/${id}.test.ts`,
      coveredFiles,
      estimatedDurationMs: durationMs,
    };
  }

  // ==========================================================================
  // Empty Test Suite
  // ==========================================================================

  describe('empty test suite', () => {
    it('should return empty results for no tests', () => {
      const result = optimizer.optimize([]);

      expect(result.criticalTests).toEqual([]);
      expect(result.skippableTests).toEqual([]);
      expect(result.executionOrder).toEqual([]);
      expect(result.estimatedTimeSavingsMs).toBe(0);
      expect(result.graphStats.testCount).toBe(0);
      expect(result.graphStats.coverageEdges).toBe(0);
      expect(result.graphStats.mincutValue).toBe(0);
      expect(result.graphStats.connectedComponents).toBe(0);
    });
  });

  // ==========================================================================
  // Single Test
  // ==========================================================================

  describe('single test', () => {
    it('should always mark a single test as critical', () => {
      const test = makeTest('test-1', ['src/auth.ts', 'src/utils.ts'], 200);
      const result = optimizer.optimize([test]);

      expect(result.criticalTests).toEqual(['test-1']);
      expect(result.skippableTests).toEqual([]);
      expect(result.executionOrder).toEqual(['test-1']);
      expect(result.estimatedTimeSavingsMs).toBe(0);
      expect(result.graphStats.testCount).toBe(1);
      expect(result.graphStats.coverageEdges).toBe(2);
    });
  });

  // ==========================================================================
  // Isolated Test (Unique Coverage)
  // ==========================================================================

  describe('isolated test with unique coverage', () => {
    it('should always mark a test covering a unique file as critical', () => {
      const tests: TestNode[] = [
        makeTest('test-A', ['src/auth.ts', 'src/common.ts'], 100),
        makeTest('test-B', ['src/db.ts', 'src/common.ts'], 100),
        makeTest('test-unique', ['src/unique-module.ts'], 50),
      ];

      const result = optimizer.optimize(tests);

      // test-unique is the only test covering src/unique-module.ts -> always critical
      expect(result.criticalTests).toContain('test-unique');
      expect(result.skippableTests).not.toContain('test-unique');
    });

    it('should mark all tests as critical when each covers a unique file', () => {
      const tests: TestNode[] = [
        makeTest('test-1', ['src/a.ts'], 100),
        makeTest('test-2', ['src/b.ts'], 100),
        makeTest('test-3', ['src/c.ts'], 100),
      ];

      const result = optimizer.optimize(tests);

      // Each test is the sole provider for its file
      expect(result.criticalTests).toHaveLength(3);
      expect(result.skippableTests).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Fully Redundant Test
  // ==========================================================================

  describe('fully redundant test', () => {
    it('should identify a test as skippable when its coverage is a subset of others', () => {
      const tests: TestNode[] = [
        makeTest('test-broad', ['src/a.ts', 'src/b.ts', 'src/c.ts'], 300),
        makeTest('test-medium', ['src/a.ts', 'src/b.ts'], 200),
        makeTest('test-narrow', ['src/a.ts'], 100),
      ];

      const result = optimizer.optimize(tests);

      // test-broad covers everything test-narrow covers and more.
      // At minimum, test-broad must be critical (sole provider of src/c.ts).
      expect(result.criticalTests).toContain('test-broad');

      // The narrow test should be skippable — its sole file (src/a.ts) is covered by others
      // At least one test should be skippable
      expect(result.skippableTests.length).toBeGreaterThanOrEqual(1);

      // All covered files must still be reachable from critical tests
      const criticalCoverage = new Set<string>();
      for (const testId of result.criticalTests) {
        const test = tests.find(t => t.testId === testId)!;
        for (const f of test.coveredFiles) {
          criticalCoverage.add(f);
        }
      }
      expect(criticalCoverage).toContain('src/a.ts');
      expect(criticalCoverage).toContain('src/b.ts');
      expect(criticalCoverage).toContain('src/c.ts');
    });
  });

  // ==========================================================================
  // Overlapping Coverage (3 Tests)
  // ==========================================================================

  describe('overlapping coverage', () => {
    it('should identify critical vs skippable among 3 tests with overlapping files', () => {
      // test-1 covers [a, b], test-2 covers [b, c], test-3 covers [a, c]
      // Every file is covered by exactly 2 tests, so any 2 of 3 cover everything.
      // The optimizer should find at least 1 skippable.
      const tests: TestNode[] = [
        makeTest('test-1', ['src/a.ts', 'src/b.ts'], 100),
        makeTest('test-2', ['src/b.ts', 'src/c.ts'], 150),
        makeTest('test-3', ['src/a.ts', 'src/c.ts'], 200),
      ];

      const result = optimizer.optimize(tests);

      // All tests together
      expect(result.criticalTests.length + result.skippableTests.length).toBe(3);

      // Critical tests must collectively cover all 3 files
      const criticalCoverage = new Set<string>();
      for (const testId of result.criticalTests) {
        const test = tests.find(t => t.testId === testId)!;
        for (const f of test.coveredFiles) {
          criticalCoverage.add(f);
        }
      }
      expect(criticalCoverage.size).toBe(3);
      expect(criticalCoverage).toContain('src/a.ts');
      expect(criticalCoverage).toContain('src/b.ts');
      expect(criticalCoverage).toContain('src/c.ts');
    });
  });

  // ==========================================================================
  // Execution Order
  // ==========================================================================

  describe('execution order', () => {
    it('should place critical tests before skippable tests', () => {
      const tests: TestNode[] = [
        makeTest('test-broad', ['src/a.ts', 'src/b.ts', 'src/c.ts'], 300),
        makeTest('test-medium', ['src/a.ts', 'src/b.ts'], 200),
        makeTest('test-narrow', ['src/a.ts'], 100),
      ];

      const result = optimizer.optimize(tests);

      // All critical tests should appear before all skippable tests
      const criticalSet = new Set(result.criticalTests);
      const skippableSet = new Set(result.skippableTests);

      let lastCriticalIdx = -1;
      let firstSkippableIdx = result.executionOrder.length;

      result.executionOrder.forEach((testId, idx) => {
        if (criticalSet.has(testId)) {
          lastCriticalIdx = idx;
        }
        if (skippableSet.has(testId) && idx < firstSkippableIdx) {
          firstSkippableIdx = idx;
        }
      });

      if (result.skippableTests.length > 0) {
        expect(lastCriticalIdx).toBeLessThan(firstSkippableIdx);
      }
    });

    it('should include all tests in execution order', () => {
      const tests: TestNode[] = [
        makeTest('test-1', ['src/a.ts'], 100),
        makeTest('test-2', ['src/b.ts'], 100),
        makeTest('test-3', ['src/a.ts', 'src/b.ts'], 100),
      ];

      const result = optimizer.optimize(tests);

      expect(result.executionOrder).toHaveLength(3);
      expect(new Set(result.executionOrder)).toEqual(
        new Set(['test-1', 'test-2', 'test-3'])
      );
    });
  });

  // ==========================================================================
  // Time Savings Calculation
  // ==========================================================================

  describe('time savings', () => {
    it('should sum durations of skippable tests for estimated savings', () => {
      const tests: TestNode[] = [
        makeTest('test-broad', ['src/a.ts', 'src/b.ts', 'src/c.ts'], 500),
        makeTest('test-redundant-1', ['src/a.ts'], 100),
        makeTest('test-redundant-2', ['src/b.ts'], 200),
      ];

      const result = optimizer.optimize(tests);

      // Time savings should equal the sum of durations of skippable tests
      const testMap = new Map(tests.map(t => [t.testId, t]));
      const expectedSavings = result.skippableTests.reduce(
        (sum, id) => sum + (testMap.get(id)?.estimatedDurationMs ?? 0),
        0
      );
      expect(result.estimatedTimeSavingsMs).toBe(expectedSavings);
    });

    it('should report zero savings when no tests are skippable', () => {
      const tests: TestNode[] = [
        makeTest('test-1', ['src/unique-a.ts'], 100),
        makeTest('test-2', ['src/unique-b.ts'], 200),
      ];

      const result = optimizer.optimize(tests);

      expect(result.skippableTests).toHaveLength(0);
      expect(result.estimatedTimeSavingsMs).toBe(0);
    });
  });

  // ==========================================================================
  // Graph Statistics
  // ==========================================================================

  describe('graph statistics', () => {
    it('should report correct test count', () => {
      const tests: TestNode[] = [
        makeTest('t1', ['src/a.ts'], 100),
        makeTest('t2', ['src/b.ts'], 100),
        makeTest('t3', ['src/c.ts'], 100),
      ];

      const result = optimizer.optimize(tests);
      expect(result.graphStats.testCount).toBe(3);
    });

    it('should report correct coverage edge count', () => {
      const tests: TestNode[] = [
        makeTest('t1', ['src/a.ts', 'src/b.ts'], 100),
        makeTest('t2', ['src/b.ts', 'src/c.ts'], 100),
      ];

      const result = optimizer.optimize(tests);
      // t1 covers 2 files, t2 covers 2 files = 4 edges total
      expect(result.graphStats.coverageEdges).toBe(4);
    });

    it('should report a positive mincut value for connected graphs', () => {
      const tests: TestNode[] = [
        makeTest('t1', ['src/shared.ts'], 100),
        makeTest('t2', ['src/shared.ts'], 100),
      ];

      const result = optimizer.optimize(tests);
      expect(result.graphStats.mincutValue).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Coverage Invariants
  // ==========================================================================

  describe('coverage invariants', () => {
    it('should ensure critical tests cover all files when threshold is 1.0', () => {
      const tests: TestNode[] = [
        makeTest('t1', ['src/a.ts', 'src/b.ts'], 100),
        makeTest('t2', ['src/b.ts', 'src/c.ts'], 100),
        makeTest('t3', ['src/c.ts', 'src/d.ts'], 100),
        makeTest('t4', ['src/a.ts', 'src/d.ts'], 100),
      ];

      const result = optimizer.optimize(tests, 1.0);

      // Verify all files are covered by critical tests
      const allFiles = new Set<string>();
      const criticalFiles = new Set<string>();
      for (const t of tests) {
        for (const f of t.coveredFiles) allFiles.add(f);
      }
      for (const testId of result.criticalTests) {
        const test = tests.find(t => t.testId === testId)!;
        for (const f of test.coveredFiles) criticalFiles.add(f);
      }

      for (const file of allFiles) {
        expect(criticalFiles).toContain(file);
      }
    });

    it('should partition all tests into either critical or skippable', () => {
      const tests: TestNode[] = [
        makeTest('t1', ['src/a.ts'], 100),
        makeTest('t2', ['src/a.ts', 'src/b.ts'], 100),
        makeTest('t3', ['src/b.ts', 'src/c.ts'], 100),
      ];

      const result = optimizer.optimize(tests);

      const allInResult = new Set([...result.criticalTests, ...result.skippableTests]);
      expect(allInResult.size).toBe(tests.length);
      // No overlap
      const overlap = result.criticalTests.filter(t =>
        result.skippableTests.includes(t)
      );
      expect(overlap).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Factory Function
  // ==========================================================================

  describe('createMinCutTestOptimizer', () => {
    it('should create a working optimizer instance', () => {
      const opt = createMinCutTestOptimizer();
      const result = opt.optimize([makeTest('t1', ['src/a.ts'], 100)]);
      expect(result.criticalTests).toEqual(['t1']);
    });
  });

  // ==========================================================================
  // Coverage Threshold
  // ==========================================================================

  describe('coverage threshold', () => {
    it('should allow more skippable tests with a lower coverage threshold', () => {
      // 4 tests, each covering 1 unique file + a shared file
      const tests: TestNode[] = [
        makeTest('t1', ['src/shared.ts', 'src/a.ts'], 100),
        makeTest('t2', ['src/shared.ts', 'src/b.ts'], 100),
        makeTest('t3', ['src/shared.ts', 'src/c.ts'], 100),
        makeTest('t4', ['src/shared.ts', 'src/d.ts'], 100),
      ];

      const fullResult = optimizer.optimize(tests, 1.0);
      const relaxedResult = optimizer.optimize(tests, 0.5);

      // With lower threshold, we can skip more tests
      expect(relaxedResult.skippableTests.length).toBeGreaterThanOrEqual(
        fullResult.skippableTests.length
      );
    });
  });
});
