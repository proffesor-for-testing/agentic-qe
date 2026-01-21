/**
 * Agentic QE v3 - RuVector ML Observability Layer
 *
 * Tracks ML vs fallback usage for all RuVector components.
 * Provides metrics, alerting, and reporting for ML adoption monitoring.
 *
 * Purpose:
 * - Track which components are using ML vs falling back to heuristics
 * - Monitor latency of ML operations
 * - Alert when ML usage drops below threshold (indicates potential issues)
 * - Provide detailed reports for debugging and optimization
 *
 * @module integrations/ruvector/observability
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * RuVector component types that can be observed
 */
export type RuVectorComponent =
  | 'q-learning-router'
  | 'ast-complexity'
  | 'diff-risk-classifier'
  | 'coverage-router'
  | 'graph-boundaries'
  | 'sona'
  | 'flash-attention'
  | 'gnn-index';

/**
 * Fallback reason categories
 */
export type FallbackReason =
  | 'disabled'
  | 'unavailable'
  | 'timeout'
  | 'error'
  | 'config'
  | 'feature-flag'
  | 'unknown';

/**
 * Component-level metrics
 */
export interface ComponentMetrics {
  /** Number of times ML was successfully used */
  mlUsedCount: number;
  /** Number of times fallback was used */
  fallbackUsedCount: number;
  /** Latencies of ML operations in milliseconds */
  mlLatencies: number[];
  /** Map of fallback reasons to counts */
  fallbackReasons: Map<FallbackReason, number>;
  /** First recorded usage timestamp */
  firstSeen: Date;
  /** Most recent usage timestamp */
  lastSeen: Date;
}

/**
 * Complete ML observability metrics
 */
export interface MLObservabilityMetrics {
  /** Metrics per component */
  components: Map<RuVectorComponent, ComponentMetrics>;
  /** Total ML usage count across all components */
  totalMLUsed: number;
  /** Total fallback usage count across all components */
  totalFallbackUsed: number;
  /** Overall ML usage percentage (0-100) */
  mlUsagePercentage: number;
  /** Average ML latency across all components */
  averageMLLatencyMs: number;
  /** Session start time */
  sessionStart: Date;
  /** Number of alerts triggered */
  alertsTriggered: number;
}

/**
 * Alert entry for when ML usage drops
 */
export interface MLUsageAlert {
  /** Alert timestamp */
  timestamp: Date;
  /** Component that triggered the alert (or 'global' for overall) */
  component: RuVectorComponent | 'global';
  /** Current ML usage percentage */
  currentPercentage: number;
  /** Configured threshold percentage */
  thresholdPercentage: number;
  /** Human-readable message */
  message: string;
}

/**
 * Configuration for ML observability
 */
export interface MLObservabilityConfig {
  /** Minimum ML usage percentage before alerting (default: 20) */
  mlUsageAlertThreshold: number;
  /** Enable console alerts (default: true) */
  enableConsoleAlerts: boolean;
  /** Maximum latencies to store per component (default: 100) */
  maxLatencyHistory: number;
  /** Enable detailed logging (default: false) */
  verboseLogging: boolean;
  /** Log prefix for console output */
  logPrefix: string;
}

/**
 * Observability report structure
 */
