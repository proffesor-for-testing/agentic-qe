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
  /** The runner's first error line plus the last ~2 KB of its stderr, for diagnosing a crash. */
  stderrTail: string;
}

const RESULTS_FILE = 'test-results.json';
const STDERR_TAIL_BYTES = 2048;
const STDERR_HEAD_BYTES = 4096;
const STDERR_PREFIX_BYTES = 512;
const ERROR_LINE_RE = /^.*(?:error|\[[A-Z][A-Z_]{2,}\]|ERR_[A-Z_]+).*$/im;

/**
 * Summarise a runner's stderr for a caller: the FIRST error-looking line (or
 * the first ~512 bytes) plus the last ~2 KB (#995 review NB-C). A tail alone
 * loses the cause when a long stack follows it — a vitest config syntax error
 * prints `[PARSE_ERROR] …` first and then kilobytes of frames.
 */
export function summarizeStderr(head: string, tail: string, totalBytes: number): string {
  if (totalBytes <= STDERR_TAIL_BYTES) return tail.trim();
  const errorLine = ERROR_LINE_RE.exec(head)?.[0]?.trim();
  const prefix = (errorLine ?? head.slice(0, STDERR_PREFIX_BYTES)).trim();
  if (prefix && tail.includes(prefix)) return tail.trim();
  return `${prefix}\n…\n${tail.trim()}`;
}

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

/**
 * Pick the runner and its argv. No shell is involved: `command` is the Node
 * binary and `args[0]` the runner's JS entry, so paths are passed verbatim.
 */
export function buildJsCoverageInvocation(projectRoot: string, reportDir: string): JsCoverageInvocation {
  const resultsFile = path.join(reportDir, RESULTS_FILE);
  const deps = readDeps(projectRoot);

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
    runnerArgs = ['run', '--coverage', `--coverage.reportsDirectory=${reportDir}`,
      '--coverage.reporter=json', '--reporter=json', `--outputFile=${resultsFile}`];
  }

  const bin = findPackageBin(projectRoot, runner === 'jest' ? 'jest' : runner);
  return {
    runner,
    command: bin ? process.execPath : null,
    args: bin ? [bin, ...runnerArgs] : runnerArgs,
    resultsFile: results,
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
      if (stderrHead.length < STDERR_HEAD_BYTES) stderrHead = (stderrHead + text).slice(0, STDERR_HEAD_BYTES);
      stderrTail = (stderrTail + text).slice(-STDERR_TAIL_BYTES);
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
  options: { timeoutMs?: number } = {}
): Promise<JsCoverageRun> {
  const timeoutMs = options.timeoutMs ?? 120000;
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-js-cov-'));
  try {
    const inv = buildJsCoverageInvocation(projectRoot, reportDir);
    if (!inv.command) {
      return {
        runner: inv.runner, missing: true, exitCode: null, exitedCleanly: false, timedOut: false,
        timeoutMs, data: null, numTotalTests: null, stderrTail: '',
      };
    }

    // Runners that shell out to sibling tools (nyc → mocha) find them here.
    const binDir = path.join(projectRoot, 'node_modules', '.bin');
    // The runner's own temp files (vite's SSR cache, etc.) go inside reportDir
    // too, so a killed run leaves nothing behind in the system temp dir.
    const runnerTmp = path.join(reportDir, 'tmp');
    fs.mkdirSync(runnerTmp);
    const env = {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
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
      numTotalTests: run.timedOut ? null : readNumTotalTests(inv.resultsFile),
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
