/**
 * Agentic QE v3 - Quality Gate Worker
 * ADR-014: Background Workers for QE Monitoring
 *
 * Continuously evaluates the measured quality gate and tracks its verdict.
 *
 * #1043: the gate is the canonical measured gate — the same evidence
 * validation (`inspectQualityEvidence`) and thresholds
 * (`evaluateQualityEvidence` / `resolveQualityThresholds`) the quality_assess
 * tool uses. When any metric lacks usable evidence (absent, stale, malformed)
 * the gate is not evaluated: no verdict is stored and an info finding names the
 * unmeasured metrics. A status without the measured stamp (the invented one
 * written by <= 3.15.6) is ignored and replaced by the next measured verdict.
 *
 * #1474: the worker judges the candidate of the checkout it runs in. Only
 * evidence bound to that candidate counts; an unavailable candidate (no Git
 * work tree) is insufficient evidence. A stored verdict records the candidate,
 * the receipts it used and the effective thresholds.
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
  INSUFFICIENT_EVIDENCE,
  QUALITY_METRICS,
  describeMissingMetrics,
  describeVerdictProvenance,
  evaluateQualityEvidence,
  inspectQualityEvidence,
  type EvaluatedQualityCheck,
  type QualityEvidenceCandidate,
  type QualityEvidenceReceiptRef,
  type QualityEvidenceValues,
  type QualityMetricName,
  type QualityThreshold,
} from '../../domains/quality-assessment/quality-evidence.js';

const CONFIG: WorkerConfig = {
  id: 'quality-gate',
  name: 'Quality Gate Evaluator',
  description: 'Continuously evaluates quality gates and release readiness across all quality dimensions',
  intervalMs: 5 * 60 * 1000, // 5 minutes
  priority: 'critical',
  targetDomains: ['quality-assessment'],
  enabled: true,
  timeoutMs: 120000,
  retryCount: 2,
  retryDelayMs: 5000,
};

const CURRENT_KEY = 'quality-gate:current';
const HISTORY_KEY = 'quality-gate:history';
/** 2 (#1474): verdicts carry candidate, receipts and thresholds. */
const SCHEMA_VERSION = 2;
const MAX_HISTORY = 100;

/** A gate verdict on measured evidence (#1043), stored with the stamp. */
interface MeasuredGateStatus {
  measured: true;
  schemaVersion: typeof SCHEMA_VERSION;
  evaluatedAt: string;
  passed: boolean;
  passedChecks: number;
  failedChecks: number;
  checks: EvaluatedQualityCheck[];
  candidate: QualityEvidenceCandidate;
  receipts: Record<QualityMetricName, QualityEvidenceReceiptRef>;
  thresholds: Record<QualityMetricName, QualityThreshold>;
}

/** The stored status when it is a measured verdict (current or v1), else `null`. */
function measuredStatus(raw: unknown): MeasuredGateStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.measured !== true || (r.schemaVersion !== SCHEMA_VERSION && r.schemaVersion !== 1) || typeof r.passed !== 'boolean'
    || !Array.isArray(r.checks)) return null;
  return r as unknown as MeasuredGateStatus;
}

const comparator = (check: EvaluatedQualityCheck) => (check.direction === 'min' ? '>=' : '<=');

export class QualityGateWorker extends BaseWorker {
  constructor() {
    super(CONFIG);
  }

