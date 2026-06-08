/**
 * Shared RVF Adapter Singleton
 *
 * Provides a single RvfNativeAdapter instance for .agentic-qe/patterns.rvf.
 * Used by both the kernel (agent branching) and DreamEngine (COW dreams)
 * to avoid dual file handles to the same .rvf file.
 *
 * Returns null when native bindings are unavailable — callers degrade
 * gracefully.
 *
 * @module integrations/ruvector/shared-rvf-adapter
 */

import type { RvfNativeAdapter, RvfCompactionResult, RvfStatus } from './rvf-native-adapter.js';

let sharedAdapter: RvfNativeAdapter | null = null;
let initAttempted = false;

// ---------------------------------------------------------------------------
// Test seam: allow tests to install a fake adapter without going through the
// native binding loader. NOT part of the public API — used by tests only.
// ---------------------------------------------------------------------------

/** @internal test-only seam */
export function __setSharedRvfAdapterForTests(adapter: RvfNativeAdapter | null): void {
  sharedAdapter = adapter;
  initAttempted = adapter !== null;
}

// ----------------------------------------------------------------------------
// Compaction tunables
//
// `compact()` is best-effort and idempotent on a clean file, so the thresholds
// are deliberately conservative. They can be tightened via env vars without a
// rebuild — useful in field debugging when an installation is already large.
// ----------------------------------------------------------------------------

/** File size above which we run a boot-time compact (default: 256 MB). */
const SIZE_GUARD_BYTES = (() => {
  const env = process.env.AQE_RVF_SIZE_GUARD_BYTES;
  const parsed = env ? Number(env) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 256 * 1024 * 1024;
})();

/** Dead-space ratio above which we run a compact (default: 0.30 = 30%). */
const DEAD_RATIO_THRESHOLD = (() => {
  const env = process.env.AQE_RVF_DEAD_RATIO_THRESHOLD;
  const parsed = env ? Number(env) : NaN;
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : 0.30;
})();

/**
 * Get or create the shared RvfNativeAdapter singleton for patterns.rvf.
 *
 * @param dataDir - Data directory (default: .agentic-qe)
 * @param dimensions - Vector dimensions (default: 384)
 * @returns The shared adapter, or null if native bindings are unavailable
 */
