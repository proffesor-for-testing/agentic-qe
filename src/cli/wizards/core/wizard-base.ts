/**
 * Base Wizard Class
 * ADR-041: V3 QE CLI Enhancement
 *
 * Abstract base class for all wizards that provides:
 * - Common wizard lifecycle management
 * - Step execution orchestration
 * - Non-interactive mode handling
 * - Summary printing utilities
 */

import { createInterface } from 'readline';
import * as readline from 'readline';
import chalk from 'chalk';
import { IWizardCommand, WizardContext, CommandResult } from './wizard-command.js';
import { WizardPrompt } from './wizard-utils.js';

// ============================================================================
// Base Result Interface
// ============================================================================

/**
 * Base interface for wizard results
 */
export interface BaseWizardResult {
  /** Whether the wizard was cancelled */
  cancelled: boolean;
}

// ============================================================================
// Base Wizard Class
// ============================================================================

/**
 * Abstract base class for all interactive wizards
 *
 * @template TOptions - Wizard options type
 * @template TResult - Wizard result type
 */
export abstract class BaseWizard<TOptions, TResult extends BaseWizardResult> {
  protected options: TOptions;
  protected cwd: string;

  constructor(options: TOptions) {
    this.options = options;
    this.cwd = process.cwd();
  }

  /**
   * Get the wizard title for the header
   */
  protected abstract getTitle(): string;

  /**
   * Get the wizard subtitle for the header
   */
  protected abstract getSubtitle(): string;

  /**
   * Get the confirmation prompt text
   */
  protected abstract getConfirmationPrompt(): string;

  /**
   * Check if running in non-interactive mode
   */
  protected abstract isNonInteractive(): boolean;

  /**
   * Get default result for non-interactive mode
   */
  protected abstract getDefaults(): TResult;

  /**
   * Get cancelled result
   */
  protected abstract getCancelled(): TResult;

  /**
   * Build the result from collected step values
   */
  protected abstract buildResult(results: Record<string, unknown>): TResult;

  /**
   * Get the commands/steps for this wizard
   */
  protected abstract getCommands(): IWizardCommand<unknown>[];

  /**
   * Print the configuration summary
   */
  protected abstract printSummary(result: TResult): void;

  /**
   * Run the interactive wizard
   */
  async run(): Promise<TResult> {
    // Non-interactive mode returns defaults
    if (this.isNonInteractive()) {
      return this.getDefaults();
    }

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      // Print header
      this.printHeader();

      // Execute all commands/steps
      const results: Record<string, unknown> = {};
      const commands = this.getCommands();

      for (const command of commands) {
        const context: WizardContext = {
          rl,
          cwd: this.cwd,
          results,
          nonInteractive: false,
        };

        const commandResult = await command.execute(context);

        if (!commandResult.continue) {
          return this.getCancelled();
        }

        results[command.id] = commandResult.value;
      }

      // Build the final result
      const result = this.buildResult(results);

      // Print summary
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
  protected printHeader(): void {
    WizardPrompt.printWizardHeader(this.getTitle(), this.getSubtitle());
  }

  /**
   * Prompt for final confirmation
   */
  protected async promptConfirmation(rl: readline.Interface): Promise<boolean> {
    console.log('');
    const input = await WizardPrompt.prompt(
      rl,
      `${chalk.green(this.getConfirmationPrompt())} [${chalk.gray('Y/n')}]: `
    );

    const value = input.trim().toLowerCase();
    if (value === 'n' || value === 'no') {
      console.log(chalk.yellow('\nWizard cancelled.'));
      return false;
    }
    return true;
  }
}

// ============================================================================
// Wizard Runner Utility
// ============================================================================

/**
 * Execute a sequence of wizard commands
 * Useful for wizards that need more control over step execution
 */
export async function executeCommands<T extends BaseWizardResult>(
  rl: readline.Interface,
  cwd: string,
  commands: IWizardCommand<unknown>[],
  buildResult: (results: Record<string, unknown>) => T,
  getCancelled: () => T
): Promise<{ result: T; cancelled: boolean }> {
  const results: Record<string, unknown> = {};

  for (const command of commands) {
    const context: WizardContext = {
      rl,
      cwd,
      results,
      nonInteractive: false,
    };

    const commandResult = await command.execute(context);

    if (!commandResult.continue) {
      return { result: getCancelled(), cancelled: true };
    }

    results[command.id] = commandResult.value;
  }

  return { result: buildResult(results), cancelled: false };
}
