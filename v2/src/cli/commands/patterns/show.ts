/**
 * Patterns Show Command - Display detailed pattern information
 *
 * Shows full pattern details including template and examples.
 */

import chalk from 'chalk';
import ora from 'ora';
import { Database } from '../../../utils/Database';

/**
 * Pattern row from database
 */
interface PatternRow {
  id: string;
  name: string;
  description: string;
  category: string;
  framework: string;
  language: string;
  template: string;
  examples: string;
  confidence: number;
  success_rate: number;
  quality: number | null;
  usage_count: number;
  metadata: string;
  created_at: string;
  updated_at: string;
}

/**
 * Pattern usage stats row from database
 */
interface PatternUsageStatsRow {
  total_uses: number;
  successful: number;
  failed: number;
  avg_exec_time: number | null;
  last_used: string | null;
}

export async function patternsShow(patternId: string): Promise<void> {
  if (!patternId) {
    console.error(chalk.red('❌ Pattern ID is required'));
    console.log(chalk.gray('Example: aqe patterns show pattern-12345'));
    console.log(chalk.gray('Use "aqe patterns list" to find pattern IDs'));
    process.exit(1);
  }

  const spinner = ora(`Loading pattern ${patternId}...`).start();

  try {
    const dbPath = '.agentic-qe/data/patterns.db';
    const db = new Database(dbPath);
    await db.initialize();

    const pattern = await db.get<PatternRow>('SELECT * FROM patterns WHERE id = ?', [patternId]);

    await db.close();

    if (!pattern) {
      spinner.fail('Pattern not found');
      console.log(chalk.yellow(`\n⚠️  No pattern found with ID: ${patternId}`));
      console.log(chalk.gray('Use "aqe patterns list" to see available patterns\n'));
      return;
    }

    spinner.succeed('Pattern loaded');

    // Parse JSON fields
    const examples: string[] = JSON.parse(pattern.examples);
    const metadata: { tags?: string[]; version?: string } = JSON.parse(pattern.metadata);

    // Display pattern details
    console.log(chalk.blue('\n📋 Pattern Details\n'));
    console.log(`${chalk.cyan('ID:')}          ${pattern.id}`);
    console.log(`${chalk.cyan('Name:')}        ${pattern.name}`);
    console.log(`${chalk.cyan('Description:')} ${pattern.description}`);
    console.log();

    console.log(chalk.blue('📦 Classification\n'));
    console.log(`  Category:   ${chalk.cyan(pattern.category)}`);
    console.log(`  Framework:  ${chalk.cyan(pattern.framework)}`);
    console.log(`  Language:   ${chalk.cyan(pattern.language)}`);
    console.log();

    console.log(chalk.blue('📊 Metrics\n'));
    console.log(`  Confidence:    ${formatConfidence(pattern.confidence)}`);
    console.log(`  Success Rate:  ${formatPercentage(pattern.success_rate)}`);
    console.log(`  Quality Score: ${formatQuality(pattern.quality)}`);
    console.log(`  Usage Count:   ${chalk.cyan(pattern.usage_count.toLocaleString())}`);
    console.log();

    console.log(chalk.blue('📝 Template\n'));
    console.log(chalk.gray('─'.repeat(70)));
    console.log(pattern.template);
    console.log(chalk.gray('─'.repeat(70)));
    console.log();

    if (examples && examples.length > 0) {
      console.log(chalk.blue(`💡 Examples (${examples.length})\n`));
      examples.forEach((example: string, index: number) => {
        console.log(chalk.cyan(`Example ${index + 1}:`));
        console.log(chalk.gray('─'.repeat(70)));
        console.log(example);
        console.log(chalk.gray('─'.repeat(70)));
        console.log();
      });
    }

    if (metadata.tags && metadata.tags.length > 0) {
      console.log(chalk.blue('🏷️  Tags\n'));
      console.log(`  ${metadata.tags.map((t) => chalk.cyan(t)).join(', ')}`);
      console.log();
    }

    console.log(chalk.blue('⏰ Timestamps\n'));
    console.log(`  Created: ${chalk.gray(new Date(pattern.created_at).toLocaleString())}`);
    console.log(`  Updated: ${chalk.gray(new Date(pattern.updated_at).toLocaleString())}`);
    console.log(`  Version: ${chalk.gray(metadata.version || '1.0.0')}`);
    console.log();

    // Show usage stats if available
    const usageStats = await getUsageStats(patternId);
    if (usageStats.totalUses > 0) {
      console.log(chalk.blue('📈 Usage Statistics\n'));
      console.log(`  Total Uses:      ${chalk.cyan(usageStats.totalUses.toLocaleString())}`);
      console.log(`  Successful:      ${chalk.green(usageStats.successful.toLocaleString())}`);
      console.log(`  Failed:          ${chalk.red(usageStats.failed.toLocaleString())}`);
      console.log(`  Avg Exec Time:   ${chalk.cyan(usageStats.avgExecTime.toFixed(0) + 'ms')}`);
      console.log(`  Last Used:       ${chalk.gray(new Date(usageStats.lastUsed).toLocaleString())}`);
      console.log();
    }

  } catch (error: unknown) {
    spinner.fail('Failed to load pattern');
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red('❌ Error:'), errorMessage);
    process.exit(1);
  }
}

async function getUsageStats(patternId: string): Promise<{
  totalUses: number;
  successful: number;
  failed: number;
  avgExecTime: number;
  lastUsed: string;
}> {
  try {
    const dbPath = '.agentic-qe/data/patterns.db';
    const db = new Database(dbPath);
    await db.initialize();

    const stats = await db.get<PatternUsageStatsRow>(`
      SELECT
        COUNT(*) as total_uses,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed,
        AVG(execution_time_ms) as avg_exec_time,
        MAX(used_at) as last_used
      FROM pattern_usage
      WHERE pattern_id = ?
    `, [patternId]);

    await db.close();

    return {
      totalUses: Number(stats?.total_uses) || 0,
      successful: Number(stats?.successful) || 0,
      failed: Number(stats?.failed) || 0,
      avgExecTime: Number(stats?.avg_exec_time) || 0,
      lastUsed: String(stats?.last_used ?? new Date().toISOString())
    };
  } catch (error) {
    return {
      totalUses: 0,
      successful: 0,
      failed: 0,
      avgExecTime: 0,
      lastUsed: new Date().toISOString()
    };
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

function formatQuality(quality: number | null): string {
  if (quality === null || quality === undefined) return chalk.gray('N/A');
  const percentage = (quality * 100).toFixed(0) + '%';
  if (quality >= 0.9) return chalk.green(percentage);
  if (quality >= 0.7) return chalk.cyan(percentage);
  if (quality >= 0.5) return chalk.yellow(percentage);
  return chalk.red(percentage);
}
