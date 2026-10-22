/**
 * Coverage analysis task handlers.
 *
 * Extracted from task-executor.ts registerHandlers().
 * Covers: analyze-coverage
 */

import { ok, err } from '../../shared/types';
import { toError } from '../../shared/error-utils.js';
import type { TaskHandlerContext } from './handler-types';
import { requirePayloadPath } from '../../shared/io/payload-path-guard.js';
import type { CoverageData } from '../../domains/coverage-analysis/interfaces';
import {
  buildEstimatedCoverage,
  collectRustCoverage,
  findCargoRoot,
  isCoverageExecDisabled,
  isRustProject,
  type CollectedCoverage,
} from './coverage-collection';
import {
  describeNoData,
  evaluateCoverageForTarget,
  isUnmeasured,
  packageFilterForTarget,
  resolveExistingCoverage,
  scopeCoverageToTarget,
  reconcileRecommendations,
  thresholdVerdict,
  type CoverageEvaluation,
  type NoDataReason,
} from './coverage-target';
import { describeEvidence, type CoverageEvidence } from './coverage-evidence';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { describeRunFailure, runJsCoverage, testRunStatus } from './coverage-runner';
import { collectedMetrics } from '../../domains/coverage-analysis/collected-metrics.js';

/**
 * How long the project's test runner may take before its process tree is
 * killed. `AQE_COVERAGE_TIMEOUT_MS` overrides the 120s default.
 */
function coverageTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.AQE_COVERAGE_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120000;
}

/** Aggregate a file list into whole-number percentages. */
function recomputeSummary(files: CoverageData['files']): CoverageData['summary'] {
  const sum = (pick: (f: CoverageData['files'][number]) => number) =>
    files.reduce((acc, f) => acc + pick(f), 0);
  const pct = (covered: number, total: number) => (total > 0 ? Math.round((covered / total) * 100) : 0);
  const totalLines = sum(f => f.lines.total);
  const coveredLines = sum(f => f.lines.covered);
  // #1012: statements are statements (lcov carries its line figures there).
  const totalStatements = sum(f => f.statements.total);
  return {
    line: pct(coveredLines, totalLines),
    branch: pct(sum(f => f.branches.covered), sum(f => f.branches.total)),
    function: pct(sum(f => f.functions.covered), sum(f => f.functions.total)),
    statement: totalStatements > 0
      ? pct(sum(f => f.statements.covered), totalStatements)
      : pct(coveredLines, totalLines),
    files: files.length,
  };
}

/** An instrumented verdict as a collected result with honest provenance. */
function instrumented(files: CoverageData['files']): CollectedCoverage {
  return {
    data: { files, summary: recomputeSummary(files) },
    provenance: {
      method: 'instrumented-report',
      estimated: false,
      branchDataCollected: files.some(f => f.branches.total > 0),
      functionDataCollected: files.some(f => f.functions.total > 0),
      notes: [],
    },
  };
}

interface CollectResult {
  collected: CollectedCoverage | null;
  ranTests: boolean;
  noData?: NoDataReason;
  /** The directory coverage tooling runs from and report paths resolve against. */
  projectRoot: string | null;
  /** Extra caveats (e.g. the runner timed out). */
  notes?: string[];
  /**
   * Outcome of the test run we started, when one ran and reported tests
   * (#1027 N4): coverage from a failing suite is still measured.
   */
  runStatus?: 'passed' | 'failed';
  /** The run's test counts, when the runner reported them (#1027 NB1). */
  testRun?: { runId: string; passed: number; failed: number; skipped: number };
  /** #1154: unmeasured target files and report staleness. */
  evidence?: CoverageEvidence;
}

function fromEvaluation(
  evaluation: CoverageEvaluation,
  ranTests: boolean,
  projectRoot: string
): CollectResult {
  return evaluation.status === 'measured'
    ? { collected: instrumented(evaluation.files), ranTests, projectRoot, evidence: evaluation.evidence }
    : { collected: null, ranTests, noData: evaluation.reason, projectRoot };
}

/**
 * Collect coverage for a target, preferring real measurement over estimation
 * and always reporting which one happened (#569).
 *
 * The target may be the project root, a subfolder or file inside it, or an
 * existing coverage report (#995). Tooling always runs from the project root
 * and the result is scoped back down to the target. The decision about what
 * a report says for a target is shared with the CLI (`resolveExistingCoverage`
 * / `evaluateCoverageForTarget`).
 *
 * Cascade:
 *   0. the target IS a coverage report — parse it, run nothing
 *   1. an instrumented report already on disk at the project root
 *   2. language-specific instrumentation we can run — `cargo llvm-cov` for Rust,
 *      the project's test runner for JS/TS — writing to a temp dir
 *   3. static estimation, explicitly labelled `estimated: true`
 */
