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

      // Try to find and read actual coverage files
      let coverageData = await loadCoverageData(targetPath);

      if (!coverageData) {
        // No coverage data found — attempt to collect it by running tests with coverage
        let collected = false;
        try {
          const { execSync } = await import('child_process');
          // Detect test runner from package.json
          let coverageCmd = 'npx vitest run --coverage --reporter=json 2>/dev/null';
          try {
            const pkgContent = await fs.readFile(path.join(targetPath, 'package.json'), 'utf-8');
            const pkg = safeJsonParse<Record<string, unknown>>(pkgContent);
            const deps = { ...(pkg.devDependencies as Record<string, string> || {}), ...(pkg.dependencies as Record<string, string> || {}) };
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
          collected = true;
        } catch {
          // Test runner failed or not available — that's OK, we'll check for output anyway
        }

        // Re-check for coverage data after collection attempt
        coverageData = await loadCoverageData(targetPath);

        if (!coverageData) {
          return ok({
            lineCoverage: 0,
            branchCoverage: 0,
            functionCoverage: 0,
            statementCoverage: 0,
            totalFiles: 0,
            coverageByFile: [],
            gaps: [],
            algorithm: 'sublinear-O(log n)',
            warning: collected
              ? 'Tests ran but no coverage output was generated. Ensure a coverage provider is configured (e.g., @vitest/coverage-v8, istanbul).'
              : 'No coverage data found and could not run tests automatically. Run: npm test -- --coverage',
          });
        }
      }

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
      let gaps: Array<{ file: string; lines: number[]; risk: string }> = [];
      if (payload.detectGaps) {
        const gapsResult = await analyzer.findGaps(coverageData, threshold);
        if (gapsResult.success) {
          gaps = gapsResult.value.gaps.map(gap => ({
            file: gap.file,
            lines: gap.lines,
            risk: gap.severity,
          }));
        }
      }

      return ok({
        lineCoverage: Math.round(report.summary.line * 10) / 10,
        branchCoverage: Math.round(report.summary.branch * 10) / 10,
        functionCoverage: Math.round(report.summary.function * 10) / 10,
        statementCoverage: Math.round(report.summary.statement * 10) / 10,
        totalFiles: report.summary.files,
        coverageByFile: coverageData.files.map(f => ({
          file: f.path,
          lineCoverage: f.lines.total > 0 ? Math.round((f.lines.covered / f.lines.total) * 1000) / 10 : 0,
          branchCoverage: f.branches.total > 0 ? Math.round((f.branches.covered / f.branches.total) * 1000) / 10 : 0,
          functionCoverage: f.functions.total > 0 ? Math.round((f.functions.covered / f.functions.total) * 1000) / 10 : 0,
        })),
        gaps,
        meetsThreshold: report.meetsThreshold,
        delta: report.delta,
        recommendations: report.recommendations,
        algorithm: 'sublinear-O(log n)',
      });
    } catch (error) {
      return err(toError(error));
    }
  });
}
