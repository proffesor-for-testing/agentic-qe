/**
 * Agentic QE v3 - Regression Monitor Worker
 * ADR-014: Background Workers for QE Monitoring
 *
 * Watches for regressions including:
 * - Test result regressions
 * - Performance regressions
 * - Coverage regressions
 * - Quality metric regressions
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
  id: 'regression-monitor',
  name: 'Regression Monitor',
  description: 'Monitors for regressions in test results, performance, coverage, and quality metrics',
  intervalMs: 10 * 60 * 1000, // 10 minutes
  priority: 'high',
  targetDomains: ['test-execution', 'coverage-analysis', 'quality-assessment'],
  enabled: true,
  timeoutMs: 120000,
  retryCount: 2,
  retryDelayMs: 10000,
};

interface MetricSnapshot {
  timestamp: Date;
  testPassRate: number;
  coverage: {
    line: number;
    branch: number;
  };
  avgTestDuration: number;
  failedTests: string[];
  qualityScore: number;
}

interface RegressionResult {
  type: 'test' | 'performance' | 'coverage' | 'quality';
  metric: string;
  previousValue: number;
  currentValue: number;
  changePercent: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  affectedTests?: string[];
}

export class RegressionMonitorWorker extends BaseWorker {
  constructor() {
    super(CONFIG);
  }

  protected async doExecute(context: WorkerContext): Promise<WorkerResult> {
    const startTime = Date.now();
    context.logger.info('Starting regression monitoring');

    const findings: WorkerFinding[] = [];
    const recommendations: WorkerRecommendation[] = [];

    // Get current snapshot
    const currentSnapshot = await this.collectCurrentSnapshot(context);

    // Get baseline (previous snapshot)
    const baseline = await context.memory.get<MetricSnapshot>('regression:baseline');

    // Detect regressions
    let regressions: RegressionResult[] = [];
    if (baseline) {
      regressions = this.detectRegressions(baseline, currentSnapshot);
      this.analyzeRegressions(regressions, findings, recommendations);
    }

    // Store current as new baseline
    await context.memory.set('regression:baseline', currentSnapshot);

    // Store regression history
    const history = await context.memory.get<RegressionResult[]>('regression:history') || [];
    if (regressions.length > 0) {
      history.push(...regressions);
      // Keep last 100 regressions
      while (history.length > 100) history.shift();
      await context.memory.set('regression:history', history);
    }

    const healthScore = this.calculateHealthScore(regressions);

    context.logger.info('Regression monitoring complete', {
      healthScore,
      regressionsDetected: regressions.length,
    });

    return this.createResult(
      Date.now() - startTime,
      {
        itemsAnalyzed: 5, // Number of metrics checked
        issuesFound: regressions.length,
        healthScore,
        trend: regressions.length > 0 ? 'degrading' : 'stable',
        domainMetrics: {
          testPassRate: `${currentSnapshot.testPassRate}%`,
          lineCoverage: `${currentSnapshot.coverage.line}%`,
          avgTestDuration: `${currentSnapshot.avgTestDuration}ms`,
          qualityScore: currentSnapshot.qualityScore,
          regressionsDetected: regressions.length,
        },
      },
      findings,
      recommendations
    );
  }

  private async collectCurrentSnapshot(_context: WorkerContext): Promise<MetricSnapshot> {
    // In a real implementation, this would query actual metrics
    return {
      timestamp: new Date(),
      testPassRate: 98.2,
      coverage: {
        line: 78.5,
        branch: 65.2,
      },
      avgTestDuration: 245,
      failedTests: [
        'test-execution/retry-handler.test.ts::should retry failed tests',
        'coordination/workflow.test.ts::should handle concurrent workflows',
      ],
      qualityScore: 82,
    };
  }

  private detectRegressions(
    baseline: MetricSnapshot,
    current: MetricSnapshot
  ): RegressionResult[] {
    const regressions: RegressionResult[] = [];

    // Test pass rate regression
    if (current.testPassRate < baseline.testPassRate - 1) {
      const change = current.testPassRate - baseline.testPassRate;
      regressions.push({
        type: 'test',
        metric: 'testPassRate',
        previousValue: baseline.testPassRate,
        currentValue: current.testPassRate,
        changePercent: change,
        severity: change < -5 ? 'critical' : change < -2 ? 'high' : 'medium',
        affectedTests: current.failedTests,
      });
    }

    // Coverage regression
    if (current.coverage.line < baseline.coverage.line - 2) {
      const change = current.coverage.line - baseline.coverage.line;
      regressions.push({
        type: 'coverage',
        metric: 'lineCoverage',
        previousValue: baseline.coverage.line,
        currentValue: current.coverage.line,
        changePercent: change,
        severity: change < -5 ? 'high' : 'medium',
      });
    }

    if (current.coverage.branch < baseline.coverage.branch - 3) {
      const change = current.coverage.branch - baseline.coverage.branch;
      regressions.push({
        type: 'coverage',
        metric: 'branchCoverage',
        previousValue: baseline.coverage.branch,
        currentValue: current.coverage.branch,
        changePercent: change,
        severity: change < -5 ? 'high' : 'medium',
      });
    }

    // Performance regression
    const durationChange = ((current.avgTestDuration - baseline.avgTestDuration) / baseline.avgTestDuration) * 100;
    if (durationChange > 20) {
      regressions.push({
        type: 'performance',
        metric: 'avgTestDuration',
        previousValue: baseline.avgTestDuration,
        currentValue: current.avgTestDuration,
        changePercent: durationChange,
        severity: durationChange > 50 ? 'high' : 'medium',
      });
    }

    // Quality score regression
    if (current.qualityScore < baseline.qualityScore - 5) {
      const change = current.qualityScore - baseline.qualityScore;
      regressions.push({
        type: 'quality',
        metric: 'qualityScore',
        previousValue: baseline.qualityScore,
        currentValue: current.qualityScore,
        changePercent: change,
        severity: change < -10 ? 'critical' : change < -5 ? 'high' : 'medium',
      });
    }

    // New test failures
    const newFailures = current.failedTests.filter(t => !baseline.failedTests.includes(t));
    if (newFailures.length > 0) {
      regressions.push({
        type: 'test',
        metric: 'newFailures',
        previousValue: 0,
        currentValue: newFailures.length,
        changePercent: 100,
        severity: newFailures.length > 5 ? 'critical' : newFailures.length > 2 ? 'high' : 'medium',
        affectedTests: newFailures,
      });
    }

    return regressions;
  }

  private analyzeRegressions(
    regressions: RegressionResult[],
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    for (const regression of regressions) {
      const domain = this.getDomainForType(regression.type);

      findings.push({
        type: `${regression.type}-regression`,
        severity: regression.severity,
        domain,
        title: `${this.formatMetricName(regression.metric)} Regression Detected`,
        description: this.formatRegressionDescription(regression),
        context: {
          previousValue: regression.previousValue,
          currentValue: regression.currentValue,
          changePercent: regression.changePercent.toFixed(2),
          affectedTests: regression.affectedTests,
        },
      });
    }

    // Generate recommendations based on regression types
    const testRegressions = regressions.filter(r => r.type === 'test');
    if (testRegressions.length > 0) {
      const criticalOrHigh = testRegressions.filter(r =>
        r.severity === 'critical' || r.severity === 'high'
      );

      if (criticalOrHigh.length > 0) {
        recommendations.push({
          priority: 'p0',
          domain: 'test-execution',
          action: 'Investigate Test Regressions Immediately',
          description: `${criticalOrHigh.length} significant test regressions detected. Review recent changes.`,
          estimatedImpact: 'high',
          effort: 'medium',
          autoFixable: false,
        });
      }
    }

    const coverageRegressions = regressions.filter(r => r.type === 'coverage');
    if (coverageRegressions.length > 0) {
      recommendations.push({
        priority: 'p1',
        domain: 'coverage-analysis',
        action: 'Address Coverage Regression',
        description: 'Code coverage has decreased. Add tests for new/changed code.',
        estimatedImpact: 'medium',
        effort: 'medium',
        autoFixable: true,
      });
    }

    const performanceRegressions = regressions.filter(r => r.type === 'performance');
    if (performanceRegressions.length > 0) {
      recommendations.push({
        priority: 'p2',
        domain: 'test-execution',
        action: 'Investigate Performance Regression',
        description: 'Test execution has slowed. Review for new slow tests or infrastructure issues.',
        estimatedImpact: 'medium',
        effort: 'low',
        autoFixable: false,
      });
    }
  }

  private getDomainForType(type: string): 'test-execution' | 'coverage-analysis' | 'quality-assessment' {
    switch (type) {
      case 'test':
      case 'performance':
        return 'test-execution';
      case 'coverage':
        return 'coverage-analysis';
      case 'quality':
        return 'quality-assessment';
      default:
        return 'quality-assessment';
    }
  }

  private formatMetricName(metric: string): string {
    const names: Record<string, string> = {
      testPassRate: 'Test Pass Rate',
      lineCoverage: 'Line Coverage',
      branchCoverage: 'Branch Coverage',
      avgTestDuration: 'Test Duration',
      qualityScore: 'Quality Score',
      newFailures: 'New Test Failures',
    };
    return names[metric] || metric;
  }

  private formatRegressionDescription(regression: RegressionResult): string {
    if (regression.metric === 'newFailures') {
      return `${regression.currentValue} new test failures detected since last check`;
    }

    const direction = regression.changePercent > 0 ? 'increased' : 'decreased';
    const unit = regression.type === 'performance' ? 'ms' : '%';

    return `${this.formatMetricName(regression.metric)} ${direction} from ${regression.previousValue}${unit} to ${regression.currentValue}${unit} (${regression.changePercent > 0 ? '+' : ''}${regression.changePercent.toFixed(1)}%)`;
  }

  private calculateHealthScore(regressions: RegressionResult[]): number {
    if (regressions.length === 0) return 100;

    let score = 100;

    for (const regression of regressions) {
      switch (regression.severity) {
        case 'critical':
          score -= 25;
          break;
        case 'high':
          score -= 15;
          break;
        case 'medium':
          score -= 8;
          break;
        case 'low':
          score -= 3;
          break;
      }
    }

    return Math.max(0, Math.round(score));
  }
}
