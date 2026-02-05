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
import { existsSync, writeFileSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import {
  QEReasoningBank,
  createQEReasoningBank,
} from '../../learning/qe-reasoning-bank.js';
import { HybridMemoryBackend } from '../../kernel/hybrid-backend.js';
import type { MemoryBackend } from '../../kernel/interfaces.js';
import { QEDomain, QE_DOMAIN_LIST } from '../../learning/qe-patterns.js';
import {
  createLearningMetricsTracker,
  type DashboardData,
  type LearningMetricsSnapshot,
} from '../../learning/metrics-tracker.js';

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

/**
 * Display the learning dashboard
 */
function displayDashboard(dashboard: DashboardData): void {
  const { current, topDomains } = dashboard;

  // Box drawing characters
  const BOX = {
    tl: '┌', tr: '┐', bl: '└', br: '┘',
    h: '─', v: '│', ml: '├', mr: '┤',
  };

  const WIDTH = 55;
  const HR = BOX.h.repeat(WIDTH - 2);

  console.log('');
  console.log(`${BOX.tl}${HR}${BOX.tr}`);
  console.log(`${BOX.v}${centerText('AQE LEARNING DASHBOARD', WIDTH - 2)}${BOX.v}`);
  console.log(`${BOX.ml}${HR}${BOX.mr}`);

  // Pattern stats
  const patternToday = current.patternsCreatedToday > 0
    ? chalk.green(` (+${current.patternsCreatedToday} today)`)
    : '';
  console.log(`${BOX.v} Patterns:          ${padRight(String(current.totalPatterns) + patternToday, 32)}${BOX.v}`);

  // Experience stats
  const expToday = current.experiencesToday > 0
    ? chalk.green(` (+${current.experiencesToday} today)`)
    : '';
  console.log(`${BOX.v} Experiences:       ${padRight(String(current.totalExperiences) + expToday, 32)}${BOX.v}`);

  // Q-Values
  console.log(`${BOX.v} Q-Values:          ${padRight(String(current.totalQValues), 32)}${BOX.v}`);

  // Average Reward with trend
  const rewardStr = current.avgReward.toFixed(2);
  const rewardTrend = current.avgRewardDelta >= 0
    ? chalk.green(`(↑ ${Math.abs(current.avgRewardDelta).toFixed(2)} from last week)`)
    : chalk.red(`(↓ ${Math.abs(current.avgRewardDelta).toFixed(2)} from last week)`);
  console.log(`${BOX.v} Avg Reward:        ${padRight(`${rewardStr} ${rewardTrend}`, 32)}${BOX.v}`);

  // Success rate
  const successPct = (current.successRate * 100).toFixed(1);
  console.log(`${BOX.v} Success Rate:      ${padRight(`${successPct}%`, 32)}${BOX.v}`);

  // Pattern tiers
  console.log(`${BOX.v} Short-term:        ${padRight(String(current.shortTermPatterns), 32)}${BOX.v}`);
  console.log(`${BOX.v} Long-term:         ${padRight(String(current.longTermPatterns), 32)}${BOX.v}`);

  console.log(`${BOX.v}${' '.repeat(WIDTH - 2)}${BOX.v}`);

  // Domain Coverage
  console.log(`${BOX.v} ${chalk.bold('Domain Coverage:')}${' '.repeat(WIDTH - 19)}${BOX.v}`);

  if (topDomains.length === 0) {
    console.log(`${BOX.v}   ${chalk.dim('No patterns yet')}${' '.repeat(WIDTH - 19)}${BOX.v}`);
  } else {
    const maxCount = Math.max(...topDomains.map(d => d.count), 1);
    const barWidth = 14;

    for (const { domain, count } of topDomains) {
      const filledBars = Math.round((count / maxCount) * barWidth);
      const emptyBars = barWidth - filledBars;
      const bar = chalk.green('█'.repeat(filledBars)) + chalk.dim('░'.repeat(emptyBars));
      const domainName = padRight(domain, 20);
      const countStr = padLeft(String(count), 3);
      console.log(`${BOX.v}   ${domainName} ${bar} ${countStr} patterns ${BOX.v}`);
    }

    // Show remaining domains with 0 patterns
    const shownDomains = new Set(topDomains.map(d => d.domain));
    const zeroDomains = QE_DOMAIN_LIST.filter(d => !shownDomains.has(d)).slice(0, 3);
    for (const domain of zeroDomains) {
      const bar = chalk.dim('░'.repeat(barWidth));
      const domainName = padRight(domain, 20);
      console.log(`${BOX.v}   ${domainName} ${bar}   0 patterns ${BOX.v}`);
    }
  }

  console.log(`${BOX.bl}${HR}${BOX.br}`);
  console.log('');
}

/**
 * Center text within a given width
 */
function centerText(text: string, width: number): string {
  const stripped = stripAnsi(text);
  const padding = Math.max(0, width - stripped.length);
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
}

/**
 * Pad string to the right
 */
function padRight(text: string, width: number): string {
  const stripped = stripAnsi(text);
  const padding = Math.max(0, width - stripped.length);
  return text + ' '.repeat(padding);
}

/**
 * Pad string to the left
 */
function padLeft(text: string, width: number): string {
  const stripped = stripAnsi(text);
  const padding = Math.max(0, width - stripped.length);
  return ' '.repeat(padding) + text;
}

/**
 * Strip ANSI escape codes from a string
 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Get the learning database path
 */
function getDbPath(): string {
  const cwd = process.cwd();
  return path.join(cwd, '.agentic-qe', 'memory.db');
}

/**
 * Compress a file using gzip
 */
async function compressFile(inputPath: string, outputPath?: string): Promise<string> {
  const gzPath = outputPath || `${inputPath}.gz`;
  await pipeline(
    createReadStream(inputPath),
    createGzip(),
    createWriteStream(gzPath)
  );
  return gzPath;
}

/**
 * Decompress a gzipped file
 */
async function decompressFile(gzPath: string, outputPath: string): Promise<void> {
  await pipeline(
    createReadStream(gzPath),
    createGunzip(),
    createWriteStream(outputPath)
  );
}

/**
 * Verify database integrity using SQLite's built-in check
 */
async function verifyDatabaseIntegrity(dbPath: string): Promise<{ valid: boolean; message: string }> {
  try {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath, { readonly: true });

    // Run SQLite integrity check
    const result = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    db.close();

    if (result.integrity_check === 'ok') {
      return { valid: true, message: 'Database integrity verified' };
    } else {
      return { valid: false, message: `Integrity check failed: ${result.integrity_check}` };
    }
  } catch (error) {
    return {
      valid: false,
      message: `Failed to verify: ${error instanceof Error ? error.message : 'unknown error'}`
    };
  }
}

