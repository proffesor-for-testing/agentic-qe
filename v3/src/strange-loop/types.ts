/**
 * Strange Loop Self-Awareness Types
 * ADR-031: Strange Loop Self-Awareness
 *
 * Defines types for the self-observation -> self-modeling -> self-healing cycle
 * that enables autonomous QE systems with genuine self-awareness.
 */

// ============================================================================
// Topology Types
// ============================================================================

/**
 * Types of swarm topologies supported
 */
export type TopologyType = 'mesh' | 'hierarchical' | 'ring' | 'star' | 'hybrid';

/**
 * Agent node in the swarm topology
 */
export interface AgentNode {
  /** Unique agent identifier */
  id: string;

  /** Agent type (e.g., 'queen', 'worker', 'coordinator') */
  type: string;

  /** Agent role in the swarm */
  role: 'coordinator' | 'worker' | 'specialist' | 'scout';

  /** Agent status */
  status: 'active' | 'idle' | 'overloaded' | 'degraded' | 'offline';

  /** Timestamp when agent joined the swarm */
  joinedAt: number;

  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Communication edge between agents
 */
export interface CommunicationEdge {
  /** Source agent ID */
  source: string;

  /** Target agent ID */
  target: string;

  /** Edge weight (communication strength/frequency) */
  weight: number;

  /** Edge type */
  type: 'direct' | 'broadcast' | 'relay';

  /** Latency in milliseconds */
  latencyMs: number;

  /** Whether the edge is bidirectional */
  bidirectional: boolean;
}

/**
 * Swarm topology representation
 */
export interface SwarmTopology {
  /** Agent nodes */
  agents: AgentNode[];

  /** Communication edges */
  edges: CommunicationEdge[];

  /** Current topology type */
  type: TopologyType;

  /** Total agent count */
  agentCount: number;

  /** Total edge count */
  edgeCount: number;
}

// ============================================================================
// Health Metrics Types
// ============================================================================

/**
 * Health metrics for individual agents
 */
export interface AgentHealthMetrics {
  /** Agent responsiveness (0-1) */
  responsiveness: number;

  /** Task completion rate (0-1) */
  taskCompletionRate: number;

  /** Memory utilization (0-1) */
  memoryUtilization: number;

  /** CPU utilization (0-1) */
  cpuUtilization: number;

  /** Active connections count */
  activeConnections: number;

  /** Is this agent a bottleneck? */
  isBottleneck: boolean;

  /** Degree (number of connections) */
  degree: number;

  /** Tasks in queue */
  queuedTasks: number;

  /** Last heartbeat timestamp */
  lastHeartbeat: number;

  /** Error rate (0-1) */
  errorRate: number;
}

/**
 * Connectivity metrics for the swarm
 */
export interface ConnectivityMetrics {
  /** Minimum cut value (lambda) - minimum edges to remove to disconnect */
  minCut: number;

  /** Number of connected components */
  components: number;

  /** Bottleneck agents (single points of failure) */
  bottlenecks: string[];

  /** Average path length between agents */
  avgPathLength: number;

  /** Clustering coefficient */
  clusteringCoefficient: number;

  /** Graph density (actual edges / possible edges) */
  density: number;

  /** Diameter (longest shortest path) */
  diameter: number;
}

/**
 * Swarm vulnerability detected during observation
 */
export interface SwarmVulnerability {
  /** Vulnerability type */
  type: 'bottleneck' | 'isolated_agent' | 'overloaded_agent' | 'single_point_of_failure' | 'network_partition' | 'degraded_connectivity';

  /** Severity (0-1) */
  severity: number;

  /** Affected agent IDs */
  affectedAgents: string[];

  /** Description of the vulnerability */
  description: string;

  /** Suggested remediation */
  suggestedAction: string;

  /** Detection timestamp */
  detectedAt: number;
}

// ============================================================================
// Observation Types
// ============================================================================

/**
 * Complete swarm health observation
 */
export interface SwarmHealthObservation {
  /** Unique observation ID */
  id: string;

  /** Timestamp of observation */
  timestamp: number;

  /** Observer agent ID */
  observerId: string;

  /** Observed swarm topology */
  topology: SwarmTopology;

  /** Connectivity metrics */
  connectivity: ConnectivityMetrics;

  /** Agent-specific health (Map is serialized as entries) */
  agentHealth: Map<string, AgentHealthMetrics>;

  /** Detected vulnerabilities */
  vulnerabilities: SwarmVulnerability[];

