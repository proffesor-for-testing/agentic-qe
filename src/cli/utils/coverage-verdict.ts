/**
 * Agentic QE v3 - Shared CLI coverage verdict (#995, #1010, #1012)
 *
 * One resolution and one verdict for every CLI surface that reports coverage
 * (`aqe coverage`, the `aqe ci` coverage phase), built on the same shared
 * functions as the MCP `coverage_analyze_sublinear` handler
 * (`resolveExistingCoverage`, `thresholdVerdict`, `reconcileRecommendations`):
 *
 *   - measured   — an instrumented report covers the target: judged on the
 *                  metrics the report collected (an uncollected metric is null,
 *                  never 0%, and is left out of the threshold). When target
 *                  files are missing from the report, or the report is older
 *                  than the sources, the evidence is insufficient (#1154): the
 *                  threshold is not met and the exit code is 3;
 *   - unmeasured — the report has no entry for the target, the runner ran 0
 *                  tests, or only test files were reported: no figure, exit 3;
 *   - estimate   — no report exists, so the CLI shows a labelled STATIC
 *                  ESTIMATE. It carries no threshold verdict, is never
 *                  persisted as evidence, and also exits 3: nothing was measured;
 *   - error      — the target is missing or the given report is unreadable.
 */

import chalk from 'chalk';
import { walkSourceFiles } from './file-discovery.js';
import { buildCoverageData, summarizeCoverage, type CoverageData } from './coverage-data.js';
import {
  describeNoData,
  describeRefusedReports,
  reconcileRecommendations,
  resolveExistingCoverage,
  thresholdVerdict,
  type NoDataReason,
} from '../../coordination/handlers/coverage-target.js';
import { describeEvidence, describeExcludedEntries, type CoverageEvidence } from '../../coordination/handlers/coverage-evidence.js';
import type { RefusedCoverageReport } from '../../coordination/handlers/handler-utils.js';

/** `aqe coverage` exit code when no coverage measurement exists for the target (#995). */
export const EXIT_UNMEASURED = 3;

/** Provenance labels, the same vocabulary as MCP `coverage_analyze_sublinear`. */
export const MEASURED_METHOD = 'instrumented-report';
export const ESTIMATE_METHOD = 'static-estimation';

export type CliCoverage =
  | {
      kind: 'data'; data: CoverageData; projectRoot?: string; evidence?: CoverageEvidence;
      /** #1186: reports that exist but were refused unread (estimate only). */
      refused?: RefusedCoverageReport[];
    }
  | { kind: 'no-data'; reason: NoDataReason; message: string }
  | { kind: 'no-sources' };

/**
 * Resolve the coverage data for a CLI target (#995).
 *
 * Uses the SAME resolution and verdict as the MCP handler
 * (`resolveExistingCoverage`), so CLI and MCP cannot disagree about what a
 * report says for a target:
 *   - a coverage report file (lcov.info, coverage-final.json, ...) is parsed
 *     directly;
 *   - a directory or source file is scoped against the instrumented report of
 *     its PROJECT ROOT (nearest package.json/.git above it), not the cwd;
 *   - with no report at the project root, the CLI falls back to its labelled
 *     heuristic estimate (the CLI never runs the test suite).
 */
export async function resolveCliCoverageData(
  targetPath: string,
  log: (message: string) => void = message => console.log(message)
): Promise<CliCoverage> {
  const existing = await resolveExistingCoverage(targetPath);
  if (existing.status === 'target-missing') {
    return { kind: 'no-data', reason: 'target-missing', message: describeNoData('target-missing', targetPath, null) };
  }
  if (existing.status === 'evaluated') {
    const { evaluation, projectRoot } = existing;
    if (evaluation.status === 'measured') {
      const { files, evidence } = evaluation;
      const data: CoverageData = {
        files, summary: summarizeCoverage(files), instrumented: true,
        ...(evidence.unmeasuredFiles.length > 0 ? { unmeasuredFiles: evidence.unmeasuredFiles } : {}),
      };
      return { kind: 'data', data, projectRoot, evidence };
    }
    return {
      kind: 'no-data', reason: evaluation.reason,
      message: describeNoData(evaluation.reason, targetPath, projectRoot, evaluation.refused),
    };
  }

  const sourceFiles = walkSourceFiles(existing.target, { includeTests: false });
  if (sourceFiles.length === 0) return { kind: 'no-sources' };
  log(chalk.gray(`  Analyzing ${sourceFiles.length} files...\n`));
  return {
    kind: 'data', data: buildCoverageData(sourceFiles, existing.projectRoot), projectRoot: existing.projectRoot,
    ...(existing.refused.length > 0 ? { refused: existing.refused } : {}),
  };
}

