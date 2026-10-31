/**
 * Switch a SQLite connection's journal mode, retrying lock contention (#1164).
 *
 * `PRAGMA journal_mode = WAL` on a rollback-journal database reads page 1
 * under a SHARED lock and then upgrades to a write lock to rewrite the header.
 * SQLite does not run the busy handler for that upgrade (an upgrade from a
 * held read lock could deadlock), so when several processes open the same
 * non-WAL database at once, all but one can get SQLITE_BUSY in well under a
 * millisecond even with busy_timeout set. Leaving WAL needs an EXCLUSIVE lock
 * and fails the same way.
 *
 * This retries the switch with a short, growing sleep until `budgetMs` has
 * passed, then throws the last error. Once another process has switched the
 * file, the retry finds the mode already set, which needs no write lock.
 *
 * Dependency-free (no better-sqlite3 import) so optional-dependency callers can
 * use it with a connection they loaded themselves.
 */

/** The part of a better-sqlite3 connection this needs. */
export interface JournalModeConnection {
  pragma(source: string, options?: { simple?: boolean }): unknown;
}

export interface JournalModeRetryOptions {
  /** Synchronous sleep, injectable for tests. */
  sleep?: (ms: number) => void;
  /** Clock in ms, injectable for tests. */
  now?: () => number;
}

const FIRST_BACKOFF_MS = 2;
const MAX_BACKOFF_MS = 50;

/** True for SQLITE_BUSY / SQLITE_LOCKED, including extended codes such as SQLITE_BUSY_RECOVERY. */
export function isJournalLockContention(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && (code.startsWith('SQLITE_BUSY') || code.startsWith('SQLITE_LOCKED'));
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Set `journal_mode` to `mode`, retrying SQLITE_BUSY / SQLITE_LOCKED for up to
 * `budgetMs`. Returns the mode SQLite reports afterwards, lower-cased. Any
 * other error is thrown at once.
 */
export function setJournalModeWithRetry(
  db: JournalModeConnection,
  mode: string,
  budgetMs: number,
  options: JournalModeRetryOptions = {},
): string {
  const sleep = options.sleep ?? sleepSync;
  const now = options.now ?? Date.now;
  const deadline = now() + Math.max(0, budgetMs);
  let backoff = FIRST_BACKOFF_MS;
  for (;;) {
    try {
      return String(db.pragma(`journal_mode = ${mode}`, { simple: true }) ?? '').toLowerCase();
    } catch (err) {
      const remaining = deadline - now();
      if (!isJournalLockContention(err) || remaining <= 0) throw err;
      // Jitter so processes that collided do not retry in lockstep.
      sleep(Math.min(remaining, backoff / 2 + Math.random() * backoff / 2));
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    }
  }
}