  /** Overall swarm health score (0-1) */
  overallHealth: number;
}

/**
 * Serializable version of SwarmHealthObservation for persistence
 */
export interface SerializedSwarmHealthObservation {
  id: string;
  timestamp: number;
  observerId: string;
  topology: SwarmTopology;
  connectivity: ConnectivityMetrics;
  agentHealth: Array<[string, AgentHealthMetrics]>;
  vulnerabilities: SwarmVulnerability[];
  overallHealth: number;
}

// ============================================================================
// Self-Modeling Types
// ============================================================================

/**
 * Trend direction for metrics
 */
export type TrendDirection = 'increasing' | 'decreasing' | 'stable';

/**
 * Trend analysis result
 */
export interface TrendAnalysis {
  /** Direction of the trend */
  direction: TrendDirection;

  /** Rate of change per observation */
  rate: number;

  /** Confidence in the trend (0-1) */
  confidence: number;

  /** Number of data points analyzed */
  dataPoints: number;
}

/**
 * Bottleneck information
 */
export interface BottleneckInfo {
  /** Agent ID that is a bottleneck */
  agentId: string;

  /** Criticality score (0-1) - how critical is this bottleneck */
  criticality: number;

  /** Agents that would be affected if this bottleneck fails */
  affectedAgents: string[];

  /** Recommended mitigation action */
  recommendation: string;

  /** Number of components after removal */
  componentsAfterRemoval: number;
}

/**
 * Bottleneck analysis result
 */
export interface BottleneckAnalysis {
  /** Detected bottlenecks */
  bottlenecks: BottleneckInfo[];

  /** Overall health considering bottlenecks (0-1) */
  overallHealth: number;

  /** Minimum cut value */
  minCut: number;

  /** Timestamp of analysis */
  analyzedAt: number;
}

/**
 * Predicted vulnerability based on trend analysis
 */
export interface PredictedVulnerability {
  /** Vulnerability type */
  type: 'connectivity_degradation' | 'agent_degradation' | 'overload_imminent' | 'partition_risk';

  /** Affected agent ID (if applicable) */
  agentId?: string;

  /** Probability of occurrence (0-1) */
  probability: number;

  /** Estimated time to occurrence in milliseconds */
  timeToOccurrence: number;

  /** Suggested preventive action */
  suggestedAction: string;

  /** Confidence in prediction (0-1) */
  confidence: number;
}

/**
 * Change delta between observations
 */
export interface SwarmModelDelta {
  /** New agents added */
  agentsAdded: string[];

  /** Agents removed */
  agentsRemoved: string[];

  /** Edges added */
  edgesAdded: number;

  /** Edges removed */
  edgesRemoved: number;

  /** Connectivity change */
  connectivityDelta: number;

  /** New vulnerabilities detected */
  newVulnerabilities: SwarmVulnerability[];

  /** Resolved vulnerabilities */
  resolvedVulnerabilities: SwarmVulnerability[];

  /** Significant changes detected */
  isSignificant: boolean;
}

/**
 * Internal swarm model state
 */
export interface SwarmModelState {
  /** Current topology */
  topology: SwarmTopology;

  /** Current connectivity metrics */
  connectivity: ConnectivityMetrics;

  /** Agent health states */
  agentHealth: Map<string, AgentHealthMetrics>;

  /** Active vulnerabilities */
  activeVulnerabilities: SwarmVulnerability[];

  /** Last update timestamp */
  lastUpdated: number;

  /** Model version (incremented on each update) */
  version: number;
}

// ============================================================================
// Self-Healing Types
// ============================================================================

/**
 * Types of self-healing actions
 */
export type SelfHealingActionType =
  | 'spawn_redundant_agent'
  | 'add_connection'
  | 'remove_connection'
  | 'redistribute_load'
  | 'restart_agent'
  | 'isolate_agent'
  | 'promote_to_coordinator'
  | 'demote_coordinator'
  | 'trigger_failover'
  | 'scale_up'
  | 'scale_down'
  | 'rebalance_topology';

/**
 * Priority levels for healing actions
 */
export type ActionPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Self-healing action to be executed
 */
export interface SelfHealingAction {
  /** Unique action ID */
  id: string;

  /** Action type */
  type: SelfHealingActionType;

  /** Target agent ID (if applicable) */
  targetAgentId?: string;

  /** Additional target (e.g., second agent for add_connection) */
  secondaryTargetId?: string;

  /** Priority level */
  priority: ActionPriority;

  /** Estimated impact on swarm health (0-1) */
  estimatedImpact: number;

  /** Whether the action is reversible */
  reversible: boolean;

  /** Reason for the action */
  reason: string;

  /** Triggering vulnerability (if any) */
  triggeringVulnerability?: SwarmVulnerability;

  /** Created timestamp */
  createdAt: number;
}

/**
 * Result of executing a healing action
 */
export interface ActionResult {
  /** Action that was executed */
  action: SelfHealingAction;

