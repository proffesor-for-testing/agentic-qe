/**
 * Wizard Step Implementations
 * ADR-041: V3 QE CLI Enhancement
 *
 * Concrete command implementations for common wizard step types.
 * Each step type encapsulates the prompt logic and validation.
 */

import chalk from 'chalk';
import { existsSync, statSync } from 'fs';
import { resolve, join } from 'path';
import {
  BaseWizardCommand,
  WizardContext,
  CommandResult,
  SelectOption,
  MultiSelectOption,
  SingleSelectConfig,
  MultiSelectConfig,
  BooleanConfig,
  NumericConfig,
  PathInputConfig,
} from './wizard-command.js';
import { WizardPrompt } from './wizard-utils.js';

// ============================================================================
// Single Select Step
// ============================================================================

/**
 * A wizard step that prompts the user to select one option from a list
 */
export class SingleSelectStep<T extends string> extends BaseWizardCommand<T> {
  readonly id: string;
  readonly stepNumber: string;
  readonly title: string;
  readonly description?: string;

  private options: SelectOption<T>[];
  private validValues: T[];

  constructor(config: SingleSelectConfig<T>) {
    super(config.defaultValue);
    this.id = config.id;
    this.stepNumber = config.stepNumber;
    this.title = config.title;
    this.description = config.description;
    this.options = config.options;
    this.validValues = config.validValues;
  }

  async execute(context: WizardContext): Promise<CommandResult<T>> {
    if (context.nonInteractive) {
      return this.success(this.defaultValue);
    }

    // Print step header
    WizardPrompt.printStepHeader(this.stepNumber, this.title, this.description);

    // Print options
    this.options.forEach(opt => {
      const markers: string[] = [];
      if (opt.isRecommended) markers.push(chalk.green(' (recommended)'));
      else if (opt.isDefault || opt.value === this.defaultValue) markers.push(chalk.green(' (default)'));

      console.log(chalk.white(`  ${opt.key}. ${opt.label || opt.value}${markers.join('')}`));
      if (opt.description) {
        console.log(chalk.gray(`     ${opt.description}`));
      }
    });
    console.log('');

    const input = await WizardPrompt.prompt(
      context.rl,
      `Select ${this.title.toLowerCase()} [${chalk.gray(String(this.defaultValue))}]: `
    );

    const value = input.trim();
    if (!value) return this.success(this.defaultValue);

    // Check if input is a number
    const numInput = parseInt(value, 10);
    if (numInput >= 1 && numInput <= this.options.length) {
      return this.success(this.options[numInput - 1].value);
    }

    // Check if input is a valid value
    if (this.validValues.includes(value as T)) {
      return this.success(value as T);
    }

    console.log(chalk.yellow(`  Invalid input, using default: ${this.defaultValue}`));
    return this.success(this.defaultValue);
  }
}

// ============================================================================
// Multi Select Step
// ============================================================================

/**
 * A wizard step that prompts the user to select multiple options from a list
 */
export class MultiSelectStep<T extends string> extends BaseWizardCommand<T[]> {
  readonly id: string;
  readonly stepNumber: string;
  readonly title: string;
  readonly description?: string;

  private options: MultiSelectOption<T>[];
  private validValues: T[];
  private instructions?: string;
  private allowEmpty: boolean;

  constructor(config: MultiSelectConfig<T>) {
    super(config.defaultValue);
    this.id = config.id;
    this.stepNumber = config.stepNumber;
    this.title = config.title;
    this.description = config.description;
    this.options = config.options;
    this.validValues = config.validValues;
    this.instructions = config.instructions;
    this.allowEmpty = config.allowEmpty ?? false;
  }

  async execute(context: WizardContext): Promise<CommandResult<T[]>> {
    if (context.nonInteractive) {
      return this.success(this.defaultValue);
    }

    // Print step header
    WizardPrompt.printStepHeader(this.stepNumber, this.title, this.description);

    if (this.instructions) {
      console.log(chalk.gray(this.instructions));
      console.log('');
    }

    // Print options with default markers
    this.options.forEach(opt => {
      const isDefault = opt.isDefaultSelected || this.defaultValue.includes(opt.value);
      const marker = isDefault ? chalk.green(' *') : '';
      console.log(chalk.white(`  ${opt.key}. ${opt.label || opt.value}${marker}`));
      if (opt.description) {
        console.log(chalk.gray(`     ${opt.description}`));
      }
    });
    console.log('');
    console.log(chalk.gray('  * = included in default selection'));
    console.log('');

    const defaultDisplay = this.defaultValue.join(',');
    const input = await WizardPrompt.prompt(
      context.rl,
      `Select options [${chalk.gray(defaultDisplay)}]: `
    );

    const value = input.trim();
    if (!value) return this.success(this.defaultValue);

    // Parse comma-separated input
    const parts = value.split(',').map(p => p.trim().toLowerCase()).filter(p => p.length > 0);
    const result: T[] = [];

    for (const part of parts) {
      const numInput = parseInt(part, 10);
      if (numInput >= 1 && numInput <= this.options.length) {
        result.push(this.options[numInput - 1].value);
      } else if (this.validValues.includes(part as T)) {
        result.push(part as T);
      }
    }

    if (result.length === 0) {
      if (this.allowEmpty) {
        return this.success([]);
      }
      console.log(chalk.yellow(`  Invalid input, using default: ${defaultDisplay}`));
      return this.success(this.defaultValue);
    }

    // Remove duplicates
    return this.success([...new Set(result)]);
  }
}

