import { EdgeType } from '../../graph/types.js';

/**
 * Result of a minimum cut computation
 */
export interface MinCutResult {
  /** The value (total weight) of the minimum cut */
  cutValue: number;
  /** Node IDs in the first partition */
  partition1: string[];
  /** Node IDs in the second partition */
  partition2: string[];
  /** Edges that were cut to separate the partitions */
  cutEdges: CutEdge[];
  /** Algorithm used for computation (currently only stoer-wagner is implemented) */
  algorithmUsed: 'stoer-wagner';
  /** Time taken to compute the cut in milliseconds */
  computationTimeMs: number;
}

/**
 * An edge that crosses the minimum cut
 */
export interface CutEdge {
  /** Source node ID */
  source: string;
  /** Target node ID */
  target: string;
  /** Edge weight */
  weight: number;
  /** Optional edge type from the knowledge graph */
  edgeType?: EdgeType;
}

/**
 * Input graph format for MinCut computation
 */
export interface MinCutGraphInput {
  /** Graph nodes */
  nodes: Array<{
    id: string;
    label: string;
    properties?: Record<string, unknown>;
  }>;
  /** Graph edges with weights */
  edges: Array<{
    source: string;
    target: string;
    weight: number;
    edgeType?: EdgeType;
  }>;
  /** Whether the graph is directed (MinCut works on undirected graphs) */
  directed: boolean;
}

/**
 * Configuration for MinCut analyzer
 */
export interface MinCutConfig {
  /**
   * Algorithm selection.
   * Currently only 'stoer-wagner' is supported (pure JavaScript implementation).
   * The 'auto' option is kept for backwards compatibility but uses stoer-wagner.
   */
  algorithm: 'stoer-wagner' | 'auto';
  /** Maximum number of nodes before rejecting the graph (recommended: 500 for performance) */
  maxNodes: number;
  /** Timeout in milliseconds for computation */
  timeout: number;
  /** Whether to normalize edge weights to [0, 1] */
  normalizeWeights: boolean;
}

/**
 * Default configuration for MinCut analyzer
 *
 * Uses Stoer-Wagner algorithm with a 10,000 node limit and 30 second timeout.
 * For optimal performance, graphs should have < 500 nodes.
 */
export const DEFAULT_MINCUT_CONFIG: MinCutConfig = {
  algorithm: 'stoer-wagner',
  maxNodes: 10000,
  timeout: 30000,
  normalizeWeights: true,
};

/**
 * Internal representation of the graph for MinCut algorithms
 */
export interface MinCutGraph {
  /** Adjacency list: nodeId -> { neighborId: weight } */
  adjacency: Map<string, Map<string, number>>;
  /** All node IDs */
  nodes: string[];
  /** Total number of nodes */
  nodeCount: number;
}

/**
 * Result of a single phase in the Stoer-Wagner algorithm
 */
export interface StoerWagnerPhase {
  /** The s-t cut value from this phase */
  cutValue: number;
  /** The node that was merged (t) */
  mergedNode: string;
  /** The node it was merged into (s) */
  targetNode: string;
}

/**
 * Result of module coupling analysis
 */
export interface ModuleCouplingResult {
  /** First module (file or directory path) */
  module1: string;
  /** Second module (file or directory path) */
  module2: string;
  /** Coupling strength (0-1, higher = more coupled) */
  couplingStrength: number;
  /** Shared dependencies between modules */
  sharedDependencies: string[];
  /** Whether a circular dependency exists */
  circularDependency: boolean;
  /** Edges that were cut */
  cutEdges: CutEdge[];
  /** Actionable recommendations for reducing coupling */
  recommendations: string[];
}

/**
 * Result of circular dependency detection
 */
export interface CircularDependencyResult {
  /** Files involved in the circular dependency */
  cycle: string[];
  /** Suggested break points to resolve the cycle */
  breakPoints: BreakPoint[];
  /** Severity of the circular dependency */
  severity: 'low' | 'medium' | 'high';
  /** Recommendations for fixing the cycle */
  recommendations: string[];
}

/**
 * A suggested point to break a circular dependency
 */
export interface BreakPoint {
  /** Source file/entity in the dependency */
  source: string;
  /** Target file/entity in the dependency */
  target: string;
  /** Type of edge that should be broken */
  edgeType: string;
  /** Estimated effort to break this dependency */
  effort: 'low' | 'medium' | 'high';
  /** Specific suggestion for how to break the dependency */
  suggestion: string;
}
