#!/usr/bin/env npx tsx
/**
 * Migration Script: memory.db → RuVector PostgreSQL
 *
 * Migrates learned patterns from SQLite (memory.db) to RuVector PostgreSQL
 * for self-learning with GNN, LoRA, and EWC++ features.
 *
 * Usage:
 *   npx tsx scripts/migrate-patterns-to-ruvector.ts [options]
 *
 * Options:
 *   --source <path>     Source database path (default: ~/.aqe/data/memory.db)
 *   --dry-run           Preview migration without making changes
 *   --batch-size <n>    Batch size for migration (default: 100)
 *   --verbose           Show detailed progress
 *   --force             Skip confirmation prompt
 *
 * Environment:
 *   RUVECTOR_HOST       RuVector PostgreSQL host (default: localhost)
 *   RUVECTOR_PORT       RuVector PostgreSQL port (default: 5432)
 *   RUVECTOR_DATABASE   Database name (default: ruvector_db)
 *   RUVECTOR_USER       Database user (default: ruvector)
 *   RUVECTOR_PASSWORD   Database password (default: ruvector)
 */

import { createDockerRuVectorAdapter, RuVectorPostgresAdapter } from '../src/providers/RuVectorPostgresAdapter';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

interface MigrationOptions {
  source: string;
  dryRun: boolean;
  batchSize: number;
  verbose: boolean;
  force: boolean;
}

interface PatternRecord {
  key: string;
  value: string;
  timestamp?: number;
}

interface MigrationStats {
  total: number;
  migrated: number;
  skipped: number;
  errors: number;
  duration: number;
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       RuVector Pattern Migration Tool (Phase 0.5.5)          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Validate source database
  if (!fs.existsSync(options.source)) {
    console.error(`❌ Source database not found: ${options.source}`);
    console.log('\nTip: Make sure you have run `aqe init` and have patterns stored.');
    process.exit(1);
  }

  console.log(`📂 Source: ${options.source}`);
  console.log(`🎯 Target: RuVector PostgreSQL`);
  console.log(`📦 Batch size: ${options.batchSize}`);
  console.log(`🔍 Mode: ${options.dryRun ? 'DRY RUN (no changes)' : 'LIVE MIGRATION'}\n`);

  // Open source database
  const sqlite = new Database(options.source, { readonly: true });

  // Count patterns
  const patternCount = countPatterns(sqlite);
  console.log(`📊 Found ${patternCount} patterns to migrate\n`);

  if (patternCount === 0) {
    console.log('✅ No patterns to migrate. Database is empty or has no pattern data.');
    sqlite.close();
    process.exit(0);
  }

  // Confirm migration
  if (!options.force && !options.dryRun) {
    const confirmed = await confirm(
      `Migrate ${patternCount} patterns to RuVector? (y/N): `
    );
    if (!confirmed) {
      console.log('Migration cancelled.');
      sqlite.close();
      process.exit(0);
    }
  }

  let adapter: RuVectorPostgresAdapter | null = null;

  try {
    // Initialize RuVector adapter (unless dry run)
    if (!options.dryRun) {
      console.log('🔌 Connecting to RuVector PostgreSQL...');
      adapter = createDockerRuVectorAdapter({
        host: process.env.RUVECTOR_HOST || 'localhost',
        port: parseInt(process.env.RUVECTOR_PORT || '5432'),
        database: process.env.RUVECTOR_DATABASE || 'ruvector_db',
        user: process.env.RUVECTOR_USER || 'ruvector',
        password: process.env.RUVECTOR_PASSWORD || 'ruvector',
        learningEnabled: true,
      });
      await adapter.initialize();

      const health = await adapter.healthCheck();
      if (health.status !== 'healthy') {
        throw new Error(`RuVector unhealthy: ${health.status}`);
      }
      console.log('✅ Connected to RuVector\n');
    }

    // Perform migration
    const stats = await migratePatterns(sqlite, adapter, options);

    // Print summary
    printSummary(stats, options.dryRun);

    // Force learning consolidation after migration
    if (!options.dryRun && adapter && stats.migrated > 0) {
      console.log('\n🧠 Triggering learning consolidation...');
      await adapter.forceLearn();
      console.log('✅ Learning consolidation complete');
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    sqlite.close();
    if (adapter) {
      await adapter.close();
    }
  }

  console.log('\n✅ Migration complete!');
  if (!options.dryRun) {
    console.log('\nNext steps:');
    console.log('  1. Verify migration: aqe ruvector status');
    console.log('  2. Check metrics: aqe ruvector metrics');
    console.log('  3. Enable in .env: AQE_RUVECTOR_ENABLED=true');
  }
}

function parseArgs(args: string[]): MigrationOptions {
  const options: MigrationOptions = {
    source: path.join(os.homedir(), '.aqe', 'data', 'memory.db'),
    dryRun: false,
    batchSize: 100,
    verbose: false,
    force: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source':
        options.source = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--batch-size':
        options.batchSize = parseInt(args[++i]) || 100;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Usage: npx tsx scripts/migrate-patterns-to-ruvector.ts [options]

Options:
  --source <path>     Source database path (default: ~/.aqe/data/memory.db)
  --dry-run           Preview migration without making changes
  --batch-size <n>    Batch size for migration (default: 100)
  --verbose           Show detailed progress
  --force             Skip confirmation prompt
  --help              Show this help message

Environment:
  RUVECTOR_HOST       RuVector PostgreSQL host (default: localhost)
  RUVECTOR_PORT       RuVector PostgreSQL port (default: 5432)
  RUVECTOR_DATABASE   Database name (default: ruvector_db)
  RUVECTOR_USER       Database user (default: ruvector)
  RUVECTOR_PASSWORD   Database password (default: ruvector)
`);
}

function countPatterns(db: Database.Database): number {
  try {
    // Check for patterns table
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND (name LIKE '%pattern%' OR name='memory')
    `).all() as { name: string }[];

    let total = 0;
    for (const table of tables) {
      if (table.name === 'memory') {
        // Count pattern keys in memory table
        const count = db.prepare(`
          SELECT COUNT(*) as count FROM memory
          WHERE key LIKE '%pattern%' OR key LIKE 'aqe/%'
        `).get() as { count: number };
        total += count.count;
      } else {
        // Count rows in pattern tables
        const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get() as { count: number };
        total += count.count;
      }
    }

    return total;
  } catch (error) {
    console.warn('Warning: Could not count patterns:', (error as Error).message);
    return 0;
  }
}

