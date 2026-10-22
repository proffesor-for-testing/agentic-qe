/**
 * Agentic QE v3 - MCP server daemon mode (#1158)
 *
 * The generated `.agentic-qe/workers/start-daemon.cjs` runs the MCP server as
 * a detached background process with no stdin (`stdio: 'ignore'`), only to
 * host the worker daemon. The #513 guard treats stdin EOF as "the client is
 * gone" and shuts the server down, so that daemon used to exit within
 * seconds of starting.
 *
 * `AQE_MCP_DAEMON=1` selects daemon mode. It changes exactly one thing: stdin
 * EOF/close no longer shuts the server down, and a ref'd heartbeat timer keeps
 * the process alive (worker timers are unref'd, also #513). The server then
 * stops only on SIGTERM/SIGINT (what `stop-daemon.cjs` sends), the JSON-RPC
 * `shutdown` method, or a crash.
 *
 * Safety: daemon mode is honoured only when stdin is NOT a pipe or socket. An
 * MCP client always talks to the server over a pipe/socket, so an
 * `AQE_MCP_DAEMON` that leaks into a client's environment cannot turn its
 * server into an orphan that outlives the client: the #513 guard stays on and
 * a warning is logged. The variable is also removed from `process.env` once
 * read, so processes the server spawns do not inherit it.
 */

import { fstatSync } from 'node:fs';

export const DAEMON_MODE_ENV = 'AQE_MCP_DAEMON';

/** Only these values enable daemon mode; anything else (or unset) is off. */
const DAEMON_ON_VALUES = new Set(['1', 'true', 'yes', 'on']);

/** Default interval of the daemon heartbeat line in daemon.log. */
export const DEFAULT_DAEMON_HEARTBEAT_MS = 60_000;

/** What `fd 0` is connected to, as far as the guard cares. */
export type StdinKind = 'tty' | 'pipe' | 'other';

/** How the server's lifecycle reacts to stdin. */
export type StdinGuardMode =
  /** Normal stdio client: stdin EOF/close shuts the server down (#513). */
  | 'stdio'
  /** Interactive terminal: no guard, so Ctrl-D does not kill a debug session. */
  | 'tty'
  /** `AQE_MCP_DAEMON` with a non-pipe stdin: stdin is ignored (#1158). */
  | 'daemon';

export interface StdinGuardDecision {
  mode: StdinGuardMode;
  /** Set when daemon mode was requested but refused. */
  warning?: string;
}

/** Whether the environment asks for daemon mode. */
export function isDaemonModeRequested(env: Readonly<Record<string, string | undefined>>): boolean {
  const raw = env[DAEMON_MODE_ENV];
  if (raw === undefined) return false;
  return DAEMON_ON_VALUES.has(raw.trim().toLowerCase());
}

/**
 * Classify the process's stdin. A FIFO or socket means a client is (or was)
 * connected; `/dev/null` (`stdio: 'ignore'`) or a regular file is 'other'.
 */
export function detectStdinKind(stdin: { isTTY?: boolean } = process.stdin, fd = 0): StdinKind {
  if (stdin.isTTY) return 'tty';
  try {
    const stat = fstatSync(fd);
    return stat.isFIFO() || stat.isSocket() ? 'pipe' : 'other';
  } catch {
    // Unknown stdin: treat it as a client pipe so the #513 guard stays on.
    return 'pipe';
  }
}

/** Decide how the server should treat stdin EOF. Pure: no side effects. */
export function resolveStdinGuardMode(
  env: Readonly<Record<string, string | undefined>>,
  stdinKind: StdinKind,
): StdinGuardDecision {
  const requested = isDaemonModeRequested(env);
  if (stdinKind === 'tty') return { mode: 'tty' };
  if (!requested) return { mode: 'stdio' };
  if (stdinKind === 'pipe') {
    return {
      mode: 'stdio',
      warning:
        `[AQE] WARN ${DAEMON_MODE_ENV} ignored: stdin is a pipe (an MCP client is attached), ` +
        'so the server still shuts down when stdin closes\n',
    };
  }
  return { mode: 'daemon' };
}

export interface DaemonHeartbeatStatus {
  totalWorkers: number;
  errorWorkers: number;
  /** Worker runs since the daemon started, all workers together. */
  totalExecutions: number;
  failedExecutions: number;
}

/**
 * Keep a daemon-mode server alive and log one heartbeat line per interval.
 * The timer is deliberately ref'd: nothing else holds the event loop open in
 * daemon mode. Returns a function that stops it.
 */
export function startDaemonHeartbeat(
  log: (message: string) => void,
  getStatus: () => DaemonHeartbeatStatus | undefined,
  intervalMs = DEFAULT_DAEMON_HEARTBEAT_MS,
): () => void {
  const startedAt = Date.now();
  const timer = setInterval(() => {
    const uptimeS = Math.round((Date.now() - startedAt) / 1000);
    let status: DaemonHeartbeatStatus | undefined;
    try { status = getStatus(); } catch { status = undefined; }
    const workers = status
      ? `${status.totalWorkers} workers (${status.errorWorkers} in error), ` +
        `${status.totalExecutions} runs (${status.failedExecutions} failed)`
      : 'workers unavailable';
    log(`[AQE] Daemon heartbeat: pid ${process.pid}, up ${uptimeS}s, ${workers}\n`);
  }, intervalMs);
  return () => clearInterval(timer);
}
