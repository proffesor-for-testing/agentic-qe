/**
 * Patterns Search Command - Full-text search in patterns
 *
 * Searches pattern names, descriptions, and tags using SQL LIKE.
 */

import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { Database } from '../../../utils/Database';

export interface PatternSearchOptions {
  framework?: string;
  minConfidence?: number;
  limit?: number;
  format?: 'table' | 'json';
}

interface PatternRow {
  id: string;
  name: string;
  description: string;
  category: string;
  framework: string;
  confidence: number;
  success_rate: number;
  usage_count: number;
}

export async function patternsSearch(query: string, options: PatternSearchOptions = {}): Promise<void> {
  if (!query) {
    console.error(chalk.red('❌ Search query is required'));
    console.log(chalk.gray('Example: aqe patterns search "api validation"'));
    process.exit(1);
  }

  const spinner = ora(`Searching for "${query}"...`).start();

  try {
    const dbPath = '.agentic-qe/data/patterns.db';
    const db = new Database(dbPath);
    await db.initialize();

    // Build search query (name, description, or template contains search terms)
    const searchPattern = `%${query}%`;
    let sql = `
      SELECT *,
        CASE
          WHEN name LIKE ? THEN 3
          WHEN description LIKE ? THEN 2
          WHEN template LIKE ? THEN 1
          ELSE 0
        END as relevance
      FROM patterns
      WHERE (name LIKE ? OR description LIKE ? OR template LIKE ? OR examples LIKE ?)
    `;

    const params: (string | number)[] = [
      searchPattern, searchPattern, searchPattern,  // for CASE
      searchPattern, searchPattern, searchPattern, searchPattern  // for WHERE
    ];

    if (options.framework) {
      sql += ' AND framework = ?';
      params.push(options.framework);
    }

    if (options.minConfidence !== undefined) {
      sql += ' AND confidence >= ?';
      params.push(options.minConfidence);
    }

    // Sort by relevance, then confidence
    sql += ' ORDER BY relevance DESC, confidence DESC';

    const limit = options.limit || 10;
    sql += ' LIMIT ?';
    params.push(limit);

    const patterns = await db.all<PatternRow>(sql, params);

    await db.close();

    if (patterns.length === 0) {
      spinner.info('No matching patterns found');
      console.log(chalk.yellow('\n💡 Try:'));
      console.log(chalk.gray('  • Using broader search terms'));
      console.log(chalk.gray('  • Removing --framework or --min-confidence filters'));
      console.log(chalk.gray('  • Running "aqe patterns list" to see all available patterns\n'));
      return;
    }

    spinner.succeed(`Found ${patterns.length} matching patterns`);

    if (options.format === 'json') {
      console.log(JSON.stringify(patterns, null, 2));
      return;
    }

    // Display search results
    console.log(chalk.blue(`\n🔍 Search Results for "${query}"\n`));

    patterns.forEach((p, index: number) => {
      const prefix = index === patterns.length - 1 ? '└─' : '├─';

      console.log(`${prefix} ${chalk.cyan(p.name)}`);
      console.log(`   ├─ ${chalk.gray(truncate(p.description, 70))}`);
      console.log(`   ├─ Type: ${p.category} | Framework: ${p.framework}`);
      console.log(`   ├─ Confidence: ${formatConfidence(p.confidence)} | Success: ${formatPercentage(p.success_rate)}`);
      console.log(`   ├─ Usage: ${chalk.gray(p.usage_count + ' times')}`);
      console.log(`   └─ ID: ${chalk.gray(p.id)}`);
      console.log();
    });

    // Show stats
    const avgConfidence = patterns.reduce((sum: number, p) => sum + p.confidence, 0) / patterns.length;
    console.log(chalk.blue('📊 Results Summary:\n'));
    console.log(`  Matches: ${chalk.cyan(patterns.length)}`);
    console.log(`  Avg Confidence: ${formatConfidence(avgConfidence)}`);

    if (patterns.length === limit) {
      console.log(chalk.gray(`\n  💡 Showing top ${limit} results. Use --limit to see more.`));
    }

    console.log();

  } catch (error) {
    spinner.fail('Search failed');
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red('❌ Error:'), message);
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
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}
