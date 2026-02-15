/**
 * Agentic QE v3 - Dynamic Scaler
 * ADR-064 Phase 4C: Reactive Auto-Scaling Based on Workload Metrics
 *
 * Monitors workload metrics (queue depth, agent utilization, error rates)
 * and produces scaling decisions to adjust agent count within policy bounds.
 * Supports pluggable ScaleExecutor callbacks for integration with the
 * Queen Coordinator or any other agent lifecycle manager.
 *
 * @example
 * ```typescript
 * import { createDynamicScaler } from './coordination/dynamic-scaling';
 *
 * const scaler = createDynamicScaler(4); // start with 4 agents
 *
 * // Feed metrics periodically
 * scaler.recordMetrics({
 *   queueDepth: 15,
 *   activeAgents: 4,
 *   idleAgents: 0,
 *   avgTaskDurationMs: 2000,
 *   errorRate: 0.05,
 *   throughput: 12,
 *   timestamp: Date.now(),
 * });
 *
 * // Evaluate and optionally execute
 * const decision = scaler.evaluate();
 * if (decision.action !== 'maintain') {
 *   await scaler.execute(decision, async (current, target) => {
 *     // Integrate with Queen Coordinator to spawn/terminate agents
 *     return true;
 *   });
 * }
 * ```
 */

import { randomUUID } from 'node:crypto';
import type {
  WorkloadMetrics,
  ScalingDecision,
  ScalingAction,
  ScalingPolicy,
  ScalingEvent,
  ScalerStats,
  DynamicScalingConfig,
} from './types';
import { DEFAULT_DYNAMIC_SCALING_CONFIG } from './types';
import { getUnifiedMemory, type UnifiedMemoryManager } from '../../kernel/unified-memory.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Callback invoked to execute a scaling action.
 * Returns `true` if the scaling was successful, `false` otherwise.
 *
 * @param currentAgents - Current number of active agents
 * @param targetAgents - Desired number of agents after scaling
 */
export type ScaleExecutor = (
  currentAgents: number,
  targetAgents: number,
) => Promise<boolean>;

// ============================================================================
// DynamicScaler
// ============================================================================

/**
 * Reactive auto-scaler that evaluates workload metrics against a configurable
 * policy and produces scaling decisions with cooldown protection.
 *
 * Lifecycle:
 * 1. Feed metrics via {@link recordMetrics}
 * 2. Call {@link evaluate} to get a scaling decision
 * 3. Optionally call {@link execute} to apply the decision
 *
 * The scaler maintains sliding-window metric averages and enforces cooldown
 * between scaling actions to prevent oscillation.
 */
export class DynamicScaler {
  private readonly config: DynamicScalingConfig;
  private policy: ScalingPolicy;
  private readonly metricsHistory: WorkloadMetrics[] = [];
  private readonly events: ScalingEvent[] = [];
  private lastScaleTime = 0;
  private scaleUpCount = 0;
  private scaleDownCount = 0;
  private totalDecisions = 0;
  private currentAgents: number;
  private lastDecision?: ScalingDecision;

  // KV store persistence (Tier 2)
  private db: UnifiedMemoryManager | null = null;
  private persistCount = 0;
  private static readonly KV_NAMESPACE = 'scaling-metrics';
  private static readonly KV_KEY = 'dynamic-scaler-snapshot';
  private static readonly PERSIST_INTERVAL = 10;
  private static readonly KV_TTL = 7200;

  /**
   * Create a new DynamicScaler.
   *
   * @param initialAgents - Starting agent count (defaults to policy minAgents)
   * @param config - Optional partial config to override defaults
   */
  constructor(
    initialAgents: number = 2,
    config?: Partial<DynamicScalingConfig>,
  ) {
    this.config = { ...DEFAULT_DYNAMIC_SCALING_CONFIG, ...config };
    this.policy = this.config.defaultPolicy;
    this.currentAgents = initialAgents;
  }

  // --------------------------------------------------------------------------
  // Metrics Collection
  // --------------------------------------------------------------------------

