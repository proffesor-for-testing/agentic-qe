/**
 * #995 review B1/BL1 — the coverage runner must not leave orphans behind.
 *
 * `execSync`'s timeout killed only `/bin/sh`; `npm exec vitest` was reparented
 * to PID 1, kept running, and kept writing into the temp dir that had just been
 * "cleaned". And when the HOST exits mid-run (SIGTERM, client disconnect), the
 * detached group must die with it. These tests use real processes (no mocks).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildJsCoverageInvocation,
  findPackageBin,
  runJsCoverage,
  runProcessTree,
} from '../../../../src/coordination/handlers/coverage-runner';

const isWindows = process.platform === 'win32';
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const RUNNER_TS = path.join(REPO_ROOT, 'src/coordination/handlers/coverage-runner.ts');

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function waitFor(cond: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (cond()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return cond();
}

/**
 * Install a fake vitest in `project/node_modules` that forks a worker which
 * keeps writing into the report dir, records both pids, and then hangs — the
 * shape of vitest → workers.
 */
function installHangingVitest(project: string, pidDir: string): void {
  const pkgDir = path.join(project, 'node_modules', 'vitest');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'vitest', bin: { vitest: './vitest.mjs' } }));
  fs.writeFileSync(path.join(pkgDir, 'vitest.mjs'), `import fs from 'node:fs';
import { spawn } from 'node:child_process';
let out = '';
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--coverage.reportsDirectory=')) out = a.slice('--coverage.reportsDirectory='.length);
}
const worker = spawn('sh', ['-c', 'while true; do touch "$1/late-write" 2>/dev/null; sleep 0.1; done', 'w', out], { stdio: 'ignore' });
fs.writeFileSync(${JSON.stringify(path.join(pidDir, 'runner.pid'))}, String(process.pid));
fs.writeFileSync(${JSON.stringify(path.join(pidDir, 'worker.pid'))}, String(worker.pid));
setInterval(() => {}, 1000);
`);
}

