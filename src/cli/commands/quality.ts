/**
 * Agentic QE v3 - Quality Command
 *
 * Provides quality assessment shortcuts.
 * Supports --format and --output for CI/CD pipeline integration.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import type { MemoryBackend } from '../../kernel/interfaces.js';
import type { CLIContext } from '../handlers/interfaces.js';
import { type OutputFormat, type QualityGateResult, writeOutput, toJSON, qualityGateToMarkdown } from '../utils/ci-output.js';

export async function loadQualityEvidence(memory: MemoryBackend): Promise<{
  coverage: number;
  testsPassing: number;
}> {
  const coverage = await memory.get<{ line?: number }>('coverage:latest');
  const tests = await memory.get<{ passed?: number; failed?: number; skipped?: number }>(
    'test-run:latest',
    { namespace: 'test-execution' }
  );
  if (!coverage || !tests) {
    throw new Error(
      'No measured quality evidence found in AgentDB. Run coverage and `aqe test execute` before `aqe quality --gate`.'
    );
  }
  const total = (tests.passed ?? 0) + (tests.failed ?? 0) + (tests.skipped ?? 0);
  if (!Number.isFinite(coverage.line) || total <= 0 || !Number.isFinite(tests.passed)) {
    throw new Error('Measured quality evidence is malformed or incomplete.');
  }
  return {
    coverage: coverage.line!,
    testsPassing: ((tests.passed ?? 0) / total) * 100,
  };
}

export function evaluateMeasuredQualityEvidence(measured: {
  coverage: number;
  testsPassing: number;
}): QualityGateResult {
  const checks = [
    {
      name: 'coverage',
      passed: measured.coverage >= 80,
      value: measured.coverage,
      threshold: 80,
    },
    {
      name: 'testsPassing',
      passed: measured.testsPassing >= 95,
      value: measured.testsPassing,
      threshold: 95,
    },
  ];
  return {
    passed: checks.every(check => check.passed),
    score: 'N/A',
    checks,
    recommendations: checks
      .filter(check => !check.passed)
      .map(check => `${check.name} is below its measured threshold.`),
  };
}

/**
 * Published quality command exit contract:
 * 0 = passed with more than five percentage points of headroom
 * 1 = one or more measured checks failed
 * 2 = passed, but at least one measured check has less than five points of headroom
 */
export function getMeasuredQualityExitCode(result: QualityGateResult): 0 | 1 | 2 {
  if (!result.passed) return 1;
  return result.checks.some(check => (
    typeof check.value === 'number'
    && typeof check.threshold === 'number'
    && check.value >= check.threshold
    && check.value < check.threshold + 5
  )) ? 2 : 0;
}

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

          const measured = await loadQualityEvidence(context.kernel!.memory);
          const gateResult = evaluateMeasuredQualityEvidence(measured);

          if (format === 'json') {
            writeOutput(toJSON(gateResult), options.output);
          } else if (format === 'markdown') {
            writeOutput(qualityGateToMarkdown(gateResult), options.output);
          } else {
            const statusIcon = gateResult.passed ? chalk.green('✓ PASSED') : chalk.red('✗ FAILED');
            console.log(`  Quality Gate: ${statusIcon}`);
            console.log(`  Score: ${chalk.cyan(gateResult.score)}\n`);
            console.log(chalk.cyan('  Checks:'));
            for (const check of gateResult.checks) {
              const icon = check.passed ? chalk.green('✓') : chalk.red('✗');
              console.log(`    ${icon} ${check.name}: ${check.value} (threshold: ${check.threshold})`);
            }
            if (gateResult.recommendations && gateResult.recommendations.length > 0) {
              console.log(chalk.cyan('\n  Recommendations:'));
              for (const rec of gateResult.recommendations) {
                console.log(chalk.gray(`    - ${rec}`));
              }
            }
            console.log('');
          }

          await cleanupAndExit(getMeasuredQualityExitCode(gateResult));
        }

      } catch (error) {
        console.error(chalk.red('\nFailed:'), error);
        await cleanupAndExit(1);
      }
    });

  return qualityCmd;
}
