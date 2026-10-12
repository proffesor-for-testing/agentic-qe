/**
 * #995 review B1 — the Windows branch of the process-tree runner.
 *
 * Windows has no process groups, and `npx` there is a `.cmd` shim that can only
 * be launched through a shell. This can't run for real on the Linux CI, so the
 * platform is stubbed and `child_process` mocked to check the contract: launch
 * through the shell, not detached, and on timeout kill the TREE with
 * `taskkill /pid <pid> /T /F` rather than signalling only the shell.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

const spawnMock = vi.fn();
const spawnSyncMock = vi.fn();
vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
}));

import { runProcessTree } from '../../../../src/coordination/handlers/coverage-runner';

describe('#995 review B1 — Windows process-tree kill', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;

  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    spawnMock.mockReset();
    spawnSyncMock.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform);
  });

  it('launches through the shell, not detached, and kills the tree with taskkill /T on timeout', async () => {
    const child = Object.assign(new EventEmitter(), { pid: 4242 });
    spawnMock.mockReturnValue(child);
    spawnSyncMock.mockImplementation(() => {
      // taskkill ends the tree; the runner then observes the exit.
      setImmediate(() => child.emit('exit', 1));
      return { status: 0 };
    });

    const result = await runProcessTree('npx', ['vitest', 'run'], { cwd: 'C:\\proj', timeoutMs: 20, graceMs: 20 });

    expect(spawnMock).toHaveBeenCalledWith('npx', ['vitest', 'run'], expect.objectContaining({
      shell: true, detached: false, cwd: 'C:\\proj',
    }));
    expect(spawnSyncMock).toHaveBeenCalledWith('taskkill', ['/pid', '4242', '/T', '/F'], expect.anything());
    expect(result).toMatchObject({ timedOut: true, exitCode: 1 });
  });
});
