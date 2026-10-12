/**
 * Coverage analysis task handlers.
 *
 * Extracted from task-executor.ts registerHandlers().
 * Covers: analyze-coverage
 */

import { ok, err } from '../../shared/types';
import { toError } from '../../shared/error-utils.js';
import type { TaskHandlerContext } from './handler-types';
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
  resolveExistingCoverage,
  scopeCoverageToTarget,
  type CoverageEvaluation,
  type NoDataReason,
} from './coverage-target';
import { runJsCoverage } from './coverage-runner';

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
  return {
    line: pct(coveredLines, totalLines),
    branch: pct(sum(f => f.branches.covered), sum(f => f.branches.total)),
    function: pct(sum(f => f.functions.covered), sum(f => f.functions.total)),
    statement: pct(coveredLines, totalLines),
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
}

function fromEvaluation(
  evaluation: CoverageEvaluation,
  ranTests: boolean,
  projectRoot: string
): CollectResult {
  return evaluation.status === 'measured'
    ? { collected: instrumented(evaluation.files), ranTests, projectRoot }
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

  const { target, projectRoot } = existing;

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

  const run = await runJsCoverage(projectRoot, { timeoutMs: coverageTimeoutMs() });
  if (run.data || run.numTotalTests === 0) {
    const evaluation = run.data
      ? evaluateCoverageForTarget(run.data, projectRoot, target, { numTotalTests: run.numTotalTests })
      : { status: 'no-data' as const, reason: 'no-tests-ran' as const };
    return fromEvaluation(evaluation, run.exitedCleanly || run.data !== null, projectRoot);
  }

  const notes = run.timedOut
    ? ['The coverage run timed out and was stopped (the whole process tree was terminated).']
    : [];
  return { collected: buildEstimatedCoverage(target), ranTests: run.exitedCleanly, projectRoot, notes };
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
      const analyzer = ctx.getCoverageAnalyzer();
      const targetPath = payload.target || process.cwd();
      const threshold = payload.threshold || 80;

      const { collected, ranTests, noData, projectRoot, notes } = await collectCoverage(targetPath);

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
          warning: noDataWarning(noData, ranTests, targetPath, projectRoot),
        });
      }

      const { data: coverageData, provenance } = collected;

      // Analyze coverage using the real CoverageAnalyzerService
      const analysisResult = await analyzer.analyze({
        coverageData,
        threshold,
        includeFileDetails: payload.detectGaps,
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

      const warnings = [...provenance.notes, ...(notes ?? [])];
      if (provenance.estimated) warnings.push(estimationGuidance(targetPath));

      // #569: the analyzer generates recommendations from the summary numbers.
      // When branch or function data was never collected, those numbers are 0
      // by construction, and the resulting advice ("Branch coverage is
      // significantly lower than line coverage", "Function coverage is below
      // 70%") is a statement about a metric nobody measured. Drop it rather
      // than send a developer to fix a number that doesn't exist.
      const recommendations = report.recommendations.filter(rec => {
        if (!provenance.branchDataCollected && /branch coverage/i.test(rec)) return false;
        if (!provenance.functionDataCollected && /function coverage/i.test(rec)) return false;
        return true;
      });

      return ok({
        lineCoverage: round(report.summary.line),
        // #569 work item 4: never report a branch percentage — least of all
        // 100% — when no branch data was collected.
        branchCoverage: provenance.branchDataCollected ? round(report.summary.branch) : null,
        functionCoverage: provenance.functionDataCollected ? round(report.summary.function) : null,
        statementCoverage: round(report.summary.statement),
        totalFiles: report.summary.files,
        coverageByFile: coverageData.files.map(f => ({
          file: f.path,
          lineCoverage: pct(f.lines.covered, f.lines.total) ?? 0,
          branchCoverage: provenance.branchDataCollected ? pct(f.branches.covered, f.branches.total) : null,
          functionCoverage: provenance.functionDataCollected ? pct(f.functions.covered, f.functions.total) : null,
        })),
        gaps,
        meetsThreshold: report.meetsThreshold,
        delta: report.delta,
        recommendations,
        algorithm: 'sublinear-O(log n)',
        // #569 work item 5: the caller must be able to tell measurement from guess.
        estimated: provenance.estimated,
        measured: !provenance.estimated,
        coverageMethod: provenance.method,
        branchDataCollected: provenance.branchDataCollected,
        functionDataCollected: provenance.functionDataCollected,
        ...(warnings.length > 0 ? { warning: warnings.join(' ') } : {}),
      });
    } catch (error) {
      return err(toError(error));
    }
  });
}
