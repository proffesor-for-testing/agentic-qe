/**
 * Dream Insights Pruner (#488 C.2)
 *
 * Periodic retention sweep for the `dream_insights` table.
 *
 * dream_insights accumulate forever in default deployments — the schema has
 * `created_at` but no `expires_at`, no foreign-key cascade that fires on
 * regular cycle delete (cycles aren't routinely purged either), and no
 * equivalent of `pattern-lifecycle.ts`'s decay/deprecation pass.
 *
 * Observed in state-rich shops (per #488 reporter): 120+ rows accumulated
 * over ~30h of activity, with most at `applied = 0`. Without pruning, this
 * grows linearly with hook activity. Over months the table becomes a slow
 * `getPendingInsights` target and vector embeddings (if attached) grow
 * unbounded.
 *
 * Strategy: delete only insights that:
 *   - have never been applied (`applied = 0`), AND
 *   - are older than the retention window (default 30 days)
 *
 * Applied insights stay forever — they're part of the audit trail for
 * pattern changes. Recently-created insights stay regardless of applied
 * state — they might still be picked up by a future `applyInsight` pass.
 *
 * Called from `LearningConsolidationWorker.runContinuousLearningLoop` on
 * the 30-min worker tick. Failures are non-fatal — the worker continues
 * with the rest of its lifecycle work.
 */

import type { Database as DatabaseType } from 'better-sqlite3';

export interface PruneStaleDreamInsightsOptions {
  /**
   * How many days old an `applied = 0` insight must be before it's
   * eligible for deletion. Defaults to 30 days — matches the
   * `staleDaysThreshold` used by `pattern-lifecycle.ts` for consistency.
   */
  retentionDays?: number;
}

export interface PruneResult {
  /** Number of rows deleted. Zero if the table is empty or no rows qualify. */
  pruned: number;
}

const DEFAULT_RETENTION_DAYS = 30;

/**
 * Delete stale unapplied insights. Idempotent — safe to call on every tick.
 *
 * Returns `{ pruned: 0 }` if the table doesn't exist (init hasn't created
 * the dream schema yet) or if no rows qualify.
 */
export function pruneStaleDreamInsights(
  db: DatabaseType,
  options: PruneStaleDreamInsightsOptions = {},
): PruneResult {
  const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;

  // Guard against the table not existing yet — a freshly-init'd shop may
  // have started the worker before the dream schema was applied.
  const tableExists = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='dream_insights'",
    )
    .get();
  if (!tableExists) {
    return { pruned: 0 };
  }

  const result = db
    .prepare(
      `DELETE FROM dream_insights
         WHERE applied = 0
           AND created_at < datetime('now', ?)`,
    )
    .run(`-${retentionDays} days`);

  return { pruned: result.changes };
}
