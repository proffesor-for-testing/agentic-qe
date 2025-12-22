/**
 * Code Graph Builder
 *
 * Constructs a knowledge graph of code relationships:
 * - Import/export dependencies
 * - Class inheritance hierarchies
 * - Function call graphs
 * - Type usage relationships
 *
 * Integrates with AST parsing for accurate extraction.
 */

import {
  GraphNode,
  GraphEdge,
  CodeGraph,
  GraphBuilderConfig,
  GraphStats,
  GraphQuery,
  GraphQueryResult,
  NodeType,
  EdgeType,
  DEFAULT_GRAPH_BUILDER_CONFIG,
} from './types.js';

export class GraphBuilder {
  private config: GraphBuilderConfig;
  private graph: CodeGraph;
  private nodeIdCounter: number = 0;
  private edgeIdCounter: number = 0;

  constructor(config: Partial<GraphBuilderConfig> = {}) {
    this.config = { ...DEFAULT_GRAPH_BUILDER_CONFIG, ...config };
    this.graph = this.createEmptyGraph();
  }

  /**
   * Add a node to the graph.
   */
  addNode(
    type: NodeType,
    label: string,
    filePath: string,
    startLine: number,
    endLine: number,
    language: string,
    properties: Record<string, unknown> = {}
  ): GraphNode {
    const id = this.generateNodeId();

    const node: GraphNode = {
      id,
      type,
      label,
      filePath,
      startLine,
      endLine,
      language,
      properties,
    };

    this.graph.nodes.set(id, node);

    // Update file index
    const fileNodes = this.graph.fileNodes.get(filePath) || [];
    fileNodes.push(id);
    this.graph.fileNodes.set(filePath, fileNodes);

    // Initialize edge lists
    this.graph.outgoingEdges.set(id, []);
    this.graph.incomingEdges.set(id, []);

    return node;
  }

  /**
   * Add an edge between nodes.
   */
  addEdge(
    sourceId: string,
    targetId: string,
    type: EdgeType,
    weight: number = 1.0,
    properties: Record<string, unknown> = {}
  ): GraphEdge | null {
    // Verify nodes exist
    if (!this.graph.nodes.has(sourceId) || !this.graph.nodes.has(targetId)) {
      return null;
    }

    const id = this.generateEdgeId();

    const edge: GraphEdge = {
      id,
      source: sourceId,
      target: targetId,
      type,
      weight,
      properties,
    };

    this.graph.edges.set(id, edge);

    // Update indices
    const outgoing = this.graph.outgoingEdges.get(sourceId) || [];
    outgoing.push(id);
    this.graph.outgoingEdges.set(sourceId, outgoing);

    const incoming = this.graph.incomingEdges.get(targetId) || [];
    incoming.push(id);
    this.graph.incomingEdges.set(targetId, incoming);

    return edge;
  }

  /**
   * Find or create a node by label and file.
   */
  findOrCreateNode(
    type: NodeType,
    label: string,
    filePath: string,
    startLine: number = 0,
    endLine: number = 0,
    language: string = 'unknown'
  ): GraphNode {
    // Try to find existing node
    const existing = this.findNode(label, filePath, type);
    if (existing) return existing;

    // Create new node
    return this.addNode(type, label, filePath, startLine, endLine, language);
  }

  /**
   * Find a node by label and optional filters.
   */
  findNode(
    label: string,
    filePath?: string,
    type?: NodeType
  ): GraphNode | undefined {
    for (const node of this.graph.nodes.values()) {
      if (node.label !== label) continue;
      if (filePath && node.filePath !== filePath) continue;
      if (type && node.type !== type) continue;
      return node;
    }
    return undefined;
  }

  /**
   * Find nodes by type.
   */
  findNodesByType(type: NodeType): GraphNode[] {
    return Array.from(this.graph.nodes.values())
      .filter(n => n.type === type);
  }

  /**
   * Find nodes in a file.
   */
  findNodesInFile(filePath: string): GraphNode[] {
    const nodeIds = this.graph.fileNodes.get(filePath) || [];
    return nodeIds
      .map(id => this.graph.nodes.get(id))
      .filter((n): n is GraphNode => n !== undefined);
  }

  /**
   * Get outgoing edges for a node.
   */
  getOutgoingEdges(nodeId: string): GraphEdge[] {
    const edgeIds = this.graph.outgoingEdges.get(nodeId) || [];
    return edgeIds
      .map(id => this.graph.edges.get(id))
      .filter((e): e is GraphEdge => e !== undefined);
  }

