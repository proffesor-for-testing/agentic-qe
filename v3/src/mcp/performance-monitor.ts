/**
 * Agentic QE v3 - MCP Performance Monitor
 * ADR-039: V3 QE MCP Optimization
 *
 * Provides comprehensive performance monitoring for MCP operations:
 * - P50/P95/P99 latency tracking
 * - Tool execution metrics
 * - Pool efficiency monitoring
 * - Real-time performance alerts
 */

// ============================================================================
// Types
// ============================================================================

export interface LatencySample {
  timestamp: number;
  durationMs: number;
  operation: string;
  success: boolean;
}

export interface ToolExecutionMetric {
  toolName: string;
  invocationCount: number;
  successCount: number;
  failureCount: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  lastExecutedAt: number;
}

export interface PoolMetric {
  poolHitRate: number;
  avgAcquisitionTimeMs: number;
  activeConnections: number;
  totalConnections: number;
}

export interface PerformanceAlert {
  id: string;
  severity: 'warning' | 'critical';
  metric: string;
  message: string;
  timestamp: number;
  resolved: boolean;
}

export interface PerformanceMonitorConfig {
  /** Maximum number of latency samples to keep */
  maxLatencySamples: number;

  /** Latency threshold for warnings (ms) */
  warningThresholdMs: number;

  /** Latency threshold for critical alerts (ms) */
  criticalThresholdMs: number;

  /** Enable automatic alerting */
  enableAlerts: boolean;

  /** Alert callback function */
  onAlert?: (alert: PerformanceAlert) => void;
}

export const DEFAULT_MONITOR_CONFIG: PerformanceMonitorConfig = {
  maxLatencySamples: 1000,
  warningThresholdMs: 100, // P95 target
  criticalThresholdMs: 200,
  enableAlerts: true,
};

export interface PerformanceReport {
  period: {
    start: number;
    end: number;
    durationMs: number;
  };
  toolMetrics: Map<string, ToolExecutionMetric>;
  poolMetrics: PoolMetric;
  latencyPercentiles: {
    p50: number;
    p95: number;
    p99: number;
  };
  alerts: PerformanceAlert[];
  summary: {
    totalOperations: number;
    successRate: number;
    avgLatencyMs: number;
    targetMet: boolean; // P95 < 100ms
  };
}

// ============================================================================
// Performance Monitor Implementation
// ============================================================================

class PerformanceMonitorImpl {
  private latencySamples: LatencySample[] = [];
  private toolMetrics: Map<string, ToolExecutionMetric> = new Map();
  private alerts: PerformanceAlert[] = [];
  private poolMetrics: PoolMetric = {
    poolHitRate: 0,
    avgAcquisitionTimeMs: 0,
    activeConnections: 0,
    totalConnections: 0,
  };
  private readonly config: PerformanceMonitorConfig;
  private alertIdCounter = 0;

  constructor(config: Partial<PerformanceMonitorConfig> = {}) {
    this.config = { ...DEFAULT_MONITOR_CONFIG, ...config };
  }

  /**
   * Record a latency sample
   */
  recordLatency(operation: string, durationMs: number, success: boolean): void {
    const sample: LatencySample = {
      timestamp: Date.now(),
      durationMs,
      operation,
      success,
    };

    this.latencySamples.push(sample);

    // Trim if over limit
    if (this.latencySamples.length > this.config.maxLatencySamples) {
      this.latencySamples.shift();
    }

    // Update tool-specific metrics
    this.updateToolMetrics(operation, durationMs, success);

    // Check for alerts
    if (this.config.enableAlerts) {
      this.checkAlerts(sample);
    }
  }

  /**
   * Update pool metrics
   */
  updatePoolMetrics(metrics: PoolMetric): void {
    this.poolMetrics = { ...metrics };
  }

  /**
   * Get current latency percentiles (P50, P95, P99)
   */
  getLatencyPercentiles(): { p50: number; p95: number; p99: number } {
    if (this.latencySamples.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }

    // Extract only successful samples for meaningful percentiles
    const successfulSamples = this.latencySamples
      .filter(s => s.success)
      .map(s => s.durationMs)
      .sort((a, b) => a - b);

    if (successfulSamples.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }

    const p50Index = Math.floor(successfulSamples.length * 0.5);
    const p95Index = Math.floor(successfulSamples.length * 0.95);
    const p99Index = Math.floor(successfulSamples.length * 0.99);

    return {
      p50: successfulSamples[p50Index],
      p95: successfulSamples[p95Index],
      p99: successfulSamples[p99Index],
    };
  }

  /**
   * Get metrics for a specific tool
   */
  getToolMetrics(toolName: string): ToolExecutionMetric | null {
    return this.toolMetrics.get(toolName) || null;
  }

  /**
   * Get all tool metrics
   */
  getAllToolMetrics(): Map<string, ToolExecutionMetric> {
    return new Map(this.toolMetrics);
  }

  /**
   * Get pool metrics
   */
  getPoolMetrics(): PoolMetric {
    return { ...this.poolMetrics };
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): PerformanceAlert[] {
    return this.alerts.filter(a => !a.resolved);
  }

