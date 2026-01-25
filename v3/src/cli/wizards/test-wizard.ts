/**
 * Test Generation Wizard
 * ADR-041: V3 QE CLI Enhancement
 *
 * Interactive wizard for test generation with step-by-step configuration.
 * Refactored to use Command Pattern for reduced complexity and better reusability.
 */

import chalk from 'chalk';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { join, resolve, relative, extname, basename } from 'path';
import {
  BaseWizard,
  BaseWizardResult,
  IWizardCommand,
  WizardContext,
  CommandResult,
  BaseWizardCommand,
  SingleSelectStep,
  BooleanStep,
  NumericStep,
  WizardPrompt,
  WizardFormat,
  WizardSuggestions,
} from './core/index.js';

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

export interface TestWizardResult extends BaseWizardResult {
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
}

// ============================================================================
// Source Files Step (Custom)
// ============================================================================

/**
 * Custom step for source file selection with file resolution
 */
class SourceFilesStep extends BaseWizardCommand<string[]> {
  readonly id = 'sourceFiles';
  readonly stepNumber = '1/6';
  readonly title = 'Source Files';
  readonly description = 'Enter file paths, glob patterns, or directory';

  private defaultSourceFiles: string[];

  constructor(defaultSourceFiles: string[]) {
    super(defaultSourceFiles);
    this.defaultSourceFiles = defaultSourceFiles;
  }

  async execute(context: WizardContext): Promise<CommandResult<string[]>> {
    if (context.nonInteractive) {
      const resolved = this.resolveSourceFiles(this.defaultSourceFiles.join(', '), context.cwd);
      return this.success(resolved.length > 0 ? resolved : this.defaultSourceFiles);
    }

    WizardPrompt.printStepHeader(this.stepNumber, this.title, this.description);
    console.log(chalk.gray('Examples: src/services/*.ts, ./src/utils, src/auth.ts'));
    console.log('');

    // Show suggestions
    const suggestions = WizardSuggestions.getTestSourceFiles(context.cwd);
    if (suggestions.length > 0) {
      console.log(chalk.yellow('Suggestions:'));
      suggestions.slice(0, 5).forEach((s, i) => {
        console.log(chalk.gray(`  ${i + 1}. ${s}`));
      });
      console.log('');
    }

    const defaultValue = this.defaultSourceFiles.join(', ') || '.';
    const input = await WizardPrompt.prompt(
      context.rl,
      `Source files [${chalk.gray(defaultValue)}]: `
    );

    const value = input.trim() || defaultValue;

    // Parse input into file list
    const files = this.resolveSourceFiles(value, context.cwd);

    if (files.length === 0) {
      console.log(chalk.yellow('  No matching files found, using provided patterns'));
      return this.success(value.split(',').map(p => p.trim()).filter(p => p.length > 0));
    }

    return this.success(files);
  }