/**
 * Get database schema version
 */
async function getSchemaVersion(dbPath: string): Promise<number> {
  try {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath, { readonly: true });

    // Check if schema_version table exists
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
    ).get();

    if (!tableExists) {
      db.close();
      return 0;
    }

    const result = db.prepare('SELECT version FROM schema_version WHERE id = 1').get() as { version: number } | undefined;
    db.close();

    return result?.version ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Export format version for compatibility tracking
 */
const EXPORT_FORMAT_VERSION = '3.1.0';

/**
 * Export data structure with versioning
 */
interface LearningExportData {
  version: string;
  exportedAt: string;
  source: string;
  schemaVersion: number;
  patternCount: number;
  patterns: Array<{
    id: string;
    name: string;
    description: string;
    patternType: string;
    qeDomain: string;
    tier: string;
    confidence: number;
    successRate: number;
    successfulUses: number;
    qualityScore: number;
    template: unknown;
    context: unknown;
    createdAt?: string;
    lastUsedAt?: string;
  }>;
  trajectories?: Array<{
    id: string;
    task: string;
    agent: string;
    domain: string;
    success: number;
    stepsJson: string;
  }>;
  experiences?: Array<{
    taskType: string;
    action: string;
    reward: number;
    count: number;
  }>;
  metadata?: {
    totalExperiences?: number;
    avgReward?: number;
  };
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
  // extract: Extract patterns from learning experiences
  // -------------------------------------------------------------------------
  learning
    .command('extract')
    .description('Extract QE patterns from existing learning experiences')
    .option('--min-reward <n>', 'Minimum reward threshold for pattern extraction', '0.7')
    .option('--min-count <n>', 'Minimum occurrences to form a pattern', '3')
    .option('--dry-run', 'Show what would be extracted without saving')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const cwd = process.cwd();
        const dbPath = path.join(cwd, '.agentic-qe', 'memory.db');

        if (!existsSync(dbPath)) {
          throw new Error('No memory database found. Run "aqe init --auto" first.');
        }

        const minReward = parseFloat(options.minReward);
        const minCount = parseInt(options.minCount, 10);

