#!/usr/bin/env node
/**
 * Pattern Migration CLI Tool
 *
 * Command-line interface for migrating test patterns from AgentDB to RuVector.
 *
 * Usage:
 *   npx tsx scripts/migrate-patterns.ts [options]
 *
 * Options:
 *   --source <path>      Source AgentDB database path (default: ./data/agentic-qe.db)
 *   --target <path>      Target RuVector path (default: ./data/patterns.ruvector)
 *   --dry-run            Validate without writing
 *   --batch-size <n>     Patterns per batch (default: 1000)
 *   --no-backup          Skip backup creation
 *   --dimension <n>      Embedding dimension (default: 384)
 *   --verbose            Enable verbose logging
 *   --status             Check migration status
 *   --rollback           Rollback last migration
 *
 * Examples:
 *   # Dry-run to validate source
 *   npx tsx scripts/migrate-patterns.ts --dry-run --verbose
 *
 *   # Migrate with custom paths
 *   npx tsx scripts/migrate-patterns.ts \
 *     --source ./data/old.db \
 *     --target ./data/new.ruvector \
 *     --verbose
 *
 *   # Check migration status
 *   npx tsx scripts/migrate-patterns.ts --status
 *
 *   # Rollback migration
 *   npx tsx scripts/migrate-patterns.ts --rollback
 *
 * @module scripts/migrate-patterns
 */

import {
  PatternMigrator,
  checkMigrationStatus,
  type MigrationOptions,
  type MigrationResult,
} from '../src/core/memory/MigrationTools';

interface CLIOptions {
  source: string;
  target: string;
  dryRun: boolean;
  batchSize: number;
  noBackup: boolean;
  dimension: number;
  verbose: boolean;
  status: boolean;
  rollback: boolean;
  help: boolean;
}

/**
 * Parse command-line arguments
 */
function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    source: './data/agentic-qe.db',
    target: './data/patterns.ruvector',
    dryRun: false,
    batchSize: 1000,
    noBackup: false,
    dimension: 384,
    verbose: false,
    status: false,
    rollback: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--source':
        options.source = args[++i];
        break;
      case '--target':
        options.target = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--batch-size':
        options.batchSize = parseInt(args[++i], 10);
        break;
      case '--no-backup':
        options.noBackup = true;
        break;
      case '--dimension':
        options.dimension = parseInt(args[++i], 10);
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--status':
        options.status = true;
        break;
      case '--rollback':
        options.rollback = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        options.help = true;
    }
  }

  return options;
}

/**
 * Display help message
 */
function showHelp(): void {
  console.log(`
Pattern Migration CLI Tool - AgentDB to RuVector Migration

Usage:
  npx tsx scripts/migrate-patterns.ts [options]

Options:
  --source <path>      Source AgentDB database path (default: ./data/agentic-qe.db)
  --target <path>      Target RuVector path (default: ./data/patterns.ruvector)
  --dry-run            Validate without writing to target
  --batch-size <n>     Patterns per batch (default: 1000)
  --no-backup          Skip backup creation
  --dimension <n>      Embedding dimension (default: 384)
  --verbose            Enable verbose logging
  --status             Check migration status
  --rollback           Rollback last migration
  --help, -h           Show this help message

Examples:
  # Dry-run to validate source database
  npx tsx scripts/migrate-patterns.ts --dry-run --verbose

  # Migrate with custom paths
  npx tsx scripts/migrate-patterns.ts \\
    --source ./data/old.db \\
    --target ./data/new.ruvector \\
    --batch-size 500 \\
    --verbose

  # Check migration status
  npx tsx scripts/migrate-patterns.ts --status --verbose

  # Rollback last migration
  npx tsx scripts/migrate-patterns.ts --rollback --verbose

Performance:
  - Batch processing: 1000 patterns per batch (configurable)
  - RuVector import: 2.7M+ ops/sec (native backend)
  - Search performance: 192K+ QPS (170x faster than baseline)

Safety:
  - Automatic backup creation (use --no-backup to disable)
  - Dry-run mode for validation
  - Rollback support for recovery
  - Integrity checks throughout migration

For more information, see docs/architecture/migration-guide.md
`);
}

/**
 * Display migration status
 */
