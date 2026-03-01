/**
 * Agentic QE v3 - Structural Health Monitor
 * ADR-068: Mincut-Gated Model Routing
 *
 * Computes structural health of the agent fleet using mincut lambda.
 * Low lambda = fragile fleet topology, high lambda = robust.
 *
 * @module monitoring/structural-health
 */

import {
  QEMinCutService,
  createQEMinCutService,
  type AgentNode,
  type TaskGraph,
  type HealthReport,
} from '../integrations/ruvector/mincut-wrapper.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Fleet health result
 */
export interface FleetHealthResult {
  /** Raw mincut lambda value */
  readonly lambda: number;

  /** Whether the fleet is structurally healthy */
  readonly healthy: boolean;

  /** Weak points in the fleet topology (agent IDs) */
  readonly weakPoints: string[];

  /** Normalized lambda (0-1, higher = healthier) */
  readonly normalizedLambda: number;

  /** Risk score (0-1, higher = riskier) */
  readonly riskScore: number;

  /** Human-readable status */
  readonly status: 'healthy' | 'warning' | 'critical' | 'empty';

  /** Suggestions for improving fleet health */
  readonly suggestions: string[];

  /** Timestamp of measurement */
  readonly measuredAt: Date;
}

/**
 * History entry for tracking health over time
 */
export interface HealthHistoryEntry {
  /** Lambda value at measurement time */
  readonly lambda: number;

  /** Whether fleet was healthy */
  readonly healthy: boolean;

  /** Number of weak points */
  readonly weakPointCount: number;

  /** Agent count at measurement time */
  readonly agentCount: number;

  /** Timestamp */
  readonly timestamp: Date;
}

/**
 * Configuration for the Structural Health Monitor
 */
export interface StructuralHealthConfig {
  /** Lambda threshold for healthy status (default: 0.4) */
  readonly healthyThreshold: number;

  /** Lambda threshold for warning vs critical (default: 0.2) */
  readonly warningThreshold: number;

  /** Maximum history entries to retain (default: 100) */
  readonly maxHistoryEntries: number;

  /** Whether to log health checks to stderr (default: false) */
  readonly enableLogging: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_STRUCTURAL_HEALTH_CONFIG: StructuralHealthConfig = {
  healthyThreshold: 0.4,
  warningThreshold: 0.2,
  maxHistoryEntries: 100,
  enableLogging: false,
};

// ============================================================================
// StructuralHealthMonitor
// ============================================================================

/**
 * Structural Health Monitor
 *
 * Monitors the structural health of the agent fleet by computing
 * mincut lambda values. Tracks health history over time and identifies
 * trends.
 *
 * @example
 * ```typescript
 * const monitor = new StructuralHealthMonitor();
 * const health = monitor.computeFleetHealth(agents);
 * if (!health.healthy) {
 *   console.warn(`Fleet fragile: ${health.weakPoints.join(', ')}`);
 * }
 * ```
 */
export class StructuralHealthMonitor {
  private readonly config: StructuralHealthConfig;
  private readonly minCutService: QEMinCutService;
  private readonly history: HealthHistoryEntry[] = [];

  constructor(config?: Partial<StructuralHealthConfig>) {
    this.config = { ...DEFAULT_STRUCTURAL_HEALTH_CONFIG, ...config };
    this.minCutService = createQEMinCutService();
  }

  /**
   * Compute fleet health from an array of agent nodes
   *
   * @param agents - Current agent fleet
   * @returns Fleet health result
   */
  computeFleetHealth(agents: AgentNode[]): FleetHealthResult {
    if (agents.length === 0) {
      return this.emptyFleetResult();
    }

    // Build a task graph and analyze structural health
    const graph = this.minCutService.buildTaskGraphFromTopology(agents);
    return this.computeFleetHealthFromGraph(graph, agents.length);
  }

