/**
 * Graph Adapter for MinCut Analysis
 *
 * Converts CodeGraph format to MinCut input format, enabling
 * minimum cut analysis on code dependency graphs for identifying
 * optimal module boundaries and coupling reduction points.
 */

import { CodeGraph, GraphNode, GraphEdge, EdgeType } from '../../graph/types.js';
import { MinCutGraphInput } from './types.js';

/**
 * Options for graph adaptation
 */
export interface GraphAdapterOptions {
  /** Filter function for nodes (return true to include) */
  nodeFilter?: (node: GraphNode) => boolean;

  /** Filter function for edges (return true to include) */
  edgeFilter?: (edge: GraphEdge) => boolean;

  /** Whether the output graph should be directed */
  directed?: boolean;

  /** Whether to normalize edge weights based on edge type */
  normalizeWeights?: boolean;
}

/**
 * Edge type to weight mapping for coupling analysis.
 * Higher weights indicate stronger coupling between components.
 */
const EDGE_TYPE_WEIGHTS: Record<EdgeType, number> = {
  extends: 1.0,      // Strongest - inheritance creates tight coupling
  implements: 0.9,   // Very strong - interface implementation
  imports: 0.8,      // Strong - direct dependency
  calls: 0.6,        // Moderate - function calls
  uses: 0.5,         // Moderate - type usage
  contains: 0.3,     // Weak - parent-child containment
  exports: 0.5,      // Moderate - export relationship
  returns: 0.4,      // Weak - return type dependency
  parameter: 0.4,    // Weak - parameter type dependency
  overrides: 0.8,    // Strong - method override
  defines: 0.3,      // Weak - definition relationship
  tests: 0.2,        // Very weak - test relationship
};

/**
 * GraphAdapter converts CodeGraph to MinCut input format
 *
 * @example
 * ```typescript
 * const graphBuilder = new GraphBuilder();
 * // ... build graph ...
 *
 * const adapter = GraphAdapter.toMinCutFormat(graphBuilder.exportGraph(), {
 *   nodeFilter: (node) => node.type === 'file',
 *   normalizeWeights: true
 * });
 *
 * const analyzer = new MinCutAnalyzer();
 * const result = await analyzer.computeMinCut(adapter);
 * ```
 */
export class GraphAdapter {
  /**
   * Convert CodeGraph to MinCut input format.
   *
   * @param graph - The code graph to convert (from GraphBuilder.exportGraph())
   * @param options - Conversion options
   * @returns MinCut-compatible graph format
   *
   * @example
   * ```typescript
   * const minCutInput = GraphAdapter.toMinCutFormat(graph, {
   *   nodeFilter: (node) => node.type === 'file' || node.type === 'class',
   *   normalizeWeights: true,
   *   directed: false
   * });
   * ```
   */
  static toMinCutFormat(
    graph: { nodes: GraphNode[]; edges: GraphEdge[] },
    options: GraphAdapterOptions = {}
  ): MinCutGraphInput {
    const {
      nodeFilter = () => true,
      edgeFilter = () => true,
      directed = false,
      normalizeWeights = false,
    } = options;

    // Handle empty graph
    if (!graph.nodes || graph.nodes.length === 0) {
      return { nodes: [], edges: [], directed };
    }

    // Filter and convert nodes
    const filteredNodes = graph.nodes.filter(nodeFilter);
    const nodeIdSet = new Set(filteredNodes.map(n => n.id));

    const minCutNodes = filteredNodes.map(node => ({
      id: node.id,
      label: node.label,
      properties: {
        type: node.type,
        filePath: node.filePath,
        startLine: node.startLine,
        endLine: node.endLine,
        language: node.language,
        ...node.properties,
      },
    }));

    // Handle graph with no edges
    if (!graph.edges || graph.edges.length === 0) {
      return { nodes: minCutNodes, edges: [], directed };
    }

    // Filter and convert edges
    const edgeMap = new Map<string, { source: string; target: string; weight: number; edgeType?: EdgeType }>();

    for (const edge of graph.edges) {
      // Skip if edge doesn't pass filter
      if (!edgeFilter(edge)) continue;

      // Skip self-loops
      if (edge.source === edge.target) continue;

      // Skip edges referencing non-existent nodes (after filtering)
      if (!nodeIdSet.has(edge.source) || !nodeIdSet.has(edge.target)) {
        continue;
      }

      // Calculate weight
      let weight = edge.weight;
      if (normalizeWeights) {
        weight = this.normalizeWeight(edge);
      }

      // Create edge key for duplicate detection
      const edgeKey = directed
        ? `${edge.source}->${edge.target}`
        : [edge.source, edge.target].sort().join('<->');

      // Keep edge with highest weight for duplicates
      const existing = edgeMap.get(edgeKey);
      if (!existing || weight > existing.weight) {
        edgeMap.set(edgeKey, {
          source: edge.source,
          target: edge.target,
          weight,
          edgeType: edge.type,
        });
      }
    }

    const minCutEdges = Array.from(edgeMap.values());

    return {
      nodes: minCutNodes,
      edges: minCutEdges,
      directed,
    };
  }

