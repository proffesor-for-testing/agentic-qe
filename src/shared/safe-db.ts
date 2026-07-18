/**
 * Safe Database Opener
 *
 * ALL code that opens memory.db MUST use this utility instead of `new Database()` directly.
 * This ensures WAL mode and busy_timeout are always set, preventing corruption from
 * concurrent writers (e.g., multiple Claude Code hook processes hitting the DB simultaneously).
 *
 * Root cause: 40+ places in the codebase opened the DB with `new Database()` without
 * WAL or busy_timeout. When multiple hook processes ran concurrently, the DB corrupted.
 */

import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { attemptAutoRestore } from './db-recovery.js';

export interface SafeDbOptions {
  /** Open in read-only mode (default: false) */
  readonly?: boolean;
  /** File must already exist (default: false) */
  fileMustExist?: boolean;
  /** Busy timeout in ms (default: 5000) */
  busyTimeout?: number;
  /** Enable WAL mode (default: true for writable, false for readonly) */
  walMode?: boolean;
  /**
   * M3.2: on a malformed/corrupt existing DB, auto-restore the newest verified
   * backup (from `.agentic-qe/backups/verified/`) and park the corrupt original,
   * instead of opening a broken DB. Default false; enable for the unified
   * `memory.db` open. Non-destructive: the corrupt file is renamed, never deleted,
   * and nothing happens if no verified backup exists. Ignored for readonly opens.
   */
  autoRestore?: boolean;
  /** Override the verified-backup directory used by autoRestore. */
  backupDir?: string;
}

/**
 * Open a SQLite database with safe defaults that prevent corruption.
 *
 * Always sets:
 * - journal_mode = WAL (for writable connections)
 * - busy_timeout = 5000ms (waits instead of failing on lock contention)
 *
 * Use this instead of `new Database()` everywhere.
 */
export function openDatabase(dbPath: string, opts?: SafeDbOptions): DatabaseType {
  const readonly = opts?.readonly ?? false;
  const fileMustExist = opts?.fileMustExist ?? false;
  const busyTimeout = opts?.busyTimeout ?? 5000;
  const walMode = opts?.walMode ?? !readonly;

  // M3.2: recover a malformed DB from a verified backup BEFORE opening it, so a
  // corrupt memory.db self-heals instead of surfacing errors on first query.
  // Non-destructive + no-op unless enabled and actually needed.
  if (opts?.autoRestore && !readonly) {
    const result = attemptAutoRestore(dbPath, { backupDir: opts.backupDir });
    if (result.restored) {
      console.warn(
        `[safe-db] memory DB at ${dbPath} was malformed; auto-restored from ` +
          `${result.backupUsed}. Corrupt original parked at ${result.parkedTo}.`
      );
    } else if (result.reason === 'no-verified-backup') {
      // Reached only when the DB is malformed (attemptAutoRestore short-circuits
      // 'healthy' first) — corrupt AND no backup to restore from.
      console.error(
        `[safe-db] memory DB at ${dbPath} appears malformed and NO verified backup ` +
          `was found to restore from. Leaving it in place for manual inspection.`
      );
    }
  }

  // Environment override for filesystems where WAL is UNSAFE. WAL prevents
  // concurrent-writer corruption on a normal filesystem, but on a macOS
  // Docker/virtiofs bind mount the `-shm` mmap coherence across the
  // host/container boundary is broken, so WAL checkpoints can zero pages and
  // corrupt the DB (observed 2026-06-08 and again 2026-07-07). On such a mount,
  // set AQE_DISABLE_WAL=1 (or AQE_JOURNAL_MODE=DELETE|TRUNCATE) so this process
  // opens the DB in a rollback-journal mode instead. Default behavior is
  // unchanged: without the env var, writable connections still use WAL.
  const journalOverride = (process.env.AQE_JOURNAL_MODE ?? '').trim().toUpperCase();
  const disableWal =
    process.env.AQE_DISABLE_WAL === '1' ||
    journalOverride === 'DELETE' ||
    journalOverride === 'TRUNCATE';

  const db = new Database(dbPath, {
    readonly,
    fileMustExist,
  });

  // Always set busy_timeout — even for readonly connections.
  // Without this, concurrent access gets SQLITE_BUSY immediately.
  db.pragma(`busy_timeout = ${busyTimeout}`);

  if (disableWal) {
    // Explicit opt-out of WAL for this environment. Readonly connections cannot
    // change journal_mode, so only apply to writable opens.
    if (!readonly) {
      db.pragma(`journal_mode = ${journalOverride || 'DELETE'}`);
    }
  } else if (walMode) {
    // WAL mode for writable connections prevents corruption from concurrent
    // writers. Readonly connections inherit WAL from the DB file but we set it
    // explicitly to be safe in case the DB was created without WAL.
    db.pragma('journal_mode = WAL');
  }

  return db;
}
