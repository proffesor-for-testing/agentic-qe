/**
 * Wizard Command Interface and Base Classes
 * ADR-041: V3 QE CLI Enhancement
 *
 * Implements the Command Pattern for wizard steps, enabling:
 * - Consistent step execution across all wizards
 * - Reusable prompt components
 * - Easy testing and extension
 */

import * as readline from 'readline';

// ============================================================================
// Core Interfaces
// ============================================================================

/**
 * Context passed to each wizard command during execution
 */
export interface WizardContext {
  /** Readline interface for prompting */
  rl: readline.Interface;
  /** Current working directory */
  cwd: string;
  /** Accumulated results from previous steps */
  results: Record<string, unknown>;
  /** Whether running in non-interactive mode */
  nonInteractive: boolean;
}

/**
 * Result from a wizard command execution
 */
export interface CommandResult<T> {
  /** The value produced by the command */
  value: T;
  /** Whether to continue to next step (false = cancel wizard) */
  continue: boolean;
  /** Optional error message if command failed */
  error?: string;
}

/**
 * Interface for wizard commands (Command Pattern)
 */
export interface IWizardCommand<T> {
  /** Unique identifier for this command */
  readonly id: string;
  /** Step number in the wizard (e.g., "1/6") */
  readonly stepNumber: string;
  /** Display title for the step */
  readonly title: string;
  /** Optional description shown below title */
  readonly description?: string;

  /**
   * Execute the command
   * @param context - Wizard context with readline and accumulated results
   * @returns Command result with value and continuation flag
   */
  execute(context: WizardContext): Promise<CommandResult<T>>;

  /**
   * Get the default value for non-interactive mode
   */
  getDefaultValue(): T;

  /**
   * Validate the input value
   * @param value - Value to validate
   * @returns true if valid, error message string if invalid
   */
  validate?(value: T): boolean | string;
}

// ============================================================================
// Base Command Implementation
// ============================================================================

/**
 * Abstract base class for wizard commands
 * Provides common functionality for all wizard steps
 */
export abstract class BaseWizardCommand<T> implements IWizardCommand<T> {
  abstract readonly id: string;
  abstract readonly stepNumber: string;
  abstract readonly title: string;
  readonly description?: string;

  constructor(protected defaultValue: T) {}

  abstract execute(context: WizardContext): Promise<CommandResult<T>>;

  getDefaultValue(): T {
    return this.defaultValue;
  }

  validate?(value: T): boolean | string;

  /**
   * Helper to wrap a value in a successful command result
   */
  protected success(value: T): CommandResult<T> {
    return { value, continue: true };
  }

  /**
   * Helper to create a cancelled command result
   */
  protected cancelled(): CommandResult<T> {
    return { value: this.defaultValue, continue: false };
  }

  /**
   * Helper to create an error command result
   */
  protected error(message: string): CommandResult<T> {
    return { value: this.defaultValue, continue: false, error: message };
  }
}

// ============================================================================
// Option Types for Commands
// ============================================================================

/**
 * Single-select option for prompts
 */
export interface SelectOption<T> {
  /** Display key (e.g., "1", "2", "3") */
  key: string;
  /** Actual value to return when selected */
  value: T;
  /** Display label */
  label?: string;
  /** Description shown below the option */
  description?: string;
  /** Whether this is the default option */
  isDefault?: boolean;
  /** Whether this is a recommended option */
  isRecommended?: boolean;
}

/**
 * Multi-select option for prompts
 */
export interface MultiSelectOption<T> extends SelectOption<T> {
  /** Whether this option is included in default selection */
  isDefaultSelected?: boolean;
}

// ============================================================================
// Command Factory Types
// ============================================================================

/**
 * Configuration for creating a single-select command
 */
export interface SingleSelectConfig<T> {
  id: string;
  stepNumber: string;
  title: string;
  description?: string;
  options: SelectOption<T>[];
  defaultValue: T;
  validValues: T[];
}

/**
 * Configuration for creating a multi-select command
 */
export interface MultiSelectConfig<T> {
  id: string;
  stepNumber: string;
  title: string;
  description?: string;
  instructions?: string;
  options: MultiSelectOption<T>[];
  defaultValue: T[];
  validValues: T[];
  allowEmpty?: boolean;
}

/**
 * Configuration for creating a boolean (Y/n) command
 */
export interface BooleanConfig {
  id: string;
  stepNumber: string;
  title: string;
  description?: string;
  additionalInfo?: string;
  defaultValue: boolean;
}

/**
 * Configuration for creating a numeric input command
 */
export interface NumericConfig {
  id: string;
  stepNumber: string;
  title: string;
  description?: string;
  presets?: Array<{ key: string; value: number; label: string }>;
  defaultValue: number;
  min?: number;
  max?: number;
}

/**
 * Configuration for creating a path input command
 */
export interface PathInputConfig {
  id: string;
  stepNumber: string;
  title: string;
  description?: string;
  examples?: string;
  defaultValue: string;
  suggestionsProvider?: (cwd: string) => string[];
  validatePath?: boolean;
}
