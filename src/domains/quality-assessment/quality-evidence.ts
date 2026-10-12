import type { MemoryBackend } from '../../kernel/interfaces.js';

export const QUALITY_EVIDENCE_NAMESPACE = 'quality-assessment';
export const DEFAULT_QUALITY_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const QUALITY_METRICS = [
  'coverage',
  'testsPassing',
  'criticalBugs',
  'codeSmells',
  'securityVulnerabilities',
  'technicalDebt',
  'duplications',
] as const;

export type QualityMetricName = typeof QUALITY_METRICS[number];
export type QualityEvidenceValues = Record<QualityMetricName, number>;

export interface QualityEvidenceRecord {
  schemaVersion: 1;
  metric: QualityMetricName;
  value: number;
  measuredAt: string;
  source: string;
}

export interface QualityThreshold {
  direction: 'min' | 'max';
  value: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export const DEFAULT_QUALITY_THRESHOLDS: Record<QualityMetricName, QualityThreshold> = {
  coverage: { direction: 'min', value: 80, severity: 'high' },
  testsPassing: { direction: 'min', value: 95, severity: 'critical' },
  criticalBugs: { direction: 'max', value: 0, severity: 'critical' },
  codeSmells: { direction: 'max', value: 20, severity: 'medium' },
  securityVulnerabilities: { direction: 'max', value: 0, severity: 'critical' },
  technicalDebt: { direction: 'max', value: 5, severity: 'medium' },
  duplications: { direction: 'max', value: 5, severity: 'low' },
};

export interface EvaluatedQualityCheck {
  name: QualityMetricName;
  passed: boolean;
  value: number;
  threshold: number;
  direction: 'min' | 'max';
  severity: QualityThreshold['severity'];
}

function evidenceKey(metric: QualityMetricName): string {
  return `quality-evidence:${metric}:latest`;
}

function parseMeasuredAt(measuredAt: unknown, now: number, maxAgeMs: number): number {
  if (typeof measuredAt !== 'string') {
    throw new Error('Measured quality evidence is malformed: measuredAt is required.');
  }
  const timestamp = Date.parse(measuredAt);
  if (!Number.isFinite(timestamp)) {
    throw new Error('Measured quality evidence is malformed: measuredAt is invalid.');
  }
  if (timestamp > now + 60_000) {
    throw new Error('Measured quality evidence is malformed: measuredAt is in the future.');
  }
  if (now - timestamp > maxAgeMs) {
    throw new Error('Measured quality evidence is stale. Run the relevant quality analyzers again.');
  }
  return timestamp;
}

function validateRecord(
  record: unknown,
  metric: QualityMetricName,
  now: number,
  maxAgeMs: number,
): asserts record is QualityEvidenceRecord {
  if (!record || typeof record !== 'object') {
    throw new Error(`No measured quality evidence found for ${metric}.`);
  }
  const candidate = record as Partial<QualityEvidenceRecord>;
  if (
    candidate.schemaVersion !== 1
    || candidate.metric !== metric
    || !Number.isFinite(candidate.value)
    || candidate.value! < 0
    || typeof candidate.source !== 'string'
    || candidate.source.trim().length === 0
  ) {
    throw new Error(`Measured quality evidence for ${metric} is malformed or incomplete.`);
  }
  parseMeasuredAt(candidate.measuredAt, now, maxAgeMs);
}

export async function writeQualityEvidence(
  memory: MemoryBackend,
  values: Partial<QualityEvidenceValues>,
  metadata: { measuredAt: string; source: string },
): Promise<void> {
  const now = Date.now();
  parseMeasuredAt(metadata.measuredAt, now, Number.POSITIVE_INFINITY);
  if (metadata.source.trim().length === 0) {
    throw new Error('Quality evidence source is required.');
  }

  for (const metric of QUALITY_METRICS) {
    const value = values[metric];
    if (value === undefined) continue;
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Quality evidence value for ${metric} must be a non-negative finite number.`);
    }
    const record: QualityEvidenceRecord = {
      schemaVersion: 1,
      metric,
      value,
      measuredAt: metadata.measuredAt,
      source: metadata.source,
    };
    await memory.set(evidenceKey(metric), record, {
      namespace: QUALITY_EVIDENCE_NAMESPACE,
      persist: true,
    });
  }
}

/** #996: the single status word for "a verdict cannot be reached on this evidence". */
export const INSUFFICIENT_EVIDENCE = 'insufficient-evidence' as const;

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

/** Why a canonical metric has no usable evidence. */
export interface UnusableQualityEvidence {
  metric: QualityMetricName;
  reason: string;
}

/**
 * #996: thrown when the measured gate cannot be evaluated. The message is the
 * first problem found (unchanged wording); `unmeasured` names every metric
 * whose record is absent, stale, future-dated or malformed.
 */
export class InsufficientQualityEvidenceError extends Error {
  readonly status = INSUFFICIENT_EVIDENCE;
  readonly unmeasured: QualityMetricName[];
  readonly problems: UnusableQualityEvidence[];

  constructor(problems: UnusableQualityEvidence[]) {
    super(problems[0]?.reason ?? 'Measured quality evidence is unavailable.');
    this.name = 'InsufficientQualityEvidenceError';
    this.problems = problems;
    this.unmeasured = problems.map((p) => p.metric);
  }

  /** Structured, non-passing description of the gate that could not run. */
  toDetails(): {
    passed: false; status: typeof INSUFFICIENT_EVIDENCE; evidenceStatus: typeof INSUFFICIENT_EVIDENCE;
    unmeasured: QualityMetricName[]; gateEvaluated: false; recommendations: string[];
  } {
    return {
      passed: false,
      status: INSUFFICIENT_EVIDENCE,
      evidenceStatus: INSUFFICIENT_EVIDENCE,
      unmeasured: this.unmeasured,
      gateEvaluated: false,
      recommendations: describeMissingMetrics(this.unmeasured),
    };
  }
}

/**
 * Inspect every canonical metric with the same validation, collecting each
 * absent, stale, future-dated or malformed record instead of stopping at the first.
 */
export async function inspectQualityEvidence(
  memory: MemoryBackend,
  options: { now?: number; maxAgeMs?: number } = {},
): Promise<{ values: Partial<QualityEvidenceValues>; problems: UnusableQualityEvidence[] }> {
  const now = options.now ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_QUALITY_EVIDENCE_MAX_AGE_MS;
  const values: Partial<QualityEvidenceValues> = {};
  const problems: UnusableQualityEvidence[] = [];

  for (const metric of QUALITY_METRICS) {
    const record = await memory.get<QualityEvidenceRecord>(evidenceKey(metric), {
      namespace: QUALITY_EVIDENCE_NAMESPACE,
    });
    try {
      validateRecord(record, metric, now, maxAgeMs);
      values[metric] = record.value;
    } catch (error) {
      problems.push({ metric, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { values, problems };
}

export async function loadQualityEvidence(
  memory: MemoryBackend,
  options: { now?: number; maxAgeMs?: number } = {},
): Promise<QualityEvidenceValues> {
  const { values, problems } = await inspectQualityEvidence(memory, options);
  if (problems.length > 0) throw new InsufficientQualityEvidenceError(problems);
  return values as QualityEvidenceValues;
}

/** Threshold overrides a caller or user configuration may apply to the canonical defaults. */
export interface QualityThresholdOverrides {
  coverage?: number;
}

/**
 * The single source of effective quality thresholds: canonical defaults with
 * any override applied. Used by the measured gate and by static analysis
 * (#996) so the two never disagree.
 */
export function resolveQualityThresholds(
  overrides: QualityThresholdOverrides = {},
): Record<QualityMetricName, QualityThreshold> {
  if (overrides.coverage !== undefined && (
    !Number.isFinite(overrides.coverage) || overrides.coverage < 0 || overrides.coverage > 100
  )) {
    throw new Error('Coverage quality threshold must be a finite number between 0 and 100.');
  }
  return {
    ...DEFAULT_QUALITY_THRESHOLDS,
    ...(overrides.coverage !== undefined
      ? { coverage: { ...DEFAULT_QUALITY_THRESHOLDS.coverage, value: overrides.coverage } }
      : {}),
  };
}

export function evaluateQualityEvidence(
  values: QualityEvidenceValues,
  thresholds: QualityThresholdOverrides = {},
): { passed: boolean; checks: EvaluatedQualityCheck[]; recommendations: string[] } {
  const effective = resolveQualityThresholds(thresholds);
  const checks = QUALITY_METRICS.map((name) => {
    const threshold = effective[name];
    const value = values[name];
    return {
      name,
      value,
      threshold: threshold.value,
      direction: threshold.direction,
      severity: threshold.severity,
      passed: threshold.direction === 'min' ? value >= threshold.value : value <= threshold.value,
    };
  });
  return {
    passed: checks.every((check) => check.passed),
    checks,
    recommendations: checks
      .filter((check) => !check.passed)
      .map((check) => `${check.name} failed its measured ${check.direction} threshold.`),
  };
}
