/**
 * Module Coupling Analyzer
 *
 * High-level analyzer for module coupling that provides actionable insights
 * for code quality improvement. Uses MinCut analysis to identify optimal
 * module boundaries and coupling reduction points.
 *
 * @example
 * ```typescript
 * const graph = graphBuilder.exportGraph();
 * const analyzer = new ModuleCouplingAnalyzer(graph, {
 *   moduleGrouping: 'directory',
 *   minCouplingThreshold: 0.1
 * });
 *
 * // Analyze coupling between two modules
 * const result = await analyzer.analyzeCoupling('src/auth', 'src/user');
 * console.log('Coupling strength:', result.couplingStrength);
 * console.log('Recommendations:', result.recommendations);
 *
 * // Find all highly coupled module pairs
 * const coupled = await analyzer.findHighlyCoupledModules(0.7);
 * ```
 */

import { MinCutAnalyzer } from './MinCutAnalyzer.js';
import { GraphAdapter } from './GraphAdapter.js';
import { ModuleCouplingResult, MinCutConfig, MinCutResult } from './types.js';
import { CodeGraph, GraphNode, GraphEdge } from '../../graph/types.js';
import { Logger } from '../../../utils/Logger.js';

const logger = Logger.getInstance();

/**
 * Options for module coupling analysis
 */
export interface ModuleCouplingOptions {
  /** Configuration for MinCut analyzer */
  minCutConfig?: Partial<MinCutConfig>;

  /** How to group code into modules */
  moduleGrouping?: 'directory' | 'file' | 'custom';

  /** Custom function to extract module identifier from file path */
  customModuleExtractor?: (filePath: string) => string;

  /** Minimum coupling threshold - ignore pairs below this value */
  minCouplingThreshold?: number;
}

/**
 * ModuleCouplingAnalyzer - High-level analyzer for module coupling
 *
 * Provides actionable insights about module coupling and recommendations
 * for improving code quality through better module boundaries.
 */
export class ModuleCouplingAnalyzer {
  private graph: CodeGraph;
  private analyzer: MinCutAnalyzer;
  private options: Required<ModuleCouplingOptions>;

  /**
   * Create a new ModuleCouplingAnalyzer
   *
   * @param graph - Code graph to analyze (from GraphBuilder.exportGraph())
   * @param options - Analysis options
   */
  constructor(graph: CodeGraph, options: ModuleCouplingOptions = {}) {
    this.graph = graph;
    this.analyzer = new MinCutAnalyzer(options.minCutConfig);
    this.options = {
      minCutConfig: options.minCutConfig || {},
      moduleGrouping: options.moduleGrouping || 'directory',
      customModuleExtractor: options.customModuleExtractor || this.defaultModuleExtractor.bind(this),
      minCouplingThreshold: options.minCouplingThreshold || 0.1,
    };

    logger.info('ModuleCouplingAnalyzer initialized', {
      nodeCount: graph.nodes.size,
      edgeCount: graph.edges.size,
      moduleGrouping: this.options.moduleGrouping,
    });
  }

