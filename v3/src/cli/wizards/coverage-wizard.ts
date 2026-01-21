/**
 * Coverage Analysis Wizard
 * ADR-041: V3 QE CLI Enhancement
 *
 * Interactive wizard for coverage analysis with step-by-step configuration.
 * Prompts for target directory, gap detection sensitivity, report format,
 * priority focus areas, risk scoring, and threshold percentage.
 */

import { createInterface } from 'readline';
import chalk from 'chalk';
import { existsSync, statSync, readdirSync } from 'fs';
import { join, resolve, relative, basename } from 'path';
import * as readline from 'readline';

// ============================================================================
// Types
// ============================================================================

export interface CoverageWizardOptions {
  /** Non-interactive mode with defaults */
  nonInteractive?: boolean;
  /** Default target directory */
  defaultTarget?: string;
  /** Default gap detection sensitivity */
  defaultSensitivity?: GapSensitivity;
  /** Default report format */
  defaultFormat?: ReportFormat;
  /** Default priority focus areas */
  defaultPriorityFocus?: PriorityFocus[];
  /** Default risk scoring toggle */
  defaultRiskScoring?: boolean;
  /** Default threshold percentage */
  defaultThreshold?: number;
}

export type GapSensitivity = 'low' | 'medium' | 'high';
export type ReportFormat = 'json' | 'html' | 'markdown' | 'text';
export type PriorityFocus = 'functions' | 'branches' | 'lines' | 'statements';

export interface CoverageWizardResult {
  /** Target directory or file to analyze */
  target: string;
  /** Gap detection sensitivity level */
  sensitivity: GapSensitivity;
  /** Report output format */
  format: ReportFormat;
  /** Priority focus areas for coverage analysis */
  priorityFocus: PriorityFocus[];
  /** Whether to include risk scoring */
  riskScoring: boolean;
  /** Coverage threshold percentage */
  threshold: number;
  /** Include patterns (comma-separated) */
  includePatterns?: string[];
  /** Exclude patterns (comma-separated) */
  excludePatterns?: string[];
  /** Whether the wizard was cancelled */
  cancelled: boolean;
}

// ============================================================================
// Sensitivity Configuration
// ============================================================================

const SENSITIVITY_CONFIG = {
  low: {
    minRisk: 0.7,
    maxGaps: 10,
    description: 'Only critical gaps with high risk scores',
  },
  medium: {
    minRisk: 0.5,
    maxGaps: 20,
    description: 'Moderate gaps including medium risk items',
  },
  high: {
    minRisk: 0.3,
    maxGaps: 50,
    description: 'All gaps including low risk items',
  },
};

// ============================================================================
// Wizard Implementation
// ============================================================================

export class CoverageAnalysisWizard {
  private options: CoverageWizardOptions;
  private cwd: string;

  constructor(options: CoverageWizardOptions = {}) {
    this.options = options;
    this.cwd = process.cwd();
  }

  /**
   * Run the interactive wizard
   */
  async run(): Promise<CoverageWizardResult> {
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

      // Step 1: Target directory
      const target = await this.promptTarget(rl);
      if (!target) {
        return this.getCancelled();
      }

      // Step 2: Gap detection sensitivity
      const sensitivity = await this.promptSensitivity(rl);

      // Step 3: Report format
      const format = await this.promptFormat(rl);

      // Step 4: Priority focus areas
      const priorityFocus = await this.promptPriorityFocus(rl);

      // Step 5: Risk scoring
      const riskScoring = await this.promptRiskScoring(rl);

      // Step 6: Threshold percentage
      const threshold = await this.promptThreshold(rl);

      // Step 7: Optional include/exclude patterns
      const patterns = await this.promptPatterns(rl);

      // Print summary
      const result: CoverageWizardResult = {
        target,
        sensitivity,
        format,
        priorityFocus,
        riskScoring,
        threshold,
        includePatterns: patterns.include,
        excludePatterns: patterns.exclude,
        cancelled: false,
      };

      this.printSummary(result);

      // Confirm
      const confirmed = await this.promptConfirmation(rl);
      if (!confirmed) {
        return this.getCancelled();
      }

      return result;
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
    console.log(chalk.blue.bold('     Coverage Analysis Wizard'));
    console.log(chalk.blue('========================================'));
    console.log(chalk.gray('Analyze code coverage with O(log n) gap detection'));
    console.log(chalk.gray('Press Ctrl+C to cancel at any time'));
    console.log('');
  }

