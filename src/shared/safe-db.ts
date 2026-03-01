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

export interface SafeDbOptions {
  /** Open in read-only mode (default: false) */
  readonly?: boolean;
  /** File must already exist (default: false) */
  fileMustExist?: boolean;
  /** Busy timeout in ms (default: 5000) */
  busyTimeout?: number;
  /** Enable WAL mode (default: true for writable, false for readonly) */
  walMode?: boolean;
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

  const db = new Database(dbPath, {
    readonly,
    fileMustExist,
  });

  // Always set busy_timeout — even for readonly connections.
  // Without this, concurrent access gets SQLITE_BUSY immediately.
  db.pragma(`busy_timeout = ${busyTimeout}`);

  // WAL mode for writable connections prevents corruption from concurrent writers.
  // Readonly connections inherit WAL from the DB file but we set it explicitly
  // to be safe in case the DB was created without WAL.
  if (walMode) {
    db.pragma('journal_mode = WAL');
  }

  return db;
}
