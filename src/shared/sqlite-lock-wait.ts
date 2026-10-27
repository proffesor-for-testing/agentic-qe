/**
 * How long one attempt of an asynchronously retried write may wait for a
 * SQLite lock (#1263).
 *
 * better-sqlite3 waits for a locked database synchronously, inside the call,
 * for up to the connection's busy_timeout (5 s by default). In a one-shot CLI
 * command that is the patience we want. In the MCP server it freezes the event
 * loop: while another process held memory.db's write lock, background writes
 * blocked for 5 s each, back to back, and stopped all tool calls for 10-15 s.
 *
 * The MCP server sets this cap. Writes routed through
 * UnifiedMemoryManager.writeWhenUnlocked then wait at most the cap per
 * attempt and retry asynchronously until the connection's busy_timeout has
 * passed. Connections keep their busy_timeout, so writes not routed that way
 * keep their full (blocking) patience.
 *
 * Dependency-free so any module can read it.
 */

/** Longest one retried write attempt blocks the MCP server's event loop on a locked database. */
export const INTERACTIVE_LOCK_WAIT_MS = 200;

let lockWaitCapMs: number | null = null;

/** Set the per-attempt wait for asynchronously retried writes (null: no cap). */
export function setLockWaitCap(ms: number | null): void {
  if (ms !== null && (!Number.isFinite(ms) || ms < 0)) {
    throw new RangeError(`Lock wait cap must be a non-negative number of ms, got ${ms}`);
  }
  lockWaitCapMs = ms === null ? null : Math.floor(ms);
}

/** The current cap, or null when retried writes wait the full busy_timeout per attempt. */
export function getLockWaitCap(): number | null {
  return lockWaitCapMs;
}

/** The per-attempt wait for a requested busy_timeout, honouring the process cap. */
export function capBusyTimeout(requestedMs: number): number {
  return lockWaitCapMs === null ? requestedMs : Math.min(requestedMs, lockWaitCapMs);
}
