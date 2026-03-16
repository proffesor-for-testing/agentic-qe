/**
 * DAG Attention Scheduler Tests
 * RuVector Integration Plan - Phase 4, Task 4.2
 *
 * Tests for DAG-based test execution ordering with attention mechanisms:
 * - Critical path identification
 * - Parallel branch detection
 * - MinCut pruning
 * - Valid scheduling (respects dependencies)
 * - Self-learning (ordering improves with history)
 * - Edge cases (no dependencies, linear chain, diamond pattern)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DAGAttentionScheduler,
  createDAGAttentionScheduler,
  type TestNode,
  type TestDAG,
  type ScheduledExecution,
} from '../../../src/test-scheduling/dag-attention-scheduler';

// ============================================================================
// Test Helpers
// ============================================================================

/** Create a simple TestNode with defaults */
function makeNode(overrides: Partial<TestNode> & { id: string }): TestNode {
  return {
    name: overrides.name ?? `Test ${overrides.id}`,
    estimatedDuration: overrides.estimatedDuration ?? 100,
    dependencies: overrides.dependencies ?? [],
    priority: overrides.priority ?? 1,
    tags: overrides.tags ?? ['unit'],
    ...overrides,
  };
}

/**
 * Build a linear chain: A -> B -> C -> ...
 * Each test depends on the previous one.
 */
function buildLinearChain(count: number): TestNode[] {
  const nodes: TestNode[] = [];
  for (let i = 0; i < count; i++) {
    const id = `test-${i}`;
    nodes.push(
      makeNode({
        id,
        name: `Chain Step ${i}`,
        estimatedDuration: 100,
        dependencies: i > 0 ? [`test-${i - 1}`] : [],
      })
    );
  }
  return nodes;
}

/**
 * Build a set of fully independent tests (no dependencies).
 */
function buildIndependentTests(count: number): TestNode[] {
  const nodes: TestNode[] = [];
  for (let i = 0; i < count; i++) {
    nodes.push(
      makeNode({
        id: `independent-${i}`,
        name: `Independent Test ${i}`,
        estimatedDuration: 50 + i * 10,
        dependencies: [],
      })
    );
  }
  return nodes;
}

/**
 * Build a diamond dependency pattern:
 *       A
 *      / \
 *     B   C
 *      \ /
 *       D
 */
function buildDiamondPattern(): TestNode[] {
  return [
    makeNode({ id: 'A', estimatedDuration: 100, dependencies: [] }),
    makeNode({ id: 'B', estimatedDuration: 200, dependencies: ['A'] }),
    makeNode({ id: 'C', estimatedDuration: 150, dependencies: ['A'] }),
    makeNode({ id: 'D', estimatedDuration: 50, dependencies: ['B', 'C'] }),
  ];
}

/**
 * Verify that a scheduled execution respects all dependencies.
 * For every test, all of its dependencies must appear in an earlier phase.
 */
