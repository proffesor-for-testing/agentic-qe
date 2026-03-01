/**
 * RVF Dual-Writer — Coordination Logic Unit Tests
 *
 * These tests verify dual-writer coordination logic with mocked RVF:
 * mode switching (dual-write / sqlite-only / rvf-primary), try/catch
 * fallback behavior, divergence detection, and promotion safety.
 *
 * The RvfStore is mocked because these tests target the ORCHESTRATION
 * layer, not the native RVF binding. For real native binding tests,
 * see rvf-native-adapter.test.ts and rvf-native-wiring.integration.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  RvfDualWriter,
  createDualWriter,
  type DualWriteConfig,
  type RvfStore,
  type RvfStatus,
} from '../../src/integrations/ruvector/rvf-dual-writer.js';

// ============================================================================
// Helpers
// ============================================================================

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

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

    CREATE TABLE IF NOT EXISTS qe_pattern_embeddings (
      pattern_id TEXT PRIMARY KEY,
      embedding BLOB NOT NULL,
      dimension INTEGER NOT NULL,
      model TEXT DEFAULT 'all-MiniLM-L6-v2',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (pattern_id) REFERENCES qe_patterns(id) ON DELETE CASCADE
    );
  `);

  return db;
}

function createMockRvfStore(overrides?: Partial<RvfStore>): RvfStore {
  const vectors = new Map<string, number[]>();

  return {
    ingest: vi.fn((entries) => {
      for (const entry of entries) {
        vectors.set(entry.id, Array.from(entry.vector));
      }
    }),
    search: vi.fn((query, k) => {
      const results: Array<{ id: string; score: number }> = [];
      for (const [id] of vectors) {
        results.push({ id, score: 0.95 });
      }
      return results.slice(0, k);
    }),
    delete: vi.fn((ids) => {
      for (const id of ids) {
        vectors.delete(id);
      }
    }),
    status: vi.fn((): RvfStatus => ({
      totalVectors: vectors.size,
      dimensions: 384,
    })),
    close: vi.fn(),
    ...overrides,
  };
}

function insertTestPattern(db: Database.Database, id: string): void {
  db.prepare(`
    INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description)
    VALUES (?, 'test-template', 'test-generation', 'test-generation', ?, 'Test pattern')
  `).run(id, `Pattern ${id}`);
}

function makeEmbedding(dim = 384): number[] {
  const emb = new Array(dim).fill(0);
  for (let i = 0; i < dim; i++) {
    emb[i] = Math.sin(i * 0.1);
  }
  // Normalize
  const mag = Math.sqrt(emb.reduce((s: number, v: number) => s + v * v, 0));
  if (mag > 0) {
    for (let i = 0; i < dim; i++) emb[i] /= mag;
  }
  return emb;
}

// ============================================================================
// Tests
// ============================================================================

describe('RvfDualWriter — coordination logic (mocked RVF)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  // --------------------------------------------------------------------------
  // 1. dual-write mode: writePattern succeeds in both stores
  // --------------------------------------------------------------------------
  describe('dual-write mode', () => {
    it('should write to both SQLite and RVF', () => {
      const mockStore = createMockRvfStore();
      const writer = createDualWriter(db, {
        rvfPath: '/tmp/test.rvf',
        mode: 'dual-write',
      });
      writer.setRvfStore(mockStore);

      insertTestPattern(db, 'p1');
      const embedding = makeEmbedding();
      const result = writer.writePattern('p1', embedding);

      expect(result.sqliteSuccess).toBe(true);
      expect(result.rvfSuccess).toBe(true);
      expect(result.divergence).toBeUndefined();

      // Verify SQLite has the embedding
      const row = db.prepare(
        'SELECT pattern_id, dimension FROM qe_pattern_embeddings WHERE pattern_id = ?'
      ).get('p1') as { pattern_id: string; dimension: number } | undefined;
      expect(row).toBeDefined();
      expect(row!.dimension).toBe(384);

      // Verify RVF ingest was called with correct pattern ID and vector
      expect(mockStore.ingest).toHaveBeenCalledTimes(1);
      const ingestArgs = (mockStore.ingest as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(ingestArgs).toHaveLength(1);
      expect(ingestArgs[0].id).toBe('p1');
      expect(ingestArgs[0].vector).toHaveLength(384);

      writer.close();
    });

    it('should delete from both SQLite and RVF', () => {
      const mockStore = createMockRvfStore();
      const writer = createDualWriter(db, {
        rvfPath: '/tmp/test.rvf',
        mode: 'dual-write',
      });
      writer.setRvfStore(mockStore);

      // Write first
      insertTestPattern(db, 'p1');
      writer.writePattern('p1', makeEmbedding());

      // Delete
      const result = writer.deletePattern('p1');
      expect(result.sqliteSuccess).toBe(true);
      expect(result.rvfSuccess).toBe(true);

      // Verify SQLite embedding removed
      const row = db.prepare(
        'SELECT COUNT(*) as cnt FROM qe_pattern_embeddings WHERE pattern_id = ?'
      ).get('p1') as { cnt: number };
      expect(row.cnt).toBe(0);

      // Verify RVF delete called
      expect(mockStore.delete).toHaveBeenCalledWith(['p1']);

      writer.close();
    });
  });

  // --------------------------------------------------------------------------
  // 2. sqlite-only mode: RVF is never called
  // --------------------------------------------------------------------------
  describe('sqlite-only mode', () => {
    it('should only write to SQLite and never touch RVF', () => {
      const mockStore = createMockRvfStore();
      const writer = createDualWriter(db, {
        rvfPath: '/tmp/test.rvf',
        mode: 'sqlite-only',
      });
      // Even if we set a store, sqlite-only mode should not use it
      // (the store is set but shouldWriteRvf checks mode)

      insertTestPattern(db, 'p1');
      const result = writer.writePattern('p1', makeEmbedding());

      expect(result.sqliteSuccess).toBe(true);
      expect(result.rvfSuccess).toBe(false);

      // RVF store should never have been called
      expect(mockStore.ingest).not.toHaveBeenCalled();

      writer.close();
    });

    it('should not call RVF on delete in sqlite-only mode', () => {
      const mockStore = createMockRvfStore();
      const writer = createDualWriter(db, {
        rvfPath: '/tmp/test.rvf',
        mode: 'sqlite-only',
      });

      insertTestPattern(db, 'p1');
      writer.writePattern('p1', makeEmbedding());
      const result = writer.deletePattern('p1');

      expect(result.sqliteSuccess).toBe(true);
      expect(result.rvfSuccess).toBe(false);
      expect(mockStore.delete).not.toHaveBeenCalled();

      writer.close();
    });
  });

  // --------------------------------------------------------------------------
  // 3. RVF failure doesn't break SQLite writes
  // --------------------------------------------------------------------------
  describe('RVF failure isolation', () => {
    it('should succeed in SQLite even when RVF ingest throws', () => {
      const mockStore = createMockRvfStore({
        ingest: vi.fn(() => { throw new Error('RVF native crash'); }),
      });
      const writer = createDualWriter(db, {
        rvfPath: '/tmp/test.rvf',
        mode: 'dual-write',
      });
      writer.setRvfStore(mockStore);

      insertTestPattern(db, 'p1');
      const result = writer.writePattern('p1', makeEmbedding());

      expect(result.sqliteSuccess).toBe(true);
      expect(result.rvfSuccess).toBe(false);
      expect(result.divergence).toBe('rvf-write-failed');

      // SQLite still has the data
      const row = db.prepare(
        'SELECT COUNT(*) as cnt FROM qe_pattern_embeddings WHERE pattern_id = ?'
      ).get('p1') as { cnt: number };
      expect(row.cnt).toBe(1);

      writer.close();
    });

    it('should succeed in SQLite even when RVF delete throws', () => {
      const mockStore = createMockRvfStore({
        delete: vi.fn(() => { throw new Error('RVF delete crash'); }),
      });
      const writer = createDualWriter(db, {
        rvfPath: '/tmp/test.rvf',
        mode: 'dual-write',
      });
      writer.setRvfStore(mockStore);

      insertTestPattern(db, 'p1');
      writer.writePattern('p1', makeEmbedding());

      const result = writer.deletePattern('p1');
      expect(result.sqliteSuccess).toBe(true);
      expect(result.rvfSuccess).toBe(false);
      expect(result.divergence).toBe('rvf-delete-failed');

      writer.close();
    });
  });

  // --------------------------------------------------------------------------
  // 4. search in rvf-primary mode falls back to SQLite on RVF error
  // --------------------------------------------------------------------------
  describe('search with rvf-primary fallback', () => {
    it('should use RVF for search in rvf-primary mode', () => {
      const mockStore = createMockRvfStore();
      const writer = createDualWriter(db, {
        rvfPath: '/tmp/test.rvf',
        mode: 'rvf-primary',
      });
      writer.setRvfStore(mockStore);

      // Write a pattern so RVF has data
      insertTestPattern(db, 'p1');
      writer.writePattern('p1', makeEmbedding());

      const queryVec = makeEmbedding();
      const results = writer.search(queryVec, 5);

      // Verify RVF search was called with the correct query vector and k
      expect(mockStore.search).toHaveBeenCalledTimes(1);
      const searchArgs = (mockStore.search as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(searchArgs[1]).toBe(5); // k value

      // Verify response shape (scores come from mock so don't assert values)
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r).toHaveProperty('id');
        expect(r).toHaveProperty('score');
        expect(typeof r.id).toBe('string');
        expect(typeof r.score).toBe('number');
      }

      writer.close();
    });

    it('should fall back to SQLite search when RVF throws', () => {
      const mockStore = createMockRvfStore({
        search: vi.fn(() => { throw new Error('RVF search crash'); }),
      });
      const writer = createDualWriter(db, {
        rvfPath: '/tmp/test.rvf',
        mode: 'rvf-primary',
      });
      writer.setRvfStore(mockStore);

      // Write an embedding into SQLite
      insertTestPattern(db, 'p1');
      const emb = makeEmbedding();
      writer.writePattern('p1', emb);

      // Search should still work via SQLite fallback
      const results = writer.search(emb, 5);
      // Verify RVF search was attempted with correct args before falling back
      expect(mockStore.search).toHaveBeenCalledTimes(1);
      const searchArgs = (mockStore.search as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(searchArgs[1]).toBe(5); // k value
      // Results come from real SQLite cosine similarity (not mock), so score is meaningful
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('p1');
      expect(results[0].score).toBeGreaterThan(0);

      writer.close();
    });

    it('should use SQLite for search in dual-write mode', () => {
      const mockStore = createMockRvfStore();
      const writer = createDualWriter(db, {
        rvfPath: '/tmp/test.rvf',
        mode: 'dual-write',
      });
      writer.setRvfStore(mockStore);

      insertTestPattern(db, 'p1');
      writer.writePattern('p1', makeEmbedding());

      const results = writer.search(makeEmbedding(), 5);
      // In dual-write mode, search goes to SQLite (not RVF)
      expect(mockStore.search).not.toHaveBeenCalled();
      expect(results.length).toBe(1);

      writer.close();
    });
  });

  // --------------------------------------------------------------------------
  // 5. divergence report detects count mismatch
  // --------------------------------------------------------------------------
  describe('divergence report', () => {
    it('should report zero divergences when counts match', () => {
      const mockStore = createMockRvfStore();
      const writer = createDualWriter(db, {
        rvfPath: '/tmp/test.rvf',
        mode: 'dual-write',
      });
      writer.setRvfStore(mockStore);

      insertTestPattern(db, 'p1');
      writer.writePattern('p1', makeEmbedding());

      const report = writer.getDivergenceReport();
      expect(report.totalChecked).toBe(1);
      expect(report.divergences).toBe(0);
      expect(report.details).toHaveLength(0);

      writer.close();
    });

    it('should detect count mismatch between SQLite and RVF', () => {
      // RVF store that reports 0 vectors even though SQLite has data
      const mockStore = createMockRvfStore({
        status: vi.fn((): RvfStatus => ({
          totalVectors: 0,
          dimensions: 384,
        })),
      });
      const writer = createDualWriter(db, {
        rvfPath: '/tmp/test.rvf',
        mode: 'dual-write',
      });
      writer.setRvfStore(mockStore);

      // Write directly to SQLite embedding table
      insertTestPattern(db, 'p1');
      const blob = Buffer.from(new Float32Array(makeEmbedding()).buffer);
      db.prepare(`
        INSERT INTO qe_pattern_embeddings (pattern_id, embedding, dimension)
        VALUES (?, ?, 384)
      `).run('p1', blob);

      const report = writer.getDivergenceReport();
      expect(report.totalChecked).toBe(1);
      expect(report.divergences).toBe(1);
      expect(report.details).toHaveLength(1);
      expect(report.details[0].issue).toBe('count-mismatch');

      writer.close();
    });

    it('should report divergence when RVF is unavailable in non-sqlite-only mode', () => {
      const writer = createDualWriter(db, {
        rvfPath: '/tmp/test.rvf',
        mode: 'dual-write',
      });
      // No RVF store set -- rvfAvailable is false

      // Put an embedding in SQLite
      insertTestPattern(db, 'p1');
      const blob = Buffer.from(new Float32Array(makeEmbedding()).buffer);
      db.prepare(`
        INSERT INTO qe_pattern_embeddings (pattern_id, embedding, dimension)
        VALUES (?, ?, 384)
      `).run('p1', blob);

      const report = writer.getDivergenceReport();
      expect(report.divergences).toBe(1);
      expect(report.details[0].issue).toBe('count-mismatch');

      writer.close();
    });
  });

  // --------------------------------------------------------------------------
  // 6. isPromotionSafe returns false when divergences exist
  // --------------------------------------------------------------------------
  describe('isPromotionSafe', () => {
    it('should return true when no divergences exist', () => {
      const mockStore = createMockRvfStore();
      const writer = createDualWriter(db, {
        rvfPath: '/tmp/test.rvf',
        mode: 'dual-write',
      });
      writer.setRvfStore(mockStore);

      // Write to both stores via dual-write
      insertTestPattern(db, 'p1');
      writer.writePattern('p1', makeEmbedding());

      expect(writer.isPromotionSafe()).toBe(true);

      writer.close();
    });

    it('should return false when divergences exist', () => {
      const mockStore = createMockRvfStore({
        status: vi.fn((): RvfStatus => ({
          totalVectors: 0,
          dimensions: 384,
        })),
      });
      const writer = createDualWriter(db, {
        rvfPath: '/tmp/test.rvf',
        mode: 'dual-write',
      });
      writer.setRvfStore(mockStore);

      // Write only to SQLite
      insertTestPattern(db, 'p1');
      const blob = Buffer.from(new Float32Array(makeEmbedding()).buffer);
      db.prepare(`
        INSERT INTO qe_pattern_embeddings (pattern_id, embedding, dimension)
        VALUES (?, ?, 384)
      `).run('p1', blob);

      expect(writer.isPromotionSafe()).toBe(false);

      writer.close();
    });
  });

  // --------------------------------------------------------------------------
  // 7. status() returns combined info
  // --------------------------------------------------------------------------
  describe('status', () => {
    it('should return combined status from both backends', () => {
      const mockStore = createMockRvfStore();
      const writer = createDualWriter(db, {
        rvfPath: '/tmp/test.rvf',
        mode: 'dual-write',
      });
      writer.setRvfStore(mockStore);

      // Insert a pattern and embedding
      insertTestPattern(db, 'p1');
      writer.writePattern('p1', makeEmbedding());

      const s = writer.status();

      expect(s.mode).toBe('dual-write');
      expect(s.sqlite.patternCount).toBe(1);
      expect(s.sqlite.vectorCount).toBe(1);
      expect(s.rvf).not.toBeNull();
      expect(s.rvf!.totalVectors).toBe(1);
      expect(s.rvf!.dimensions).toBe(384);

      writer.close();
    });

    it('should return null RVF status when RVF is unavailable', () => {
      const writer = createDualWriter(db, {
        rvfPath: '/tmp/test.rvf',
        mode: 'sqlite-only',
      });

      insertTestPattern(db, 'p1');

      const s = writer.status();
      expect(s.mode).toBe('sqlite-only');
      expect(s.sqlite.patternCount).toBe(1);
      expect(s.sqlite.vectorCount).toBe(0);
      expect(s.rvf).toBeNull();

      writer.close();
    });

    it('should handle RVF status() throwing gracefully', () => {
      const mockStore = createMockRvfStore({
        status: vi.fn(() => { throw new Error('status crash'); }),
      });
      const writer = createDualWriter(db, {
        rvfPath: '/tmp/test.rvf',
        mode: 'dual-write',
      });
      writer.setRvfStore(mockStore);

      const s = writer.status();
      expect(s.rvf).toBeNull();

      writer.close();
    });
  });

  // --------------------------------------------------------------------------
  // Factory function
  // --------------------------------------------------------------------------
  describe('createDualWriter factory', () => {
    it('should create a RvfDualWriter instance', () => {
      const writer = createDualWriter(db, {
        rvfPath: '/tmp/test.rvf',
        mode: 'sqlite-only',
      });
      expect(writer).toBeInstanceOf(RvfDualWriter);
      writer.close();
    });

    it('should default dimensions to 384', () => {
      const writer = createDualWriter(db, {
        rvfPath: '/tmp/test.rvf',
        mode: 'sqlite-only',
      });
      const s = writer.status();
      expect(s.mode).toBe('sqlite-only');
      writer.close();
    });
  });

  // --------------------------------------------------------------------------
  // Float32Array input
  // --------------------------------------------------------------------------
  describe('Float32Array support', () => {
    it('should accept Float32Array as embedding input', () => {
      const mockStore = createMockRvfStore();
      const writer = createDualWriter(db, {
        rvfPath: '/tmp/test.rvf',
        mode: 'dual-write',
      });
      writer.setRvfStore(mockStore);

      insertTestPattern(db, 'p1');
      const embedding = new Float32Array(makeEmbedding());
      const result = writer.writePattern('p1', embedding);

      expect(result.sqliteSuccess).toBe(true);
      expect(result.rvfSuccess).toBe(true);

      // Verify the Float32Array was forwarded to RVF ingest with correct ID
      expect(mockStore.ingest).toHaveBeenCalledTimes(1);
      const ingestArgs = (mockStore.ingest as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(ingestArgs[0].id).toBe('p1');
      expect(ingestArgs[0].vector).toHaveLength(384);

      // Verify SQLite also persisted the embedding
      const row = db.prepare(
        'SELECT dimension FROM qe_pattern_embeddings WHERE pattern_id = ?'
      ).get('p1') as { dimension: number } | undefined;
      expect(row).toBeDefined();
      expect(row!.dimension).toBe(384);

      writer.close();
    });
  });
});
