/**
 * Run a JS/TS project's test runner with coverage — safely (issue #995).
 *
 * Properties, each learned the hard way:
 *
 *   1. **Run from the project root, write to a private temp dir.** The coverage
 *      report and the runner's JSON result go to `reportDir`, never into the
 *      project tree (#995 wrote `src/coverage/`). The result file is set with
 *      plain `--outputFile=` — vitest ignores `--outputFile.json=` when the
 *      user's config sets `outputFile` as a string.
 *   2. **No shell, no download.** The runner's own JS entry point is resolved
 *      from the project's `node_modules` and started with `process.execPath`.
 *      Arguments are an array, so `$(…)`, spaces, `& ^ %` in a path are data on
 *      every platform. A runner that isn't installed is reported, never fetched
 *      (`npx` would silently download one).
 *   3. **Kill the whole process tree.** Runner → workers is several levels deep.
 *      The child is started in its own process group (POSIX) and the group is
 *      killed on timeout (`taskkill /T /F` on Windows).
 *   4. **Die with the host.** Every live run is registered; a synchronous
 *      `process.on('exit')` hook kills each group and removes its temp dir. That
 *      covers every path that ends in `process.exit()` or a natural exit — the
 *      MCP server's shutdown on SIGTERM/SIGINT/stdin EOF routes there. It cannot
 *      cover SIGKILL of the host (or a signal with no handler installed): no
 *      code runs in that case, and the group is left to its own timeout-less
 *      fate. Hosts should shut down via a handled signal.
 */

import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { CoverageData } from '../../domains/coverage-analysis/interfaces';
import { safeJsonParse } from '../../shared/safe-json.js';
import { loadCoverageReportFile } from './coverage-target';
import { STDERR_WINDOW_BYTES, summarizeStderr } from './coverage-stderr';

export { summarizeStderr };

export type JsRunnerName = 'vitest' | 'jest' | 'nyc';

export interface JsCoverageInvocation {
  runner: JsRunnerName;
  /** `process.execPath`, or null when the runner is not installed. */
  command: string | null;
  /** `[<runner JS entry>, ...runner args]`. */
  args: string[];
  /** Where the runner writes its own JSON result (tests run / passed), if supported. */
  resultsFile: string | null;
}

export interface JsCoverageRun {
  runner: JsRunnerName;
  /** The runner package was not found in the project's node_modules. Nothing ran. */
  missing: boolean;
  exitCode: number | null;
  exitedCleanly: boolean;
  timedOut: boolean;
  timeoutMs: number;
  /**
   * Parsed istanbul report, or null when none was written. A report that was
   * written but lists no files is `{ files: [] }` — NOT null: "the run covered
   * nothing" is different from "the run produced no report".
   */
  data: CoverageData | null;
  /**
   * Number of tests the runner reports having run, from its own JSON result.
   * `null` when the runner gives no machine-readable result (nyc) or it could
   * not be read — "unknown", which callers must not treat as 0.
   */
  numTotalTests: number | null;
  /**
   * Per-outcome counts from the runner's JSON result (#1027 NB1/NB2), null
   * when unknown. A failing suite is decided from these, not the exit code:
   * vitest also exits non-zero for a coverage-threshold failure.
   */
  numPassedTests?: number | null;
  numFailedTests?: number | null;
  numPendingTests?: number | null;
  numFailedTestSuites?: number | null;
  /** The runner's first error line plus the last ~2 KB of its stderr, redacted (#1150), for diagnosing a crash. */
  stderrTail: string;
}

/**
 * Outcome of a coverage run's tests (#1027 NB2): 'failed' when the runner's
 * own result reports a failed test or test suite, 'passed' when it reports
 * none — whatever the exit code (a coverage-threshold failure exits 1 with
 * every test passing). Without counts (nyc), the exit code decides.
 */
export function testRunStatus(run: JsCoverageRun): 'passed' | 'failed' {
  if (typeof run.numFailedTests === 'number' || typeof run.numFailedTestSuites === 'number') {
    return (run.numFailedTests ?? 0) > 0 || (run.numFailedTestSuites ?? 0) > 0 ? 'failed' : 'passed';
  }
  return run.exitedCleanly ? 'passed' : 'failed';
}

const RESULTS_FILE = 'test-results.json';

// ============================================================================
// Locating the runner
// ============================================================================

/**
 * Find an installed package's bin script, walking up `node_modules` from the
 * project root (hoisted monorepo installs live above the package).
 */