async function migratePatterns(
  db: Database.Database,
  adapter: RuVectorPostgresAdapter | null,
  options: MigrationOptions
): Promise<MigrationStats> {
  const startTime = Date.now();
  const stats: MigrationStats = {
    total: 0,
    migrated: 0,
    skipped: 0,
    errors: 0,
    duration: 0
  };

  try {
    // Get all pattern records from memory table
    const records = db.prepare(`
      SELECT key, value FROM memory
      WHERE key LIKE '%pattern%' OR key LIKE 'aqe/%'
      ORDER BY key
    `).all() as PatternRecord[];

    stats.total = records.length;
    let batch: PatternRecord[] = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      batch.push(record);

      // Process in batches
      if (batch.length >= options.batchSize || i === records.length - 1) {
        const batchStats = await migrateBatch(batch, adapter, options);
        stats.migrated += batchStats.migrated;
        stats.skipped += batchStats.skipped;
        stats.errors += batchStats.errors;

        // Progress update
        const progress = ((i + 1) / records.length * 100).toFixed(1);
        process.stdout.write(`\r📦 Progress: ${progress}% (${i + 1}/${records.length})`);

        batch = [];
      }
    }

    console.log(); // New line after progress
  } catch (error) {
    console.error('\nError reading patterns:', (error as Error).message);
    stats.errors++;
  }

  stats.duration = Date.now() - startTime;
  return stats;
}

async function migrateBatch(
  batch: PatternRecord[],
  adapter: RuVectorPostgresAdapter | null,
  options: MigrationOptions
): Promise<{ migrated: number; skipped: number; errors: number }> {
  const result = { migrated: 0, skipped: 0, errors: 0 };

  for (const record of batch) {
    try {
      // Parse the value
      const data = JSON.parse(record.value);

      // Check if it has embedding data
      if (!data.embedding || !Array.isArray(data.embedding)) {
        if (options.verbose) {
          console.log(`\n  ⏭️  Skipped (no embedding): ${record.key}`);
        }
        result.skipped++;
        continue;
      }

      // Validate embedding dimension
      if (data.embedding.length !== 768 && data.embedding.length !== 384) {
        if (options.verbose) {
          console.log(`\n  ⏭️  Skipped (invalid dimension ${data.embedding.length}): ${record.key}`);
        }
        result.skipped++;
        continue;
      }

      // Migrate to RuVector
      if (!options.dryRun && adapter) {
        await adapter.store({
          embedding: data.embedding,
          content: JSON.stringify(data.content || data),
          metadata: {
            migratedFrom: 'memory.db',
            originalKey: record.key,
            migratedAt: Date.now(),
            ...data.metadata
          }
        });
      }

      if (options.verbose) {
        console.log(`\n  ✅ Migrated: ${record.key}`);
      }
      result.migrated++;

    } catch (error) {
      if (options.verbose) {
        console.log(`\n  ❌ Error: ${record.key} - ${(error as Error).message}`);
      }
      result.errors++;
    }
  }

  return result;
}

function printSummary(stats: MigrationStats, dryRun: boolean) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                     Migration Summary                         ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Total patterns:    ${String(stats.total).padStart(8)}                            ║`);
  console.log(`║  Migrated:          ${String(stats.migrated).padStart(8)} ${dryRun ? '(dry run)' : ''}                     ║`);
  console.log(`║  Skipped:           ${String(stats.skipped).padStart(8)}                            ║`);
  console.log(`║  Errors:            ${String(stats.errors).padStart(8)}                            ║`);
  console.log(`║  Duration:          ${String(stats.duration + 'ms').padStart(8)}                            ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// Run migration
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
