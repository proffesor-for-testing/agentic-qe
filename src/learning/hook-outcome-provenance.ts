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
 * in qe_trajectories, the exact post-task row shape with no observed marker;
 * see legacyHookTrajectorySql). Every
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

const DIGITS_13 = '[0-9]'.repeat(13);
const HEX_8 = '[0-9a-f]'.repeat(8);

/**
 * GLOB (case-sensitive, whole-string) of the ids post-task writes:
 * `traj-${Date.now()}-${randomUUID().slice(0, 8)}` for a single step and
 * `traj-multi-${Date.now()}-${randomUUID().slice(0, 8)}` for a stitched run.
 * The `traj-` prefix alone is NOT a post-task marker: ruflo's
 * `hooks_intelligence_trajectory-start` returns `traj-${Date.now()}-<base36>`
 * ids, which the claude-flow TrajectoryBridge stores as they are.
 */
export const HOOK_TRAJECTORY_ID_GLOB = `traj-${DIGITS_13}-${HEX_8}`;
export const HOOK_MULTI_TRAJECTORY_ID_GLOB = `traj-multi-${DIGITS_13}-${HEX_8}`;

/** metadata_json.source the claude-flow TrajectoryBridge writes (#1493). */
export const CLAUDE_FLOW_BRIDGE_TRAJECTORY_SOURCE = 'claude-flow-bridge';

/**
 * SQL predicate over qe_trajectories: 1 for a row post-task wrote before
 * #1493, 0 otherwise (never NULL). A row is legacy when it has the exact
 * shape post-task writes and no `metadata_json.outcome = 'observed'`:
 *  - single step: id `traj-<13 digits>-<8 hex>`, steps_json
 *    `[{"step":1,"task":<taskId>,...}]` and task `<agent>:<taskId>`;
 *  - stitched: id `traj-multi-<13 digits>-<8 hex>`, task `multi:<taskId>`,
 *    steps_json starting with step 1.
 * Ids are matched with GLOB (case-sensitive); JSON reads are json_valid
 * guarded. Pass `hasMetadata: false` for a table without metadata_json,
 * where no row can carry the observed marker.
 */
export function legacyHookTrajectorySql(alias?: string, opts: { hasMetadata?: boolean } = {}): string {
  const col = (name: string) => (alias ? `${alias}.${name}` : name);
  const step = (path: string) =>
    `(CASE WHEN json_valid(${col('steps_json')}) THEN json_extract(${col('steps_json')}, '${path}') END)`;
  const shape =
    `((${col('id')} GLOB '${HOOK_TRAJECTORY_ID_GLOB}'` +
    ` AND ${step('$[0].step')} = 1` +
    ` AND ${col('task')} = ${col('agent')} || ':' || ${step('$[0].task')})` +
    ` OR (${col('id')} GLOB '${HOOK_MULTI_TRAJECTORY_ID_GLOB}'` +
    ` AND ${col('task')} GLOB 'multi:*'` +
    ` AND ${step('$[0].step')} = 1))`;
  const unmarked = opts.hasMetadata === false
    ? ''
    : ` AND COALESCE(CASE WHEN json_valid(${col('metadata_json')})` +
      ` THEN json_extract(${col('metadata_json')}, '$.outcome') END, '') <> 'observed'`;
  return `(CASE WHEN ${shape}${unmarked} THEN 1 ELSE 0 END)`;
}

/** Rows {@link legacyHookTrajectorySql} does not flag: every other trajectory. */
export const OBSERVED_TRAJECTORY_SQL = `${legacyHookTrajectorySql()} = 0`;

/**
 * {@link OBSERVED_TRAJECTORY_SQL}, adjusted for a qe_trajectories without the
 * metadata_json column (the same structural test, without the marker).
 */
export function observedTrajectorySql(db: {
  prepare(sql: string): { all(...params: unknown[]): unknown[] };
}): string {
  const cols = db.prepare(`PRAGMA table_info(qe_trajectories)`).all() as Array<{ name: string }>;
  const hasMetadata = cols.some((c) => c.name === 'metadata_json');
  return `${legacyHookTrajectorySql(undefined, { hasMetadata })} = 0`;
}
