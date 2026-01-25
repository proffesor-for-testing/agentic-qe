/**
 * Wizard Utilities
 * ADR-041: V3 QE CLI Enhancement
 *
 * Shared utilities for wizard prompts, validation, and formatting.
 * Consolidates common functionality used across all wizards.
 */

import chalk from 'chalk';
import { existsSync, statSync } from 'fs';
import { join, relative } from 'path';
import * as readline from 'readline';

// ============================================================================
// Prompt Utilities
// ============================================================================

/**
 * Utility class for common wizard prompt operations
 */
export class WizardPrompt {
  /**
   * Generic prompt helper - wraps readline.question in a Promise
   */
  static prompt(rl: readline.Interface, question: string): Promise<string> {
    return new Promise(resolve => {
      rl.question(question, answer => {
        resolve(answer);
      });
    });
  }

  /**
   * Print a step header with consistent formatting
   */
  static printStepHeader(stepNumber: string, title: string, description?: string): void {
    console.log('');
    console.log(chalk.cyan(`Step ${stepNumber}: ${title}`));
    if (description) {
      console.log(chalk.gray(description));
    }
    console.log('');
  }

  /**
   * Print wizard header/banner
   */
  static printWizardHeader(title: string, subtitle?: string): void {
    console.log('');
    console.log(chalk.blue('========================================'));
    console.log(chalk.blue.bold(`     ${title}`));
    console.log(chalk.blue('========================================'));
    if (subtitle) {
      console.log(chalk.gray(subtitle));
    }
    console.log(chalk.gray('Press Ctrl+C to cancel at any time'));
    console.log('');
  }

  /**
   * Print configuration summary header
   */
  static printSummaryHeader(): void {
    console.log('');
    console.log(chalk.blue('========================================'));
    console.log(chalk.blue.bold('       Configuration Summary'));
    console.log(chalk.blue('========================================'));
    console.log('');
  }

  /**
   * Print a summary field with consistent formatting
   */
  static printSummaryField(label: string, value: string | string[], options?: {
    maxItems?: number;
    indent?: string;
    formatValue?: (v: string) => string;
  }): void {
    const indent = options?.indent ?? '  ';
    const maxItems = options?.maxItems ?? 5;
    const formatValue = options?.formatValue ?? ((v: string) => chalk.cyan(v));

    if (Array.isArray(value)) {
      if (value.length === 0) {
        console.log(chalk.white(`${indent}${label}:         ${chalk.gray('(none)')}`));
      } else if (value.length <= maxItems) {
        console.log(chalk.white(`${indent}${label}:         ${formatValue(value.join(', '))}`));
      } else {
        console.log(chalk.white(`${indent}${label}:`));
        value.slice(0, maxItems).forEach(v => {
          console.log(chalk.gray(`${indent}  - ${v}`));
        });
        console.log(chalk.gray(`${indent}  ... and ${value.length - maxItems} more`));
      }
    } else {
      const paddedLabel = label.padEnd(16);
      console.log(chalk.white(`${indent}${paddedLabel}${formatValue(value)}`));
    }
  }

  /**
   * Print derived/additional settings
   */
  static printDerivedSettings(settings: Record<string, string>, indent: string = '  '): void {
    console.log('');
    console.log(chalk.gray(`${indent}Derived settings:`));
    for (const [key, value] of Object.entries(settings)) {
      console.log(chalk.gray(`${indent}  ${key}: ${value}`));
    }
    console.log('');
  }
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Utility class for common validation operations
 */
export class WizardValidation {
  /**
   * Validate a path exists
   */
  static pathExists(path: string): boolean {
    return existsSync(path);
  }