export interface ObservabilityReport {
  /** Report generation timestamp */
  generatedAt: Date;
  /** Metrics summary */
  metrics: MLObservabilityMetrics;
  /** Component-level breakdown */
  componentBreakdown: Array<{
    component: RuVectorComponent;
    mlUsed: number;
    fallbackUsed: number;
    mlPercentage: number;
    avgLatencyMs: number | null;
    topFallbackReasons: Array<{ reason: FallbackReason; count: number }>;
  }>;
  /** Alerts that occurred during this session */
  alerts: MLUsageAlert[];
  /** Session duration in milliseconds */
  sessionDurationMs: number;
  /** Health status: 'healthy' | 'degraded' | 'critical' */
  healthStatus: 'healthy' | 'degraded' | 'critical';
  /** Recommendations based on metrics */
  recommendations: string[];
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: MLObservabilityConfig = {
  mlUsageAlertThreshold: 20,
  enableConsoleAlerts: true,
  maxLatencyHistory: 100,
  verboseLogging: false,
  logPrefix: '[RuVector:Observability]',
};

// ============================================================================
// RuVector Observability Class
// ============================================================================

/**
 * ML Observability layer for RuVector components
 *
 * Provides tracking, alerting, and reporting for ML vs fallback usage
 * across all RuVector integration points.
 *
 * @example
 * ```typescript
 * const obs = RuVectorObservability.getInstance();
 *
 * // Record ML usage
 * obs.recordMLUsage('q-learning-router', true, 15.2);
 *
 * // Record fallback
 * obs.recordFallback('ast-complexity', 'timeout');
 *
 * // Check for alerts
 * obs.checkAndAlert();
 *
 * // Get full report
 * const report = obs.getReport();
 * console.log(`ML Usage: ${report.metrics.mlUsagePercentage}%`);
 * ```
 */
export class RuVectorObservability {
  private static instance: RuVectorObservability | null = null;

  private readonly config: MLObservabilityConfig;
  private readonly componentMetrics: Map<RuVectorComponent, ComponentMetrics>;
  private readonly alerts: MLUsageAlert[];
  private readonly sessionStart: Date;

  /**
   * Get the singleton instance of RuVectorObservability
   *
   * @param config - Optional configuration (only used on first call)
   * @returns The singleton instance
   */
  public static getInstance(
    config?: Partial<MLObservabilityConfig>
  ): RuVectorObservability {
    if (!RuVectorObservability.instance) {
      RuVectorObservability.instance = new RuVectorObservability(config);
    }
    return RuVectorObservability.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    RuVectorObservability.instance = null;
  }

  private constructor(config?: Partial<MLObservabilityConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.componentMetrics = new Map();
    this.alerts = [];
    this.sessionStart = new Date();
  }

  /**
   * Record ML usage for a component
   *
   * @param component - The RuVector component being used
   * @param used - Whether ML was successfully used (true) or fallback (false)
   * @param latencyMs - Optional latency in milliseconds (only for ML usage)
   *
   * @example
   * ```typescript
   * // ML was used successfully with 12.5ms latency
   * obs.recordMLUsage('q-learning-router', true, 12.5);
   *
   * // ML was NOT used (fell back to heuristics)
   * obs.recordMLUsage('ast-complexity', false);
   * ```
   */
  public recordMLUsage(
    component: RuVectorComponent,
    used: boolean,
    latencyMs?: number
  ): void {
    const metrics = this.getOrCreateMetrics(component);
    metrics.lastSeen = new Date();

    if (used) {
      metrics.mlUsedCount++;
      if (latencyMs !== undefined) {
        metrics.mlLatencies.push(latencyMs);
        // Trim latency history if needed
        if (metrics.mlLatencies.length > this.config.maxLatencyHistory) {
          metrics.mlLatencies.shift();
        }
      }
      if (this.config.verboseLogging) {
        const latencyInfo = latencyMs !== undefined ? ` (${latencyMs.toFixed(2)}ms)` : '';
        console.log(`${this.config.logPrefix} ML used: ${component}${latencyInfo}`);
      }
    } else {
      metrics.fallbackUsedCount++;
      this.incrementFallbackReason(metrics, 'unknown');
      if (this.config.verboseLogging) {
        console.log(`${this.config.logPrefix} Fallback used: ${component}`);
      }
    }
  }

