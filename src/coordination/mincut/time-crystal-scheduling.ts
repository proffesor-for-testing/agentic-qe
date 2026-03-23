/**
 * Agentic QE v3 - Time Crystal Scheduling Algorithms
 * ADR-047: MinCut Self-Organizing QE Integration - Phase 4
 *
 * Pure functions for computing optimal execution order, topological sorting,
 * parallel execution groups, and schedule optimization decisions.
 */

import type {
  CrystalLattice,
  CrystalObservation,
  ScheduleOptimization,
  TimeCrystalConfig,
} from './time-crystal-types';
import type { TestFailureCausalGraph } from './causal-discovery';

/**
 * Compute optimal execution order based on priority and execution time
 */
export function computeOptimalOrder(lattice: CrystalLattice): string[] {
  const nodes = Array.from(lattice.nodes.values());

  // Sort by priority (higher first), then by execution time (shorter first)
  nodes.sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    return a.avgExecutionTime - b.avgExecutionTime;
  });

  // Apply topological sort for dependencies
  return topologicalSort(nodes.map(n => n.id), lattice);
}

/**
 * Topological sort respecting dependencies (Kahn's algorithm)
 */
export function topologicalSort(nodeIds: string[], lattice: CrystalLattice): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // Initialize
  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  // Build adjacency and in-degree from dependencies
  for (const dep of lattice.dependencies) {
    if (dep.type === 'must-precede' || dep.type === 'should-precede') {
      const targets = adjacency.get(dep.sourceId) || [];
      targets.push(dep.targetId);
      adjacency.set(dep.sourceId, targets);

      const degree = inDegree.get(dep.targetId) || 0;
      inDegree.set(dep.targetId, degree + 1);
    }
  }

  // Kahn's algorithm
  const queue = nodeIds.filter(id => (inDegree.get(id) || 0) === 0);
  const result: string[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);

    for (const neighbor of adjacency.get(node) || []) {
      const degree = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, degree);

      if (degree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Add any remaining nodes (in case of cycles)
  for (const id of nodeIds) {
    if (!result.includes(id)) {
      result.push(id);
    }
  }

  return result;
}

/**
 * Compute parallel execution groups respecting dependencies and conflicts
 */
export function computeParallelGroups(
  lattice: CrystalLattice,
  maxParallelGroups: number,
): string[][] {
  const groups: string[][] = [];
  const scheduled = new Set<string>();
  const nodes = Array.from(lattice.nodes.values());

  while (scheduled.size < nodes.length) {
    const group: string[] = [];

    for (const node of nodes) {
      if (scheduled.has(node.id)) continue;

      // Check if all dependencies are satisfied
      const canSchedule = lattice.dependencies
        .filter(d => d.targetId === node.id && (d.type === 'must-precede' || d.type === 'should-precede'))
        .every(d => scheduled.has(d.sourceId));

      // Check for conflicts with current group
      const hasConflict = lattice.dependencies
        .filter(d => d.type === 'conflicts')
        .some(d =>
          (d.sourceId === node.id && group.includes(d.targetId)) ||
          (d.targetId === node.id && group.includes(d.sourceId))
        );

      if (canSchedule && !hasConflict && group.length < maxParallelGroups) {
        group.push(node.id);
      }
    }

    if (group.length === 0) {
      // No progress - break to avoid infinite loop
      break;
    }

    groups.push(group);
    for (const id of group) {
      scheduled.add(id);
    }
  }

  return groups;
}

/**
 * Check if two execution orders differ significantly (>20% positions changed)
 */
export function ordersDiffer(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return true;

  let differences = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      differences++;
    }
  }

  // Consider different if more than 20% of positions changed
  return differences > a.length * 0.2;
}

/**
 * Determine the optimal schedule optimization action
 */
export function determineOptimization(
  lattice: CrystalLattice,
  observations: CrystalObservation[],
  causalGraph: TestFailureCausalGraph | undefined,
  maxParallelGroups: number,
): ScheduleOptimization {
  // Check if optimization is needed
  const lastObs = observations[observations.length - 1];
  if (!lastObs || lastObs.attractor === 'stable' && lastObs.anomalies.length === 0) {
    return { type: 'no_change', reason: 'System is stable with no anomalies' };
  }

  // Analyze execution order for optimization
  const optimizedOrder = computeOptimalOrder(lattice);

  if (ordersDiffer(optimizedOrder, lattice.executionOrder)) {
    return { type: 'reorder', newOrder: optimizedOrder };
  }

  // Analyze parallelization opportunities
  const parallelGroups = computeParallelGroups(lattice, maxParallelGroups);

  if (parallelGroups.length > lattice.parallelGroups.length) {
    return { type: 'parallelize', groups: parallelGroups };
  }

  // Check for flaky tests to skip
  if (causalGraph) {
    const recentFailures = causalGraph.getAllFailures()
      .filter(f => Date.now() - f.timestamp.getTime() < 3600000); // Last hour

    const failureCounts = new Map<string, number>();
    for (const failure of recentFailures) {
      const count = failureCounts.get(failure.testId) || 0;
      failureCounts.set(failure.testId, count + 1);
    }

    // Find repeatedly failing tests
    for (const [testId, count] of Array.from(failureCounts.entries())) {
      if (count >= 3) {
        return {
          type: 'skip',
          nodeId: testId,
          reason: `Test has failed ${count} times in the last hour`,
        };
      }
    }
  }

  return { type: 'no_change', reason: 'No optimization opportunities found' };
}

/**
 * Rebuild lattice from a causal graph's failure data
 */
export function rebuildLatticeFromCausalGraph(
  lattice: CrystalLattice,
  causalGraph: TestFailureCausalGraph,
  maxParallelGroups: number,
): void {
  const failures = causalGraph.getAllFailures();
  const testIds = new Set<string>();

  for (const failure of failures) {
    testIds.add(failure.testId);
  }

  const testIdArray = Array.from(testIds);

  // Create nodes for each test
  for (const testId of testIdArray) {
    const testFailures = failures.filter(f => f.testId === testId);
    const avgDuration = 5000; // Default
    const failureRate = testFailures.length / Math.max(1, failures.length / testIds.size);

    lattice.nodes.set(testId, {
      id: testId,
      type: 'test',
      avgExecutionTime: avgDuration,
      failureProbability: Math.min(1, failureRate),
      priority: 1 - failureRate, // Lower priority for flaky tests
      resources: { cpu: 1, memory: 256, io: 1 },
    });
  }

  // Build dependencies from causal links
  for (const testId of testIdArray) {
    const testFailures = failures.filter(f => f.testId === testId);
    for (const failure of testFailures) {
      const effects = causalGraph.getEffects(failure.id);
      for (const effect of effects) {
        if (testId !== effect.testId) {
          // Check if dependency already exists
          const existing = lattice.dependencies.find(
            d => d.sourceId === testId && d.targetId === effect.testId
          );

          if (existing) {
            existing.observationCount++;
          } else {
            lattice.dependencies.push({
              sourceId: testId,
              targetId: effect.testId,
              type: 'should-precede',
              strength: 0.5,
              latencyMs: effect.timestamp.getTime() - failure.timestamp.getTime(),
              observationCount: 1,
            });
          }
        }
      }
    }
  }

  // Recompute execution order and parallel groups
  lattice.executionOrder = computeOptimalOrder(lattice);
  lattice.parallelGroups = computeParallelGroups(lattice, maxParallelGroups);
  lattice.lastOptimized = new Date();
}
