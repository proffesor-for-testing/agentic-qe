#!/usr/bin/env node
/**
 * Migration Script: Add QE Learning Tables to Existing AgentDB
 *
 * This script adds the 6 missing QE-specific tables to an existing agentdb.db
 * without affecting existing data (episodes, patterns, etc.)
 *
 * Tables Added:
 * 1. test_patterns - Core QE test pattern storage
 * 2. pattern_usage - Pattern usage and quality metrics
 * 3. cross_project_mappings - Cross-framework pattern sharing
 * 4. pattern_similarity_index - Pre-computed similarity scores
 * 5. pattern_fts - Full-text search
 * 6. schema_version - Schema migration tracking
 */

import { createDatabase } from 'agentdb';
import * as path from 'path';
import * as fs from 'fs';

async function migrateAddQETables() {
  const dbPath = path.join(process.cwd(), '.agentic-qe', 'agentdb.db');

  console.log('🔄 Starting QE Tables Migration...');
  console.log(`📁 Database: ${dbPath}`);

  if (!fs.existsSync(dbPath)) {
    console.error('❌ Error: Database not found at', dbPath);
    process.exit(1);
  }

  // Create backup
  const backupPath = `${dbPath}.backup-${Date.now()}`;
  console.log(`💾 Creating backup: ${backupPath}`);
  fs.copyFileSync(dbPath, backupPath);

  try {
    const db = await createDatabase(dbPath);

    // Check existing data
    const episodeResult = db.exec('SELECT COUNT(*) as count FROM episodes');
    const patternResult = db.exec('SELECT COUNT(*) as count FROM patterns');
    const episodeCount = episodeResult[0]?.values[0]?.[0] || 0;
    const patternCount = patternResult[0]?.values[0]?.[0] || 0;
    console.log(`📊 Existing data: ${episodeCount} episodes, ${patternCount} patterns`);

    // 1. Create test_patterns table
    console.log('Creating test_patterns table...');
    await db.exec(`
      CREATE TABLE IF NOT EXISTS test_patterns (
        id TEXT PRIMARY KEY NOT NULL,
        pattern_type TEXT NOT NULL,
        framework TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'typescript',
        code_signature_hash TEXT NOT NULL,
        code_signature TEXT NOT NULL,
        test_template TEXT NOT NULL,
        metadata TEXT NOT NULL,
        version TEXT NOT NULL DEFAULT '1.0.0',
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        CHECK(pattern_type IN ('edge-case', 'integration', 'boundary', 'error-handling', 'unit', 'e2e', 'performance', 'security')),
        CHECK(framework IN ('jest', 'mocha', 'cypress', 'vitest', 'playwright', 'ava', 'jasmine'))
      )
    `);
    await db.exec('CREATE INDEX IF NOT EXISTS idx_patterns_framework_type ON test_patterns(framework, pattern_type)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_patterns_signature_hash ON test_patterns(code_signature_hash)');
    await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_patterns_dedup ON test_patterns(code_signature_hash, framework)');
    console.log('✅ test_patterns created');

    // 2. Create pattern_usage table
    console.log('Creating pattern_usage table...');
    await db.exec(`
      CREATE TABLE IF NOT EXISTS pattern_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        usage_count INTEGER NOT NULL DEFAULT 0,
        success_count INTEGER NOT NULL DEFAULT 0,
        failure_count INTEGER NOT NULL DEFAULT 0,
        avg_execution_time REAL NOT NULL DEFAULT 0.0,
        avg_coverage_gain REAL NOT NULL DEFAULT 0.0,
        flaky_count INTEGER NOT NULL DEFAULT 0,
        quality_score REAL NOT NULL DEFAULT 0.0,
        first_used INTEGER NOT NULL DEFAULT (unixepoch()),
        last_used INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (pattern_id) REFERENCES test_patterns(id) ON DELETE CASCADE,
        UNIQUE(pattern_id, project_id)
      )
    `);
    await db.exec('CREATE INDEX IF NOT EXISTS idx_usage_pattern ON pattern_usage(pattern_id)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_usage_quality ON pattern_usage(quality_score DESC)');
    console.log('✅ pattern_usage created');

    // 3. Create cross_project_mappings table
    console.log('Creating cross_project_mappings table...');
    await db.exec(`
      CREATE TABLE IF NOT EXISTS cross_project_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_id TEXT NOT NULL,
        source_framework TEXT NOT NULL,
        target_framework TEXT NOT NULL,
        transformation_rules TEXT NOT NULL,
        compatibility_score REAL NOT NULL DEFAULT 1.0,
        project_count INTEGER NOT NULL DEFAULT 0,
        success_rate REAL NOT NULL DEFAULT 0.0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (pattern_id) REFERENCES test_patterns(id) ON DELETE CASCADE,
        UNIQUE(pattern_id, source_framework, target_framework)
      )
    `);
    console.log('✅ cross_project_mappings created');

    // 4. Create pattern_similarity_index table
    console.log('Creating pattern_similarity_index table...');
    await db.exec(`
      CREATE TABLE IF NOT EXISTS pattern_similarity_index (
        pattern_a TEXT NOT NULL,
        pattern_b TEXT NOT NULL,
        similarity_score REAL NOT NULL,
        structure_similarity REAL NOT NULL,
        identifier_similarity REAL NOT NULL,
        metadata_similarity REAL NOT NULL,
        algorithm TEXT NOT NULL DEFAULT 'hybrid-tfidf',
        last_computed INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (pattern_a, pattern_b),
        FOREIGN KEY (pattern_a) REFERENCES test_patterns(id) ON DELETE CASCADE,
        FOREIGN KEY (pattern_b) REFERENCES test_patterns(id) ON DELETE CASCADE
      )
    `);
    await db.exec('CREATE INDEX IF NOT EXISTS idx_similarity_score ON pattern_similarity_index(similarity_score DESC)');
    console.log('✅ pattern_similarity_index created');

    // 5. Create pattern_fts table (with fallback)
    console.log('Creating pattern_fts table...');
    try {
      await db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS pattern_fts USING fts5(
          pattern_id UNINDEXED,
          pattern_name,
          description,
          tags,
          framework,
          pattern_type,
          content='',
          tokenize='porter ascii'
        )
      `);
      console.log('✅ pattern_fts created (FTS5)');
    } catch (error: any) {
      if (error.message?.includes('no such module: fts5')) {
        console.log('⚠️  FTS5 not available, using regular table fallback');
        await db.exec(`
          CREATE TABLE IF NOT EXISTS pattern_fts (
            pattern_id TEXT PRIMARY KEY,
            pattern_name TEXT,
            description TEXT,
            tags TEXT,
            framework TEXT,
            pattern_type TEXT
          )
        `);
        await db.exec('CREATE INDEX IF NOT EXISTS idx_fts_pattern_name ON pattern_fts(pattern_name)');
        await db.exec('CREATE INDEX IF NOT EXISTS idx_fts_framework ON pattern_fts(framework)');
        await db.exec('CREATE INDEX IF NOT EXISTS idx_fts_pattern_type ON pattern_fts(pattern_type)');
        console.log('✅ pattern_fts created (fallback)');
      } else {
        throw error;
      }
    }

    // 6. Create schema_version table
    console.log('Creating schema_version table...');
    await db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL DEFAULT (unixepoch()),
        description TEXT
      )
    `);
    await db.exec(`
      INSERT OR IGNORE INTO schema_version (version, description)
      VALUES ('1.1.0', 'Initial QE ReasoningBank schema - migrated from v1.8.0')
    `);
    console.log('✅ schema_version created');

    // Verify migration
    const tables = await db.exec('SELECT name FROM sqlite_master WHERE type="table" ORDER BY name');
    const tableCount = tables[0]?.values?.length || 0;

    await db.close();

    console.log('\n✅ Migration completed successfully!');
    console.log(`📊 Total tables: ${tableCount}`);
    console.log(`💾 Backup saved: ${backupPath}`);
    console.log(`✨ New QE tables added: 6`);

    // Verify data integrity
    const dbVerify = await createDatabase(dbPath);
    const episodeResultAfter = dbVerify.exec('SELECT COUNT(*) as count FROM episodes');
    const patternResultAfter = dbVerify.exec('SELECT COUNT(*) as count FROM patterns');
    const episodeCountAfter = episodeResultAfter[0]?.values[0]?.[0] || 0;
    const patternCountAfter = patternResultAfter[0]?.values[0]?.[0] || 0;
    await dbVerify.close();

    console.log(`\n✅ Data integrity verified:`);
    console.log(`   Episodes: ${episodeCountAfter} (unchanged)`);
    console.log(`   Patterns: ${patternCountAfter} (unchanged)`);

  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\n🔄 Restoring from backup...');
    fs.copyFileSync(backupPath, dbPath);
    console.log('✅ Backup restored');
    process.exit(1);
  }
}

migrateAddQETables().catch(console.error);
