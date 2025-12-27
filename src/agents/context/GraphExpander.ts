/**
 * GraphExpander
 *
 * Traverses the code knowledge graph to find related entities.
 * Implements depth-limited BFS to prevent context explosion.
 *
 * Key relationships:
 * - IMPORTS: Module dependencies
 * - TESTS: Test-to-source mapping
 * - CALLS: Function call graph
 * - EXTENDS: Inheritance hierarchy
 * - DEFINES: File-to-entity definitions
 */

import { GraphBuilder } from '../../code-intelligence/graph/GraphBuilder.js';
import type { GraphNode, GraphEdge, EdgeType } from '../../code-intelligence/graph/types.js';

export interface ExpansionConfig {
  /** Maximum traversal depth (default: 2) */
  maxDepth: number;
  /** Maximum nodes to return (default: 20) */
  maxNodes: number;
  /** Edge types to follow (default: all) */
  edgeTypes?: EdgeType[];
  /** Direction to traverse (default: 'both') */
  direction?: 'incoming' | 'outgoing' | 'both';
  /** Minimum edge weight threshold (default: 0) */
  minWeight?: number;
}

export interface ExpandedNode {
  node: GraphNode;
  depth: number;
  path: string[]; // Node IDs from start to this node
  relationship: EdgeType;
  relationshipPath: EdgeType[]; // Edge types along path
}

export interface ExpansionResult {
  nodes: ExpandedNode[];
  totalNodesVisited: number;
  maxDepthReached: number;
  truncated: boolean;
  executionTimeMs: number;
}

const DEFAULT_CONFIG: ExpansionConfig = {
  maxDepth: 2,
  maxNodes: 20,
  direction: 'both',
  minWeight: 0,
};

export class GraphExpander {
  private graphBuilder: GraphBuilder;
  private config: ExpansionConfig;

