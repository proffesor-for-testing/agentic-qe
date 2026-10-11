/**
 * #872: npm/npx are .cmd shims on Windows, which Node refuses to start without
 * a shell (EINVAL since CVE-2024-27980). Callers must run the bundled JS CLI
 * through process.execPath instead, and keep the POSIX path unchanged.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const seam = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('child_process')>()),
  spawn: seam.spawn,
}));

import { npmCliInvocation } from '../../../src/shared/npm-cli-invocation.js';
import { VitestPhaseExecutor } from '../../../src/test-scheduling/executors/vitest-executor.js';

describe('npmCliInvocation (#872)', () => {
  it('should_runBundledNpxCliViaNode_when_onWindows', () => {
    const node = 'C:\\Program Files\\nodejs\\node.exe';
    const [bin, lead] = npmCliInvocation('npx', 'win32', node, () => true)!;
    expect(bin).toBe(node);
    expect(lead).toHaveLength(1);
    expect(lead[0]).toMatch(/node_modules[\\/]npm[\\/]bin[\\/]npx-cli\.js$/);
  });

  it('should_returnNull_insteadOfACmdShim_when_bundledCliIsMissingOnWindows', () => {
    expect(npmCliInvocation('npx', 'win32', 'C:\\node\\node.exe', () => false)).toBeNull();
  });

  it('should_keepPlainToolName_when_notOnWindows', () => {
    expect(npmCliInvocation('npx', 'linux', '/usr/bin/node', () => true)).toEqual(['npx', []]);
    expect(npmCliInvocation('npm', 'darwin', '/usr/bin/node', () => true)).toEqual(['npm', []]);
  });
});

describe('VitestPhaseExecutor npx spawn on Windows (#872)', () => {
  const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const realExecPath = process.execPath;
  let tmp: string | undefined;

  afterEach(() => {
    Object.defineProperty(process, 'platform', realPlatform);
    process.execPath = realExecPath;
    seam.spawn.mockReset();
    if (tmp) rmSync(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  function fakeChild() {
    const child = Object.assign(new EventEmitter(), {
      pid: 4242, stdout: new EventEmitter(), stderr: new EventEmitter(),
    });
    setImmediate(() => child.emit('close', 0));
    return child;
  }

  function simulateWindows(withNpxCli: boolean): string {
    tmp = mkdtempSync(join(tmpdir(), 'aqe-872-node-'));
    const npmBin = join(tmp, 'node_modules', 'npm', 'bin');
    mkdirSync(npmBin, { recursive: true });
    if (withNpxCli) writeFileSync(join(npmBin, 'npx-cli.js'), '');
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.execPath = join(tmp, 'node.exe');
    return join(npmBin, 'npx-cli.js');
  }

  it('should_spawnNodeWithNpxCli_and_noShell_insteadOf_npxCmd', async () => {
    const npxCli = simulateWindows(true);
    seam.spawn.mockImplementation(fakeChild);

    const ready = await new VitestPhaseExecutor().isReady();

    expect(ready).toBe(true);
    const [cmd, args, opts] = seam.spawn.mock.calls[0];
    expect(cmd).toBe(process.execPath);
    expect(args).toEqual([npxCli, 'vitest', '--version']);
    expect(opts.shell).toBe(false);
  });

  it('should_failClearly_withoutSpawning_when_npxCliIsMissing', async () => {
    simulateWindows(false);

    const ready = await new VitestPhaseExecutor().isReady();

    expect(ready).toBe(false);
    expect(seam.spawn).not.toHaveBeenCalled();
  });
});
