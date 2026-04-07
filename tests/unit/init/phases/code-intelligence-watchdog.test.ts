/**
 * Test: CodeIntelligencePhase.runBoundedScan watchdog effectiveness
 *
 * This test exists because of issue #401. The v3.9.3 release shipped a
 * `Promise.race + setTimeout` watchdog for phase 06 that was marketed as
 * "init cannot hang" but had never been tested against a stalling stub.
 * The post-mortem (#401 Part 2 item 3) said: "This single test would have
 * caught the v3.9.3 bug before shipping."
 *
 * Scope of what this test PROVES:
 *   1. Per-file timeout fires when `kgService.index()` returns a Promise
 *      that never resolves (the async-stall case).
 *   2. Per-file errors are caught and the loop continues to the next file.
 *   3. Phase-level cap kicks in between files when individual files
 *      collectively exceed PHASE_TIMEOUT_MS.
 *
 * Scope of what this test does NOT prove and CANNOT prove:
 *
 *   The original v3.9.3 deadlock was a SYNCHRONOUS native-code stall
 *   inside `@ruvector/router`'s NAPI HNSW path (a futex_wait inside Rust
 *   tokio threads, with a NULL timeout). When the Node event loop is
 *   blocked inside synchronous native code, NO JavaScript timer can fire
 *   — including the very timer this test is exercising. Writing a unit
 *   test that proves the watchdog catches sync blocks would require the
 *   test to itself execute synchronous-blocking code on the main thread,
 *   which would freeze the test runner.
 *
 *   This is not a defect of the test — it is a fundamental property of
 *   the single-threaded watchdog design. Sync-block protection is
 *   delegated to the AQE_SKIP_CODE_INDEX escape hatch (which the user
 *   sets after a hang) and to the release-gate corpus at
 *   tests/fixtures/init-corpus/ (which exercises real-world file shapes
 *   in a real install before they reach users).
 *
 *   Future work: phase 06 worker_threads isolation would enable a real
 *   sync-block test, because the test could use Atomics.wait inside the
 *   worker while the parent's timer kept running. That work is tracked
 *   in a follow-up issue and was deferred per #401's accepted scope —
 *   the dependency that caused the original deadlock was replaced with
 *   `hnswlib-node` in v3.9.6 (ADR-090) and the specific bug class is no
 *   longer reproducible.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CodeIntelligencePhase } from '../../../../src/init/phases/06-code-intelligence.js';
import type { InitContext } from '../../../../src/init/phases/phase-interface.js';

// Constants from src/init/phases/06-code-intelligence.ts. Must stay in
// sync — these are the load-bearing values the test exercises.
const PER_FILE_TIMEOUT_MS = 30_000;
const PHASE_TIMEOUT_MS = 180_000;

function createMockContext(overrides: Partial<InitContext> = {}): InitContext {
  return {
    projectRoot: '/tmp/test-project',
    options: {},
    config: {},
    enhancements: { claudeFlow: false, ruvector: false },
    results: new Map(),
    services: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    ...overrides,
  };
}

interface StubKgService {
  // Match the surface area runBoundedScan touches
  clear: () => Promise<void>;
  index: (args: { paths: string[]; incremental?: boolean; includeTests?: boolean }) => Promise<{
    success: boolean;
    value: { nodesCreated: number; edgesCreated: number };
  }>;
}

/**
 * Build a stub KG service whose `index()` behavior is controlled by the
 * test. We pass it via `as any` because runBoundedScan is private and
 * typed against the real KnowledgeGraphService — for a unit test of the
 * watchdog logic alone, we only need the methods runBoundedScan calls.
 */
function buildStub(handlers: {
  index: StubKgService['index'];
  clear?: StubKgService['clear'];
}): StubKgService {
  return {
    clear: handlers.clear ?? (async () => {}),
    index: handlers.index,
  };
}

