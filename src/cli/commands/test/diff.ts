import { Command } from 'commander';
import chalk from 'chalk';
import { promises as fs } from 'fs';

interface DiffOptions {
  detailed: boolean;
  coverage: boolean;
  performance: boolean;
  showRegression: boolean;
  export?: string;
}

interface TestRun {
  id: string;
  timestamp: Date;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  coverage?: number;
}

export function createDiffCommand(): Command {
  const command = new Command('diff');

  command
    .description('Compare test results between runs')
    .argument('[run1]', 'First test run ID')
    .argument('[run2]', 'Second test run ID')
    .option('--detailed', 'Show detailed differences', false)
    .option('--coverage', 'Compare coverage reports', false)
    .option('--performance', 'Compare performance metrics', false)
    .option('--show-regression', 'Highlight regressions', false)
    .option('--export <file>', 'Export diff report to file')
    .action(async (run1: string | undefined, run2: string | undefined, options: DiffOptions) => {
      console.log(chalk.bold('Comparing test results...\n'));

      // Load test runs
      const runA = run1 ? loadTestRun(run1) : getLatestRun();
      const runB = run2 ? loadTestRun(run2) : getPreviousRun();

      if (!runA || !runB) {
        console.log(chalk.red('Error: Could not load test runs'));
        return;
      }

      console.log(chalk.gray(`Run 1: ${runA.id} (${runA.timestamp.toISOString()})`));
      console.log(chalk.gray(`Run 2: ${runB.id} (${runB.timestamp.toISOString()})\n`));

      // Overall comparison
      displayOverallDiff(runA, runB, options);

      // Coverage comparison
      if (options.coverage) {
        displayCoverageDiff(runA, runB);
      }

      // Performance comparison
      if (options.performance) {
        displayPerformanceDiff(runA, runB);
      }

      // Detailed test-by-test comparison
      if (options.detailed) {
        displayDetailedDiff(runA, runB);
      }

      // Export if requested
      if (options.export) {
        await exportDiff(runA, runB, options.export);
        console.log(chalk.green(`\n✓ Exported to: ${options.export}`));
      }
    });

  return command;
}

function displayOverallDiff(runA: TestRun, runB: TestRun, options: DiffOptions): void {
  console.log(chalk.bold('Overall Comparison:'));
  console.log(chalk.gray('─'.repeat(60)));

  const passedDiff = runB.passed - runA.passed;
  const failedDiff = runB.failed - runA.failed;
  const durationDiff = runB.duration - runA.duration;

  console.log(`Passed:   ${runA.passed} → ${runB.passed} ${formatDiff(passedDiff)}`);
  console.log(`Failed:   ${runA.failed} → ${runB.failed} ${formatDiff(failedDiff, true)}`);
  console.log(`Skipped:  ${runA.skipped} → ${runB.skipped}`);
  console.log(`Duration: ${runA.duration}ms → ${runB.duration}ms ${formatDiff(durationDiff, true)}ms`);

  if (options.showRegression && (failedDiff > 0 || durationDiff > 1000)) {
    console.log(chalk.red('\n⚠️  Regression detected!'));
    if (failedDiff > 0) {
      console.log(chalk.red(`   ${failedDiff} more test(s) failing`));
    }
    if (durationDiff > 1000) {
      console.log(chalk.red(`   ${durationDiff}ms slower execution`));
    }
  }

  console.log('');
}

function displayCoverageDiff(runA: TestRun, runB: TestRun): void {
  console.log(chalk.bold('Coverage Diff:'));
  console.log(chalk.gray('─'.repeat(60)));

  const coverageA = runA.coverage || 0;
  const coverageB = runB.coverage || 0;
  const diff = coverageB - coverageA;

  console.log(`Coverage: ${coverageA.toFixed(2)}% → ${coverageB.toFixed(2)}% ${formatDiff(diff)}%`);

  // Mock detailed coverage by file
  const files = [
    { name: 'src/auth.ts', before: 85.5, after: 90.2 },
    { name: 'src/api.ts', before: 92.1, after: 91.8 },
    { name: 'src/utils.ts', before: 78.3, after: 82.7 }
  ];

  console.log('\nBy File:');
  files.forEach(file => {
    const fileDiff = file.after - file.before;
    const color = fileDiff >= 0 ? chalk.green : chalk.red;
    console.log(`  ${file.name.padEnd(30)} ${file.before.toFixed(1)}% → ${file.after.toFixed(1)}% ${color(formatDiff(fileDiff))}%`);
  });

  console.log('');
}

