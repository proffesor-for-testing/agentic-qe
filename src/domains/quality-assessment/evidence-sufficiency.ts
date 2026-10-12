/**
 * Evidence sufficiency for static quality analysis (#996).
 *
 * The static analyzer marks metrics it could not measure with the `-1`
 * sentinel (or omits them). Such metrics must never be read as numbers that
 * support a verdict: a pass computed without them is a pass on missing data.
 */

import { DEFAULT_QUALITY_THRESHOLDS, INSUFFICIENT_EVIDENCE } from './quality-evidence.js';

/** `measured`: every requested metric has data. Otherwise no verdict may approve. */
export type StaticEvidenceStatus = 'measured' | typeof INSUFFICIENT_EVIDENCE;

/** Metric names the static quality analysis understands. */
export const STATIC_QUALITY_METRICS = [
  'coverage', 'complexity', 'maintainability', 'duplication', 'testability', 'security',
] as const;

/**
 * Per-metric limits a measured static value can fail on its own, taken from the
 * canonical gate thresholds so the two paths agree (coverage >= 80, duplication <= 5).
 */
const STATIC_METRIC_LIMITS: Record<string, { direction: 'min' | 'max'; value: number }> = {
  coverage: { direction: 'min', value: DEFAULT_QUALITY_THRESHOLDS.coverage.value },
  duplication: { direction: 'max', value: DEFAULT_QUALITY_THRESHOLDS.duplications.value },
};

export interface MeasuredFailure {
  metric: string;
  value: number;
  threshold: number;
  direction: 'min' | 'max';
}

export interface EvidenceSufficiency {
  evidenceStatus: StaticEvidenceStatus;
  /** Requested metrics backed by measured data. */
  measured: string[];
  /** Requested metrics with no measured data (missing, `-1`, or non-finite). */
  unmeasured: string[];
  /** Share of requested metrics that were measured, in [0, 1], two decimals. */
  confidence: number;
}

/** A metric value is measured only if it is a finite, non-negative number. */
export function isMeasuredMetricValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * #996 (N3): `metrics` must be a non-empty string[] of known names. A bare
 * string would otherwise be spread into characters. Returns the de-duplicated
 * list, or throws a caller-facing validation error.
 */
export function validateRequestedMetrics(metrics: unknown): string[] {
  const known: readonly string[] = STATIC_QUALITY_METRICS;
  const message = `metrics must be a non-empty array of metric names (${known.join(', ')}).`;
  if (!Array.isArray(metrics) || metrics.length === 0) throw new Error(message);
  const unknown = metrics.filter((m) => typeof m !== 'string' || !known.includes(m));
  if (unknown.length > 0) {
    throw new Error(`${message} Unknown: ${unknown.map((m) => JSON.stringify(m)).join(', ')}.`);
  }
  return [...new Set(metrics as string[])];
}

/**
 * Decide whether static analysis measured every requested metric.
 *
 * @param requested - metric names the caller asked to assess; when empty,
 *   the measured values themselves define the scope.
 * @param values - metric values produced by the analyzer (`-1` = unmeasured).
 */
export function assessEvidenceSufficiency(
  requested: readonly string[],
  values: Readonly<Record<string, number | undefined>>,
): EvidenceSufficiency {
  const scope = requested.length > 0
    ? [...new Set(requested)]
    : Object.keys(values).filter((name) => isMeasuredMetricValue(values[name]));

  const measured = scope.filter((name) => isMeasuredMetricValue(values[name]));
  const unmeasured = scope.filter((name) => !isMeasuredMetricValue(values[name]));
  const confidence = scope.length === 0
    ? 0
    : Math.round((measured.length / scope.length) * 100) / 100;

  return {
    evidenceStatus: unmeasured.length === 0 && measured.length > 0 ? 'measured' : INSUFFICIENT_EVIDENCE,
    measured,
    unmeasured,
    confidence,
  };
}

/**
 * #996 (N2): measured metrics that already fail their own limit. Such a
 * failure is conclusive — no unmeasured metric can turn it into a pass.
 */
export function findMeasuredFailures(
  measured: readonly string[],
  values: Readonly<Record<string, number | undefined>>,
): MeasuredFailure[] {
  const failures: MeasuredFailure[] = [];
  for (const metric of measured) {
    const limit = STATIC_METRIC_LIMITS[metric];
    const value = values[metric];
    if (!limit || !isMeasuredMetricValue(value)) continue;
    const fails = limit.direction === 'min' ? value < limit.value : value > limit.value;
    if (fails) failures.push({ metric, value, threshold: limit.value, direction: limit.direction });
  }
  return failures;
}

/** Plain-language recommendation for one measured failure. */
export function describeMeasuredFailure(failure: MeasuredFailure): string {
  const bound = failure.direction === 'min' ? 'at least' : 'at most';
  return `${failure.metric} measured at ${failure.value} fails its threshold (${bound} ${failure.threshold}).`;
}