describe.skipIf(isWindows)('#995 review B1 — process-tree timeout', () => {
  let dir: string;
  const originalTmp = process.env.TMPDIR;

  beforeEach(() => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-995-runner-')));
  });

  afterEach(() => {
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
    fs.mkdirSync(tmp);
    const project = path.join(dir, 'project');
    fs.mkdirSync(project);
    installHangingVitest(project, dir);
    process.env.TMPDIR = tmp;

    const run = await runJsCoverage(project, { timeoutMs: 1500 });

    expect(run.timedOut).toBe(true);
    expect(run.data).toBeNull();
    const worker = Number(fs.readFileSync(path.join(dir, 'worker.pid'), 'utf-8').trim());
    expect(alive(worker), 'worker survived the timeout').toBe(false);

    // Nothing recreates the cleaned temp dir afterwards.
    await new Promise(r => setTimeout(r, 400));
    expect(fs.readdirSync(tmp)).toEqual([]);
  }, 20000);

  it('captures the tail of stderr from a crashing runner', async () => {
    const result = await runProcessTree('sh', ['-c', 'echo "Error: boom" >&2; exit 3'], { cwd: dir, timeoutMs: 5000 });
    expect(result).toMatchObject({ exitCode: 3, timedOut: false, stderrTail: 'Error: boom' });
  });

  it('reports a clean exit without timing out', async () => {
    const result = await runProcessTree('sh', ['-c', 'exit 0'], { cwd: dir, timeoutMs: 5000 });
    expect(result).toMatchObject({ exitCode: 0, timedOut: false, spawnError: false });
  });

  it('reports a missing binary as a spawn error, not a hang', async () => {
    const result = await runProcessTree('aqe-no-such-binary-995', [], { cwd: dir, timeoutMs: 5000 });
    expect(result.spawnError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// BL1 — the host process exits mid-run
// ---------------------------------------------------------------------------

describe.skipIf(isWindows)('#995 review BL1 — coverage group dies with the host', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-995-host-')));
  });

  afterEach(() => {
    // Belt and braces: never leak a hanging fake runner from a failed assertion.
    for (const f of ['runner.pid', 'worker.pid']) {
      try { process.kill(Number(fs.readFileSync(path.join(dir, f), 'utf-8')), 'SIGKILL'); } catch { /* gone */ }
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /**
   * A server-like host, shaped like the MCP entry point: SIGTERM and stdin EOF
   * both end in `process.exit()`. It starts a coverage run that would hang
   * for 10 minutes.
   */
  function startHost(tmp: string, project: string) {
    const script = path.join(dir, 'host.mts');
    fs.writeFileSync(script, `import { runJsCoverage } from ${JSON.stringify(RUNNER_TS)};
process.on('SIGTERM', () => process.exit(0));
process.stdin.on('end', () => process.exit(0));
process.stdin.resume();
void runJsCoverage(${JSON.stringify(project)}, { timeoutMs: 600000 });
`);
    return spawn(process.execPath, ['--import', 'tsx', script], {
      cwd: REPO_ROOT,
      env: { ...process.env, TMPDIR: tmp },
      stdio: ['pipe', 'ignore', 'ignore'],
    });
  }

  async function exercise(stop: (host: ReturnType<typeof startHost>) => void): Promise<void> {
    const tmp = path.join(dir, 'tmp');
    fs.mkdirSync(tmp);
    const project = path.join(dir, 'project');
    fs.mkdirSync(project);
    installHangingVitest(project, dir);

    const host = startHost(tmp, project);
    const exited = new Promise<number | null>(r => host.on('exit', code => r(code)));

    const workerPidFile = path.join(dir, 'worker.pid');
    expect(await waitFor(() => fs.existsSync(workerPidFile), 30000), 'coverage run never started').toBe(true);
    const runner = Number(fs.readFileSync(path.join(dir, 'runner.pid'), 'utf-8'));
    const worker = Number(fs.readFileSync(workerPidFile, 'utf-8'));
    expect(alive(runner) && alive(worker)).toBe(true);
    expect(fs.readdirSync(tmp).some(n => n.startsWith('aqe-js-cov-'))).toBe(true);

    stop(host);
    await exited;
    await new Promise(r => setTimeout(r, 2000));

    expect(alive(runner), 'runner survived the host').toBe(false);
    expect(alive(worker), 'worker survived the host').toBe(false);
    expect(fs.readdirSync(tmp).filter(n => n.startsWith('aqe-js-cov-'))).toEqual([]);
  }

  it('kills the group and removes the temp dir when the host gets SIGTERM', async () => {
    await exercise(host => host.kill('SIGTERM'));
  }, 60000);

  it('kills the group and removes the temp dir when the client closes stdin', async () => {
    await exercise(host => host.stdin!.end());
  }, 60000);
});

// ---------------------------------------------------------------------------
// Invocation: local bin, no shell, no download, plain --outputFile
// ---------------------------------------------------------------------------

describe('#995 review — runner invocation', () => {
  let project: string;

  beforeEach(() => {
    // A space and cmd.exe metacharacters in the path: must survive as data.
    project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe 995 & ^ %-')));
    const pkgDir = path.join(project, 'node_modules', 'vitest');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'vitest', bin: { vitest: './vitest.mjs' } }));
    fs.writeFileSync(path.join(pkgDir, 'vitest.mjs'), '');
  });

  afterEach(() => {
    fs.rmSync(project, { recursive: true, force: true });
  });

  it('starts the local vitest entry with the Node binary — no npx, no shell', () => {
    const reportDir = 'C:\\Users\\Jane Doe\\AppData\\Local\\Temp\\aqe-js-cov-x';
    const inv = buildJsCoverageInvocation(project, reportDir);
    expect(inv.command).toBe(process.execPath);
    expect(inv.args[0]).toBe(path.join(project, 'node_modules', 'vitest', 'vitest.mjs'));
    expect(inv.args).toContain(`--coverage.reportsDirectory=${reportDir}`);
  });

  it('uses plain --outputFile= so a string outputFile in the user config cannot override it (BL3)', () => {
    const inv = buildJsCoverageInvocation(project, '/tmp/aqe-js-cov-x');
    expect(inv.args).toContain(`--outputFile=${path.join('/tmp/aqe-js-cov-x', 'test-results.json')}`);
    expect(inv.args.some(a => a.startsWith('--outputFile.json'))).toBe(false);
    expect(inv.resultsFile).toBe(path.join('/tmp/aqe-js-cov-x', 'test-results.json'));
  });

  it('keeps a hostile path as ONE argument', () => {
    const inv = buildJsCoverageInvocation(project, '/tmp/$(touch pwned) & ^ %');
    expect(inv.args).toContain('--coverage.reportsDirectory=/tmp/$(touch pwned) & ^ %');
  });

  it('returns no command when the runner is not installed (nothing is downloaded)', () => {
    fs.rmSync(path.join(project, 'node_modules'), { recursive: true, force: true });
    const inv = buildJsCoverageInvocation(project, '/tmp/x');
    expect(inv.command).toBeNull();
  });

  it('finds a hoisted runner above a monorepo package', () => {
    const pkg = path.join(project, 'packages', 'a');
    fs.mkdirSync(pkg, { recursive: true });
    expect(findPackageBin(pkg, 'vitest')).toBe(path.join(project, 'node_modules', 'vitest', 'vitest.mjs'));
  });
});