  /**
   * Normalize edge weight based on edge type.
   *
   * Different edge types represent different coupling strengths:
   * - extends: 1.0 (strongest - inheritance)
   * - implements: 0.9
   * - imports: 0.8
   * - calls: 0.6
   * - uses: 0.5
   * - contains: 0.3 (weakest)
   *
   * @param edge - The edge to normalize
   * @returns Normalized weight (0.0 - 1.0)
   *
   * @example
   * ```typescript
   * const edge = { type: 'extends', weight: 2.5, ... };
   * const normalized = GraphAdapter.normalizeWeight(edge);
   * // normalized = 1.0 (extends has highest coupling)
   * ```
   */
  static normalizeWeight(edge: GraphEdge): number {
    const baseWeight = this.getEdgeTypeWeight(edge.type);

    // Combine type-based weight with original edge weight
    // Original weight acts as a multiplier (capped at 2.0)
    const multiplier = Math.min(edge.weight, 2.0);

    return baseWeight * multiplier;
  }

  /**
   * Get coupling weight for an edge type.
   *
   * @param edgeType - The type of edge
   * @returns Weight between 0.0 and 1.0
   *
   * @example
   * ```typescript
   * const weight = GraphAdapter.getEdgeTypeWeight('extends'); // 1.0
   * const weight2 = GraphAdapter.getEdgeTypeWeight('uses'); // 0.5
   * ```
   */
  static getEdgeTypeWeight(edgeType: EdgeType): number {
    return EDGE_TYPE_WEIGHTS[edgeType] ?? 0.5;
  }