  /**
   * Record a fallback event with a specific reason
   *
   * @param component - The RuVector component that fell back
   * @param reason - The reason for falling back
   *
   * @example
   * ```typescript
   * // Record fallback due to timeout
   * obs.recordFallback('sona', 'timeout');
   *
   * // Record fallback due to feature being disabled
   * obs.recordFallback('flash-attention', 'feature-flag');
   * ```
   */
  public recordFallback(
    component: RuVectorComponent,
    reason: FallbackReason
  ): void {
    const metrics = this.getOrCreateMetrics(component);
    metrics.fallbackUsedCount++;
    metrics.lastSeen = new Date();
    this.incrementFallbackReason(metrics, reason);

    if (this.config.verboseLogging) {
      console.log(`${this.config.logPrefix} Fallback: ${component} (${reason})`);
    }
  }

  /**
   * Check ML usage and emit alerts if below threshold
   *
   * Checks both global ML usage and per-component usage.
   * Emits alerts to console if enabled and usage is below threshold.
   *
   * @returns Array of any new alerts triggered
   *
   * @example
   * ```typescript
   * const newAlerts = obs.checkAndAlert();
   * if (newAlerts.length > 0) {
   *   console.warn('ML usage is low!', newAlerts);
   * }
   * ```
   */
  public checkAndAlert(): MLUsageAlert[] {
    const newAlerts: MLUsageAlert[] = [];
    const now = new Date();

    // Check global usage
    const globalPercentage = this.calculateMLUsagePercentage();
    const totalCalls = this.getTotalCalls();

    // Only alert if we have enough data points (at least 10 calls)
    if (totalCalls >= 10 && globalPercentage < this.config.mlUsageAlertThreshold) {
      const alert: MLUsageAlert = {
        timestamp: now,
        component: 'global',
        currentPercentage: globalPercentage,
        thresholdPercentage: this.config.mlUsageAlertThreshold,
        message: `Global ML usage (${globalPercentage.toFixed(1)}%) is below threshold (${this.config.mlUsageAlertThreshold}%)`,
      };
      this.alerts.push(alert);
      newAlerts.push(alert);

      if (this.config.enableConsoleAlerts) {
        console.warn(`${this.config.logPrefix} ALERT: ${alert.message}`);
      }
    }

    // Check per-component usage
    for (const [component, metrics] of this.componentMetrics.entries()) {
      const componentCalls = metrics.mlUsedCount + metrics.fallbackUsedCount;
      if (componentCalls < 5) continue; // Need at least 5 calls per component

      const componentPercentage =
        (metrics.mlUsedCount / componentCalls) * 100;

      if (componentPercentage < this.config.mlUsageAlertThreshold) {
        const alert: MLUsageAlert = {
          timestamp: now,
          component,
          currentPercentage: componentPercentage,
          thresholdPercentage: this.config.mlUsageAlertThreshold,
          message: `${component} ML usage (${componentPercentage.toFixed(1)}%) is below threshold (${this.config.mlUsageAlertThreshold}%)`,
        };
        this.alerts.push(alert);
        newAlerts.push(alert);

        if (this.config.enableConsoleAlerts) {
          console.warn(`${this.config.logPrefix} ALERT: ${alert.message}`);
        }
      }
    }

    return newAlerts;
  }

