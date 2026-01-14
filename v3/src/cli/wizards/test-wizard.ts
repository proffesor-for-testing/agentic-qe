/**
 * Test Generation Wizard
 * ADR-041: V3 QE CLI Enhancement
 *
 * Interactive wizard for test generation with step-by-step configuration.
 * Prompts for source files, test type, coverage target, framework, and AI enhancement.
 */

import { createInterface } from 'readline';
import chalk from 'chalk';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { join, resolve, relative, extname, basename } from 'path';

// ============================================================================
// Types
// ============================================================================

export interface TestWizardOptions {
  /** Non-interactive mode with defaults */
  nonInteractive?: boolean;
  /** Default source files/patterns */
  defaultSourceFiles?: string[];
  /** Default test type */
  defaultTestType?: TestType;
  /** Default coverage target */
  defaultCoverageTarget?: number;
  /** Default framework */
  defaultFramework?: TestFramework;
  /** Default AI enhancement level */
  defaultAILevel?: AIEnhancementLevel;
}

export type TestType = 'unit' | 'integration' | 'e2e' | 'property' | 'contract';
export type TestFramework = 'jest' | 'vitest' | 'mocha' | 'playwright';
export type AIEnhancementLevel = 'none' | 'basic' | 'standard' | 'advanced';

export interface TestWizardResult {
  /** Selected source files */
  sourceFiles: string[];
  /** Selected test type */
  testType: TestType;
  /** Coverage target percentage */
  coverageTarget: number;
  /** Selected test framework */
  framework: TestFramework;
  /** AI enhancement level */
  aiLevel: AIEnhancementLevel;
  /** Additional patterns to include */
  includePatterns?: string[];
  /** Whether to detect anti-patterns */
  detectAntiPatterns: boolean;
  /** Whether the wizard was cancelled */
  cancelled: boolean;
}

interface WizardStep<T> {
  id: string;
  title: string;
  description: string;
  prompt: (rl: readline.Interface) => Promise<T>;
  validate?: (value: T) => boolean | string;
}

// ============================================================================
// Readline type augmentation
// ============================================================================

import * as readline from 'readline';

// ============================================================================
// Wizard Implementation
// ============================================================================

export class TestGenerationWizard {
  private options: TestWizardOptions;
  private cwd: string;

  constructor(options: TestWizardOptions = {}) {
    this.options = options;
    this.cwd = process.cwd();
  }

