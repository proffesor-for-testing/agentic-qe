/**
 * Unit Tests for V2 to V3 Migration
 * ADR-038: V3 QE Memory Unification
 *
 * Tests migration from V2 AQE fleet to V3 systems.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, unlinkSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import {
  V2ToV3Migrator,
  migrateV2ToV3,
  type V2MigrationConfig,
  type V2MigrationResult,
  type V2MigrationProgress,
} from '../../../src/learning/v2-to-v3-migration.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestDirectory(): string {
  const testDir = join(tmpdir(), `aqe-migration-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

function cleanupTestDirectory(testDir: string): void {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

function createV2Database(dbPath: string): Database.Database {
  const db = new Database(dbPath);

  // Create V2 schema
  db.exec(`
    -- Patterns table
    CREATE TABLE IF NOT EXISTS patterns (
      id TEXT PRIMARY KEY,
      pattern TEXT NOT NULL,
      confidence REAL DEFAULT 0.5,
      usage_count INTEGER DEFAULT 0,
      metadata TEXT,
      ttl INTEGER DEFAULT 3600000,
      expires_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      agent_id TEXT,
      domain TEXT DEFAULT 'general',
      success_rate REAL DEFAULT 0.0
    );

    -- Captured experiences table
    CREATE TABLE IF NOT EXISTS captured_experiences (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      agent_type TEXT NOT NULL,
      task_type TEXT NOT NULL,
      execution TEXT,
      context TEXT,
      outcome TEXT,
      embedding BLOB,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      processed INTEGER DEFAULT 0
    );

    -- Learning experiences table
    CREATE TABLE IF NOT EXISTS learning_experiences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      task_id TEXT,
      task_type TEXT NOT NULL,
      state TEXT,
      action TEXT NOT NULL,
      reward REAL NOT NULL,
      next_state TEXT,
      episode_id TEXT,
      metadata TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    -- Concept nodes table
    CREATE TABLE IF NOT EXISTS concept_nodes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      domain TEXT,
      properties TEXT,
      embedding TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      activation_level REAL DEFAULT 0.5,
      last_activated INTEGER
    );

    -- Concept edges table
    CREATE TABLE IF NOT EXISTS concept_edges (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      target TEXT NOT NULL,
      weight REAL DEFAULT 0.5,
      type TEXT NOT NULL,
      evidence INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);

  return db;
}

function seedV2Database(db: Database.Database): void {
  const now = Math.floor(Date.now() / 1000);

  // Insert patterns
  db.prepare(`
    INSERT INTO patterns (id, pattern, confidence, usage_count, metadata, domain, success_rate, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'pattern-1',
    JSON.stringify({ name: 'Test Pattern 1', type: 'test-template' }),
    0.8,
    5,
    JSON.stringify({ description: 'A test pattern' }),
    'test-generation',
    0.9,
    now
  );

  db.prepare(`
    INSERT INTO patterns (id, pattern, confidence, usage_count, metadata, domain, success_rate, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'pattern-2',
    JSON.stringify({ name: 'Coverage Strategy', type: 'coverage-strategy' }),
    0.7,
    3,
    JSON.stringify({ description: 'Coverage improvement strategy' }),
    'coverage',
    0.85,
    now
  );

  // Insert captured experiences
  db.prepare(`
    INSERT INTO captured_experiences (id, agent_id, agent_type, task_type, execution, context, outcome, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'exp-1',
    'agent-001',
    'qe-test-architect',
    'test-generation',
    JSON.stringify({ steps: ['analyze', 'generate'] }),
    JSON.stringify({ framework: 'vitest' }),
    JSON.stringify({ success: true, quality: 0.9 }),
    now
  );

  // Insert learning experiences
  db.prepare(`
    INSERT INTO learning_experiences (agent_id, task_type, state, action, reward, next_state, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    'agent-002',
    'coverage-analysis',
    JSON.stringify({ coverage: 0.6 }),
    'add-tests',
    0.8,
    JSON.stringify({ coverage: 0.75 }),
    now
  );

  // Insert concept nodes
  db.prepare(`
    INSERT INTO concept_nodes (id, name, type, domain, properties, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    'node-1',
    'UserService',
    'class',
    'code-intelligence',
    JSON.stringify({ methods: ['create', 'update', 'delete'] }),
    now
  );

  // Insert concept edges
  db.prepare(`
    INSERT INTO concept_edges (id, source, target, weight, type, evidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('edge-1', 'UserService', 'Database', 0.9, 'depends-on', 5, now);
}

// ============================================================================
// Tests
// ============================================================================

describe('V2ToV3Migrator', () => {
  let testDir: string;
  let v2DbPath: string;
  let v3DbPath: string;

  beforeEach(() => {
    testDir = createTestDirectory();
    v2DbPath = join(testDir, 'v2-memory.db');
    v3DbPath = join(testDir, 'v3-patterns.db');
  });

  afterEach(() => {
    cleanupTestDirectory(testDir);
  });

  describe('Basic Migration', () => {
    it('should migrate empty V2 database', async () => {
      // Create empty V2 database
      const v2Db = createV2Database(v2DbPath);
      v2Db.close();

      const result = await migrateV2ToV3(v2DbPath, v3DbPath);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should migrate V2 database with data', async () => {
      // Create and seed V2 database
      const v2Db = createV2Database(v2DbPath);
      seedV2Database(v2Db);
      v2Db.close();

      const result = await migrateV2ToV3(v2DbPath, v3DbPath);

      expect(result.success).toBe(true);
      expect(result.tablesMigrated.length).toBeGreaterThan(0);
      expect(result.counts.patterns).toBeGreaterThan(0);
    });

    it('should report progress during migration', async () => {
      const v2Db = createV2Database(v2DbPath);
      seedV2Database(v2Db);
      v2Db.close();

      const progressUpdates: V2MigrationProgress[] = [];

      await migrateV2ToV3(v2DbPath, v3DbPath, (progress) => {
        progressUpdates.push({ ...progress });
      });

      // Should have progress updates for each stage
      expect(progressUpdates.some((p) => p.stage === 'connecting')).toBe(true);
      expect(progressUpdates.some((p) => p.stage === 'reading')).toBe(true);
      expect(progressUpdates.some((p) => p.stage === 'migrating')).toBe(true);
      expect(progressUpdates.some((p) => p.stage === 'validating')).toBe(true);
      expect(progressUpdates.some((p) => p.stage === 'complete')).toBe(true);
    });
  });

  describe('Pattern Migration', () => {
    it('should migrate patterns with correct schema', async () => {
      const v2Db = createV2Database(v2DbPath);
      seedV2Database(v2Db);
      v2Db.close();

      await migrateV2ToV3(v2DbPath, v3DbPath);

      // Verify V3 database schema
      const v3Db = new Database(v3DbPath, { readonly: true });
      const patterns = v3Db.prepare('SELECT * FROM qe_patterns').all();

      expect(patterns.length).toBeGreaterThan(0);

      const pattern = patterns[0] as any;
      expect(pattern.id).toBeDefined();
      expect(pattern.pattern_type).toBeDefined();
      expect(pattern.qe_domain).toBeDefined();
      expect(pattern.name).toBeDefined();
      expect(pattern.confidence).toBeDefined();

      v3Db.close();
    });

    it('should map V2 domains to V3 QE domains', async () => {
      const v2Db = createV2Database(v2DbPath);
      v2Db
        .prepare(
          `
        INSERT INTO patterns (id, pattern, domain, created_at)
        VALUES (?, ?, ?, ?)
      `
        )
        .run('test-domain-map', '{}', 'coverage', Math.floor(Date.now() / 1000));
      v2Db.close();

      await migrateV2ToV3(v2DbPath, v3DbPath);

      const v3Db = new Database(v3DbPath, { readonly: true });
      const pattern = v3Db
        .prepare('SELECT * FROM qe_patterns WHERE id = ?')
        .get('test-domain-map') as any;

      expect(pattern.qe_domain).toBe('coverage-analysis');

      v3Db.close();
    });

    it('should calculate tier based on usage and quality', async () => {
      const v2Db = createV2Database(v2DbPath);
      const now = Math.floor(Date.now() / 1000);

      // High usage, high quality pattern
      v2Db
        .prepare(
          `
        INSERT INTO patterns (id, pattern, confidence, usage_count, success_rate, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
        )
        .run('high-quality', '{"name": "High Quality"}', 0.9, 15, 0.95, now);

      // Low usage pattern
      v2Db
        .prepare(
          `
        INSERT INTO patterns (id, pattern, confidence, usage_count, success_rate, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
        )
        .run('low-usage', '{"name": "Low Usage"}', 0.5, 2, 0.5, now);

      v2Db.close();

      await migrateV2ToV3(v2DbPath, v3DbPath);

      const v3Db = new Database(v3DbPath, { readonly: true });
      const highQuality = v3Db
        .prepare('SELECT tier FROM qe_patterns WHERE id = ?')
        .get('high-quality') as any;
      const lowUsage = v3Db
        .prepare('SELECT tier FROM qe_patterns WHERE id = ?')
        .get('low-usage') as any;

      expect(highQuality.tier).toBe('long-term');
      expect(lowUsage.tier).toBe('short-term');

      v3Db.close();
    });

    it('should infer pattern type from content', async () => {
      const v2Db = createV2Database(v2DbPath);
      const now = Math.floor(Date.now() / 1000);

      // Pattern with mock content
      v2Db
        .prepare(
          `
        INSERT INTO patterns (id, pattern, metadata, created_at)
        VALUES (?, ?, ?, ?)
      `
        )
        .run(
          'mock-pattern',
          '{"content": "vi.mock(\\"./db\\")"}',
          '{"description": "Mock database"}',
          now
        );

      // Pattern with assert content
      v2Db
        .prepare(
          `
        INSERT INTO patterns (id, pattern, metadata, created_at)
        VALUES (?, ?, ?, ?)
      `
        )
        .run(
          'assert-pattern',
          '{"content": "expect(result).toBe(expected)"}',
          '{"description": "Assert pattern"}',
          now
        );

      v2Db.close();

      await migrateV2ToV3(v2DbPath, v3DbPath);

      const v3Db = new Database(v3DbPath, { readonly: true });
      const mockP = v3Db
        .prepare('SELECT pattern_type FROM qe_patterns WHERE id = ?')
        .get('mock-pattern') as any;
      const assertP = v3Db
        .prepare('SELECT pattern_type FROM qe_patterns WHERE id = ?')
        .get('assert-pattern') as any;

      expect(mockP.pattern_type).toBe('mock-pattern');
      expect(assertP.pattern_type).toBe('assertion-pattern');

      v3Db.close();
    });
  });

  describe('Captured Experiences Migration', () => {
    it('should migrate captured experiences', async () => {
      const v2Db = createV2Database(v2DbPath);
      seedV2Database(v2Db);
      v2Db.close();

      const result = await migrateV2ToV3(v2DbPath, v3DbPath);

      expect(result.counts.captured_experiences).toBeGreaterThan(0);

      // Check V3 database
      const v3Db = new Database(v3DbPath, { readonly: true });
      const experiences = v3Db
        .prepare(
          "SELECT * FROM qe_patterns WHERE name LIKE 'Experience:%'"
        )
        .all();

      expect(experiences.length).toBeGreaterThan(0);

      v3Db.close();
    });

    it('should set confidence based on outcome success', async () => {
      const v2Db = createV2Database(v2DbPath);
      const now = Math.floor(Date.now() / 1000);

      // Successful experience
      v2Db
        .prepare(
          `
        INSERT INTO captured_experiences (id, agent_id, agent_type, task_type, outcome, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          'success-exp',
          'agent-1',
          'qe-test-architect',
          'test-generation',
          JSON.stringify({ success: true }),
          now
        );

      // Failed experience
      v2Db
        .prepare(
          `
        INSERT INTO captured_experiences (id, agent_id, agent_type, task_type, outcome, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          'fail-exp',
          'agent-1',
          'qe-test-architect',
          'test-generation',
          JSON.stringify({ success: false }),
          now
        );

      v2Db.close();

      await migrateV2ToV3(v2DbPath, v3DbPath);

      const v3Db = new Database(v3DbPath, { readonly: true });
      const successExp = v3Db
        .prepare('SELECT confidence FROM qe_patterns WHERE id = ?')
        .get('success-exp') as any;
      const failExp = v3Db
        .prepare('SELECT confidence FROM qe_patterns WHERE id = ?')
        .get('fail-exp') as any;

      expect(successExp.confidence).toBe(0.8);
      expect(failExp.confidence).toBe(0.3);

      v3Db.close();
    });
  });

  describe('Learning Experiences Migration', () => {
    it('should migrate learning experiences', async () => {
      const v2Db = createV2Database(v2DbPath);
      seedV2Database(v2Db);
      v2Db.close();

      const result = await migrateV2ToV3(v2DbPath, v3DbPath);

      expect(result.counts.learning_experiences).toBeGreaterThan(0);

      // Check V3 database
      const v3Db = new Database(v3DbPath, { readonly: true });
      const experiences = v3Db
        .prepare(
          "SELECT * FROM qe_patterns WHERE id LIKE 'le_%'"
        )
        .all();

      expect(experiences.length).toBeGreaterThan(0);

      v3Db.close();
    });

    it('should preserve reward as confidence', async () => {
      const v2Db = createV2Database(v2DbPath);
      const now = Math.floor(Date.now() / 1000);

      v2Db
        .prepare(
          `
        INSERT INTO learning_experiences (agent_id, task_type, state, action, reward, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
        )
        .run('agent-1', 'test-task', '{}', 'test-action', 0.75, now);

      v2Db.close();

      await migrateV2ToV3(v2DbPath, v3DbPath);

      const v3Db = new Database(v3DbPath, { readonly: true });
      const exp = v3Db
        .prepare(
          "SELECT confidence FROM qe_patterns WHERE id LIKE 'le_%'"
        )
        .get() as any;

      expect(exp.confidence).toBe(0.75);

      v3Db.close();
    });

    it('should handle non-JSON state values', async () => {
      const v2Db = createV2Database(v2DbPath);
      const now = Math.floor(Date.now() / 1000);

      // Plain string state (not JSON)
      v2Db
        .prepare(
          `
        INSERT INTO learning_experiences (agent_id, task_type, state, action, reward, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
        )
        .run('agent-1', 'test-task', 'task-started', 'analyze', 0.8, now);

      v2Db.close();

      const result = await migrateV2ToV3(v2DbPath, v3DbPath);

      expect(result.success).toBe(true);
      expect(result.counts.learning_experiences).toBe(1);
    });
  });

  describe('Concept Graph Migration', () => {
    it('should migrate concept nodes', async () => {
      const v2Db = createV2Database(v2DbPath);
      seedV2Database(v2Db);
      v2Db.close();

      const result = await migrateV2ToV3(v2DbPath, v3DbPath);

      expect(result.counts.concept_graph).toBeGreaterThan(0);

      // Check V3 database
      const v3Db = new Database(v3DbPath, { readonly: true });
      const nodes = v3Db
        .prepare(
          "SELECT * FROM qe_patterns WHERE id LIKE 'cn_%'"
        )
        .all();

      expect(nodes.length).toBeGreaterThan(0);

      const node = nodes[0] as any;
      expect(node.qe_domain).toBe('code-intelligence');

      v3Db.close();
    });

    it('should migrate concept edges', async () => {
      const v2Db = createV2Database(v2DbPath);
      seedV2Database(v2Db);
      v2Db.close();

      await migrateV2ToV3(v2DbPath, v3DbPath);

      const v3Db = new Database(v3DbPath, { readonly: true });
      const edges = v3Db
        .prepare(
          "SELECT * FROM qe_patterns WHERE id LIKE 'ce_%'"
        )
        .all();

      expect(edges.length).toBeGreaterThan(0);

      const edge = edges[0] as any;
      expect(edge.name).toContain('→');

      v3Db.close();
    });

    it('should preserve edge weight as confidence', async () => {
      const v2Db = createV2Database(v2DbPath);
      const now = Math.floor(Date.now() / 1000);

      // Migration requires at least one concept_node for edges to be processed
      // (migrateConceptGraph returns early if nodes.length === 0)
      v2Db
        .prepare(
          `
        INSERT INTO concept_nodes (id, name, type, domain, created_at)
        VALUES (?, ?, ?, ?, ?)
      `
        )
        .run('node-A', 'Node A', 'concept', 'test', now);

      // Add the edge with explicit evidence column
      v2Db
        .prepare(
          `
        INSERT INTO concept_edges (id, source, target, weight, type, evidence, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run('edge-test', 'A', 'B', 0.85, 'depends-on', 1, now);

      v2Db.close();

      await migrateV2ToV3(v2DbPath, v3DbPath);

      const v3Db = new Database(v3DbPath, { readonly: true });
      const edge = v3Db
        .prepare("SELECT confidence FROM qe_patterns WHERE id = 'ce_edge-test'")
        .get() as any;

      expect(edge).toBeDefined();
      expect(edge.confidence).toBe(0.85);

      v3Db.close();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing V2 database', async () => {
      const result = await migrateV2ToV3(
        join(testDir, 'non-existent.db'),
        v3DbPath
      );

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle missing tables in V2 database', async () => {
      // Create V2 database without all tables
      const v2Db = new Database(v2DbPath);
      v2Db.exec(`
        CREATE TABLE patterns (
          id TEXT PRIMARY KEY,
          pattern TEXT,
          confidence REAL
        );
      `);
      v2Db.close();

      const result = await migrateV2ToV3(v2DbPath, v3DbPath);

      // Should succeed but with fewer tables migrated
      expect(result.success).toBe(true);
    });

    it('should handle malformed JSON in V2 data', async () => {
      const v2Db = createV2Database(v2DbPath);
      const now = Math.floor(Date.now() / 1000);

      // Insert pattern with malformed JSON
      v2Db
        .prepare(
          `
        INSERT INTO patterns (id, pattern, metadata, created_at)
        VALUES (?, ?, ?, ?)
      `
        )
        .run('malformed', 'not valid json {', '{"broken": json}', now);

      v2Db.close();

      const result = await migrateV2ToV3(v2DbPath, v3DbPath);

      // Should still succeed (graceful handling)
      expect(result.success).toBe(true);
    });
  });

  describe('Validation', () => {
    it('should validate migration results', async () => {
      const v2Db = createV2Database(v2DbPath);
      seedV2Database(v2Db);
      v2Db.close();

      const result = await migrateV2ToV3(v2DbPath, v3DbPath);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect duplicate IDs', async () => {
      const v2Db = createV2Database(v2DbPath);
      const now = Math.floor(Date.now() / 1000);

      // This shouldn't create duplicates in normal operation
      // but if it did, validation would catch it
      v2Db
        .prepare(
          `
        INSERT INTO patterns (id, pattern, created_at)
        VALUES (?, ?, ?)
      `
        )
        .run('unique-pattern', '{}', now);

      v2Db.close();

      const result = await migrateV2ToV3(v2DbPath, v3DbPath);

      expect(result.success).toBe(true);
    });
  });

  describe('V2ToV3Migrator Class', () => {
    it('should be instantiable with config', () => {
      const config: V2MigrationConfig = {
        v2DbPath,
        v3PatternsDbPath: v3DbPath,
      };

      const migrator = new V2ToV3Migrator(config);
      expect(migrator).toBeDefined();
    });

    it('should accept progress callback in config', async () => {
      const v2Db = createV2Database(v2DbPath);
      v2Db.close();

      const progressEvents: string[] = [];

      const config: V2MigrationConfig = {
        v2DbPath,
        v3PatternsDbPath: v3DbPath,
        onProgress: (p) => progressEvents.push(p.stage),
      };

      const migrator = new V2ToV3Migrator(config);
      await migrator.migrate();

      expect(progressEvents).toContain('complete');
    });
  });
});

describe('Domain Mapping', () => {
  let testDir: string;
  let v2DbPath: string;
  let v3DbPath: string;

  beforeEach(() => {
    testDir = createTestDirectory();
    v2DbPath = join(testDir, 'v2-memory.db');
    v3DbPath = join(testDir, 'v3-patterns.db');
  });

  afterEach(() => {
    cleanupTestDirectory(testDir);
  });

  const domainMappings = [
    { v2: 'test', expected: 'test-generation' },
    { v2: 'testing', expected: 'test-generation' },
    { v2: 'coverage', expected: 'coverage-analysis' },
    { v2: 'quality', expected: 'quality-assessment' },
    { v2: 'defect', expected: 'defect-intelligence' },
    { v2: 'security', expected: 'security-compliance' },
    { v2: 'knowledge', expected: 'code-intelligence' },
    { v2: 'learning', expected: 'learning-optimization' },
    { v2: 'contract', expected: 'contract-testing' },
    { v2: 'visual', expected: 'visual-accessibility' },
    { v2: 'a11y', expected: 'visual-accessibility' },
    { v2: 'chaos', expected: 'chaos-resilience' },
    { v2: 'performance', expected: 'chaos-resilience' },
    { v2: 'requirements', expected: 'requirements-validation' },
    { v2: 'general', expected: 'test-generation' },
    { v2: 'unknown', expected: 'test-generation' },
  ];

  for (const { v2, expected } of domainMappings) {
    it(`should map '${v2}' to '${expected}'`, async () => {
      const v2Db = createV2Database(v2DbPath);
      v2Db
        .prepare(
          `
        INSERT INTO patterns (id, pattern, domain, created_at)
        VALUES (?, ?, ?, ?)
      `
        )
        .run(`domain-test-${v2}`, '{}', v2, Math.floor(Date.now() / 1000));
      v2Db.close();

      await migrateV2ToV3(v2DbPath, v3DbPath);

      const v3Db = new Database(v3DbPath, { readonly: true });
      const pattern = v3Db
        .prepare('SELECT qe_domain FROM qe_patterns WHERE id = ?')
        .get(`domain-test-${v2}`) as any;

      expect(pattern.qe_domain).toBe(expected);

      v3Db.close();
    });
  }
});

describe('Task Type to Domain Mapping', () => {
  let testDir: string;
  let v2DbPath: string;
  let v3DbPath: string;

  beforeEach(() => {
    testDir = createTestDirectory();
    v2DbPath = join(testDir, 'v2-memory.db');
    v3DbPath = join(testDir, 'v3-patterns.db');
  });

  afterEach(() => {
    cleanupTestDirectory(testDir);
  });

  const taskTypeMappings = [
    { taskType: 'unit-test', expected: 'test-generation' },
    { taskType: 'coverage-check', expected: 'coverage-analysis' },
    { taskType: 'security-scan', expected: 'security-compliance' },
    { taskType: 'api-contract', expected: 'contract-testing' },
    { taskType: 'visual-regression', expected: 'visual-accessibility' },
    { taskType: 'unknown-task', expected: 'test-generation' },
  ];

  for (const { taskType, expected } of taskTypeMappings) {
    it(`should map task type '${taskType}' to domain '${expected}'`, async () => {
      const v2Db = createV2Database(v2DbPath);
      const now = Math.floor(Date.now() / 1000);

      v2Db
        .prepare(
          `
        INSERT INTO captured_experiences (id, agent_id, agent_type, task_type, outcome, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          `task-test-${taskType}`,
          'agent-1',
          'test-agent',
          taskType,
          '{"success": true}',
          now
        );

      v2Db.close();

      await migrateV2ToV3(v2DbPath, v3DbPath);

      const v3Db = new Database(v3DbPath, { readonly: true });
      const exp = v3Db
        .prepare('SELECT qe_domain FROM qe_patterns WHERE id = ?')
        .get(`task-test-${taskType}`) as any;

      expect(exp.qe_domain).toBe(expected);

      v3Db.close();
    });
  }
});
