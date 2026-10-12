/**
 * #995 review — the Windows branch of the process-tree runner.
 *
 * Windows has no process groups. This can't run for real on the Linux CI, so
 * the platform is stubbed and `child_process` mocked to check the contract:
 * no shell (the runner's JS entry is started with the Node binary, so a path
 * with spaces or `& ^ %` is passed verbatim and Node 24 raises no DEP0190), not
 * detached, and on timeout the TREE is killed with `taskkill /pid <pid> /T /F`.
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

describe('#995 review — Windows process-tree kill', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;

  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    spawnMock.mockReset();
    spawnSyncMock.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform);
  });

  it('spawns without a shell, not detached, and kills the tree with taskkill /T on timeout', async () => {
    const child = Object.assign(new EventEmitter(), { pid: 4242, stderr: Object.assign(new EventEmitter(), { destroy() {} }) });
    spawnMock.mockReturnValue(child);
    spawnSyncMock.mockImplementation(() => {
      // taskkill ends the tree; the runner then observes the exit.
      setImmediate(() => child.emit('exit', 1));
      return { status: 0 };
    });

    const entry = 'C:\\Program Files\\proj & co\\node_modules\\vitest\\vitest.mjs';
    const reportArg = '--coverage.reportsDirectory=C:\\Users\\Jane Doe\\AppData\\Local\\Temp\\aqe-js-cov-%x^';
    const result = await runProcessTree('C:\\Program Files\\nodejs\\node.exe', [entry, 'run', reportArg], {
      cwd: 'C:\\Program Files\\proj & co', timeoutMs: 20, graceMs: 20,
    });

    expect(spawnMock).toHaveBeenCalledWith(
      'C:\\Program Files\\nodejs\\node.exe',
      [entry, 'run', reportArg],
      expect.objectContaining({ shell: false, detached: false, cwd: 'C:\\Program Files\\proj & co' }),
    );
    expect(spawnSyncMock).toHaveBeenCalledWith('taskkill', ['/pid', '4242', '/T', '/F'], expect.anything());
    expect(result).toMatchObject({ timedOut: true, exitCode: 1 });
  });
});