  /**
   * Step 1: Prompt for target directory/file
   */
  private async promptTarget(rl: readline.Interface): Promise<string> {
    console.log(chalk.cyan('Step 1/7: Target Directory'));
    console.log(chalk.gray('Enter the directory or file to analyze for coverage'));
    console.log(chalk.gray('Examples: src/, ./lib, coverage/lcov.info'));
    console.log('');

    // Show suggestions
    const suggestions = this.getTargetSuggestions();
    if (suggestions.length > 0) {
      console.log(chalk.yellow('Detected directories:'));
      suggestions.slice(0, 5).forEach((s, i) => {
        console.log(chalk.gray(`  ${i + 1}. ${s}`));
      });
      console.log('');
    }

    const defaultValue = this.options.defaultTarget || '.';
    const input = await this.prompt(rl, `Target directory [${chalk.gray(defaultValue)}]: `);

    const value = input.trim() || defaultValue;

    // Resolve and validate the path
    const resolved = resolve(this.cwd, value);
    if (!existsSync(resolved)) {
      console.log(chalk.yellow(`  Warning: '${value}' does not exist, using current directory.`));
      return this.cwd;
    }

    return resolved;
  }

  /**
   * Step 2: Prompt for gap detection sensitivity
   */
  private async promptSensitivity(rl: readline.Interface): Promise<GapSensitivity> {
    console.log('');
    console.log(chalk.cyan('Step 2/7: Gap Detection Sensitivity'));
    console.log(chalk.gray('Select how sensitive the gap detection should be'));
    console.log('');

    const options: Array<{ key: string; value: GapSensitivity; description: string }> = [
      { key: '1', value: 'low', description: `Low - ${SENSITIVITY_CONFIG.low.description}` },
      { key: '2', value: 'medium', description: `Medium - ${SENSITIVITY_CONFIG.medium.description}` },
      { key: '3', value: 'high', description: `High - ${SENSITIVITY_CONFIG.high.description}` },
    ];

    const defaultValue = this.options.defaultSensitivity || 'medium';

    options.forEach(opt => {
      const marker = opt.value === defaultValue ? chalk.green(' (default)') : '';
      console.log(chalk.white(`  ${opt.key}. ${opt.value}${marker}`));
      console.log(chalk.gray(`     ${opt.description}`));
    });
    console.log('');

    const input = await this.prompt(rl, `Select sensitivity [${chalk.gray(defaultValue)}]: `);

    const value = input.trim();
    if (!value) return defaultValue;

    // Check if input is a number
    const numInput = parseInt(value, 10);
    if (numInput >= 1 && numInput <= options.length) {
      return options[numInput - 1].value;
    }

    // Check if input is a valid sensitivity
    const validValues: GapSensitivity[] = ['low', 'medium', 'high'];
    if (validValues.includes(value as GapSensitivity)) {
      return value as GapSensitivity;
    }

    console.log(chalk.yellow(`  Invalid input, using default: ${defaultValue}`));
    return defaultValue;
  }

