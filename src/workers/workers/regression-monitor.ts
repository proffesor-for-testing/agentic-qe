/**
 * Agentic QE v3 - Regression Monitor Worker
 * ADR-014: Background Workers for QE Monitoring
 *
 * Watches for measured test pass-rate and coverage regressions.
 */

import { BaseWorker } from '../base-worker';
import {
  WorkerConfig,
  WorkerContext,
  WorkerResult,
  WorkerFinding,
  WorkerRecommendation,
} from '../interfaces';
import { measuredCoverageSummary } from '../../domains/quality-assessment/coverage-report-event.js';
import {
  DEFAULT_QUALITY_EVIDENCE_MAX_AGE_MS,
  QUALITY_EVIDENCE_NAMESPACE,
  type QualityEvidenceRecord,
} from '../../domains/quality-assessment/quality-evidence.js';

const CONFIG: WorkerConfig = {
  id: 'regression-monitor',
  name: 'Regression Monitor',
  description: 'Monitors measured test pass-rate and coverage for regressions',
  intervalMs: 10 * 60 * 1000, // 10 minutes
  priority: 'high',
  targetDomains: ['test-execution', 'coverage-analysis', 'quality-assessment'],
  enabled: true,
  timeoutMs: 120000,
  retryCount: 2,
  retryDelayMs: 10000,
};

interface MetricSnapshot {
  schemaVersion: 2;
  measured: true;
  timestamp: string;
  testPassRate?: number;
  coverage?: { line: number; branch?: number };
}

interface RegressionResult {
  type: 'test' | 'coverage';
  metric: string;
  previousValue: number;
  currentValue: number;
  changePercent: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

const isPercent = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;

function measuredBaseline(value: unknown): MetricSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const snapshot = value as Partial<MetricSnapshot>;
  if (snapshot.schemaVersion !== 2 || snapshot.measured !== true
    || typeof snapshot.timestamp !== 'string' || !Number.isFinite(Date.parse(snapshot.timestamp))) return null;
  const testsValid = snapshot.testPassRate === undefined || isPercent(snapshot.testPassRate);
  const coverageValid = snapshot.coverage === undefined || (
    isPercent(snapshot.coverage.line)
    && (snapshot.coverage.branch === undefined || isPercent(snapshot.coverage.branch))
  );
  return testsValid && coverageValid && (snapshot.testPassRate !== undefined || snapshot.coverage !== undefined)
    ? snapshot as MetricSnapshot : null;
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

    const currentSnapshot = await this.collectCurrentSnapshot(context);
    if (!currentSnapshot) {
      findings.push({
        type: 'regression-evidence-unavailable',
        severity: 'info',
        domain: 'quality-assessment',
        title: 'Regression monitoring has no measured data',
        description: 'Run tests or collect instrumented coverage before evaluating regressions.',
      });
      return this.createResult(Date.now() - startTime, {
        itemsAnalyzed: 0,
        issuesFound: 0,
        healthScore: 0,
        trend: 'stable',
        domainMetrics: { evidenceStatus: 'unmeasured', regressionsDetected: 0 },
      }, findings, recommendations);
    }

    // Older versions persisted fabricated figures. Only compare measured v2 records.
    const baseline = measuredBaseline(await context.memory.get<unknown>('regression:baseline'));

    let regressions: RegressionResult[] = [];
    if (baseline) {
      regressions = this.detectRegressions(baseline, currentSnapshot);
      this.analyzeRegressions(regressions, findings, recommendations);
    }

    await context.memory.set('regression:baseline', currentSnapshot);

    // Store regression history
    const history = await context.memory.get<RegressionResult[]>('regression:history') || [];
    if (regressions.length > 0) {
      history.push(...regressions);
      // Keep last 100 regressions
      while (history.length > 100) history.shift();
      await context.memory.set('regression:history', history);
    }

    const comparableMetrics = baseline ? this.countComparableMetrics(baseline, currentSnapshot) : 0;
    const healthScore = comparableMetrics > 0 ? this.calculateHealthScore(regressions) : 0;
    const evidenceStatus = comparableMetrics > 0 ? 'compared' : 'baseline-pending';

    context.logger.info('Regression monitoring complete', {
      healthScore,
      regressionsDetected: regressions.length,
    });

