/**
 * Agentic QE v3 - Performance Baseline Worker
 * ADR-014: Background Workers for QE Monitoring
 *
 * Tracks test execution time against a baseline built from measured runs.
 *
 * #1043: every figure comes from a recorded test run — the run behind the
 * latest usable testsPassing evidence (`test-run:<runId>` in `test-execution`),
 * read the same way the regression monitor reads it (#1028). Build and
 * resource figures have no measured source and are reported unmeasured.
 * Nothing measured → nothing stored or compared. A baseline without the
 * measured stamp (the invented one written by <= 3.15.6) is ignored and
 * replaced by the next measured run.
 */

import { BaseWorker } from '../base-worker';
import {
  WorkerConfig,
  WorkerContext,
  WorkerResult,
  WorkerFinding,
  WorkerRecommendation,
} from '../interfaces';
import { readQualityEvidenceRecord } from '../../domains/quality-assessment/quality-evidence.js';

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

const BASELINE_KEY = 'performance:baseline';
const HISTORY_KEY = 'performance:history';
const SCHEMA_VERSION = 1;
/** Allowed slowdown before a measured run is an anomaly (30%). */
const DURATION_THRESHOLD = 1.3;
/** Weight of a new measured run in the baseline average. */
const EMA_ALPHA = 0.1;
/** Keep the last 168 measured runs. */
const MAX_HISTORY = 168;

type TestSet = { total: number; files: string[] } | null;

/** One measured test run (#1043). */
interface MeasuredRunTiming {
  measured: true;
  runId: string;
  measuredAt: string;
  totalDurationMs: number;
  testCount: number;
  avgTestDurationMs: number;
  testSet: TestSet;
}

/** The `performance:baseline` record: measured runs only, with the stamp. */
interface MeasuredBaseline {
  measured: true;
  schemaVersion: typeof SCHEMA_VERSION;
  updatedAt: string;
  testExecution: {
    avgTestDurationMs: number;
    totalDurationMs: number;
    /** Measured runs blended into this baseline. */
    samples: number;
    lastRunId: string;
    testSet: TestSet;
  };
}

type BaselineStatus = 'measured' | 'none' | 'legacy-ignored' | 'invalid-ignored';

interface PerformanceAnomaly {
  metric: 'avgTestDuration' | 'totalTestDuration';
  currentValue: number;
  baselineValue: number;
  deviationPercent: number;
  severity: 'high' | 'medium';
}

const isNonNegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const round = (v: number): number => Math.round(v * 100) / 100;

/** A recorded test set `{ total, files }`, or `null`. */
function parseTestSet(raw: unknown): TestSet {
  if (!raw || typeof raw !== 'object') return null;
  const { total, files } = raw as Record<string, unknown>;
  if (typeof total !== 'number' || !Number.isInteger(total) || total <= 0) return null;
  if (!Array.isArray(files) || files.length === 0 || !files.every((f) => typeof f === 'string')) return null;
  return { total, files: [...new Set(files as string[])].sort() };
}

const sameTestSet = (a: TestSet, b: TestSet): boolean =>
  a !== null && b !== null && a.total === b.total
  && a.files.length === b.files.length && a.files.every((f, i) => f === b.files[i]);

