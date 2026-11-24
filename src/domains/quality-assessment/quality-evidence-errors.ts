/**
 * Insufficient-evidence vocabulary of the measured quality gate (#996, #1474).
 *
 * @module domains/quality-assessment/quality-evidence-errors
 */

import type { QualityEvidenceCandidate } from './evidence-candidate.js';

/** #996: the single status word for "a verdict cannot be reached on this evidence". */
export const INSUFFICIENT_EVIDENCE = 'insufficient-evidence' as const;

/** Metric names of the measured gate (kept as a string here to avoid an import cycle). */
type MetricName = 'coverage' | 'testsPassing' | 'criticalBugs' | 'codeSmells'
  | 'securityVulnerabilities' | 'technicalDebt' | 'duplications';

/**
 * #1474: why a metric has no evidence the gate may use for the requested candidate.
 * - `missing`: nothing was ever recorded for this metric
 * - `legacy-unbound`: only a pre-#1474 record exists, bound to no candidate
 * - `mismatched`: the latest receipt belongs to a different candidate
 * - `stale` / `future-dated` / `malformed`: the candidate's own receipt is unusable
 * - `candidate-unavailable`: the requested candidate itself cannot be identified
 * - `unpaired-failed-run`: failing-run coverage without that run's testsPassing (#1027)
 */
export type QualityEvidenceProblemCode =
  | 'missing' | 'legacy-unbound' | 'mismatched' | 'stale' | 'future-dated' | 'malformed'
  | 'candidate-unavailable' | 'unpaired-failed-run';

/** Why a canonical metric has no usable evidence. */
export interface UnusableQualityEvidence {
  metric: MetricName;
  code: QualityEvidenceProblemCode;
  reason: string;
  /** The receipt that was rejected, when one was read. */
  receiptId?: string;
}

/** #996: what to run to measure a metric that has no usable evidence. */
// Advice names only producers a user can actually run. Metrics with no
// exposed producer say so instead of pointing at an unreachable tool.
const NO_EXPOSED_PRODUCER = 'no MCP tool or CLI command records it yet, so supply it from your own measurement';
const MISSING_METRIC_ADVICE: Record<string, string> = {
  coverage: 'run the tests with coverage instrumentation enabled so measured line coverage is recorded '
    + '(a static estimate is not measured coverage)',
  testsPassing: 'run the test suite (test_execute_parallel, or `aqe test execute`)',
  // The static analyzer has no security measurement; a scan reports findings separately.
  security: 'static analysis never measures security; drop it from metrics and use '
    + 'security_scan_comprehensive (or `aqe security`) for findings',
  securityVulnerabilities: `a measured vulnerability count is required; ${NO_EXPOSED_PRODUCER}`,
  criticalBugs: `a measured critical-bug count is required; ${NO_EXPOSED_PRODUCER}`,
  codeSmells: `a measured code-smell count is required; ${NO_EXPOSED_PRODUCER}`,
  technicalDebt: `a measured technical-debt ratio is required; ${NO_EXPOSED_PRODUCER}`,
  duplications: `a measured duplication percentage is required; ${NO_EXPOSED_PRODUCER}`,
  complexity: 'make sure the target contains readable TypeScript/JavaScript source the analyzer can parse',
  maintainability: 'make sure the target contains readable TypeScript/JavaScript source the analyzer can parse',
  testability: 'make sure the target contains readable TypeScript/JavaScript source the analyzer can parse',
  duplication: 'make sure the target contains readable TypeScript/JavaScript source the analyzer can parse',
};

/** #996: one recommendation per unmeasured metric, naming what to run. */
export function describeMissingMetrics(unmeasured: readonly string[]): string[] {
  return unmeasured.map((metric) =>
    `Insufficient evidence: ${metric} not measured — ${MISSING_METRIC_ADVICE[metric] ?? 'measure it'}.`);
}

/**
 * #996: thrown when the measured gate cannot be evaluated. The message is the
 * first problem found; `unmeasured` names every metric without usable evidence
 * and `problems` gives each one's structured reason (#1474).
 */
export class InsufficientQualityEvidenceError extends Error {
  readonly status = INSUFFICIENT_EVIDENCE;
  readonly unmeasured: MetricName[];
  readonly problems: UnusableQualityEvidence[];
  readonly candidate?: QualityEvidenceCandidate;

  constructor(problems: UnusableQualityEvidence[], candidate?: QualityEvidenceCandidate) {
    super(problems[0]?.reason ?? 'Measured quality evidence is unavailable.');
    this.name = 'InsufficientQualityEvidenceError';
    this.problems = problems;
    this.candidate = candidate;
    this.unmeasured = [...new Set(problems.map((p) => p.metric))];
  }

  /** Structured, non-passing description of the gate that could not run. */
  toDetails(): {
    passed: false; status: typeof INSUFFICIENT_EVIDENCE; evidenceStatus: typeof INSUFFICIENT_EVIDENCE;
    unmeasured: MetricName[]; gateEvaluated: false; recommendations: string[];
    problems: UnusableQualityEvidence[]; candidate?: QualityEvidenceCandidate;
  } {
    return {
      passed: false,
      status: INSUFFICIENT_EVIDENCE,
      evidenceStatus: INSUFFICIENT_EVIDENCE,
      unmeasured: this.unmeasured,
      gateEvaluated: false,
      recommendations: describeMissingMetrics(this.unmeasured),
      problems: this.problems,
      ...(this.candidate ? { candidate: this.candidate } : {}),
    };
  }
}