  /**
   * Get a comprehensive observability report
   *
   * @returns Full report with metrics, breakdowns, alerts, and recommendations
   *
   * @example
   * ```typescript
   * const report = obs.getReport();
   * console.log(`Status: ${report.healthStatus}`);
   * console.log(`ML Usage: ${report.metrics.mlUsagePercentage}%`);
   * for (const rec of report.recommendations) {
   *   console.log(`- ${rec}`);
   * }
   * ```
   */
  public getReport(): ObservabilityReport {
    const now = new Date();
    const metrics = this.getMetrics();

    // Build component breakdown
    const componentBreakdown: ObservabilityReport['componentBreakdown'] = [];
    for (const [component, compMetrics] of this.componentMetrics.entries()) {
      const total = compMetrics.mlUsedCount + compMetrics.fallbackUsedCount;
      const mlPercentage = total > 0 ? (compMetrics.mlUsedCount / total) * 100 : 0;
      const avgLatency =
        compMetrics.mlLatencies.length > 0
          ? compMetrics.mlLatencies.reduce((a, b) => a + b, 0) /
            compMetrics.mlLatencies.length
          : null;

      // Sort fallback reasons by count
      const topFallbackReasons = Array.from(compMetrics.fallbackReasons.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      componentBreakdown.push({
        component,
        mlUsed: compMetrics.mlUsedCount,
        fallbackUsed: compMetrics.fallbackUsedCount,
        mlPercentage,
        avgLatencyMs: avgLatency,
        topFallbackReasons,
      });
    }

    // Sort by fallback usage (most fallbacks first)
    componentBreakdown.sort((a, b) => b.fallbackUsed - a.fallbackUsed);

    // Determine health status
    const healthStatus = this.determineHealthStatus(metrics);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      metrics,
      componentBreakdown
    );

    return {
      generatedAt: now,
      metrics,
      componentBreakdown,
      alerts: [...this.alerts],
      sessionDurationMs: now.getTime() - this.sessionStart.getTime(),
      healthStatus,
      recommendations,
    };
  }

  /**
   * Get current metrics snapshot
   *
   * @returns Current ML observability metrics
   */
  public getMetrics(): MLObservabilityMetrics {
    let totalML = 0;
    let totalFallback = 0;
    let totalLatencySum = 0;
    let totalLatencyCount = 0;

    for (const metrics of this.componentMetrics.values()) {
      totalML += metrics.mlUsedCount;
      totalFallback += metrics.fallbackUsedCount;
      totalLatencySum += metrics.mlLatencies.reduce((a, b) => a + b, 0);
      totalLatencyCount += metrics.mlLatencies.length;
    }

    const total = totalML + totalFallback;
    const mlUsagePercentage = total > 0 ? (totalML / total) * 100 : 0;
    const averageMLLatencyMs =
      totalLatencyCount > 0 ? totalLatencySum / totalLatencyCount : 0;

    return {
      components: new Map(this.componentMetrics),
      totalMLUsed: totalML,
      totalFallbackUsed: totalFallback,
      mlUsagePercentage,
      averageMLLatencyMs,
      sessionStart: this.sessionStart,
      alertsTriggered: this.alerts.length,
    };
  }

  /**
   * Get component-specific metrics
   *
   * @param component - The component to get metrics for
   * @returns Component metrics or undefined if no data
   */
  public getComponentMetrics(
    component: RuVectorComponent
  ): ComponentMetrics | undefined {
    return this.componentMetrics.get(component);
  }

  /**
   * Clear all metrics and alerts (primarily for testing)
   */
  public clear(): void {
    this.componentMetrics.clear();
    this.alerts.length = 0;
  }

  /**
   * Update configuration
   *
   * @param config - Partial configuration to merge
   */
  public updateConfig(config: Partial<MLObservabilityConfig>): void {
    Object.assign(this.config, config);
  }

