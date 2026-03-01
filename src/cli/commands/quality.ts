/**
 * Agentic QE v3 - Quality Command
 *
 * Provides quality assessment shortcuts.
 * Supports --format and --output for CI/CD pipeline integration.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import type { CLIContext } from '../handlers/interfaces.js';
import { type OutputFormat, type QualityGateResult, writeOutput, toJSON, qualityGateToMarkdown } from '../utils/ci-output.js';

export function createQualityCommand(
  context: CLIContext,
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>
): Command {
  const qualityCmd = new Command('quality')
    .description('Quality assessment shortcut')
    .option('--gate', 'Run quality gate evaluation')
    .option('-F, --format <format>', 'Output format (text|json|markdown)', 'text')
    .option('-o, --output <path>', 'Write output to file')
    .action(async (options) => {
      if (!await ensureInitialized()) return;

      try {
        const format = options.format as OutputFormat;

        // Always use inline mode — --gate flag is kept for backwards compatibility
        {
          // Quality gate mode: call domain API directly for synchronous pass/fail
          if (format === 'text') {
            console.log(chalk.blue(`\n Running quality gate evaluation...\n`));
          }

          const qualityAPI = await context.kernel!.getDomainAPIAsync!<{
            evaluateGate(request: { gateName?: string; metrics?: Record<string, number>; thresholds?: Record<string, { min?: number; max?: number }> }): Promise<{ success: boolean; value?: unknown; error?: Error }>;
          }>('quality-assessment');

          if (!qualityAPI) {
            console.log(chalk.red('Quality assessment domain not available'));
            await cleanupAndExit(1);
          }

          // Provide default metrics when user doesn't supply explicit values.
          // The gate service requires metrics + thresholds to evaluate.
          const defaultMetrics = {
            coverage: 0,
            testsPassing: 0,
            criticalBugs: 0,
            codeSmells: 0,
            securityVulnerabilities: 0,
            technicalDebt: 0,
            duplications: 0,
          };
          const defaultThresholds = {
            coverage: { min: 80 },
            testsPassing: { min: 95 },
            criticalBugs: { max: 0 },
            codeSmells: { max: 20 },
            securityVulnerabilities: { max: 0 },
            technicalDebt: { max: 5 },
            duplications: { max: 5 },
          };
          const result = await qualityAPI!.evaluateGate({
            gateName: 'standard',
            metrics: defaultMetrics,
            thresholds: defaultThresholds,
          });

          if (result.success && result.value) {
            const assessment = result.value as {
              passed?: boolean;
              score?: string;
              grade?: string;
              checks?: Array<{ name: string; passed: boolean; value: number | string; threshold: number | string }>;
              recommendations?: string[];
              meetsThreshold?: boolean;
              summary?: { line: number; branch: number; function: number; statement: number };
            };

            const gateResult: QualityGateResult = {
              passed: assessment.passed ?? assessment.meetsThreshold ?? true,
              score: assessment.score ?? assessment.grade ?? 'N/A',
              checks: assessment.checks || [],
              recommendations: assessment.recommendations || [],
            };

            if (format === 'json') {
              writeOutput(toJSON(gateResult), options.output);
            } else if (format === 'markdown') {
              writeOutput(qualityGateToMarkdown(gateResult), options.output);
            } else {
              // Text output
              const statusIcon = gateResult.passed ? chalk.green('✓ PASSED') : chalk.red('✗ FAILED');
              console.log(`  Quality Gate: ${statusIcon}`);
              console.log(`  Score: ${chalk.cyan(gateResult.score)}\n`);

              if (gateResult.checks.length > 0) {
                console.log(chalk.cyan('  Checks:'));
                for (const check of gateResult.checks) {
                  const icon = check.passed ? chalk.green('✓') : chalk.red('✗');
                  console.log(`    ${icon} ${check.name}: ${check.value} (threshold: ${check.threshold})`);
                }
              }

              if (gateResult.recommendations && gateResult.recommendations.length > 0) {
                console.log(chalk.cyan('\n  Recommendations:'));
                for (const rec of gateResult.recommendations) {
                  console.log(chalk.gray(`    - ${rec}`));
                }
              }
              console.log('');
            }

            // Exit codes: 1 = gate failed, 2 = warning (score within 5% of threshold), 0 = passed
            if (!gateResult.passed) {
              await cleanupAndExit(1);
            }
            const scoreNum = parseFloat(String(gateResult.score));
            if (!isNaN(scoreNum) && scoreNum < 100 && scoreNum >= 95) {
              // Score is within 5% of perfect — warn
              await cleanupAndExit(2);
            }
            await cleanupAndExit(0);
          } else {
            console.log(chalk.red(`Quality gate failed: ${result.error?.message || 'Unknown error'}`));
            await cleanupAndExit(1);
          }

        }

      } catch (error) {
        console.error(chalk.red('\nFailed:'), error);
        await cleanupAndExit(1);
      }
    });

  return qualityCmd;
}
