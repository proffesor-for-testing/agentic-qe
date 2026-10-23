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
 *
 * Log size (#1207): the server's stdout/stderr ARE daemon.log (a descriptor
 * opened with O_APPEND by start-daemon.cjs), so renaming the file would not
 * stop the writes. Instead, on each heartbeat the server copies an oversized
 * daemon.log to daemon.log.1 and truncates daemon.log in place; with O_APPEND
 * the next write lands at the new end of the file. start-daemon.cjs rotates an
 * oversized log at start-up the same way (a rename, as nothing writes it then).
 */

import {
  closeSync, constants, fstatSync, ftruncateSync, lstatSync, openSync, readSync, renameSync,
  unlinkSync, writeSync,
} from 'node:fs';

export const DAEMON_MODE_ENV = 'AQE_MCP_DAEMON';

/** Only these values enable daemon mode; anything else (or unset) is off. */
const DAEMON_ON_VALUES = new Set(['1', 'true', 'yes', 'on']);

/** Default interval of the daemon heartbeat line in daemon.log. */
export const DEFAULT_DAEMON_HEARTBEAT_MS = 60_000;

/** Heartbeat interval in seconds (#1207), also how often daemon.log size is checked. */
export const DAEMON_HEARTBEAT_ENV = 'AQE_DAEMON_HEARTBEAT_SECONDS';
const MAX_HEARTBEAT_SECONDS = 86_400;

/** Size cap of daemon.log before it is rotated to daemon.log.1 (#1207). */
export const DAEMON_LOG_MAX_SIZE_ENV = 'AQE_DAEMON_LOG_MAX_SIZE';
export const DEFAULT_DAEMON_LOG_MAX_BYTES = 5 * 1024 * 1024;
const MIN_DAEMON_LOG_MAX_BYTES = 1024;

/**
 * Absolute path of daemon.log, set by start-daemon.cjs for the server it
 * starts. Internal: the server rotates the log only when this file is the one
 * its stdout/stderr write to.
 */
export const DAEMON_LOG_PATH_ENV = 'AQE_MCP_DAEMON_LOG';

const OFF_VALUES = new Set(['0', 'off', 'false', 'no', 'none', 'disable', 'disabled']);
const SIZE_UNITS: Record<string, number> = { '': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 };

export interface ParsedSetting {
  value: number;
  /** Set when the raw value was rejected and the default applies. */
  warning?: string;
}

/**
 * Parse `AQE_DAEMON_LOG_MAX_SIZE`: bytes, or a number with a K, M or G suffix
 * (binary units, optional trailing B). `0`/`off` disables rotation (value 0).
 * Unset, empty or invalid values fall back to the 5 MB default.
 */
export function parseDaemonLogMaxBytes(raw: string | undefined): ParsedSetting {
  const text = (raw ?? '').trim().toLowerCase();
  if (text === '') return { value: DEFAULT_DAEMON_LOG_MAX_BYTES };
  if (OFF_VALUES.has(text)) return { value: 0 };
  const match = /^(\d+)\s*([kmg]?)b?$/.exec(text);
  const bytes = match ? Number(match[1]) * SIZE_UNITS[match[2]] : NaN;
  if (Number.isSafeInteger(bytes) && bytes >= MIN_DAEMON_LOG_MAX_BYTES) return { value: bytes };
  return {
    value: DEFAULT_DAEMON_LOG_MAX_BYTES,
    warning: `[AQE] WARN ${DAEMON_LOG_MAX_SIZE_ENV}=${JSON.stringify(raw)} ignored: expected bytes ` +
      `(at least ${MIN_DAEMON_LOG_MAX_BYTES}) or a size such as 512K or 5M; using 5M\n`,
  };
}

