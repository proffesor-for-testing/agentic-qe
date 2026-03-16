/**
 * DAG Attention Scheduler for Intelligent Test Execution Ordering
 * RuVector Integration Plan - Phase 4, Task 4.2
 *
 * Uses DAG-based attention mechanisms to intelligently order test execution:
 * - Critical Path Attention: Identifies the longest chain in the test dependency DAG
 * - Parallel Branch Attention: Finds sets of tests that can run concurrently
 * - MinCut-Gated Attention: Prunes low-value tests to speed up execution
 *
 * Self-learning: tracks execution times and improves ordering over runs.
 * TypeScript implementation (no native package exists for DAG attention).
 *
 * @module test-scheduling/dag-attention-scheduler
 */

import type {
  TestNode,
  TestDAG,
  SchedulePhase,
  ScheduledExecution,
  SchedulerStats,
  ExecutionRecord,
} from './dag-attention-types.js';

// Re-export types for consumers
export type {
  TestNode,
  TestDAG,
  SchedulePhase,
  ScheduledExecution,
  SchedulerStats,
} from './dag-attention-types.js';

// ============================================================================
// Native WASM Backend Status
// No native package exists for DAG attention — the TypeScript
// implementation IS the production implementation.
// ============================================================================

const _nativeAvailable = false;

// ============================================================================
// DAGAttentionScheduler
// ============================================================================

/**
 * DAG-based test scheduler using attention mechanisms for intelligent ordering.
 *
 * Three attention types control scheduling:
 * 1. Critical Path Attention - finds the longest dependency chain
 * 2. Parallel Branch Attention - finds independent test groups
 * 3. MinCut-Gated Attention - prunes low-value tests under a time budget
 *
 * Self-learning: records actual execution times and adjusts estimated
 * durations over successive runs via exponential moving average.
 */
export class DAGAttentionScheduler {
  private executionHistory: ExecutionRecord[] = [];
  private learnedDurations: Map<string, number> = new Map();
  private runCount = 0;
  private lastPrunedCount = 0;
  private readonly learningRate: number;
  private readonly maxHistorySize: number;

