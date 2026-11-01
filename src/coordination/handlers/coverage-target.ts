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
import { ConfinedReadError, readConfinedText, readConfinedTextSync } from '../../shared/io/confined-read.js';
import * as os from 'os';
import * as path from 'path';
import type { CoverageData, FileCoverage } from '../../domains/coverage-analysis/interfaces';
import {
  findCoverageReport,
  parseCoberturaXml,
  parseCoverageJson,
  parseCoverageSummaryJson,
  parseLcovInfo,
  type RefusedCoverageReport,
} from './handler-utils';
import { isTestPath } from './coverage-collection';
import { assessCoverageEvidence, type CoverageEvidence } from './coverage-evidence';
import { findProjectRoot } from '../../kernel/project-root.js';
import { classifyProjectCoveragePaths } from '../../domains/coverage-analysis/collected-metrics.js';

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

const JS_RUNNER_CONFIGS = [
  'vitest.config.ts', 'vitest.config.js', 'vitest.config.mts', 'vitest.config.mjs',
  'vitest.config.cts', 'vitest.config.cjs',
  'vitest.workspace.ts', 'vitest.workspace.js', 'vitest.workspace.mts',
  'vitest.workspace.mjs', 'vitest.workspace.json',
  'vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs',
  'jest.config.ts', 'jest.config.js', 'jest.config.mts', 'jest.config.mjs',
  'jest.config.cts', 'jest.config.cjs', 'jest.config.json',
];

function hasJsRunnerConfig(dir: string): boolean {
  if (JS_RUNNER_CONFIGS.some(name => fs.existsSync(path.join(dir, name)))) return true;
  // Jest also accepts inline configuration: `"jest": { ... }` in package.json.
  return readPackageJson(dir)?.jest !== undefined;
}

type RunnerFamily = 'jest' | 'nyc' | 'vitest';

/**
 * The runner a package.json declares through its dependencies, mirroring the
 * precedence of the coverage runner (jest, then mocha/nyc, then vitest).
 * `null` when it declares none. Jest and vitest run with no config file at all,
 * so a dependency is as good a declaration as a config.
 */
function declaredRunner(dir: string): RunnerFamily | null {
  const pkg = readPackageJson(dir);
  if (!pkg) return null;
  const deps: Record<string, unknown> = {
    ...(pkg.devDependencies as Record<string, unknown> | undefined),
    ...(pkg.dependencies as Record<string, unknown> | undefined),
  };
  if (deps['jest'] || deps['@jest/core']) return 'jest';
  if (deps['mocha'] || deps['nyc']) return 'nyc';
  if (deps['vitest']) return 'vitest';
  return null;
}

/** mocha/nyc are configured by dotfiles rather than a runner config module. */
function hasMochaOrNycConfig(dir: string): boolean {
  try {
    return fs.readdirSync(dir).some(name => /^\.(mocharc|nycrc)(\.|$)/.test(name));
  } catch {
    return false;
  }
}

/**
 * May a package inherit the runner config of workspace `rootDir`? Only when it
 * does not bring its own runner: a package that declares a different runner
 * (e.g. jest under a vitest root) must keep running that one, from its own
 * directory. With no runner declared at the root the runner defaults to vitest.
 */
function packageCanUseRootRunner(pkgDir: string, rootDir: string): boolean {
  if (hasMochaOrNycConfig(pkgDir)) return (declaredRunner(rootDir) ?? 'vitest') === 'nyc';
  const own = declaredRunner(pkgDir);
  return own === null || own === (declaredRunner(rootDir) ?? 'vitest');
}

function readPackageJson(dir: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readConfinedTextSync(path.join(dir, 'package.json'), { outsideRoot: 'allow' }));
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/**
 * The workspace patterns a root declares: npm/yarn `workspaces` (array or
 * `{ packages: [...] }`) or pnpm's `packages:` list. `null` = not a workspace
 * root. Patterns are returned as written (negations keep their `!`).
 */