  protected async doExecute(context: WorkerContext): Promise<WorkerResult> {
    const startTime = Date.now();
    context.logger.info('Starting quality gate evaluation');

    const findings: WorkerFinding[] = [];
    const recommendations: WorkerRecommendation[] = [];

    const { values, problems, candidate, receipts } = await inspectQualityEvidence(context.memory);
    const measuredValues = Object.fromEntries(
      QUALITY_METRICS.map((m) => [m, values[m] ?? 'unmeasured'])
    ) as Record<string, number | string>;

    if (problems.length > 0) {
      const unmeasured = problems.map((p) => p.metric);
      findings.push({
        type: 'quality-gate-insufficient-evidence',
        severity: 'info',
        domain: 'quality-assessment',
        title: 'Quality Gate Not Evaluated: Insufficient Evidence',
        description: `${unmeasured.length} of ${QUALITY_METRICS.length} gate metrics have no usable measured evidence ` +
          `(${unmeasured.join(', ')}), so no verdict was reached.`,
        context: { status: INSUFFICIENT_EVIDENCE, unmeasured, problems, candidate },
      });
      for (const advice of describeMissingMetrics(unmeasured)) {
        recommendations.push({
          priority: 'p3',
          domain: 'quality-assessment',
          action: 'Record Measured Quality Evidence',
          description: advice,
          estimatedImpact: 'medium',
          effort: 'low',
          autoFixable: false,
        });
      }
      // #1474: an earlier verdict (possibly another candidate's PASS) must not
      // stand as the current one; replace it with this candidate's insufficient status.
      if (await context.memory.get<unknown>(CURRENT_KEY) !== undefined) {
        await context.memory.set(CURRENT_KEY, {
          measured: false, status: INSUFFICIENT_EVIDENCE, schemaVersion: SCHEMA_VERSION,
          evaluatedAt: new Date().toISOString(), passed: false, candidate, unmeasured, problems,
        });
      }
      context.logger.info('Quality gate evaluation complete', { status: INSUFFICIENT_EVIDENCE, unmeasured });
      return this.createResult(
        Date.now() - startTime,
        {
          itemsAnalyzed: 0,
          issuesFound: 0,
          healthScore: 100,
          trend: 'stable',
          domainMetrics: {
            gateStatus: INSUFFICIENT_EVIDENCE,
            gatePassed: 'unmeasured',
            releaseReady: 'unmeasured',
            unmeasuredMetrics: unmeasured.length,
            ...measuredValues,
          },
        },
        findings,
        recommendations
      );
    }

    const evaluation = evaluateQualityEvidence(values as QualityEvidenceValues);
    const failed = evaluation.checks.filter((c) => !c.passed);
    const status: MeasuredGateStatus = {
      measured: true,
      schemaVersion: SCHEMA_VERSION,
      evaluatedAt: new Date().toISOString(),
      passed: evaluation.passed,
      passedChecks: evaluation.checks.length - failed.length,
      failedChecks: failed.length,
      checks: evaluation.checks,
      ...describeVerdictProvenance({
        candidate, receipts: receipts as Record<QualityMetricName, QualityEvidenceReceiptRef>,
      }),
    };

    this.analyzeGateResults(status, findings, recommendations);
    await this.compareToPrevious(context, status, findings);

    await context.memory.set(CURRENT_KEY, status);
    await context.memory.set('quality-gate:lastCheck', status.evaluatedAt);
    const stored = await context.memory.get<unknown[]>(HISTORY_KEY);
    const history: unknown[] = Array.isArray(stored) ? stored : [];
    history.push(status);
    while (history.length > MAX_HISTORY) history.shift();
    await context.memory.set(HISTORY_KEY, history);

    const healthScore = this.calculateHealthScore(status);
    context.logger.info('Quality gate evaluation complete', {
      healthScore,
      passed: status.passed,
      failedChecks: status.failedChecks,
    });

    return this.createResult(
      Date.now() - startTime,
      {
        itemsAnalyzed: status.checks.length,
        issuesFound: status.failedChecks,
        healthScore,
        trend: 'stable',
        domainMetrics: {
          gateStatus: 'evaluated',
          gatePassed: status.passed ? 'YES' : 'NO',
          releaseReady: status.passed ? 'YES' : 'NO',
          passedChecks: status.passedChecks,
          failedChecks: status.failedChecks,
          ...measuredValues,
        },
      },
      findings,
      recommendations
    );
  }

  private analyzeGateResults(
    status: MeasuredGateStatus,
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    const failed = status.checks.filter((c) => !c.passed);
    for (const check of failed) {
      findings.push({
        type: 'quality-gate-failure',
        severity: check.severity,
        domain: 'quality-assessment',
        title: `Quality Gate Failed: ${check.name}`,
        description: `Measured ${check.name} is ${check.value}, threshold is ${comparator(check)} ${check.threshold}`,
        context: {
          metric: check.name,
          value: check.value,
          threshold: check.threshold,
          direction: check.direction,
        },
      });
    }

    if (failed.length > 0) {
      findings.push({
        type: 'release-blocked',
        severity: failed.some((c) => c.severity === 'critical') ? 'critical' : 'high',
        domain: 'quality-assessment',
        title: 'Release Blocked',
        description: `${failed.length} measured quality checks fail the gate`,
        context: { failingMetrics: failed.map((c) => c.name) },
      });
      recommendations.push({
        priority: 'p0',
        domain: 'quality-assessment',
        action: 'Resolve Failing Quality Checks',
        description: `Fix ${failed.map((c) => c.name).join(', ')} before proceeding with release.`,
        estimatedImpact: 'high',
        effort: 'medium',
        autoFixable: false,
      });
    }
  }

  /** Compare with the previous verdict — only a measured one (#1043). */
  private async compareToPrevious(
    context: WorkerContext,
    current: MeasuredGateStatus,
    findings: WorkerFinding[]
  ): Promise<void> {
    const previous = measuredStatus(await context.memory.get<unknown>(CURRENT_KEY));
    // #1474: a regression or improvement is only meaningful for the same candidate.
    if (!previous || previous.candidate?.id !== current.candidate.id) return;

    if (previous.passed && !current.passed) {
      findings.push({
        type: 'quality-gate-regression',
        severity: 'high',
        domain: 'quality-assessment',
        title: 'Quality Gate Regression',
        description: 'The measured quality gate was passing previously but is now failing',
        context: { previousEvaluatedAt: previous.evaluatedAt, currentFailedChecks: current.failedChecks },
      });
    }

    if (!previous.passed && current.passed) {
      findings.push({
        type: 'quality-gate-improvement',
        severity: 'info',
        domain: 'quality-assessment',
        title: 'Quality Gate Now Passing',
        description: 'The measured quality gate is now passing after previous failures',
        context: { previousEvaluatedAt: previous.evaluatedAt },
      });
    }
  }

  private calculateHealthScore(status: MeasuredGateStatus): number {
    if (status.checks.length === 0) return 100;
    let score = (status.passedChecks / status.checks.length) * 90;
    if (status.passed) score += 10;
    return Math.max(0, Math.min(100, Math.round(score)));
  }
}
