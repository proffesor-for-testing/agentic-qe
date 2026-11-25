/**
 * Routing Outcomes Schema Migration (ADR-095)
 *
 * Idempotently adds the ADR-095 columns (`exploration`, `criticality`,
 * `q_weight`) to `routing_outcomes` for databases created before this
 * release. New databases get the columns from `unified-memory-schemas.ts`
 * at CREATE TABLE time; this helper handles upgrades.
 *
 * Pattern matches the existing ADR-092 migration in
 * `src/routing/routing-feedback.ts:199-207` — try the ALTER, swallow the
 * "duplicate column name" error if the column already exists.
 *
 * Callers run this before INSERTing rows that reference the new columns.
 * A process-local flag prevents repeated migration attempts.
 */

import type { Database as DatabaseType } from 'better-sqlite3';
import { isBusyError } from '../learning/dream/dream-lock-retry.js';

let migrated = false;

/**
 * Error tag the post-route orphan sweep writes on route sentinels that were
 * never closed by a real outcome (#465).
 */
export const STALE_SENTINEL_ERROR = 'stale-sentinel';

/**
 * Id prefix of every row the Claude Code / Codex hooks write (route and
 * pre-task sentinels, `route-<ts>-<uuid>`). The feedback collector writes
 * `outcome-<ts>-<uuid>`. Used to tell hook rows apart in existing databases,
 * which carry no other source marker (#1481).
 */
export const HOOK_ROUTING_ROW_ID_PREFIX = 'route-';

/**
 * Error tag a hook writes when it closes its sentinel with an OBSERVED result
 * (`--outcome success|failure`, or an explicit `--success false`). Hook rows
 * without it were closed by the installed hooks' constant `--success true`,
 * which observes nothing (#1481).
 */
export const OBSERVED_HOOK_OUTCOME_TAG = 'observed';

/** True for a row written by the hooks rather than the feedback collector. */
export function isHookRoutingRowId(id: string): boolean {
  return id.startsWith(HOOK_ROUTING_ROW_ID_PREFIX);
}

/**
 * SQL predicate selecting only `routing_outcomes` rows that carry an observed
 * outcome (#1481). It excludes:
 *  - open sentinels (`quality_score = -1`, the task has not finished);
 *  - swept `stale-sentinel` rows (closed with a placeholder score);
 *  - hook rows not tagged `observed`: before #1481 every Stop/PostToolUse
 *    hook closed its sentinel as a success without seeing a result.
 * Metric readers AND this in; rows are not modified.
 */
export const OBSERVED_ROUTING_OUTCOME_SQL =
  `(quality_score >= 0` +
  ` AND COALESCE(error, '') <> '${STALE_SENTINEL_ERROR}'` +
  ` AND (id NOT LIKE '${HOOK_ROUTING_ROW_ID_PREFIX}%' OR error = '${OBSERVED_HOOK_OUTCOME_TAG}'))`;

/** An outcome a hook observed, or null when it saw no result. */
export type ObservedHookOutcome = 'success' | 'failure' | null;

/**
 * Resolve what a post-route / post-task hook actually observed (#1481).
 *
 * - `--outcome success|failure` is an observed result.
 * - `--success false` is an observed failure: no installer emits it, so only
 *   a caller that saw the failure passes it.
 * - `--success true`, a bare `--success`, or no flag is NOT an observation.
 *   Every installed hook (Claude Code Stop/PostToolUse, the init wizard, the
 *   Codex adapter) emitted a constant `--success true`, and existing installs
 *   keep that command until re-init, so the CLI cannot tell it from a real
 *   success. Use `--outcome success` to report one.
 *
 * Throws on an `--outcome` value other than success/failure.
 */
export function resolveObservedHookOutcome(options: {
  outcome?: unknown;
  success?: unknown;
}): ObservedHookOutcome {
  if (options.outcome !== undefined) {
    if (options.outcome === 'success' || options.outcome === 'failure') return options.outcome;
    throw new Error(`--outcome must be "success" or "failure", got ${JSON.stringify(options.outcome)}`);
  }
  if (options.success === false || options.success === 'false') return 'failure';
  return null;
}

/**
 * Add the ADR-095 columns to routing_outcomes if they don't already exist.
 * Safe to call multiple times — second and later calls are no-ops.
 *
 * Failure to migrate (e.g. table doesn't exist yet, permission error) is
 * NOT fatal — callers that depend on the new columns should fall back to
 * not writing them. The schema is forward-compatible: inserts that omit
 * the new columns get the defaults.
 */
export function ensureRoutingOutcomesAdr095Columns(db: DatabaseType): void {
  if (migrated) return;

  for (const stmt of [
    'ALTER TABLE routing_outcomes ADD COLUMN exploration INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE routing_outcomes ADD COLUMN criticality REAL',
    'ALTER TABLE routing_outcomes ADD COLUMN q_weight REAL',
  ]) {
    try {
      db.prepare(stmt).run();
    } catch (error) {
      // Column already exists, or table doesn't exist yet. Both are
      // acceptable — ALTER is additive, and a missing table means the
      // unified schema hasn't been applied yet (caller's INSERT will fail
      // separately with a clearer error). A locked database is not (#1274):
      // rethrow so a retrying caller migrates on its next attempt instead of
      // marking the migration done without the columns.
      if (isBusyError(error)) throw error;
    }
  }

  // Index on exploration for the bucket-comparison queries used by
  // `aqe learning loop-health`. Idempotent via IF NOT EXISTS.
  try {
    db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_routing_outcomes_exploration ON routing_outcomes(exploration)',
    ).run();
  } catch {
    // Table missing; index attempt is best-effort.
  }

  migrated = true;
}

/**
 * Reset the process-local migration flag. Test-only.
 */
export function resetRoutingOutcomesMigrationState(): void {
  migrated = false;
}
