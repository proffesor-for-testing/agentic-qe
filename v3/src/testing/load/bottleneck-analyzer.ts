/**
 * Agentic QE v3 - Bottleneck Analyzer
 * Detects performance bottlenecks during load testing
 *
 * Issue #177 Targets:
 * - 100+ agents coordinated simultaneously
 * - Memory usage < 4GB at scale
 * - No agent starvation or deadlocks
 * - Queen Coordinator handles load
 * - Gossip protocol stable at scale
 */

import {
  MetricsCollector,
  LatencyPercentiles,
  LoadTestReport,
} from './metrics-collector.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Severity levels for bottleneck detection
 */
export type BottleneckSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Result of a single bottleneck check
 */
export interface BottleneckResult {
  /** Whether the bottleneck was detected */
  readonly detected: boolean;
  /** Severity of the bottleneck */
  readonly severity: BottleneckSeverity;
  /** Name of the metric being checked */
  readonly metric: string;
  /** Threshold that was exceeded */
  readonly threshold: number;
  /** Actual measured value */
  readonly actual: number;
  /** Recommendation for addressing the bottleneck */
  readonly recommendation: string;
  /** Additional context */
  readonly context?: Record<string, unknown>;
}

/**
 * Complete bottleneck analysis report
 */
export interface BottleneckReport {
  /** Overall assessment */
  readonly overallSeverity: BottleneckSeverity;
  /** Whether any critical bottlenecks were found */
  readonly hasCritical: boolean;
  /** Individual bottleneck results */
  readonly bottlenecks: BottleneckResult[];
  /** Summary statistics */
  readonly summary: {
    readonly totalChecks: number;
    readonly detected: number;
    readonly critical: number;
    readonly high: number;
    readonly medium: number;
    readonly low: number;
  };
  /** Prioritized recommendations */
  readonly recommendations: string[];
  /** Timestamp of analysis */
  readonly timestamp: Date;
}

/**
 * Thresholds for bottleneck detection
 */
export interface BottleneckThresholds {
  // Memory thresholds (bytes)
  readonly memoryWarning: number;      // 3GB
  readonly memoryCritical: number;     // 4GB

  // Coordination latency thresholds (ms)
  readonly latencyP95Warning: number;   // 75ms
  readonly latencyP95Critical: number;  // 100ms
  readonly latencyP99Warning: number;   // 150ms
  readonly latencyP99Critical: number;  // 200ms

  // Agent thresholds
  readonly agentStarvationTime: number; // 30 seconds
  readonly deadlockTimeout: number;     // 60 seconds

  // Throughput thresholds
  readonly minTasksPerSecond: number;   // 5 tasks/sec
  readonly minAgentUtilization: number; // 50%

  // Gossip protocol thresholds
  readonly gossipConvergenceTime: number; // 5 seconds
  readonly gossipMaxPartitions: number;   // 0 (no partitions)
}

/**
 * Configuration for bottleneck analyzer
 */
export interface BottleneckAnalyzerConfig {
  readonly thresholds: BottleneckThresholds;
  readonly enableDetailedAnalysis: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_THRESHOLDS: BottleneckThresholds = {
  // Memory (Issue #177: <4GB)
  memoryWarning: 3 * 1024 * 1024 * 1024,      // 3GB
  memoryCritical: 4 * 1024 * 1024 * 1024,     // 4GB

  // Coordination latency (Issue #177: <100ms p95)
  latencyP95Warning: 75,
  latencyP95Critical: 100,
  latencyP99Warning: 150,
  latencyP99Critical: 200,

  // Agent health
  agentStarvationTime: 30000,  // 30 seconds
  deadlockTimeout: 60000,      // 60 seconds

  // Throughput
  minTasksPerSecond: 5,
  minAgentUtilization: 0.5,

  // Gossip protocol
  gossipConvergenceTime: 5000,
  gossipMaxPartitions: 0,
};

const DEFAULT_CONFIG: BottleneckAnalyzerConfig = {
  thresholds: DEFAULT_THRESHOLDS,
  enableDetailedAnalysis: true,
};

// ============================================================================
// Bottleneck Analyzer Implementation
// ============================================================================

/**
 * BottleneckAnalyzer - Detects and analyzes performance bottlenecks
 *
 * Checks for:
 * - Memory pressure
 * - Coordination latency
 * - Agent starvation
 * - Deadlocks
 * - Gossip protocol stability
 * - Throughput issues
 */
export class BottleneckAnalyzer {
  private readonly config: BottleneckAnalyzerConfig;