/** The stored baseline when it carries the measured stamp and is well-formed, else `null`. */
function measuredBaseline(raw: unknown): MeasuredBaseline | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.measured !== true || r.schemaVersion !== SCHEMA_VERSION) return null;
  const t = r.testExecution as Record<string, unknown> | undefined;
  if (!t || typeof t !== 'object') return null;
  if (!isNonNegative(t.avgTestDurationMs) || !isNonNegative(t.totalDurationMs)
    || typeof t.samples !== 'number' || !Number.isInteger(t.samples) || t.samples < 1
    || typeof t.lastRunId !== 'string') return null;
  return {
    measured: true,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : '',
    testExecution: {
      avgTestDurationMs: t.avgTestDurationMs,
      totalDurationMs: t.totalDurationMs,
      samples: t.samples,
      lastRunId: t.lastRunId,
      testSet: parseTestSet(t.testSet),
    },
  };
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

    const current = await this.collectMeasuredRun(context);
    const stored = await context.memory.get<unknown>(BASELINE_KEY);
    const baseline = measuredBaseline(stored);
    const baselineStatus = this.baselineStatus(stored, baseline);
    if (baselineStatus === 'legacy-ignored') {
      context.logger.info('Ignoring a performance:baseline without the measured stamp (written by <= 3.15.6)');
    } else if (baselineStatus === 'invalid-ignored') {
      context.logger.warn('Ignoring a malformed measured performance:baseline');
    }

    let anomalies: PerformanceAnomaly[] = [];
    let compared = false;
    if (!current) {
      findings.push({
        type: 'performance-unmeasured',
        severity: 'info',
        domain: 'test-execution',
        title: 'Performance Baseline Unmeasured',
        description: 'No recorded test run backs the current testsPassing evidence, so no timing was stored or ' +
          'compared. Run the test suite (test_execute_parallel, or `aqe test execute`) to start tracking. ' +
          'Build and resource figures are not measured by AQE.',
      });
    } else if (baseline?.testExecution.lastRunId === current.runId) {
      // The same run was already blended in on an earlier tick.
      context.logger.debug('Latest measured run already in the performance baseline', { runId: current.runId });
    } else {
      if (baseline && sameTestSet(baseline.testExecution.testSet, current.testSet)) {
        compared = true;
        anomalies = this.detectAnomalies(current, baseline);
        this.analyzeAnomalies(anomalies, findings, recommendations);
      }
      await context.memory.set(BASELINE_KEY, this.nextBaseline(current, compared ? baseline : null));
      await this.appendHistory(context, current);
    }

    const healthScore = this.calculateHealthScore(anomalies);
    context.logger.info('Performance baseline tracking complete', {
      healthScore,
      measured: current !== null,
      baselineStatus,
      anomaliesDetected: anomalies.length,
    });

    return this.createResult(
      Date.now() - startTime,
      {
        itemsAnalyzed: compared ? 2 : 0,
        issuesFound: anomalies.length,
        healthScore,
        trend: anomalies.length > 0 ? 'degrading' : 'stable',
        domainMetrics: {
          baselineStatus,
          avgTestDuration: current ? `${round(current.avgTestDurationMs)}ms` : 'unmeasured',
          totalTestDuration: current ? `${round(current.totalDurationMs)}ms` : 'unmeasured',
          compileDuration: 'unmeasured',
          bundleSize: 'unmeasured',
          peakMemory: 'unmeasured',
          anomalies: anomalies.length,
        },
      },
      findings,
      recommendations
    );
  }

  private baselineStatus(stored: unknown, baseline: MeasuredBaseline | null): BaselineStatus {
    if (baseline) return 'measured';
    if (stored === undefined || stored === null) return 'none';
    const stamped = typeof stored === 'object' && (stored as Record<string, unknown>).measured === true;
    return stamped ? 'invalid-ignored' : 'legacy-ignored';
  }

  /**
   * #1043: the run behind the latest usable testsPassing evidence, with its
   * recorded wall time and test count. `null` when there is no such evidence
   * or the run's result was not recorded.
   */
  private async collectMeasuredRun(context: WorkerContext): Promise<MeasuredRunTiming | null> {
    const evidence = await readQualityEvidenceRecord(context.memory, 'testsPassing');
    if (!evidence?.runId) return null;
    const run = await context.memory.get<Record<string, unknown>>(`test-run:${evidence.runId}`, {
      namespace: 'test-execution',
    });
    if (!run || typeof run !== 'object') return null;
    const { total, duration } = run;
    if (typeof total !== 'number' || !Number.isInteger(total) || total <= 0 || !isNonNegative(duration)) return null;
    return {
      measured: true,
      runId: evidence.runId,
      measuredAt: evidence.measuredAt,
      totalDurationMs: duration,
      testCount: total,
      avgTestDurationMs: duration / total,
      testSet: parseTestSet({ total, files: run.testFiles }),
    };
  }

  /**
   * Compare a measured run with the measured baseline of the same test set.
   * The recorded duration is the run's wall time; per-test time across
   * different test sets would mostly measure runner overhead (#1028 N1).
   */
  private detectAnomalies(current: MeasuredRunTiming, baseline: MeasuredBaseline): PerformanceAnomaly[] {
    const anomalies: PerformanceAnomaly[] = [];
    const check = (metric: PerformanceAnomaly['metric'], value: number, base: number) => {
      if (base <= 0) return;
      const ratio = value / base;
      if (ratio > DURATION_THRESHOLD) {
        anomalies.push({
          metric,
          currentValue: round(value),
          baselineValue: round(base),
          deviationPercent: (ratio - 1) * 100,
          severity: ratio > 1.5 ? 'high' : 'medium',
        });
      }
    };
    check('avgTestDuration', current.avgTestDurationMs, baseline.testExecution.avgTestDurationMs);
    check('totalTestDuration', current.totalDurationMs, baseline.testExecution.totalDurationMs);
    return anomalies;
  }

  private analyzeAnomalies(
    anomalies: PerformanceAnomaly[],
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    for (const anomaly of anomalies) {
      findings.push({
        type: 'performance-anomaly-test',
        severity: anomaly.severity,
        domain: 'test-execution',
        title: `Performance Anomaly: ${this.formatMetricName(anomaly.metric)}`,
        description: `${this.formatMetricName(anomaly.metric)} is ${anomaly.deviationPercent.toFixed(1)}% above the measured baseline`,
        context: {
          currentValue: anomaly.currentValue,
          baselineValue: anomaly.baselineValue,
          deviationPercent: anomaly.deviationPercent.toFixed(1),
        },
      });
    }

    if (anomalies.length > 0) {
      recommendations.push({
        priority: anomalies.some(a => a.severity === 'high') ? 'p1' : 'p2',
        domain: 'test-execution',
        action: 'Investigate Test Performance Degradation',
        description: 'Test execution times have increased. Review for slow tests or infrastructure issues.',
        estimatedImpact: 'medium',
        effort: 'medium',
        autoFixable: false,
      });
    }
  }

  private formatMetricName(metric: PerformanceAnomaly['metric']): string {
    return metric === 'avgTestDuration' ? 'Average Test Duration' : 'Total Test Duration';
  }

  /** Blend a measured run into a comparable baseline, or start a new one from it. */
  private nextBaseline(current: MeasuredRunTiming, comparable: MeasuredBaseline | null): MeasuredBaseline {
    const prev = comparable?.testExecution;
    const blend = (base: number, value: number) => base * (1 - EMA_ALPHA) + value * EMA_ALPHA;
    return {
      measured: true,
      schemaVersion: SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      testExecution: {
        avgTestDurationMs: prev ? round(blend(prev.avgTestDurationMs, current.avgTestDurationMs)) : current.avgTestDurationMs,
        totalDurationMs: prev ? round(blend(prev.totalDurationMs, current.totalDurationMs)) : current.totalDurationMs,
        samples: prev ? prev.samples + 1 : 1,
        lastRunId: current.runId,
        testSet: current.testSet,
      },
    };
  }

  private async appendHistory(context: WorkerContext, run: MeasuredRunTiming): Promise<void> {
    const stored = await context.memory.get<unknown[]>(HISTORY_KEY);
    const history: unknown[] = Array.isArray(stored) ? stored : [];
    history.push(run);
    while (history.length > MAX_HISTORY) history.shift();
    await context.memory.set(HISTORY_KEY, history);
  }

  private calculateHealthScore(anomalies: PerformanceAnomaly[]): number {
    let score = 100;
    for (const anomaly of anomalies) {
      const basePenalty = anomaly.severity === 'high' ? 15 : 8;
      score -= basePenalty + Math.min(10, anomaly.deviationPercent / 10);
    }
    return Math.max(0, Math.round(score));
  }
}
