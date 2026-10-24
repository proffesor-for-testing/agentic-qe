/**
 * Which coverage metrics a report actually collected (#995, #1015, #1027).
 *
 * A metric with no data in the report (no branch entries, no functions, no
 * statement detail — lcov and Cobertura carry none) is "not collected". Its
 * summary figure is 0 by construction, and must be reported AND persisted as
 * null — never as 0% (a fake low figure) nor as istanbul's 0/0 = 100%.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { CoverageSummary, FileCoverage } from './interfaces';
import { findProjectRoot } from '../../kernel/project-root.js';

/**
 * The ONE key form for per-file coverage records (#1027 N7): the absolute
 * path. Reports write absolute (istanbul) or project-relative (lcov
 * `SF:src/a.ts`) paths; a relative one is resolved against the project root
 * (or the cwd when none is known), so one file never has two records.
 */
export function fileCoverageKey(filePath: string, projectRoot?: string): string {
  return path.isAbsolute(filePath) ? path.normalize(filePath) : path.resolve(projectRoot ?? findProjectRoot(), filePath);
}

/** Why a report entry is not a measurement of a project file (#1030, #1219). */
export type ExcludedCoverageReason = 'outside-project' | 'windows-path' | 'duplicate-spelling';

/** A report entry left out of per-file records and of the report's summary. */
export interface ExcludedCoverageEntry {
  /** The path as the report wrote it. */
  path: string;
  reason: ExcludedCoverageReason;
  /** For `duplicate-spelling`: the project file both spellings name. */
  file?: string;
}

function isInside(root: string, key: string): boolean {
  const relative = path.relative(root, key);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function realRoot(root: string): string {
  try { return fs.realpathSync(root); } catch { return root; }
}

/**
 * #1030, #1219: sort the paths of ONE report into project files (with their
 * per-file record key, keyed by the path as the report wrote it) and entries
 * that are not a measurement of a project file: a path that resolves outside
 * the project root (lcov `SF:../../outside.ts`), a Windows absolute path read
 * on POSIX (it would resolve to a junk key), or a file the report lists under
 * two spellings (`./src/a.ts` and `src/a.ts`), so which entry is right is
 * unknown. A path under the root's realpath (macOS `/private/var` for
 * `/var`) is inside.
 */
export function classifyProjectCoveragePaths(
  paths: readonly string[],
  projectRoot?: string
): { keys: Map<string, string>; excluded: ExcludedCoverageEntry[] } {
  const root = path.resolve(projectRoot ?? findProjectRoot());
  const canonicalRoot = realRoot(root);
  const keys = new Map<string, string>();
  const excluded: ExcludedCoverageEntry[] = [];
  const spellings = new Map<string, number>();
  for (const filePath of paths) {
    if (!path.isAbsolute(filePath) && path.win32.isAbsolute(filePath)) {
      excluded.push({ path: filePath, reason: 'windows-path' });
      continue;
    }
    const key = fileCoverageKey(filePath, root);
    if (!isInside(root, key) && !isInside(canonicalRoot, key)) {
      excluded.push({ path: filePath, reason: 'outside-project' });
      continue;
    }
    keys.set(filePath, key);
    spellings.set(key, (spellings.get(key) ?? 0) + 1);
  }
  for (const [filePath, key] of keys) {
    if ((spellings.get(key) ?? 0) > 1) {
      keys.delete(filePath);
      excluded.push({ path: filePath, reason: 'duplicate-spelling', file: key });
    }
  }
  return { keys, excluded };
}

/** #1030: the per-file record key of each project file in ONE report (see `classifyProjectCoveragePaths`). */
export function projectFileCoverageKeys(paths: readonly string[], projectRoot?: string): Map<string, string> {
  return classifyProjectCoveragePaths(paths, projectRoot).keys;
}

/** Read the canonical key first, then a measured legacy relative key if present. */
export function fileCoverageLookupKeys(filePath: string, projectRoot?: string): string[] {
  const canonical = `coverage:file:${fileCoverageKey(filePath, projectRoot)}`;
  const legacy = `coverage:file:${filePath}`;
  return canonical === legacy ? [canonical] : [canonical, legacy];
}

export interface CollectedMetrics {
  branch: boolean;
  function: boolean;
  statement: boolean;
}

/** Which optional metrics the files carry. Line coverage is always collected. */
export function collectedMetrics(files: readonly FileCoverage[]): CollectedMetrics {
  return {
    branch: files.some(f => f.branches.total > 0),
    function: files.some(f => f.functions.total > 0),
    statement: files.some(f => f.statements.total > 0),
  };
}

/** A summary as it is reported and persisted: uncollected metrics are null. */
export interface CollectedSummary {
  line: number;
  branch: number | null;
  function: number | null;
  statement: number | null;
  files: number;
}

export function collectedSummary(summary: CoverageSummary, collected: CollectedMetrics): CollectedSummary {
  return {
    line: summary.line,
    branch: collected.branch ? summary.branch : null,
    function: collected.function ? summary.function : null,
    statement: collected.statement ? summary.statement : null,
    files: summary.files,
  };
}
