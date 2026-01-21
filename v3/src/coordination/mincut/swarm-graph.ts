/**
 * Agentic QE v3 - Swarm Graph Data Structure
 * ADR-047: MinCut Self-Organizing QE Integration
 *
 * Efficient graph representation for swarm topology analysis.
 * Uses adjacency list for O(1) neighbor lookup and O(V+E) traversal.
 */

import { DomainName } from '../../shared/types';
import {
  SwarmVertex,
  SwarmEdge,
  SwarmGraphSnapshot,
  SwarmGraphStats,
} from './interfaces';

/**
 * Adjacency list entry for efficient neighbor lookup
 */
interface AdjacencyEntry {
  /** Neighbor vertex ID */
  readonly neighborId: string;

  /** Edge weight */
  readonly weight: number;

  /** Edge reference */
  readonly edge: SwarmEdge;
}

/**
 * Swarm Graph - Efficient graph data structure for swarm topology
 *
 * Features:
 * - O(1) vertex/edge lookup
 * - O(degree) neighbor iteration
 * - O(V+E) traversal
 * - Supports weighted edges
 * - Bidirectional edge support
 */
export class SwarmGraph {
  /** Vertices indexed by ID */
  private readonly vertices: Map<string, SwarmVertex> = new Map();

  /** Edges indexed by "source:target" key */
  private readonly edges: Map<string, SwarmEdge> = new Map();

  /** Adjacency list for fast neighbor lookup */
  private readonly adjacencyList: Map<string, AdjacencyEntry[]> = new Map();

  /** Total edge weight cache */
  private totalWeight: number = 0;

  // ==========================================================================
  // Vertex Operations
  // ==========================================================================

  /**
   * Add a vertex to the graph
   */
  addVertex(vertex: SwarmVertex): void {
    if (this.vertices.has(vertex.id)) {
      // Update existing vertex
      this.vertices.set(vertex.id, vertex);
      return;
    }

    this.vertices.set(vertex.id, vertex);
    this.adjacencyList.set(vertex.id, []);
  }

  /**
   * Remove a vertex and all its edges
   */
  removeVertex(vertexId: string): boolean {
    if (!this.vertices.has(vertexId)) {
      return false;
    }

    // Remove all edges connected to this vertex
    const neighbors = this.adjacencyList.get(vertexId) || [];
    for (const entry of neighbors) {
      this.removeEdge(vertexId, entry.neighborId);
    }

    // Also remove edges where this vertex is the target
    for (const [, adjacency] of this.adjacencyList) {
      const idx = adjacency.findIndex(e => e.neighborId === vertexId);
      if (idx !== -1) {
        this.totalWeight -= adjacency[idx].weight;
        adjacency.splice(idx, 1);
      }
    }

    this.vertices.delete(vertexId);
    this.adjacencyList.delete(vertexId);
    return true;
  }

  /**
   * Get a vertex by ID
   */
  getVertex(vertexId: string): SwarmVertex | undefined {
    return this.vertices.get(vertexId);
  }

  /**
   * Check if vertex exists
   */
  hasVertex(vertexId: string): boolean {
    return this.vertices.has(vertexId);
  }

  /**
   * Get all vertices
   */
  getVertices(): SwarmVertex[] {
    return Array.from(this.vertices.values());
  }

  /**
   * Get vertex IDs
   */
  getVertexIds(): string[] {
    return Array.from(this.vertices.keys());
  }

  /**
   * Get vertices by domain
   */
  getVerticesByDomain(domain: DomainName): SwarmVertex[] {
    return this.getVertices().filter(v => v.domain === domain);
  }

  /**
   * Get vertices by type
   */
  getVerticesByType(type: SwarmVertex['type']): SwarmVertex[] {
    return this.getVertices().filter(v => v.type === type);
  }

  // ==========================================================================
  // Edge Operations
  // ==========================================================================

