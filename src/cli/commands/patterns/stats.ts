/**
 * Patterns Stats Command - Display pattern database statistics
 *
 * Shows comprehensive statistics about stored patterns.
 */

import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { Database } from '../../../utils/Database';

export interface PatternStatsOptions {
  framework?: string;
  detailed?: boolean;
}

export async function patternsStats(options: PatternStatsOptions = {}): Promise<void> {
  const spinner = ora('Calculating pattern statistics...').start();

  try {
    const dbPath = '.agentic-qe/data/patterns.db';
    const db = new Database(dbPath);
    await db.initialize();

    // Get overall stats
    const overallStats = await db.get(`
      SELECT
        COUNT(*) as total_patterns,
        AVG(confidence) as avg_confidence,
        AVG(success_rate) as avg_success_rate,
        AVG(quality) as avg_quality,
        SUM(usage_count) as total_usage
      FROM patterns
    `);

    // Get stats by category
    const categoryStats = await db.all(`
      SELECT
        category,
        COUNT(*) as count,
        AVG(confidence) as avg_confidence,
        AVG(success_rate) as avg_success_rate
      FROM patterns
      GROUP BY category
      ORDER BY count DESC
    `);

    // Get stats by framework
    const frameworkStats = await db.all(`
      SELECT
        framework,
        COUNT(*) as count,
        AVG(confidence) as avg_confidence
      FROM patterns
      GROUP BY framework
      ORDER BY count DESC
    `);

    // Get top patterns
    const topPatterns = await db.all(`
      SELECT name, category, confidence, usage_count
      FROM patterns
      ORDER BY usage_count DESC, confidence DESC
      LIMIT 5
    `);

    // Get recent patterns
    const recentPatterns = await db.all(`
      SELECT name, category, created_at
      FROM patterns
      ORDER BY created_at DESC
      LIMIT 5
    `);

    await db.close();

    spinner.succeed('Statistics calculated');

    // Display results
    console.log(chalk.blue('\n📊 Pattern Bank Statistics\n'));

    // Overall metrics
    console.log(chalk.cyan('Overall Metrics:'));
    console.log(`  Total Patterns:    ${chalk.green(overallStats?.total_patterns?.toLocaleString() || '0')}`);
    console.log(`  Avg Confidence:    ${formatConfidence(overallStats?.avg_confidence || 0)}`);
    console.log(`  Avg Success Rate:  ${formatPercentage(overallStats?.avg_success_rate || 0)}`);
    console.log(`  Avg Quality:       ${formatQuality(overallStats?.avg_quality || 0)}`);
    console.log(`  Total Usage:       ${chalk.cyan(overallStats?.total_usage?.toLocaleString() || '0')}`);
    console.log();

    // By category
    if (categoryStats.length > 0) {
      console.log(chalk.blue('📦 By Category:\n'));

      const categoryTable = new Table({
        head: [
          chalk.cyan('Category'),
          chalk.cyan('Count'),
          chalk.cyan('Avg Confidence'),
          chalk.cyan('Avg Success')
        ],
        colWidths: [15, 10, 18, 15],
        style: {
          head: [],
          border: ['gray']
        }
      });

      categoryStats.forEach((stat: any) => {
        categoryTable.push([
          stat.category,
          chalk.cyan(stat.count),
          formatConfidence(stat.avg_confidence),
          formatPercentage(stat.avg_success_rate)
        ]);
      });

      console.log(categoryTable.toString());
      console.log();
    }

    // By framework
    if (frameworkStats.length > 0) {
      console.log(chalk.blue('🔧 By Framework:\n'));

      const frameworkTable = new Table({
        head: [
          chalk.cyan('Framework'),
          chalk.cyan('Count'),
          chalk.cyan('Avg Confidence')
        ],
        colWidths: [15, 10, 18],
        style: {
          head: [],
          border: ['gray']
        }
      });

      frameworkStats.forEach((stat: any) => {
        frameworkTable.push([
          stat.framework,
          chalk.cyan(stat.count),
          formatConfidence(stat.avg_confidence)
        ]);
      });

      console.log(frameworkTable.toString());
      console.log();
    }

    // Top patterns
    if (topPatterns.length > 0) {
      console.log(chalk.blue('🏆 Top Patterns (by usage):\n'));

      topPatterns.forEach((p: any, index: number) => {
        const prefix = index === topPatterns.length - 1 ? '└─' : '├─';
        console.log(`${prefix} ${chalk.cyan(p.name)}`);
        console.log(`   ├─ Type: ${p.category}`);
        console.log(`   ├─ Confidence: ${formatConfidence(p.confidence)}`);
        console.log(`   └─ Usage: ${chalk.yellow(p.usage_count.toLocaleString())} times`);
      });
      console.log();
    }

    // Recent patterns
    if (options.detailed && recentPatterns.length > 0) {
      console.log(chalk.blue('🆕 Recently Added:\n'));

      recentPatterns.forEach((p: any, index: number) => {
        const prefix = index === recentPatterns.length - 1 ? '└─' : '├─';
        const date = new Date(p.created_at).toLocaleDateString();
        console.log(`${prefix} ${chalk.cyan(p.name)} (${p.category}) - ${chalk.gray(date)}`);
      });
      console.log();
    }

    // Database info
    console.log(chalk.blue('💾 Database Info:\n'));
    console.log(`  Location: ${chalk.gray(dbPath)}`);

    try {
      const stats = await import('fs').then(fs => fs.promises.stat(dbPath));
      const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`  Size:     ${chalk.cyan(sizeInMB + ' MB')}`);
    } catch (error) {
      console.log(`  Size:     ${chalk.gray('Unknown')}`);
    }

    console.log();

  } catch (error: any) {
    spinner.fail('Failed to calculate statistics');
    console.error(chalk.red('❌ Error:'), error.message);
    console.log(chalk.gray('\n💡 Make sure database exists: .agentic-qe/data/patterns.db'));
    process.exit(1);
  }
}

// Helper functions

function formatConfidence(confidence: number | null): string {
  if (confidence === null || confidence === undefined) return chalk.gray('N/A');
  const percentage = (confidence * 100).toFixed(0) + '%';
  if (confidence >= 0.9) return chalk.green(percentage);
  if (confidence >= 0.7) return chalk.cyan(percentage);
  if (confidence >= 0.5) return chalk.yellow(percentage);
  return chalk.red(percentage);
}

function formatPercentage(value: number | null): string {
  if (value === null || value === undefined) return chalk.gray('N/A');
  const percentage = (value * 100).toFixed(0) + '%';
  if (value >= 0.9) return chalk.green(percentage);
  if (value >= 0.7) return chalk.cyan(percentage);
  return chalk.yellow(percentage);
}

function formatQuality(quality: number | null): string {
  if (quality === null || quality === undefined) return chalk.gray('N/A');
  const percentage = (quality * 100).toFixed(0) + '%';
  if (quality >= 0.9) return chalk.green(percentage);
  if (quality >= 0.7) return chalk.cyan(percentage);
  if (quality >= 0.5) return chalk.yellow(percentage);
  return chalk.red(percentage);
}
