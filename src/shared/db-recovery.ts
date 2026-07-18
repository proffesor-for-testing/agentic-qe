/**
 * Auto-restore for the unified `memory.db` (M3.2, inspired by ruflo v3.25.2's
 * backup-auto-restore, adapted to better-sqlite3).
 *
 * Hardened after a qe-court review (ADR-124) surfaced three data-loss risks in
 * the first cut:
 *   F3 — `isDbHealthy` via a readonly open + integrity_check FALSE-NEGATIVES a
 *        HEALTHY WAL db when `-shm` is zeroed/inaccessible over virtiofs (the
 *        exact documented failure mode), which would have parked a good DB and
 *        reverted to an older backup. FIX: the live-corruption signal is now the
 *        SQLite HEADER — a `-wal`/`-shm` problem does not corrupt the main file,
 *        so we only treat a missing/garbage header (zeroed/not-a-db) as corrupt.
 *   F2 — non-atomic `copyFileSync` + no lock let concurrent hook processes tear
 *        the restored image. FIX: copy to a temp in the same dir → atomic rename,
 *        under a best-effort exclusive lock so only one process restores.
 *   backup trust — a backup we are about to promote to the LIVE db still gets a
 *        FULL `integrity_check` (it is a static file, safe to open readonly).
 *
 * DATA-PROTECTION INVARIANTS (this file must never make things worse):
 *   - The corrupt original is RENAMED to `<db>.corrupt-<ts>`, NEVER deleted.
 *   - A header-valid main file is treated as HEALTHY — we never park a DB that
 *     might just have a transient `-wal`/`-shm` issue (a writable open rebuilds
 *     `-shm`). We prefer "manual restore" over "auto-destroy a healthy DB".
 *   - A backup is used only if it passes `PRAGMA integrity_check`.
 *   - If no verified backup exists, we do NOTHING (leave the DB for inspection).
 */

import {
  existsSync,
  renameSync,
  copyFileSync,
  readdirSync,
  statSync,
  openSync,
  readSync,
  closeSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import Database from 'better-sqlite3';

/** The 16-byte magic every valid SQLite database file starts with. */
const SQLITE_MAGIC = Buffer.concat([Buffer.from('SQLite format 3', 'latin1'), Buffer.from([0])]);

/**
 * True if the main DB file is structurally a database (or absent/empty = a fresh
 * DB the caller will create). LIVE-corruption signal only: it deliberately does
 * NOT open the DB or run integrity_check, because a `-wal`/`-shm` fault over
 * virtiofs makes a HEALTHY db unreadable and we must not mistake that for
 * corruption (F3). Only a missing/garbage header — the zeroed/not-a-db case —
 * is "corrupt". A header-valid-but-page-corrupt file is left for MANUAL restore
 * rather than risk auto-parking a healthy DB.
 */
export function isDbHealthy(dbPath: string): boolean {
  if (!existsSync(dbPath)) return true;
  let size: number;
  try {
    size = statSync(dbPath).size;
  } catch {
    return false;
  }
  if (size === 0) return true; // freshly-created, not yet written — not corrupt
  if (size < SQLITE_MAGIC.length) return false; // too small to be a real db

  let fd: number | undefined;
  try {
    fd = openSync(dbPath, 'r');
    const header = Buffer.alloc(SQLITE_MAGIC.length);
    readSync(fd, header, 0, SQLITE_MAGIC.length, 0);
    return header.equals(SQLITE_MAGIC);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

/** Full integrity check for a backup we are about to promote to the live DB. */
function backupIsRestorable(path: string): boolean {
  let db: Database.Database | undefined;
  try {
    db = new Database(path, { readonly: true, fileMustExist: true });
    return db.pragma('integrity_check', { simple: true }) === 'ok';
  } catch {
    return false;
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
  }
}

export interface RestoreResult {
  restored: boolean;
  reason:
    | 'healthy'
    | 'no-verified-backup'
    | 'restored-from-backup'
    | 'restore-in-progress'
    | 'park-failed'
    | 'copy-failed';
  backupUsed?: string;
  parkedTo?: string;
}

/** Default verified-backup directory (matches `scripts/aqe-db-backup.sh`). */
export function defaultBackupDir(dbPath: string): string {
  return join(dirname(dbPath), 'backups', 'verified');
}

/** Newest `memory-*.db` in the backup dir that passes a full integrity_check, or null. */
function newestVerifiedBackup(backupDir: string): string | null {
  if (!existsSync(backupDir)) return null;
  const candidates = readdirSync(backupDir)
    .filter((f) => f.startsWith('memory-') && f.endsWith('.db'))
    .map((f) => {
      const path = join(backupDir, f);
      return { path, mtime: statSync(path).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  for (const c of candidates) {
    if (backupIsRestorable(c.path)) return c.path;
  }
  return null;
}

/**
 * If `dbPath`'s main file is unambiguously corrupt (bad SQLite header), park it
 * and atomically restore the newest verified backup. No-op (and non-destructive)
 * when the DB is healthy, when no good backup exists, or when another process is
 * already restoring.
 */
export function attemptAutoRestore(
  dbPath: string,
  opts?: { backupDir?: string; now?: number }
): RestoreResult {
  if (isDbHealthy(dbPath)) return { restored: false, reason: 'healthy' };

  const backupDir = opts?.backupDir ?? defaultBackupDir(dbPath);
  const good = newestVerifiedBackup(backupDir);
  if (!good) return { restored: false, reason: 'no-verified-backup' };

  // F2: best-effort exclusive lock so concurrent processes don't both restore.
  const lockPath = `${dbPath}.restore.lock`;
  try {
    writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
  } catch {
    return { restored: false, reason: 'restore-in-progress' };
  }

  try {
    // Re-check under the lock: a peer may have just restored a healthy DB.
    if (isDbHealthy(dbPath)) return { restored: false, reason: 'healthy' };

    const ts = opts?.now ?? Date.now();
    const parked = `${dbPath}.corrupt-${ts}`;

    // Park the corrupt original + any stale WAL/shm. NEVER delete.
    try {
      if (existsSync(dbPath)) renameSync(dbPath, parked);
      for (const suffix of ['-wal', '-shm']) {
        if (existsSync(dbPath + suffix)) renameSync(dbPath + suffix, parked + suffix);
      }
    } catch {
      return { restored: false, reason: 'park-failed' };
    }

    // F2: restore atomically — copy to a temp on the same filesystem, then rename.
    const tmp = `${dbPath}.restoring-${ts}`;
    try {
      copyFileSync(good, tmp);
      renameSync(tmp, dbPath); // atomic on the same fs
    } catch {
      try {
        if (existsSync(tmp)) rmSync(tmp, { force: true });
        if (!existsSync(dbPath) && existsSync(parked)) renameSync(parked, dbPath);
      } catch {
        /* leave parked copy for manual recovery */
      }
      return { restored: false, reason: 'copy-failed' };
    }

    return { restored: true, reason: 'restored-from-backup', backupUsed: good, parkedTo: parked };
  } finally {
    try {
      rmSync(lockPath, { force: true });
    } catch {
      /* ignore */
    }
  }
}
