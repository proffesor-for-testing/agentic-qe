/**
 * Agentic QE v3 - Dream insights archive table (#1066, #1116)
 *
 * The dream_insights retention sweep copies each stale insight here before it
 * deletes it (#1066). Until #1116 the sweep created the table lazily on its
 * first run, outside the versioned schema; it is now created by the v14
 * migration.
 *
 * Additive and idempotent: `CREATE ... IF NOT EXISTS` only, so a database where
 * an earlier sweep already created the table (with its rows) is left as it
 * is, and an older AQE that still creates it lazily with the same statement
 * keeps working on a migrated database.
 *
 * Same columns as dream_insights plus archive_id and archived_at. `id` is not
 * unique here: an insight that comes back (for example from a brain import)
 * and is swept again gets a second row instead of replacing the first. No
 * foreign key, so deleting a dream cycle does not cascade into the archive.
 */

import type { Database as DatabaseType } from 'better-sqlite3';

export const MIGRATION_VERSION = '20261018_add_dream_insights_archive';

export const DREAM_INSIGHTS_ARCHIVE_TABLE = 'dream_insights_archive';

/** The table, exactly as the 3.15.9 sweep created it lazily. */
export const DREAM_INSIGHTS_ARCHIVE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${DREAM_INSIGHTS_ARCHIVE_TABLE} (
    archive_id INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL,
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

export const DREAM_INSIGHTS_ARCHIVE_SCHEMA = `
  ${DREAM_INSIGHTS_ARCHIVE_TABLE_SQL};
  -- The sweep's read-back looks copies up by insight id.
  CREATE INDEX IF NOT EXISTS idx_dream_insights_archive_id ON ${DREAM_INSIGHTS_ARCHIVE_TABLE}(id);
`;

export function applyMigration(db: DatabaseType): void {
  db.exec(DREAM_INSIGHTS_ARCHIVE_SCHEMA);
}

export function isMigrationApplied(db: DatabaseType): boolean {
  try {
    const result = db.prepare(
      `SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?`
    ).get(DREAM_INSIGHTS_ARCHIVE_TABLE) as { count: number };
    return result.count === 1;
  } catch {
    return false;
  }
}
