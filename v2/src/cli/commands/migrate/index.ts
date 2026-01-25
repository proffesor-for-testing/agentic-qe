/**
 * Database Migration CLI Command
 *
 * Provides commands for managing database schema migrations.
 *
 * @module cli/commands/migrate
 */

import { Command } from 'commander';
import chalk from 'chalk';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs-extra';
import { MigrationRunner, MigrationResult, MigrationStatus } from '../../../persistence/migrations';
import { allMigrations } from '../../../persistence/migrations/all-migrations';

interface MigrateOptions {
  verbose?: boolean;
  dryRun?: boolean;
  force?: boolean;
  dbPath?: string;
}

/**
 * Create the migrate command
 */
export function createMigrateCommand(): Command {
  const migrate = new Command('migrate')
    .description('Database schema migration commands')
    .addHelpText('after', `
Examples:
  ${chalk.cyan('aqe migrate status')}     - Show migration status
  ${chalk.cyan('aqe migrate run')}        - Run pending migrations
  ${chalk.cyan('aqe migrate rollback')}   - Rollback last migration
  ${chalk.cyan('aqe migrate reset')}      - Reset and rerun all migrations
    `);

  // Status command
  migrate
    .command('status')
    .description('Show current migration status')
    .option('--db-path <path>', 'Path to database file')
    .action(async (options: MigrateOptions) => {
      await showStatus(options);
    });

  // Run command
  migrate
    .command('run')
    .description('Run all pending migrations')
    .option('-v, --verbose', 'Show detailed output')
    .option('--dry-run', 'Show what would be migrated without running')
    .option('--db-path <path>', 'Path to database file')
    .action(async (options: MigrateOptions) => {
      await runMigrations(options);
    });

  // Rollback command
  migrate
    .command('rollback')
    .description('Rollback the last migration')
    .option('-v, --verbose', 'Show detailed output')
    .option('--db-path <path>', 'Path to database file')
    .action(async (options: MigrateOptions) => {
      await rollbackMigration(options);
    });

  // Reset command
  migrate
    .command('reset')
    .description('Drop all tables and rerun migrations (DANGEROUS)')
    .option('--force', 'Skip confirmation prompt')
    .option('--db-path <path>', 'Path to database file')
    .action(async (options: MigrateOptions) => {
      await resetMigrations(options);
    });

  return migrate;
}

/**
 * Get database path
 */
function getDbPath(options: MigrateOptions): string {
  return options.dbPath || path.join(process.cwd(), '.agentic-qe', 'memory.db');
}

/**
 * Ensure database exists
 */
function ensureDatabase(dbPath: string): Database.Database {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return new Database(dbPath);
}

/**
 * Show migration status
 */
async function showStatus(options: MigrateOptions): Promise<void> {
  const dbPath = getDbPath(options);

  console.log(chalk.blue('\n📊 Migration Status\n'));
  console.log(chalk.gray(`Database: ${dbPath}`));

  if (!fs.existsSync(dbPath)) {
    console.log(chalk.yellow('\n⚠ Database does not exist yet'));
    console.log(chalk.gray(`Run ${chalk.cyan('aqe init')} or ${chalk.cyan('aqe migrate run')} to create it`));
    return;
  }

  const db = new Database(dbPath);
  try {
    const runner = new MigrationRunner(db);
    runner.registerAll(allMigrations);

    const status = runner.getStatus();

    console.log(chalk.gray(`Current version: ${chalk.white(status.currentVersion)}`));
    console.log(chalk.gray(`Latest version:  ${chalk.white(status.latestVersion)}`));
    console.log('');

    if (status.pendingMigrations > 0) {
      console.log(chalk.yellow(`⚠ ${status.pendingMigrations} pending migration(s)`));

      const pending = runner.getPendingMigrations();
      console.log('');
      console.log(chalk.gray('Pending:'));
      for (const m of pending) {
        console.log(chalk.gray(`  ${m.version}. ${m.name} - ${m.description}`));
      }
    } else {
      console.log(chalk.green('✓ Database is up to date'));
    }

    if (status.appliedMigrations.length > 0) {
      console.log('');
      console.log(chalk.gray('Applied migrations:'));
      for (const m of status.appliedMigrations) {
        console.log(chalk.gray(`  ${m.version}. ${m.name} (${m.applied_at})`));
      }
    }
  } finally {
    db.close();
  }
}