async function collectCoverage(targetPath: string): Promise<CollectResult> {
  const existing = await resolveExistingCoverage(targetPath);
  if (existing.status === 'target-missing') {
    return { collected: null, ranTests: false, noData: 'target-missing', projectRoot: null };
  }
  if (existing.status === 'evaluated') {
    return fromEvaluation(existing.evaluation, false, existing.projectRoot);
  }

  const { target } = existing;
  let projectRoot = existing.projectRoot;

  // #569 work item 1: delegate to real instrumentation where available.
  if (isRustProject(target)) {
    const rust = await collectRustCoverage(target);
    if (rust) {
      // cargo ran from the crate root; scope its crate-wide output to the target.
      const crateRoot = findCargoRoot(target) ?? projectRoot;
      const scoped = scopeCoverageToTarget(rust.data, crateRoot, target);
      if (scoped.length === 0) {
        return { collected: null, ranTests: true, noData: 'target-not-covered', projectRoot: crateRoot };
      }
      const collected = scoped.length === rust.data.files.length
        ? rust
        : { data: { files: scoped, summary: recomputeSummary(scoped) }, provenance: rust.provenance };
      return { collected, ranTests: true, projectRoot: crateRoot };
    }

    // This target is a Rust crate. Do not continue into the JS/TS runner:
    // `npx vitest --coverage` can still be available through the parent
    // process PATH and will write an empty report even though the crate has no
    // JavaScript tests. Treating that artifact as coverage hides the intended
    // Rust static-estimation fallback and mislabels the result.
    return { collected: buildEstimatedCoverage(target), ranTests: false, projectRoot };
  }

  // Running the project's test suite executes code from the analyzed repository
  // (the tests themselves, plus npm lifecycle scripts via npx). Honor the
  // opt-out before doing that.
  if (isCoverageExecDisabled()) {
    return { collected: buildEstimatedCoverage(target), ranTests: false, projectRoot };
  }

  const pathFilter = packageFilterForTarget(target, projectRoot);
  let run = await runJsCoverage(projectRoot, {
    timeoutMs: coverageTimeoutMs(),
    pathFilter,
  });
  // A workspace config may deliberately include only root-level tests. If it
  // found no tests for this package, restore the nearest-package behavior. The
  // same fallback permits isolated package installs with no runner at the root.
  // Do not retry timeouts, crashes or nonempty failing suites: their failures
  // must remain visible. Only the fallback run's actual report can be measured.
  const rootRunnerMissing = run.missing && run.numTotalTests === null;
  const rootHadNoTests = !run.missing && run.numTotalTests === 0
    && testRunStatus(run) === 'passed' && (run.exitCode === 0 || run.exitCode === 1);
  if (pathFilter && !run.timedOut && (rootRunnerMissing || rootHadNoTests)) {
    projectRoot = path.resolve(projectRoot, pathFilter);
    run = await runJsCoverage(projectRoot, { timeoutMs: coverageTimeoutMs() });
  }
  // An EMPTY report (`{}`) from a run that reported its tests means "the run
  // instrumented nothing under the target" → unmeasured, never an estimate
  // (#995 review BL2). An empty report from a run that crashed before
  // reporting any tests is a crash, handled below.
  const crashedEmpty = run.data !== null && run.data.files.length === 0 &&
    run.numTotalTests === null && !run.exitedCleanly;
  if ((run.data && !crashedEmpty) || run.numTotalTests === 0) {
    const evaluation = run.data
      ? evaluateCoverageForTarget(run.data, projectRoot, target, { numTotalTests: run.numTotalTests })
      : { status: 'no-data' as const, reason: 'no-tests-ran' as const };
    const result = fromEvaluation(evaluation, run.exitedCleanly || run.data !== null, projectRoot);
    if (result.collected) {
      // #1027 N4/NB2: a run with failing tests still measured coverage; the
      // failure is decided from the runner's counts, not its exit code.
      result.runStatus = testRunStatus(run);
      // #1027 NB1: the run's own testsPassing is recorded with its coverage.
      if (typeof run.numPassedTests === 'number' && typeof run.numFailedTests === 'number') {
        result.testRun = {
          runId: randomUUID(), passed: run.numPassedTests, failed: run.numFailedTests, skipped: run.numPendingTests ?? 0,
        };
      }
    }
    return result;
  }

  // No report at all: say exactly what happened to the run (not installed,
  // timed out, crashed with stderr), then fall back to a labelled estimate.
  const estimate = buildEstimatedCoverage(target);
  const runNote = describeRunFailure(run, projectRoot);
  if (estimate) {
    estimate.provenance.notes = [
      `${runNote} These numbers are a STATIC ESTIMATE derived from source shape — ` +
        'not measured coverage, and must not be reported as such.',
      ...estimate.provenance.notes.filter(n => !/^No instrumentation ran/.test(n)),
    ];
  }
  return {
    collected: estimate, ranTests: run.exitedCleanly, projectRoot,
    notes: estimate ? [] : [runNote],
  };
}

