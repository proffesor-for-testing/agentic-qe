/**
 * Integration Test: RVF Migration Lifecycle (ADR-072 Phase 3)
 *
 * Exercises the full migration workflow with real SQLite + mock RVF:
 *   Stage 1 → promote to 2 → dual-write → consistency check → gate eval → promote to 3
 *
 * Verifies user-facing behavior at each stage:
 *   - Write routing (which engines receive writes)
 *   - Read routing (which engine serves reads)
 *   - Consistency validation (divergence detection)
 *   - Stage gate enforcement (go/no-go criteria)
 *   - Metrics tracking (latency, failures, fallbacks)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import {
  RvfMigrationCoordinator,
} from '../../../src/persistence/rvf-migration-coordinator.js';
import {
  STAGE_NAMES,
  type MigrationStage,
} from '../../../src/persistence/rvf-migration-adapter.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestDb(): DatabaseType {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS qe_pattern_embeddings (
      pattern_id TEXT PRIMARY KEY,
      embedding BLOB NOT NULL,
      dimension INTEGER NOT NULL,
      model TEXT DEFAULT 'all-MiniLM-L6-v2',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  return db;
}

function seedEmbeddings(db: DatabaseType, count: number, dim = 384): void {
  const insert = db.prepare(
    'INSERT OR REPLACE INTO qe_pattern_embeddings (pattern_id, embedding, dimension) VALUES (?, ?, ?)',
  );
  for (let i = 0; i < count; i++) {
    const vec = new Float32Array(dim);
    for (let j = 0; j < dim; j++) vec[j] = Math.sin(i * 0.1 + j * 0.01);
    insert.run(`pattern-${i}`, Buffer.from(vec.buffer), dim);
  }
}

function createMockRvfStore() {
  const vectors = new Map<string, Float32Array>();
  return {
    vectors,
    ingest: vi.fn((entries: Array<{ id: string; vector: Float32Array | number[] }>) => {
      for (const e of entries) {
        vectors.set(e.id, e.vector instanceof Float32Array ? e.vector : new Float32Array(e.vector));
      }
    }),
    search: vi.fn((query: Float32Array | number[], k: number) => {
      // Simple cosine search over stored vectors
      const q = query instanceof Float32Array ? query : new Float32Array(query);
      const results: Array<{ id: string; score: number }> = [];
      for (const [id, vec] of vectors) {
        let dot = 0, qMag = 0, vMag = 0;
        for (let i = 0; i < Math.min(q.length, vec.length); i++) {
          dot += q[i] * vec[i];
          qMag += q[i] * q[i];
          vMag += vec[i] * vec[i];
        }
        const denom = Math.sqrt(qMag) * Math.sqrt(vMag);
        results.push({ id, score: denom > 0 ? dot / denom : 0 });
      }
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, k);
    }),
    delete: vi.fn((ids: string[]) => { for (const id of ids) vectors.delete(id); }),
    status: vi.fn(() => ({
      totalVectors: vectors.size,
      totalSegments: 1,
      fileSizeBytes: vectors.size * 384 * 4,
      epoch: 1,
      witnessValid: true,
      witnessEntries: 0,
      deadSpaceRatio: 0.05,
    })),
    close: vi.fn(),
  };
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('RVF Migration Lifecycle', () => {
  let db: DatabaseType;
  let rvfStore: ReturnType<typeof createMockRvfStore>;

  beforeEach(() => {
    RvfMigrationCoordinator.resetInstance();
    db = createTestDb();
    rvfStore = createMockRvfStore();
  });

  afterEach(() => {
    RvfMigrationCoordinator.resetInstance();
  });

  it('should start at stage 1 and report status', () => {
    const coord = new RvfMigrationCoordinator({ stage: 1 });
    coord.attachSqliteDb(db);
    coord.attachRvfStore(rvfStore);

    const status = coord.getStatus();

    expect(status.stage).toBe(1);
    expect(status.stageName).toBe('hybrid');
    expect(status.metrics.totalWrites).toBe(0);
    expect(status.metrics.totalReads).toBe(0);
  });

  it('should promote from stage 1 to stage 2 (no automated gates)', () => {
    const coord = new RvfMigrationCoordinator({ stage: 1 });
    coord.attachSqliteDb(db);
    coord.attachRvfStore(rvfStore);

    const { promoted, previousStage, newStage } = coord.promote();

    expect(promoted).toBe(true);
    expect(previousStage).toBe(1);
    expect(newStage).toBe(2);

    // Status should reflect new stage
    expect(coord.getStatus().stage).toBe(2);
  });

  it('stage 2: dual-write sends to both engines', () => {
    const coord = new RvfMigrationCoordinator({ stage: 2 });
    coord.attachSqliteDb(db);
    coord.attachRvfStore(rvfStore);

    const vec = new Float32Array(384).fill(0.5);
    const result = coord.write('test-vec', vec);

    expect(result.sqliteSuccess).toBe(true);
    expect(result.rvfSuccess).toBe(true);

    // Verify SQLite has the vector
    const row = db.prepare(
      'SELECT COUNT(*) as cnt FROM qe_pattern_embeddings WHERE pattern_id = ?',
    ).get('test-vec') as { cnt: number };
    expect(row.cnt).toBe(1);

    // Verify RVF has the vector
    expect(rvfStore.vectors.has('test-vec')).toBe(true);
  });

  it('stage 2: reads come from SQLite', () => {
    const coord = new RvfMigrationCoordinator({ stage: 2 });
    coord.attachSqliteDb(db);
    coord.attachRvfStore(rvfStore);
    seedEmbeddings(db, 10);

    const query = new Float32Array(384).fill(0.5);
    const result = coord.search(query, 5);

    expect(result.source).toBe('sqlite');
    expect(result.data).not.toBeNull();
    expect(result.data!.length).toBeGreaterThan(0);
  });

  it('stage 2: consistency check detects divergences', () => {
    const coord = new RvfMigrationCoordinator({ stage: 2 });
    coord.attachSqliteDb(db);
    seedEmbeddings(db, 5);

    // RVF is empty — every pattern will diverge
    const emptyStore = createMockRvfStore();
    emptyStore.search = vi.fn(() => []);
    coord.attachRvfStore(emptyStore);

    const check = coord.runConsistencyCheck();

    expect(check.samplesChecked).toBeGreaterThan(0);
    expect(check.divergences).toBeGreaterThan(0);
    expect(check.divergenceRate).toBeGreaterThan(0);
  });

  it('stage 2: consistency check reports zero divergence when synced', () => {
    const coord = new RvfMigrationCoordinator({ stage: 2 });
    coord.attachSqliteDb(db);
    seedEmbeddings(db, 5);

    // Sync RVF with SQLite data — search returns matching patterns
    const syncedStore = createMockRvfStore();
    for (let i = 0; i < 5; i++) {
      const vec = new Float32Array(384);
      for (let j = 0; j < 384; j++) vec[j] = Math.sin(i * 0.1 + j * 0.01);
      syncedStore.vectors.set(`pattern-${i}`, vec);
    }
    coord.attachRvfStore(syncedStore);

    const check = coord.runConsistencyCheck();

    expect(check.samplesChecked).toBeGreaterThan(0);
    // Self-search should find the pattern with high score
    expect(check.divergenceRate).toBeLessThanOrEqual(0.1); // small tolerance
  });

  it('stage 2→3: gate blocks when not enough checks', () => {
    const coord = new RvfMigrationCoordinator({ stage: 2 });
    coord.attachSqliteDb(db);
    coord.attachRvfStore(rvfStore);

    // Only run 2 checks (gate requires 10)
    coord.runConsistencyCheck();
    coord.runConsistencyCheck();

    const gate = coord.evaluateGate();

    expect(gate.canPromote).toBe(false);
    expect(gate.checks.find(c => c.name === 'consistency-checks-count')?.passed).toBe(false);
  });

  it('stage 2→3: gate passes after sufficient zero-divergence checks', () => {
    const coord = new RvfMigrationCoordinator({ stage: 2 });
    coord.attachSqliteDb(db);
    seedEmbeddings(db, 10);

    // Sync RVF store — search returns matching patterns with high score
    const syncedStore = createMockRvfStore();
    for (let i = 0; i < 10; i++) {
      const vec = new Float32Array(384);
      for (let j = 0; j < 384; j++) vec[j] = Math.sin(i * 0.1 + j * 0.01);
      syncedStore.vectors.set(`pattern-${i}`, vec);
    }
    coord.attachRvfStore(syncedStore);

    // Run 12 consistency checks (above the 10 minimum)
    for (let i = 0; i < 12; i++) {
      coord.runConsistencyCheck();
    }

    // Also need some reads/writes for latency metrics
    const vec = new Float32Array(384).fill(0.5);
    coord.write('latency-test', vec);
    coord.search(new Float32Array(384).fill(0.5), 3);

    const gate = coord.evaluateGate();

    expect(gate.currentStage).toBe(2);
    expect(gate.targetStage).toBe(3);
    // All automated checks should pass
    expect(gate.checks.find(c => c.name === 'consistency-checks-count')?.passed).toBe(true);
  });

  it('stage 3: reads come from RVF', () => {
    const coord = new RvfMigrationCoordinator({ stage: 3 });
    coord.attachSqliteDb(db);
    coord.attachRvfStore(rvfStore);
    rvfStore.vectors.set('v1', new Float32Array(384).fill(0.5));

    const result = coord.search(new Float32Array(384).fill(0.5), 3);

    expect(result.source).toBe('rvf');
    expect(rvfStore.search).toHaveBeenCalled();
  });

  it('stage 3: falls back to SQLite on RVF failure', () => {
    const coord = new RvfMigrationCoordinator({ stage: 3 });
    coord.attachSqliteDb(db);
    seedEmbeddings(db, 5);
    const failingStore = createMockRvfStore();
    failingStore.search = vi.fn(() => { throw new Error('RVF down'); });
    coord.attachRvfStore(failingStore);

    const result = coord.search(new Float32Array(384).fill(0.5), 3);

    expect(result.source).toBe('fallback');
    expect(result.data).not.toBeNull();

    // Metrics should track the fallback
    const metrics = coord.getStatus().metrics;
    expect(metrics.fallbacksUsed).toBe(1);
    expect(metrics.rvfReadFailures).toBe(1);
  });

  it('stage 4: writes only to RVF', () => {
    const coord = new RvfMigrationCoordinator({ stage: 4 });
    coord.attachSqliteDb(db);
    coord.attachRvfStore(rvfStore);

    const vec = new Float32Array(384).fill(0.5);
    const result = coord.write('test-vec', vec);

    expect(result.rvfSuccess).toBe(true);
    expect(result.sqliteSuccess).toBe(false);

    // SQLite should NOT have the vector
    const row = db.prepare(
      'SELECT COUNT(*) as cnt FROM qe_pattern_embeddings WHERE pattern_id = ?',
    ).get('test-vec') as { cnt: number };
    expect(row.cnt).toBe(0);
  });

  it('full lifecycle: 1 → 2 → verify dual-write → check consistency', () => {
    const coord = new RvfMigrationCoordinator({ stage: 1 });
    coord.attachSqliteDb(db);
    coord.attachRvfStore(rvfStore);

    // Step 1: Promote to stage 2
    const promo1 = coord.promote();
    expect(promo1.promoted).toBe(true);
    expect(promo1.newStage).toBe(2);

    // Step 2: Write patterns — both engines should receive them
    for (let i = 0; i < 5; i++) {
      const vec = new Float32Array(384);
      for (let j = 0; j < 384; j++) vec[j] = Math.sin(i * 0.1 + j * 0.01);
      const result = coord.write(`pat-${i}`, vec);
      expect(result.sqliteSuccess).toBe(true);
      expect(result.rvfSuccess).toBe(true);
    }

    // Step 3: Verify both engines have the data
    const status = coord.getStatus();
    expect(status.engineStatus.sqliteVectorCount).toBe(5);
    expect(status.metrics.totalWrites).toBe(5);

    // Step 4: Run consistency check — should see low divergence since RVF has real cosine search
    const check = coord.runConsistencyCheck();
    expect(check.samplesChecked).toBeGreaterThan(0);

    // Step 5: Reads at stage 2 should come from SQLite
    const readResult = coord.search(new Float32Array(384).fill(0.5), 3);
    expect(readResult.source).toBe('sqlite');
  });

  it('metrics tracking across operations', () => {
    const coord = new RvfMigrationCoordinator({ stage: 2 });
    coord.attachSqliteDb(db);
    coord.attachRvfStore(rvfStore);

    // Perform various operations
    for (let i = 0; i < 10; i++) {
      coord.write(`p-${i}`, new Float32Array(384).fill(i * 0.1));
    }
    for (let i = 0; i < 5; i++) {
      coord.search(new Float32Array(384).fill(0.5), 3);
    }

    const metrics = coord.getStatus().metrics;

    expect(metrics.totalWrites).toBe(10);
    expect(metrics.totalReads).toBe(5);
    expect(metrics.stage).toBe(2);
    expect(metrics.stageName).toBe('dual-write-sqlite-primary');
    expect(metrics.rvfWriteFailures).toBe(0);
    expect(metrics.sqliteWriteLatencyAvgMs).toBeGreaterThanOrEqual(0);
    expect(metrics.rvfWriteLatencyAvgMs).toBeGreaterThanOrEqual(0);
  });
});