  /**
   * Analyze coupling between two specific modules
   *
   * @param module1Path - Path to first module
   * @param module2Path - Path to second module
   * @returns Promise resolving to coupling analysis result
   *
   * @example
   * ```typescript
   * const result = await analyzer.analyzeCoupling('src/auth', 'src/user');
   * if (result.couplingStrength > 0.7) {
   *   console.log('High coupling detected!');
   *   console.log('Recommendations:', result.recommendations);
   * }
   * ```
   */
  async analyzeCoupling(
    module1Path: string,
    module2Path: string
  ): Promise<ModuleCouplingResult> {
    logger.debug('Analyzing coupling', { module1Path, module2Path });

    // 1. Extract nodes for both modules
    const module1Nodes = this.getModuleNodes(module1Path);
    const module2Nodes = this.getModuleNodes(module2Path);

    if (module1Nodes.length === 0 || module2Nodes.length === 0) {
      logger.warn('One or both modules have no nodes', {
        module1Count: module1Nodes.length,
        module2Count: module2Nodes.length,
      });

      return {
        module1: module1Path,
        module2: module2Path,
        couplingStrength: 0,
        sharedDependencies: [],
        circularDependency: false,
        cutEdges: [],
        recommendations: ['One or both modules not found in the code graph'],
      };
    }

    // 2. Build subgraph containing only these modules
    const subgraph = this.extractModuleSubgraph(module1Nodes, module2Nodes);

    // 3. Run MinCut analysis
    const minCutInput = GraphAdapter.toMinCutFormat(subgraph, {
      normalizeWeights: true,
      directed: false,
    });

    let result: MinCutResult;
    try {
      result = await this.analyzer.computeMinCut(minCutInput);
    } catch (error) {
      logger.error('MinCut computation failed', { error });
      return {
        module1: module1Path,
        module2: module2Path,
        couplingStrength: 0,
        sharedDependencies: [],
        circularDependency: false,
        cutEdges: [],
        recommendations: ['Failed to compute minimum cut - graph may be too large or disconnected'],
      };
    }

    // 4. Calculate coupling strength
    const couplingStrength = this.calculateCouplingStrength(result, subgraph);

    // 5. Check for circular dependency
    const circular = this.hasCircularDependency(module1Nodes, module2Nodes);

    // 6. Find shared dependencies
    const shared = this.findSharedDependencies(module1Nodes, module2Nodes);

    // 7. Generate recommendations
    const recommendations = this.generateRecommendations(
      couplingStrength,
      circular,
      result.cutEdges
    );

    logger.debug('Coupling analysis complete', {
      module1Path,
      module2Path,
      couplingStrength,
      circularDependency: circular,
    });

    return {
      module1: module1Path,
      module2: module2Path,
      couplingStrength,
      sharedDependencies: shared,
      circularDependency: circular,
      cutEdges: result.cutEdges,
      recommendations,
    };
  }

  /**
   * Find all highly coupled module pairs
   *
   * @param threshold - Minimum coupling strength to include (0-1, default 0.7)
   * @returns Promise resolving to array of coupling results, sorted by strength
   *
   * @example
   * ```typescript
   * const coupled = await analyzer.findHighlyCoupledModules(0.7);
   * for (const pair of coupled) {
   *   console.log(`${pair.module1} <-> ${pair.module2}: ${pair.couplingStrength}`);
   * }
   * ```
   */
  async findHighlyCoupledModules(
    threshold = 0.7
  ): Promise<ModuleCouplingResult[]> {
    const modules = this.getUniqueModules();
    const results: ModuleCouplingResult[] = [];

    logger.info('Finding highly coupled modules', {
      moduleCount: modules.length,
      threshold,
    });

    // Analyze all module pairs
    for (let i = 0; i < modules.length; i++) {
      for (let j = i + 1; j < modules.length; j++) {
        const result = await this.analyzeCoupling(modules[i], modules[j]);

        // Only include if above minimum threshold AND above requested threshold
        if (result.couplingStrength >= this.options.minCouplingThreshold &&
            result.couplingStrength >= threshold) {
          results.push(result);
        }
      }
    }

    // Sort by coupling strength (highest first)
    results.sort((a, b) => b.couplingStrength - a.couplingStrength);

    logger.info('Found highly coupled modules', { count: results.length });

    return results;
  }

