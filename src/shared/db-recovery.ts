/**
 * Auto-restore for the unified `memory.db` (M3.2, inspired by ruflo v3.25.2's
 * backup-auto-restore, adapted to better-sqlite3).
 *
 * When the DB opens malformed (a torn write, a virtiofs WAL/shm zeroing — see
 * `safe-db.ts` — or "file is not a database"), recovery restores the newest
 * integrity-verified snapshot from `.agentic-qe/backups/verified/` and PARKS the
 * corrupt original. This turns "1K+ irreplaceable learning records lost + manual
 * restore" (the pre-M3.2 state — `unified-memory.ts` told the operator to restore
 * by hand) into automatic recovery.
 *
 * DATA-PROTECTION INVARIANTS (this file must never make things worse):
 *   - The corrupt original is RENAMED to `<db>.corrupt-<ts>`, NEVER deleted.
 *   - A backup is used only if it passes `PRAGMA integrity_check`.
 *   - Stale `-wal`/`-shm` are parked alongside (CLAUDE.md: remove stale WAL/shm on restore).
 *   - If no verified backup exists, we do NOTHING and leave the DB in place for
 *     manual inspection — recovery is opt-in and fail-safe, never destructive.
 */

import {
  existsSync,
  renameSync,
  copyFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import Database from 'better-sqlite3';

/**
 * True if the DB opens and passes a quick integrity check. An ABSENT file is
 * "healthy" (a fresh DB the caller will create) — only an EXISTING-but-corrupt
 * file is unhealthy.
 */
export function isDbHealthy(dbPath: string): boolean {
  if (!existsSync(dbPath)) return true;
  let db: Database.Database | undefined;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    // simple:true → first cell of the first row: 'ok' when healthy.
    const result = db.pragma('integrity_check', { simple: true });
    return result === 'ok';
  } catch {
    // SQLITE_CORRUPT / "file is not a database" / malformed header.
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
    | 'park-failed'
    | 'copy-failed';
  backupUsed?: string;
  parkedTo?: string;
}

/** Default verified-backup directory (matches `scripts/aqe-db-backup.sh`). */
export function defaultBackupDir(dbPath: string): string {
  return join(dirname(dbPath), 'backups', 'verified');
}

/** Newest `memory-*.db` in the backup dir that itself passes integrity_check, or null. */
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
    if (isDbHealthy(c.path)) return c.path;
  }
  return null;
}

/**
 * If `dbPath` is malformed, park it and restore the newest verified backup.
 * No-op (and non-destructive) when the DB is healthy or no good backup exists.
 * Pure w.r.t. the DB engine — only filesystem moves/copies, so it is safe to
 * call before opening the database.
 */
export function attemptAutoRestore(
  dbPath: string,
  opts?: { backupDir?: string; now?: number }
): RestoreResult {
  if (isDbHealthy(dbPath)) return { restored: false, reason: 'healthy' };

  const backupDir = opts?.backupDir ?? defaultBackupDir(dbPath);
  const good = newestVerifiedBackup(backupDir);
  if (!good) return { restored: false, reason: 'no-verified-backup' };

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

  // Restore the verified backup into place.
  try {
    copyFileSync(good, dbPath);
  } catch {
    // Best-effort un-park so the original path isn't left empty.
    try {
      if (!existsSync(dbPath) && existsSync(parked)) renameSync(parked, dbPath);
    } catch {
      /* leave parked copy for manual recovery */
    }
    return { restored: false, reason: 'copy-failed' };
  }

  return { restored: true, reason: 'restored-from-backup', backupUsed: good, parkedTo: parked };
}
