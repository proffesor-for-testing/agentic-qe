/**
 * Agentic QE v3 - MinCut Self-Organizing Coordination Interfaces
 * ADR-047: MinCut Self-Organizing QE Integration
 *
 * Provides graph-based analysis of swarm topology health using
 * minimum cut algorithms for self-healing agent coordination.
 */

import { DomainName, Severity } from '../../shared/types';

/**
 * MinCut-specific priority levels for actions and fixes
 * (different from shared Priority which uses p0-p3)
 */
export type MinCutPriority = 'critical' | 'high' | 'medium' | 'low';

// ============================================================================
// Graph Data Structures
// ============================================================================

/**
 * Vertex in the swarm graph (represents an agent or domain)
 */
export interface SwarmVertex {
  /** Unique vertex identifier */
  readonly id: string;

  /** Vertex type */
  readonly type: 'agent' | 'domain' | 'coordinator';

  /** Associated domain (if agent or domain vertex) */
  readonly domain?: DomainName;

  /** Agent capabilities (if agent vertex) */
  readonly capabilities?: string[];

  /** Vertex weight (importance factor) */
  readonly weight: number;

  /** Creation timestamp */
  readonly createdAt: Date;

  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Edge in the swarm graph (represents connection between vertices)
 */
export interface SwarmEdge {
  /** Source vertex ID */
  readonly source: string;

  /** Target vertex ID */
  readonly target: string;

  /** Edge weight (connection strength) */
  readonly weight: number;

  /** Edge type */
  readonly type: 'communication' | 'dependency' | 'coordination' | 'workflow';

  /** Whether edge is bidirectional */
  readonly bidirectional: boolean;

  /** Last activity timestamp */
  readonly lastActivity?: Date;

  /** Message count over this edge */
  readonly messageCount?: number;
}

/**
 * Snapshot of the swarm graph state
 */
export interface SwarmGraphSnapshot {
  /** Snapshot timestamp */
  readonly timestamp: Date;

  /** All vertices */
  readonly vertices: SwarmVertex[];

  /** All edges */
  readonly edges: SwarmEdge[];

  /** Graph statistics */
  readonly stats: SwarmGraphStats;
}

/**
 * Statistics about the swarm graph
 */
export interface SwarmGraphStats {
  /** Number of vertices */
  readonly vertexCount: number;

  /** Number of edges */
  readonly edgeCount: number;

  /** Total edge weight */
  readonly totalWeight: number;

  /** Average vertex degree */
  readonly averageDegree: number;

  /** Graph density (edges / max possible edges) */
  readonly density: number;

  /** Whether graph is connected */
  readonly isConnected: boolean;

  /** Number of connected components */
  readonly componentCount: number;
}

// ============================================================================
// MinCut Analysis Results
// ============================================================================

/**
 * Result of minimum cut calculation
 */
export interface MinCutResult {
  /** Minimum cut value */
  readonly value: number;

  /** Vertices on the "source" side of the cut */
  readonly sourceSide: string[];

  /** Vertices on the "target" side of the cut */
  readonly targetSide: string[];

  /** Edges that form the minimum cut */
  readonly cutEdges: SwarmEdge[];

  /** Calculation timestamp */
  readonly calculatedAt: Date;

  /** Algorithm used */
  readonly algorithm: 'weighted-degree' | 'stoer-wagner' | 'karger';

  /** Calculation duration in milliseconds */
  readonly durationMs: number;
}

/**
 * Weak vertex identified by MinCut analysis
 */
export interface WeakVertex {
  /** Vertex ID */
  readonly vertexId: string;

  /** Vertex details */
  readonly vertex: SwarmVertex;

  /** Weighted degree of the vertex */
  readonly weightedDegree: number;

  /** Risk score (0-1, higher is riskier) */
  readonly riskScore: number;

  /** Why this vertex is weak */
  readonly reason: string;

  /** Suggested actions to strengthen */
  readonly suggestions: StrengtheningAction[];
}

/**
 * Action to strengthen a weak vertex
 */
export interface StrengtheningAction {
  /** Action type */
  readonly type: 'spawn_agent' | 'add_edge' | 'increase_weight' | 'rebalance';

  /** Target vertex to connect to (for add_edge) */
  readonly targetVertex?: string;

  /** Domain to spawn in (for spawn_agent) */
  readonly domain?: DomainName;

  /** Weight increase amount (for increase_weight) */
  readonly weightDelta?: number;

  /** Priority of this action */
  readonly priority: MinCutPriority;

  /** Estimated improvement to MinCut */
  readonly estimatedImprovement: number;
}

// ============================================================================
// Health Monitoring
// ============================================================================

/**
 * MinCut health status
 */
export interface MinCutHealth {
  /**
   * Overall health status:
   * - 'healthy': Good topology connectivity
   * - 'idle': Empty/fresh topology (no agents spawned yet - normal state)
   * - 'warning': Degraded connectivity
   * - 'critical': Poor connectivity requiring attention
   */
  readonly status: 'healthy' | 'idle' | 'warning' | 'critical';

  /** Current MinCut value */
  readonly minCutValue: number;

  /** Threshold for healthy status */
  readonly healthyThreshold: number;

  /** Threshold for warning status */
  readonly warningThreshold: number;

  /** Number of weak vertices */
  readonly weakVertexCount: number;

