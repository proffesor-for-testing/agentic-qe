import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import os from 'os';
import { SecureRandom } from '../../../utils/SecureRandom.js';
import { ProcessExit } from '../../../utils/ProcessExit';

interface ParallelOptions {
  workers: number;
  strategy: 'file' | 'suite' | 'test';
  showWorkers: boolean;
  failFast: boolean;
}

export function createParallelCommand(): Command {
  const command = new Command('parallel');

  command
    .description('Execute tests in parallel with worker management')
    .option('-w, --workers <number>', 'Number of worker threads', os.cpus().length.toString())
    .option('-s, --strategy <type>', 'Distribution strategy (file|suite|test)', 'file')
    .option('--show-workers', 'Show worker status', false)
    .option('--fail-fast <boolean>', 'Stop on first failure', 'true')
    .action(async (options: ParallelOptions) => {
      const spinner = ora('Running tests in parallel').start();

      try {
        const workers = parseInt(options.workers.toString(), 10);
        const { strategy, showWorkers, failFast } = options;

        spinner.text = `Running tests in parallel (workers: ${workers}, strategy: ${strategy})`;

        // Discover tests
        const tests = await discoverTests();
        const batches = distributeTests(tests, workers, strategy);

        spinner.stop();
        console.log(chalk.bold(`\nParallel Execution:`));
        console.log(chalk.gray(`Workers: ${workers}`));
        console.log(chalk.gray(`Strategy: ${strategy}`));
        console.log(chalk.gray(`Fail-fast: ${failFast}`));
        console.log(chalk.gray(`Total tests: ${tests.length}\n`));

        // Execute in parallel
        const results = await executeParallel(batches, showWorkers, failFast);

        // Summary
        const passed = results.filter(r => r.passed).length;
        const failed = results.filter(r => !r.passed).length;
        const duration = results.reduce((sum, r) => sum + r.duration, 0);

        console.log(chalk.bold('\nExecution Summary:'));
        console.log(chalk.green(`✓ Passed: ${passed}`));
        console.log(chalk.red(`✗ Failed: ${failed}`));
        console.log(chalk.gray(`Total time: ${duration}ms`));

        if (failed > 0) {
          ProcessExit.exitIfNotTest(1);
        }
      } catch (error) {
        spinner.fail('Parallel execution failed');
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        ProcessExit.exitIfNotTest(1);
      }
    });

  return command;
}

async function discoverTests(): Promise<string[]> {
  // Mock implementation
  return [
    'tests/unit/auth.test.ts',
    'tests/unit/validation.test.ts',
    'tests/integration/api.test.ts',
    'tests/integration/database.test.ts',
    'tests/e2e/checkout.test.ts',
    'tests/e2e/profile.test.ts'
  ];
}

function distributeTests(
  tests: string[],
  workers: number,
  strategy: string
): string[][] {
  const batches: string[][] = Array.from({ length: workers }, () => []);

  if (strategy === 'file') {
    // Round-robin distribution
    tests.forEach((test, index) => {
      batches[index % workers].push(test);
    });
  } else {
    // Simple chunking for other strategies
    const chunkSize = Math.ceil(tests.length / workers);
    for (let i = 0; i < workers; i++) {
      batches[i] = tests.slice(i * chunkSize, (i + 1) * chunkSize);
    }
  }

  return batches.filter(batch => batch.length > 0);
}

async function executeParallel(
  batches: string[][],
  showWorkers: boolean,
  failFast: boolean
): Promise<Array<{ test: string; passed: boolean; duration: number }>> {
  const results: Array<{ test: string; passed: boolean; duration: number }> = [];
  let shouldStop = false;

  const workerPromises = batches.map(async (batch, workerIndex) => {
    if (showWorkers) {
      console.log(chalk.cyan(`Worker ${workerIndex}: Starting ${batch.length} tests`));
    }

    for (const test of batch) {
      if (shouldStop && failFast) break;

      const start = Date.now();
      const passed = SecureRandom.randomFloat() > 0.2; // 80% success rate
      const duration = Math.floor(SecureRandom.randomFloat() * 500) + 100;

      await new Promise(resolve => setTimeout(resolve, duration));

      results.push({ test, passed, duration: Date.now() - start });

      if (showWorkers) {
        const status = passed ? chalk.green('✓') : chalk.red('✗');
        console.log(`${status} Worker ${workerIndex}: ${test} (${duration}ms)`);
      }

      if (!passed && failFast) {
        shouldStop = true;
        break;
      }
    }

    if (showWorkers) {
      console.log(chalk.cyan(`Worker ${workerIndex}: Completed`));
    }
  });

  await Promise.all(workerPromises);
  return results;
}
