#!/usr/bin/env node

/**
 * Agentic QE v3 - Init Command
 * ADR-025: Enhanced Init with Self-Configuration
 *
 * Comprehensive init command that:
 * - Detects project type (new/existing/upgrade)
 * - Analyzes project structure
 * - Detects available enhancements (Claude Flow, RuVector)
 * - Runs modular init phases
 * - Handles v2 to v3 migration
 */

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import { existsSync } from 'node:fs';
import {
  ModularInitOrchestrator,
  createModularInitOrchestrator,
  formatInitResultModular,
  type InitResult,
} from '../../init/index.js';
import { setupClaudeFlowIntegration, type ClaudeFlowSetupResult } from './claude-flow-setup.js';
import { toErrorMessage } from '../../shared/error-utils.js';

// ============================================================================
// Init Command
// ============================================================================

/**
 * Create the init command
 */
export function createInitCommand(): Command {
  const initCmd = new Command('init')
    .description('Initialize Agentic QE v3 in your project')
    .option('-a, --auto', 'Auto-configure without prompts')
    .option('-u, --upgrade', 'Upgrade existing installation (overwrites skills, agents, validation)')
    .option('--auto-migrate', 'Automatically migrate from v2 if detected')
    .option('--minimal', 'Minimal installation (no skills, patterns, or workers)')
    .option('--skip-patterns', 'Skip pattern loading')
    .option('--with-n8n', 'Include n8n workflow testing platform')
    .option('--with-opencode', 'Include OpenCode agent/skill provisioning')
    .option('--with-kiro', 'Include AWS Kiro IDE integration (agents, skills, hooks, steering)')
    .option('--with-claude-flow', 'Force Claude Flow integration setup')
    .option('--skip-claude-flow', 'Skip Claude Flow integration')
    .option('--no-governance', 'Skip governance configuration (ADR-058)')
    .option('-d, --debug', 'Enable debug output')
    .action(async (options) => {
      await runInit(options);
    });

  // Subcommands
  initCmd
    .command('status')
    .description('Check AQE installation status')
    .action(async () => {
      await checkStatus();
    });

  initCmd
    .command('migrate')
    .description('Migrate from v2 to v3')
    .option('--dry-run', 'Show what would be migrated without making changes')
    .option('--force', 'Force migration even if v3 already exists')
    .action(async (migrateOptions) => {
      await runMigration(migrateOptions);
    });

  initCmd
    .command('reset')
    .description('Reset AQE configuration (keeps data)')
    .option('--all', 'Reset everything including data')
    .option('--confirm', 'Skip confirmation prompt')
    .action(async (resetOptions) => {
      await runReset(resetOptions);
    });

  return initCmd;
}

// ============================================================================
// Init Action
// ============================================================================

interface InitOptions {
  auto?: boolean;
  upgrade?: boolean;
  autoMigrate?: boolean;
  minimal?: boolean;
  skipPatterns?: boolean;
  withN8n?: boolean;
  withOpencode?: boolean;
  withKiro?: boolean;
  withClaudeFlow?: boolean;
  skipClaudeFlow?: boolean;
  noGovernance?: boolean;
  debug?: boolean;
}

/**
 * Run the init command
 */
async function runInit(options: InitOptions): Promise<void> {
  const projectRoot = process.cwd();

  console.log('');
  console.log(chalk.bold.blue('  Agentic QE v3 - Initialization'));
  console.log(chalk.gray('  ─────────────────────────────────'));
  console.log('');

  // Check if already initialized
  const aqeDir = path.join(projectRoot, '.agentic-qe');
  const isExisting = existsSync(aqeDir);

  if (isExisting && !options.auto && !options.autoMigrate && !options.upgrade) {
    console.log(chalk.yellow('  ⚠ AQE directory already exists at:'), aqeDir);
    console.log(chalk.gray('    Use --auto to update configuration (keeps existing skills)'));
    console.log(chalk.gray('    Use --upgrade to update all skills, agents, and validation'));
    console.log(chalk.gray('    Use --auto-migrate to migrate from v2'));
    console.log('');
  }

  // Create orchestrator
  const orchestrator = createModularInitOrchestrator({
    projectRoot,
    autoMode: options.auto,
    upgrade: options.upgrade,
    autoMigrate: options.autoMigrate,
    minimal: options.minimal,
    skipPatterns: options.skipPatterns,
    withN8n: options.withN8n,
    withOpenCode: options.withOpencode,
    withKiro: options.withKiro,
    noGovernance: options.noGovernance,
  });

  // Run initialization
  const startTime = Date.now();
  let result: InitResult;

  try {
    result = await orchestrator.initialize();
  } catch (error) {
    console.error(chalk.red('\n  ✗ Initialization failed:'));
    console.error(chalk.gray(`    ${toErrorMessage(error)}`));
    process.exit(1);
  }

  // Claude Flow integration (after base init)
  let cfResult: ClaudeFlowSetupResult | undefined;
  if (!options.skipClaudeFlow && (options.withClaudeFlow || result.success)) {
    try {
      cfResult = await setupClaudeFlowIntegration({
        projectRoot,
        force: options.withClaudeFlow,
        debug: options.debug,
      });

      if (cfResult.available) {
        console.log(chalk.green('\n  ✓ Claude Flow integration enabled'));
        if (cfResult.features.trajectories) {
          console.log(chalk.gray('    • SONA trajectory tracking'));
        }
        if (cfResult.features.modelRouting) {
          console.log(chalk.gray('    • 3-tier model routing (haiku/sonnet/opus)'));
        }
        if (cfResult.features.pretrain) {
          console.log(chalk.gray('    • Codebase pretrain analysis'));
        }
      }
    } catch (error) {
      if (options.debug) {
        console.log(chalk.gray('\n  Claude Flow not available (standalone mode)'));
      }
    }
  }

  // Display result
  console.log(formatInitResultModular(result));

  // Display timing
  const totalMs = Date.now() - startTime;
  console.log(chalk.gray(`  Total time: ${formatDuration(totalMs)}`));
  console.log('');

  // Next steps
  if (result.success) {
    displayNextSteps(result, cfResult);
  }

  process.exit(result.success ? 0 : 1);
}