/**
 * Run pending migrations
 */
async function runMigrations(options: MigrateOptions): Promise<void> {
  const dbPath = getDbPath(options);

  console.log(chalk.blue('\n🔄 Running Migrations\n'));
  console.log(chalk.gray(`Database: ${dbPath}`));

  const db = ensureDatabase(dbPath);
  try {
    const runner = new MigrationRunner(db);
    runner.registerAll(allMigrations);

    const pending = runner.getPendingMigrations();
    if (pending.length === 0) {
      console.log(chalk.green('\n✓ No pending migrations'));
      return;
    }

    console.log(chalk.gray(`\nFound ${pending.length} pending migration(s):`));
    for (const m of pending) {
      console.log(chalk.gray(`  ${m.version}. ${m.name}`));
    }

    if (options.dryRun) {
      console.log(chalk.yellow('\n[DRY RUN] No changes made'));
      return;
    }

    console.log('');

    const results = runner.runAll();
    let success = 0;
    let failed = 0;

    for (const result of results) {
      if (result.success) {
        console.log(chalk.green(`✓ ${result.version}. ${result.name}`) +
          chalk.gray(` (${result.duration}ms)`));
        success++;
      } else {
        console.log(chalk.red(`✗ ${result.version}. ${result.name}`));
        console.log(chalk.red(`  Error: ${result.error}`));
        failed++;
      }
    }

    console.log('');
    if (failed === 0) {
      console.log(chalk.green(`✓ ${success} migration(s) applied successfully`));
    } else {
      console.log(chalk.red(`✗ ${failed} migration(s) failed, ${success} succeeded`));
      process.exit(1);
    }
  } finally {
    db.close();
  }
}

/**
 * Rollback last migration
 */
async function rollbackMigration(options: MigrateOptions): Promise<void> {
  const dbPath = getDbPath(options);

  console.log(chalk.blue('\n⏪ Rolling Back Migration\n'));
  console.log(chalk.gray(`Database: ${dbPath}`));

  if (!fs.existsSync(dbPath)) {
    console.log(chalk.yellow('\n⚠ Database does not exist'));
    return;
  }

  const db = new Database(dbPath);
  try {
    const runner = new MigrationRunner(db);
    runner.registerAll(allMigrations);

    const currentVersion = runner.getCurrentVersion();
    if (currentVersion === 0) {
      console.log(chalk.yellow('\n⚠ No migrations to rollback'));
      return;
    }

    const result = runner.rollbackLast();
    if (!result) {
      console.log(chalk.yellow('\n⚠ No migrations to rollback'));
      return;
    }

    if (result.success) {
      console.log(chalk.green(`\n✓ Rolled back: ${result.version}. ${result.name}`));
    } else {
      console.log(chalk.red(`\n✗ Rollback failed: ${result.error}`));
      process.exit(1);
    }
  } finally {
    db.close();
  }
}

/**
 * Reset all migrations
 */
async function resetMigrations(options: MigrateOptions): Promise<void> {
  const dbPath = getDbPath(options);

  console.log(chalk.red('\n⚠️  DANGER: Reset Migrations\n'));
  console.log(chalk.gray(`Database: ${dbPath}`));
  console.log(chalk.red('\nThis will DROP ALL TABLES and recreate them.'));
  console.log(chalk.red('ALL DATA WILL BE LOST!\n'));

  if (!options.force) {
    console.log(chalk.yellow('Use --force to proceed'));
    return;
  }

  if (!fs.existsSync(dbPath)) {
    console.log(chalk.yellow('Database does not exist, nothing to reset'));
    return;
  }

  // Backup first
  const backupPath = dbPath + '.backup-' + Date.now();
  fs.copyFileSync(dbPath, backupPath);
  console.log(chalk.gray(`Backup created: ${backupPath}`));

  // Drop and recreate
  fs.unlinkSync(dbPath);
  console.log(chalk.gray('Database deleted'));

  // Run migrations
  await runMigrations({ ...options, verbose: true });
}

export default createMigrateCommand;
