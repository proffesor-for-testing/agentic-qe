/**
 * Dependency Graph Builder
 *
 * Generates Mermaid dependency graphs showing module relationships,
 * import chains, and circular dependencies.
 */

import { GraphNode, GraphEdge } from '../graph/types.js';
import { MermaidGenerator, MermaidOptions } from './MermaidGenerator.js';

export interface DependencyGraphOptions extends MermaidOptions {
  /** Show only direct dependencies */
  directOnly?: boolean;

  /** Maximum depth for dependency tree */
  maxDepth?: number;

  /** Highlight circular dependencies */
  highlightCycles?: boolean;

  /** Group by directory */
  groupByDirectory?: boolean;

  /** Show external dependencies (node_modules) */
  showExternal?: boolean;
}

export class DependencyGraphBuilder {
  /**
   * Build dependency graph from import relationships.
   */
  static build(
    nodes: GraphNode[],
    edges: GraphEdge[],
    options: DependencyGraphOptions = {}
  ): string {
    const {
      directOnly = false,
      maxDepth = 3,
      highlightCycles = true,
      showExternal = false,
      maxNodes = 50,
    } = options;

    // Filter to file nodes
    let fileNodes = nodes.filter(n => n.type === 'file');

    // Filter out node_modules unless requested
    if (!showExternal) {
      fileNodes = fileNodes.filter(n => !n.filePath.includes('node_modules'));
    }

    if (fileNodes.length > maxNodes) {
      fileNodes = fileNodes.slice(0, maxNodes);
    }

    // Filter to import/export edges
    const fileNodeIds = new Set(fileNodes.map(n => n.id));
    let dependencyEdges = edges.filter(
      e => fileNodeIds.has(e.source) && fileNodeIds.has(e.target) &&
           (e.type === 'imports' || e.type === 'exports')
    );

    // If directOnly, filter to depth 1
    if (directOnly) {
      dependencyEdges = this.filterDirectDependencies(
        fileNodes,
        dependencyEdges
      );
    }

    if (highlightCycles) {
      return MermaidGenerator.generateDependencyGraphWithCycles(
        fileNodes,
        dependencyEdges,
        options
      );
    }

    return MermaidGenerator.generate(
      fileNodes,
      dependencyEdges,
      'graph',
      {
        ...options,
        direction: 'LR',
        edgeTypeFilter: ['imports', 'exports'],
      }
    );
  }

  /**
   * Build dependency tree for a specific file.
   */
  static buildDependencyTree(
    rootFileId: string,
    nodes: GraphNode[],
    edges: GraphEdge[],
    options: DependencyGraphOptions = {}
  ): string {
    const {
      maxDepth = 3,
      highlightCycles = true,
    } = options;

    const rootNode = nodes.find(n => n.id === rootFileId);
    if (!rootNode) {
      throw new Error(`File not found: ${rootFileId}`);
    }

    const treeNodes = new Set<string>([rootFileId]);
    const treeEdges: GraphEdge[] = [];

    // BFS traversal of dependencies
    const queue: Array<{ nodeId: string; depth: number }> = [
      { nodeId: rootFileId, depth: 0 }
    ];
    const visited = new Set<string>([rootFileId]);

    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift()!;

      if (depth >= maxDepth) continue;

      const dependencies = edges.filter(
        e => e.source === nodeId && (e.type === 'imports' || e.type === 'uses')
      );

      for (const edge of dependencies) {
        treeNodes.add(edge.target);
        treeEdges.push(edge);

        if (!visited.has(edge.target)) {
          visited.add(edge.target);
          queue.push({ nodeId: edge.target, depth: depth + 1 });
        }
      }
    }

    const treeNodeList = nodes.filter(n => treeNodes.has(n.id));

