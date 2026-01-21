#!/usr/bin/env node
/**
 * Database Schema Audit Script
 *
 * Examines all three database files to understand:
 * 1. How QE agents save memories (.agentic-qe/memory.db)
 * 2. How claude-flow agents save patterns (.swarm/memory.db)
 * 3. What happened to old database (.aqe/swarm.db)
 *
 * This will help us fix the schema mismatches in learning handlers.
 */

import BetterSqlite3 from 'better-sqlite3';
import * as fs from 'fs-extra';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

interface TableSchema {
  name: string;
  sql: string;
}

interface TableInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: any;
  pk: number;
}

function auditDatabase(dbPath: string, label: string): void {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 ${label}`);
  console.log(`📁 Path: ${dbPath}`);
  console.log('='.repeat(80));

  // Check if file exists
  if (!fs.existsSync(dbPath)) {
    console.log('❌ Database file does not exist');
    return;
  }

  const stats = fs.statSync(dbPath);
  console.log(`📏 Size: ${stats.size} bytes`);
  console.log(`📅 Modified: ${stats.mtime.toISOString()}\n`);

  let db: BetterSqlite3.Database | null = null;
  try {
    // Open database
    db = new BetterSqlite3(dbPath, { readonly: true });

    // Get all tables
    const tables = db.prepare(`
      SELECT name, sql
      FROM sqlite_master
      WHERE type='table'
      ORDER BY name
    `).all() as TableSchema[];

    if (tables.length === 0) {
      console.log('⚠️  No tables found in database');
      return;
    }

    console.log(`📋 Found ${tables.length} table(s):\n`);

    // Audit each table
    for (const table of tables) {
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`📄 Table: ${table.name}`);
      console.log('─'.repeat(80));

      // Show CREATE TABLE statement
      console.log('\n🔧 Schema:');
      console.log(table.sql);

      // Get column info
      const columns = db!.prepare(`PRAGMA table_info(${table.name})`).all() as TableInfo[];

      console.log('\n📊 Columns:');
      for (const col of columns) {
        const pk = col.pk ? ' PRIMARY KEY' : '';
        const notnull = col.notnull ? ' NOT NULL' : '';
        const dflt = col.dflt_value !== null ? ` DEFAULT ${col.dflt_value}` : '';
        console.log(`  • ${col.name}: ${col.type}${pk}${notnull}${dflt}`);
      }

      // Get row count
      const countResult = db!.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get() as { count: number };
      console.log(`\n📈 Row count: ${countResult.count}`);

      // Show sample data (first 3 rows)
      if (countResult.count > 0) {
        const sampleData = db!.prepare(`SELECT * FROM ${table.name} LIMIT 3`).all();
        console.log('\n🔍 Sample data (first 3 rows):');
        console.log(JSON.stringify(sampleData, null, 2));
      }

      // Get indexes
      const indexes = db!.prepare(`
        SELECT name, sql
        FROM sqlite_master
        WHERE type='index' AND tbl_name=?
        ORDER BY name
      `).all(table.name) as TableSchema[];

      if (indexes.length > 0) {
        console.log('\n🔑 Indexes:');
        for (const idx of indexes) {
          console.log(`  • ${idx.name}`);
          if (idx.sql) {
            console.log(`    ${idx.sql}`);
          }
        }
      }
    }

  } catch (error) {
    console.error('❌ Error reading database:', error);
  } finally {
    if (db) {
      db.close();
    }
  }
}

function main() {
  console.log('🔍 Database Schema Audit');
  console.log('========================\n');
  console.log('This script will examine all database files to understand:');
  console.log('1. How QE agents save memories');
  console.log('2. How claude-flow agents save patterns');
  console.log('3. Current schema vs handler expectations\n');

  // Database paths
  const databases = [
    {
      path: path.join(projectRoot, '.agentic-qe', 'memory.db'),
      label: 'QE Agents Memory Database (WORKING)'
    },
    {
      path: path.join(projectRoot, '.swarm', 'memory.db'),
      label: 'Claude-Flow Patterns Database (WORKING)'
    },
    {
      path: path.join(projectRoot, '.aqe', 'swarm.db'),
      label: 'Old Database (STOPPED WORKING)'
    }
  ];

  // Audit each database
  for (const db of databases) {
    auditDatabase(db.path, db.label);
  }

  // Summary
  console.log('\n\n' + '='.repeat(80));
  console.log('📋 SUMMARY & NEXT STEPS');
  console.log('='.repeat(80));
  console.log('\nKey Questions to Answer:');
  console.log('1. What columns exist in memory_entries table? (QE agents)');
  console.log('2. What columns exist in patterns table? (claude-flow)');
  console.log('3. Do learning_experiences, q_values, test_patterns tables exist?');
  console.log('4. What are the exact column names and types?');
  console.log('5. Are there any missing columns that handlers expect?');
  console.log('\nBased on this audit, we will:');
  console.log('• Update learning handlers to match actual schema');
  console.log('• Add missing columns if needed for learning/patterns');
  console.log('• Align parameter names between tools and handlers');
  console.log('• Test end-to-end learning persistence');
}

main();
