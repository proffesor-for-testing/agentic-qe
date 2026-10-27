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
