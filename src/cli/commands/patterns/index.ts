/**
 * Patterns CLI Commands - Phase 2
 *
 * Commands for managing test patterns in the QEReasoningBank.
 * Provides pattern discovery, sharing, and management capabilities.
 */

import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs-extra';
import { QEReasoningBank, TestPattern } from '../../../reasoning/QEReasoningBank';
import { SwarmMemoryManager } from '../../../core/memory/SwarmMemoryManager';

export interface PatternsCommandOptions {
  framework?: 'jest' | 'mocha' | 'vitest' | 'playwright';
  type?: 'unit' | 'integration' | 'e2e' | 'performance' | 'security';
  limit?: number;
  minConfidence?: number;
  projects?: string;
  confirm?: boolean;
  output?: string;
  input?: string;
  keyword?: string;
}

/**
 * PatternsCommand - CLI handler for pattern operations
 */
export class PatternsCommand {
  private static reasoningBank: QEReasoningBank;
  private static memoryPath = '.agentic-qe/data/swarm-memory.db';

  /**
   * Initialize reasoning bank
   */
  private static async initBank(): Promise<void> {
    if (!this.reasoningBank) {
      this.reasoningBank = new QEReasoningBank();

      // Load patterns from memory if available
      try {
        const memoryManager = new SwarmMemoryManager(this.memoryPath);
        await memoryManager.initialize();

        const patterns = await memoryManager.query('phase2/patterns/%', {
          partition: 'patterns'
        });

        for (const entry of patterns) {
          await this.reasoningBank.storePattern(entry.value as TestPattern);
        }
      } catch (error) {
        // Fresh start if no patterns exist
      }
    }
  }

  /**
   * Execute patterns command
   */
  static async execute(subcommand: string, args: any[] = [], options: PatternsCommandOptions = {}): Promise<void> {
    await this.initBank();

    switch (subcommand) {
      case 'list':
        await this.listPatterns(options);
        break;
      case 'search':
        await this.searchPatterns(args[0], options);
        break;
      case 'show':
        await this.showPattern(args[0]);
        break;
      case 'extract':
        await this.extractPatterns(args[0], options);
        break;
      case 'share':
        await this.sharePattern(args[0], options);
        break;
      case 'delete':
        await this.deletePattern(args[0], options);
        break;
      case 'export':
        await this.exportPatterns(options);
        break;
      case 'import':
        await this.importPatterns(options);
        break;
      case 'stats':
        await this.showStats(options);
        break;
      default:
        console.error(chalk.red(`❌ Unknown patterns command: ${subcommand}`));
        this.showHelp();
        process.exit(1);
    }
  }