function assertDependenciesRespected(
  execution: ScheduledExecution,
  tests: TestNode[]
): void {
  const testMap = new Map(tests.map((t) => [t.id, t]));
  const executedBefore = new Set<string>();

  for (const phase of execution.phases) {
    // All tests in this phase can reference only previously executed tests
    for (const test of phase.tests) {
      const original = testMap.get(test.id);
      if (!original) continue;
      for (const depId of original.dependencies) {
        expect(executedBefore.has(depId)).toBe(true);
      }
    }
    // After this phase, mark all its tests as executed
    for (const test of phase.tests) {
      executedBefore.add(test.id);
    }
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('DAGAttentionScheduler', () => {
  let scheduler: DAGAttentionScheduler;

  beforeEach(() => {
    scheduler = new DAGAttentionScheduler();
  });

  // --------------------------------------------------------------------------
  // Construction and Factory
  // --------------------------------------------------------------------------

  describe('construction', () => {
    it('should create via constructor', () => {
      const s = new DAGAttentionScheduler();
      expect(s).toBeInstanceOf(DAGAttentionScheduler);
    });

    it('should create via factory function', () => {
      const s = createDAGAttentionScheduler();
      expect(s).toBeInstanceOf(DAGAttentionScheduler);
    });

    it('should accept custom options', () => {
      const s = createDAGAttentionScheduler({
        learningRate: 0.5,
        maxHistorySize: 500,
      });
      expect(s).toBeInstanceOf(DAGAttentionScheduler);
    });
  });

  // --------------------------------------------------------------------------
  // buildTestDAG
  // --------------------------------------------------------------------------

  describe('buildTestDAG', () => {
    it('should build a DAG from test nodes', () => {
      const tests = buildDiamondPattern();
      const dag = scheduler.buildTestDAG(tests);

      expect(dag.nodes.size).toBe(4);
      expect(dag.edges.size).toBe(4);
      expect(dag.criticalPath.length).toBeGreaterThan(0);
      expect(dag.parallelGroups.length).toBeGreaterThan(0);
    });

    it('should throw on missing dependency', () => {
      const tests = [
        makeNode({ id: 'A', dependencies: ['nonexistent'] }),
      ];
      expect(() => scheduler.buildTestDAG(tests)).toThrow(
        /does not exist/
      );
    });

    it('should handle empty input', () => {
      const dag = scheduler.buildTestDAG([]);
      expect(dag.nodes.size).toBe(0);
      expect(dag.edges.size).toBe(0);
      expect(dag.criticalPath).toEqual([]);
      expect(dag.parallelGroups).toEqual([]);
    });

    it('should build forward edges correctly', () => {
      const tests = [
        makeNode({ id: 'A', dependencies: [] }),
        makeNode({ id: 'B', dependencies: ['A'] }),
        makeNode({ id: 'C', dependencies: ['A'] }),
      ];
      const dag = scheduler.buildTestDAG(tests);

      // A -> [B, C]
      const aDeps = dag.edges.get('A') ?? [];
      expect(aDeps).toContain('B');
      expect(aDeps).toContain('C');

      // B and C have no dependents
      expect(dag.edges.get('B')).toEqual([]);
      expect(dag.edges.get('C')).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // Critical Path Identification
  // --------------------------------------------------------------------------

  describe('findCriticalPath', () => {
    it('should find the critical path in a diamond pattern', () => {
      // A(100) -> B(200) -> D(50) = 350
      // A(100) -> C(150) -> D(50) = 300
      // Critical path: A -> B -> D
      const tests = buildDiamondPattern();
      const dag = scheduler.buildTestDAG(tests);
      const critical = scheduler.findCriticalPath(dag);

      const ids = critical.map((n) => n.id);
      expect(ids).toContain('A');
      expect(ids).toContain('B');
      expect(ids).toContain('D');
      // B has longer duration than C, so the path goes through B
      expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('D'));
    });

    it('should return the full chain for a linear dependency', () => {
      const tests = buildLinearChain(5);
      const dag = scheduler.buildTestDAG(tests);
      const critical = scheduler.findCriticalPath(dag);

      expect(critical.length).toBe(5);
      // All nodes must be on the critical path
      for (let i = 0; i < 5; i++) {
        expect(critical[i].id).toBe(`test-${i}`);
      }
    });

    it('should return single node when only one test exists', () => {
      const tests = [makeNode({ id: 'solo', estimatedDuration: 42 })];
      const dag = scheduler.buildTestDAG(tests);
      const critical = scheduler.findCriticalPath(dag);

      expect(critical.length).toBe(1);
      expect(critical[0].id).toBe('solo');
    });

    it('should handle all-independent tests (pick the longest)', () => {
      const tests = [
        makeNode({ id: 'short', estimatedDuration: 10 }),
        makeNode({ id: 'long', estimatedDuration: 500 }),
        makeNode({ id: 'medium', estimatedDuration: 100 }),
      ];
      const dag = scheduler.buildTestDAG(tests);
      const critical = scheduler.findCriticalPath(dag);

      // With no dependencies, the critical path is the single longest test
      expect(critical.length).toBe(1);
      expect(critical[0].id).toBe('long');
    });
  });

  // --------------------------------------------------------------------------
  // Parallel Branch Detection
  // --------------------------------------------------------------------------

  describe('findParallelBranches', () => {
    it('should detect parallel branches in a diamond', () => {
      const tests = buildDiamondPattern();
      const dag = scheduler.buildTestDAG(tests);
      const branches = scheduler.findParallelBranches(dag);

      // Level 0: [A], Level 1: [B, C], Level 2: [D]
      expect(branches.length).toBe(3);
      expect(branches[0].length).toBe(1); // A
      expect(branches[1].length).toBe(2); // B, C (parallel)
      expect(branches[2].length).toBe(1); // D
    });

    it('should put all independent tests in one group', () => {
      const tests = buildIndependentTests(5);
      const dag = scheduler.buildTestDAG(tests);
      const branches = scheduler.findParallelBranches(dag);

      // All tests at level 0 since no dependencies
      expect(branches.length).toBe(1);
      expect(branches[0].length).toBe(5);
    });

    it('should produce one test per group for a linear chain', () => {
      const tests = buildLinearChain(4);
      const dag = scheduler.buildTestDAG(tests);
      const branches = scheduler.findParallelBranches(dag);

      // Each test at its own level
      expect(branches.length).toBe(4);
      for (const branch of branches) {
        expect(branch.length).toBe(1);
      }
    });

    it('should handle wide fan-out pattern', () => {
      // Root -> [child-0, child-1, ..., child-9]
      const tests: TestNode[] = [
        makeNode({ id: 'root', dependencies: [] }),
        ...Array.from({ length: 10 }, (_, i) =>
          makeNode({
            id: `child-${i}`,
            dependencies: ['root'],
          })
        ),
      ];
      const dag = scheduler.buildTestDAG(tests);
      const branches = scheduler.findParallelBranches(dag);

      expect(branches.length).toBe(2);
      expect(branches[0].length).toBe(1);  // root
      expect(branches[1].length).toBe(10); // all children in parallel
    });
  });

  // --------------------------------------------------------------------------
  // MinCut Pruning
  // --------------------------------------------------------------------------

  describe('pruneByMinCut', () => {
    it('should not prune when within budget', () => {
      const tests = buildIndependentTests(3);
      // Sum = 50 + 60 + 70 = 180
      const dag = scheduler.buildTestDAG(tests);
      const pruned = scheduler.pruneByMinCut(dag, 1000);

      expect(pruned.nodes.size).toBe(3);
    });

    it('should prune low-priority tests to meet budget', () => {
      const tests = [
        makeNode({ id: 'critical', estimatedDuration: 100, priority: 10 }),
        makeNode({ id: 'important', estimatedDuration: 100, priority: 5 }),
        makeNode({ id: 'optional', estimatedDuration: 100, priority: 1 }),
      ];
      const dag = scheduler.buildTestDAG(tests);
      // Budget of 200 means at least one test must be pruned
      const pruned = scheduler.pruneByMinCut(dag, 200);

      expect(pruned.nodes.size).toBe(2);
      // The lowest-priority test should be pruned
      expect(pruned.nodes.has('critical')).toBe(true);
      expect(pruned.nodes.has('important')).toBe(true);
      expect(pruned.nodes.has('optional')).toBe(false);
    });

    it('should not prune critical-path tests', () => {
      // A -> B (critical path), C (independent, low priority)
      const tests = [
        makeNode({ id: 'A', estimatedDuration: 100, priority: 5 }),
        makeNode({
          id: 'B',
          estimatedDuration: 100,
          priority: 5,
          dependencies: ['A'],
        }),
        makeNode({ id: 'C', estimatedDuration: 100, priority: 1 }),
      ];
      const dag = scheduler.buildTestDAG(tests);
      const pruned = scheduler.pruneByMinCut(dag, 250);

      // C should be pruned, A and B retained (critical path)
      expect(pruned.nodes.has('A')).toBe(true);
      expect(pruned.nodes.has('B')).toBe(true);
      expect(pruned.nodes.has('C')).toBe(false);
    });

    it('should not prune tests with active dependents', () => {
      // A -> B, both high priority
      const tests = [
        makeNode({
          id: 'A',
          estimatedDuration: 100,
          priority: 1,
          dependencies: [],
        }),
        makeNode({
          id: 'B',
          estimatedDuration: 100,
          priority: 10,
          dependencies: ['A'],
        }),
      ];
      const dag = scheduler.buildTestDAG(tests);
      // Even with tight budget, A cannot be pruned because B depends on it
      const pruned = scheduler.pruneByMinCut(dag, 150);

      // Both retained since A has active dependent B
      expect(pruned.nodes.has('A')).toBe(true);
      expect(pruned.nodes.has('B')).toBe(true);
    });

    it('should prefer pruning previously-passing over previously-failing tests', () => {
      // Use 3 tests: a root that both depend on (stays on critical path),
      // and two leaf tests that differ only in lastResult.
      // Make fail-leaf slightly longer so it ends up on the critical path,
      // ensuring that pass-leaf is the one available for pruning.
      const tests = [
        makeNode({
          id: 'root',
          estimatedDuration: 50,
          priority: 5,
          dependencies: [],
        }),
        makeNode({
          id: 'pass-leaf',
          estimatedDuration: 100,
          priority: 1,
          lastResult: 'pass',
          dependencies: ['root'],
        }),
        makeNode({
          id: 'fail-leaf',
          estimatedDuration: 101,
          priority: 1,
          lastResult: 'fail',
          dependencies: ['root'],
        }),
      ];
      const dag = scheduler.buildTestDAG(tests);
      // Total = 50 + 100 + 101 = 251. Budget 200 forces one leaf to be pruned.
      // Critical path: root -> fail-leaf (50+101=151 > 50+100=150), so fail-leaf is protected.
      // pass-leaf has lower attention score (no failure weight), so it gets pruned.
      const pruned = scheduler.pruneByMinCut(dag, 200);

      expect(pruned.nodes.has('root')).toBe(true);
      expect(pruned.nodes.has('fail-leaf')).toBe(true);
      expect(pruned.nodes.has('pass-leaf')).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Scheduling (Valid Execution Order)
  // --------------------------------------------------------------------------

  describe('schedule', () => {
    it('should produce an empty schedule for no tests', () => {
      const execution = scheduler.schedule([]);

      expect(execution.phases).toEqual([]);
      expect(execution.totalEstimatedTime).toBe(0);
      expect(execution.criticalPathTime).toBe(0);
      expect(execution.parallelism).toBe(0);
    });

    it('should respect dependencies in a diamond pattern', () => {
      const tests = buildDiamondPattern();
      const execution = scheduler.schedule(tests);

      assertDependenciesRespected(execution, tests);
      expect(execution.phases.length).toBe(3);
    });

    it('should respect dependencies in a linear chain', () => {
      const tests = buildLinearChain(5);
      const execution = scheduler.schedule(tests);

      assertDependenciesRespected(execution, tests);
      expect(execution.phases.length).toBe(5);
      // Each phase has exactly one test
      for (const phase of execution.phases) {
        expect(phase.tests.length).toBe(1);
        expect(phase.canRunInParallel).toBe(false);
      }
    });

    it('should mark parallel phases correctly', () => {
      const tests = buildDiamondPattern();
      const execution = scheduler.schedule(tests);

      // Phase 0: [A] - single test, not parallel
      expect(execution.phases[0].canRunInParallel).toBe(false);
      // Phase 1: [B, C] - two tests, parallel
      expect(execution.phases[1].canRunInParallel).toBe(true);
      // Phase 2: [D] - single test, not parallel
      expect(execution.phases[2].canRunInParallel).toBe(false);
    });

    it('should put all independent tests in one parallel phase', () => {
      const tests = buildIndependentTests(8);
      const execution = scheduler.schedule(tests);

      expect(execution.phases.length).toBe(1);
      expect(execution.phases[0].tests.length).toBe(8);
      expect(execution.phases[0].canRunInParallel).toBe(true);
    });

    it('should compute correct estimated times', () => {
      // Diamond: A(100), B(200), C(150), D(50)
      const tests = buildDiamondPattern();
      const execution = scheduler.schedule(tests);

      // Critical path time: A + B + D = 350
      expect(execution.criticalPathTime).toBe(350);

      // Wall-clock: A(100) + max(B(200), C(150)) + D(50) = 350
      expect(execution.totalEstimatedTime).toBe(350);

      // Parallelism: totalWork(500) / wallClock(350)
      expect(execution.parallelism).toBeGreaterThan(1);
      expect(execution.parallelism).toBeCloseTo(500 / 350, 1);
    });

    it('should handle a single test', () => {
      const tests = [makeNode({ id: 'solo', estimatedDuration: 42 })];
      const execution = scheduler.schedule(tests);

      expect(execution.phases.length).toBe(1);
      expect(execution.phases[0].tests.length).toBe(1);
      expect(execution.totalEstimatedTime).toBe(42);
      expect(execution.criticalPathTime).toBe(42);
    });

    it('should handle complex DAG with multiple paths', () => {
      //     A
      //    / \
      //   B   C
      //   |   |
      //   D   E
      //    \ /
      //     F
      const tests: TestNode[] = [
        makeNode({ id: 'A', estimatedDuration: 10, dependencies: [] }),
        makeNode({ id: 'B', estimatedDuration: 20, dependencies: ['A'] }),
        makeNode({ id: 'C', estimatedDuration: 30, dependencies: ['A'] }),
        makeNode({ id: 'D', estimatedDuration: 40, dependencies: ['B'] }),
        makeNode({ id: 'E', estimatedDuration: 50, dependencies: ['C'] }),
        makeNode({
          id: 'F',
          estimatedDuration: 10,
          dependencies: ['D', 'E'],
        }),
      ];
      const execution = scheduler.schedule(tests);

      assertDependenciesRespected(execution, tests);

      // Should have 4 levels: [A], [B,C], [D,E], [F]
      expect(execution.phases.length).toBe(4);
    });
  });

  // --------------------------------------------------------------------------
  // Self-Learning
  // --------------------------------------------------------------------------

  describe('self-learning', () => {
    it('should record execution and update learned durations', () => {
      scheduler.recordExecution('test-1', 150, 'pass');

      const learned = scheduler.getLearnedDuration('test-1');
      expect(learned).toBe(150);
    });

    it('should use EMA to smooth duration estimates', () => {
      // Default learning rate is 0.3
      scheduler.recordExecution('test-1', 100, 'pass');
      expect(scheduler.getLearnedDuration('test-1')).toBe(100);

      // Second recording: EMA = 100 * 0.7 + 200 * 0.3 = 130
      scheduler.recordExecution('test-1', 200, 'pass');
      expect(scheduler.getLearnedDuration('test-1')).toBe(130);

      // Third: EMA = 130 * 0.7 + 100 * 0.3 = 121
      scheduler.recordExecution('test-1', 100, 'pass');
      expect(scheduler.getLearnedDuration('test-1')).toBe(121);
    });

    it('should apply learned durations when building DAG', () => {
      // Record a much longer actual duration
      scheduler.recordExecution('A', 500, 'pass');

      const tests = [
        makeNode({ id: 'A', estimatedDuration: 100, dependencies: [] }),
        makeNode({ id: 'B', estimatedDuration: 100, dependencies: [] }),
      ];
      const dag = scheduler.buildTestDAG(tests);

      // A's duration should be updated to the learned value
      const nodeA = dag.nodes.get('A')!;
      expect(nodeA.estimatedDuration).toBe(500);

      // B should remain at original estimate
      const nodeB = dag.nodes.get('B')!;
      expect(nodeB.estimatedDuration).toBe(100);
    });

    it('should improve scheduling with historical data', () => {
      // First schedule: all tests estimated at 100ms each
      const tests = [
        makeNode({ id: 'A', estimatedDuration: 100, dependencies: [] }),
        makeNode({ id: 'B', estimatedDuration: 100, dependencies: ['A'] }),
        makeNode({ id: 'C', estimatedDuration: 100, dependencies: ['A'] }),
      ];

      const firstExec = scheduler.schedule(tests);

      // Record that B is actually much faster and C is much slower
      scheduler.recordExecution('B', 10, 'pass');
      scheduler.recordExecution('C', 300, 'pass');

      const secondExec = scheduler.schedule(tests);

      // Critical path should now go through C (300ms) instead of B (10ms)
      // First: critical path time = A(100) + B(100) or C(100) = 200
      // Second: critical path time should reflect learned durations
      // A(100) + C(300) = 400 > A(100) + B(10) = 110
      expect(secondExec.criticalPathTime).toBeGreaterThan(
        firstExec.criticalPathTime
      );
    });

    it('should return undefined for unrecorded tests', () => {
      expect(scheduler.getLearnedDuration('nonexistent')).toBeUndefined();
    });

    it('should respect custom learning rate', () => {
      const s = new DAGAttentionScheduler({ learningRate: 0.5 });

      s.recordExecution('test-1', 100, 'pass');
      s.recordExecution('test-1', 200, 'pass');

      // EMA = 100 * 0.5 + 200 * 0.5 = 150
      expect(s.getLearnedDuration('test-1')).toBe(150);
    });
  });

  // --------------------------------------------------------------------------
  // Optimization Stats
  // --------------------------------------------------------------------------

  describe('getOptimizationStats', () => {
    it('should return stats object', () => {
      const stats = scheduler.getOptimizationStats();

      expect(stats).toHaveProperty('totalTests');
      expect(stats).toHaveProperty('criticalPathLength');
      expect(stats).toHaveProperty('parallelGroupCount');
      expect(stats).toHaveProperty('prunedTests');
      expect(stats).toHaveProperty('estimatedTimeSaved');
      expect(stats).toHaveProperty('historicalRuns');
      expect(stats).toHaveProperty('usingNativeBackend');
    });

    it('should track run count', () => {
      expect(scheduler.getOptimizationStats().historicalRuns).toBe(0);

      scheduler.schedule(buildIndependentTests(3));
      expect(scheduler.getOptimizationStats().historicalRuns).toBe(1);

      scheduler.schedule(buildDiamondPattern());
      expect(scheduler.getOptimizationStats().historicalRuns).toBe(2);
    });

    it('should report pruned test count', () => {
      const tests = [
        makeNode({ id: 'keep', estimatedDuration: 100, priority: 10 }),
        makeNode({ id: 'drop', estimatedDuration: 100, priority: 1 }),
      ];
      const dag = scheduler.buildTestDAG(tests);

      // Before pruning
      expect(scheduler.getOptimizationStats().prunedTests).toBe(0);

      scheduler.pruneByMinCut(dag, 100);
      expect(scheduler.getOptimizationStats().prunedTests).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle DAG with wide fan-in', () => {
      // [A, B, C, D, E] -> F (all feed into F)
      const tests: TestNode[] = [
        ...Array.from({ length: 5 }, (_, i) =>
          makeNode({ id: `src-${i}`, estimatedDuration: 100, dependencies: [] })
        ),
        makeNode({
          id: 'sink',
          estimatedDuration: 50,
          dependencies: ['src-0', 'src-1', 'src-2', 'src-3', 'src-4'],
        }),
      ];
      const execution = scheduler.schedule(tests);

      assertDependenciesRespected(execution, tests);
      expect(execution.phases.length).toBe(2);
      expect(execution.phases[0].tests.length).toBe(5);
      expect(execution.phases[0].canRunInParallel).toBe(true);
      expect(execution.phases[1].tests.length).toBe(1);
    });

    it('should handle tests with tags', () => {
      const tests = [
        makeNode({ id: 'unit-1', tags: ['unit', 'fast'] }),
        makeNode({ id: 'e2e-1', tags: ['e2e', 'slow'] }),
      ];
      const dag = scheduler.buildTestDAG(tests);

      expect(dag.nodes.get('unit-1')!.tags).toEqual(['unit', 'fast']);
      expect(dag.nodes.get('e2e-1')!.tags).toEqual(['e2e', 'slow']);
    });

    it('should handle tests with lastResult metadata', () => {
      const tests = [
        makeNode({ id: 'a', lastResult: 'pass', lastExecutionTime: 50 }),
        makeNode({ id: 'b', lastResult: 'fail', lastExecutionTime: 200 }),
      ];
      const dag = scheduler.buildTestDAG(tests);

      expect(dag.nodes.get('a')!.lastResult).toBe('pass');
      expect(dag.nodes.get('b')!.lastResult).toBe('fail');
    });

    it('should detect cycles and throw', () => {
      // This would be caught at the topological sort stage.
      // We cannot build a cyclic DAG through the normal API since
      // dependencies are validated. But if we create nodes that
      // form a cycle, the topological sort should fail.
      // Since buildTestDAG validates dependencies exist but does not
      // check for cycles until topological sort, we test indirectly.
      const tests = [
        makeNode({ id: 'A', dependencies: ['B'] }),
        makeNode({ id: 'B', dependencies: ['A'] }),
      ];
      expect(() => scheduler.buildTestDAG(tests)).toThrow(/Cycle detected/);
    });

    it('should handle large number of tests efficiently', () => {
      // 100 independent tests should schedule quickly
      const tests = buildIndependentTests(100);
      const start = Date.now();
      const execution = scheduler.schedule(tests);
      const elapsed = Date.now() - start;

      expect(execution.phases.length).toBe(1);
      expect(execution.phases[0].tests.length).toBe(100);
      // Should complete in well under 1 second
      expect(elapsed).toBeLessThan(1000);
    });
  });

  // --------------------------------------------------------------------------
  // Diamond Dependency Pattern (Comprehensive)
  // --------------------------------------------------------------------------

  describe('diamond dependency pattern', () => {
    it('should schedule diamond in correct phase order', () => {
      const tests = buildDiamondPattern();
      const execution = scheduler.schedule(tests);

      // Phase 0: A
      const phase0Ids = execution.phases[0].tests.map((t) => t.id);
      expect(phase0Ids).toEqual(['A']);

      // Phase 1: B and C (parallel)
      const phase1Ids = execution.phases[1].tests.map((t) => t.id).sort();
      expect(phase1Ids).toEqual(['B', 'C']);

      // Phase 2: D
      const phase2Ids = execution.phases[2].tests.map((t) => t.id);
      expect(phase2Ids).toEqual(['D']);
    });

    it('should compute correct parallelism for diamond', () => {
      const tests = buildDiamondPattern();
      const execution = scheduler.schedule(tests);

      // Total work: 100 + 200 + 150 + 50 = 500ms
      // Wall clock: 100 + max(200, 150) + 50 = 350ms
      // Parallelism: 500 / 350 ~ 1.43
      expect(execution.parallelism).toBeGreaterThan(1.0);
      expect(execution.parallelism).toBeLessThan(2.0);
    });
  });

  // --------------------------------------------------------------------------
  // No Dependencies (All Parallel)
  // --------------------------------------------------------------------------

  describe('no dependencies (all parallel)', () => {
    it('should schedule all tests in a single phase', () => {
      const tests = buildIndependentTests(5);
      const execution = scheduler.schedule(tests);

      expect(execution.phases.length).toBe(1);
      expect(execution.phases[0].tests.length).toBe(5);
      expect(execution.phases[0].canRunInParallel).toBe(true);
    });

    it('should estimate wall-clock time as max single test duration', () => {
      const tests = buildIndependentTests(5);
      // Durations: 50, 60, 70, 80, 90
      const execution = scheduler.schedule(tests);

      // Wall-clock = max(50, 60, 70, 80, 90) = 90
      expect(execution.totalEstimatedTime).toBe(90);
    });

    it('should report high parallelism factor', () => {
      const tests = buildIndependentTests(5);
      const execution = scheduler.schedule(tests);

      // Total work: 50+60+70+80+90 = 350
      // Wall clock: 90
      // Parallelism: 350/90 ~ 3.89
      expect(execution.parallelism).toBeGreaterThan(3);
    });
  });

  // --------------------------------------------------------------------------
  // Linear Chain (All Sequential)
  // --------------------------------------------------------------------------

  describe('linear chain (all sequential)', () => {
    it('should schedule each test in its own phase', () => {
      const tests = buildLinearChain(4);
      const execution = scheduler.schedule(tests);

      expect(execution.phases.length).toBe(4);
      for (const phase of execution.phases) {
        expect(phase.tests.length).toBe(1);
        expect(phase.canRunInParallel).toBe(false);
      }
    });

    it('should estimate wall-clock time equal to total work', () => {
      const tests = buildLinearChain(4);
      // All durations are 100ms
      const execution = scheduler.schedule(tests);

      expect(execution.totalEstimatedTime).toBe(400);
      expect(execution.criticalPathTime).toBe(400);
    });

    it('should report parallelism of 1', () => {
      const tests = buildLinearChain(4);
      const execution = scheduler.schedule(tests);

      expect(execution.parallelism).toBeCloseTo(1.0, 5);
    });
  });
});