/** Which optional metrics an instrumented report actually carries. */
export function metricsCollected(data: CoverageData): { branch: boolean; function: boolean; statement: boolean } {
  return {
    branch: data.files.some(f => f.branches.total > 0),
    function: data.files.some(f => f.functions.total > 0),
    // #1027 N7: lcov / Cobertura carry no statement detail.
    statement: data.files.some(f => f.statements.total > 0),
  };
}

/** The slice of the coverage-analysis domain API the verdict needs. */
export interface CoverageAnalyzeAPI {
  analyze(request: {
    coverageData: CoverageData;
    threshold?: number;
    includeFileDetails?: boolean;
    measured?: boolean;
    projectRoot?: string;
  }): Promise<{ success: boolean; value?: unknown; error?: Error }>;
}

/** Summary figures; `null` = not collected / not measured — never 0%. */
export interface NullableSummary {
  line: number | null;
  branch: number | null;
  function: number | null;
  statement: number | null;
}

export type CliCoverageOutcome =
  | { kind: 'no-sources' }
  | { kind: 'error'; reason: NoDataReason; message: string }
  | { kind: 'unmeasured'; reason: NoDataReason; message: string }
  | { kind: 'analysis-failed'; message: string }
  | {
      kind: 'estimate';
      data: CoverageData;
      /** Estimated figures — for display only. */
      summary: NullableSummary & { files: number };
      message: string;
      /** #1186: the project's report exists but was refused unread. */
      refused?: RefusedCoverageReport[];
    }
  | {
      kind: 'measured';
      data: CoverageData;
      summary: NullableSummary & { files: number };
      collected: { branch: boolean; function: boolean; statement: boolean };
      verdict: { overall: number; meetsThreshold: boolean };
      recommendations: string[];
      /** #1154: why the report cannot support a verdict for the target; empty when it can. */
      insufficientEvidence: string[];
      evidence?: CoverageEvidence;
    };

const isError = (reason: NoDataReason): boolean =>
  reason === 'target-missing' || reason === 'unreadable-report' || reason === 'refused-report';

/**
 * Caller-facing explanation of a static estimate. #1186: when the project's
 * report exists but was refused, it says so instead of "no report exists".
 */
export function estimateMessage(refused: readonly RefusedCoverageReport[] = []): string {
  const why = refused.length > 0
    ? `UNMEASURED: ${describeRefusedReports(refused)} So these figures are a `
    : 'UNMEASURED: no coverage report exists for this project, so these figures are a ';
  return why +
    'STATIC ESTIMATE derived from source shape — not measured coverage. No threshold verdict ' +
    'is given and nothing is stored as evidence. Run your tests with coverage first ' +
    '(e.g. `npm test -- --coverage`) and re-run.';
}

/**
 * Resolve, analyze and judge coverage for a CLI target. Shared by
 * `aqe coverage` and the `aqe ci` coverage phase.
 */
export async function evaluateCliCoverage(
  api: CoverageAnalyzeAPI,
  targetPath: string,
  threshold: number,
  log?: (message: string) => void
): Promise<CliCoverageOutcome> {
  const resolved = await resolveCliCoverageData(targetPath, log);
  if (resolved.kind === 'no-sources') return resolved;
  if (resolved.kind === 'no-data') {
    return isError(resolved.reason)
      ? { kind: 'error', reason: resolved.reason, message: resolved.message }
      : { kind: 'unmeasured', reason: resolved.reason, message: resolved.message };
  }

  const data = resolved.data;
  const measured = data.instrumented;
  // #1008: a heuristic estimate is shown, never persisted as coverage evidence.
  const result = await api.analyze({
    coverageData: data, threshold, includeFileDetails: true, measured,
    ...(resolved.projectRoot ? { projectRoot: resolved.projectRoot } : {}),
  });
  if (!result.success || !result.value) {
    return { kind: 'analysis-failed', message: result.error?.message || 'Coverage analysis failed' };
  }
  const report = result.value as {
    summary: { line: number; branch: number; function: number; statement: number; files: number };
    recommendations: string[];
  };

  if (!measured) {
    return {
      kind: 'estimate', data, summary: { ...report.summary }, message: estimateMessage(resolved.refused),
      ...(resolved.refused ? { refused: resolved.refused } : {}),
    };
  }

  // #995 review NB5: a metric the report never collected is null — not 0 —
  // and is left out of the threshold verdict (same rule as MCP).
  const collected = metricsCollected(data);
  const figures = thresholdVerdict(report.summary, threshold, collected);
  // #1154: figures over part of the target, or from a stale report, never meet the threshold.
  const insufficientEvidence = describeEvidence(resolved.evidence, resolved.projectRoot ?? targetPath);
  const verdict = { ...figures, meetsThreshold: figures.meetsThreshold && insufficientEvidence.length === 0 };
  return {
    kind: 'measured',
    data,
    collected,
    verdict,
    insufficientEvidence,
    ...(resolved.evidence ? { evidence: resolved.evidence } : {}),
    summary: {
      ...report.summary,
      branch: collected.branch ? report.summary.branch : null,
      function: collected.function ? report.summary.function : null,
      statement: collected.statement ? report.summary.statement : null,
    },
    // NB-A: the shortfall advice comes from the same verdict (shared with MCP).
    recommendations: reconcileRecommendations(report.recommendations ?? [], figures, threshold, collected),
  };
}

