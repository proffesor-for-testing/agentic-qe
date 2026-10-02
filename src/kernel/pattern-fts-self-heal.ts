/**
 * qe_patterns FTS5 self-heal (runs on every open, not gated on schema version)
 *
 * `qe_patterns_fts` is an FTS5 *external-content* table: it stores only the
 * inverted index, and the three AFTER INSERT/UPDATE/DELETE triggers on
 * qe_patterns are the ONLY thing keeping it in sync. Migration v9 creates them
 * once (`currentVersion < 9`), so a database whose triggers were lost later
 * (older code, a `.recover`, a copy/restore, a manual drop...) never heals:
 * new patterns are invisible to keyword search and deleted ones linger as
 * stale entries that skew BM25. Since hybrid FTS5+vector retrieval (#780/#796)
 * keyword search is part of production ranking, so drift silently degrades
 * retrieval and anything that locates a pattern through FTS.
 *
 * This module detects that state cheaply and repairs it idempotently:
 *   1. qe_patterns exists but qe_patterns_fts doesn't  -> create the table
 *   2. any sync trigger missing                         -> recreate it (shared DDL)
 *   3. a sync trigger whose body differs from the shared DDL -> drop + recreate
 *      (CREATE TRIGGER IF NOT EXISTS never replaces a same-named trigger)
 *   4. any of the above OR index rowids != content rowids -> FTS5 'rebuild'
 *
 * Detection is read-only (counts + one anti-join on the docsize PK); the write
 * transaction (BEGIN IMMEDIATE) is taken only when a repair is needed. It never
 * throws: failures are logged and the caller continues (FTS search already
 * degrades to vector-only). Read-only connections are skipped entirely.
 *
 * The 'rebuild' command reconstructs the index from the content table and
 * never modifies qe_patterns rows.
 */

import type { Database as DatabaseType } from 'better-sqlite3';
import { toErrorMessage } from '../shared/error-utils.js';
import {
  QE_PATTERNS_FTS_TABLE_DDL,
  QE_PATTERNS_FTS_TRIGGER_DDL,
} from './unified-memory-schemas.js';

/** Names of the triggers that keep qe_patterns_fts in sync. */
export const QE_PATTERNS_FTS_TRIGGERS = Object.keys(QE_PATTERNS_FTS_TRIGGER_DDL);

export type PatternFtsHealStatus =
  | 'healthy'      // nothing to do
  | 'healed'       // repaired (see fields for what)
  | 'no-patterns'  // qe_patterns table absent: nothing to index
  | 'readonly'     // connection is read-only: detection and repair skipped
  | 'failed';      // repair attempted but failed (logged, not thrown)

export interface PatternFtsHealResult {
  status: PatternFtsHealStatus;
  /** True when qe_patterns_fts had to be created. */
  createdTable: boolean;
  /** Triggers that were missing and have been recreated. */
  recreatedTriggers: string[];
  /** Triggers whose body differed from the shared DDL and have been replaced. */
  replacedTriggers: string[];
  /** True when the FTS5 'rebuild' command ran. */
  rebuilt: boolean;
  /** qe_patterns row count observed before repair (-1 if unknown). */
  patternsBefore: number;
  /** Indexed document count before repair (-1 if unknown / no table). */
  indexedBefore: number;
  /** Indexed document count after repair (-1 if not repaired). */
  indexedAfter: number;
  error?: string;
}

export interface PatternFtsHealOptions {
  /** Log sink for the single heal/failure line. Defaults to console.warn. */
  log?: (message: string) => void;
  /** Prefix for the log line, e.g. "[UnifiedMemory]". */
  logPrefix?: string;
}

interface Inspection {
  hasTable: boolean;
  hasDocsize: boolean;
  missingTriggers: string[];
  /** Present triggers whose SQL differs from the canonical DDL. */
  mismatchedTriggers: string[];
  patterns: number;
  indexed: number;
  /** qe_patterns rowids with no index entry (only computed when counts match). */
  unindexed: number;
}

function objectExists(db: DatabaseType, type: 'table' | 'trigger', name: string): boolean {
  return db.prepare('SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?').get(type, name) !== undefined;
}

/**
 * Canonical form of a CREATE TRIGGER statement for comparison: sqlite_master
 * stores the text as written minus IF NOT EXISTS, and older code paths used
 * different indentation, so collapse whitespace and drop the clause/semicolon.
 */
function normalizeTriggerSql(sql: string): string {
  return sql
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^CREATE TRIGGER IF NOT EXISTS /i, 'CREATE TRIGGER ')
    .replace(/ ?;$/, '')
    .toLowerCase();
}

const CANONICAL_TRIGGER_SQL: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    Object.entries(QE_PATTERNS_FTS_TRIGGER_DDL).map(([name, ddl]) => [name, normalizeTriggerSql(ddl)]),
  ),
);

function count(db: DatabaseType, sql: string): number {
  const row = db.prepare(sql).get() as { n: number } | undefined;
  return row?.n ?? 0;
}

/**
 * Read-only inspection. `qe_patterns_fts_docsize` holds exactly one row per
 * indexed document (id = content rowid; columnsize defaults to on), so
 * comparing it with qe_patterns detects both unindexed and stale entries
 * without scanning the index itself. `SELECT count(*) FROM qe_patterns_fts`
 * is NOT usable: for an external-content table it reads the content table.
 */
