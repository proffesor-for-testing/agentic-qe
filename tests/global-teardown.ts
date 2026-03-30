/**
 * Global setup/teardown for vitest — force-exit safety net.
 *
 * Root cause: Native modules (better-sqlite3, hnswlib-node) hold open handles
 * in the vitest fork worker, preventing process exit after tests complete.
 * The main vitest process waits for the worker, creating a deadlock.
 *
 * This teardown runs in the main vitest process after test collection is
 * complete. For the fork worker hang, we use the setup-worker.ts approach
 * (registered via setupFiles) which works inside the worker process itself.
 */

export function setup(): void {
  // No-op
}

export function teardown(): void {
  // Safety net: if main process is still alive 5s after tests,
  // force exit. This handles edge cases where the main process
  // itself has lingering handles (e.g., from reporter plugins).
  const timer = setTimeout(() => process.exit(0), 5000);
  timer.unref();
}
