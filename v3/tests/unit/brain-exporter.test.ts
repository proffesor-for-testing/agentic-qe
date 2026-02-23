/**
 * Brain Export/Import System Tests
 *
 * Tests the portable brain export that snapshots learning state
 * (patterns, Q-values, dream insights, witness chain) and imports
 * it into another AQE instance.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import {
  exportBrain,
  importBrain,
  brainInfo,
  type BrainExportManifest,
  type BrainExportOptions,
  type BrainImportOptions,
} from '../../src/integrations/ruvector/brain-exporter.js';

// ============================================================================
// Helpers
// ============================================================================

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  // Create tables matching the unified schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS qe_patterns (
      id TEXT PRIMARY KEY,
      pattern_type TEXT NOT NULL,
      qe_domain TEXT NOT NULL,
      domain TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      confidence REAL DEFAULT 0.5,
      usage_count INTEGER DEFAULT 0,
      success_rate REAL DEFAULT 0.0,
      quality_score REAL DEFAULT 0.0,
      tier TEXT DEFAULT 'short-term',
      template_json TEXT,
      context_json TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      last_used_at TEXT,
      successful_uses INTEGER DEFAULT 0,
      tokens_used INTEGER,
      input_tokens INTEGER,
      output_tokens INTEGER,
      latency_ms REAL,
      reusable INTEGER DEFAULT 0,
      reuse_count INTEGER DEFAULT 0,
      average_token_savings REAL DEFAULT 0,
      total_tokens_saved INTEGER
    );

    CREATE TABLE IF NOT EXISTS rl_q_values (
      id TEXT PRIMARY KEY,
      algorithm TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      state_key TEXT NOT NULL,
      action_key TEXT NOT NULL,
      q_value REAL NOT NULL DEFAULT 0.0,
      visits INTEGER NOT NULL DEFAULT 0,
      last_reward REAL,
      domain TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(algorithm, agent_id, state_key, action_key)
    );

    CREATE TABLE IF NOT EXISTS dream_cycles (
      id TEXT PRIMARY KEY,
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration_ms INTEGER,
      concepts_processed INTEGER DEFAULT 0,
      associations_found INTEGER DEFAULT 0,
      insights_generated INTEGER DEFAULT 0,
      status TEXT DEFAULT 'running',
      error TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dream_insights (
      id TEXT PRIMARY KEY,
      cycle_id TEXT NOT NULL,
      insight_type TEXT NOT NULL,
      source_concepts TEXT NOT NULL,
      description TEXT NOT NULL,
      novelty_score REAL DEFAULT 0.5,
      confidence_score REAL DEFAULT 0.5,
      actionable INTEGER DEFAULT 0,
      applied INTEGER DEFAULT 0,
      suggested_action TEXT,
      pattern_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS witness_chain (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prev_hash TEXT NOT NULL,
      action_hash TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_data TEXT,
      timestamp TEXT NOT NULL,
      actor TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vectors (
      id TEXT PRIMARY KEY,
      namespace TEXT NOT NULL DEFAULT 'default',
      embedding BLOB NOT NULL,
      dimensions INTEGER NOT NULL,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  return db;
}

function seedTestData(db: Database.Database): void {
  // Patterns
  db.prepare(`
    INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, confidence, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('p1', 'test-template', 'test-generation', 'test-generation', 'AAA Test', 'Arrange-Act-Assert', 0.8, '2026-02-20T10:00:00Z');

  db.prepare(`
    INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, confidence, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('p2', 'mock-pattern', 'coverage-analysis', 'coverage-analysis', 'Coverage Strategy', 'Risk-based coverage', 0.6, '2026-02-20T11:00:00Z');

  db.prepare(`
    INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, confidence, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('p3', 'assertion-pattern', 'security-compliance', 'security-compliance', 'OWASP Check', 'OWASP Top 10', 0.9, '2026-02-20T12:00:00Z');

  // Q-Values
  db.prepare(`
    INSERT INTO rl_q_values (id, algorithm, agent_id, state_key, action_key, q_value, visits, domain, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('qv1', 'sarsa', 'agent-1', 'state-a', 'action-x', 0.75, 10, 'test-generation', '2026-02-20T10:00:00Z');

  db.prepare(`
    INSERT INTO rl_q_values (id, algorithm, agent_id, state_key, action_key, q_value, visits, domain, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('qv2', 'q-learning', 'agent-2', 'state-b', 'action-y', 0.5, 5, 'coverage-analysis', '2026-02-20T11:00:00Z');

  // Dream cycle (needed as FK parent for insights)
  db.prepare(`
    INSERT INTO dream_cycles (id, start_time, status)
    VALUES (?, ?, ?)
  `).run('dc1', '2026-02-20T09:00:00Z', 'completed');

  // Dream Insights
  db.prepare(`
    INSERT INTO dream_insights (id, cycle_id, insight_type, source_concepts, description, confidence_score)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('di1', 'dc1', 'cross-pattern', '["p1","p2"]', 'AAA and coverage are related', 0.7);

  db.prepare(`
    INSERT INTO dream_insights (id, cycle_id, insight_type, source_concepts, description, confidence_score)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('di2', 'dc1', 'novel-association', '["p3"]', 'Security patterns overlap with quality', 0.4);

  // Witness Chain
  db.prepare(`
    INSERT INTO witness_chain (prev_hash, action_hash, action_type, action_data, timestamp, actor)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('0'.repeat(64), 'abc123', 'PATTERN_CREATE', '{"patternId":"p1"}', '2026-02-20T10:00:00Z', 'reasoning-bank');

  db.prepare(`
    INSERT INTO witness_chain (prev_hash, action_hash, action_type, action_data, timestamp, actor)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('def456', 'ghi789', 'PATTERN_UPDATE', '{"patternId":"p1","success":true}', '2026-02-20T10:30:00Z', 'reasoning-bank');

  // Vectors
  const buf = Buffer.alloc(4 * 3); // 3 float32s
  new Float32Array(buf.buffer).set([0.1, 0.2, 0.3]);
  db.prepare(`
    INSERT INTO vectors (id, namespace, embedding, dimensions) VALUES (?, ?, ?, ?)
  `).run('v1', 'default', buf, 3);
}

let tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = join(tmpdir(), `brain-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

// ============================================================================
// Tests
// ============================================================================

describe('Brain Export/Import System', () => {
  let sourceDb: Database.Database;

  beforeEach(() => {
    sourceDb = createTestDb();
    seedTestData(sourceDb);
    tempDirs = [];
  });

  afterEach(() => {
    sourceDb.close();
    for (const dir of tempDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  // --------------------------------------------------------------------------
  // Export tests
  // --------------------------------------------------------------------------

  describe('exportBrain', () => {
    it('should export all data with correct manifest stats', () => {
      const outDir = makeTempDir();
      const manifest = exportBrain(sourceDb, {
        outputPath: outDir,
        includeQValues: true,
        includeDreamInsights: true,
        includeWitnessChain: true,
        includeVectors: true,
      });

      expect(manifest.version).toBe('1.0');
      expect(manifest.stats.patternCount).toBe(3);
      expect(manifest.stats.qValueCount).toBe(2);
      expect(manifest.stats.dreamInsightCount).toBe(2);
      expect(manifest.stats.witnessChainLength).toBe(2);
      expect(manifest.stats.vectorCount).toBe(1);
      expect(manifest.domains).toContain('test-generation');
      expect(manifest.domains).toContain('coverage-analysis');
      expect(manifest.domains).toContain('security-compliance');
      expect(manifest.checksum).toBeTruthy();
      expect(manifest.checksum.length).toBe(64); // SHA-256 hex

      // Verify files exist
      expect(existsSync(join(outDir, 'manifest.json'))).toBe(true);
      expect(existsSync(join(outDir, 'patterns.jsonl'))).toBe(true);
      expect(existsSync(join(outDir, 'q-values.jsonl'))).toBe(true);
      expect(existsSync(join(outDir, 'dream-insights.jsonl'))).toBe(true);
      expect(existsSync(join(outDir, 'witness-chain.jsonl'))).toBe(true);

      // Verify JSONL line counts
      const patternLines = readFileSync(join(outDir, 'patterns.jsonl'), 'utf-8').trim().split('\n');
      expect(patternLines.length).toBe(3);

      const qLines = readFileSync(join(outDir, 'q-values.jsonl'), 'utf-8').trim().split('\n');
      expect(qLines.length).toBe(2);
    });

    it('should filter patterns by domain', () => {
      const outDir = makeTempDir();
      const manifest = exportBrain(sourceDb, {
        outputPath: outDir,
        domains: ['test-generation'],
      });

      expect(manifest.stats.patternCount).toBe(1);
      expect(manifest.domains).toEqual(['test-generation']);

      const patternLines = readFileSync(join(outDir, 'patterns.jsonl'), 'utf-8').trim().split('\n');
      expect(patternLines.length).toBe(1);
      const parsed = JSON.parse(patternLines[0]);
      expect(parsed.qe_domain).toBe('test-generation');
    });

    it('should exclude optional sections when disabled', () => {
      const outDir = makeTempDir();
      const manifest = exportBrain(sourceDb, {
        outputPath: outDir,
        includeQValues: false,
        includeDreamInsights: false,
        includeWitnessChain: false,
        includeVectors: false,
      });

      expect(manifest.stats.patternCount).toBe(3);
      expect(manifest.stats.qValueCount).toBe(0);
      expect(manifest.stats.dreamInsightCount).toBe(0);
      expect(manifest.stats.witnessChainLength).toBe(0);
      expect(manifest.stats.vectorCount).toBe(0);
    });

    it('should create output directory if it does not exist', () => {
      const outDir = join(makeTempDir(), 'nested', 'deep');
      expect(existsSync(outDir)).toBe(false);

      const manifest = exportBrain(sourceDb, { outputPath: outDir });

      expect(existsSync(outDir)).toBe(true);
      expect(manifest.stats.patternCount).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // Import tests
  // --------------------------------------------------------------------------

  describe('importBrain', () => {
    it('should import into empty database with all records', () => {
      // Export
      const outDir = makeTempDir();
      exportBrain(sourceDb, { outputPath: outDir });

      // Import into fresh DB
      const targetDb = createTestDb();
      const result = importBrain(targetDb, outDir, { mergeStrategy: 'skip-conflicts' });

      expect(result.imported).toBe(3 + 2 + 2 + 2); // 3 patterns + 2 qvalues + 2 insights + 2 witness
      expect(result.skipped).toBe(0);
      expect(result.conflicts).toBe(0);

      // Verify target DB has the data
      const patternCount = (targetDb.prepare('SELECT COUNT(*) as cnt FROM qe_patterns').get() as { cnt: number }).cnt;
      expect(patternCount).toBe(3);

      const qvCount = (targetDb.prepare('SELECT COUNT(*) as cnt FROM rl_q_values').get() as { cnt: number }).cnt;
      expect(qvCount).toBe(2);

      targetDb.close();
    });

    it('should skip conflicts with skip-conflicts strategy', () => {
      const outDir = makeTempDir();
      exportBrain(sourceDb, { outputPath: outDir });

      // Import into DB that already has the same data
      const targetDb = createTestDb();
      seedTestData(targetDb);

      const result = importBrain(targetDb, outDir, { mergeStrategy: 'skip-conflicts' });

      expect(result.imported).toBe(0);
      expect(result.skipped).toBeGreaterThan(0);
      expect(result.conflicts).toBeGreaterThan(0);

      // Data should be unchanged
      const patternCount = (targetDb.prepare('SELECT COUNT(*) as cnt FROM qe_patterns').get() as { cnt: number }).cnt;
      expect(patternCount).toBe(3);

      targetDb.close();
    });

    it('should overwrite with higher confidence using highest-confidence strategy', () => {
      const outDir = makeTempDir();
      exportBrain(sourceDb, { outputPath: outDir });

      // Create target with same patterns but LOWER confidence
      const targetDb = createTestDb();
      targetDb.prepare(`
        INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, confidence, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('p1', 'test-template', 'test-generation', 'test-generation', 'Old Name', 'Old desc', 0.3, '2026-01-01T00:00:00Z');

      // p1 in source has confidence 0.8, target has 0.3 => import wins
      const result = importBrain(targetDb, outDir, { mergeStrategy: 'highest-confidence' });

      // p1 imported (0.8 > 0.3), p2 and p3 are new (no conflict)
      expect(result.imported).toBeGreaterThan(0);

      const row = targetDb.prepare('SELECT confidence, name FROM qe_patterns WHERE id = ?').get('p1') as { confidence: number; name: string };
      expect(row.confidence).toBe(0.8);
      expect(row.name).toBe('AAA Test'); // Overwritten from source

      targetDb.close();
    });

    it('should not overwrite when existing confidence is higher', () => {
      const outDir = makeTempDir();
      exportBrain(sourceDb, { outputPath: outDir });

      const targetDb = createTestDb();
      targetDb.prepare(`
        INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, confidence, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('p1', 'test-template', 'test-generation', 'test-generation', 'Better Pattern', 'Higher confidence', 0.95, '2026-03-01T00:00:00Z');

      const result = importBrain(targetDb, outDir, { mergeStrategy: 'highest-confidence' });

      const row = targetDb.prepare('SELECT confidence, name FROM qe_patterns WHERE id = ?').get('p1') as { confidence: number; name: string };
      expect(row.confidence).toBe(0.95); // Kept existing
      expect(row.name).toBe('Better Pattern');

      targetDb.close();
    });

    it('should use latest-wins strategy based on updated_at timestamp', () => {
      const outDir = makeTempDir();
      exportBrain(sourceDb, { outputPath: outDir });

      const targetDb = createTestDb();
      // p1 in source: updated_at = 2026-02-20T10:00:00Z
      // p1 in target: updated_at = 2026-03-01 (newer) => target wins
      targetDb.prepare(`
        INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, confidence, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('p1', 'test-template', 'test-generation', 'test-generation', 'Newer Pattern', 'Latest', 0.5, '2026-03-01T00:00:00Z');

      const result = importBrain(targetDb, outDir, { mergeStrategy: 'latest-wins' });

      const row = targetDb.prepare('SELECT name FROM qe_patterns WHERE id = ?').get('p1') as { name: string };
      expect(row.name).toBe('Newer Pattern'); // Target was newer, kept

      targetDb.close();
    });

    it('should handle dry-run without modifying the database', () => {
      const outDir = makeTempDir();
      exportBrain(sourceDb, { outputPath: outDir });

      const targetDb = createTestDb();
      const result = importBrain(targetDb, outDir, {
        mergeStrategy: 'skip-conflicts',
        dryRun: true,
      });

      expect(result.imported).toBeGreaterThan(0);

      // Database should still be empty (tables exist but no rows)
      const patternCount = (targetDb.prepare('SELECT COUNT(*) as cnt FROM qe_patterns').get() as { cnt: number }).cnt;
      expect(patternCount).toBe(0);

      targetDb.close();
    });
  });

  // --------------------------------------------------------------------------
  // Round-trip tests
  // --------------------------------------------------------------------------

  describe('round-trip export then import', () => {
    it('should preserve all data through export and import into empty DB', () => {
      const outDir = makeTempDir();
      const manifest = exportBrain(sourceDb, { outputPath: outDir });

      const targetDb = createTestDb();
      const result = importBrain(targetDb, outDir, { mergeStrategy: 'skip-conflicts' });

      // All records imported
      expect(result.imported).toBe(
        manifest.stats.patternCount +
        manifest.stats.qValueCount +
        manifest.stats.dreamInsightCount +
        manifest.stats.witnessChainLength
      );
      expect(result.skipped).toBe(0);
      expect(result.conflicts).toBe(0);

      // Verify counts match
      const patternCount = (targetDb.prepare('SELECT COUNT(*) as cnt FROM qe_patterns').get() as { cnt: number }).cnt;
      expect(patternCount).toBe(manifest.stats.patternCount);

      const qvCount = (targetDb.prepare('SELECT COUNT(*) as cnt FROM rl_q_values').get() as { cnt: number }).cnt;
      expect(qvCount).toBe(manifest.stats.qValueCount);

      const insightCount = (targetDb.prepare('SELECT COUNT(*) as cnt FROM dream_insights').get() as { cnt: number }).cnt;
      expect(insightCount).toBe(manifest.stats.dreamInsightCount);

      const witnessCount = (targetDb.prepare('SELECT COUNT(*) as cnt FROM witness_chain').get() as { cnt: number }).cnt;
      expect(witnessCount).toBe(manifest.stats.witnessChainLength);

      targetDb.close();
    });

    it('should preserve pattern field values through round-trip', () => {
      const outDir = makeTempDir();
      exportBrain(sourceDb, { outputPath: outDir });

      const targetDb = createTestDb();
      importBrain(targetDb, outDir, { mergeStrategy: 'skip-conflicts' });

      const original = sourceDb.prepare('SELECT * FROM qe_patterns WHERE id = ?').get('p1') as Record<string, unknown>;
      const imported = targetDb.prepare('SELECT * FROM qe_patterns WHERE id = ?').get('p1') as Record<string, unknown>;

      expect(imported.name).toBe(original.name);
      expect(imported.description).toBe(original.description);
      expect(imported.confidence).toBe(original.confidence);
      expect(imported.pattern_type).toBe(original.pattern_type);
      expect(imported.qe_domain).toBe(original.qe_domain);

      targetDb.close();
    });
  });

  // --------------------------------------------------------------------------
  // brainInfo tests
  // --------------------------------------------------------------------------

  describe('brainInfo', () => {
    it('should read manifest correctly', () => {
      const outDir = makeTempDir();
      const exported = exportBrain(sourceDb, { outputPath: outDir });

      const info = brainInfo(outDir);

      expect(info.version).toBe('1.0');
      expect(info.stats.patternCount).toBe(exported.stats.patternCount);
      expect(info.stats.qValueCount).toBe(exported.stats.qValueCount);
      expect(info.checksum).toBe(exported.checksum);
      expect(info.domains).toEqual(exported.domains);
    });

    it('should throw when manifest does not exist', () => {
      const emptyDir = makeTempDir();
      expect(() => brainInfo(emptyDir)).toThrow('Manifest not found');
    });
  });

  // --------------------------------------------------------------------------
  // Checksum validation
  // --------------------------------------------------------------------------

  describe('checksum validation', () => {
    it('should reject import when a file has been tampered with', () => {
      const outDir = makeTempDir();
      exportBrain(sourceDb, { outputPath: outDir });

      // Tamper with patterns.jsonl
      const patternsPath = join(outDir, 'patterns.jsonl');
      const content = readFileSync(patternsPath, 'utf-8');
      writeFileSync(patternsPath, content + '{"id":"evil","pattern_type":"x","qe_domain":"y","domain":"z","name":"hacked"}\n');

      const targetDb = createTestDb();
      expect(() => {
        importBrain(targetDb, outDir, { mergeStrategy: 'skip-conflicts' });
      }).toThrow(/[Cc]hecksum mismatch/);

      targetDb.close();
    });

    it('should reject import when manifest checksum is wrong', () => {
      const outDir = makeTempDir();
      exportBrain(sourceDb, { outputPath: outDir });

      // Tamper with the manifest checksum directly
      const manifestPath = join(outDir, 'manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      manifest.checksum = 'deadbeef'.repeat(8);
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      const targetDb = createTestDb();
      expect(() => {
        importBrain(targetDb, outDir, { mergeStrategy: 'skip-conflicts' });
      }).toThrow(/[Cc]hecksum mismatch/);

      targetDb.close();
    });

    it('should accept import when files are untampered', () => {
      const outDir = makeTempDir();
      exportBrain(sourceDb, { outputPath: outDir });

      const targetDb = createTestDb();
      // Should not throw
      const result = importBrain(targetDb, outDir, { mergeStrategy: 'skip-conflicts' });
      expect(result.imported).toBeGreaterThan(0);

      targetDb.close();
    });
  });

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle empty database gracefully', () => {
      const emptyDb = createTestDb();
      const outDir = makeTempDir();

      const manifest = exportBrain(emptyDb, { outputPath: outDir });

      expect(manifest.stats.patternCount).toBe(0);
      expect(manifest.stats.qValueCount).toBe(0);
      expect(manifest.stats.dreamInsightCount).toBe(0);
      expect(manifest.stats.witnessChainLength).toBe(0);
      expect(manifest.domains).toEqual([]);

      emptyDb.close();
    });

    it('should handle database without optional tables', () => {
      const bareDb = new Database(':memory:');
      // Only create qe_patterns, skip others
      bareDb.exec(`
        CREATE TABLE qe_patterns (
          id TEXT PRIMARY KEY,
          pattern_type TEXT NOT NULL,
          qe_domain TEXT NOT NULL,
          domain TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          confidence REAL DEFAULT 0.5,
          usage_count INTEGER DEFAULT 0,
          success_rate REAL DEFAULT 0.0,
          quality_score REAL DEFAULT 0.0,
          tier TEXT DEFAULT 'short-term',
          template_json TEXT,
          context_json TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          last_used_at TEXT,
          successful_uses INTEGER DEFAULT 0,
          tokens_used INTEGER,
          input_tokens INTEGER,
          output_tokens INTEGER,
          latency_ms REAL,
          reusable INTEGER DEFAULT 0,
          reuse_count INTEGER DEFAULT 0,
          average_token_savings REAL DEFAULT 0,
          total_tokens_saved INTEGER
        );
      `);
      bareDb.prepare(`
        INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name) VALUES (?, ?, ?, ?, ?)
      `).run('p1', 'test-template', 'test-generation', 'test-generation', 'Test');

      const outDir = makeTempDir();
      const manifest = exportBrain(bareDb, { outputPath: outDir });

      expect(manifest.stats.patternCount).toBe(1);
      expect(manifest.stats.qValueCount).toBe(0);
      expect(manifest.stats.dreamInsightCount).toBe(0);
      expect(manifest.stats.witnessChainLength).toBe(0);

      bareDb.close();
    });

    it('should handle domain filter with multiple domains', () => {
      const outDir = makeTempDir();
      const manifest = exportBrain(sourceDb, {
        outputPath: outDir,
        domains: ['test-generation', 'security-compliance'],
      });

      expect(manifest.stats.patternCount).toBe(2); // p1 and p3
      expect(manifest.domains).toContain('test-generation');
      expect(manifest.domains).toContain('security-compliance');
      expect(manifest.domains).not.toContain('coverage-analysis');
    });

    it('should handle domain filter that matches no patterns', () => {
      const outDir = makeTempDir();
      const manifest = exportBrain(sourceDb, {
        outputPath: outDir,
        domains: ['nonexistent-domain'],
      });

      expect(manifest.stats.patternCount).toBe(0);
      expect(manifest.domains).toEqual([]);
    });
  });
});
