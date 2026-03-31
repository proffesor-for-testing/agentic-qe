/**
 * Worker-level setup for vitest fork pool.
 *
 * This runs inside the forked worker process for each test file.
 * It registers an afterAll hook that schedules a force-exit, preventing
 * the fork worker from hanging on native module handles (better-sqlite3,
 * hnswlib-node) after all tests in a file complete.
 *
 * The 2-second delay allows vitest to collect results from the worker
 * before the process terminates.
 */
import { afterAll } from 'vitest';

afterAll(() => {
  // Schedule force-exit after vitest has collected test results.
  // The worker process communicates results to the main process via IPC
  // before afterAll completes. The setTimeout gives the IPC message time
  // to flush, then kills the worker to release native handles.
  const timer = setTimeout(() => {
    process.exit(0);
  }, 2000);
  timer.unref();
});
