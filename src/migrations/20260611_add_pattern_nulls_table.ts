/**
 * Agentic QE v3 - Pattern Nulls Migration (ADR-110, issue #522)
 *
 * Kept nulls: first-class negative pattern records. When an applied pattern
 * fails in a context, the failure is stored and consolidated per
 * (pattern, context_fingerprint) so retrieval can surface "succeeded 12x,
 * failed 3x — failures clustered in <context>" and ranking can discount by
 * context-matched null density. Nulls are information, not tombstones —
 * never deleted on pattern success elsewhere.
 *
 * Additive-only: no existing table or row is touched.
 */

import type { Database as DatabaseType } from 'better-sqlite3';

export const MIGRATION_VERSION = '20260611_add_pattern_nulls_table';

export const PATTERN_NULLS_SCHEMA = `
  -- Negative pattern records (ADR-110 kept nulls)
  CREATE TABLE IF NOT EXISTS qe_pattern_nulls (
    id TEXT PRIMARY KEY,
    pattern_id TEXT NOT NULL REFERENCES qe_patterns(id),
    context_fingerprint TEXT NOT NULL,
    failure_mode TEXT NOT NULL,
    trajectory_ref TEXT,
    evidence_class TEXT NOT NULL DEFAULT 'EXECUTED'
      CHECK (evidence_class IN ('EXECUTED','STATIC','INFERRED','CONJECTURE')),
    consolidated_count INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE (pattern_id, context_fingerprint)
  );

  CREATE INDEX IF NOT EXISTS idx_pattern_nulls_pattern ON qe_pattern_nulls(pattern_id);
  CREATE INDEX IF NOT EXISTS idx_pattern_nulls_context ON qe_pattern_nulls(context_fingerprint);
`;

export function applyMigration(db: DatabaseType): void {
  db.exec(PATTERN_NULLS_SCHEMA);
}

export function isMigrationApplied(db: DatabaseType): boolean {
  try {
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM sqlite_master
      WHERE type='table' AND name = 'qe_pattern_nulls'
    `).get() as { count: number };
    return result.count === 1;
  } catch {
    return false;
  }
}

export function rollbackMigration(db: DatabaseType): void {
  // Safety check: refuse to drop a table that contains data (kept nulls are data)
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM qe_pattern_nulls').get() as { cnt: number } | undefined)?.cnt ?? 0;
  if (count > 0) {
    throw new Error(
      `REFUSING rollback: qe_pattern_nulls contains ${count} kept nulls. ` +
      'Backup and manually drop if you really need to rollback.'
    );
  }
  db.exec('DROP TABLE IF EXISTS qe_pattern_nulls;');
}

export default {
  version: MIGRATION_VERSION,
  apply: applyMigration,
  isApplied: isMigrationApplied,
  rollback: rollbackMigration,
};