export function findPackageBin(projectRoot: string, pkg: string, binName = pkg, maxDepth = 10): string | null {
  let dir = path.resolve(projectRoot);
  for (let i = 0; i <= maxDepth; i++) {
    const pkgDir = path.join(dir, 'node_modules', pkg);
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8')) as {
        bin?: string | Record<string, string>;
      };
      const rel = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[binName];
      if (rel) {
        const binPath = path.join(pkgDir, rel);
        if (fs.existsSync(binPath)) return binPath;
      }
    } catch {
      // not installed at this level
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function readDeps(projectRoot: string): Record<string, string> {
  try {
    const pkg = safeJsonParse<Record<string, unknown>>(
      fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8')
    );
    return {
      ...(pkg.devDependencies as Record<string, string> || {}),
      ...(pkg.dependencies as Record<string, string> || {}),
    };
  } catch {
    return {};
  }
}

const RUNNER_DEPS = ['jest', '@jest/core', 'mocha', 'nyc', 'vitest'];

/**
 * The project and its ancestors up to the repository / workspace root: the
 * project itself, then each parent, stopping after the directory holding
 * `.git` (or a `workspaces` manifest), at $HOME, or after `maxDepth` levels.
 */
function projectAndAncestors(projectRoot: string, maxDepth = 10): string[] {
  const dirs: string[] = [];
  let home: string | null = null;
  try { home = fs.realpathSync(os.homedir()); } catch { home = null; }
  let dir = path.resolve(projectRoot);
  for (let i = 0; i <= maxDepth; i++) {
    if (i > 0 && home !== null && dir === home) break;
    dirs.push(dir);
    if (fs.existsSync(path.join(dir, '.git')) || isWorkspaceRoot(dir)) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dirs;
}

function isWorkspaceRoot(dir: string): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as Record<string, unknown>;
    return pkg.workspaces !== undefined;
  } catch {
    return false;
  }
}

/**
 * Dependencies that decide the runner (#1012): the package's own when it
 * declares a test runner, otherwise those of the nearest ancestor (workspace
 * root) that does. A package of a monorepo whose jest is declared only at the
 * root runs jest, not the vitest default.
 */
function readRunnerDeps(projectRoot: string): Record<string, string> {
  for (const dir of projectAndAncestors(projectRoot)) {
    const deps = readDeps(dir);
    if (RUNNER_DEPS.some(d => deps[d])) return deps;
  }
  return {};
}

/**
 * Every `node_modules/.bin` from the project up to the workspace root,
 * nearest first. Runners that shell out to sibling tools (nyc → mocha) need
 * the hoisted ones too (#1012).
 */
export function runnerBinDirs(projectRoot: string): string[] {
  return projectAndAncestors(projectRoot)
    .map(dir => path.join(dir, 'node_modules', '.bin'))
    .filter(dir => fs.existsSync(dir));
}

/** Is the project installed with Yarn Plug'n'Play (no node_modules to resolve from)? */
function usesPlugNPlay(projectRoot: string): boolean {
  return projectAndAncestors(projectRoot).some(dir =>
    fs.existsSync(path.join(dir, '.pnp.cjs')) || fs.existsSync(path.join(dir, '.pnp.js')));
}

/**
 * Pick the runner and its argv. No shell is involved: `command` is the Node
 * binary and `args[0]` the runner's JS entry, so paths are passed verbatim.
 */
export function buildJsCoverageInvocation(
  projectRoot: string,
  reportDir: string,
  pathFilter?: string | null
): JsCoverageInvocation {
  const resultsFile = path.join(reportDir, RESULTS_FILE);
  const deps = readRunnerDeps(projectRoot);

  let runner: JsRunnerName = 'vitest';
  let runnerArgs: string[];
  let results: string | null = resultsFile;

  if (deps['jest'] || deps['@jest/core']) {
    runner = 'jest';
    runnerArgs = ['--coverage', `--coverageDirectory=${reportDir}`, '--coverageReporters=json',
      '--json', `--outputFile=${resultsFile}`];
  } else if (deps['mocha'] || deps['nyc']) {
    runner = 'nyc';
    runnerArgs = [`--report-dir=${reportDir}`, `--temp-dir=${path.join(reportDir, '.nyc_output')}`,
      '--reporter=json', 'mocha'];
    results = null;
  } else {
    // vitest is the default — covers vitest, @vitest/coverage-v8, etc.
    // Plain `--outputFile=` (not `.json=`): it overrides a string, object, or
    // absent `outputFile` in the user's config alike.
    // #1027 N4: vitest writes no coverage when a test fails unless asked;
    // coverage from a failing suite is still a measurement (runStatus 'failed').
    runnerArgs = ['run', '--coverage', `--coverage.reportsDirectory=${reportDir}`,
      '--coverage.reporter=json', '--coverage.reportOnFailure=true', '--reporter=json', `--outputFile=${resultsFile}`];
  }

  // A package target run from the workspace root: restrict the run to that
  // package's tests (vitest/jest positional filter) so a slow sibling cannot
  // time the run out. nyc/mocha take no such filter.
  // jest reads the positional as a regex, so escape the directory's metacharacters.
  if (pathFilter && runner !== 'nyc') {
    runnerArgs.push(runner === 'jest' ? pathFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : pathFilter);
  }

  const bin = findPackageBin(projectRoot, runner === 'jest' ? 'jest' : runner);
  return {
    runner,
    command: bin ? process.execPath : null,
    args: bin ? [bin, ...runnerArgs] : runnerArgs,
    resultsFile: results,
  };
}

