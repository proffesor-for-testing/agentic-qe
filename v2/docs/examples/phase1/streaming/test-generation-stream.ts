/**
 * Test Generation Streaming Example
 *
 * This example demonstrates real-time streaming of test generation progress.
 */

import { FleetManager, TestGenerationStream } from 'agentic-qe';
import ProgressBar from 'progress';
import chalk from 'chalk';

async function streamingTestGeneration() {
  const fleet = new FleetManager({
    features: {
      streamingTools: true
    }
  });

  await fleet.initialize();

  console.log(chalk.bold('\n=== Streaming Test Generation ===\n'));

  // Create streaming request
  const stream = await fleet.streamTestGeneration({
    sourceFile: 'src/services/user-service.ts',
    framework: 'jest',
    testTypes: ['unit', 'integration'],
    targetCoverage: 95
  });

  // Progress bar
  const progressBar = new ProgressBar(
    chalk.cyan('Generating [:bar] :percent :etas'),
    {
      total: 100,
      width: 40,
      complete: '█',
      incomplete: '░'
    }
  );

  // Track statistics
  const stats = {
    testsGenerated: 0,
    filesAnalyzed: 0,
    startTime: Date.now()
  };

  // Listen for progress updates
  stream.on('progress', (update) => {
    progressBar.update(update.progress / 100);
  });

  // Listen for file analysis
  stream.on('file:analyzed', (file) => {
    stats.filesAnalyzed++;
    console.log(chalk.blue(`\n✓ Analyzed: ${file.path}`));
    console.log(chalk.gray(`  Functions: ${file.functions}`));
    console.log(chalk.gray(`  Classes: ${file.classes}`));
  });

  // Listen for test generation
  stream.on('test:generated', (test) => {
    stats.testsGenerated++;
    console.log(chalk.green(`\n✓ ${test.name}`));
    console.log(chalk.gray(`  Type: ${test.type}`));
    console.log(chalk.gray(`  Assertions: ${test.assertionCount}`));
  });

  // Listen for coverage calculations
  stream.on('coverage:calculated', (coverage) => {
    console.log(chalk.yellow(`\n📊 Coverage: ${coverage.percentage.toFixed(1)}%`));
    console.log(chalk.gray(`  Lines: ${coverage.lines.covered}/${coverage.lines.total}`));
    console.log(chalk.gray(`  Functions: ${coverage.functions.covered}/${coverage.functions.total}`));
  });

  // Listen for metrics updates
  stream.on('metrics', (metrics) => {
    console.log(chalk.magenta('\n📈 Metrics:'));
    console.log(chalk.gray(`  Memory: ${metrics.memory} MB`));
    console.log(chalk.gray(`  Duration: ${metrics.elapsed}ms`));
  });

  // Handle errors
  stream.on('error', (error) => {
    console.error(chalk.red(`\n✗ Error: ${error.message}`));
  });

  try {
    // Wait for completion
    const result = await stream.complete();

    // Final statistics
    const duration = Date.now() - stats.startTime;
    progressBar.terminate();

    console.log(chalk.bold('\n\n=== Results ===\n'));
    console.log(chalk.green('✓ Test generation complete!'));
    console.log(chalk.gray(`\n  Generated: ${result.testCount} tests`));
    console.log(chalk.gray(`  Coverage: ${result.coverage.toFixed(1)}%`));
    console.log(chalk.gray(`  Duration: ${(duration / 1000).toFixed(1)}s`));
    console.log(chalk.gray(`  Avg: ${(duration / result.testCount).toFixed(0)}ms/test`));

    // Cost information
    if (result.metadata.cost) {
      console.log(chalk.yellow(`\n  Model: ${result.metadata.modelUsed}`));
      console.log(chalk.yellow(`  Cost: $${result.metadata.cost.toFixed(4)}`));
    }

    // Files generated
    console.log(chalk.cyan('\n  Generated Files:'));
    result.files.forEach(file => {
      console.log(chalk.gray(`    - ${file}`));
    });

  } finally {
    // Clean up
    stream.removeAllListeners();
  }
}

// Run the example
streamingTestGeneration().catch(console.error);

/**
 * Expected Output:
 *
 * === Streaming Test Generation ===
 *
 * Generating [████████████████████░░░░░░░░░░░░] 50% 00:03
 *
 * ✓ Analyzed: src/services/user-service.ts
 *   Functions: 12
 *   Classes: 1
 *
 * ✓ should create user with valid data
 *   Type: unit
 *   Assertions: 3
 *
 * ✓ should validate email format
 *   Type: unit
 *   Assertions: 2
 *
 * ✓ should reject invalid user data
 *   Type: unit
 *   Assertions: 4
 *
 * ✓ should update user profile
 *   Type: integration
 *   Assertions: 5
 *
 * 📊 Coverage: 85.2%
 *   Lines: 142/167
 *   Functions: 10/12
 *
 * 📈 Metrics:
 *   Memory: 145 MB
 *   Duration: 3200ms
 *
 * === Results ===
 *
 * ✓ Test generation complete!
 *
 *   Generated: 24 tests
 *   Coverage: 95.3%
 *   Duration: 6.4s
 *   Avg: 267ms/test
 *
 *   Model: gpt-4
 *   Cost: $0.0842
 *
 *   Generated Files:
 *     - tests/services/user-service.test.ts
 *     - tests/services/user-service.integration.test.ts
 */