async function displayStatus(source: string, target: string, verbose: boolean): Promise<void> {
  console.log('\n📊 Migration Status Check\n');
  console.log(`Source: ${source}`);
  console.log(`Target: ${target}\n`);

  try {
    const status = await checkMigrationStatus(source, target);

    console.log(`Source Patterns: ${status.sourceCount.toLocaleString()}`);
    console.log(`Target Patterns: ${status.targetCount.toLocaleString()}`);
    console.log(`Coverage: ${(status.coverage * 100).toFixed(2)}%`);
    console.log(`Status: ${status.migrationComplete ? '✅ COMPLETE' : '⚠️  IN PROGRESS'}\n`);

    if (!status.migrationComplete) {
      const remaining = status.sourceCount - status.targetCount;
      console.log(`⚠️  Migration incomplete: ${remaining} patterns remaining`);
    }

  } catch (error: any) {
    console.error(`\n❌ Status check failed: ${error.message}\n`);
    process.exit(1);
  }
}

/**
 * Display migration result summary
 */
function displayResult(result: MigrationResult): void {
  console.log('\n' + '='.repeat(60));
  console.log('Migration Summary');
  console.log('='.repeat(60) + '\n');

  console.log(`Total Patterns:    ${result.totalPatterns.toLocaleString()}`);
  console.log(`Migrated:          ${result.migratedCount.toLocaleString()}`);
  console.log(`Skipped:           ${result.skippedCount.toLocaleString()}`);
  console.log(`Errors:            ${result.errors.length}`);
  console.log(`Duration:          ${(result.duration / 1000).toFixed(2)}s`);

  if (result.backupPath) {
    console.log(`Backup:            ${result.backupPath}`);
  }

  if (result.validation) {
    console.log('\nValidation Results:');
    console.log(`  Source Valid:    ${result.validation.sourceValid ? '✅' : '❌'}`);
    console.log(`  Target Valid:    ${result.validation.targetValid ? '✅' : '❌'}`);

    if (result.validation.integrityChecks.length > 0) {
      console.log('\n  Integrity Checks:');
      result.validation.integrityChecks.forEach(check => {
        console.log(`    - ${check}`);
      });
    }
  }

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    result.errors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error}`);
    });
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  const options = parseArgs();

  // Show help
  if (options.help) {
    showHelp();
    process.exit(0);
  }

  // Check status
  if (options.status) {
    await displayStatus(options.source, options.target, options.verbose);
    process.exit(0);
  }

  // Create migrator
  const migrator = new PatternMigrator();

  // Rollback
  if (options.rollback) {
    console.log('\n🔄 Rolling back migration...\n');
    try {
      await migrator.rollback();
      console.log('✅ Rollback completed successfully\n');
      process.exit(0);
    } catch (error: any) {
      console.error(`❌ Rollback failed: ${error.message}\n`);
      process.exit(1);
    }
  }

  // Run migration
  console.log('\n🚀 Pattern Migration Tool\n');

  if (options.dryRun) {
    console.log('⚠️  DRY-RUN MODE: No data will be written\n');
  }

  console.log(`Source: ${options.source}`);
  console.log(`Target: ${options.target}`);
  console.log(`Batch Size: ${options.batchSize.toLocaleString()}`);
  console.log(`Dimension: ${options.dimension}`);
  console.log(`Backup: ${options.noBackup ? 'Disabled' : 'Enabled'}`);
  console.log(`Verbose: ${options.verbose ? 'Yes' : 'No'}\n`);

  try {
    // Configure migration options
    const migrationOptions: MigrationOptions = {
      sourcePath: options.source,
      targetPath: options.target,
      dryRun: options.dryRun,
      batchSize: options.batchSize,
      createBackup: !options.noBackup,
      dimension: options.dimension,
      verbose: options.verbose,
    };

    // Execute migration
    const result = await migrator.migrate(migrationOptions);

    // Display results
    displayResult(result);

    // Exit with appropriate code
    if (result.errors.length > 0) {
      console.log('⚠️  Migration completed with errors\n');
      process.exit(1);
    } else {
      console.log(`✅ Migration ${options.dryRun ? 'validation' : 'completed'} successfully\n`);
      process.exit(0);
    }

  } catch (error: any) {
    console.error(`\n❌ Migration failed: ${error.message}\n`);
    if (options.verbose && error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run main function
main().catch(error => {
  console.error('\n❌ Unexpected error:', error.message);
  process.exit(1);
});
