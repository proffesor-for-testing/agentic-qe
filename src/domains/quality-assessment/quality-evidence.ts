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

export async function loadQualityEvidence(
  memory: MemoryBackend,
  options: { now?: number; maxAgeMs?: number } = {},
): Promise<QualityEvidenceValues> {
  const now = options.now ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_QUALITY_EVIDENCE_MAX_AGE_MS;
  const values = {} as QualityEvidenceValues;

  for (const metric of QUALITY_METRICS) {
    const record = await memory.get<QualityEvidenceRecord>(evidenceKey(metric), {
      namespace: QUALITY_EVIDENCE_NAMESPACE,
    });
    validateRecord(record, metric, now, maxAgeMs);
    values[metric] = record.value;
  }
  return values;
}

export function evaluateQualityEvidence(
  values: QualityEvidenceValues,
): { passed: boolean; checks: EvaluatedQualityCheck[]; recommendations: string[] } {
  const checks = QUALITY_METRICS.map((name) => {
    const threshold = DEFAULT_QUALITY_THRESHOLDS[name];
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
