/**
 * Coverage analysis task handlers.
 *
 * Extracted from task-executor.ts registerHandlers().
 * Covers: analyze-coverage
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ok, err } from '../../shared/types';
import { toError } from '../../shared/error-utils.js';
import { safeJsonParse } from '../../shared/safe-json.js';
import type { TaskHandlerContext } from './handler-types';
import { loadCoverageData } from './handler-utils';
import {
  buildEstimatedCoverage,
  collectRustCoverage,
  isRustProject,
  isTestPath,
  type CollectedCoverage,
} from './coverage-collection';

/**
 * Try to produce a JS/TS coverage report by running the project's test runner.
 * Returns true if the runner completed (which does not guarantee a report was
 * written — the caller re-checks disk).
 */
async function tryRunJsCoverage(targetPath: string): Promise<boolean> {
  try {
    const { execSync } = await import('child_process');
    let coverageCmd = 'npx vitest run --coverage --reporter=json 2>/dev/null';
    try {
      const pkgContent = await fs.readFile(path.join(targetPath, 'package.json'), 'utf-8');
      const pkg = safeJsonParse<Record<string, unknown>>(pkgContent);
      const deps = {
        ...(pkg.devDependencies as Record<string, string> || {}),
        ...(pkg.dependencies as Record<string, string> || {}),
      };
      if (deps['jest'] || deps['@jest/core']) {
        coverageCmd = 'npx jest --coverage --json 2>/dev/null';
      } else if (deps['mocha'] || deps['nyc']) {
        coverageCmd = 'npx nyc mocha 2>/dev/null';
      }
      // vitest is the default — covers vitest, @vitest/coverage-v8, etc.
    } catch {
      // No package.json — use default vitest
    }

    execSync(coverageCmd, {
      cwd: targetPath,
      timeout: 120000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    // Test runner failed or not available.
    return false;
  }
}

/**
 * Collect coverage for a target, preferring real measurement over estimation
 * and always reporting which one happened (#569).
 *
 * Cascade:
 *   1. an instrumented report already on disk (istanbul/lcov/cobertura)
 *   2. language-specific instrumentation we can run — `cargo llvm-cov` for Rust,
 *      the project's test runner for JS/TS
 *   3. static estimation, explicitly labelled `estimated: true`
 */
async function collectCoverage(
  targetPath: string
): Promise<{ collected: CollectedCoverage | null; ranTests: boolean }> {
  const existing = await loadCoverageData(targetPath);
  if (existing) {
    const productionFiles = existing.files.filter(f => !isTestPath(f.path, targetPath));
    const files = productionFiles.length > 0 ? productionFiles : existing.files;
    return {
      collected: {
        data: { ...existing, files, summary: { ...existing.summary, files: files.length } },
        provenance: {
          method: 'instrumented-report',
          estimated: false,
          branchDataCollected: files.some(f => f.branches.total > 0),
          functionDataCollected: files.some(f => f.functions.total > 0),
          notes: [],
        },
      },
      ranTests: false,
    };
  }

  // #569 work item 1: delegate to real instrumentation where available.
  if (isRustProject(targetPath)) {
    const rust = await collectRustCoverage(targetPath);
    if (rust) return { collected: rust, ranTests: true };
  }

  const ranTests = await tryRunJsCoverage(targetPath);
  const afterRun = await loadCoverageData(targetPath);
  if (afterRun) {
    const productionFiles = afterRun.files.filter(f => !isTestPath(f.path, targetPath));
    const files = productionFiles.length > 0 ? productionFiles : afterRun.files;
    return {
      collected: {
        data: { ...afterRun, files, summary: { ...afterRun.summary, files: files.length } },
        provenance: {
          method: 'instrumented-report',
          estimated: false,
          branchDataCollected: files.some(f => f.branches.total > 0),
          functionDataCollected: files.some(f => f.functions.total > 0),
          notes: [],
        },
      },
      ranTests,
    };
  }

  return { collected: buildEstimatedCoverage(targetPath), ranTests };
}

/**
 * Build the guidance string shown when a result is an estimate rather than a
 * measurement, tailored to what the target actually is.
 */
function estimationGuidance(targetPath: string): string {
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

      const { collected, ranTests } = await collectCoverage(targetPath);

      if (!collected) {
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
          algorithm: 'sublinear-O(log n)',
          warning: ranTests
            ? 'Tests ran but no coverage output was generated. Ensure a coverage provider is configured (e.g., @vitest/coverage-v8, istanbul).'
            : 'No coverage data found and could not run tests automatically. ' + estimationGuidance(targetPath),
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