  /**
   * Step 3: Prompt for report format
   */
  private async promptFormat(rl: readline.Interface): Promise<ReportFormat> {
    console.log('');
    console.log(chalk.cyan('Step 3/7: Report Format'));
    console.log(chalk.gray('Select the output format for the coverage report'));
    console.log('');

    const options: Array<{ key: string; value: ReportFormat; description: string }> = [
      { key: '1', value: 'json', description: 'JSON - Machine-readable, good for CI/CD pipelines' },
      { key: '2', value: 'html', description: 'HTML - Interactive, visual report with charts' },
      { key: '3', value: 'markdown', description: 'Markdown - Documentation-friendly format' },
      { key: '4', value: 'text', description: 'Text - Simple console output' },
    ];

    const defaultValue = this.options.defaultFormat || 'json';

    options.forEach(opt => {
      const marker = opt.value === defaultValue ? chalk.green(' (default)') : '';
      console.log(chalk.white(`  ${opt.key}. ${opt.value}${marker}`));
      console.log(chalk.gray(`     ${opt.description}`));
    });
    console.log('');

    const input = await this.prompt(rl, `Select format [${chalk.gray(defaultValue)}]: `);

    const value = input.trim();
    if (!value) return defaultValue;

    // Check if input is a number
    const numInput = parseInt(value, 10);
    if (numInput >= 1 && numInput <= options.length) {
      return options[numInput - 1].value;
    }

    // Check if input is a valid format
    const validFormats: ReportFormat[] = ['json', 'html', 'markdown', 'text'];
    if (validFormats.includes(value as ReportFormat)) {
      return value as ReportFormat;
    }

    console.log(chalk.yellow(`  Invalid input, using default: ${defaultValue}`));
    return defaultValue;
  }

  /**
   * Step 4: Prompt for priority focus areas
   */
  private async promptPriorityFocus(rl: readline.Interface): Promise<PriorityFocus[]> {
    console.log('');
    console.log(chalk.cyan('Step 4/7: Priority Focus Areas'));
    console.log(chalk.gray('Select coverage metrics to prioritize (comma-separated or numbers)'));
    console.log(chalk.gray('Example: 1,2 or functions,branches'));
    console.log('');

    const options: Array<{ key: string; value: PriorityFocus; description: string }> = [
      { key: '1', value: 'functions', description: 'Functions - Focus on function coverage' },
      { key: '2', value: 'branches', description: 'Branches - Focus on branch/decision coverage' },
      { key: '3', value: 'lines', description: 'Lines - Focus on line coverage' },
      { key: '4', value: 'statements', description: 'Statements - Focus on statement coverage' },
    ];

    const defaultValue: PriorityFocus[] = this.options.defaultPriorityFocus || ['functions', 'branches'];

    options.forEach(opt => {
      const isDefault = defaultValue.includes(opt.value);
      const marker = isDefault ? chalk.green(' *') : '';
      console.log(chalk.white(`  ${opt.key}. ${opt.value}${marker}`));
      console.log(chalk.gray(`     ${opt.description}`));
    });
    console.log('');
    console.log(chalk.gray(`  * = included in default selection`));
    console.log('');

    const input = await this.prompt(rl, `Select focus areas [${chalk.gray(defaultValue.join(','))}]: `);

    const value = input.trim();
    if (!value) return defaultValue;

    // Parse input - can be numbers or names
    const parts = value.split(',').map(p => p.trim()).filter(p => p.length > 0);
    const result: PriorityFocus[] = [];

    for (const part of parts) {
      const numInput = parseInt(part, 10);
      if (numInput >= 1 && numInput <= options.length) {
        result.push(options[numInput - 1].value);
      } else {
        const validFocus: PriorityFocus[] = ['functions', 'branches', 'lines', 'statements'];
        if (validFocus.includes(part as PriorityFocus)) {
          result.push(part as PriorityFocus);
        }
      }
    }

    if (result.length === 0) {
      console.log(chalk.yellow(`  Invalid input, using default: ${defaultValue.join(',')}`));
      return defaultValue;
    }

    // Remove duplicates
    return [...new Set(result)];
  }