function displayPerformanceDiff(runA: TestRun, runB: TestRun): void {
  console.log(chalk.bold('Performance Diff:'));
  console.log(chalk.gray('─'.repeat(60)));

  // Mock performance metrics
  const metrics = [
    { name: 'Total duration', before: runA.duration, after: runB.duration, unit: 'ms' },
    { name: 'Avg test time', before: 125, after: 110, unit: 'ms' },
    { name: 'Memory usage', before: 45.2, after: 43.8, unit: 'MB' },
    { name: 'CPU usage', before: 62.5, after: 58.3, unit: '%' }
  ];

  metrics.forEach(metric => {
    const diff = metric.after - metric.before;
    const color = diff <= 0 ? chalk.green : chalk.red;
    const diffStr = diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);

    console.log(`${metric.name.padEnd(20)} ${metric.before}${metric.unit} → ${metric.after}${metric.unit} ${color(diffStr)}${metric.unit}`);
  });

  console.log('');
}

function displayDetailedDiff(runA: TestRun, runB: TestRun): void {
  console.log(chalk.bold('Detailed Diff:'));
  console.log(chalk.gray('─'.repeat(60)));

  // Mock test-level changes
  const changes = [
    { test: 'Auth login test', before: 'passed', after: 'passed', duration: -15 },
    { test: 'API endpoint test', before: 'passed', after: 'failed', duration: 0 },
    { test: 'Database query test', before: 'failed', after: 'passed', duration: -200 },
    { test: 'E2E checkout test', before: 'passed', after: 'passed', duration: 350 }
  ];

  changes.forEach(change => {
    const statusChange = change.before !== change.after;
    const icon = statusChange ? '⚠️ ' : '  ';

    console.log(`${icon}${change.test}`);
    console.log(`   Status: ${change.before} → ${change.after}`);

    if (change.duration !== 0) {
      const color = change.duration < 0 ? chalk.green : chalk.red;
      const sign = change.duration > 0 ? '+' : '';
      console.log(`   Duration: ${color(`${sign}${change.duration}ms`)}`);
    }

    console.log('');
  });
}

function loadTestRun(runId: string): TestRun {
  // Mock implementation
  return {
    id: runId,
    timestamp: new Date(),
    passed: 45,
    failed: 3,
    skipped: 2,
    duration: 5420,
    coverage: 87.5
  };
}

function getLatestRun(): TestRun {
  return {
    id: 'run-latest',
    timestamp: new Date(),
    passed: 47,
    failed: 2,
    skipped: 1,
    duration: 5100,
    coverage: 89.2
  };
}

function getPreviousRun(): TestRun {
  return {
    id: 'run-previous',
    timestamp: new Date(Date.now() - 86400000),
    passed: 45,
    failed: 3,
    skipped: 2,
    duration: 5420,
    coverage: 87.5
  };
}

function formatDiff(diff: number, inverse: boolean = false): string {
  if (diff === 0) return chalk.gray('(no change)');

  const isPositive = inverse ? diff < 0 : diff > 0;
  const color = isPositive ? chalk.green : chalk.red;
  const sign = diff > 0 ? '+' : '';

  return color(`(${sign}${diff})`);
}

async function exportDiff(runA: TestRun, runB: TestRun, filename: string): Promise<void> {
  const diffData = {
    timestamp: new Date().toISOString(),
    runs: {
      before: runA,
      after: runB
    },
    changes: {
      passed: runB.passed - runA.passed,
      failed: runB.failed - runA.failed,
      duration: runB.duration - runA.duration,
      coverage: (runB.coverage || 0) - (runA.coverage || 0)
    }
  };

  await fs.writeFile(filename, JSON.stringify(diffData, null, 2));
}