    return this.createResult(
      Date.now() - startTime,
      {
        itemsAnalyzed: comparableMetrics,
        issuesFound: regressions.length,
        healthScore,
        trend: regressions.length > 0 ? 'degrading' : 'stable',
        domainMetrics: {
          evidenceStatus,
          testPassRate: currentSnapshot.testPassRate === undefined ? 'unmeasured' : `${currentSnapshot.testPassRate}%`,
          lineCoverage: currentSnapshot.coverage ? `${currentSnapshot.coverage.line}%` : 'unmeasured',
          branchCoverage: currentSnapshot.coverage?.branch === undefined ? 'unmeasured' : `${currentSnapshot.coverage.branch}%`,
          regressionsDetected: regressions.length,
        },
      },
      findings,
      recommendations
    );
  }

  private async collectCurrentSnapshot(context: WorkerContext): Promise<MetricSnapshot | null> {
    const coverage = measuredCoverageSummary(await context.memory.get<unknown>('coverage:latest'));
    const rawTests = await context.memory.get<unknown>('quality-evidence:testsPassing:latest', {
      namespace: QUALITY_EVIDENCE_NAMESPACE,
    });
    const tests = rawTests && typeof rawTests === 'object' ? rawTests as Partial<QualityEvidenceRecord> : null;
    const measuredAt = tests && typeof tests.measuredAt === 'string' ? Date.parse(tests.measuredAt) : NaN;
    const now = Date.now();
    const testPassRate = tests?.schemaVersion === 1 && tests.metric === 'testsPassing'
      && isPercent(tests.value) && typeof tests.source === 'string' && tests.source.trim().length > 0
      && Number.isFinite(measuredAt) && measuredAt <= now + 60_000
      && now - measuredAt <= DEFAULT_QUALITY_EVIDENCE_MAX_AGE_MS
      ? tests.value : undefined;

    if (!coverage && testPassRate === undefined) return null;
    return {
      schemaVersion: 2,
      measured: true,
      timestamp: new Date(now).toISOString(),
      ...(testPassRate === undefined ? {} : { testPassRate }),
      ...(coverage ? {
        coverage: {
          line: coverage.line,
          ...(coverage.branch === null ? {} : { branch: coverage.branch }),
        },
      } : {}),
    };
  }

  private countComparableMetrics(baseline: MetricSnapshot, current: MetricSnapshot): number {
    return Number(baseline.testPassRate !== undefined && current.testPassRate !== undefined)
      + Number(baseline.coverage !== undefined && current.coverage !== undefined)
      + Number(baseline.coverage?.branch !== undefined && current.coverage?.branch !== undefined);
  }

  private detectRegressions(
    baseline: MetricSnapshot,
    current: MetricSnapshot
  ): RegressionResult[] {
    const regressions: RegressionResult[] = [];

    // Test pass rate regression
    if (current.testPassRate !== undefined && baseline.testPassRate !== undefined
      && current.testPassRate < baseline.testPassRate - 1) {
      const change = current.testPassRate - baseline.testPassRate;
      regressions.push({
        type: 'test',
        metric: 'testPassRate',
        previousValue: baseline.testPassRate,
        currentValue: current.testPassRate,
        changePercent: change,
        severity: change < -5 ? 'critical' : change < -2 ? 'high' : 'medium',
      });
    }

    // Coverage regression
    if (current.coverage && baseline.coverage && current.coverage.line < baseline.coverage.line - 2) {
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

    if (current.coverage?.branch !== undefined && baseline.coverage?.branch !== undefined
      && current.coverage.branch < baseline.coverage.branch - 3) {
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

  }

  private getDomainForType(type: string): 'test-execution' | 'coverage-analysis' | 'quality-assessment' {
    switch (type) {
      case 'test':
        return 'test-execution';
      case 'coverage':
        return 'coverage-analysis';
      default:
        return 'quality-assessment';
    }
  }

  private formatMetricName(metric: string): string {
    const names: Record<string, string> = {
      testPassRate: 'Test Pass Rate',
      lineCoverage: 'Line Coverage',
      branchCoverage: 'Branch Coverage',
    };
    return names[metric] || metric;
  }

  private formatRegressionDescription(regression: RegressionResult): string {
    const direction = regression.changePercent > 0 ? 'increased' : 'decreased';
    return `${this.formatMetricName(regression.metric)} ${direction} from ${regression.previousValue}% to ${regression.currentValue}% (${regression.changePercent > 0 ? '+' : ''}${regression.changePercent.toFixed(1)} percentage points)`;
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