  /** Top weak vertices */
  readonly topWeakVertices: WeakVertex[];

  /** Trend (improving, stable, degrading) */
  readonly trend: 'improving' | 'stable' | 'degrading';

  /** Historical MinCut values (last N measurements) */
  readonly history: MinCutHistoryEntry[];

  /** Last update timestamp */
  readonly lastUpdated: Date;
}

/**
 * Historical MinCut entry
 */
export interface MinCutHistoryEntry {
  /** Timestamp */
  readonly timestamp: Date;

  /** MinCut value */
  readonly value: number;

  /** Vertex count at this time */
  readonly vertexCount: number;

  /** Edge count at this time */
  readonly edgeCount: number;
}

/**
 * Alert generated by MinCut monitoring
 */
export interface MinCutAlert {
  /** Alert ID */
  readonly id: string;

  /** Alert severity */
  readonly severity: Severity;

  /** Alert message */
  readonly message: string;

  /** Current MinCut value */
  readonly minCutValue: number;

  /** Threshold that was crossed */
  readonly threshold: number;

  /** Affected vertices */
  readonly affectedVertices: string[];

  /** Timestamp */
  readonly timestamp: Date;

  /** Whether alert is acknowledged */
  acknowledged: boolean;

  /** Suggested remediation actions */
  readonly remediations: StrengtheningAction[];
}

// ============================================================================
// Self-Healing (P1 Preview)
// ============================================================================

/**
 * Observation from the Strange Loop cycle
 */
export interface SwarmObservation {
  /** Observation ID */
  readonly id: string;

  /** Observation timestamp */
  readonly timestamp: Date;

  /** Current MinCut value */
  readonly minCutValue: number;

  /** Weak vertices identified */
  readonly weakVertices: WeakVertex[];

  /** Graph snapshot at observation time */
  readonly graphSnapshot: SwarmGraphSnapshot;

  /** Iteration number */
  readonly iteration: number;
}

/**
 * Self-model prediction
 */
export interface SelfModelPrediction {
  /** Predicted MinCut value */
  readonly predictedMinCut: number;

  /** Predicted weak vertices */
  readonly predictedWeakVertices: string[];

  /** Confidence score (0-1) */
  readonly confidence: number;

  /** Prediction timestamp */
  readonly predictedAt: Date;
}

/**
 * Reorganization action decided by Strange Loop
 */
export type ReorganizationAction =
  | { readonly type: 'spawn_agent'; readonly domain: DomainName; readonly capabilities: string[] }
  | { readonly type: 'reinforce_edge'; readonly source: string; readonly target: string; readonly weightIncrease: number }
  | { readonly type: 'remove_weak_vertex'; readonly vertexId: string }
  | { readonly type: 'rebalance_load'; readonly fromAgent: string; readonly toAgent: string }
  | { readonly type: 'no_action'; readonly reason: string };

/**
 * Result of applying a reorganization action
 */
export interface ReorganizationResult {
  /** Action that was applied */
  readonly action: ReorganizationAction;

  /** Whether action succeeded */
  readonly success: boolean;

  /** MinCut value before action */
  readonly minCutBefore: number;

  /** MinCut value after action */
  readonly minCutAfter: number;

  /** Improvement achieved */
  readonly improvement: number;

  /** Error message if failed */
  readonly error?: string;

  /** Duration in milliseconds */
  readonly durationMs: number;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * MinCut health monitor configuration
 */
export interface MinCutHealthConfig {
  /** Threshold for healthy status */
  healthyThreshold: number;

  /** Threshold for warning status (below this is critical) */
  warningThreshold: number;

  /** How often to check MinCut health (ms) */
  checkIntervalMs: number;

  /** Maximum history entries to keep */
  maxHistoryEntries: number;

  /** Whether to emit alerts */
  alertsEnabled: boolean;

  /** Minimum time between alerts for same issue (ms) */
  alertCooldownMs: number;

  /** Whether self-healing is enabled */
  selfHealingEnabled: boolean;

  /** Maximum auto-healing actions per minute */
  maxHealingActionsPerMinute: number;
}

/**
 * Default MinCut health configuration
 */
export const DEFAULT_MINCUT_HEALTH_CONFIG: MinCutHealthConfig = {
  healthyThreshold: 3.0,
  warningThreshold: 2.0,
  checkIntervalMs: 5000,
  maxHistoryEntries: 100,
  alertsEnabled: true,
  alertCooldownMs: 60000,
  selfHealingEnabled: false, // P1 will enable this
  maxHealingActionsPerMinute: 5,
};

// ============================================================================
// Events
// ============================================================================

/**
 * MinCut event types
 */
export type MinCutEventType =
  | 'mincut.updated'
  | 'mincut.threshold.crossed'
  | 'mincut.weak_vertex.detected'
  | 'mincut.alert.generated'
  | 'mincut.healing.started'
  | 'mincut.healing.completed'
  | 'mincut.healing.failed';

/**
 * MinCut event payload
 */
export interface MinCutEvent {
  /** Event type */
  readonly type: MinCutEventType;

  /** Event timestamp */
  readonly timestamp: Date;

  /** Current MinCut value */
  readonly minCutValue: number;

  /** Event-specific payload */
  readonly payload: Record<string, unknown>;
}
