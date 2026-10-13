/**
 * Agentic QE v3 - Regression Monitor Worker
 * ADR-014: Background Workers for QE Monitoring
 *
 * Watches for regressions including:
 * - Test result regressions
 * - Performance regressions
 * - Coverage regressions
 *
 * #1028: every figure comes from measured evidence — the stamped
 * `coverage:latest` record and the latest testsPassing quality evidence (with
 * its run's recorded result). Nothing measured → nothing stored or compared.
 */

import { BaseWorker } from '../base-worker';
import {
  WorkerConfig,
  WorkerContext,
  WorkerResult,
  WorkerFinding,
  WorkerRecommendation,
} from '../interfaces';
import {
  measuredCoverageSummary,
  type MeasuredCoverageSummary,
} from '../../domains/quality-assessment/coverage-report-event.js';
import { readQualityEvidenceRecord } from '../../domains/quality-assessment/quality-evidence.js';

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

const BASELINE_KEY = 'regression:baseline';
const HISTORY_KEY = 'regression:history';
const BASELINE_SCHEMA_VERSION = 2;

/** The test side of a snapshot: the latest usable testsPassing evidence (#1028). */
interface MeasuredTests {
  /** testsPassing of that run, in percent. */
  passRate: number;
  runId: string | null;
  runStatus: 'passed' | 'failed' | null;
  measuredAt: string;
  source: string;
  /** Names of that run's failing tests; `null` = the run's result was not recorded. */
  failedTests: string[] | null;
  /** Mean duration per test of that run; `null` = not recorded. */
  avgTestDurationMs: number | null;
}

/**
 * A regression snapshot holding only measured figures (#1028). Each side is
 * `null` when it was never measured — never a default or an estimate. Stored
 * as `regression:baseline` with the `measured: true` stamp; a record without
 * it (the invented snapshot written by <= 3.15.5) is not a baseline.
 */
interface MeasuredSnapshot {
  measured: true;
  schemaVersion: typeof BASELINE_SCHEMA_VERSION;
  timestamp: string;
  /** The stamped `coverage:latest` record, validated by `measuredCoverageSummary`. */
  coverage: MeasuredCoverageSummary | null;
  tests: MeasuredTests | null;
}

type BaselineStatus = 'measured' | 'none' | 'legacy-ignored';

interface RegressionResult {
  type: 'test' | 'performance' | 'coverage';
  metric: string;
  previousValue: number;
  currentValue: number;
  changePercent: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  affectedTests?: string[];
}

/** A history entry; the stamp tells it apart from entries derived from invented figures. */
interface RegressionHistoryEntry extends RegressionResult {
  measured: true;
  detectedAt: string;
}

const isPercent = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;

/** Two decimals, for reporting measured figures. */
const round = (v: number): number => Math.round(v * 100) / 100;

/** The stored snapshot when it is a measured baseline, else `null` (#1028). */
function measuredBaseline(raw: unknown): MeasuredSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.measured !== true || r.schemaVersion !== BASELINE_SCHEMA_VERSION) return null;
  const coverage = r.coverage === null ? null : measuredCoverageSummary(r.coverage);
  if (r.coverage !== null && !coverage) return null;
  const tests = r.tests === null ? null : measuredTests(r.tests);
  if (r.tests !== null && !tests) return null;
  if (!coverage && !tests) return null;
  return {
    measured: true,
    schemaVersion: BASELINE_SCHEMA_VERSION,
    timestamp: typeof r.timestamp === 'string' ? r.timestamp : '',
    coverage,
    tests,
  };
}

