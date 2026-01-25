/**
 * Topology Analyzer
 * ADR-031: Strange Loop Self-Awareness
 *
 * Analyzes swarm topology to compute connectivity metrics,
 * find bottlenecks, and detect structural vulnerabilities.
 */

import type {
  SwarmTopology,
  ConnectivityMetrics,
  BottleneckInfo,
  BottleneckAnalysis,
} from './types.js';

// ============================================================================
// Graph Representation for Analysis
// ============================================================================

/**
 * Adjacency list representation of the graph
 */
interface AdjacencyGraph {
  nodes: Set<string>;
  adjacencyList: Map<string, Set<string>>;
}

// ============================================================================
// Topology Analyzer
// ============================================================================

/**
 * Analyzes swarm topology for connectivity metrics and bottlenecks
 */
export class TopologyAnalyzer {
  /**
   * Analyze connectivity of the swarm topology
   */
  analyzeConnectivity(topology: SwarmTopology): ConnectivityMetrics {
    const graph = this.buildGraph(topology);

    // Calculate metrics
    const components = this.countConnectedComponents(graph);
    const minCut = this.calculateMinCut(graph);
    const bottlenecks = this.findArticulationPoints(graph);
    const avgPathLength = this.calculateAveragePathLength(graph);
    const clusteringCoefficient = this.calculateClusteringCoefficient(graph);
    const density = this.calculateDensity(graph);
    const diameter = this.calculateDiameter(graph);

    return {
      minCut,
      components,
      bottlenecks,
      avgPathLength,
      clusteringCoefficient,
      density,
      diameter,
    };
  }

  /**
   * Perform detailed bottleneck analysis
   */
  analyzeBottlenecks(topology: SwarmTopology): BottleneckAnalysis {
    const graph = this.buildGraph(topology);
    const articulationPoints = this.findArticulationPoints(graph);

    const bottlenecks: BottleneckInfo[] = [];

    for (const agentId of articulationPoints) {
      // Remove this node and count components
      const withoutNode = this.removeNode(graph, agentId);
      const componentsAfterRemoval = this.countConnectedComponents(withoutNode);

      // Calculate criticality based on impact
      const criticality = this.calculateNodeCriticality(
        agentId,
        graph,
        componentsAfterRemoval
      );

      // Find affected agents (those that would be disconnected)
      const affectedAgents = this.findAffectedAgents(agentId, graph);

      bottlenecks.push({
        agentId,
        criticality,
        affectedAgents,
        recommendation: this.suggestMitigation(criticality, affectedAgents.length),
        componentsAfterRemoval,
      });
    }

    // Sort by criticality (most critical first)
    bottlenecks.sort((a, b) => b.criticality - a.criticality);

    const minCut = this.calculateMinCut(graph);
    const overallHealth = this.calculateHealthFromBottlenecks(bottlenecks, graph);

    return {
      bottlenecks,
      overallHealth,
      minCut,
      analyzedAt: Date.now(),
    };
  }

  // ============================================================================
  // Graph Construction
  // ============================================================================

  /**
   * Build an adjacency graph from topology
   */
  private buildGraph(topology: SwarmTopology): AdjacencyGraph {
    const nodes = new Set<string>();
    const adjacencyList = new Map<string, Set<string>>();

    // Add all nodes
    for (const agent of topology.agents) {
      nodes.add(agent.id);
      adjacencyList.set(agent.id, new Set());
    }

    // Add edges
    for (const edge of topology.edges) {
      if (adjacencyList.has(edge.source) && adjacencyList.has(edge.target)) {
        adjacencyList.get(edge.source)!.add(edge.target);
        if (edge.bidirectional) {
          adjacencyList.get(edge.target)!.add(edge.source);
        }
      }
    }

    return { nodes, adjacencyList };
  }

  /**
   * Remove a node from the graph (returns a new graph)
   */
  private removeNode(graph: AdjacencyGraph, nodeId: string): AdjacencyGraph {
    const nodes = new Set(graph.nodes);
    nodes.delete(nodeId);

    const adjacencyList = new Map<string, Set<string>>();
    for (const [node, neighbors] of graph.adjacencyList) {
      if (node !== nodeId) {
        const filteredNeighbors = new Set<string>();
        for (const neighbor of neighbors) {
          if (neighbor !== nodeId) {
            filteredNeighbors.add(neighbor);
          }
        }
        adjacencyList.set(node, filteredNeighbors);
      }
    }

    return { nodes, adjacencyList };
  }

  // ============================================================================
  // Connectivity Analysis
  // ============================================================================

  /**
   * Count connected components using DFS
   */
  private countConnectedComponents(graph: AdjacencyGraph): number {
    if (graph.nodes.size === 0) {
      return 0;
    }

    const visited = new Set<string>();
    let components = 0;

    for (const node of graph.nodes) {
      if (!visited.has(node)) {
        this.dfs(node, graph, visited);
        components++;
      }
    }

    return components;
  }

