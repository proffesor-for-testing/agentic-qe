/**
 * Agentic QE v3 - Causal Graph Implementation
 * ADR-035: STDP-based spike timing correlation for root cause analysis
 *
 * Implements graph operations for causal analysis including:
 * - Reachability analysis
 * - Transitive closure (Floyd-Warshall)
 * - Path finding
 * - Strongly connected components (Tarjan's algorithm)
 */

import {
  CausalGraph,
  CausalEdge,
  TestEventType,
} from './types';

/**
 * Implementation of the CausalGraph interface
 */
export class CausalGraphImpl implements CausalGraph {
  private readonly edgeMap: Map<string, CausalEdge[]>;
  private readonly reverseEdgeMap: Map<string, CausalEdge[]>;

  constructor(
    public readonly nodes: TestEventType[],
    public readonly edges: CausalEdge[]
  ) {
    // Build adjacency maps for efficient lookup
    this.edgeMap = new Map();
    this.reverseEdgeMap = new Map();

    for (const node of nodes) {
      this.edgeMap.set(node, []);
      this.reverseEdgeMap.set(node, []);
    }

    for (const edge of edges) {
      const fromList = this.edgeMap.get(edge.source) ?? [];
      fromList.push(edge);
      this.edgeMap.set(edge.source, fromList);

      const toList = this.reverseEdgeMap.get(edge.target) ?? [];
      toList.push(edge);
      this.reverseEdgeMap.set(edge.target, toList);
    }
  }

  /**
   * Get all edges originating from a source node
   */
  edgesFrom(source: TestEventType): CausalEdge[] {
    return this.edgeMap.get(source) ?? [];
  }

  /**
   * Get all edges pointing to a target node
   */
  edgesTo(target: TestEventType): CausalEdge[] {
    return this.reverseEdgeMap.get(target) ?? [];
  }

  /**
   * Find all nodes reachable from a source via BFS
   */
  reachableFrom(source: TestEventType): Set<TestEventType> {
    const visited = new Set<TestEventType>();
    const queue: TestEventType[] = [source];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      for (const edge of this.edgesFrom(current)) {
        if (!visited.has(edge.target)) {
          queue.push(edge.target);
        }
      }
    }

