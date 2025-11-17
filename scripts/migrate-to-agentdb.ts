#!/usr/bin/env tsx
/**
 * AgentDB Migration Script
 *
 * Migrates agentdb.db to .agentic-qe/agentdb.db with full integrity verification.
 *
 * Features:
 * - SHA-256 checksum verification
 * - Dry-run mode (no actual changes)
 * - Automatic backup creation
 * - Schema v2.0 enhancements
 * - Progress reporting
 * - Rollback capability
 * - Error handling and recovery
 *
 * Usage:
 *   npm run migrate:agentdb              # Full migration
 *   npm run migrate:dry-run              # Preview changes
 *   npm run migrate:agentdb -- --no-backup  # Skip backup
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import Database from 'better-sqlite3';
import chalk from 'chalk';

interface MigrationOptions {
  dryRun?: boolean;
  backup?: boolean;
  verbose?: boolean;
  sourceDb?: string;
  targetDir?: string;
}

interface MigrationResult {
  success: boolean;
  dryRun?: boolean;
  episodesMigrated?: number;
  sourceChecksum?: string;
  targetChecksum?: string;
  backupPath?: string;
  duration?: number;
  error?: string;
}

interface SchemaInfo {
  tableName: string;
  sql: string;
}

/**
 * Calculate SHA-256 checksum of a file
 */
