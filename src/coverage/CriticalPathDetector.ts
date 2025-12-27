/**
 * CriticalPathDetector - Identify critical execution paths using MinCut analysis
 *
 * This component uses graph-theoretic minimum cut algorithms to identify:
 * - Bottleneck code paths that many execution flows depend on
 * - Critical edges in the dependency graph
 * - High-priority coverage gaps based on structural importance
 *
 * @module coverage/CriticalPathDetector
 * @version 1.0.0
 */

import { MinCutAnalyzer } from '../code-intelligence/analysis/mincut/MinCutAnalyzer.js';
import { MinCutResult, MinCutGraphInput, CutEdge } from '../code-intelligence/analysis/mincut/types.js';
import { Logger } from '../utils/Logger.js';

const logger = Logger.getInstance();

/**
 * Represents a node in the coverage dependency graph
 */
export interface CoverageNode {
  /** Unique identifier (typically file path or function ID) */
  id: string;
  /** Human-readable label */
  label: string;
  /** Type of code entity */
  type: 'file' | 'function' | 'class' | 'method' | 'module';
  /** Current coverage percentage (0-100) */
  coverage: number;
  /** Number of lines in this entity */
  lines: number;
  /** Cyclomatic complexity (if available) */
  complexity?: number;
  /** Whether this node is an entry point */
  isEntryPoint?: boolean;
  /** Whether this node is an exit point (e.g., API endpoint) */
  isExitPoint?: boolean;
}

/**
 * Represents an edge in the coverage dependency graph
 */
export interface CoverageEdge {
  /** Source node ID */
  source: string;
  /** Target node ID */
  target: string;
  /** Edge weight (call frequency, dependency strength, etc.) */
  weight: number;
  /** Type of dependency */
  type: 'calls' | 'imports' | 'extends' | 'implements' | 'uses';
}

/**
 * Input for critical path detection
 */
export interface CriticalPathInput {
  /** Nodes in the coverage graph */
  nodes: CoverageNode[];
  /** Edges representing dependencies */
  edges: CoverageEdge[];
  /** Optional: Specific entry points to analyze from */
  entryPoints?: string[];
  /** Optional: Specific exit points to analyze to */
  exitPoints?: string[];
}

/**
 * A critical path identified by the detector
 */
export interface CriticalPath {
  /** Unique path identifier */
  id: string;
  /** Nodes in this critical path (ordered) */
  nodes: string[];
  /** Edges in this critical path */
  edges: CutEdge[];
  /** Criticality score (0-1, higher = more critical) */
  criticality: number;
  /** Total weight of dependencies flowing through this path */
  flowWeight: number;
  /** Average coverage of nodes in this path */
  averageCoverage: number;
  /** Reason why this path is critical */
  reason: string;
}

/**
 * A coverage gap with priority ranking
 */
export interface PrioritizedCoverageGap {
  /** Node ID with the coverage gap */
  nodeId: string;
  /** Node label */
  label: string;
  /** Current coverage percentage */
  currentCoverage: number;
  /** Priority rank (1 = highest priority) */
  priority: number;
  /** Criticality score based on MinCut analysis */
  criticality: number;
  /** Impact score if this gap is filled */
  impactScore: number;
  /** Which critical paths this node belongs to */
  criticalPaths: string[];
  /** Suggested test focus areas */
  testSuggestions: string[];
  /** Estimated effort to achieve coverage */
  estimatedEffort: 'low' | 'medium' | 'high';
}

/**
 * Result of critical path detection
 */
export interface CriticalPathResult {
  /** Identified critical paths */
  criticalPaths: CriticalPath[];
  /** Prioritized coverage gaps */
  prioritizedGaps: PrioritizedCoverageGap[];
  /** Bottleneck nodes (appear in multiple critical paths) */
  bottlenecks: BottleneckNode[];
  /** Overall graph metrics */
  metrics: GraphMetrics;
  /** Computation time in milliseconds */
  computationTimeMs: number;
}

/**
 * A bottleneck node in the dependency graph
 */