  /**
   * Get current configuration
   *
   * @returns Current configuration (readonly copy)
   */
  public getConfig(): Readonly<MLObservabilityConfig> {
    return { ...this.config };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private getOrCreateMetrics(component: RuVectorComponent): ComponentMetrics {
    let metrics = this.componentMetrics.get(component);
    if (!metrics) {
      const now = new Date();
      metrics = {
        mlUsedCount: 0,
        fallbackUsedCount: 0,
        mlLatencies: [],
        fallbackReasons: new Map(),
        firstSeen: now,
        lastSeen: now,
      };
      this.componentMetrics.set(component, metrics);
    }
    return metrics;
  }

  private incrementFallbackReason(
    metrics: ComponentMetrics,
    reason: FallbackReason
  ): void {
    const current = metrics.fallbackReasons.get(reason) || 0;
    metrics.fallbackReasons.set(reason, current + 1);
  }

  private calculateMLUsagePercentage(): number {
    let totalML = 0;
    let totalFallback = 0;

    for (const metrics of this.componentMetrics.values()) {
      totalML += metrics.mlUsedCount;
      totalFallback += metrics.fallbackUsedCount;
    }

    const total = totalML + totalFallback;
    return total > 0 ? (totalML / total) * 100 : 100; // 100% if no data
  }

  private getTotalCalls(): number {
    let total = 0;
    for (const metrics of this.componentMetrics.values()) {
      total += metrics.mlUsedCount + metrics.fallbackUsedCount;
    }
    return total;
  }

  private determineHealthStatus(
    metrics: MLObservabilityMetrics
  ): 'healthy' | 'degraded' | 'critical' {
    if (metrics.mlUsagePercentage >= 80) {
      return 'healthy';
    } else if (metrics.mlUsagePercentage >= 50) {
      return 'degraded';
    } else {
      return 'critical';
    }
  }

  private generateRecommendations(
    metrics: MLObservabilityMetrics,
    componentBreakdown: ObservabilityReport['componentBreakdown']
  ): string[] {
    const recommendations: string[] = [];

    // Low overall ML usage
    if (metrics.mlUsagePercentage < 50) {
      recommendations.push(
        'ML usage is below 50%. Check RuVector service availability and configuration.'
      );
    }

    // High latency
    if (metrics.averageMLLatencyMs > 100) {
      recommendations.push(
        `Average ML latency is ${metrics.averageMLLatencyMs.toFixed(1)}ms. Consider caching or optimization.`
      );
    }

    // Component-specific issues
    for (const comp of componentBreakdown) {
      if (comp.mlPercentage < 20 && comp.fallbackUsed > 5) {
        recommendations.push(
          `${comp.component} has low ML usage (${comp.mlPercentage.toFixed(1)}%). Check component configuration.`
        );
      }

      // Check for specific fallback reasons
      const timeoutReason = comp.topFallbackReasons.find(
        (r) => r.reason === 'timeout'
      );
      if (timeoutReason && timeoutReason.count > 3) {
        recommendations.push(
          `${comp.component} has ${timeoutReason.count} timeout fallbacks. Consider increasing timeout.`
        );
      }

      const errorReason = comp.topFallbackReasons.find(
        (r) => r.reason === 'error'
      );
      if (errorReason && errorReason.count > 3) {
        recommendations.push(
          `${comp.component} has ${errorReason.count} error fallbacks. Check service logs.`
        );
      }
    }

    // Multiple alerts
    if (metrics.alertsTriggered > 5) {
      recommendations.push(
        `${metrics.alertsTriggered} alerts have been triggered. Review RuVector integration health.`
      );
    }

    return recommendations;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get the global RuVectorObservability instance
 *
 * @returns The singleton observability instance
 */
export function getRuVectorObservability(): RuVectorObservability {
  return RuVectorObservability.getInstance();
}

/**
 * Record ML usage for a component (convenience wrapper)
 *
 * @param component - The RuVector component
 * @param used - Whether ML was used
 * @param latencyMs - Optional latency in milliseconds
 */
export function recordMLUsage(
  component: RuVectorComponent,
  used: boolean,
  latencyMs?: number
): void {
  RuVectorObservability.getInstance().recordMLUsage(component, used, latencyMs);
}

/**
 * Record a fallback event (convenience wrapper)
 *
 * @param component - The RuVector component
 * @param reason - The fallback reason
 */
export function recordFallback(
  component: RuVectorComponent,
  reason: FallbackReason
): void {
  RuVectorObservability.getInstance().recordFallback(component, reason);
}

/**
 * Get the current observability report (convenience wrapper)
 *
 * @returns The full observability report
 */
export function getObservabilityReport(): ObservabilityReport {
  return RuVectorObservability.getInstance().getReport();
}

// ============================================================================
// Default Export
// ============================================================================

export default RuVectorObservability;