function measuredTests(raw: unknown): MeasuredTests | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  if (!isPercent(t.passRate) || typeof t.measuredAt !== 'string' || typeof t.source !== 'string') return null;
  const failedTests = Array.isArray(t.failedTests) && t.failedTests.every((n) => typeof n === 'string')
    ? (t.failedTests as string[]) : null;
  const avg = t.avgTestDurationMs;
  return {
    passRate: t.passRate,
    runId: typeof t.runId === 'string' ? t.runId : null,
    runStatus: t.runStatus === 'passed' || t.runStatus === 'failed' ? t.runStatus : null,
    measuredAt: t.measuredAt,
    source: t.source,
    failedTests,
    avgTestDurationMs: typeof avg === 'number' && Number.isFinite(avg) && avg >= 0 ? avg : null,
  };
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

    // #1028: only measured figures — never a hardcoded or estimated snapshot.
    const current = await this.collectCurrentSnapshot(context);

    // A baseline counts only with the measured stamp: the invented snapshot
    // older versions stored is ignored (left in place, never compared).
    const storedBaseline = await context.memory.get<unknown>(BASELINE_KEY);
    const baseline = measuredBaseline(storedBaseline);
    const baselineStatus: BaselineStatus = baseline ? 'measured' : storedBaseline ? 'legacy-ignored' : 'none';
    if (baselineStatus === 'legacy-ignored') {
      context.logger.info('Ignoring a regression:baseline without the measured stamp (written by <= 3.15.5)');
    }

    let regressions: RegressionResult[] = [];
    let metricsCompared = 0;
    if (baseline && current) {
      ({ regressions, metricsCompared } = this.detectRegressions(baseline, current));
      this.analyzeRegressions(regressions, findings, recommendations);
    }

    if (current) {
      // A side not measured now keeps its last measured value: an estimate or
      // a missing run neither erases the baseline nor gets compared.
      const next: MeasuredSnapshot = {
        ...current,
        coverage: current.coverage ?? baseline?.coverage ?? null,
        tests: current.tests ?? baseline?.tests ?? null,
      };
      await context.memory.set(BASELINE_KEY, next);
    } else {
      findings.push({
        type: 'regression-unmeasured',
        severity: 'info',
        domain: 'quality-assessment',
        title: 'Regression Baseline Unmeasured',
        description: 'No measured coverage (stamped coverage:latest) and no current testsPassing evidence exist, ' +
          'so nothing was stored or compared. Run the tests (with coverage) to start regression tracking.',
      });
    }

    if (regressions.length > 0) {
      const detectedAt = new Date().toISOString();
      const stored = await context.memory.get<unknown[]>(HISTORY_KEY);
      const history: unknown[] = Array.isArray(stored) ? stored : [];
      history.push(...regressions.map((r): RegressionHistoryEntry => ({ ...r, measured: true, detectedAt })));
      // Keep last 100 regressions
      while (history.length > 100) history.shift();
      await context.memory.set(HISTORY_KEY, history);
    }

    const healthScore = this.calculateHealthScore(regressions);

    context.logger.info('Regression monitoring complete', {
      healthScore,
      measured: current !== null,
      baselineStatus,
      regressionsDetected: regressions.length,
    });

    const pct = (v: number | null) => (v === null ? 'n/a' : `${round(v)}%`);
    const tests = current?.tests ?? null;
    const coverage = current?.coverage ?? null;
    return this.createResult(
      Date.now() - startTime,
      {
        itemsAnalyzed: metricsCompared,
        issuesFound: regressions.length,
        healthScore,
        trend: regressions.length > 0 ? 'degrading' : 'stable',
        domainMetrics: {
          baselineStatus,
          testPassRate: tests ? pct(tests.passRate) : 'unmeasured',
          lineCoverage: coverage ? pct(coverage.line) : 'unmeasured',
          branchCoverage: coverage ? pct(coverage.branch) : 'unmeasured',
          avgTestDuration: tests && tests.avgTestDurationMs !== null ? `${round(tests.avgTestDurationMs)}ms` : 'unmeasured',
          regressionsDetected: regressions.length,
        },
      },
      findings,
      recommendations
    );
  }

  /**
   * #1028: the current snapshot from measured sources only — the stamped
   * `coverage:latest` (same validator as the coverage tracker and the quality
   * gate) and the latest usable testsPassing evidence (same validation as the
   * gate) with that run's recorded `test-run:<runId>` result. `null` when
   * nothing is measured.
   */
  private async collectCurrentSnapshot(context: WorkerContext): Promise<MeasuredSnapshot | null> {
    const coverage = measuredCoverageSummary(await context.memory.get<unknown>('coverage:latest'));
    const tests = await this.collectMeasuredTests(context);
    if (!coverage && !tests) return null;
    return {
      measured: true,
      schemaVersion: BASELINE_SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      coverage,
      tests,
    };
  }

  private async collectMeasuredTests(context: WorkerContext): Promise<MeasuredTests | null> {
    const evidence = await readQualityEvidenceRecord(context.memory, 'testsPassing');
    if (!evidence || !isPercent(evidence.value)) return null;

    let failedTests: string[] | null = null;
    let avgTestDurationMs: number | null = null;
    if (evidence.runId) {
      const run = await context.memory.get<Record<string, unknown>>(`test-run:${evidence.runId}`, {
        namespace: 'test-execution',
      });
      if (run && typeof run === 'object') {
        if (Array.isArray(run.failedTests)) {
          failedTests = run.failedTests
            .map((t) => (t && typeof t === 'object' ? (t as { testName?: unknown }).testName : undefined))
            .filter((n): n is string => typeof n === 'string');
        }
        const { total, duration } = run;
        if (typeof total === 'number' && total > 0 && typeof duration === 'number' && Number.isFinite(duration) && duration >= 0) {
          avgTestDurationMs = duration / total;
        }
      }
    }

    return {
      passRate: evidence.value,
      runId: evidence.runId ?? null,
      runStatus: evidence.runStatus ?? null,
      measuredAt: evidence.measuredAt,
      source: evidence.source,
      failedTests,
      avgTestDurationMs,
    };
  }

  /**
   * Compare two measured snapshots. A metric is compared only when both sides
   * measured it; an uncollected (`null`) metric is never compared (#1028).
   */
  private detectRegressions(
    baseline: MeasuredSnapshot,
    current: MeasuredSnapshot
  ): { regressions: RegressionResult[]; metricsCompared: number } {
    const regressions: RegressionResult[] = [];
    let metricsCompared = 0;

    const prevTests = baseline.tests;
    const curTests = current.tests;
    if (prevTests && curTests) {
      metricsCompared++;
      if (curTests.passRate < prevTests.passRate - 1) {
        const change = curTests.passRate - prevTests.passRate;
        regressions.push({
          type: 'test',
          metric: 'testPassRate',
          previousValue: round(prevTests.passRate),
          currentValue: round(curTests.passRate),
          changePercent: change,
          severity: change < -5 ? 'critical' : change < -2 ? 'high' : 'medium',
          ...(curTests.failedTests ? { affectedTests: curTests.failedTests } : {}),
        });
      }

      if (prevTests.failedTests && curTests.failedTests) {
        metricsCompared++;
        const known = new Set(prevTests.failedTests);
        const newFailures = curTests.failedTests.filter((t) => !known.has(t));
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
      }

      const prevAvg = prevTests.avgTestDurationMs;
      const curAvg = curTests.avgTestDurationMs;
      if (prevAvg !== null && curAvg !== null && prevAvg > 0) {
        metricsCompared++;
        const durationChange = ((curAvg - prevAvg) / prevAvg) * 100;
        if (durationChange > 20) {
          regressions.push({
            type: 'performance',
            metric: 'avgTestDuration',
            previousValue: round(prevAvg),
            currentValue: round(curAvg),
            changePercent: durationChange,
            severity: durationChange > 50 ? 'high' : 'medium',
          });
        }
      }
    }

    const prevCov = baseline.coverage;
    const curCov = current.coverage;
    if (prevCov && curCov) {
      metricsCompared++;
      if (curCov.line < prevCov.line - 2) {
        const change = curCov.line - prevCov.line;
        regressions.push({
          type: 'coverage',
          metric: 'lineCoverage',
          previousValue: prevCov.line,
          currentValue: curCov.line,
          changePercent: change,
          severity: change < -5 ? 'high' : 'medium',
        });
      }

      if (prevCov.branch !== null && curCov.branch !== null) {
        metricsCompared++;
        if (curCov.branch < prevCov.branch - 3) {
          const change = curCov.branch - prevCov.branch;
          regressions.push({
            type: 'coverage',
            metric: 'branchCoverage',
            previousValue: prevCov.branch,
            currentValue: curCov.branch,
            changePercent: change,
            severity: change < -5 ? 'high' : 'medium',
          });
        }
      }
    }

    return { regressions, metricsCompared };
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
          metric: regression.metric,
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

  private getDomainForType(type: RegressionResult['type']): 'test-execution' | 'coverage-analysis' {
    return type === 'coverage' ? 'coverage-analysis' : 'test-execution';
  }

  private formatMetricName(metric: string): string {
    const names: Record<string, string> = {
      testPassRate: 'Test Pass Rate',
      lineCoverage: 'Line Coverage',
      branchCoverage: 'Branch Coverage',
      avgTestDuration: 'Test Duration',
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
