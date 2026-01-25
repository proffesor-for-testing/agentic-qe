/**
 * Agentic QE v3 - Quality Command
 *
 * Provides quality assessment shortcuts.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import type { CLIContext } from '../handlers/interfaces.js';

export function createQualityCommand(
  context: CLIContext,
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>
): Command {
  const qualityCmd = new Command('quality')
    .description('Quality assessment shortcut')
    .option('--gate', 'Run quality gate evaluation')
    .action(async (options) => {
      if (!await ensureInitialized()) return;

      try {
        console.log(chalk.blue(`\n Running quality assessment...\n`));

        const result = await context.queen!.submitTask({
          type: 'assess-quality',
          priority: 'p0',
          targetDomains: ['quality-assessment'],
          payload: { runGate: options.gate },
          timeout: 300000,
        });

        if (result.success) {
          console.log(chalk.green(`Task submitted: ${result.value}`));
          console.log(chalk.gray(`   Use 'aqe task status ${result.value}' to check progress`));
        } else {
          console.log(chalk.red(`Failed: ${result.error.message}`));
        }

        console.log('');

      } catch (error) {
        console.error(chalk.red('\nFailed:'), error);
        await cleanupAndExit(1);
      }
    });

  return qualityCmd;
}
