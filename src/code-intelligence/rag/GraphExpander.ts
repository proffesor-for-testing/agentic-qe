/**
 * Graph Expander
 *
 * Expands search results with related code from the
 * knowledge graph (imports, tests, inheritance, calls).
 */

import type { GraphBuilder } from '../graph/GraphBuilder.js';
import type { GraphNode, EdgeType } from '../graph/types.js';
import type { RetrievedContext } from './types.js';

export interface ExpandedResult {
  /** Original retrieved context */
  original: RetrievedContext;

  /** Related contexts from graph */
  related: Array<{
    context: RetrievedContext;
    relationship: EdgeType;
    direction: 'incoming' | 'outgoing';
  }>;
}

export interface ExpansionConfig {
  /**
   * Maximum depth of graph traversal.
   */
  maxDepth: number;

  /**
   * Maximum related contexts per result.
   */
  maxRelatedPerResult: number;

  /**
   * Edge types to follow.
   */
  edgeTypes: EdgeType[];

  /**
   * Whether to include incoming edges.
   */
  includeIncoming: boolean;

  /**
   * Whether to include outgoing edges.
   */
  includeOutgoing: boolean;

  /**
   * Prioritize relationships by type.
   */
  priorityOrder: EdgeType[];
}

export const DEFAULT_EXPANSION_CONFIG: ExpansionConfig = {
  maxDepth: 2,
  maxRelatedPerResult: 5,
  edgeTypes: ['imports', 'tests', 'extends', 'implements', 'calls', 'uses'],
  includeIncoming: true,
  includeOutgoing: true,
  priorityOrder: ['tests', 'imports', 'extends', 'implements', 'calls', 'uses'],
};

export class GraphExpander {
  private config: ExpansionConfig;
  private graphBuilder: GraphBuilder;
  private contentLoader?: (filePath: string, startLine: number, endLine: number) => Promise<string>;

  constructor(
    graphBuilder: GraphBuilder,
    config: Partial<ExpansionConfig> = {}
  ) {
    this.graphBuilder = graphBuilder;
    this.config = { ...DEFAULT_EXPANSION_CONFIG, ...config };
  }

  /**
   * Set content loader function for loading file content.
   */
  setContentLoader(
    loader: (filePath: string, startLine: number, endLine: number) => Promise<string>
  ): void {
    this.contentLoader = loader;
  }

  /**
   * Expand retrieved results with related code.
   */
  async expandResults(results: RetrievedContext[]): Promise<ExpandedResult[]> {
    const expanded: ExpandedResult[] = [];

    for (const result of results) {
      const related = await this.findRelatedCode(result);
      expanded.push({
        original: result,
        related,
      });
    }

    return expanded;
  }

  /**
   * Find related code for a single result.
   */
  async findRelatedCode(
    context: RetrievedContext
  ): Promise<ExpandedResult['related']> {
    const related: ExpandedResult['related'] = [];

    // Find node in graph
    const node = context.entityName
      ? this.graphBuilder.findNode(context.entityName, context.filePath)
      : this.graphBuilder.findNode(
          context.filePath.split('/').pop() || '',
          context.filePath,
          'file'
        );

    if (!node) return related;

    // Query graph for related nodes
    const queryResult = this.graphBuilder.query({
      startNode: node.id,
      maxDepth: this.config.maxDepth,
      limit: this.config.maxRelatedPerResult * 2, // Get extra for filtering
      direction: this.config.includeIncoming && this.config.includeOutgoing
        ? 'both'
        : this.config.includeOutgoing
        ? 'outgoing'
        : 'incoming',
    });

    // Process edges and convert to contexts
    const seenNodes = new Set<string>([node.id]);

    for (const edge of queryResult.edges) {
      if (related.length >= this.config.maxRelatedPerResult) break;

      // Check edge type
      if (!this.config.edgeTypes.includes(edge.type)) continue;

      // Determine related node and direction
      const isOutgoing = edge.source === node.id;
      const relatedNodeId = isOutgoing ? edge.target : edge.source;

      if (seenNodes.has(relatedNodeId)) continue;
      seenNodes.add(relatedNodeId);

      const relatedNode = this.graphBuilder.getNode(relatedNodeId);
      if (!relatedNode) continue;

      // Convert to context
      const relatedContext = await this.nodeToContext(relatedNode);
      if (relatedContext) {
        related.push({
          context: relatedContext,
          relationship: edge.type,
          direction: isOutgoing ? 'outgoing' : 'incoming',
        });
      }
    }

    // Sort by priority
    related.sort((a, b) => {
      const aIndex = this.config.priorityOrder.indexOf(a.relationship);
      const bIndex = this.config.priorityOrder.indexOf(b.relationship);
      return aIndex - bIndex;
    });

    return related.slice(0, this.config.maxRelatedPerResult);
  }