    return visited;
  }

  /**
   * Find all nodes that can reach a target via reverse BFS
   */
  reachableTo(target: TestEventType): Set<TestEventType> {
    const visited = new Set<TestEventType>();
    const queue: TestEventType[] = [target];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      for (const edge of this.edgesTo(current)) {
        if (!visited.has(edge.source)) {
          queue.push(edge.source);
        }
      }
    }

    return visited;
  }

  /**
   * Compute transitive closure using Floyd-Warshall algorithm
   * Returns a new graph with all transitive edges
   */
  transitiveClosure(): CausalGraph {
    const n = this.nodes.length;
    if (n === 0) {
      return new CausalGraphImpl([], []);
    }

    const nodeIndex = new Map(this.nodes.map((node, i) => [node, i]));

    // Initialize strength matrix with direct edges
    const strength: number[][] = Array(n)
      .fill(null)
      .map(() => Array(n).fill(0));

    for (const edge of this.edges) {
      const i = nodeIndex.get(edge.source)!;
      const j = nodeIndex.get(edge.target)!;
      strength[i][j] = Math.max(strength[i][j], edge.strength);
    }

    // Floyd-Warshall for transitive closure
    // Use max for strength propagation (strongest path)
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i !== j && i !== k && j !== k) {
            // Path through k: i -> k -> j
            const indirect = Math.min(strength[i][k], strength[k][j]);
            if (indirect > strength[i][j]) {
              strength[i][j] = indirect;
            }
          }
        }
      }
    }

    // Build new edge list from transitive closure
    const newEdges: CausalEdge[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j && strength[i][j] > 0) {
          newEdges.push({
            source: this.nodes[i],
            target: this.nodes[j],
            strength: strength[i][j],
            relation: 'causes', // Transitive edges are all causal
            observations: 0, // Indirect observation
            lastObserved: Date.now(),
          });
        }
      }
    }

    return new CausalGraphImpl([...this.nodes], newEdges);
  }

  /**
   * Find all paths between two nodes using DFS with cycle detection
   * Returns paths sorted by total strength (strongest first)
   */
  findPaths(source: TestEventType, target: TestEventType): TestEventType[][] {
    const paths: TestEventType[][] = [];
    const maxPaths = 10; // Limit to prevent explosion
    const maxDepth = 10;

    const dfs = (current: TestEventType, path: TestEventType[], visited: Set<TestEventType>): void => {
      if (paths.length >= maxPaths) return;
      if (path.length > maxDepth) return;

      if (current === target && path.length > 1) {
        paths.push([...path]);
        return;
      }

      for (const edge of this.edgesFrom(current)) {
        if (!visited.has(edge.target)) {
          visited.add(edge.target);
          path.push(edge.target);
          dfs(edge.target, path, visited);
          path.pop();
          visited.delete(edge.target);
        }
      }
    };

    const visited = new Set<TestEventType>([source]);
    dfs(source, [source], visited);

    // Sort by path strength (product of edge strengths)
    return paths.sort((a, b) => {
      const strengthA = this.getPathStrength(a);
      const strengthB = this.getPathStrength(b);
      return strengthB - strengthA;
    });
  }

  /**
   * Calculate total strength of a path (product of edge strengths)
   */
  getPathStrength(path: TestEventType[]): number {
    if (path.length < 2) return 0;

    let strength = 1;
    for (let i = 0; i < path.length - 1; i++) {
      const edges = this.edgesFrom(path[i]);
      const edge = edges.find(e => e.target === path[i + 1]);
      if (edge) {
        strength *= edge.strength;
      } else {
        return 0; // Broken path
      }
    }
    return strength;
  }

  /**
   * Find strongly connected components using Tarjan's algorithm
   * Returns groups of mutually reachable nodes (potential feedback loops)
   */
  stronglyConnectedComponents(): TestEventType[][] {
    const n = this.nodes.length;
    if (n === 0) return [];

    const nodeIndex = new Map(this.nodes.map((node, i) => [node, i]));
    const indexNode = new Map(this.nodes.map((node, i) => [i, node]));

    // Tarjan's algorithm
    let index = 0;
    const indices = new Array<number>(n).fill(-1);
    const lowlinks = new Array<number>(n).fill(-1);
    const onStack = new Array<boolean>(n).fill(false);
    const stack: number[] = [];
    const sccs: number[][] = [];

    const strongConnect = (v: number): void => {
      indices[v] = index;
      lowlinks[v] = index;
      index++;
      stack.push(v);
      onStack[v] = true;

      // Consider successors
      const node = indexNode.get(v)!;
      for (const edge of this.edgesFrom(node)) {
        const w = nodeIndex.get(edge.target)!;

        if (indices[w] === -1) {
          // Successor not yet visited
          strongConnect(w);
          lowlinks[v] = Math.min(lowlinks[v], lowlinks[w]);
        } else if (onStack[w]) {
          // Successor is on stack -> in current SCC
          lowlinks[v] = Math.min(lowlinks[v], indices[w]);
        }
      }

      // If v is a root node, pop the SCC
      if (lowlinks[v] === indices[v]) {
        const scc: number[] = [];
        let w: number;
        do {
          w = stack.pop()!;
          onStack[w] = false;
          scc.push(w);
        } while (w !== v);
        sccs.push(scc);
      }
    };

    // Run for all nodes
    for (let i = 0; i < n; i++) {
      if (indices[i] === -1) {
        strongConnect(i);
      }
    }

    // Convert indices back to event types
    return sccs.map(scc => scc.map(i => indexNode.get(i)!));
  }

  /**
   * Get nodes with highest out-degree (potential root causes)
   */
  getHighOutDegreeNodes(limit: number = 5): Array<{ node: TestEventType; outDegree: number }> {
    const degrees = this.nodes.map(node => ({
      node,
      outDegree: this.edgesFrom(node).length,
    }));

    return degrees
      .sort((a, b) => b.outDegree - a.outDegree)
      .slice(0, limit);
  }

  /**
   * Get nodes with highest in-degree (common effects)
   */
  getHighInDegreeNodes(limit: number = 5): Array<{ node: TestEventType; inDegree: number }> {
    const degrees = this.nodes.map(node => ({
      node,
      inDegree: this.edgesTo(node).length,
    }));

    return degrees
      .sort((a, b) => b.inDegree - a.inDegree)
      .slice(0, limit);
  }

  /**
   * Find potential intervention points (nodes that, if addressed, would break many causal chains)
   * Uses betweenness-like centrality heuristic
   */
  findInterventionPoints(target: TestEventType, limit: number = 5): TestEventType[] {
    // Find all nodes that can reach the target
    const canReachTarget = this.reachableTo(target);

    if (canReachTarget.size <= 1) {
      return [];
    }

    // Score each node by how many paths to target it's on
    const scores = new Map<TestEventType, number>();

    for (const node of canReachTarget) {
      if (node === target) continue;

      // Count paths through this node
      const outDegree = this.edgesFrom(node).filter(e => canReachTarget.has(e.target)).length;
      const inDegree = this.edgesTo(node).filter(e => canReachTarget.has(e.source)).length;

      // Score combines out-degree (impact) and in-degree (reachability)
      const score = (outDegree + 1) * (inDegree + 1);
      scores.set(node, score);
    }

    // Return top intervention points
    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([node]) => node);
  }

  /**
   * Get a subgraph containing only nodes that can reach a target
   */
  getSubgraphTo(target: TestEventType): CausalGraph {
    const relevantNodes = this.reachableTo(target);
    const subgraphNodes = Array.from(relevantNodes);
    const subgraphEdges = this.edges.filter(
      e => relevantNodes.has(e.source) && relevantNodes.has(e.target)
    );

    return new CausalGraphImpl(subgraphNodes, subgraphEdges);
  }

  /**
   * Get a subgraph containing only nodes reachable from a source
   */
  getSubgraphFrom(source: TestEventType): CausalGraph {
    const relevantNodes = this.reachableFrom(source);
    const subgraphNodes = Array.from(relevantNodes);
    const subgraphEdges = this.edges.filter(
      e => relevantNodes.has(e.source) && relevantNodes.has(e.target)
    );

    return new CausalGraphImpl(subgraphNodes, subgraphEdges);
  }

  /**
   * Check if the graph contains cycles
   */
  hasCycles(): boolean {
    const sccs = this.stronglyConnectedComponents();
    // If any SCC has more than one node, or a self-loop, there's a cycle
    for (const scc of sccs) {
      if (scc.length > 1) return true;
      // Check for self-loop
      if (scc.length === 1) {
        const edges = this.edgesFrom(scc[0]);
        if (edges.some(e => e.target === scc[0])) return true;
      }
    }
    return false;
  }

  /**
   * Get feedback loops (cycles) in the graph
   */
  getFeedbackLoops(): TestEventType[][] {
    const sccs = this.stronglyConnectedComponents();
    const loops: TestEventType[][] = [];

    for (const scc of sccs) {
      if (scc.length > 1) {
        loops.push(scc);
      } else if (scc.length === 1) {
        // Check for self-loop
        const edges = this.edgesFrom(scc[0]);
        if (edges.some(e => e.target === scc[0])) {
          loops.push(scc);
        }
      }
    }

    return loops;
  }

  /**
   * Get graph statistics
   */
  getStats(): {
    nodes: number;
    edges: number;
    density: number;
    avgOutDegree: number;
    avgInDegree: number;
    hasCycles: boolean;
    numComponents: number;
  } {
    const n = this.nodes.length;
    const m = this.edges.length;
    const maxEdges = n * (n - 1);
    const density = maxEdges > 0 ? m / maxEdges : 0;

    const outDegrees = this.nodes.map(node => this.edgesFrom(node).length);
    const inDegrees = this.nodes.map(node => this.edgesTo(node).length);

    const avgOutDegree = n > 0 ? outDegrees.reduce((a, b) => a + b, 0) / n : 0;
    const avgInDegree = n > 0 ? inDegrees.reduce((a, b) => a + b, 0) / n : 0;

    return {
      nodes: n,
      edges: m,
      density,
      avgOutDegree,
      avgInDegree,
      hasCycles: this.hasCycles(),
      numComponents: this.stronglyConnectedComponents().length,
    };
  }
}