  /** Whether execution succeeded */
  success: boolean;

  /** Result message */
  message: string;

  /** Duration of execution in milliseconds */
  durationMs: number;

  /** New observation after action (if available) */
  newObservation?: SwarmHealthObservation;

  /** Error details if failed */
  error?: string;

  /** Timestamp of execution */
  executedAt: number;
}

/**
 * Record of an executed action for history tracking
 */
export interface ExecutedAction {
  /** The action that was executed */
  action: SelfHealingAction;

  /** Result of execution */
  result: ActionResult;

  /** Observation before action */
  observationBefore?: SwarmHealthObservation;

  /** Observation after action */
  observationAfter?: SwarmHealthObservation;

  /** Whether the action improved health */
  healthImproved: boolean;

  /** Health delta (-1 to 1) */
  healthDelta: number;
}

// ============================================================================
// Self-Diagnosis Types
// ============================================================================

/**
 * Self-diagnosis result for an agent observing itself
 */
export interface SelfDiagnosis {
  /** Agent ID performing self-diagnosis */
  agentId: string;

  /** Whether the agent considers itself healthy */
  isHealthy: boolean;

  /** Whether the agent is a bottleneck */
  isBottleneck: boolean;

  /** Self-assessed health metrics */
  metrics: AgentHealthMetrics;

  /** Recommendations for self-improvement */
  recommendations: string[];

  /** Overall swarm health from this agent's perspective */
  overallSwarmHealth: number;

  /** Timestamp of diagnosis */
  diagnosedAt: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for the strange loop system
 */
export interface StrangeLoopConfig {
  /** Observation interval in milliseconds */
  observationIntervalMs: number;

  /** Minimum health threshold to trigger healing (0-1) */
  healingThreshold: number;

  /** Maximum actions to execute per cycle */
  maxActionsPerCycle: number;

  /** Whether to enable predictive healing */
  predictiveHealingEnabled: boolean;

  /** Minimum probability threshold for predictions (0-1) */
  predictionThreshold: number;

  /** Number of observations to keep in history */
  historySize: number;

  /** Whether to auto-start the loop */
  autoStart: boolean;

  /** Cooldown between healing actions in milliseconds */
  actionCooldownMs: number;

  /** Whether to log detailed metrics */
  verboseLogging: boolean;
}

/**
 * Default configuration values
 */
export const DEFAULT_STRANGE_LOOP_CONFIG: StrangeLoopConfig = {
  observationIntervalMs: 5000, // 5 seconds
  healingThreshold: 0.7,
  maxActionsPerCycle: 3,
  predictiveHealingEnabled: true,
  predictionThreshold: 0.7,
  historySize: 100,
  autoStart: false,
  actionCooldownMs: 10000, // 10 seconds
  verboseLogging: false,
};

// ============================================================================
// Statistics Types
// ============================================================================

/**
 * Statistics about the strange loop operation
 */
export interface StrangeLoopStats {
  /** Total observations made */
  totalObservations: number;

  /** Total healing actions executed */
  totalActionsExecuted: number;

  /** Successful healing actions */
  successfulActions: number;

  /** Failed healing actions */
  failedActions: number;

  /** Average observation duration in milliseconds */
  avgObservationDurationMs: number;

  /** Average healing action duration in milliseconds */
  avgActionDurationMs: number;

  /** Vulnerabilities detected */
  vulnerabilitiesDetected: number;

  /** Vulnerabilities resolved */
  vulnerabilitiesResolved: number;

  /** Predictions made */
  predictionsMade: number;

  /** Accurate predictions (vulnerability actually occurred) */
  accuratePredictions: number;

  /** Current swarm health */
  currentHealth: number;

  /** Health trend */
  healthTrend: TrendDirection;

  /** Uptime in milliseconds */
  uptimeMs: number;

  /** Last observation timestamp */
  lastObservationAt: number;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Events emitted by the strange loop system
 */
export type StrangeLoopEventType =
  | 'observation_complete'
  | 'vulnerability_detected'
  | 'vulnerability_resolved'
  | 'healing_action_started'
  | 'healing_action_completed'
  | 'healing_action_failed'
  | 'prediction_made'
  | 'health_degraded'
  | 'health_improved'
  | 'bottleneck_detected'
  | 'loop_started'
  | 'loop_stopped';

/**
 * Event payload for strange loop events
 */
export interface StrangeLoopEvent {
  /** Event type */
  type: StrangeLoopEventType;

  /** Timestamp */
  timestamp: number;

  /** Event data */
  data: unknown;

  /** Observer agent ID */
  observerId: string;
}

/**
 * Event listener callback type
 */
export type StrangeLoopEventListener = (event: StrangeLoopEvent) => void;
