import { spawn, type ChildProcess } from 'node:child_process';

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
      try { process.kill(-proc.pid!, 0); return true; } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
        // Darwin can report EPERM for signal 0 while an already-killed group
        // is being reaped. Only tolerate it after our SIGKILL succeeded.
        if (forceSent && (error as NodeJS.ErrnoException).code === 'EPERM') return true;
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