  /**
   * Step 5: Prompt for risk scoring toggle
   */
  private async promptRiskScoring(rl: readline.Interface): Promise<boolean> {
    console.log('');
    console.log(chalk.cyan('Step 5/7: Risk Scoring'));
    console.log(chalk.gray('Enable risk scoring to prioritize coverage gaps by potential impact'));
    console.log(chalk.gray('Risk scores consider code complexity, change frequency, and criticality'));
    console.log('');

    const defaultValue = this.options.defaultRiskScoring !== undefined
      ? this.options.defaultRiskScoring
      : true;

    const defaultStr = defaultValue ? 'Y/n' : 'y/N';
    const input = await this.prompt(rl, `Enable risk scoring? [${chalk.gray(defaultStr)}]: `);

    const value = input.trim().toLowerCase();

    if (value === '') {
      return defaultValue;
    }

    if (value === 'n' || value === 'no') {
      return false;
    }
    if (value === 'y' || value === 'yes') {
      return true;
    }

    return defaultValue;
  }

  /**
   * Step 6: Prompt for threshold percentage
   */
  private async promptThreshold(rl: readline.Interface): Promise<number> {
    console.log('');
    console.log(chalk.cyan('Step 6/7: Coverage Threshold'));
    console.log(chalk.gray('Set the minimum coverage percentage required'));
    console.log(chalk.gray('Files below this threshold will be flagged'));
    console.log('');

    const presets = [
      { key: '1', value: 60, label: '60% - Legacy/maintenance projects' },
      { key: '2', value: 70, label: '70% - Standard projects' },
      { key: '3', value: 80, label: '80% - Quality-focused projects' },
      { key: '4', value: 90, label: '90% - Critical/high-reliability projects' },
    ];

    presets.forEach(preset => {
      const marker = preset.value === (this.options.defaultThreshold || 80) ? chalk.green(' (default)') : '';
      console.log(chalk.gray(`  ${preset.key}. ${preset.label}${marker}`));
    });
    console.log(chalk.gray('  Or enter a custom percentage (0-100)'));
    console.log('');

    const defaultValue = this.options.defaultThreshold || 80;
    const input = await this.prompt(rl, `Coverage threshold % [${chalk.gray(String(defaultValue))}]: `);

    const value = input.trim();
    if (!value) return defaultValue;

    // Check if it's a preset number
    const numInput = parseInt(value, 10);
    if (numInput >= 1 && numInput <= presets.length) {
      return presets[numInput - 1].value;
    }

    // Check if it's a valid percentage
    if (!isNaN(numInput) && numInput >= 0 && numInput <= 100) {
      return numInput;
    }

    console.log(chalk.yellow(`  Invalid input, using default: ${defaultValue}%`));
    return defaultValue;
  }

  /**
   * Step 7: Prompt for optional include/exclude patterns
   */
  private async promptPatterns(
    rl: readline.Interface
  ): Promise<{ include?: string[]; exclude?: string[] }> {
    console.log('');
    console.log(chalk.cyan('Step 7/7: File Patterns (Optional)'));
    console.log(chalk.gray('Specify patterns to include or exclude from analysis'));
    console.log(chalk.gray('Leave blank to analyze all files'));
    console.log('');

    // Include patterns
    const includeInput = await this.prompt(
      rl,
      `Include patterns [${chalk.gray('e.g., src/**/*.ts')}]: `
    );

    // Exclude patterns
    const excludeInput = await this.prompt(
      rl,
      `Exclude patterns [${chalk.gray('e.g., **/*.test.ts,dist/**')}]: `
    );

    const result: { include?: string[]; exclude?: string[] } = {};

    if (includeInput.trim()) {
      result.include = includeInput.split(',').map(p => p.trim()).filter(p => p.length > 0);
    }

    if (excludeInput.trim()) {
      result.exclude = excludeInput.split(',').map(p => p.trim()).filter(p => p.length > 0);
    }

    return result;
  }