  /**
   * Record a workload metrics sample.
   * Oldest samples are evicted when the history exceeds the configured limit.
   *
   * @param metrics - The metrics snapshot to record
   */
  recordMetrics(metrics: WorkloadMetrics): void {
    this.metricsHistory.push(metrics);
    if (this.metricsHistory.length > this.config.metricsHistorySize) {
      this.metricsHistory.shift();
    }
    this.persistCount++;
    if (this.persistCount % DynamicScaler.PERSIST_INTERVAL === 0) {
      this.persistSnapshot().catch(() => {});
    }
  }

  // --------------------------------------------------------------------------
  // Evaluation
  // --------------------------------------------------------------------------

  /**
   * Evaluate current averaged metrics against the active policy and produce
   * a scaling decision.
   *
   * Decision priority:
   * 1. If cooldown is active, return `maintain`
   * 2. If error rate exceeds threshold, scale up by 2
   * 3. If queue-to-agent ratio exceeds threshold, scale up to meet demand
   * 4. If idle ratio exceeds threshold, scale down by removing half the idle
   * 5. Otherwise, maintain current count
   *
   * Target agent count is always clamped to `[minAgents, maxAgents]`.
   *
   * @returns The scaling decision (does not execute it)
   */
  evaluate(): ScalingDecision {
    const avgMetrics = this.getAverageMetrics();
    const now = Date.now();
    this.totalDecisions++;

    // Check cooldown period
    if (now - this.lastScaleTime < this.policy.cooldownMs) {
      const decision: ScalingDecision = {
        action: 'maintain',
        currentAgents: this.currentAgents,
        targetAgents: this.currentAgents,
        reason: 'Cooldown period active',
        metrics: avgMetrics,
        timestamp: now,
      };
      this.lastDecision = decision;
      return decision;
    }

    let action: ScalingAction = 'maintain';
    let targetAgents = this.currentAgents;
    let reason = 'Workload within acceptable range';

    // Priority 1: High error rate -> scale up aggressively
    if (avgMetrics.errorRate > this.policy.errorRateScaleUpThreshold) {
      action = 'scale-up';
      targetAgents = Math.min(this.currentAgents + 2, this.policy.maxAgents);
      reason =
        `High error rate (${(avgMetrics.errorRate * 100).toFixed(1)}%` +
        ` > ${(this.policy.errorRateScaleUpThreshold * 100).toFixed(1)}% threshold)`;
    }
    // Priority 2: Queue depth per agent too high -> scale up to meet demand
    else if (
      this.currentAgents > 0 &&
      avgMetrics.queueDepth / Math.max(1, this.currentAgents) >
        this.policy.scaleUpQueueRatio
    ) {
      action = 'scale-up';
      const needed = Math.ceil(
        avgMetrics.queueDepth / this.policy.scaleUpQueueRatio,
      );
      targetAgents = Math.min(needed, this.policy.maxAgents);
      reason =
        `Queue depth ratio ` +
        `${(avgMetrics.queueDepth / Math.max(1, this.currentAgents)).toFixed(1)}` +
        ` > ${this.policy.scaleUpQueueRatio} threshold`;
    }

    // Priority 3: Too many idle agents -> scale down (only if not scaling up)
    if (action === 'maintain' && this.currentAgents > this.policy.minAgents) {
      const idleRatio =
        this.currentAgents > 0
          ? avgMetrics.idleAgents / this.currentAgents
          : 0;

      if (idleRatio > this.policy.scaleDownIdleRatio) {
        action = 'scale-down';
        const excess = Math.floor(avgMetrics.idleAgents * 0.5);
        targetAgents = Math.max(
          this.currentAgents - excess,
          this.policy.minAgents,
        );
        reason =
          `Idle ratio ${(idleRatio * 100).toFixed(1)}%` +
          ` > ${(this.policy.scaleDownIdleRatio * 100).toFixed(1)}% threshold`;
      }
    }

    // Clamp to policy bounds
    targetAgents = Math.max(
      this.policy.minAgents,
      Math.min(this.policy.maxAgents, targetAgents),
    );

    // If clamping brought target back to current, action is maintain
    if (targetAgents === this.currentAgents) {
      action = 'maintain';
    }

    const decision: ScalingDecision = {
      action,
      currentAgents: this.currentAgents,
      targetAgents,
      reason,
      metrics: avgMetrics,
      timestamp: now,
    };

    this.lastDecision = decision;
    return decision;
  }

