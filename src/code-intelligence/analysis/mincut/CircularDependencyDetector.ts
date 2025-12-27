/**
 * Circular Dependency Detector using MinCut Analysis
 *
 * Detects circular dependencies using Tarjan's algorithm for finding
 * strongly connected components (SCCs), then uses MinCut to suggest
 * optimal break points for resolving the cycles.
 *
 * @example
 * ```typescript
 * const detector = new CircularDependencyDetector(codeGraph);
 * const cycles = await detector.detectAll();
 * for (const cycle of cycles) {
 *   console.log(`Cycle: ${cycle.cycle.join(' -> ')}`);
 *   console.log(`Severity: ${cycle.severity}`);
 *   console.log('Break points:', cycle.breakPoints);
 * }
 * ```
 */

import { MinCutAnalyzer } from './MinCutAnalyzer.js';
import { GraphAdapter } from './GraphAdapter.js';
import { CircularDependencyResult, BreakPoint, CutEdge } from './types.js';
import { CodeGraph, GraphNode, GraphEdge, EdgeType } from '../../graph/types.js';
import { Logger } from '../../../utils/Logger.js';

const logger = Logger.getInstance();

/**
 * Strongly connected component (SCC) representation
 */
interface StronglyConnectedComponent {
  /** Nodes in this SCC */
  nodes: GraphNode[];
  /** Edges within this SCC */
  edges: GraphEdge[];
}

/**
 * Detects and analyzes circular dependencies in code graphs
 */
export class CircularDependencyDetector {
  private graph: CodeGraph;
  private analyzer: MinCutAnalyzer;

  /**
   * Create a new CircularDependencyDetector
   *
   * @param graph - The code graph to analyze
   */
  constructor(graph: CodeGraph) {
    this.graph = graph;
    this.analyzer = new MinCutAnalyzer({
      algorithm: 'auto',
      normalizeWeights: true,
      maxNodes: 1000,
      timeout: 10000,
    });
  }

