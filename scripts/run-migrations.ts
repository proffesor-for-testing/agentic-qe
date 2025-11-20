#!/usr/bin/env node
/**
 * Migration Runner
 * Issue: #57 - Execute all pending database migrations
 *
 * Usage:
 *   npx ts-node scripts/run-migrations.ts
 *   npm run migrate
 *
 * This script runs all migrations in order:
 * 1. add-pattern-agent-id - Adds agent_id column to patterns table
 * 2. add-pattern-agent-indexes - Creates composite indexes
 */

import * as path from 'path';
import * as fs from 'fs-extra';

interface MigrationModule {
  runMigration: () => Promise<{ success: boolean; errors: string[] }>;
}

interface MigrationInfo {
  name: string;
  path: string;
  description: string;
}

const MIGRATIONS: MigrationInfo[] = [
  {
    name: 'add-pattern-agent-id',
    path: './migrations/add-pattern-agent-id.ts',
    description: 'Add agent_id column to patterns table for O(log n) queries'
  }
];

async function runAllMigrations(): Promise<void> {
  console.log('🚀 AQE Migration Runner\n');
  console.log('='.repeat(60));

  const dbPath = path.resolve(process.cwd(), '.agentic-qe/agentdb.db');

  if (!fs.existsSync(dbPath)) {
    console.error(`❌ Database not found at ${dbPath}`);
    console.error('   Run "aqe init" first to create the database.\n');
    process.exit(1);
  }

  console.log(`📂 Database: ${dbPath}\n`);

  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  for (const migration of MIGRATIONS) {
    console.log(`\n📦 Running migration: ${migration.name}`);
    console.log(`   ${migration.description}`);
    console.log('-'.repeat(60));

    try {
      const migrationPath = path.resolve(__dirname, migration.path);

      if (!fs.existsSync(migrationPath)) {
        throw new Error(`Migration file not found: ${migrationPath}`);
      }

      // Dynamic import of migration module
      const migrationModule: MigrationModule = await import(migrationPath);
      const result = await migrationModule.runMigration();

      if (result.success) {
        console.log(`✅ Migration ${migration.name} completed successfully`);
        successCount++;
      } else {
        console.error(`❌ Migration ${migration.name} failed`);
        failCount++;
        errors.push(...result.errors);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Migration ${migration.name} failed: ${errorMsg}`);
      failCount++;
      errors.push(`${migration.name}: ${errorMsg}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 Migration Summary');
  console.log('='.repeat(60));
  console.log(`Total migrations: ${MIGRATIONS.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${failCount}`);

  if (errors.length > 0) {
    console.log('\n⚠️  Errors:');
    errors.forEach((err, i) => {
      console.log(`  ${i + 1}. ${err}`);
    });
  }

  console.log('='.repeat(60));

  if (failCount > 0) {
    process.exit(1);
  }

  console.log('\n✅ All migrations completed successfully!\n');
  console.log('Next steps:');
  console.log('  1. Run "npm run test:unit" to verify no regressions');
  console.log('  2. Run performance benchmarks to validate improvements');
  console.log('  3. Check EXPLAIN QUERY PLAN shows index usage\n');
}

// Run if executed directly
if (require.main === module) {
  runAllMigrations().catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}

export { runAllMigrations };
