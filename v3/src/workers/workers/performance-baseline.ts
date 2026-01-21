/**
 * Agentic QE v3 - Performance Baseline Worker
 * ADR-014: Background Workers for QE Monitoring
 *
 * Tracks performance trends including:
 * - Test execution time baselines
 * - Build performance tracking
 * - Resource utilization trends
 * - Performance anomaly detection
 */

import { BaseWorker } from '../base-worker';
import {
  WorkerConfig,
  WorkerContext,
  WorkerResult,
  WorkerFinding,
  WorkerRecommendation,
} from '../interfaces';

const CONFIG: WorkerConfig = {
  id: 'performance-baseline',
  name: 'Performance Baseline Tracker',
  description: 'Tracks performance trends and establishes baselines for test execution and builds',
  intervalMs: 60 * 60 * 1000, // 1 hour
  priority: 'normal',
  targetDomains: ['test-execution', 'chaos-resilience'],
  enabled: true,
  timeoutMs: 300000,
  retryCount: 2,
  retryDelayMs: 30000,
};

interface PerformanceMetrics {
  timestamp: Date;
  testExecution: {
    totalDurationMs: number;
    avgTestDurationMs: number;
    slowestTestMs: number;
    slowestTestName: string;
    p50DurationMs: number;
    p95DurationMs: number;
    p99DurationMs: number;
  };
  build: {
    compileDurationMs: number;
    bundleSizeKb: number;
    dependencyCount: number;
  };
  resources: {
    peakMemoryMb: number;
    avgCpuPercent: number;
    diskReadMb: number;
    diskWriteMb: number;
  };
}

interface PerformanceBaseline {
  testExecution: {
    avgDurationMs: number;
    p95DurationMs: number;
    threshold: number;
  };
  build: {
    avgCompileMs: number;
    avgBundleSizeKb: number;
    threshold: number;
  };
  resources: {
    avgMemoryMb: number;
    avgCpuPercent: number;
    threshold: number;
  };
}

