/**
 * Test Execution Streaming Example
 *
 * This example demonstrates real-time streaming of test execution progress.
 */

import { FleetManager, TestExecutionStream } from 'agentic-qe';
import chalk from 'chalk';
import ora from 'ora';

async function streamingTestExecution() {
  const fleet = new FleetManager({
    features: {
      streamingTools: true
    }
  });

  await fleet.initialize();

  console.log(chalk.bold('\n=== Streaming Test Execution ===\n'));

  // Create streaming request
  const stream = await fleet.streamTestExecution({
    testFiles: 'tests/**/*.test.ts',
    parallel: true,
    maxWorkers: 8,
    coverage: true
  });

  // Track statistics
  const stats = {
    passed: 0,
    failed: 0,
    skipped: 0,
    total: 0,
    suites: 0,
    duration: 0
  };

  const failedTests: any[] = [];
  const spinner = ora('Initializing...').start();

  // Listen for suite events
  stream.on('suite:started', (suite) => {
    stats.suites++;
    spinner.text = chalk.cyan(`Running: ${suite.name}`);
  });

  stream.on('suite:completed', (suite) => {
    spinner.succeed(chalk.green(`✓ ${suite.name} (${suite.duration}ms)`));
    console.log(chalk.gray(`  Tests: ${suite.passed} passed, ${suite.failed} failed`));
    spinner.start();
  });

  // Listen for test events
  stream.on('test:started', (test) => {
    stats.total++;
    spinner.text = chalk.blue(`Testing: ${test.name}`);
  });

  stream.on('test:passed', (test) => {
    stats.passed++;
    stats.duration += test.duration;
    spinner.text = chalk.green(`✓ ${test.name} (${test.duration}ms)`);
  });

  stream.on('test:failed', (test) => {
    stats.failed++;
    stats.duration += test.duration;
    failedTests.push(test);

    spinner.fail(chalk.red(`✗ ${test.name}`));
    console.log(chalk.red(`  ${test.error.message}`));
    console.log(chalk.gray(`  at ${test.error.location}`));
    spinner.start();
  });

  stream.on('test:skipped', (test) => {
    stats.skipped++;
    spinner.text = chalk.yellow(`⊘ ${test.name} (skipped)`);
  });

  // Listen for progress updates
  stream.on('progress', (update) => {
    const percentage = Math.floor(update.progress);
    spinner.text = chalk.cyan(
      `Progress: ${percentage}% (${update.completed}/${update.total}) - ${update.currentOperation}`
    );
  });

  // Listen for coverage updates
  stream.on('coverage:updated', (coverage) => {
    spinner.stopAndPersist({
      symbol: '📊',
      text: chalk.magenta(`Coverage: ${coverage.overall.toFixed(1)}%`)
    });
    spinner.start();
  });

  // Handle errors
  stream.on('error', (error) => {
    spinner.fail(chalk.red(`Error: ${error.message}`));
    spinner.start();
  });

  try {
    // Wait for completion
    const result = await stream.complete();
    spinner.stop();

    // Display results
    console.log(chalk.bold('\n\n=== Test Results ===\n'));

    // Summary
    const passRate = ((stats.passed / stats.total) * 100).toFixed(1);
    const avgDuration = (stats.duration / stats.total).toFixed(0);

    console.log(chalk.bold('Summary:'));
    console.log(chalk.green(`  ✓ Passed: ${stats.passed}`));
    console.log(chalk.red(`  ✗ Failed: ${stats.failed}`));
    console.log(chalk.yellow(`  ⊘ Skipped: ${stats.skipped}`));
    console.log(chalk.gray(`  Total: ${stats.total} tests in ${stats.suites} suites`));
    console.log(chalk.gray(`  Pass Rate: ${passRate}%`));
    console.log(chalk.gray(`  Duration: ${(stats.duration / 1000).toFixed(1)}s`));
    console.log(chalk.gray(`  Avg: ${avgDuration}ms/test`));

    // Coverage
    if (result.coverage) {
      console.log(chalk.bold('\n Coverage:'));
      console.log(chalk.cyan(`  Overall: ${result.coverage.overall.toFixed(1)}%`));
      console.log(chalk.gray(`  Lines: ${result.coverage.lines.covered}/${result.coverage.lines.total}`));
      console.log(chalk.gray(`  Functions: ${result.coverage.functions.covered}/${result.coverage.functions.total}`));
      console.log(chalk.gray(`  Branches: ${result.coverage.branches.covered}/${result.coverage.branches.total}`));
    }

    // Failed tests details
    if (failedTests.length > 0) {
      console.log(chalk.bold('\n❌ Failed Tests:\n'));
      failedTests.forEach((test, i) => {
        console.log(chalk.red(`${i + 1}. ${test.name}`));
        console.log(chalk.gray(`   ${test.error.message}`));
        console.log(chalk.gray(`   at ${test.error.location}\n`));
      });
    }

    // Exit code
    process.exitCode = stats.failed > 0 ? 1 : 0;

  } finally {
    // Clean up
    stream.removeAllListeners();
  }
}

// Run the example
streamingTestExecution().catch(console.error);

/**
 * Expected Output:
 *
 * === Streaming Test Execution ===
 *
 * ✓ UserService Tests (1234ms)
 *   Tests: 12 passed, 0 failed
 *
 * ⚠ TestName: should handle edge case
 * ✓ TestName: should create user (45ms)
 * ✓ TestName: should update user (67ms)
 * ✗ TestName: should delete user
 *   Expected 204, received 500
 *   at user-service.test.ts:45:10
 *
 * 📊 Coverage: 87.5%
 *
 * Progress: 75% (45/60) - Running integration tests...
 *
 * ✓ Integration Tests (2345ms)
 *   Tests: 15 passed, 1 failed
 *
 * === Test Results ===
 *
 * Summary:
 *   ✓ Passed: 58
 *   ✗ Failed: 2
 *   ⊘ Skipped: 0
 *   Total: 60 tests in 5 suites
 *   Pass Rate: 96.7%
 *   Duration: 8.4s
 *   Avg: 140ms/test
 *
 * Coverage:
 *   Overall: 92.3%
 *   Lines: 1243/1347
 *   Functions: 87/94
 *   Branches: 145/162
 *
 * ❌ Failed Tests:
 *
 * 1. should delete user
 *    Expected 204, received 500
 *    at user-service.test.ts:45:10
 *
 * 2. should handle concurrent requests
 *    Timeout exceeded
 *    at payment-service.test.ts:78:15
 */
