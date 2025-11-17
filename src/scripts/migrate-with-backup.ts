#!/usr/bin/env node
/**
 * Database Migration with Integrated Backup System
 *
 * This script demonstrates how to safely perform database migrations
 * with automatic backup and restore capabilities.
 */

import { backupHelper } from './backup-helper';

interface MigrationOptions {
  skipBackup?: boolean;
  autoRestore?: boolean;
  verifyBackup?: boolean;
}

async function performDatabaseMigration(options: MigrationOptions = {}) {
  const {
    skipBackup = false,
    autoRestore = true,
    verifyBackup = true
  } = options;

  let backupTimestamp: string | undefined;

  try {
    console.log('🚀 Starting Database Migration');
    console.log('================================');
    console.log('');

    // Step 1: Create safety backup
    if (!skipBackup) {
      console.log('📦 Step 1: Creating pre-migration backup...');
      const backupResult = await backupHelper.createSafetyBackup('database-migration');

      if (!backupResult.success) {
        console.error('❌ Backup failed! Aborting migration.');
        console.error('Error:', backupResult.error);
        process.exit(1);
      }

      backupTimestamp = backupResult.timestamp;
      console.log(`✅ Backup created: ${backupTimestamp}`);
      console.log(`   Files: ${backupResult.files.length}`);
      console.log(`   Size: ${formatBytes(backupResult.totalSize)}`);
      console.log('');

      // Verify backup if requested
      if (verifyBackup) {
        console.log('🔍 Verifying backup integrity...');
        const isValid = await backupHelper.verifyBackup(backupTimestamp);

        if (!isValid) {
          console.error('❌ Backup verification failed! Aborting migration.');
          process.exit(1);
        }

        console.log('✅ Backup verified');
        console.log('');
      }
    } else {
      console.log('⚠️  Skipping backup (--skip-backup flag)');
      console.log('');
    }

    // Step 2: Perform migration
    console.log('🔄 Step 2: Performing migration...');
    await executeMigrationSteps();
    console.log('✅ Migration completed successfully');
    console.log('');

    // Step 3: Verify migration
    console.log('✅ Step 3: Verifying migration...');
    await verifyMigration();
    console.log('✅ Migration verification passed');
    console.log('');

    // Success!
    console.log('🎉 Migration Complete!');
    console.log('=====================');
    if (backupTimestamp) {
      console.log(`Safety backup: ${backupTimestamp}`);
      console.log(`To rollback: ./scripts/restore-databases.sh ${backupTimestamp} --force`);
    }

  } catch (error) {
    console.error('');
    console.error('❌ Migration Failed!');
    console.error('====================');
    console.error('Error:', error instanceof Error ? error.message : String(error));
    console.error('');

    // Automatic restore if enabled and backup exists
    if (autoRestore && backupTimestamp) {
      console.log('🔄 Auto-restore enabled. Restoring from backup...');
      try {
        const restoreResult = await backupHelper.restoreBackup(backupTimestamp, {
          verify: true,
          force: true
        });

        if (restoreResult.success) {
          console.log('✅ Database restored to pre-migration state');
          console.log(`   Files restored: ${restoreResult.filesRestored}`);
        } else {
          console.error('❌ Auto-restore failed!');
          console.error('Manual restore required:');
          console.error(`   ./scripts/restore-databases.sh ${backupTimestamp} --force`);
        }
      } catch (restoreError) {
        console.error('❌ Auto-restore failed with error:', restoreError);
        console.error('Manual restore required:');
        console.error(`   ./scripts/restore-databases.sh ${backupTimestamp} --force`);
      }
    } else if (backupTimestamp) {
      console.log('ℹ️  To restore manually:');
      console.log(`   ./scripts/restore-databases.sh ${backupTimestamp} --force`);
    }

    process.exit(1);
  }
}

/**
 * Execute actual migration steps
 * Replace this with your actual migration logic
 */
async function executeMigrationSteps(): Promise<void> {
  // Example migration steps:
  // 1. Update schema
  // 2. Migrate data
  // 3. Update indexes
  // 4. Clean up old data

  console.log('   - Updating schema...');
  await simulateStep(1000);

  console.log('   - Migrating data...');
  await simulateStep(2000);

  console.log('   - Creating indexes...');
  await simulateStep(1000);

  console.log('   - Cleaning up...');
  await simulateStep(500);
}

/**
 * Verify migration success
 */
async function verifyMigration(): Promise<void> {
  console.log('   - Checking schema integrity...');
  await simulateStep(500);

  console.log('   - Validating data...');
  await simulateStep(500);

  console.log('   - Testing queries...');
  await simulateStep(500);
}

/**
 * Simulate async step
 */
function simulateStep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  const options: MigrationOptions = {
    skipBackup: args.includes('--skip-backup'),
    autoRestore: !args.includes('--no-auto-restore'),
    verifyBackup: !args.includes('--no-verify')
  };

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Database Migration with Backup

Usage: node migrate-with-backup.js [options]

Options:
  --skip-backup        Skip pre-migration backup (dangerous!)
  --no-auto-restore    Disable automatic restore on failure
  --no-verify          Skip backup verification
  --help, -h           Show this help message

Examples:
  # Normal migration with backup
  node migrate-with-backup.js

  # Migration without verification (faster)
  node migrate-with-backup.js --no-verify

  # Migration without auto-restore
  node migrate-with-backup.js --no-auto-restore
    `);
    process.exit(0);
  }

  await performDatabaseMigration(options);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { performDatabaseMigration };