// ============================================================================
// Status Action
// ============================================================================

/**
 * Check AQE installation status
 */
async function checkStatus(): Promise<void> {
  const projectRoot = process.cwd();
  const aqeDir = path.join(projectRoot, '.agentic-qe');

  console.log('');
  console.log(chalk.bold.blue('  AQE Installation Status'));
  console.log(chalk.gray('  ─────────────────────────'));
  console.log('');

  // Check directories
  const dirs = [
    { name: '.agentic-qe', path: aqeDir },
    { name: 'memory.db', path: path.join(aqeDir, 'memory.db') },
    { name: 'config.json', path: path.join(aqeDir, 'config.json') },
    { name: 'CLAUDE.md', path: path.join(projectRoot, 'CLAUDE.md') },
  ];

  for (const dir of dirs) {
    const exists = existsSync(dir.path);
    const icon = exists ? chalk.green('✓') : chalk.red('✗');
    console.log(`  ${icon} ${dir.name}`);
  }

  // Check Claude Flow
  console.log('');
  console.log(chalk.bold('  Enhancements:'));

  try {
    const cfResult = await setupClaudeFlowIntegration({
      projectRoot,
      checkOnly: true,
    });

    if (cfResult.available) {
      console.log(chalk.green('  ✓ Claude Flow available'));
      console.log(chalk.gray(`    Version: ${cfResult.version || 'unknown'}`));
    } else {
      console.log(chalk.gray('  ○ Claude Flow not detected'));
    }
  } catch {
    console.log(chalk.gray('  ○ Claude Flow not detected'));
  }

  console.log('');
}

// ============================================================================
// Migration Action
// ============================================================================

interface MigrationOptions {
  dryRun?: boolean;
  force?: boolean;
}

/**
 * Run v2 to v3 migration
 */
async function runMigration(options: MigrationOptions): Promise<void> {
  const projectRoot = process.cwd();
  const aqeDir = path.join(projectRoot, '.agentic-qe');

  console.log('');
  console.log(chalk.bold.blue('  AQE v2 to v3 Migration'));
  console.log(chalk.gray('  ──────────────────────────'));
  console.log('');

  // Import migration modules
  const { createV2Detector, createV2DataMigrator, createV2ConfigMigrator } = await import('../../init/migration/index.js');

  // Detect v2
  const detector = createV2Detector(projectRoot);
  const v2Info = await detector.detect();

  if (!v2Info.detected) {
    console.log(chalk.yellow('  ⚠ No v2 installation detected'));
    console.log(chalk.gray('    Run "aqe init" to create a new installation'));
    console.log('');
    return;
  }

  console.log(chalk.green('  ✓ Found v2 installation'));
  console.log(chalk.gray(`    Database: ${v2Info.paths.memoryDb || 'not found'}`));
  console.log(chalk.gray(`    Config: ${v2Info.paths.configDir || 'not found'}`));
  console.log(chalk.gray(`    Version: ${v2Info.version || 'unknown'}`));
  console.log('');

  if (options.dryRun) {
    console.log(chalk.yellow('  Dry run - no changes will be made'));
    console.log('');
    return;
  }

  // Run migration
  console.log(chalk.blue('  Migrating data...'));

  if (v2Info.paths.memoryDb) {
    const dataMigrator = createV2DataMigrator({
      v2DbPath: v2Info.paths.memoryDb,
      v3PatternsDbPath: path.join(aqeDir, 'patterns.db'),
      onProgress: (p) => console.log(chalk.gray(`    ${p.message}`)),
    });

    const dataResult = await dataMigrator.migrate();

    if (dataResult.success) {
      console.log(chalk.green(`  ✓ Migrated ${dataResult.counts.patterns || 0} patterns`));
      console.log(chalk.green(`  ✓ Migrated ${dataResult.counts.experiences || 0} experiences`));
    } else {
      console.log(chalk.red(`  ✗ Data migration failed: ${dataResult.errors.join(', ')}`));
    }
  }

  const configMigrator = createV2ConfigMigrator(projectRoot);
  const configResult = await configMigrator.migrate();

  if (configResult.success) {
    console.log(chalk.green('  ✓ Config migrated'));
  } else {
    console.log(chalk.yellow('  ⚠ Config migration skipped (no v2 config found)'));
  }

  console.log('');
  console.log(chalk.green('  Migration complete!'));
  console.log(chalk.gray('    Run "aqe init" to complete setup'));
  console.log('');
}