export interface BottleneckNode {
  /** Node ID */
  nodeId: string;
  /** Node label */
  label: string;
  /** Number of critical paths this node appears in */
  pathCount: number;
  /** Total flow weight through this node */
  totalFlowWeight: number;
  /** Current coverage */
  coverage: number;
  /** Risk level if this bottleneck is not covered */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Metrics about the analyzed graph
 */
export interface GraphMetrics {
  /** Total number of nodes */
  totalNodes: number;
  /** Total number of edges */
  totalEdges: number;
  /** Number of critical paths identified */
  criticalPathCount: number;
  /** Average coverage across all nodes */
  averageCoverage: number;
  /** Graph connectivity score (0-1) */
  connectivityScore: number;
  /** Minimum cut value of the graph */
  minCutValue: number;
}

/**
 * Configuration for the CriticalPathDetector
 */
export interface CriticalPathConfig {
  /** Minimum criticality threshold for paths (0-1) */
  criticalityThreshold?: number;
  /** Maximum number of critical paths to return */
  maxCriticalPaths?: number;
  /** Coverage threshold below which a node is considered a gap */
  coverageGapThreshold?: number;
  /** Timeout for MinCut computation in milliseconds */
  timeout?: number;
}

const DEFAULT_CONFIG: Required<CriticalPathConfig> = {
  criticalityThreshold: 0.3,
  maxCriticalPaths: 10,
  coverageGapThreshold: 80,
  timeout: 10000,
};

/**
 * CriticalPathDetector uses MinCut algorithms to identify critical execution paths
 * and prioritize coverage gaps based on their structural importance in the codebase.
 *
 * @example
 * ```typescript
 * const detector = new CriticalPathDetector();
 * const result = await detector.detectCriticalPaths({
 *   nodes: [
 *     { id: 'auth.ts', label: 'AuthService', type: 'file', coverage: 45, lines: 200 },
 *     { id: 'user.ts', label: 'UserService', type: 'file', coverage: 80, lines: 150 },
 *   ],
 *   edges: [
 *     { source: 'user.ts', target: 'auth.ts', weight: 5, type: 'calls' },
 *   ],
 * });
 * console.log('Critical paths:', result.criticalPaths);
 * console.log('Priority gaps:', result.prioritizedGaps);
 * ```
 */
export class CriticalPathDetector {
  private config: Required<CriticalPathConfig>;
  private minCutAnalyzer: MinCutAnalyzer;

  constructor(config: CriticalPathConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.minCutAnalyzer = new MinCutAnalyzer({
      timeout: this.config.timeout,
      maxNodes: 5000,
    });

    logger.debug('CriticalPathDetector initialized', { config: this.config });
  }

  /**
   * Detect critical paths and prioritize coverage gaps
   *
   * @param input - Coverage graph with nodes and edges
   * @returns Promise resolving to CriticalPathResult
   */
  public async detectCriticalPaths(input: CriticalPathInput): Promise<CriticalPathResult> {
    const startTime = Date.now();

    try {
      // Validate input
      this.validateInput(input);

      // Convert to MinCut graph format
      const minCutGraph = this.toMinCutGraph(input);

      // Find minimum cuts (identifies critical edges)
      const minCutResults = await this.minCutAnalyzer.findAllMinCuts(
        minCutGraph,
        this.config.maxCriticalPaths
      );

      // Build critical paths from cut results
      const criticalPaths = this.buildCriticalPaths(input, minCutResults);

      // Identify bottleneck nodes
      const bottlenecks = this.identifyBottlenecks(input, criticalPaths);

      // Prioritize coverage gaps
      const prioritizedGaps = this.prioritizeCoverageGaps(input, criticalPaths, bottlenecks);

      // Calculate graph metrics
      const metrics = this.calculateMetrics(input, minCutResults, criticalPaths);

      const computationTimeMs = Date.now() - startTime;

      logger.info('Critical path detection completed', {
        criticalPathCount: criticalPaths.length,
        bottleneckCount: bottlenecks.length,
        gapCount: prioritizedGaps.length,
        computationTimeMs,
      });

      return {
        criticalPaths,
        prioritizedGaps,
        bottlenecks,
        metrics,
        computationTimeMs,
      };
    } catch (error) {
      logger.error('Critical path detection failed', { error });
      throw error;
    }
  }