  constructor(options?: { learningRate?: number; maxHistorySize?: number }) {
    this.learningRate = options?.learningRate ?? 0.3;
    this.maxHistorySize = options?.maxHistorySize ?? 10_000;
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Build the internal TestDAG from an array of test nodes.
   * Validates dependencies, computes forward edges, critical path,
   * and parallel groups.
   * @throws Error if a dependency references a non-existent test ID
   */
  buildTestDAG(tests: TestNode[]): TestDAG {
    const nodes = new Map<string, TestNode>();
    const edges = new Map<string, string[]>();

    for (const test of tests) {
      const adjusted = this.applyLearnedDuration(test);
      nodes.set(adjusted.id, adjusted);
      edges.set(adjusted.id, []);
    }

    for (const test of tests) {
      for (const depId of test.dependencies) {
        if (!nodes.has(depId)) {
          throw new Error(
            `Test '${test.id}' depends on '${depId}' which does not exist in the test set`
          );
        }
        edges.get(depId)!.push(test.id);
      }
    }

    const criticalPath = this.computeCriticalPath(nodes, edges);
    const parallelGroups = this.computeParallelGroups(nodes, edges);

    return { nodes, edges, criticalPath, parallelGroups };
  }

  /** Find the critical path (longest duration chain) through the DAG. */
  findCriticalPath(dag: TestDAG): TestNode[] {
    return dag.criticalPath
      .map((id) => dag.nodes.get(id))
      .filter((n): n is TestNode => n !== undefined);
  }

  /** Find groups of tests that can execute concurrently. */
  findParallelBranches(dag: TestDAG): TestNode[][] {
    return dag.parallelGroups.map((group) =>
      group
        .map((id) => dag.nodes.get(id))
        .filter((n): n is TestNode => n !== undefined)
    );
  }

  /**
   * Prune low-value tests from the DAG to fit within a time budget.
   * Tests are scored by attention weight (priority * failure weight *
   * downstream impact). Lowest-scored tests are removed first, unless
   * they are on the critical path or have active dependents.
   */
  pruneByMinCut(dag: TestDAG, budget: number): TestDAG {
    const totalDuration = this.sumDurations(dag.nodes);
    if (totalDuration <= budget) {
      this.lastPrunedCount = 0;
      return dag;
    }

    const scores = this.computeAttentionScores(dag);
    const sortedTests = Array.from(scores.entries()).sort(
      (a, b) => a[1] - b[1]
    );

    const criticalSet = new Set(dag.criticalPath);
    const prunedIds = new Set<string>();
    let currentDuration = totalDuration;

    for (const [testId] of sortedTests) {
      if (currentDuration <= budget) break;
      if (criticalSet.has(testId)) continue;

      const dependents = dag.edges.get(testId) ?? [];
      if (dependents.some((depId) => !prunedIds.has(depId))) continue;

      const node = dag.nodes.get(testId);
      if (!node) continue;

      prunedIds.add(testId);
      currentDuration -= node.estimatedDuration;
    }

    this.lastPrunedCount = prunedIds.size;
    const remaining = Array.from(dag.nodes.values()).filter(
      (n) => !prunedIds.has(n.id)
    );
    return this.buildTestDAG(remaining);
  }

  /** Produce a complete execution schedule for the given tests. */
  schedule(tests: TestNode[]): ScheduledExecution {
    if (tests.length === 0) {
      return { phases: [], totalEstimatedTime: 0, criticalPathTime: 0, parallelism: 0 };
    }

    const dag = this.buildTestDAG(tests);
    const parallelBranches = this.findParallelBranches(dag);

    const phases: SchedulePhase[] = parallelBranches.map((group) => ({
      tests: group,
      canRunInParallel: group.length > 1,
    }));

    const criticalPathTime = this.computeCriticalPathDuration(dag);
    const totalWork = this.sumDurations(dag.nodes);

    const wallClockEstimate = phases.reduce((total, phase) => {
      if (phase.canRunInParallel) {
        return total + Math.max(...phase.tests.map((t) => t.estimatedDuration));
      }
      return total + phase.tests.reduce((s, t) => s + t.estimatedDuration, 0);
    }, 0);

    const parallelism = wallClockEstimate > 0 ? totalWork / wallClockEstimate : 1;
    this.runCount++;

    return { phases, totalEstimatedTime: wallClockEstimate, criticalPathTime, parallelism };
  }

  /** Return optimization statistics. */
  getOptimizationStats(): SchedulerStats {
    return {
      totalTests: 0,
      criticalPathLength: 0,
      parallelGroupCount: 0,
      prunedTests: this.lastPrunedCount,
      estimatedTimeSaved: 0,
      historicalRuns: this.runCount,
      usingNativeBackend: _nativeAvailable,
    };
  }

  /** Record actual execution results for self-learning via EMA. */
  recordExecution(testId: string, actualDuration: number, result: 'pass' | 'fail' | 'skip'): void {
    this.executionHistory.push({ testId, actualDuration, result, timestamp: Date.now() });
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory = this.executionHistory.slice(-this.maxHistorySize);
    }

    const current = this.learnedDurations.get(testId);
    if (current !== undefined) {
      this.learnedDurations.set(
        testId,
        current * (1 - this.learningRate) + actualDuration * this.learningRate
      );
    } else {
      this.learnedDurations.set(testId, actualDuration);
    }
  }

  /** Get learned duration for a test, or undefined if no history. */
  getLearnedDuration(testId: string): number | undefined {
    return this.learnedDurations.get(testId);
  }

  /** Check whether the native ruvector-dag-wasm backend is available. */
  isNativeBackendAvailable(): boolean {
    return _nativeAvailable;
  }

  // --------------------------------------------------------------------------
  // Internal: Critical Path (longest-path DP on topological order)
  // --------------------------------------------------------------------------

  private computeCriticalPath(
    nodes: Map<string, TestNode>,
    edges: Map<string, string[]>
  ): string[] {
    const sorted = this.topologicalSort(nodes, edges);
    if (sorted.length === 0) return [];

    const dist = new Map<string, number>();
    const pred = new Map<string, string | null>();
    for (const id of sorted) {
      dist.set(id, nodes.get(id)!.estimatedDuration);
      pred.set(id, null);
    }

    for (const id of sorted) {
      const currentDist = dist.get(id)!;
      for (const depId of edges.get(id) ?? []) {
        const depNode = nodes.get(depId);
        if (!depNode) continue;
        const newDist = currentDist + depNode.estimatedDuration;
        if (newDist > (dist.get(depId) ?? 0)) {
          dist.set(depId, newDist);
          pred.set(depId, id);
        }
      }
    }

    let maxDist = 0;
    let endNode: string | null = null;
    for (const [id, d] of dist) {
      if (d > maxDist) { maxDist = d; endNode = id; }
    }
    if (!endNode) return [];

    const path: string[] = [];
    let cur: string | null = endNode;
    while (cur !== null) { path.unshift(cur); cur = pred.get(cur) ?? null; }
    return path;
  }

  private computeCriticalPathDuration(dag: TestDAG): number {
    return dag.criticalPath.reduce(
      (total, id) => total + (dag.nodes.get(id)?.estimatedDuration ?? 0), 0
    );
  }