interface PerformanceAnomaly {
  metric: string;
  category: 'test' | 'build' | 'resource';
  currentValue: number;
  baselineValue: number;
  deviationPercent: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export class PerformanceBaselineWorker extends BaseWorker {
  constructor() {
    super(CONFIG);
  }

  protected async doExecute(context: WorkerContext): Promise<WorkerResult> {
    const startTime = Date.now();
    context.logger.info('Starting performance baseline tracking');

    const findings: WorkerFinding[] = [];
    const recommendations: WorkerRecommendation[] = [];

    // Collect current metrics
    const currentMetrics = await this.collectPerformanceMetrics(context);

    // Get or calculate baseline
    const baseline = await this.getOrCalculateBaseline(context);

    // Detect anomalies
    const anomalies = this.detectAnomalies(currentMetrics, baseline);

    // Analyze anomalies
    this.analyzeAnomalies(anomalies, findings, recommendations);

    // Update baseline with new data point
    await this.updateBaseline(context, currentMetrics, baseline);

    // Store metrics history
    await this.storeMetricsHistory(context, currentMetrics);

    const healthScore = this.calculateHealthScore(anomalies);

    context.logger.info('Performance baseline tracking complete', {
      healthScore,
      anomaliesDetected: anomalies.length,
    });

    return this.createResult(
      Date.now() - startTime,
      {
        itemsAnalyzed: 10, // Number of metrics tracked
        issuesFound: anomalies.length,
        healthScore,
        trend: anomalies.length > 2 ? 'degrading' : 'stable',
        domainMetrics: {
          avgTestDuration: `${currentMetrics.testExecution.avgTestDurationMs}ms`,
          p95TestDuration: `${currentMetrics.testExecution.p95DurationMs}ms`,
          compileDuration: `${currentMetrics.build.compileDurationMs}ms`,
          bundleSize: `${currentMetrics.build.bundleSizeKb}KB`,
          peakMemory: `${currentMetrics.resources.peakMemoryMb}MB`,
          anomalies: anomalies.length,
        },
      },
      findings,
      recommendations
    );
  }

  private async collectPerformanceMetrics(_context: WorkerContext): Promise<PerformanceMetrics> {
    // In a real implementation, this would collect actual metrics
    return {
      timestamp: new Date(),
      testExecution: {
        totalDurationMs: 45000,
        avgTestDurationMs: 245,
        slowestTestMs: 3500,
        slowestTestName: 'workflow-orchestrator.test.ts::complex scenario',
        p50DurationMs: 120,
        p95DurationMs: 800,
        p99DurationMs: 2500,
      },
      build: {
        compileDurationMs: 12000,
        bundleSizeKb: 2500,
        dependencyCount: 45,
      },
      resources: {
        peakMemoryMb: 512,
        avgCpuPercent: 65,
        diskReadMb: 150,
        diskWriteMb: 50,
      },
    };
  }

  private async getOrCalculateBaseline(context: WorkerContext): Promise<PerformanceBaseline> {
    const existing = await context.memory.get<PerformanceBaseline>('performance:baseline');

    if (existing) {
      return existing;
    }

    // Default baseline if none exists
    return {
      testExecution: {
        avgDurationMs: 200,
        p95DurationMs: 700,
        threshold: 1.3, // 30% deviation allowed
      },
      build: {
        avgCompileMs: 10000,
        avgBundleSizeKb: 2400,
        threshold: 1.2, // 20% deviation allowed
      },
      resources: {
        avgMemoryMb: 450,
        avgCpuPercent: 60,
        threshold: 1.25, // 25% deviation allowed
      },
    };
  }

  private detectAnomalies(
    metrics: PerformanceMetrics,
    baseline: PerformanceBaseline
  ): PerformanceAnomaly[] {
    const anomalies: PerformanceAnomaly[] = [];

    // Test execution anomalies
    const avgTestDeviation = metrics.testExecution.avgTestDurationMs / baseline.testExecution.avgDurationMs;
    if (avgTestDeviation > baseline.testExecution.threshold) {
      anomalies.push({
        metric: 'avgTestDuration',
        category: 'test',
        currentValue: metrics.testExecution.avgTestDurationMs,
        baselineValue: baseline.testExecution.avgDurationMs,
        deviationPercent: (avgTestDeviation - 1) * 100,
        severity: avgTestDeviation > 1.5 ? 'high' : 'medium',
      });
    }

    const p95Deviation = metrics.testExecution.p95DurationMs / baseline.testExecution.p95DurationMs;
    if (p95Deviation > baseline.testExecution.threshold) {
      anomalies.push({
        metric: 'p95TestDuration',
        category: 'test',
        currentValue: metrics.testExecution.p95DurationMs,
        baselineValue: baseline.testExecution.p95DurationMs,
        deviationPercent: (p95Deviation - 1) * 100,
        severity: p95Deviation > 1.5 ? 'high' : 'medium',
      });
    }

    // Build anomalies
    const compileDeviation = metrics.build.compileDurationMs / baseline.build.avgCompileMs;
    if (compileDeviation > baseline.build.threshold) {
      anomalies.push({
        metric: 'compileDuration',
        category: 'build',
        currentValue: metrics.build.compileDurationMs,
        baselineValue: baseline.build.avgCompileMs,
        deviationPercent: (compileDeviation - 1) * 100,
        severity: compileDeviation > 1.5 ? 'high' : 'medium',
      });
    }

    const bundleDeviation = metrics.build.bundleSizeKb / baseline.build.avgBundleSizeKb;
    if (bundleDeviation > baseline.build.threshold) {
      anomalies.push({
        metric: 'bundleSize',
        category: 'build',
        currentValue: metrics.build.bundleSizeKb,
        baselineValue: baseline.build.avgBundleSizeKb,
        deviationPercent: (bundleDeviation - 1) * 100,
        severity: bundleDeviation > 1.3 ? 'high' : 'medium',
      });
    }

    // Resource anomalies
    const memoryDeviation = metrics.resources.peakMemoryMb / baseline.resources.avgMemoryMb;
    if (memoryDeviation > baseline.resources.threshold) {
      anomalies.push({
        metric: 'peakMemory',
        category: 'resource',
        currentValue: metrics.resources.peakMemoryMb,
        baselineValue: baseline.resources.avgMemoryMb,
        deviationPercent: (memoryDeviation - 1) * 100,
        severity: memoryDeviation > 1.5 ? 'critical' : memoryDeviation > 1.3 ? 'high' : 'medium',
      });
    }

    const cpuDeviation = metrics.resources.avgCpuPercent / baseline.resources.avgCpuPercent;
    if (cpuDeviation > baseline.resources.threshold) {
      anomalies.push({
        metric: 'avgCpu',
        category: 'resource',
        currentValue: metrics.resources.avgCpuPercent,
        baselineValue: baseline.resources.avgCpuPercent,
        deviationPercent: (cpuDeviation - 1) * 100,
        severity: cpuDeviation > 1.4 ? 'high' : 'medium',
      });
    }

    return anomalies;
  }

  private analyzeAnomalies(
    anomalies: PerformanceAnomaly[],
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    for (const anomaly of anomalies) {
      const domain = anomaly.category === 'test' ? 'test-execution' : 'chaos-resilience';

      findings.push({
        type: `performance-anomaly-${anomaly.category}`,
        severity: anomaly.severity,
        domain,
        title: `Performance Anomaly: ${this.formatMetricName(anomaly.metric)}`,
        description: `${this.formatMetricName(anomaly.metric)} is ${anomaly.deviationPercent.toFixed(1)}% above baseline`,
        context: {
          currentValue: anomaly.currentValue,
          baselineValue: anomaly.baselineValue,
          deviationPercent: anomaly.deviationPercent.toFixed(1),
        },
      });
    }

    // Category-specific recommendations
    const testAnomalies = anomalies.filter(a => a.category === 'test');
    if (testAnomalies.length > 0) {
      recommendations.push({
        priority: testAnomalies.some(a => a.severity === 'high') ? 'p1' : 'p2',
        domain: 'test-execution',
        action: 'Investigate Test Performance Degradation',
        description: 'Test execution times have increased. Review for slow tests or infrastructure issues.',
        estimatedImpact: 'medium',
        effort: 'medium',
        autoFixable: false,
      });
    }

    const buildAnomalies = anomalies.filter(a => a.category === 'build');
    if (buildAnomalies.length > 0) {
      const bundleAnomaly = buildAnomalies.find(a => a.metric === 'bundleSize');
      if (bundleAnomaly) {
        recommendations.push({
          priority: 'p2',
          domain: 'chaos-resilience',
          action: 'Analyze Bundle Size Increase',
          description: 'Bundle size has grown. Review for unnecessary dependencies or unoptimized imports.',
          estimatedImpact: 'medium',
          effort: 'low',
          autoFixable: true,
        });
      }
    }

    const resourceAnomalies = anomalies.filter(a => a.category === 'resource');
    if (resourceAnomalies.length > 0) {
      const memoryAnomaly = resourceAnomalies.find(a => a.metric === 'peakMemory');
      if (memoryAnomaly && memoryAnomaly.severity === 'critical') {
        recommendations.push({
          priority: 'p0',
          domain: 'chaos-resilience',
          action: 'Investigate Memory Usage Spike',
          description: 'Memory usage is significantly above baseline. Check for memory leaks.',
          estimatedImpact: 'high',
          effort: 'high',
          autoFixable: false,
        });
      }
    }
  }

  private formatMetricName(metric: string): string {
    const names: Record<string, string> = {
      avgTestDuration: 'Average Test Duration',
      p95TestDuration: 'P95 Test Duration',
      compileDuration: 'Compile Duration',
      bundleSize: 'Bundle Size',
      peakMemory: 'Peak Memory Usage',
      avgCpu: 'Average CPU Usage',
    };
    return names[metric] || metric;
  }

  private async updateBaseline(
    context: WorkerContext,
    metrics: PerformanceMetrics,
    baseline: PerformanceBaseline
  ): Promise<void> {
    // Use exponential moving average to update baseline
    const alpha = 0.1; // Weight for new values

    const updatedBaseline: PerformanceBaseline = {
      testExecution: {
        avgDurationMs: baseline.testExecution.avgDurationMs * (1 - alpha) +
          metrics.testExecution.avgTestDurationMs * alpha,
        p95DurationMs: baseline.testExecution.p95DurationMs * (1 - alpha) +
          metrics.testExecution.p95DurationMs * alpha,
        threshold: baseline.testExecution.threshold,
      },
      build: {
        avgCompileMs: baseline.build.avgCompileMs * (1 - alpha) +
          metrics.build.compileDurationMs * alpha,
        avgBundleSizeKb: baseline.build.avgBundleSizeKb * (1 - alpha) +
          metrics.build.bundleSizeKb * alpha,
        threshold: baseline.build.threshold,
      },
      resources: {
        avgMemoryMb: baseline.resources.avgMemoryMb * (1 - alpha) +
          metrics.resources.peakMemoryMb * alpha,
        avgCpuPercent: baseline.resources.avgCpuPercent * (1 - alpha) +
          metrics.resources.avgCpuPercent * alpha,
        threshold: baseline.resources.threshold,
      },
    };

    await context.memory.set('performance:baseline', updatedBaseline);
  }

  private async storeMetricsHistory(
    context: WorkerContext,
    metrics: PerformanceMetrics
  ): Promise<void> {
    const history = await context.memory.get<PerformanceMetrics[]>('performance:history') || [];
    history.push(metrics);

    // Keep last 168 data points (1 week of hourly data)
    while (history.length > 168) {
      history.shift();
    }

    await context.memory.set('performance:history', history);
  }

  private calculateHealthScore(anomalies: PerformanceAnomaly[]): number {
    if (anomalies.length === 0) return 100;

    let score = 100;

    for (const anomaly of anomalies) {
      // Penalty based on severity and deviation
      const basePenalty = {
        critical: 25,
        high: 15,
        medium: 8,
        low: 3,
      }[anomaly.severity];

      // Additional penalty for large deviations
      const deviationPenalty = Math.min(10, anomaly.deviationPercent / 10);

      score -= basePenalty + deviationPenalty;
    }

    return Math.max(0, Math.round(score));
  }
}