/** Parse `AQE_DAEMON_HEARTBEAT_SECONDS` (whole seconds, 1 to 86400) into milliseconds. */
export function parseDaemonHeartbeatMs(raw: string | undefined): ParsedSetting {
  const text = (raw ?? '').trim();
  if (text === '') return { value: DEFAULT_DAEMON_HEARTBEAT_MS };
  const seconds = /^\d+$/.test(text) ? Number(text) : NaN;
  if (seconds >= 1 && seconds <= MAX_HEARTBEAT_SECONDS) return { value: seconds * 1000 };
  return {
    value: DEFAULT_DAEMON_HEARTBEAT_MS,
    warning: `[AQE] WARN ${DAEMON_HEARTBEAT_ENV}=${JSON.stringify(raw)} ignored: expected whole ` +
      `seconds from 1 to ${MAX_HEARTBEAT_SECONDS}; using 60\n`,
  };
}

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
 * daemon mode. `beforeBeat` runs just before each line (log rotation, #1207);
 * an error it throws is ignored. Returns a function that stops it.
 */
export function startDaemonHeartbeat(
  log: (message: string) => void,
  getStatus: () => DaemonHeartbeatStatus | undefined,
  intervalMs = DEFAULT_DAEMON_HEARTBEAT_MS,
  beforeBeat?: () => void,
): () => void {
  const startedAt = Date.now();
  const timer = setInterval(() => {
    try { beforeBeat?.(); } catch { /* never let rotation stop the heartbeat */ }
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

export type DaemonLogRotation =
  | { rotated: true; bytes: number; kept: boolean; error?: string }
  | { rotated: false; reason: 'disabled' | 'not-a-regular-file' | 'not-our-log' | 'under-cap' | 'error'; error?: string };

/** Copy `src` to a fresh `dest`; neither path may be a symlink. */
function copyNoFollow(src: string, dest: string, srcIno: number): void {
  const nofollow = constants.O_NOFOLLOW ?? 0;
  const input = openSync(src, constants.O_RDONLY | nofollow);
  let output: number | undefined;
  try {
    if (fstatSync(input).ino !== srcIno) throw new Error('daemon.log changed while rotating');
    try { unlinkSync(dest); } catch { /* absent */ }
    // O_EXCL: fails on anything already there, a symlink included.
    output = openSync(dest, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | nofollow, 0o644);
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let read: number;
    while ((read = readSync(input, buffer, 0, buffer.length, null)) > 0) {
      writeSync(output, buffer, 0, read);
    }
  } finally {
    if (output !== undefined) closeSync(output);
    closeSync(input);
  }
}

/**
 * Keep daemon.log under `maxBytes` (#1207). When it is over the cap, copy it
 * to `<logPath>.1` (replacing the previous one) and truncate it in place
 * through the server's own descriptor, which start-daemon.cjs opened with
 * O_APPEND, so later writes start again at offset 0 of the same file.
 *
 * Acts only when `logPath` is a regular file (not a symlink, #970) and is the
 * very file one of `fds` (stdout/stderr) writes to, matched by device and
 * inode, so it never truncates a file the server does not own. If the copy
 * fails the log is still truncated, to keep disk use bounded. Lines written
 * between the copy and the truncate are lost; the window is one copy long.
 */
export function rotateDaemonLog(logPath: string, maxBytes: number, fds: readonly number[] = [1, 2]): DaemonLogRotation {
  if (maxBytes <= 0) return { rotated: false, reason: 'disabled' };
  try {
    const stat = lstatSync(logPath);
    if (!stat.isFile()) return { rotated: false, reason: 'not-a-regular-file' };
    const fd = fds.find((candidate) => {
      try {
        const own = fstatSync(candidate);
        return own.dev === stat.dev && own.ino === stat.ino;
      } catch { return false; }
    });
    if (fd === undefined) return { rotated: false, reason: 'not-our-log' };
    if (stat.size <= maxBytes) return { rotated: false, reason: 'under-cap' };

    const tmp = `${logPath}.1.${process.pid}.tmp`;
    let copyError: string | undefined;
    try {
      copyNoFollow(logPath, tmp, stat.ino);
      renameSync(tmp, `${logPath}.1`); // replaces the old one, never follows it
    } catch (error) {
      copyError = error instanceof Error ? error.message : String(error);
      try { unlinkSync(tmp); } catch { /* absent */ }
    }
    ftruncateSync(fd, 0);
    return copyError === undefined
      ? { rotated: true, bytes: stat.size, kept: true }
      : { rotated: true, bytes: stat.size, kept: false, error: copyError };
  } catch (error) {
    return { rotated: false, reason: 'error', error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The heartbeat hook that keeps daemon.log under `maxBytes` (#1207), logging a
 * line into the fresh log after each rotation and a warning the first time a
 * check fails. Returns undefined when there is nothing to rotate.
 */
export function createDaemonLogRotator(
  logPath: string | undefined,
  maxBytes: number,
  log: (message: string) => void,
): (() => void) | undefined {
  if (!logPath || maxBytes <= 0) return undefined;
  let warned = false;
  return () => {
    const result = rotateDaemonLog(logPath, maxBytes);
    if (result.rotated) {
      log(result.kept
        ? `[AQE] daemon.log rotated: ${result.bytes} bytes moved to daemon.log.1 (cap ${maxBytes})\n`
        : `[AQE] WARN daemon.log truncated at ${result.bytes} bytes (cap ${maxBytes}); ` +
          `could not keep daemon.log.1: ${result.error}\n`);
    } else if (result.reason === 'error' && !warned) {
      warned = true;
      log(`[AQE] WARN daemon.log size check failed: ${result.error}\n`);
    }
  };
}