  constructor(config: Partial<BottleneckAnalyzerConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      thresholds: {
        ...DEFAULT_THRESHOLDS,
        ...config.thresholds,
      },
    };
  }

  // ============================================================================
  // Main Analysis Methods
  // ============================================================================

  /**
   * Perform complete bottleneck analysis on collected metrics
   */
  analyze(metrics: MetricsCollector): BottleneckReport {
    const bottlenecks: BottleneckResult[] = [];

    // Run all checks
    bottlenecks.push(this.checkMemoryPressure(metrics));
    bottlenecks.push(this.checkCoordinationLatencyP95(metrics));
    bottlenecks.push(this.checkCoordinationLatencyP99(metrics));
    bottlenecks.push(this.checkAgentStarvation(metrics));
    bottlenecks.push(this.checkDeadlocks(metrics));
    bottlenecks.push(this.checkThroughput(metrics));

    // Calculate summary
    const detected = bottlenecks.filter(b => b.detected);
    const summary = {
      totalChecks: bottlenecks.length,
      detected: detected.length,
      critical: detected.filter(b => b.severity === 'critical').length,
      high: detected.filter(b => b.severity === 'high').length,
      medium: detected.filter(b => b.severity === 'medium').length,
      low: detected.filter(b => b.severity === 'low').length,
    };

    // Determine overall severity
    let overallSeverity: BottleneckSeverity = 'low';
    if (summary.critical > 0) {
      overallSeverity = 'critical';
    } else if (summary.high > 0) {
      overallSeverity = 'high';
    } else if (summary.medium > 0) {
      overallSeverity = 'medium';
    }

    // Generate prioritized recommendations
    const recommendations = this.generatePrioritizedRecommendations(detected);

    return {
      overallSeverity,
      hasCritical: summary.critical > 0,
      bottlenecks,
      summary,
      recommendations,
      timestamp: new Date(),
    };
  }

  /**
   * Analyze from a load test report
   */
  analyzeReport(report: LoadTestReport): BottleneckReport {
    const bottlenecks: BottleneckResult[] = [];

    // Memory check
    bottlenecks.push(this.checkMemoryFromReport(report));

    // Latency checks
    bottlenecks.push(this.checkLatencyP95FromReport(report));
    bottlenecks.push(this.checkLatencyP99FromReport(report));

    // Throughput check
    bottlenecks.push(this.checkThroughputFromReport(report));

    // Success criteria checks
    bottlenecks.push(this.checkSuccessCriteria(report));

    // Calculate summary
    const detected = bottlenecks.filter(b => b.detected);
    const summary = {
      totalChecks: bottlenecks.length,
      detected: detected.length,
      critical: detected.filter(b => b.severity === 'critical').length,
      high: detected.filter(b => b.severity === 'high').length,
      medium: detected.filter(b => b.severity === 'medium').length,
      low: detected.filter(b => b.severity === 'low').length,
    };

    let overallSeverity: BottleneckSeverity = 'low';
    if (summary.critical > 0) {
      overallSeverity = 'critical';
    } else if (summary.high > 0) {
      overallSeverity = 'high';
    } else if (summary.medium > 0) {
      overallSeverity = 'medium';
    }

    const recommendations = this.generatePrioritizedRecommendations(detected);

    return {
      overallSeverity,
      hasCritical: summary.critical > 0,
      bottlenecks,
      summary,
      recommendations,
      timestamp: new Date(),
    };
  }

  // ============================================================================
  // Individual Check Methods
  // ============================================================================

  /**
   * Check for memory pressure
   */
  checkMemoryPressure(metrics?: MetricsCollector): BottleneckResult {
    const actual = metrics?.getMaxMemoryUsage() ?? process.memoryUsage().heapUsed;
    const { memoryWarning, memoryCritical } = this.config.thresholds;

    const detected = actual >= memoryWarning;
    let severity: BottleneckSeverity = 'low';
    let recommendation = 'Memory usage is within acceptable limits.';

    if (actual >= memoryCritical) {
      severity = 'critical';
      recommendation =
        'Memory usage exceeds 4GB limit. Implement agent pooling, reduce per-agent state, ' +
        'or decrease concurrent agent count.';
    } else if (actual >= memoryWarning) {
      severity = 'high';
      recommendation =
        'Memory usage approaching critical threshold. Consider optimizing agent memory ' +
        'footprint or implementing memory pressure relief mechanisms.';
    }

    return {
      detected,
      severity,
      metric: 'memory_pressure',
      threshold: memoryCritical,
      actual,
      recommendation,
      context: {
        usedGB: actual / 1024 / 1024 / 1024,
        warningThresholdGB: memoryWarning / 1024 / 1024 / 1024,
        criticalThresholdGB: memoryCritical / 1024 / 1024 / 1024,
      },
    };
  }