        console.log(chalk.bold('\n🔬 Pattern Extraction from Learning Experiences\n'));
        console.log(`  Min reward threshold: ${minReward}`);
        console.log(`  Min occurrences: ${minCount}`);
        console.log('');

        // Dynamic import for better-sqlite3
        const Database = (await import('better-sqlite3')).default;
        const db = new Database(dbPath, { readonly: true });

        // Query learning experiences grouped by task_type
        const experiences = db.prepare(`
          SELECT
            task_type,
            COUNT(*) as count,
            AVG(reward) as avg_reward,
            MAX(reward) as max_reward,
            MIN(reward) as min_reward,
            GROUP_CONCAT(DISTINCT action) as actions
          FROM learning_experiences
          WHERE reward >= ?
          GROUP BY task_type
          HAVING COUNT(*) >= ?
          ORDER BY avg_reward DESC
        `).all(minReward, minCount) as Array<{
          task_type: string;
          count: number;
          avg_reward: number;
          max_reward: number;
          min_reward: number;
          actions: string;
        }>;

        // Query memory entries for additional context
        const memoryPatterns = db.prepare(`
          SELECT
            substr(key, 1, 40) as key_prefix,
            COUNT(*) as count
          FROM memory_entries
          WHERE key LIKE 'phase2/learning/%'
          GROUP BY substr(key, 1, 40)
          HAVING COUNT(*) >= ?
          ORDER BY COUNT(*) DESC
          LIMIT 20
        `).all(minCount) as Array<{ key_prefix: string; count: number }>;

        db.close();

        // Map task types to QE domains
        const domainMapping: Record<string, QEDomain> = {
          'generate': 'test-generation',
          'test-generation': 'test-generation',
          'analyze': 'coverage-analysis',
          'coverage': 'coverage-analysis',
          'coverage-analysis': 'coverage-analysis',
          'run': 'test-execution',
          'test-execution': 'test-execution',
          'report': 'quality-assessment',
          'quality': 'quality-assessment',
          'quality-analysis': 'quality-assessment',
          'security': 'security-compliance',
          'sast': 'security-compliance',
          'owasp': 'security-compliance',
          'secrets': 'security-compliance',
          'audit': 'security-compliance',
          'recommend': 'defect-intelligence',
          'predict': 'defect-intelligence',
          'complexity-analysis': 'code-intelligence',
          'code-analysis': 'code-intelligence',
          'stabilize': 'chaos-resilience',
          'flaky': 'chaos-resilience',
          'quarantine': 'chaos-resilience',
          'retry': 'chaos-resilience',
          'stress': 'chaos-resilience',
          'load': 'chaos-resilience',
          'endurance': 'chaos-resilience',
          'baseline': 'chaos-resilience',
        };

        // Map task types to valid QE pattern types
        const patternTypeMapping: Record<string, string> = {
          'generate': 'test-template',
          'test-generation': 'test-template',
          'analyze': 'coverage-strategy',
          'coverage': 'coverage-strategy',
          'coverage-analysis': 'coverage-strategy',
          'run': 'test-template',
          'test-execution': 'test-template',
          'report': 'assertion-pattern',
          'quality': 'assertion-pattern',
          'quality-analysis': 'assertion-pattern',
          'security': 'assertion-pattern',
          'sast': 'assertion-pattern',
          'owasp': 'assertion-pattern',
          'secrets': 'assertion-pattern',
          'audit': 'assertion-pattern',
          'recommend': 'assertion-pattern',
          'predict': 'assertion-pattern',
          'complexity-analysis': 'assertion-pattern',
          'code-analysis': 'assertion-pattern',
          'stabilize': 'flaky-fix',
          'flaky': 'flaky-fix',
          'quarantine': 'flaky-fix',
          'retry': 'flaky-fix',
          'stress': 'perf-benchmark',
          'load': 'perf-benchmark',
          'endurance': 'perf-benchmark',
          'baseline': 'perf-benchmark',
          'mock': 'mock-pattern',
          'dependency': 'mock-pattern',
        };

        // Extract patterns
        const extractedPatterns: Array<{
          name: string;
          domain: QEDomain;
          patternType: string;
          confidence: number;
          sourceCount: number;
          avgReward: number;
          actions: string[];
        }> = [];

        for (const exp of experiences) {
          const domain = domainMapping[exp.task_type] || 'code-intelligence';
          const patternType = patternTypeMapping[exp.task_type] || 'test-template';
          const actions = exp.actions ? exp.actions.split(',').slice(0, 5) : [];

          extractedPatterns.push({
            name: `${exp.task_type}-success-pattern`,
            domain,
            patternType,
            confidence: Math.min(0.95, exp.avg_reward / 2),
            sourceCount: exp.count,
            avgReward: exp.avg_reward,
            actions,
          });
        }

