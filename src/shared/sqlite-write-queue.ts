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
 * Dependency-free so any module can import it.
 */

/** A connection's FIFO write queue: runs `fn` when the database is unlocked. */
export type WriteQueue = <T>(fn: () => T) => Promise<T>;

const queues = new WeakMap<object, WriteQueue>();

/** Route writes on `db` through `queue` until unregistered. */
export function registerWriteQueue(db: object, queue: WriteQueue): void {
  queues.set(db, queue);
}

/** Stop routing writes on `db` (the connection is closing). */
export function unregisterWriteQueue(db: object): void {
  queues.delete(db);
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
