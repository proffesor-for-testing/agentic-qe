/**
 * #970 review: a repository can commit `.agentic-qe` (or a file inside it) as a
 * symlink. The hook shim and its helpers must never write THROUGH such a link —
 * otherwise opening a hostile repo makes the hook append/write to any file the
 * user can write. Victim files must stay byte-identical.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, lstatSync,
  readdirSync, existsSync, utimesSync, chmodSync, copyFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { WorkersPhase } from '../../../src/init/phases/10-workers.js';
import type { InitContext } from '../../../src/init/phases/phase-interface.js';
import { createDefaultConfig } from '../../../src/init/types.js';

const REPO_ROOT = resolve(__dirname, '../../..');
const SHIM = resolve(REPO_ROOT, '.claude/hooks/aqe-hook.cjs');
const BRAIN = resolve(REPO_ROOT, '.claude/helpers/brain-checkpoint.cjs');
const HOUR_AGO = new Date(Date.now() - 3_600_000);

let tmp: string;
afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

function victim(name: string, bytes: string): string {
  const p = join(tmp, name);
  writeFileSync(p, bytes);
  utimesSync(p, HOUR_AGO, HOUR_AGO); // older than the 5-min health-log throttle
  return p;
}

/** Run the shim so its spawn fails and it records a SPAWN-FAILED health line. */
function runFailingHook(projectDir: string, extraEnv: Record<string, string> = {}): void {
  execFileSync(process.execPath, [SHIM, 'route', '--json'], {
    env: { PATH: process.env.PATH ?? '', CLAUDE_PROJECT_DIR: projectDir, AQE_HOOK_BIN: '/definitely/missing/aqe', ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

describe('aqe-hook.cjs never writes through a committed symlink', () => {
  it('should_leaveVictimByteIdentical_when_hooksHealthLogIsASymlink', () => {
    tmp = mkdtempSync(join(tmpdir(), 'aqe-970-log-'));
    const v = victim('victim.txt', 'VICTIM BYTES\n');
    mkdirSync(join(tmp, 'proj', '.agentic-qe'), { recursive: true });
    symlinkSync(v, join(tmp, 'proj', '.agentic-qe', 'hooks-health.log'));

    runFailingHook(join(tmp, 'proj'));

    expect(readFileSync(v, 'utf-8')).toBe('VICTIM BYTES\n');
  });

  it('should_createNothingInTheTarget_when_agenticQeDirIsASymlink', () => {
    tmp = mkdtempSync(join(tmpdir(), 'aqe-970-dir-'));
    mkdirSync(join(tmp, 'victimdir'));
    mkdirSync(join(tmp, 'proj'));
    symlinkSync(join(tmp, 'victimdir'), join(tmp, 'proj', '.agentic-qe'));

    runFailingHook(join(tmp, 'proj'));

    expect(readdirSync(join(tmp, 'victimdir'))).toEqual([]);
  });

  it('still writes the health log as a regular file in a normal project', () => {
    tmp = mkdtempSync(join(tmpdir(), 'aqe-970-ok-'));
    mkdirSync(join(tmp, 'proj'));

    runFailingHook(join(tmp, 'proj'));

    const log = join(tmp, 'proj', '.agentic-qe', 'hooks-health.log');
    expect(lstatSync(log).isFile()).toBe(true);
    expect(readFileSync(log, 'utf-8')).toMatch(/SPAWN-FAILED/);
  });
});

describe('brain-checkpoint.cjs never writes through a committed symlink', () => {
  /** Project with the helper + a fake POSIX `aqe` that writes to its `-o` path. */
  function brainProject(): { proj: string; fakeAqe: string } {
    const proj = join(tmp, 'proj');
    mkdirSync(join(proj, '.claude', 'helpers'), { recursive: true });
    copyFileSync(BRAIN, join(proj, '.claude', 'helpers', 'brain-checkpoint.cjs'));
    const fakeAqe = join(tmp, 'aqe');
    writeFileSync(fakeAqe, '#!/bin/sh\nwhile [ $# -gt 0 ]; do [ "$1" = "-o" ] && out=$2; shift; done\n'
      + 'printf RVF > "$out"; echo "Patterns: 3"\n');
    chmodSync(fakeAqe, 0o755);
    return { proj, fakeAqe };
  }
  const exportBrain = (proj: string, fakeAqe: string) => JSON.parse(execFileSync(process.execPath,
    [join(proj, '.claude', 'helpers', 'brain-checkpoint.cjs'), 'export', '--json'],
    { env: { PATH: process.env.PATH ?? '', AQE_HOOK_BIN: fakeAqe }, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }));

  it.skipIf(process.platform === 'win32')('should_dropADanglingAqeRvfLink_insteadOfCreatingItsTarget', () => {
    tmp = mkdtempSync(join(tmpdir(), 'aqe-970-rvf-'));
    const { proj, fakeAqe } = brainProject();
    mkdirSync(join(proj, '.agentic-qe'));
    writeFileSync(join(proj, '.agentic-qe', 'memory.db'), ''); // placeholder in a tmp dir only
    const planted = join(tmp, 'planted-by-repo.txt');
    symlinkSync(planted, join(proj, '.agentic-qe', 'aqe.rvf'));

    expect(exportBrain(proj, fakeAqe)).toEqual({ exported: true, patterns: 3 });
    expect(existsSync(planted)).toBe(false);
    expect(lstatSync(join(proj, '.agentic-qe', 'aqe.rvf')).isFile()).toBe(true);
  });

  it.skipIf(process.platform === 'win32')('should_refuseToExport_when_agenticQeDirIsASymlink', () => {
    tmp = mkdtempSync(join(tmpdir(), 'aqe-970-brain-dir-'));
    const { proj, fakeAqe } = brainProject();
    mkdirSync(join(tmp, 'victimdir'));
    writeFileSync(join(tmp, 'victimdir', 'memory.db'), '');
    writeFileSync(join(tmp, 'victimdir', 'aqe.rvf'), 'VICTIM-RVF');
    symlinkSync(join(tmp, 'victimdir'), join(proj, '.agentic-qe'));

    const result = exportBrain(proj, fakeAqe);

    expect(result.exported).toBe(false);
    expect(result.reason).toMatch(/symlink/);
    expect(readFileSync(join(tmp, 'victimdir', 'aqe.rvf'), 'utf-8')).toBe('VICTIM-RVF');
  });
});

describe('generated start-daemon.cjs never writes through a committed symlink', () => {
  async function generate(): Promise<string> {
    const projectRoot = join(tmp, 'proj');
    mkdirSync(projectRoot);
    const context: InitContext = {
      projectRoot, options: {}, config: createDefaultConfig('demo', projectRoot),
      enhancements: { claudeFlow: false, ruvector: false }, results: new Map(),
      services: { log: () => {}, warn: () => {}, error: () => {} },
    };
    const result = await new WorkersPhase().execute(context);
    expect(result.success, result.error?.message).toBe(true);
    return join(projectRoot, '.agentic-qe', 'workers');
  }
  /** Run it with child_process.spawn faked (no MCP server, no npx download). */
  function startDaemon(workers: string): void {
    const preload = join(tmp, 'fake-spawn.cjs');
    writeFileSync(preload, `const cp = require('child_process'); const { EventEmitter } = require('events');
      cp.spawn = () => Object.assign(new EventEmitter(), { pid: 4242, stdout: new EventEmitter(), stderr: new EventEmitter(), unref() {} });`);
    try {
      execFileSync(process.execPath, ['-r', preload, join(workers, 'start-daemon.cjs')], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch { /* exit code is asserted via side effects */ }
  }

  it('should_leaveVictimsByteIdentical_when_daemonLogAndPidAreSymlinks', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'aqe-970-daemon-'));
    const workers = await generate();
    const vLog = victim('victim-log.txt', 'VICTIM-LOG\n');
    const vPid = victim('victim-pid.txt', 'VICTIM-PID\n');
    rmSync(join(workers, 'daemon.log'), { force: true });
    rmSync(join(workers, 'daemon.pid'), { force: true });
    symlinkSync(vLog, join(workers, 'daemon.log'));
    symlinkSync(vPid, join(workers, 'daemon.pid'));

    startDaemon(workers);

    expect(readFileSync(vLog, 'utf-8')).toBe('VICTIM-LOG\n');
    expect(readFileSync(vPid, 'utf-8')).toBe('VICTIM-PID\n');
    expect(lstatSync(join(workers, 'daemon.pid')).isFile()).toBe(true); // link replaced
    expect(readFileSync(join(workers, 'daemon.pid'), 'utf-8')).toBe('4242');
  });

  it('should_notStart_when_workersDirIsASymlink', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'aqe-970-daemon-dir-'));
    const workers = await generate();
    const script = readFileSync(join(workers, 'start-daemon.cjs'));
    mkdirSync(join(tmp, 'victimdir'));
    rmSync(workers, { recursive: true, force: true });
    symlinkSync(join(tmp, 'victimdir'), workers);
    const realScriptDir = join(tmp, 'proj', '.agentic-qe', 'scripts-copy');
    mkdirSync(realScriptDir);
    writeFileSync(join(realScriptDir, 'start-daemon.cjs'), script); // __dirname/../.. = proj

    startDaemon(realScriptDir);

    expect(readdirSync(join(tmp, 'victimdir'))).toEqual([]);
  });

  it('still writes daemon.log and daemon.pid as regular files in a normal project', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'aqe-970-daemon-ok-'));
    const workers = await generate();

    startDaemon(workers);

    expect(readFileSync(join(workers, 'daemon.pid'), 'utf-8')).toBe('4242');
    expect(readFileSync(join(workers, 'daemon.log'), 'utf-8')).toMatch(/Daemon started with PID: 4242/);
  });
});
