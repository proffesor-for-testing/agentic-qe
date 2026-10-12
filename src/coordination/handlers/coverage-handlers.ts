/**
 * Coverage analysis task handlers.
 *
 * Extracted from task-executor.ts registerHandlers().
 * Covers: analyze-coverage
 */

import * as fs from 'fs/promises';
import { mkdtempSync, rmSync, statSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ok, err } from '../../shared/types';
import { toError } from '../../shared/error-utils.js';
import { safeJsonParse } from '../../shared/safe-json.js';
import type { TaskHandlerContext } from './handler-types';
import { loadCoverageData } from './handler-utils';
import type { CoverageData } from '../../domains/coverage-analysis/interfaces';
import {
  buildEstimatedCoverage,
  collectRustCoverage,
  findCargoRoot,
  isCoverageExecDisabled,
  isRustProject,
  isTestPath,
  type CollectedCoverage,
} from './coverage-collection';
import {
  findCoverageProjectRoot,
  hasExecutedCode,
  isCoverageReportFile,
  loadCoverageReportFile,
  scopeCoverageToTarget,
} from './coverage-target';

/**
 * Pick the coverage command for a JS/TS project, writing the report into
 * `reportDir` instead of the project tree.
 *
 * #995: the report goes to a private temp directory, never `<root>/coverage`
 * and never the target subfolder. Analysing coverage must not leave artifacts
 * in the user's source tree (the original bug wrote `src/coverage/`).
 */
async function buildJsCoverageCommand(projectRoot: string, reportDir: string): Promise<string> {
  const dir = JSON.stringify(reportDir);
  // vitest is the default — covers vitest, @vitest/coverage-v8, etc.
  let coverageCmd =
    `npx vitest run --coverage --coverage.reportsDirectory=${dir} --coverage.reporter=json --reporter=json`;
  try {
    const pkgContent = await fs.readFile(path.join(projectRoot, 'package.json'), 'utf-8');
    const pkg = safeJsonParse<Record<string, unknown>>(pkgContent);
    const deps = {
      ...(pkg.devDependencies as Record<string, string> || {}),
      ...(pkg.dependencies as Record<string, string> || {}),
    };
    if (deps['jest'] || deps['@jest/core']) {
      coverageCmd = `npx jest --coverage --coverageDirectory=${dir} --coverageReporters=json --json`;
    } else if (deps['mocha'] || deps['nyc']) {
      const tempDir = JSON.stringify(path.join(reportDir, '.nyc_output'));
      coverageCmd = `npx nyc --report-dir=${dir} --temp-dir=${tempDir} --reporter=json mocha`;
    }
  } catch {
    // No package.json — use default vitest
  }
  return coverageCmd;
}

/**
 * Run the project's test runner with coverage, from the PROJECT ROOT.
 *
 * #995: this used to run from whatever directory the caller passed. For
 * `target: "src/"` vitest started in `src/`, found no tests, and reported a
 * "measured" 0%. The runner must start where its config and tests live; the
 * caller scopes the result to the target afterwards.
 *
 * `ranTests` is true when the runner exited cleanly or produced a report. A
 * failing test run still writes coverage, so the report is checked either way.
 */
