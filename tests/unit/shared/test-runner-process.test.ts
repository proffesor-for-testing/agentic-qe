import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { terminateTestRunner } from '../../../src/shared/test-runner-process.js';

const { spawn, execFileSync, readdirSync, readFileSync } = vi.hoisted(() => ({ spawn: vi.fn(), execFileSync: vi.fn(), readdirSync: vi.fn(), readFileSync: vi.fn() }));
vi.mock('node:fs', () => ({ readdirSync, readFileSync }));
vi.mock('node:child_process', () => ({ spawn, execFileSync }));

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function child(pid = 12345): ChildProcess {
  return Object.assign(new EventEmitter(), {
    pid, exitCode: null, signalCode: null, kill: vi.fn(() => true),
  }) as unknown as ChildProcess;
}

function windowsTermination(proc: ChildProcess): Promise<void> {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { ...descriptor, value: 'win32' });
  try { return terminateTestRunner(proc); }
  finally { Object.defineProperty(process, 'platform', descriptor); }
}

describe('test-runner process ownership', () => {
  it('waits for Windows taskkill even if the runner root closes first', async () => {
    const proc = child();
    const killer = new EventEmitter();
    spawn.mockReturnValue(killer);
    let settled = false;
    const result = windowsTermination(proc).then(() => { settled = true; });
    proc.emit('close', null);
    await Promise.resolve();
    expect(settled).toBe(false);
    killer.emit('close', 0);
    await result;
    expect(settled).toBe(true);
    expect(spawn).toHaveBeenCalledWith('taskkill', ['/PID', '12345', '/T', '/F'], {
      stdio: 'ignore', windowsHide: true, timeout: 2000,
    });
  });

  it('rejects a failed Windows tree operation after an early root close', async () => {
    const proc = child();
    const killer = new EventEmitter();
    spawn.mockReturnValue(killer);
    const result = windowsTermination(proc);
    proc.emit('close', null);
    killer.emit('close', 1);
    await expect(result).rejects.toThrow('tree termination failed');
  });

  it('rejects an unavailable Windows taskkill instead of claiming cleanup', async () => {
    spawn.mockReturnValue(new EventEmitter());
    const result = windowsTermination(child());
    spawn.mock.results.at(-1)!.value.emit('error', new Error('ENOENT fixture'));
    await expect(result).rejects.toThrow('ENOENT');
  });

  it.skipIf(process.platform === 'win32')('does not cancel group escalation when only the root closes', async () => {
    vi.useFakeTimers();
    const proc = child();
    let alive = true;
    const kill = vi.spyOn(process, 'kill').mockImplementation((_pid, signal) => {
      if (!alive) throw Object.assign(new Error('gone'), { code: 'ESRCH' });
      if (signal === 'SIGKILL') alive = false;
      return true;
    });
    const result = terminateTestRunner(proc);
    proc.emit('close', null);
    await vi.advanceTimersByTimeAsync(1000);
    await result;
    expect(kill).toHaveBeenCalledWith(-12345, 'SIGTERM');
    expect(kill).toHaveBeenCalledWith(-12345, 'SIGKILL');
  });

  it.skipIf(process.platform === 'win32')('rejects an owned group whose SIGKILL fails', async () => {
    vi.useFakeTimers();
    vi.spyOn(process, 'kill').mockImplementation((_pid, signal) => {
      if (signal === 'SIGKILL') throw Object.assign(new Error('denied'), { code: 'EPERM' });
      return true;
    });
    const result = terminateTestRunner(child());
    const rejection = expect(result).rejects.toThrow('denied');
    await vi.advanceTimersByTimeAsync(1000);
    await rejection;
  });
  it('settles a Linux group containing only unreaped zombies after SIGKILL', async () => {
    vi.useFakeTimers();
    vi.spyOn(process, 'kill').mockReturnValue(true);
    readdirSync.mockReturnValue(['12345', '12346', 'self']);
    readFileSync.mockImplementation((file: string) => file.includes('12345')
      ? '12345 (runner (nested)) Z 1 12345 12345 0'
      : '12346 (child) Z 1 12345 12345 0');
    const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { ...descriptor, value: 'linux' });
    const result = terminateTestRunner(child());
    Object.defineProperty(process, 'platform', descriptor);
    const settled = expect(result).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(2000);
    await settled;
  });
  it('does not mistake a living Linux group member for a zombie', async () => {
    vi.useFakeTimers();
    vi.spyOn(process, 'kill').mockReturnValue(true);
    readdirSync.mockReturnValue(['12345', '12346']);
    readFileSync.mockImplementation((file: string) => file.includes('12345')
      ? '12345 (runner) Z 1 12345 12345 0'
      : '12346 (child) S 1 12345 12345 0');
    const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { ...descriptor, value: 'linux' });
    const result = terminateTestRunner(child());
    Object.defineProperty(process, 'platform', descriptor);
    const rejected = expect(result).rejects.toThrow('survived SIGKILL');
    await vi.advanceTimersByTimeAsync(2000);
    await rejected;
  });

  it('checks Darwin process states instead of treating EPERM as successful cleanup', async () => {
    vi.useFakeTimers();
    vi.spyOn(process, 'kill').mockImplementation((_pid, signal) => {
      if (signal === 0) throw Object.assign(new Error('probe denied'), { code: 'EPERM' });
      return true;
    });
    execFileSync.mockReturnValue('12345 Z\n12345 S+\n');
    const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { ...descriptor, value: 'darwin' });
    const result = terminateTestRunner(child());
    Object.defineProperty(process, 'platform', descriptor);
    const rejected = expect(result).rejects.toThrow('survived SIGKILL');
    await vi.advanceTimersByTimeAsync(2000);
    await rejected;
  });
  it('settles Darwin zombies only when the bounded native snapshot confirms them', async () => {
    vi.useFakeTimers();
    vi.spyOn(process, 'kill').mockImplementation((_pid, signal) => {
      if (signal === 0) throw Object.assign(new Error('probe denied'), { code: 'EPERM' });
      return true;
    });
    execFileSync.mockReturnValue('12345 Z+\n45678 S\n');
    const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { ...descriptor, value: 'darwin' });
    const result = terminateTestRunner(child());
    Object.defineProperty(process, 'platform', descriptor);
    await vi.advanceTimersByTimeAsync(1000);
    await result;
    expect(execFileSync).toHaveBeenCalledWith('ps', ['-axo', 'pgid=,stat='], {
      encoding: 'utf8', timeout: 1000, maxBuffer: 1024 * 1024,
    });
  });
  it('rejects malformed Darwin snapshots instead of claiming cleanup', async () => {
    vi.useFakeTimers();
    vi.spyOn(process, 'kill').mockImplementation((_pid, signal) => {
      if (signal === 0) throw Object.assign(new Error('probe denied'), { code: 'EPERM' });
      return true;
    });
    execFileSync.mockReturnValue('unrecognized ps output\n');
    const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { ...descriptor, value: 'darwin' });
    const result = terminateTestRunner(child());
    Object.defineProperty(process, 'platform', descriptor);
    const rejected = expect(result).rejects.toThrow('Could not determine Darwin');
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
  });
  it('preserves unknown Linux process state as a cleanup failure', async () => {
    vi.useFakeTimers();
    vi.spyOn(process, 'kill').mockReturnValue(true);
    readdirSync.mockReturnValue(['12345']);
    readFileSync.mockImplementation(() => { throw Object.assign(new Error('proc denied'), { code: 'EACCES' }); });
    const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { ...descriptor, value: 'linux' });
    const result = terminateTestRunner(child());
    Object.defineProperty(process, 'platform', descriptor);
    const rejected = expect(result).rejects.toThrow('proc denied');
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
  });

});
