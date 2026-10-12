/**
 * Validation of `coverage-analysis.CoverageReportCreated` payloads before the
 * quality-assessment domain stores them as `coverage:latest` (#1008).
 *
 * Only a report its producer explicitly marked `measured: true`, carrying
 * finite coverage figures, is coverage evidence. Anything else — a static
 * estimate, a legacy event without provenance, or a look-alike event with no
 * coverage figures at all — is ignored rather than written as zeros.
 */

/** The `coverage:latest` record written from a measured coverage report. */
export interface MeasuredCoverageSummary {
  line: number;
  branch: number;
  function: number;
  statement: number;
  files: number;
  /** Provenance stamp: this record came from instrumented coverage. */
  measured: true;
}

const isPercent = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;

/**
 * Return the measured summary to store, or `null` when the payload is not
 * measured coverage evidence.
 */
export function measuredCoverageSummary(payload: unknown): MeasuredCoverageSummary | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (p.measured !== true) return null;
  if (!isPercent(p.line) || !isPercent(p.branch) || !isPercent(p.function) || !isPercent(p.statement)) {
    return null;
  }
  const files = typeof p.files === 'number' && Number.isInteger(p.files) && p.files >= 0 ? p.files : null;
  if (files === null) return null;
  return {
    line: p.line,
    branch: p.branch,
    function: p.function,
    statement: p.statement,
    files,
    measured: true,
  };
}
