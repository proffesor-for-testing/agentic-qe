/**
 * Agentic QE v3 - Metrics Tracker Types
 *
 * Types for tracking real runtime metrics for Agent Booster, Model Router,
 * ONNX Embeddings, and ReasoningBank components.
 *
 * Replaces hardcoded success rates with actual measured outcomes.
 *
 * @module integrations/agentic-flow/metrics/types
 */

// ============================================================================
// Component Types
// ============================================================================

/**
 * Components that can be tracked
 */
export type MetricComponent =
  | 'booster'
  | 'router'
  | 'embeddings'
  | 'reasoning';

/**
 * Outcome status for a tracked operation
 */
export type OutcomeStatus = 'success' | 'failure' | 'partial';

// ============================================================================
// Outcome Recording
// ============================================================================

/**
 * Metadata for a recorded outcome
 */
export interface OutcomeMetadata {
  /** Transform type for booster, tier for router, etc. */
  subType?: string;
  /** Error message if failed */
  errorMessage?: string;
  /** Confidence score from the operation */
  confidence?: number;
  /** Whether fallback was used */
  usedFallback?: boolean;
  /** Implementation used (wasm, typescript, etc.) */
  implementationUsed?: string;
  /** Number of items processed (for batch operations) */
  itemCount?: number;
  /** Additional context-specific data */
  [key: string]: unknown;
}

/**
 * A single recorded outcome
 */
export interface RecordedOutcome {
  id: string;
  component: MetricComponent;
  taskId: string;
  success: boolean;
  status: OutcomeStatus;
  durationMs: number;
  timestamp: Date;
  metadata?: OutcomeMetadata;
}

// ============================================================================
// Success Rate Calculation
// ============================================================================

/**
 * Success rate statistics for a component
 */
export interface SuccessRateStats {
  /** Success rate as decimal (0.0 - 1.0) */
  rate: number;
  /** Total operations tracked */
  total: number;
  /** Number of successful operations */
  successes: number;
  /** Number of failed operations */
  failures: number;
  /** Number of partial successes */
  partials: number;
  /** Average duration in milliseconds */
  avgDurationMs: number;
  /** P95 duration in milliseconds */
  p95DurationMs: number;
  /** Time window start */
  windowStart: Date;
  /** Time window end */
  windowEnd: Date;
}

/**
 * Time window for metrics queries
 */
export type TimeWindow =
  | '1h'      // Last 1 hour
  | '24h'     // Last 24 hours
  | '7d'      // Last 7 days
  | '30d'     // Last 30 days
  | 'all';    // All time

/**
 * Convert time window to milliseconds
 */
export function timeWindowToMs(window: TimeWindow): number {
  switch (window) {
    case '1h': return 60 * 60 * 1000;
    case '24h': return 24 * 60 * 60 * 1000;
    case '7d': return 7 * 24 * 60 * 60 * 1000;
    case '30d': return 30 * 24 * 60 * 60 * 1000;
    case 'all': return Number.MAX_SAFE_INTEGER;
  }
}

// ============================================================================
// Metrics Summary
// ============================================================================

/**
 * Per-subtype breakdown of metrics
 */
export interface SubTypeMetrics {
  subType: string;
  total: number;
  successes: number;
  successRate: number;
  avgDurationMs: number;
}

/**
 * Comprehensive metrics summary for a component
 */
export interface ComponentMetricsSummary {
  component: MetricComponent;
  /** Overall success rate */
  successRate: number;
  /** Total operations */
  totalOperations: number;
  /** Successful operations */
  successfulOperations: number;
  /** Failed operations */
  failedOperations: number;
  /** Average duration in milliseconds */
  avgDurationMs: number;
  /** P50 duration in milliseconds */
  p50DurationMs: number;
  /** P95 duration in milliseconds */
  p95DurationMs: number;
  /** P99 duration in milliseconds */
  p99DurationMs: number;
  /** Breakdown by sub-type (e.g., transform type for booster) */
  bySubType: SubTypeMetrics[];
  /** Fallback usage rate */
  fallbackRate: number;
  /** Time period covered */
  period: {
    start: Date;
    end: Date;
  };
}

/**
 * Full metrics summary across all components
 */
export interface MetricsSummary {
  /** Per-component metrics */
  components: Record<MetricComponent, ComponentMetricsSummary>;
  /** Overall system metrics */
  overall: {
    totalOperations: number;
    successRate: number;
    avgDurationMs: number;
  };
  /** Report generation time */
  generatedAt: Date;
  /** Time window */
  timeWindow: TimeWindow;
}

// ============================================================================
// Pattern Updates
// ============================================================================

/**
 * Pattern metrics update for JSON files
 */
export interface PatternMetricsUpdate {
  patternKey: string;
  successRate: number;
  totalOperations: number;
  lastUpdated: Date;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * MetricsTracker configuration
 */
export interface MetricsTrackerConfig {
  /** Whether metrics tracking is enabled */
  enabled: boolean;
  /** Database path (uses unified memory.db) */
  dbPath?: string;
  /** Maximum outcomes to retain (older ones pruned) */
  maxOutcomes?: number;
  /** Retention period in days */
  retentionDays?: number;
  /** Enable automatic cleanup */
  autoCleanup?: boolean;
  /** Cleanup interval in milliseconds */
  cleanupIntervalMs?: number;
}

/**
 * Default configuration
 */
export const DEFAULT_METRICS_TRACKER_CONFIG: MetricsTrackerConfig = {
  enabled: true,
  dbPath: '.agentic-qe/memory.db',
  maxOutcomes: 100000,
  retentionDays: 90,
  autoCleanup: true,
  cleanupIntervalMs: 60 * 60 * 1000, // 1 hour
};

// ============================================================================
// Interface
// ============================================================================

/**
 * MetricsTracker interface
 */
export interface IMetricsTracker {
  /**
   * Record an operation outcome
   */
  recordOutcome(
    component: MetricComponent,
    taskId: string,
    success: boolean,
    durationMs: number,
    metadata?: OutcomeMetadata
  ): Promise<void>;

  /**
   * Get success rate for a component
   */
  getSuccessRate(
    component: MetricComponent,
    timeWindow?: TimeWindow
  ): Promise<SuccessRateStats>;

  /**
   * Get comprehensive metrics summary
   */
  getMetricsSummary(timeWindow?: TimeWindow): Promise<MetricsSummary>;

  /**
   * Get metrics for pattern file updates
   */
  getPatternMetrics(
    component: MetricComponent,
    timeWindow?: TimeWindow
  ): Promise<PatternMetricsUpdate[]>;

  /**
   * Cleanup old metrics
   */
  cleanup(): Promise<number>;

  /**
   * Dispose of resources
   */
  dispose(): Promise<void>;
}
