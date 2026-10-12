/**
 * Evidence sufficiency for static quality analysis (#996).
 *
 * The static analyzer marks metrics it could not measure with the `-1`
 * sentinel (or omits them). Such metrics must never be read as numbers that
 * support a verdict: a pass computed without them is a pass on missing data.
 */

/** `measured`: every requested metric has data. Otherwise no verdict may approve. */
export type StaticEvidenceStatus = 'measured' | 'insufficient-evidence';

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
    evidenceStatus: unmeasured.length === 0 && measured.length > 0 ? 'measured' : 'insufficient-evidence',
    measured,
    unmeasured,
    confidence,
  };
}
