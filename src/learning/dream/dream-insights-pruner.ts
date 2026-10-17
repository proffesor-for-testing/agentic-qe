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
 * Strategy: move out of `dream_insights` only insights that:
 *   - have never been applied (`applied = 0`), AND
 *   - are older than the retention window (default 30 days)
 *
 * #1066: rows are archived, not lost. In one transaction each qualifying row
 * is copied to `dream_insights_archive`, the copies are read back, and only
 * rows whose copy is present are deleted. If the read-back does not match,
 * the transaction rolls back and nothing is deleted.
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
  /** Number of rows copied to `dream_insights_archive` before the delete. */
  archived: number;
}

const DEFAULT_RETENTION_DAYS = 30;

/** Table that keeps every insight the sweep removes from `dream_insights`. */
export const DREAM_INSIGHTS_ARCHIVE_TABLE = 'dream_insights_archive';

// Same columns as dream_insights plus archived_at. No foreign key, so
// deleting a dream cycle does not cascade into the archive.
const CREATE_ARCHIVE_SQL = `
  CREATE TABLE IF NOT EXISTS ${DREAM_INSIGHTS_ARCHIVE_TABLE} (
    id TEXT PRIMARY KEY,
    cycle_id TEXT,
    insight_type TEXT,
    source_concepts TEXT,
    description TEXT,
    novelty_score REAL,
    confidence_score REAL,
    actionable INTEGER,
    applied INTEGER,
    suggested_action TEXT,
    pattern_id TEXT,
    created_at TEXT,
    archived_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

function columnNames(db: DatabaseType, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);
}

/**
 * Archive, then delete, stale unapplied insights. Idempotent — safe to call
 * on every tick.
 *
 * Returns `{ pruned: 0, archived: 0 }` if the table doesn't exist (init hasn't
 * created the dream schema yet) or if no rows qualify. Throws, with nothing
 * deleted, if the archive copy cannot be verified.
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
    return { pruned: 0, archived: 0 };
  }

  // One cutoff for every statement below, so the copy, the check and the
  // delete all see the same set of rows.
  const { cutoff } = db
    .prepare(`SELECT datetime('now', ?) AS cutoff`)
    .get(`-${retentionDays} days`) as { cutoff: string };
  const stale = 'd.applied = 0 AND d.created_at < ?';

  const sweep = db.transaction((): PruneResult => {
    const candidates = (db
      .prepare(`SELECT COUNT(*) AS n FROM dream_insights d WHERE ${stale}`)
      .get(cutoff) as { n: number }).n;
    if (candidates === 0) return { pruned: 0, archived: 0 };

    db.exec(CREATE_ARCHIVE_SQL);
    // Copy the columns both tables have; older databases may lack some.
    const archiveColumns = new Set(columnNames(db, DREAM_INSIGHTS_ARCHIVE_TABLE));
    const shared = columnNames(db, 'dream_insights').filter(
      (name) => name !== 'archived_at' && archiveColumns.has(name),
    );
    const list = shared.map((name) => `"${name}"`).join(', ');
    const archived = db
      .prepare(
        `INSERT OR REPLACE INTO ${DREAM_INSIGHTS_ARCHIVE_TABLE} (${list}, archived_at)
           SELECT ${shared.map((name) => `d."${name}"`).join(', ')}, datetime('now')
             FROM dream_insights d WHERE ${stale}`,
      )
      .run(cutoff).changes;

    // Read back: every row about to be deleted must have its copy.
    const copied = (db
      .prepare(
        `SELECT COUNT(*) AS n FROM dream_insights d
           JOIN ${DREAM_INSIGHTS_ARCHIVE_TABLE} a ON a.id = d.id
          WHERE ${stale}`,
      )
      .get(cutoff) as { n: number }).n;
    if (copied !== candidates) {
      throw new Error(
        `dream_insights archive check failed: ${copied} of ${candidates} rows copied; nothing deleted`,
      );
    }

    const pruned = db
      .prepare(
        `DELETE FROM dream_insights
          WHERE applied = 0 AND created_at < ?
            AND id IN (SELECT id FROM ${DREAM_INSIGHTS_ARCHIVE_TABLE})`,
      )
      .run(cutoff).changes;

    // Read back: the stale rows are gone and none was deleted uncopied.
    const left = (db
      .prepare(`SELECT COUNT(*) AS n FROM dream_insights d WHERE ${stale}`)
      .get(cutoff) as { n: number }).n;
    if (pruned !== candidates || left !== 0) {
      throw new Error(
        `dream_insights delete check failed: deleted ${pruned} of ${candidates}, ${left} left; rolled back`,
      );
    }
    return { pruned, archived };
  });

  return sweep();
}
