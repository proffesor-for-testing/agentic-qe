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
 *
 * #1501: `post-edit` and `post-command` had the same problem. The installed
 * hooks ran `post-edit ... --success` and `post-command ... --success true`
 * after every edit and command, and post-command defaulted `--success` to
 * true. They now record an outcome only for `--outcome success|failure` and
 * write the `-observed` sources below; their legacy sources
 * ('cli-hook-post-edit', 'cli-hook-post-command') are excluded like the
 * post-task one. The same goes for post-command's test_outcomes rows (see
 * src/feedback/test-outcome-provenance.ts).
 */

/** captured_experiences.source of post-task rows written before #1493. */
export const LEGACY_HOOK_TASK_SOURCE = 'cli-hook-post-task';

/** captured_experiences.source of post-task rows with an observed outcome. */
export const OBSERVED_HOOK_TASK_SOURCE = 'cli-hook-post-task-observed';

/** captured_experiences.source of post-edit rows written before #1501. */
export const LEGACY_HOOK_EDIT_SOURCE = 'cli-hook-post-edit';

/** captured_experiences.source of post-edit rows with an observed outcome. */
export const OBSERVED_HOOK_EDIT_SOURCE = 'cli-hook-post-edit-observed';

/**
 * captured_experiences.source (and test_outcomes.generated_by) of
 * post-command rows written before #1501.
 */
export const LEGACY_HOOK_COMMAND_SOURCE = 'cli-hook-post-command';

/** The same for post-command rows with an observed outcome. */
export const OBSERVED_HOOK_COMMAND_SOURCE = 'cli-hook-post-command-observed';

/**
 * Every source a hook wrote from a constant success: post-task (#1493),
 * post-edit and post-command (#1501).
 */
export const LEGACY_HOOK_SOURCES: readonly string[] = [
  LEGACY_HOOK_TASK_SOURCE,
  LEGACY_HOOK_EDIT_SOURCE,
  LEGACY_HOOK_COMMAND_SOURCE,
];

const LEGACY_HOOK_SOURCES_SQL = LEGACY_HOOK_SOURCES.map((s) => `'${s}'`).join(', ');

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
 * post-task / post-edit / post-command hook row whose success nobody
 * observed. NULL sources pass.
 *
 * @param alias - optional table alias, e.g. `ce` for `ce.source`
 */
export function observedExperienceSql(alias?: string): string {
  const column = alias ? `${alias}.source` : 'source';
  return `COALESCE(${column}, '') NOT IN (${LEGACY_HOOK_SOURCES_SQL})`;
}

/** {@link observedExperienceSql} for an unaliased captured_experiences. */
export const OBSERVED_EXPERIENCE_SQL = observedExperienceSql();

/**
 * SQL predicate over qe_patterns: true for a pattern that session-end
 * consolidation built from legacy hook experiences (any of
 * {@link LEGACY_HOOK_SOURCES}). Consolidation
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
  `SELECT 1 FROM json_each(context_json, '$.tags') WHERE json_each.value IN (${LEGACY_HOOK_SOURCES_SQL})))`;

/**
 * TypeScript twin of {@link LEGACY_HOOK_PATTERN_SQL}.
 *
 * #1501: such a pattern's success rate, confidence and quality score are the
 * hooks' constant successes, so it is also left out of pattern search and
 * routing guidance (it carries no content beyond "<agent> pattern for
 * <domain>"), whatever its tier. The row itself is kept unchanged.
 */
export function isLegacyHookDerivedPattern(pattern: {
  context?: { tags?: readonly unknown[] } | null;
}): boolean {
  const tags = pattern.context?.tags;
  return Array.isArray(tags) && tags.some((t) => typeof t === 'string' && LEGACY_HOOK_SOURCES.includes(t));
}

/**
 * SQL predicate over qe_pattern_usage: a row the post-task task-bridge
 * fan-out wrote from an unobserved (constant) hook success. Observed hook
 * rows are tagged `outcome = 'measured'` and do not match.
 */
export function legacyHookUsageSql(alias?: string): string {
  const m = alias ? `${alias}.metrics_json` : 'metrics_json';
  return `(COALESCE(CASE WHEN json_valid(${m}) THEN json_extract(${m}, '$.source') END, '')` +
    ` = '${LEGACY_HOOK_TASK_SOURCE}'` +
    ` AND COALESCE(CASE WHEN json_valid(${m}) THEN json_extract(${m}, '$.outcome') END, '')` +
    ` <> 'measured')`;
}

/** {@link legacyHookUsageSql} for an unaliased qe_pattern_usage. */
export const LEGACY_HOOK_USAGE_SQL = legacyHookUsageSql();

/**
 * Select-list columns `legacy_hook_uses` and `legacy_hook_successes` for a
 * qe_patterns row aliased `patternAlias`: how many of its usage rows (and
 * successes) are legacy task-bridge fan-out (#1501). Read into
 * QEPattern.legacyHookUsage so in-memory promotion checks count only
 * observed uses. Uses idx_usage_pattern.
 */
export function legacyHookUsageColumnsSql(patternAlias: string): string {
  const where = `u.pattern_id = ${patternAlias}.id AND ${legacyHookUsageSql('u')}`;
  return `(SELECT COUNT(*) FROM qe_pattern_usage u WHERE ${where}) AS legacy_hook_uses, ` +
    `(SELECT COALESCE(SUM(u.success), 0) FROM qe_pattern_usage u WHERE ${where}) AS legacy_hook_successes`;
}

/** Uses and successes of a pattern that came from legacy hook fan-out. */
export interface LegacyHookUsage {
  readonly uses: number;
  readonly successes: number;
}

/**
 * A pattern's promotion counts without its legacy hook fan-out uses
 * (#1501). With none recorded, the stored counts are returned as they are.
 */
export function observedPromotionCounts(pattern: {
  usageCount: number;
  successfulUses: number;
  successRate: number;
  legacyHookUsage?: LegacyHookUsage;
}): { usageCount: number; successfulUses: number; successRate: number } {
  const legacy = pattern.legacyHookUsage;
  if (!legacy || (legacy.uses <= 0 && legacy.successes <= 0)) {
    return { usageCount: pattern.usageCount, successfulUses: pattern.successfulUses, successRate: pattern.successRate };
  }
  const usageCount = Math.max(0, pattern.usageCount - legacy.uses);
  const successfulUses = Math.max(0, pattern.successfulUses - legacy.successes);
  return { usageCount, successfulUses, successRate: usageCount > 0 ? successfulUses / usageCount : 0 };
}

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
