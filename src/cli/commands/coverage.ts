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
import * as path from 'path';
import { buildCoverageData, summarizeCoverage, type CoverageData } from '../utils/coverage-data.js';
import {
  describeNoData,
  isUnmeasured,
  resolveExistingCoverage,
  thresholdVerdict,
  type NoDataReason,
} from '../../coordination/handlers/coverage-target.js';

/** Which optional metrics an instrumented report actually carries. */
function metricsCollected(data: CoverageData): { branch: boolean; function: boolean } {
  if (!data.instrumented) return { branch: true, function: true }; // labelled heuristic estimate
  return {
    branch: data.files.some(f => f.branches.total > 0),
    function: data.files.some(f => f.functions.total > 0),
  };
}

/** `aqe coverage` exit code when the target has no coverage measurement (#995). */
export const EXIT_UNMEASURED = 3;

export type CliCoverage =
  | { kind: 'data'; data: CoverageData }
  | { kind: 'no-data'; reason: NoDataReason; message: string }
  | { kind: 'no-sources' };

/**
 * Resolve the coverage data for a CLI target (#995).
 *
 * Uses the SAME resolution and verdict as the MCP `coverage_analyze_sublinear`
 * handler (`resolveExistingCoverage`), so CLI and MCP cannot disagree about
 * what a report says for a target:
 *   - a coverage report file (lcov.info, coverage-final.json, ...) is parsed
 *     directly;
 *   - a directory or source file is scoped against the instrumented report of
 *     its PROJECT ROOT (nearest package.json/.git above it), not the cwd;
 *   - with no report at the project root, the CLI falls back to its labelled
 *     heuristic estimate (the CLI never runs the test suite).
 */
