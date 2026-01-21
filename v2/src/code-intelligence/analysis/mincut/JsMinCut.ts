import { MinCutResult, MinCutGraphInput, MinCutGraph, StoerWagnerPhase } from './types.js';
import { Logger } from '../../../utils/Logger.js';

const logger = Logger.getInstance();

/**
 * Pure JavaScript implementation of the Stoer-Wagner minimum cut algorithm.
 *
 * Time Complexity: O(V³) or O(VE log V) with priority queue optimization
 * Space Complexity: O(V²)
 *
 * Reference: Stoer, M., & Wagner, F. (1997). A simple min-cut algorithm.
 * Journal of the ACM, 44(4), 585-591.
 */
export class JsMinCut {
  /**
   * Compute the minimum cut of an undirected weighted graph using Stoer-Wagner algorithm
   *
   * @param input - Graph input with nodes and edges
   * @param normalizeWeights - Whether to normalize edge weights to [0, 1]
   * @returns MinCutResult with the minimum cut value and partitions
   */
  public computeMinCut(input: MinCutGraphInput, normalizeWeights = true): MinCutResult {
    const startTime = performance.now();

    // Convert to internal graph representation
    const graph = this.buildGraph(input, normalizeWeights);

    if (graph.nodeCount === 0) {
      return this.emptyResult(startTime);
    }

    if (graph.nodeCount === 1) {
      return this.singleNodeResult(graph, startTime);
    }

    // Run Stoer-Wagner algorithm
    const { minCut, partition1, partition2 } = this.stoerWagner(graph);

    // Find cut edges
    const cutEdges = this.findCutEdges(input, partition1, partition2);

    const computationTimeMs = performance.now() - startTime;

    return {
      cutValue: minCut,
      partition1: Array.from(partition1),
      partition2: Array.from(partition2),
      cutEdges,
      algorithmUsed: 'stoer-wagner',
      computationTimeMs,
    };
  }

  /**
   * Build internal graph representation from input
   */
  private buildGraph(input: MinCutGraphInput, normalizeWeights: boolean): MinCutGraph {
    const adjacency = new Map<string, Map<string, number>>();
    const nodeSet = new Set<string>();

    // Initialize adjacency lists
    for (const node of input.nodes) {
      nodeSet.add(node.id);
      adjacency.set(node.id, new Map());
    }

    // Find max weight for normalization
    let maxWeight = 1;
    if (normalizeWeights) {
      maxWeight = Math.max(...input.edges.map(e => e.weight), 1);
    }

    // Add edges (treat directed as undirected)
    for (const edge of input.edges) {
      const weight = normalizeWeights ? edge.weight / maxWeight : edge.weight;

      // Add edge in both directions for undirected graph
      const sourceAdj = adjacency.get(edge.source);
      const targetAdj = adjacency.get(edge.target);

      if (sourceAdj && targetAdj) {
        // Sum weights if multiple edges exist
        sourceAdj.set(edge.target, (sourceAdj.get(edge.target) || 0) + weight);
        targetAdj.set(edge.source, (targetAdj.get(edge.source) || 0) + weight);
      }
    }

    return {
      adjacency,
      nodes: Array.from(nodeSet),
      nodeCount: nodeSet.size,
    };
  }

  /**
   * Stoer-Wagner minimum cut algorithm
   *
   * The algorithm works by repeatedly finding a minimum s-t cut and
   * merging the nodes s and t, until only one node remains.
   */
  private stoerWagner(graph: MinCutGraph): {
    minCut: number;
    partition1: Set<string>;
    partition2: Set<string>;
  } {
    // Track which original nodes belong to each contracted node
    const nodeGroups = new Map<string, Set<string>>();
    for (const node of graph.nodes) {
      nodeGroups.set(node, new Set([node]));
    }

    // Working copy of adjacency list
    const workingAdj = new Map<string, Map<string, number>>();
    for (const [node, neighbors] of Array.from(graph.adjacency.entries())) {
      workingAdj.set(node, new Map(Array.from(neighbors.entries())));
    }

    let activeNodes = new Set(graph.nodes);
    let minCutValue = Infinity;
    let bestPartition1 = new Set<string>();
    let bestPartition2 = new Set<string>();

    // Continue until only one node remains
    while (activeNodes.size > 1) {
      // Find minimum s-t cut of current graph
      const phase = this.minimumCutPhase(workingAdj, activeNodes);

      // Update global minimum if this phase found a better cut
      if (phase.cutValue < minCutValue) {
        minCutValue = phase.cutValue;

        // The partition is: {merged node} vs {everything else}
        const mergedGroup = nodeGroups.get(phase.mergedNode)!;
        bestPartition1 = new Set(mergedGroup);
        bestPartition2 = new Set<string>();

        const activeNodeArray = Array.from(activeNodes);
        for (const node of activeNodeArray) {
          if (node !== phase.mergedNode) {
            const group = nodeGroups.get(node)!;
            const groupArray = Array.from(group);
            groupArray.forEach(n => bestPartition2.add(n));
          }
        }
      }

      // Merge the two nodes (contract edge)
      this.mergeNodes(
        workingAdj,
        activeNodes,
        nodeGroups,
        phase.mergedNode,
        phase.targetNode
      );
    }

    return {
      minCut: minCutValue,
      partition1: bestPartition1,
      partition2: bestPartition2,
    };
  }