  /**
   * Get a coupling summary for the entire codebase
   *
   * @returns Promise resolving to overall coupling statistics and recommendations
   *
   * @example
   * ```typescript
   * const overview = await analyzer.getCouplingOverview();
   * console.log('Average coupling:', overview.averageCoupling);
   * console.log('Recommendations:', overview.recommendations);
   * ```
   */
  async getCouplingOverview(): Promise<{
    averageCoupling: number;
    maxCoupling: number;
    highlyCoupledPairs: number;
    circularDependencies: number;
    recommendations: string[];
  }> {
    logger.info('Computing coupling overview');

    // Analyze all module pairs (no threshold filter)
    const allResults = await this.findHighlyCoupledModules(0);

    if (allResults.length === 0) {
      return {
        averageCoupling: 0,
        maxCoupling: 0,
        highlyCoupledPairs: 0,
        circularDependencies: 0,
        recommendations: ['No module coupling found - graph may be disconnected or too small'],
      };
    }

    const average = allResults.reduce((sum, r) => sum + r.couplingStrength, 0) / allResults.length;
    const max = Math.max(...allResults.map(r => r.couplingStrength));
    const highlyPaired = allResults.filter(r => r.couplingStrength > 0.7).length;
    const circular = allResults.filter(r => r.circularDependency).length;

    const recommendations: string[] = [];

    if (average > 0.5) {
      recommendations.push('Consider breaking up large modules into smaller, focused units');
    }

    if (circular > 0) {
      recommendations.push(`Found ${circular} circular dependencies - consider introducing abstraction layers`);
    }

    if (highlyPaired > 0) {
      recommendations.push(`Found ${highlyPaired} highly coupled module pairs - review for potential merging or refactoring`);
    }

    if (average < 0.3 && highlyPaired === 0) {
      recommendations.push('Module coupling is low - good separation of concerns');
    }

    logger.info('Coupling overview complete', {
      averageCoupling: average,
      maxCoupling: max,
      highlyCoupledPairs: highlyPaired,
      circularDependencies: circular,
    });

    return {
      averageCoupling: average,
      maxCoupling: max,
      highlyCoupledPairs: highlyPaired,
      circularDependencies: circular,
      recommendations,
    };
  }

  /**
   * Get all nodes belonging to a module
   */
  private getModuleNodes(modulePath: string): GraphNode[] {
    const nodes: GraphNode[] = [];

    for (const node of this.graph.nodes.values()) {
      const nodeModule = this.extractModulePath(node.filePath);
      if (nodeModule === modulePath) {
        nodes.push(node);
      }
    }

    return nodes;
  }

  /**
   * Extract module subgraph containing only specified nodes
   */
  private extractModuleSubgraph(
    nodes1: GraphNode[],
    nodes2: GraphNode[]
  ): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const allNodes = [...nodes1, ...nodes2];
    const nodeIdSet = new Set(allNodes.map(n => n.id));

