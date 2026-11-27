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
 * Rows written before that carry the legacy source 'cli-hook-post-task' (and,
 * in qe_trajectories, a `traj-` id with no observed marker). Every
 * one of them came from post-task, and (for all practical purposes) from the
 * installed hook's constant success. Readers of success-based metrics and
 * pattern promotion exclude them with the predicates below. Stored rows are
 * not modified.
 */

/** captured_experiences.source of post-task rows written before #1493. */
export const LEGACY_HOOK_TASK_SOURCE = 'cli-hook-post-task';

/** captured_experiences.source of post-task rows with an observed outcome. */
export const OBSERVED_HOOK_TASK_SOURCE = 'cli-hook-post-task-observed';

/**
 * Suffix of a consolidated pattern built from observed hook experiences when
 * a legacy-derived pattern already holds the plain `<agent>-<domain>-<month>`
 * name; (name, qe_domain, pattern_type) is unique.
 */
export const OBSERVED_PATTERN_NAME_SUFFIX = '-observed';

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
 *
 * A pattern whose tags mix the legacy source with others (a domain+agent
 * group that also held, say, middleware rows) matches too, and is therefore
 * permanently excluded from promotion: its counters cannot be split by
 * source. Consolidation sends later observed experiences to a separate
 * `-observed` pattern rather than into such a pattern.
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
  `(COALESCE(CASE WHEN json_valid(metrics_json) THEN json_extract(metrics_json, '$.source') END, '')` +
  ` = '${LEGACY_HOOK_TASK_SOURCE}'` +
  ` AND COALESCE(CASE WHEN json_valid(metrics_json) THEN json_extract(metrics_json, '$.outcome') END, '')` +
  ` <> 'measured')`;

/** Id prefix of every trajectory post-task writes (`traj-` and `traj-multi-`). */
export const HOOK_TRAJECTORY_ID_PREFIX = 'traj-';

/**
 * SQL predicate over qe_trajectories: true for a row post-task wrote before
 * #1493. Only post-task uses the `traj-` id prefix (the trajectory tracker
 * writes UUIDs, the claude-flow bridge `trajectory-<uuid>`), and from #1493
 * on it marks its rows `metadata_json.outcome = 'observed'`. NULL-safe and
 * json_valid-guarded. Needs the metadata_json column; see
 * {@link observedTrajectorySql} for tables that may lack it.
 */
export function legacyHookTrajectorySql(alias?: string): string {
  const col = (name: string) => (alias ? `${alias}.${name}` : name);
  return `(${col('id')} LIKE '${HOOK_TRAJECTORY_ID_PREFIX}%'` +
    ` AND COALESCE(CASE WHEN json_valid(${col('metadata_json')})` +
    ` THEN json_extract(${col('metadata_json')}, '$.outcome') END, '') <> 'observed')`;
}

/** Negation of {@link legacyHookTrajectorySql}: keep every other trajectory. */
export const OBSERVED_TRAJECTORY_SQL = `NOT ${legacyHookTrajectorySql()}`;

/**
 * {@link OBSERVED_TRAJECTORY_SQL}, or, for a qe_trajectories without the
 * metadata_json column (where no row can carry the observed marker), a
 * predicate that drops every `traj-` row.
 */
export function observedTrajectorySql(db: {
  prepare(sql: string): { all(...params: unknown[]): unknown[] };
}): string {
  const cols = db.prepare(`PRAGMA table_info(qe_trajectories)`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === 'metadata_json')
    ? OBSERVED_TRAJECTORY_SQL
    : `id NOT LIKE '${HOOK_TRAJECTORY_ID_PREFIX}%'`;
}
