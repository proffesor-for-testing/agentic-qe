/**
 * Command Eval Runner — shell-command-based eval suite execution.
 *
 * Sibling to {@link ParallelEvalRunner} (which evaluates LLM prompts against
 * keyword-match patterns). This runner is for skills whose eval suite is a
 * set of shell commands that produce JSON envelopes — e.g. qe-browser, whose
 * five primitives (assert, batch, visual-diff, check-injection, intent-score)
 * are Node scripts that exit 0/1 with structured stdout.
 *
 * Detection is by suite shape, not by an explicit type tag: if the first test
 * case has `input.command`, we treat the suite as command-mode.
 *
 * Supported assertions per test case:
 *   - `exit_code`: strict equality against the process exit code
 *   - `json_fields`: a map of dotted JSONPath -> expected value, evaluated
 *     against parsed stdout JSON
 *   - `severity_at_least`: ordered comparison against
 *     `.output.checkInjection.severity` in the range
 *     `none < low < medium < high < critical`
 *   - `candidate_count_at_least`: numeric lower bound on
 *     `.output.intentScore.candidateCount`
 *
 * Setup steps in `input.setup[]` run sequentially before the main command;
 * any non-zero setup exit short-circuits the test case as failed.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';
import { spawnSync as realSpawnSync } from 'node:child_process';
import { toErrorMessage } from '../shared/error-utils.js';

// ============================================================================
// Severity ordering
// ============================================================================

const SEVERITY_ORDER = ['none', 'low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITY_ORDER)[number];

/**
 * Return true iff `actual` is at or above `threshold` on the severity scale.
 * Unknown severities return false (conservative — we never silently pass).
 */
export function severityAtLeast(actual: unknown, threshold: Severity): boolean {
  if (typeof actual !== 'string') return false;
  const a = SEVERITY_ORDER.indexOf(actual as Severity);
  const t = SEVERITY_ORDER.indexOf(threshold);
  return a >= 0 && t >= 0 && a >= t;
}

// ============================================================================
// JSON path evaluation
// ============================================================================

/**
 * Evaluate a simple dotted JSONPath like `.output.assert.passed` against an
 * already-parsed JSON value. Returns `undefined` if any segment is missing.
 *
 * We intentionally support only dotted paths (no `[idx]`, no filters) because
 * that's the full surface area used by qe-browser's output schemas.
 */
