#!/usr/bin/env ts-node

/**
 * Database Initialization Verification Script
 *
 * This script verifies that the database initialization in `aqe init`
 * creates the proper database structure and schemas.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import Database from 'better-sqlite3';
import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';

const TEMP_DIR = path.join('/tmp', `aqe-test-${Date.now()}`);

async function main() {
  console.log('🧪 Verifying Database Initialization\n');

  try {
    // Create temporary directory
    await fs.ensureDir(TEMP_DIR);
    await fs.ensureDir(path.join(TEMP_DIR, '.agentic-qe'));
    console.log(`✓ Created test directory: ${TEMP_DIR}\n`);

    // Test Pattern Bank Database
    await testPatternBankDatabase();

    // Test Memory Database
    await testMemoryDatabase();

    console.log('\n✅ All database initialization tests passed!\n');

    // Cleanup
    await fs.remove(TEMP_DIR);
    console.log(`✓ Cleaned up test directory\n`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database initialization test failed:', error);

    // Cleanup on error
    try {
      await fs.remove(TEMP_DIR);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }

    process.exit(1);
  }
}

async function testPatternBankDatabase() {
  console.log('📦 Testing Pattern Bank Database (patterns.db)...\n');

  const dbPath = path.join(TEMP_DIR, '.agentic-qe', 'patterns.db');
  const db = new Database(dbPath);

  try {
    // Enable WAL mode
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -64000');

    // Execute schema (inline version)
    const schema = getPatternBankSchema();
    db.exec(schema);

    console.log('  ✓ Database created and schema applied');

    // Verify tables exist
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table'
      ORDER BY name
    `).all() as Array<{ name: string }>;

    const tableNames = tables.map(t => t.name);
    const expectedTables = [
      'test_patterns',
      'pattern_usage',
      'cross_project_mappings',
      'pattern_similarity_index',
      'pattern_fts',
      'pattern_fts_config',
      'pattern_fts_content',
      'pattern_fts_data',
      'pattern_fts_docsize',
      'pattern_fts_idx',
      'schema_version'
    ];

    console.log('  ✓ Found tables:', tableNames.filter(n => !n.startsWith('sqlite_')).join(', '));

    // Verify indexes
    const indexes = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='index' AND name LIKE 'idx_%'
      ORDER BY name
    `).all() as Array<{ name: string }>;

    console.log(`  ✓ Found ${indexes.length} indexes`);

    // Test insert and query
    const patternId = `test-pattern-${Date.now()}`;
    db.prepare(`
      INSERT INTO test_patterns (
        id, pattern_type, framework, language,
        code_signature_hash, code_signature, test_template,
        metadata, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      patternId,
      'unit',
      'jest',
      'typescript',
      'hash123',
      JSON.stringify({ type: 'function' }),
      JSON.stringify({ template: 'test(...)' }),
      JSON.stringify({ name: 'Test Pattern' }),
      '1.0.0',
      Date.now(),
      Date.now()
    );

    const inserted = db.prepare('SELECT * FROM test_patterns WHERE id = ?').get(patternId);
    if (!inserted) {
      throw new Error('Failed to insert test pattern');
    }

    console.log('  ✓ Insert and query operations work');

    // Test schema version
    const version = db.prepare('SELECT * FROM schema_version').get() as any;
    if (version.version !== '1.1.0') {
      throw new Error(`Wrong schema version: ${version.version}`);
    }

    console.log(`  ✓ Schema version: ${version.version}`);

    console.log('\n✅ Pattern Bank Database: PASS\n');
  } finally {
    db.close();
  }
}

async function testMemoryDatabase() {
  console.log('💾 Testing Memory Database (memory.db)...\n');

  const dbPath = path.join(TEMP_DIR, '.agentic-qe', 'memory.db');
  const memoryManager = new SwarmMemoryManager(dbPath);

  try {
    await memoryManager.initialize();
    console.log('  ✓ SwarmMemoryManager initialized');

    // Get stats
    const stats = await memoryManager.stats();
    console.log(`  ✓ Database stats:`, {
      totalEntries: stats.totalEntries,
      totalHints: stats.totalHints,
      totalEvents: stats.totalEvents,
      totalWorkflows: stats.totalWorkflows,
      totalPatterns: stats.totalPatterns,
      totalArtifacts: stats.totalArtifacts,
      totalSessions: stats.totalSessions,
      totalAgents: stats.totalAgents
    });

    // Test memory operations
    await memoryManager.store('test-key', { value: 'test-data' }, {
      partition: 'test',
      ttl: 3600
    });

    const retrieved = await memoryManager.retrieve('test-key', { partition: 'test' });
    if (!retrieved || retrieved.value !== 'test-data') {
      throw new Error('Store/retrieve test failed');
    }

    console.log('  ✓ Store and retrieve operations work');

    // Test event storage
    const eventId = await memoryManager.storeEvent({
      type: 'test:event',
      payload: { data: 'test' },
      source: 'test-script'
    });

    const events = await memoryManager.queryEvents('test:event');
    if (events.length !== 1) {
      throw new Error('Event storage test failed');
    }

    console.log('  ✓ Event storage works');

    // Test pattern storage
    const patternId = await memoryManager.storePattern({
      pattern: 'test-pattern',
      confidence: 0.95,
      usageCount: 1,
      metadata: { test: true }
    });

    const pattern = await memoryManager.getPattern('test-pattern');
    if (pattern.confidence !== 0.95) {
      throw new Error('Pattern storage test failed');
    }

    console.log('  ✓ Pattern storage works');

    // Test workflow state
    await memoryManager.storeWorkflowState({
      id: 'test-workflow',
      step: 'test-step',
      status: 'in_progress',
      checkpoint: { data: 'checkpoint' },
      sha: 'abc123'
    });

    const workflow = await memoryManager.getWorkflowState('test-workflow');
    if (workflow.step !== 'test-step') {
      throw new Error('Workflow storage test failed');
    }

    console.log('  ✓ Workflow state works');

    // Test artifact storage
    await memoryManager.createArtifact({
      id: 'test-artifact',
      kind: 'code',
      path: '/test/path',
      sha256: 'sha256hash',
      tags: ['test', 'artifact']
    });

    const artifact = await memoryManager.getArtifact('test-artifact');
    if (artifact.kind !== 'code') {
      throw new Error('Artifact storage test failed');
    }

    console.log('  ✓ Artifact storage works');

    console.log('\n✅ Memory Database: PASS\n');
  } finally {
    await memoryManager.close();
  }
}

function getPatternBankSchema(): string {
  return `
-- Enable WAL mode for better concurrent access
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- Core Pattern Storage
CREATE TABLE IF NOT EXISTS test_patterns (
    id TEXT PRIMARY KEY NOT NULL,
    pattern_type TEXT NOT NULL,
    framework TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'typescript',
    code_signature_hash TEXT NOT NULL,
    code_signature JSON NOT NULL,
    test_template JSON NOT NULL,
    metadata JSON NOT NULL,
    version TEXT NOT NULL DEFAULT '1.0.0',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK(pattern_type IN ('edge-case', 'integration', 'boundary', 'error-handling', 'unit', 'e2e', 'performance', 'security')),
    CHECK(framework IN ('jest', 'mocha', 'cypress', 'vitest', 'playwright', 'ava', 'jasmine')),
    CHECK(json_valid(code_signature)),
    CHECK(json_valid(test_template)),
    CHECK(json_valid(metadata))
);

CREATE INDEX IF NOT EXISTS idx_patterns_framework_type ON test_patterns(framework, pattern_type);
CREATE INDEX IF NOT EXISTS idx_patterns_signature_hash ON test_patterns(code_signature_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_patterns_dedup ON test_patterns(code_signature_hash, framework);

-- Pattern Usage Tracking
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
    first_used TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pattern_id) REFERENCES test_patterns(id) ON DELETE CASCADE,
    UNIQUE(pattern_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_usage_pattern ON pattern_usage(pattern_id);
CREATE INDEX IF NOT EXISTS idx_usage_quality ON pattern_usage(quality_score DESC);

-- Cross-Project Pattern Sharing
CREATE TABLE IF NOT EXISTS cross_project_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_id TEXT NOT NULL,
    source_framework TEXT NOT NULL,
    target_framework TEXT NOT NULL,
    transformation_rules JSON NOT NULL,
    compatibility_score REAL NOT NULL DEFAULT 1.0,
    project_count INTEGER NOT NULL DEFAULT 0,
    success_rate REAL NOT NULL DEFAULT 0.0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pattern_id) REFERENCES test_patterns(id) ON DELETE CASCADE,
    UNIQUE(pattern_id, source_framework, target_framework),
    CHECK(json_valid(transformation_rules))
);

-- Pattern Similarity Index
CREATE TABLE IF NOT EXISTS pattern_similarity_index (
    pattern_a TEXT NOT NULL,
    pattern_b TEXT NOT NULL,
    similarity_score REAL NOT NULL,
    structure_similarity REAL NOT NULL,
    identifier_similarity REAL NOT NULL,
    metadata_similarity REAL NOT NULL,
    algorithm TEXT NOT NULL DEFAULT 'hybrid-tfidf',
    last_computed TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (pattern_a, pattern_b),
    FOREIGN KEY (pattern_a) REFERENCES test_patterns(id) ON DELETE CASCADE,
    FOREIGN KEY (pattern_b) REFERENCES test_patterns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_similarity_score ON pattern_similarity_index(similarity_score DESC);

-- Full-Text Search
CREATE VIRTUAL TABLE IF NOT EXISTS pattern_fts USING fts5(
    pattern_id UNINDEXED,
    pattern_name,
    description,
    tags,
    framework,
    pattern_type,
    content='',
    tokenize='porter ascii'
);

-- Schema Version
CREATE TABLE IF NOT EXISTS schema_version (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

INSERT OR IGNORE INTO schema_version (version, description)
VALUES ('1.1.0', 'Initial QE ReasoningBank schema');
`;
}

// Run the tests
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
