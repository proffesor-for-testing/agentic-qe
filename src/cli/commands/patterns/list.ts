/**
 * Patterns List Command - Query database for test patterns
 *
 * Queries the actual patterns table in the database (not in-memory).
 */

import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { Database } from '../../../utils/Database';

export interface PatternListOptions {
  framework?: string;
  category?: string;
  limit?: number;
  format?: 'table' | 'json';
  minConfidence?: number;
}

export async function patternsList(options: PatternListOptions = {}): Promise<void> {
  const spinner = ora('Loading patterns from database...').start();

  try {
    const dbPath = '.agentic-qe/data/patterns.db';
    const db = new Database(dbPath);
    await db.initialize();

    // Build query with filters
    let sql = 'SELECT * FROM patterns WHERE 1=1';
    const params: any[] = [];

    if (options.framework) {
      sql += ' AND framework = ?';
      params.push(options.framework);
    }

    if (options.category) {
      sql += ' AND category = ?';
      params.push(options.category);
    }

    if (options.minConfidence !== undefined) {
      sql += ' AND confidence >= ?';
      params.push(options.minConfidence);
    }

    // Sort by confidence DESC, then usage_count DESC
    sql += ' ORDER BY confidence DESC, usage_count DESC';

    // Apply limit
    const limit = options.limit || 20;
    sql += ' LIMIT ?';
    params.push(limit);

    const patterns = await db.all(sql, params);

    await db.close();

    if (patterns.length === 0) {
      spinner.info('No patterns found in database');
      console.log(chalk.yellow('\n💡 Tips:'));
      console.log(chalk.gray('  • Run "aqe patterns extract <dir>" to discover patterns from tests'));
      console.log(chalk.gray('  • Patterns are stored in: .agentic-qe/data/patterns.db'));
      console.log(chalk.gray('  • Use --framework and --category to filter results\n'));
      return;
    }

    spinner.succeed(`Found ${patterns.length} patterns`);

    if (options.format === 'json') {
      console.log(JSON.stringify(patterns, null, 2));
      return;
    }

    // Display as table
    console.log(chalk.blue(`\n📦 Test Patterns (${patterns.length} found)\n`));

    const table = new Table({
      head: [
        chalk.cyan('Name'),
        chalk.cyan('Type'),
        chalk.cyan('Framework'),
        chalk.cyan('Confidence'),
        chalk.cyan('Success'),
        chalk.cyan('Usage')
      ],
      colWidths: [30, 12, 12, 12, 10, 8],
      style: {
        head: [],
        border: ['gray']
      }
    });

    patterns.forEach((p: any) => {
      const confidence = formatConfidence(p.confidence);
      const successRate = formatPercentage(p.success_rate);
      const usage = chalk.gray(p.usage_count.toString());

      table.push([
        truncate(p.name, 28),
        p.category,
        p.framework,
        confidence,
        successRate,
        usage
      ]);
    });

    console.log(table.toString());

    // Summary stats
    const avgConfidence = patterns.reduce((sum: number, p: any) => sum + p.confidence, 0) / patterns.length;
    const avgSuccess = patterns.reduce((sum: number, p: any) => sum + p.success_rate, 0) / patterns.length;
    const totalUsage = patterns.reduce((sum: number, p: any) => sum + p.usage_count, 0);

    console.log(chalk.blue('\n📊 Summary:\n'));
    console.log(`  Avg Confidence: ${formatConfidence(avgConfidence)}`);
    console.log(`  Avg Success:    ${formatPercentage(avgSuccess)}`);
    console.log(`  Total Usage:    ${chalk.cyan(totalUsage.toLocaleString())}`);

    if (patterns.length === limit) {
      console.log(chalk.gray(`\n  💡 Showing top ${limit} results. Use --limit to see more.`));
    }

    console.log();

  } catch (error: any) {
    spinner.fail('Failed to load patterns');
    console.error(chalk.red('❌ Error:'), error.message);
    console.log(chalk.gray('\n💡 Make sure database exists: .agentic-qe/data/patterns.db'));
    process.exit(1);
  }
}

// Helper functions

function formatConfidence(confidence: number): string {
  const percentage = (confidence * 100).toFixed(0) + '%';
  if (confidence >= 0.9) return chalk.green(percentage);
  if (confidence >= 0.7) return chalk.cyan(percentage);
  if (confidence >= 0.5) return chalk.yellow(percentage);
  return chalk.red(percentage);
}

function formatPercentage(value: number): string {
  const percentage = (value * 100).toFixed(0) + '%';
  if (value >= 0.9) return chalk.green(percentage);
  if (value >= 0.7) return chalk.cyan(percentage);
  return chalk.yellow(percentage);
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}