  /**
   * Get incoming edges for a node.
   */
  getIncomingEdges(nodeId: string): GraphEdge[] {
    const edgeIds = this.graph.incomingEdges.get(nodeId) || [];
    return edgeIds
      .map(id => this.graph.edges.get(id))
      .filter((e): e is GraphEdge => e !== undefined);
  }

  /**
   * Get neighbors of a node.
   */
  getNeighbors(
    nodeId: string,
    direction: 'outgoing' | 'incoming' | 'both' = 'both'
  ): GraphNode[] {
    const neighbors: GraphNode[] = [];
    const seen = new Set<string>();

    if (direction === 'outgoing' || direction === 'both') {
      for (const edge of this.getOutgoingEdges(nodeId)) {
        if (!seen.has(edge.target)) {
          const node = this.graph.nodes.get(edge.target);
          if (node) {
            neighbors.push(node);
            seen.add(edge.target);
          }
        }
      }
    }

    if (direction === 'incoming' || direction === 'both') {
      for (const edge of this.getIncomingEdges(nodeId)) {
        if (!seen.has(edge.source)) {
          const node = this.graph.nodes.get(edge.source);
          if (node) {
            neighbors.push(node);
            seen.add(edge.source);
          }
        }
      }
    }

    return neighbors;
  }