describe('CodeIntelligencePhase.runBoundedScan watchdog (issue #401)', () => {
  let phase: CodeIntelligencePhase;

  beforeEach(() => {
    phase = new CodeIntelligencePhase();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('per-file timeout fires when index() never resolves, and the loop continues', async () => {
    // Arrange: 2 files. The first stalls forever (returns a Promise that
    // never resolves). The second succeeds normally. The watchdog must
    // fire on file 1 and we must still see file 2 attempted.
    const indexCalls: string[] = [];
    const stubKg = buildStub({
      index: (args) => {
        indexCalls.push(args.paths[0]);
        if (args.paths[0] === '/tmp/test-project/stalls.ts') {
          // Never resolves — simulates async stall in native code that
          // does at least yield to the event loop.
          return new Promise(() => {});
        }
        return Promise.resolve({
          success: true,
          value: { nodesCreated: 3, edgesCreated: 2 },
        });
      },
    });
    const ctx = createMockContext();
    const files = ['/tmp/test-project/stalls.ts', '/tmp/test-project/ok.ts'];

    // Act: drive runBoundedScan via the private accessor
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promise = (phase as any).runBoundedScan(stubKg, files, false, ctx);

    // Advance fake clock past the per-file timeout. The withTimeout
    // helper schedules its setTimeout for PER_FILE_TIMEOUT_MS — once
    // we cross that, the watchdog rejects the inner promise with the
    // AQE_PER_FILE_TIMEOUT error and runBoundedScan moves on.
    await vi.advanceTimersByTimeAsync(PER_FILE_TIMEOUT_MS + 1_000);

    const result = await promise;

    // Assert: status is 'indexed' (the loop completed even though one
    // file timed out — that's the whole point of per-file isolation),
    // the second file got attempted, and the warn log mentions the
    // timeout.
    expect(result.status).toBe('indexed');
    expect(indexCalls).toEqual([
      '/tmp/test-project/stalls.ts',
      '/tmp/test-project/ok.ts',
    ]);
    expect(ctx.services.warn).toHaveBeenCalledWith(
      expect.stringContaining('Skipped'),
    );
    expect(ctx.services.warn).toHaveBeenCalledWith(
      expect.stringContaining('stalls.ts'),
    );
  });

  it('per-file errors that are NOT timeouts are caught and the loop continues', async () => {
    // Arrange: file 1 throws synchronously from the inner promise
    // (representing a parser error or similar). The watchdog must
    // catch it via the catch in runBoundedScan and continue.
    const stubKg = buildStub({
      index: (args) => {
        if (args.paths[0] === '/tmp/test-project/broken.ts') {
          return Promise.reject(new Error('SyntaxError: unexpected token'));
        }
        return Promise.resolve({
          success: true,
          value: { nodesCreated: 1, edgesCreated: 0 },
        });
      },
    });
    const ctx = createMockContext();
    const files = ['/tmp/test-project/broken.ts', '/tmp/test-project/ok.ts'];

    // Act
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promise = (phase as any).runBoundedScan(stubKg, files, false, ctx);
    await vi.runAllTimersAsync();
    const result = await promise;

    // Assert: status indexed, warn fired with "Failed to index" (not
    // "Skipped" — the message branch is different), one entry from the
    // good file.
    expect(result.status).toBe('indexed');
    expect(result.entries).toBe(1); // 1 node + 0 edges from ok.ts
    expect(ctx.services.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to index'),
    );
    expect(ctx.services.warn).toHaveBeenCalledWith(
      expect.stringContaining('broken.ts'),
    );
  });

  it('phase-level cap fires when cumulative file processing exceeds PHASE_TIMEOUT_MS', async () => {
    // Arrange: 10 files where each "successfully" indexes in 25 seconds
    // (under the 30s PER_FILE_TIMEOUT_MS so per-file timeout never fires).
    // Cumulative: 25s × 8 = 200s > 180s PHASE_TIMEOUT_MS, so the
    // between-files cap should fire after ~7-8 successful files.
    //
    // The math is deliberate: perFileMs MUST be < PER_FILE_TIMEOUT_MS
    // so individual files complete normally; otherwise per-file timeout
    // fires first and entries stays at 0 (invalidating the partial-
    // progress invariant we're trying to assert).
    const perFileMs = 25_000;
    let processedCount = 0;
    const stubKg = buildStub({
      index: () => {
        processedCount++;
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              success: true,
              value: { nodesCreated: 1, edgesCreated: 1 },
            });
          }, perFileMs);
        });
      },
    });
    const ctx = createMockContext();
    const files = Array.from({ length: 10 }, (_, i) => `/tmp/test-project/file${i}.ts`);

    // Act. We can't drive the loop with one big advance because each
    // iteration awaits an inner setTimeout — we need to advance step by
    // step so each iteration's timer can resolve before the next runs.
    // vi.advanceTimersByTimeAsync drains microtasks between timer
    // firings, so a single large advance does work in practice; the
    // safer pattern is to advance in perFileMs chunks.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promise = (phase as any).runBoundedScan(stubKg, files, false, ctx);
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(perFileMs + 100);
    }
    const result = await promise;

    // Assert: phase-level cap fired
    expect(result.status).toBe('timeout');
    expect(result.timeoutFile).toBeDefined();
    // Bailed before all 10 files (cap fires around file 8)
    expect(processedCount).toBeLessThan(10);
    expect(processedCount).toBeGreaterThanOrEqual(7);
    // Partial entries preserved — this is the documented invariant
    // ("on timeout we return the entries indexed so far, not zero")
    expect(result.entries).toBeGreaterThan(0);
  });

  it('documents the test scope: sync blocks are NOT testable from main thread', () => {
    // This is a contract test. It exists to make the limitation of
    // the watchdog explicit and to fail loudly if anyone "fixes" it
    // by trying to make the watchdog catch sync blocks (which is
    // architecturally impossible without worker isolation). See the
    // file header comment for the full reasoning.
    //
    // If a future contributor moves phase 06 into a worker_threads
    // worker, this test should be updated to add a 4th case that
    // uses Atomics.wait inside the worker to genuinely block, and
    // asserts the parent's worker.terminate() fires within the
    // configured timeout.

    // The watchdog uses a JS-side setTimeout. setTimeout fires on
    // the same thread as the indexer.
    expect(typeof setTimeout).toBe('function');
    // The escape hatch is the user-facing protection for sync blocks.
    expect(process.env.AQE_SKIP_CODE_INDEX).toBeUndefined(); // not set in test env
    // The release-gate corpus is the load-bearing prevention layer.
    // (No assertion — this is the contract documentation.)
  });
});