    return this.build(treeNodeList, treeEdges, {
      ...options,
      highlightCycles,
    });
  }

  /**
   * Build reverse dependency graph (who depends on this file).
   */
  static buildReverseDependencies(
    targetFileId: string,
    nodes: GraphNode[],
    edges: GraphEdge[],
    options: DependencyGraphOptions = {}
  ): string {
    const targetNode = nodes.find(n => n.id === targetFileId);
    if (!targetNode) {
      throw new Error(`File not found: ${targetFileId}`);
    }

    // Find all nodes that import/use target
    const dependents = new Set<string>([targetFileId]);
    const reverseEdges: GraphEdge[] = [];

    const findDependents = (nodeId: string): void => {
      const incomingEdges = edges.filter(
        e => e.target === nodeId && (e.type === 'imports' || e.type === 'uses')
      );

      for (const edge of incomingEdges) {
        if (!dependents.has(edge.source)) {
          dependents.add(edge.source);
          reverseEdges.push(edge);
          findDependents(edge.source);
        }
      }
    };

    findDependents(targetFileId);

    const dependentNodes = nodes.filter(n => dependents.has(n.id));

    return this.build(dependentNodes, reverseEdges, options);
  }

  /**
   * Analyze dependency metrics.
   */
  static analyzeDependencies(
    nodes: GraphNode[],
    edges: GraphEdge[]
  ): DependencyMetrics {
    const fileNodes = nodes.filter(n => n.type === 'file');
    const importEdges = edges.filter(e => e.type === 'imports');

    const inDegree = new Map<string, number>();
    const outDegree = new Map<string, number>();

    for (const node of fileNodes) {
      inDegree.set(node.id, 0);
      outDegree.set(node.id, 0);
    }

    for (const edge of importEdges) {
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
      outDegree.set(edge.source, (outDegree.get(edge.source) || 0) + 1);
    }

    // Find most imported (highly coupled)
    const mostImported = Array.from(inDegree.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([nodeId, count]) => {
        const node = nodes.find(n => n.id === nodeId)!;
        return { file: node.label, imports: count };
      });

    // Find most importing (highly dependent)
    const mostImporting = Array.from(outDegree.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([nodeId, count]) => {
        const node = nodes.find(n => n.id === nodeId)!;
        return { file: node.label, dependencies: count };
      });

    // Find circular dependencies
    const cycles = MermaidGenerator.findCircularDependencies(fileNodes, importEdges);

    return {
      totalFiles: fileNodes.length,
      totalDependencies: importEdges.length,
      avgDependenciesPerFile: fileNodes.length > 0
        ? importEdges.length / fileNodes.length
        : 0,
      mostImported,
      mostImporting,
      circularDependencies: cycles.length,
      circularDependencyPaths: cycles,
    };
  }

  /**
   * Filter to direct dependencies only.
   */
  private static filterDirectDependencies(
    nodes: GraphNode[],
    edges: GraphEdge[]
  ): GraphEdge[] {
    // For each node, keep only first-level dependencies
    const directEdges: GraphEdge[] = [];
    const nodeIds = new Set(nodes.map(n => n.id));

    for (const nodeId of nodeIds) {
      const outgoing = edges.filter(e => e.source === nodeId);
      directEdges.push(...outgoing);
    }

    return directEdges;
  }

  /**
   * Generate dependency matrix (tabular view).
   */
  static generateDependencyMatrix(
    nodes: GraphNode[],
    edges: GraphEdge[]
  ): string {
    const fileNodes = nodes.filter(n => n.type === 'file');
    const importEdges = edges.filter(e => e.type === 'imports');

    const matrix: string[][] = [];
    const header = ['File', ...fileNodes.map(n => this.shortenPath(n.label))];
    matrix.push(header);

    for (const source of fileNodes) {
      const row: string[] = [this.shortenPath(source.label)];

      for (const target of fileNodes) {
        const hasEdge = importEdges.some(
          e => e.source === source.id && e.target === target.id
        );
        row.push(hasEdge ? 'X' : '');
      }

      matrix.push(row);
    }

    // Format as markdown table
    const lines: string[] = [];
    lines.push('## Dependency Matrix');
    lines.push('');
    lines.push(matrix[0].join(' | '));
    lines.push(matrix[0].map(() => '---').join(' | '));

    for (let i = 1; i < matrix.length; i++) {
      lines.push(matrix[i].join(' | '));
    }

    return lines.join('\n');
  }

  /**
   * Shorten file path for display.
   */
  private static shortenPath(path: string): string {
    const parts = path.split('/');
    if (parts.length > 2) {
      return `.../${parts[parts.length - 1]}`;
    }
    return path;
  }
}

export interface DependencyMetrics {
  totalFiles: number;
  totalDependencies: number;
  avgDependenciesPerFile: number;
  mostImported: Array<{ file: string; imports: number }>;
  mostImporting: Array<{ file: string; dependencies: number }>;
  circularDependencies: number;
  circularDependencyPaths: string[][];
}