  /**
   * Minimum cut phase: finds the minimum s-t cut using maximum adjacency search
   *
   * This is essentially a modified Prim's algorithm that grows a set A by
   * always adding the most tightly connected vertex.
   */
  private minimumCutPhase(
    adjacency: Map<string, Map<string, number>>,
    activeNodes: Set<string>
  ): StoerWagnerPhase {
    const nodes = Array.from(activeNodes);

    // Start with an arbitrary node
    const startNode = nodes[0];
    const inA = new Set<string>([startNode]);

    // Track the most recently added node and the one before it
    let previousNode = startNode;
    let lastNode = startNode;

    // Weights from A to each vertex not in A
    const weights = new Map<string, number>();

    // Initialize weights from start node
    const startAdj = adjacency.get(startNode)!;
    for (const node of nodes) {
      if (node !== startNode) {
        weights.set(node, startAdj.get(node) || 0);
      }
    }

    // Grow A by adding most tightly connected vertices
    while (inA.size < nodes.length) {
      // Find vertex with maximum weight to A
      let maxWeight = -Infinity;
      let maxNode = '';

      const weightsArray = Array.from(weights.entries());
      for (const [node, weight] of weightsArray) {
        if (!inA.has(node) && weight > maxWeight) {
          maxWeight = weight;
          maxNode = node;
        }
      }

      // Add most tightly connected vertex to A
      inA.add(maxNode);
      previousNode = lastNode;
      lastNode = maxNode;

      // Update weights: for each neighbor of maxNode, add edge weight
      const maxNodeAdj = adjacency.get(maxNode)!;
      const maxNodeAdjArray = Array.from(maxNodeAdj.entries());
      for (const [neighbor, edgeWeight] of maxNodeAdjArray) {
        if (!inA.has(neighbor)) {
          weights.set(neighbor, (weights.get(neighbor) || 0) + edgeWeight);
        }
      }
    }

    // The cut-of-the-phase is the cut that separates the last added vertex
    // from the rest. Its value is the total weight from lastNode to A.
    const cutValue = weights.get(lastNode) || 0;

    return {
      cutValue,
      mergedNode: lastNode,
      targetNode: previousNode,
    };
  }

  /**
   * Merge two nodes by combining their adjacency lists
   */
  private mergeNodes(
    adjacency: Map<string, Map<string, number>>,
    activeNodes: Set<string>,
    nodeGroups: Map<string, Set<string>>,
    mergedNode: string,
    targetNode: string
  ): void {
    const mergedAdj = adjacency.get(mergedNode)!;
    const targetAdj = adjacency.get(targetNode)!;

    // Add all edges from mergedNode to targetNode
    const mergedAdjArray = Array.from(mergedAdj.entries());
    for (const [neighbor, weight] of mergedAdjArray) {
      if (neighbor === targetNode) continue; // Skip self-loop

      // Add weight to existing edge or create new edge
      const currentWeight = targetAdj.get(neighbor) || 0;
      targetAdj.set(neighbor, currentWeight + weight);

      // Update reverse edge
      const neighborAdj = adjacency.get(neighbor)!;
      neighborAdj.delete(mergedNode);
      neighborAdj.set(targetNode, (neighborAdj.get(targetNode) || 0) + weight);
    }

    // Merge node groups
    const mergedGroup = nodeGroups.get(mergedNode)!;
    const targetGroup = nodeGroups.get(targetNode)!;
    const mergedGroupArray = Array.from(mergedGroup);
    mergedGroupArray.forEach(node => targetGroup.add(node));

    // Remove merged node
    adjacency.delete(mergedNode);
    activeNodes.delete(mergedNode);
    targetAdj.delete(mergedNode);
  }

  /**
   * Find edges that cross the partition
   */
  private findCutEdges(
    input: MinCutGraphInput,
    partition1: Set<string>,
    partition2: Set<string>
  ) {
    const cutEdges = [];

    for (const edge of input.edges) {
      const sourceIn1 = partition1.has(edge.source);
      const targetIn1 = partition1.has(edge.target);

      // Edge crosses the cut if endpoints are in different partitions
      if (sourceIn1 !== targetIn1) {
        cutEdges.push({
          source: edge.source,
          target: edge.target,
          weight: edge.weight,
          edgeType: edge.edgeType,
        });
      }
    }

    return cutEdges;
  }

  /**
   * Handle empty graph
   */
  private emptyResult(startTime: number): MinCutResult {
    return {
      cutValue: 0,
      partition1: [],
      partition2: [],
      cutEdges: [],
      algorithmUsed: 'stoer-wagner',
      computationTimeMs: performance.now() - startTime,
    };
  }

  /**
   * Handle single-node graph
   */
  private singleNodeResult(graph: MinCutGraph, startTime: number): MinCutResult {
    return {
      cutValue: 0,
      partition1: [graph.nodes[0]],
      partition2: [],
      cutEdges: [],
      algorithmUsed: 'stoer-wagner',
      computationTimeMs: performance.now() - startTime,
    };
  }
}
