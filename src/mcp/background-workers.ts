/**
 * Agentic QE v3 - MCP background worker startup (IMP-10, #1061)
 *
 * Starts the worker daemon and the QualityDaemon for the MCP server, unless
 * `AQE_WORKERS_ENABLED` is set to a falsy value (`false`, `0`, `off`, `no`).
 * `aqe init --no-database` writes `AQE_WORKERS_ENABLED=false` (#533); before
 * #1061 the variable was written but never read.
 *
 * All output goes through `log`, which the MCP entry binds to the original
 * stderr writer so stdout stays reserved for JSON-RPC.
 */

import { isWorkersEnabled, type WorkerEnv } from '../workers/worker-env.js';

/**
 * #1116: `starting` while the worker daemon's first runs continue in the
 * background; `startBackgroundWorkers` never reports `started` before they
 * have finished. The settled state is in `getBackgroundWorkersState()`.
 */
export type BackgroundWorkersOutcome = 'disabled' | 'starting' | 'failed';

export interface BackgroundWorkersState {
  state: 'not-requested' | 'disabled' | 'starting' | 'started' | 'failed';
  /** Why the start failed, when `state` is `failed`. */
  error?: string;
}

let workersState: BackgroundWorkersState = { state: 'not-requested' };

/** Where the worker daemon's start stands now, including a background failure. */
export function getBackgroundWorkersState(): BackgroundWorkersState {
  return { ...workersState };
}

export async function startBackgroundWorkers(
  log: (message: string) => void,
  env: WorkerEnv = process.env,
): Promise<BackgroundWorkersOutcome> {
  if (!isWorkersEnabled(env)) {
    log(
      `[MCP] Background workers disabled (AQE_WORKERS_ENABLED=${env.AQE_WORKERS_ENABLED}); ` +
        'worker daemon and quality daemon not started\n',
    );
    workersState = { state: 'disabled' };
    return 'disabled';
  }

  // In database-free mode the workers run against the in-memory unified
  // store, so they persist nothing to disk while keeping QualityDaemon/health
  // functional.
  try {
    const { getDaemon } = await import('../workers/daemon.js');
    // ADR-001 Bug A fix: use the canonical getDaemon() default. Passing
    // `{ autoStart: false }` here would neuter workerManager.startAll() —
    // the only call path that schedules per-worker setInterval timers, so
    // workers would register but never tick. DEFAULT_CONFIG.autoStart=true
    // (workers/daemon.ts) is the contracted default; matches the
    // shutdownDaemon() call site in entry.ts.
    const daemon = getDaemon();
    // #1066: start() runs every worker's first tick one after another, which
    // can take minutes. Let it finish in the background so the QualityDaemon
    // (and the HTTP server after us) do not wait for it.
    // #1116: report `starting` now and the real outcome when it settles, so a
    // start that fails in the background is never reported as started.
    workersState = { state: 'starting' };
    void daemon.start().then(
      () => {
        workersState = { state: 'started' };
        log('[MCP] Background workers started (first runs complete)\n');
      },
      (startError: unknown) => {
        workersState = { state: 'failed', error: String(startError) };
        log(`[MCP] WARNING: Background workers failed to start: ${startError}\n`);
      },
    );
    const status = daemon.getStatus();
    log(
      `[MCP] Background workers starting (${status.workerManager.totalWorkers} workers; ` +
        'first runs continue in the background)\n',
    );

    // IMP-10: Start QualityDaemon with persistent memory (Finding 1 & 2 resolution)
    try {
      const { UnifiedMemoryManager } = await import('../kernel/unified-memory.js');
      const { PersistentWorkerMemory } = await import('../workers/quality-daemon/persistent-memory.js');
      const { isPrivateIp } = await import('../hooks/security/ssrf-guard.js');
      const unifiedMemory = await UnifiedMemoryManager.getInstanceAsync();
      const persistentMemory = new PersistentWorkerMemory(unifiedMemory);
      const qualityDaemon = daemon.getQualityDaemon({
        notifications: {
          // IMP-07 SSRF guard: block private IPs in webhook URLs (Finding 5)
          urlValidator: (url: string) => {
            try {
              const parsed = new URL(url);
              const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
              return !isPrivateIp(hostname);
            } catch {
              return false;
            }
          },
        },
      });
      await qualityDaemon.start(persistentMemory);
      log(`[MCP] Quality daemon started\n`);
    } catch (qdError) {
      log(`[MCP] WARNING: Quality daemon failed to start: ${qdError}\n`);
      // Non-fatal — MCP continues without quality daemon
    }
    return 'starting';
  } catch (daemonError) {
    workersState = { state: 'failed', error: String(daemonError) };
    log(`[MCP] WARNING: Background workers failed to start: ${daemonError}\n`);
    // Non-fatal — MCP server continues without background workers
    return 'failed';
  }
}
