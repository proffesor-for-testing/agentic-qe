/**
 * Agentic QE v3 - Task DAG Graph Algorithms
 * ADR-064 Phase 1E: topological sort (Kahn), cycle detection (DFS
 * coloring) and critical path (longest-path DP) over a TaskDAG's edges.
 *
 * Edges that point at IDs not present in `nodes` (missing or removed
 * prerequisites) are ignored for ordering purposes.
 */

import type { DAGTask } from './types.js';

/** Read-only view of the graph used by the algorithms */
export interface DAGGraphView {
  readonly nodes: ReadonlyMap<string, DAGTask>;
  /** taskId -> prerequisite IDs */
  readonly forwardEdges: ReadonlyMap<string, ReadonlySet<string>>;
  /** prerequisiteId -> dependent IDs */
  readonly reverseEdges: ReadonlyMap<string, ReadonlySet<string>>;
}

/** DFS node coloring for cycle detection */
const enum NodeColor { White = 0, Gray = 1, Black = 2 }

/**
 * Topological sort using Kahn's algorithm.
 * @throws Error if cycles exist
 */
export function topologicalSort(graph: DAGGraphView): DAGTask[] {
  const { nodes, forwardEdges, reverseEdges } = graph;
  const inDegree = new Map<string, number>();
  for (const nodeId of nodes.keys()) {
    let count = 0;
    const fwd = forwardEdges.get(nodeId);
    if (fwd) {
      for (const dep of fwd) {
        if (nodes.has(dep)) count++;
      }
    }
    inDegree.set(nodeId, count);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: DAGTask[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const task = nodes.get(nodeId);
    if (task) sorted.push(task);

    const dependents = reverseEdges.get(nodeId);
    if (dependents) {
      for (const depId of dependents) {
        if (!nodes.has(depId)) continue;
        const newDeg = (inDegree.get(depId) ?? 0) - 1;
        inDegree.set(depId, newDeg);
        if (newDeg === 0) queue.push(depId);
      }
    }
  }

  if (sorted.length !== nodes.size) {
    throw new Error(
      `Cycle detected: sorted ${sorted.length} of ${nodes.size} tasks`
    );
  }
  return sorted;
}

/**
 * Detect cycles using DFS with white/gray/black coloring.
 * @returns Array of cycles (empty if acyclic)
 */
export function findCycles(graph: DAGGraphView): string[][] {
  const color = new Map<string, NodeColor>();
  const parent = new Map<string, string | null>();
  const cycles: string[][] = [];

  for (const id of graph.nodes.keys()) color.set(id, NodeColor.White);
  for (const id of graph.nodes.keys()) {
    if (color.get(id) === NodeColor.White) {
      dfsCycles(graph, id, color, parent, cycles);
    }
  }
  return cycles;
}

/**
 * Find the critical path (longest path through the DAG).
 * @returns Tasks on the critical path in execution order
 */
export function criticalPath(graph: DAGGraphView): DAGTask[] {
  const { nodes, reverseEdges } = graph;
  if (nodes.size === 0) return [];

  let sorted: DAGTask[];
  try { sorted = topologicalSort(graph); } catch { return []; }

  const dist = new Map<string, number>();
  const pred = new Map<string, string | null>();
  for (const t of sorted) { dist.set(t.id, 1); pred.set(t.id, null); }

  for (const task of sorted) {
    const d = dist.get(task.id)!;
    const deps = reverseEdges.get(task.id);
    if (deps) {
      for (const depId of deps) {
        if (!nodes.has(depId)) continue;
        if (d + 1 > (dist.get(depId) ?? 1)) {
          dist.set(depId, d + 1);
          pred.set(depId, task.id);
        }
      }
    }
  }

  let maxDist = 0;
  let endNode: string | null = null;
  for (const [id, d] of dist) {
    if (d > maxDist) { maxDist = d; endNode = id; }
  }
  if (!endNode) return [];

  const path: DAGTask[] = [];
  let cur: string | null = endNode;
  while (cur !== null) {
    const t = nodes.get(cur);
    if (t) path.unshift(t);
    cur = pred.get(cur) ?? null;
  }
  return path;
}

function dfsCycles(
  graph: DAGGraphView,
  nodeId: string,
  color: Map<string, NodeColor>,
  parent: Map<string, string | null>,
  cycles: string[][]
): void {
  color.set(nodeId, NodeColor.Gray);
  const dependencies = graph.forwardEdges.get(nodeId);
  if (dependencies) {
    for (const depId of dependencies) {
      if (!graph.nodes.has(depId)) continue;
      const c = color.get(depId);
      if (c === NodeColor.White) {
        parent.set(depId, nodeId);
        dfsCycles(graph, depId, color, parent, cycles);
      } else if (c === NodeColor.Gray) {
        const cycle: string[] = [depId, nodeId];
        let cur = nodeId;
        while (cur !== depId) {
          const p = parent.get(cur);
          if (p === null || p === undefined || p === depId) break;
          cycle.push(p);
          cur = p;
        }
        cycles.push(cycle);
      }
    }
  }
  color.set(nodeId, NodeColor.Black);
}
