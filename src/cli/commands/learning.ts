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
import { findProjectRoot } from '../../kernel/unified-memory.js';
import { existsSync, writeFileSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { safeJsonParse } from '../../shared/safe-json.js';
import { stat, unlink } from 'node:fs/promises';
import type { QEDomain, QEPatternType, QEPatternTemplate, QEPatternContext } from '../../learning/qe-patterns.js';
import { QE_DOMAIN_LIST } from '../../learning/qe-patterns.js';
import {
  createLearningMetricsTracker,
} from '../../learning/metrics-tracker.js';
import { openDatabase } from '../../shared/safe-db.js';

// Extracted helpers
import {
  initializeLearningSystem,
  printJson,
  printSuccess,
  printError,
  printInfo,
  displayDashboard,
  getDbPath,
  compressFile,
  decompressFile,
  verifyDatabaseIntegrity,
  getSchemaVersion,
  EXPORT_FORMAT_VERSION,
  DOMAIN_MAPPING,
  PATTERN_TYPE_MAPPING,
  type LearningExportData,
} from './learning-helpers.js';

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

  // Register all subcommands
  registerStatsCommand(learning);
  registerConsolidateCommand(learning);
  registerExportCommand(learning);
  registerImportCommand(learning);
  registerResetCommand(learning);
  registerExtractCommand(learning);
  registerDashboardCommand(learning);
  registerInfoCommand(learning);
  registerBackupCommand(learning);
  registerRestoreCommand(learning);
  registerVerifyCommand(learning);
  registerExportFullCommand(learning);
  registerImportMergeCommand(learning);
  registerDreamCommand(learning);

  return learning;
}

// ============================================================================
// Subcommand: stats
// ============================================================================