  /**
   * Detect all circular dependencies in the codebase.
   *
   * Uses Tarjan's algorithm to find strongly connected components (SCCs),
   * filters to only cycles (SCCs with >1 node), then analyzes each cycle
   * using MinCut to find optimal break points.
   *
   * @returns Promise resolving to array of CircularDependencyResults, sorted by severity
   *
   * @example
   * ```typescript
   * const results = await detector.detectAll();
   * console.log(`Found ${results.length} circular dependencies`);
   * results.forEach(r => {
   *   console.log(`${r.severity}: ${r.cycle.join(' -> ')}`);
   * });
   * ```
   */
  async detectAll(): Promise<CircularDependencyResult[]> {
    logger.info('Starting circular dependency detection');

    // 1. Find strongly connected components using Tarjan's algorithm
    const sccs = this.findStronglyConnectedComponents();

    logger.info(`Found ${sccs.length} strongly connected components`);

    // 2. Filter to only SCCs with >1 node (these are cycles)
    const cycles = sccs.filter(scc => scc.nodes.length > 1);

    logger.info(`Found ${cycles.length} circular dependencies`);

    if (cycles.length === 0) {
      return [];
    }

    // 3. Analyze each cycle
    const results = await Promise.all(
      cycles.map(scc => this.analyzeCycle(scc))
    );

    // Sort by severity (high -> medium -> low)
    return results.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Check if a specific file is part of any circular dependency.
   *
   * @param filePath - The file path to check
   * @returns Promise resolving to CircularDependencyResult if found, null otherwise
   *
   * @example
   * ```typescript
   * const result = await detector.checkFile('/src/auth/service.ts');
   * if (result) {
   *   console.log('File is part of a cycle:', result.cycle);
   * }
   * ```
   */
  async checkFile(filePath: string): Promise<CircularDependencyResult | null> {
    const results = await this.detectAll();
    return results.find(r => r.cycle.includes(filePath)) || null;
  }

  /**
   * Analyze a single circular dependency and suggest break points.
   *
   * Extracts the subgraph for the SCC, runs MinCut to find weakest links,
   * and generates actionable recommendations.
   *
   * @param scc - The strongly connected component to analyze
   * @returns Promise resolving to CircularDependencyResult
   */
  private async analyzeCycle(
    scc: StronglyConnectedComponent
  ): Promise<CircularDependencyResult> {
    logger.debug(`Analyzing cycle with ${scc.nodes.length} nodes`, {
      nodes: scc.nodes.map(n => n.label),
    });

    // Extract subgraph for this SCC
    const subgraph = this.extractSCCSubgraph(scc);

    // Run MinCut to find weakest links
    const minCutInput = GraphAdapter.toMinCutFormat(subgraph, {
      normalizeWeights: true,
      directed: false, // MinCut works on undirected graphs
    });

    let breakPoints: BreakPoint[] = [];

    try {
      const result = await this.analyzer.computeMinCut(minCutInput);
      breakPoints = result.cutEdges.map(edge => this.createBreakPoint(edge));
    } catch (error) {
      logger.warn('MinCut analysis failed, using fallback heuristic', { error });
      // Fallback: use weakest edges based on edge type
      breakPoints = this.findWeakestEdges(scc);
    }

    // Determine severity based on cycle size and edge types
    const severity = this.calculateSeverity(scc);

    // Generate recommendations
    const recommendations = this.generateRecommendations(scc, breakPoints);

    return {
      cycle: scc.nodes.map(n => n.filePath || n.label),
      breakPoints,
      severity,
      recommendations,
    };
  }

  /**
   * Tarjan's algorithm for finding strongly connected components.
   *
   * Time complexity: O(V + E) where V is nodes and E is edges.
   *
   * @returns Array of strongly connected components
   */
  private findStronglyConnectedComponents(): StronglyConnectedComponent[] {
    const index = new Map<string, number>();
    const lowlink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: GraphNode[] = [];
    const sccs: StronglyConnectedComponent[] = [];
    let currentIndex = 0;

    const strongConnect = (node: GraphNode) => {
      // Set the depth index for this node
      index.set(node.id, currentIndex);
      lowlink.set(node.id, currentIndex);
      currentIndex++;
      stack.push(node);
      onStack.add(node.id);

      // Consider successors of node
      const outgoing = this.graph.outgoingEdges.get(node.id) || [];
      for (const edgeId of outgoing) {
        const edge = this.graph.edges.get(edgeId);
        if (!edge) continue;

        const successor = this.graph.nodes.get(edge.target);
        if (!successor) continue;

        if (!index.has(successor.id)) {
          // Successor has not yet been visited; recurse on it
          strongConnect(successor);
          lowlink.set(node.id, Math.min(
            lowlink.get(node.id)!,
            lowlink.get(successor.id)!
          ));
        } else if (onStack.has(successor.id)) {
          // Successor is in the current SCC
          lowlink.set(node.id, Math.min(
            lowlink.get(node.id)!,
            index.get(successor.id)!
          ));
        }
      }

      // If node is a root node, pop the stack and generate an SCC
      if (lowlink.get(node.id) === index.get(node.id)) {
        const scc: StronglyConnectedComponent = {
          nodes: [],
          edges: [],
        };

        let w: GraphNode | undefined;
        do {
          w = stack.pop();
          if (w) {
            onStack.delete(w.id);
            scc.nodes.push(w);
          }
        } while (w && w.id !== node.id);

        // Collect edges within this SCC
        const nodeIds = new Set(scc.nodes.map(n => n.id));
        for (const n of scc.nodes) {
          const outgoing = this.graph.outgoingEdges.get(n.id) || [];
          for (const edgeId of outgoing) {
            const edge = this.graph.edges.get(edgeId);
            if (edge && nodeIds.has(edge.target)) {
              scc.edges.push(edge);
            }
          }
        }

        sccs.push(scc);
      }
    };

    // Run Tarjan's algorithm on all nodes
    for (const [nodeId, node] of Array.from(this.graph.nodes.entries())) {
      if (!index.has(nodeId)) {
        strongConnect(node);
      }
    }

    return sccs;
  }

  /**
   * Calculate severity of a circular dependency.
   *
   * Severity is based on:
   * - Cycle size (larger = more severe)
   * - Edge types (inheritance = most severe)
   *
   * @param scc - The strongly connected component
   * @returns Severity level
   */
  private calculateSeverity(scc: StronglyConnectedComponent): 'low' | 'medium' | 'high' {
    // High severity: large cycles or inheritance cycles
    if (scc.nodes.length > 5) return 'high';
    if (scc.edges.some(e => e.type === 'extends')) return 'high';

    // Medium severity: 3-5 node cycles or implements cycles
    if (scc.nodes.length >= 3) return 'medium';
    if (scc.edges.some(e => e.type === 'implements')) return 'medium';

    // Low severity: 2-node cycles with imports only
    return 'low';
  }

  /**
   * Create a break point suggestion from a cut edge.
   *
   * @param edge - The edge identified by MinCut
   * @returns BreakPoint with effort estimation and suggestion
   */
  private createBreakPoint(edge: CutEdge): BreakPoint {
    const effortMap: Record<string, 'low' | 'medium' | 'high'> = {
      'imports': 'low',
      'calls': 'low',
      'uses': 'medium',
      'implements': 'medium',
      'extends': 'high',
    };

    const effort = effortMap[edge.edgeType || 'imports'] || 'medium';

    const suggestions: Record<string, string> = {
      'low': 'Extract to shared module or use dependency injection',
      'medium': 'Introduce an interface/abstraction layer',
      'high': 'Restructure inheritance hierarchy - consider composition over inheritance',
    };

    return {
      source: edge.source,
      target: edge.target,
      edgeType: edge.edgeType || 'unknown',
      effort,
      suggestion: suggestions[effort],
    };
  }

  /**
   * Fallback method to find weakest edges when MinCut fails.
   *
   * @param scc - The strongly connected component
   * @returns Array of break points based on edge type heuristics
   */
  private findWeakestEdges(scc: StronglyConnectedComponent): BreakPoint[] {
    // Edge type strength (lower = weaker = better to break)
    const edgeStrength: Record<EdgeType, number> = {
      'tests': 1,
      'imports': 2,
      'calls': 3,
      'uses': 4,
      'exports': 5,
      'contains': 5,
      'returns': 6,
      'parameter': 6,
      'defines': 7,
      'implements': 8,
      'overrides': 9,
      'extends': 10,
    };

    // Sort edges by strength (weakest first)
    const sortedEdges = [...scc.edges].sort((a, b) => {
      const strengthA = edgeStrength[a.type] || 5;
      const strengthB = edgeStrength[b.type] || 5;
      return strengthA - strengthB;
    });

    // Take up to 3 weakest edges
    return sortedEdges.slice(0, 3).map(edge => {
      const sourceNode = this.graph.nodes.get(edge.source);
      const targetNode = this.graph.nodes.get(edge.target);

      return this.createBreakPoint({
        source: sourceNode?.filePath || edge.source,
        target: targetNode?.filePath || edge.target,
        weight: edge.weight,
        edgeType: edge.type,
      });
    });
  }

  /**
   * Generate actionable recommendations for resolving a circular dependency.
   *
   * @param scc - The strongly connected component
   * @param breakPoints - Suggested break points
   * @returns Array of recommendation strings
   */
  private generateRecommendations(
    scc: StronglyConnectedComponent,
    breakPoints: BreakPoint[]
  ): string[] {
    const recommendations: string[] = [];

    recommendations.push(`Circular dependency detected involving ${scc.nodes.length} files`);

    if (breakPoints.length === 0) {
      recommendations.push('No break points identified - manual refactoring required');
      return recommendations;
    }

    if (breakPoints.length === 1) {
      const bp = breakPoints[0];
      recommendations.push(`Recommended: Break the ${bp.source} -> ${bp.target} dependency`);
      recommendations.push(`Effort: ${bp.effort} - ${bp.suggestion}`);
    } else {
      recommendations.push('Multiple break points available (lowest effort first):');
      const sorted = [...breakPoints].sort((a, b) => {
        const order = { low: 0, medium: 1, high: 2 };
        return order[a.effort] - order[b.effort];
      });
      for (const bp of sorted.slice(0, 3)) {
        recommendations.push(`  - ${bp.source} -> ${bp.target} (${bp.effort} effort)`);
      }
    }

    // Add specific recommendations based on edge types
    const hasInheritance = scc.edges.some(e => e.type === 'extends' || e.type === 'implements');
    if (hasInheritance) {
      recommendations.push('Consider: Favor composition over inheritance');
    }

    const hasImports = scc.edges.some(e => e.type === 'imports');
    if (hasImports) {
      recommendations.push('Consider: Use dependency injection or event-driven patterns');
    }

    return recommendations;
  }

  /**
   * Extract a subgraph containing only the nodes and edges in an SCC.
   *
   * @param scc - The strongly connected component
   * @returns Graph with only SCC nodes and edges
   */
  private extractSCCSubgraph(scc: StronglyConnectedComponent): { nodes: GraphNode[]; edges: GraphEdge[] } {
    return {
      nodes: scc.nodes,
      edges: scc.edges,
    };
  }

  /**
   * Get statistics about circular dependencies in the graph.
   *
   * @returns Object with stats about cycles
   *
   * @example
   * ```typescript
   * const stats = await detector.getStats();
   * console.log(`Total cycles: ${stats.totalCycles}`);
   * console.log(`High severity: ${stats.bySeverity.high}`);
   * ```
   */
  async getStats(): Promise<{
    totalCycles: number;
    bySeverity: { high: number; medium: number; low: number };
    largestCycle: number;
    avgCycleSize: number;
  }> {
    const results = await this.detectAll();

    const bySeverity = {
      high: results.filter(r => r.severity === 'high').length,
      medium: results.filter(r => r.severity === 'medium').length,
      low: results.filter(r => r.severity === 'low').length,
    };

    const cycleSizes = results.map(r => r.cycle.length);
    const largestCycle = cycleSizes.length > 0 ? Math.max(...cycleSizes) : 0;
    const avgCycleSize = cycleSizes.length > 0
      ? cycleSizes.reduce((a, b) => a + b, 0) / cycleSizes.length
      : 0;

    return {
      totalCycles: results.length,
      bySeverity,
      largestCycle,
      avgCycleSize,
    };
  }
}
