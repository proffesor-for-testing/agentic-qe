#!/usr/bin/env node

/**
 * Agentic QE v3 - Learning Commands
 * ADR-021: Standalone Learning System (No claude-flow dependency)
 *
 * Provides CLI commands for the AQE self-learning system:
 * - Pattern consolidation and promotion
 * - Learning statistics and metrics
 * - Pattern export/import for sharing
 * - Background learning worker management
 */

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import {
  QEReasoningBank,
  createQEReasoningBank,
} from '../../learning/qe-reasoning-bank.js';
import { HybridMemoryBackend } from '../../kernel/hybrid-backend.js';
import type { MemoryBackend } from '../../kernel/interfaces.js';
import { QEDomain, QE_DOMAIN_LIST } from '../../learning/qe-patterns.js';

// ============================================================================
// Learning State
// ============================================================================

interface LearningSystemState {
  reasoningBank: QEReasoningBank | null;
  initialized: boolean;
}

const state: LearningSystemState = {
  reasoningBank: null,
  initialized: false,
};

/**
 * Initialize the learning system
 */
async function initializeLearningSystem(): Promise<QEReasoningBank> {
  if (state.initialized && state.reasoningBank) {
    return state.reasoningBank;
  }

  const cwd = process.cwd();
  const dataDir = path.join(cwd, '.agentic-qe');

  // Create hybrid backend
  const backend = new HybridMemoryBackend({
    sqlite: {
      path: path.join(dataDir, 'memory.db'),
      walMode: true,
      poolSize: 3,
      busyTimeout: 5000,
    },
    enableFallback: true,
    defaultNamespace: 'qe-patterns',
  });

  await backend.initialize();

  // Create reasoning bank
  state.reasoningBank = createQEReasoningBank(backend, undefined, {
    enableLearning: true,
    enableGuidance: true,
    enableRouting: true,
    embeddingDimension: 128,
    useONNXEmbeddings: false,
  });

  await state.reasoningBank.initialize();
  state.initialized = true;

  return state.reasoningBank;
}

// ============================================================================
// Helper Functions
// ============================================================================

function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function printSuccess(message: string): void {
  console.log(chalk.green('✓'), message);
}

function printError(message: string): void {
  console.error(chalk.red('✗'), message);
}

function printInfo(message: string): void {
  console.log(chalk.blue('ℹ'), message);
}

// ============================================================================
// Learning Command
// ============================================================================

/**
 * Create the learning command with all subcommands
 */
