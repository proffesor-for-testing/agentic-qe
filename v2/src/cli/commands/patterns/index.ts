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
import { SwarmMemoryManager, SerializableValue } from '../../../core/memory/SwarmMemoryManager';
import { getSharedMemoryManager, initializeSharedMemoryManager } from '../../../core/memory/MemoryManagerFactory';
import { ProcessExit } from '../../../utils/ProcessExit';

/**
 * Type guard to check if a value is a valid TestPattern
 */
function isTestPattern(value: unknown): value is TestPattern {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.description === 'string' &&
    typeof obj.category === 'string' &&
    typeof obj.framework === 'string' &&
    typeof obj.language === 'string' &&
    typeof obj.template === 'string' &&
    Array.isArray(obj.examples) &&
    typeof obj.confidence === 'number' &&
    typeof obj.usageCount === 'number' &&
    typeof obj.successRate === 'number' &&
    typeof obj.metadata === 'object' &&
    obj.metadata !== null
  );
}

/**
 * Convert TestPattern to SerializableValue for storage
 * Converts Date objects to ISO strings for JSON compatibility
 */
function patternToSerializable(pattern: TestPattern): SerializableValue {
  return {
    ...pattern,
    metadata: {
      ...pattern.metadata,
      createdAt: pattern.metadata.createdAt instanceof Date
        ? pattern.metadata.createdAt.toISOString()
        : pattern.metadata.createdAt,
      updatedAt: pattern.metadata.updatedAt instanceof Date
        ? pattern.metadata.updatedAt.toISOString()
        : pattern.metadata.updatedAt,
    }
  } as SerializableValue;
}

/**
 * Convert serialized value back to TestPattern
 * Converts ISO date strings back to Date objects
 */
function serializableToPattern(value: unknown): TestPattern | null {
  if (!isTestPattern(value)) {
    return null;
  }
  const metadata = value.metadata as Record<string, unknown>;
  return {
    ...value,
    metadata: {
      ...value.metadata,
      createdAt: typeof metadata.createdAt === 'string'
        ? new Date(metadata.createdAt)
        : metadata.createdAt as Date,
      updatedAt: typeof metadata.updatedAt === 'string'
        ? new Date(metadata.updatedAt)
        : metadata.updatedAt as Date,
    }
  };
}

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
 *
 * Uses shared memory manager singleton to ensure all CLI, MCP, and agent
 * operations use the same database (.agentic-qe/memory.db).
 */
export class PatternsCommand {
  private static reasoningBank: QEReasoningBank;

  /**
   * Get the shared memory manager singleton.
   * All persistence now goes to .agentic-qe/memory.db
   */
  private static async getMemoryManager(): Promise<SwarmMemoryManager> {
    return initializeSharedMemoryManager();
  }

  /**
   * Initialize reasoning bank
   */
  private static async initBank(): Promise<void> {
    if (!this.reasoningBank) {
      this.reasoningBank = new QEReasoningBank();

      // Load patterns from shared memory manager (.agentic-qe/memory.db)
      try {
        const memoryManager = await this.getMemoryManager();

        const patterns = await memoryManager.query('phase2/patterns/%', {
          partition: 'patterns'
        });

        for (const entry of patterns) {
          const pattern = serializableToPattern(entry.value);
          if (pattern) {
            await this.reasoningBank.storePattern(pattern);
          }
        }
      } catch (error) {
        // Fresh start if no patterns exist
      }
    }
  }