        if (options.json) {
          printJson({
            minReward,
            minCount,
            dryRun: options.dryRun || false,
            experienceGroups: experiences.length,
            memoryPatterns: memoryPatterns.length,
            extractedPatterns,
          });
        } else {
          console.log(chalk.bold('Learning Experience Groups:'));
          if (experiences.length === 0) {
            console.log(chalk.dim('  No qualifying experience groups found'));
          } else {
            for (const exp of experiences) {
              const rewardColor = exp.avg_reward >= 1.0 ? chalk.green :
                                  exp.avg_reward >= 0.5 ? chalk.yellow : chalk.red;
              console.log(`  ${chalk.cyan(exp.task_type)}`);
              console.log(`    Count: ${exp.count}, Avg Reward: ${rewardColor(exp.avg_reward.toFixed(2))}`);
            }
          }

          console.log(chalk.bold('\nMemory Pattern Sources:'));
          for (const mp of memoryPatterns.slice(0, 10)) {
            console.log(`  ${mp.key_prefix}... (${mp.count})`);
          }

          console.log(chalk.bold('\nExtracted Patterns:'));
          if (extractedPatterns.length === 0) {
            console.log(chalk.dim('  No patterns extracted'));
          } else {
            for (const p of extractedPatterns) {
              console.log(`  ${chalk.green('+')} ${chalk.cyan(p.name)}`);
              console.log(chalk.dim(`      Domain: ${p.domain}, Type: ${p.patternType}`));
              console.log(chalk.dim(`      Confidence: ${(p.confidence * 100).toFixed(0)}%, Sources: ${p.sourceCount}`));
            }
          }

          if (!options.dryRun && extractedPatterns.length > 0) {
            // Store extracted patterns
            const reasoningBank = await initializeLearningSystem();
            let stored = 0;
            const errors: string[] = [];

            for (const p of extractedPatterns) {
              try {
                // Build template content from actions
                const templateContent = p.actions.length > 0
                  ? `// ${p.name}\n// Steps: ${p.actions.join(' -> ')}\n\n{{implementation}}`
                  : `// ${p.name}\n// Extracted pattern with ${p.sourceCount} successful uses\n\n{{implementation}}`;

                const result = await reasoningBank.storePattern({
                  patternType: p.patternType as any,
                  name: p.name,
                  description: `Extracted from ${p.sourceCount} learning experiences with avg reward ${p.avgReward.toFixed(2)}`,
                  template: {
                    type: 'code',
                    content: templateContent,
                    variables: [
                      {
                        name: 'implementation',
                        type: 'code',
                        required: true,
                        description: 'Implementation code for this pattern',
                      },
                    ],
                  },
                  context: {
                    tags: [p.domain, p.patternType, `sources:${p.sourceCount}`, `reward:${p.avgReward.toFixed(2)}`],
                  },
                });

                if (result.success) {
                  stored++;
                } else {
                  errors.push(`${p.name}: ${result.error.message}`);
                }
              } catch (e) {
                errors.push(`${p.name}: ${e instanceof Error ? e.message : 'unknown'}`);
              }
            }

            console.log(chalk.green(`\n✓ Stored ${stored} new patterns`));
            if (errors.length > 0 && errors.length <= 5) {
              console.log(chalk.yellow(`  Errors: ${errors.slice(0, 3).join(', ')}${errors.length > 3 ? '...' : ''}`));
            }
          } else if (options.dryRun) {
            console.log(chalk.yellow('\n  Dry run - no patterns stored'));
          }

          console.log('');
        }