  /**
   * Prompt for final confirmation
   */
  private async promptConfirmation(rl: readline.Interface): Promise<boolean> {
    console.log('');
    const input = await this.prompt(
      rl,
      `${chalk.green('Proceed with coverage analysis?')} [${chalk.gray('Y/n')}]: `
    );

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
  private printSummary(result: CoverageWizardResult): void {
    console.log('');
    console.log(chalk.blue('========================================'));
    console.log(chalk.blue.bold('       Configuration Summary'));
    console.log(chalk.blue('========================================'));
    console.log('');

    const relativePath = relative(this.cwd, result.target) || '.';
    console.log(chalk.white(`  Target:           ${chalk.cyan(relativePath)}`));
    console.log(chalk.white(`  Sensitivity:      ${chalk.cyan(result.sensitivity)}`));
    console.log(chalk.white(`  Report Format:    ${chalk.cyan(result.format)}`));
    console.log(chalk.white(`  Priority Focus:   ${chalk.cyan(result.priorityFocus.join(', '))}`));
    console.log(chalk.white(`  Risk Scoring:     ${chalk.cyan(result.riskScoring ? 'Enabled' : 'Disabled')}`));
    console.log(chalk.white(`  Threshold:        ${chalk.cyan(result.threshold + '%')}`));

    if (result.includePatterns && result.includePatterns.length > 0) {
      console.log(chalk.white(`  Include:          ${chalk.cyan(result.includePatterns.join(', '))}`));
    }
    if (result.excludePatterns && result.excludePatterns.length > 0) {
      console.log(chalk.white(`  Exclude:          ${chalk.cyan(result.excludePatterns.join(', '))}`));
    }

    // Show derived settings
    const config = SENSITIVITY_CONFIG[result.sensitivity];
    console.log('');
    console.log(chalk.gray('  Derived settings:'));
    console.log(chalk.gray(`    Min risk score: ${config.minRisk}`));
    console.log(chalk.gray(`    Max gaps shown: ${config.maxGaps}`));
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
   * Get target directory suggestions
   */
  private getTargetSuggestions(): string[] {
    const suggestions: string[] = [];

    // Check for common source directories
    const commonDirs = ['src', 'lib', 'app', 'packages'];
    for (const dir of commonDirs) {
      const dirPath = join(this.cwd, dir);
      if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
        suggestions.push(dir);
      }
    }

    // Check for coverage report files/directories
    const coverageLocations = [
      'coverage',
      'coverage/lcov.info',
      'coverage/coverage-final.json',
      '.nyc_output',
    ];
    for (const loc of coverageLocations) {
      const locPath = join(this.cwd, loc);
      if (existsSync(locPath)) {
        suggestions.push(loc);
      }
    }

    return suggestions;
  }

  /**
   * Get default result for non-interactive mode
   */
  private getDefaults(): CoverageWizardResult {
    return {
      target: this.options.defaultTarget || this.cwd,
      sensitivity: this.options.defaultSensitivity || 'medium',
      format: this.options.defaultFormat || 'json',
      priorityFocus: this.options.defaultPriorityFocus || ['functions', 'branches'],
      riskScoring: this.options.defaultRiskScoring !== undefined
        ? this.options.defaultRiskScoring
        : true,
      threshold: this.options.defaultThreshold || 80,
      cancelled: false,
    };
  }

  /**
   * Get cancelled result
   */
  private getCancelled(): CoverageWizardResult {
    return {
      target: '.',
      sensitivity: 'medium',
      format: 'json',
      priorityFocus: ['functions', 'branches'],
      riskScoring: true,
      threshold: 80,
      cancelled: true,
    };
  }
}

/**
 * Factory function to create and run the coverage wizard
 */
export async function runCoverageAnalysisWizard(
  options: CoverageWizardOptions = {}
): Promise<CoverageWizardResult> {
  const wizard = new CoverageAnalysisWizard(options);
  return wizard.run();
}

/**
 * Get sensitivity configuration for programmatic access
 */
export function getSensitivityConfig(sensitivity: GapSensitivity): {
  minRisk: number;
  maxGaps: number;
  description: string;
} {
  return SENSITIVITY_CONFIG[sensitivity];
}

/**
 * Export types for external use
 */
export type { CoverageWizardOptions as Options };