  /**
   * Get all alerts
   */
  getAllAlerts(): PerformanceAlert[] {
    return [...this.alerts];
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      return true;
    }
    return false;
  }

  /**
   * Generate a performance report
   */
  generateReport(periodMs?: number): PerformanceReport {
    const now = Date.now();
    const start = periodMs ? now - periodMs : this.latencySamples[0]?.timestamp || now;

    // Filter samples by period
    const periodSamples = this.latencySamples.filter(s => s.timestamp >= start);

    // Calculate latency percentiles for period
    const latencies = periodSamples
      .filter(s => s.success)
      .map(s => s.durationMs)
      .sort((a, b) => a - b);

    const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] || 0 : 0;
    const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] || 0 : 0;
    const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] || 0 : 0;

    // Calculate summary
    const successCount = periodSamples.filter(s => s.success).length;
    const totalOperations = periodSamples.length;
    const successRate = totalOperations > 0 ? successCount / totalOperations : 1.0;
    const totalLatency = periodSamples.reduce((sum, s) => sum + s.durationMs, 0);
    const avgLatency = totalOperations > 0 ? totalLatency / totalOperations : 0;

    return {
      period: {
        start,
        end: now,
        durationMs: now - start,
      },
      toolMetrics: new Map(this.toolMetrics),
      poolMetrics: this.poolMetrics,
      latencyPercentiles: {
        p50,
        p95,
        p99,
      },
      alerts: this.getActiveAlerts(),
      summary: {
        totalOperations,
        successRate,
        avgLatencyMs: avgLatency,
        targetMet: p95 < this.config.warningThresholdMs,
      },
    };
  }

  /**
   * Check if performance targets are met
   */
  checkTargets(): { met: boolean; p95LatencyMs: number; targetMs: number } {
    const percentiles = this.getLatencyPercentiles();
    return {
      met: percentiles.p95 < this.config.warningThresholdMs,
      p95LatencyMs: percentiles.p95,
      targetMs: this.config.warningThresholdMs,
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.latencySamples = [];
    this.toolMetrics.clear();
    this.alerts = [];
    this.poolMetrics = {
      poolHitRate: 0,
      avgAcquisitionTimeMs: 0,
      activeConnections: 0,
      totalConnections: 0,
    };
  }

  /**
   * Get raw latency samples (for analysis)
   */
  getLatencySamples(): LatencySample[] {
    return [...this.latencySamples];
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private updateToolMetrics(toolName: string, durationMs: number, success: boolean): void {
    let metric = this.toolMetrics.get(toolName);

    if (!metric) {
      metric = {
        toolName,
        invocationCount: 0,
        successCount: 0,
        failureCount: 0,
        totalLatencyMs: 0,
        avgLatencyMs: 0,
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
        lastExecutedAt: Date.now(),
      };
      this.toolMetrics.set(toolName, metric);
    }

    metric.invocationCount++;
    metric.totalLatencyMs += durationMs;
    metric.lastExecutedAt = Date.now();

    if (success) {
      metric.successCount++;
    } else {
      metric.failureCount++;
    }

    metric.avgLatencyMs = metric.totalLatencyMs / metric.invocationCount;

    // Calculate percentiles for this tool
    const toolSamples = this.latencySamples
      .filter(s => s.operation === toolName && s.success)
      .map(s => s.durationMs)
      .sort((a, b) => a - b);

    if (toolSamples.length > 0) {
      metric.p50LatencyMs = toolSamples[Math.floor(toolSamples.length * 0.5)] || 0;
      metric.p95LatencyMs = toolSamples[Math.floor(toolSamples.length * 0.95)] || 0;
      metric.p99LatencyMs = toolSamples[Math.floor(toolSamples.length * 0.99)] || 0;
    }
  }

  private checkAlerts(sample: LatencySample): void {
    if (sample.success && sample.durationMs > this.config.criticalThresholdMs) {
      this.createAlert('critical', 'latency', `Critical latency: ${sample.durationMs.toFixed(1)}ms for ${sample.operation}`);
    } else if (sample.success && sample.durationMs > this.config.warningThresholdMs) {
      this.createAlert('warning', 'latency', `High latency: ${sample.durationMs.toFixed(1)}ms for ${sample.operation}`);
    } else if (!sample.success) {
      this.createAlert('warning', 'failure', `Operation failed: ${sample.operation}`);
    }
  }

  private createAlert(severity: 'warning' | 'critical', metric: string, message: string): void {
    const alert: PerformanceAlert = {
      id: `alert-${this.alertIdCounter++}`,
      severity,
      metric,
      message,
      timestamp: Date.now(),
      resolved: false,
    };

    this.alerts.push(alert);

    // Trim old alerts
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }

    // Trigger callback
    if (this.config.onAlert) {
      try {
        this.config.onAlert(alert);
      } catch (error) {
        console.error('[PerformanceMonitor] Alert callback error:', error);
      }
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultMonitor: PerformanceMonitorImpl | null = null;

export function getPerformanceMonitor(config?: Partial<PerformanceMonitorConfig>): PerformanceMonitorImpl {
  if (!defaultMonitor) {
    defaultMonitor = new PerformanceMonitorImpl(config);
  }
  return defaultMonitor;
}

export function resetPerformanceMonitor(): void {
  if (defaultMonitor) {
    defaultMonitor.reset();
  }
}

// ============================================================================
// Exports
// ============================================================================

export { PerformanceMonitorImpl };

/**
 * Create a new performance monitor instance (for testing/isolated monitors)
 */
export function createPerformanceMonitor(config?: Partial<PerformanceMonitorConfig>): PerformanceMonitorImpl {
  return new PerformanceMonitorImpl(config);
}
