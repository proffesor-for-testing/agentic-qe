/**
 * Fleet Topology Types
 *
 * Types for fleet topology analysis, SPOF detection, and resilience scoring.
 */

/**
 * Topology mode configuration
 */
export type TopologyMode = 'hierarchical' | 'mesh' | 'hybrid' | 'adaptive';

/**
 * An agent node in the fleet topology graph
 */
export interface TopologyNode {
  /** Unique agent identifier */
  id: string;
  /** Agent type (e.g., 'test-generator', 'coverage-analyzer') */
  type: string;
  /** Node role in the topology (coordinator, worker, observer) */
  role: 'coordinator' | 'worker' | 'observer';
  /** Current agent status */
  status: 'active' | 'idle' | 'busy' | 'failed';
  /** Priority level for resource allocation */
  priority: 'low' | 'medium' | 'high' | 'critical';
  /** Additional node metadata */
  metadata?: Record<string, unknown>;
}

/**
 * A connection (edge) between agents in the topology
 */
export interface TopologyEdge {
  /** Unique edge identifier */
  id: string;
  /** Source agent ID */
  sourceId: string;
  /** Target agent ID */
  targetId: string;
  /** Connection type */
  connectionType: 'command' | 'data' | 'heartbeat' | 'coordination';
  /** Connection strength/weight (1.0 = strong, 0.1 = weak) */
  weight: number;
  /** Whether this is a bidirectional connection */
  bidirectional: boolean;
}

/**
 * Complete fleet topology representation
 */
export interface FleetTopology {
  /** All agent nodes in the topology */
  nodes: TopologyNode[];
  /** All connections between agents */
  edges: TopologyEdge[];
  /** Current topology mode */
  mode: TopologyMode;
  /** Timestamp when topology was last updated */
  lastUpdated: Date;
}

/**
 * Result of Single Point of Failure (SPOF) analysis
 */
export interface SPOFResult {
  /** Agent ID that represents a SPOF */
  agentId: string;
  /** Agent type */
  agentType: string;
  /** SPOF severity (critical = removing this agent disconnects the fleet) */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** How many agents would be disconnected if this SPOF fails */
  affectedAgents: number;
  /** Percentage of fleet that would be affected */
  impactPercentage: number;
  /** List of agent IDs that would be disconnected */
  disconnectedAgents: string[];
  /** Recommendations for mitigating this SPOF */
  recommendations: string[];
}

/**
 * Result of topology resilience analysis
 */
export interface ResilienceResult {
  /** Overall resilience score (0-1, higher is more resilient) */
  score: number;
  /** Minimum cut value (edge connectivity) */
  minCutValue: number;
  /** Average path redundancy (number of alternative paths between nodes) */
  avgPathRedundancy: number;
  /** All detected SPOFs */
  spofs: SPOFResult[];
  /** Critical SPOFs that require immediate attention */
  criticalSpofs: SPOFResult[];
  /** Topology partitions if SPOF nodes are removed */
  vulnerablePartitions: string[][];
  /** Overall topology health grade (A-F) */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  /** Detailed recommendations for improving resilience */
  recommendations: string[];
  /** Computation time in milliseconds */
  computationTimeMs: number;
}

/**
 * Configuration for topology analysis
 */
export interface TopologyAnalysisConfig {
  /** Minimum resilience score threshold (0-1) */
  minResilienceScore?: number;
  /** Maximum acceptable number of critical SPOFs */
  maxCriticalSpofs?: number;
  /** Whether to analyze all potential SPOFs or just critical ones */
  analyzeAllSpofs?: boolean;
  /** Connection types to include in analysis */
  connectionTypes?: TopologyEdge['connectionType'][];
  /** Timeout for analysis in milliseconds */
  timeout?: number;
}

/**
 * Default configuration for topology analysis
 */
export const DEFAULT_TOPOLOGY_ANALYSIS_CONFIG: Required<TopologyAnalysisConfig> = {
  minResilienceScore: 0.6,
  maxCriticalSpofs: 0,
  analyzeAllSpofs: true,
  connectionTypes: ['command', 'data', 'heartbeat', 'coordination'],
  timeout: 30000,
};

/**
 * Topology optimization suggestion
 */
export interface TopologyOptimization {
  /** Type of optimization */
  type: 'add-edge' | 'remove-edge' | 'add-node' | 'restructure';
  /** Description of the optimization */
  description: string;
  /** Expected improvement in resilience score */
  expectedImprovement: number;
  /** Effort required to implement */
  effort: 'low' | 'medium' | 'high';
  /** Priority of this optimization */
  priority: 'low' | 'medium' | 'high' | 'critical';
  /** Specific implementation details */
  implementation?: {
    sourceId?: string;
    targetId?: string;
    connectionType?: TopologyEdge['connectionType'];
  };
}
