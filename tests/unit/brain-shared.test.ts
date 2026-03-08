/**
 * Brain Shared Module Tests
 *
 * Tests the shared types, merge functions, SQL helpers, and utilities
 * extracted from brain-exporter and brain-rvf-exporter.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import {
  sha256,
  tableExists,
  queryAll,
  queryIterator,
  domainFilter,
  domainFilterForColumn,
  countRows,
  writeJsonl,
  writeJsonlStreaming,
  readJsonl,
  ensureTargetTables,
  mergePattern,
  mergeQValue,
  mergeDreamInsight,
  mergeWitnessEntry,
  mergeGenericRow,
  mergeAppendOnlyRow,
  insertPattern,
  updatePattern,
  insertQValue,
  insertDreamInsight,
  insertWitnessEntry,
  TABLE_CONFIGS,
  TABLE_BLOB_COLUMNS,
  PK_COLUMNS,
  CONFIDENCE_COLUMNS,
  TIMESTAMP_COLUMNS,
  serializeRowBlobs,
  deserializeRowBlobs,
  type PatternRow,
  type QValueRow,
  type DreamInsightRow,
  type WitnessRow,
  type MergeStrategy,
} from '../../src/integrations/ruvector/brain-shared.js';

// ============================================================================
// Helpers
// ============================================================================

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  ensureTargetTables(db);
  return db;
}

function makePattern(overrides: Partial<PatternRow> = {}): PatternRow {
  return {
    id: `p-${randomUUID()}`,
    pattern_type: 'test-template',
    qe_domain: 'test-generation',
    domain: 'test-generation',
    name: 'Test Pattern',
    confidence: 0.8,
    created_at: '2026-02-20T10:00:00Z',
    updated_at: '2026-02-20T10:00:00Z',
    ...overrides,
  };
}

function makeQValue(overrides: Partial<QValueRow> = {}): QValueRow {
  return {
    id: `qv-${randomUUID()}`,
    algorithm: 'sarsa',
    agent_id: 'agent-1',
    state_key: 'state-a',
    action_key: 'action-x',
    q_value: 0.75,
    visits: 10,
    domain: 'test-generation',
    created_at: '2026-02-20T10:00:00Z',
    updated_at: '2026-02-20T10:00:00Z',
    ...overrides,
  };
}

function makeInsight(overrides: Partial<DreamInsightRow> = {}): DreamInsightRow {
  return {
    id: `di-${randomUUID()}`,
    cycle_id: 'dc1',
    insight_type: 'cross-pattern',
    source_concepts: '["p1","p2"]',
    description: 'Test insight',
    confidence_score: 0.7,
    created_at: '2026-02-20T10:00:00Z',
    ...overrides,
  };
}

function makeWitness(overrides: Partial<WitnessRow> = {}): WitnessRow {
  return {
    id: 0,
    prev_hash: '0'.repeat(64),
    action_hash: `hash-${randomUUID().slice(0, 8)}`,
    action_type: 'PATTERN_CREATE',
    action_data: '{"patternId":"p1"}',
    timestamp: '2026-02-20T10:00:00Z',
    actor: 'reasoning-bank',
    ...overrides,
  };
}

let tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = join(tmpdir(), `brain-shared-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

// ============================================================================
// Tests
// ============================================================================

describe('Brain Shared Module', () => {
  afterEach(() => {
    for (const dir of tempDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    tempDirs = [];
  });

  // --------------------------------------------------------------------------
  // Utility functions
  // --------------------------------------------------------------------------

  describe('sha256', () => {
    it('should produce correct hex digest', () => {
      const hash = sha256('hello');
      expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
      expect(hash).toHaveLength(64);
    });

    it('should produce different hashes for different inputs', () => {
      expect(sha256('a')).not.toBe(sha256('b'));
    });

    it('should produce empty-string hash deterministically', () => {
      const h1 = sha256('');
      const h2 = sha256('');
      expect(h1).toBe(h2);
      expect(h1).toHaveLength(64);
    });
  });

  describe('tableExists', () => {
    it('should return true for existing table', () => {
      const db = createTestDb();
      expect(tableExists(db, 'qe_patterns')).toBe(true);
      db.close();
    });

    it('should return false for non-existing table', () => {
      const db = createTestDb();
      expect(tableExists(db, 'nonexistent_table')).toBe(false);
      db.close();
    });
  });

  describe('queryAll', () => {
    it('should return all rows from a table', () => {
      const db = createTestDb();
      const p = makePattern({ id: 'p1' });
      insertPattern(db, p);
      const rows = queryAll(db, 'qe_patterns');
      expect(rows).toHaveLength(1);
      db.close();
    });

    it('should return filtered rows with WHERE clause', () => {
      const db = createTestDb();
      insertPattern(db, makePattern({ id: 'p1', qe_domain: 'domain-a' }));
      insertPattern(db, makePattern({ id: 'p2', qe_domain: 'domain-b' }));
      const rows = queryAll(db, 'qe_patterns', 'qe_domain = ?', ['domain-a']);
      expect(rows).toHaveLength(1);
      expect((rows[0] as PatternRow).id).toBe('p1');
      db.close();
    });

    it('should return empty array for non-existing table', () => {
      const db = new Database(':memory:');
      const rows = queryAll(db, 'nonexistent');
      expect(rows).toEqual([]);
      db.close();
    });
  });

  describe('domainFilter', () => {
    it('should return undefined clause for empty domains', () => {
      const [clause, params] = domainFilter(undefined);
      expect(clause).toBeUndefined();
      expect(params).toEqual([]);
    });

    it('should return undefined clause for empty array', () => {
      const [clause, params] = domainFilter([]);
      expect(clause).toBeUndefined();
      expect(params).toEqual([]);
    });

    it('should return correct clause for single domain', () => {
      const [clause, params] = domainFilter(['test-gen']);
      expect(clause).toBe('qe_domain IN (?)');
      expect(params).toEqual(['test-gen']);
    });

    it('should return correct clause for multiple domains', () => {
      const [clause, params] = domainFilter(['a', 'b', 'c']);
      expect(clause).toBe('qe_domain IN (?, ?, ?)');
      expect(params).toEqual(['a', 'b', 'c']);
    });
  });

  describe('countRows', () => {
    it('should count all rows in a table', () => {
      const db = createTestDb();
      insertPattern(db, makePattern({ id: 'p1' }));
      insertPattern(db, makePattern({ id: 'p2' }));
      expect(countRows(db, 'qe_patterns')).toBe(2);
      db.close();
    });

    it('should count rows with a filter', () => {
      const db = createTestDb();
      insertPattern(db, makePattern({ id: 'p1', qe_domain: 'domain-a' }));
      insertPattern(db, makePattern({ id: 'p2', qe_domain: 'domain-b' }));
      expect(countRows(db, 'qe_patterns', 'qe_domain = ?', ['domain-a'])).toBe(1);
      db.close();
    });

    it('should return 0 for non-existing table', () => {
      const db = new Database(':memory:');
      expect(countRows(db, 'nonexistent')).toBe(0);
      db.close();
    });
  });

  // --------------------------------------------------------------------------
  // JSONL I/O
  // --------------------------------------------------------------------------

  describe('writeJsonl and readJsonl', () => {
    it('should round-trip data correctly', () => {
      const dir = makeTempDir();
      const filePath = join(dir, 'test.jsonl');
      const data = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }];

      writeJsonl(filePath, data);
      const result = readJsonl(filePath);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 1, name: 'a' });
      expect(result[1]).toEqual({ id: 2, name: 'b' });
    });

    it('should handle empty arrays', () => {
      const dir = makeTempDir();
      const filePath = join(dir, 'empty.jsonl');

      writeJsonl(filePath, []);
      const result = readJsonl(filePath);

      expect(result).toEqual([]);
    });

    it('should return empty array for non-existing file', () => {
      const result = readJsonl('/nonexistent/path/test.jsonl');
      expect(result).toEqual([]);
    });

    it('should accept a custom parser', () => {
      const dir = makeTempDir();
      const filePath = join(dir, 'custom.jsonl');
      writeJsonl(filePath, [{ x: 1 }]);

      const result = readJsonl<{ x: number; extra: boolean }>(filePath, (line) => {
        const obj = JSON.parse(line);
        return { ...obj, extra: true };
      });

      expect(result).toHaveLength(1);
      expect(result[0].extra).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // ensureTargetTables
  // --------------------------------------------------------------------------

  describe('ensureTargetTables', () => {
    it('should create all 26 expected tables', () => {
      const db = new Database(':memory:');
      ensureTargetTables(db);

      // Original Phase 1 tables
      expect(tableExists(db, 'qe_patterns')).toBe(true);
      expect(tableExists(db, 'rl_q_values')).toBe(true);
      expect(tableExists(db, 'dream_insights')).toBe(true);
      expect(tableExists(db, 'dream_cycles')).toBe(true);
      expect(tableExists(db, 'witness_chain')).toBe(true);
      expect(tableExists(db, 'vectors')).toBe(true);
      expect(tableExists(db, 'qe_pattern_embeddings')).toBe(true);

      // Phase 2 new tables
      expect(tableExists(db, 'captured_experiences')).toBe(true);
      expect(tableExists(db, 'sona_patterns')).toBe(true);
      expect(tableExists(db, 'qe_trajectories')).toBe(true);
      expect(tableExists(db, 'trajectory_steps')).toBe(true);
      expect(tableExists(db, 'concept_nodes')).toBe(true);
      expect(tableExists(db, 'concept_edges')).toBe(true);
      expect(tableExists(db, 'goap_actions')).toBe(true);
      expect(tableExists(db, 'routing_outcomes')).toBe(true);
      expect(tableExists(db, 'goap_goals')).toBe(true);
      expect(tableExists(db, 'goap_plans')).toBe(true);
      expect(tableExists(db, 'goap_plan_signatures')).toBe(true);
      expect(tableExists(db, 'qe_pattern_usage')).toBe(true);
      expect(tableExists(db, 'pattern_evolution_events')).toBe(true);
      expect(tableExists(db, 'pattern_relationships')).toBe(true);
      expect(tableExists(db, 'pattern_versions')).toBe(true);
      expect(tableExists(db, 'experience_applications')).toBe(true);
      expect(tableExists(db, 'execution_results')).toBe(true);
      expect(tableExists(db, 'executed_steps')).toBe(true);

      db.close();
    });

    it('should be idempotent (safe to call multiple times)', () => {
      const db = new Database(':memory:');
      ensureTargetTables(db);
      ensureTargetTables(db); // Second call should not throw
      expect(tableExists(db, 'qe_patterns')).toBe(true);
      expect(tableExists(db, 'captured_experiences')).toBe(true);
      db.close();
    });
  });

  // --------------------------------------------------------------------------
  // Insert/Update helpers
  // --------------------------------------------------------------------------

  describe('insertPattern and updatePattern', () => {
    it('should insert a pattern and read it back', () => {
      const db = createTestDb();
      const p = makePattern({ id: 'test-insert', name: 'Inserted' });
      insertPattern(db, p);

      const row = db.prepare('SELECT * FROM qe_patterns WHERE id = ?').get('test-insert') as PatternRow;
      expect(row.name).toBe('Inserted');
      expect(row.confidence).toBe(0.8);
      db.close();
    });

    it('should update an existing pattern', () => {
      const db = createTestDb();
      const p = makePattern({ id: 'test-update', name: 'Original', confidence: 0.5 });
      insertPattern(db, p);

      updatePattern(db, { ...p, name: 'Updated', confidence: 0.9 });

      const row = db.prepare('SELECT * FROM qe_patterns WHERE id = ?').get('test-update') as PatternRow;
      expect(row.name).toBe('Updated');
      expect(row.confidence).toBe(0.9);
      db.close();
    });
  });

  // --------------------------------------------------------------------------
  // Merge functions
  // --------------------------------------------------------------------------

  describe('mergePattern', () => {
    let db: Database.Database;

    beforeEach(() => {
      db = createTestDb();
    });

    afterEach(() => {
      db.close();
    });

    it('should insert new pattern when no conflict', () => {
      const p = makePattern({ id: 'new-p' });
      const result = mergePattern(db, p, 'skip-conflicts');
      expect(result).toEqual({ imported: 1, skipped: 0, conflicts: 0 });
    });

    it('should skip existing with skip-conflicts strategy', () => {
      const p = makePattern({ id: 'existing-p' });
      insertPattern(db, p);

      const result = mergePattern(db, p, 'skip-conflicts');
      expect(result).toEqual({ imported: 0, skipped: 1, conflicts: 1 });
    });

    it('should overwrite older with latest-wins strategy', () => {
      const p = makePattern({ id: 'latest-p', updated_at: '2026-01-01T00:00:00Z', name: 'Old' });
      insertPattern(db, p);

      const newer = { ...p, updated_at: '2026-03-01T00:00:00Z', name: 'New' };
      const result = mergePattern(db, newer, 'latest-wins');
      expect(result).toEqual({ imported: 1, skipped: 0, conflicts: 1 });

      const row = db.prepare('SELECT name FROM qe_patterns WHERE id = ?').get('latest-p') as { name: string };
      expect(row.name).toBe('New');
    });

    it('should keep newer existing with latest-wins strategy', () => {
      const p = makePattern({ id: 'latest-p2', updated_at: '2026-03-01T00:00:00Z', name: 'Newer' });
      insertPattern(db, p);

      const older = { ...p, updated_at: '2026-01-01T00:00:00Z', name: 'Older' };
      const result = mergePattern(db, older, 'latest-wins');
      expect(result).toEqual({ imported: 0, skipped: 1, conflicts: 1 });
    });

    it('should overwrite with highest-confidence when incoming is higher', () => {
      const p = makePattern({ id: 'conf-p', confidence: 0.3 });
      insertPattern(db, p);

      const higher = { ...p, confidence: 0.9 };
      const result = mergePattern(db, higher, 'highest-confidence');
      expect(result).toEqual({ imported: 1, skipped: 0, conflicts: 1 });
    });

    it('should keep existing with highest-confidence when existing is higher', () => {
      const p = makePattern({ id: 'conf-p2', confidence: 0.9 });
      insertPattern(db, p);

      const lower = { ...p, confidence: 0.3 };
      const result = mergePattern(db, lower, 'highest-confidence');
      expect(result).toEqual({ imported: 0, skipped: 1, conflicts: 1 });
    });

    it('should skip duplicates with union strategy', () => {
      const p = makePattern({ id: 'union-p' });
      insertPattern(db, p);

      const result = mergePattern(db, p, 'union');
      expect(result).toEqual({ imported: 0, skipped: 1, conflicts: 1 });
    });
  });

  describe('mergeQValue', () => {
    let db: Database.Database;

    beforeEach(() => {
      db = createTestDb();
    });

    afterEach(() => {
      db.close();
    });

    it('should insert new q-value when no conflict', () => {
      const qv = makeQValue({ id: 'new-qv' });
      const result = mergeQValue(db, qv, 'skip-conflicts');
      expect(result).toEqual({ imported: 1, skipped: 0, conflicts: 0 });
    });

    it('should skip existing with skip-conflicts strategy', () => {
      const qv = makeQValue({ id: 'existing-qv' });
      insertQValue(db, qv);

      const result = mergeQValue(db, qv, 'skip-conflicts');
      expect(result).toEqual({ imported: 0, skipped: 1, conflicts: 1 });
    });

    it('should use q_value as confidence proxy for highest-confidence', () => {
      const qv = makeQValue({ id: 'conf-qv', q_value: 0.3 });
      insertQValue(db, qv);

      const higher = { ...qv, q_value: 0.9 };
      const result = mergeQValue(db, higher, 'highest-confidence');
      expect(result).toEqual({ imported: 1, skipped: 0, conflicts: 1 });
    });

    it('should overwrite older with latest-wins strategy', () => {
      const qv = makeQValue({ id: 'latest-qv', updated_at: '2026-01-01T00:00:00Z' });
      insertQValue(db, qv);

      const newer = { ...qv, updated_at: '2026-03-01T00:00:00Z' };
      const result = mergeQValue(db, newer, 'latest-wins');
      expect(result).toEqual({ imported: 1, skipped: 0, conflicts: 1 });
    });
  });

  describe('mergeDreamInsight', () => {
    let db: Database.Database;

    beforeEach(() => {
      db = createTestDb();
    });

    afterEach(() => {
      db.close();
    });

    it('should insert new insight when no conflict', () => {
      const ins = makeInsight({ id: 'new-di' });
      const result = mergeDreamInsight(db, ins, 'skip-conflicts');
      expect(result).toEqual({ imported: 1, skipped: 0, conflicts: 0 });
    });

    it('should skip existing with skip-conflicts strategy', () => {
      const ins = makeInsight({ id: 'existing-di' });
      insertDreamInsight(db, ins);

      const result = mergeDreamInsight(db, ins, 'skip-conflicts');
      expect(result).toEqual({ imported: 0, skipped: 1, conflicts: 1 });
    });

    it('should overwrite with highest-confidence when incoming is higher', () => {
      const ins = makeInsight({ id: 'conf-di', confidence_score: 0.3 });
      insertDreamInsight(db, ins);

      const higher = { ...ins, confidence_score: 0.9 };
      const result = mergeDreamInsight(db, higher, 'highest-confidence');
      expect(result).toEqual({ imported: 1, skipped: 0, conflicts: 1 });
    });

    it('should overwrite with latest-wins when incoming is newer', () => {
      const ins = makeInsight({ id: 'latest-di', created_at: '2026-01-01T00:00:00Z' });
      insertDreamInsight(db, ins);

      const newer = { ...ins, created_at: '2026-03-01T00:00:00Z' };
      const result = mergeDreamInsight(db, newer, 'latest-wins');
      expect(result).toEqual({ imported: 1, skipped: 0, conflicts: 1 });
    });
  });

  describe('mergeWitnessEntry', () => {
    let db: Database.Database;

    beforeEach(() => {
      db = createTestDb();
    });

    afterEach(() => {
      db.close();
    });

    it('should insert new witness entry', () => {
      const entry = makeWitness();
      const result = mergeWitnessEntry(db, entry, 'skip-conflicts');
      expect(result).toEqual({ imported: 1, skipped: 0, conflicts: 0 });
    });

    it('should dedup by action_hash + timestamp', () => {
      const entry = makeWitness({ action_hash: 'abc123', timestamp: '2026-02-20T10:00:00Z' });
      insertWitnessEntry(db, entry);

      const result = mergeWitnessEntry(db, entry, 'skip-conflicts');
      expect(result).toEqual({ imported: 0, skipped: 1, conflicts: 1 });
    });

    it('should insert when action_hash differs', () => {
      const entry1 = makeWitness({ action_hash: 'hash-1', timestamp: '2026-02-20T10:00:00Z' });
      insertWitnessEntry(db, entry1);

      const entry2 = makeWitness({ action_hash: 'hash-2', timestamp: '2026-02-20T10:00:00Z' });
      const result = mergeWitnessEntry(db, entry2, 'skip-conflicts');
      expect(result).toEqual({ imported: 1, skipped: 0, conflicts: 0 });
    });

    it('should skip duplicates regardless of strategy', () => {
      const entry = makeWitness({ action_hash: 'same', timestamp: '2026-02-20T10:00:00Z' });
      insertWitnessEntry(db, entry);

      const strategies: MergeStrategy[] = ['latest-wins', 'highest-confidence', 'union', 'skip-conflicts'];
      for (const strategy of strategies) {
        const result = mergeWitnessEntry(db, entry, strategy);
        expect(result.skipped).toBe(1);
      }
    });
  });

  // ============================================================================
  // BLOB Serialization (Phase 3)
  // ============================================================================

  describe('TABLE_BLOB_COLUMNS', () => {
    it('should map expected tables to their BLOB columns', () => {
      expect(TABLE_BLOB_COLUMNS.qe_pattern_embeddings).toEqual(['embedding']);
      expect(TABLE_BLOB_COLUMNS.captured_experiences).toEqual(['embedding']);
      expect(TABLE_BLOB_COLUMNS.sona_patterns).toEqual(['state_embedding', 'action_embedding']);
      expect(TABLE_BLOB_COLUMNS.pattern_versions).toEqual(['embedding']);
      expect(TABLE_BLOB_COLUMNS.concept_nodes).toEqual(['embedding']);
      expect(TABLE_BLOB_COLUMNS.vectors).toEqual(['embedding']);
    });

    it('should cover 6 tables', () => {
      expect(Object.keys(TABLE_BLOB_COLUMNS)).toHaveLength(6);
    });
  });

  describe('serializeRowBlobs', () => {
    it('should convert Buffer columns to Base64 strings', () => {
      const buf = Buffer.from([1, 2, 3, 4]);
      const row = { id: 'test', embedding: buf, other: 'keep' };
      const result = serializeRowBlobs(row, ['embedding']);
      expect(result._embedding_b64).toBe(buf.toString('base64'));
      expect(result.embedding).toBeUndefined();
      expect(result.other).toBe('keep');
      expect(result.id).toBe('test');
    });

    it('should handle multiple BLOB columns', () => {
      const buf1 = Buffer.from([10, 20]);
      const buf2 = Buffer.from([30, 40]);
      const row = { id: 's1', state_embedding: buf1, action_embedding: buf2 };
      const result = serializeRowBlobs(row, ['state_embedding', 'action_embedding']);
      expect(result._state_embedding_b64).toBe(buf1.toString('base64'));
      expect(result._action_embedding_b64).toBe(buf2.toString('base64'));
      expect(result.state_embedding).toBeUndefined();
      expect(result.action_embedding).toBeUndefined();
    });

    it('should skip non-Buffer values', () => {
      const row = { id: 'test', embedding: null, name: 'pat' };
      const result = serializeRowBlobs(row, ['embedding']);
      expect(result.embedding).toBeNull();
      expect(result._embedding_b64).toBeUndefined();
    });

    it('should not mutate the original row', () => {
      const buf = Buffer.from([5, 6]);
      const row = { id: 'test', embedding: buf };
      serializeRowBlobs(row, ['embedding']);
      expect(row.embedding).toBe(buf);
    });
  });

  describe('deserializeRowBlobs', () => {
    it('should convert Base64 strings back to Buffers', () => {
      const original = Buffer.from([1, 2, 3, 4]);
      const row = { id: 'test', _embedding_b64: original.toString('base64'), other: 'keep' };
      const result = deserializeRowBlobs(row, ['embedding']);
      expect(result.embedding).toBeInstanceOf(Buffer);
      expect(Buffer.compare(result.embedding as Buffer, original)).toBe(0);
      expect(result._embedding_b64).toBeUndefined();
      expect(result.other).toBe('keep');
    });

    it('should handle multiple BLOB columns', () => {
      const buf1 = Buffer.from([10, 20]);
      const buf2 = Buffer.from([30, 40]);
      const row = {
        id: 's1',
        _state_embedding_b64: buf1.toString('base64'),
        _action_embedding_b64: buf2.toString('base64'),
      };
      const result = deserializeRowBlobs(row, ['state_embedding', 'action_embedding']);
      expect(Buffer.compare(result.state_embedding as Buffer, buf1)).toBe(0);
      expect(Buffer.compare(result.action_embedding as Buffer, buf2)).toBe(0);
    });

    it('should skip missing Base64 keys', () => {
      const row = { id: 'test', name: 'pat' };
      const result = deserializeRowBlobs(row, ['embedding']);
      expect(result.embedding).toBeUndefined();
    });

    it('should not mutate the original row', () => {
      const b64 = Buffer.from([5, 6]).toString('base64');
      const row = { id: 'test', _embedding_b64: b64 };
      deserializeRowBlobs(row, ['embedding']);
      expect(row._embedding_b64).toBe(b64);
    });
  });

  describe('BLOB round-trip', () => {
    it('should round-trip arbitrary binary data through Base64', () => {
      // 384-dim Float32Array simulating a real embedding
      const dims = 384;
      const float32 = new Float32Array(dims);
      for (let i = 0; i < dims; i++) float32[i] = Math.random() * 2 - 1;
      const original = Buffer.from(float32.buffer);

      const serialized = serializeRowBlobs(
        { pattern_id: 'p1', embedding: original, dimension: dims },
        ['embedding']
      );
      expect(serialized._embedding_b64).toBeDefined();

      const deserialized = deserializeRowBlobs(serialized, ['embedding']);
      expect(deserialized.embedding).toBeInstanceOf(Buffer);
      const restored = new Float32Array(
        (deserialized.embedding as Buffer).buffer,
        (deserialized.embedding as Buffer).byteOffset,
        dims
      );
      for (let i = 0; i < dims; i++) {
        expect(restored[i]).toBeCloseTo(float32[i], 6);
      }
    });
  });

  // --------------------------------------------------------------------------
  // TABLE_CONFIGS
  // --------------------------------------------------------------------------

  describe('TABLE_CONFIGS', () => {
    it('should contain 25 table entries', () => {
      expect(TABLE_CONFIGS).toHaveLength(25);
    });

    it('should list all table names uniquely', () => {
      const names = TABLE_CONFIGS.map(c => c.tableName);
      expect(new Set(names).size).toBe(names.length);
    });

    it('should list all file names uniquely', () => {
      const files = TABLE_CONFIGS.map(c => c.fileName);
      expect(new Set(files).size).toBe(files.length);
    });

    it('should have qe_patterns first for FK ordering', () => {
      expect(TABLE_CONFIGS[0].tableName).toBe('qe_patterns');
    });

    it('should have dream_cycles before dream_insights for FK ordering', () => {
      const cycleIdx = TABLE_CONFIGS.findIndex(c => c.tableName === 'dream_cycles');
      const insightIdx = TABLE_CONFIGS.findIndex(c => c.tableName === 'dream_insights');
      expect(cycleIdx).toBeLessThan(insightIdx);
    });

    it('should have concept_nodes before concept_edges for FK ordering', () => {
      const nodeIdx = TABLE_CONFIGS.findIndex(c => c.tableName === 'concept_nodes');
      const edgeIdx = TABLE_CONFIGS.findIndex(c => c.tableName === 'concept_edges');
      expect(nodeIdx).toBeLessThan(edgeIdx);
    });
  });

  // --------------------------------------------------------------------------
  // Shared merge column maps
  // --------------------------------------------------------------------------

  describe('PK_COLUMNS', () => {
    it('should map qe_pattern_embeddings to pattern_id', () => {
      expect(PK_COLUMNS['qe_pattern_embeddings']).toBe('pattern_id');
    });

    it('should not have entries for standard id-pk tables', () => {
      expect(PK_COLUMNS['qe_patterns']).toBeUndefined();
      expect(PK_COLUMNS['captured_experiences']).toBeUndefined();
    });
  });

  describe('CONFIDENCE_COLUMNS', () => {
    it('should map known tables to their confidence column', () => {
      expect(CONFIDENCE_COLUMNS['qe_patterns']).toBe('confidence');
      expect(CONFIDENCE_COLUMNS['rl_q_values']).toBe('q_value');
      expect(CONFIDENCE_COLUMNS['dream_insights']).toBe('confidence_score');
      expect(CONFIDENCE_COLUMNS['captured_experiences']).toBe('quality');
      expect(CONFIDENCE_COLUMNS['sona_patterns']).toBe('confidence');
    });

    it('should not include tables without confidence semantics', () => {
      expect(CONFIDENCE_COLUMNS['witness_chain']).toBeUndefined();
      expect(CONFIDENCE_COLUMNS['goap_actions']).toBeUndefined();
    });
  });

  describe('TIMESTAMP_COLUMNS', () => {
    it('should map known tables to their updated_at column', () => {
      expect(TIMESTAMP_COLUMNS['qe_patterns']).toBe('updated_at');
      expect(TIMESTAMP_COLUMNS['rl_q_values']).toBe('updated_at');
      expect(TIMESTAMP_COLUMNS['sona_patterns']).toBe('updated_at');
      expect(TIMESTAMP_COLUMNS['goap_actions']).toBe('updated_at');
      expect(TIMESTAMP_COLUMNS['concept_edges']).toBe('updated_at');
    });

    it('should not include append-only tables', () => {
      expect(TIMESTAMP_COLUMNS['witness_chain']).toBeUndefined();
      expect(TIMESTAMP_COLUMNS['qe_pattern_usage']).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // domainFilterForColumn
  // --------------------------------------------------------------------------

  describe('domainFilterForColumn', () => {
    it('should return undefined clause for empty domains', () => {
      const [clause, params] = domainFilterForColumn(undefined, 'domain');
      expect(clause).toBeUndefined();
      expect(params).toEqual([]);
    });

    it('should use the specified column name', () => {
      const [clause, params] = domainFilterForColumn(['test-gen'], 'domain');
      expect(clause).toBe('domain IN (?)');
      expect(params).toEqual(['test-gen']);
    });

    it('should handle multiple domains with custom column', () => {
      const [clause, params] = domainFilterForColumn(['a', 'b'], 'qe_domain');
      expect(clause).toBe('qe_domain IN (?, ?)');
      expect(params).toEqual(['a', 'b']);
    });
  });

  // --------------------------------------------------------------------------
  // mergeGenericRow
  // --------------------------------------------------------------------------

  describe('mergeGenericRow', () => {
    let db: Database.Database;

    beforeEach(() => {
      db = createTestDb();
    });

    afterEach(() => {
      db.close();
    });

    it('should insert new row into captured_experiences', () => {
      const row = {
        id: 'exp-1', task: 'test-task', agent: 'agent-1',
        domain: 'test-gen', success: 1, quality: 0.8,
        duration_ms: 100, started_at: '2026-02-20T10:00:00Z',
        completed_at: '2026-02-20T10:00:00Z',
      };
      const result = mergeGenericRow(db, 'captured_experiences', row, 'id', 'skip-conflicts');
      expect(result).toEqual({ imported: 1, skipped: 0, conflicts: 0 });

      const found = db.prepare('SELECT * FROM captured_experiences WHERE id = ?').get('exp-1') as Record<string, unknown>;
      expect(found.task).toBe('test-task');
      expect(found.quality).toBe(0.8);
    });

    it('should skip conflict with skip-conflicts strategy', () => {
      const row = {
        id: 'exp-2', task: 'task', agent: 'a', domain: 'd',
        success: 1, quality: 0.5, duration_ms: 50,
        completed_at: '2026-02-20T10:00:00Z',
      };
      mergeGenericRow(db, 'captured_experiences', row, 'id', 'skip-conflicts');
      const result = mergeGenericRow(db, 'captured_experiences', row, 'id', 'skip-conflicts');
      expect(result).toEqual({ imported: 0, skipped: 1, conflicts: 1 });
    });

    it('should use latest-wins with specified timestamp column', () => {
      const row1 = {
        id: 'sona-1', type: 'test', domain: 'd', action_type: 'act',
        outcome_reward: 0.5, outcome_success: 1, outcome_quality: 0.5,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      };
      mergeGenericRow(db, 'sona_patterns', row1, 'id', 'skip-conflicts');

      const row2 = { ...row1, updated_at: '2026-03-01T00:00:00Z', outcome_quality: 0.9 };
      const result = mergeGenericRow(db, 'sona_patterns', row2, 'id', 'latest-wins', 'updated_at');
      expect(result).toEqual({ imported: 1, skipped: 0, conflicts: 1 });
    });

    it('should insert into goap_actions table', () => {
      const row = {
        id: 'ga-1', name: 'test-action', agent_type: 'coder',
        preconditions: '{}', effects: '{}', category: 'test',
        qe_domain: 'test-gen', created_at: '2026-02-20T10:00:00Z',
      };
      const result = mergeGenericRow(db, 'goap_actions', row, 'id', 'skip-conflicts');
      expect(result).toEqual({ imported: 1, skipped: 0, conflicts: 0 });

      const found = db.prepare('SELECT * FROM goap_actions WHERE id = ?').get('ga-1') as Record<string, unknown>;
      expect(found.name).toBe('test-action');
    });

    it('should insert into concept_nodes table', () => {
      const row = {
        id: 'cn-1', concept_type: 'pattern', content: 'test content',
        activation_level: 0.5, created_at: '2026-02-20T10:00:00Z',
      };
      const result = mergeGenericRow(db, 'concept_nodes', row, 'id', 'skip-conflicts');
      expect(result).toEqual({ imported: 1, skipped: 0, conflicts: 0 });
    });

    it('should insert and merge concept_edges', () => {
      // Insert parent nodes first
      db.prepare('INSERT INTO concept_nodes (id, concept_type, content) VALUES (?, ?, ?)').run('n1', 'type', 'c1');
      db.prepare('INSERT INTO concept_nodes (id, concept_type, content) VALUES (?, ?, ?)').run('n2', 'type', 'c2');

      const edge = {
        id: 'e1', source: 'n1', target: 'n2', weight: 0.8,
        edge_type: 'related', evidence: 3,
        created_at: '2026-02-20T10:00:00Z', updated_at: '2026-02-20T10:00:00Z',
      };
      const result = mergeGenericRow(db, 'concept_edges', edge, 'id', 'skip-conflicts');
      expect(result).toEqual({ imported: 1, skipped: 0, conflicts: 0 });
    });
  });

  // --------------------------------------------------------------------------
  // mergeAppendOnlyRow
  // --------------------------------------------------------------------------

  describe('mergeAppendOnlyRow', () => {
    let db: Database.Database;

    beforeEach(() => {
      db = createTestDb();
    });

    afterEach(() => {
      db.close();
    });

    it('should insert a new qe_pattern_usage row', () => {
      const row = {
        pattern_id: 'p1', success: 1, metrics_json: '{}',
        created_at: '2026-02-20T10:00:00Z',
      };
      const result = mergeAppendOnlyRow(db, 'qe_pattern_usage', row, ['pattern_id', 'created_at']);
      expect(result).toEqual({ imported: 1, skipped: 0, conflicts: 0 });

      const count = (db.prepare('SELECT COUNT(*) as cnt FROM qe_pattern_usage').get() as { cnt: number }).cnt;
      expect(count).toBe(1);
    });

    it('should deduplicate by composite columns', () => {
      const row = {
        pattern_id: 'p1', success: 1, metrics_json: '{}',
        created_at: '2026-02-20T10:00:00Z',
      };
      mergeAppendOnlyRow(db, 'qe_pattern_usage', row, ['pattern_id', 'created_at']);
      const result = mergeAppendOnlyRow(db, 'qe_pattern_usage', row, ['pattern_id', 'created_at']);
      expect(result).toEqual({ imported: 0, skipped: 1, conflicts: 1 });
    });

    it('should allow same pattern_id with different created_at', () => {
      const row1 = { pattern_id: 'p1', success: 1, created_at: '2026-01-01T00:00:00Z' };
      const row2 = { pattern_id: 'p1', success: 0, created_at: '2026-02-01T00:00:00Z' };
      mergeAppendOnlyRow(db, 'qe_pattern_usage', row1, ['pattern_id', 'created_at']);
      mergeAppendOnlyRow(db, 'qe_pattern_usage', row2, ['pattern_id', 'created_at']);

      const count = (db.prepare('SELECT COUNT(*) as cnt FROM qe_pattern_usage').get() as { cnt: number }).cnt;
      expect(count).toBe(2);
    });
  });
});

// ============================================================================
// Streaming: queryIterator and writeJsonlStreaming
// ============================================================================

describe('queryIterator', () => {
  let db: Database.Database;

  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('should yield rows one at a time', () => {
    insertPattern(db, makePattern({ id: 'p1' }));
    insertPattern(db, makePattern({ id: 'p2' }));
    insertPattern(db, makePattern({ id: 'p3' }));

    const ids: string[] = [];
    for (const row of queryIterator(db, 'qe_patterns')) {
      ids.push((row as { id: string }).id);
    }
    expect(ids).toHaveLength(3);
    expect(ids).toContain('p1');
    expect(ids).toContain('p2');
    expect(ids).toContain('p3');
  });

  it('should return empty iterator for missing table', () => {
    const rows = [...queryIterator(db, 'nonexistent_table')];
    expect(rows).toHaveLength(0);
  });

  it('should support where clause and params', () => {
    insertPattern(db, makePattern({ id: 'p1', qe_domain: 'security' }));
    insertPattern(db, makePattern({ id: 'p2', qe_domain: 'testing' }));
    insertPattern(db, makePattern({ id: 'p3', qe_domain: 'security' }));

    const rows = [...queryIterator(db, 'qe_patterns', 'qe_domain = ?', ['security'])];
    expect(rows).toHaveLength(2);
  });
});

describe('writeJsonlStreaming', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `brain-stream-test-${randomUUID().slice(0, 8)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true }); } catch { /* best effort */ }
  });

  it('should write rows from an iterator to JSONL', () => {
    const filePath = join(tmpDir, 'test.jsonl');
    const data = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }];

    const count = writeJsonlStreaming(filePath, data);
    expect(count).toBe(2);

    // Read back and verify
    const result = readJsonl(filePath);
    expect(result).toHaveLength(2);
    expect((result[0] as { id: number }).id).toBe(1);
    expect((result[1] as { name: string }).name).toBe('b');
  });

  it('should apply transform function', () => {
    const filePath = join(tmpDir, 'transformed.jsonl');
    const data = [{ value: 10 }, { value: 20 }];

    const count = writeJsonlStreaming(filePath, data, (r) => ({
      ...(r as Record<string, unknown>),
      doubled: ((r as { value: number }).value) * 2,
    }));
    expect(count).toBe(2);

    const result = readJsonl(filePath);
    expect((result[0] as { doubled: number }).doubled).toBe(20);
    expect((result[1] as { doubled: number }).doubled).toBe(40);
  });

  it('should handle empty iterator', () => {
    const filePath = join(tmpDir, 'empty.jsonl');
    const count = writeJsonlStreaming(filePath, []);
    expect(count).toBe(0);
  });

  it('should work with a generator', () => {
    const filePath = join(tmpDir, 'generator.jsonl');
    function* gen() {
      yield { n: 1 };
      yield { n: 2 };
      yield { n: 3 };
    }
    const count = writeJsonlStreaming(filePath, gen());
    expect(count).toBe(3);

    const result = readJsonl(filePath);
    expect(result).toHaveLength(3);
  });
});
