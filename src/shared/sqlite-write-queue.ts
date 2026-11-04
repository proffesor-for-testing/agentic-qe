/**
 * Which SQLite connections have a write queue (#1283).
 *
 * UnifiedMemoryManager registers its shared memory.db connection here while it
 * is open, with its writeWhenUnlocked queue. Modules that hold only the raw
 * connection route writes through `writeWhenUnlockedOn` without importing
 * unified-memory's sqlite graph: on a registered connection the write is
 * queued (FIFO, retried asynchronously under the MCP server's lock wait cap,
 * full busy_timeout budget), so a locked memory.db does not freeze the event
 * loop. A write on any other connection runs now, as it always did.
 *
 * Modules that open memory.db themselves look the shared connection up by
 * file with `queuedConnectionFor` (#1356), so their writes join the same
 * queue instead of waiting synchronously on a second connection.
 *
 * Dependency-free (Node built-ins and sqlite-lock-wait only) so any module can
 * import it.
 */

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { getLockWaitCap } from './sqlite-lock-wait.js';

/** A connection's FIFO write queue: runs `fn` when the database is unlocked. */
export type WriteQueue = <T>(fn: () => T) => Promise<T>;

const queues = new WeakMap<object, WriteQueue>();
/** Registered connections by database file (realpath), for queuedConnectionFor. */
const byFile = new Map<string, object>();

/** Canonical key for a database file: its realpath, or the resolved path when it does not exist. */
function fileKey(dbPath: string): string {
  const absolute = resolve(dbPath);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}

/** The file a connection was opened on (better-sqlite3's `name`), or null for in-memory/temp databases. */
function fileOf(db: object): string | null {
  const name = (db as { name?: unknown }).name;
  if (typeof name !== 'string' || name === '' || name === ':memory:') return null;
  return fileKey(name);
}

/** Route writes on `db` through `queue` until unregistered. */
export function registerWriteQueue(db: object, queue: WriteQueue): void {
  queues.set(db, queue);
  const file = fileOf(db);
  if (file) byFile.set(file, db);
}

/** Stop routing writes on `db` (the connection is closing). */
export function unregisterWriteQueue(db: object): void {
  queues.delete(db);
  for (const [file, registered] of byFile) {
    if (registered === db) byFile.delete(file);
  }
}

/**
 * The open, queued connection on `dbPath`, if one is registered (#1356). A
 * module that would otherwise open its own connection to that file uses this
 * one instead, must not close it, and routes its writes through
 * `writeWhenUnlockedOn`. Undefined for any other file, so a custom path keeps
 * its own connection.
 *
 * Only a connection that UnifiedMemoryManager.initialize() has already
 * registered can be borrowed (it registers at the end of init): a module that
 * looks it up earlier gets undefined, opens its own connection, and its writes
 * are not queued, as before #1356. So borrow at first use, not at
 * construction, and report a fallback with `isUnqueuedFallback`.
 *
 * The borrower holds the shared handle, not a copy. Once the manager closes
 * it (UnifiedMemoryManager.close(), resetUnifiedMemory/resetUnifiedPersistence,
 * test-only outside shutdown today) the handle is dead and every call on it
 * throws. A long-lived borrower, such as DreamScheduler's metricsTracker or
 * the code-intelligence coordinator's hypergraph engine, must not outlive
 * the manager.
 */
export function queuedConnectionFor<T extends object = object>(dbPath: string): T | undefined {
  if (!dbPath || dbPath === ':memory:') return undefined;
  const db = byFile.get(fileKey(dbPath));
  if (!db || (db as { open?: unknown }).open === false) return undefined;
  return db as T;
}

/**
 * True when a module that looked up `dbPath` and got nothing is running in
 * the MCP server (the lock wait cap is set): its private connection's writes
 * then wait synchronously for a locked database. Callers log it at debug
 * level so a startup-order gap is visible.
 */
export function isUnqueuedFallback(dbPath: string): boolean {
  return getLockWaitCap() !== null && dbPath !== ':memory:' && queuedConnectionFor(dbPath) === undefined;
}

/** True when writes on `db` are queued. */
export function hasWriteQueue(db: object | null | undefined): boolean {
  return db != null && queues.has(db);
}

/**
 * Run a write on `db`: queued when `db` has a write queue, otherwise at once.
 * With the queue empty and the database unlocked a queued write also runs at
 * once, so callers see the same result as a direct write.
 */
export function writeWhenUnlockedOn<T>(db: object | null | undefined, fn: () => T): Promise<T> {
  const queue = db != null ? queues.get(db) : undefined;
  if (queue) return queue(fn);
  return new Promise<T>((resolve) => resolve(fn()));
}
