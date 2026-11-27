/**
 * Hook task outcomes: observed vs. constant (#1493, follow-up to #1481)
 *
 * The Claude Code / Codex PostToolUse hooks AQE installs ran
 * `aqe hooks post-task ... --success true` after every Task/Agent call, and
 * `--success` defaulted to true. Nothing checked whether the work succeeded.
 * `post-task` fed that constant into captured_experiences, the experience
 * pipeline (experience_applications, qe_trajectories, task-bridge pattern
 * usage) and, through session-end consolidation, into qe_patterns.
 *
 * From #1493 on, `post-task` writes those streams only for an observed result
 * (`--outcome success|failure`, the #1481 contract) and marks what it writes:
 *  - captured_experiences.source = 'cli-hook-post-task-observed'
 *  - qe_trajectories.metadata_json.outcome = 'observed'
 *  - qe_pattern_usage.metrics_json.outcome = 'measured' (the #1129 tag),
 *    outcomeBasis = 'hook-observed'
 *
 * Rows written before that carry the legacy source 'cli-hook-post-task'. Every
 * one of them came from post-task, and (for all practical purposes) from the
 * installed hook's constant success. Readers of success-based metrics and
 * pattern promotion exclude them with the predicates below. Stored rows are
 * not modified.
 */

/** captured_experiences.source of post-task rows written before #1493. */
export const LEGACY_HOOK_TASK_SOURCE = 'cli-hook-post-task';

/** captured_experiences.source of post-task rows with an observed outcome. */
export const OBSERVED_HOOK_TASK_SOURCE = 'cli-hook-post-task-observed';

/** outcomeBasis written into metrics_json for observed hook pattern usage. */
export const HOOK_OBSERVED_OUTCOME_BASIS = 'hook-observed';

/**
 * SQL predicate over captured_experiences: true unless the row is a legacy
 * post-task hook row whose success nobody observed. NULL sources pass.
 *
 * @param alias - optional table alias, e.g. `ce` for `ce.source`
 */
export function observedExperienceSql(alias?: string): string {
  const column = alias ? `${alias}.source` : 'source';
  return `COALESCE(${column}, '') <> '${LEGACY_HOOK_TASK_SOURCE}'`;
}

/** {@link observedExperienceSql} for an unaliased captured_experiences. */
export const OBSERVED_EXPERIENCE_SQL = observedExperienceSql();

/**
 * SQL predicate over qe_patterns: true for a pattern that session-end
 * consolidation built from legacy post-task hook experiences. Consolidation
 * stores the experiences' sources as `context_json.tags`, so the legacy
 * source in the tags marks a pattern whose usage and success counts came
 * from constant hook successes.
 */
export const LEGACY_HOOK_PATTERN_SQL =
  `(json_valid(context_json) AND EXISTS (` +
  `SELECT 1 FROM json_each(context_json, '$.tags') WHERE json_each.value = '${LEGACY_HOOK_TASK_SOURCE}'))`;

/** TypeScript twin of {@link LEGACY_HOOK_PATTERN_SQL}. */
export function isLegacyHookDerivedPattern(pattern: {
  context?: { tags?: readonly unknown[] } | null;
}): boolean {
  const tags = pattern.context?.tags;
  return Array.isArray(tags) && tags.includes(LEGACY_HOOK_TASK_SOURCE);
}

/**
 * SQL predicate over qe_pattern_usage: a row the post-task task-bridge
 * fan-out wrote from an unobserved (constant) hook success. Observed hook
 * rows are tagged `outcome = 'measured'` and do not match.
 */
export const LEGACY_HOOK_USAGE_SQL =
  `(json_valid(metrics_json)` +
  ` AND json_extract(metrics_json, '$.source') = '${LEGACY_HOOK_TASK_SOURCE}'` +
  ` AND COALESCE(json_extract(metrics_json, '$.outcome'), '') <> 'measured')`;
