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
    let stdout = '';
    let stderr = '';
    let size = 0;
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
      if (which === 'out') stdout += chunk.toString('utf8');
      else stderr += chunk.toString('utf8');
    };
    child.stdout!.on('data', collect('out'));
    child.stderr!.on('data', collect('err'));

    const fail = (message: string, code: number | null, signal: NodeJS.Signals | null, cause?: Error) =>
      reject(
        Object.assign(new Error(message), {
          stdout,
          stderr,
          code,
          signal,
          killed: killedFor !== null,
          pid: child.pid,
          cause,
        }) as RunCommandTreeError
      );

    child.on('error', (error) => {
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
      if (killedFor !== null) return fail(killedFor, code, signal);
      if (code === 0) return resolve(stdout);
      fail(`Command failed with exit code ${code ?? signal}: ${command} ${args.slice(0, 4).join(' ')}`, code, signal);
    });
  });
}
