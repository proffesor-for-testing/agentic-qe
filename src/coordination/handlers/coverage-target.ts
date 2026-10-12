/**
 * Coverage target resolution (issue #995).
 *
 * A coverage target can be the project root, a subfolder of it, a single source
 * file, or an existing coverage report. Before #995 every target was treated as
 * if it were the project root: `target: "src/"` ran vitest FROM `src/` (which
 * found no tests, reported 0%, and wrote `src/coverage/` into the source tree),
 * and `target: "coverage/lcov.info"` was searched for a `coverage/` folder
 * inside a file and came back empty.
 *
 * This module answers the three questions every collector needs first:
 *   1. Which project does the target belong to?  (`findCoverageProjectRoot`)
 *   2. Is the target itself a coverage report?   (`isCoverageReportFile` /
 *      `loadCoverageReportFile`)
 *   3. Which entries of a project-wide report belong to the target?
 *      (`scopeCoverageToTarget`)
 *
 * Kept free of task-executor and child-process imports so both the MCP handler
 * and the CLI `coverage` command can share it.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { CoverageData, FileCoverage } from '../../domains/coverage-analysis/interfaces';
import {
  loadCoverageData,
  parseCoberturaXml,
  parseCoverageJson,
  parseCoverageSummaryJson,
  parseLcovInfo,
} from './handler-utils';
import { isTestPath } from './coverage-collection';

// ============================================================================
// Project root
// ============================================================================

/**
 * Files whose presence marks a directory as a project root, i.e. the directory
 * a test/coverage tool must be run from. `.git` bounds the walk for projects
 * without a manifest.
 */
const PROJECT_ROOT_MARKERS = [
  'package.json',
  'pyproject.toml', 'setup.py', 'setup.cfg',
  'go.mod', 'Cargo.toml',
  'pom.xml', 'build.gradle', 'build.gradle.kts',
  '.git',
];

/**
 * Walk up from a target to the nearest directory that holds a project marker.
 *
 * NEAREST rather than topmost: in a monorepo, `packages/core/src` belongs to
 * `packages/core` (its own package.json and test config), not the workspace
 * root. This intentionally differs from `kernel/findProjectRoot`, which locates
 * the AQE data root (honouring AQE_PROJECT_ROOT and `.agentic-qe`).
 *
 * Returns `null` when the target does not exist (a typo must not silently
 * resolve to — and run tests for — an ancestor project) or when no marker is
 * found below the home directory / filesystem root within `maxDepth` levels.
 */
