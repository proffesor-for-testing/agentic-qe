/**
 * Which coverage metrics a report actually collected (#995, #1015, #1027).
 *
 * A metric with no data in the report (no branch entries, no functions, no
 * statement detail — lcov and Cobertura carry none) is "not collected". Its
 * summary figure is 0 by construction, and must be reported AND persisted as
 * null — never as 0% (a fake low figure) nor as istanbul's 0/0 = 100%.
 */

import * as path from 'path';
import type { CoverageSummary, FileCoverage } from './interfaces';

/**
 * The ONE key form for per-file coverage records (#1027 N7): the absolute
 * path. Reports write absolute (istanbul) or project-relative (lcov
 * `SF:src/a.ts`) paths; a relative one is resolved against the project root
 * (or the cwd when none is known), so one file never has two records.
 */
export function fileCoverageKey(filePath: string, projectRoot?: string): string {
  return path.isAbsolute(filePath) ? path.normalize(filePath) : path.resolve(projectRoot ?? process.cwd(), filePath);
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