function inspect(db: DatabaseType): Inspection {
  const hasTable = objectExists(db, 'table', 'qe_patterns_fts');
  const hasDocsize = hasTable && objectExists(db, 'table', 'qe_patterns_fts_docsize');
  const missingTriggers: string[] = [];
  const mismatchedTriggers: string[] = [];
  const triggerSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?");
  for (const name of QE_PATTERNS_FTS_TRIGGERS) {
    const row = triggerSql.get(name) as { sql: string | null } | undefined;
    if (row === undefined) missingTriggers.push(name);
    else if (normalizeTriggerSql(row.sql ?? '') !== CANONICAL_TRIGGER_SQL[name]) mismatchedTriggers.push(name);
  }
  const patterns = count(db, 'SELECT count(*) AS n FROM qe_patterns');
  const indexed = hasDocsize ? count(db, 'SELECT count(*) AS n FROM qe_patterns_fts_docsize') : -1;
  // Equal counts + every content rowid indexed => identical rowid sets (both
  // sides are unique), so one anti-join over the docsize PK suffices.
  const unindexed = hasDocsize && indexed === patterns
    ? count(db, `SELECT count(*) AS n FROM qe_patterns p
                 WHERE NOT EXISTS (SELECT 1 FROM qe_patterns_fts_docsize d WHERE d.id = p.rowid)`)
    : 0;
  return { hasTable, hasDocsize, missingTriggers, mismatchedTriggers, patterns, indexed, unindexed };
}

function needsRepair(s: Inspection): boolean {
  if (!s.hasTable || s.missingTriggers.length > 0 || s.mismatchedTriggers.length > 0) return true;
  // Without a docsize table (non-default FTS options) drift can't be measured
  // cheaply; trust the triggers rather than rebuilding on every open.
  if (!s.hasDocsize) return false;
  return s.indexed !== s.patterns || s.unindexed > 0;
}

function isReadOnly(db: DatabaseType): boolean {
  if (db.readonly) return true;
  try {
    return Number(db.pragma('query_only', { simple: true })) === 1;
  } catch {
    return false;
  }
}

/**
 * Ensure qe_patterns_fts exists, has its three sync triggers, and indexes
 * exactly the rows of qe_patterns. Idempotent and silent when healthy; logs
 * one line when it repairs something; never throws.
 */
export function ensurePatternFtsInSync(
  db: DatabaseType,
  options: PatternFtsHealOptions = {},
): PatternFtsHealResult {
  const log = options.log ?? ((m: string) => console.warn(m));
  const prefix = options.logPrefix ?? '[PatternFTS]';
  const result: PatternFtsHealResult = {
    status: 'healthy',
    createdTable: false,
    recreatedTriggers: [],
    replacedTriggers: [],
    rebuilt: false,
    patternsBefore: -1,
    indexedBefore: -1,
    indexedAfter: -1,
  };

  try {
    if (!objectExists(db, 'table', 'qe_patterns')) {
      result.status = 'no-patterns';
      return result;
    }
    if (isReadOnly(db)) {
      result.status = 'readonly';
      return result;
    }

    const before = inspect(db);
    result.patternsBefore = before.patterns;
    result.indexedBefore = before.indexed;
    if (!needsRepair(before)) return result;

    // Re-inspect inside BEGIN IMMEDIATE so a concurrent opener that already
    // healed (or is mid-write) is observed under the write lock. Results are
    // only published after COMMIT succeeds: a failed commit rolls everything
    // back and must not be reported as a repair.
    const repaired = db.transaction(() => {
      const s = inspect(db);
      if (!needsRepair(s)) return null;
      if (!s.hasTable) db.exec(QE_PATTERNS_FTS_TABLE_DDL);
      for (const name of s.missingTriggers) db.exec(QE_PATTERNS_FTS_TRIGGER_DDL[name]);
      for (const name of s.mismatchedTriggers) {
        db.exec(`DROP TRIGGER IF EXISTS ${name}`);
        db.exec(QE_PATTERNS_FTS_TRIGGER_DDL[name]);
      }
      // Rebuild from the content table: clears stale entries and indexes rows
      // inserted/updated while triggers were absent. Never touches qe_patterns.
      db.exec("INSERT INTO qe_patterns_fts(qe_patterns_fts) VALUES('rebuild')");
      return { s, indexedAfter: count(db, 'SELECT count(*) AS n FROM qe_patterns_fts_docsize') };
    }).immediate();

    if (repaired) {
      const { s } = repaired;
      result.createdTable = !s.hasTable;
      result.recreatedTriggers = [...s.missingTriggers];
      result.replacedTriggers = [...s.mismatchedTriggers];
      result.patternsBefore = s.patterns;
      result.indexedBefore = s.indexed;
      result.indexedAfter = repaired.indexedAfter;
      result.rebuilt = true;
    }

    if (result.rebuilt) {
      result.status = 'healed';
      const parts: string[] = [];
      if (result.createdTable) parts.push('created qe_patterns_fts');
      if (result.recreatedTriggers.length > 0) {
        parts.push(`recreated triggers [${result.recreatedTriggers.join(', ')}]`);
      }
      if (result.replacedTriggers.length > 0) {
        parts.push(`replaced triggers [${result.replacedTriggers.join(', ')}]`);
      }
      const indexedBefore = result.indexedBefore < 0 ? 'n/a' : String(result.indexedBefore);
      parts.push(`rebuilt index (indexed ${indexedBefore} -> ${result.indexedAfter}, qe_patterns ${result.patternsBefore})`);
      log(`${prefix} Healed qe_patterns FTS5 index: ${parts.join('; ')}`);
    }
    return result;
  } catch (error) {
    result.status = 'failed';
    result.error = toErrorMessage(error);
    try {
      log(`${prefix} qe_patterns FTS5 self-heal skipped: ${result.error} (keyword search may be degraded; vector search unaffected)`);
    } catch { /* logging must never break open */ }
    return result;
  }
}