async function runJsCoverage(
  projectRoot: string
): Promise<{ ranTests: boolean; data: CoverageData | null }> {
  // Running the project's test suite executes code from the analyzed repository
  // (the tests themselves, plus npm lifecycle scripts via npx). Honor the
  // opt-out before doing that.
  if (isCoverageExecDisabled()) return { ranTests: false, data: null };

  const reportDir = mkdtempSync(path.join(os.tmpdir(), 'aqe-js-cov-'));
  try {
    const { execSync } = await import('child_process');
    const coverageCmd = await buildJsCoverageCommand(projectRoot, reportDir);

    let exitedCleanly = false;
    try {
      execSync(coverageCmd, {
        cwd: projectRoot,
        timeout: 120000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024,
      });
      exitedCleanly = true;
    } catch {
      // Test runner failed, timed out, or is not available. A failing suite
      // still writes coverage — check the report below.
    }

    const data = await loadCoverageReportFile(path.join(reportDir, 'coverage-final.json'));
    return { ranTests: exitedCleanly || data !== null, data };
  } finally {
    try { rmSync(reportDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

/**
 * Narrow an instrumented report to production files only, recomputing the
 * aggregate from what survives.
 *
 * Returns `null` when the report contains no production files at all — the
 * caller must NOT fall back to the unfiltered set, because that reports the test
 * files' own coverage as the project's (#569's third contradiction).
 */
function productionOnly(
  report: { files: CoverageData['files']; summary: CoverageData['summary'] },
  targetPath: string
): CollectedCoverage | null {
  const files = report.files.filter(f => !isTestPath(f.path, targetPath));
  if (files.length === 0) return null;

  // Recompute rather than carrying the original summary: it was computed over
  // the unfiltered set, so keeping it would blend test-file coverage into the
  // production headline figure.
  const sum = (pick: (f: CoverageData['files'][number]) => number) =>
    files.reduce((acc, f) => acc + pick(f), 0);
  const pct = (covered: number, total: number) =>
    total > 0 ? Math.round((covered / total) * 100) : 0;

  const totalLines = sum(f => f.lines.total);
  const coveredLines = sum(f => f.lines.covered);
  const branchDataCollected = files.some(f => f.branches.total > 0);
  const functionDataCollected = files.some(f => f.functions.total > 0);

  return {
    data: {
      files,
      summary: {
        line: pct(coveredLines, totalLines),
        branch: pct(sum(f => f.branches.covered), sum(f => f.branches.total)),
        function: pct(sum(f => f.functions.covered), sum(f => f.functions.total)),
        statement: pct(coveredLines, totalLines),
        files: files.length,
      },
    },
    provenance: {
      method: 'instrumented-report',
      estimated: false,
      branchDataCollected,
      functionDataCollected,
      notes: [],
    },
  };
}

/** Why a result carries no coverage figures. */
type NoDataReason =
  /** The report lists only test files. */
  | 'test-only-report'
  /** The report/run has no entries for the target (#995). */
  | 'target-not-covered'
  /** The run executed no code at all — nothing was measured (#995). */
  | 'nothing-executed'
  /** A coverage report file was given as the target but could not be parsed. */
  | 'unreadable-report';

interface CollectResult {
  collected: CollectedCoverage | null;
  ranTests: boolean;
  noData?: NoDataReason;
  /** The directory coverage tooling runs from and report paths resolve against. */
  projectRoot: string;
}

/**
 * Turn a project-wide instrumented report into the result for `target`:
 * production files only, scoped to the target, and never a fake 0%.
 */
function fromInstrumentedReport(
  report: CoverageData,
  projectRoot: string,
  target: string
): Pick<CollectResult, 'collected' | 'noData'> {
  // #995(d): a report in which nothing executed is not a 0% measurement.
  if (!hasExecutedCode(report.files)) return { collected: null, noData: 'nothing-executed' };

  // #995(a): a project-wide report answers for the whole project; the caller
  // asked about `target`. A report with no entries under it did not measure it.
  const scoped = scopeCoverageToTarget(report, projectRoot, target);
  if (scoped.length === 0) return { collected: null, noData: 'target-not-covered' };

  // A report whose only entries are test files yields NO production coverage.
  // Falling back to the unfiltered set here would report the test files'
  // own coverage as the project's — recreating #569's third contradiction
  // (`tests/verifier_matrix.rs` analysed at 79.2% as if it were a target).
  const production = productionOnly({ files: scoped, summary: report.summary }, projectRoot);
  if (!production) return { collected: null, noData: 'test-only-report' };
  return { collected: production };
}

/**
 * Collect coverage for a target, preferring real measurement over estimation
 * and always reporting which one happened (#569).
 *
 * The target may be the project root, a subfolder or file inside it, or an
 * existing coverage report (#995). Tooling always runs from the project root
 * (the nearest package.json / pyproject / Cargo.toml / .git above the target)
 * and the result is scoped back down to the target.
 *
 * Cascade:
 *   0. the target IS a coverage report — parse it, run nothing
 *   1. an instrumented report already on disk at the project root
 *   2. language-specific instrumentation we can run — `cargo llvm-cov` for Rust,
 *      the project's test runner for JS/TS — writing to a temp dir
 *   3. static estimation, explicitly labelled `estimated: true`
 */
async function collectCoverage(targetPath: string): Promise<CollectResult> {
  const target = path.resolve(targetPath);
  let targetIsFile = false;
  try { targetIsFile = statSync(target).isFile(); } catch { /* missing — handled below */ }

  // #995(c): an existing coverage report passed as the target.
  if (targetIsFile && isCoverageReportFile(target)) {
    const reportDir = path.dirname(target);
    const projectRoot = findCoverageProjectRoot(reportDir)
      ?? (path.basename(reportDir) === 'coverage' ? path.dirname(reportDir) : reportDir);
    const report = await loadCoverageReportFile(target);
    if (!report) return { collected: null, ranTests: false, noData: 'unreadable-report', projectRoot };
    // The report itself is the subject: analyse all of it, relative to its project.
    return { ...fromInstrumentedReport(report, projectRoot, projectRoot), ranTests: false, projectRoot };
  }

  const projectRoot = findCoverageProjectRoot(target) ?? target;

  const existing = await loadCoverageData(projectRoot);
  if (existing) {
    return { ...fromInstrumentedReport(existing, projectRoot, target), ranTests: false, projectRoot };
  }

  // #569 work item 1: delegate to real instrumentation where available.
  const rustProject = isRustProject(target);
  if (rustProject) {
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

  const run = await runJsCoverage(projectRoot);
  if (run.data) {
    return { ...fromInstrumentedReport(run.data, projectRoot, target), ranTests: run.ranTests, projectRoot };
  }

  return { collected: buildEstimatedCoverage(target), ranTests: run.ranTests, projectRoot };
}

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

/** Caller-facing explanation for a result with no coverage figures. */
function noDataWarning(
  reason: NoDataReason | undefined,
  ranTests: boolean,
  targetPath: string,
  projectRoot: string
): string {
  switch (reason) {
    case 'test-only-report':
      return 'The coverage report contains only test files, so there is no production ' +
        'coverage to report. Coverage OF a test file is not a meaningful metric. ' +
        'Check that your coverage tool is instrumenting your source directory.';
    case 'target-not-covered':
      return `Target is UNMEASURED: the coverage data for project ${projectRoot} did not cover ` +
        `any production file under ${targetPath}. This is not 0% coverage — no measurement ` +
        "exists for it. Check your coverage tool's include/exclude settings, or regenerate the report.";
    case 'nothing-executed':
      return 'Target is UNMEASURED: the coverage run executed no code (no tests were found or ' +
        `none ran from ${projectRoot}). This is not 0% coverage. Check that your tests run ` +
        'from the project root.';
    case 'unreadable-report':
      return `The coverage report ${targetPath} could not be parsed or lists no files. Supported: ` +
        'lcov.info, coverage-final.json, coverage-summary.json, Cobertura XML.';
    default:
      return ranTests
        ? 'Tests ran but no coverage output was generated. Ensure a coverage provider is configured (e.g., @vitest/coverage-v8, istanbul).'
        : 'No coverage data found and could not run tests automatically. ' + estimationGuidance(targetPath);
  }
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

      const { collected, ranTests, noData, projectRoot } = await collectCoverage(targetPath);

      if (!collected) {
        const unmeasured = noData === 'target-not-covered' || noData === 'nothing-executed';
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

      const warnings = [...provenance.notes];
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
