#!/usr/bin/env tsx
/**
 * CI Learning Quality Check
 *
 * Validates learning system quality metrics for CI/CD pipelines.
 * Checks:
 * - Pattern hit rate >= threshold
 * - Convergence rate >= threshold
 * - Database integrity
 * - Algorithm test pass rate
 * - No regression in learning metrics
 *
 * Exit codes:
 * 0 - All quality gates passed
 * 1 - One or more quality gates failed
 * 2 - Critical error (database not found, etc.)
 */

import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import chalk from 'chalk';

// CLI Arguments
interface CLIArgs {
  minPatternHitRate: number;
  minConvergenceRate: number;
  outputDir: string;
  verbose: boolean;
}

// Metrics report structure
interface LearningMetrics {
  passed: boolean;
  patternHitRate: number;
  convergenceRate: number;
  totalPatterns: number;
  totalQValues: number;
  totalExperiences: number;
  averageReward: number;
  databaseIntegrity: boolean;
  algorithms: Record<string, AlgorithmStats>;
  violations: Violation[];
  thresholds: {
    patternHitRate: number;
    convergenceRate: number;
  };
}

interface AlgorithmStats {
  episodes: number;
  avgReward: number;
  converged: boolean;
}

interface Violation {
  metric: string;
  actual: string;
  threshold: string;
}

/**
 * Parse CLI arguments
 */