function calculateChecksum(filePath: string): string {
  const data = fs.readFileSync(filePath);
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Get database statistics
 */
function getDatabaseStats(dbPath: string): any {
  const db = new Database(dbPath, { readonly: true });

  try {
    // Get all tables
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all() as Array<{ name: string }>;

    const stats: any = {
      tables: {},
      totalRecords: 0
    };

    // Count records in each table
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
 * Apply schema v2.0 enhancements
 */
function applySchemaEnhancements(dbPath: string): void {
  const db = new Database(dbPath);

  try {
    // Begin transaction for atomic schema updates
    db.exec('BEGIN TRANSACTION');

    // 1. Add indexes for performance (if not exists)
    // Helper to check if table exists before creating indexes
    const createIndexIfTableExists = (indexSql: string, tableName: string) => {
      const tableExists = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name=?
      `).get(tableName) as { name: string } | undefined;

      if (tableExists) {
        db.exec(indexSql);
      }
    };

    // Episodes indexes
    createIndexIfTableExists('CREATE INDEX IF NOT EXISTS idx_episodes_session_id ON episodes(session_id)', 'episodes');
    createIndexIfTableExists('CREATE INDEX IF NOT EXISTS idx_episodes_task ON episodes(task)', 'episodes');
    createIndexIfTableExists('CREATE INDEX IF NOT EXISTS idx_episodes_created_at ON episodes(created_at)', 'episodes');
    createIndexIfTableExists('CREATE INDEX IF NOT EXISTS idx_episodes_success ON episodes(success)', 'episodes');
    createIndexIfTableExists('CREATE INDEX IF NOT EXISTS idx_episodes_reward ON episodes(reward)', 'episodes');

    // Patterns indexes (if table exists)
    createIndexIfTableExists('CREATE INDEX IF NOT EXISTS idx_patterns_type ON patterns(type)', 'patterns');
    createIndexIfTableExists('CREATE INDEX IF NOT EXISTS idx_patterns_domain ON patterns(domain)', 'patterns');
    createIndexIfTableExists('CREATE INDEX IF NOT EXISTS idx_patterns_created_at ON patterns(created_at)', 'patterns');

    // 2. Add metadata columns if they don't exist
    const addColumnsIfNotExist = (table: string, columns: Array<[string, string]>) => {
      // Check if table exists first
      const tableExists = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name=?
      `).get(table) as { name: string } | undefined;

      if (!tableExists) {
        return; // Skip if table doesn't exist
      }

      const existingColumns = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
      const existingColumnNames = new Set(existingColumns.map(c => c.name));

      for (const [columnName, columnDef] of columns) {
        if (!existingColumnNames.has(columnName)) {
          db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnName} ${columnDef}`);
        }
      }
    };

    // Add metadata columns to episodes table (if exists)
    addColumnsIfNotExist('episodes', [
      ['metadata', 'TEXT'],
      ['tags', 'TEXT'],
      ['version', 'TEXT DEFAULT "2.0"']
    ]);

    // Add metadata columns to patterns table (if exists)
    addColumnsIfNotExist('patterns', [
      ['metadata', 'TEXT'],
      ['tags', 'TEXT'],
      ['version', 'TEXT DEFAULT "2.0"']
    ]);

    // Add metadata columns to skills table (if exists)
    addColumnsIfNotExist('skills', [
      ['metadata', 'TEXT'],
      ['tags', 'TEXT'],
      ['version', 'TEXT DEFAULT "2.0"']
    ]);

    // Commit transaction first
    db.exec('COMMIT');

    // 3. Optimize database (outside transaction)
    db.exec('ANALYZE');
    db.exec('VACUUM');
  } catch (error) {
    // Rollback on error
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }
}

/**
 * Main migration function
 */
export async function migrateToAgentDB(options: MigrationOptions = {}): Promise<MigrationResult> {
  const startTime = Date.now();
  const {
    dryRun = false,
    backup = true,
    verbose = false,
    sourceDb = 'agentdb.db',
    targetDir = '.agentic-qe'
  } = options;

  console.log(chalk.cyan('\n🔄 Starting AgentDB Migration...\n'));

  try {
    // 1. Verify source database exists
    const sourcePath = path.join(process.cwd(), sourceDb);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source database not found: ${sourcePath}`);
    }
    console.log(chalk.green(`✓ Source database found: ${sourcePath}`));

    // 2. Calculate source checksum
    const sourceChecksum = calculateChecksum(sourcePath);
    if (verbose) {
      console.log(chalk.gray(`  Checksum: ${sourceChecksum}`));
    }

    // 3. Get source database statistics
    console.log(chalk.cyan('\n📊 Analyzing source database...'));
    const sourceStats = getDatabaseStats(sourcePath);
    console.log(chalk.green(`✓ Tables found: ${Object.keys(sourceStats.tables).length}`));

    for (const [tableName, count] of Object.entries(sourceStats.tables)) {
      console.log(chalk.gray(`  - ${tableName}: ${count} records`));
    }

    console.log(chalk.green(`✓ Total records: ${sourceStats.totalRecords}`));

    // 4. Verify source integrity
    console.log(chalk.cyan('\n🔍 Verifying source database integrity...'));
    if (!verifyDatabaseIntegrity(sourcePath)) {
      throw new Error('Source database integrity check failed!');
    }
    console.log(chalk.green('✓ Source integrity verified'));

    // 5. Dry run mode - stop here
    if (dryRun) {
      console.log(chalk.yellow('\n🔍 DRY RUN MODE - No changes will be made'));
      console.log(chalk.gray('\nMigration plan:'));
      console.log(chalk.gray(`  Source: ${sourcePath}`));
      console.log(chalk.gray(`  Target: ${path.join(process.cwd(), targetDir, 'agentdb.db')}`));
      console.log(chalk.gray(`  Records: ${sourceStats.totalRecords}`));
      console.log(chalk.gray(`  Backup: ${backup ? 'Yes' : 'No'}`));

      return {
        success: true,
        dryRun: true,
        episodesMigrated: sourceStats.totalRecords,
        sourceChecksum
      };
    }

    // 6. Create backup if requested
    let backupPath: string | undefined;
    if (backup) {
      console.log(chalk.cyan('\n💾 Creating backup...'));
      backupPath = `${sourcePath}.backup.${Date.now()}`;
      fs.copyFileSync(sourcePath, backupPath);
      console.log(chalk.green(`✓ Backup created: ${backupPath}`));
    }

    // 7. Create target directory
    console.log(chalk.cyan('\n📁 Creating target directory...'));
    const targetDirPath = path.join(process.cwd(), targetDir);
    fs.mkdirSync(targetDirPath, { recursive: true });
    console.log(chalk.green(`✓ Target directory: ${targetDirPath}`));

    // 8. Copy database to new location
    console.log(chalk.cyan('\n📋 Copying database...'));
    const targetPath = path.join(targetDirPath, 'agentdb.db');

    // Remove existing target if it exists
    if (fs.existsSync(targetPath)) {
      const existingBackup = `${targetPath}.old.${Date.now()}`;
      console.log(chalk.yellow(`⚠ Existing database found, backing up to: ${existingBackup}`));
      fs.copyFileSync(targetPath, existingBackup);
    }

    fs.copyFileSync(sourcePath, targetPath);
    console.log(chalk.green(`✓ Database copied to: ${targetPath}`));

    // 9. Verify copy integrity
    console.log(chalk.cyan('\n🔐 Verifying copy integrity...'));
    const targetChecksum = calculateChecksum(targetPath);

    if (sourceChecksum !== targetChecksum) {
      throw new Error('Checksum mismatch! Data corruption detected during copy.');
    }
    console.log(chalk.green('✓ Copy verified: checksums match'));

    if (verbose) {
      console.log(chalk.gray(`  Source:  ${sourceChecksum}`));
      console.log(chalk.gray(`  Target:  ${targetChecksum}`));
    }

    // 10. Apply schema v2.0 enhancements
    console.log(chalk.cyan('\n⚡ Applying schema enhancements...'));
    applySchemaEnhancements(targetPath);
    console.log(chalk.green('✓ Schema v2.0 enhancements applied'));

    // 11. Verify final integrity
    console.log(chalk.cyan('\n🔍 Verifying final database integrity...'));
    if (!verifyDatabaseIntegrity(targetPath)) {
      throw new Error('Target database integrity check failed!');
    }
    console.log(chalk.green('✓ Final integrity verified'));

    // 12. Get final statistics
    const targetStats = getDatabaseStats(targetPath);

    // 13. Verify record counts match
    if (sourceStats.totalRecords !== targetStats.totalRecords) {
      throw new Error(
        `Record count mismatch! Source: ${sourceStats.totalRecords}, Target: ${targetStats.totalRecords}`
      );
    }
    console.log(chalk.green(`✓ Record count verified: ${targetStats.totalRecords}`));

    // 14. Success summary
    const duration = Date.now() - startTime;
    console.log(chalk.green.bold('\n✅ Migration Complete!\n'));
    console.log(chalk.gray('Summary:'));
    console.log(chalk.gray(`  Source:     ${sourcePath}`));
    console.log(chalk.gray(`  Target:     ${targetPath}`));
    console.log(chalk.gray(`  Records:    ${targetStats.totalRecords}`));
    console.log(chalk.gray(`  Duration:   ${duration}ms`));
    if (backupPath) {
      console.log(chalk.gray(`  Backup:     ${backupPath}`));
    }
    console.log(chalk.gray(`  Checksum:   ${targetChecksum}`));

    return {
      success: true,
      episodesMigrated: targetStats.totalRecords,
      sourceChecksum,
      targetChecksum,
      backupPath,
      duration
    };

  } catch (error: any) {
    console.error(chalk.red('\n❌ Migration failed:'), error.message);

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
  const options: MigrationOptions = {
    dryRun: args.includes('--dry-run'),
    backup: !args.includes('--no-backup'),
    verbose: args.includes('--verbose') || args.includes('-v')
  };

  migrateToAgentDB(options)
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
