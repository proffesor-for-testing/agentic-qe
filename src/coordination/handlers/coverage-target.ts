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
import { parseCoberturaXml, parseCoverageJson, parseCoverageSummaryJson, parseLcovInfo } from './handler-utils';

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

  for (let depth = 0; depth <= maxDepth; depth++) {
    if (PROJECT_ROOT_MARKERS.some(m => fs.existsSync(path.join(dir, m)))) return dir;
    // A stray manifest in $HOME must not claim every directory beneath it.
    if (home !== null && dir === home) return null;
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
      data = isSummaryShape(parsed) ? parseCoverageSummaryJson(content) : parseCoverageJson(content);
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

/**
 * Did the run execute any code at all?
 *
 * A report in which every line and function has zero hits is what a coverage
 * tool writes when it found no tests (e.g. vitest run from the wrong
 * directory): every file listed, nothing executed. That is evidence that
 * nothing was measured, not a measurement of 0%.
 */
export function hasExecutedCode(files: FileCoverage[]): boolean {
  return files.some(f =>
    f.lines.covered > 0 || f.statements.covered > 0 || f.functions.covered > 0
  );
}
