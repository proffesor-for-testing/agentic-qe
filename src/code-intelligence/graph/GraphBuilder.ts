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
import { MinCutAnalyzer } from '../analysis/mincut/MinCutAnalyzer.js';
import { GraphAdapter } from '../analysis/mincut/GraphAdapter.js';
import {
  MinCutResult,
  ModuleCouplingResult,
  CircularDependencyResult,
  BreakPoint,
} from '../analysis/mincut/types.js';

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
   * Analyze module coupling using MinCut algorithm.
   * Lower cut value = better separation between modules.
   *
   * @param options - Analysis options
   * @param options.nodeFilter - Filter function for nodes (return true to include)
   * @param options.threshold - Minimum coupling strength to report (0-1, default: 0.3)
   * @returns Array of module coupling results sorted by coupling strength (descending)
   *
   * @example
   * ```typescript
   * const results = await builder.analyzeModuleCoupling({
   *   nodeFilter: (node) => node.type === 'file',
   *   threshold: 0.5
   * });
   * results.forEach(r => {
   *   console.log(`${r.module1} <-> ${r.module2}: ${r.couplingStrength}`);
   * });
   * ```
   */
  async analyzeModuleCoupling(options?: {
    nodeFilter?: (node: GraphNode) => boolean;
    threshold?: number;
  }): Promise<ModuleCouplingResult[]> {
    const { nodeFilter = () => true, threshold = 0.3 } = options || {};

    // Get file-level graph for module analysis
    const exported = this.exportGraph();
    const fileGraph = GraphAdapter.aggregateByFile(exported);

    // Filter nodes if specified
    const filteredGraph = {
      nodes: fileGraph.nodes.filter(nodeFilter),
      edges: fileGraph.edges.filter(
        e =>
          fileGraph.nodes.some(n => n.id === e.source && nodeFilter(n)) &&
          fileGraph.nodes.some(n => n.id === e.target && nodeFilter(n))
      ),
    };

    // Group nodes by directory (module)
    const modules = this.groupNodesByModule(filteredGraph.nodes);
    const results: ModuleCouplingResult[] = [];

    // Analyze coupling between each pair of modules
    const moduleNames = Object.keys(modules);
    for (let i = 0; i < moduleNames.length; i++) {
      for (let j = i + 1; j < moduleNames.length; j++) {
        const module1Name = moduleNames[i];
        const module2Name = moduleNames[j];

        const module1Nodes = modules[module1Name];
        const module2Nodes = modules[module2Name];

        // Extract subgraph containing both modules
        const combinedNodeIds = new Set([
          ...module1Nodes.map(n => n.id),
          ...module2Nodes.map(n => n.id),
        ]);

        const subgraph = {
          nodes: filteredGraph.nodes.filter(n => combinedNodeIds.has(n.id)),
          edges: filteredGraph.edges.filter(
            e => combinedNodeIds.has(e.source) && combinedNodeIds.has(e.target)
          ),
        };

        // Skip if no edges between modules
        const crossEdges = subgraph.edges.filter(
          e =>
            (module1Nodes.some(n => n.id === e.source) &&
              module2Nodes.some(n => n.id === e.target)) ||
            (module2Nodes.some(n => n.id === e.source) &&
              module1Nodes.some(n => n.id === e.target))
        );

        if (crossEdges.length === 0) continue;

        // Compute MinCut between modules
        const minCutInput = GraphAdapter.toMinCutFormat(subgraph, {
          directed: false,
          normalizeWeights: true,
        });

        const analyzer = new MinCutAnalyzer({ timeout: 5000 });
        const minCutResult = await analyzer.computeMinCut(minCutInput);

        // Calculate coupling strength (inverse of cut value, normalized)
        const maxPossibleCoupling = crossEdges.length * 1.0;
        const couplingStrength = Math.min(
          1.0,
          maxPossibleCoupling > 0
            ? 1.0 - minCutResult.cutValue / maxPossibleCoupling
            : 0
        );

        // Skip if below threshold
        if (couplingStrength < threshold) continue;

        // Detect circular dependencies
        const circularDependency = this.hasCircularDependency(
          module1Nodes,
          module2Nodes,
          subgraph.edges
        );

        // Find shared dependencies
        const sharedDeps = this.findSharedDependencies(
          module1Nodes,
          module2Nodes,
          filteredGraph
        );

        // Generate recommendations
        const recommendations = this.generateCouplingRecommendations(
          minCutResult,
          couplingStrength,
          circularDependency
        );

        results.push({
          module1: module1Name,
          module2: module2Name,
          couplingStrength,
          sharedDependencies: sharedDeps,
          circularDependency,
          cutEdges: minCutResult.cutEdges,
          recommendations,
        });
      }
    }

    // Sort by coupling strength (descending)
    return results.sort((a, b) => b.couplingStrength - a.couplingStrength);
  }

  /**
   * Detect circular dependencies in the code graph.
   * Returns cycles with suggested break points.
   *
   * @returns Array of circular dependency results sorted by severity
   *
   * @example
   * ```typescript
   * const cycles = await builder.detectCircularDependencies();
   * cycles.forEach(cycle => {
   *   console.log('Cycle:', cycle.cycle.join(' -> '));
   *   console.log('Severity:', cycle.severity);
   *   cycle.breakPoints.forEach(bp => {
   *     console.log(`  Break ${bp.source} -> ${bp.target}: ${bp.suggestion}`);
   *   });
   * });
   * ```
   */
  async detectCircularDependencies(): Promise<CircularDependencyResult[]> {
    const exported = this.exportGraph();
    const fileGraph = GraphAdapter.aggregateByFile(exported);

    // Find strongly connected components (SCCs) using Tarjan's algorithm
    const sccs = this.findStronglyConnectedComponents(fileGraph);

    const results: CircularDependencyResult[] = [];

    // Process each SCC with more than 1 node (these are cycles)
    for (const scc of sccs) {
      if (scc.length <= 1) continue;

      // Extract cycle file paths
      const cycle = scc.map(node => node.filePath);

      // Extract subgraph for this cycle
      const cycleNodeIds = new Set(scc.map(n => n.id));
      const subgraph = {
        nodes: scc,
        edges: fileGraph.edges.filter(
          e => cycleNodeIds.has(e.source) && cycleNodeIds.has(e.target)
        ),
      };

      // Use MinCut to find weakest link
      const minCutInput = GraphAdapter.toMinCutFormat(subgraph, {
        directed: false,
        normalizeWeights: true,
      });

      const analyzer = new MinCutAnalyzer({ timeout: 5000 });
      const minCutResult = await analyzer.computeMinCut(minCutInput);

      // Generate break points from cut edges
      const breakPoints: BreakPoint[] = minCutResult.cutEdges.map(cutEdge => {
        const edge = subgraph.edges.find(
          e => e.source === cutEdge.source && e.target === cutEdge.target
        );

        return {
          source: cutEdge.source,
          target: cutEdge.target,
          edgeType: cutEdge.edgeType || 'unknown',
          effort: this.estimateBreakEffort(cutEdge.edgeType),
          suggestion: this.generateBreakSuggestion(cutEdge),
        };
      });

      // Assess severity
      const severity = this.assessCycleSeverity(cycle.length, subgraph.edges.length);

      // Generate recommendations
      const recommendations = this.generateCycleRecommendations(
        cycle,
        breakPoints,
        severity
      );

      results.push({
        cycle,
        breakPoints,
        severity,
        recommendations,
      });
    }

    // Sort by severity (high -> medium -> low)
    const severityOrder = { high: 3, medium: 2, low: 1 };
    return results.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);
  }

  /**
   * Suggest optimal module boundaries for refactoring.
   * Uses iterative MinCut to partition into target number of modules.
   *
   * @param targetModuleCount - Desired number of modules (must be >= 2)
   * @returns Object containing module assignments and cut values
   *
   * @example
   * ```typescript
   * const boundaries = await builder.suggestModuleBoundaries(4);
   * console.log(`Created ${boundaries.modules.length} modules`);
   * boundaries.modules.forEach((files, i) => {
   *   console.log(`Module ${i + 1}:`, files);
   * });
   * ```
   */
  async suggestModuleBoundaries(targetModuleCount: number): Promise<{
    modules: string[][];
    cutValues: number[];
  }> {
    if (targetModuleCount < 2) {
      throw new Error('Target module count must be at least 2');
    }

    const exported = this.exportGraph();
    const fileGraph = GraphAdapter.aggregateByFile(exported);

    // Start with all files in one partition
    const partitions: GraphNode[][] = [fileGraph.nodes];
    const cutValues: number[] = [];

    // Iteratively split largest partition until we reach target count
    while (partitions.length < targetModuleCount) {
      // Find largest partition
      let largestIdx = 0;
      let largestSize = partitions[0].length;

      for (let i = 1; i < partitions.length; i++) {
        if (partitions[i].length > largestSize) {
          largestSize = partitions[i].length;
          largestIdx = i;
        }
      }

      const partition = partitions[largestIdx];

      // Stop if largest partition has only 1 node
      if (partition.length <= 1) break;

      // Extract subgraph for this partition
      const nodeIds = new Set(partition.map(n => n.id));
      const subgraph = {
        nodes: partition,
        edges: fileGraph.edges.filter(
          e => nodeIds.has(e.source) && nodeIds.has(e.target)
        ),
      };

      // Compute MinCut to split partition
      const minCutInput = GraphAdapter.toMinCutFormat(subgraph, {
        directed: false,
        normalizeWeights: true,
      });

      const analyzer = new MinCutAnalyzer({ timeout: 10000 });
      const minCutResult = await analyzer.computeMinCut(minCutInput);

      // Split partition based on MinCut result
      const partition1 = partition.filter(n =>
        minCutResult.partition1.includes(n.id)
      );
      const partition2 = partition.filter(n =>
        minCutResult.partition2.includes(n.id)
      );

      // Replace largest partition with two new partitions
      partitions.splice(largestIdx, 1, partition1, partition2);
      cutValues.push(minCutResult.cutValue);
    }

    // Convert partitions to file path arrays
    const modules = partitions.map(p => p.map(n => n.filePath));

    return {
      modules,
      cutValues,
    };
  }

  /**
   * Calculate test isolation score.
   * Measures how well test files are isolated from production code.
   *
   * @param testFilePattern - Regex to identify test files (default: /\.(test|spec)\.[jt]sx?$/)
   * @returns Object with isolation score and analysis
   *
   * @example
   * ```typescript
   * const isolation = await builder.calculateTestIsolation(/\.test\.ts$/);
   * console.log(`Test isolation score: ${isolation.score}`);
   * console.log(`Crossing dependencies: ${isolation.crossingDependencies}`);
   * ```
   */
  async calculateTestIsolation(testFilePattern?: RegExp): Promise<{
    score: number;
    testFiles: string[];
    productionFiles: string[];
    crossingDependencies: number;
  }> {
    const pattern = testFilePattern || /\.(test|spec)\.[jt]sx?$/;

    const exported = this.exportGraph();
    const fileGraph = GraphAdapter.aggregateByFile(exported);

    // Separate test and production files
    const testNodes = fileGraph.nodes.filter(n => pattern.test(n.filePath));
    const productionNodes = fileGraph.nodes.filter(n => !pattern.test(n.filePath));

    const testNodeIds = new Set(testNodes.map(n => n.id));
    const prodNodeIds = new Set(productionNodes.map(n => n.id));

    // Create bipartite graph (test <-> production)
    const testProdEdges = fileGraph.edges.filter(
      e =>
        (testNodeIds.has(e.source) && prodNodeIds.has(e.target)) ||
        (prodNodeIds.has(e.source) && testNodeIds.has(e.target))
    );

    // If no test files or no production files, return perfect isolation
    if (testNodes.length === 0 || productionNodes.length === 0) {
      return {
        score: 1.0,
        testFiles: testNodes.map(n => n.filePath),
        productionFiles: productionNodes.map(n => n.filePath),
        crossingDependencies: 0,
      };
    }

    // Compute MinCut between test and production
    const bipartiteGraph = {
      nodes: [...testNodes, ...productionNodes],
      edges: testProdEdges,
    };

    const minCutInput = GraphAdapter.toMinCutFormat(bipartiteGraph, {
      directed: false,
      normalizeWeights: true,
    });

    const analyzer = new MinCutAnalyzer({ timeout: 5000 });
    const minCutResult = await analyzer.computeMinCut(minCutInput);

    // Calculate isolation score (lower cut value = better isolation)
    // Normalize by number of test files to get score between 0 and 1
    const maxPossibleEdges = testNodes.length * productionNodes.length;
    const score = maxPossibleEdges > 0
      ? 1.0 - Math.min(1.0, minCutResult.cutValue / Math.sqrt(maxPossibleEdges))
      : 1.0;

    return {
      score,
      testFiles: testNodes.map(n => n.filePath),
      productionFiles: productionNodes.map(n => n.filePath),
      crossingDependencies: minCutResult.cutEdges.length,
    };
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

  /**
   * Group nodes by their module (directory path).
   */
  private groupNodesByModule(nodes: GraphNode[]): Record<string, GraphNode[]> {
    const modules: Record<string, GraphNode[]> = {};

    for (const node of nodes) {
      // Extract module name from file path (directory)
      const moduleName = node.filePath.split('/').slice(0, -1).join('/') || '/';

      if (!modules[moduleName]) {
        modules[moduleName] = [];
      }
      modules[moduleName].push(node);
    }

    return modules;
  }

  /**
   * Check if there's a circular dependency between two module groups.
   */
  private hasCircularDependency(
    module1Nodes: GraphNode[],
    module2Nodes: GraphNode[],
    edges: GraphEdge[]
  ): boolean {
    const module1Ids = new Set(module1Nodes.map(n => n.id));
    const module2Ids = new Set(module2Nodes.map(n => n.id));

    let hasM1ToM2 = false;
    let hasM2ToM1 = false;

    for (const edge of edges) {
      if (module1Ids.has(edge.source) && module2Ids.has(edge.target)) {
        hasM1ToM2 = true;
      }
      if (module2Ids.has(edge.source) && module1Ids.has(edge.target)) {
        hasM2ToM1 = true;
      }

      if (hasM1ToM2 && hasM2ToM1) return true;
    }

    return false;
  }

  /**
   * Find shared dependencies between two modules.
   */
  private findSharedDependencies(
    module1Nodes: GraphNode[],
    module2Nodes: GraphNode[],
    graph: { nodes: GraphNode[]; edges: GraphEdge[] }
  ): string[] {
    const module1Ids = new Set(module1Nodes.map(n => n.id));
    const module2Ids = new Set(module2Nodes.map(n => n.id));

    // Find all dependencies of module1
    const module1Deps = new Set<string>();
    for (const edge of graph.edges) {
      if (module1Ids.has(edge.source) && !module1Ids.has(edge.target)) {
        module1Deps.add(edge.target);
      }
    }

    // Find all dependencies of module2
    const module2Deps = new Set<string>();
    for (const edge of graph.edges) {
      if (module2Ids.has(edge.source) && !module2Ids.has(edge.target)) {
        module2Deps.add(edge.target);
      }
    }

    // Find intersection
    const shared: string[] = [];
    for (const dep of module1Deps) {
      if (module2Deps.has(dep)) {
        const node = graph.nodes.find(n => n.id === dep);
        if (node) {
          shared.push(node.filePath);
        }
      }
    }

    return shared;
  }

  /**
   * Generate recommendations for reducing module coupling.
   */
  private generateCouplingRecommendations(
    minCutResult: MinCutResult,
    couplingStrength: number,
    circularDependency: boolean
  ): string[] {
    const recommendations: string[] = [];

    if (couplingStrength > 0.7) {
      recommendations.push(
        'High coupling detected. Consider splitting shared functionality into a separate module.'
      );
    }

    if (circularDependency) {
      recommendations.push(
        'Circular dependency detected. Use dependency inversion or extract shared interface.'
      );
    }

    if (minCutResult.cutEdges.length > 0) {
      const edgeTypes = new Set(minCutResult.cutEdges.map(e => e.edgeType));

      if (edgeTypes.has('extends')) {
        recommendations.push(
          'Inheritance relationship crosses module boundary. Consider composition over inheritance.'
        );
      }

      if (edgeTypes.has('imports')) {
        recommendations.push(
          'Direct imports across modules. Consider using dependency injection or facade pattern.'
        );
      }

      if (edgeTypes.has('calls')) {
        recommendations.push(
          'Function calls across modules. Consider event-driven architecture or message passing.'
        );
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('Coupling is within acceptable range. No immediate action needed.');
    }

    return recommendations;
  }

  /**
   * Find strongly connected components using Tarjan's algorithm.
   */
  private findStronglyConnectedComponents(
    graph: { nodes: GraphNode[]; edges: GraphEdge[] }
  ): GraphNode[][] {
    const sccs: GraphNode[][] = [];
    const visited = new Set<string>();
    const stack: string[] = [];
    const lowLink = new Map<string, number>();
    const indices = new Map<string, number>();
    const onStack = new Set<string>();
    let index = 0;

    const strongConnect = (nodeId: string) => {
      indices.set(nodeId, index);
      lowLink.set(nodeId, index);
      index++;
      stack.push(nodeId);
      onStack.add(nodeId);

      // Get neighbors
      const neighbors = graph.edges
        .filter(e => e.source === nodeId)
        .map(e => e.target);

      for (const neighborId of neighbors) {
        if (!indices.has(neighborId)) {
          strongConnect(neighborId);
          lowLink.set(
            nodeId,
            Math.min(lowLink.get(nodeId)!, lowLink.get(neighborId)!)
          );
        } else if (onStack.has(neighborId)) {
          lowLink.set(
            nodeId,
            Math.min(lowLink.get(nodeId)!, indices.get(neighborId)!)
          );
        }
      }

      // If nodeId is a root node, pop the stack to create an SCC
      if (lowLink.get(nodeId) === indices.get(nodeId)) {
        const scc: GraphNode[] = [];
        let w: string;

        do {
          w = stack.pop()!;
          onStack.delete(w);
          const node = graph.nodes.find(n => n.id === w);
          if (node) scc.push(node);
        } while (w !== nodeId);

        sccs.push(scc);
      }
    };

    // Run Tarjan's algorithm on all unvisited nodes
    for (const node of graph.nodes) {
      if (!indices.has(node.id)) {
        strongConnect(node.id);
      }
    }

    return sccs;
  }

  /**
   * Estimate effort to break a dependency based on edge type.
   */
  private estimateBreakEffort(edgeType?: string): 'low' | 'medium' | 'high' {
    switch (edgeType) {
      case 'extends':
      case 'implements':
        return 'high'; // Requires refactoring inheritance
      case 'imports':
      case 'calls':
        return 'medium'; // Requires restructuring
      case 'uses':
      case 'parameter':
      case 'returns':
        return 'low'; // Can often be resolved with interfaces
      default:
        return 'medium';
    }
  }

  /**
   * Generate suggestion for breaking a dependency.
   */
  private generateBreakSuggestion(cutEdge: {
    source: string;
    target: string;
    edgeType?: string;
  }): string {
    switch (cutEdge.edgeType) {
      case 'extends':
        return 'Replace inheritance with composition or extract common interface';
      case 'implements':
        return 'Move interface to shared module or use dependency inversion';
      case 'imports':
        return 'Introduce abstraction layer or use dependency injection';
      case 'calls':
        return 'Use event-driven architecture or introduce mediator pattern';
      case 'uses':
        return 'Define interface in consuming module (dependency inversion)';
      case 'parameter':
      case 'returns':
        return 'Use generic types or introduce abstraction';
      default:
        return 'Refactor to remove direct dependency';
    }
  }

  /**
   * Assess severity of a circular dependency.
   */
  private assessCycleSeverity(
    cycleLength: number,
    edgeCount: number
  ): 'low' | 'medium' | 'high' {
    // Longer cycles with more edges are more severe
    if (cycleLength >= 5 || edgeCount >= 10) {
      return 'high';
    } else if (cycleLength >= 3 || edgeCount >= 5) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Generate recommendations for resolving circular dependencies.
   */
  private generateCycleRecommendations(
    cycle: string[],
    breakPoints: BreakPoint[],
    severity: 'low' | 'medium' | 'high'
  ): string[] {
    const recommendations: string[] = [];

    if (severity === 'high') {
      recommendations.push(
        'Critical: Large circular dependency detected. Plan major refactoring.'
      );
    }

    // Sort break points by effort
    const sortedBreakPoints = [...breakPoints].sort((a, b) => {
      const effortOrder = { low: 1, medium: 2, high: 3 };
      return effortOrder[a.effort] - effortOrder[b.effort];
    });

    if (sortedBreakPoints.length > 0) {
      const easiest = sortedBreakPoints[0];
      recommendations.push(
        `Easiest break point: ${easiest.source} -> ${easiest.target} (${easiest.effort} effort)`
      );
      recommendations.push(`Suggestion: ${easiest.suggestion}`);
    }

    recommendations.push(
      'Consider using dependency inversion principle to break the cycle'
    );

    if (cycle.length > 3) {
      recommendations.push(
        'Extract common functionality into a separate shared module'
      );
    }

    return recommendations;
  }
}