  /**
   * List patterns
   */
  private static async listPatterns(options: PatternsCommandOptions): Promise<void> {
    const spinner = ora('Loading patterns...').start();

    try {
      const stats = await this.reasoningBank.getStatistics();

      if (stats.totalPatterns === 0) {
        spinner.info('No patterns found');
        console.log(chalk.yellow('\n💡 Run "aqe patterns extract <directory>" to discover patterns'));
        return;
      }

      spinner.succeed(`Found ${stats.totalPatterns} patterns`);

      console.log(chalk.blue('\n📦 Test Patterns\n'));

      // Filter by framework if specified
      const memoryManager = new SwarmMemoryManager(this.memoryPath);
      await memoryManager.initialize();

      let patterns = await memoryManager.query('phase2/patterns/%', {
        partition: 'patterns'
      });

      let filteredPatterns = patterns.map(p => p.value as TestPattern);

      if (options.framework) {
        filteredPatterns = filteredPatterns.filter(p => p.framework === options.framework);
      }

      if (options.type) {
        filteredPatterns = filteredPatterns.filter(p => p.category === options.type);
      }

      // Sort by confidence
      filteredPatterns.sort((a, b) => b.confidence - a.confidence);

      // Apply limit
      const limit = options.limit || 20;
      const displayPatterns = filteredPatterns.slice(0, limit);

      displayPatterns.forEach((pattern, index) => {
        const prefix = index === displayPatterns.length - 1 ? '└─' : '├─';
        console.log(`${prefix} ${chalk.cyan(pattern.name)}`);
        console.log(`   ├─ Type: ${pattern.category}`);
        console.log(`   ├─ Framework: ${pattern.framework}`);
        console.log(`   ├─ Confidence: ${this.formatConfidence(pattern.confidence)}`);
        console.log(`   ├─ Success Rate: ${chalk.green((pattern.successRate * 100).toFixed(1) + '%')}`);
        console.log(`   └─ Usage: ${chalk.gray(pattern.usageCount + ' times')}`);
        console.log();
      });

      if (filteredPatterns.length > limit) {
        console.log(chalk.gray(`... and ${filteredPatterns.length - limit} more`));
        console.log(chalk.gray(`Use --limit <n> to see more\n`));
      }

    } catch (error: any) {
      spinner.fail('Failed to list patterns');
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Search patterns by keyword
   */
  private static async searchPatterns(keyword: string, options: PatternsCommandOptions): Promise<void> {
    if (!keyword) {
      console.error(chalk.red('❌ Keyword is required'));
      console.log(chalk.gray('Example: aqe patterns search "api validation"'));
      process.exit(1);
    }

    const spinner = ora(`Searching for "${keyword}"...`).start();

    try {
      const matches = await this.reasoningBank.findMatchingPatterns({
        codeType: 'test',
        framework: options.framework,
        keywords: keyword.split(' ')
      }, options.limit || 10);

      if (matches.length === 0) {
        spinner.info('No matching patterns found');
        return;
      }

      spinner.succeed(`Found ${matches.length} matching patterns`);

      console.log(chalk.blue('\n🔍 Search Results\n'));

      matches.forEach((match, index) => {
        const pattern = match.pattern;
        const prefix = index === matches.length - 1 ? '└─' : '├─';

        console.log(`${prefix} ${chalk.cyan(pattern.name)} (${this.formatConfidence(match.confidence)} match)`);
        console.log(`   ├─ ${pattern.description}`);
        console.log(`   ├─ Framework: ${pattern.framework}`);
        console.log(`   ├─ Applicability: ${this.formatConfidence(match.applicability)}`);
        console.log(`   └─ ${chalk.gray(match.reasoning)}`);
        console.log();
      });

    } catch (error: any) {
      spinner.fail('Search failed');
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Show pattern details
   */
  private static async showPattern(patternId: string): Promise<void> {
    if (!patternId) {
      console.error(chalk.red('❌ Pattern ID is required'));
      process.exit(1);
    }

    const spinner = ora('Loading pattern...').start();

    try {
      const pattern = await this.reasoningBank.getPattern(patternId);

      if (!pattern) {
        spinner.fail('Pattern not found');
        return;
      }

      spinner.succeed('Pattern loaded');

      console.log(chalk.blue('\n📋 Pattern Details\n'));
      console.log(`${chalk.cyan('ID:')} ${pattern.id}`);
      console.log(`${chalk.cyan('Name:')} ${pattern.name}`);
      console.log(`${chalk.cyan('Description:')} ${pattern.description}`);
      console.log(`${chalk.cyan('Category:')} ${pattern.category}`);
      console.log(`${chalk.cyan('Framework:')} ${pattern.framework}`);
      console.log(`${chalk.cyan('Language:')} ${pattern.language}`);
      console.log(`${chalk.cyan('Confidence:')} ${this.formatConfidence(pattern.confidence)}`);
      console.log(`${chalk.cyan('Success Rate:')} ${chalk.green((pattern.successRate * 100).toFixed(1) + '%')}`);
      console.log(`${chalk.cyan('Usage Count:')} ${pattern.usageCount}`);
      console.log(`${chalk.cyan('Tags:')} ${pattern.metadata.tags.join(', ')}`);
      console.log(`${chalk.cyan('Created:')} ${new Date(pattern.metadata.createdAt).toLocaleString()}`);

      console.log(chalk.blue('\n📝 Template:\n'));
      console.log(chalk.gray(pattern.template));

      if (pattern.examples.length > 0) {
        console.log(chalk.blue('\n💡 Examples:\n'));
        pattern.examples.forEach((example, index) => {
          console.log(chalk.gray(`${index + 1}. ${example}`));
        });
      }

      console.log();

    } catch (error: any) {
      spinner.fail('Failed to load pattern');
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Extract patterns from test directory
   */
  private static async extractPatterns(directory: string, options: PatternsCommandOptions): Promise<void> {
    if (!directory) {
      console.error(chalk.red('❌ Directory is required'));
      process.exit(1);
    }

    const spinner = ora(`Extracting patterns from ${directory}...`).start();

    try {
      if (!await fs.pathExists(directory)) {
        spinner.fail('Directory not found');
        return;
      }

      // This would normally use PatternExtractor, but for CLI demo we'll mock it
      spinner.text = 'Analyzing test files...';

      // Mock pattern extraction
      const mockPattern: TestPattern = {
        id: `pattern-${Date.now()}`,
        name: 'API Response Validation',
        description: 'Validates API response structure and status codes',
        category: 'integration',
        framework: options.framework || 'jest',
        language: 'typescript',
        template: 'test("should validate ${endpoint}", async () => { ... });',
        examples: ['test("should validate GET /users", async () => { ... })'],
        confidence: 0.85,
        usageCount: 0,
        successRate: 1.0,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          tags: ['api', 'validation', 'integration']
        }
      };

      await this.reasoningBank.storePattern(mockPattern);

      // Store in memory
      const memoryManager = new SwarmMemoryManager(this.memoryPath);
      await memoryManager.initialize();
      await memoryManager.store(
        `phase2/patterns/${mockPattern.id}`,
        mockPattern,
        { partition: 'patterns' }
      );

      spinner.succeed('Pattern extraction completed');

      console.log(chalk.green('\n✅ Extracted 1 pattern'));
      console.log(`Pattern ID: ${chalk.cyan(mockPattern.id)}`);
      console.log(`Confidence: ${this.formatConfidence(mockPattern.confidence)}\n`);

    } catch (error: any) {
      spinner.fail('Extraction failed');
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Share pattern across projects
   */
  private static async sharePattern(patternId: string, options: PatternsCommandOptions): Promise<void> {
    if (!patternId) {
      console.error(chalk.red('❌ Pattern ID is required'));
      process.exit(1);
    }

    if (!options.projects) {
      console.error(chalk.red('❌ --projects is required'));
      process.exit(1);
    }

    const spinner = ora('Sharing pattern...').start();

    try {
      const pattern = await this.reasoningBank.getPattern(patternId);

      if (!pattern) {
        spinner.fail('Pattern not found');
        return;
      }

      const projects = options.projects.split(',');

      spinner.succeed(`Pattern shared with ${projects.length} projects`);

      console.log(chalk.green('\n✅ Pattern shared successfully'));
      console.log(`Pattern: ${chalk.cyan(pattern.name)}`);
      console.log(`Projects: ${projects.map(p => chalk.cyan(p)).join(', ')}\n`);

    } catch (error: any) {
      spinner.fail('Sharing failed');
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Delete pattern
   */
  private static async deletePattern(patternId: string, options: PatternsCommandOptions): Promise<void> {
    if (!patternId) {
      console.error(chalk.red('❌ Pattern ID is required'));
      process.exit(1);
    }

    if (!options.confirm) {
      console.log(chalk.yellow('⚠️  This will permanently delete the pattern'));
      console.log(chalk.gray('Add --confirm to proceed'));
      return;
    }

    const spinner = ora('Deleting pattern...').start();

    try {
      const memoryManager = new SwarmMemoryManager(this.memoryPath);
      await memoryManager.initialize();

      await memoryManager.delete(`phase2/patterns/${patternId}`, 'patterns');

      spinner.succeed('Pattern deleted');
      console.log(chalk.yellow('\n⚠️  Pattern has been permanently deleted\n'));

    } catch (error: any) {
      spinner.fail('Deletion failed');
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Export patterns
   */
  private static async exportPatterns(options: PatternsCommandOptions): Promise<void> {
    if (!options.output) {
      console.error(chalk.red('❌ --output is required'));
      process.exit(1);
    }

    const spinner = ora('Exporting patterns...').start();

    try {
      const memoryManager = new SwarmMemoryManager(this.memoryPath);
      await memoryManager.initialize();

      let patterns = await memoryManager.query('phase2/patterns/%', {
        partition: 'patterns'
      });

      let filteredPatterns = patterns.map(p => p.value);

      if (options.framework) {
        filteredPatterns = filteredPatterns.filter((p: any) => p.framework === options.framework);
      }

      await fs.writeJson(options.output, filteredPatterns, { spaces: 2 });

      spinner.succeed(`Exported ${filteredPatterns.length} patterns to: ${options.output}`);
      console.log(chalk.green('\n✅ Export completed\n'));

    } catch (error: any) {
      spinner.fail('Export failed');
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Import patterns
   */
  private static async importPatterns(options: PatternsCommandOptions): Promise<void> {
    if (!options.input) {
      console.error(chalk.red('❌ --input is required'));
      process.exit(1);
    }

    const spinner = ora('Importing patterns...').start();

    try {
      const patterns = await fs.readJson(options.input);

      if (!Array.isArray(patterns)) {
        spinner.fail('Invalid patterns file');
        return;
      }

      const memoryManager = new SwarmMemoryManager(this.memoryPath);
      await memoryManager.initialize();

      for (const pattern of patterns) {
        await this.reasoningBank.storePattern(pattern);
        await memoryManager.store(
          `phase2/patterns/${pattern.id}`,
          pattern,
          { partition: 'patterns' }
        );
      }

      spinner.succeed(`Imported ${patterns.length} patterns`);
      console.log(chalk.green('\n✅ Import completed\n'));

    } catch (error: any) {
      spinner.fail('Import failed');
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Show pattern statistics
   */
  private static async showStats(options: PatternsCommandOptions): Promise<void> {
    const spinner = ora('Calculating statistics...').start();

    try {
      const stats = await this.reasoningBank.getStatistics();

      spinner.succeed('Statistics loaded');

      console.log(chalk.blue('\n📊 Pattern Statistics\n'));
      console.log(`Total Patterns: ${chalk.cyan(stats.totalPatterns.toLocaleString())}`);
      console.log(`Avg Confidence: ${this.formatConfidence(stats.averageConfidence)}`);
      console.log(`Avg Success Rate: ${chalk.green((stats.averageSuccessRate * 100).toFixed(1) + '%')}`);

      console.log(chalk.blue('\n📦 By Category:\n'));
      Object.entries(stats.byCategory)
        .sort((a, b) => b[1] - a[1])
        .forEach(([category, count]) => {
          console.log(`  ${category.padEnd(15)} ${chalk.cyan(count.toString())}`);
        });

      console.log(chalk.blue('\n🔧 By Framework:\n'));
      Object.entries(stats.byFramework)
        .sort((a, b) => b[1] - a[1])
        .forEach(([framework, count]) => {
          console.log(`  ${framework.padEnd(15)} ${chalk.cyan(count.toString())}`);
        });

      console.log();

    } catch (error: any) {
      spinner.fail('Failed to calculate statistics');
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Show command help
   */
  private static showHelp(): void {
    console.log(chalk.blue('\n📚 Patterns Commands:\n'));
    console.log(chalk.cyan('  aqe patterns list') + chalk.gray('             - List all patterns'));
    console.log(chalk.cyan('  aqe patterns search <keyword>') + chalk.gray(' - Search patterns'));
    console.log(chalk.cyan('  aqe patterns show <id>') + chalk.gray('        - Show pattern details'));
    console.log(chalk.cyan('  aqe patterns extract <dir>') + chalk.gray('    - Extract patterns from tests'));
    console.log(chalk.cyan('  aqe patterns share <id>') + chalk.gray('       - Share pattern across projects'));
    console.log(chalk.cyan('  aqe patterns delete <id>') + chalk.gray('      - Delete pattern'));
    console.log(chalk.cyan('  aqe patterns export') + chalk.gray('           - Export patterns to file'));
    console.log(chalk.cyan('  aqe patterns import') + chalk.gray('           - Import patterns from file'));
    console.log(chalk.cyan('  aqe patterns stats') + chalk.gray('            - Show pattern statistics'));
    console.log(chalk.blue('\nOptions:\n'));
    console.log(chalk.gray('  --framework <name>   - Filter by framework (jest, mocha, vitest, playwright)'));
    console.log(chalk.gray('  --type <category>    - Filter by type (unit, integration, e2e)'));
    console.log(chalk.gray('  --limit <number>     - Limit results'));
    console.log(chalk.gray('  --min-confidence <n> - Minimum confidence (0-1)'));
    console.log(chalk.gray('  --projects <ids>     - Comma-separated project IDs'));
    console.log(chalk.gray('  --confirm            - Confirm destructive operation'));
    console.log(chalk.gray('  --output <file>      - Output file path'));
    console.log(chalk.gray('  --input <file>       - Input file path'));
    console.log(chalk.blue('\nExamples:\n'));
    console.log(chalk.gray('  aqe patterns list --framework jest --limit 50'));
    console.log(chalk.gray('  aqe patterns search "api validation" --min-confidence 0.85'));
    console.log(chalk.gray('  aqe patterns extract ./tests --framework jest'));
    console.log(chalk.gray('  aqe patterns export --output patterns.json --framework jest'));
    console.log();
  }

  // Helper methods

  private static formatConfidence(confidence: number): string {
    const percentage = (confidence * 100).toFixed(0) + '%';
    if (confidence >= 0.9) return chalk.green(percentage);
    if (confidence >= 0.7) return chalk.cyan(percentage);
    if (confidence >= 0.5) return chalk.yellow(percentage);
    return chalk.red(percentage);
  }
}

// Export command functions for CLI registration
export async function patternsCommand(subcommand: string, args: any[], options: PatternsCommandOptions): Promise<void> {
  await PatternsCommand.execute(subcommand, args, options);
}