  /**
   * Check coordination latency P95
   */
  checkCoordinationLatency(): BottleneckResult {
    return this.checkCoordinationLatencyP95();
  }

  private checkCoordinationLatencyP95(metrics?: MetricsCollector): BottleneckResult {
    const actual = metrics?.getP95CoordinationLatency() ?? 0;
    const { latencyP95Warning, latencyP95Critical } = this.config.thresholds;

    const detected = actual >= latencyP95Warning;
    let severity: BottleneckSeverity = 'low';
    let recommendation = 'P95 coordination latency is within acceptable limits.';

    if (actual >= latencyP95Critical) {
      severity = 'critical';
      recommendation =
        'P95 coordination latency exceeds 100ms target. Optimize gossip protocol, ' +
        'reduce message size, or implement batching.';
    } else if (actual >= latencyP95Warning) {
      severity = 'medium';
      recommendation =
        'P95 coordination latency approaching target. Monitor closely and consider ' +
        'proactive optimization.';
    }

    return {
      detected,
      severity,
      metric: 'coordination_latency_p95',
      threshold: latencyP95Critical,
      actual,
      recommendation,
    };
  }

  private checkCoordinationLatencyP99(metrics?: MetricsCollector): BottleneckResult {
    const actual = metrics?.getP99CoordinationLatency() ?? 0;
    const { latencyP99Warning, latencyP99Critical } = this.config.thresholds;

    const detected = actual >= latencyP99Warning;
    let severity: BottleneckSeverity = 'low';
    let recommendation = 'P99 coordination latency is within acceptable limits.';

    if (actual >= latencyP99Critical) {
      severity = 'high';
      recommendation =
        'P99 coordination latency indicates outliers. Investigate specific agents ' +
        'or network conditions causing delays.';
    } else if (actual >= latencyP99Warning) {
      severity = 'medium';
      recommendation =
        'P99 coordination latency elevated. Some agents may be experiencing delays.';
    }

    return {
      detected,
      severity,
      metric: 'coordination_latency_p99',
      threshold: latencyP99Critical,
      actual,
      recommendation,
    };
  }

  /**
   * Check for agent starvation
   */
  checkAgentStarvation(metrics?: MetricsCollector): BottleneckResult {
    const hasStarvation = metrics?.hasAgentStarvation() ?? false;

    return {
      detected: hasStarvation,
      severity: hasStarvation ? 'high' : 'low',
      metric: 'agent_starvation',
      threshold: this.config.thresholds.agentStarvationTime,
      actual: hasStarvation ? 1 : 0,
      recommendation: hasStarvation
        ? 'Agent starvation detected. Agents are idle without tasks. ' +
          'Review task distribution algorithm and work stealing configuration.'
        : 'No agent starvation detected.',
    };
  }

  /**
   * Check for deadlocks
   */
  checkDeadlocks(metrics?: MetricsCollector): BottleneckResult {
    const hasDeadlocks = metrics?.hasDeadlocks() ?? false;

    return {
      detected: hasDeadlocks,
      severity: hasDeadlocks ? 'critical' : 'low',
      metric: 'deadlock_detection',
      threshold: this.config.thresholds.deadlockTimeout,
      actual: hasDeadlocks ? 1 : 0,
      recommendation: hasDeadlocks
        ? 'Potential deadlock detected. Tasks running for extended period. ' +
          'Review lock ordering and add timeout mechanisms.'
        : 'No deadlocks detected.',
    };
  }

  /**
   * Check gossip protocol stability
   */
  checkGossipStability(): BottleneckResult {
    // This would integrate with actual gossip protocol metrics
    // For now, return a placeholder that can be overridden
    return {
      detected: false,
      severity: 'low',
      metric: 'gossip_stability',
      threshold: this.config.thresholds.gossipMaxPartitions,
      actual: 0,
      recommendation: 'Gossip protocol stability check requires integration with gossip metrics.',
    };
  }

  /**
   * Check throughput
   */
  private checkThroughput(metrics?: MetricsCollector): BottleneckResult {
    const throughput = metrics?.getThroughput();
    const actual = throughput?.tasksPerSecond ?? 0;
    const threshold = this.config.thresholds.minTasksPerSecond;

    const detected = actual < threshold && actual > 0;

    return {
      detected,
      severity: detected ? 'medium' : 'low',
      metric: 'throughput',
      threshold,
      actual,
      recommendation: detected
        ? `Task throughput (${actual.toFixed(1)}/s) below minimum (${threshold}/s). ` +
          'Consider parallelizing task execution or optimizing task handlers.'
        : 'Task throughput is acceptable.',
    };
  }

