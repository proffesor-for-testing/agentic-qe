import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

/** Linux signal 0 also sees zombies, which can never execute or write files. */
function hasLiveLinuxGroupMember(group: number): boolean {
  for (const pid of readdirSync('/proc')) {
    if (!/^\d+$/.test(pid)) continue;
    let stat: string;
    try { stat = readFileSync(`/proc/${pid}/stat`, 'utf8'); }
    catch (error) {
      if (['ENOENT', 'ESRCH'].includes((error as NodeJS.ErrnoException).code ?? '')) continue;
      throw error; // Unknown process state must not be claimed as stopped.
    }
    // The comm field can contain spaces and parentheses; its final ')' is the
    // boundary before state, ppid and pgrp, not the first whitespace token.
    const fields = stat.slice(stat.lastIndexOf(')') + 1).trim().split(/\s+/);
    if (fields.length < 3 || !/^\d+$/.test(fields[2])) throw new Error(`Invalid process stat for ${pid}`);
    if (Number(fields[2]) === group && fields[0] !== 'Z' && fields[0] !== 'X') return true;
  }
  return false;
}

/** Signal probes on Darwin may deny access while dead group members are reaped. */
function hasLiveDarwinGroupMember(group: number): boolean {
  const snapshot = execFileSync('ps', ['-axo', 'pgid=,stat='], {
    encoding: 'utf8', timeout: 1000, maxBuffer: 1024 * 1024,
  });
  for (const line of snapshot.split('\n')) {
    if (!line.trim()) continue;
    const match = /^\s*(\d+)\s+([A-Z?])\S*\s*$/.exec(line);
    if (!match) throw new Error('Could not determine Darwin process group state');
    if (Number(match[1]) === group && match[2] !== 'Z') return true;
  }
  return false;
}

const activeGroups = new Set<number>();
const stopGroupsOnExit = (): void => {
  for (const pid of activeGroups) {
    try { process.kill(-pid, 'SIGKILL'); } catch { /* Already exited. */ }
  }
};

/** Keep detached runners subject to the CLI's synchronous exit handling. */
export function trackTestRunnerExit(proc: ChildProcess): () => void {
  const pid = proc.pid;
  if (process.platform === 'win32' || pid === undefined) return () => {};
  if (activeGroups.size === 0) process.once('exit', stopGroupsOnExit);
  activeGroups.add(pid);
  return () => {
    activeGroups.delete(pid);
    if (activeGroups.size === 0) process.off('exit', stopGroupsOnExit);
  };
}

/**
 * Stop a test runner spawned in its own POSIX process group. The returned
 * promise waits for the group to stop before report files may be removed.
 * Windows uses taskkill's tree operation while the root PID still exists.
 */
export function terminateTestRunner(proc: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    const linux = platform === 'linux';
    const grouped = process.platform !== 'win32' && proc.pid !== undefined;
    const windowsTree = process.platform === 'win32' && proc.pid !== undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    let forceSent = false;
    let closed = false;
    let treeStopped = false;

    const finish = (): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      proc.off('close', onClose);
      resolve();
    };
    const fail = (error: unknown): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      proc.off('close', onClose);
      reject(error);
    };
    const groupExists = (): boolean => {
      try {
        process.kill(-proc.pid!, 0);
        return forceSent && linux ? hasLiveLinuxGroupMember(proc.pid!) : true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
        // A delivered group signal is not proof every member died. Inspect
        // actual states; failures/malformed snapshots remain unknown and reject.
        if (platform === 'darwin' && (error as NodeJS.ErrnoException).code === 'EPERM') {
          return hasLiveDarwinGroupMember(proc.pid!);
        }
        if (forceSent && linux && (error as NodeJS.ErrnoException).code === 'EPERM') {
          return hasLiveLinuxGroupMember(proc.pid!);
        }
        throw error;
      }
    };
    const signalGroup = (signal: NodeJS.Signals): boolean => {
      try { process.kill(-proc.pid!, signal); return true; } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
        throw error;
      }
    };
    const onClose = (): void => {
      closed = true;
      try {
        if (windowsTree) {
          if (treeStopped) finish();
          return;
        }
        // A root can exit before a TERM-resistant descendant. Keep escalation
        // active while its owned group exists, even when stdio has closed.
        if (!grouped || !groupExists()) finish();
      } catch (error) { fail(error); }
    };
    proc.once('close', onClose);

    try {
      if (grouped) {
        if (!signalGroup('SIGTERM')) { finish(); return; }
        timer = setTimeout(() => {
          try {
            if (!signalGroup('SIGKILL')) { finish(); return; }
            forceSent = true;
            const deadline = Date.now() + 1000;
            const poll = (): void => {
              try {
                // Do not discard report files while group exit is unknown.
                if (!groupExists()) finish();
                else if (Date.now() >= deadline) fail(new Error(`Test runner group ${proc.pid} survived SIGKILL.`));
                else timer = setTimeout(poll, 20);
              } catch (error) { fail(error); }
            };
            poll();
          } catch (error) { fail(error); }
        }, 1000);
      } else if (windowsTree) {
        const killer = spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], {
          stdio: 'ignore', windowsHide: true, timeout: 2000,
        });
        killer.once('error', fail);
        killer.once('close', code => {
          if (code !== 0) {
            fail(new Error(`Test runner tree termination failed (taskkill exit ${code}).`));
          } else {
            treeStopped = true;
            if (closed) finish();
          }
        });
      } else {
        // No PID is available before spawn failure (and in test doubles).
        proc.kill('SIGTERM');
        if (finished) return;
        timer = setTimeout(() => { proc.kill('SIGKILL'); }, 1000);
      }
    } catch (error) { fail(error); }
  });
}