  /**
   * Add an edge to the graph
   */
  addEdge(edge: SwarmEdge): void {
    // Ensure both vertices exist
    if (!this.vertices.has(edge.source)) {
      throw new Error(`Source vertex ${edge.source} does not exist`);
    }
    if (!this.vertices.has(edge.target)) {
      throw new Error(`Target vertex ${edge.target} does not exist`);
    }

    const key = this.edgeKey(edge.source, edge.target);

    // Remove existing edge if present
    if (this.edges.has(key)) {
      const existing = this.edges.get(key)!;
      this.totalWeight -= existing.weight;
      this.removeFromAdjacency(edge.source, edge.target);
      if (existing.bidirectional) {
        this.removeFromAdjacency(edge.target, edge.source);
      }
    }

    this.edges.set(key, edge);
    this.totalWeight += edge.weight;

    // Add to adjacency list
    this.addToAdjacency(edge.source, edge.target, edge.weight, edge);

    // Add reverse edge for bidirectional
    if (edge.bidirectional) {
      this.addToAdjacency(edge.target, edge.source, edge.weight, edge);
    }
  }

  /**
   * Remove an edge from the graph
   */
  removeEdge(source: string, target: string): boolean {
    const key = this.edgeKey(source, target);
    const edge = this.edges.get(key);

    if (!edge) {
      return false;
    }

    this.totalWeight -= edge.weight;
    this.edges.delete(key);

    this.removeFromAdjacency(source, target);
    if (edge.bidirectional) {
      this.removeFromAdjacency(target, source);
    }

    return true;
  }

  /**
   * Get an edge by source and target
   */
  getEdge(source: string, target: string): SwarmEdge | undefined {
    return this.edges.get(this.edgeKey(source, target));
  }

  /**
   * Check if edge exists
   */
  hasEdge(source: string, target: string): boolean {
    return this.edges.has(this.edgeKey(source, target));
  }

  /**
   * Get all edges
   */
  getEdges(): SwarmEdge[] {
    return Array.from(this.edges.values());
  }

  /**
   * Get edges connected to a vertex
   */
  getEdgesForVertex(vertexId: string): SwarmEdge[] {
    const adjacency = this.adjacencyList.get(vertexId) || [];
    return adjacency.map(e => e.edge);
  }

  // ==========================================================================
  // Degree Operations
  // ==========================================================================

  /**
   * Get the degree (number of neighbors) of a vertex
   */
  degree(vertexId: string): number {
    return this.adjacencyList.get(vertexId)?.length || 0;
  }

  /**
   * Get the weighted degree (sum of edge weights) of a vertex
   */
  weightedDegree(vertexId: string): number {
    const adjacency = this.adjacencyList.get(vertexId);
    if (!adjacency) return 0;

    return adjacency.reduce((sum, entry) => sum + entry.weight, 0);
  }

  /**
   * Get neighbors of a vertex
   */
  neighbors(vertexId: string): Array<{ vertex: SwarmVertex; weight: number }> {
    const adjacency = this.adjacencyList.get(vertexId) || [];
    return adjacency
      .map(entry => ({
        vertex: this.vertices.get(entry.neighborId)!,
        weight: entry.weight,
      }))
      .filter(n => n.vertex !== undefined);
  }

  /**
   * Get neighbor IDs
   */
  neighborIds(vertexId: string): string[] {
    const adjacency = this.adjacencyList.get(vertexId) || [];
    return adjacency.map(e => e.neighborId);
  }

  // ==========================================================================
  // Graph Analysis
  // ==========================================================================

  /**
   * Get graph statistics
   */
  getStats(): SwarmGraphStats {
    const vertexCount = this.vertices.size;
    const edgeCount = this.edges.size;

    // Calculate average degree
    let totalDegree = 0;
    for (const [, adjacency] of this.adjacencyList) {
      totalDegree += adjacency.length;
    }
    const averageDegree = vertexCount > 0 ? totalDegree / vertexCount : 0;

    // Calculate density
    const maxPossibleEdges = vertexCount > 1 ? (vertexCount * (vertexCount - 1)) / 2 : 0;
    const density = maxPossibleEdges > 0 ? edgeCount / maxPossibleEdges : 0;

    // Check connectivity
    const componentCount = this.countConnectedComponents();
    const isConnected = componentCount === 1 && vertexCount > 0;

    return {
      vertexCount,
      edgeCount,
      totalWeight: this.totalWeight,
      averageDegree,
      density,
      isConnected,
      componentCount,
    };
  }

  /**
   * Count connected components using DFS
   */
  countConnectedComponents(): number {
    const visited = new Set<string>();
    let componentCount = 0;

    for (const vertexId of this.vertices.keys()) {
      if (!visited.has(vertexId)) {
        this.dfs(vertexId, visited);
        componentCount++;
      }
    }

    return componentCount;
  }

