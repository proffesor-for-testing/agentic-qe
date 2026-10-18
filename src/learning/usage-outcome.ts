/**
 * Agentic QE v3 - Measured outcomes for pattern usage (#1129)
 *
 * `qe_pattern_usage.success` used to mean "the tool call completed": MCP tool
 * runs were captured with a fixed `success: true`, and only successful
 * experiences reached the usage table, so the aggregate "Pattern Success
 * Rate" was 100% by construction even when the tests had failed.
 *
 * A usage row now says whether its success came from an observed outcome:
 *   - `metrics_json.outcome = 'measured'`: success describes the result
 *     (all tests passed, at least one file indexed, the task failed);
 *   - `metrics_json.outcome = 'unmeasured'`: only completion is known.
 *
 * Reading rule for rows written before the tag existed (tag and exclude, the
 * same decision as #1109): rows are never rewritten, they are classified.
 *   - no metrics and no feedback: written by experience capture, which always
 *     passed `success: true` -> unmeasured;
 *   - feedback "Domain handler <domain> execution ...": written by the MCP
 *     handler factory on tool completion -> unmeasured;
 *   - anything else: measured, as before. Hook writers derive success from an
 *     observed result (pass rate, coverage delta, edit outcome).
 *
 * Every new row carries a metrics object (possibly `{}`), so "no metrics and
 * no feedback" only matches rows written before this rule existed.
 */

export type UsageOutcome = 'measured' | 'unmeasured';

/** The outcome of one tool run, as far as its result shows it. */
export interface ToolOutcome {
  /** True when `success` was read from the result, not from completion. */
  readonly measured: boolean;
  /** For a measured outcome, whether it was good; otherwise null. */
  readonly success: boolean | null;
  /** What the verdict was read from, e.g. `test-results` or `files-indexed`. */
  readonly basis: string;
}

const LEGACY_HANDLER_FEEDBACK = /^Domain handler \S+ execution (succeeded|failed)$/;

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
  if (taskType === 'index-code') {
    const filesIndexed = finiteNumber(record?.filesIndexed);
    if (filesIndexed !== null) {
      return { measured: true, success: filesIndexed > 0, basis: 'files-indexed' };
    }
    return { measured: false, success: null, basis: 'no-index-count' };
  }
  return { measured: false, success: null, basis: 'tool-completed' };
}

/** A task that ran and failed is an observed failed outcome. */
export const TASK_FAILED_OUTCOME: ToolOutcome = { measured: true, success: false, basis: 'task-failed' };

/** Metrics fields that tag a usage row with its outcome provenance. */
export function usageOutcomeMetrics(outcome: ToolOutcome): { outcome: UsageOutcome; outcomeBasis: string } {
  return { outcome: outcome.measured ? 'measured' : 'unmeasured', outcomeBasis: outcome.basis };
}

/** Classify one qe_pattern_usage row (TypeScript twin of MEASURED_USAGE_SQL). */
export function usageOutcomeOf(
  metrics: Record<string, unknown> | null | undefined,
  feedback: string | null | undefined
): UsageOutcome {
  const tag = metrics?.outcome;
  if (tag === 'measured' || tag === 'unmeasured') return tag;
  if (!metrics && !feedback) return 'unmeasured';
  if (feedback && LEGACY_HANDLER_FEEDBACK.test(feedback)) return 'unmeasured';
  return 'measured';
}

/**
 * SQL expression over qe_pattern_usage: 1 for a measured row, 0 otherwise.
 * Mirrors usageOutcomeOf; LIKE keeps a malformed metrics_json from failing
 * the whole query the way json_extract would.
 */
export const MEASURED_USAGE_SQL = `CASE
  WHEN metrics_json LIKE '%"outcome":"measured"%' THEN 1
  WHEN metrics_json LIKE '%"outcome":"unmeasured"%' THEN 0
  WHEN metrics_json IS NULL AND feedback IS NULL THEN 0
  WHEN feedback LIKE 'Domain handler % execution succeeded'
    OR feedback LIKE 'Domain handler % execution failed' THEN 0
  ELSE 1
END`;

/** Fields of the reasoning-bank stats that describe usage outcomes. */
interface OutcomeStats {
  learningOutcomes: number;
  measuredOutcomes?: number;
  patternSuccessRate: number | null;
}

/** e.g. "5 (0 measured, 5 completion-only)"; plain count when all are measured. */
export function formatLearningOutcomes(stats: OutcomeStats): string {
  const measured = stats.measuredOutcomes ?? stats.learningOutcomes;
  const unmeasured = stats.learningOutcomes - measured;
  return unmeasured > 0
    ? `${stats.learningOutcomes} (${measured} measured, ${unmeasured} completion-only)`
    : `${stats.learningOutcomes}`;
}

/** The rate as a percentage, or why there is none (#1129). */
export function formatPatternSuccessRate(stats: OutcomeStats): string {
  return stats.patternSuccessRate === null
    ? 'insufficient evidence (no measured outcomes)'
    : `${(stats.patternSuccessRate * 100).toFixed(1)}%`;
}