/** Caller-facing explanation for a result with no coverage figures. */
function noDataWarning(
  reason: NoDataReason | undefined,
  ranTests: boolean,
  targetPath: string,
  projectRoot: string | null
): string {
  if (reason) return describeNoData(reason, targetPath, projectRoot);
  return ranTests
    ? 'Tests ran but no coverage output was generated. Ensure a coverage provider is configured (e.g., @vitest/coverage-v8, istanbul).'
    : 'No coverage data found and could not run tests automatically. ' + estimationGuidance(targetPath);
}

/**
 * Build the guidance string shown when a result is an estimate rather than a
 * measurement, tailored to what the target actually is.
 */
function estimationGuidance(targetPath: string): string {
  // When the caller turned execution off, naming the tool to install is the
  // wrong advice — nothing will be run either way until they opt back in.
  if (isCoverageExecDisabled()) {
    return 'Coverage tooling execution is disabled (AQE_COVERAGE_NO_EXEC). No tests ' +
      'were run and no build tooling was invoked. Unset it, or generate a coverage ' +
      'report yourself and re-run, to get real measurements.';
  }
  if (isRustProject(targetPath)) {
    return 'To get real measurements for this Rust crate, install cargo-llvm-cov ' +
      '(`cargo install cargo-llvm-cov`) and re-run; agentic-qe will invoke it automatically.';
  }
  return 'To get real measurements, run your tests with coverage enabled ' +
    '(e.g. `npm test -- --coverage`, `pytest --cov`) and re-run this analysis.';
}