  // --------------------------------------------------------------------------
  // Internal: Parallel Groups (topological levels)
  // --------------------------------------------------------------------------

  private computeParallelGroups(
    nodes: Map<string, TestNode>,
    edges: Map<string, string[]>
  ): string[][] {
    const sorted = this.topologicalSort(nodes, edges);
    if (sorted.length === 0) return [];

    const depSets = new Map<string, Set<string>>();
    for (const [id, node] of nodes) {
      depSets.set(id, new Set(node.dependencies));
    }

    const level = new Map<string, number>();
    for (const id of sorted) {
      let maxDepLevel = -1;
      for (const depId of depSets.get(id) ?? new Set()) {
        const depLevel = level.get(depId);
        if (depLevel !== undefined && depLevel > maxDepLevel) maxDepLevel = depLevel;
      }
      level.set(id, maxDepLevel + 1);
    }

    const groups = new Map<number, string[]>();
    for (const id of sorted) {
      const lvl = level.get(id) ?? 0;
      if (!groups.has(lvl)) groups.set(lvl, []);
      groups.get(lvl)!.push(id);
    }

    const maxLevel = Math.max(...Array.from(groups.keys()), -1);
    const result: string[][] = [];
    for (let i = 0; i <= maxLevel; i++) {
      const group = groups.get(i);
      if (group && group.length > 0) result.push(group);
    }
    return result;
  }

  // --------------------------------------------------------------------------
  // Internal: Attention Scores for MinCut Pruning
  // --------------------------------------------------------------------------

  private computeAttentionScores(dag: TestDAG): Map<string, number> {
    const scores = new Map<string, number>();
    const transitiveCounts = this.countTransitiveDependents(dag);

    for (const [id, node] of dag.nodes) {
      const failureWeight = node.lastResult === 'fail' ? 2.0 : 1.0;
      const downstream = transitiveCounts.get(id) ?? 0;
      scores.set(id, node.priority * failureWeight * (1 + downstream));
    }
    return scores;
  }

  private countTransitiveDependents(dag: TestDAG): Map<string, number> {
    const counts = new Map<string, number>();
    const visited = new Map<string, Set<string>>();

    const getTransitive = (id: string): Set<string> => {
      if (visited.has(id)) return visited.get(id)!;
      const result = new Set<string>();
      for (const depId of dag.edges.get(id) ?? []) {
        result.add(depId);
        for (const transId of getTransitive(depId)) result.add(transId);
      }
      visited.set(id, result);
      return result;
    };

    for (const id of dag.nodes.keys()) {
      counts.set(id, getTransitive(id).size);
    }
    return counts;
  }

  // --------------------------------------------------------------------------
  // Internal: Topological Sort (Kahn's Algorithm)
  // --------------------------------------------------------------------------

  private topologicalSort(
    nodes: Map<string, TestNode>,
    edges: Map<string, string[]>
  ): string[] {
    const inDegree = new Map<string, number>();
    for (const id of nodes.keys()) inDegree.set(id, 0);
    for (const children of edges.values()) {
      for (const childId of children) {
        if (inDegree.has(childId)) {
          inDegree.set(childId, (inDegree.get(childId) ?? 0) + 1);
        }
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) { if (deg === 0) queue.push(id); }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      sorted.push(nodeId);
      for (const childId of edges.get(nodeId) ?? []) {
        const newDeg = (inDegree.get(childId) ?? 0) - 1;
        inDegree.set(childId, newDeg);
        if (newDeg === 0) queue.push(childId);
      }
    }

    if (sorted.length !== nodes.size) {
      throw new Error(
        `Cycle detected in test DAG: sorted ${sorted.length} of ${nodes.size} nodes`
      );
    }
    return sorted;
  }

  // --------------------------------------------------------------------------
  // Internal: Self-Learning
  // --------------------------------------------------------------------------

  private applyLearnedDuration(test: TestNode): TestNode {
    const learned = this.learnedDurations.get(test.id);
    if (learned !== undefined) {
      return { ...test, estimatedDuration: Math.round(learned) };
    }
    return test;
  }

  // --------------------------------------------------------------------------
  // Internal: Utilities
  // --------------------------------------------------------------------------

  private sumDurations(nodes: Map<string, TestNode>): number {
    let total = 0;
    for (const node of nodes.values()) total += node.estimatedDuration;
    return total;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/** Create a DAGAttentionScheduler with optional configuration. */
export function createDAGAttentionScheduler(options?: {
  learningRate?: number;
  maxHistorySize?: number;
}): DAGAttentionScheduler {
  return new DAGAttentionScheduler(options);
}
