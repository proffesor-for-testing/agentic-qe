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
  brainDiff,
  brainSearch,
  witnessBackfill,
  type BrainManifest,
} from '../brain-commands.js';
import type {
  BrainDiffResult,
  TableDiff,
} from '../../integrations/ruvector/brain-diff.js';
import type { BrainSearchResult } from '../../integrations/ruvector/brain-search.js';

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
      .option('--db <path>', 'Source database path')
      .action(async (options: ExportOptions) => {
        await this.executeExport(options);
      });

    brain
      .command('import')
      .description('Import brain state from an export directory')
      .requiredOption('-i, --input <path>', 'Path to brain export directory')
      .option('--strategy <strategy>', 'Merge strategy', 'skip-conflicts')
      .option('--dry-run', 'Preview import without writing', false)
      .option('--db <path>', 'Target database path')
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

    brain
      .command('witness-backfill')
      .description('Create witness chain entries for patterns that predate the witness chain')
      .option('--db <path>', 'Database path')
      .action(async (options: { db: string }) => {
        await this.executeWitnessBackfill(options);
      });

    brain
      .command('diff')
      .description('Compare two brain exports (JSONL directory or .rvf file)')
      .argument('<a>', 'Path to first brain export')
      .argument('<b>', 'Path to second brain export')
      .option('--table <name>', 'Restrict comparison to a single table')
      .option('--verbose', 'Show the IDs of added/removed/changed records', false)
      .option('--json', 'Emit the diff as JSON to stdout', false)
      .action(async (a: string, b: string, options: DiffOptions) => {
        await this.executeDiff(a, b, options);
      });

    brain
      .command('search')
      .description('Search a JSONL brain export with filters')
      .requiredOption('-i, --input <path>', 'Path to brain export directory (JSONL)')
      .option('--table <name>', 'Table to search (default: qe_patterns)')
      .option('--domain <name...>', 'Restrict to one or more domains')
      .option('--pattern-type <type>', 'Restrict to a specific pattern_type (qe_patterns only)')
      .option('--since <iso>', 'Include rows with timestamp ≥ <iso>')
      .option('--until <iso>', 'Include rows with timestamp ≤ <iso>')
      .option('-q, --query <text>', 'Substring match across name + description (case-insensitive)')
      .option('-l, --limit <n>', 'Maximum results to return', '20')
      .option('--json', 'Emit results as JSON to stdout', false)
      .action(async (options: SearchOptions) => {
        await this.executeSearch(options);
      });
  }

  private async executeExport(options: ExportOptions): Promise<void> {
    try {
      console.log(chalk.blue(`\n  Exporting brain state (format: ${options.format})...\n`));

      const dbPath = await resolveDbPath(options.db);
      const manifest: BrainManifest = await exportBrain(dbPath, {
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

      const importDbPath = await resolveDbPath(options.db);
      const result = await importBrain(importDbPath, path.resolve(options.input), {
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

      const format = 'format' in manifest
        ? (manifest as { format?: string }).format ?? 'jsonl'
        : 'jsonl';

      // Header section
      console.log(`  Version:       ${chalk.cyan(manifest.version)}`);
      console.log(`  Format:        ${chalk.cyan(format)}`);
      console.log(`  Exported:      ${chalk.cyan(manifest.exportedAt)}`);
      console.log(`  Source DB:     ${chalk.cyan(manifest.sourceDb)}`);

      // Learning Data section
      console.log(chalk.blue('\n  Learning Data:'));
      console.log(`    Patterns:      ${chalk.cyan(manifest.stats.patternCount)}`);

      if ('qValueCount' in manifest.stats) {
        console.log(`    Q-Values:      ${chalk.cyan((manifest.stats as { qValueCount: number }).qValueCount)}`);
      }
      if ('dreamInsightCount' in manifest.stats) {
        const dreamCount = (manifest.stats as { dreamInsightCount: number }).dreamInsightCount;
        const tableRecordCounts = 'tableRecordCounts' in manifest
          ? (manifest as { tableRecordCounts?: Record<string, number> }).tableRecordCounts
          : undefined;
        const cycleCount = tableRecordCounts?.['dream_cycles'];
        const cycleInfo = cycleCount !== undefined ? ` (${cycleCount} cycles)` : '';
        console.log(`    Dream Insights: ${chalk.cyan(dreamCount)}${chalk.gray(cycleInfo)}`);
      }
      if ('witnessChainLength' in manifest.stats) {
        console.log(`    Witness Chain:  ${chalk.cyan((manifest.stats as { witnessChainLength: number }).witnessChainLength)} entries`);
      }

      if ('embeddingCount' in manifest.stats) {
        console.log(`    Embeddings:    ${chalk.cyan((manifest.stats as { embeddingCount: number }).embeddingCount)}`);
      } else if ('vectorCount' in manifest.stats) {
        console.log(`    Vectors:       ${chalk.cyan((manifest.stats as { vectorCount: number }).vectorCount)}`);
      }

      // Additional table counts from tableRecordCounts (v3.0 manifests)
      const tableRecordCounts = 'tableRecordCounts' in manifest
        ? (manifest as { tableRecordCounts?: Record<string, number> }).tableRecordCounts
        : undefined;
      if (tableRecordCounts) {
        const additionalTables = Object.entries(tableRecordCounts).filter(
          ([name, count]) =>
            count > 0 &&
            !['qe_patterns', 'rl_q_values', 'dream_insights', 'dream_cycles',
              'witness_chain', 'vectors', 'qe_pattern_embeddings'].includes(name)
        );
        if (additionalTables.length > 0) {
          for (const [name, count] of additionalTables) {
            const label = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            const paddedLabel = `${label}:`.padEnd(15);
            console.log(`    ${paddedLabel}${chalk.cyan(count)}`);
          }
        }
      }

      // Summary section
      const totalRecords = 'totalRecords' in manifest.stats
        ? (manifest.stats as { totalRecords: number }).totalRecords
        : undefined;
      if (totalRecords !== undefined) {
        console.log(chalk.blue('\n  Summary:'));
        console.log(`    Total Records: ${chalk.cyan(totalRecords)}`);
      }

      if ('domains' in manifest && Array.isArray(manifest.domains) && manifest.domains.length > 0) {
        if (!totalRecords) console.log(chalk.blue('\n  Summary:'));
        console.log(`    Domains:       ${chalk.cyan(manifest.domains.join(', '))}`);
      }

      // RVF-specific details
      if ('rvfStatus' in manifest) {
        const rvf = (manifest as { rvfStatus: { fileSizeBytes: number; totalVectors: number; totalSegments: number } }).rvfStatus;
        console.log(chalk.blue('\n  RVF Details:'));
        console.log(`    File Size:     ${chalk.cyan(formatBytes(rvf.fileSizeBytes))}`);
        console.log(`    Vectors:       ${chalk.cyan(rvf.totalVectors)}`);
        console.log(`    Segments:      ${chalk.cyan(rvf.totalSegments)}`);
      }

      // Lineage tracking (RVF v3.0)
      if ('lineage' in manifest) {
        const lineage = (manifest as { lineage?: { fileId: string; parentId: string | null; lineageDepth: number } }).lineage;
        if (lineage) {
          console.log(chalk.blue('\n  Lineage:'));
          console.log(`    File ID:       ${chalk.cyan(lineage.fileId)}`);
          console.log(`    Parent ID:     ${chalk.cyan(lineage.parentId ?? 'none (root)')}`);
          console.log(`    Depth:         ${chalk.cyan(lineage.lineageDepth)}`);
        }
      }

      // Signing status (RVF v3.0)
      if ('signature' in manifest) {
        const sig = (manifest as { signature?: string; signerKeyId?: string }).signature;
        const keyId = (manifest as { signerKeyId?: string }).signerKeyId;
        console.log(chalk.blue('\n  Signature:'));
        if (sig) {
          console.log(`    Status:        ${chalk.green('Signed')}`);
          console.log(`    Key ID:        ${chalk.cyan(keyId ?? 'unknown')}`);
          console.log(`    Signature:     ${chalk.gray(sig.slice(0, 32) + '...')}`);
        } else {
          console.log(`    Status:        ${chalk.yellow('Unsigned')}`);
        }
      }

      console.log(`\n  Checksum:      ${chalk.gray(manifest.checksum)}`);
      console.log('');

      await this.cleanupAndExit(0);
    } catch (error) {
      console.error(chalk.red('\n  Failed to read brain info:'), error);
      await this.cleanupAndExit(1);
    }
  }

  private async executeDiff(a: string, b: string, options: DiffOptions): Promise<void> {
    try {
      const result = await brainDiff(path.resolve(a), path.resolve(b), {
        tableFilter: options.table,
      });

      if (options.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        await this.cleanupAndExit(result.identical ? 0 : 1);
        return;
      }

      renderDiff(result, options.verbose);

      // Exit code convention: 0 when identical, 1 when differences exist.
      await this.cleanupAndExit(result.identical ? 0 : 1);
    } catch (error) {
      console.error(chalk.red('\n  Brain diff failed:'), error);
      await this.cleanupAndExit(2);
    }
  }

  private async executeSearch(options: SearchOptions): Promise<void> {
    try {
      const limit = parseLimit(options.limit);
      const domains = normalizeDomainOption(options.domain);

      const result = await brainSearch(path.resolve(options.input), {
        table: options.table,
        domains,
        patternType: options.patternType,
        since: options.since,
        until: options.until,
        query: options.query,
        limit,
      });

      if (options.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        await this.cleanupAndExit(result.totalMatched > 0 ? 0 : 3);
        return;
      }

      renderSearch(result);
      await this.cleanupAndExit(result.totalMatched > 0 ? 0 : 3);
    } catch (error) {
      console.error(chalk.red('\n  Brain search failed:'), error);
      await this.cleanupAndExit(2);
    }
  }

  private async executeWitnessBackfill(options: { db: string }): Promise<void> {
    try {
      console.log(chalk.blue('\n  Running witness chain backfill...\n'));

      const backfillDbPath = await resolveDbPath(options.db);
      const result = await witnessBackfill(backfillDbPath);

      console.log(chalk.green('  Backfill complete.'));
      console.log(`  Created: ${chalk.cyan(result.created)} new witness entries`);
      console.log(`  Skipped: ${chalk.cyan(result.skipped)} (already witnessed)`);
      console.log('');

      await this.cleanupAndExit(0);
    } catch (error) {
      console.error(chalk.red('\n  Witness backfill failed:'), error);
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
  diff      Compare two brain exports (manifest always; record-level for JSONL)
  search    Filtered search over a JSONL brain export

Examples:
  aqe brain export -o .agentic-qe/brain.rvf
  aqe brain export -o .agentic-qe/brain.rvf --format rvf
  aqe brain export -o ./brain-export --format jsonl
  aqe brain import -i .agentic-qe/brain.rvf --strategy latest-wins
  aqe brain import -i .agentic-qe/brain.rvf --dry-run
  aqe brain info -i .agentic-qe/brain.rvf
  aqe brain diff ./brain-a ./brain-b --verbose
  aqe brain search -i ./brain-export --query oauth --domain test-generation
  aqe brain search -i ./brain-export --since 2026-03-01 --limit 50 --json
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

interface DiffOptions {
  table?: string;
  verbose: boolean;
  json: boolean;
}

interface SearchOptions {
  input: string;
  table?: string;
  domain?: string | string[];
  patternType?: string;
  since?: string;
  until?: string;
  query?: string;
  limit: string;
  json: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

async function resolveDbPath(optionValue?: string): Promise<string> {
  if (optionValue) return optionValue;
  const { findProjectRoot } = await import('../../kernel/unified-memory.js');
  return path.join(findProjectRoot(), '.agentic-qe', 'memory.db');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseLimit(raw: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 20;
  return n;
}

function normalizeDomainOption(value: string | string[] | undefined): readonly string[] | undefined {
  if (value === undefined) return undefined;
  const arr = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  for (const raw of arr) {
    for (const part of raw.split(',')) {
      const trimmed = part.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return out.length > 0 ? out : undefined;
}

function renderDiff(result: BrainDiffResult, verbose: boolean): void {
  console.log(chalk.blue('\n  Brain Diff\n'));
  console.log(`  A:            ${chalk.cyan(result.pathA)}  (${result.formatA})`);
  console.log(`  B:            ${chalk.cyan(result.pathB)}  (${result.formatB})`);
  console.log(
    `  Versions:     ${chalk.cyan(result.manifestA.version)} → ${chalk.cyan(result.manifestB.version)}` +
      (result.versionMatch ? chalk.gray(' (match)') : chalk.yellow(' (differ)')),
  );
  console.log(
    `  Checksums:    ${chalk.gray(result.manifestA.checksum.slice(0, 12))}… → ` +
      `${chalk.gray(result.manifestB.checksum.slice(0, 12))}…` +
      (result.checksumMatch ? chalk.gray(' (match)') : chalk.yellow(' (differ)')),
  );
  console.log(
    `  Exported:     ${chalk.gray(result.manifestA.exportedAt)} → ${chalk.gray(result.manifestB.exportedAt)}`,
  );
  console.log(
    `  Records:      ${chalk.cyan(result.manifestA.totalRecords)} → ${chalk.cyan(result.manifestB.totalRecords)} ` +
      formatDelta(result.manifestB.totalRecords - result.manifestA.totalRecords),
  );

  if (result.domainsOnlyInA.length > 0 || result.domainsOnlyInB.length > 0) {
    console.log(chalk.blue('\n  Domains:'));
    if (result.domainsOnlyInA.length > 0) {
      console.log(`    Only in A: ${chalk.yellow(result.domainsOnlyInA.join(', '))}`);
    }
    if (result.domainsOnlyInB.length > 0) {
      console.log(`    Only in B: ${chalk.yellow(result.domainsOnlyInB.join(', '))}`);
    }
  }

  if (!result.recordLevel) {
    console.log(
      chalk.gray(
        '\n  Note: record-level diff is only available when both sides are JSONL exports.\n' +
          '        Per-table counts shown below; re-export with --format jsonl for added/removed/changed IDs.',
      ),
    );
  }

  console.log(chalk.blue('\n  Tables:'));
  const changed = result.tableDiffs.filter(tableHasChange);
  if (changed.length === 0) {
    console.log(chalk.gray('    (no differences)'));
  } else {
    for (const t of changed) {
      console.log(
        `    ${t.tableName.padEnd(28)} ${chalk.cyan(String(t.countA).padStart(7))} → ` +
          `${chalk.cyan(String(t.countB).padStart(7))} ${formatDelta(t.delta)}` +
          formatRecordBuckets(t, verbose),
      );
      if (verbose) {
        if (t.added && t.added.length > 0) printIdBucket('added', t.added);
        if (t.removed && t.removed.length > 0) printIdBucket('removed', t.removed);
        if (t.changed && t.changed.length > 0) printIdBucket('changed', t.changed);
      }
    }
  }

  console.log('');
  if (result.identical) {
    console.log(chalk.green('  Result: identical\n'));
  } else {
    console.log(chalk.yellow('  Result: differences found\n'));
  }
}

function tableHasChange(t: TableDiff): boolean {
  if (t.delta !== 0) return true;
  if (t.added && t.added.length > 0) return true;
  if (t.removed && t.removed.length > 0) return true;
  if (t.changed && t.changed.length > 0) return true;
  return false;
}

function formatDelta(delta: number): string {
  if (delta === 0) return chalk.gray('(±0)');
  if (delta > 0) return chalk.green(`(+${delta})`);
  return chalk.red(`(${delta})`);
}

function formatRecordBuckets(t: TableDiff, verbose: boolean): string {
  const parts: string[] = [];
  if (t.added && t.added.length > 0) parts.push(chalk.green(`+${t.added.length}`));
  if (t.removed && t.removed.length > 0) parts.push(chalk.red(`-${t.removed.length}`));
  if (t.changed && t.changed.length > 0) parts.push(chalk.yellow(`~${t.changed.length}`));
  if (parts.length === 0) return '';
  if (verbose) return '  ' + parts.join(' ');
  return '  ' + chalk.gray('[') + parts.join(' ') + chalk.gray(']');
}

function printIdBucket(label: string, ids: readonly string[]): void {
  const preview = ids.slice(0, 10).join(', ');
  const suffix = ids.length > 10 ? chalk.gray(` …(+${ids.length - 10} more)`) : '';
  console.log(`      ${chalk.gray(label + ':')} ${preview}${suffix}`);
}

function renderSearch(result: BrainSearchResult): void {
  console.log(chalk.blue('\n  Brain Search\n'));
  console.log(`  Input:      ${chalk.cyan(result.inputPath)}`);
  console.log(`  Table:      ${chalk.cyan(result.table)}`);
  console.log(
    `  Scanned:    ${chalk.cyan(result.totalScanned)}    ` +
      `Matched: ${chalk.cyan(result.totalMatched)}    ` +
      `Shown: ${chalk.cyan(result.hits.length)}` +
      (result.truncated ? chalk.yellow(` (truncated to limit ${result.limit})`) : ''),
  );

  if (result.hits.length === 0) {
    console.log(chalk.yellow('\n  No matching rows.\n'));
    return;
  }

  console.log('');
  for (const hit of result.hits) {
    const header =
      chalk.cyan(hit.id) +
      (hit.display.patternType ? chalk.gray(`  ${hit.display.patternType}`) : '') +
      (hit.display.domain ? chalk.gray(`  [${hit.display.domain}]`) : '') +
      (hit.display.confidence !== undefined
        ? chalk.gray(`  conf=${hit.display.confidence.toFixed(2)}`)
        : '');
    console.log(`  ${header}`);
    if (hit.display.name) console.log(`    ${chalk.bold(hit.display.name)}`);
    if (hit.display.description) {
      const desc = hit.display.description.length > 200
        ? hit.display.description.slice(0, 200) + '…'
        : hit.display.description;
      console.log(`    ${chalk.gray(desc)}`);
    }
    if (hit.display.updatedAt) console.log(`    ${chalk.gray(hit.display.updatedAt)}`);
    console.log('');
  }
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