  /**
   * Get related tests for a code entity.
   */
  async findRelatedTests(context: RetrievedContext): Promise<RetrievedContext[]> {
    const tests: RetrievedContext[] = [];

    // Find entity node
    const node = context.entityName
      ? this.graphBuilder.findNode(context.entityName, context.filePath)
      : this.graphBuilder.findNode(
          context.filePath.split('/').pop() || '',
          context.filePath,
          'file'
        );

    if (!node) return tests;

    // Find incoming TESTS edges
    const edges = this.graphBuilder.getIncomingEdges(node.id);

    for (const edge of edges) {
      if (edge.type !== 'tests') continue;

      const testNode = this.graphBuilder.getNode(edge.source);
      if (!testNode) continue;

      const testContext = await this.nodeToContext(testNode);
      if (testContext) {
        tests.push(testContext);
      }
    }

    return tests;
  }

  /**
   * Get import chain for a file.
   */
  async getImportChain(
    filePath: string,
    maxDepth: number = 3
  ): Promise<Array<{ filePath: string; depth: number }>> {
    const chain: Array<{ filePath: string; depth: number }> = [];
    const visited = new Set<string>();

    const fileName = filePath.split('/').pop() || '';
    const startNode = this.graphBuilder.findNode(fileName, filePath, 'file');

    if (!startNode) return chain;

    // BFS for imports
    const queue: Array<{ nodeId: string; depth: number }> = [
      { nodeId: startNode.id, depth: 0 },
    ];

    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift()!;

      if (visited.has(nodeId) || depth > maxDepth) continue;
      visited.add(nodeId);

      const node = this.graphBuilder.getNode(nodeId);
      if (!node) continue;

      if (depth > 0) {
        chain.push({ filePath: node.filePath, depth });
      }

      // Follow outgoing IMPORTS edges
      const edges = this.graphBuilder.getOutgoingEdges(nodeId);
      for (const edge of edges) {
        if (edge.type === 'imports' && !visited.has(edge.target)) {
          queue.push({ nodeId: edge.target, depth: depth + 1 });
        }
      }
    }

    return chain;
  }

  /**
   * Get inheritance hierarchy for a class.
   */
  async getInheritanceHierarchy(
    className: string,
    filePath: string
  ): Promise<{
    ancestors: string[];
    descendants: string[];
  }> {
    const ancestors: string[] = [];
    const descendants: string[] = [];

    const node = this.graphBuilder.findNode(className, filePath, 'class');
    if (!node) return { ancestors, descendants };

    // Find ancestors (follow EXTENDS/IMPLEMENTS outgoing)
    const ancestorQueue: string[] = [node.id];
    const visitedAncestors = new Set<string>();

    while (ancestorQueue.length > 0) {
      const currentId = ancestorQueue.shift()!;
      if (visitedAncestors.has(currentId)) continue;
      visitedAncestors.add(currentId);

      const edges = this.graphBuilder.getOutgoingEdges(currentId);
      for (const edge of edges) {
        if (edge.type === 'extends' || edge.type === 'implements') {
          const targetNode = this.graphBuilder.getNode(edge.target);
          if (targetNode && currentId !== node.id) {
            ancestors.push(targetNode.label);
          }
          ancestorQueue.push(edge.target);
        }
      }
    }

    // Find descendants (follow EXTENDS/IMPLEMENTS incoming)
    const descendantQueue: string[] = [node.id];
    const visitedDescendants = new Set<string>();

    while (descendantQueue.length > 0) {
      const currentId = descendantQueue.shift()!;
      if (visitedDescendants.has(currentId)) continue;
      visitedDescendants.add(currentId);

      const edges = this.graphBuilder.getIncomingEdges(currentId);
      for (const edge of edges) {
        if (edge.type === 'extends' || edge.type === 'implements') {
          const sourceNode = this.graphBuilder.getNode(edge.source);
          if (sourceNode && currentId !== node.id) {
            descendants.push(sourceNode.label);
          }
          descendantQueue.push(edge.source);
        }
      }
    }

    return { ancestors, descendants };
  }

  /**
   * Convert graph node to retrieved context.
   */
  private async nodeToContext(node: GraphNode): Promise<RetrievedContext | null> {
    let content = '';

    if (this.contentLoader) {
      try {
        content = await this.contentLoader(
          node.filePath,
          node.startLine,
          node.endLine
        );
      } catch {
        // File not accessible
        return null;
      }
    }

    return {
      id: node.id,
      filePath: node.filePath,
      content,
      startLine: node.startLine,
      endLine: node.endLine,
      score: 0, // Related code doesn't have search score
      entityType: node.type,
      entityName: node.label,
      language: node.language,
    };
  }

  /**
   * Get configuration.
   */
  getConfig(): ExpansionConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<ExpansionConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