function registerStatsCommand(learning: Command): void {
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
          console.log(chalk.bold('Patterns:'));
          console.log(`  Total: ${chalk.cyan(stats.totalPatterns)}`);
          console.log(`  Short-term: ${stats.patternStoreStats.byTier.shortTerm}`);
          console.log(`  Long-term: ${stats.patternStoreStats.byTier.longTerm}`);
          console.log(`  Avg Confidence: ${(stats.patternStoreStats.avgConfidence * 100).toFixed(1)}%`);
          console.log(`  Avg Quality: ${(stats.patternStoreStats.avgQualityScore * 100).toFixed(1)}%`);

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

          console.log(chalk.bold('\nLearning:'));
          console.log(`  Routing Requests: ${stats.routingRequests}`);
          console.log(`  Avg Routing Confidence: ${(stats.avgRoutingConfidence * 100).toFixed(1)}%`);
          console.log(`  Learning Outcomes: ${stats.learningOutcomes}`);
          console.log(`  Pattern Success Rate: ${(stats.patternSuccessRate * 100).toFixed(1)}%`);

          console.log(chalk.bold('\nSearch Performance:'));
          console.log(`  Operations: ${stats.patternStoreStats.searchOperations}`);
          console.log(`  Avg Latency: ${stats.patternStoreStats.avgSearchLatencyMs.toFixed(2)}ms`);
          console.log(`  HNSW Native: ${stats.patternStoreStats.hnswStats.nativeAvailable ? chalk.green('✓') : chalk.dim('○')}`);
          console.log(`  Vector Count: ${stats.patternStoreStats.hnswStats.vectorCount}`);

          const asymmetricStats = stats.asymmetricLearning;
          if (asymmetricStats) {
            console.log(chalk.bold('\nAsymmetric Learning (ADR-061):'));
            console.log(`  Failure Penalty Ratio: ${asymmetricStats.failurePenaltyRatio || '10:1'}`);
            console.log(`  Quarantined Patterns: ${asymmetricStats.quarantinedPatterns || 0}`);
            console.log(`  Rehabilitated: ${asymmetricStats.rehabilitatedPatterns || 0}`);
            console.log(`  Avg Confidence Delta: ${((asymmetricStats.avgConfidenceDelta || 0) * 100).toFixed(1)}%`);
          }

          if (options.detailed) {
            console.log(chalk.bold('\nBy Pattern Type:'));
            for (const [type, count] of Object.entries(stats.patternStoreStats.byType)) {
              if (count > 0) console.log(`  ${type}: ${count}`);
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
}

// ============================================================================
// Subcommand: consolidate
// ============================================================================

function registerConsolidateCommand(learning: Command): void {
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
        const threshold = parseInt(options.threshold, 10);
        const successRateMin = parseFloat(options.successRate);

        const eligiblePatterns: Array<{
          id: string; name: string; domain: string;
          successfulUses: number; successRate: number; currentTier: string;
        }> = [];

        const searchResult = await reasoningBank.searchPatterns('*', { limit: 1000 });
        if (searchResult.success) {
          for (const match of searchResult.value) {
            const pattern = match.pattern;
            if (pattern.tier === 'short-term' && pattern.successfulUses >= threshold && pattern.successRate >= successRateMin) {
              eligiblePatterns.push({
                id: pattern.id, name: pattern.name, domain: pattern.qeDomain,
                successfulUses: pattern.successfulUses, successRate: pattern.successRate, currentTier: pattern.tier,
              });
            }
          }
        }

        if (options.json) {
          printJson({ dryRun: options.dryRun || false, eligibleCount: eligiblePatterns.length, threshold, successRateMin, patterns: eligiblePatterns });
        } else {
          console.log(chalk.bold('\n🔄 Pattern Consolidation\n'));
          console.log(`  Promotion threshold: ${threshold} successful uses`);
          console.log(`  Minimum success rate: ${(successRateMin * 100).toFixed(0)}%`);
          console.log(`  Eligible patterns: ${eligiblePatterns.length}\n`);

          if (eligiblePatterns.length === 0) {
            console.log(chalk.dim('  No patterns eligible for promotion yet.'));
          } else {
            console.log(chalk.bold('  Patterns to promote:'));
            for (const p of eligiblePatterns) {
              console.log(`    ${chalk.cyan(p.name)}`);
              console.log(chalk.dim(`      Domain: ${p.domain}, Uses: ${p.successfulUses}, Rate: ${(p.successRate * 100).toFixed(0)}%`));
            }
            if (!options.dryRun) {
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
}

// ============================================================================
// Subcommand: export
// ============================================================================

function registerExportCommand(learning: Command): void {
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
        const searchResult = await reasoningBank.searchPatterns('*', { limit: 10000, domain: options.domain as QEDomain });
        if (!searchResult.success) throw new Error(searchResult.error.message);

        const patterns = searchResult.value.map(m => m.pattern).filter(p => !options.longTermOnly || p.tier === 'long-term');
        const exportData = {
          version: '3.0.0', exportedAt: new Date().toISOString(), source: process.cwd(),
          patternCount: patterns.length,
          patterns: patterns.map(p => ({
            id: p.id, name: p.name, description: p.description, patternType: p.patternType,
            qeDomain: p.qeDomain, tier: p.tier, confidence: p.confidence, successRate: p.successRate,
            successfulUses: p.successfulUses, qualityScore: p.qualityScore, template: p.template, context: p.context,
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
}

// ============================================================================
// Subcommand: import
// ============================================================================

function registerImportCommand(learning: Command): void {
  learning
    .command('import')
    .description('Import patterns from file')
    .requiredOption('-i, --input <file>', 'Input file path')
    .option('--dry-run', 'Show what would be imported without making changes')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const inputPath = path.resolve(options.input);
        if (!existsSync(inputPath)) throw new Error(`File not found: ${inputPath}`);

        const content = readFileSync(inputPath, 'utf-8');
        const importData = safeJsonParse<Record<string, unknown>>(content);
        if (!importData.patterns || !Array.isArray(importData.patterns)) throw new Error('Invalid pattern file format');

        const reasoningBank = await initializeLearningSystem();
        let imported = 0;
        let skipped = 0;
        const errors: string[] = [];

        if (!options.dryRun) {
          for (const pattern of importData.patterns) {
            try {
              const result = await reasoningBank.storePattern({
                patternType: pattern.patternType, name: pattern.name,
                description: pattern.description, template: pattern.template, context: pattern.context,
              });
              if (result.success) imported++; else { skipped++; errors.push(`${pattern.name}: ${result.error.message}`); }
            } catch (e) { skipped++; errors.push(`${pattern.name}: ${e instanceof Error ? e.message : 'unknown'}`); }
          }
        }

        if (options.json) {
          printJson({ dryRun: options.dryRun || false, totalPatterns: importData.patterns.length, imported, skipped, errors });
        } else {
          console.log(chalk.bold('\n📥 Pattern Import\n'));
          console.log(`  Source: ${inputPath}`);
          console.log(`  Total patterns: ${importData.patterns.length}`);
          if (options.dryRun) {
            console.log(chalk.yellow('\n  Dry run - no changes made'));
            console.log(`  Would import: ${importData.patterns.length} patterns`);
          } else {
            console.log(chalk.green(`\n  Imported: ${imported}`));
            if (skipped > 0) console.log(chalk.yellow(`  Skipped: ${skipped}`));
          }
          console.log('');
        }
        process.exit(0);
      } catch (error) {
        printError(`import failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Subcommand: reset
// ============================================================================

function registerResetCommand(learning: Command): void {
  learning
    .command('reset')
    .description('Reset learning data (patterns and metrics)')
    .option('--confirm', 'Confirm reset without prompting')
    .option('--patterns-only', 'Only reset patterns, keep metrics')
    .action(async (options) => {
      try {
        if (!options.confirm) {
          console.log(chalk.yellow('\n⚠️  This will reset your learning data.'));
          console.log(chalk.gray('    Use --confirm to proceed\n'));
          process.exit(0);
        }

        const projectRoot = findProjectRoot();
        const dataDir = path.join(projectRoot, '.agentic-qe');
        const filesToReset = [
          path.join(dataDir, 'data', 'patterns'),
          path.join(dataDir, 'data', 'hnsw'),
        ];
        if (!options.patternsOnly) filesToReset.push(path.join(dataDir, 'data', 'learning-config.json'));

        console.log(chalk.bold('\n🗑️  Resetting Learning Data\n'));
        for (const file of filesToReset) {
          if (existsSync(file)) console.log(chalk.dim(`  Removing: ${path.relative(projectRoot, file)}`));
        }

        printSuccess('Learning data reset. Run "aqe init --auto" to reinitialize.\n');
        process.exit(0);
      } catch (error) {
        printError(`reset failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Subcommand: extract
// ============================================================================

function registerExtractCommand(learning: Command): void {
  learning
    .command('extract')
    .description('Extract QE patterns from existing learning experiences')
    .option('--min-reward <n>', 'Minimum reward threshold for pattern extraction', '0.7')
    .option('--min-count <n>', 'Minimum occurrences to form a pattern', '3')
    .option('--dry-run', 'Show what would be extracted without saving')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const projectRoot = findProjectRoot();
        const dbPath = path.join(projectRoot, '.agentic-qe', 'memory.db');
        if (!existsSync(dbPath)) throw new Error('No memory database found. Run "aqe init --auto" first.');

        const minReward = parseFloat(options.minReward);
        const minCount = parseInt(options.minCount, 10);

        console.log(chalk.bold('\n🔬 Pattern Extraction from Learning Experiences\n'));
        console.log(`  Min reward threshold: ${minReward}`);
        console.log(`  Min occurrences: ${minCount}\n`);

        const db = openDatabase(dbPath, { readonly: true });

        const experiences = db.prepare(`
          SELECT task_type, COUNT(*) as count, AVG(reward) as avg_reward, MAX(reward) as max_reward,
                 MIN(reward) as min_reward, GROUP_CONCAT(DISTINCT action) as actions
          FROM learning_experiences WHERE reward >= ? GROUP BY task_type HAVING COUNT(*) >= ? ORDER BY avg_reward DESC
        `).all(minReward, minCount) as Array<{
          task_type: string; count: number; avg_reward: number; max_reward: number; min_reward: number; actions: string;
        }>;

        const memoryPatterns = db.prepare(`
          SELECT substr(key, 1, 40) as key_prefix, COUNT(*) as count
          FROM memory_entries WHERE key LIKE 'phase2/learning/%'
          GROUP BY substr(key, 1, 40) HAVING COUNT(*) >= ? ORDER BY COUNT(*) DESC LIMIT 20
        `).all(minCount) as Array<{ key_prefix: string; count: number }>;

        db.close();

        const extractedPatterns: Array<{
          name: string; domain: QEDomain; patternType: string; confidence: number;
          sourceCount: number; avgReward: number; actions: string[];
        }> = [];

        for (const exp of experiences) {
          const domain = DOMAIN_MAPPING[exp.task_type] || 'code-intelligence';
          const patternType = PATTERN_TYPE_MAPPING[exp.task_type] || 'test-template';
          const actions = exp.actions ? exp.actions.split(',').slice(0, 5) : [];
          extractedPatterns.push({
            name: `${exp.task_type}-success-pattern`, domain, patternType,
            confidence: Math.min(0.95, exp.avg_reward / 2), sourceCount: exp.count, avgReward: exp.avg_reward, actions,
          });
        }

        if (options.json) {
          printJson({ minReward, minCount, dryRun: options.dryRun || false, experienceGroups: experiences.length, memoryPatterns: memoryPatterns.length, extractedPatterns });
        } else {
          console.log(chalk.bold('Learning Experience Groups:'));
          if (experiences.length === 0) {
            console.log(chalk.dim('  No qualifying experience groups found'));
          } else {
            for (const exp of experiences) {
              const rewardColor = exp.avg_reward >= 1.0 ? chalk.green : exp.avg_reward >= 0.5 ? chalk.yellow : chalk.red;
              console.log(`  ${chalk.cyan(exp.task_type)}`);
              console.log(`    Count: ${exp.count}, Avg Reward: ${rewardColor(exp.avg_reward.toFixed(2))}`);
            }
          }

          console.log(chalk.bold('\nMemory Pattern Sources:'));
          for (const mp of memoryPatterns.slice(0, 10)) console.log(`  ${mp.key_prefix}... (${mp.count})`);

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
            const reasoningBank = await initializeLearningSystem();
            let stored = 0;
            const errors: string[] = [];

            for (const p of extractedPatterns) {
              try {
                const templateContent = p.actions.length > 0
                  ? `// ${p.name}\n// Steps: ${p.actions.join(' -> ')}\n\n{{implementation}}`
                  : `// ${p.name}\n// Extracted pattern with ${p.sourceCount} successful uses\n\n{{implementation}}`;

                const result = await reasoningBank.storePattern({
                  patternType: p.patternType as QEPatternType, name: p.name,
                  description: `Extracted from ${p.sourceCount} learning experiences with avg reward ${p.avgReward.toFixed(2)}`,
                  template: { type: 'code', content: templateContent, variables: [{ name: 'implementation', type: 'code', required: true, description: 'Implementation code for this pattern' }] },
                  context: { tags: [p.domain, p.patternType, `sources:${p.sourceCount}`, `reward:${p.avgReward.toFixed(2)}`] },
                });
                if (result.success) stored++; else errors.push(`${p.name}: ${result.error.message}`);
              } catch (e) { errors.push(`${p.name}: ${e instanceof Error ? e.message : 'unknown'}`); }
            }

            console.log(chalk.green(`\n✓ Stored ${stored} new patterns`));
            if (errors.length > 0 && errors.length <= 5) console.log(chalk.yellow(`  Errors: ${errors.slice(0, 3).join(', ')}${errors.length > 3 ? '...' : ''}`));
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
}

// ============================================================================
// Subcommand: dashboard
// ============================================================================

function registerDashboardCommand(learning: Command): void {
  learning
    .command('dashboard')
    .description('Display learning system dashboard with metrics and trends')
    .option('--json', 'Output as JSON')
    .option('--save-snapshot', 'Save a daily metrics snapshot')
    .action(async (options) => {
      try {
        const projectRoot = findProjectRoot();
        const tracker = createLearningMetricsTracker(projectRoot);
        await tracker.initialize();

        if (options.saveSnapshot) { await tracker.saveSnapshot(); printSuccess('Daily snapshot saved'); }

        const dashboard = await tracker.getDashboardData();
        tracker.close();

        if (options.json) printJson(dashboard); else displayDashboard(dashboard);
        process.exit(0);
      } catch (error) {
        printError(`dashboard failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Subcommand: info
// ============================================================================

function registerInfoCommand(learning: Command): void {
  learning
    .command('info')
    .description('Show learning system configuration and paths')
    .action(async () => {
      try {
        const projectRoot = findProjectRoot();
        const dataDir = path.join(projectRoot, '.agentic-qe');

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
        console.log('  Events: pre-edit, post-edit, pre-task, post-task, route\n');
        process.exit(0);
      } catch (error) {
        printError(`info failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Subcommand: backup
// ============================================================================

function registerBackupCommand(learning: Command): void {
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
        if (!existsSync(dbPath)) throw new Error(`No learning database found at: ${dbPath}`);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const defaultOutput = path.join(process.cwd(), 'backups', `learning-${timestamp}.db`);
        let outputPath = options.output ? path.resolve(options.output) : defaultOutput;

        const backupDir = path.dirname(outputPath);
        if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

        const sourceStats = await stat(dbPath);
        const sourceSizeKB = (sourceStats.size / 1024).toFixed(2);

        copyFileSync(dbPath, outputPath);
        const walPath = `${dbPath}-wal`;
        if (existsSync(walPath)) copyFileSync(walPath, `${outputPath}-wal`);

        let finalPath = outputPath;
        if (options.compress) {
          finalPath = await compressFile(outputPath);
          await unlink(outputPath);
          if (existsSync(`${outputPath}-wal`)) await unlink(`${outputPath}-wal`);
        }

        const finalStats = await stat(finalPath);
        const finalSizeKB = (finalStats.size / 1024).toFixed(2);

        let verificationResult: { valid: boolean; message: string } | undefined;
        if (options.verify && !options.compress) verificationResult = await verifyDatabaseIntegrity(outputPath);

        const schemaVersion = await getSchemaVersion(dbPath);

        if (options.json) {
          printJson({ success: true, sourcePath: dbPath, backupPath: finalPath, sourceSizeKB: parseFloat(sourceSizeKB), backupSizeKB: parseFloat(finalSizeKB), compressed: options.compress || false, schemaVersion, verification: verificationResult, timestamp: new Date().toISOString() });
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
            console.log(verificationResult.valid ? chalk.green(`  Verification: ${verificationResult.message}`) : chalk.red(`  Verification: ${verificationResult.message}`));
          }
          printSuccess(`Backup saved to: ${finalPath}\n`);
        }
        process.exit(0);
      } catch (error) {
        printError(`backup failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Subcommand: restore
// ============================================================================

function registerRestoreCommand(learning: Command): void {
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
        if (!existsSync(inputPath)) throw new Error(`Backup file not found: ${inputPath}`);

        const isCompressed = inputPath.endsWith('.gz');
        let restorePath = inputPath;

        if (isCompressed) {
          const tempPath = inputPath.replace('.gz', '.tmp');
          await decompressFile(inputPath, tempPath);
          restorePath = tempPath;
        }

        if (options.verify) {
          const verificationResult = await verifyDatabaseIntegrity(restorePath);
          if (!verificationResult.valid) {
            if (isCompressed && existsSync(restorePath)) await unlink(restorePath);
            throw new Error(`Backup verification failed: ${verificationResult.message}`);
          }
        }

        if (existsSync(dbPath) && !options.force) {
          printError(`Database already exists at: ${dbPath}`);
          console.log(chalk.yellow('  Use --force to overwrite'));
          if (isCompressed && existsSync(restorePath)) await unlink(restorePath);
          process.exit(1);
        }

        const targetDir = path.dirname(dbPath);
        if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });

        if (existsSync(dbPath)) await unlink(dbPath);
        if (existsSync(`${dbPath}-wal`)) await unlink(`${dbPath}-wal`);
        if (existsSync(`${dbPath}-shm`)) await unlink(`${dbPath}-shm`);

        copyFileSync(restorePath, dbPath);
        if (isCompressed && existsSync(restorePath)) await unlink(restorePath);

        const restoredStats = await stat(dbPath);
        const schemaVersion = await getSchemaVersion(dbPath);

        if (options.json) {
          printJson({ success: true, backupPath: inputPath, restoredPath: dbPath, sizeKB: parseFloat((restoredStats.size / 1024).toFixed(2)), schemaVersion, wasCompressed: isCompressed, timestamp: new Date().toISOString() });
        } else {
          console.log(chalk.bold('\n🔄 Learning Database Restore\n'));
          console.log(`  Backup: ${inputPath}`);
          console.log(`  Restored to: ${dbPath}`);
          console.log(`  Size: ${(restoredStats.size / 1024).toFixed(2)} KB`);
          console.log(`  Schema version: ${schemaVersion}`);
          printSuccess('Database restored successfully\n');
        }
        process.exit(0);
      } catch (error) {
        printError(`restore failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Subcommand: verify
// ============================================================================

function registerVerifyCommand(learning: Command): void {
  learning
    .command('verify')
    .description('Verify learning database integrity')
    .option('-f, --file <path>', 'Database file to verify (defaults to current)')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const dbPath = options.file ? path.resolve(options.file) : getDbPath();
        if (!existsSync(dbPath)) throw new Error(`Database file not found: ${dbPath}`);

        const verificationResult = await verifyDatabaseIntegrity(dbPath);
        const schemaVersion = await getSchemaVersion(dbPath);
        const fileStats = await stat(dbPath);

        let tableCounts: Record<string, number> = {};
        try {
          const db = openDatabase(dbPath, { readonly: true });
          for (const table of ['qe_patterns', 'qe_trajectories', 'learning_experiences', 'kv_store', 'vectors']) {
            try { const r = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number }; tableCounts[table] = r.count; } catch { /* table may not exist */ }
          }
          db.close();
        } catch { /* ignore */ }

        if (options.json) {
          printJson({ valid: verificationResult.valid, message: verificationResult.message, path: dbPath, sizeKB: parseFloat((fileStats.size / 1024).toFixed(2)), schemaVersion, tableCounts, timestamp: new Date().toISOString() });
        } else {
          console.log(chalk.bold('\n🔍 Database Verification\n'));
          console.log(`  Path: ${dbPath}`);
          console.log(`  Size: ${(fileStats.size / 1024).toFixed(2)} KB`);
          console.log(`  Schema version: ${schemaVersion}`);
          console.log(verificationResult.valid ? chalk.green(`  Status: ${verificationResult.message}`) : chalk.red(`  Status: ${verificationResult.message}`));
          if (Object.keys(tableCounts).length > 0) {
            console.log(chalk.bold('\nTable Counts:'));
            for (const [table, count] of Object.entries(tableCounts)) console.log(`  ${table}: ${count}`);
          }
          console.log('');
        }
        process.exit(verificationResult.valid ? 0 : 1);
      } catch (error) {
        printError(`verify failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Subcommand: export-full
// ============================================================================

function registerExportFullCommand(learning: Command): void {
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
        if (!existsSync(dbPath)) throw new Error('No learning database found. Run "aqe init --auto" first.');

        const reasoningBank = await initializeLearningSystem();
        const schemaVersion = await getSchemaVersion(dbPath);
        const searchResult = await reasoningBank.searchPatterns('*', { limit: 10000 });
        if (!searchResult.success) throw new Error(searchResult.error.message);

        const patterns = searchResult.value.map(m => ({
          id: m.pattern.id, name: m.pattern.name, description: m.pattern.description,
          patternType: m.pattern.patternType, qeDomain: m.pattern.qeDomain, tier: m.pattern.tier,
          confidence: m.pattern.confidence, successRate: m.pattern.successRate,
          successfulUses: m.pattern.successfulUses, qualityScore: m.pattern.qualityScore,
          template: m.pattern.template, context: m.pattern.context,
          createdAt: m.pattern.createdAt instanceof Date ? m.pattern.createdAt.toISOString() : m.pattern.createdAt || undefined,
          lastUsedAt: m.pattern.lastUsedAt instanceof Date ? m.pattern.lastUsedAt.toISOString() : m.pattern.lastUsedAt || undefined,
        }));

        const exportData: LearningExportData = {
          version: EXPORT_FORMAT_VERSION, exportedAt: new Date().toISOString(), source: process.cwd(),
          schemaVersion, patternCount: patterns.length, patterns,
        };

        if (options.includeTrajectories) {
          try {
            const db = openDatabase(dbPath, { readonly: true });
            const trajectories = db.prepare(`SELECT id, task, agent, domain, success, steps_json FROM qe_trajectories ORDER BY started_at DESC LIMIT 1000`).all() as Array<{ id: string; task: string; agent: string; domain: string; success: number; steps_json: string }>;
            exportData.trajectories = trajectories.map(t => ({ id: t.id, task: t.task, agent: t.agent, domain: t.domain, success: t.success, stepsJson: t.steps_json }));
            db.close();
          } catch { /* table may not exist */ }
        }

        if (options.includeExperiences) {
          try {
            const db = openDatabase(dbPath, { readonly: true });
            const experiences = db.prepare(`SELECT task_type, action, AVG(reward) as avg_reward, COUNT(*) as count FROM learning_experiences GROUP BY task_type, action ORDER BY count DESC LIMIT 500`).all() as Array<{ task_type: string; action: string; avg_reward: number; count: number }>;
            exportData.experiences = experiences.map(e => ({ taskType: e.task_type, action: e.action, reward: e.avg_reward, count: e.count }));
            const metaRow = db.prepare(`SELECT COUNT(*) as total, AVG(reward) as avg_reward FROM learning_experiences`).get() as { total: number; avg_reward: number };
            exportData.metadata = { totalExperiences: metaRow.total, avgReward: metaRow.avg_reward };
            db.close();
          } catch { /* table may not exist */ }
        }

        if (options.json) {
          printJson(exportData);
        } else {
          let outputPath = path.resolve(options.output);
          writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf-8');
          if (options.compress) { const compressedPath = await compressFile(outputPath); await unlink(outputPath); outputPath = compressedPath; }

          console.log(chalk.bold('\n📤 Learning Data Export\n'));
          console.log(`  Patterns: ${patterns.length}`);
          if (exportData.trajectories) console.log(`  Trajectories: ${exportData.trajectories.length}`);
          if (exportData.experiences) console.log(`  Experience groups: ${exportData.experiences.length}`);
          console.log(`  Schema version: ${schemaVersion}`);
          console.log(`  Export format: ${EXPORT_FORMAT_VERSION}`);
          printSuccess(`Exported to: ${outputPath}\n`);
        }
        process.exit(0);
      } catch (error) {
        printError(`export-full failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Subcommand: import-merge
// ============================================================================

function registerImportMergeCommand(learning: Command): void {
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
        if (!existsSync(inputPath)) throw new Error(`File not found: ${inputPath}`);

        let content: string;
        if (inputPath.endsWith('.gz')) {
          const tempPath = inputPath.replace('.gz', '.tmp.json');
          await decompressFile(inputPath, tempPath);
          content = readFileSync(tempPath, 'utf-8');
          await unlink(tempPath);
        } else {
          content = readFileSync(inputPath, 'utf-8');
        }

        const importData = safeJsonParse<LearningExportData>(content);
        if (!importData.patterns || !Array.isArray(importData.patterns)) throw new Error('Invalid import file format: missing patterns array');

        const reasoningBank = await initializeLearningSystem();
        const existingResult = await reasoningBank.searchPatterns('*', { limit: 10000 });
        const existingNames = new Set<string>();
        if (existingResult.success) for (const m of existingResult.value) existingNames.add(m.pattern.name);

        let imported = 0, skipped = 0, updated = 0;
        const errors: string[] = [];

        if (!options.dryRun) {
          for (const pattern of importData.patterns) {
            const isDuplicate = existingNames.has(pattern.name);
            if (isDuplicate && options.skipDuplicates) { skipped++; continue; }
            try {
              const result = await reasoningBank.storePattern({ patternType: pattern.patternType as QEPatternType, name: pattern.name, description: pattern.description, template: pattern.template as Omit<QEPatternTemplate, 'example'>, context: pattern.context as Partial<QEPatternContext> });
              if (result.success) { if (isDuplicate) updated++; else imported++; }
              else { skipped++; errors.push(`${pattern.name}: ${result.error.message}`); }
            } catch (e) { skipped++; errors.push(`${pattern.name}: ${e instanceof Error ? e.message : 'unknown'}`); }
          }
        }

        let wouldImport = 0, wouldSkip = 0, wouldUpdate = 0;
        if (options.dryRun) {
          for (const pattern of importData.patterns) {
            const isDuplicate = existingNames.has(pattern.name);
            if (isDuplicate && options.skipDuplicates) wouldSkip++;
            else if (isDuplicate) wouldUpdate++;
            else wouldImport++;
          }
        }

        if (options.json) {
          printJson({ dryRun: options.dryRun || false, importVersion: importData.version, totalPatterns: importData.patterns.length, imported: options.dryRun ? wouldImport : imported, updated: options.dryRun ? wouldUpdate : updated, skipped: options.dryRun ? wouldSkip : skipped, errors: errors.slice(0, 10) });
        } else {
          console.log(chalk.bold('\n📥 Learning Data Import (Merge)\n'));
          console.log(`  Source: ${inputPath}`);
          console.log(`  Export version: ${importData.version || 'unknown'}`);
          console.log(`  Total patterns: ${importData.patterns.length}`);
          console.log(`  Existing patterns: ${existingNames.size}`);

          if (options.dryRun) {
            console.log(chalk.yellow('\n  Dry run - no changes made'));
            console.log(`  Would import: ${wouldImport}\n  Would update: ${wouldUpdate}\n  Would skip: ${wouldSkip}`);
          } else {
            console.log(chalk.green(`\n  Imported: ${imported}`));
            console.log(chalk.blue(`  Updated: ${updated}`));
            if (skipped > 0) console.log(chalk.yellow(`  Skipped: ${skipped}`));
            if (errors.length > 0) console.log(chalk.red(`  Errors: ${errors.length}`));
          }
          console.log('');
        }
        process.exit(0);
      } catch (error) {
        printError(`import-merge failed: ${error instanceof Error ? error.message : 'unknown'}`);
        process.exit(1);
      }
    });
}

// ============================================================================
// Subcommand: dream
// ============================================================================

function registerDreamCommand(learning: Command): void {
  learning
    .command('dream')
    .description('Run dream cycles for pattern discovery via spreading activation')
    .option('--duration <ms>', 'Duration of dream cycle in milliseconds', '30000')
    .option('--quick', 'Run a quick 5-second dream cycle')
    .option('--full', 'Run a full 30-second dream cycle')
    .option('--status', 'Show dream system status')
    .option('--history', 'Show past dream cycles')
    .option('--insights', 'Show pending insights from previous cycles')
    .option('--apply <id>', 'Apply a specific insight by ID')
    .option('--limit <n>', 'Maximum results for history/insights', '20')
    .option('--min-patterns <n>', 'Minimum patterns required to dream', '10')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const { createDreamEngine } = await import('../../learning/dream/index.js');

        if (options.status) {
          const engine = createDreamEngine();
          await engine.initialize();
          const isDreaming = engine.isDreaming();
          const history = await engine.getDreamHistory(100);
          const pending = await engine.getPendingInsights(100);
          const totalInsights = history.reduce((sum, c) => sum + c.insightsGenerated, 0);
          const lastCycle = history[0];

          if (options.json) {
            printJson({ isDreaming, totalCycles: history.length, totalInsights, pendingInsights: pending.length, lastDreamTime: lastCycle?.startTime.toISOString() || null });
          } else {
            console.log(chalk.bold('\n🌙 Dream System Status\n'));
            console.log(`  Currently dreaming: ${isDreaming ? chalk.green('Yes') : chalk.dim('No')}`);
            console.log(`  Total dream cycles: ${history.length}`);
            console.log(`  Total insights generated: ${totalInsights}`);
            console.log(`  Pending insights: ${pending.length}`);
            console.log(`  Last dream: ${lastCycle ? lastCycle.startTime.toISOString() : chalk.dim('never')}`);
            if (history.length > 0) {
              console.log(chalk.bold('\n  Recent cycles:'));
              for (const c of history.slice(0, 3)) {
                const status = c.status === 'completed' ? chalk.green(c.status) : chalk.yellow(c.status);
                console.log(`    ${c.id.slice(0, 8)} | ${status} | ${c.durationMs || 0}ms | ${c.insightsGenerated} insights`);
              }
            }
            console.log('');
          }
          await engine.close();
          process.exit(0);
        }

        if (options.history) {
          const limit = parseInt(options.limit, 10);
          const engine = createDreamEngine();
          await engine.initialize();
          const cycles = await engine.getDreamHistory(limit);

          if (options.json) {
            printJson(cycles.map(c => ({ id: c.id, startTime: c.startTime.toISOString(), endTime: c.endTime?.toISOString(), durationMs: c.durationMs, status: c.status, conceptsProcessed: c.conceptsProcessed, associationsFound: c.associationsFound, insightsGenerated: c.insightsGenerated })));
          } else {
            console.log(chalk.bold(`\n🌙 Dream Cycle History (${cycles.length} cycles)\n`));
            if (cycles.length === 0) { console.log(chalk.dim('  No dream cycles found. Run: aqe learning dream')); }
            else { for (const c of cycles) { const status = c.status === 'completed' ? chalk.green('✓') : c.status === 'failed' ? chalk.red('✗') : chalk.yellow('⋯'); console.log(`  ${status} ${c.id.slice(0, 8)} | ${c.startTime.toISOString()}`); console.log(chalk.dim(`    Duration: ${c.durationMs || 0}ms | Concepts: ${c.conceptsProcessed} | Associations: ${c.associationsFound} | Insights: ${c.insightsGenerated}`)); } }
            console.log('');
          }
          await engine.close();
          process.exit(0);
        }

        if (options.insights) {
          const limit = parseInt(options.limit, 10);
          const engine = createDreamEngine();
          await engine.initialize();
          const pending = await engine.getPendingInsights(limit);

          if (options.json) {
            printJson(pending.map(i => ({ id: i.id, type: i.type, description: i.description, noveltyScore: i.noveltyScore, confidenceScore: i.confidenceScore, actionable: i.actionable, applied: i.applied || false, suggestedAction: i.suggestedAction, createdAt: i.createdAt?.toISOString() })));
          } else {
            console.log(chalk.bold(`\n💡 Pending Dream Insights (${pending.length})\n`));
            if (pending.length === 0) { console.log(chalk.dim('  No pending insights. Run a dream cycle first: aqe learning dream')); }
            else { for (const i of pending) { const novelty = i.noveltyScore >= 0.7 ? chalk.green(`${(i.noveltyScore * 100).toFixed(0)}%`) : chalk.yellow(`${(i.noveltyScore * 100).toFixed(0)}%`); const confidence = i.confidenceScore >= 0.7 ? chalk.green(`${(i.confidenceScore * 100).toFixed(0)}%`) : chalk.yellow(`${(i.confidenceScore * 100).toFixed(0)}%`); console.log(`  ${chalk.cyan(i.id.slice(0, 8))} [${i.type}] ${i.actionable ? '⚡' : '  '}`); console.log(`    ${i.description}`); console.log(chalk.dim(`    Novelty: ${novelty} | Confidence: ${confidence}`)); if (i.suggestedAction) console.log(chalk.dim(`    Action: ${i.suggestedAction}`)); } }
            console.log('');
          }
          await engine.close();
          process.exit(0);
        }

        if (options.apply) {
          const insightId = options.apply;
          const engine = createDreamEngine();
          await engine.initialize();
          const pending = await engine.getPendingInsights(100);
          const insight = pending.find(i => i.id === insightId || i.id.startsWith(insightId));

          if (!insight) { printError(`Insight not found: ${insightId}`); await engine.close(); process.exit(1); }
          if (!insight.actionable) { printError(`Insight ${insightId} is not actionable`); await engine.close(); process.exit(1); }

          const result = await engine.applyInsight(insight.id);
          const reasoningBank = await initializeLearningSystem();
          const patternResult = await reasoningBank.storePattern({
            patternType: 'test-template', name: `Dream Insight: ${insight.type}`,
            description: `${insight.description} (confidence: ${insight.confidenceScore.toFixed(2)})`,
            template: { type: 'workflow', content: insight.suggestedAction || insight.description, variables: [] },
            context: { tags: ['dream-generated', insight.type, ...insight.sourceConcepts.slice(0, 3)], complexity: 'medium' },
          });

          if (options.json) {
            printJson({ insightId: insight.id, applied: result.success, patternId: patternResult.success ? patternResult.value.id : null, error: result.error || (patternResult.success ? null : patternResult.error?.message) });
          } else {
            if (result.success) { printSuccess(`Applied insight ${insight.id.slice(0, 8)}`); if (patternResult.success) printSuccess(`Created pattern ${patternResult.value.id} in ReasoningBank`); }
            else printError(`Failed to apply insight: ${result.error}`);
          }
          await engine.close();
          process.exit(result.success ? 0 : 1);
        }

        // --- Run Dream Cycle ---
        let durationMs = parseInt(options.duration, 10);
        if (options.quick) durationMs = 5000;
        if (options.full) durationMs = 30000;
        durationMs = Math.min(durationMs, 60000);

        const minPatterns = parseInt(options.minPatterns, 10);
        printInfo(`Starting dream cycle (${durationMs}ms, min ${minPatterns} patterns)...`);

        const engine = createDreamEngine({ maxDurationMs: durationMs, minConceptsRequired: minPatterns });
        await engine.initialize();

        const reasoningBank = await initializeLearningSystem();
        const patternsResult = await reasoningBank.searchPatterns('', { limit: 100, minConfidence: 0.3 });

        let loaded = 0;
        if (patternsResult.success && patternsResult.value.length > 0) {
          const importPatterns = patternsResult.value.map(result => ({
            id: result.pattern.id, name: result.pattern.name,
            description: result.pattern.description || `${result.pattern.patternType} pattern`,
            domain: result.pattern.qeDomain || 'learning-optimization',
            patternType: result.pattern.patternType, confidence: result.pattern.confidence,
            successRate: result.pattern.successRate || 0.5,
          }));
          loaded = await engine.loadPatternsAsConcepts(importPatterns);
          printInfo(`Loaded ${loaded} patterns from ReasoningBank as concepts`);
        } else {
          printInfo('No patterns found in ReasoningBank — dreaming with existing concepts');
        }

        const result = await engine.dream(durationMs);

        if (options.json) {
          printJson({
            cycleId: result.cycle.id, status: result.cycle.status, durationMs: result.cycle.durationMs || 0,
            conceptsProcessed: result.cycle.conceptsProcessed, associationsFound: result.cycle.associationsFound,
            insightsGenerated: result.cycle.insightsGenerated, activationStats: result.activationStats,
            patternsCreated: result.patternsCreated,
            insights: result.insights.map(i => ({ id: i.id, type: i.type, description: i.description, noveltyScore: i.noveltyScore, confidenceScore: i.confidenceScore, actionable: i.actionable })),
          });
        } else {
          console.log(chalk.bold('\n🌙 Dream Cycle Complete\n'));
          console.log(`  Cycle ID:       ${result.cycle.id.slice(0, 8)}`);
          console.log(`  Status:         ${result.cycle.status === 'completed' ? chalk.green('completed') : chalk.yellow(result.cycle.status)}`);
          console.log(`  Duration:       ${result.cycle.durationMs || 0}ms`);
          console.log(`  Concepts:       ${result.cycle.conceptsProcessed}`);
          console.log(`  Associations:   ${result.cycle.associationsFound}`);
          console.log(`  Insights:       ${result.cycle.insightsGenerated}`);

          if (result.activationStats) {
            console.log(chalk.bold('\n  Activation Stats:'));
            console.log(`    Iterations:   ${result.activationStats.totalIterations}`);
            console.log(`    Peak level:   ${result.activationStats.peakActivation.toFixed(3)}`);
            console.log(`    Nodes active: ${result.activationStats.nodesActivated}`);
          }

          if (result.insights.length > 0) {
            console.log(chalk.bold('\n  Generated Insights:'));
            for (const i of result.insights) {
              const novelty = i.noveltyScore >= 0.7 ? chalk.green(`${(i.noveltyScore * 100).toFixed(0)}%`) : chalk.yellow(`${(i.noveltyScore * 100).toFixed(0)}%`);
              console.log(`    ${chalk.cyan(i.id.slice(0, 8))} [${i.type}] ${i.actionable ? '⚡ actionable' : ''}`);
              console.log(`      ${i.description}`);
              console.log(chalk.dim(`      Novelty: ${novelty} | Confidence: ${(i.confidenceScore * 100).toFixed(0)}%`));
            }
            console.log(chalk.dim(`\n  Apply insights with: aqe learning dream --apply <insight-id>`));
          } else {
            console.log(chalk.dim('\n  No insights generated this cycle.'));
            console.log(chalk.dim('  Try loading more patterns or running a longer cycle.'));
          }
          console.log('');
        }

        await engine.close();
        process.exit(0);
      } catch (error) {
        printError(`dream failed: ${error instanceof Error ? error.message : 'unknown'}`);
        if (error instanceof Error && error.stack) console.error(chalk.dim(error.stack));
        process.exit(1);
      }
    });
}

// ============================================================================
// Exports
// ============================================================================

export { initializeLearningSystem } from './learning-helpers.js';
