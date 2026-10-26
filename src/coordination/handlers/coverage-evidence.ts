/**
 * Coverage evidence: is a report complete and current for its target? (#1154)
 *
 * A report judged over only the files it happens to contain says nothing
 * about the target's other files. `aqe fleet run analyze --target src` printed
 * "100% over 1 files" and "Verdict: PASSED" from a report that listed
 * `src/math.js` while `src/unsafe.js` had no measurement at all, and a report
 * written before the sources last changed was judged as if it were current.
 *
 * This module answers two questions for every caller of the shared resolver
 * (MCP `coverage_analyze_sublinear` / `task_orchestrate`, `aqe coverage`,
 * `aqe ci`, `aqe fleet run analyze`):
 *   1. Which production source files under the target are not in the report?
 *      They are UNMEASURED: not 0%, and not left out silently.
 *   2. Is the report older than source files it is judged against? (stale)
 * Either one makes the evidence insufficient: no verdict may pass on it.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { FileCoverage } from '../../domains/coverage-analysis/interfaces';
import type { ExcludedCoverageEntry } from '../../domains/coverage-analysis/collected-metrics.js';
import { walkSourceFiles } from './coverage-collection';
import { inCoverageScope, readCoverageScope } from './coverage-scope';

/** The report is older than these source files. */
export interface StaleReport {
  reportPath: string;
  reportModified: string;
  newerFiles: string[];
}

export interface CoverageEvidence {
  /** `insufficient-evidence` when any target file is unmeasured or the report is stale. */
  status: 'complete' | 'insufficient-evidence';
  /** Production source files under the target with no entry in the report (absolute paths). */
  unmeasuredFiles: string[];
  /** Production source files under the target, measured or not. */
  targetFiles: number;
  stale?: StaleReport;
  /** The coverage config whose include/exclude scoped `unmeasuredFiles`, if any. */
  coverageScope?: { source: string; readable: boolean };
  /**
   * #1219: report entries left out of the figures because they are not a
   * measurement of a project file (outside the root, a Windows path on POSIX,
   * or one file under two spellings).
   */
  excludedEntries?: ExcludedCoverageEntry[];
  /**
   * #1219: project files the report lists under two spellings. Which entry is
   * right is unknown, so they are UNMEASURED and the evidence is insufficient.
   */
  conflictingFiles?: string[];
}

/** Source files that share a coverage tool with each other (one report covers one family). */
const LANGUAGE_FAMILIES: string[][] = [
  ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
  ['.py'], ['.go'], ['.rs'], ['.java'], ['.rb'],
];

function familyOf(file: string): string[] | undefined {
  const ext = path.extname(file).toLowerCase();
  return LANGUAGE_FAMILIES.find(family => family.includes(ext));
}

/**
 * Files no coverage tool instruments by default: type declarations and tool
 * configuration (`vitest.config.ts`, `eslint.config.js`, `.prettierrc.js`).
 */
function isNeverInstrumented(file: string): boolean {
  const base = path.basename(file);
  return base.endsWith('.d.ts') || base.startsWith('.') || /\.config\.[cm]?[jt]sx?$/.test(base);
}

function canonical(p: string): string {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}

/** Absolute, canonical paths of the report's entries (relative entries resolve against `projectRoot`). */
function reportPaths(files: FileCoverage[], projectRoot: string): Set<string> {
  const rootAbs = canonical(projectRoot);
  return new Set(files.map(f => path.isAbsolute(f.path) ? canonical(f.path) : canonical(path.resolve(rootAbs, f.path))));
}

/**
 * Production source files under a directory `target` that the report has no
 * entry for. Only files in a language the report covers count: a JS report
 * does not make a Python helper script unmeasured. Files the project's coverage
 * config leaves out (include/exclude) were never meant to be measured and do
 * not count either.
 */
export function findUnmeasuredSourceFiles(
  reportFiles: FileCoverage[],
  projectRoot: string,
  target: string,
): { targetFiles: string[]; unmeasured: string[]; coverageScope?: { source: string; readable: boolean } } {
  let isDir = false;
  try { isDir = fs.statSync(target).isDirectory(); } catch { /* missing: nothing to compare */ }
  if (!isDir) return { targetFiles: [], unmeasured: [] };

  const rootAbs = canonical(projectRoot);
  const scope = readCoverageScope(rootAbs);
  const families = new Set(reportFiles.map(f => familyOf(f.path)).filter(Boolean));
  const inReport = reportPaths(reportFiles, projectRoot);
  const targetFiles = walkSourceFiles(target)
    .filter(file => families.has(familyOf(file)) && !isNeverInstrumented(file))
    .map(canonical)
    .filter(file => inCoverageScope(scope, file, rootAbs));
  return {
    targetFiles,
    unmeasured: targetFiles.filter(file => !inReport.has(file)).sort(),
    ...(scope ? { coverageScope: { source: scope.source, readable: scope.readable } } : {}),
  };
}

/** Source files modified after the report was written; `undefined` when the report is current. */
export function findStaleness(reportPath: string, sourceFiles: string[]): StaleReport | undefined {
  let reportMtime: number;
  try { reportMtime = fs.statSync(reportPath).mtimeMs; } catch { return undefined; }
  const newerFiles = sourceFiles.filter(file => {
    try { return fs.statSync(file).mtimeMs > reportMtime; } catch { return false; }
  }).sort();
  return newerFiles.length > 0
    ? { reportPath, reportModified: new Date(reportMtime).toISOString(), newerFiles }
    : undefined;
}

