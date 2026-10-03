import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { TestExecutorService } from '../../../../src/domains/test-execution/services/test-executor.js';
import { RetryHandlerService } from '../../../../src/domains/test-execution/services/retry-handler.js';
import type { Result } from '../../../../src/shared/types/index.js';

const fixtures: string[] = [];
const ownedPids: number[] = [];
const reportDirs: string[] = [];

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); } catch { return false; }
  // A SIGKILLed zombie awaiting reaping by PID 1 cannot run; count it as stopped.
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3) !== 'Z';
  } catch { return true; }
}

async function until(predicate: () => boolean, timeout = 2500): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (!predicate() && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return predicate();
}

afterEach(async () => {
  for (const pid of ownedPids.splice(0)) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* Already reaped. */ }
  }
  await new Promise(resolve => setTimeout(resolve, 100));
  for (const path of reportDirs.splice(0)) rmSync(path, { recursive: true, force: true });
  for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe.skipIf(process.platform === 'win32')('native test-runner timeout cleanup', () => {
  it.each([
    { service: 'executor', kind: 'runner' },
    { service: 'executor', kind: 'descendant' },
    { service: 'executor', kind: 'descendant-without-pipes' },
    { service: 'retry', kind: 'descendant-without-pipes' },
  ])('stops a TERM-resistant $kind after the $service timeout', async ({ service, kind }) => {
    const fixture = mkdtempSync(join(tmpdir(), 'aqe-runner-timeout-'));
    fixtures.push(fixture);
    const pidFile = join(fixture, 'owned.pid');
    const rootFile = join(fixture, 'root.pid');
    const resistant = join(fixture, 'resistant.cjs');
    writeFileSync(resistant, `const fs = require('node:fs');
process.on('SIGTERM', () => {});
fs.writeFileSync(process.argv[2], String(process.pid));
setInterval(() => {}, 100);
`);
    const runner = join(fixture, 'runner.cjs');
    writeFileSync(runner, kind === 'runner' ? readFileSync(resistant) : `const fs = require('node:fs');
const { spawn } = require('node:child_process');
fs.writeFileSync(${JSON.stringify(rootFile)}, String(process.pid));
spawn(process.execPath, [${JSON.stringify(resistant)}, ${JSON.stringify(pidFile)}], { stdio: ${JSON.stringify(kind === 'descendant-without-pipes' ? 'ignore' : 'inherit')} });
setInterval(() => {}, 100);
`);

    const executor = new TestExecutorService({ memory: {} as never });
    const internals = executor as unknown as {
      buildTestCommand(files: string[], framework: string): {
        command: string; args: string[]; report?: { path: string; cleanup(): void };
      };
      spawnTestRunner(files: string[], framework: string, timeout: number): Promise<Result<unknown, Error>>;
    };
    const original = internals.buildTestCommand.bind(internals);
    // Instrument only the executable: the actual service spawns, times out,
    // signals and cleans its own native child and real JSON-report directory.
    internals.buildTestCommand = (files, framework) => {
      const command = original(files, framework);
      reportDirs.push(dirname(command.report!.path));
      return { ...command, command: process.execPath, args: [runner, pidFile] };
    };
    let running: Promise<Result<unknown, Error>>;
    if (service === 'retry') {
      const retry = new RetryHandlerService({} as never, { testTimeout: 3000 });
      const retryInternals = retry as unknown as {
        buildTestCommand(runner: string, file: string): { report: { path: string; cleanup(): void } };
        spawnTestProcess(command: string, args: string[], cwd: string,
          report: { path: string; cleanup(): void }): Promise<unknown>;
      };
      const { report } = retryInternals.buildTestCommand('vitest', runner);
      reportDirs.push(dirname(report.path));
      running = retryInternals.spawnTestProcess(process.execPath, [runner, pidFile], fixture, report)
        .then(value => ({ success: true as const, value }), error => ({ success: false as const, error }));
    } else {
      running = internals.spawnTestRunner([runner], 'vitest', 3000);
    }
    expect(await until(() => existsSync(pidFile), 2500)).toBe(true);
    const pid = Number(readFileSync(pidFile, 'utf8'));
    ownedPids.push(pid);
    if (existsSync(rootFile)) ownedPids.push(Number(readFileSync(rootFile, 'utf8')));

    const result = await running;
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('timed out');
    expect(await until(() => !isAlive(pid))).toBe(true);
    expect(await until(() => !existsSync(reportDirs[0]))).toBe(true);
  });

  it('stops descendants when a public execute caller exits in its earlier SIGTERM handler', async () => {
    const fixture = mkdtempSync(join(tmpdir(), 'aqe-runner-parent-exit-'));
    fixtures.push(fixture);
    const pidFile = join(fixture, 'owned.pid');
    const child = join(fixture, 'resistant.cjs');
    writeFileSync(child, `const fs = require('node:fs');
process.on('SIGTERM', () => {});
fs.writeFileSync(process.argv[2], String(process.pid));
setInterval(() => {}, 100);
`);
    const runner = join(fixture, 'blocking.test.cjs');
    writeFileSync(runner, `const { spawn } = require('node:child_process');
spawn(process.execPath, [${JSON.stringify(child)}, ${JSON.stringify(pidFile)}], { stdio: 'ignore' });
require('node:test').test('blocking fixture', () => new Promise(() => {}));
setInterval(() => {}, 100);
`);
    const parentScript = join(fixture, 'parent.mjs');
    const source = pathToFileURL(resolve('src/domains/test-execution/services/test-executor.ts')).href;
    writeFileSync(parentScript, `import { TestExecutorService } from ${JSON.stringify(source)};
process.on('SIGTERM', () => process.exit(0));
const executor = new TestExecutorService({ memory: { set: async () => {} } }, { enableLLMAnalysis: false });
await executor.execute({ testFiles: [${JSON.stringify(runner)}], framework: 'node', timeout: 30000 });
`);
    const parent = spawn(process.execPath, [
      '--import', resolve('node_modules/tsx/dist/loader.mjs'), parentScript,
    ], { cwd: fixture, stdio: 'ignore', env: { ...process.env, AQE_PROJECT_ROOT: fixture } });
    ownedPids.push(parent.pid!);
    const closed = new Promise(resolve => parent.once('close', resolve));
    expect(await until(() => existsSync(pidFile), 2500)).toBe(true);
    const pid = Number(readFileSync(pidFile, 'utf8'));
    ownedPids.push(pid);
    parent.kill('SIGTERM');
    await closed;
    expect(await until(() => !isAlive(pid))).toBe(true);
  });
  it('keeps the timeout classification when a denied cleanup leaves a real runner alive', async () => {
    const fixture = mkdtempSync(join(tmpdir(), 'aqe-retry-cleanup-failure-'));
    fixtures.push(fixture);
    const runner = join(fixture, 'runner.cjs');
    const pidFile = join(fixture, 'owned.pid');
    writeFileSync(runner, `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 100);`);
    const actualKill = process.kill.bind(process);
    // Reproduce denied signalling against a real owned child. Unknown
    // settlement must retain reports without replacing the timeout outcome.
    const kill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      if (pid < 0 && signal === 'SIGTERM') throw Object.assign(new Error('cleanup probe denied'), { code: 'EPERM' });
      return actualKill(pid, signal);
    });
    const retry = new RetryHandlerService({} as never, { testTimeout: 300 });
    const internal = retry as unknown as {
      buildTestCommand(runner: string, file: string): { report: { path: string; cleanup(): void } };
      spawnTestProcess(command: string, args: string[], cwd: string, report: { path: string; cleanup(): void }): Promise<unknown>;
    };
    const { report } = internal.buildTestCommand('vitest', runner);
    reportDirs.push(dirname(report.path));
    try {
      const running = internal.spawnTestProcess(process.execPath, [runner], fixture, report);
      const rejected = expect(running).rejects.toThrow('timed out');
      expect(await until(() => existsSync(pidFile), 250)).toBe(true);
      const pid = Number(readFileSync(pidFile, 'utf8'));
      ownedPids.push(pid);
      await rejected;
      expect(isAlive(pid)).toBe(true);
      expect(existsSync(dirname(report.path))).toBe(true);
      expect(process.listeners('exit').some(listener => listener.name === 'stopGroupsOnExit')).toBe(true);
    } finally { kill.mockRestore(); }
  });

});