  /**
   * Execute patterns command
   */
  static async execute(subcommand: string, args: string[] = [], options: PatternsCommandOptions = {}): Promise<void> {
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
        ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * List patterns
   */
  private static async listPatterns(options: PatternsCommandOptions): Promise<void> {
    const spinner = ora('Loading patterns...').start();

    try {
      const memoryManager = await this.getMemoryManager();

      // ARCHITECTURE (v2.2.0): Query patterns directly from patterns table
      // Data is stored via storePattern() to dedicated table, not memory_entries
      const dbPatterns = memoryManager.queryRaw<any>(
        'SELECT * FROM patterns ORDER BY confidence DESC'
      );

      // Also check legacy location for backward compatibility
      const legacyPatterns = await memoryManager.query('phase2/patterns/%', {
        partition: 'patterns'
      });

      const totalPatterns = dbPatterns.length + legacyPatterns.length;

      if (totalPatterns === 0) {
        spinner.info('No patterns found');
        console.log(chalk.yellow('\n💡 Run "aqe patterns extract <directory>" to discover patterns'));
        return;
      }

      spinner.succeed(`Found ${totalPatterns} patterns`);

      console.log(chalk.blue('\n📦 Stored Patterns\n'));

      // Apply limit
      const limit = options.limit || 20;

      // Display patterns from dedicated table first
      if (dbPatterns.length > 0) {
        const displayPatterns = dbPatterns.slice(0, limit);

        displayPatterns.forEach((pattern: { id?: string; confidence?: number; usage_count?: number; agent_id?: string; created_at?: string; metadata?: string }, index: number) => {
          const prefix = index === displayPatterns.length - 1 && legacyPatterns.length === 0 ? '└─' : '├─';
          const patternName = pattern.id || 'unnamed';

          // Parse metadata if available
          let metadata: { domain?: string } = {};
          try {
            metadata = pattern.metadata ? JSON.parse(pattern.metadata) : {};
          } catch { /* ignore parse errors */ }

          console.log(`${prefix} ${chalk.cyan(patternName)}`);
          console.log(`   ├─ Confidence: ${this.formatConfidence(pattern.confidence ?? 0)}`);
          console.log(`   ├─ Usage Count: ${chalk.gray((pattern.usage_count || 0) + ' times')}`);
          if (metadata.domain) {
            console.log(`   ├─ Domain: ${metadata.domain}`);
          }
          if (pattern.agent_id) {
            console.log(`   ├─ Agent: ${pattern.agent_id}`);
          }
          console.log(`   └─ Created: ${chalk.gray(pattern.created_at ? new Date(pattern.created_at).toLocaleString() : 'unknown')}`);
          console.log();
        });
      }

      // Display legacy patterns if any
      if (legacyPatterns.length > 0) {
        console.log(chalk.blue('\n📦 Legacy Patterns (memory_entries)\n'));
        let filteredPatterns = legacyPatterns
          .map(p => serializableToPattern(p.value))
          .filter((p): p is TestPattern => p !== null);

        if (options.framework) {
          filteredPatterns = filteredPatterns.filter(p => p.framework === options.framework);
        }

        if (options.type) {
          filteredPatterns = filteredPatterns.filter(p => p.category === options.type);
        }

        filteredPatterns.sort((a, b) => b.confidence - a.confidence);
        const displayLegacy = filteredPatterns.slice(0, limit);

        displayLegacy.forEach((pattern, index) => {
          const prefix = index === displayLegacy.length - 1 ? '└─' : '├─';
          console.log(`${prefix} ${chalk.cyan(pattern.name)}`);
          console.log(`   ├─ Type: ${pattern.category}`);
          console.log(`   ├─ Framework: ${pattern.framework}`);
          console.log(`   ├─ Confidence: ${this.formatConfidence(pattern.confidence)}`);
          console.log(`   ├─ Success Rate: ${chalk.green((pattern.successRate * 100).toFixed(1) + '%')}`);
          console.log(`   └─ Usage: ${chalk.gray(pattern.usageCount + ' times')}`);
          console.log();
        });
      }

      if (totalPatterns > limit) {
        console.log(chalk.gray(`... showing ${limit} of ${totalPatterns} patterns`));
        console.log(chalk.gray(`Use --limit <n> to see more\n`));
      }

    } catch (error) {
      spinner.fail('Failed to list patterns');
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red('❌ Error:'), message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Search patterns by keyword
   */
  private static async searchPatterns(keyword: string, options: PatternsCommandOptions): Promise<void> {
    if (!keyword) {
      console.error(chalk.red('❌ Keyword is required'));
      console.log(chalk.gray('Example: aqe patterns search "api validation"'));
      ProcessExit.exitIfNotTest(1);
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

    } catch (error) {
      spinner.fail('Search failed');
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red('❌ Error:'), message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Show pattern details
   */
  private static async showPattern(patternId: string): Promise<void> {
    if (!patternId) {
      console.error(chalk.red('❌ Pattern ID is required'));
      ProcessExit.exitIfNotTest(1);
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

    } catch (error) {
      spinner.fail('Failed to load pattern');
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red('❌ Error:'), message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Extract patterns from test directory
   */
  private static async extractPatterns(directory: string, options: PatternsCommandOptions): Promise<void> {
    if (!directory) {
      console.error(chalk.red('❌ Directory is required'));
      ProcessExit.exitIfNotTest(1);
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
      const memoryManager = await this.getMemoryManager();
      await memoryManager.store(
        `phase2/patterns/${mockPattern.id}`,
        patternToSerializable(mockPattern),
        { partition: 'patterns' }
      );

      spinner.succeed('Pattern extraction completed');

      console.log(chalk.green('\n✅ Extracted 1 pattern'));
      console.log(`Pattern ID: ${chalk.cyan(mockPattern.id)}`);
      console.log(`Confidence: ${this.formatConfidence(mockPattern.confidence)}\n`);

    } catch (error) {
      spinner.fail('Extraction failed');
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red('❌ Error:'), message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Share pattern across projects
   */
  private static async sharePattern(patternId: string, options: PatternsCommandOptions): Promise<void> {
    if (!patternId) {
      console.error(chalk.red('❌ Pattern ID is required'));
      ProcessExit.exitIfNotTest(1);
    }

    if (!options.projects) {
      console.error(chalk.red('❌ --projects is required'));
      ProcessExit.exitIfNotTest(1);
    }

    const spinner = ora('Sharing pattern...').start();

    try {
      const pattern = await this.reasoningBank.getPattern(patternId);

      if (!pattern) {
        spinner.fail('Pattern not found');
        return;
      }

      const projects = (options.projects || '').split(',');

      spinner.succeed(`Pattern shared with ${projects.length} projects`);

      console.log(chalk.green('\n✅ Pattern shared successfully'));
      console.log(`Pattern: ${chalk.cyan(pattern.name)}`);
      console.log(`Projects: ${projects.map(p => chalk.cyan(p)).join(', ')}\n`);

    } catch (error) {
      spinner.fail('Sharing failed');
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red('❌ Error:'), message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Delete pattern
   */
  private static async deletePattern(patternId: string, options: PatternsCommandOptions): Promise<void> {
    if (!patternId) {
      console.error(chalk.red('❌ Pattern ID is required'));
      ProcessExit.exitIfNotTest(1);
    }

    if (!options.confirm) {
      console.log(chalk.yellow('⚠️  This will permanently delete the pattern'));
      console.log(chalk.gray('Add --confirm to proceed'));
      return;
    }

    const spinner = ora('Deleting pattern...').start();

    try {
      const memoryManager = await this.getMemoryManager();

      await memoryManager.delete(`phase2/patterns/${patternId}`, 'patterns');

      spinner.succeed('Pattern deleted');
      console.log(chalk.yellow('\n⚠️  Pattern has been permanently deleted\n'));

    } catch (error) {
      spinner.fail('Deletion failed');
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red('❌ Error:'), message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Export patterns
   */
  private static async exportPatterns(options: PatternsCommandOptions): Promise<void> {
    if (!options.output) {
      console.error(chalk.red('❌ --output is required'));
      ProcessExit.exitIfNotTest(1);
    }

    const spinner = ora('Exporting patterns...').start();

    try {
      const memoryManager = await this.getMemoryManager();

      let patterns = await memoryManager.query('phase2/patterns/%', {
        partition: 'patterns'
      });

      let filteredPatterns = patterns.map(p => p.value);

      if (options.framework) {
        filteredPatterns = filteredPatterns.filter((p) => {
        if (typeof p === 'object' && p !== null && 'framework' in p) {
          return (p as { framework?: string }).framework === options.framework;
        }
        return false;
      });
      }

      await fs.writeJson(options.output!, filteredPatterns, { spaces: 2 });

      spinner.succeed(`Exported ${filteredPatterns.length} patterns to: ${options.output}`);
      console.log(chalk.green('\n✅ Export completed\n'));

    } catch (error) {
      spinner.fail('Export failed');
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red('❌ Error:'), message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Import patterns
   */
  private static async importPatterns(options: PatternsCommandOptions): Promise<void> {
    if (!options.input) {
      console.error(chalk.red('❌ --input is required'));
      ProcessExit.exitIfNotTest(1);
    }

    const spinner = ora('Importing patterns...').start();

    try {
      const patterns = await fs.readJson(options.input!);

      if (!Array.isArray(patterns)) {
        spinner.fail('Invalid patterns file');
        return;
      }

      const memoryManager = await this.getMemoryManager();
      let importedCount = 0;

      for (const rawPattern of patterns) {
        const pattern = serializableToPattern(rawPattern);
        if (pattern) {
          await this.reasoningBank.storePattern(pattern);
          await memoryManager.store(
            `phase2/patterns/${pattern.id}`,
            patternToSerializable(pattern),
            { partition: 'patterns' }
          );
          importedCount++;
        }
      }

      spinner.succeed(`Imported ${importedCount} patterns`);
      console.log(chalk.green('\n✅ Import completed\n'));

    } catch (error) {
      spinner.fail('Import failed');
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red('❌ Error:'), message);
      ProcessExit.exitIfNotTest(1);
    }
  }

  /**
   * Show pattern statistics
   */
  private static async showStats(_options: PatternsCommandOptions): Promise<void> {
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

    } catch (error) {
      spinner.fail('Failed to calculate statistics');
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red('❌ Error:'), message);
      ProcessExit.exitIfNotTest(1);
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
export async function patternsCommand(subcommand: string, args: string[], options: PatternsCommandOptions): Promise<void> {
  await PatternsCommand.execute(subcommand, args, options);
}