// ============================================================================
// Reset Action
// ============================================================================

interface ResetOptions {
  all?: boolean;
  confirm?: boolean;
}

/**
 * Reset AQE configuration
 */
async function runReset(options: ResetOptions): Promise<void> {
  const projectRoot = process.cwd();
  const aqeDir = path.join(projectRoot, '.agentic-qe');

  console.log('');
  console.log(chalk.bold.yellow('  AQE Configuration Reset'));
  console.log(chalk.gray('  ────────────────────────'));
  console.log('');

  if (!existsSync(aqeDir)) {
    console.log(chalk.yellow('  ⚠ No AQE installation found'));
    console.log('');
    return;
  }

  if (!options.confirm) {
    console.log(chalk.yellow('  ⚠ This will reset your AQE configuration.'));
    console.log(chalk.gray('    Use --confirm to proceed'));
    if (options.all) {
      console.log(chalk.red('    --all will also delete all data!'));
    }
    console.log('');
    return;
  }

  const fs = await import('node:fs');
  const filesToReset = [
    path.join(aqeDir, 'config.json'),
    path.join(projectRoot, 'CLAUDE.md'),
    path.join(projectRoot, '.claude', 'settings.json'),
  ];

  if (options.all) {
    // Also delete data files
    filesToReset.push(
      path.join(aqeDir, 'memory.db'),
      path.join(aqeDir, 'patterns.db'),
      path.join(aqeDir, 'trajectories.db'),
      path.join(aqeDir, 'hnsw.index'),
    );
  }

  for (const file of filesToReset) {
    if (existsSync(file)) {
      try {
        fs.rmSync(file);
        console.log(chalk.gray(`  Removed: ${path.relative(projectRoot, file)}`));
      } catch (error) {
        console.log(chalk.red(`  Failed to remove: ${path.relative(projectRoot, file)}`));
      }
    }
  }

  console.log('');
  console.log(chalk.green('  Reset complete!'));
  console.log(chalk.gray('    Run "aqe init" to reconfigure'));
  console.log('');
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format duration for display
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Display next steps after successful init
 */
function displayNextSteps(result: InitResult, cfResult?: ClaudeFlowSetupResult): void {
  console.log(chalk.bold('  Next Steps:'));
  console.log('');

  console.log(chalk.gray('  1. Review generated CLAUDE.md for project instructions'));
  console.log(chalk.gray('  2. Check .agentic-qe/config.json for configuration'));
  console.log('');

  if (result.summary.skillsInstalled > 0) {
    console.log(chalk.gray(`  Skills installed: ${result.summary.skillsInstalled}`));
    console.log(chalk.gray('    Use /skill-name to invoke skills in Claude'));
  }

  if (result.summary.agentsInstalled > 0) {
    console.log(chalk.gray(`  Agents installed: ${result.summary.agentsInstalled}`));
    console.log(chalk.gray('    QE agents available for task routing'));
  }

  if (cfResult?.available) {
    console.log('');
    console.log(chalk.blue('  Claude Flow Enhanced:'));
    console.log(chalk.gray('    • SONA learning tracks task trajectories'));
    console.log(chalk.gray('    • Model routing optimizes haiku/sonnet/opus selection'));
    console.log(chalk.gray('    • Codebase pretrain improves agent recommendations'));
  }

  console.log('');
  console.log(chalk.bold('  Get Started:'));
  console.log(chalk.cyan('    aqe test generate src/        # Generate tests'));
  console.log(chalk.cyan('    aqe coverage analyze src/     # Analyze coverage'));
  console.log(chalk.cyan('    aqe fleet init                # Initialize agent fleet'));
  console.log('');
}

// Default export
export default createInitCommand;