  /**
   * Get prioritized coverage gaps only (simpler API)
   */
  public async getPrioritizedGaps(input: CriticalPathInput): Promise<PrioritizedCoverageGap[]> {
    const result = await this.detectCriticalPaths(input);
    return result.prioritizedGaps;
  }

  /**
   * Validate input data
   */
  private validateInput(input: CriticalPathInput): void {
    if (!input.nodes || input.nodes.length === 0) {
      throw new Error('Input must have at least one node');
    }

    if (!input.edges) {
      throw new Error('Input must have edges array (can be empty)');
    }

    const nodeIds = new Set(input.nodes.map(n => n.id));
    for (const edge of input.edges) {
      if (!nodeIds.has(edge.source)) {
        throw new Error(`Edge source '${edge.source}' not found in nodes`);
      }
      if (!nodeIds.has(edge.target)) {
        throw new Error(`Edge target '${edge.target}' not found in nodes`);
      }
    }
  }

  /**
   * Convert coverage graph to MinCut input format
   */
  private toMinCutGraph(input: CriticalPathInput): MinCutGraphInput {
    return {
      nodes: input.nodes.map(n => ({
        id: n.id,
        label: n.label,
        properties: {
          type: n.type,
          coverage: n.coverage,
          lines: n.lines,
          complexity: n.complexity,
          isEntryPoint: n.isEntryPoint,
          isExitPoint: n.isExitPoint,
        },
      })),
      edges: input.edges.map(e => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
        edgeType: e.type as any,
      })),
      directed: false, // MinCut works on undirected graphs
    };
  }

  /**
   * Build critical paths from MinCut results
   */
  private buildCriticalPaths(
    input: CriticalPathInput,
    minCutResults: MinCutResult[]
  ): CriticalPath[] {
    const nodeMap = new Map(input.nodes.map(n => [n.id, n]));
    const criticalPaths: CriticalPath[] = [];

    for (let i = 0; i < minCutResults.length; i++) {
      const result = minCutResults[i];

      if (result.cutValue === 0 || result.cutEdges.length === 0) {
        continue;
      }

      // Calculate average coverage for nodes in this cut
      const cutNodeIds = new Set([
        ...result.cutEdges.map(e => e.source),
        ...result.cutEdges.map(e => e.target),
      ]);
      const cutNodes = Array.from(cutNodeIds)
        .map(id => nodeMap.get(id))
        .filter((n): n is CoverageNode => n !== undefined);

      const averageCoverage = cutNodes.length > 0
        ? cutNodes.reduce((sum, n) => sum + n.coverage, 0) / cutNodes.length
        : 0;

      // Calculate criticality based on cut value and position
      const maxWeight = Math.max(...input.edges.map(e => e.weight), 1);
      const normalizedCutValue = result.cutValue / maxWeight;
      const criticality = Math.min(1, normalizedCutValue * (1 / (i + 1)));

      if (criticality < this.config.criticalityThreshold) {
        continue;
      }

      criticalPaths.push({
        id: `critical-path-${i + 1}`,
        nodes: Array.from(cutNodeIds),
        edges: result.cutEdges,
        criticality,
        flowWeight: result.cutValue,
        averageCoverage,
        reason: this.generateCriticalPathReason(result, cutNodes, criticality),
      });
    }

    return criticalPaths.slice(0, this.config.maxCriticalPaths);
  }

  /**
   * Generate human-readable reason for why a path is critical
   */
  private generateCriticalPathReason(
    result: MinCutResult,
    nodes: CoverageNode[],
    criticality: number
  ): string {
    const lowCoverageNodes = nodes.filter(n => n.coverage < this.config.coverageGapThreshold);
    const avgCoverage = nodes.length > 0
      ? nodes.reduce((sum, n) => sum + n.coverage, 0) / nodes.length
      : 0;

    if (lowCoverageNodes.length > 0) {
      return `Contains ${lowCoverageNodes.length} low-coverage node(s) with ${result.cutEdges.length} critical edge(s). Average coverage: ${avgCoverage.toFixed(1)}%`;
    }

    if (criticality > 0.7) {
      return `High-traffic path with ${result.cutEdges.length} edge(s) carrying ${result.cutValue.toFixed(2)} total weight`;
    }

    return `Structural bottleneck connecting ${result.partition1.length} and ${result.partition2.length} components`;
  }

  /**
   * Identify bottleneck nodes that appear in multiple critical paths
   */
  private identifyBottlenecks(
    input: CriticalPathInput,
    criticalPaths: CriticalPath[]
  ): BottleneckNode[] {
    const nodeMap = new Map(input.nodes.map(n => [n.id, n]));
    const nodePathCount = new Map<string, number>();
    const nodeFlowWeight = new Map<string, number>();

    // Count appearances in critical paths
    for (const path of criticalPaths) {
      for (const nodeId of path.nodes) {
        nodePathCount.set(nodeId, (nodePathCount.get(nodeId) || 0) + 1);
        nodeFlowWeight.set(nodeId, (nodeFlowWeight.get(nodeId) || 0) + path.flowWeight);
      }
    }

    // Build bottleneck list
    const bottlenecks: BottleneckNode[] = [];

    for (const [nodeId, pathCount] of nodePathCount.entries()) {
      if (pathCount >= 2 || (pathCount >= 1 && criticalPaths.length <= 2)) {
        const node = nodeMap.get(nodeId);
        if (!node) continue;

        const flowWeight = nodeFlowWeight.get(nodeId) || 0;
        const riskLevel = this.calculateRiskLevel(node, pathCount, flowWeight);

        bottlenecks.push({
          nodeId,
          label: node.label,
          pathCount,
          totalFlowWeight: flowWeight,
          coverage: node.coverage,
          riskLevel,
        });
      }
    }

    // Sort by risk (critical first) then by path count
    return bottlenecks.sort((a, b) => {
      const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const riskDiff = riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
      if (riskDiff !== 0) return riskDiff;
      return b.pathCount - a.pathCount;
    });
  }

  /**
   * Calculate risk level for a bottleneck node
   */
  private calculateRiskLevel(
    node: CoverageNode,
    pathCount: number,
    flowWeight: number
  ): 'low' | 'medium' | 'high' | 'critical' {
    const coverageWeight = (100 - node.coverage) / 100;
    const pathWeight = Math.min(pathCount / 5, 1);
    const complexityWeight = node.complexity ? Math.min(node.complexity / 20, 1) : 0.5;

    const riskScore = (coverageWeight * 0.4) + (pathWeight * 0.35) + (complexityWeight * 0.25);

    if (riskScore >= 0.75) return 'critical';
    if (riskScore >= 0.5) return 'high';
    if (riskScore >= 0.25) return 'medium';
    return 'low';
  }

  /**
   * Prioritize coverage gaps based on critical path analysis
   */
  private prioritizeCoverageGaps(
    input: CriticalPathInput,
    criticalPaths: CriticalPath[],
    bottlenecks: BottleneckNode[]
  ): PrioritizedCoverageGap[] {
    const gaps: PrioritizedCoverageGap[] = [];
    const bottleneckSet = new Set(bottlenecks.map(b => b.nodeId));

    // Create node-to-paths mapping
    const nodeToPathsMap = new Map<string, string[]>();
    for (const path of criticalPaths) {
      for (const nodeId of path.nodes) {
        const paths = nodeToPathsMap.get(nodeId) || [];
        paths.push(path.id);
        nodeToPathsMap.set(nodeId, paths);
      }
    }

    // Find all nodes below coverage threshold
    for (const node of input.nodes) {
      if (node.coverage >= this.config.coverageGapThreshold) {
        continue;
      }

      const criticalPathIds = nodeToPathsMap.get(node.id) || [];
      const isBottleneck = bottleneckSet.has(node.id);

      // Calculate criticality score
      const pathCriticality = criticalPathIds.length > 0
        ? criticalPaths
            .filter(p => criticalPathIds.includes(p.id))
            .reduce((sum, p) => sum + p.criticality, 0) / criticalPathIds.length
        : 0;

      const criticality = isBottleneck ? Math.min(1, pathCriticality + 0.3) : pathCriticality;

      // Calculate impact score
      const coverageGap = this.config.coverageGapThreshold - node.coverage;
      const impactScore = (coverageGap / 100) * (1 + criticality) * (node.lines / 100);

      // Generate test suggestions
      const testSuggestions = this.generateTestSuggestions(node, criticalPathIds.length);

      // Estimate effort
      const estimatedEffort = this.estimateEffort(node, coverageGap);

      gaps.push({
        nodeId: node.id,
        label: node.label,
        currentCoverage: node.coverage,
        priority: 0, // Will be set after sorting
        criticality,
        impactScore,
        criticalPaths: criticalPathIds,
        testSuggestions,
        estimatedEffort,
      });
    }

    // Sort by criticality (descending), then by impact score (descending)
    gaps.sort((a, b) => {
      const critDiff = b.criticality - a.criticality;
      if (Math.abs(critDiff) > 0.1) return critDiff;
      return b.impactScore - a.impactScore;
    });

    // Assign priority ranks
    gaps.forEach((gap, index) => {
      gap.priority = index + 1;
    });

    return gaps;
  }

  /**
   * Generate test suggestions for a coverage gap
   */
  private generateTestSuggestions(node: CoverageNode, criticalPathCount: number): string[] {
    const suggestions: string[] = [];

    if (node.type === 'function' || node.type === 'method') {
      suggestions.push(`Add unit tests for ${node.label}`);
      if (node.complexity && node.complexity > 10) {
        suggestions.push(`Test edge cases for complex logic (complexity: ${node.complexity})`);
      }
    }

    if (node.type === 'class') {
      suggestions.push(`Add integration tests for ${node.label}`);
      suggestions.push(`Test class instantiation and public methods`);
    }

    if (node.isEntryPoint) {
      suggestions.push(`Add API/endpoint tests for ${node.label}`);
    }

    if (criticalPathCount > 0) {
      suggestions.push(`Priority: On ${criticalPathCount} critical path(s) - test thoroughly`);
    }

    if (node.coverage < 20) {
      suggestions.push(`Low coverage (${node.coverage}%) - start with basic happy path tests`);
    }

    return suggestions;
  }

  /**
   * Estimate effort to achieve coverage
   */
  private estimateEffort(
    node: CoverageNode,
    coverageGap: number
  ): 'low' | 'medium' | 'high' {
    const complexity = node.complexity || 5;
    const lines = node.lines;

    // Factor in complexity, lines, and coverage gap
    const effortScore = (complexity / 10) * (lines / 200) * (coverageGap / 50);

    if (effortScore < 0.5) return 'low';
    if (effortScore < 1.5) return 'medium';
    return 'high';
  }

  /**
   * Calculate overall graph metrics
   */
  private calculateMetrics(
    input: CriticalPathInput,
    minCutResults: MinCutResult[],
    criticalPaths: CriticalPath[]
  ): GraphMetrics {
    const totalCoverage = input.nodes.reduce((sum, n) => sum + n.coverage, 0);
    const averageCoverage = input.nodes.length > 0 ? totalCoverage / input.nodes.length : 0;

    // Calculate connectivity score based on edge density
    const maxPossibleEdges = (input.nodes.length * (input.nodes.length - 1)) / 2;
    const connectivityScore = maxPossibleEdges > 0
      ? Math.min(1, input.edges.length / maxPossibleEdges * 2) // *2 because sparse graphs are typical
      : 0;

    const minCutValue = minCutResults.length > 0 ? minCutResults[0].cutValue : 0;

    return {
      totalNodes: input.nodes.length,
      totalEdges: input.edges.length,
      criticalPathCount: criticalPaths.length,
      averageCoverage,
      connectivityScore,
      minCutValue,
    };
  }
}