  // --------------------------------------------------------------------------
  // Execution
  // --------------------------------------------------------------------------

  /**
   * Execute a scaling decision, optionally delegating to an external executor.
   *
   * If the decision is `maintain`, the event is recorded but no executor is
   * called. For `scale-up` or `scale-down`, the executor is called (if
   * provided) and the internal agent count is updated on success.
   *
   * @param decision - The decision to execute
   * @param executor - Optional callback to perform the actual scaling
   * @returns The scaling event recording the outcome
   */
  async execute(
    decision: ScalingDecision,
    executor?: ScaleExecutor,
  ): Promise<ScalingEvent> {
    const event: ScalingEvent = {
      id: `scale-${randomUUID().slice(0, 8)}`,
      decision,
      executedAt: Date.now(),
      success: true,
    };

    if (decision.action === 'maintain') {
      this.recordEvent(event);
      return event;
    }

    try {
      if (executor) {
        const success = await executor(
          decision.currentAgents,
          decision.targetAgents,
        );
        if (!success) {
          const failedEvent: ScalingEvent = {
            ...event,
            success: false,
            error: 'Executor returned false',
          };
          this.recordEvent(failedEvent);
          return failedEvent;
        }
      }

      // Update internal state on success
      this.currentAgents = decision.targetAgents;
      this.lastScaleTime = Date.now();

      if (decision.action === 'scale-up') {
        this.scaleUpCount++;
      }
      if (decision.action === 'scale-down') {
        this.scaleDownCount++;
      }

      this.recordEvent(event);
      return event;
    } catch (error) {
      const failedEvent: ScalingEvent = {
        ...event,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
      this.recordEvent(failedEvent);
      return failedEvent;
    }
  }

  // --------------------------------------------------------------------------
  // Policy Management
  // --------------------------------------------------------------------------

  /**
   * Replace the active scaling policy.
   * Takes effect on the next {@link evaluate} call.
   *
   * @param policy - The new policy to apply
   */
  setPolicy(policy: ScalingPolicy): void {
    this.policy = policy;
  }

  /**
   * Get a snapshot of the current scaling policy.
   *
   * @returns A copy of the active policy
   */
  getPolicy(): ScalingPolicy {
    return { ...this.policy };
  }

  // --------------------------------------------------------------------------
  // Accessors
  // --------------------------------------------------------------------------

  /**
   * Get the current agent count tracked by this scaler.
   */
  getCurrentAgents(): number {
    return this.currentAgents;
  }

  /**
   * Get aggregated scaler statistics.
   *
   * @returns Current stats including counts, recent events, and last decision
   */
  getStats(): ScalerStats {
    return {
      scaleUpCount: this.scaleUpCount,
      scaleDownCount: this.scaleDownCount,
      totalDecisions: this.totalDecisions,
      currentAgents: this.currentAgents,
      policyName: this.policy.name,
      lastDecision: this.lastDecision,
      recentEvents: [...this.events].slice(-10),
    };
  }

  /**
   * Get a copy of the full metrics history.
   *
   * @returns Array of recorded WorkloadMetrics snapshots
   */
  getMetricsHistory(): readonly WorkloadMetrics[] {
    return [...this.metricsHistory];
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Initialize persistence layer and load last snapshot from KV store.
   * Safe to call multiple times; will not throw on DB failure.
   */
  async initialize(): Promise<void> {
    try {
      this.db = getUnifiedMemory();
      if (!this.db.isInitialized()) await this.db.initialize();
      await this.loadFromKv();
    } catch (error) {
      console.warn(
        '[DynamicScaler] DB init failed, using memory-only:',
        error instanceof Error ? error.message : String(error),
      );
      this.db = null;
    }
  }

  /**
   * Release internal buffers. The scaler should not be used after disposal.
   */
  dispose(): void {
    this.metricsHistory.length = 0;
    this.events.length = 0;
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /**
   * Compute averaged metrics over the most recent `sampleWindowSize` samples.
   * Returns zero-valued metrics if no samples have been recorded.
   */
  private getAverageMetrics(): WorkloadMetrics {
    const window = this.metricsHistory.slice(-this.policy.sampleWindowSize);

    if (window.length === 0) {
      return {
        queueDepth: 0,
        activeAgents: this.currentAgents,
        idleAgents: 0,
        avgTaskDurationMs: 0,
        errorRate: 0,
        throughput: 0,
        timestamp: Date.now(),
      };
    }

    const avg = (fn: (m: WorkloadMetrics) => number): number =>
      window.reduce((sum, m) => sum + fn(m), 0) / window.length;

    return {
      queueDepth: Math.round(avg((m) => m.queueDepth)),
      activeAgents: Math.round(avg((m) => m.activeAgents)),
      idleAgents: Math.round(avg((m) => m.idleAgents)),
      avgTaskDurationMs: Math.round(avg((m) => m.avgTaskDurationMs)),
      errorRate: avg((m) => m.errorRate),
      throughput: avg((m) => m.throughput),
      timestamp: Date.now(),
    };
  }

  /**
   * Record a scaling event, evicting the oldest when the history cap is hit.
   * Triggers periodic persistence to KV store.
   */
  private recordEvent(event: ScalingEvent): void {
    this.events.push(event);
    if (this.events.length > this.config.decisionHistorySize) {
      this.events.shift();
    }
    this.persistCount++;
    if (this.persistCount % DynamicScaler.PERSIST_INTERVAL === 0) {
      this.persistSnapshot().catch(() => {});
    }
  }

  /**
   * Load last persisted snapshot from KV store into in-memory state.
   */
  private async loadFromKv(): Promise<void> {
    if (!this.db) return;
    try {
      const snapshot = await this.db.kvGet<{
        metricsHistory: WorkloadMetrics[];
        events: ScalingEvent[];
      }>(DynamicScaler.KV_KEY, DynamicScaler.KV_NAMESPACE);

      if (snapshot) {
        if (Array.isArray(snapshot.metricsHistory)) {
          for (const m of snapshot.metricsHistory) {
            this.metricsHistory.push(m);
          }
        }
        if (Array.isArray(snapshot.events)) {
          for (const e of snapshot.events) {
            this.events.push(e);
          }
        }
      }
    } catch (error) {
      console.warn(
        '[DynamicScaler] Failed to load KV snapshot:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Persist a trimmed snapshot of metricsHistory and events to KV store.
   * Keeps only the last 50 entries of each to limit storage size.
   */
  private async persistSnapshot(): Promise<void> {
    if (!this.db) return;
    try {
      const snapshot = {
        metricsHistory: this.metricsHistory.slice(-50),
        events: this.events.slice(-50),
      };
      await this.db.kvSet(
        DynamicScaler.KV_KEY,
        snapshot,
        DynamicScaler.KV_NAMESPACE,
        DynamicScaler.KV_TTL,
      );
    } catch (error) {
      console.warn(
        '[DynamicScaler] Failed to persist KV snapshot:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new DynamicScaler instance.
 *
 * @param initialAgents - Starting agent count (defaults to 2)
 * @param config - Optional partial config to override defaults
 * @returns A new DynamicScaler instance
 *
 * @example
 * ```typescript
 * // Use all defaults
 * const scaler = createDynamicScaler();
 *
 * // Start with 6 agents, custom history size
 * const customScaler = createDynamicScaler(6, {
 *   metricsHistorySize: 200,
 * });
 * ```
 */
export function createDynamicScaler(
  initialAgents?: number,
  config?: Partial<DynamicScalingConfig>,
): DynamicScaler {
  return new DynamicScaler(initialAgents, config);
}