/** The `spawnSync` result fields a test-runner caller reads. */
export interface TestRunnerProcessResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
}

export interface TestRunnerProcessOptions {
  cwd: string;
  /** Kill the runner and report ETIMEDOUT after this many milliseconds. */
  timeout: number;
  env?: NodeJS.ProcessEnv;
  /** Per-stream output limit; exceeding it kills the runner (ENOBUFS). */
  maxBuffer?: number;
}

/** `spawnSync`'s default per-stream output limit. */
const DEFAULT_MAX_BUFFER = 1024 * 1024;

/** Longest wait for the runner's pipes to close after it has been stopped. */
const PIPE_RELEASE_GRACE_MS = 3000;

/**
 * #1074: run a test runner without blocking the event loop. Resolves with the
 * same fields and failure semantics `spawnSync` reports: exit status or
 * terminating signal, captured UTF-8 stdout/stderr, an ETIMEDOUT error after
 * `timeout`, an ENOBUFS error once a stream exceeds `maxBuffer`, and the
 * spawn error itself when the command cannot start. The runner gets its own
 * process group, so a timeout or overflow stops the whole `npx` tree before
 * the promise settles and before any report file is removed.
 */
export function runTestRunnerProcess(
  command: string,
  args: readonly string[],
  options: TestRunnerProcessOptions,
): Promise<TestRunnerProcessResult> {
  const maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER;
  return new Promise(resolve => {
    let stdout = '';
    let stderr = '';
    let error: NodeJS.ErrnoException | undefined;
    let stopping: Promise<void> | undefined;
    let releaseTimer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    let proc: ChildProcess;
    try {
      proc = spawn(command, [...args], {
        cwd: options.cwd,
        env: options.env ?? process.env,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (spawnError) {
      resolve({ status: null, signal: null, stdout, stderr, error: spawnError as NodeJS.ErrnoException });
      return;
    }
    const untrackExit = trackTestRunnerExit(proc);

    const settle = (status: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(releaseTimer);
      // Report the signal the runner was stopped with, as spawnSync does.
      const stoppedWith = stopping && !signal ? 'SIGTERM' : signal;
      const result = { status: stopping ? null : status, signal: stoppedWith, stdout, stderr, error };
      const done = (): void => { untrackExit(); resolve(result); };
      if (stopping) stopping.then(done, done);
      else done();
    };
    const stop = (code: 'ETIMEDOUT' | 'ENOBUFS', message: string): void => {
      if (stopping) return;
      error = Object.assign(new Error(message), { code, syscall: `spawnSync ${command}` });
      stopping = terminateTestRunner(proc);
      // spawnSync closes the runner's pipes when it kills it. Do the same once
      // the runner is stopped, or after a grace period, so a descendant that
      // left the process group (e.g. a detached server holding the inherited
      // stdout) cannot keep 'close', and so the result, pending forever.
      const release = (): void => {
        proc.stdout?.destroy();
        proc.stderr?.destroy();
      };
      stopping.then(release, release);
      releaseTimer = setTimeout(release, PIPE_RELEASE_GRACE_MS);
    };

    const timer = setTimeout(() => stop('ETIMEDOUT', `spawnSync ${command} ETIMEDOUT`), options.timeout);
    const collect = (stream: 'stdout' | 'stderr') => (chunk: string): void => {
      if (stopping) return;
      const next = (stream === 'stdout' ? stdout : stderr) + chunk;
      const kept = next.length > maxBuffer ? next.slice(0, maxBuffer) : next;
      if (stream === 'stdout') stdout = kept; else stderr = kept;
      if (next.length > maxBuffer) stop('ENOBUFS', `spawnSync ${command} ENOBUFS`);
    };
    proc.stdout?.setEncoding('utf8').on('data', collect('stdout'));
    proc.stderr?.setEncoding('utf8').on('data', collect('stderr'));

    proc.once('error', (spawnError: NodeJS.ErrnoException) => {
      error ??= spawnError;
      // A runner that never started emits no 'close' with a status to wait for.
      if (proc.pid === undefined) settle(null, null);
    });
    proc.once('close', (status: number | null, signal: NodeJS.Signals | null) => settle(status, signal));
  });
}

/**
 * Stdout of a command that must exit 0, run like runTestRunnerProcess (no
 * blocking, process-group stop on timeout). Rejects with the ETIMEDOUT,
 * ENOBUFS or spawn error, or with an error carrying `status` and `stderr`.
 */
export async function runProcessText(
  command: string,
  args: readonly string[],
  options: TestRunnerProcessOptions,
): Promise<string> {
  const result = await runTestRunnerProcess(command, args, options);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw Object.assign(
      new Error(`${command} exited with ${result.status ?? result.signal}: ${result.stderr.trim()}`),
      { status: result.status, stderr: result.stderr },
    );
  }
  return result.stdout;
}
