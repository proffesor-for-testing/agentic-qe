/**
 * Agentic QE v3 - Eval CLI Commands
 * ADR-056 Phase 5: Parallel evaluation runner commands
 *
 * Commands for running skill evaluations in parallel using worker pools.
 *
 * Usage:
 *   aqe eval run --skill <skill> --model <model> [--parallel] [--workers <n>]
 *   aqe eval run-all --skills-tier <tier> --models <models> [--parallel]
 *   aqe eval status --skill <skill>
 *   aqe eval report --skill <skill> [--format json|markdown]
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import {
  ParallelEvalRunner,
  createParallelEvalRunner,
  DEFAULT_PARALLEL_EVAL_CONFIG,
  ParallelEvalResult,
  EvalProgress,
} from '../../validation/parallel-eval-runner.js';
import {
  createSkillValidationLearner,
  SkillValidationLearner,
} from '../../learning/skill-validation-learner.js';
import {
  createRealQEReasoningBank,
  RealQEReasoningBank,
} from '../../learning/real-qe-reasoning-bank.js';

// ============================================================================
// Types
// ============================================================================

interface EvalCommandOptions {
  skill: string;
  model: string;
  parallel: boolean;
  workers: number;
  batchSize: number;
  timeout: number;
  retry: boolean;
  output: string;
  verbose: boolean;
}

interface RunAllOptions {
  skillsTier: number;
  models: string;
  parallel: boolean;
  workers: number;
  output: string;
  verbose: boolean;
}

interface ReportOptions {
  skill: string;
  format: 'json' | 'markdown';
  output: string;
}

// ============================================================================
// Skill Tiers
// ============================================================================

/**
 * P0 (Tier 3) skills - highest priority
 */
const P0_SKILLS = [
  'accessibility-testing',
  'security-testing',
  'performance-testing',
  'chaos-engineering-resilience',
  'contract-testing',
];

/**
 * P1 (Tier 2) skills
 */
const P1_SKILLS = [
  'risk-based-testing',
  'test-design-techniques',
  'regression-testing',
  'test-data-management',
  'localization-testing',
];

/**
 * P2 (Tier 1) skills
 */
const P2_SKILLS = [
  'quality-metrics',
  'refactoring-patterns',
  'iterative-loop',
  'stream-chain',
];

/**
 * Get skills for a specific tier
 */
function getSkillsByTier(tier: number): string[] {
  switch (tier) {
    case 3:
      return P0_SKILLS;
    case 2:
      return [...P0_SKILLS, ...P1_SKILLS];
    case 1:
      return [...P0_SKILLS, ...P1_SKILLS, ...P2_SKILLS];
    default:
      return P0_SKILLS;
  }
}

// ============================================================================
// Progress Display
// ============================================================================

let lastProgressLine = '';

function displayProgress(progress: EvalProgress): void {
  const percentage = Math.round(
    (progress.completedTasks / progress.totalTasks) * 100
  );
  const elapsed = formatDuration(progress.elapsedMs);
  const remaining = formatDuration(progress.estimatedRemainingMs);

  const progressBar = createProgressBar(percentage, 30);

  const line = `${chalk.cyan('Progress:')} ${progressBar} ${percentage}% | ` +
    `${chalk.green(progress.completedTasks)}/${progress.totalTasks} tasks | ` +
    `${chalk.yellow(progress.failedTasks)} failed | ` +
    `${chalk.blue(progress.activeWorkers)} workers | ` +
    `${elapsed} elapsed, ~${remaining} remaining`;

  // Clear previous line and write new one
  if (lastProgressLine) {
    process.stdout.write('\r' + ' '.repeat(lastProgressLine.length) + '\r');
  }
  process.stdout.write(line);
  lastProgressLine = line;
}

function createProgressBar(percentage: number, width: number): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return chalk.green('='.repeat(filled)) + chalk.gray('-'.repeat(empty));
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

// ============================================================================
// Result Formatting
// ============================================================================

