/**
 * Agentic QE v3 - Protocol Command Handler
 *
 * Handles the 'aqe protocol' command group for protocol execution.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  ICommandHandler,
  CLIContext,
} from './interfaces.js';
import { parseJsonOption } from '../helpers/safe-json.js';

// ============================================================================
// Protocol Handler
// ============================================================================

export class ProtocolHandler implements ICommandHandler {
  readonly name = 'protocol';
  readonly description = 'Execute coordination protocols';

  private cleanupAndExit: (code: number) => Promise<never>;
  private ensureInitialized: () => Promise<boolean>;

  constructor(
    cleanupAndExit: (code: number) => Promise<never>,
    ensureInitialized: () => Promise<boolean>
  ) {
    this.cleanupAndExit = cleanupAndExit;
    this.ensureInitialized = ensureInitialized;
  }

  register(program: Command, context: CLIContext): void {
    const protocolCmd = program
      .command('protocol')
      .description(this.description);

    // protocol run
    protocolCmd
      .command('run <protocolId>')
      .description('Execute a protocol')
      .option('--params <json>', 'Protocol parameters as JSON', '{}')
      .action(async (protocolId: string, options) => {
        await this.executeRun(protocolId, options, context);
      });
  }

  private async executeRun(protocolId: string, options: RunOptions, context: CLIContext): Promise<void> {
    if (!await this.ensureInitialized()) return;

    try {
      const params = parseJsonOption(options.params, 'params');

      console.log(chalk.blue(`\n  Executing protocol: ${protocolId}\n`));

      const result = await context.queen!.executeProtocol(protocolId, params);

      if (result.success) {
        console.log(chalk.green(`  Protocol execution started`));
        console.log(chalk.cyan(`   Execution ID: ${result.value}`));
      } else {
        console.log(chalk.red(`  Failed to execute protocol: ${(result as { success: false; error: Error }).error.message}`));
      }

      console.log('');

    } catch (error) {
      console.error(chalk.red('\n  Failed to execute protocol:'), error);
      await this.cleanupAndExit(1);
    }
  }

  getHelp(): string {
    return `
Execute coordination protocols.

Usage:
  aqe protocol <command> [options]

Commands:
  run <protocolId>    Execute a protocol

Options:
  --params <json>     Protocol parameters as JSON (default: {})

Examples:
  aqe protocol run cross-domain-sync
  aqe protocol run data-validation --params '{"strict": true}'
`;
  }
}

// ============================================================================
// Types
// ============================================================================

interface RunOptions {
  params: string;
}

// ============================================================================
// Factory
// ============================================================================

export function createProtocolHandler(
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>
): ProtocolHandler {
  return new ProtocolHandler(cleanupAndExit, ensureInitialized);
}