  /**
   * Depth-first search helper
   */
  private dfs(vertexId: string, visited: Set<string>): void {
    visited.add(vertexId);
    const adjacency = this.adjacencyList.get(vertexId) || [];

    for (const entry of adjacency) {
      if (!visited.has(entry.neighborId)) {
        this.dfs(entry.neighborId, visited);
      }
    }
  }

  /**
   * Check if graph is connected
   */
  isConnected(): boolean {
    if (this.vertices.size === 0) return true;
    if (this.vertices.size === 1) return true;

    const visited = new Set<string>();
    const firstVertex = this.vertices.keys().next().value;
    if (firstVertex === undefined) return true;
    this.dfs(firstVertex, visited);

    return visited.size === this.vertices.size;
  }

  /**
   * Get all vertices in the same connected component as the given vertex
   */
  getConnectedComponent(vertexId: string): string[] {
    if (!this.vertices.has(vertexId)) return [];

    const visited = new Set<string>();
    this.dfs(vertexId, visited);
    return Array.from(visited);
  }

  // ==========================================================================
  // Snapshot & Cloning
  // ==========================================================================

  /**
   * Create a snapshot of the current graph state
   */
  snapshot(): SwarmGraphSnapshot {
    return {
      timestamp: new Date(),
      vertices: this.getVertices(),
      edges: this.getEdges(),
      stats: this.getStats(),
    };
  }

  /**
   * Clone the graph
   */
  clone(): SwarmGraph {
    const clone = new SwarmGraph();

    // Copy vertices
    for (const vertex of this.vertices.values()) {
      clone.addVertex({ ...vertex });
    }

    // Copy edges
    for (const edge of this.edges.values()) {
      clone.addEdge({ ...edge });
    }

    return clone;
  }

  /**
   * Create graph from snapshot
   */
  static fromSnapshot(snapshot: SwarmGraphSnapshot): SwarmGraph {
    const graph = new SwarmGraph();

    for (const vertex of snapshot.vertices) {
      graph.addVertex(vertex);
    }

    for (const edge of snapshot.edges) {
      graph.addEdge(edge);
    }

    return graph;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Clear the graph
   */
  clear(): void {
    this.vertices.clear();
    this.edges.clear();
    this.adjacencyList.clear();
    this.totalWeight = 0;
  }

  /**
   * Get vertex count
   */
  get vertexCount(): number {
    return this.vertices.size;
  }

  /**
   * Get edge count
   */
  get edgeCount(): number {
    return this.edges.size;
  }

  /**
   * Check if graph is empty
   */
  isEmpty(): boolean {
    return this.vertices.size === 0;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Generate edge key from source and target
   */
  private edgeKey(source: string, target: string): string {
    // Always use lexicographically smaller ID first for undirected graphs
    return source < target ? `${source}:${target}` : `${target}:${source}`;
  }

  /**
   * Add entry to adjacency list
   */
  private addToAdjacency(
    source: string,
    target: string,
    weight: number,
    edge: SwarmEdge
  ): void {
    const adjacency = this.adjacencyList.get(source);
    if (adjacency) {
      // Check if already exists
      const existing = adjacency.find(e => e.neighborId === target);
      if (!existing) {
        adjacency.push({ neighborId: target, weight, edge });
      }
    }
  }

  /**
   * Remove entry from adjacency list
   */
  private removeFromAdjacency(source: string, target: string): void {
    const adjacency = this.adjacencyList.get(source);
    if (adjacency) {
      const idx = adjacency.findIndex(e => e.neighborId === target);
      if (idx !== -1) {
        adjacency.splice(idx, 1);
      }
    }
  }
}

/**
 * Create an empty swarm graph
 */
export function createSwarmGraph(): SwarmGraph {
  return new SwarmGraph();
}

/**
 * Create a swarm graph from vertices and edges
 */
export function createSwarmGraphFrom(
  vertices: SwarmVertex[],
  edges: SwarmEdge[]
): SwarmGraph {
  const graph = new SwarmGraph();

  for (const vertex of vertices) {
    graph.addVertex(vertex);
  }

  for (const edge of edges) {
    graph.addEdge(edge);
  }

  return graph;
}