export function getSharedRvfAdapter(
  dataDir = '.agentic-qe',
  dimensions = 384,
): RvfNativeAdapter | null {
  if (initAttempted) return sharedAdapter;
  initAttempted = true;

  try {
    // Dynamic require to match the bundled build pattern used elsewhere
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isRvfNativeAvailable, createRvfStore, openRvfStore } = require('./rvf-native-adapter.js');

    if (!isRvfNativeAvailable()) {
      console.warn(
        '[RVF] Native bindings unavailable — agent branching and dream COW disabled. ' +
        'Install @ruvector/rvf-node to enable.',
      );
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    // Issue #516: resolve a relative dataDir against the project root so the
    // store lands in the project's own .agentic-qe/, not a cwd-relative one.
    // A subfolder cwd (vendored builds, background workers, `aqe code index
    // docs/`) otherwise scatters stray patterns.rvf-only stores. Explicit
    // absolute dataDir args are honored as-is.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { findProjectRoot } = require('../../kernel/unified-memory.js');
    const baseDir = path.isAbsolute(dataDir)
      ? dataDir
      : path.join(process.env.AQE_PROJECT_ROOT ?? findProjectRoot(), dataDir);
    const rvfPath = path.join(baseDir, 'patterns.rvf');

    // Open-or-create with a try-ladder rather than `existsSync` gate.
    // Reasons:
    //  1. RVF native's `RvfDatabase.create()` throws `0x0303 FsyncFailed`
    //     when the target file already exists (verified against both 0.1.7
    //     and 0.1.8 native binaries on linux-arm64). Earlier init phases
    //     legitimately produce patterns.rvf, so subsequent CLI / MCP boot
    //     would crash without this guard. (Jordi #439 / RUFLO P020.)
    //  2. A bare `existsSync(...) ? open : create` is racy across
    //     processes — two parallel `aqe` invocations during init can both
    //     observe absent and both call `create`, with the second hitting
    //     FsyncFailed regardless. The try-ladder degrades to whichever
    //     path the OS actually permits.
    sharedAdapter = openOrCreateRvf(openRvfStore, createRvfStore, rvfPath, dimensions);
    // Boot-time size guard: an oversized or fragmented patterns.rvf gets a
    // best-effort compaction on first open. Synchronous — runs once per
    // process. Errors logged, never thrown (compaction must not block boot).
    runBootCompactGuard(sharedAdapter, rvfPath);
    return sharedAdapter;
  } catch (error) {
    console.warn(
      '[RVF] Shared adapter init failed:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Race-tolerant open-or-create.
 * Tries open first (cheap, succeeds for the common case where init has
 * already produced the file). On open failure we attempt create. On the
 * concurrent-create loser, create itself fails with `FsyncFailed`; we
 * retry open once more. Any final exception bubbles up to the caller.
 *
 * Also asserts `dim()` matches the caller-requested `dimensions` after
 * open so silent dimension drift between releases / configs is detected
 * — a bad-dim file is closed and create() is attempted (fail-loud rather
 * than corrupt-silently, which would manifest as wrong vector hits later).
 */
function openOrCreateRvf(
  openFn: (p: string) => RvfNativeAdapter,
  createFn: (p: string, dim: number) => RvfNativeAdapter,
  rvfPath: string,
  dimensions: number,
): RvfNativeAdapter {
  const tryOpen = (): { adapter: RvfNativeAdapter; err: null } | { adapter: null; err: unknown } => {
    try {
      return { adapter: openFn(rvfPath), err: null };
    } catch (err) {
      return { adapter: null, err };
    }
  };
  const isLockHeld = (err: unknown): boolean => {
    const m = err instanceof Error ? err.message : String(err);
    return m.includes('LockHeld') || m.includes('0x0300');
  };

  // Pass 1: try to open whatever's there.
  let { adapter: opened, err: openErr } = tryOpen();

  // Pass 1.5: stale-lock recovery. The native binding writes a `<rvfPath>.lock`
  // file on open and removes it on close. `aqe init` and short-lived CLI
  // processes routinely exit without an explicit close, leaving a stale
  // .lock that subsequent invocations interpret as `LockHeld`. Since AQE
  // CLI is overwhelmingly single-shot serial, the realistic case is "the
  // prior process is dead and the lock is stale". We unlink the .lock and
  // retry open exactly once. If a genuinely-live peer existed, it still
  // holds the file open — but the binding's lock is content-based (lock
  // file presence), so this is a best-effort cooperative recovery rather
  // than an OS-level lock break.
  if (!opened && isLockHeld(openErr)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      const lockPath = `${rvfPath}.lock`;
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
        console.warn(
          `[RVF] Removed stale lock file at ${lockPath} (prior process exited without closing). ` +
            'Retrying open. If you see this repeatedly under live concurrency, file an issue.',
        );
        ({ adapter: opened, err: openErr } = tryOpen());
      }
    } catch (recoveryErr) {
      // Lock removal failed (permissions?) — fall through to error path.
      if (process.env.DEBUG) {
        console.debug(
          '[RVF] stale-lock recovery failed:',
          recoveryErr instanceof Error ? recoveryErr.message : recoveryErr,
        );
      }
    }
  }

  if (opened) {
    const actualDim = opened.dimension();
    if (actualDim === dimensions) return opened;
    console.warn(
      `[RVF] patterns.rvf dimension mismatch: file=${actualDim} requested=${dimensions} — ` +
        'closing and degrading. Delete the .rvf file to recreate at the requested dim.',
    );
    try { opened.close(); } catch { /* best-effort */ }
    // Don't auto-recreate over a dim-mismatched file. Surface to caller via
    // throw so getSharedRvfAdapter logs and returns null (degrade to SQLite).
    throw new Error(
      `RVF dimension mismatch (file=${actualDim}, requested=${dimensions})`,
    );
  }

  // Pass 2: open failed even after stale-lock recovery → try create.
  try {
    return createFn(rvfPath, dimensions);
  } catch (createErr) {
    // Pass 3: create failed (likely FsyncFailed because a peer process won
    // the race). Try open one more time.
    try {
      const reopened = openFn(rvfPath);
      if (reopened.dimension() !== dimensions) {
        try { reopened.close(); } catch { /* best-effort */ }
        throw new Error(
          `RVF dimension mismatch after race (file=${reopened.dimension()}, requested=${dimensions})`,
        );
      }
      return reopened;
    } catch {
      // Fall through with the more informative original error.
      throw createErr instanceof Error ? createErr : new Error(String(createErr));
    }
  }
}

export interface CompactDecision {
  shouldCompact: boolean;
  trigger: 'force' | 'size-guard' | 'dead-ratio' | 'none';
}

/**
 * Pure decision function: given an adapter status, decide whether compaction
 * should run and which threshold triggered it. Exported so tests can verify
 * the decision logic without exercising the singleton or native binding.
 */
export function decideCompactionFromStatus(
  status: RvfStatus,
  opts?: { deadRatioThreshold?: number; sizeGuardBytes?: number; force?: boolean },
): CompactDecision {
  if (opts?.force) return { shouldCompact: true, trigger: 'force' };
  const sizeThreshold = opts?.sizeGuardBytes ?? SIZE_GUARD_BYTES;
  const deadThreshold = opts?.deadRatioThreshold ?? DEAD_RATIO_THRESHOLD;
  if (status.fileSizeBytes >= sizeThreshold) {
    return { shouldCompact: true, trigger: 'size-guard' };
  }
  if ((status.deadSpaceRatio ?? 0) >= deadThreshold) {
    return { shouldCompact: true, trigger: 'dead-ratio' };
  }
  return { shouldCompact: false, trigger: 'none' };
}

/**
 * Run `compact()` against the shared patterns.rvf adapter when dead-space or
 * file-size thresholds are exceeded. Best-effort — returns the reclaim stats
 * if compaction ran, or `null` if it was skipped or failed.
 *
 * Safe to call from steady-state code (e.g. after a dream cycle). The native
 * binding's compact() is documented as exclusive against writers, so callers
 * should run this in idle windows when possible.
 *
 * Thresholds can be overridden via:
 *   AQE_RVF_SIZE_GUARD_BYTES        (default 256 MB)
 *   AQE_RVF_DEAD_RATIO_THRESHOLD    (default 0.30)
 */
export function compactSharedRvfAdapter(opts?: {
  /** Override the dead-space ratio above which compaction runs. */
  deadRatioThreshold?: number;
  /** Override the file size above which compaction runs unconditionally. */
  sizeGuardBytes?: number;
  /** When true, run compact() regardless of thresholds. */
  force?: boolean;
}): RvfCompactionResult | null {
  if (!sharedAdapter) return null;

  let status: RvfStatus;
  try {
    status = sharedAdapter.status();
  } catch {
    return null;
  }

  const decision = decideCompactionFromStatus(status, opts);
  if (!decision.shouldCompact) return null;

  const before = status.fileSizeBytes;
  let result: RvfCompactionResult | null;
  try {
    result = sharedAdapter.compact();
  } catch {
    // The thin native wrapper already catches and returns null on native
    // errors, but be defensive in case a caller installs a non-wrapped
    // adapter (e.g. tests, custom adapters).
    return null;
  }
  if (!result) return null;

  // Log only when there's something interesting to report — keeps idle logs quiet.
  if (result.bytesReclaimed > 0 || result.segmentsCompacted > 0) {
    console.log(
      `[RVF] compacted patterns.rvf: reclaimed ${formatBytes(result.bytesReclaimed)} ` +
        `(${result.segmentsCompacted} segments, fileSize ${formatBytes(before)} → ` +
        `${formatBytes(Math.max(0, before - result.bytesReclaimed))}, ` +
        `trigger: ${decision.trigger})`,
    );
  }
  return result;
}

/**
 * One-shot at boot. Runs a best-effort `compact()` against the freshly-opened
 * adapter when fileSize or deadSpaceRatio exceed configured thresholds. Lives
 * here (not at module load) so a never-opened adapter doesn't trigger native
 * binding init. Exported for tests; production callers go via
 * `getSharedRvfAdapter()` which invokes it internally.
 */
export function runBootCompactGuard(
  adapter: RvfNativeAdapter,
  rvfPath: string,
): RvfCompactionResult | null {
  try {
    const status = adapter.status();
    const decision = decideCompactionFromStatus(status);
    if (!decision.shouldCompact) return null;
    const result = adapter.compact();
    if (result && (result.bytesReclaimed > 0 || result.segmentsCompacted > 0)) {
      console.log(
        `[RVF] boot-time compact (${rvfPath}): reclaimed ${formatBytes(result.bytesReclaimed)} ` +
          `from ${result.segmentsCompacted} segments (trigger: ${decision.trigger})`,
      );
    }
    return result;
  } catch (error) {
    if (process.env.DEBUG) {
      console.debug(
        '[RVF] boot-time compact guard skipped:',
        error instanceof Error ? error.message : error,
      );
    }
    return null;
  }
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return `${n}B`;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)}${units[i]}`;
}

/** Close the shared adapter and reset the singleton. */
export function resetSharedRvfAdapter(): void {
  if (sharedAdapter) {
    try { sharedAdapter.close(); } catch { /* best effort */ }
    sharedAdapter = null;
  }
  initAttempted = false;
}