  constructor(graphBuilder: GraphBuilder, config: Partial<ExpansionConfig> = {}) {
    this.graphBuilder = graphBuilder;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Expand context from a starting node.
   */
  expand(startNodeId: string, config?: Partial<ExpansionConfig>): ExpansionResult {
    const startTime = Date.now();
    const expansionConfig = { ...this.config, ...config };

    const startNode = this.graphBuilder.getNode(startNodeId);
    if (!startNode) {
      return {
        nodes: [],
        totalNodesVisited: 0,
        maxDepthReached: 0,
        truncated: false,
        executionTimeMs: Date.now() - startTime,
      };
    }

    const result: ExpandedNode[] = [];
    const visited = new Set<string>([startNodeId]);
    const queue: Array<{
      node: GraphNode;
      depth: number;
      path: string[];
      relationshipPath: EdgeType[];
    }> = [];

    // Initialize queue with starting node's neighbors
    const startEdges = this.getFilteredEdges(startNodeId, expansionConfig, 0);
    for (const { edge, targetNode } of startEdges) {
      queue.push({
        node: targetNode,
        depth: 1,
        path: [startNodeId, targetNode.id],
        relationshipPath: [edge.type],
      });
    }

    let maxDepthReached = 0;
    let totalNodesVisited = 1; // Start node

    // BFS traversal
    while (queue.length > 0 && result.length < expansionConfig.maxNodes) {
      const current = queue.shift()!;

      // Skip if already visited
      if (visited.has(current.node.id)) continue;

      visited.add(current.node.id);
      totalNodesVisited++;
      maxDepthReached = Math.max(maxDepthReached, current.depth);

      // Add to results
      result.push({
        node: current.node,
        depth: current.depth,
        path: current.path,
        relationship: current.relationshipPath[current.relationshipPath.length - 1],
        relationshipPath: current.relationshipPath,
      });

      // Continue traversal if within depth limit
      if (current.depth < expansionConfig.maxDepth) {
        const edges = this.getFilteredEdges(
          current.node.id,
          expansionConfig,
          current.depth
        );

        for (const { edge, targetNode } of edges) {
          if (!visited.has(targetNode.id)) {
            queue.push({
              node: targetNode,
              depth: current.depth + 1,
              path: [...current.path, targetNode.id],
              relationshipPath: [...current.relationshipPath, edge.type],
            });
          }
        }
      }
    }

    return {
      nodes: result,
      totalNodesVisited,
      maxDepthReached,
      truncated: queue.length > 0 || result.length >= expansionConfig.maxNodes,
      executionTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Expand from multiple starting nodes.
   */
  expandMultiple(
    startNodeIds: string[],
    config?: Partial<ExpansionConfig>
  ): ExpansionResult {
    const startTime = Date.now();
    const expansionConfig = { ...this.config, ...config };

    const allNodes: ExpandedNode[] = [];
    const globalVisited = new Set<string>();
    let totalNodesVisited = 0;
    let maxDepthReached = 0;

    for (const startNodeId of startNodeIds) {
      if (allNodes.length >= expansionConfig.maxNodes) break;

      const result = this.expand(startNodeId, {
        ...expansionConfig,
        maxNodes: expansionConfig.maxNodes - allNodes.length,
      });

      // Add nodes not already in global visited
      for (const expandedNode of result.nodes) {
        if (!globalVisited.has(expandedNode.node.id)) {
          allNodes.push(expandedNode);
          globalVisited.add(expandedNode.node.id);
        }
      }

      totalNodesVisited += result.totalNodesVisited;
      maxDepthReached = Math.max(maxDepthReached, result.maxDepthReached);
    }

    return {
      nodes: allNodes,
      totalNodesVisited,
      maxDepthReached,
      truncated: allNodes.length >= expansionConfig.maxNodes,
      executionTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Find related entities by type and relationship.
   */
  findRelated(
    startNodeId: string,
    relationshipType: EdgeType,
    maxResults: number = 10
  ): ExpandedNode[] {
    const result = this.expand(startNodeId, {
      maxDepth: 2,
      maxNodes: maxResults,
      edgeTypes: [relationshipType],
    });

    return result.nodes;
  }

  /**
   * Get imports for a file node.
   */
  getImports(fileNodeId: string): ExpandedNode[] {
    return this.findRelated(fileNodeId, 'imports', 50);
  }

  /**
   * Get tests for a source file.
   */
  getTests(fileNodeId: string): ExpandedNode[] {
    return this.findRelated(fileNodeId, 'tests', 20);
  }

  /**
   * Get callers of a function.
   */
  getCallers(functionNodeId: string): ExpandedNode[] {
    return this.findRelated(functionNodeId, 'calls', 20);
  }

  /**
   * Get inheritance chain.
   */
  getInheritanceChain(classNodeId: string): ExpandedNode[] {
    return this.findRelated(classNodeId, 'extends', 10);
  }

  /**
   * Update expansion configuration.
   */
  updateConfig(config: Partial<ExpansionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration.
   */
  getConfig(): ExpansionConfig {
    return { ...this.config };
  }

  // === Private Methods ===

  /**
   * Get filtered edges based on config.
   */
  private getFilteredEdges(
    nodeId: string,
    config: ExpansionConfig,
    currentDepth: number
  ): Array<{ edge: GraphEdge; targetNode: GraphNode }> {
    const results: Array<{ edge: GraphEdge; targetNode: GraphNode }> = [];

    // Get edges based on direction
    const edges: GraphEdge[] = [];
    if (config.direction === 'outgoing' || config.direction === 'both') {
      edges.push(...this.graphBuilder.getOutgoingEdges(nodeId));
    }
    if (config.direction === 'incoming' || config.direction === 'both') {
      edges.push(...this.graphBuilder.getIncomingEdges(nodeId));
    }

    for (const edge of edges) {
      // Filter by edge type
      if (config.edgeTypes && !config.edgeTypes.includes(edge.type)) {
        continue;
      }

      // Filter by weight
      if (config.minWeight && edge.weight < config.minWeight) {
        continue;
      }

      // Get target node
      const targetId = edge.source === nodeId ? edge.target : edge.source;
      const targetNode = this.graphBuilder.getNode(targetId);

      if (targetNode) {
        results.push({ edge, targetNode });
      }
    }

    return results;
  }
}
