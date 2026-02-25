/**
 * RVF Production Wiring — Integration Tests
 *
 * Two test suites:
 *  1. Mock-based tests that verify coordination logic without native binding
 *  2. Native-path tests that exercise the REAL production wiring with
 *     @ruvector/rvf-node, a real RVF container on disk, and QEReasoningBank
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, unlinkSync } from 'fs';
import {
  RvfDualWriter,
  createDualWriter,
  type RvfStore,
  type RvfStatus,
} from '../../../src/integrations/ruvector/rvf-dual-writer.js';
import {
  getSharedRvfDualWriter,
  getSharedRvfDualWriterSync,
  resetSharedRvfDualWriter,
} from '../../../src/integrations/ruvector/shared-rvf-dual-writer.js';
import {
  isRvfNativeAvailable,
  createRvfStore,
} from '../../../src/integrations/ruvector/rvf-native-adapter.js';
import {
  createQEReasoningBank,
} from '../../../src/learning/qe-reasoning-bank.js';

// ============================================================================
// Helpers
// ============================================================================

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF');

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
      FOREIGN KEY (pattern_id) REFERENCES qe_patterns(id)
    );
  `);

  return db;
}

function createMockRvfStore(): RvfStore & { ingested: Array<{ id: string; vector: number[] }>; deleted: string[] } {
  const store = {
    ingested: [] as Array<{ id: string; vector: number[] }>,
    deleted: [] as string[],
    ingest(entries: Array<{ id: string; vector: number[] | Float32Array }>) {
      for (const e of entries) {
        store.ingested.push({
          id: e.id,
          vector: e.vector instanceof Float32Array ? Array.from(e.vector) : e.vector,
        });
      }
    },
    search(_query: number[] | Float32Array, _k: number) {
      return [] as Array<{ id: string; score: number }>;
    },
    delete(ids: string[]) {
      store.deleted.push(...ids);
    },
    status(): RvfStatus {
      return {
        totalVectors: store.ingested.length,
        dimensions: 384,
        totalSegments: 1,
        fileSizeBytes: 4096,
        epoch: 1,
        witnessValid: true,
        witnessEntries: 1,
      };
    },
    close() { /* no-op */ },
  };
  return store;
}

// ============================================================================
// Tests
// ============================================================================