  /**
   * Resolve source files from input (glob patterns, directories, files)
   * Security: Validates that resolved paths stay within project directory to prevent path traversal
   */
  private resolveSourceFiles(input: string, cwd: string): string[] {
    const files: string[] = [];
    const parts = input.split(',').map(p => p.trim()).filter(p => p.length > 0);
    // Normalize cwd for consistent comparison (resolve removes trailing slashes and normalizes)
    const normalizedCwd = resolve(cwd);

    for (const part of parts) {
      const resolved = resolve(cwd, part);

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
        const baseDir = resolve(cwd, part.split('*')[0]);
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
}

// ============================================================================
// Framework Detection Step (Custom)
// ============================================================================

/**
 * Custom step for framework selection with auto-detection
 */
class FrameworkSelectStep extends SingleSelectStep<TestFramework> {
  private cwd: string;

  constructor(defaultFramework: TestFramework | undefined, cwd: string) {
    const detectedFramework = FrameworkSelectStep.detectFramework(cwd);
    const effectiveDefault = defaultFramework || detectedFramework || 'vitest';

    super({
      id: 'framework',
      stepNumber: '4/6',
      title: 'Test Framework',
      description: 'Select the testing framework to use',
      options: [
        {
          key: '1',
          value: 'vitest',
          label: 'vitest',
          description: 'Vitest - Fast, Vite-native testing',
          isRecommended: detectedFramework === 'vitest',
        },
        {
          key: '2',
          value: 'jest',
          label: 'jest',
          description: 'Jest - Feature-rich, widely adopted',
          isRecommended: detectedFramework === 'jest',
        },
        {
          key: '3',
          value: 'mocha',
          label: 'mocha',
          description: 'Mocha - Flexible, configurable',
          isRecommended: detectedFramework === 'mocha',
        },
        {
          key: '4',
          value: 'playwright',
          label: 'playwright',
          description: 'Playwright - Browser automation (for e2e)',
          isRecommended: detectedFramework === 'playwright',
        },
      ],
      defaultValue: effectiveDefault,
      validValues: ['jest', 'vitest', 'mocha', 'playwright'],
    });

    this.cwd = cwd;
  }

  /**
   * Detect test framework from project configuration
   * Security: Uses fs.readFileSync instead of require() to prevent code execution
   */
  static detectFramework(cwd: string): TestFramework | null {
    const packageJsonPath = join(cwd, 'package.json');

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
    if (existsSync(join(cwd, 'vitest.config.ts')) || existsSync(join(cwd, 'vitest.config.js'))) {
      return 'vitest';
    }
    if (existsSync(join(cwd, 'jest.config.ts')) || existsSync(join(cwd, 'jest.config.js'))) {
      return 'jest';
    }
    if (existsSync(join(cwd, 'playwright.config.ts')) || existsSync(join(cwd, 'playwright.config.js'))) {
      return 'playwright';
    }

    return null;
  }
}

// ============================================================================
// Wizard Implementation
// ============================================================================

export class TestGenerationWizard extends BaseWizard<TestWizardOptions, TestWizardResult> {
  constructor(options: TestWizardOptions = {}) {
    super(options);
  }

  protected getTitle(): string {
    return 'Test Generation Wizard';
  }

  protected getSubtitle(): string {
    return 'Generate tests with AI-powered assistance';
  }

  protected getConfirmationPrompt(): string {
    return 'Proceed with test generation?';
  }

  protected isNonInteractive(): boolean {
    return this.options.nonInteractive ?? false;
  }

  protected getCommands(): IWizardCommand<unknown>[] {
    return [
      // Step 1: Source files
      new SourceFilesStep(this.options.defaultSourceFiles || ['.']),

      // Step 2: Test type
      new SingleSelectStep<TestType>({
        id: 'testType',
        stepNumber: '2/6',
        title: 'Test Type',
        description: 'Select the type of tests to generate',
        options: [
          { key: '1', value: 'unit', label: 'unit', description: 'Unit tests - isolated component testing' },
          { key: '2', value: 'integration', label: 'integration', description: 'Integration tests - module interaction testing' },
          { key: '3', value: 'e2e', label: 'e2e', description: 'End-to-end tests - full workflow testing' },
          { key: '4', value: 'property', label: 'property', description: 'Property-based tests - invariant testing' },
          { key: '5', value: 'contract', label: 'contract', description: 'Contract tests - API contract validation' },
        ],
        defaultValue: this.options.defaultTestType || 'unit',
        validValues: ['unit', 'integration', 'e2e', 'property', 'contract'],
      }),

      // Step 3: Coverage target
      new NumericStep({
        id: 'coverageTarget',
        stepNumber: '3/6',
        title: 'Coverage target %',
        description: 'Target code coverage percentage (0-100). Recommended: 80% for new code, 60% for legacy.',
        defaultValue: this.options.defaultCoverageTarget || 80,
        min: 0,
        max: 100,
      }),

      // Step 4: Framework
      new FrameworkSelectStep(this.options.defaultFramework, this.cwd),

      // Step 5: AI enhancement level
      new SingleSelectStep<AIEnhancementLevel>({
        id: 'aiLevel',
        stepNumber: '5/6',
        title: 'AI Enhancement Level',
        description: 'Select the level of AI assistance for test generation',
        options: [
          { key: '1', value: 'none', label: 'none', description: 'None - Template-based generation only' },
          { key: '2', value: 'basic', label: 'basic', description: 'Basic - Simple pattern matching' },
          { key: '3', value: 'standard', label: 'standard', description: 'Standard - AI-powered test suggestions', isRecommended: true },
          { key: '4', value: 'advanced', label: 'advanced', description: 'Advanced - Full AI with edge case generation' },
        ],
        defaultValue: this.options.defaultAILevel || 'standard',
        validValues: ['none', 'basic', 'standard', 'advanced'],
      }),

      // Step 6: Anti-pattern detection
      new BooleanStep({
        id: 'detectAntiPatterns',
        stepNumber: '6/6',
        title: 'Enable anti-pattern detection',
        description: 'Enable detection and avoidance of code anti-patterns',
        defaultValue: true,
      }),
    ];
  }

  protected buildResult(results: Record<string, unknown>): TestWizardResult {
    return {
      sourceFiles: results.sourceFiles as string[],
      testType: results.testType as TestType,
      coverageTarget: results.coverageTarget as number,
      framework: results.framework as TestFramework,
      aiLevel: results.aiLevel as AIEnhancementLevel,
      detectAntiPatterns: results.detectAntiPatterns as boolean,
      cancelled: false,
    };
  }

  protected printSummary(result: TestWizardResult): void {
    WizardPrompt.printSummaryHeader();

    console.log(chalk.white('  Source Files:'));
    result.sourceFiles.slice(0, 5).forEach(f => {
      const relativePath = relative(this.cwd, f);
      console.log(chalk.gray(`    - ${relativePath || f}`));
    });
    if (result.sourceFiles.length > 5) {
      console.log(chalk.gray(`    ... and ${result.sourceFiles.length - 5} more`));
    }
    console.log('');

    WizardPrompt.printSummaryField('Test Type', result.testType);
    WizardPrompt.printSummaryField('Coverage Target', WizardFormat.percentage(result.coverageTarget));
    WizardPrompt.printSummaryField('Framework', result.framework);
    WizardPrompt.printSummaryField('AI Enhancement', result.aiLevel);
    WizardPrompt.printSummaryField('Anti-Patterns', WizardFormat.enabledDisabled(result.detectAntiPatterns));
    console.log('');
  }

  protected getDefaults(): TestWizardResult {
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

  protected getCancelled(): TestWizardResult {
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