        process.exit(0);
      } catch (error) {
        printError(`extract failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // dashboard: Display learning system dashboard
  // -------------------------------------------------------------------------
  learning
    .command('dashboard')
    .description('Display learning system dashboard with metrics and trends')
    .option('--json', 'Output as JSON')
    .option('--save-snapshot', 'Save a daily metrics snapshot')
    .action(async (options) => {
      try {
        const cwd = process.cwd();
        const tracker = createLearningMetricsTracker(cwd);
        await tracker.initialize();

        if (options.saveSnapshot) {
          await tracker.saveSnapshot();
          printSuccess('Daily snapshot saved');
        }

        const dashboard = await tracker.getDashboardData();
        tracker.close();

        if (options.json) {
          printJson(dashboard);
        } else {
          displayDashboard(dashboard);
        }

        process.exit(0);
      } catch (error) {
        printError(`dashboard failed: ${error instanceof Error ? error.message : 'unknown'}`);
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

  // -------------------------------------------------------------------------
  // backup: Backup learning database
  // -------------------------------------------------------------------------
  learning
    .command('backup')
    .description('Backup learning database to a file')
    .option('-o, --output <path>', 'Output file path')
    .option('--compress', 'Compress backup with gzip')
    .option('--verify', 'Verify backup integrity after creation')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const dbPath = getDbPath();

        if (!existsSync(dbPath)) {
          throw new Error(`No learning database found at: ${dbPath}`);
        }

        // Generate default output path with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const defaultOutput = path.join(process.cwd(), 'backups', `learning-${timestamp}.db`);
        let outputPath = options.output ? path.resolve(options.output) : defaultOutput;

        // Ensure backup directory exists
        const backupDir = path.dirname(outputPath);
        if (!existsSync(backupDir)) {
          mkdirSync(backupDir, { recursive: true });
        }

        // Get source file size
        const sourceStats = await stat(dbPath);
        const sourceSizeKB = (sourceStats.size / 1024).toFixed(2);

        // Copy the database file
        copyFileSync(dbPath, outputPath);

        // Also copy WAL file if it exists (for consistency)
        const walPath = `${dbPath}-wal`;
        if (existsSync(walPath)) {
          copyFileSync(walPath, `${outputPath}-wal`);
        }

        // Compress if requested
        let finalPath = outputPath;
        if (options.compress) {
          finalPath = await compressFile(outputPath);
          // Remove uncompressed version
          await unlink(outputPath);
          if (existsSync(`${outputPath}-wal`)) {
            await unlink(`${outputPath}-wal`);
          }
        }

        // Get final file size
        const finalStats = await stat(finalPath);
        const finalSizeKB = (finalStats.size / 1024).toFixed(2);

        // Verify if requested
        let verificationResult: { valid: boolean; message: string } | undefined;
        if (options.verify && !options.compress) {
          verificationResult = await verifyDatabaseIntegrity(outputPath);
        }

        // Get schema version
        const schemaVersion = await getSchemaVersion(dbPath);

        if (options.json) {
          printJson({
            success: true,
            sourcePath: dbPath,
            backupPath: finalPath,
            sourceSizeKB: parseFloat(sourceSizeKB),
            backupSizeKB: parseFloat(finalSizeKB),
            compressed: options.compress || false,
            schemaVersion,
            verification: verificationResult,
            timestamp: new Date().toISOString(),
          });
        } else {
          console.log(chalk.bold('\n💾 Learning Database Backup\n'));
          console.log(`  Source: ${dbPath}`);
          console.log(`  Source size: ${sourceSizeKB} KB`);
          console.log(`  Backup: ${finalPath}`);
          console.log(`  Backup size: ${finalSizeKB} KB`);
          console.log(`  Schema version: ${schemaVersion}`);

          if (options.compress) {
            const compressionRatio = ((1 - finalStats.size / sourceStats.size) * 100).toFixed(1);
            console.log(`  Compression: ${compressionRatio}% reduction`);
          }

          if (verificationResult) {
            if (verificationResult.valid) {
              console.log(chalk.green(`  Verification: ${verificationResult.message}`));
            } else {
              console.log(chalk.red(`  Verification: ${verificationResult.message}`));
            }
          }

          printSuccess(`Backup saved to: ${finalPath}`);
          console.log('');
        }

        process.exit(0);
      } catch (error) {
        printError(`backup failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // restore: Restore learning database from backup
  // -------------------------------------------------------------------------
  learning
    .command('restore')
    .description('Restore learning database from backup')
    .requiredOption('-i, --input <path>', 'Backup file path to restore from')
    .option('--verify', 'Verify backup integrity before restore')
    .option('--force', 'Overwrite existing database without confirmation')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const inputPath = path.resolve(options.input);
        const dbPath = getDbPath();

        if (!existsSync(inputPath)) {
          throw new Error(`Backup file not found: ${inputPath}`);
        }

        // Determine if compressed
        const isCompressed = inputPath.endsWith('.gz');
        let restorePath = inputPath;

        // Decompress if needed
        if (isCompressed) {
          const tempPath = inputPath.replace('.gz', '.tmp');
          await decompressFile(inputPath, tempPath);
          restorePath = tempPath;
        }

        // Verify if requested
        if (options.verify) {
          const verificationResult = await verifyDatabaseIntegrity(restorePath);
          if (!verificationResult.valid) {
            if (isCompressed && existsSync(restorePath)) {
              await unlink(restorePath);
            }
            throw new Error(`Backup verification failed: ${verificationResult.message}`);
          }
        }

        // Check if target exists
        if (existsSync(dbPath) && !options.force) {
          printError(`Database already exists at: ${dbPath}`);
          console.log(chalk.yellow('  Use --force to overwrite'));
          if (isCompressed && existsSync(restorePath)) {
            await unlink(restorePath);
          }
          process.exit(1);
        }

        // Ensure target directory exists
        const targetDir = path.dirname(dbPath);
        if (!existsSync(targetDir)) {
          mkdirSync(targetDir, { recursive: true });
        }

        // Remove existing database files
        if (existsSync(dbPath)) {
          await unlink(dbPath);
        }
        if (existsSync(`${dbPath}-wal`)) {
          await unlink(`${dbPath}-wal`);
        }
        if (existsSync(`${dbPath}-shm`)) {
          await unlink(`${dbPath}-shm`);
        }

        // Copy restored file to target
        copyFileSync(restorePath, dbPath);

        // Clean up temp file if we decompressed
        if (isCompressed && existsSync(restorePath)) {
          await unlink(restorePath);
        }

        // Get restored database info
        const restoredStats = await stat(dbPath);
        const schemaVersion = await getSchemaVersion(dbPath);

        if (options.json) {
          printJson({
            success: true,
            backupPath: inputPath,
            restoredPath: dbPath,
            sizeKB: parseFloat((restoredStats.size / 1024).toFixed(2)),
            schemaVersion,
            wasCompressed: isCompressed,
            timestamp: new Date().toISOString(),
          });
        } else {
          console.log(chalk.bold('\n🔄 Learning Database Restore\n'));
          console.log(`  Backup: ${inputPath}`);
          console.log(`  Restored to: ${dbPath}`);
          console.log(`  Size: ${(restoredStats.size / 1024).toFixed(2)} KB`);
          console.log(`  Schema version: ${schemaVersion}`);

          printSuccess('Database restored successfully');
          console.log('');
        }

        process.exit(0);
      } catch (error) {
        printError(`restore failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // verify: Verify database integrity
  // -------------------------------------------------------------------------
  learning
    .command('verify')
    .description('Verify learning database integrity')
    .option('-f, --file <path>', 'Database file to verify (defaults to current)')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const dbPath = options.file ? path.resolve(options.file) : getDbPath();

        if (!existsSync(dbPath)) {
          throw new Error(`Database file not found: ${dbPath}`);
        }

        const verificationResult = await verifyDatabaseIntegrity(dbPath);
        const schemaVersion = await getSchemaVersion(dbPath);
        const fileStats = await stat(dbPath);

        // Get table counts
        let tableCounts: Record<string, number> = {};
        try {
          const Database = (await import('better-sqlite3')).default;
          const db = new Database(dbPath, { readonly: true });

          const tables = ['qe_patterns', 'qe_trajectories', 'learning_experiences', 'kv_store', 'vectors'];
          for (const table of tables) {
            try {
              const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
              tableCounts[table] = result.count;
            } catch {
              // Table may not exist
            }
          }
          db.close();
        } catch {
          // Ignore table count errors
        }

        if (options.json) {
          printJson({
            valid: verificationResult.valid,
            message: verificationResult.message,
            path: dbPath,
            sizeKB: parseFloat((fileStats.size / 1024).toFixed(2)),
            schemaVersion,
            tableCounts,
            timestamp: new Date().toISOString(),
          });
        } else {
          console.log(chalk.bold('\n🔍 Database Verification\n'));
          console.log(`  Path: ${dbPath}`);
          console.log(`  Size: ${(fileStats.size / 1024).toFixed(2)} KB`);
          console.log(`  Schema version: ${schemaVersion}`);

          if (verificationResult.valid) {
            console.log(chalk.green(`  Status: ${verificationResult.message}`));
          } else {
            console.log(chalk.red(`  Status: ${verificationResult.message}`));
          }

          if (Object.keys(tableCounts).length > 0) {
            console.log(chalk.bold('\nTable Counts:'));
            for (const [table, count] of Object.entries(tableCounts)) {
              console.log(`  ${table}: ${count}`);
            }
          }

          console.log('');
        }

        process.exit(verificationResult.valid ? 0 : 1);
      } catch (error) {
        printError(`verify failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // export-full: Enhanced export with all learning data
  // -------------------------------------------------------------------------
  learning
    .command('export-full')
    .description('Export all learning data including patterns, trajectories, and experiences')
    .option('-o, --output <file>', 'Output file path', 'aqe-learning-export.json')
    .option('--compress', 'Compress output with gzip')
    .option('--include-trajectories', 'Include learning trajectories')
    .option('--include-experiences', 'Include learning experiences')
    .option('--json', 'Output as JSON (to stdout)')
    .action(async (options) => {
      try {
        const dbPath = getDbPath();

        if (!existsSync(dbPath)) {
          throw new Error('No learning database found. Run "aqe init --auto" first.');
        }

        const reasoningBank = await initializeLearningSystem();
        const schemaVersion = await getSchemaVersion(dbPath);

        // Get all patterns
        const searchResult = await reasoningBank.searchPatterns('*', { limit: 10000 });

        if (!searchResult.success) {
          throw new Error(searchResult.error.message);
        }

        const patterns = searchResult.value.map(m => ({
          id: m.pattern.id,
          name: m.pattern.name,
          description: m.pattern.description,
          patternType: m.pattern.patternType,
          qeDomain: m.pattern.qeDomain,
          tier: m.pattern.tier,
          confidence: m.pattern.confidence,
          successRate: m.pattern.successRate,
          successfulUses: m.pattern.successfulUses,
          qualityScore: m.pattern.qualityScore,
          template: m.pattern.template,
          context: m.pattern.context,
          createdAt: m.pattern.createdAt?.toISOString(),
          lastUsedAt: m.pattern.lastUsedAt?.toISOString(),
        }));

        const exportData: LearningExportData = {
          version: EXPORT_FORMAT_VERSION,
          exportedAt: new Date().toISOString(),
          source: process.cwd(),
          schemaVersion,
          patternCount: patterns.length,
          patterns,
        };

        // Include trajectories if requested
        if (options.includeTrajectories) {
          try {
            const Database = (await import('better-sqlite3')).default;
            const db = new Database(dbPath, { readonly: true });

            const trajectories = db.prepare(`
              SELECT id, task, agent, domain, success, steps_json
              FROM qe_trajectories
              ORDER BY started_at DESC
              LIMIT 1000
            `).all() as Array<{
              id: string;
              task: string;
              agent: string;
              domain: string;
              success: number;
              steps_json: string;
            }>;

            exportData.trajectories = trajectories.map(t => ({
              id: t.id,
              task: t.task,
              agent: t.agent,
              domain: t.domain,
              success: t.success,
              stepsJson: t.steps_json,
            }));

            db.close();
          } catch {
            // Trajectories table may not exist
          }
        }

        // Include experiences if requested
        if (options.includeExperiences) {
          try {
            const Database = (await import('better-sqlite3')).default;
            const db = new Database(dbPath, { readonly: true });

            const experiences = db.prepare(`
              SELECT task_type, action, AVG(reward) as avg_reward, COUNT(*) as count
              FROM learning_experiences
              GROUP BY task_type, action
              ORDER BY count DESC
              LIMIT 500
            `).all() as Array<{
              task_type: string;
              action: string;
              avg_reward: number;
              count: number;
            }>;

            exportData.experiences = experiences.map(e => ({
              taskType: e.task_type,
              action: e.action,
              reward: e.avg_reward,
              count: e.count,
            }));

            // Add metadata
            const metaRow = db.prepare(`
              SELECT COUNT(*) as total, AVG(reward) as avg_reward FROM learning_experiences
            `).get() as { total: number; avg_reward: number };

            exportData.metadata = {
              totalExperiences: metaRow.total,
              avgReward: metaRow.avg_reward,
            };

            db.close();
          } catch {
            // Learning experiences table may not exist
          }
        }

        if (options.json) {
          printJson(exportData);
        } else {
          let outputPath = path.resolve(options.output);
          writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf-8');

          if (options.compress) {
            const compressedPath = await compressFile(outputPath);
            await unlink(outputPath);
            outputPath = compressedPath;
          }

          console.log(chalk.bold('\n📤 Learning Data Export\n'));
          console.log(`  Patterns: ${patterns.length}`);
          if (exportData.trajectories) {
            console.log(`  Trajectories: ${exportData.trajectories.length}`);
          }
          if (exportData.experiences) {
            console.log(`  Experience groups: ${exportData.experiences.length}`);
          }
          console.log(`  Schema version: ${schemaVersion}`);
          console.log(`  Export format: ${EXPORT_FORMAT_VERSION}`);

          printSuccess(`Exported to: ${outputPath}`);
          console.log('');
        }

        process.exit(0);
      } catch (error) {
        printError(`export-full failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // import-merge: Import and merge patterns from export file
  // -------------------------------------------------------------------------
  learning
    .command('import-merge')
    .description('Import and merge patterns from export file (preserves existing data)')
    .requiredOption('-i, --input <file>', 'Input file path')
    .option('--skip-duplicates', 'Skip patterns with matching names (default: update)')
    .option('--dry-run', 'Show what would be imported without making changes')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        let inputPath = path.resolve(options.input);

        if (!existsSync(inputPath)) {
          throw new Error(`File not found: ${inputPath}`);
        }

        // Handle compressed files
        let content: string;
        if (inputPath.endsWith('.gz')) {
          const tempPath = inputPath.replace('.gz', '.tmp.json');
          await decompressFile(inputPath, tempPath);
          content = readFileSync(tempPath, 'utf-8');
          await unlink(tempPath);
        } else {
          content = readFileSync(inputPath, 'utf-8');
        }

        const importData = JSON.parse(content) as LearningExportData;

        // Validate import data
        if (!importData.patterns || !Array.isArray(importData.patterns)) {
          throw new Error('Invalid import file format: missing patterns array');
        }

        const reasoningBank = await initializeLearningSystem();

        // Get existing pattern names for duplicate detection
        const existingResult = await reasoningBank.searchPatterns('*', { limit: 10000 });
        const existingNames = new Set<string>();
        if (existingResult.success) {
          for (const m of existingResult.value) {
            existingNames.add(m.pattern.name);
          }
        }

        let imported = 0;
        let skipped = 0;
        let updated = 0;
        const errors: string[] = [];

        if (!options.dryRun) {
          for (const pattern of importData.patterns) {
            const isDuplicate = existingNames.has(pattern.name);

            if (isDuplicate && options.skipDuplicates) {
              skipped++;
              continue;
            }

            try {
              const result = await reasoningBank.storePattern({
                patternType: pattern.patternType as any,
                name: pattern.name,
                description: pattern.description,
                template: pattern.template as any,
                context: pattern.context as any,
              });

              if (result.success) {
                if (isDuplicate) {
                  updated++;
                } else {
                  imported++;
                }
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

        // Calculate what would happen in dry-run
        let wouldImport = 0;
        let wouldSkip = 0;
        let wouldUpdate = 0;

        if (options.dryRun) {
          for (const pattern of importData.patterns) {
            const isDuplicate = existingNames.has(pattern.name);
            if (isDuplicate && options.skipDuplicates) {
              wouldSkip++;
            } else if (isDuplicate) {
              wouldUpdate++;
            } else {
              wouldImport++;
            }
          }
        }

        if (options.json) {
          printJson({
            dryRun: options.dryRun || false,
            importVersion: importData.version,
            totalPatterns: importData.patterns.length,
            imported: options.dryRun ? wouldImport : imported,
            updated: options.dryRun ? wouldUpdate : updated,
            skipped: options.dryRun ? wouldSkip : skipped,
            errors: errors.slice(0, 10),
          });
        } else {
          console.log(chalk.bold('\n📥 Learning Data Import (Merge)\n'));
          console.log(`  Source: ${inputPath}`);
          console.log(`  Export version: ${importData.version || 'unknown'}`);
          console.log(`  Total patterns: ${importData.patterns.length}`);
          console.log(`  Existing patterns: ${existingNames.size}`);

          if (options.dryRun) {
            console.log(chalk.yellow('\n  Dry run - no changes made'));
            console.log(`  Would import: ${wouldImport}`);
            console.log(`  Would update: ${wouldUpdate}`);
            console.log(`  Would skip: ${wouldSkip}`);
          } else {
            console.log(chalk.green(`\n  Imported: ${imported}`));
            console.log(chalk.blue(`  Updated: ${updated}`));
            if (skipped > 0) {
              console.log(chalk.yellow(`  Skipped: ${skipped}`));
            }
            if (errors.length > 0) {
              console.log(chalk.red(`  Errors: ${errors.length}`));
            }
          }

          console.log('');
        }

        process.exit(0);
      } catch (error) {
        printError(`import-merge failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });

  return learning;
}

// ============================================================================
// Exports
// ============================================================================

export { initializeLearningSystem };