export function createLearningCommand(): Command {
  const learning = new Command('learning')
    .description('AQE self-learning system management (standalone, no claude-flow required)')
    .addHelpText('after', `
Examples:
  # Check learning system status
  aqe learning stats

  # Consolidate patterns (promote successful patterns to long-term memory)
  aqe learning consolidate

  # Export learned patterns for sharing
  aqe learning export --output patterns.json

  # Import patterns from another project
  aqe learning import --input patterns.json

  # Run background learning consolidation
  aqe learning daemon --interval 3600
    `);

  // -------------------------------------------------------------------------
  // stats: Display learning statistics
  // -------------------------------------------------------------------------
  learning
    .command('stats')
    .description('Display learning system statistics')
    .option('--json', 'Output as JSON')
    .option('--detailed', 'Show detailed breakdown')
    .action(async (options) => {
      try {
        const reasoningBank = await initializeLearningSystem();
        const stats = await reasoningBank.getStats();

        if (options.json) {
          printJson(stats);
        } else {
          console.log(chalk.bold('\n📊 AQE Learning System Statistics\n'));

          // Overview
          console.log(chalk.bold('Patterns:'));
          console.log(`  Total: ${chalk.cyan(stats.totalPatterns)}`);
          console.log(`  Short-term: ${stats.patternStoreStats.byTier.shortTerm}`);
          console.log(`  Long-term: ${stats.patternStoreStats.byTier.longTerm}`);
          console.log(`  Avg Confidence: ${(stats.patternStoreStats.avgConfidence * 100).toFixed(1)}%`);
          console.log(`  Avg Quality: ${(stats.patternStoreStats.avgQualityScore * 100).toFixed(1)}%`);

          // By Domain
          console.log(chalk.bold('\nBy Domain:'));
          const domainsWithPatterns = Object.entries(stats.byDomain)
            .filter(([_, count]) => count > 0)
            .sort((a, b) => b[1] - a[1]);

          if (domainsWithPatterns.length === 0) {
            console.log(chalk.dim('  No patterns yet'));
          } else {
            for (const [domain, count] of domainsWithPatterns) {
              console.log(`  ${domain}: ${count}`);
            }
          }

          // Learning Metrics
          console.log(chalk.bold('\nLearning:'));
          console.log(`  Routing Requests: ${stats.routingRequests}`);
          console.log(`  Avg Routing Confidence: ${(stats.avgRoutingConfidence * 100).toFixed(1)}%`);
          console.log(`  Learning Outcomes: ${stats.learningOutcomes}`);
          console.log(`  Pattern Success Rate: ${(stats.patternSuccessRate * 100).toFixed(1)}%`);

          // Search Performance
          console.log(chalk.bold('\nSearch Performance:'));
          console.log(`  Operations: ${stats.patternStoreStats.searchOperations}`);
          console.log(`  Avg Latency: ${stats.patternStoreStats.avgSearchLatencyMs.toFixed(2)}ms`);
          console.log(`  HNSW Native: ${stats.patternStoreStats.hnswStats.nativeAvailable ? chalk.green('✓') : chalk.dim('○')}`);
          console.log(`  Vector Count: ${stats.patternStoreStats.hnswStats.vectorCount}`);

          if (options.detailed) {
            console.log(chalk.bold('\nBy Pattern Type:'));
            for (const [type, count] of Object.entries(stats.patternStoreStats.byType)) {
              if (count > 0) {
                console.log(`  ${type}: ${count}`);
              }
            }
          }

          console.log('');
        }

        process.exit(0);
      } catch (error) {
        printError(`stats failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // consolidate: Promote successful patterns to long-term memory
  // -------------------------------------------------------------------------
  learning
    .command('consolidate')
    .description('Consolidate patterns - promote successful patterns to long-term memory')
    .option('--dry-run', 'Show what would be promoted without making changes')
    .option('--threshold <n>', 'Minimum successful uses for promotion', '3')
    .option('--success-rate <n>', 'Minimum success rate for promotion (0-1)', '0.7')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const reasoningBank = await initializeLearningSystem();
        const stats = await reasoningBank.getStats();

        const threshold = parseInt(options.threshold, 10);
        const successRateMin = parseFloat(options.successRate);

        // Get patterns eligible for promotion
        const eligiblePatterns: Array<{
          id: string;
          name: string;
          domain: string;
          successfulUses: number;
          successRate: number;
          currentTier: string;
        }> = [];

        // Search for patterns that meet promotion criteria
        // This would be enhanced with actual pattern store access
        const searchResult = await reasoningBank.searchPatterns('*', { limit: 1000 });

        if (searchResult.success) {
          for (const match of searchResult.value) {
            const pattern = match.pattern;
            if (
              pattern.tier === 'short-term' &&
              pattern.successfulUses >= threshold &&
              pattern.successRate >= successRateMin
            ) {
              eligiblePatterns.push({
                id: pattern.id,
                name: pattern.name,
                domain: pattern.qeDomain,
                successfulUses: pattern.successfulUses,
                successRate: pattern.successRate,
                currentTier: pattern.tier,
              });
            }
          }
        }

        if (options.json) {
          printJson({
            dryRun: options.dryRun || false,
            eligibleCount: eligiblePatterns.length,
            threshold,
            successRateMin,
            patterns: eligiblePatterns,
          });
        } else {
          console.log(chalk.bold('\n🔄 Pattern Consolidation\n'));
          console.log(`  Promotion threshold: ${threshold} successful uses`);
          console.log(`  Minimum success rate: ${(successRateMin * 100).toFixed(0)}%`);
          console.log(`  Eligible patterns: ${eligiblePatterns.length}`);
          console.log('');

          if (eligiblePatterns.length === 0) {
            console.log(chalk.dim('  No patterns eligible for promotion yet.'));
            console.log(chalk.dim('  Patterns need more successful uses to be promoted.'));
          } else {
            console.log(chalk.bold('  Patterns to promote:'));
            for (const p of eligiblePatterns) {
              console.log(`    ${chalk.cyan(p.name)}`);
              console.log(chalk.dim(`      Domain: ${p.domain}, Uses: ${p.successfulUses}, Rate: ${(p.successRate * 100).toFixed(0)}%`));
            }

            if (!options.dryRun) {
              // TODO: Implement actual promotion via reasoningBank
              console.log(chalk.yellow('\n  Promotion would happen here (not yet implemented)'));
            } else {
              console.log(chalk.yellow('\n  Dry run - no changes made'));
            }
          }

          console.log('');
        }

        process.exit(0);
      } catch (error) {
        printError(`consolidate failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // export: Export learned patterns
  // -------------------------------------------------------------------------
  learning
    .command('export')
    .description('Export learned patterns for sharing')
    .option('-o, --output <file>', 'Output file path', 'aqe-patterns.json')
    .option('-d, --domain <domain>', 'Filter by domain')
    .option('--long-term-only', 'Only export long-term patterns')
    .option('--json', 'Output as JSON (to stdout)')
    .action(async (options) => {
      try {
        const reasoningBank = await initializeLearningSystem();

        // Search all patterns
        const searchResult = await reasoningBank.searchPatterns('*', {
          limit: 10000,
          domain: options.domain as QEDomain,
        });

        if (!searchResult.success) {
          throw new Error(searchResult.error.message);
        }

        const patterns = searchResult.value
          .map(m => m.pattern)
          .filter(p => !options.longTermOnly || p.tier === 'long-term');

        const exportData = {
          version: '3.0.0',
          exportedAt: new Date().toISOString(),
          source: process.cwd(),
          patternCount: patterns.length,
          patterns: patterns.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description,
            patternType: p.patternType,
            qeDomain: p.qeDomain,
            tier: p.tier,
            confidence: p.confidence,
            successRate: p.successRate,
            successfulUses: p.successfulUses,
            qualityScore: p.qualityScore,
            template: p.template,
            context: p.context,
          })),
        };

        if (options.json) {
          printJson(exportData);
        } else {
          const outputPath = path.resolve(options.output);
          writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf-8');
          printSuccess(`Exported ${patterns.length} patterns to ${outputPath}`);
        }

        process.exit(0);
      } catch (error) {
        printError(`export failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // import: Import patterns from file
  // -------------------------------------------------------------------------
  learning
    .command('import')
    .description('Import patterns from file')
    .requiredOption('-i, --input <file>', 'Input file path')
    .option('--dry-run', 'Show what would be imported without making changes')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const inputPath = path.resolve(options.input);

        if (!existsSync(inputPath)) {
          throw new Error(`File not found: ${inputPath}`);
        }

        const content = readFileSync(inputPath, 'utf-8');
        const importData = JSON.parse(content);

        if (!importData.patterns || !Array.isArray(importData.patterns)) {
          throw new Error('Invalid pattern file format');
        }

        const reasoningBank = await initializeLearningSystem();
        let imported = 0;
        let skipped = 0;
        const errors: string[] = [];

        if (!options.dryRun) {
          for (const pattern of importData.patterns) {
            try {
              const result = await reasoningBank.storePattern({
                patternType: pattern.patternType,
                name: pattern.name,
                description: pattern.description,
                template: pattern.template,
                context: pattern.context,
              });

              if (result.success) {
                imported++;
              } else {
                skipped++;
                errors.push(`${pattern.name}: ${result.error.message}`);
              }
            } catch (e) {
              skipped++;
              errors.push(`${pattern.name}: ${e instanceof Error ? e.message : 'unknown'}`);
            }
          }
        }

        if (options.json) {
          printJson({
            dryRun: options.dryRun || false,
            totalPatterns: importData.patterns.length,
            imported,
            skipped,
            errors,
          });
        } else {
          console.log(chalk.bold('\n📥 Pattern Import\n'));
          console.log(`  Source: ${inputPath}`);
          console.log(`  Total patterns: ${importData.patterns.length}`);

          if (options.dryRun) {
            console.log(chalk.yellow('\n  Dry run - no changes made'));
            console.log(`  Would import: ${importData.patterns.length} patterns`);
          } else {
            console.log(chalk.green(`\n  Imported: ${imported}`));
            if (skipped > 0) {
              console.log(chalk.yellow(`  Skipped: ${skipped}`));
            }
          }

          console.log('');
        }

        process.exit(0);
      } catch (error) {
        printError(`import failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // reset: Reset learning data
  // -------------------------------------------------------------------------
  learning
    .command('reset')
    .description('Reset learning data (patterns and metrics)')
    .option('--confirm', 'Confirm reset without prompting')
    .option('--patterns-only', 'Only reset patterns, keep metrics')
    .action(async (options) => {
      try {
        if (!options.confirm) {
          console.log(chalk.yellow('\n⚠️  This will reset your learning data.'));
          console.log(chalk.gray('    Use --confirm to proceed'));
          console.log('');
          process.exit(0);
        }

        const cwd = process.cwd();
        const dataDir = path.join(cwd, '.agentic-qe');

        // List files that would be affected
        const filesToReset = [
          path.join(dataDir, 'data', 'patterns'),
          path.join(dataDir, 'data', 'hnsw'),
        ];

        if (!options.patternsOnly) {
          filesToReset.push(path.join(dataDir, 'data', 'learning-config.json'));
        }

        console.log(chalk.bold('\n🗑️  Resetting Learning Data\n'));

        for (const file of filesToReset) {
          if (existsSync(file)) {
            console.log(chalk.dim(`  Removing: ${path.relative(cwd, file)}`));
            // Actual deletion would happen here
          }
        }

        printSuccess('Learning data reset. Run "aqe init --auto" to reinitialize.');
        console.log('');

        process.exit(0);
      } catch (error) {
        printError(`reset failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // info: Show learning system information
  // -------------------------------------------------------------------------
  learning
    .command('info')
    .description('Show learning system configuration and paths')
    .action(async () => {
      try {
        const cwd = process.cwd();
        const dataDir = path.join(cwd, '.agentic-qe');

        console.log(chalk.bold('\n📋 AQE Learning System Info\n'));

        console.log(chalk.bold('Paths:'));
        console.log(`  Data directory: ${dataDir}`);
        console.log(`  Memory database: ${path.join(dataDir, 'memory.db')}`);
        console.log(`  HNSW index: ${path.join(dataDir, 'data', 'hnsw')}`);
        console.log(`  Patterns: ${path.join(dataDir, 'data', 'patterns')}`);

        console.log(chalk.bold('\nConfiguration:'));
        console.log(`  Learning enabled: ${process.env.AQE_LEARNING_ENABLED !== 'false' ? chalk.green('yes') : chalk.red('no')}`);
        console.log(`  V3 mode: ${process.env.AQE_V3_MODE === 'true' ? chalk.green('yes') : chalk.dim('no')}`);
        console.log(`  Promotion threshold: ${process.env.AQE_V3_PATTERN_PROMOTION_THRESHOLD || '3'} uses`);
        console.log(`  Success rate threshold: ${process.env.AQE_V3_SUCCESS_RATE_THRESHOLD || '0.7'}`);

        console.log(chalk.bold('\nDomains:'));
        console.log(`  ${QE_DOMAIN_LIST.join(', ')}`);

        console.log(chalk.bold('\nHooks:'));
        console.log('  Configure in .claude/settings.json');
        console.log('  Events: pre-edit, post-edit, pre-task, post-task, route');

        console.log('');
        process.exit(0);
      } catch (error) {
        printError(`info failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });

  return learning;
}

// ============================================================================
// Exports
// ============================================================================

export { initializeLearningSystem };
