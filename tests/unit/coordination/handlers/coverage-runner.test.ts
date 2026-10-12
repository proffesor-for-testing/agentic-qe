/**
 * #995 review B1 — the coverage runner must not leave orphans behind.
 *
 * `execSync`'s timeout killed only `/bin/sh`; `npm exec vitest` was reparented
 * to PID 1, kept running, and kept writing into the temp dir that had just been
 * "cleaned". These tests use real processes (no mocks): a process tree whose
 * leaf outlives its parent, and a fake `npx` that hangs.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildJsCoverageInvocation,
  runJsCoverage,
  runProcessTree,
} from '../../../../src/coordination/handlers/coverage-runner';

const isWindows = process.platform === 'win32';

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

describe.skipIf(isWindows)('#995 review B1 — process-tree timeout', () => {
  let dir: string;
  const originalPath = process.env.PATH;
  const originalTmp = process.env.TMPDIR;

  beforeEach(() => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-995-runner-')));
  });

  afterEach(() => {
    process.env.PATH = originalPath;
    process.env.TMPDIR = originalTmp;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('kills the whole process group on timeout, including grandchildren', async () => {
    const pidFile = path.join(dir, 'grandchild.pid');
    const result = await runProcessTree(
      'sh', ['-c', `sleep 300 & echo $! > ${JSON.stringify(pidFile)}; sleep 300`],
      { cwd: dir, timeoutMs: 300, graceMs: 500 }
    );

    expect(result.timedOut).toBe(true);
    const grandchild = Number(fs.readFileSync(pidFile, 'utf-8').trim());
    expect(grandchild).toBeGreaterThan(0);
    expect(alive(grandchild), 'grandchild survived the timeout').toBe(false);
    expect(alive(result.pid!), 'runner survived the timeout').toBe(false);
  }, 20000);

  it('leaves no surviving child and no temp dir after a hanging test run', async () => {
    const tmp = path.join(dir, 'tmp');
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(tmp);
    fs.mkdirSync(bin);
    const pidFile = path.join(dir, 'worker.pid');
    // A "test runner" that forks a worker which keeps writing into the report
    // dir, then hangs — the shape of `npx` → `npm exec` → vitest → worker.
    fs.writeFileSync(path.join(bin, 'npx'), `#!/bin/sh
out=""
for a in "$@"; do
  case "$a" in --coverage.reportsDirectory=*) out="\${a#--coverage.reportsDirectory=}" ;; esac
done
( while true; do touch "$out/late-write" 2>/dev/null; sleep 0.1; done ) &
echo $! > ${JSON.stringify(pidFile)}
sleep 300
`);
    fs.chmodSync(path.join(bin, 'npx'), 0o755);
    process.env.PATH = `${bin}:${originalPath}`;
    process.env.TMPDIR = tmp;

    const project = path.join(dir, 'project');
    fs.mkdirSync(project);
    const run = await runJsCoverage(project, { timeoutMs: 500 });

    expect(run.timedOut).toBe(true);
    expect(run.data).toBeNull();
    const worker = Number(fs.readFileSync(pidFile, 'utf-8').trim());
    expect(alive(worker), 'worker survived the timeout').toBe(false);

    // Nothing recreates the cleaned temp dir afterwards.
    await new Promise(r => setTimeout(r, 400));
    expect(fs.readdirSync(tmp)).toEqual([]);
  }, 20000);

  it('reports a clean exit without timing out', async () => {
    const result = await runProcessTree('sh', ['-c', 'exit 0'], { cwd: dir, timeoutMs: 5000 });
    expect(result).toMatchObject({ exitCode: 0, timedOut: false, spawnError: false });
  });

  it('reports a missing binary as a spawn error, not a hang', async () => {
    const result = await runProcessTree('aqe-no-such-binary-995', [], { cwd: dir, timeoutMs: 5000 });
    expect(result.spawnError).toBe(true);
  });
});

describe('#995 review N2/N3 — runner invocation', () => {
  it('sends the vitest JSON result and the coverage report into the private report dir', () => {
    const inv = buildJsCoverageInvocation('/no/such/project', '/tmp/aqe-js-cov-x');
    expect(inv.command).toBe('npx');
    expect(inv.args).toContain('--coverage.reportsDirectory=/tmp/aqe-js-cov-x');
    expect(inv.args).toContain('--outputFile.json=/tmp/aqe-js-cov-x/test-results.json');
    expect(inv.resultsFile).toBe('/tmp/aqe-js-cov-x/test-results.json');
  });

  it('keeps a hostile path as ONE argument (no shell interpolation)', () => {
    const inv = buildJsCoverageInvocation('/no/such/project', '/tmp/$(touch pwned)');
    expect(inv.args).toContain('--coverage.reportsDirectory=/tmp/$(touch pwned)');
  });
});
