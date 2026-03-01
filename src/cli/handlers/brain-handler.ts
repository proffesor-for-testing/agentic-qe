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
  type BrainManifest,
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
      .option('--format <format>', 'Export format: rvf (default) or jsonl', 'rvf')
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
      console.log(chalk.blue(`\n  Exporting brain state (format: ${options.format})...\n`));

      const manifest: BrainManifest = await exportBrain(options.db, {
        outputPath: path.resolve(options.output),
        format: options.format,
      });

      console.log(chalk.green('  Export complete.'));
      console.log(`  Format:   ${chalk.cyan('format' in manifest ? (manifest as { format?: string }).format ?? 'jsonl' : 'jsonl')}`);
      console.log(`  Patterns: ${chalk.cyan(manifest.stats.patternCount)}`);

      if ('embeddingCount' in manifest.stats) {
        console.log(`  Vectors:  ${chalk.cyan((manifest.stats as { embeddingCount: number }).embeddingCount)}`);
      } else if ('vectorCount' in manifest.stats) {
        console.log(`  Vectors:  ${chalk.cyan((manifest.stats as { vectorCount: number }).vectorCount)}`);
      }

      if ('rvfStatus' in manifest) {
        const rvf = (manifest as { rvfStatus: { fileSizeBytes: number; totalSegments: number } }).rvfStatus;
        console.log(`  RVF Size: ${chalk.cyan(formatBytes(rvf.fileSizeBytes))}`);
        console.log(`  Segments: ${chalk.cyan(rvf.totalSegments)}`);
      }

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
      if ('embeddingsRestored' in result) {
        console.log(`  Embeddings: ${chalk.cyan((result as { embeddingsRestored: number }).embeddingsRestored)}`);
      }
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

      const inputPath = path.resolve(options.input);
      const manifest: BrainManifest = await brainInfo(inputPath);

      console.log(`  Version:    ${chalk.cyan(manifest.version)}`);
      const format = 'format' in manifest ? (manifest as { format?: string }).format ?? 'jsonl' : 'jsonl';
      console.log(`  Format:     ${chalk.cyan(format)}`);
      console.log(`  Exported:   ${chalk.cyan(manifest.exportedAt)}`);
      console.log(`  Source DB:  ${chalk.cyan(manifest.sourceDb)}`);
      console.log(`  Patterns:   ${chalk.cyan(manifest.stats.patternCount)}`);

      if ('embeddingCount' in manifest.stats) {
        console.log(`  Embeddings: ${chalk.cyan((manifest.stats as { embeddingCount: number }).embeddingCount)}`);
      } else if ('vectorCount' in manifest.stats) {
        console.log(`  Vectors:    ${chalk.cyan((manifest.stats as { vectorCount: number }).vectorCount)}`);
      }

      if ('qValueCount' in manifest.stats) {
        console.log(`  Q-Values:   ${chalk.cyan((manifest.stats as { qValueCount: number }).qValueCount)}`);
      }
      if ('dreamInsightCount' in manifest.stats) {
        console.log(`  Dreams:     ${chalk.cyan((manifest.stats as { dreamInsightCount: number }).dreamInsightCount)}`);
      }
      if ('witnessChainLength' in manifest.stats) {
        console.log(`  Witnesses:  ${chalk.cyan((manifest.stats as { witnessChainLength: number }).witnessChainLength)}`);
      }

      if ('rvfStatus' in manifest) {
        const rvf = (manifest as { rvfStatus: { fileSizeBytes: number; totalVectors: number; totalSegments: number } }).rvfStatus;
        console.log(`  RVF Size:   ${chalk.cyan(formatBytes(rvf.fileSizeBytes))}`);
        console.log(`  RVF Vectors:${chalk.cyan(rvf.totalVectors)}`);
        console.log(`  Segments:   ${chalk.cyan(rvf.totalSegments)}`);
      }

      console.log(`  Checksum:   ${chalk.gray(manifest.checksum)}`);

      if ('domains' in manifest && Array.isArray(manifest.domains) && manifest.domains.length > 0) {
        console.log(`  Domains:    ${chalk.cyan(manifest.domains.join(', '))}`);
      }
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

Formats:
  rvf   — Single portable .rvf file (default, requires @ruvector/rvf-node)
  jsonl — JSONL directory format (fallback when native not available)

Usage:
  aqe brain export -o brain.rvf [--format rvf] [--db <path>]
  aqe brain export -o ./brain-dir --format jsonl [--db <path>]
  aqe brain import -i brain.rvf [--strategy skip-conflicts] [--dry-run] [--db <path>]
  aqe brain info -i brain.rvf

Subcommands:
  export    Export brain state to a portable .rvf file or JSONL directory
  import    Import a brain export into the local database
  info      Show manifest metadata for an existing brain export

Examples:
  aqe brain export -o .agentic-qe/brain.rvf
  aqe brain export -o .agentic-qe/brain.rvf --format rvf
  aqe brain export -o ./brain-export --format jsonl
  aqe brain import -i .agentic-qe/brain.rvf --strategy latest-wins
  aqe brain import -i .agentic-qe/brain.rvf --dry-run
  aqe brain info -i .agentic-qe/brain.rvf
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