function formatResult(result: ParallelEvalResult): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(
    chalk.bold(`Eval Results: ${result.skill}`) + chalk.dim(` (${result.model})`)
  );
  lines.push('='.repeat(60));

  // Summary
  const statusIcon = result.passed ? chalk.green('PASSED') : chalk.red('FAILED');
  lines.push(`Status: ${statusIcon}`);
  lines.push('');

  // Metrics
  lines.push(chalk.bold('Metrics:'));
  lines.push(`  Total Tests:    ${result.totalTests}`);
  lines.push(`  Passed:         ${chalk.green(result.passedTests)}`);
  lines.push(`  Failed:         ${chalk.red(result.failedTests)}`);
  lines.push(`  Skipped:        ${chalk.yellow(result.skippedTests)}`);
  lines.push(`  Pass Rate:      ${(result.passRate * 100).toFixed(1)}%`);
  lines.push(`  Reasoning Avg:  ${(result.avgReasoningQuality * 100).toFixed(1)}%`);
  lines.push('');

  // Performance
  lines.push(chalk.bold('Performance:'));
  lines.push(`  Duration:       ${formatDuration(result.totalDurationMs)}`);
  lines.push(`  Workers Used:   ${result.workersUsed}`);
  lines.push(
    `  Parallel Speedup: ${chalk.cyan(result.parallelSpeedup.toFixed(2) + 'x')}`
  );
  lines.push('');

  // Failed test details (if any)
  const failedTests = result.testResults.filter((t) => !t.passed);
  if (failedTests.length > 0) {
    lines.push(chalk.bold.red('Failed Tests:'));
    for (const test of failedTests.slice(0, 5)) {
      lines.push(`  ${chalk.red('x')} ${test.testId}`);
      if (test.error) {
        lines.push(`    ${chalk.dim(test.error)}`);
      }
    }
    if (failedTests.length > 5) {
      lines.push(`  ... and ${failedTests.length - 5} more`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatMarkdownReport(results: ParallelEvalResult[]): string {
  const lines: string[] = [];

  lines.push('# Skill Evaluation Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Skill | Model | Pass Rate | Duration | Speedup | Status |');
  lines.push('|-------|-------|-----------|----------|---------|--------|');

  for (const result of results) {
    const status = result.passed ? 'PASSED' : 'FAILED';
    lines.push(
      `| ${result.skill} | ${result.model} | ${(result.passRate * 100).toFixed(1)}% | ${formatDuration(result.totalDurationMs)} | ${result.parallelSpeedup.toFixed(2)}x | ${status} |`
    );
  }

  lines.push('');

  // Detailed results
  lines.push('## Detailed Results');
  lines.push('');

  for (const result of results) {
    lines.push(`### ${result.skill} (${result.model})`);
    lines.push('');
    lines.push(`- **Total Tests:** ${result.totalTests}`);
    lines.push(`- **Passed:** ${result.passedTests}`);
    lines.push(`- **Failed:** ${result.failedTests}`);
    lines.push(`- **Pass Rate:** ${(result.passRate * 100).toFixed(1)}%`);
    lines.push(`- **Avg Reasoning Quality:** ${(result.avgReasoningQuality * 100).toFixed(1)}%`);
    lines.push('');

    const failedTests = result.testResults.filter((t) => !t.passed);
    if (failedTests.length > 0) {
      lines.push('**Failed Tests:**');
      lines.push('');
      for (const test of failedTests) {
        lines.push(`- \`${test.testId}\`: ${test.error || 'No error message'}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Command Handlers
// ============================================================================

async function initializeRunner(): Promise<{
  runner: ParallelEvalRunner;
  learner: SkillValidationLearner;
  reasoningBank: RealQEReasoningBank;
}> {
  // Create reasoning bank with in-memory storage for CLI
  const reasoningBank = await createRealQEReasoningBank({
    sqlite: {
      dbPath: '.agentic-qe/eval-runner.db',
    },
    hnsw: {
      M: 16,
      efConstruction: 100,
      efSearch: 50,
    },
  });

  await reasoningBank.initialize();

  // Create learner
  const learner = createSkillValidationLearner(reasoningBank);

  // Create runner
  const runner = createParallelEvalRunner(learner);

  return { runner, learner, reasoningBank };
}

async function handleRunCommand(options: EvalCommandOptions): Promise<void> {
  console.log(chalk.bold('\nAQE Parallel Eval Runner'));
  console.log(chalk.dim('ADR-056 Phase 5: Worker Pool Pattern\n'));

  const { runner, reasoningBank } = await initializeRunner();

  try {
    // Configure runner
    const config = {
      ...DEFAULT_PARALLEL_EVAL_CONFIG,
      maxWorkers: options.parallel ? options.workers : 1,
      batchSize: options.batchSize,
      timeout: options.timeout,
      retryFailedTests: options.retry,
    };

    const customRunner = createParallelEvalRunner(
      createSkillValidationLearner(reasoningBank),
      config
    );

    // Set up progress reporting
    if (options.verbose) {
      customRunner.onProgress(displayProgress);
    }

    console.log(chalk.cyan(`Running eval suite: ${options.skill}`));
    console.log(chalk.cyan(`Model: ${options.model}`));
    console.log(
      chalk.cyan(
        `Mode: ${options.parallel ? `Parallel (${options.workers} workers)` : 'Sequential'}`
      )
    );
    console.log('');

    // Run eval
    const result = await customRunner.runEvalParallel(
      options.skill,
      options.model
    );

    // Clear progress line
    if (lastProgressLine) {
      console.log('');
    }

    // Display results
    console.log(formatResult(result));

    // Write output file if specified
    if (options.output) {
      const outputPath = path.resolve(options.output);
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(chalk.green(`Results saved to: ${outputPath}`));
    }

    // Exit with appropriate code
    process.exit(result.passed ? 0 : 1);
  } finally {
    await reasoningBank.dispose();
  }
}

async function handleRunAllCommand(options: RunAllOptions): Promise<void> {
  console.log(chalk.bold('\nAQE Parallel Eval Runner - Multi-Skill'));
  console.log(chalk.dim('ADR-056 Phase 5: Worker Pool Pattern\n'));

  const { runner, learner, reasoningBank } = await initializeRunner();

  try {
    // Get skills for tier
    const skills = getSkillsByTier(options.skillsTier);

    // Parse models
    const models = options.models.split(',').map((m) => m.trim());

    console.log(chalk.cyan(`Running evals for ${skills.length} skills`));
    console.log(chalk.cyan(`Models: ${models.join(', ')}`));
    console.log(
      chalk.cyan(
        `Mode: ${options.parallel ? `Parallel (${options.workers} workers)` : 'Sequential'}`
      )
    );
    console.log('');

    // Configure runner
    const config = {
      ...DEFAULT_PARALLEL_EVAL_CONFIG,
      maxWorkers: options.parallel ? options.workers : 1,
    };

    const customRunner = createParallelEvalRunner(learner, config);

    // Run all evals
    const results = await customRunner.runMultipleEvalsParallel(skills, models);

    // Flatten results for display
    const allResults: ParallelEvalResult[] = [];
    for (const skillResults of results.values()) {
      allResults.push(...skillResults);
    }

    // Display summary
    console.log(chalk.bold('\nEval Summary'));
    console.log('='.repeat(60));

    let totalPassed = 0;
    let totalFailed = 0;

    for (const result of allResults) {
      const icon = result.passed ? chalk.green('v') : chalk.red('x');
      console.log(
        `${icon} ${result.skill} (${result.model}): ${(result.passRate * 100).toFixed(1)}% ` +
          `(${result.parallelSpeedup.toFixed(2)}x speedup)`
      );
      if (result.passed) totalPassed++;
      else totalFailed++;
    }

    console.log('');
    console.log(
      `Total: ${chalk.green(totalPassed)} passed, ${chalk.red(totalFailed)} failed`
    );

    // Write report if output specified
    if (options.output) {
      const outputPath = path.resolve(options.output);
      const format = outputPath.endsWith('.md') ? 'markdown' : 'json';

      if (format === 'markdown') {
        fs.writeFileSync(outputPath, formatMarkdownReport(allResults));
      } else {
        fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2));
      }

      console.log(chalk.green(`\nReport saved to: ${outputPath}`));
    }

    // Exit with appropriate code
    process.exit(totalFailed === 0 ? 0 : 1);
  } finally {
    await reasoningBank.dispose();
  }
}

async function handleStatusCommand(skill: string): Promise<void> {
  const { learner, reasoningBank } = await initializeRunner();

  try {
    // Get confidence info
    const confidence = await learner.getSkillConfidence(skill);

    if (!confidence) {
      console.log(chalk.yellow(`No validation history found for skill: ${skill}`));
      return;
    }

    console.log(chalk.bold(`\nSkill Validation Status: ${skill}`));
    console.log('='.repeat(50));
    console.log(`Average Score: ${(confidence.avgScore * 100).toFixed(1)}%`);
    console.log(`Trend: ${confidence.trend}`);
    console.log(`Validation Count: ${confidence.outcomes.length}`);
    console.log(`Last Updated: ${confidence.lastUpdated}`);

    if (confidence.byLevel) {
      console.log('\nBy Validation Level:');
      for (const [level, score] of Object.entries(confidence.byLevel)) {
        if (score !== undefined) {
          console.log(`  ${level}: ${(score * 100).toFixed(1)}%`);
        }
      }
    }

    // Get cross-model analysis
    const crossModel = await learner.getCrossModelAnalysis(skill);
    if (crossModel) {
      console.log('\nCross-Model Analysis:');
      console.log(`  Variance: ${(crossModel.variance * 100).toFixed(2)}%`);
      console.log(`  Has Anomalies: ${crossModel.hasAnomalies}`);

      if (crossModel.models) {
        console.log('\n  Model Performance:');
        for (const [model, data] of Object.entries(crossModel.models)) {
          console.log(
            `    ${model}: ${(data.passRate * 100).toFixed(1)}% pass rate (${data.sampleCount} samples)`
          );
        }
      }
    }
  } finally {
    await reasoningBank.dispose();
  }
}

async function handleReportCommand(options: ReportOptions): Promise<void> {
  const { learner, reasoningBank } = await initializeRunner();

  try {
    // Get validation patterns
    const patterns = await learner.queryValidationPatterns(options.skill, 50);

    if (patterns.length === 0) {
      console.log(
        chalk.yellow(`No validation patterns found for skill: ${options.skill}`)
      );
      return;
    }

    // Get learned patterns
    const learnedPatterns = await learner.extractLearnedPatterns(options.skill);

    // Get trends
    const trends = await learner.getValidationTrends(options.skill);

    const report = {
      skill: options.skill,
      generated: new Date().toISOString(),
      patternCount: patterns.length,
      learnedPatterns,
      trends,
    };

    if (options.format === 'json') {
      const output = JSON.stringify(report, null, 2);
      if (options.output) {
        fs.writeFileSync(path.resolve(options.output), output);
        console.log(chalk.green(`Report saved to: ${options.output}`));
      } else {
        console.log(output);
      }
    } else {
      // Markdown format
      const lines: string[] = [];
      lines.push(`# Validation Report: ${options.skill}`);
      lines.push('');
      lines.push(`Generated: ${report.generated}`);
      lines.push('');
      lines.push('## Overview');
      lines.push(`- Patterns Collected: ${report.patternCount}`);
      lines.push(`- Learned Patterns: ${report.learnedPatterns.length}`);
      lines.push('');

      if (report.trends) {
        lines.push('## Trends');
        lines.push(`- Overall: ${report.trends.overall}`);
        lines.push(`- Recent Pass Rate: ${(report.trends.recentPassRate * 100).toFixed(1)}%`);
        lines.push('');
      }

      if (report.learnedPatterns.length > 0) {
        lines.push('## Learned Patterns');
        lines.push('');
        for (const pattern of report.learnedPatterns) {
          lines.push(`### ${pattern.category}`);
          lines.push(`- Confidence: ${(pattern.confidence * 100).toFixed(1)}%`);
          lines.push(`- Observations: ${pattern.observationCount}`);
          lines.push(`- Models: ${pattern.models.join(', ')}`);
          lines.push('');
        }
      }

      const output = lines.join('\n');
      if (options.output) {
        fs.writeFileSync(path.resolve(options.output), output);
        console.log(chalk.green(`Report saved to: ${options.output}`));
      } else {
        console.log(output);
      }
    }
  } finally {
    await reasoningBank.dispose();
  }
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Create eval command group
 */
export function createEvalCommand(): Command {
  const evalCmd = new Command('eval')
    .description('Run skill evaluation suites in parallel');

  // Run single eval
  evalCmd
    .command('run')
    .description('Run eval suite for a single skill')
    .requiredOption('-s, --skill <skill>', 'Skill name to evaluate')
    .requiredOption(
      '-m, --model <model>',
      'Model to use (e.g., claude-3.5-sonnet)'
    )
    .option('-p, --parallel', 'Enable parallel execution', false)
    .option('-w, --workers <n>', 'Number of parallel workers', parseInt, 5)
    .option('-b, --batch-size <n>', 'Test cases per batch', parseInt, 4)
    .option('-t, --timeout <ms>', 'Timeout per test case (ms)', parseInt, 30000)
    .option('--no-retry', 'Disable retry of failed tests')
    .option('-o, --output <path>', 'Output file path for results')
    .option('-v, --verbose', 'Show progress during execution', false)
    .action(async (opts) => {
      await handleRunCommand({
        skill: opts.skill,
        model: opts.model,
        parallel: opts.parallel,
        workers: opts.workers,
        batchSize: opts.batchSize,
        timeout: opts.timeout,
        retry: opts.retry !== false,
        output: opts.output,
        verbose: opts.verbose,
      });
    });

  // Run all evals
  evalCmd
    .command('run-all')
    .description('Run eval suites for multiple skills')
    .option(
      '--skills-tier <tier>',
      'Skill tier (1=all, 2=P0+P1, 3=P0 only)',
      parseInt,
      3
    )
    .option(
      '--models <models>',
      'Comma-separated models to test',
      'claude-3.5-sonnet'
    )
    .option('-p, --parallel', 'Enable parallel execution', true)
    .option('-w, --workers <n>', 'Number of parallel workers', parseInt, 5)
    .option('-o, --output <path>', 'Output file path for report')
    .option('-v, --verbose', 'Show progress during execution', false)
    .action(async (opts) => {
      await handleRunAllCommand({
        skillsTier: opts.skillsTier,
        models: opts.models,
        parallel: opts.parallel,
        workers: opts.workers,
        output: opts.output,
        verbose: opts.verbose,
      });
    });

  // Status command
  evalCmd
    .command('status')
    .description('Show validation status for a skill')
    .requiredOption('-s, --skill <skill>', 'Skill name')
    .action(async (opts) => {
      await handleStatusCommand(opts.skill);
    });

  // Report command
  evalCmd
    .command('report')
    .description('Generate validation report for a skill')
    .requiredOption('-s, --skill <skill>', 'Skill name')
    .option('-f, --format <format>', 'Output format (json|markdown)', 'markdown')
    .option('-o, --output <path>', 'Output file path')
    .action(async (opts) => {
      await handleReportCommand({
        skill: opts.skill,
        format: opts.format as 'json' | 'markdown',
        output: opts.output,
      });
    });

  return evalCmd;
}
