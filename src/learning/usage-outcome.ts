/**
 * Agentic QE v3 - Measured outcomes for pattern usage (#1129)
 *
 * `qe_pattern_usage.success` used to mean "the call completed": MCP tool runs
 * were captured with a fixed `success: true`, hooks pass a hardcoded
 * `--success`, and session consolidation writes only aggregates whose success
 * rate already passed a threshold. The aggregate "Pattern Success Rate" was
 * 100% by construction.
 *
 * A usage row counts as a measured outcome only when it says so:
 * `metrics_json.outcome = 'measured'`, written when success was read from the
 * result. Today that is a test run: every test passed, or some failed.
 * Every other row, whatever its age or writer, is unmeasured (tag and exclude,
 * the #1109 decision): it is kept and counted as a use, never rewritten, and
 * never part of the rate.
 *
 * The rate is per run, not per row: one tool run writes a row for each
 * pattern involved (the captured experience's pattern plus every routing
 * hint), all with the same verdict, and they share `metrics_json.runId`.
 */

export type UsageOutcome = 'measured' | 'unmeasured';

/** The outcome of one tool run, as far as its result shows it. */
export interface ToolOutcome {
  /** True when `success` was read from the result, not from completion. */
  readonly measured: boolean;
  /** For a measured outcome, whether it was good; otherwise null. */
  readonly success: boolean | null;
  /** What the verdict was read from, e.g. `test-results`. */
  readonly basis: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Read the outcome of a completed tool run from its result.
 * Tools without an outcome measure here are `unmeasured`: completing is not
 * evidence that the result was good.
 */
export function measureToolOutcome(taskType: string, data: unknown): ToolOutcome {
  const record = asRecord(data);
  if (taskType === 'execute-tests') {
    const total = finiteNumber(record?.total);
    const failed = finiteNumber(record?.failed);
    if (total !== null && total > 0 && failed !== null) {
      return { measured: true, success: failed === 0, basis: 'test-results' };
    }
    return { measured: false, success: null, basis: 'no-test-results' };
  }
  // index-code is not measured (#1142 review): it fails both for the caller's
  // input (a missing, empty or outside target) and for indexer errors, and the
  // result does not tell them apart. Counting only the successful indexes
  // would make its rate 100% by selection again.
  return { measured: false, success: null, basis: 'tool-completed' };
}

/** Metrics fields that tag a usage row with its outcome provenance and run. */
export function usageOutcomeMetrics(
  outcome: ToolOutcome,
  runId?: string
): { outcome: UsageOutcome; outcomeBasis: string; runId?: string } {
  return {
    outcome: outcome.measured ? 'measured' : 'unmeasured',
    outcomeBasis: outcome.basis,
    ...(runId ? { runId } : {}),
  };
}

/** Classify one qe_pattern_usage row (TypeScript twin of MEASURED_USAGE_SQL). */
export function usageOutcomeOf(metrics: Record<string, unknown> | null | undefined): UsageOutcome {
  return metrics?.outcome === 'measured' ? 'measured' : 'unmeasured';
}

/**
 * SQL expression over qe_pattern_usage: 1 for a measured row, 0 otherwise.
 * Mirrors usageOutcomeOf; json_valid keeps a malformed row from failing the query.
 */
export const MEASURED_USAGE_SQL =
  `(CASE WHEN json_valid(metrics_json) AND json_extract(metrics_json, '$.outcome') = 'measured' THEN 1 ELSE 0 END)`;

/** SQL expression: the run a usage row belongs to (a row without runId is its own run). */
export const USAGE_RUN_SQL =
  `COALESCE(CASE WHEN json_valid(metrics_json) THEN json_extract(metrics_json, '$.runId') END, 'row:' || id)`;

/** Fields of the reasoning-bank stats that describe usage outcomes. */
interface OutcomeStats {
  learningOutcomes: number;
  measuredOutcomes?: number;
  patternSuccessRate: number | null;
}

/**
 * e.g. "9 (4 measured runs, 0 unmeasured)". A run can write several usage
 * rows (one per pattern involved), so measured runs can be fewer than rows.
 */
export function formatLearningOutcomes(stats: OutcomeStats & { unmeasuredOutcomes?: number }): string {
  if (stats.learningOutcomes === 0) return '0';
  const measured = stats.measuredOutcomes ?? 0;
  const unmeasured = stats.unmeasuredOutcomes ?? stats.learningOutcomes;
  return `${stats.learningOutcomes} (${measured} measured runs, ${unmeasured} unmeasured)`;
}

/** The rate as a percentage, or why there is none (#1129). */
export function formatPatternSuccessRate(stats: OutcomeStats): string {
  return stats.patternSuccessRate === null
    ? 'insufficient evidence (no measured outcomes)'
    : `${(stats.patternSuccessRate * 100).toFixed(1)}% of ${stats.measuredOutcomes ?? 0} measured runs`;
}