function readWorkspacePatterns(dir: string): string[] | null {
  const patterns: string[] = [];
  let isRoot = false;

  const pkg = readPackageJson(dir);
  const ws = pkg?.workspaces;
  const fromPkg = Array.isArray(ws)
    ? ws
    : (typeof ws === 'object' && ws !== null && Array.isArray((ws as { packages?: unknown }).packages)
      ? (ws as { packages: unknown[] }).packages
      : null);
  if (ws !== undefined && ws !== null && typeof ws === 'object') isRoot = true;
  if (fromPkg) patterns.push(...fromPkg.filter((p): p is string => typeof p === 'string'));

  // Only the block-list `packages:` form is read; the flow form gives no
  // patterns, so the root is not adopted (fails safe).
  try {
    const yaml = readConfinedTextSync(path.join(dir, 'pnpm-workspace.yaml'), { outsideRoot: 'allow' });
    isRoot = true;
    let inPackages = false;
    for (const raw of yaml.split(/\r?\n/)) {
      const line = raw.replace(/\s+#.*$/, '').trimEnd();
      if (/^packages\s*:/.test(line)) { inPackages = true; continue; }
      if (inPackages) {
        const m = /^\s+-\s+(.+)$/.exec(line);
        if (m) patterns.push(m[1].trim().replace(/^['"]|['"]$/g, ''));
        else if (/^\S/.test(line)) inPackages = false;
      }
    }
  } catch { /* no pnpm-workspace.yaml */ }

  return isRoot ? patterns : null;
}

function workspaceGlobToRegExp(pattern: string): RegExp {
  const DEEP_DIR = '\u0000';
  const DEEP_ANY = '\u0001';
  const body = pattern.replace(/^\.\//, '').replace(/\/+$/, '')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, DEEP_DIR)
    .replace(/\*\*/g, DEEP_ANY)
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .split(DEEP_DIR).join('(?:.*/)?')
    .split(DEEP_ANY).join('.*');
  return new RegExp(`^${body}$`);
}

/**
 * Is `pkgDir` a member of the workspace declared at `rootDir`? Patterns are
 * resolved relative to the root; a pattern containing a `..` segment or an
 * absolute path is ignored (it could point outside the root), and `!`
 * patterns exclude.
 */
function isWorkspaceMember(rootDir: string, pkgDir: string): boolean {
  const patterns = readWorkspacePatterns(rootDir);
  if (!patterns) return false;
  const rel = path.relative(rootDir, pkgDir).split(path.sep).join('/');
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return false;

  let member = false;
  for (const raw of patterns) {
    const negated = raw.startsWith('!');
    const pattern = negated ? raw.slice(1) : raw;
    if (path.isAbsolute(pattern) || /^[A-Za-z]:/.test(pattern) || pattern.split(/[\\/]/).includes('..')) continue;
    if (workspaceGlobToRegExp(pattern).test(rel)) member = !negated;
  }
  return member;
}

/** True when `child` is `parent` or inside it (path-segment aware). */
function within(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * The AQE project root, as the ceiling for workspace-root adoption. Runner
 * configuration is code that gets executed, so it must never be picked up from
 * above the project (`AQE_PROJECT_ROOT` or the discovered root). `null` when it
 * cannot be resolved, which disables adoption.
 */
function aqeProjectCeiling(start: string): string | null {
  try {
    return fs.realpathSync(path.resolve(findProjectRoot(start)));
  } catch {
    return null;
  }
}

/**
 * Walk up from a target to the nearest directory that holds a project marker.
 *
 * Normally NEAREST rather than topmost: in a monorepo, `packages/core/src`
 * belongs to `packages/core` when it has its own runner config. When only the
 * enclosing workspace has a runner config, use that workspace so test execution
 * and existing coverage reports use the same configured root (#1005). This
 * intentionally differs from `kernel/findProjectRoot`, which locates
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
  let nearestRoot: string | null = null;
  let ceiling: string | null = null;
  for (let depth = 0; depth <= maxDepth; depth++) {
    // A stray manifest in $HOME must not claim every directory beneath it.
    // $HOME is still a valid root when it is the target itself.
    if (home !== null && dir === home && dir !== start) return nearestRoot;
    if (!nearestRoot && PROJECT_ROOT_MARKERS.some(m => fs.existsSync(path.join(dir, m)))) {
      nearestRoot = dir;
      if (hasJsRunnerConfig(dir)) return dir;
      // Only a nested JS package can inherit the workspace's runner config.
      // Other project types keep the nearest-marker semantics.
      if (!fs.existsSync(path.join(dir, 'package.json'))) return dir;
    } else if (nearestRoot && readWorkspacePatterns(dir) !== null) {
      // Adopt this workspace root (and run its config) only when it is inside
      // the AQE project and actually lists the nearest package as a member.
      ceiling ??= aqeProjectCeiling(start) ?? '';
      if (ceiling && within(dir, ceiling) && within(nearestRoot, ceiling)
        && isWorkspaceMember(dir, nearestRoot) && hasJsRunnerConfig(dir)
        && packageCanUseRootRunner(nearestRoot, dir)) {
        return dir;
      }
      return nearestRoot;
    }
    // Do not adopt configuration from a different repository.
    if (nearestRoot && fs.existsSync(path.join(dir, '.git'))) return nearestRoot;
    const parent = path.dirname(dir);
    if (parent === dir) return nearestRoot;
    dir = parent;
  }
  return nearestRoot;
}

/**
 * When `projectRoot` was adopted as a workspace root for a target inside a
 * nested package, the directory (relative to the root, with a trailing `/`) of
 * that package, for use as a test-runner path filter so sibling packages' tests
 * are not run too. `null` when the target is the root itself or no nested
 * package manifest sits between the target and the root.
 */
export function packageFilterForTarget(target: string, projectRoot: string): string | null {
  try {
    const root = fs.realpathSync(projectRoot);
    const real = fs.realpathSync(path.resolve(target));
    let dir = fs.statSync(real).isDirectory() ? real : path.dirname(real);
    while (dir !== root && within(dir, root)) {
      if (fs.existsSync(path.join(dir, 'package.json'))) {
        return `${path.relative(root, dir).split(path.sep).join('/')}/`;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch { /* fall through */ }
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
  return (await readCoverageReportFile(filePath)).data;
}

/**
 * `loadCoverageReportFile`, plus why the report was refused unread when it
 * was (#1186), so a refused report is not described as an unparseable one.
 */
export async function readCoverageReportFile(
  filePath: string,
): Promise<{ data: CoverageData | null; refused?: RefusedCoverageReport }> {
  let content: string;
  try {
    // #1161: read from the validated descriptor, not the name checked earlier;
    // a report linked out of the project, or to a device, is not read.
    content = await readConfinedText(filePath, { outsideRoot: 'allow' });
  } catch (error) {
    if (error instanceof ConfinedReadError && error.reason !== 'not-found') {
      return { data: null, refused: { path: filePath, reason: error.reason } };
    }
    return { data: null };
  }
  return { data: parseCoverageReportContent(filePath, content) };
}

function parseCoverageReportContent(filePath: string, content: string): CoverageData | null {
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
  /** A coverage report exists but was refused unread (#1186): see `refused`. */
  | 'refused-report'
  /** The report lists only test files. */
  | 'test-only-report'
  /** The report has no entries under the target — it did not measure it. */
  | 'target-not-covered'
  /** The test runner itself reports running zero tests. */
  | 'no-tests-ran';

export type CoverageEvaluation =
  | { status: 'measured'; files: FileCoverage[]; evidence: CoverageEvidence }
  | { status: 'no-data'; reason: NoDataReason; refused?: RefusedCoverageReport[] };

/**
 * Decide what a report says about `target`. Shared by the MCP handler and the
 * CLI so the two cannot disagree (#995 review B2).
 *
 * "Unmeasured" is decided ONLY from evidence that nothing was measured:
 *   - the runner's own result says it ran 0 tests (`numTotalTests === 0`), or
 *   - the report has no entry under the target.
 * Hit counts are never used: a file listed with 0 hits is a measured 0%,
 * whether the report came from our run or from the user (#995 review B3).
 *
 * A measured result carries its evidence (#1154): the target's source files
 * the report has no entry for (UNMEASURED), and whether the report at
 * `reportPath` is older than the sources. Insufficient evidence keeps the
 * figures for the measured files, but no caller may pass a verdict on it.
 */
export function evaluateCoverageForTarget(
  report: CoverageData,
  projectRoot: string,
  target: string,
  options: { numTotalTests?: number | null; reportPath?: string; checkCompleteness?: boolean } = {}
): CoverageEvaluation {
  if (options.numTotalTests === 0) return { status: 'no-data', reason: 'no-tests-ran' };

  // #1219: an entry that is not a measurement of a project file (outside the
  // root, a Windows path on POSIX, one file under two spellings) is not part
  // of the figures — the same rule as the per-file records (#1030).
  const inTarget = scopeCoverageToTarget(report, projectRoot, target);
  const { keys, excluded } = classifyProjectCoveragePaths(inTarget.map(f => f.path), projectRoot);
  const scoped = inTarget.filter(f => keys.has(f.path));
  if (scoped.length === 0) return { status: 'no-data', reason: 'target-not-covered' };

  // Coverage OF a test file is not production coverage (#569). A report with
  // only test entries yields no production figure — never the unfiltered set.
  const production = scoped.filter(f => !isTestPath(f.path, projectRoot));
  if (production.length === 0) return { status: 'no-data', reason: 'test-only-report' };

  const evidence = assessCoverageEvidence(report, production, projectRoot, target, {
    reportPath: options.reportPath, checkCompleteness: options.checkCompleteness,
    excluded: excluded.filter(e => !e.file || !isTestPath(e.file, projectRoot)),
  });
  return { status: 'measured', files: production, evidence };
}

export type ExistingCoverage =
  | { status: 'target-missing'; target: string }
  /** `refused`: reports that exist but were not read (#1186); empty when none exists. */
  | { status: 'no-report'; target: string; projectRoot: string; refused: RefusedCoverageReport[] }
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
    const { data: report, refused } = await readCoverageReportFile(target);
    // The report itself is the target: judged whole, but still checked for staleness.
    const evaluation: CoverageEvaluation = report
      ? evaluateCoverageForTarget(report, projectRoot, projectRoot, { reportPath: target, checkCompleteness: false })
      : refused
        ? { status: 'no-data', reason: 'refused-report', refused: [refused] }
        : { status: 'no-data', reason: 'unreadable-report' };
    return { status: 'evaluated', target, projectRoot, source: 'report-file', evaluation };
  }

  const projectRoot = findCoverageProjectRoot(target) ?? (stat.isDirectory() ? target : path.dirname(target));
  const { report: existing, refused } = await findCoverageReport(projectRoot);
  if (!existing) return { status: 'no-report', target, projectRoot, refused };
  return {
    status: 'evaluated', target, projectRoot, source: 'project-report',
    evaluation: evaluateCoverageForTarget(existing.data, projectRoot, target, { reportPath: existing.path }),
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
  collected: { branch: boolean; function: boolean; statement?: boolean }
): { overall: number; meetsThreshold: boolean } {
  // #1027 N7: lcov / Cobertura carry no statement data; it is left out too.
  const metrics = [summary.line];
  if (collected.statement !== false) metrics.push(summary.statement);
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

const REFUSAL_EXPLANATIONS: Record<string, string> = {
  'outside-project-root': 'it resolves outside the project (a symlink pointing out of it)',
  'not-a-file': 'it is not a regular file (a FIFO, device or directory)',
  'too-large': 'it is over the read size limit',
  'changed-during-read': 'it was replaced or removed while it was being read',
  'hardlinked': 'it has more than one hardlink',
  'unreadable': 'it could not be opened (permissions)',
};

/**
 * Why existing coverage reports were not used (#1186). A refused report is
 * named with its reason, never described as a missing one. Shared by MCP and CLI.
 */
export function describeRefusedReports(refused: readonly RefusedCoverageReport[]): string {
  const items = refused.map(r =>
    `${r.path} (${r.reason}: ${Object.hasOwn(REFUSAL_EXPLANATIONS, r.reason) ? REFUSAL_EXPLANATIONS[r.reason] : r.reason})`);
  return `Coverage report refused and not read: ${items.join('; ')}. ` +
    'Write the report as a regular file inside the project, or pass a report file inside the project as the target.';
}

/** Caller-facing explanation of a no-data verdict. Shared by MCP and CLI. */
export function describeNoData(
  reason: NoDataReason,
  target: string,
  projectRoot: string | null,
  refused: readonly RefusedCoverageReport[] = [],
): string {
  switch (reason) {
    case 'target-missing':
      return `Target does not exist: ${target}`;
    case 'refused-report':
      return refused.length > 0
        ? describeRefusedReports(refused)
        : `Coverage report refused and not read: ${target}.`;
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
