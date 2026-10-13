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
  /**
   * The test run this figure came from, when it came from one (#1027 NB1).
   * Coverage and testsPassing written from one run share the runId.
   */
  runId?: string;
  /** Whether that run's tests passed (#1027 NB1). */
  runStatus?: 'passed' | 'failed';
}

/** Metadata of an evidence write; `runId`/`runStatus` scope it to one test run. */
export interface QualityEvidenceMetadata {
  measuredAt: string;
  source: string;
  runId?: string;
  runStatus?: 'passed' | 'failed';
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
  metadata: QualityEvidenceMetadata,
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
      ...(metadata.runId ? { runId: metadata.runId } : {}),
      ...(metadata.runStatus ? { runStatus: metadata.runStatus } : {}),
    };
    await memory.set(evidenceKey(metric), record, {
      namespace: QUALITY_EVIDENCE_NAMESPACE,
      persist: true,
    });
  }
}

/** Test counts of one run. */
export interface TestRunCounts {
  passed: number;
  failed: number;
  skipped?: number;
}

/**
 * testsPassing as `aqe test execute` has always computed it: passed over all
 * tests, skipped included; a run with no tests is 0 (#1027 NB1: one formula).
 */
export function testsPassingPercent(run: TestRunCounts): number {
  const total = run.passed + run.failed + (run.skipped ?? 0);
  return total > 0 ? (run.passed / total) * 100 : 0;
}

/**
 * Record the evidence of ONE test run (#1027 NB1): its testsPassing and, when
 * it measured coverage, its coverage — both stamped with the same runId and
 * runStatus. The single writer for `aqe test execute`, test_execute_parallel
 * (TestExecutorService) and the coverage auto-run, so coverage from a failing
 * run can never sit next to a stale testsPassing from an earlier run.
 */
export async function writeTestRunEvidence(
  memory: MemoryBackend,
  run: TestRunCounts & { runId: string },
  options: { source: string; coverage?: number; measuredAt?: string },
): Promise<void> {
  const runStatus: 'passed' | 'failed' = run.failed > 0 ? 'failed' : 'passed';
  const metadata: QualityEvidenceMetadata = {
    measuredAt: options.measuredAt ?? new Date().toISOString(),
    source: options.source,
    runId: run.runId,
    runStatus,
  };
  await writeQualityEvidence(memory, {
    testsPassing: testsPassingPercent(run),
    ...(typeof options.coverage === 'number' && Number.isFinite(options.coverage) ? { coverage: options.coverage } : {}),
  }, metadata);
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
  const valid: Partial<Record<QualityMetricName, QualityEvidenceRecord>> = {};

  for (const metric of QUALITY_METRICS) {
    const record = await memory.get<QualityEvidenceRecord>(evidenceKey(metric), {
      namespace: QUALITY_EVIDENCE_NAMESPACE,
    });
    try {
      validateRecord(record, metric, now, maxAgeMs);
      values[metric] = record.value;
      valid[metric] = record;
    } catch (error) {
      problems.push({ metric, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  // #1027 NB1: coverage measured in a run whose tests FAILED is evidence only
  // next to the testsPassing of that same run — never next to a stale figure
  // from an earlier (passing) run, which would let the gate pass.
  const coverage = valid.coverage;
  if (coverage?.runStatus === 'failed' && (!coverage.runId || valid.testsPassing?.runId !== coverage.runId)) {
    delete values.coverage;
    problems.push({
      metric: 'coverage',
      reason: 'Measured coverage comes from a run with failing tests, but no testsPassing evidence '
        + 'from that same run was recorded. Re-run the test suite.',
    });
  }
  return { values, problems };
}

/**
 * #1028: the latest record of ONE metric when it is usable evidence — the same
 * validation (schema, metric, finite value, source, fresh measuredAt) the gate
 * applies — or `null`. Unlike {@link inspectQualityEvidence} it returns the
 * record, so a reader can follow its `runId` to the run it came from.
 */
export async function readQualityEvidenceRecord(
  memory: Pick<MemoryBackend, 'get'>,
  metric: QualityMetricName,
  options: { now?: number; maxAgeMs?: number } = {},
): Promise<QualityEvidenceRecord | null> {
  const record = await memory.get<QualityEvidenceRecord>(evidenceKey(metric), {
    namespace: QUALITY_EVIDENCE_NAMESPACE,
  });
  try {
    validateRecord(record, metric, options.now ?? Date.now(), options.maxAgeMs ?? DEFAULT_QUALITY_EVIDENCE_MAX_AGE_MS);
    return record;
  } catch {
    return null;
  }
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