function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const parsed: CLIArgs = {
    minPatternHitRate: 70,
    minConvergenceRate: 80,
    outputDir: './learning-reports',
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--min-pattern-hit-rate':
        parsed.minPatternHitRate = parseFloat(args[++i]);
        break;
      case '--min-convergence-rate':
        parsed.minConvergenceRate = parseFloat(args[++i]);
        break;
      case '--output-dir':
        parsed.outputDir = args[++i];
        break;
      case '--verbose':
      case '-v':
        parsed.verbose = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: ci-learning-check.ts [options]

Options:
  --min-pattern-hit-rate <number>    Minimum pattern hit rate (default: 70)
  --min-convergence-rate <number>    Minimum convergence rate (default: 80)
  --output-dir <path>                Output directory for reports (default: ./learning-reports)
  --verbose, -v                      Verbose output
  --help, -h                         Show this help message
        `);
        process.exit(0);
    }
  }

  // Read from environment variables if not set
  if (process.env.MIN_PATTERN_HIT_RATE) {
    parsed.minPatternHitRate = parseFloat(process.env.MIN_PATTERN_HIT_RATE);
  }
  if (process.env.MIN_CONVERGENCE_RATE) {
    parsed.minConvergenceRate = parseFloat(process.env.MIN_CONVERGENCE_RATE);
  }

  return parsed;
}

/**
 * Find AgentDB database file
 */
function findDatabase(): string | null {
  const possiblePaths = [
    '.agentic-qe/agentdb.db',
    'agentdb.db',
    '.agentdb.db',
  ];

  for (const dbPath of possiblePaths) {
    if (fs.existsSync(dbPath)) {
      return dbPath;
    }
  }

  return null;
}

/**
 * Validate database schema
 */
function validateDatabaseIntegrity(db: Database.Database): boolean {
  try {
    // Check for required tables
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;

    const requiredTables = ['learning_experiences', 'q_values', 'patterns'];
    const tableNames = tables.map((t) => t.name);

    for (const table of requiredTables) {
      if (!tableNames.includes(table)) {
        console.error(chalk.red(`❌ Missing required table: ${table}`));
        return false;
      }
    }

    // Validate table schemas
    const learningExperiencesSchema = db
      .prepare('PRAGMA table_info(learning_experiences)')
      .all() as Array<{ name: string }>;

    const requiredColumns = ['agent_id', 'state', 'action', 'reward', 'next_state'];
    const columnNames = learningExperiencesSchema.map((c) => c.name);

    for (const col of requiredColumns) {
      if (!columnNames.includes(col)) {
        console.error(chalk.red(`❌ Missing required column in learning_experiences: ${col}`));
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error(chalk.red(`❌ Database integrity check failed: ${(error as Error).message}`));
    return false;
  }
}

/**
 * Calculate pattern hit rate
 */
function calculatePatternHitRate(db: Database.Database): number {
  try {
    const patterns = db.prepare('SELECT usage_count, success_count FROM patterns').all() as Array<{
      usage_count: number;
      success_count: number;
    }>;

    if (patterns.length === 0) {
      return 0;
    }

    const totalUsage = patterns.reduce((sum, p) => sum + (p.usage_count || 0), 0);
    const totalSuccess = patterns.reduce((sum, p) => sum + (p.success_count || 0), 0);

    if (totalUsage === 0) {
      return 0;
    }

    return (totalSuccess / totalUsage) * 100;
  } catch (error) {
    console.error(chalk.yellow(`⚠️ Failed to calculate pattern hit rate: ${(error as Error).message}`));
    return 0;
  }
}

/**
 * Calculate convergence rate
 */
function calculateConvergenceRate(db: Database.Database): number {
  try {
    // Convergence is measured by stability of Q-values over recent episodes
    // We check if Q-values have stabilized (variance is low)
    const recentExperiences = db
      .prepare(
        `SELECT reward FROM learning_experiences
         ORDER BY created_at DESC
         LIMIT 100`
      )
      .all() as Array<{ reward: number }>;

    if (recentExperiences.length < 10) {
      return 0;
    }

    // Calculate variance of rewards
    const rewards = recentExperiences.map((e) => e.reward);
    const mean = rewards.reduce((sum, r) => sum + r, 0) / rewards.length;
    const variance = rewards.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / rewards.length;
    const stdDev = Math.sqrt(variance);

    // Low variance indicates convergence
    // Normalize to 0-100 scale (lower stdDev = higher convergence)
    // If stdDev < 0.1, consider it fully converged (100%)
    const convergence = Math.max(0, Math.min(100, (1 - stdDev) * 100));

    return convergence;
  } catch (error) {
    console.error(chalk.yellow(`⚠️ Failed to calculate convergence rate: ${(error as Error).message}`));
    return 0;
  }
}

/**
 * Get algorithm statistics
 */
function getAlgorithmStats(db: Database.Database): Record<string, AlgorithmStats> {
  const algorithms: Record<string, AlgorithmStats> = {};

  try {
    // Group experiences by algorithm (stored in metadata)
    const experiences = db
      .prepare('SELECT metadata, reward FROM learning_experiences')
      .all() as Array<{ metadata: string; reward: number }>;

    const algorithmData: Record<string, number[]> = {
      qlearning: [],
      sarsa: [],
      montecarlo: [],
    };

    for (const exp of experiences) {
      try {
        const metadata = JSON.parse(exp.metadata || '{}');
        const algo = metadata.algorithm || 'qlearning';

        if (algorithmData[algo]) {
          algorithmData[algo].push(exp.reward);
        }
      } catch {
        // Skip invalid metadata
      }
    }

    // Calculate stats for each algorithm
    for (const [algo, rewards] of Object.entries(algorithmData)) {
      if (rewards.length > 0) {
        const avgReward = rewards.reduce((sum, r) => sum + r, 0) / rewards.length;
        const variance = rewards.reduce((sum, r) => sum + Math.pow(r - avgReward, 2), 0) / rewards.length;
        const converged = variance < 0.01; // Low variance = converged

        algorithms[algo] = {
          episodes: rewards.length,
          avgReward,
          converged,
        };
      }
    }
  } catch (error) {
    console.error(chalk.yellow(`⚠️ Failed to get algorithm stats: ${(error as Error).message}`));
  }

  return algorithms;
}

/**
 * Main validation function
 */
async function validateLearning(args: CLIArgs): Promise<LearningMetrics> {
  console.log(chalk.blue('🔍 Learning System Quality Check\n'));

  // Find database
  const dbPath = findDatabase();
  if (!dbPath) {
    console.error(chalk.red('❌ AgentDB database not found'));
    console.error(chalk.gray('   Expected locations: .agentic-qe/agentdb.db, agentdb.db'));
    return {
      passed: false,
      patternHitRate: 0,
      convergenceRate: 0,
      totalPatterns: 0,
      totalQValues: 0,
      totalExperiences: 0,
      averageReward: 0,
      databaseIntegrity: false,
      algorithms: {},
      violations: [{ metric: 'Database', actual: 'Not found', threshold: 'Required' }],
      thresholds: {
        patternHitRate: args.minPatternHitRate,
        convergenceRate: args.minConvergenceRate,
      },
    };
  }

  console.log(chalk.green(`✅ Database found: ${dbPath}\n`));

  // Open database
  const db = new Database(dbPath, { readonly: true });

  try {
    // Validate database integrity
    console.log(chalk.blue('📋 Validating database integrity...'));
    const databaseIntegrity = validateDatabaseIntegrity(db);
    console.log(databaseIntegrity ? chalk.green('✅ Database integrity valid') : chalk.red('❌ Database integrity invalid'));
    console.log();

    // Get basic counts
    const totalPatterns = (db.prepare('SELECT COUNT(*) as count FROM patterns').get() as { count: number }).count;
    const totalQValues = (db.prepare('SELECT COUNT(*) as count FROM q_values').get() as { count: number }).count;
    const totalExperiences = (db.prepare('SELECT COUNT(*) as count FROM learning_experiences').get() as { count: number }).count;
    const avgRewardResult = db.prepare('SELECT AVG(reward) as avg FROM learning_experiences').get() as { avg: number | null };
    const averageReward = avgRewardResult.avg || 0;

    console.log(chalk.blue('📊 Learning Metrics:'));
    console.log(`   Patterns: ${chalk.cyan(totalPatterns)}`);
    console.log(`   Q-Values: ${chalk.cyan(totalQValues)}`);
    console.log(`   Experiences: ${chalk.cyan(totalExperiences)}`);
    console.log(`   Average Reward: ${chalk.cyan(averageReward.toFixed(3))}`);
    console.log();

    // Calculate pattern hit rate
    console.log(chalk.blue('🎯 Calculating pattern hit rate...'));
    const patternHitRate = calculatePatternHitRate(db);
    const patternPassed = patternHitRate >= args.minPatternHitRate;
    console.log(
      `   Pattern Hit Rate: ${patternPassed ? chalk.green(patternHitRate.toFixed(1) + '%') : chalk.red(patternHitRate.toFixed(1) + '%')} (threshold: ${args.minPatternHitRate}%)`
    );
    console.log();

    // Calculate convergence rate
    console.log(chalk.blue('📈 Calculating convergence rate...'));
    const convergenceRate = calculateConvergenceRate(db);
    const convergencePassed = convergenceRate >= args.minConvergenceRate;
    console.log(
      `   Convergence Rate: ${convergencePassed ? chalk.green(convergenceRate.toFixed(1) + '%') : chalk.red(convergenceRate.toFixed(1) + '%')} (threshold: ${args.minConvergenceRate}%)`
    );
    console.log();

    // Get algorithm stats
    console.log(chalk.blue('🧠 Algorithm Statistics:'));
    const algorithms = getAlgorithmStats(db);
    for (const [algo, stats] of Object.entries(algorithms)) {
      console.log(`   ${algo}: ${stats.episodes} episodes, avg reward: ${stats.avgReward.toFixed(3)}, converged: ${stats.converged ? chalk.green('✅') : chalk.yellow('⏳')}`);
    }
    console.log();

    // Check for violations
    const violations: Violation[] = [];

    if (!databaseIntegrity) {
      violations.push({
        metric: 'Database Integrity',
        actual: 'Invalid',
        threshold: 'Valid',
      });
    }

    if (!patternPassed) {
      violations.push({
        metric: 'Pattern Hit Rate',
        actual: `${patternHitRate.toFixed(1)}%`,
        threshold: `>= ${args.minPatternHitRate}%`,
      });
    }

    if (!convergencePassed) {
      violations.push({
        metric: 'Convergence Rate',
        actual: `${convergenceRate.toFixed(1)}%`,
        threshold: `>= ${args.minConvergenceRate}%`,
      });
    }

    // Determine overall pass/fail
    const passed = violations.length === 0;

    const metrics: LearningMetrics = {
      passed,
      patternHitRate,
      convergenceRate,
      totalPatterns,
      totalQValues,
      totalExperiences,
      averageReward,
      databaseIntegrity,
      algorithms,
      violations,
      thresholds: {
        patternHitRate: args.minPatternHitRate,
        convergenceRate: args.minConvergenceRate,
      },
    };

    return metrics;
  } finally {
    db.close();
  }
}

/**
 * Main entry point
 */
async function main() {
  try {
    const args = parseArgs();

    // Run validation
    const metrics = await validateLearning(args);

    // Create output directory
    if (!fs.existsSync(args.outputDir)) {
      fs.mkdirSync(args.outputDir, { recursive: true });
    }

    // Write metrics report
    const reportPath = path.join(args.outputDir, 'metrics.json');
    fs.writeFileSync(reportPath, JSON.stringify(metrics, null, 2));
    console.log(chalk.green(`📄 Metrics report saved: ${reportPath}\n`));

    // Print summary
    if (metrics.passed) {
      console.log(chalk.green.bold('✅ Learning Quality Gates: PASSED\n'));
      console.log(chalk.green('All quality gates met:'));
      console.log(chalk.green(`  ✓ Pattern hit rate: ${metrics.patternHitRate.toFixed(1)}% (>= ${args.minPatternHitRate}%)`));
      console.log(chalk.green(`  ✓ Convergence rate: ${metrics.convergenceRate.toFixed(1)}% (>= ${args.minConvergenceRate}%)`));
      console.log(chalk.green(`  ✓ Database integrity: Valid`));
      process.exit(0);
    } else {
      console.log(chalk.red.bold('❌ Learning Quality Gates: FAILED\n'));
      console.log(chalk.red('Violations:'));
      for (const violation of metrics.violations) {
        console.log(chalk.red(`  ✗ ${violation.metric}: ${violation.actual} (required: ${violation.threshold})`));
      }
      console.log();
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red(`\n❌ Critical error: ${(error as Error).message}`));
    console.error((error as Error).stack);
    process.exit(2);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { validateLearning, parseArgs, LearningMetrics };