export function evalJsonPath(obj: unknown, jsonPath: string): unknown {
  if (typeof jsonPath !== 'string' || !jsonPath.startsWith('.')) return undefined;
  const parts = jsonPath === '.' ? [] : jsonPath.slice(1).split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

// ============================================================================
// Types
// ============================================================================

export type TestCasePriority = 'critical' | 'high' | 'medium' | 'low';

export interface CommandEvalExpected {
  exit_code?: number;
  /** Dotted JSONPath → expected JSON value (deep equality). */
  json_fields?: Record<string, unknown>;
  severity_at_least?: Severity;
  candidate_count_at_least?: number;
}

export interface CommandEvalTestCase {
  id: string;
  description?: string;
  category?: string;
  priority?: TestCasePriority;
  input: {
    setup?: string[];
    command: string;
  };
  expected: CommandEvalExpected;
}

export interface CommandEvalSuite {
  skill: string;
  version?: string;
  status?: 'design-spec' | 'active' | 'deprecated';
  description?: string;
  test_cases: CommandEvalTestCase[];
  validation?: {
    required_pass_rate?: number;
    critical_must_pass?: boolean;
  };
}

export interface CommandEvalTestResult {
  testId: string;
  passed: boolean;
  category?: string;
  priority?: TestCasePriority;
  exitCode: number | null;
  stdoutSnippet: string;
  stderrSnippet: string;
  /** Assertion failures — empty when passed. */
  failures: string[];
  durationMs: number;
  /** Set when a setup step failed before the main command ran. */
  setupFailure?: string;
}

export interface CommandEvalResult {
  skill: string;
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  passRate: number;
  /** True iff every test with priority=critical passed. */
  criticalPassed: boolean;
  testResults: CommandEvalTestResult[];
  totalDurationMs: number;
  timestamp: Date;
}

/** Injectable runner so tests don't spawn real processes. */
export type CommandRunner = (
  cmd: string,
  options: { timeoutMs: number; cwd: string }
) => {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

const defaultCommandRunner: CommandRunner = (cmd, opts) => {
  const result = realSpawnSync('bash', ['-c', cmd], {
    timeout: opts.timeoutMs,
    cwd: opts.cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
    error: result.error as Error | undefined,
  };
};

// ============================================================================
// Suite detection
// ============================================================================

/**
 * A suite is command-eval mode when the first test case has `input.command`.
 * We use this to dispatch from the shared `aqe eval` CLI without requiring a
 * new explicit type tag in every existing LLM-style yaml.
 */
export function isCommandEvalSuite(raw: unknown): raw is CommandEvalSuite {
  if (!raw || typeof raw !== 'object') return false;
  const obj = raw as { test_cases?: unknown };
  if (!Array.isArray(obj.test_cases) || obj.test_cases.length === 0) return false;
  const first = obj.test_cases[0] as { input?: { command?: unknown; code?: unknown } } | null;
  return typeof first?.input?.command === 'string';
}

// ============================================================================
// Result validation
// ============================================================================

/**
 * Validate a single test-case result against its expected block.
 * Returns the list of failures (empty == passed).
 *
 * Parses stdout as JSON only if at least one assertion needs it, so commands
 * that only care about `exit_code` don't require JSON output.
 */
export function validateCommandResult(
  tc: CommandEvalTestCase,
  exitCode: number | null,
  stdout: string
): { passed: boolean; failures: string[] } {
  const failures: string[] = [];
  const expected = tc.expected || {};

  if (expected.exit_code !== undefined && exitCode !== expected.exit_code) {
    failures.push(`exit_code: expected ${expected.exit_code}, got ${exitCode}`);
  }

  const needsJson =
    !!expected.json_fields ||
    expected.severity_at_least !== undefined ||
    expected.candidate_count_at_least !== undefined;

  let parsed: unknown = null;
  if (needsJson) {
    try {
      parsed = JSON.parse(stdout);
    } catch (e) {
      failures.push(`stdout is not valid JSON: ${toErrorMessage(e)}`);
      return { passed: false, failures };
    }
  }

  if (expected.json_fields) {
    for (const [jsonPath, want] of Object.entries(expected.json_fields)) {
      const got = evalJsonPath(parsed, jsonPath);
      if (!deepEqual(got, want)) {
        failures.push(
          `json_fields ${jsonPath}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`
        );
      }
    }
  }

  if (expected.severity_at_least !== undefined) {
    const sev = evalJsonPath(parsed, '.output.checkInjection.severity');
    if (!severityAtLeast(sev, expected.severity_at_least)) {
      failures.push(
        `severity_at_least: expected >= ${expected.severity_at_least}, got ${JSON.stringify(sev)}`
      );
    }
  }

  if (expected.candidate_count_at_least !== undefined) {
    const count = evalJsonPath(parsed, '.output.intentScore.candidateCount');
    const countNum = typeof count === 'number' ? count : Number.NaN;
    if (!(countNum >= expected.candidate_count_at_least)) {
      failures.push(
        `candidate_count_at_least: expected >= ${expected.candidate_count_at_least}, got ${JSON.stringify(count)}`
      );
    }
  }

  return { passed: failures.length === 0, failures };
}

/**
 * Strict structural equality for JSON values — used to compare
 * `json_fields` expected values against extracted paths. Avoids the pitfalls
 * of `JSON.stringify` comparison (e.g. key order variance on objects) by
 * walking both sides.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object') {
    if (typeof b !== 'object' || Array.isArray(b)) return false;
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const ak = Object.keys(ao);
    const bk = Object.keys(bo);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => deepEqual(ao[k], bo[k]));
  }
  return false;
}

// ============================================================================
// Runner
// ============================================================================

export interface CommandEvalRunnerOptions {
  /** Directory containing skill directories (default: `.claude/skills`). */
  skillsDir?: string;
  /** Per-command timeout in milliseconds (default: 60s). */
  timeoutMs?: number;
  /** Working directory for commands (default: `process.cwd()`). */
  cwd?: string;
  /** Injected runner for tests. */
  runner?: CommandRunner;
}

export class CommandEvalRunner {
  private readonly skillsDir: string;
  private readonly timeoutMs: number;
  private readonly cwd: string;
  private readonly runner: CommandRunner;

  constructor(options: CommandEvalRunnerOptions = {}) {
    this.skillsDir = options.skillsDir ?? '.claude/skills';
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.cwd = options.cwd ?? process.cwd();
    this.runner = options.runner ?? defaultCommandRunner;
  }

  /**
   * Load `${skill}/evals/${skill}.yaml` and return it iff it's a command-mode
   * suite. Returns null if missing, unparseable, or not command-mode.
   */
  loadSuite(skill: string): CommandEvalSuite | null {
    const baseDir = path.isAbsolute(this.skillsDir)
      ? this.skillsDir
      : path.join(this.cwd, this.skillsDir);
    const evalPath = path.join(baseDir, skill, 'evals', `${skill}.yaml`);
    if (!fs.existsSync(evalPath)) return null;
    try {
      const raw = yaml.parse(fs.readFileSync(evalPath, 'utf-8'));
      if (!isCommandEvalSuite(raw)) return null;
      return raw;
    } catch {
      return null;
    }
  }

  async run(skill: string): Promise<CommandEvalResult> {
    const start = Date.now();
    const suite = this.loadSuite(skill);
    if (!suite) {
      throw new Error(
        `Command-eval suite not found or not command-mode at ${this.skillsDir}/${skill}/evals/${skill}.yaml`
      );
    }

    const results: CommandEvalTestResult[] = [];
    // Sequential by design: setup steps (e.g. `vibium go <url>`) mutate
    // shared browser state, so interleaving test cases would be racy.
    for (const tc of suite.test_cases) {
      results.push(this.executeCase(tc));
    }

    const passedTests = results.filter((r) => r.passed).length;
    const failedTests = results.length - passedTests;
    const passRate = results.length > 0 ? passedTests / results.length : 0;

    const requiredPassRate = suite.validation?.required_pass_rate ?? 0.9;
    const criticalMustPass = suite.validation?.critical_must_pass ?? true;
    const criticalResults = results.filter((r) => r.priority === 'critical');
    const criticalPassed = criticalResults.every((r) => r.passed);
    const passed = passRate >= requiredPassRate && (!criticalMustPass || criticalPassed);

    return {
      skill,
      passed,
      totalTests: results.length,
      passedTests,
      failedTests,
      passRate,
      criticalPassed,
      testResults: results,
      totalDurationMs: Date.now() - start,
      timestamp: new Date(),
    };
  }

  private executeCase(tc: CommandEvalTestCase): CommandEvalTestResult {
    const start = Date.now();
    const setup = tc.input?.setup ?? [];

    for (const step of setup) {
      const r = this.runner(step, { timeoutMs: this.timeoutMs, cwd: this.cwd });
      if (r.status !== 0) {
        return {
          testId: tc.id,
          passed: false,
          category: tc.category,
          priority: tc.priority,
          exitCode: r.status,
          stdoutSnippet: truncate(r.stdout),
          stderrSnippet: truncate(r.stderr),
          failures: [],
          setupFailure: `setup step failed (exit ${r.status}): ${step}`,
          durationMs: Date.now() - start,
        };
      }
    }

    const r = this.runner(tc.input.command, { timeoutMs: this.timeoutMs, cwd: this.cwd });
    const v = validateCommandResult(tc, r.status, r.stdout);

    return {
      testId: tc.id,
      passed: v.passed,
      category: tc.category,
      priority: tc.priority,
      exitCode: r.status,
      stdoutSnippet: truncate(r.stdout),
      stderrSnippet: truncate(r.stderr),
      failures: v.failures,
      durationMs: Date.now() - start,
    };
  }
}

function truncate(s: string, max = 500): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…[truncated ${s.length - max}b]`;
}

/**
 * Convenience factory.
 */
export function createCommandEvalRunner(options: CommandEvalRunnerOptions = {}): CommandEvalRunner {
  return new CommandEvalRunner(options);
}
