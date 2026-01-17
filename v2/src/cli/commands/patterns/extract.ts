/**
 * Patterns Extract Command - Extract patterns from test files and save to database
 *
 * Analyzes test files, extracts patterns, and stores them in patterns.db.
 */

import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Database } from '../../../utils/Database';
import { TestPattern } from '../../../reasoning/QEReasoningBank';
import { PatternQualityScorer } from '../../../reasoning/PatternQualityScorer';
import { seededRandom } from '../../../utils/SeededRandom';

export interface PatternExtractOptions {
  framework?: string;
  save?: boolean;
  dryRun?: boolean;
}

export async function patternsExtract(directory: string, options: PatternExtractOptions = {}): Promise<void> {
  if (!directory) {
    console.error(chalk.red('❌ Directory is required'));
    console.log(chalk.gray('Example: aqe patterns extract ./tests --framework jest'));
    process.exit(1);
  }

  const spinner = ora(`Scanning ${directory}...`).start();

  try {
    if (!await fs.pathExists(directory)) {
      spinner.fail('Directory not found');
      console.log(chalk.red(`\n❌ Directory does not exist: ${directory}\n`));
      return;
    }

    spinner.text = 'Analyzing test files...';

    // Find test files
    const testFiles = await findTestFiles(directory, options.framework || 'jest');

    if (testFiles.length === 0) {
      spinner.info('No test files found');
      console.log(chalk.yellow('\n⚠️  No test files found in directory'));
      console.log(chalk.gray('Make sure the directory contains test files\n'));
      return;
    }

    spinner.text = `Extracting patterns from ${testFiles.length} files...`;

    // Extract patterns
    const patterns: TestPattern[] = [];
    const qualityScorer = new PatternQualityScorer();

    for (const file of testFiles) {
      const content = await fs.readFile(file, 'utf-8');
      const extracted = extractPatternsFromFile(content, options.framework || 'jest');

      for (const pattern of extracted) {
        // Calculate quality score
        const qualityScore = qualityScorer.calculateQuality({
          id: pattern.id,
          name: pattern.name,
          code: pattern.template,
          template: pattern.template,
          description: pattern.description,
          tags: pattern.metadata.tags,
          usageCount: 0,
          metadata: {}
        });

        pattern.quality = qualityScore.overall;
        patterns.push(pattern);
      }
    }

    if (patterns.length === 0) {
      spinner.info('No patterns extracted');
      console.log(chalk.yellow('\n⚠️  No recognizable patterns found'));
      console.log(chalk.gray('The test files may not follow common patterns\n'));
      return;
    }

    if (options.dryRun) {
      spinner.succeed(`Found ${patterns.length} patterns (dry run)`);
      console.log(chalk.blue('\n🧪 Dry Run - Patterns Found:\n'));

      patterns.forEach((p, index) => {
        console.log(`${index + 1}. ${chalk.cyan(p.name)}`);
        console.log(`   Type: ${p.category} | Framework: ${p.framework}`);
        console.log(`   Confidence: ${formatConfidence(p.confidence)}`);
        console.log();
      });

      console.log(chalk.gray('Run without --dry-run to save to database\n'));
      return;
    }

    spinner.text = 'Saving patterns to database...';

    // Save to database
    const dbPath = '.agentic-qe/data/patterns.db';
    const db = new Database(dbPath);
    await db.initialize();

    let saved = 0;
    let skipped = 0;

    for (const pattern of patterns) {
      try {
        // Check if pattern already exists
        const existing = await db.get('SELECT id FROM patterns WHERE id = ?', [pattern.id]);

        if (existing) {
          // Update existing pattern
          await db.run(`
            UPDATE patterns
            SET usage_count = usage_count + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [pattern.id]);
          skipped++;
        } else {
          // Insert new pattern
          await db.run(`
            INSERT INTO patterns (
              id, name, description, category, framework, language,
              template, examples, confidence, usage_count, success_rate,
              quality, metadata, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `, [
            pattern.id,
            pattern.name,
            pattern.description,
            pattern.category,
            pattern.framework,
            pattern.language,
            pattern.template,
            JSON.stringify(pattern.examples),
            pattern.confidence,
            pattern.usageCount ?? 0,
            pattern.successRate,
            pattern.quality ?? null,
            JSON.stringify(pattern.metadata)
          ]);
          saved++;
        }
      } catch (error) {
        console.error(chalk.red(`Failed to save pattern ${pattern.id}:`), error);
      }
    }

    await db.close();

    spinner.succeed('Pattern extraction completed');

    console.log(chalk.green(`\n✅ Extracted ${patterns.length} patterns from ${testFiles.length} files\n`));
    console.log(`  ${chalk.green('Saved:')}   ${saved} new patterns`);
    console.log(`  ${chalk.yellow('Skipped:')} ${skipped} existing patterns`);

    if (saved > 0) {
      console.log(chalk.gray('\nUse "aqe patterns list" to view all patterns'));
    }

    console.log();

  } catch (error) {
    spinner.fail('Extraction failed');
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red('❌ Error:'), message);
    process.exit(1);
  }
}

// Helper functions

async function findTestFiles(directory: string, framework: string): Promise<string[]> {
  const extensions = framework === 'playwright' ? ['.spec.ts', '.spec.js'] : ['.test.ts', '.test.js', '.spec.ts', '.spec.js'];
  const files: string[] = [];

  async function scan(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
        await scan(fullPath);
      } else if (entry.isFile()) {
        if (extensions.some(ext => entry.name.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    }
  }

  await scan(directory);
  return files;
}

function extractPatternsFromFile(content: string, framework: string): TestPattern[] {
  const patterns: TestPattern[] = [];

  // Extract describe blocks
  const describeRegex = /describe\(['"`]([^'"`]+)['"`]/g;
  let match;

  while ((match = describeRegex.exec(content)) !== null) {
    const patternId = `pattern-${Date.now()}-${seededRandom.random().toString(36).substring(7)}`;

    patterns.push({
      id: patternId,
      name: match[1],
      description: `Test suite for ${match[1]}`,
      category: detectCategory(content, match[1]),
      framework: framework as any,
      language: content.includes('import') ? 'typescript' : 'javascript',
      template: match[0],
      examples: [match[0]],
      confidence: 0.75,
      usageCount: 0,
      successRate: 1.0,
      quality: 0.8,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        version: '1.0.0',
        tags: extractTags(content, match[1])
      }
    });
  }

  // Extract test/it blocks
  const testRegex = /(?:test|it)\(['"`]([^'"`]+)['"`]/g;

  while ((match = testRegex.exec(content)) !== null) {
    const patternId = `pattern-${Date.now()}-${seededRandom.random().toString(36).substring(7)}`;

    patterns.push({
      id: patternId,
      name: match[1],
      description: `Test case: ${match[1]}`,
      category: detectCategory(content, match[1]),
      framework: framework as any,
      language: content.includes('import') ? 'typescript' : 'javascript',
      template: match[0],
      examples: [match[0]],
      confidence: 0.85,
      usageCount: 0,
      successRate: 1.0,
      quality: 0.8,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        version: '1.0.0',
        tags: extractTags(content, match[1])
      }
    });
  }

  return patterns;
}

function detectCategory(content: string, name: string): 'unit' | 'integration' | 'e2e' | 'performance' | 'security' {
  const nameLower = name.toLowerCase();

  if (nameLower.includes('e2e') || nameLower.includes('end-to-end') || content.includes('@playwright/test')) {
    return 'e2e';
  }

  if (nameLower.includes('performance') || nameLower.includes('load') || nameLower.includes('stress')) {
    return 'performance';
  }

  if (nameLower.includes('security') || nameLower.includes('auth') || nameLower.includes('csrf')) {
    return 'security';
  }

  if (nameLower.includes('integration') || content.includes('supertest') || content.includes('axios')) {
    return 'integration';
  }

  return 'unit';
}

function extractTags(content: string, name: string): string[] {
  const tags: Set<string> = new Set();

  const nameLower = name.toLowerCase();

  if (nameLower.includes('api')) tags.add('api');
  if (nameLower.includes('controller')) tags.add('controller');
  if (nameLower.includes('service')) tags.add('service');
  if (nameLower.includes('util')) tags.add('utility');
  if (nameLower.includes('validate')) tags.add('validation');
  if (content.includes('mock')) tags.add('mocking');
  if (content.includes('async') || content.includes('await')) tags.add('async');
  if (content.includes('axios') || content.includes('fetch')) tags.add('http');

  return Array.from(tags);
}

function formatConfidence(confidence: number): string {
  const percentage = (confidence * 100).toFixed(0) + '%';
  if (confidence >= 0.9) return chalk.green(percentage);
  if (confidence >= 0.7) return chalk.cyan(percentage);
  if (confidence >= 0.5) return chalk.yellow(percentage);
  return chalk.red(percentage);
}