  // ============================================================================
  // Report-based Check Methods
  // ============================================================================

  private checkMemoryFromReport(report: LoadTestReport): BottleneckResult {
    const actual = report.resources.memoryPeak;
    const { memoryCritical } = this.config.thresholds;

    return {
      detected: actual >= memoryCritical,
      severity: actual >= memoryCritical ? 'critical' : 'low',
      metric: 'memory_pressure',
      threshold: memoryCritical,
      actual,
      recommendation: actual >= memoryCritical
        ? 'Memory exceeded 4GB limit during test.'
        : 'Memory usage within limits.',
    };
  }

  private checkLatencyP95FromReport(report: LoadTestReport): BottleneckResult {
    const actual = report.performance.coordinationLatency.p95;
    const { latencyP95Critical } = this.config.thresholds;

    return {
      detected: actual >= latencyP95Critical,
      severity: actual >= latencyP95Critical ? 'critical' : 'low',
      metric: 'coordination_latency_p95',
      threshold: latencyP95Critical,
      actual,
      recommendation: actual >= latencyP95Critical
        ? 'P95 coordination latency exceeded 100ms target.'
        : 'P95 latency within target.',
    };
  }

  private checkLatencyP99FromReport(report: LoadTestReport): BottleneckResult {
    const actual = report.performance.coordinationLatency.p99;
    const { latencyP99Critical } = this.config.thresholds;

    return {
      detected: actual >= latencyP99Critical,
      severity: actual >= latencyP99Critical ? 'high' : 'low',
      metric: 'coordination_latency_p99',
      threshold: latencyP99Critical,
      actual,
      recommendation: actual >= latencyP99Critical
        ? 'P99 coordination latency indicates significant outliers.'
        : 'P99 latency acceptable.',
    };
  }

  private checkThroughputFromReport(report: LoadTestReport): BottleneckResult {
    const actual = report.performance.throughput.tasksPerSecond;
    const threshold = this.config.thresholds.minTasksPerSecond;

    return {
      detected: actual < threshold && actual > 0,
      severity: actual < threshold ? 'medium' : 'low',
      metric: 'throughput',
      threshold,
      actual,
      recommendation:
        actual < threshold
          ? 'Throughput below minimum target.'
          : 'Throughput acceptable.',
    };
  }

  private checkSuccessCriteria(report: LoadTestReport): BottleneckResult {
    const criteria = report.summary.successCriteria;
    const failedCriteria = Object.entries(criteria)
      .filter(([_, passed]) => !passed)
      .map(([name]) => name);

    return {
      detected: failedCriteria.length > 0,
      severity: failedCriteria.length > 0 ? 'high' : 'low',
      metric: 'success_criteria',
      threshold: 0,
      actual: failedCriteria.length,
      recommendation:
        failedCriteria.length > 0
          ? `Failed criteria: ${failedCriteria.join(', ')}`
          : 'All success criteria met.',
      context: { failedCriteria },
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private generatePrioritizedRecommendations(
    detectedBottlenecks: BottleneckResult[]
  ): string[] {
    // Sort by severity (critical first)
    const priorityMap: Record<BottleneckSeverity, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    const sorted = [...detectedBottlenecks].sort(
      (a, b) => priorityMap[a.severity] - priorityMap[b.severity]
    );

    // Extract unique recommendations
    const seen = new Set<string>();
    const recommendations: string[] = [];

    for (const bottleneck of sorted) {
      if (!seen.has(bottleneck.recommendation)) {
        seen.add(bottleneck.recommendation);
        recommendations.push(
          `[${bottleneck.severity.toUpperCase()}] ${bottleneck.metric}: ${bottleneck.recommendation}`
        );
      }
    }

    return recommendations;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new BottleneckAnalyzer instance
 */
export function createBottleneckAnalyzer(
  config?: Partial<BottleneckAnalyzerConfig>
): BottleneckAnalyzer {
  return new BottleneckAnalyzer(config);
}

/**
 * Create analyzer with custom thresholds
 */
export function createBottleneckAnalyzerWithThresholds(
  thresholds: Partial<BottleneckThresholds>
): BottleneckAnalyzer {
  return new BottleneckAnalyzer({
    thresholds: { ...DEFAULT_THRESHOLDS, ...thresholds },
  });
}

// ============================================================================
// Exports
// ============================================================================

export { DEFAULT_THRESHOLDS, DEFAULT_CONFIG };
