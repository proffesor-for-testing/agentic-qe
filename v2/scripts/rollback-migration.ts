#!/usr/bin/env tsx
/**
 * AgentDB Migration Rollback Script
 *
 * Restores database from backup and reverts migration changes.
 *
 * Features:
 * - Automatic backup detection
 * - Integrity verification
 * - Safe restoration
 * - Cleanup options
 *
 * Usage:
 *   npm run migrate:rollback                    # Use latest backup
 *   npm run migrate:rollback -- --backup-file=<path>  # Specific backup
 *   npm run migrate:rollback -- --cleanup       # Remove target after rollback
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import Database from 'better-sqlite3';
import chalk from 'chalk';

interface RollbackOptions {
  backupFile?: string;
  cleanup?: boolean;
  verbose?: boolean;
  targetDir?: string;
}

interface RollbackResult {
  success: boolean;
  backupRestored?: string;
  targetRemoved?: boolean;
  error?: string;
}

/**
 * Calculate SHA-256 checksum of a file
 */
function calculateChecksum(filePath: string): string {
  const data = fs.readFileSync(filePath);
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Verify database integrity
 */
function verifyDatabaseIntegrity(dbPath: string): boolean {
  const db = new Database(dbPath, { readonly: true });

  try {
    const result = db.pragma('integrity_check');
    return Array.isArray(result) && result.length === 1 && result[0].integrity_check === 'ok';
  } finally {
    db.close();
  }
}

/**
 * Find latest backup file
 */
function findLatestBackup(basePath: string): string | null {
  const backupPattern = `${basePath}.backup.`;
  const dir = path.dirname(basePath);
  const files = fs.readdirSync(dir);

  const backupFiles = files
    .filter(f => f.startsWith(path.basename(backupPattern)))
    .map(f => ({
      name: f,
      path: path.join(dir, f),
      timestamp: parseInt(f.split('.').pop() || '0')
    }))
    .sort((a, b) => b.timestamp - a.timestamp);

  return backupFiles.length > 0 ? backupFiles[0].path : null;
}

/**
 * Get database statistics
 */
function getDatabaseStats(dbPath: string): any {
  const db = new Database(dbPath, { readonly: true });

  try {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all() as Array<{ name: string }>;

    const stats: any = {
      tables: {},
      totalRecords: 0
    };

    for (const table of tables) {
      const countResult = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get() as { count: number };
      stats.tables[table.name] = countResult.count;
      stats.totalRecords += countResult.count;
    }

    return stats;
  } finally {
    db.close();
  }
}

/**
 * Main rollback function
 */
export async function rollbackMigration(options: RollbackOptions = {}): Promise<RollbackResult> {
  const {
    backupFile,
    cleanup = false,
    verbose = false,
    targetDir = '.agentic-qe'
  } = options;

  console.log(chalk.cyan('\n⏮️  Starting AgentDB Migration Rollback...\n'));

  try {
    // 1. Determine backup file to use
    let backupPath: string;

    if (backupFile) {
      backupPath = path.resolve(backupFile);
      if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup file not found: ${backupPath}`);
      }
      console.log(chalk.green(`✓ Using specified backup: ${backupPath}`));
    } else {
      // Find latest backup
      const sourcePath = path.join(process.cwd(), 'agentdb.db');
      const latestBackup = findLatestBackup(sourcePath);

      if (!latestBackup) {
        throw new Error('No backup files found. Cannot rollback.');
      }

      backupPath = latestBackup;
      console.log(chalk.green(`✓ Found latest backup: ${backupPath}`));
    }

    // 2. Verify backup integrity
    console.log(chalk.cyan('\n🔍 Verifying backup integrity...'));
    if (!verifyDatabaseIntegrity(backupPath)) {
      throw new Error('Backup database integrity check failed!');
    }
    console.log(chalk.green('✓ Backup integrity verified'));

    // 3. Get backup statistics
    if (verbose) {
      console.log(chalk.cyan('\n📊 Backup statistics:'));
      const stats = getDatabaseStats(backupPath);
      console.log(chalk.gray(`  Total records: ${stats.totalRecords}`));
      for (const [tableName, count] of Object.entries(stats.tables)) {
        console.log(chalk.gray(`  - ${tableName}: ${count}`));
      }
    }

    // 4. Restore backup to original location
    console.log(chalk.cyan('\n♻️  Restoring backup...'));
    const sourcePath = path.join(process.cwd(), 'agentdb.db');

    // Create safety backup of current state
    if (fs.existsSync(sourcePath)) {
      const safetyBackup = `${sourcePath}.pre-rollback.${Date.now()}`;
      fs.copyFileSync(sourcePath, safetyBackup);
      console.log(chalk.gray(`  Safety backup: ${safetyBackup}`));
    }

    // Restore from backup
    fs.copyFileSync(backupPath, sourcePath);
    console.log(chalk.green(`✓ Backup restored to: ${sourcePath}`));

    // 5. Verify restoration
    console.log(chalk.cyan('\n🔐 Verifying restoration...'));
    const backupChecksum = calculateChecksum(backupPath);
    const restoredChecksum = calculateChecksum(sourcePath);

    if (backupChecksum !== restoredChecksum) {
      throw new Error('Checksum mismatch after restoration!');
    }
    console.log(chalk.green('✓ Restoration verified'));

    // 6. Cleanup target directory if requested
    let targetRemoved = false;
    if (cleanup) {
      console.log(chalk.cyan('\n🧹 Cleaning up target directory...'));
      const targetPath = path.join(process.cwd(), targetDir, 'agentdb.db');

      if (fs.existsSync(targetPath)) {
        // Move to trash instead of deleting
        const trashPath = `${targetPath}.removed.${Date.now()}`;
        fs.renameSync(targetPath, trashPath);
        console.log(chalk.green(`✓ Target moved to: ${trashPath}`));
        targetRemoved = true;
      } else {
        console.log(chalk.gray('  No target database to remove'));
      }
    }

    // 7. Success summary
    console.log(chalk.green.bold('\n✅ Rollback Complete!\n'));
    console.log(chalk.gray('Summary:'));
    console.log(chalk.gray(`  Backup:     ${backupPath}`));
    console.log(chalk.gray(`  Restored:   ${sourcePath}`));
    console.log(chalk.gray(`  Checksum:   ${restoredChecksum}`));
    if (cleanup) {
      console.log(chalk.gray(`  Cleanup:    ${targetRemoved ? 'Yes' : 'No target found'}`));
    }

    return {
      success: true,
      backupRestored: backupPath,
      targetRemoved
    };

  } catch (error: any) {
    console.error(chalk.red('\n❌ Rollback failed:'), error.message);

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * CLI entry point
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: RollbackOptions = {
    cleanup: args.includes('--cleanup'),
    verbose: args.includes('--verbose') || args.includes('-v')
  };

  // Parse --backup-file argument
  const backupArg = args.find(arg => arg.startsWith('--backup-file='));
  if (backupArg) {
    options.backupFile = backupArg.split('=')[1];
  }

  rollbackMigration(options)
    .then((result) => {
      if (!result.success) {
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error(chalk.red('Fatal error:'), error);
      process.exit(1);
    });
}