  /**
   * Query the graph with traversal.
   */
  query(query: GraphQuery): GraphQueryResult {
    const startTime = Date.now();
    const resultNodes: GraphNode[] = [];
    const resultEdges: GraphEdge[] = [];
    const visited = new Set<string>();

    // Get starting nodes
    let startNodes: GraphNode[] = [];

    if (query.startNode) {
      const node = this.graph.nodes.get(query.startNode);
      if (node) startNodes = [node];
    } else if (query.nodeType) {
      startNodes = this.findNodesByType(query.nodeType);
    } else {
      startNodes = Array.from(this.graph.nodes.values());
    }

    // BFS traversal
    const queue: Array<{ node: GraphNode; depth: number }> =
      startNodes.map(n => ({ node: n, depth: 0 }));

    while (queue.length > 0 && resultNodes.length < query.limit) {
      const { node, depth } = queue.shift()!;

      if (visited.has(node.id)) continue;
      visited.add(node.id);

      // Check node type filter
      if (!query.nodeType || node.type === query.nodeType) {
        resultNodes.push(node);
      }

      // Continue traversal if within depth
      if (depth < query.maxDepth) {
        const edges = query.direction === 'incoming'
          ? this.getIncomingEdges(node.id)
          : query.direction === 'outgoing'
          ? this.getOutgoingEdges(node.id)
          : [...this.getOutgoingEdges(node.id), ...this.getIncomingEdges(node.id)];

        for (const edge of edges) {
          // Check edge type filter
          if (query.edgeType && edge.type !== query.edgeType) continue;

          resultEdges.push(edge);

          const nextId = edge.source === node.id ? edge.target : edge.source;
          const nextNode = this.graph.nodes.get(nextId);

          if (nextNode && !visited.has(nextId)) {
            queue.push({ node: nextNode, depth: depth + 1 });
          }
        }
      }
    }

    return {
      nodes: resultNodes.slice(0, query.limit),
      edges: resultEdges,
      executionTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Find path between two nodes.
   */
  findPath(
    startId: string,
    endId: string,
    maxDepth: number = 5
  ): GraphNode[] | null {
    if (!this.graph.nodes.has(startId) || !this.graph.nodes.has(endId)) {
      return null;
    }

    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; path: string[] }> = [
      { nodeId: startId, path: [startId] }
    ];

    while (queue.length > 0) {
      const { nodeId, path } = queue.shift()!;

      if (nodeId === endId) {
        return path.map(id => this.graph.nodes.get(id)!);
      }

      if (visited.has(nodeId) || path.length > maxDepth) continue;
      visited.add(nodeId);

      for (const edge of this.getOutgoingEdges(nodeId)) {
        if (!visited.has(edge.target)) {
          queue.push({
            nodeId: edge.target,
            path: [...path, edge.target],
          });
        }
      }
    }

    return null;
  }

  /**
   * Remove a node and its edges.
   */
  removeNode(nodeId: string): boolean {
    const node = this.graph.nodes.get(nodeId);
    if (!node) return false;

    // Remove all edges
    for (const edgeId of this.graph.outgoingEdges.get(nodeId) || []) {
      this.graph.edges.delete(edgeId);
    }
    for (const edgeId of this.graph.incomingEdges.get(nodeId) || []) {
      this.graph.edges.delete(edgeId);
    }

    // Remove from file index
    const fileNodes = this.graph.fileNodes.get(node.filePath) || [];
    const index = fileNodes.indexOf(nodeId);
    if (index !== -1) fileNodes.splice(index, 1);

    // Remove node
    this.graph.nodes.delete(nodeId);
    this.graph.outgoingEdges.delete(nodeId);
    this.graph.incomingEdges.delete(nodeId);

    return true;
  }

  /**
   * Remove all nodes from a file.
   */
  removeFile(filePath: string): number {
    const nodeIds = this.graph.fileNodes.get(filePath) || [];
    let removed = 0;

    for (const nodeId of [...nodeIds]) {
      if (this.removeNode(nodeId)) removed++;
    }

    this.graph.fileNodes.delete(filePath);
    return removed;
  }

  /**
   * Get graph statistics.
   */
  getStats(): GraphStats {
    const nodesByType: Record<string, number> = {};
    const edgesByType: Record<string, number> = {};
    const edgeCounts: Array<{ nodeId: string; edgeCount: number }> = [];

    for (const node of this.graph.nodes.values()) {
      nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;

      const edgeCount =
        (this.graph.outgoingEdges.get(node.id)?.length || 0) +
        (this.graph.incomingEdges.get(node.id)?.length || 0);
      edgeCounts.push({ nodeId: node.id, edgeCount });
    }

    for (const edge of this.graph.edges.values()) {
      edgesByType[edge.type] = (edgesByType[edge.type] || 0) + 1;
    }

    edgeCounts.sort((a, b) => b.edgeCount - a.edgeCount);

    return {
      nodeCount: this.graph.nodes.size,
      edgeCount: this.graph.edges.size,
      nodesByType: nodesByType as Record<NodeType, number>,
      edgesByType: edgesByType as Record<EdgeType, number>,
      fileCount: this.graph.fileNodes.size,
      avgEdgesPerNode: this.graph.nodes.size > 0
        ? this.graph.edges.size * 2 / this.graph.nodes.size
        : 0,
      mostConnected: edgeCounts.slice(0, 10),
    };
  }

  /**
   * Get node by ID.
   */
  getNode(id: string): GraphNode | undefined {
    return this.graph.nodes.get(id);
  }

  /**
   * Get edge by ID.
   */
  getEdge(id: string): GraphEdge | undefined {
    return this.graph.edges.get(id);
  }

  /**
   * Get all nodes.
   */
  getAllNodes(): GraphNode[] {
    return Array.from(this.graph.nodes.values());
  }

  /**
   * Get all edges.
   */
  getAllEdges(): GraphEdge[] {
    return Array.from(this.graph.edges.values());
  }

  /**
   * Clear the graph.
   */
  clear(): void {
    this.graph = this.createEmptyGraph();
    this.nodeIdCounter = 0;
    this.edgeIdCounter = 0;
  }

  /**
   * Get configuration.
   */
  getConfig(): GraphBuilderConfig {
    return { ...this.config };
  }

  /**
   * Export graph for persistence.
   */
  exportGraph(): {
    nodes: GraphNode[];
    edges: GraphEdge[];
  } {
    return {
      nodes: Array.from(this.graph.nodes.values()),
      edges: Array.from(this.graph.edges.values()),
    };
  }

  /**
   * Import graph from persistence.
   */
  importGraph(data: { nodes: GraphNode[]; edges: GraphEdge[] }): void {
    this.clear();

    for (const node of data.nodes) {
      this.graph.nodes.set(node.id, node);

      const fileNodes = this.graph.fileNodes.get(node.filePath) || [];
      fileNodes.push(node.id);
      this.graph.fileNodes.set(node.filePath, fileNodes);

      this.graph.outgoingEdges.set(node.id, []);
      this.graph.incomingEdges.set(node.id, []);
    }

    for (const edge of data.edges) {
      this.graph.edges.set(edge.id, edge);

      const outgoing = this.graph.outgoingEdges.get(edge.source) || [];
      outgoing.push(edge.id);
      this.graph.outgoingEdges.set(edge.source, outgoing);

      const incoming = this.graph.incomingEdges.get(edge.target) || [];
      incoming.push(edge.id);
      this.graph.incomingEdges.set(edge.target, incoming);
    }
  }

  /**
   * Create empty graph structure.
   */
  private createEmptyGraph(): CodeGraph {
    return {
      nodes: new Map(),
      edges: new Map(),
      outgoingEdges: new Map(),
      incomingEdges: new Map(),
      fileNodes: new Map(),
    };
  }

  /**
   * Generate unique node ID.
   */
  private generateNodeId(): string {
    return `node_${++this.nodeIdCounter}`;
  }

  /**
   * Generate unique edge ID.
   */
  private generateEdgeId(): string {
    return `edge_${++this.edgeIdCounter}`;
  }
}