export function findCoverageProjectRoot(target: string, maxDepth = 12): string | null {
  let dir: string;
  try {
    const resolved = path.resolve(target);
    if (!fs.existsSync(resolved)) return null;
    const real = fs.realpathSync(resolved);
    dir = fs.statSync(real).isDirectory() ? real : path.dirname(real);
  } catch {
    return null;
  }

  let home: string | null = null;
  try { home = fs.realpathSync(os.homedir()); } catch { home = null; }

  const start = dir;
  for (let depth = 0; depth <= maxDepth; depth++) {
    // A stray manifest in $HOME must not claim every directory beneath it.
    // $HOME is still a valid root when it is the target itself.
    if (home !== null && dir === home && dir !== start) return null;
    if (PROJECT_ROOT_MARKERS.some(m => fs.existsSync(path.join(dir, m)))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

// ============================================================================
// Coverage report files as targets
// ============================================================================

const REPORT_BASENAMES = new Set([
  'lcov.info',
  'coverage-final.json',
  'coverage-summary.json',
  'coverage.xml',
  'cobertura-coverage.xml',
  'cobertura.xml',
]);

/** Is this path (by name) a coverage report rather than source code? */
export function isCoverageReportFile(filePath: string): boolean {
  const base = path.basename(filePath).toLowerCase();
  return REPORT_BASENAMES.has(base) || base.endsWith('.lcov') || base.endsWith('.lcov.info');
}

/**
 * Parse a coverage report file of any supported format.
 *
 * Returns `null` — never an empty "0%" report — when the file can't be read,
 * can't be parsed, or lists no files.
 */
export async function loadCoverageReportFile(filePath: string): Promise<CoverageData | null> {
  let content: string;
  try {
    content = await fs.promises.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
  if (content.trim().length === 0) return null;

  try {
    const base = path.basename(filePath).toLowerCase();
    let data: CoverageData;
    if (base.endsWith('.json')) {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      // coverage-summary.json carries a `total` entry with per-metric totals.
      if (isSummaryShape(parsed)) data = parseCoverageSummaryJson(content);
      // Anything else must be istanbul's per-file map. Raw V8 output
      // (`{ result: [...] }`) and arbitrary JSON are rejected, not parsed into
      // a phantom file called "result" with 0/0 coverage.
      else if (isIstanbulShape(parsed)) data = parseCoverageJson(content);
      else return null;
    } else if (base.endsWith('.xml')) {
      data = parseCoberturaXml(content);
    } else {
      data = parseLcovInfo(content);
    }
    return data.files.length > 0 ? data : null;
  } catch {
    return null;
  }
}

function isIstanbulShape(parsed: Record<string, unknown>): boolean {
  const entries = Object.values(parsed);
  return entries.length > 0 && entries.every(e =>
    typeof e === 'object' && e !== null && !Array.isArray(e) &&
    typeof (e as Record<string, unknown>).s === 'object' &&
    typeof (e as Record<string, unknown>).statementMap === 'object'
  );
}

function isSummaryShape(parsed: Record<string, unknown>): boolean {
  const total = parsed.total as Record<string, unknown> | undefined;
  return typeof total === 'object' && total !== null && typeof total.lines === 'object';
}

// ============================================================================
// Scoping
// ============================================================================

/** True when `child` is `parent` or inside it (path-segment aware). */
function isWithin(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Canonicalise a path without requiring it to exist (macOS /tmp → /private/tmp). */
function canonical(p: string): string {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}

/**
 * Keep only the report entries that lie under `target`.
 *
 * Report paths come in two shapes: absolute (istanbul `coverage-final.json`)
 * and project-root-relative (vitest/jest `lcov.info` writes `SF:src/math.ts`).
 * Relative entries are resolved against `root` before comparing. Entry paths are
 * returned unchanged.
 */
export function scopeCoverageToTarget(data: CoverageData, root: string, target: string): FileCoverage[] {
  const rootAbs = canonical(root);
  const targetAbs = canonical(target);
  if (targetAbs === rootAbs) return [...data.files];

  return data.files.filter(f => {
    const abs = path.isAbsolute(f.path) ? canonical(f.path) : path.resolve(rootAbs, f.path);
    return isWithin(abs, targetAbs);
  });
}

// ============================================================================
// One verdict for MCP and CLI
// ============================================================================

/** Why there are no coverage figures for a target. */
export type NoDataReason =
  /** The target path does not exist. */
  | 'target-missing'
  /** A coverage report was given but cannot be parsed (malformed, raw V8, empty). */
  | 'unreadable-report'
  /** The report lists only test files. */
  | 'test-only-report'
  /** The report has no entries under the target — it did not measure it. */
  | 'target-not-covered'
  /** The test runner itself reports running zero tests. */
  | 'no-tests-ran';

export type CoverageEvaluation =
  | { status: 'measured'; files: FileCoverage[] }
  | { status: 'no-data'; reason: NoDataReason };

/**
 * Decide what a report says about `target`. Shared by the MCP handler and the
 * CLI so the two cannot disagree (#995 review B2).
 *
 * "Unmeasured" is decided ONLY from evidence that nothing was measured:
 *   - the runner's own result says it ran 0 tests (`numTotalTests === 0`), or
 *   - the report has no entry under the target.
 * Hit counts are never used: a file listed with 0 hits is a measured 0%,
 * whether the report came from our run or from the user (#995 review B3).
 */
export function evaluateCoverageForTarget(
  report: CoverageData,
  projectRoot: string,
  target: string,
  options: { numTotalTests?: number | null } = {}
): CoverageEvaluation {
  if (options.numTotalTests === 0) return { status: 'no-data', reason: 'no-tests-ran' };

  const scoped = scopeCoverageToTarget(report, projectRoot, target);
  if (scoped.length === 0) return { status: 'no-data', reason: 'target-not-covered' };

  // Coverage OF a test file is not production coverage (#569). A report with
  // only test entries yields no production figure — never the unfiltered set.
  const production = scoped.filter(f => !isTestPath(f.path, projectRoot));
  if (production.length === 0) return { status: 'no-data', reason: 'test-only-report' };

  return { status: 'measured', files: production };
}

export type ExistingCoverage =
  | { status: 'target-missing'; target: string }
  | { status: 'no-report'; target: string; projectRoot: string }
  | {
      status: 'evaluated';
      target: string;
      projectRoot: string;
      source: 'report-file' | 'project-report';
      evaluation: CoverageEvaluation;
    };

/**
 * Resolve a target to coverage that already exists on disk, without running
 * anything:
 *   - a coverage report passed as the target is parsed and analysed whole;
 *   - otherwise the PROJECT ROOT's report (not the cwd's, not the subfolder's)
 *     is scoped to the target;
 *   - `no-report` tells the caller it may run tooling from `projectRoot`.
 */
export async function resolveExistingCoverage(targetPath: string): Promise<ExistingCoverage> {
  const target = path.resolve(targetPath);
  let stat: fs.Stats;
  try { stat = fs.statSync(target); } catch { return { status: 'target-missing', target }; }

  if (stat.isFile() && isCoverageReportFile(target)) {
    const reportDir = path.dirname(target);
    const projectRoot = findCoverageProjectRoot(reportDir)
      ?? (path.basename(reportDir) === 'coverage' ? path.dirname(reportDir) : reportDir);
    const report = await loadCoverageReportFile(target);
    const evaluation: CoverageEvaluation = report
      ? evaluateCoverageForTarget(report, projectRoot, projectRoot)
      : { status: 'no-data', reason: 'unreadable-report' };
    return { status: 'evaluated', target, projectRoot, source: 'report-file', evaluation };
  }

  const projectRoot = findCoverageProjectRoot(target) ?? (stat.isDirectory() ? target : path.dirname(target));
  const existing = await loadCoverageData(projectRoot);
  if (!existing) return { status: 'no-report', target, projectRoot };
  return {
    status: 'evaluated', target, projectRoot, source: 'project-report',
    evaluation: evaluateCoverageForTarget(existing, projectRoot, target),
  };
}

/**
 * Threshold verdict over the metrics that were actually collected. Shared by
 * MCP and CLI (#995 review NB5): an uncollected metric (no branch data in the
 * report) is null, and a null must not drag the average down as a fake 0.
 */
export function thresholdVerdict(
  summary: { line: number; branch: number; function: number; statement: number },
  threshold: number,
  collected: { branch: boolean; function: boolean }
): { overall: number; meetsThreshold: boolean } {
  const metrics = [summary.line, summary.statement];
  if (collected.branch) metrics.push(summary.branch);
  if (collected.function) metrics.push(summary.function);
  const overall = metrics.reduce((a, b) => a + b, 0) / metrics.length;
  return { overall, meetsThreshold: overall >= threshold };
}

const SHORTFALL_RE = /^Coverage is [\d.]+% below threshold/i;

/**
 * Make the analyzer's recommendations agree with `thresholdVerdict`
 * (#995 review NB-A). The analyzer computes its "Coverage is X% below
 * threshold" line from a 4-metric average that counts an uncollected metric as
 * 0 — so a line-only report at 90% got "Met" next to "35.0% below threshold".
 * Here the shortfall line is recomputed from the collected-metrics verdict,
 * and advice about a metric that was never collected is dropped.
 */
export function reconcileRecommendations(
  recommendations: string[],
  verdict: { overall: number; meetsThreshold: boolean },
  threshold: number,
  collected: { branch: boolean; function: boolean }
): string[] {
  const kept = recommendations.filter(rec =>
    !SHORTFALL_RE.test(rec) &&
    (collected.branch || !/branch coverage/i.test(rec)) &&
    (collected.function || !/function coverage/i.test(rec)));
  if (verdict.meetsThreshold) return kept;
  return [
    `Coverage is ${(threshold - verdict.overall).toFixed(1)}% below threshold. Focus on high-risk files first.`,
    ...kept,
  ];
}

/** Is this verdict "no measurement exists" (as opposed to an error or test-only report)? */
export function isUnmeasured(reason: NoDataReason): boolean {
  return reason === 'target-not-covered' || reason === 'no-tests-ran';
}

/** Caller-facing explanation of a no-data verdict. Shared by MCP and CLI. */
export function describeNoData(reason: NoDataReason, target: string, projectRoot: string | null): string {
  switch (reason) {
    case 'target-missing':
      return `Target does not exist: ${target}`;
    case 'unreadable-report':
      return `Unreadable coverage report: ${target}. It could not be parsed or lists no files. ` +
        'Supported: lcov.info, istanbul coverage-final.json / coverage-summary.json, Cobertura XML. ' +
        "Raw V8 output is not supported — convert it with c8 or your runner's istanbul reporter.";
    case 'test-only-report':
      return 'The coverage report contains only test files, so there is no production ' +
        'coverage to report. Coverage OF a test file is not a meaningful metric. ' +
        'Check that your coverage tool is instrumenting your source directory.';
    case 'target-not-covered':
      return `Target is UNMEASURED: the coverage data for project ${projectRoot ?? '?'} has no entry ` +
        `for any production file under ${target}. This is not 0% coverage — no measurement exists ` +
        "for it. Check your coverage tool's include/exclude settings, or regenerate the report.";
    case 'no-tests-ran':
      return `Target is UNMEASURED: the test runner reported running 0 tests from ${projectRoot ?? '?'}. ` +
        'This is not 0% coverage.';
  }
}