  /**
   * Extract a subgraph containing only specified files.
   *
   * Useful for analyzing coupling between specific modules or components.
   * Only includes nodes and edges where both endpoints are in the specified files.
   *
   * @param graph - The full code graph
   * @param filePaths - List of file paths to include
   * @returns Subgraph containing only specified files
   *
   * @example
   * ```typescript
   * const subgraph = GraphAdapter.extractFileSubgraph(graph, [
   *   '/src/auth/login.ts',
   *   '/src/auth/register.ts'
   * ]);
   * // Analyze coupling within auth module
   * const minCutInput = GraphAdapter.toMinCutFormat(subgraph);
   * ```
   */
  static extractFileSubgraph(
    graph: { nodes: GraphNode[]; edges: GraphEdge[] },
    filePaths: string[]
  ): { nodes: GraphNode[]; edges: GraphEdge[] } {
    if (!graph.nodes || graph.nodes.length === 0) {
      return { nodes: [], edges: [] };
    }

    const filePathSet = new Set(filePaths);

    // Filter nodes to only those in specified files
    const filteredNodes = graph.nodes.filter(node =>
      filePathSet.has(node.filePath)
    );

    const nodeIdSet = new Set(filteredNodes.map(n => n.id));

    // Filter edges to only those connecting nodes in the subgraph
    const filteredEdges = (graph.edges || []).filter(edge =>
      nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)
    );

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
    };
  }

  /**
   * Create a file-level dependency graph from a detailed code graph.
   *
   * Aggregates all relationships between files, useful for module-level analysis.
   *
   * @param graph - The detailed code graph
   * @returns File-level graph with aggregated edges
   *
   * @example
   * ```typescript
   * const fileGraph = GraphAdapter.aggregateByFile(detailedGraph);
   * const minCutInput = GraphAdapter.toMinCutFormat(fileGraph, {
   *   normalizeWeights: true
   * });
   * // Analyze optimal module splits at file level
   * ```
   */
  static aggregateByFile(
    graph: { nodes: GraphNode[]; edges: GraphEdge[] }
  ): { nodes: GraphNode[]; edges: GraphEdge[] } {
    if (!graph.nodes || graph.nodes.length === 0) {
      return { nodes: [], edges: [] };
    }

    // Create one node per file
    const fileNodeMap = new Map<string, GraphNode>();

    for (const node of graph.nodes) {
      if (!fileNodeMap.has(node.filePath)) {
        fileNodeMap.set(node.filePath, {
          id: `file:${node.filePath}`,
          type: 'file',
          label: node.filePath.split('/').pop() || node.filePath,
          filePath: node.filePath,
          startLine: 0,
          endLine: 0,
          language: node.language,
          properties: {},
        });
      }
    }

    // Aggregate edges by file-to-file relationships
    const fileEdgeMap = new Map<string, { weight: number; types: Set<EdgeType> }>();

    for (const edge of graph.edges || []) {
      const sourceNode = graph.nodes.find(n => n.id === edge.source);
      const targetNode = graph.nodes.find(n => n.id === edge.target);

      if (!sourceNode || !targetNode) continue;

      // Skip same-file edges
      if (sourceNode.filePath === targetNode.filePath) continue;

      const edgeKey = `${sourceNode.filePath}->${targetNode.filePath}`;
      const existing = fileEdgeMap.get(edgeKey);

      if (existing) {
        existing.weight += edge.weight;
        existing.types.add(edge.type);
      } else {
        fileEdgeMap.set(edgeKey, {
          weight: edge.weight,
          types: new Set([edge.type]),
        });
      }
    }

    // Convert aggregated edges
    const fileEdges: GraphEdge[] = [];
    let edgeId = 0;

    for (const [key, data] of fileEdgeMap) {
      const [sourceFile, targetFile] = key.split('->');
      const sourceId = `file:${sourceFile}`;
      const targetId = `file:${targetFile}`;

      fileEdges.push({
        id: `edge_${edgeId++}`,
        source: sourceId,
        target: targetId,
        type: Array.from(data.types)[0], // Use first type for aggregated edge
        weight: data.weight,
        properties: {
          aggregatedTypes: Array.from(data.types),
          aggregatedWeight: data.weight,
        },
      });
    }

    return {
      nodes: Array.from(fileNodeMap.values()),
      edges: fileEdges,
    };
  }

  /**
   * Validate that a graph is suitable for MinCut analysis.
   *
   * @param graph - Graph to validate
   * @returns Validation result with error messages
   *
   * @example
   * ```typescript
   * const validation = GraphAdapter.validateGraph(graph);
   * if (!validation.valid) {
   *   console.error('Invalid graph:', validation.errors);
   * }
   * ```
   */
  static validateGraph(
    graph: { nodes: GraphNode[]; edges: GraphEdge[] }
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!graph.nodes || graph.nodes.length === 0) {
      errors.push('Graph has no nodes');
    }

    if (graph.nodes && graph.nodes.length === 1) {
      errors.push('Graph must have at least 2 nodes for MinCut analysis');
    }

    // Check for disconnected graph
    if (graph.edges && graph.edges.length === 0 && graph.nodes && graph.nodes.length > 1) {
      errors.push('Graph has no edges (completely disconnected)');
    }

    // Validate edge references
    if (graph.edges && graph.nodes) {
      const nodeIds = new Set(graph.nodes.map(n => n.id));
      for (const edge of graph.edges) {
        if (!nodeIds.has(edge.source)) {
          errors.push(`Edge references non-existent source node: ${edge.source}`);
        }
        if (!nodeIds.has(edge.target)) {
          errors.push(`Edge references non-existent target node: ${edge.target}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