/**
 * The evidence a report gives for `target`.
 *
 * `measuredFiles` are the report entries already scoped to the target.
 * Completeness is checked only when `checkCompleteness` is set (a directory
 * target, not a report file given as the target), staleness only when the
 * report's path is known (not for a report the run just wrote).
 */
export function assessCoverageEvidence(
  report: { files: FileCoverage[] },
  measuredFiles: FileCoverage[],
  projectRoot: string,
  target: string,
  options: { reportPath?: string; checkCompleteness?: boolean; excluded?: ExcludedCoverageEntry[] } = {},
): CoverageEvidence {
  const { targetFiles, unmeasured, coverageScope } = options.checkCompleteness === false
    ? { targetFiles: [], unmeasured: [], coverageScope: undefined }
    : findUnmeasuredSourceFiles(report.files, projectRoot, target);

  const sources = new Set([...targetFiles, ...reportPaths(measuredFiles, projectRoot)]);
  const stale = options.reportPath
    ? findStaleness(options.reportPath, [...sources].filter(file => fs.existsSync(file)))
    : undefined;

  const excluded = options.excluded ?? [];
  const conflicting = [...new Set(excluded.flatMap(e => (e.file ? [e.file] : [])))].sort();
  return {
    status: unmeasured.length > 0 || stale || conflicting.length > 0 ? 'insufficient-evidence' : 'complete',
    unmeasuredFiles: unmeasured,
    targetFiles: sources.size + conflicting.filter(file => !sources.has(file)).length,
    ...(stale ? { stale } : {}),
    ...(coverageScope ? { coverageScope } : {}),
    ...(excluded.length > 0 ? { excludedEntries: excluded } : {}),
    ...(conflicting.length > 0 ? { conflictingFiles: conflicting } : {}),
  };
}

const MAX_LISTED = 5;

function listFiles(files: string[], root: string): string {
  const shown = files.slice(0, MAX_LISTED).map(f => path.relative(root, f) || f);
  return shown.join(', ') + (files.length > MAX_LISTED ? `, … ${files.length - MAX_LISTED} more` : '');
}

/**
 * Why the evidence is insufficient, one sentence per problem; empty when it is
 * complete. Shared by MCP and CLI so the wording cannot drift.
 */
export function describeEvidence(evidence: CoverageEvidence | undefined, projectRoot: string): string[] {
  if (!evidence) return [];
  const reasons: string[] = [];
  const n = evidence.unmeasuredFiles.length;
  if (n > 0) {
    const scope = evidence.coverageScope;
    const scopeNote = scope && !scope.readable
      ? ` The coverage include/exclude in ${scope.source} could not be read statically, so files it leaves out ` +
        'may be listed here; write them as literal string arrays to have them honoured.'
      : '';
    reasons.push(`${n} of ${evidence.targetFiles} source files under the target are not in the coverage report ` +
      `(UNMEASURED, not counted as covered): ${listFiles(evidence.unmeasuredFiles, projectRoot)}. Regenerate ` +
      'the report with coverage for the whole target, or exclude files that are not meant to be measured in the ' +
      `coverage tool's include/exclude config.${scopeNote}`);
  }
  const conflicting = evidence.conflictingFiles ?? [];
  if (conflicting.length > 0) {
    reasons.push(`${conflicting.length} source file${conflicting.length === 1 ? ' is' : 's are'} listed in the coverage ` +
      'report under two spellings (e.g. `./src/a.ts` and `src/a.ts`), so which entry is right is unknown; ' +
      `they are UNMEASURED and left out of the figures: ${listFiles(conflicting, projectRoot)}`);
  }
  if (evidence.stale) {
    const m = evidence.stale.newerFiles.length;
    reasons.push(`the coverage report ${path.relative(projectRoot, evidence.stale.reportPath) || evidence.stale.reportPath} ` +
      `is STALE: ${m} source file${m === 1 ? ' was' : 's were'} modified after it was written ` +
      `(${evidence.stale.reportModified}): ${listFiles(evidence.stale.newerFiles, projectRoot)}`);
  }
  return reasons;
}

const EXCLUDED_WHY: Record<ExcludedCoverageEntry['reason'], string> = {
  'outside-project': 'outside the project root',
  'windows-path': 'a Windows path, which cannot name a file here',
  'duplicate-spelling': 'a second spelling of a file the report already lists',
};

/**
 * #1219: one line naming the report entries left out of the figures as not
 * project files (empty when none were). A note, not an evidence gap: those
 * entries never were the project's coverage. Shared by MCP and CLI.
 */
export function describeExcludedEntries(evidence: CoverageEvidence | undefined): string[] {
  const outside = (evidence?.excludedEntries ?? []).filter(e => e.reason !== 'duplicate-spelling');
  if (outside.length === 0) return [];
  const shown = outside.slice(0, MAX_LISTED).map(e => `${e.path} (${EXCLUDED_WHY[e.reason]})`);
  const more = outside.length > MAX_LISTED ? `, … ${outside.length - MAX_LISTED} more` : '';
  return [`${outside.length} coverage report entr${outside.length === 1 ? 'y is' : 'ies are'} not a project file and ` +
    `${outside.length === 1 ? 'is' : 'are'} left out of the figures: ${shown.join(', ')}${more}.`];
}