  /**
   * Depth-first search traversal
   */
  private dfs(
    start: string,
    graph: AdjacencyGraph,
    visited: Set<string>
  ): void {
    const stack: string[] = [start];

    while (stack.length > 0) {
      const node = stack.pop()!;
      if (visited.has(node)) continue;

      visited.add(node);

      const neighbors = graph.adjacencyList.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          stack.push(neighbor);
        }
      }
    }
  }

  /**
   * Calculate minimum cut (vertex connectivity approximation)
   * For simplicity, we use the minimum degree as a lower bound
   */
  private calculateMinCut(graph: AdjacencyGraph): number {
    if (graph.nodes.size <= 1) {
      return 0;
    }

    // The vertex connectivity is at most the minimum degree
    let minDegree = Infinity;
    for (const [, neighbors] of graph.adjacencyList) {
      minDegree = Math.min(minDegree, neighbors.size);
    }

    // Also check for articulation points
    const articulationPoints = this.findArticulationPoints(graph);
    if (articulationPoints.length > 0) {
      return 1; // There's at least one cut vertex
    }

    return minDegree === Infinity ? 0 : minDegree;
  }

  /**
   * Find articulation points (cut vertices) using Tarjan's algorithm
   */
  private findArticulationPoints(graph: AdjacencyGraph): string[] {
    if (graph.nodes.size <= 2) {
      return [];
    }

    const visited = new Set<string>();
    const disc = new Map<string, number>();
    const low = new Map<string, number>();
    const parent = new Map<string, string | null>();
    const articulationPoints = new Set<string>();
    let time = 0;

    const dfs = (u: string): void => {
      let children = 0;
      visited.add(u);
      disc.set(u, time);
      low.set(u, time);
      time++;

      const neighbors = graph.adjacencyList.get(u) || new Set();
      for (const v of neighbors) {
        if (!visited.has(v)) {
          children++;
          parent.set(v, u);
          dfs(v);

          low.set(u, Math.min(low.get(u)!, low.get(v)!));

          // u is an articulation point if:
          // 1. u is root and has two+ children
          // 2. u is not root and low[v] >= disc[u]
          if (parent.get(u) === null && children > 1) {
            articulationPoints.add(u);
          }
          if (parent.get(u) !== null && low.get(v)! >= disc.get(u)!) {
            articulationPoints.add(u);
          }
        } else if (v !== parent.get(u)) {
          low.set(u, Math.min(low.get(u)!, disc.get(v)!));
        }
      }
    };

    // Start DFS from each unvisited node
    for (const node of graph.nodes) {
      if (!visited.has(node)) {
        parent.set(node, null);
        dfs(node);
      }
    }

    return Array.from(articulationPoints);
  }

  /**
   * Calculate average shortest path length using BFS
   */
  private calculateAveragePathLength(graph: AdjacencyGraph): number {
    if (graph.nodes.size <= 1) {
      return 0;
    }

    let totalLength = 0;
    let pathCount = 0;

    for (const source of graph.nodes) {
      const distances = this.bfsDistances(source, graph);
      for (const [, distance] of distances) {
        if (distance > 0 && distance !== Infinity) {
          totalLength += distance;
          pathCount++;
        }
      }
    }

    return pathCount > 0 ? totalLength / pathCount : 0;
  }

  /**
   * BFS to find shortest distances from a source node
   */
  private bfsDistances(
    source: string,
    graph: AdjacencyGraph
  ): Map<string, number> {
    const distances = new Map<string, number>();
    for (const node of graph.nodes) {
      distances.set(node, Infinity);
    }
    distances.set(source, 0);

    const queue: string[] = [source];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDist = distances.get(current)!;

      const neighbors = graph.adjacencyList.get(current) || new Set();
      for (const neighbor of neighbors) {
        if (distances.get(neighbor) === Infinity) {
          distances.set(neighbor, currentDist + 1);
          queue.push(neighbor);
        }
      }
    }

    return distances;
  }

  /**
   * Calculate clustering coefficient (average local clustering)
   */
  private calculateClusteringCoefficient(graph: AdjacencyGraph): number {
    if (graph.nodes.size <= 2) {
      return 0;
    }

    let totalCoefficient = 0;
    let validNodes = 0;

    for (const node of graph.nodes) {
      const neighborSet = graph.adjacencyList.get(node) || new Set<string>();
      const neighbors: string[] = Array.from(neighborSet);
      const k = neighbors.length;

      if (k < 2) {
        continue; // Cannot form triangles
      }

      // Count edges between neighbors
      let neighborEdges = 0;
      for (let i = 0; i < neighbors.length; i++) {
        for (let j = i + 1; j < neighbors.length; j++) {
          const neighborsOfI = graph.adjacencyList.get(neighbors[i]);
          if (neighborsOfI && neighborsOfI.has(neighbors[j])) {
            neighborEdges++;
          }
        }
      }

      // Local clustering coefficient
      const possibleEdges = (k * (k - 1)) / 2;
      const localCoefficient = possibleEdges > 0 ? neighborEdges / possibleEdges : 0;
      totalCoefficient += localCoefficient;
      validNodes++;
    }

    return validNodes > 0 ? totalCoefficient / validNodes : 0;
  }

  /**
   * Calculate graph density
   */
  private calculateDensity(graph: AdjacencyGraph): number {
    const n = graph.nodes.size;
    if (n <= 1) {
      return 0;
    }

    let edgeCount = 0;
    for (const neighbors of graph.adjacencyList.values()) {
      edgeCount += neighbors.size;
    }

    // For undirected graph, each edge is counted twice
    const actualEdges = edgeCount / 2;
    const possibleEdges = (n * (n - 1)) / 2;

    return possibleEdges > 0 ? actualEdges / possibleEdges : 0;
  }

  /**
   * Calculate graph diameter (longest shortest path)
   */
  private calculateDiameter(graph: AdjacencyGraph): number {
    if (graph.nodes.size <= 1) {
      return 0;
    }

    let maxDistance = 0;

    for (const source of graph.nodes) {
      const distances = this.bfsDistances(source, graph);
      for (const distance of distances.values()) {
        if (distance !== Infinity && distance > maxDistance) {
          maxDistance = distance;
        }
      }
    }

    return maxDistance;
  }

  // ============================================================================
  // Bottleneck Analysis Helpers
  // ============================================================================

  /**
   * Calculate criticality of a node based on its removal impact
   */
  private calculateNodeCriticality(
    nodeId: string,
    graph: AdjacencyGraph,
    componentsAfterRemoval: number
  ): number {
    const originalComponents = this.countConnectedComponents(graph);
    const neighbors = graph.adjacencyList.get(nodeId);
    const degree = neighbors ? neighbors.size : 0;

    // Criticality factors:
    // 1. Component increase (0.4 weight)
    const componentIncrease = componentsAfterRemoval - originalComponents;
    const componentFactor = Math.min(componentIncrease / 3, 1) * 0.4;

    // 2. Degree centrality (0.3 weight)
    const maxDegree = Math.max(
      ...Array.from(graph.adjacencyList.values()).map(n => n.size)
    );
    const degreeFactor = maxDegree > 0 ? (degree / maxDegree) * 0.3 : 0;

    // 3. Is it the only path between some nodes? (0.3 weight)
    const pathFactor = componentIncrease > 0 ? 0.3 : 0;

    return Math.min(componentFactor + degreeFactor + pathFactor, 1);
  }

  /**
   * Find agents that would be disconnected if a node is removed
   */
  private findAffectedAgents(
    nodeId: string,
    graph: AdjacencyGraph
  ): string[] {
    const graphWithout = this.removeNode(graph, nodeId);

    // Find the largest component
    const visited = new Set<string>();
    const componentSizes: { nodes: string[]; size: number }[] = [];

    for (const node of graphWithout.nodes) {
      if (!visited.has(node)) {
        const componentNodes: string[] = [];
        const stack: string[] = [node];

        while (stack.length > 0) {
          const current = stack.pop()!;
          if (visited.has(current)) continue;

          visited.add(current);
          componentNodes.push(current);

          const neighbors = graphWithout.adjacencyList.get(current) || new Set();
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
              stack.push(neighbor);
            }
          }
        }

        componentSizes.push({ nodes: componentNodes, size: componentNodes.length });
      }
    }

    // Sort by size descending
    componentSizes.sort((a, b) => b.size - a.size);

    // All nodes not in the largest component are affected
    if (componentSizes.length <= 1) {
      return [];
    }

    const affected: string[] = [];
    for (let i = 1; i < componentSizes.length; i++) {
      affected.push(...componentSizes[i].nodes);
    }

    return affected;
  }

  /**
   * Suggest mitigation action based on criticality
   */
  private suggestMitigation(criticality: number, affectedCount: number): string {
    if (criticality > 0.8) {
      return 'spawn_redundant_agent';
    } else if (criticality > 0.5) {
      return 'add_connection';
    } else if (affectedCount > 3) {
      return 'redistribute_load';
    } else {
      return 'monitor';
    }
  }

  /**
   * Calculate overall health based on bottleneck analysis
   */
  private calculateHealthFromBottlenecks(
    bottlenecks: BottleneckInfo[],
    graph: AdjacencyGraph
  ): number {
    if (bottlenecks.length === 0) {
      return 1.0;
    }

    // Factor 1: Number of bottlenecks relative to total nodes
    const bottleneckRatio = bottlenecks.length / Math.max(graph.nodes.size, 1);
    const bottleneckPenalty = Math.min(bottleneckRatio * 2, 0.5);

    // Factor 2: Maximum criticality
    const maxCriticality = Math.max(...bottlenecks.map(b => b.criticality));
    const criticalityPenalty = maxCriticality * 0.3;

    // Factor 3: Total affected agents
    const uniqueAffected = new Set(bottlenecks.flatMap(b => b.affectedAgents));
    const affectedRatio = uniqueAffected.size / Math.max(graph.nodes.size, 1);
    const affectedPenalty = Math.min(affectedRatio, 0.2);

    return Math.max(0, 1 - bottleneckPenalty - criticalityPenalty - affectedPenalty);
  }
}

/**
 * Create a topology analyzer instance
 */
export function createTopologyAnalyzer(): TopologyAnalyzer {
  return new TopologyAnalyzer();
}
