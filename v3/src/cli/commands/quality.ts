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

        if (options.gate) {
          // Quality gate mode: call domain API directly for synchronous pass/fail
          console.log(chalk.blue(`\n Running quality gate evaluation...\n`));

          const qualityAPI = await context.kernel!.getDomainAPIAsync!<{
            evaluate(request: { metrics?: Record<string, number>; runGate?: boolean; thresholds?: Record<string, number>; includeAdvice?: boolean }): Promise<{ success: boolean; value?: unknown; error?: Error }>;
          }>('quality-assessment');

          if (!qualityAPI) {
            console.log(chalk.red('Quality assessment domain not available'));
            await cleanupAndExit(1);
          }

          const result = await qualityAPI!.evaluate({
            runGate: true,
            includeAdvice: true,
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

            // Exit with appropriate code for CI
            await cleanupAndExit(gateResult.passed ? 0 : 1);
          } else {
            console.log(chalk.red(`Quality gate failed: ${result.error?.message || 'Unknown error'}`));
            await cleanupAndExit(1);
          }

        } else {
          // Non-gate mode: submit async task (original behavior)
          console.log(chalk.blue(`\n Running quality assessment...\n`));

          const result = await context.queen!.submitTask({
            type: 'assess-quality',
            priority: 'p0',
            targetDomains: ['quality-assessment'],
            payload: { runGate: false },
            timeout: 300000,
          });

          if (result.success) {
            if (format === 'json') {
              writeOutput(toJSON({ taskId: result.value, status: 'submitted' }), options.output);
            } else {
              console.log(chalk.green(`Task submitted: ${result.value}`));
              console.log(chalk.gray(`   Use 'aqe task status ${result.value}' to check progress`));
            }
          } else {
            console.log(chalk.red(`Failed: ${result.error.message}`));
            await cleanupAndExit(1);
          }

          console.log('');
        }

      } catch (error) {
        console.error(chalk.red('\nFailed:'), error);
        await cleanupAndExit(1);
      }
    });

  return qualityCmd;
}