export async function resolveCliCoverageData(targetPath: string): Promise<CliCoverage> {
  const existing = await resolveExistingCoverage(targetPath);
  if (existing.status === 'target-missing') {
    return { kind: 'no-data', reason: 'target-missing', message: describeNoData('target-missing', targetPath, null) };
  }
  if (existing.status === 'evaluated') {
    const { evaluation, projectRoot } = existing;
    if (evaluation.status === 'measured') {
      const files = evaluation.files;
      return { kind: 'data', data: { files, summary: summarizeCoverage(files), instrumented: true } };
    }
    return { kind: 'no-data', reason: evaluation.reason, message: describeNoData(evaluation.reason, targetPath, projectRoot) };
  }

  const sourceFiles = walkSourceFiles(existing.target, { includeTests: false });
  if (sourceFiles.length === 0) return { kind: 'no-sources' };
  console.log(chalk.gray(`  Analyzing ${sourceFiles.length} files...\n`));
  return { kind: 'data', data: buildCoverageData(sourceFiles, existing.projectRoot) };
}

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
    .addHelpText('after', `
Target: a directory, a source file, or an existing coverage report
(lcov.info, coverage-final.json, coverage-summary.json, Cobertura XML).
Reports are read from the target's project root (nearest package.json / .git).

Exit codes:
  0  coverage meets the threshold (by more than 5%)
  1  coverage below the threshold, or an error (missing target, unreadable report)
  2  coverage within 5% above the threshold
  ${EXIT_UNMEASURED}  UNMEASURED: no coverage measurement exists for the target
     (not in the report, the runner ran 0 tests, or only test files were reported)`)
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

      // #995 review NB3: with a machine-readable format, stdout carries ONLY the
      // document. Progress lines (ours, and anything printed while the fleet
      // initializes) go to stderr; the real console.log is restored to emit.
      const machineFormat = (options.format as OutputFormat) !== 'text';
      const stdoutLog = console.log;
      if (machineFormat) console.log = (...args: unknown[]) => console.error(...args);
      const emit = (content: string): void => {
        console.log = stdoutLog;
        writeOutput(content, options.output);
      };

      try {
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

        const targetPath = path.resolve(analyzeTarget);

        // Fix #280: shared file discovery supporting all languages.
        // #995: coverage files as targets; reports resolved from the project root.
        const resolved = await resolveCliCoverageData(targetPath);

        if (resolved.kind === 'no-sources') {
          console.log(chalk.yellow('No source files found'));
          return;
        }

        if (resolved.kind === 'no-data') {
          // Errors (missing target, unreadable report) exit 1. Everything else
          // means "no measurement exists" — distinct exit code, never "0%".
          const isError = resolved.reason === 'target-missing' || resolved.reason === 'unreadable-report';
          if ((options.format as OutputFormat) === 'json') {
            // Same shape as a normal result, with nulls (#995 review N4).
            emit(toJSON({
              summary: { line: null, branch: null, function: null, statement: null },
              meetsThreshold: null,
              threshold,
              measured: false,
              unmeasured: isUnmeasured(resolved.reason),
              reason: resolved.reason,
              target: targetPath,
              warning: resolved.message,
            }));
          } else {
            console.log((isError ? chalk.red : chalk.yellow)(`  ${resolved.message}\n`));
          }
          await cleanupAndExit(isError ? 1 : EXIT_UNMEASURED);
          return;
        }

        const coverageData = resolved.data;

        if (coverageData.instrumented) {
          console.log(chalk.green('  Using instrumented coverage data (V8/istanbul)\n'));
          if (coverageData.unmeasuredFiles?.length) {
            console.log(chalk.yellow(`  ${coverageData.unmeasuredFiles.length} file(s) not in the coverage report — UNMEASURED, excluded from the figures\n`));
          }
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
        let overallCoverage = 0;

        if (result.success && result.value) {
          const report = result.value as { summary: { line: number; branch: number; function: number; statement: number }; meetsThreshold: boolean; recommendations: string[] };

          // #995 review NB5: a metric the report never collected is null — not
          // 0 — and is left out of the threshold verdict (same rule as MCP).
          const collected = metricsCollected(coverageData);
          const verdict = thresholdVerdict(report.summary, threshold, collected);
          const summary = {
            ...report.summary,
            branch: collected.branch ? report.summary.branch : null,
            function: collected.function ? report.summary.function : null,
          };
          const recommendations = report.recommendations.filter(rec =>
            (collected.branch || !/branch coverage/i.test(rec)) &&
            (collected.function || !/function coverage/i.test(rec)));
          overallCoverage = verdict.overall;

          // For non-text formats, collect all data and output at end
          coverageResult = {
            summary: summary as CoverageResult['summary'],
            meetsThreshold: verdict.meetsThreshold,
            threshold,
            recommendations,
          };

          if (format === 'text') {
            const fmt = (v: number | null) => v === null ? 'n/a (not collected)' : v.toFixed(1) + '%';
            const color = (v: number | null) => v === null ? chalk.gray : getColorForPercent(v);
            console.log(chalk.cyan('  Coverage Summary:'));
            console.log(`    Lines:      ${color(summary.line)(fmt(summary.line))}`);
            console.log(`    Branches:   ${color(summary.branch)(fmt(summary.branch))}`);
            console.log(`    Functions:  ${color(summary.function)(fmt(summary.function))}`);
            console.log(`    Statements: ${color(summary.statement)(fmt(summary.statement))}`);
            console.log(`\n    Threshold: ${verdict.meetsThreshold ? chalk.green(`Met (${threshold}%)`) : chalk.red(`Not met (${threshold}%)`)}`);

            if (recommendations.length > 0) {
              console.log(chalk.cyan('\n  Recommendations:'));
              for (const rec of recommendations) {
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
          emit(toJSON(coverageResult));
        } else if (coverageResult && format === 'markdown') {
          emit(coverageToMarkdown(coverageResult));
        } else if (format === 'text') {
          console.log(chalk.green('\n Coverage analysis complete\n'));
        }

        // Exit codes: 1 = below threshold, 2 = within 5% of threshold, 0 = above threshold
        if (coverageResult && !coverageResult.meetsThreshold) {
          await cleanupAndExit(1);
        }
        if (coverageResult) {
          const avg = overallCoverage;
          if (avg < threshold + 5 && avg >= threshold) {
            await cleanupAndExit(2);
          }
        }
        await cleanupAndExit(0);

      } catch (error) {
        console.error(chalk.red('\nFailed:'), error);
        await cleanupAndExit(1);
      }
      } finally {
        console.log = stdoutLog;
      }
    });

  // Subcommand: coverage gaps — enumerate unhandled branches via static analysis
  coverageCmd
    .command('gaps')
    .description('Enumerate unhandled branches in source files')
    .argument('<file>', 'Source file to analyze')
    .option('--mechanical', 'Exhaustive mode: report all branches without filtering')
    .option('--json', 'Output as JSON')
    .option('--markdown', 'Output as markdown report')
    .action(async (file: string, options: { mechanical?: boolean; json?: boolean; markdown?: boolean }) => {
      try {
        const { readFileSync, existsSync } = await import('fs');
        const pathMod = await import('path');
        const { enumerateBranches, formatBranchReport, formatBranchJSON } = await import('../../analysis/branch-enumerator.js');

        const resolvedFile = pathMod.resolve(file);
        if (!existsSync(resolvedFile)) {
          console.error(chalk.red(`\n  File not found: ${resolvedFile}\n`));
          await cleanupAndExit(1);
        }

        const sourceCode = readFileSync(resolvedFile, 'utf-8');
        const result = enumerateBranches(sourceCode, resolvedFile);

        if (options.json) {
          console.log(formatBranchJSON(result));
        } else if (options.markdown) {
          console.log(formatBranchReport(result));
        } else {
          // Table format
          console.log(`\n${chalk.cyan('Branch Enumeration:')} ${chalk.white(file)}`);
          console.log(chalk.gray(`Found ${result.unhandledCount} unhandled branches (${result.duration}ms)\n`));
          if (result.branches.length > 0) {
            console.log(chalk.dim('Line | Severity | Construct                 | Trigger'));
            console.log(chalk.dim('-----|----------|---------------------------|--------'));
            for (const b of result.branches) {
              const severityColor = b.severity === 'high' ? chalk.red : b.severity === 'medium' ? chalk.yellow : chalk.gray;
              console.log(
                `${String(b.line).padStart(4)} | ${severityColor(b.severity.padEnd(8))} | ${b.construct.padEnd(25)} | ${b.triggerCondition}`
              );
            }
          } else {
            console.log(chalk.green('No unhandled branches detected.'));
          }
          console.log('');
        }

        await cleanupAndExit(0);
      } catch (error) {
        console.error(chalk.red('\nBranch enumeration failed:'), error);
        await cleanupAndExit(1);
      }
    });

  return coverageCmd;
}