interface RunCounts {
  numTotalTests: number | null;
  numPassedTests: number | null;
  numFailedTests: number | null;
  numPendingTests: number | null;
  numFailedTestSuites: number | null;
}

const NO_COUNTS: RunCounts = {
  numTotalTests: null, numPassedTests: null, numFailedTests: null, numPendingTests: null, numFailedTestSuites: null,
};

/** Test counts from the runner's own JSON result (vitest/jest share the shape). */
function readRunCounts(resultsFile: string | null): RunCounts {
  if (!resultsFile) return NO_COUNTS;
  try {
    const parsed = JSON.parse(fs.readFileSync(resultsFile, 'utf-8')) as Record<string, unknown>;
    const n = (k: string) => (typeof parsed[k] === 'number' ? parsed[k] as number : null);
    return {
      numTotalTests: n('numTotalTests'), numPassedTests: n('numPassedTests'), numFailedTests: n('numFailedTests'),
      numPendingTests: n('numPendingTests'), numFailedTestSuites: n('numFailedTestSuites'),
    };
  } catch {
    return NO_COUNTS;
  }
}

/**
 * Read the istanbul report the runner wrote. Distinguishes an EMPTY report
 * (`{}` — the run instrumented nothing) from NO report.
 */
async function readRunReport(file: string): Promise<CoverageData | null> {
  const data = await loadCoverageReportFile(file);
  if (data) return data;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length === 0) {
      return { files: [], summary: { line: 0, branch: 0, function: 0, statement: 0, files: 0 } };
    }
  } catch {
    // absent or unparseable
  }
  return null;
}

// ============================================================================
// Process-tree lifecycle
// ============================================================================

/** Live runs: process-group leader pid → temp dir to remove. */
const liveRuns = new Map<number, string | undefined>();
let exitHookInstalled = false;

function killTree(pid: number, signal: NodeJS.Signals): void {
  if (process.platform === 'win32') {
    // Windows has no process groups; taskkill /T walks the tree.
    try { spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
    return;
  }
  try { process.kill(-pid, signal); } catch { /* group already gone */ }
}

/**
 * Synchronously kill every live coverage run and remove its temp dir. Runs from
 * `process.on('exit')`, where only synchronous work is possible.
 */
export function killAllLiveRunsSync(): void {
  for (const [pid, dir] of liveRuns) {
    killTree(pid, 'SIGKILL');
    if (dir) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  }
  liveRuns.clear();
}

/** Number of runs currently registered (for tests and diagnostics). */
export function liveRunCount(): number {
  return liveRuns.size;
}

function ensureExitHook(): void {
  if (exitHookInstalled) return;
  process.on('exit', killAllLiveRunsSync);
  exitHookInstalled = true;
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

async function waitForGroupExit(pid: number, maxMs: number): Promise<void> {
  if (process.platform === 'win32') return;
  const deadline = Date.now() + maxMs;
  while (groupAlive(pid) && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 50));
  }
}

export interface ProcessTreeResult {
  exitCode: number | null;
  timedOut: boolean;
  spawnError: boolean;
  pid: number | undefined;
  stderrTail: string;
}

/**
 * Spawn `command args` in `cwd` (no shell) as the leader of a new process
 * group, wait for it, and on timeout kill the entire group. Resolves only once
 * no process of the group remains (bounded), so the caller can safely delete
 * its temp dir. While running, the group and `cleanupDir` are registered with
 * the exit hook so they never outlive the host process.
 */