export function registerCoverageHandlers(ctx: TaskHandlerContext): void {
  // Register coverage analysis handler - REAL IMPLEMENTATION
  ctx.registerHandler('analyze-coverage', async (task) => {
    const payload = task.payload as {
      target: string;
      detectGaps: boolean;
      threshold?: number;
    };

    try {
      // #1126: collect coverage (which may run the tests) only inside the
      // project. A missing target keeps its own message below.
      let targetPath = payload.target || process.cwd();
      if (payload.target && payload.target !== '.') {
        const confined = await requirePayloadPath('analyze-coverage', 'target', payload.target,
          { allowDirectory: true, allowMissing: true });
        if (!confined.success) return confined;
        targetPath = confined.value;
      }
      const analyzer = ctx.getCoverageAnalyzer();
      const threshold = payload.threshold || 80;

      const { collected, ranTests, noData, projectRoot, notes, runStatus, testRun, evidence } = await collectCoverage(targetPath);

      // #995 review N5: say so plainly instead of "no coverage data found".
      if (noData === 'target-missing') {
        return err(new Error(describeNoData('target-missing', targetPath, null)));
      }

      if (!collected) {
        const unmeasured = noData !== undefined && isUnmeasured(noData);
        return ok({
          lineCoverage: null,
          branchCoverage: null,
          functionCoverage: null,
          statementCoverage: null,
          totalFiles: 0,
          coverageByFile: [],
          gaps: [],
          estimated: false,
          measured: false,
          coverageMethod: 'none',
          // #995(d): "no measurement exists for this target", distinct from 0%.
          ...(unmeasured ? { unmeasured: true } : {}),
          algorithm: 'sublinear-O(log n)',
          warning: notes?.length ? notes.join(' ') : noDataWarning(noData, ranTests, targetPath, projectRoot),
        });
      }

      const { data: coverageData, provenance } = collected;

      // Analyze coverage using the real CoverageAnalyzerService
      // #1008: the analyzer persists only measured coverage; a static estimate
      // is returned below, labelled, but never stored as evidence.
      const analysisResult = await analyzer.analyze({
        coverageData,
        threshold,
        includeFileDetails: payload.detectGaps,
        measured: !provenance.estimated,
        // #1027 N7: per-file records use absolute keys; N4: failing-suite coverage is labelled.
        ...(projectRoot ? { projectRoot } : {}),
        ...(runStatus && !provenance.estimated ? { runStatus } : {}),
        ...(testRun && !provenance.estimated ? { testRun } : {}),
      });

      if (!analysisResult.success) {
        return analysisResult;
      }

      const report = analysisResult.value;

      // Find gaps if requested
      let gaps: Array<Record<string, unknown>> = [];
      if (payload.detectGaps) {
        const gapsResult = await analyzer.findGaps(coverageData, threshold);
        if (gapsResult.success) {
          gaps = gapsResult.value.gaps.map(gap => ({
            file: gap.file,
            lines: gap.lines,
            risk: gap.severity,
            // #569: a gap derived from an estimate is a hypothesis, not a
            // finding. Carry that all the way to the caller rather than letting
            // it inherit a default riskScore/confidence downstream.
            estimated: provenance.estimated,
            ...(provenance.estimated
              ? {
                  confidence: 0.2,
                  reason: 'Possible coverage gap (STATIC ESTIMATE — no instrumentation ran)',
                }
              : {}),
          }));
        }
      }

      const round = (n: number) => Math.round(n * 10) / 10;
      const pct = (covered: number, total: number) =>
        total > 0 ? Math.round((covered / total) * 1000) / 10 : null;

      // #1154: target files missing from the report, or a report older than the
      // sources, leave the evidence insufficient: the figures stand for the
      // measured files only, and the threshold is not met on them.
      const evidenceReasons = describeEvidence(evidence, projectRoot ?? targetPath);
      const warnings = [...provenance.notes, ...(notes ?? [])];
      if (provenance.estimated) warnings.push(estimationGuidance(targetPath));
      if (evidenceReasons.length > 0) {
        warnings.push(`INSUFFICIENT EVIDENCE — the threshold is not met on this report: ${evidenceReasons.join('; ').replace(/\.?$/, '.')}`);
      }

      // #569: the analyzer generates recommendations from the summary numbers.
      // When branch or function data was never collected, those numbers are 0
      // by construction, and the resulting advice ("Branch coverage is
      // significantly lower than line coverage", "Function coverage is below
      // 70%") is a statement about a metric nobody measured. Drop it rather
      // than send a developer to fix a number that doesn't exist.
      // #995 NB5/NB-A: the verdict and the shortfall advice come from the same
      // collected-metrics computation (shared with the CLI), so they can't disagree.
      // #1027 N7: lcov / Cobertura carry no statement data — n/a, out of the verdict.
      const statementCollected = provenance.estimated || collectedMetrics(coverageData.files).statement;
      const metricsCollected = {
        branch: provenance.branchDataCollected, function: provenance.functionDataCollected, statement: statementCollected,
      };
      const verdict = thresholdVerdict(report.summary, threshold, metricsCollected);
      const recommendations = reconcileRecommendations(report.recommendations, verdict, threshold, metricsCollected);

      return ok({
        lineCoverage: round(report.summary.line),
        // #569 work item 4: never report a branch percentage — least of all
        // 100% — when no branch data was collected.
        branchCoverage: provenance.branchDataCollected ? round(report.summary.branch) : null,
        functionCoverage: provenance.functionDataCollected ? round(report.summary.function) : null,
        statementCoverage: statementCollected ? round(report.summary.statement) : null,
        totalFiles: report.summary.files,
        coverageByFile: coverageData.files.map(f => ({
          file: f.path,
          lineCoverage: pct(f.lines.covered, f.lines.total) ?? 0,
          branchCoverage: provenance.branchDataCollected ? pct(f.branches.covered, f.branches.total) : null,
          functionCoverage: provenance.functionDataCollected ? pct(f.functions.covered, f.functions.total) : null,
        })),
        gaps,
        // NB5: judged only on the metrics that were collected (shared with the CLI).
        meetsThreshold: verdict.meetsThreshold && evidenceReasons.length === 0,
        ...(evidence ? {
          evidenceStatus: evidence.status,
          unmeasuredFiles: evidence.unmeasuredFiles,
          ...(evidence.stale ? { staleReport: evidence.stale } : {}),
        } : {}),
        delta: report.delta,
        recommendations,
        algorithm: 'sublinear-O(log n)',
        // #569 work item 5: the caller must be able to tell measurement from guess.
        estimated: provenance.estimated,
        measured: !provenance.estimated,
        coverageMethod: provenance.method,
        branchDataCollected: provenance.branchDataCollected,
        functionDataCollected: provenance.functionDataCollected,
        statementDataCollected: statementCollected,
        ...(runStatus && !provenance.estimated ? { runStatus } : {}),
        ...(warnings.length > 0 ? { warning: warnings.join(' ') } : {}),
      });
    } catch (error) {
      return err(toError(error));
    }
  });
}
