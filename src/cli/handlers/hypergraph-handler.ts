/**
 * Agentic QE v3 - Hypergraph Command Handler
 *
 * Exposes hypergraph queries to users via CLI:
 *   aqe hypergraph stats       - Show node/edge counts by type
 *   aqe hypergraph untested    - Find functions with no test coverage
 *   aqe hypergraph impacted    - Find tests impacted by changed files
 *   aqe hypergraph gaps        - Find functions with low coverage
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { join, resolve } from 'path';
import { existsSync } from 'fs';
import { ICommandHandler, CLIContext } from './interfaces.js';
import type { HypergraphEngine } from '../../integrations/ruvector/hypergraph-engine.js';

// ============================================================================
// Hypergraph Handler
// ============================================================================

export class HypergraphHandler implements ICommandHandler {
  readonly name = 'hypergraph';
  readonly description = 'Query the code knowledge hypergraph';

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
    const hg = program
      .command('hypergraph')
      .alias('hg')
      .description(this.description);

    hg
      .command('stats')
      .description('Show hypergraph statistics (node/edge counts by type)')
      .option('--db <path>', 'Database path')
      .action(async (options: { db?: string }) => {
        await this.executeStats(options);
      });

    hg
      .command('untested')
      .description('Find functions with no test coverage')
      .option('--db <path>', 'Database path')
      .option('--limit <number>', 'Max results', '20')
      .action(async (options: { db?: string; limit: string }) => {
        await this.executeUntested(options);
      });

    hg
      .command('impacted <files...>')
      .description('Find tests impacted by changed files')
      .option('--db <path>', 'Database path')
      .action(async (files: string[], options: { db?: string }) => {
        await this.executeImpacted(files, options);
      });

    hg
      .command('gaps')
      .description('Find functions with low coverage')
      .option('--db <path>', 'Database path')
      .option('--max-coverage <number>', 'Coverage threshold (%)', '50')
      .option('--limit <number>', 'Max results', '20')
      .action(async (options: { db?: string; maxCoverage: string; limit: string }) => {
        await this.executeGaps(options);
      });
  }

  // --------------------------------------------------------------------------
  // Subcommands
  // --------------------------------------------------------------------------

  private async executeStats(options: { db?: string }): Promise<void> {
    if (!await this.ensureInitialized()) return;

    const { engine, close } = await this.openEngine(options.db);
    try {
      const stats = await engine.getStats();

      console.log(chalk.blue('\n  Hypergraph Statistics\n'));
      console.log(chalk.white(`  Total nodes: ${stats.totalNodes}`));
      console.log(chalk.white(`  Total edges: ${stats.totalEdges}`));

      if (stats.totalNodes > 0) {
        console.log(chalk.gray('\n  Nodes by type:'));
        for (const [type, count] of Object.entries(stats.nodesByType)) {
          if (count > 0) {
            console.log(chalk.gray(`    ${type}: ${count}`));
          }
        }

        console.log(chalk.gray('\n  Edges by type:'));
        for (const [type, count] of Object.entries(stats.edgesByType)) {
          if (count > 0) {
            console.log(chalk.gray(`    ${type}: ${count}`));
          }
        }

        console.log(chalk.gray(`\n  Avg complexity: ${stats.avgComplexity.toFixed(1)}`));
        console.log(chalk.gray(`  Avg coverage: ${stats.avgCoverage.toFixed(1)}%`));
        console.log(chalk.gray(`  Nodes with embeddings: ${stats.nodesWithEmbeddings}`));
      } else {
        console.log(chalk.yellow('\n  Hypergraph is empty. Run "aqe init --auto" to populate it.'));
      }

      console.log('');
    } finally {
      close();
    }
    await this.cleanupAndExit(0);
  }

  private async executeUntested(options: { db?: string; limit: string }): Promise<void> {
    if (!await this.ensureInitialized()) return;

    const { engine, close } = await this.openEngine(options.db);
    try {
      const limit = parseInt(options.limit, 10) || 20;

      const untested = await engine.findUntestedFunctions();
      const results = untested.slice(0, limit);

      console.log(chalk.blue(`\n  Untested Functions (${untested.length} total)\n`));

      if (results.length === 0) {
        console.log(chalk.green('  All functions have test coverage!'));
      } else {
        for (const fn of results) {
          const complexity = fn.complexity ? chalk.yellow(` complexity=${fn.complexity}`) : '';
          console.log(chalk.white(`  ${fn.name}`) + chalk.gray(` ${fn.filePath || ''}:${fn.lineStart || '?'}`) + complexity);
        }

        if (untested.length > limit) {
          console.log(chalk.gray(`\n  ... and ${untested.length - limit} more (use --limit to show more)`));
        }
      }

      console.log('');
    } finally {
      close();
    }
    await this.cleanupAndExit(0);
  }

  private async executeImpacted(files: string[], options: { db?: string }): Promise<void> {
    if (!await this.ensureInitialized()) return;

    // Resolve relative paths to absolute so they match hypergraph entries
    const absoluteFiles = files.map(f => resolve(f));

    const { engine, close } = await this.openEngine(options.db);
    try {
      const tests = await engine.findImpactedTests(absoluteFiles);

      console.log(chalk.blue(`\n  Impacted Tests for ${files.length} file(s)\n`));

      if (tests.length === 0) {
        console.log(chalk.gray('  No impacted tests found. The hypergraph may need rebuilding.'));
      } else {
        for (const test of tests) {
          console.log(chalk.white(`  ${test.name}`) + chalk.gray(` ${test.filePath || ''}`));
        }
      }

      console.log(chalk.gray(`\n  Total: ${tests.length} test(s)\n`));
    } finally {
      close();
    }
    await this.cleanupAndExit(0);
  }

  private async executeGaps(options: { db?: string; maxCoverage: string; limit: string }): Promise<void> {
    if (!await this.ensureInitialized()) return;

    const { engine, close } = await this.openEngine(options.db);
    try {
      const maxCoverage = parseInt(options.maxCoverage, 10) || 50;
      const limit = parseInt(options.limit, 10) || 20;

      const gaps = await engine.findCoverageGaps(maxCoverage);
      const results = gaps.slice(0, limit);

      console.log(chalk.blue(`\n  Coverage Gaps (<= ${maxCoverage}%) — ${gaps.length} total\n`));

      if (results.length === 0) {
        console.log(chalk.green('  No coverage gaps found!'));
      } else {
        for (const fn of results) {
          const cov = fn.coverage !== undefined ? chalk.red(` ${fn.coverage}%`) : '';
          const complexity = fn.complexity ? chalk.yellow(` complexity=${fn.complexity}`) : '';
          console.log(chalk.white(`  ${fn.name}`) + cov + chalk.gray(` ${fn.filePath || ''}`) + complexity);
        }

        if (gaps.length > limit) {
          console.log(chalk.gray(`\n  ... and ${gaps.length - limit} more (use --limit to show more)`));
        }
      }

      console.log('');
    } finally {
      close();
    }
    await this.cleanupAndExit(0);
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private async openEngine(dbPathOverride?: string): Promise<{ engine: HypergraphEngine; close: () => void }> {
    const { findProjectRoot } = await import('../../kernel/unified-memory.js');
    const { openDatabase } = await import('../../shared/safe-db.js');
    const { createHypergraphEngine } = await import('../../integrations/ruvector/hypergraph-engine.js');

    const projectRoot = findProjectRoot();
    const dbPath = dbPathOverride || join(projectRoot, '.agentic-qe', 'memory.db');

    if (!existsSync(dbPath)) {
      throw new Error(`Database not found: ${dbPath}\nRun "aqe init --auto" first.`);
    }

    const db = openDatabase(dbPath);
    try {
      const engine = await createHypergraphEngine({
        db,
        maxTraversalDepth: 10,
        maxQueryResults: 1000,
        enableVectorSearch: false,
      });

      return {
        engine,
        close: () => {
          try { db.close(); } catch { /* ignore */ }
        },
      };
    } catch (error) {
      // Close db if engine creation fails to prevent connection leak
      try { db.close(); } catch { /* ignore */ }
      throw error;
    }
  }

  getHelp(): string {
    return `
Query the code knowledge hypergraph for untested functions,
impacted tests, and coverage gaps.

Usage:
  aqe hypergraph stats                    Show node/edge counts by type
  aqe hypergraph untested [--limit N]     Find functions with no test coverage
  aqe hypergraph impacted <files...>      Find tests impacted by changed files
  aqe hypergraph gaps [--max-coverage N]  Find functions with low coverage

Options:
  --db <path>          Override database path (default: .agentic-qe/memory.db)
  --limit <number>     Max results (default: 20)
  --max-coverage <n>   Coverage threshold for gaps (default: 50)

Alias: aqe hg stats
`;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createHypergraphHandler(
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>
): HypergraphHandler {
  return new HypergraphHandler(cleanupAndExit, ensureInitialized);
}