  /**
   * Compute fleet health from a pre-built task graph
   *
   * @param graph - Task graph representing the fleet
   * @param agentCount - Number of agents (for history tracking)
   * @returns Fleet health result
   */
  computeFleetHealthFromGraph(graph: TaskGraph, agentCount?: number): FleetHealthResult {
    if (graph.nodes.length === 0) {
      return this.emptyFleetResult();
    }

    const healthReport = this.minCutService.getStructuralHealth(graph);
    const status = this.determineStatus(healthReport.normalizedLambda);

    const result: FleetHealthResult = {
      lambda: healthReport.lambda,
      healthy: healthReport.healthy,
      weakPoints: healthReport.weakPoints,
      normalizedLambda: healthReport.normalizedLambda,
      riskScore: healthReport.riskScore,
      status,
      suggestions: healthReport.suggestions,
      measuredAt: new Date(),
    };

    // Record history
    this.addHistoryEntry({
      lambda: healthReport.lambda,
      healthy: healthReport.healthy,
      weakPointCount: healthReport.weakPoints.length,
      agentCount: agentCount ?? graph.nodes.length,
      timestamp: result.measuredAt,
    });

    if (this.config.enableLogging) {
      this.logHealth(result);
    }

    return result;
  }

  /**
   * Get health trend from history
   *
   * @returns 'improving', 'stable', or 'degrading'
   */
  getTrend(): 'improving' | 'stable' | 'degrading' {
    if (this.history.length < 2) {
      return 'stable';
    }

    // Compare last 5 entries (or fewer if not enough history)
    const recentCount = Math.min(5, this.history.length);
    const recent = this.history.slice(-recentCount);

    const firstLambda = recent[0].lambda;
    const lastLambda = recent[recent.length - 1].lambda;
    const delta = lastLambda - firstLambda;

    // Tolerance of 0.05 for "stable"
    if (Math.abs(delta) < 0.05) {
      return 'stable';
    }
    return delta > 0 ? 'improving' : 'degrading';
  }

  /**
   * Get health history
   *
   * @param limit - Maximum entries to return
   * @returns Array of history entries, most recent last
   */
  getHistory(limit?: number): HealthHistoryEntry[] {
    const entries = [...this.history];
    if (limit !== undefined && limit < entries.length) {
      return entries.slice(-limit);
    }
    return entries;
  }

  /**
   * Clear health history
   */
  clearHistory(): void {
    this.history.length = 0;
  }

  /**
   * Get the underlying QEMinCutService
   */
  getMinCutService(): QEMinCutService {
    return this.minCutService;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Determine status string from normalized lambda
   */
  private determineStatus(
    normalizedLambda: number
  ): 'healthy' | 'warning' | 'critical' | 'empty' {
    if (normalizedLambda >= this.config.healthyThreshold) {
      return 'healthy';
    }
    if (normalizedLambda >= this.config.warningThreshold) {
      return 'warning';
    }
    return 'critical';
  }

  /**
   * Add an entry to the history, trimming if over limit
   */
  private addHistoryEntry(entry: HealthHistoryEntry): void {
    this.history.push(entry);
    if (this.history.length > this.config.maxHistoryEntries) {
      this.history.splice(0, this.history.length - this.config.maxHistoryEntries);
    }
  }

  /**
   * Create result for empty fleet
   */
  private emptyFleetResult(): FleetHealthResult {
    return {
      lambda: 0,
      healthy: false,
      weakPoints: [],
      normalizedLambda: 0,
      riskScore: 1.0,
      status: 'empty',
      suggestions: ['No agents in fleet. Spawn agents to build a topology.'],
      measuredAt: new Date(),
    };
  }

  /**
   * Log health check result to stderr
   */
  private logHealth(result: FleetHealthResult): void {
    console.error(
      `[StructuralHealth] Status: ${result.status} | ` +
      `Lambda: ${result.normalizedLambda.toFixed(3)} | ` +
      `Weak points: ${result.weakPoints.length} | ` +
      `Risk: ${(result.riskScore * 100).toFixed(0)}%`
    );
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a StructuralHealthMonitor instance
 */
export function createStructuralHealthMonitor(
  config?: Partial<StructuralHealthConfig>
): StructuralHealthMonitor {
  return new StructuralHealthMonitor(config);
}