  /**
   * Validate a path is a directory
   */
  static isDirectory(path: string): boolean {
    try {
      return existsSync(path) && statSync(path).isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Validate a path is a file
   */
  static isFile(path: string): boolean {
    try {
      return existsSync(path) && statSync(path).isFile();
    } catch {
      return false;
    }
  }

  /**
   * Validate a number is within range
   */
  static inRange(value: number, min: number, max: number): boolean {
    return value >= min && value <= max;
  }

  /**
   * Validate a value is in an allowed list
   */
  static isOneOf<T>(value: T, allowed: T[]): boolean {
    return allowed.includes(value);
  }
}

// ============================================================================
// Suggestion Providers
// ============================================================================

/**
 * Utility class for generating suggestions based on project structure
 */
export class WizardSuggestions {
  /**
   * Get suggestions for source directories
   */
  static getSourceDirectories(cwd: string): string[] {
    const suggestions: string[] = [];
    const commonDirs = ['src', 'lib', 'app', 'packages', 'api'];

    for (const dir of commonDirs) {
      const dirPath = join(cwd, dir);
      if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
        suggestions.push(dir);
      }
    }

    return suggestions;
  }

  /**
   * Get suggestions for coverage analysis targets
   */
  static getCoverageTargets(cwd: string): string[] {
    const suggestions = WizardSuggestions.getSourceDirectories(cwd);

    // Check for coverage report files/directories
    const coverageLocations = [
      'coverage',
      'coverage/lcov.info',
      'coverage/coverage-final.json',
      '.nyc_output',
    ];

    for (const loc of coverageLocations) {
      const locPath = join(cwd, loc);
      if (existsSync(locPath)) {
        suggestions.push(loc);
      }
    }

    return suggestions;
  }

  /**
   * Get suggestions for security scan targets
   */
  static getSecurityTargets(cwd: string): string[] {
    const suggestions = WizardSuggestions.getSourceDirectories(cwd);

    // Check for security-relevant files
    const securityFiles = [
      'package.json',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      '.env',
      '.env.example',
      'docker-compose.yml',
      'Dockerfile',
    ];

    for (const file of securityFiles) {
      const filePath = join(cwd, file);
      if (existsSync(filePath)) {
        suggestions.push(file);
      }
    }

    return suggestions;
  }

  /**
   * Get suggestions for test generation source files
   */
  static getTestSourceFiles(cwd: string): string[] {
    const suggestions: string[] = [];
    const commonDirs = ['src', 'lib', 'app', 'packages'];

    for (const dir of commonDirs) {
      const dirPath = join(cwd, dir);
      if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
        suggestions.push(`${dir}/**/*.ts`);
        suggestions.push(dir);
      }
    }

    // Add specific patterns for TypeScript projects
    if (existsSync(join(cwd, 'src'))) {
      suggestions.push('src/services/**/*.ts');
      suggestions.push('src/utils/**/*.ts');
      suggestions.push('src/components/**/*.tsx');
    }

    return suggestions;
  }

  /**
   * Check if pre-trained patterns exist
   */
  static checkPatternsExist(cwd: string): boolean {
    const patternLocations = [
      join(cwd, '.agentic-qe', 'patterns'),
      join(cwd, '.agentic-qe', 'memory.db'),
      join(cwd, '.aqe', 'patterns'),
      join(cwd, 'data', 'patterns'),
    ];

    return patternLocations.some(loc => existsSync(loc));
  }
}

// ============================================================================
// Format Utilities
// ============================================================================

/**
 * Utility class for formatting output
 */
export class WizardFormat {
  /**
   * Format a path relative to cwd
   */
  static relativePath(path: string, cwd: string): string {
    return relative(cwd, path) || '.';
  }

  /**
   * Format a boolean as Yes/No
   */
  static yesNo(value: boolean): string {
    return value ? 'Yes' : 'No';
  }

  /**
   * Format a boolean as Enabled/Disabled
   */
  static enabledDisabled(value: boolean): string {
    return value ? 'Enabled' : 'Disabled';
  }

  /**
   * Format a percentage
   */
  static percentage(value: number): string {
    return `${value}%`;
  }

  /**
   * Format an array with optional truncation
   */
  static truncatedList(items: string[], maxItems: number = 5): string {
    if (items.length === 0) return '(none)';
    if (items.length <= maxItems) return items.join(', ');
    return `${items.slice(0, maxItems).join(', ')}... and ${items.length - maxItems} more`;
  }
}
