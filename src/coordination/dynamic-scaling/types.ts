/**
 * Agentic QE v3 - Dynamic Agent Scaling Types
 * ADR-064 Phase 4C: Workload-Based Auto-Scaling
 *
 * Defines the type system for reactive auto-scaling. The DynamicScaler
 * monitors workload metrics (queue depth, agent utilization, error rates)
 * and produces scaling decisions to adjust agent count within tier bounds.
 */

// ============================================================================
// Workload Metrics
// ============================================================================

/**
 * A point-in-time snapshot of workload metrics used to drive scaling decisions.
 * Collected periodically and averaged over a sliding window.
 */
export interface WorkloadMetrics {
  /** Number of tasks waiting to be assigned */
  readonly queueDepth: number;

  /** Number of agents currently executing tasks */
  readonly activeAgents: number;

  /** Number of agents currently idle (ready but not executing) */
  readonly idleAgents: number;

  /** Average task duration across recently completed tasks (milliseconds) */
  readonly avgTaskDurationMs: number;

  /** Fraction of tasks that ended in error (0-1) */
  readonly errorRate: number;

  /** Task completion throughput (tasks per minute) */
  readonly throughput: number;

  /** When this snapshot was captured (epoch ms) */
  readonly timestamp: number;
}

// ============================================================================
// Scaling Decisions
// ============================================================================

/**
 * The three possible scaling actions.
 *
 * - `scale-up`: Increase agent count to handle higher load
 * - `scale-down`: Decrease agent count to save resources
 * - `maintain`: Keep current count (within acceptable range or cooldown)
 */
export type ScalingAction = 'scale-up' | 'scale-down' | 'maintain';

/**
 * A scaling decision produced by evaluating workload metrics against policy.
 * May or may not be executed depending on whether the caller chooses to act.
 */
export interface ScalingDecision {
  /** What action to take */
  readonly action: ScalingAction;

  /** Number of agents before any change */
  readonly currentAgents: number;

  /** Desired number of agents after the change */
  readonly targetAgents: number;

  /** Human-readable explanation for the decision */
  readonly reason: string;

  /** The averaged metrics that drove this decision */
  readonly metrics: WorkloadMetrics;

  /** When the decision was made (epoch ms) */
  readonly timestamp: number;
}

// ============================================================================
// Scaling Policy
// ============================================================================

/**
 * A scaling policy that defines thresholds and bounds for auto-scaling.
 * Multiple policies can exist (e.g., per-tier or per-domain) to allow
 * different scaling behavior in different contexts.
 */
export interface ScalingPolicy {
  /** Policy name for identification and logging */
  readonly name: string;

  /**
   * Scale up when queue depth per active agent exceeds this ratio.
   * Example: ratio 3 means scale up if each agent has >3 queued tasks.
   */
  readonly scaleUpQueueRatio: number;

  /**
   * Scale down when idle agents exceed this fraction of total agents.
   * Example: ratio 0.5 means scale down if >50% of agents are idle.
   */
  readonly scaleDownIdleRatio: number;

  /**
   * Scale up when error rate exceeds this threshold (0-1).
   * High error rates may indicate agents are overwhelmed or under-resourced.
   */
  readonly errorRateScaleUpThreshold: number;

  /** Minimum agents to maintain regardless of workload */
  readonly minAgents: number;

  /** Maximum agents allowed regardless of workload */
  readonly maxAgents: number;

  /** Cooldown between scaling actions to prevent oscillation (ms) */
  readonly cooldownMs: number;

  /** Number of metric samples to average for smoothed decisions */
  readonly sampleWindowSize: number;
}

// ============================================================================
// Scaling Events & History
// ============================================================================

/**
 * A record of an executed (or attempted) scaling action, including outcome.
 */
export interface ScalingEvent {
  /** Unique event identifier */
  readonly id: string;

  /** The decision that was executed */
  readonly decision: ScalingDecision;

  /** When the execution occurred (epoch ms) */
  readonly executedAt: number;

  /** Whether the scaling action succeeded */
  readonly success: boolean;

  /** Error message if the action failed */
  readonly error?: string;
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Aggregated statistics about scaler behavior over time.
 */
export interface ScalerStats {
  /** Number of scale-up actions executed */
  readonly scaleUpCount: number;

  /** Number of scale-down actions executed */
  readonly scaleDownCount: number;

  /** Total number of evaluate() calls made */
  readonly totalDecisions: number;

  /** Current agent count */
  readonly currentAgents: number;

  /** Name of the active policy */
  readonly policyName: string;

  /** Most recent scaling decision (if any) */
  readonly lastDecision?: ScalingDecision;

  /** Recent scaling events (capped to last 10) */
  readonly recentEvents: readonly ScalingEvent[];
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Top-level configuration for the DynamicScaler.
 */
export interface DynamicScalingConfig {
  /** Default scaling policy applied when no override is set */
  readonly defaultPolicy: ScalingPolicy;

  /** Maximum number of WorkloadMetrics snapshots to retain */
  readonly metricsHistorySize: number;

  /** Maximum number of ScalingEvents to retain */
  readonly decisionHistorySize: number;
}

// ============================================================================
// Defaults
// ============================================================================

/**
 * Default scaling policy tuned for the standard AQE fleet.
 *
 * - Queue ratio 3: scale up when each agent has >3 pending tasks
 * - Idle ratio 0.5: scale down when >50% agents are idle
 * - Error threshold 0.3: scale up when >30% tasks fail
 * - 2-15 agent range matches ADR-064 tier bounds
 * - 30s cooldown prevents oscillation
 * - 5-sample window smooths transient spikes
 */
export const DEFAULT_SCALING_POLICY: ScalingPolicy = {
  name: 'default',
  scaleUpQueueRatio: 3,
  scaleDownIdleRatio: 0.5,
  errorRateScaleUpThreshold: 0.3,
  minAgents: 2,
  maxAgents: 15,
  cooldownMs: 30_000,
  sampleWindowSize: 5,
};

/**
 * Default DynamicScalingConfig with reasonable retention limits.
 */
export const DEFAULT_DYNAMIC_SCALING_CONFIG: DynamicScalingConfig = {
  defaultPolicy: DEFAULT_SCALING_POLICY,
  metricsHistorySize: 100,
  decisionHistorySize: 50,
};
