/**
 * Agentic QE v3 - Brain Command Handler
 *
 * Handles the 'aqe brain' command with subcommands: export, import, info.
 * Thin CLI wiring around the brain-commands module.
 */

import path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import { ICommandHandler, CLIContext } from './interfaces.js';
import {
  exportBrain,
  importBrain,
  brainInfo,
} from '../brain-commands.js';

// ============================================================================
// Brain Handler
// ============================================================================

export class BrainHandler implements ICommandHandler {
  readonly name = 'brain';
  readonly description = 'Export, import, and inspect QE brain state';

  private cleanupAndExit: (code: number) => Promise<never>;
  private ensureInitialized: () => Promise<boolean>;

  constructor(
    cleanupAndExit: (code: number) => Promise<never>,
    ensureInitialized: () => Promise<boolean>
  ) {
    this.cleanupAndExit = cleanupAndExit;
    this.ensureInitialized = ensureInitialized;
  }

  register(program: Command, _context: CLIContext): void {
    const brain = program
      .command('brain')
      .description(this.description);

    brain
      .command('export')
      .description('Export brain state to a portable directory')
      .requiredOption('-o, --output <path>', 'Output directory path')
      .option('--format <format>', 'Export format', 'jsonl')
      .option('--db <path>', 'Source database path', defaultDbPath())
      .action(async (options: ExportOptions) => {
        await this.executeExport(options);
      });

    brain
      .command('import')
      .description('Import brain state from an export directory')
      .requiredOption('-i, --input <path>', 'Path to brain export directory')
      .option('--strategy <strategy>', 'Merge strategy', 'skip-conflicts')
      .option('--dry-run', 'Preview import without writing', false)
      .option('--db <path>', 'Target database path', defaultDbPath())
      .action(async (options: ImportOptions) => {
        await this.executeImport(options);
      });

    brain
      .command('info')
      .description('Show manifest info for a brain export')
      .requiredOption('-i, --input <path>', 'Path to brain export directory')
      .action(async (options: InfoOptions) => {
        await this.executeInfo(options);
      });
  }

  private async executeExport(options: ExportOptions): Promise<void> {
    try {
      console.log(chalk.blue('\n  Exporting brain state...\n'));

      const manifest = await exportBrain(options.db, {
        outputPath: path.resolve(options.output),
      });

      console.log(chalk.green('  Export complete.'));
      console.log(`  Patterns: ${chalk.cyan(manifest.stats.patternCount)}`);
      console.log(`  Vectors:  ${chalk.cyan(manifest.stats.vectorCount)}`);
      console.log(`  Checksum: ${chalk.gray(manifest.checksum)}`);
      console.log(`  Output:   ${chalk.cyan(path.resolve(options.output))}`);
      console.log('');

      await this.cleanupAndExit(0);
    } catch (error) {
      console.error(chalk.red('\n  Brain export failed:'), error);
      await this.cleanupAndExit(1);
    }
  }

  private async executeImport(options: ImportOptions): Promise<void> {
    try {
      if (options.dryRun) {
        console.log(chalk.yellow('\n  Dry-run mode — no data will be written.\n'));
      } else {
        console.log(chalk.blue('\n  Importing brain state...\n'));
      }

      const result = await importBrain(options.db, path.resolve(options.input), {
        mergeStrategy: options.strategy as 'latest-wins' | 'highest-confidence' | 'union' | 'skip-conflicts',
        dryRun: options.dryRun,
      });

      console.log(chalk.green('  Import complete.'));
      console.log(`  Imported:  ${chalk.cyan(result.imported)}`);
      console.log(`  Skipped:   ${chalk.yellow(result.skipped)}`);
      console.log(`  Conflicts: ${chalk.red(result.conflicts)}`);
      console.log('');

      await this.cleanupAndExit(0);
    } catch (error) {
      console.error(chalk.red('\n  Brain import failed:'), error);
      await this.cleanupAndExit(1);
    }
  }

  private async executeInfo(options: InfoOptions): Promise<void> {
    try {
      console.log(chalk.blue('\n  Brain Export Info\n'));

      const manifest = await brainInfo(path.resolve(options.input));

      console.log(`  Version:    ${chalk.cyan(manifest.version)}`);
      console.log(`  Exported:   ${chalk.cyan(manifest.exportedAt)}`);
      console.log(`  Source DB:  ${chalk.cyan(manifest.sourceDb)}`);
      console.log(`  Patterns:   ${chalk.cyan(manifest.stats.patternCount)}`);
      console.log(`  Vectors:    ${chalk.cyan(manifest.stats.vectorCount)}`);
      console.log(`  Checksum:   ${chalk.gray(manifest.checksum)}`);
      console.log('');

      await this.cleanupAndExit(0);
    } catch (error) {
      console.error(chalk.red('\n  Failed to read brain info:'), error);
      await this.cleanupAndExit(1);
    }
  }

  getHelp(): string {
    return `
Export, import, and inspect QE brain state.

Usage:
  aqe brain export --output <path> [--format jsonl] [--db <path>]
  aqe brain import --input <path> [--strategy skip-conflicts] [--dry-run] [--db <path>]
  aqe brain info --input <path>

Subcommands:
  export    Export brain patterns and vectors to a portable directory
  import    Import a brain export into the local database
  info      Show manifest metadata for an existing brain export

Examples:
  aqe brain export -o ./my-brain-export
  aqe brain import -i ./my-brain-export --strategy latest-wins
  aqe brain import -i ./my-brain-export --dry-run
  aqe brain info -i ./my-brain-export
`;
  }
}

// ============================================================================
// Types
// ============================================================================

interface ExportOptions {
  output: string;
  format: string;
  db: string;
}

interface ImportOptions {
  input: string;
  strategy: string;
  dryRun: boolean;
  db: string;
}

interface InfoOptions {
  input: string;
}

// ============================================================================
// Helpers
// ============================================================================

function defaultDbPath(): string {
  return path.join(process.cwd(), '.agentic-qe', 'memory.db');
}

// ============================================================================
// Factory
// ============================================================================

export function createBrainHandler(
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>
): BrainHandler {
  return new BrainHandler(cleanupAndExit, ensureInitialized);
}