    // Filter edges to only those connecting nodes in the subgraph
    const edges: GraphEdge[] = [];
    for (const edge of this.graph.edges.values()) {
      if (nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)) {
        edges.push(edge);
      }
    }

    return { nodes: allNodes, edges };
  }

  /**
   * Calculate coupling strength from MinCut result
   *
   * Coupling strength is calculated as:
   * - If cutValue is 0: coupling = 0 (no connection)
   * - Otherwise: coupling = normalized based on cut edges and graph structure
   */
  private calculateCouplingStrength(
    result: MinCutResult,
    graph: { nodes: GraphNode[]; edges: GraphEdge[] }
  ): number {
    if (result.cutValue === 0 || graph.edges.length === 0) {
      return 0;
    }

    // Calculate total possible weight (all edges)
    const totalWeight = graph.edges.reduce((sum, e) => sum + e.weight, 0);

    if (totalWeight === 0) {
      return 0;
    }

    // Coupling strength is the ratio of cut value to total weight
    // Cut edges represent the coupling between modules
    const rawStrength = result.cutValue / totalWeight;

    // Cap at 1.0 and ensure it's in [0, 1] range
    return Math.min(1.0, Math.max(0, rawStrength));
  }

  /**
   * Check if there's a circular dependency between module nodes
   */
  private hasCircularDependency(
    nodes1: GraphNode[],
    nodes2: GraphNode[]
  ): boolean {
    const nodeIds1 = new Set(nodes1.map(n => n.id));
    const nodeIds2 = new Set(nodes2.map(n => n.id));

    // Check if there are edges in both directions
    let hasForward = false;
    let hasBackward = false;

    for (const edge of this.graph.edges.values()) {
      // Forward: module1 -> module2
      if (nodeIds1.has(edge.source) && nodeIds2.has(edge.target)) {
        hasForward = true;
      }

      // Backward: module2 -> module1
      if (nodeIds2.has(edge.source) && nodeIds1.has(edge.target)) {
        hasBackward = true;
      }

      if (hasForward && hasBackward) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find dependencies shared by both modules
   */
  private findSharedDependencies(
    nodes1: GraphNode[],
    nodes2: GraphNode[]
  ): string[] {
    const nodeIds1 = new Set(nodes1.map(n => n.id));
    const nodeIds2 = new Set(nodes2.map(n => n.id));

    // Find external dependencies for each module
    const deps1 = new Set<string>();
    const deps2 = new Set<string>();

    for (const edge of this.graph.edges.values()) {
      // Dependencies of module 1 (exclude internal and module 2)
      if (nodeIds1.has(edge.source) &&
          !nodeIds1.has(edge.target) &&
          !nodeIds2.has(edge.target)) {
        deps1.add(edge.target);
      }

      // Dependencies of module 2 (exclude internal and module 1)
      if (nodeIds2.has(edge.source) &&
          !nodeIds2.has(edge.target) &&
          !nodeIds1.has(edge.target)) {
        deps2.add(edge.target);
      }
    }

    // Find intersection
    const shared: string[] = [];
    for (const dep of deps1) {
      if (deps2.has(dep)) {
        shared.push(dep);
      }
    }

    return shared;
  }

  /**
   * Generate actionable recommendations based on coupling analysis
   */
  private generateRecommendations(
    strength: number,
    circular: boolean,
    edges: Array<{ source: string; target: string }>
  ): string[] {
    const recommendations: string[] = [];

    // Recommendations based on coupling strength
    if (strength > 0.8) {
      recommendations.push('Very high coupling detected - strongly consider merging these modules');
      recommendations.push('If merging is not appropriate, extract shared functionality to a separate module');
    } else if (strength > 0.6) {
      recommendations.push('High coupling detected - review for potential refactoring');
      recommendations.push('Consider extracting shared functionality to reduce interdependence');
    } else if (strength > 0.4) {
      recommendations.push('Moderate coupling - acceptable for closely related modules');
      recommendations.push('Monitor for further increases in coupling');
    } else if (strength < 0.2) {
      recommendations.push('Low coupling - modules are well-isolated');
      recommendations.push('No immediate action needed');
    }

    // Recommendations for circular dependencies
    if (circular) {
      recommendations.push('⚠️ Circular dependency detected - this should be resolved');
      recommendations.push('Break the cycle by:');
      recommendations.push('  1. Introducing an interface/abstraction layer');
      recommendations.push('  2. Moving shared code to a third module');
      recommendations.push('  3. Using dependency injection');
      recommendations.push('  4. Applying the Dependency Inversion Principle');
    }

    // Recommendations for specific edges to break
    if (edges.length > 0 && edges.length <= 5) {
      recommendations.push(`Consider breaking these ${edges.length} key dependencies:`);
      for (const edge of edges.slice(0, 5)) {
        recommendations.push(`  - ${edge.source} -> ${edge.target}`);
      }
    } else if (edges.length > 5) {
      recommendations.push(`Many dependencies found (${edges.length} total)`);
      recommendations.push('Review the top dependencies and extract common patterns');
    }

    return recommendations;
  }

  /**
   * Get unique module identifiers from the graph
   */
  private getUniqueModules(): string[] {
    const modules = new Set<string>();

    for (const node of this.graph.nodes.values()) {
      const modulePath = this.extractModulePath(node.filePath);
      modules.add(modulePath);
    }

    return Array.from(modules).sort();
  }

  /**
   * Extract module path from file path based on grouping strategy
   */
  private extractModulePath(filePath: string): string {
    if (this.options.moduleGrouping === 'custom') {
      return this.options.customModuleExtractor(filePath);
    }

    if (this.options.moduleGrouping === 'file') {
      return filePath;
    }

    // 'directory' mode - extract directory path
    return this.defaultModuleExtractor(filePath);
  }

  /**
   * Default module extractor - extracts directory path
   */
  private defaultModuleExtractor(filePath: string): string {
    const parts = filePath.split('/');

    // Remove filename
    parts.pop();

    // Return directory path, or filename if no directory
    return parts.length > 0 ? parts.join('/') : filePath;
  }

  /**
   * Get current analysis options
   */
  public getOptions(): Readonly<Required<ModuleCouplingOptions>> {
    return { ...this.options };
  }

  /**
   * Get the underlying graph
   */
  public getGraph(): Readonly<CodeGraph> {
    return this.graph;
  }
}