// ============================================================================
// Boolean Step
// ============================================================================

/**
 * A wizard step that prompts the user for a yes/no answer
 */
export class BooleanStep extends BaseWizardCommand<boolean> {
  readonly id: string;
  readonly stepNumber: string;
  readonly title: string;
  readonly description?: string;

  private additionalInfo?: string;

  constructor(config: BooleanConfig) {
    super(config.defaultValue);
    this.id = config.id;
    this.stepNumber = config.stepNumber;
    this.title = config.title;
    this.description = config.description;
    this.additionalInfo = config.additionalInfo;
  }

  async execute(context: WizardContext): Promise<CommandResult<boolean>> {
    if (context.nonInteractive) {
      return this.success(this.defaultValue);
    }

    // Print step header
    WizardPrompt.printStepHeader(this.stepNumber, this.title, this.description);

    if (this.additionalInfo) {
      console.log(chalk.gray(this.additionalInfo));
      console.log('');
    }

    const defaultStr = this.defaultValue ? 'Y/n' : 'y/N';
    const input = await WizardPrompt.prompt(
      context.rl,
      `${this.title}? [${chalk.gray(defaultStr)}]: `
    );

    const value = input.trim().toLowerCase();

    if (value === '') {
      return this.success(this.defaultValue);
    }

    if (value === 'n' || value === 'no') {
      return this.success(false);
    }
    if (value === 'y' || value === 'yes') {
      return this.success(true);
    }

    return this.success(this.defaultValue);
  }
}

// ============================================================================
// Numeric Step
// ============================================================================

/**
 * A wizard step that prompts the user for a numeric value
 */
export class NumericStep extends BaseWizardCommand<number> {
  readonly id: string;
  readonly stepNumber: string;
  readonly title: string;
  readonly description?: string;

  private presets?: Array<{ key: string; value: number; label: string }>;
  private min?: number;
  private max?: number;

  constructor(config: NumericConfig) {
    super(config.defaultValue);
    this.id = config.id;
    this.stepNumber = config.stepNumber;
    this.title = config.title;
    this.description = config.description;
    this.presets = config.presets;
    this.min = config.min;
    this.max = config.max;
  }

  async execute(context: WizardContext): Promise<CommandResult<number>> {
    if (context.nonInteractive) {
      return this.success(this.defaultValue);
    }

    // Print step header
    WizardPrompt.printStepHeader(this.stepNumber, this.title, this.description);

    // Print presets if available
    if (this.presets && this.presets.length > 0) {
      this.presets.forEach(preset => {
        const marker = preset.value === this.defaultValue ? chalk.green(' (default)') : '';
        console.log(chalk.gray(`  ${preset.key}. ${preset.label}${marker}`));
      });

      if (this.min !== undefined && this.max !== undefined) {
        console.log(chalk.gray(`  Or enter a custom number (${this.min}-${this.max})`));
      }
      console.log('');
    }

    const input = await WizardPrompt.prompt(
      context.rl,
      `${this.title} [${chalk.gray(String(this.defaultValue))}]: `
    );

    const value = input.trim();
    if (!value) return this.success(this.defaultValue);

    const numValue = parseInt(value, 10);

    // Check if it's a preset key
    if (this.presets) {
      const presetIndex = numValue;
      if (presetIndex >= 1 && presetIndex <= this.presets.length) {
        return this.success(this.presets[presetIndex - 1].value);
      }
    }

    // Validate range
    if (!isNaN(numValue)) {
      if (this.min !== undefined && numValue < this.min) {
        console.log(chalk.yellow(`  Value too low, using minimum: ${this.min}`));
        return this.success(this.min);
      }
      if (this.max !== undefined && numValue > this.max) {
        console.log(chalk.yellow(`  Value too high, using maximum: ${this.max}`));
        return this.success(this.max);
      }
      return this.success(numValue);
    }

    console.log(chalk.yellow(`  Invalid input, using default: ${this.defaultValue}`));
    return this.success(this.defaultValue);
  }
}