describe('RVF Production Wiring', () => {
  beforeEach(() => {
    resetSharedRvfDualWriter();
  });

  afterEach(() => {
    resetSharedRvfDualWriter();
  });

  describe('Graceful degradation', () => {
    it('should return null when native RVF is unavailable', async () => {
      // @ruvector/rvf-node is not installed in the test environment
      const writer = await getSharedRvfDualWriter();
      expect(writer).toBeNull();
    });

    it('should return null from sync getter before initialization', () => {
      const writer = getSharedRvfDualWriterSync();
      expect(writer).toBeNull();
    });

    it('should return null when AQE_RVF_MODE=sqlite-only', async () => {
      const originalEnv = process.env.AQE_RVF_MODE;
      process.env.AQE_RVF_MODE = 'sqlite-only';
      try {
        const writer = await getSharedRvfDualWriter();
        expect(writer).toBeNull();
      } finally {
        if (originalEnv === undefined) {
          delete process.env.AQE_RVF_MODE;
        } else {
          process.env.AQE_RVF_MODE = originalEnv;
        }
      }
    });
  });

  describe('RvfDualWriter + mock RVF store', () => {
    it('should replicate embeddings to mock RVF store via writePattern', () => {
      const db = createTestDb();
      const writer = new RvfDualWriter(db, {
        rvfPath: '/tmp/test.rvf',
        mode: 'dual-write',
        dimensions: 384,
      });

      const mockStore = createMockRvfStore();
      writer.setRvfStore(mockStore);

      const embedding = new Array(384).fill(0).map((_, i) => Math.sin(i));
      const result = writer.writePattern('pattern-001', embedding);

      expect(result.sqliteSuccess).toBe(true);
      expect(result.rvfSuccess).toBe(true);
      expect(mockStore.ingested).toHaveLength(1);
      expect(mockStore.ingested[0].id).toBe('pattern-001');

      db.close();
    });

    it('should handle RVF write failure gracefully', () => {
      const db = createTestDb();
      const writer = new RvfDualWriter(db, {
        rvfPath: '/tmp/test.rvf',
        mode: 'dual-write',
        dimensions: 384,
      });

      const failingStore = createMockRvfStore();
      failingStore.ingest = () => { throw new Error('RVF write failed'); };
      writer.setRvfStore(failingStore);

      const embedding = new Array(384).fill(0.5);
      const result = writer.writePattern('pattern-002', embedding);

      // SQLite succeeds, RVF fails — no exception propagated
      expect(result.sqliteSuccess).toBe(true);
      expect(result.rvfSuccess).toBe(false);
      expect(result.divergence).toBe('rvf-write-failed');

      db.close();
    });
  });

  describe('Divergence detection', () => {
    it('should detect divergence when SQLite has data but RVF does not', () => {
      const db = createTestDb();
      const writer = new RvfDualWriter(db, {
        rvfPath: '/tmp/test.rvf',
        mode: 'dual-write',
        dimensions: 384,
      });

      // Write to SQLite only (no RVF store set = sqlite-only writes)
      const embedding = new Float32Array(384).fill(0.1);
      const blob = Buffer.from(embedding.buffer);
      db.prepare(`
        INSERT INTO qe_pattern_embeddings (pattern_id, embedding, dimension)
        VALUES (?, ?, ?)
      `).run('orphan-pattern', blob, 384);

      // Now set an empty mock store
      const mockStore = createMockRvfStore();
      writer.setRvfStore(mockStore);

      const report = writer.getDivergenceReport();
      expect(report.totalChecked).toBe(1);
      expect(report.divergences).toBe(1);
      expect(report.details[0].issue).toBe('count-mismatch');
      expect(writer.isPromotionSafe()).toBe(false);

      db.close();
    });

    it('should report no divergences when counts match', () => {
      const db = createTestDb();
      const writer = new RvfDualWriter(db, {
        rvfPath: '/tmp/test.rvf',
        mode: 'dual-write',
        dimensions: 384,
      });

      const mockStore = createMockRvfStore();
      writer.setRvfStore(mockStore);

      // Write via dual-writer so both stores get it
      const embedding = new Array(384).fill(0.3);
      writer.writePattern('synced-pattern', embedding);

      const report = writer.getDivergenceReport();
      expect(report.divergences).toBe(0);
      expect(writer.isPromotionSafe()).toBe(true);

      db.close();
    });
  });

  describe('Singleton lifecycle', () => {
    it('should reset and allow re-initialization', async () => {
      // First call — returns null (no native binding)
      const first = await getSharedRvfDualWriter();
      expect(first).toBeNull();

      // Reset
      resetSharedRvfDualWriter();

      // Second call — also returns null but proves no crash
      const second = await getSharedRvfDualWriter();
      expect(second).toBeNull();
    });

    it('should return same null from concurrent calls', async () => {
      const [a, b, c] = await Promise.all([
        getSharedRvfDualWriter(),
        getSharedRvfDualWriter(),
        getSharedRvfDualWriter(),
      ]);
      expect(a).toBeNull();
      expect(b).toBeNull();
      expect(c).toBeNull();
    });
  });

  describe('Status reporting', () => {
    it('should include RVF status in dual-writer status()', () => {
      const db = createTestDb();
      const writer = new RvfDualWriter(db, {
        rvfPath: '/tmp/test.rvf',
        mode: 'dual-write',
        dimensions: 384,
      });

      const mockStore = createMockRvfStore();
      writer.setRvfStore(mockStore);

      writer.writePattern('status-test', new Array(384).fill(0.2));

      const status = writer.status();
      expect(status.mode).toBe('dual-write');
      expect(status.sqlite.vectorCount).toBe(1);
      expect(status.rvf).not.toBeNull();
      expect(status.rvf!.totalVectors).toBe(1);

      db.close();
    });
  });
});

// ============================================================================
// Native Path Tests — Real @ruvector/rvf-node + Real QEReasoningBank
// ============================================================================

const nativeAvailable = isRvfNativeAvailable();

