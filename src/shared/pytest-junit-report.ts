/**
 * #1248: running pytest and reading its JUnit XML report.
 *
 * pytest is started as `<python> -m pytest <files> --junitxml=<file>`, with
 * the report in a temporary directory owned by the run, so the result never
 * depends on the console summary. The interpreter is `AQE_PYTHON` when set,
 * otherwise `python` when it is on PATH, otherwise `python3`.
 *
 * The report is read with a small parser for the XML pytest writes (one or
 * more `<testsuite>` elements holding `<testcase>` elements, each with an
 * optional `<failure>`, `<error>` or `<skipped>` child). Counts come from the
 * test cases themselves, so they always match the per-test list. An expected
 * failure (xfail) is reported by pytest as skipped and counted as skipped.
 *
 * A run is only a result when pytest finished its tests: exit code 5 (no
 * tests collected), 2 (interrupted, for example by a collection error),
 * 3 (internal error) and 4 (usage error), or a missing report (pytest not
 * installed for the interpreter), are runner errors, never a pass.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { capDiagnostics, getTestRunnerExecutionError, TestRunnerExecutionError } from './test-runner-verdict.js';
import { Result, ok, err } from './types';

/** True for a Python test file, which only pytest can run. */
export function isPythonTestFile(file: string): boolean {
  return /\.py$/i.test(file);
}

function onPath(command: string, env: NodeJS.ProcessEnv): boolean {
  const names = process.platform === 'win32' ? [`${command}.exe`, `${command}.cmd`, command] : [command];
  for (const dir of (env.PATH ?? env.Path ?? '').split(path.delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      try {
        if (statSync(path.join(dir, name)).isFile()) return true;
      } catch {
        // Not in this directory.
      }
    }
  }
  return false;
}

/** The Python interpreter that runs pytest. */
export function resolvePythonCommand(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.AQE_PYTHON?.trim();
  if (configured) return configured;
  if (onPath('python', env)) return 'python';
  return onPath('python3', env) ? 'python3' : 'python';
}

/** Environment for a pytest process: no ANSI colour in its output or report. */
export const PYTEST_ENV: Readonly<Record<string, string>> = { PY_COLORS: '0' };

/** Command and arguments that run `targets` (paths or node ids) with pytest. */
export function pytestCommand(
  targets: readonly string[],
  reportPath: string,
  env: NodeJS.ProcessEnv = process.env,
): { command: string; args: string[] } {
  return {
    command: resolvePythonCommand(env),
    // No colour: runners are started with FORCE_COLOR set, which pytest reads
    // as "force colour" (even in its report). PY_COLORS=0 (PYTEST_ENV) wins
    // over FORCE_COLOR; --color=no covers the console output.
    args: ['-m', 'pytest', ...targets, `--junitxml=${reportPath}`, '--color=no'],
  };
}

/** A per-run JUnit report location, read back after pytest exits. */
export interface PytestJunitReport {
  /** Absolute path pytest writes the report to. */
  readonly path: string;
  /** Arguments that point pytest at the report (already in pytestCommand). */
  readonly args: readonly string[];
  /** The report text; undefined when pytest wrote none. Malformed reports throw. */
  read(stdout?: string): string | undefined;
  /** Remove the temporary report directory. Safe to call more than once. */
  cleanup(): void;
}

export function createPytestJunitReport(): PytestJunitReport {
  const dir = mkdtempSync(path.join(tmpdir(), 'aqe-pytest-report-'));
  const reportPath = path.join(dir, 'junit.xml');
  let cleaned = false;
  return {
    path: reportPath,
    args: [],
    read: () => {
      if (!existsSync(reportPath)) return undefined;
      const text = readFileSync(reportPath, 'utf-8');
      if (!/<testsuite\b/.test(text)) throw new TestRunnerExecutionError('The current pytest JUnit report is malformed.');
      return text;
    },
    cleanup: () => {
      if (cleaned) return;
      cleaned = true;
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Best effort: a leftover temp dir is not worth failing a test run over.
      }
    },
  };
}

export type PytestCaseStatus = 'passed' | 'failed' | 'error' | 'skipped';

/** One `<testcase>` of a pytest JUnit report. */
export interface PytestJunitCase {
  classname: string;
  name: string;
  status: PytestCaseStatus;
  /** Duration in milliseconds, when reported. */
  duration?: number;
  /** The failure, error or skip message attribute. */
  message?: string;
  /** The failure or error body (traceback). */
  details?: string;
}

function unescapeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower === 'lt') return '<';
    if (lower === 'gt') return '>';
    if (lower === 'amp') return '&';
    if (lower === 'quot') return '"';
    if (lower === 'apos') return '\'';
    const code = lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
    return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}

function attributes(text: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of text.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[match[1]] = unescapeXml(match[2] ?? match[3] ?? '');
  }
  return attrs;
}