export async function runProcessTree(
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number; graceMs?: number; cleanupDir?: string; env?: NodeJS.ProcessEnv }
): Promise<ProcessTreeResult> {
  const graceMs = options.graceMs ?? 3000;
  const isWindows = process.platform === 'win32';
  ensureExitHook();

  return new Promise(resolve => {
    let timedOut = false;
    let settled = false;
    let stderrTail = '';
    let stderrHead = '';
    let stderrBytes = 0;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      // Own process group (POSIX) so the whole tree can be signalled at once.
      detached: !isWindows,
      shell: false,
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    if (child.pid !== undefined) liveRuns.set(child.pid, options.cleanupDir);

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      stderrBytes += chunk.length;
      // #1150: raw windows only; summarizeStderr redacts them before slicing.
      if (stderrHead.length < STDERR_WINDOW_BYTES) stderrHead = (stderrHead + text).slice(0, STDERR_WINDOW_BYTES);
      stderrTail = (stderrTail + text).slice(-STDERR_WINDOW_BYTES);
    });
    // A grandchild holding the pipe open must not keep the host alive.
    child.stderr?.on('error', () => { /* ignore */ });

    const finish = async (exitCode: number | null, spawnError: boolean): Promise<void> => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.pid !== undefined && !isWindows && groupAlive(child.pid)) {
        // Anything left in the group after the runner exited is orphaned work
        // (stray workers, a hung watcher). Sweep it before the caller cleans up.
        killTree(child.pid, 'SIGTERM');
        await waitForGroupExit(child.pid, graceMs);
        if (groupAlive(child.pid)) killTree(child.pid, 'SIGKILL');
        await waitForGroupExit(child.pid, graceMs);
      }
      child.stderr?.destroy();
      if (child.pid !== undefined) liveRuns.delete(child.pid);
      resolve({
        exitCode, timedOut, spawnError, pid: child.pid,
        stderrTail: summarizeStderr(stderrHead, stderrTail, stderrBytes),
      });
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
 * this returns — after the whole process group is gone — or by the exit hook if
 * the host exits first.
 */
export async function runJsCoverage(
  projectRoot: string,
  options: { timeoutMs?: number; pathFilter?: string | null } = {}
): Promise<JsCoverageRun> {
  const timeoutMs = options.timeoutMs ?? 120000;
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-js-cov-'));
  try {
    const inv = buildJsCoverageInvocation(projectRoot, reportDir, options.pathFilter);
    if (!inv.command) {
      return {
        runner: inv.runner, missing: true, exitCode: null, exitedCleanly: false, timedOut: false,
        timeoutMs, data: null, numTotalTests: null, stderrTail: '',
      };
    }

    // Runners that shell out to sibling tools (nyc → mocha) find them here,
    // including hoisted workspace-root installs (#1012).
    const binDirs = runnerBinDirs(projectRoot);
    // The runner's own temp files (vite's SSR cache, etc.) go inside reportDir
    // too, so a killed run leaves nothing behind in the system temp dir.
    const runnerTmp = path.join(reportDir, 'tmp');
    fs.mkdirSync(runnerTmp);
    const env = {
      ...process.env,
      PATH: [...binDirs, process.env.PATH ?? ''].join(path.delimiter),
      TMPDIR: runnerTmp, TMP: runnerTmp, TEMP: runnerTmp,
    };

    const run = await runProcessTree(inv.command, inv.args, {
      cwd: projectRoot, timeoutMs, cleanupDir: reportDir, env,
    });

    const data = run.timedOut ? null : await readRunReport(path.join(reportDir, 'coverage-final.json'));
    return {
      runner: inv.runner,
      missing: false,
      exitCode: run.exitCode,
      exitedCleanly: run.exitCode === 0 && !run.timedOut,
      timedOut: run.timedOut,
      timeoutMs,
      data,
      ...(run.timedOut ? NO_COUNTS : readRunCounts(inv.resultsFile)),
      stderrTail: run.stderrTail,
    };
  } finally {
    try { fs.rmSync(reportDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

/**
 * One-line, caller-facing explanation of why a run produced no usable report.
 * Never "No instrumentation ran" when the runner did run and failed.
 */
export function describeRunFailure(run: JsCoverageRun, projectRoot: string): string {
  if (run.missing && usesPlugNPlay(projectRoot)) {
    return `${run.runner} could not be resolved for ${projectRoot}: this project uses Yarn Plug'n'Play, ` +
      'and agentic-qe resolves test runners only from node_modules. Nothing was run and nothing was downloaded. ' +
      `Generate a coverage report (e.g. \`yarn ${run.runner} --coverage\`) and pass it as the target, ` +
      'or use the node-modules linker.';
  }
  if (run.missing) {
    return `${run.runner} is not installed in ${projectRoot} (no node_modules/${run.runner} found); ` +
      'nothing was run and nothing was downloaded. Install it, or generate a coverage report and pass it as the target.';
  }
  if (run.timedOut) {
    return `The coverage run timed out after ${Math.round(run.timeoutMs / 1000)}s and was stopped.`;
  }
  if (run.exitCode !== 0) {
    const tail = run.stderrTail ? `: ${run.stderrTail}` : '';
    return `Test runner (${run.runner}) exited with code ${run.exitCode ?? 'unknown'} without a coverage report${tail}`;
  }
  return `Test runner (${run.runner}) exited cleanly but wrote no coverage report. ` +
    'Ensure a coverage provider is configured (e.g., @vitest/coverage-v8, istanbul).';
}