  /**
   * Run the interactive wizard
   */
  async run(): Promise<TestWizardResult> {
    // Non-interactive mode returns defaults
    if (this.options.nonInteractive) {
      return this.getDefaults();
    }

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      // Print header
      this.printHeader();

      // Step 1: Source files
      const sourceFiles = await this.promptSourceFiles(rl);
      if (sourceFiles.length === 0) {
        return this.getCancelled();
      }

      // Step 2: Test type
      const testType = await this.promptTestType(rl);

      // Step 3: Coverage target
      const coverageTarget = await this.promptCoverageTarget(rl);

      // Step 4: Framework
      const framework = await this.promptFramework(rl);

      // Step 5: AI enhancement level
      const aiLevel = await this.promptAILevel(rl);

      // Step 6: Anti-pattern detection
      const detectAntiPatterns = await this.promptAntiPatternDetection(rl);

      // Print summary
      this.printSummary({
        sourceFiles,
        testType,
        coverageTarget,
        framework,
        aiLevel,
        detectAntiPatterns,
        cancelled: false,
      });

      // Confirm
      const confirmed = await this.promptConfirmation(rl);
      if (!confirmed) {
        return this.getCancelled();
      }

      return {
        sourceFiles,
        testType,
        coverageTarget,
        framework,
        aiLevel,
        detectAntiPatterns,
        cancelled: false,
      };
    } finally {
      rl.close();
    }
  }

  /**
   * Print wizard header
   */
  private printHeader(): void {
    console.log('');
    console.log(chalk.blue('========================================'));
    console.log(chalk.blue.bold('       Test Generation Wizard'));
    console.log(chalk.blue('========================================'));
    console.log(chalk.gray('Generate tests with AI-powered assistance'));
    console.log(chalk.gray('Press Ctrl+C to cancel at any time'));
    console.log('');
  }

  /**
   * Step 1: Prompt for source files
   */
  private async promptSourceFiles(rl: readline.Interface): Promise<string[]> {
    console.log(chalk.cyan('Step 1/6: Source Files'));
    console.log(chalk.gray('Enter file paths, glob patterns, or directory'));
    console.log(chalk.gray('Examples: src/services/*.ts, ./src/utils, src/auth.ts'));
    console.log('');

    // Show available suggestions
    const suggestions = this.getSourceFileSuggestions();
    if (suggestions.length > 0) {
      console.log(chalk.yellow('Suggestions:'));
      suggestions.slice(0, 5).forEach((s, i) => {
        console.log(chalk.gray(`  ${i + 1}. ${s}`));
      });
      console.log('');
    }

    const defaultValue = this.options.defaultSourceFiles?.join(', ') || '.';
    const input = await this.prompt(rl, `Source files [${chalk.gray(defaultValue)}]: `);

    const value = input.trim() || defaultValue;

    // Parse input into file list
    return this.resolveSourceFiles(value);
  }

  /**
   * Step 2: Prompt for test type
   */
  private async promptTestType(rl: readline.Interface): Promise<TestType> {
    console.log('');
    console.log(chalk.cyan('Step 2/6: Test Type'));
    console.log(chalk.gray('Select the type of tests to generate'));
    console.log('');

    const options: Array<{ key: string; value: TestType; description: string }> = [
      { key: '1', value: 'unit', description: 'Unit tests - isolated component testing' },
      { key: '2', value: 'integration', description: 'Integration tests - module interaction testing' },
      { key: '3', value: 'e2e', description: 'End-to-end tests - full workflow testing' },
      { key: '4', value: 'property', description: 'Property-based tests - invariant testing' },
      { key: '5', value: 'contract', description: 'Contract tests - API contract validation' },
    ];

    options.forEach(opt => {
      const marker = opt.value === this.options.defaultTestType ? chalk.green(' (default)') : '';
      console.log(chalk.white(`  ${opt.key}. ${opt.value}${marker}`));
      console.log(chalk.gray(`     ${opt.description}`));
    });
    console.log('');

    const defaultValue = this.options.defaultTestType || 'unit';
    const input = await this.prompt(rl, `Select test type [${chalk.gray(defaultValue)}]: `);

    const value = input.trim();
    if (!value) return defaultValue;

    // Check if input is a number
    const numInput = parseInt(value, 10);
    if (numInput >= 1 && numInput <= options.length) {
      return options[numInput - 1].value;
    }

    // Check if input is a valid test type
    const validTypes: TestType[] = ['unit', 'integration', 'e2e', 'property', 'contract'];
    if (validTypes.includes(value as TestType)) {
      return value as TestType;
    }

    console.log(chalk.yellow(`Invalid input, using default: ${defaultValue}`));
    return defaultValue;
  }

  /**
   * Step 3: Prompt for coverage target
   */
  private async promptCoverageTarget(rl: readline.Interface): Promise<number> {
    console.log('');
    console.log(chalk.cyan('Step 3/6: Coverage Target'));
    console.log(chalk.gray('Target code coverage percentage (0-100)'));
    console.log(chalk.gray('Recommended: 80% for new code, 60% for legacy'));
    console.log('');

    const defaultValue = this.options.defaultCoverageTarget || 80;
    const input = await this.prompt(rl, `Coverage target % [${chalk.gray(defaultValue)}]: `);

    const value = input.trim();
    if (!value) return defaultValue;

    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 0 || numValue > 100) {
      console.log(chalk.yellow(`Invalid input, using default: ${defaultValue}%`));
      return defaultValue;
    }

    return numValue;
  }

  /**
   * Step 4: Prompt for test framework
   */
  private async promptFramework(rl: readline.Interface): Promise<TestFramework> {
    console.log('');
    console.log(chalk.cyan('Step 4/6: Test Framework'));
    console.log(chalk.gray('Select the testing framework to use'));
    console.log('');

    const options: Array<{ key: string; value: TestFramework; description: string }> = [
      { key: '1', value: 'vitest', description: 'Vitest - Fast, Vite-native testing' },
      { key: '2', value: 'jest', description: 'Jest - Feature-rich, widely adopted' },
      { key: '3', value: 'mocha', description: 'Mocha - Flexible, configurable' },
      { key: '4', value: 'playwright', description: 'Playwright - Browser automation (for e2e)' },
    ];

    // Detect framework from project
    const detectedFramework = this.detectFramework();
    const defaultValue = this.options.defaultFramework || detectedFramework || 'vitest';

    options.forEach(opt => {
      const marker = opt.value === detectedFramework ? chalk.green(' (detected)') :
                     opt.value === defaultValue ? chalk.gray(' (default)') : '';
      console.log(chalk.white(`  ${opt.key}. ${opt.value}${marker}`));
      console.log(chalk.gray(`     ${opt.description}`));
    });
    console.log('');

    const input = await this.prompt(rl, `Select framework [${chalk.gray(defaultValue)}]: `);

    const value = input.trim();
    if (!value) return defaultValue;

    // Check if input is a number
    const numInput = parseInt(value, 10);
    if (numInput >= 1 && numInput <= options.length) {
      return options[numInput - 1].value;
    }

    // Check if input is a valid framework
    const validFrameworks: TestFramework[] = ['jest', 'vitest', 'mocha', 'playwright'];
    if (validFrameworks.includes(value as TestFramework)) {
      return value as TestFramework;
    }

    console.log(chalk.yellow(`Invalid input, using default: ${defaultValue}`));
    return defaultValue;
  }

  /**
   * Step 5: Prompt for AI enhancement level
   */
  private async promptAILevel(rl: readline.Interface): Promise<AIEnhancementLevel> {
    console.log('');
    console.log(chalk.cyan('Step 5/6: AI Enhancement Level'));
    console.log(chalk.gray('Select the level of AI assistance for test generation'));
    console.log('');

    const options: Array<{ key: string; value: AIEnhancementLevel; description: string }> = [
      { key: '1', value: 'none', description: 'None - Template-based generation only' },
      { key: '2', value: 'basic', description: 'Basic - Simple pattern matching' },
      { key: '3', value: 'standard', description: 'Standard - AI-powered test suggestions' },
      { key: '4', value: 'advanced', description: 'Advanced - Full AI with edge case generation' },
    ];

    const defaultValue = this.options.defaultAILevel || 'standard';

    options.forEach(opt => {
      const marker = opt.value === defaultValue ? chalk.green(' (recommended)') : '';
      console.log(chalk.white(`  ${opt.key}. ${opt.value}${marker}`));
      console.log(chalk.gray(`     ${opt.description}`));
    });
    console.log('');

    const input = await this.prompt(rl, `Select AI level [${chalk.gray(defaultValue)}]: `);

    const value = input.trim();
    if (!value) return defaultValue;

    // Check if input is a number
    const numInput = parseInt(value, 10);
    if (numInput >= 1 && numInput <= options.length) {
      return options[numInput - 1].value;
    }

    // Check if input is a valid level
    const validLevels: AIEnhancementLevel[] = ['none', 'basic', 'standard', 'advanced'];
    if (validLevels.includes(value as AIEnhancementLevel)) {
      return value as AIEnhancementLevel;
    }

    console.log(chalk.yellow(`Invalid input, using default: ${defaultValue}`));
    return defaultValue;
  }

  /**
   * Step 6: Prompt for anti-pattern detection
   */
  private async promptAntiPatternDetection(rl: readline.Interface): Promise<boolean> {
    console.log('');
    console.log(chalk.cyan('Step 6/6: Anti-Pattern Detection'));
    console.log(chalk.gray('Enable detection and avoidance of code anti-patterns'));
    console.log('');

    const input = await this.prompt(rl, `Enable anti-pattern detection? [${chalk.gray('Y/n')}]: `);

    const value = input.trim().toLowerCase();
    if (value === 'n' || value === 'no') {
      return false;
    }
    return true; // Default to yes
  }

  /**
   * Prompt for final confirmation
   */
  private async promptConfirmation(rl: readline.Interface): Promise<boolean> {
    console.log('');
    const input = await this.prompt(rl, `${chalk.green('Proceed with test generation?')} [${chalk.gray('Y/n')}]: `);

    const value = input.trim().toLowerCase();
    if (value === 'n' || value === 'no') {
      console.log(chalk.yellow('\nWizard cancelled.'));
      return false;
    }
    return true;
  }

  /**
   * Print configuration summary
   */
  private printSummary(result: TestWizardResult): void {
    console.log('');
    console.log(chalk.blue('========================================'));
    console.log(chalk.blue.bold('       Configuration Summary'));
    console.log(chalk.blue('========================================'));
    console.log('');
    console.log(chalk.white('  Source Files:'));
    result.sourceFiles.slice(0, 5).forEach(f => {
      const relativePath = relative(this.cwd, f);
      console.log(chalk.gray(`    - ${relativePath || f}`));
    });
    if (result.sourceFiles.length > 5) {
      console.log(chalk.gray(`    ... and ${result.sourceFiles.length - 5} more`));
    }
    console.log('');
    console.log(chalk.white(`  Test Type:        ${chalk.cyan(result.testType)}`));
    console.log(chalk.white(`  Coverage Target:  ${chalk.cyan(result.coverageTarget + '%')}`));
    console.log(chalk.white(`  Framework:        ${chalk.cyan(result.framework)}`));
    console.log(chalk.white(`  AI Enhancement:   ${chalk.cyan(result.aiLevel)}`));
    console.log(chalk.white(`  Anti-Patterns:    ${chalk.cyan(result.detectAntiPatterns ? 'Enabled' : 'Disabled')}`));
    console.log('');
  }

  /**
   * Generic prompt helper
   */
  private prompt(rl: readline.Interface, question: string): Promise<string> {
    return new Promise(resolve => {
      rl.question(question, answer => {
        resolve(answer);
      });
    });
  }

  /**
   * Get source file suggestions based on project structure
   */
  private getSourceFileSuggestions(): string[] {
    const suggestions: string[] = [];

    // Check common directories
    const commonDirs = ['src', 'lib', 'app', 'packages'];
    for (const dir of commonDirs) {
      const dirPath = join(this.cwd, dir);
      if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
        suggestions.push(`${dir}/**/*.ts`);
        suggestions.push(dir);
      }
    }

    // Add specific patterns for TypeScript projects
    if (existsSync(join(this.cwd, 'src'))) {
      suggestions.push('src/services/**/*.ts');
      suggestions.push('src/utils/**/*.ts');
      suggestions.push('src/components/**/*.tsx');
    }

    return suggestions;
  }

  /**
   * Resolve source files from input (glob patterns, directories, files)
   * Security: Validates that resolved paths stay within project directory to prevent path traversal
   */
  private resolveSourceFiles(input: string): string[] {
    const files: string[] = [];
    const parts = input.split(',').map(p => p.trim()).filter(p => p.length > 0);
    // Normalize cwd for consistent comparison (resolve removes trailing slashes and normalizes)
    const normalizedCwd = resolve(this.cwd);

    for (const part of parts) {
      const resolved = resolve(this.cwd, part);

      // Security: Prevent path traversal - ensure resolved path is within project directory
      if (!resolved.startsWith(normalizedCwd + '/') && resolved !== normalizedCwd) {
        console.warn(`Warning: Skipping path outside project directory: ${part}`);
        continue;
      }

      if (existsSync(resolved)) {
        if (statSync(resolved).isDirectory()) {
          // Recursively get TypeScript files from directory
          const dirFiles = this.getFilesFromDirectory(resolved);
          // Double-check each file is within project directory
          files.push(...dirFiles.filter(f => f.startsWith(normalizedCwd + '/') || f === normalizedCwd));
        } else if (statSync(resolved).isFile()) {
          files.push(resolved);
        }
      } else if (part.includes('*')) {
        // Handle glob pattern - for now, just expand common patterns
        const baseDir = resolve(this.cwd, part.split('*')[0]);
        // Security: Validate glob base directory is within project
        if (!baseDir.startsWith(normalizedCwd + '/') && baseDir !== normalizedCwd) {
          console.warn(`Warning: Skipping glob pattern outside project directory: ${part}`);
          continue;
        }
        if (existsSync(baseDir)) {
          const dirFiles = this.getFilesFromDirectory(baseDir, part.includes('**'));
          // Double-check each file is within project directory
          files.push(...dirFiles.filter(f => f.startsWith(normalizedCwd + '/') || f === normalizedCwd));
        }
      } else {
        // Try to find file with common extensions
        const extensions = ['.ts', '.tsx', '.js', '.jsx'];
        for (const ext of extensions) {
          const withExt = resolved.endsWith(ext) ? resolved : resolved + ext;
          if (existsSync(withExt)) {
            files.push(withExt);
            break;
          }
        }
      }
    }

    // Filter out test files and node_modules
    return files.filter(f => {
      const name = basename(f);
      return !name.includes('.test.') &&
             !name.includes('.spec.') &&
             !f.includes('node_modules') &&
             !f.includes('/dist/') &&
             !f.endsWith('.d.ts');
    });
  }

  /**
   * Get TypeScript files from directory
   */
  private getFilesFromDirectory(dirPath: string, recursive: boolean = true, depth: number = 0): string[] {
    if (depth > 5) return []; // Max depth limit

    const files: string[] = [];

    try {
      const items = readdirSync(dirPath);
      for (const item of items) {
        if (item === 'node_modules' || item === 'dist' || item.startsWith('.')) {
          continue;
        }

        const fullPath = join(dirPath, item);
        const stat = statSync(fullPath);

        if (stat.isDirectory() && recursive) {
          files.push(...this.getFilesFromDirectory(fullPath, recursive, depth + 1));
        } else if (stat.isFile()) {
          const ext = extname(item);
          if (['.ts', '.tsx'].includes(ext) && !item.endsWith('.d.ts')) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Ignore permission errors
    }

    return files;
  }

  /**
   * Detect test framework from project configuration
   * Security: Uses fs.readFileSync instead of require() to prevent code execution
   */
  private detectFramework(): TestFramework | null {
    const packageJsonPath = join(this.cwd, 'package.json');

    if (!existsSync(packageJsonPath)) {
      return null;
    }

    try {
      // Security: Use readFileSync + JSON.parse instead of require() to prevent code execution
      const content = readFileSync(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (deps.vitest) return 'vitest';
      if (deps.jest) return 'jest';
      if (deps.mocha) return 'mocha';
      if (deps.playwright || deps['@playwright/test']) return 'playwright';
    } catch {
      // Ignore errors (file read or JSON parse failures)
    }

    // Check for config files
    if (existsSync(join(this.cwd, 'vitest.config.ts')) || existsSync(join(this.cwd, 'vitest.config.js'))) {
      return 'vitest';
    }
    if (existsSync(join(this.cwd, 'jest.config.ts')) || existsSync(join(this.cwd, 'jest.config.js'))) {
      return 'jest';
    }
    if (existsSync(join(this.cwd, 'playwright.config.ts')) || existsSync(join(this.cwd, 'playwright.config.js'))) {
      return 'playwright';
    }

    return null;
  }

  /**
   * Get default result for non-interactive mode
   */
  private getDefaults(): TestWizardResult {
    return {
      sourceFiles: this.options.defaultSourceFiles || ['.'],
      testType: this.options.defaultTestType || 'unit',
      coverageTarget: this.options.defaultCoverageTarget || 80,
      framework: this.options.defaultFramework || 'vitest',
      aiLevel: this.options.defaultAILevel || 'standard',
      detectAntiPatterns: true,
      cancelled: false,
    };
  }

  /**
   * Get cancelled result
   */
  private getCancelled(): TestWizardResult {
    return {
      sourceFiles: [],
      testType: 'unit',
      coverageTarget: 80,
      framework: 'vitest',
      aiLevel: 'standard',
      detectAntiPatterns: false,
      cancelled: true,
    };
  }
}

/**
 * Factory function to create and run the test wizard
 */
export async function runTestGenerationWizard(
  options: TestWizardOptions = {}
): Promise<TestWizardResult> {
  const wizard = new TestGenerationWizard(options);
  return wizard.run();
}

/**
 * Export types for external use
 */
export type { TestWizardOptions as Options };