/**
 * Exit code: 0 meets (by more than 5%), 1 below / error, 2 within 5% above,
 * 3 UNMEASURED (not in the report, 0 tests, test-only report, or estimate only)
 * or insufficient evidence (target files missing from the report, stale report).
 */
export function coverageExitCode(outcome: CliCoverageOutcome, threshold: number): number {
  switch (outcome.kind) {
    case 'measured': {
      if (outcome.insufficientEvidence.length > 0) return EXIT_UNMEASURED;
      const { overall, meetsThreshold } = outcome.verdict;
      if (!meetsThreshold) return 1;
      return overall < threshold + 5 ? 2 : 0;
    }
    case 'estimate':
    case 'unmeasured':
      return EXIT_UNMEASURED;
    case 'no-sources':
      return 0;
    default:
      return 1;
  }
}

/** The JSON `warning`: the evidence gaps, then the report entries left out (#1219). */
function coverageWarning(insufficient: string[], excludedNotes: string[]): { warning?: string } {
  if (insufficient.length === 0 && excludedNotes.length === 0) return {};
  const gaps = insufficient.length > 0 ? `INSUFFICIENT EVIDENCE: ${insufficient.join('; ')}` : '';
  if (excludedNotes.length === 0) return { warning: gaps };
  return { warning: [gaps && gaps.replace(/\.?$/, '.'), ...excludedNotes].filter(Boolean).join(' ') };
}

/** The `-F json` document for an outcome (same shape in every case). */
export function coverageJson(outcome: CliCoverageOutcome, threshold: number, target: string): Record<string, unknown> {
  const nulls = { line: null, branch: null, function: null, statement: null };
  switch (outcome.kind) {
    case 'measured':
      return {
        summary: outcome.summary,
        meetsThreshold: outcome.verdict.meetsThreshold,
        threshold,
        recommendations: outcome.recommendations,
        measured: true,
        estimated: false,
        coverageMethod: MEASURED_METHOD,
        branchDataCollected: outcome.collected.branch,
        functionDataCollected: outcome.collected.function,
        statementDataCollected: outcome.collected.statement,
        ...(outcome.data.unmeasuredFiles?.length ? { unmeasuredFiles: outcome.data.unmeasuredFiles } : {}),
        ...(outcome.evidence ? { evidenceStatus: outcome.evidence.status } : {}),
        ...(outcome.evidence?.stale ? { staleReport: outcome.evidence.stale } : {}),
        // #1219: report entries that are not project files, left out of the figures.
        ...(outcome.evidence?.conflictingFiles ? { conflictingFiles: outcome.evidence.conflictingFiles } : {}),
        ...(outcome.evidence?.excludedEntries ? { excludedReportEntries: outcome.evidence.excludedEntries } : {}),
        ...coverageWarning(outcome.insufficientEvidence, describeExcludedEntries(outcome.evidence)),
      };
    case 'estimate':
      return {
        summary: outcome.summary,
        meetsThreshold: null,
        threshold,
        measured: false,
        estimated: true,
        unmeasured: true,
        coverageMethod: ESTIMATE_METHOD,
        reason: 'no-coverage-report',
        target,
        warning: outcome.message,
      };
    case 'unmeasured':
    case 'error':
      return {
        summary: nulls,
        meetsThreshold: null,
        threshold,
        measured: false,
        unmeasured: outcome.kind === 'unmeasured',
        reason: outcome.reason,
        target,
        warning: outcome.message,
      };
    case 'analysis-failed':
      return { summary: nulls, meetsThreshold: null, threshold, measured: false, target, error: outcome.message };
    case 'no-sources':
      return { summary: nulls, meetsThreshold: null, threshold, measured: false, target, warning: 'No source files found' };
  }
}
