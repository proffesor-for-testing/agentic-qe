#!/usr/bin/env ts-node

/**
 * Database Migration: Add Learning Columns to Patterns Table
 *
 * This script adds the following columns to the patterns table:
 * - agent_id: To track which agent created the pattern
 * - domain: To categorize patterns by domain (e.g., "coverage-analysis")
 * - success_rate: To track how successful the pattern has been
 *
 * These columns are required by the learning_store_pattern MCP tool handler.
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

const DB_PATH = path.join(process.cwd(), '.agentic-qe/db/memory.db');

console.log('🔄 Patterns Table Migration');
console.log('============================\n');

// Check if database exists
if (!fs.existsSync(DB_PATH)) {
  console.error('❌ Database not found at:', DB_PATH);
  console.error('   Please initialize the database first.');
  process.exit(1);
}

const db = new Database(DB_PATH);

try {
  console.log('📊 Checking current patterns table schema...\n');

  // Get current schema
  const schema = db.prepare('PRAGMA table_info(patterns)').all() as Array<{
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: any;
    pk: number;
  }>;

  console.log('Current columns:');
  schema.forEach(col => {
    console.log(`  - ${col.name} (${col.type}${col.notnull ? ' NOT NULL' : ''})`);
  });

  // Check which columns are missing
  const hasAgentId = schema.some(col => col.name === 'agent_id');
  const hasDomain = schema.some(col => col.name === 'domain');
  const hasSuccessRate = schema.some(col => col.name === 'success_rate');

  console.log('\n📋 Migration Status:');
  console.log(`  - agent_id: ${hasAgentId ? '✅ exists' : '❌ missing'}`);
  console.log(`  - domain: ${hasDomain ? '✅ exists' : '❌ missing'}`);
  console.log(`  - success_rate: ${hasSuccessRate ? '✅ exists' : '❌ missing'}`);

  if (hasAgentId && hasDomain && hasSuccessRate) {
    console.log('\n✅ All columns already exist. No migration needed.');
    db.close();
    process.exit(0);
  }

  console.log('\n🔧 Adding missing columns...\n');

  // Start transaction
  db.prepare('BEGIN').run();

  let changes = 0;

  // Add agent_id column
  if (!hasAgentId) {
    console.log('  Adding agent_id column...');
    db.prepare(`
      ALTER TABLE patterns ADD COLUMN agent_id TEXT
    `).run();
    console.log('  ✅ agent_id added');
    changes++;
  }

  // Add domain column
  if (!hasDomain) {
    console.log('  Adding domain column...');
    db.prepare(`
      ALTER TABLE patterns ADD COLUMN domain TEXT DEFAULT 'general'
    `).run();
    console.log('  ✅ domain added');
    changes++;
  }

  // Add success_rate column
  if (!hasSuccessRate) {
    console.log('  Adding success_rate column...');
    db.prepare(`
      ALTER TABLE patterns ADD COLUMN success_rate REAL DEFAULT 1.0
    `).run();
    console.log('  ✅ success_rate added');
    changes++;
  }

  // Commit transaction
  db.prepare('COMMIT').run();

  console.log(`\n✅ Migration completed successfully! (${changes} columns added)\n`);

  // Show final schema
  console.log('📊 Final schema:');
  const finalSchema = db.prepare('PRAGMA table_info(patterns)').all() as Array<{
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: any;
    pk: number;
  }>;

  finalSchema.forEach(col => {
    const isNew =
      (col.name === 'agent_id' && !hasAgentId) ||
      (col.name === 'domain' && !hasDomain) ||
      (col.name === 'success_rate' && !hasSuccessRate);

    console.log(`  ${isNew ? '🆕' : '  '} ${col.name} (${col.type}${col.notnull ? ' NOT NULL' : ''}${col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ''})`);
  });

  console.log('\n📝 Notes:');
  console.log('  - agent_id: NULL for existing patterns (not tied to specific agent)');
  console.log('  - domain: "general" for existing patterns');
  console.log('  - success_rate: 1.0 for existing patterns (100% success assumed)');

} catch (error) {
  console.error('\n❌ Migration failed:', (error as Error).message);
  console.error('\n   Rolling back changes...');
  try {
    db.prepare('ROLLBACK').run();
    console.error('   ✅ Rollback successful');
  } catch (rollbackError) {
    console.error('   ❌ Rollback failed:', (rollbackError as Error).message);
  }
  db.close();
  process.exit(1);
}

db.close();

console.log('\n🎉 Migration complete!\n');
console.log('Next steps:');
console.log('  1. Rebuild the project: npm run build');
console.log('  2. Test pattern storage: Test learning_store_pattern MCP tool');
console.log('  3. Test pattern query: Test learning_query with queryType="patterns"');