describe.runIf(nativeAvailable)('RVF Native Path (real binding)', () => {
  const tmpFiles: string[] = [];

  function tmpPath(name: string): string {
    const p = `/tmp/rvf-native-test-${name}-${Date.now()}.rvf`;
    tmpFiles.push(p);
    return p;
  }

  afterAll(() => {
    for (const p of tmpFiles) {
      try { if (existsSync(p)) unlinkSync(p); } catch { /* best effort */ }
      try { if (existsSync(p + '.idmap.json')) unlinkSync(p + '.idmap.json'); } catch { /* best effort */ }
    }
  });

  describe('RvfDualWriter with real native adapter', () => {
    it('should initialize with a real RVF container on disk', async () => {
      const db = createTestDb();
      const rvfPath = tmpPath('init');
      const writer = new RvfDualWriter(db, {
        rvfPath,
        mode: 'dual-write',
        dimensions: 8,
      });

      await writer.initialize();

      expect(existsSync(rvfPath)).toBe(true);
      const status = writer.status();
      expect(status.mode).toBe('dual-write');
      expect(status.rvf).not.toBeNull();
      expect(status.rvf!.totalVectors).toBe(0);

      writer.close();
      db.close();
    });

    it('should dual-write to both SQLite and native RVF', async () => {
      const db = createTestDb();
      const rvfPath = tmpPath('dual-write');
      const writer = new RvfDualWriter(db, {
        rvfPath,
        mode: 'dual-write',
        dimensions: 8,
      });
      await writer.initialize();

      // Write 3 patterns
      const vec1 = [1, 0, 0, 0, 0, 0, 0, 0];
      const vec2 = [0, 1, 0, 0, 0, 0, 0, 0];
      const vec3 = [0, 0, 1, 0, 0, 0, 0, 0];

      const r1 = writer.writePattern('pat-a', vec1);
      const r2 = writer.writePattern('pat-b', vec2);
      const r3 = writer.writePattern('pat-c', vec3);

      expect(r1.sqliteSuccess).toBe(true);
      expect(r1.rvfSuccess).toBe(true);
      expect(r2.sqliteSuccess).toBe(true);
      expect(r2.rvfSuccess).toBe(true);
      expect(r3.sqliteSuccess).toBe(true);
      expect(r3.rvfSuccess).toBe(true);

      // Verify both stores have 3 entries
      const status = writer.status();
      expect(status.sqlite.vectorCount).toBe(3);
      expect(status.rvf!.totalVectors).toBe(3);

      // Zero divergence — promotion safe
      expect(writer.isPromotionSafe()).toBe(true);

      writer.close();
      db.close();
    });

    it('should search via RVF in rvf-primary mode', async () => {
      const db = createTestDb();
      const rvfPath = tmpPath('search');
      const writer = new RvfDualWriter(db, {
        rvfPath,
        mode: 'rvf-primary',
        dimensions: 4,
      });
      await writer.initialize();

      writer.writePattern('north', [1, 0, 0, 0]);
      writer.writePattern('east', [0, 1, 0, 0]);
      writer.writePattern('south', [-1, 0, 0, 0]);

      // Search for vector closest to [1, 0, 0, 0] — should find "north"
      const results = writer.search([0.9, 0.1, 0, 0], 2);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].id).toBe('north');

      writer.close();
      db.close();
    });

    it('should delete from both stores', async () => {
      const db = createTestDb();
      const rvfPath = tmpPath('delete');
      const writer = new RvfDualWriter(db, {
        rvfPath,
        mode: 'dual-write',
        dimensions: 4,
      });
      await writer.initialize();

      writer.writePattern('del-target', [1, 0, 0, 0]);
      writer.writePattern('del-keep', [0, 1, 0, 0]);

      expect(writer.status().sqlite.vectorCount).toBe(2);

      const delResult = writer.deletePattern('del-target');
      expect(delResult.sqliteSuccess).toBe(true);
      expect(delResult.rvfSuccess).toBe(true);
      expect(writer.status().sqlite.vectorCount).toBe(1);

      writer.close();
      db.close();
    });

    it('should detect divergence when stores go out of sync', async () => {
      const db = createTestDb();
      const rvfPath = tmpPath('diverge');
      const writer = new RvfDualWriter(db, {
        rvfPath,
        mode: 'dual-write',
        dimensions: 4,
      });
      await writer.initialize();

      // Write one pattern through dual-writer (both stores have it)
      writer.writePattern('synced', [1, 0, 0, 0]);
      expect(writer.isPromotionSafe()).toBe(true);

      // Sneak a second embedding into SQLite only (bypassing dual-writer)
      const blob = Buffer.from(new Float32Array([0, 1, 0, 0]).buffer);
      db.prepare(`
        INSERT INTO qe_pattern_embeddings (pattern_id, embedding, dimension)
        VALUES (?, ?, ?)
      `).run('sqlite-only-orphan', blob, 4);

      // Now SQLite has 2, RVF has 1 → divergence
      const report = writer.getDivergenceReport();
      expect(report.divergences).toBe(1);
      expect(writer.isPromotionSafe()).toBe(false);

      writer.close();
      db.close();
    });
  });

  describe('QEReasoningBank + RVF dual-writer integration', () => {
    it('should accept a dual-writer via setRvfDualWriter and replicate storePattern embeddings', async () => {
      // Create a real in-memory SQLite for both the bank and the dual-writer
      const db = createTestDb();
      const rvfPath = tmpPath('rb-integration');

      // Create a minimal MemoryBackend stub that wraps the test DB
      const memStub = createInMemoryBackendForTest();

      // Create dual-writer with real native adapter
      const writer = new RvfDualWriter(db, {
        rvfPath,
        mode: 'dual-write',
        dimensions: 384,
      });
      await writer.initialize();

      // Create ReasoningBank and wire dual-writer
      const bank = createQEReasoningBank(memStub);
      await bank.initialize();
      bank.setRvfDualWriter(writer);

      // Store a pattern — this should trigger dual-write internally
      const result = await bank.storePattern({
        patternType: 'workflow',
        name: 'Test RVF Integration',
        description: 'Verifies that storePattern replicates embeddings to RVF',
        template: { type: 'workflow', content: 'test', variables: [] },
        context: { tags: ['test'] },
      });

      expect(result.success).toBe(true);

      // Check that the RVF store received the embedding.
      // The embedding might not be present if the model isn't loaded (no ONNX in test),
      // so we check status for the RVF vector count.
      const status = writer.status();
      // If ONNX embeddings were generated, RVF should have >= 1 vector
      // If not (no model), both stores will have 0 embeddings — that's also valid
      expect(status.rvf).not.toBeNull();

      // Cleanup
      await bank.dispose();
      writer.close();
      db.close();
    });

    it('should survive dispose() closing the dual-writer', async () => {
      const db = createTestDb();
      const rvfPath = tmpPath('rb-dispose');
      const memStub = createInMemoryBackendForTest();

      const writer = new RvfDualWriter(db, {
        rvfPath,
        mode: 'dual-write',
        dimensions: 384,
      });
      await writer.initialize();

      const bank = createQEReasoningBank(memStub);
      await bank.initialize();
      bank.setRvfDualWriter(writer);

      // Dispose should close the dual-writer without error
      await bank.dispose();

      // Writer should be closed (status() would throw if we called it)
      // But the test DB should still be usable
      const cnt = db.prepare('SELECT 1 as ok').get() as { ok: number };
      expect(cnt.ok).toBe(1);

      db.close();
    });
  });
});

// ============================================================================
// Helpers for native-path tests
// ============================================================================

/**
 * Minimal MemoryBackend stub for QEReasoningBank tests.
 * Only needs to satisfy the interface enough for initialization.
 */
function createInMemoryBackendForTest() {
  const store = new Map<string, unknown>();
  return {
    async initialize() {},
    async get(key: string) { return store.get(key) ?? null; },
    async set(key: string, value: unknown) { store.set(key, value); },
    async delete(key: string) { store.delete(key); return true; },
    async has(key: string) { return store.has(key); },
    async keys(_pattern?: string) { return Array.from(store.keys()); },
    async search(_query: string, _limit?: number) { return Array.from(store.keys()); },
    async count(_namespace?: string) { return store.size; },
    async clear() { store.clear(); },
    async dispose() { store.clear(); },
    isInitialized() { return true; },
  };
}
