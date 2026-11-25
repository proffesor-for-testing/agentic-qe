/**
 * Run a command and, on timeout, kill every process it started (#1455).
 *
 * `npx --no-install ruflo ...` starts `node .../ruflo` as a child of npx. A timeout that
 * signals only npx (as child_process.execFile does) leaves that child running, re-parented
 * to init, and it still writes ruflo's project files. Here the command gets its own
 * process group (POSIX), and a timeout or an output overflow signals the whole group:
 * SIGTERM, then SIGKILL after a grace period. On Windows there are no process groups;
 * `taskkill /T /F` ends the process tree instead.
 *
 * A detached group no longer receives the terminal's Ctrl-C or dies with this process,
 * so live groups are tracked and killed when this process exits or gets SIGINT/SIGTERM.
 * Those handlers are installed only while a group is live, and a signal is re-raised
 * afterwards when nothing else handles it, so the default Ctrl-C behaviour stays.
 *
 * No shell is used: `args` are passed as an argv array.
 */

import { spawn } from 'child_process';

export interface RunCommandTreeOptions {
  cwd?: string;
  timeoutMs: number;
  /** Combined stdout + stderr limit; exceeding it kills the tree. Default 16 MiB. */
  maxBuffer?: number;
  /** Time between SIGTERM and SIGKILL of the process group. Default 2000 ms. */
  killGraceMs?: number;
}

/** Error of a failed command, with its output; `killed` when it was ended by this module. */
export interface RunCommandTreeError extends Error {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: NodeJS.Signals | null;
  killed: boolean;
  pid?: number;
}

function killTree(pid: number, signal: NodeJS.Signals): void {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).on('error', () => {});
    } else {
      process.kill(-pid, signal); // the whole process group
    }
  } catch {
    // ESRCH: already gone
  }
}

/** Process groups (leader pids) of commands still running. */
const liveGroups = new Set<number>();
const SIGNALS = ['SIGINT', 'SIGTERM'] as const;

function killLiveGroups(): void {
  for (const pid of liveGroups) killTree(pid, 'SIGKILL');
  liveGroups.clear();
}

function onExit(): void {
  killLiveGroups();
}

function onSignal(signal: NodeJS.Signals): void {
  killLiveGroups();
  removeHandlers();
  // Without other listeners Node would have ended the process: do that now.
  if (process.listenerCount(signal) === 0) process.kill(process.pid, signal);
}

function installHandlers(): void {
  process.on('exit', onExit);
  for (const signal of SIGNALS) process.on(signal, onSignal);
}

function removeHandlers(): void {
  process.off('exit', onExit);
  for (const signal of SIGNALS) process.off(signal, onSignal);
}

function trackGroup(pid: number): void {
  if (liveGroups.size === 0) installHandlers();
  liveGroups.add(pid);
}

function untrackGroup(pid: number): void {
  if (!liveGroups.delete(pid)) return;
  if (liveGroups.size === 0) removeHandlers();
}

/** Number of tracked live process groups (for tests). */
export function liveGroupCount(): number {
  return liveGroups.size;
}

/** stdout of `command args`; rejects with a RunCommandTreeError on non-zero exit, timeout or overflow. */
export function runCommandTree(command: string, args: string[], options: RunCommandTreeOptions): Promise<string> {
  const maxBuffer = options.maxBuffer ?? 16 * 1024 * 1024;
  const killGraceMs = options.killGraceMs ?? 2000;

  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      windowsHide: true,
    });
    // Buffers, decoded once at the end: a multi-byte character may span two chunks.
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let size = 0;
    if (child.pid !== undefined && process.platform !== 'win32') trackGroup(child.pid);
    let killedFor: string | null = null;
    let graceTimer: NodeJS.Timeout | undefined;

    const end = (why: string) => {
      if (killedFor !== null || child.pid === undefined) return;
      killedFor = why;
      killTree(child.pid, 'SIGTERM');
      graceTimer = setTimeout(() => killTree(child.pid!, 'SIGKILL'), killGraceMs);
    };
    const timer = setTimeout(() => end(`timed out after ${options.timeoutMs} ms`), options.timeoutMs);

    const collect = (which: 'out' | 'err') => (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBuffer) return end(`output exceeded ${maxBuffer} bytes`);
      (which === 'out' ? out : err).push(chunk);
    };
    child.stdout!.on('data', collect('out'));
    child.stderr!.on('data', collect('err'));

    const fail = (message: string, code: number | null, signal: NodeJS.Signals | null, cause?: Error) =>
      reject(
        Object.assign(new Error(message), {
          stdout: Buffer.concat(out).toString('utf8'),
          stderr: Buffer.concat(err).toString('utf8'),
          code,
          signal,
          killed: killedFor !== null,
          pid: child.pid,
          cause,
        }) as RunCommandTreeError
      );

    child.on('error', (error) => {
      if (child.pid !== undefined) untrackGroup(child.pid);
      clearTimeout(timer);
      clearTimeout(graceTimer);
      fail(`could not run ${command}: ${error.message}`, null, null, error);
    });
    // 'close' waits for the pipes, which stay open while any process of the group lives.
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      clearTimeout(graceTimer);
      // A killed leader may leave group members that ignored SIGTERM.
      if (killedFor !== null && child.pid !== undefined) killTree(child.pid, 'SIGKILL');
      if (child.pid !== undefined) untrackGroup(child.pid);
      if (killedFor !== null) return fail(killedFor, code, signal);
      if (code === 0) return resolve(Buffer.concat(out).toString('utf8'));
      fail(`Command failed with exit code ${code ?? signal}: ${command} ${args.slice(0, 4).join(' ')}`, code, signal);
    });
  });
}
