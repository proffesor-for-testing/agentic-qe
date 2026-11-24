import { randomUUID } from 'node:crypto';
import type { MemoryBackend } from '../../kernel/interfaces.js';
import {
  describeCandidate,
  isQualityEvidenceCandidate,
  resolveQualityEvidenceCandidate,
  type QualityEvidenceCandidate,
} from './evidence-candidate.js';
import {
  InsufficientQualityEvidenceError,
  type QualityEvidenceProblemCode,
  type UnusableQualityEvidence,
} from './quality-evidence-errors.js';

export {
  INSUFFICIENT_EVIDENCE,
  InsufficientQualityEvidenceError,
  describeMissingMetrics,
  type QualityEvidenceProblemCode,
  type UnusableQualityEvidence,
} from './quality-evidence-errors.js';
export { resolveQualityEvidenceCandidate, type QualityEvidenceCandidate } from './evidence-candidate.js';

export const QUALITY_EVIDENCE_NAMESPACE = 'quality-assessment';
export const DEFAULT_QUALITY_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Current evidence record format (#1474: candidate-bound receipts). */
export const QUALITY_EVIDENCE_SCHEMA_VERSION = 2;
/** Immutable receipts are kept 30 days (seconds, the StoreOptions.ttl unit). */
const RECEIPT_TTL_SECONDS = 30 * 24 * 60 * 60;

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

/**
 * One measurement receipt (#1474). It is bound, when it is recorded, to the
 * candidate the measurement describes, and carries an immutable receipt id.
 */
export interface QualityEvidenceRecord {
  schemaVersion: typeof QUALITY_EVIDENCE_SCHEMA_VERSION;
  receiptId: string;
  metric: QualityMetricName;
  value: number;
  measuredAt: string;
  source: string;
  /** The candidate (project + HEAD + dirty-tree fingerprint) observed at measurement time. */
  candidate: QualityEvidenceCandidate;
  /**
   * The test run this figure came from, when it came from one (#1027 NB1).
   * Coverage and testsPassing written from one run share the runId.
   */
  runId?: string;
  /** Whether that run's tests passed (#1027 NB1). */
  runStatus?: 'passed' | 'failed';
}

/** A record in the pre-#1474 format: no candidate, no receipt id. Never gate evidence. */
export type LegacyQualityEvidenceRecord = Omit<QualityEvidenceRecord, 'schemaVersion' | 'receiptId' | 'candidate'>
  & { schemaVersion: 1 };

/** Metadata of an evidence write; `runId`/`runStatus` scope it to one test run. */
export interface QualityEvidenceMetadata {
  measuredAt: string;
  source: string;
  runId?: string;
  runStatus?: 'passed' | 'failed';
  /** The measured candidate; resolved from the project checkout when omitted. */
  candidate?: QualityEvidenceCandidate;
}

/** Where a gate input came from: the receipt and the key it was read from. */
export interface QualityEvidenceReceiptRef {
  metric: QualityMetricName;
  receiptId: string;
  key: string;
  measuredAt: string;
  source: string;
  runId?: string;
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

/** Evidence of one candidate: subject-qualified, so another candidate's writes never land here. */
export function candidateEvidenceKey(candidateId: string, metric: QualityMetricName): string {
  return `quality-evidence:v2:${candidateId}:${metric}:latest`;
}
/** The most recent receipt of a metric for any candidate (diagnostics and trend readers). */
function latestEvidenceKey(metric: QualityMetricName): string {
  return `quality-evidence:v2:latest:${metric}`;
}
function receiptKey(receiptId: string): string {
  return `quality-evidence:receipt:${receiptId}`;
}
/** The pre-#1474 key: read only to report legacy, unbound evidence. */
function legacyEvidenceKey(metric: QualityMetricName): string {
  return `quality-evidence:${metric}:latest`;
}

class EvidenceProblem extends Error {
  constructor(readonly code: QualityEvidenceProblemCode, message: string) { super(message); }
}

function parseMeasuredAt(measuredAt: unknown, now: number, maxAgeMs: number): number {
  if (typeof measuredAt !== 'string') {
    throw new EvidenceProblem('malformed', 'Measured quality evidence is malformed: measuredAt is required.');
  }
  const timestamp = Date.parse(measuredAt);
  if (!Number.isFinite(timestamp)) {
    throw new EvidenceProblem('malformed', 'Measured quality evidence is malformed: measuredAt is invalid.');
  }
  if (timestamp > now + 60_000) {
    throw new EvidenceProblem('future-dated', 'Measured quality evidence is malformed: measuredAt is in the future.');
  }
  if (now - timestamp > maxAgeMs) {
    throw new EvidenceProblem('stale', 'Measured quality evidence is stale. Run the relevant quality analyzers again.');
  }
  return timestamp;
}

/** Shape, value and freshness checks shared by both record formats. */
function validateMeasurement(
  record: unknown, metric: QualityMetricName, version: 1 | 2, now: number, maxAgeMs: number,
): void {
  if (!record || typeof record !== 'object') {
    throw new EvidenceProblem('missing', `No measured quality evidence found for ${metric}.`);
  }
  const candidate = record as Partial<QualityEvidenceRecord>;
  if (
    candidate.schemaVersion !== version
    || candidate.metric !== metric
    || !Number.isFinite(candidate.value)
    || candidate.value! < 0
    || typeof candidate.source !== 'string'
    || candidate.source.trim().length === 0
    || (version === 2 && (typeof candidate.receiptId !== 'string' || !isQualityEvidenceCandidate(candidate.candidate)))
  ) {
    throw new EvidenceProblem('malformed', `Measured quality evidence for ${metric} is malformed or incomplete.`);
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
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      throw new Error(`Quality evidence value for ${metric} must be a non-negative finite number.`);
    }
  }
  // #1474: bind every record of this write to the candidate measured now.
  const candidate = metadata.candidate ?? resolveQualityEvidenceCandidate();
  const options = { namespace: QUALITY_EVIDENCE_NAMESPACE, persist: true };

  for (const metric of QUALITY_METRICS) {
    const value = values[metric];
    if (value === undefined) continue;
    const record: QualityEvidenceRecord = {
      schemaVersion: QUALITY_EVIDENCE_SCHEMA_VERSION,
      receiptId: randomUUID(),
      metric,
      value,
      measuredAt: metadata.measuredAt,
      source: metadata.source,
      candidate,
      ...(metadata.runId ? { runId: metadata.runId } : {}),
      ...(metadata.runStatus ? { runStatus: metadata.runStatus } : {}),
    };
    // Immutable receipt first, then the pointers that name it.
    await memory.set(receiptKey(record.receiptId), record, { ...options, ttl: RECEIPT_TTL_SECONDS });
    if (candidate.status === 'resolved') {
      await memory.set(candidateEvidenceKey(candidate.id, metric), record, options);
    }
    await memory.set(latestEvidenceKey(metric), record, options);
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
  options: { source: string; coverage?: number; measuredAt?: string; candidate?: QualityEvidenceCandidate },
): Promise<void> {
  const runStatus: 'passed' | 'failed' = run.failed > 0 ? 'failed' : 'passed';
  const metadata: QualityEvidenceMetadata = {
    measuredAt: options.measuredAt ?? new Date().toISOString(),
    source: options.source,
    runId: run.runId,
    runStatus,
    ...(options.candidate ? { candidate: options.candidate } : {}),
  };
  await writeQualityEvidence(memory, {
    testsPassing: testsPassingPercent(run),
    ...(typeof options.coverage === 'number' && Number.isFinite(options.coverage) ? { coverage: options.coverage } : {}),
  }, metadata);
}

export interface QualityEvidenceReadOptions {
  now?: number;
  maxAgeMs?: number;
  /** The candidate to judge; resolved from the project checkout when omitted. */
  candidate?: QualityEvidenceCandidate;
}

/** Inspection of one candidate's evidence set. */
export interface QualityEvidenceInspection {
  values: Partial<QualityEvidenceValues>;
  problems: UnusableQualityEvidence[];
  candidate: QualityEvidenceCandidate;
  receipts: Partial<Record<QualityMetricName, QualityEvidenceReceiptRef>>;
}

/** Why a candidate has no record of `metric`: mismatched, legacy-unbound or missing. */
async function diagnoseAbsent(
  memory: Pick<MemoryBackend, 'get'>, metric: QualityMetricName,
  candidate: QualityEvidenceCandidate & { status: 'resolved' },
): Promise<UnusableQualityEvidence> {
  const read = (key: string) => memory.get<unknown>(key, { namespace: QUALITY_EVIDENCE_NAMESPACE });
  const latest = await read(latestEvidenceKey(metric)) as Partial<QualityEvidenceRecord> | undefined;
  if (latest && isQualityEvidenceCandidate(latest.candidate) && latest.candidate.id !== candidate.id) {
    return {
      metric, code: 'mismatched',
      reason: `Measured quality evidence for ${metric} was recorded for candidate `
        + `${describeCandidate(latest.candidate)}, not the candidate being gated (${describeCandidate(candidate)}). `
        + 'Re-run the measurement on this checkout.',
      receiptId: typeof latest.receiptId === 'string' ? latest.receiptId : undefined,
    };
  }
  if (await read(legacyEvidenceKey(metric))) {
    return {
      metric, code: 'legacy-unbound',
      reason: `Measured quality evidence for ${metric} is legacy evidence not bound to any candidate `
        + '(recorded before evidence receipts were candidate-bound). Re-run the measurement to record a candidate-bound receipt.',
    };
  }
  return { metric, code: 'missing', reason: `No measured quality evidence found for ${metric}.` };
}

/**
 * #1474: inspect the evidence of ONE candidate. Every metric is read from that
 * candidate's own keys, so the set cannot mix receipts of different candidates;
 * each record's binding is re-checked. Absent, legacy-unbound, mismatched,
 * stale, future-dated and malformed evidence are all collected as problems.
 */
export async function inspectQualityEvidence(
  memory: Pick<MemoryBackend, 'get'>,
  options: QualityEvidenceReadOptions = {},
): Promise<QualityEvidenceInspection> {
  const now = options.now ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_QUALITY_EVIDENCE_MAX_AGE_MS;
  const candidate = options.candidate ?? resolveQualityEvidenceCandidate();
  const values: Partial<QualityEvidenceValues> = {};
  const problems: UnusableQualityEvidence[] = [];
  const receipts: Partial<Record<QualityMetricName, QualityEvidenceReceiptRef>> = {};

  if (candidate.status === 'unavailable') {
    for (const metric of QUALITY_METRICS) {
      problems.push({
        metric, code: 'candidate-unavailable',
        reason: `The candidate identity is unavailable: ${candidate.reason}. Measured evidence cannot be bound to it.`,
      });
    }
    return { values, problems, candidate, receipts };
  }

  const valid: Partial<Record<QualityMetricName, QualityEvidenceRecord>> = {};
  for (const metric of QUALITY_METRICS) {
    const key = candidateEvidenceKey(candidate.id, metric);
    const record = await memory.get<QualityEvidenceRecord>(key, { namespace: QUALITY_EVIDENCE_NAMESPACE });
    if (record === undefined || record === null) {
      problems.push(await diagnoseAbsent(memory, metric, candidate));
      continue;
    }
    try {
      validateMeasurement(record, metric, 2, now, maxAgeMs);
      if (record.candidate.id !== candidate.id) {
        throw new EvidenceProblem('mismatched',
          `Measured quality evidence for ${metric} is bound to candidate ${describeCandidate(record.candidate)}, `
          + `not ${describeCandidate(candidate)}.`);
      }
      values[metric] = record.value;
      valid[metric] = record;
      receipts[metric] = {
        metric, receiptId: record.receiptId, key, measuredAt: record.measuredAt, source: record.source,
        ...(record.runId ? { runId: record.runId } : {}),
      };
    } catch (error) {
      const code = error instanceof EvidenceProblem ? error.code : 'malformed';
      problems.push({
        metric, code, reason: error instanceof Error ? error.message : String(error),
        ...(typeof record.receiptId === 'string' ? { receiptId: record.receiptId } : {}),
      });
    }
  }

  // #1027 NB1: coverage measured in a run whose tests FAILED is evidence only
  // next to the testsPassing of that same run — never next to a stale figure
  // from an earlier (passing) run, which would let the gate pass.
  const coverage = valid.coverage;
  if (coverage?.runStatus === 'failed' && (!coverage.runId || valid.testsPassing?.runId !== coverage.runId)) {
    delete values.coverage;
    delete receipts.coverage;
    problems.push({
      metric: 'coverage',
      code: 'unpaired-failed-run',
      receiptId: coverage.receiptId,
      reason: 'Measured coverage comes from a run with failing tests, but no testsPassing evidence '
        + 'from that same run was recorded. Re-run the test suite.',
    });
  }
  return { values, problems, candidate, receipts };
}

/**
 * #1028: the latest record of ONE metric when it is usable evidence — the same
 * shape and freshness validation the gate applies — or `null`. It reads the
 * most recent receipt of any candidate (falling back to a legacy record), so
 * trend readers can follow its `runId`; it is not gate evidence.
 */
export async function readQualityEvidenceRecord(
  memory: Pick<MemoryBackend, 'get'>,
  metric: QualityMetricName,
  options: { now?: number; maxAgeMs?: number } = {},
): Promise<QualityEvidenceRecord | LegacyQualityEvidenceRecord | null> {
  const now = options.now ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_QUALITY_EVIDENCE_MAX_AGE_MS;
  const read = (key: string) => memory.get<QualityEvidenceRecord | LegacyQualityEvidenceRecord>(key, {
    namespace: QUALITY_EVIDENCE_NAMESPACE,
  });
  const latest = await read(latestEvidenceKey(metric));
  const [record, version] = latest ? [latest, 2 as const] : [await read(legacyEvidenceKey(metric)), 1 as const];
  try {
    validateMeasurement(record, metric, version, now, maxAgeMs);
    return record ?? null;
  } catch {
    return null;
  }
}

/** A coherent, candidate-bound evidence set that can be evaluated. */
export interface QualityEvidenceSet {
  values: QualityEvidenceValues;
  candidate: QualityEvidenceCandidate;
  receipts: Record<QualityMetricName, QualityEvidenceReceiptRef>;
}

/** #1474: load the requested candidate's evidence set, or throw InsufficientQualityEvidenceError. */
export async function loadQualityEvidenceSet(
  memory: Pick<MemoryBackend, 'get'>,
  options: QualityEvidenceReadOptions = {},
): Promise<QualityEvidenceSet> {
  const { values, problems, candidate, receipts } = await inspectQualityEvidence(memory, options);
  if (problems.length > 0) throw new InsufficientQualityEvidenceError(problems, candidate);
  return {
    values: values as QualityEvidenceValues,
    candidate,
    receipts: receipts as Record<QualityMetricName, QualityEvidenceReceiptRef>,
  };
}

export async function loadQualityEvidence(
  memory: Pick<MemoryBackend, 'get'>,
  options: QualityEvidenceReadOptions = {},
): Promise<QualityEvidenceValues> {
  return (await loadQualityEvidenceSet(memory, options)).values;
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

/**
 * #1474: the provenance every measured verdict records — the candidate it
 * judged, the receipts it used, and the effective thresholds — so a verdict
 * can be traced to its inputs and re-derived when the policy changes.
 */
export function describeVerdictProvenance(
  set: Pick<QualityEvidenceSet, 'candidate' | 'receipts'>,
  thresholds: QualityThresholdOverrides = {},
): {
  candidate: QualityEvidenceCandidate;
  receipts: Record<QualityMetricName, QualityEvidenceReceiptRef>;
  thresholds: Record<QualityMetricName, QualityThreshold>;
} {
  return { candidate: set.candidate, receipts: set.receipts, thresholds: resolveQualityThresholds(thresholds) };
}