/** The test cases of a pytest JUnit XML report, in report order. */
export function parsePytestJunitXml(xml: string): PytestJunitCase[] {
  if (!/<testsuite\b/.test(xml)) throw new Error('Not a JUnit XML report: no <testsuite> element.');
  const cases: PytestJunitCase[] = [];
  const testcase = /<testcase\b((?:[^>"']|"[^"]*"|'[^']*')*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
  for (const match of xml.matchAll(testcase)) {
    const attrs = attributes(match[1]);
    const body = match[2] ?? '';
    // An error (setup/teardown) outranks a failure in the same test case.
    const child = (tag: string) => body.match(new RegExp(
      `<${tag}\\b((?:[^>"']|"[^"]*"|'[^']*')*?)(?:\\/>|>([\\s\\S]*?)<\\/${tag}>)`));
    const error = child('error');
    const failure = child('failure');
    const skipped = child('skipped');
    const outcome = error ?? failure ?? skipped;
    const status: PytestCaseStatus = error ? 'error' : failure ? 'failed' : skipped ? 'skipped' : 'passed';
    const seconds = Number.parseFloat(attrs.time ?? '');
    const message = outcome ? attributes(outcome[1]).message : undefined;
    const details = outcome?.[2] !== undefined ? unescapeXml(outcome[2]).trim() : undefined;
    cases.push({
      classname: attrs.classname ?? '',
      name: attrs.name ?? '',
      status,
      ...(Number.isFinite(seconds) ? { duration: Math.round(seconds * 1000) } : {}),
      ...(message ? { message } : {}),
      ...(details ? { details } : {}),
    });
  }
  return cases;
}

/** A collection error is reported as an error case with no class name. */
function isCollectionError(testCase: PytestJunitCase): boolean {
  return testCase.status === 'error' && (testCase.classname === '' || testCase.message === 'collection failure');
}

function pathSegments(file: string): string[] {
  return file.replace(/\.py$/i, '').split(/[\\/]+/).filter(Boolean);
}

/**
 * The run file a test case belongs to, and its name inside that file
 * (`TestClass::test_name[param]`, the node id without the file). The class
 * name is the module's dotted path relative to pytest's rootdir followed by
 * any classes, so the file is the one whose path ends with the longest
 * leading part of it.
 */
export function locatePytestCase(testCase: Pick<PytestJunitCase, 'classname' | 'name'>, files: readonly string[]): { file: string; name: string } {
  const dotted = testCase.classname ? testCase.classname.split('.') : [];
  let best: { file: string; matched: number } | undefined;
  for (const file of files) {
    const segments = pathSegments(file);
    for (let length = Math.min(dotted.length, segments.length); length > 0; length--) {
      const tail = segments.slice(segments.length - length);
      if (tail.every((segment, index) => segment === dotted[index])) {
        if (!best || length > best.matched) best = { file, matched: length };
        break;
      }
    }
  }
  if (!best) {
    return {
      file: files.length === 1 ? files[0] : files.join(', '),
      name: testCase.classname ? `${testCase.classname}::${testCase.name}` : testCase.name,
    };
  }
  return { file: best.file, name: [...dotted.slice(best.matched), testCase.name].join('::') };
}

/** One test of a finished pytest run. */
export interface PytestTest {
  name: string;
  file: string;
  status: 'passed' | 'failed' | 'skipped';
  duration?: number;
  /** Failure or error text for a failed test. */
  failureMessage?: string;
}

export interface PytestRun {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  tests: PytestTest[];
}

const PYTEST_EXIT_REASONS: Record<number, string> = {
  2: 'was interrupted (for example by a collection error)',
  3: 'hit an internal error',
  4: 'rejected its command line',
  5: 'collected no tests',
};

/**
 * The result of a finished pytest run, or the runner error that kept it from
 * being one. `report` is the JUnit XML text, undefined when pytest wrote none.
 * A test case that errored (in a fixture, say) counts as a failed test.
 */
export function pytestRunFromReport(
  report: string | undefined,
  files: readonly string[],
  exitCode: number | null,
  output: string,
  python: string = resolvePythonCommand(),
): Result<PytestRun, TestRunnerExecutionError> {
  const label = files.join(', ');
  if (report === undefined) {
    const notInstalled = /No module named pytest/.test(output);
    return err(new TestRunnerExecutionError(
      `pytest wrote no JUnit report for ${label} (exit code ${exitCode ?? 'unknown'}).` +
      (notInstalled
        ? ` pytest is not installed for '${python}'; install it, or set AQE_PYTHON to an interpreter that has it.`
        : ` Check that '${python} -m pytest' runs; set AQE_PYTHON to choose the interpreter.`) +
      (output.trim() ? `\n${capDiagnostics(output.trim())}` : ''),
    ));
  }
  let cases: PytestJunitCase[];
  try {
    cases = parsePytestJunitXml(report);
  } catch (error) {
    return err(new TestRunnerExecutionError(
      `Could not read the pytest JUnit report for ${label}: ${error instanceof Error ? error.message : String(error)}`,
    ));
  }
  const collectionErrors = cases.filter(isCollectionError);
  const exitReason = exitCode !== null ? PYTEST_EXIT_REASONS[exitCode] : undefined;
  if (exitReason || collectionErrors.length > 0) {
    const reasons = collectionErrors.map(c => `${c.name}: ${c.details ?? c.message ?? 'collection failure'}`);
    return err(new TestRunnerExecutionError(
      `pytest ${exitReason ?? 'reported a collection error'} for ${label} (exit code ${exitCode ?? 'unknown'}).` +
      `\n${capDiagnostics([...reasons, output.trim()].filter(Boolean).join('\n'))}`,
    ));
  }

  const tests: PytestTest[] = cases.map(testCase => {
    const { file, name } = locatePytestCase(testCase, files);
    const failed = testCase.status === 'failed' || testCase.status === 'error';
    const failureMessage = failed
      ? [testCase.message, testCase.details].filter(Boolean).join('\n') || 'Test failed'
      : undefined;
    return {
      name, file,
      status: failed ? 'failed' : testCase.status === 'skipped' ? 'skipped' : 'passed',
      ...(testCase.duration !== undefined ? { duration: testCase.duration } : {}),
      ...(failureMessage ? { failureMessage } : {}),
    };
  });
  const passed = tests.filter(t => t.status === 'passed').length;
  const failed = tests.filter(t => t.status === 'failed').length;
  const skipped = tests.filter(t => t.status === 'skipped').length;
  const executionError = getTestRunnerExecutionError('pytest', label, exitCode, { passed, failed, skipped }, output);
  if (executionError) return err(executionError);
  return ok({ total: tests.length, passed, failed, skipped, tests });
}
