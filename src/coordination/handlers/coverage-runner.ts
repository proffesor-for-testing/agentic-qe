/**
 * Run a JS/TS project's test runner with coverage — safely (issue #995).
 *
 * Three properties matter here, each learned the hard way:
 *
 *   1. **Run from the project root, write to a private temp dir.** The coverage
 *      report and the runner's JSON result go to `reportDir`, never into the
 *      project tree (#995 wrote `src/coverage/`; vitest's JSON reporter writes
 *      `.vitest/json/output.json` unless told otherwise).
 *   2. **No shell.** Arguments are passed as an array, so a `$(…)` in TMPDIR or
 *      the project path is data, not a command.
 *   3. **Kill the whole process tree on timeout.** `npx` → `npm exec` → vitest
 *      → workers is several levels deep. Killing only the direct child (what
 *      `execSync`'s timeout does) orphans the rest to PID 1, where it keeps
 *      running and keeps writing into the directory we just "cleaned". The child
 *      is started in its own process group and the group is killed.
 */

import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { CoverageData } from '../../domains/coverage-analysis/interfaces';
import { safeJsonParse } from '../../shared/safe-json.js';
import { loadCoverageReportFile } from './coverage-target';

export interface JsCoverageInvocation {
  command: string;
  args: string[];
  /** Where the runner writes its own JSON result (tests run / passed), if supported. */
  resultsFile: string | null;
}

export interface JsCoverageRun {
  /** The runner exited with status 0. */
  exitedCleanly: boolean;
  /** The runner was killed for exceeding the timeout. */
  timedOut: boolean;
  /** Parsed istanbul report, or null when none was written. */
  data: CoverageData | null;
  /**
   * Number of tests the runner reports having run, from its own JSON result.
   * `null` when the runner gives no machine-readable result (mocha/nyc) or it
   * could not be read — "unknown", which callers must not treat as 0.
   */
  numTotalTests: number | null;
}

const RESULTS_FILE = 'test-results.json';

/**
 * Pick the runner and its arguments. Pure: no I/O beyond reading package.json.
 */
export function buildJsCoverageInvocation(projectRoot: string, reportDir: string): JsCoverageInvocation {
  const resultsFile = path.join(reportDir, RESULTS_FILE);
  let deps: Record<string, string> = {};
  try {
    const pkg = safeJsonParse<Record<string, unknown>>(
      fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8')
    );
    deps = {
      ...(pkg.devDependencies as Record<string, string> || {}),
      ...(pkg.dependencies as Record<string, string> || {}),
    };
  } catch {
    // No package.json — use default vitest
  }

  if (deps['jest'] || deps['@jest/core']) {
    return {
      command: 'npx',
      args: ['jest', '--coverage', `--coverageDirectory=${reportDir}`, '--coverageReporters=json',
        '--json', `--outputFile=${resultsFile}`],
      resultsFile,
    };
  }
  if (deps['mocha'] || deps['nyc']) {
    return {
      command: 'npx',
      args: ['nyc', `--report-dir=${reportDir}`, `--temp-dir=${path.join(reportDir, '.nyc_output')}`,
        '--reporter=json', 'mocha'],
      resultsFile: null,
    };
  }
  // vitest is the default — covers vitest, @vitest/coverage-v8, etc.
  return {
    command: 'npx',
    args: ['vitest', 'run', '--coverage', `--coverage.reportsDirectory=${reportDir}`,
      '--coverage.reporter=json', '--reporter=json', `--outputFile.json=${resultsFile}`],
    resultsFile,
  };
}

function readNumTotalTests(resultsFile: string | null): number | null {
  if (!resultsFile) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(resultsFile, 'utf-8')) as { numTotalTests?: unknown };
    return typeof parsed.numTotalTests === 'number' ? parsed.numTotalTests : null;
  } catch {
    return null;
  }
}

/** Is any process of this group still alive? */
function groupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch {
    return false;
  }
}

function killTree(pid: number, signal: NodeJS.Signals): void {
  if (process.platform === 'win32') {
    // Windows has no process groups; taskkill /T walks the tree.
    try { spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
    return;
  }
  try { process.kill(-pid, signal); } catch { /* group already gone */ }
}

async function waitForGroupExit(pid: number, maxMs: number): Promise<void> {
  if (process.platform === 'win32') return;
  const deadline = Date.now() + maxMs;
  while (groupAlive(pid) && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 50));
  }
}

/**
 * Spawn `command args` in `cwd` as the leader of a new process group, wait for
 * it, and on timeout kill the entire group. Resolves only once no process of
 * the group remains (bounded), so the caller can safely delete its temp dir.
 */
export async function runProcessTree(
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number; graceMs?: number }
): Promise<{ exitCode: number | null; timedOut: boolean; spawnError: boolean; pid: number | undefined }> {
  const graceMs = options.graceMs ?? 3000;
  const isWindows = process.platform === 'win32';

  return new Promise(resolve => {
    let timedOut = false;
    let settled = false;
    const child = spawn(command, args, {
      cwd: options.cwd,
      // Own process group (POSIX) so the whole tree can be signalled at once.
      detached: !isWindows,
      // `npx` is a .cmd shim on Windows and cannot be spawned without a shell.
      // Arguments there are paths we built; cmd.exe has no `$(…)` expansion.
      shell: isWindows,
      stdio: 'ignore',
      windowsHide: true,
    });

    const finish = async (exitCode: number | null, spawnError: boolean): Promise<void> => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.pid !== undefined) {
        // Anything left in the group after the runner exited is orphaned work
        // (stray workers, a hung watcher). Sweep it before the caller cleans up.
        if (!isWindows && groupAlive(child.pid)) {
          killTree(child.pid, 'SIGTERM');
          await waitForGroupExit(child.pid, graceMs);
          if (groupAlive(child.pid)) killTree(child.pid, 'SIGKILL');
          await waitForGroupExit(child.pid, graceMs);
        }
      }
      resolve({ exitCode, timedOut, spawnError, pid: child.pid });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid === undefined) return;
      killTree(child.pid, 'SIGTERM');
      setTimeout(() => { if (!settled && child.pid !== undefined) killTree(child.pid, 'SIGKILL'); }, graceMs).unref();
    }, options.timeoutMs);

    child.on('error', () => { void finish(null, true); });
    child.on('exit', code => { void finish(code, false); });
  });
}

/**
 * Run the project's test runner with coverage from `projectRoot`.
 *
 * Everything the runner writes goes to a fresh temp dir that is removed before
 * this returns — after the whole process group is gone.
 */
export async function runJsCoverage(
  projectRoot: string,
  options: { timeoutMs?: number } = {}
): Promise<JsCoverageRun> {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-js-cov-'));
  try {
    const { command, args, resultsFile } = buildJsCoverageInvocation(projectRoot, reportDir);
    const run = await runProcessTree(command, args, {
      cwd: projectRoot,
      timeoutMs: options.timeoutMs ?? 120000,
    });

    const data = run.timedOut
      ? null
      : await loadCoverageReportFile(path.join(reportDir, 'coverage-final.json'));
    return {
      exitedCleanly: run.exitCode === 0 && !run.timedOut,
      timedOut: run.timedOut,
      data,
      numTotalTests: run.timedOut ? null : readNumTotalTests(resultsFile),
    };
  } finally {
    try { fs.rmSync(reportDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}
