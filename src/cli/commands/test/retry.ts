import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';

interface RetryOptions {
  maxAttempts: number;
  backoff: 'linear' | 'exponential';
  pattern?: string;
  failOnNone: boolean;
}

export function createRetryCommand(): Command {
  const command = new Command('retry');

  command
    .description('Retry failed tests with configurable attempts and backoff')
    .option('-m, --max-attempts <number>', 'Maximum retry attempts', '3')
    .option('-b, --backoff <type>', 'Backoff strategy (linear|exponential)', 'linear')
    .option('-p, --pattern <pattern>', 'Test file pattern to retry')
    .option('--fail-on-none', 'Fail if no tests to retry', false)
    .action(async (options: RetryOptions) => {
      const spinner = ora('Retrying failed tests').start();

      try {
        const maxAttempts = parseInt(options.maxAttempts.toString(), 10);
        const { backoff, pattern, failOnNone } = options;

        spinner.text = `Retrying failed tests (max-attempts: ${maxAttempts}, backoff: ${backoff})`;

        // Load failed tests from previous run
        const failedTests = await loadFailedTests(pattern);

        if (failedTests.length === 0) {
          if (failOnNone) {
            spinner.fail('No failed tests found');
            process.exit(1);
          }
          spinner.succeed('No failed tests to retry');
          return;
        }

        spinner.text = `Found ${failedTests.length} failed tests. Starting retry...`;

        // Retry each failed test
        const results = await retryTests(failedTests, maxAttempts, backoff);

        // Summary
        const passed = results.filter(r => r.passed).length;
        const failed = results.filter(r => !r.passed).length;

        spinner.stop();
        console.log(chalk.bold('\nRetry Summary:'));
        console.log(chalk.green(`✓ Passed: ${passed}`));
        console.log(chalk.red(`✗ Failed: ${failed}`));

        if (pattern) {
          console.log(chalk.gray(`Pattern: ${pattern}`));
        }

        // Exit with error if any tests still failing
        if (failed > 0) {
          process.exit(1);
        }
      } catch (error) {
        spinner.fail('Retry failed');
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  return command;
}

async function loadFailedTests(pattern?: string): Promise<string[]> {
  // Mock implementation - in real scenario, load from test results file
  const allFailed = [
    'tests/unit/auth.test.ts',
    'tests/integration/api.test.ts',
    'tests/e2e/checkout.test.ts'
  ];

  if (pattern) {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return allFailed.filter(test => regex.test(test));
  }

  return allFailed;
}

async function retryTests(
  tests: string[],
  maxAttempts: number,
  backoff: string
): Promise<Array<{ test: string; passed: boolean; attempts: number }>> {
  const results = [];

  for (const test of tests) {
    let passed = false;
    let attempts = 0;

    for (let i = 0; i < maxAttempts && !passed; i++) {
      attempts++;

      // Calculate backoff delay
      const delay = backoff === 'exponential'
        ? Math.pow(2, i) * 1000
        : i * 1000;

      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // Mock test execution
      passed = Math.random() > 0.3; // 70% success rate

      if (passed) {
        console.log(chalk.green(`✓ ${test} passed on attempt ${attempts}`));
      } else if (i < maxAttempts - 1) {
        console.log(chalk.yellow(`⟳ ${test} failed, retrying...`));
      }
    }

    if (!passed) {
      console.log(chalk.red(`✗ ${test} failed after ${attempts} attempts`));
    }

    results.push({ test, passed, attempts });
  }

  return results;
}