// ============================================================================
// Path Input Step
// ============================================================================

/**
 * A wizard step that prompts the user for a file or directory path
 */
export class PathInputStep extends BaseWizardCommand<string> {
  readonly id: string;
  readonly stepNumber: string;
  readonly title: string;
  readonly description?: string;

  private examples?: string;
  private suggestionsProvider?: (cwd: string) => string[];
  private validatePath: boolean;

  constructor(config: PathInputConfig) {
    super(config.defaultValue);
    this.id = config.id;
    this.stepNumber = config.stepNumber;
    this.title = config.title;
    this.description = config.description;
    this.examples = config.examples;
    this.suggestionsProvider = config.suggestionsProvider;
    this.validatePath = config.validatePath ?? true;
  }

  async execute(context: WizardContext): Promise<CommandResult<string>> {
    if (context.nonInteractive) {
      const resolved = resolve(context.cwd, this.defaultValue);
      return this.success(existsSync(resolved) ? resolved : context.cwd);
    }

    // Print step header
    WizardPrompt.printStepHeader(this.stepNumber, this.title, this.description);

    if (this.examples) {
      console.log(chalk.gray(`Examples: ${this.examples}`));
      console.log('');
    }

    // Show suggestions if provider is available
    if (this.suggestionsProvider) {
      const suggestions = this.suggestionsProvider(context.cwd);
      if (suggestions.length > 0) {
        console.log(chalk.yellow('Detected directories:'));
        suggestions.slice(0, 5).forEach((s, i) => {
          console.log(chalk.gray(`  ${i + 1}. ${s}`));
        });
        console.log('');
      }
    }

    const input = await WizardPrompt.prompt(
      context.rl,
      `${this.title} [${chalk.gray(this.defaultValue)}]: `
    );

    const value = input.trim() || this.defaultValue;

    // Resolve and validate the path
    const resolved = resolve(context.cwd, value);

    if (this.validatePath && !existsSync(resolved)) {
      console.log(chalk.yellow(`  Warning: '${value}' does not exist, using current directory.`));
      return this.success(context.cwd);
    }

    return this.success(resolved);
  }
}

// ============================================================================
// Confirmation Step
// ============================================================================

/**
 * A wizard step for final confirmation before proceeding
 */
export class ConfirmationStep extends BaseWizardCommand<boolean> {
  readonly id = 'confirmation';
  readonly stepNumber = '';
  readonly title: string;

  constructor(title: string = 'Proceed?') {
    super(true);
    this.title = title;
  }

  async execute(context: WizardContext): Promise<CommandResult<boolean>> {
    if (context.nonInteractive) {
      return this.success(true);
    }

    console.log('');
    const input = await WizardPrompt.prompt(
      context.rl,
      `${chalk.green(this.title)} [${chalk.gray('Y/n')}]: `
    );

    const value = input.trim().toLowerCase();
    if (value === 'n' || value === 'no') {
      console.log(chalk.yellow('\nWizard cancelled.'));
      return this.cancelled();
    }
    return this.success(true);
  }
}

// ============================================================================
// Patterns Input Step
// ============================================================================

/**
 * A wizard step for entering file patterns (include/exclude)
 */
export class PatternsInputStep extends BaseWizardCommand<{ include?: string[]; exclude?: string[] }> {
  readonly id: string;
  readonly stepNumber: string;
  readonly title: string;
  readonly description?: string;

  constructor(config: {
    id: string;
    stepNumber: string;
    title: string;
    description?: string;
  }) {
    super({});
    this.id = config.id;
    this.stepNumber = config.stepNumber;
    this.title = config.title;
    this.description = config.description;
  }

  async execute(context: WizardContext): Promise<CommandResult<{ include?: string[]; exclude?: string[] }>> {
    if (context.nonInteractive) {
      return this.success({});
    }

    // Print step header
    WizardPrompt.printStepHeader(this.stepNumber, this.title, this.description);

    // Include patterns
    const includeInput = await WizardPrompt.prompt(
      context.rl,
      `Include patterns [${chalk.gray('e.g., src/**/*.ts')}]: `
    );

    // Exclude patterns
    const excludeInput = await WizardPrompt.prompt(
      context.rl,
      `Exclude patterns [${chalk.gray('e.g., **/*.test.ts,dist/**')}]: `
    );

    const result: { include?: string[]; exclude?: string[] } = {};

    if (includeInput.trim()) {
      result.include = includeInput.split(',').map(p => p.trim()).filter(p => p.length > 0);
    }

    if (excludeInput.trim()) {
      result.exclude = excludeInput.split(',').map(p => p.trim()).filter(p => p.length > 0);
    }

    return this.success(result);
  }
}
