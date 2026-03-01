/**
 * Agentic QE v3 - Coverage Command
 *
 * Provides coverage analysis shortcuts.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import type { CLIContext } from '../handlers/interfaces.js';
import { runCoverageAnalysisWizard, type CoverageWizardResult } from '../wizards/coverage-wizard.js';
import { walkSourceFiles } from '../utils/file-discovery.js';
import { type OutputFormat, type CoverageResult, writeOutput, toJSON, coverageToMarkdown } from '../utils/ci-output.js';
import { buildCoverageData } from '../utils/coverage-data.js';

function getColorForPercent(percent: number): (str: string) => string {
  if (percent >= 80) return chalk.green;
  if (percent >= 50) return chalk.yellow;
  return chalk.red;
}

export function createCoverageCommand(
  context: CLIContext,
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>
): Command {
  const coverageCmd = new Command('coverage')
    .description('Coverage analysis shortcut')
    .argument('[target]', 'Target file or directory', '.')
    .option('--risk', 'Include risk scoring')
    .option('--gaps', 'Detect coverage gaps')
    .option('--threshold <percent>', 'Coverage threshold percentage', '80')
    .option('--sensitivity <level>', 'Gap detection sensitivity (low|medium|high)', 'medium')
    .option('--wizard', 'Run interactive coverage analysis wizard')
    .option('--ghost', 'Include ghost intent coverage analysis (detect untested behavioral intents)')
    .option('-F, --format <format>', 'Output format (text|json|markdown)', 'text')
    .option('-o, --output <path>', 'Write output to file')
    .action(async (target: string, options) => {
      let analyzeTarget = target;
      let includeRisk = options.risk;
      let detectGaps = options.gaps;
      let threshold = parseInt(options.threshold, 10);

      // Run wizard if requested
      if (options.wizard) {
        try {
          const wizardResult: CoverageWizardResult = await runCoverageAnalysisWizard({
            defaultTarget: target !== '.' ? target : undefined,
            defaultThreshold: options.threshold !== '80' ? parseInt(options.threshold, 10) : undefined,
            defaultRiskScoring: options.risk,
            defaultSensitivity: options.sensitivity !== 'medium' ? options.sensitivity : undefined,
          });

          if (wizardResult.cancelled) {
            console.log(chalk.yellow('\n  Coverage analysis cancelled.\n'));
            await cleanupAndExit(0);
          }

          analyzeTarget = wizardResult.target;
          includeRisk = wizardResult.riskScoring;
          detectGaps = true;
          threshold = wizardResult.threshold;

          console.log(chalk.green('\n  Starting coverage analysis...\n'));
        } catch (err) {
          console.error(chalk.red('\n  Wizard error:'), err);
          await cleanupAndExit(1);
        }
      }

      if (!await ensureInitialized()) return;

      try {
        console.log(chalk.blue(`\n  Analyzing coverage for ${analyzeTarget}...\n`));

        const coverageAPI = await context.kernel!.getDomainAPIAsync!<{
          analyze(request: { coverageData: { files: Array<{ path: string; lines: { covered: number; total: number }; branches: { covered: number; total: number }; functions: { covered: number; total: number }; statements: { covered: number; total: number }; uncoveredLines: number[]; uncoveredBranches: number[] }>; summary: { line: number; branch: number; function: number; statement: number; files: number } }; threshold?: number; includeFileDetails?: boolean }): Promise<{ success: boolean; value?: unknown; error?: Error }>;
          detectGaps(request: { coverageData: { files: Array<{ path: string; lines: { covered: number; total: number }; branches: { covered: number; total: number }; functions: { covered: number; total: number }; statements: { covered: number; total: number }; uncoveredLines: number[]; uncoveredBranches: number[] }>; summary: { line: number; branch: number; function: number; statement: number; files: number } }; minCoverage?: number; prioritize?: string }): Promise<{ success: boolean; value?: unknown; error?: Error }>;
          calculateRisk(request: { file: string; uncoveredLines: number[] }): Promise<{ success: boolean; value?: unknown; error?: Error }>;
          analyzeGhostCoverage(existingTests: string[], codeContext: string): Promise<{ success: boolean; value?: { gaps: Array<{ id: string; category: string; description: string; confidence: number; severity: string; suggestedTest: string }>; totalGhostScore: number; coverageCompleteness: number; computedAt: Date }; error?: Error }>;
        }>('coverage-analysis');

        if (!coverageAPI) {
          console.log(chalk.red('Coverage analysis domain not available'));
          return;
        }

        const path = await import('path');
        const targetPath = path.resolve(analyzeTarget);

        // Fix #280: Use shared file discovery supporting all languages
        const sourceFiles = walkSourceFiles(targetPath, { includeTests: false });

        if (sourceFiles.length === 0) {
          console.log(chalk.yellow('No source files found'));
          return;
        }

        console.log(chalk.gray(`  Analyzing ${sourceFiles.length} files...\n`));

        // Build coverage data from real V8/istanbul output or deterministic estimation
        const coverageData = buildCoverageData(sourceFiles);

        if (coverageData.instrumented) {
          console.log(chalk.green('  Using instrumented coverage data (V8/istanbul)\n'));
        } else {
          console.log(chalk.yellow('  No instrumented coverage found — using heuristic estimation'));
          console.log(chalk.gray('  Run tests with coverage first: npm test -- --coverage\n'));
        }

        const result = await coverageAPI.analyze({
          coverageData,
          threshold,
          includeFileDetails: true,
        });

        const format = options.format as OutputFormat;
        let coverageResult: CoverageResult | undefined;

        if (result.success && result.value) {
          const report = result.value as { summary: { line: number; branch: number; function: number; statement: number }; meetsThreshold: boolean; recommendations: string[] };

          // For non-text formats, collect all data and output at end
          coverageResult = {
            summary: report.summary,
            meetsThreshold: report.meetsThreshold,
            threshold,
            recommendations: report.recommendations,
          };

          if (format === 'text') {
            const fmt = (v: number) => typeof v === 'number' ? v.toFixed(1) : v;
            console.log(chalk.cyan('  Coverage Summary:'));
            console.log(`    Lines:      ${getColorForPercent(report.summary.line)(fmt(report.summary.line) + '%')}`);
            console.log(`    Branches:   ${getColorForPercent(report.summary.branch)(fmt(report.summary.branch) + '%')}`);
            console.log(`    Functions:  ${getColorForPercent(report.summary.function)(fmt(report.summary.function) + '%')}`);
            console.log(`    Statements: ${getColorForPercent(report.summary.statement)(fmt(report.summary.statement) + '%')}`);
            console.log(`\n    Threshold: ${report.meetsThreshold ? chalk.green(`Met (${threshold}%)`) : chalk.red(`Not met (${threshold}%)`)}`);

            if (report.recommendations.length > 0) {
              console.log(chalk.cyan('\n  Recommendations:'));
              for (const rec of report.recommendations) {
                console.log(chalk.gray(`    - ${rec}`));
              }
            }
          }
        }

        // Detect gaps if requested
        if (detectGaps) {
          console.log(chalk.cyan('\n  Coverage Gaps:'));

          const gapResult = await coverageAPI.detectGaps({
            coverageData,
            minCoverage: threshold,
            prioritize: includeRisk ? 'risk' : 'size',
          });

          if (gapResult.success && gapResult.value) {
            const gaps = gapResult.value as { gaps: Array<{ file: string; lines: number[]; riskScore: number; severity: string; recommendation: string }>; totalUncoveredLines: number; estimatedEffort: number };

            if (coverageResult) coverageResult.gaps = gaps.gaps.map(g => ({
              file: g.file.replace(process.cwd() + '/', ''),
              lines: g.lines,
              riskScore: g.riskScore,
              severity: g.severity,
            }));

            console.log(chalk.gray(`    Total uncovered lines: ${gaps.totalUncoveredLines}`));
            console.log(chalk.gray(`    Estimated effort: ${gaps.estimatedEffort} hours\n`));

            for (const gap of gaps.gaps.slice(0, 8)) {
              const severityColor = gap.severity === 'high' ? chalk.red : gap.severity === 'medium' ? chalk.yellow : chalk.gray;
              const filePath = gap.file.replace(process.cwd() + '/', '');
              console.log(`    ${severityColor(`[${gap.severity}]`)} ${chalk.white(filePath)}`);
              console.log(chalk.gray(`        ${gap.lines.length} uncovered lines, Risk: ${(gap.riskScore * 100).toFixed(0)}%`));
            }
            if (gaps.gaps.length > 8) {
              console.log(chalk.gray(`    ... and ${gaps.gaps.length - 8} more gaps`));
            }
          }
        }

        // Ghost intent coverage analysis (ADR-059)
        if (options.ghost || detectGaps) {
          console.log(chalk.cyan('\n  Ghost Intent Coverage (ADR-059):'));

          try {
            const testPaths = coverageData.files.map(f => f.path);
            const ghostResult = await coverageAPI.analyzeGhostCoverage(testPaths, analyzeTarget);

            if (ghostResult.success && ghostResult.value) {
              const ghost = ghostResult.value;

              console.log(chalk.gray(`    Phantom gaps detected: ${ghost.gaps.length}`));
              console.log(chalk.gray(`    Ghost score: ${(ghost.totalGhostScore * 100).toFixed(1)}%`));
              console.log(chalk.gray(`    Coverage completeness: ${(ghost.coverageCompleteness * 100).toFixed(1)}%\n`));

              for (const gap of ghost.gaps.slice(0, 8)) {
                const severityColor = gap.severity === 'critical' ? chalk.red : gap.severity === 'high' ? chalk.red : gap.severity === 'medium' ? chalk.yellow : chalk.gray;
                console.log(`    ${severityColor(`[${gap.severity}]`)} ${chalk.white(gap.category)}`);
                console.log(chalk.gray(`        ${gap.description}`));
              }
              if (ghost.gaps.length > 8) {
                console.log(chalk.gray(`    ... and ${ghost.gaps.length - 8} more phantom gaps`));
              }
            } else {
              console.log(chalk.dim('    Ghost analysis not available (requires HNSW index)'));
            }
          } catch {
            console.log(chalk.dim('    Ghost analysis skipped (analyzer not initialized)'));
          }
        }

        // Calculate risk if requested
        if (includeRisk) {
          console.log(chalk.cyan('\n  Risk Analysis:'));

          const lowCoverageFiles = [...coverageData.files]
            .sort((a, b) => (a.lines.covered / a.lines.total) - (b.lines.covered / b.lines.total))
            .slice(0, 5);

          for (const file of lowCoverageFiles) {
            const riskResult = await coverageAPI.calculateRisk({
              file: file.path,
              uncoveredLines: file.uncoveredLines,
            });

            if (riskResult.success && riskResult.value) {
              const risk = riskResult.value as { overallRisk: number; riskLevel: string; recommendations: string[] };
              const riskColor = risk.riskLevel === 'high' ? chalk.red : risk.riskLevel === 'medium' ? chalk.yellow : chalk.green;
              const filePath = file.path.replace(process.cwd() + '/', '');
              console.log(`    ${riskColor(`[${risk.riskLevel}]`)} ${chalk.white(filePath)}`);
              console.log(chalk.gray(`        Risk: ${(risk.overallRisk * 100).toFixed(0)}%, Coverage: ${Math.round((file.lines.covered / file.lines.total) * 100)}%`));
            }
          }
        }

        // Non-text format output (collected all data)
        if (coverageResult && format === 'json') {
          writeOutput(toJSON(coverageResult), options.output);
        } else if (coverageResult && format === 'markdown') {
          writeOutput(coverageToMarkdown(coverageResult), options.output);
        } else if (format === 'text') {
          console.log(chalk.green('\n Coverage analysis complete\n'));
        }

        // Exit codes: 1 = below threshold, 2 = within 5% of threshold, 0 = above threshold
        if (coverageResult && !coverageResult.meetsThreshold) {
          await cleanupAndExit(1);
        }
        if (coverageResult) {
          const avg = (coverageResult.summary.line + coverageResult.summary.branch +
            coverageResult.summary.function + coverageResult.summary.statement) / 4;
          if (avg < threshold + 5 && avg >= threshold) {
            await cleanupAndExit(2);
          }
        }
        await cleanupAndExit(0);

      } catch (error) {
        console.error(chalk.red('\nFailed:'), error);
        await cleanupAndExit(1);
      }
    });

  return coverageCmd;
}
