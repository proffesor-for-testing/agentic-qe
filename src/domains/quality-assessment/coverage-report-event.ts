/**
 * Validation of measured coverage records (#1008, #1014, #1015).
 *
 * Used for `coverage-analysis.CoverageReportCreated` payloads before the
 * quality-assessment domain stores them as `coverage:latest`, and by every
 * reader of the stored records (`coverage:latest`, `coverage:previous`,
 * `coverage:file:*`).
 *
 * Only a record its producer explicitly marked `measured: true`, carrying
 * finite coverage figures, is coverage evidence. Anything else — a static
 * estimate, a legacy record without provenance (written by <= 3.15.4, or the
 * `{"files":0}` bridge echo removed in #1013), or a look-alike with no coverage
 * figures at all — is ignored rather than read as a measurement or as zeros.
 */

/** The `coverage:latest` record written from a measured coverage report. */
export interface MeasuredCoverageSummary {
  line: number;
  /** `null` = the report collected no branch data (not 0%, #1015). */
  branch: number | null;
  /** `null` = the report collected no function data (not 0%, #1015). */
  function: number | null;
  /** `null` = the report collected no statement data (lcov, Cobertura; #1027). */
  statement: number | null;
  files: number;
  /** Provenance stamp: this record came from instrumented coverage. */
  measured: true;
  /** Outcome of the test run behind the record, when known (#1027 N4). */
  runStatus?: 'passed' | 'failed';
}

/** A per-file `coverage:file:<path>` record written from measured coverage. */
export interface MeasuredFileCoverage {
  line: number;
  branch: number | null;
  function: number | null;
  statement: number | null;
  measured: true;
  /**
   * #1219: the line counts behind `line`, so a reader can weight several
   * files by size. Absent on records written before 3.15.13.
   */
  lines?: { covered: number; total: number };
}

const isPercent = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;

/** A percentage, or `null` for a metric that was not collected. */
const isPercentOrNull = (v: unknown): v is number | null => v === null || isPercent(v);

/**
 * Return the measured summary to store, or `null` when the payload is not
 * measured coverage evidence.
 */
export function measuredCoverageSummary(payload: unknown): MeasuredCoverageSummary | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (p.measured !== true) return null;
  if (!isPercent(p.line) || !isPercentOrNull(p.statement) || !isPercentOrNull(p.branch) || !isPercentOrNull(p.function)) {
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
    ...(p.runStatus === 'passed' || p.runStatus === 'failed' ? { runStatus: p.runStatus } : {}),
  };
}

/**
 * Return a stored per-file coverage record when it is measured evidence, or
 * `null` (#1014): legacy unstamped `coverage:file:*` records — static
 * estimates written by <= 3.15.4 never expire — must not be read as coverage.
 */
export function measuredFileCoverage(record: unknown): MeasuredFileCoverage | null {
  if (!record || typeof record !== 'object') return null;
  const r = record as Record<string, unknown>;
  if (r.measured !== true || !isPercent(r.line)) return null;
  const opt = (v: unknown): number | null => (isPercent(v) ? v : null);
  const lines = lineCounts(r.lines, r.line);
  return {
    line: r.line, branch: opt(r.branch), function: opt(r.function), statement: opt(r.statement), measured: true,
    ...(lines ? { lines } : {}),
  };
}

/**
 * #1219: whole, consistent line counts (`covered / total` within rounding of
 * the stored percentage), or `undefined` when the record has none or they do
 * not describe its own percentage.
 */
function lineCounts(value: unknown, line: number): { covered: number; total: number } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { covered, total } = value as Record<string, unknown>;
  if (!Number.isSafeInteger(covered) || !Number.isSafeInteger(total)) return undefined;
  const c = covered as number;
  const t = total as number;
  if (t <= 0 || c < 0 || c > t || Math.abs((c / t) * 100 - line) > 0.01) return undefined;
  return { covered: c, total: t };
}
