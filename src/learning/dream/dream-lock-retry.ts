/**
 * Lock waits for dream writes (#1253).
 *
 * better-sqlite3 waits for a locked database synchronously, so a long
 * busy_timeout freezes the whole process: in the MCP server that is the event
 * loop and every tool call. Dream writes therefore wait only briefly per
 * attempt and retry asynchronously, so other work runs between attempts.
 */

import type { Database as DatabaseType } from 'better-sqlite3';

/** Longest a single dream write attempt blocks the process on a locked database. */
export const DREAM_LOCK_WAIT_MS = 200;

/** Total time a dream write keeps retrying a locked database before it fails. */
export const DREAM_LOCK_RETRY_BUDGET_MS = 60_000;

/** Longest pause between attempts; the pause doubles from 25 ms up to this. */
const MAX_BACKOFF_MS = 1000;

/** True for SQLite "database is locked" / "busy" failures. */
export function isBusyError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && /^SQLITE_(BUSY|LOCKED)/.test(code)) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /database is locked|database table is locked|SQLITE_BUSY/i.test(message);
}

/** Run `fn` with a temporary busy_timeout, restoring the connection's previous value. */
export function withBusyTimeout<T>(db: DatabaseType, timeoutMs: number, fn: () => T): T {
  const previous = db.pragma('busy_timeout', { simple: true }) as number;
  db.pragma(`busy_timeout = ${timeoutMs}`);
  try {
    return fn();
  } finally {
    try { db.pragma(`busy_timeout = ${previous}`); } catch { /* connection closed */ }
  }
}

export interface RetryWhileBusyOptions {
  /** Synchronous wait per attempt (default DREAM_LOCK_WAIT_MS). */
  waitMs?: number;
  /** Total retry time before the busy error is thrown (default DREAM_LOCK_RETRY_BUDGET_MS). */
  budgetMs?: number;
  /** Checked before every attempt; when false, `cancelledError` is thrown instead of retrying. */
  shouldContinue?: () => boolean;
  cancelledError?: () => Error;
  /**
   * Keep trying until the whole budget has passed (#1356). By default the
   * retry gives up as soon as the next backoff would cross the budget, which
   * can be up to a second early; with this set it sleeps only the remaining
   * time and makes one last attempt at the deadline, so the total patience
   * matches a synchronous busy_timeout of `budgetMs`.
   */
  useWholeBudget?: boolean;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/**
 * Run a synchronous write, retrying while the database is locked. Each attempt
 * blocks for at most `waitMs`; between attempts the event loop is free. Errors
 * other than a busy database are thrown at once.
 */
export async function retryWhileBusy<T>(
  db: DatabaseType,
  fn: () => T,
  options: RetryWhileBusyOptions = {},
): Promise<T> {
  const waitMs = options.waitMs ?? DREAM_LOCK_WAIT_MS;
  const budgetMs = options.budgetMs ?? DREAM_LOCK_RETRY_BUDGET_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = options.now ?? Date.now;
  const started = now();
  let backoff = 25;
  for (;;) {
    if (options.shouldContinue && !options.shouldContinue()) {
      throw options.cancelledError?.() ?? new Error('Cancelled while waiting for a locked database');
    }
    let pause: number;
    try {
      return withBusyTimeout(db, waitMs, fn);
    } catch (error) {
      if (!isBusyError(error)) throw error;
      const remaining = budgetMs - (now() - started);
      if (remaining <= 0 || (!options.useWholeBudget && backoff >= remaining)) throw error;
      pause = Math.min(backoff, remaining);
    }
    await sleep(pause);
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  }
}

/** Wait for the synchronous best-effort write made while a dream is interrupted at shutdown. */
export const DREAM_SHUTDOWN_LOCK_WAIT_MS = 1000;
