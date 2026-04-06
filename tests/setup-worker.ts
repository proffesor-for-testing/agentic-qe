/**
 * Worker-level setup for vitest fork pool.
 *
 * Previously this file registered an `afterAll` hook that scheduled a
 * `process.exit(0)` 2 seconds after the last test in each file, to work
 * around fork workers hanging on lingering native handles
 * (`@ruvector/router` VectorDb, hnswlib-node, better-sqlite3).
 *
 * The underlying causes were fixed in:
 *   - v3.9.3 — `dispose()` contract added to HNSW backends + HnswAdapter.close
 *   - v3.9.5 — `useNativeHNSW` default flipped to false (futex deadlock fix, #401)
 *
 * With those fixes the workers exit cleanly on their own, so the
 * force-exit safety net is no longer needed. The `tests/global-teardown.ts`
 * 5-second main-process safety net is intentionally kept as a last resort.
 *
 * If you reintroduce a native module that holds handles past `afterAll`,
 * fix the dispose path in the module rather than putting the timer back.
 */
export {};
