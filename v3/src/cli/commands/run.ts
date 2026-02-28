/**
 * Agentic QE v3 - Run Command
 *
 * Wraps client test runners so they can be invoked via the aqe CLI:
 *   aqe run o2c                          # Create new order + run full lifecycle
 *   aqe run o2c --order APT26149445      # Validate existing order (debug mode)
 *   aqe run o2c --parallel 3             # Run N orders in parallel
 *
 * This is a thin CLI wrapper — all execution logic lives in the client modules.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { resolve } from 'path';

export function createRunCommand(): Command {
  const runCmd = new Command('run')
    .description('Run client test cases');

  // =========================================================================
  // aqe run o2c — Adidas Order-to-Cash lifecycle
  // =========================================================================

  runCmd
    .command('o2c')
    .description('Adidas Order-to-Cash lifecycle (create → ship → deliver → invoice → return → credit)')
    .option('--order <orderNo>', 'Validate an existing order instead of creating new (e.g., APT26149445)')
    .option('--parallel <count>', 'Run N orders in parallel', parseInt)
    .option('--skip-layer2', 'Skip IIB/MQ checks (Layer 2)')
    .option('--skip-layer3', 'Skip NShift/Email/PDF/Browser checks (Layer 3)')
    .option('--continue-on-failure', 'Continue to next stage on verification failure')
    .option('--env <name>', 'Environment label (for reporting only)', 'staging')
    .option('--report <format>', 'Report format (html|json)', 'html')
    .action(async (options) => {
      // Load .env if dotenv is available
      try {
        const dotenv = await import('dotenv');
        dotenv.config({ path: resolve(process.cwd(), '.env') });
      } catch {
        // dotenv not installed — env vars must be set externally
      }

      // Build argv for the underlying runner
      const args: string[] = [];
      if (options.order) {
        args.push('--order', options.order);
      }
      if (options.parallel) {
        args.push('--parallel', String(options.parallel));
      }
      if (options.skipLayer2) {
        args.push('--skip-layer2');
      }
      if (options.skipLayer3) {
        args.push('--skip-layer3');
      }
      if (options.continueOnFailure) {
        args.push('--continue-on-failure');
      }

      // Inject args so the runner's parseArgs() picks them up
      const originalArgv = process.argv;
      process.argv = ['node', 'run-o2c', ...args];

      try {
        console.log(chalk.blue('\n Agentic QE — Adidas Order-to-Cash Lifecycle\n'));

        // Dynamic import to avoid loading Adidas client code unless needed
        const { main } = await import('../../clients/adidas/run-tc01.js');
        await main();
      } catch (error) {
        // run-tc01 calls process.exit() on completion — if we get here,
        // it means the import/execution threw before reaching exit.
        const msg = error instanceof Error ? error.message : String(error);

        // process.exit() throws in some environments — check for that
        if (msg.includes('process.exit')) {
          // Normal exit path — the runner already printed results
          return;
        }

        console.error(chalk.red(`\nFatal error: ${msg}\n`));
        process.exit(1);
      } finally {
        process.argv = originalArgv;
      }
    });

  return runCmd;
}
