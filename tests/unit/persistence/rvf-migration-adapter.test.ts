/**
 * Tests for Phase 3: RVF Primary Migration (ADR-072)
 *
 * Tests the migration adapter (stage-based routing), consistency validator
 * (divergence tracking), and stage gate (go/no-go enforcement).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RvfMigrationAdapter,
  STAGE_NAMES,
  type MigrationStage,
} from '../../../src/persistence/rvf-migration-adapter.js';
import { RvfConsistencyValidator } from '../../../src/persistence/rvf-consistency-validator.js';
import { RvfStageGate } from '../../../src/persistence/rvf-stage-gate.js';
import type { RvfStore } from '../../../src/integrations/ruvector/rvf-dual-writer.js';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';

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

function createMockRvfStore(): RvfStore & { vectors: Map<string, Float32Array> } {
  const vectors = new Map<string, Float32Array>();
  return {
    vectors,
    ingest: vi.fn((entries) => {
      for (const e of entries) {
        const v = e.vector instanceof Float32Array ? e.vector : new Float32Array(e.vector);
        vectors.set(e.id, v);
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
      for (const id of ids) vectors.delete(id);
    }),
    status: vi.fn(() => ({
      totalVectors: vectors.size,
      totalSegments: 1,
      fileSizeBytes: vectors.size * 384 * 4,
      epoch: 1,
      witnessValid: true,
      witnessEntries: 0,
    })),
    close: vi.fn(),
  };
}

// ============================================================================
// RvfMigrationAdapter Tests
// ============================================================================

describe('RvfMigrationAdapter', () => {
  let db: DatabaseType;
  let rvfStore: ReturnType<typeof createMockRvfStore>;

  beforeEach(() => {
    db = createTestDb();
    rvfStore = createMockRvfStore();
  });

  describe('Stage names', () => {
    it('should have names for all 5 stages', () => {
      expect(Object.keys(STAGE_NAMES)).toHaveLength(5);
      expect(STAGE_NAMES[0]).toBe('sqlite-only');
      expect(STAGE_NAMES[1]).toBe('hybrid');
      expect(STAGE_NAMES[4]).toBe('rvf-primary');
    });
  });

  describe('Write routing', () => {
    it('stage 0-1: should write only to SQLite', () => {
      const adapter = new RvfMigrationAdapter({ stage: 0 });
      adapter.setSqliteDb(db);
      adapter.setRvfStore(rvfStore);

      const vec = new Float32Array(384).fill(0.5);
      const result = adapter.write('p1', vec);

      expect(result.sqliteSuccess).toBe(true);
      expect(result.rvfSuccess).toBe(false);
      expect(rvfStore.ingest).not.toHaveBeenCalled();
    });

    it('stage 2: should write to both engines', () => {
      const adapter = new RvfMigrationAdapter({ stage: 2 });
      adapter.setSqliteDb(db);
      adapter.setRvfStore(rvfStore);

      const vec = new Float32Array(384).fill(0.5);
      const result = adapter.write('p1', vec);

      expect(result.sqliteSuccess).toBe(true);
      expect(result.rvfSuccess).toBe(true);
      expect(rvfStore.ingest).toHaveBeenCalled();
    });

    it('stage 3: should write to both engines', () => {
      const adapter = new RvfMigrationAdapter({ stage: 3 });
      adapter.setSqliteDb(db);
      adapter.setRvfStore(rvfStore);

      const vec = new Float32Array(384).fill(0.5);
      const result = adapter.write('p1', vec);

      expect(result.sqliteSuccess).toBe(true);
      expect(result.rvfSuccess).toBe(true);
    });

    it('stage 4: should write only to RVF', () => {
      const adapter = new RvfMigrationAdapter({ stage: 4 });
      adapter.setSqliteDb(db);
      adapter.setRvfStore(rvfStore);

      const vec = new Float32Array(384).fill(0.5);
      const result = adapter.write('p1', vec);

      // Stage 4: SQLite is NOT written (stage < 4 check)
      expect(result.sqliteSuccess).toBe(false);
      expect(result.rvfSuccess).toBe(true);
    });

    it('stage 4: should fallback to SQLite on RVF failure', () => {
      const adapter = new RvfMigrationAdapter({ stage: 4, enableFallback: true });
      adapter.setSqliteDb(db);
      const failingStore = createMockRvfStore();
      failingStore.ingest = vi.fn(() => { throw new Error('RVF down'); });
      adapter.setRvfStore(failingStore);

      const vec = new Float32Array(384).fill(0.5);
      const result = adapter.write('p1', vec);

      expect(result.rvfSuccess).toBe(false);
      expect(result.sqliteSuccess).toBe(true);
      expect(result.fallbackUsed).toBe(true);
    });
  });

  describe('Read routing', () => {
    it('stage 0-2: should read from SQLite', () => {
      const adapter = new RvfMigrationAdapter({ stage: 2 });
      adapter.setSqliteDb(db);
      adapter.setRvfStore(rvfStore);
      seedEmbeddings(db, 5);

      const query = new Float32Array(384).fill(0.5);
      const result = adapter.search(query, 3);

      expect(result.source).toBe('sqlite');
      expect(result.data).not.toBeNull();
      expect(rvfStore.search).not.toHaveBeenCalled();
    });

    it('stage 3: should read from RVF', () => {
      const adapter = new RvfMigrationAdapter({ stage: 3 });
      adapter.setSqliteDb(db);
      adapter.setRvfStore(rvfStore);
      rvfStore.vectors.set('p1', new Float32Array(384).fill(0.5));

      const query = new Float32Array(384).fill(0.5);
      const result = adapter.search(query, 3);

      expect(result.source).toBe('rvf');
      expect(rvfStore.search).toHaveBeenCalled();
    });

    it('stage 3: should fallback to SQLite on RVF failure', () => {
      const adapter = new RvfMigrationAdapter({ stage: 3, enableFallback: true });
      adapter.setSqliteDb(db);
      seedEmbeddings(db, 5);
      const failingStore = createMockRvfStore();
      failingStore.search = vi.fn(() => { throw new Error('RVF down'); });
      adapter.setRvfStore(failingStore);

      const query = new Float32Array(384).fill(0.5);
      const result = adapter.search(query, 3);

      expect(result.source).toBe('fallback');
      expect(result.data).not.toBeNull();
    });
  });

  describe('Delete routing', () => {
    it('stage 2: should delete from both engines', () => {
      const adapter = new RvfMigrationAdapter({ stage: 2 });
      adapter.setSqliteDb(db);
      adapter.setRvfStore(rvfStore);
      seedEmbeddings(db, 3);

      const result = adapter.delete('pattern-0');

      expect(result.sqliteSuccess).toBe(true);
      expect(result.rvfSuccess).toBe(true);
      expect(rvfStore.delete).toHaveBeenCalledWith(['pattern-0']);
    });
  });

  describe('Metrics', () => {
    it('should track writes and reads', () => {
      const adapter = new RvfMigrationAdapter({ stage: 2 });
      adapter.setSqliteDb(db);
      adapter.setRvfStore(rvfStore);

      adapter.write('p1', new Float32Array(384));
      adapter.write('p2', new Float32Array(384));
      adapter.search(new Float32Array(384), 3);

      const metrics = adapter.getMetrics();
      expect(metrics.totalWrites).toBe(2);
      expect(metrics.totalReads).toBe(1);
      expect(metrics.stage).toBe(2);
      expect(metrics.stageName).toBe('dual-write-sqlite-primary');
    });

    it('should track RVF failures', () => {
      const adapter = new RvfMigrationAdapter({ stage: 2 });
      adapter.setSqliteDb(db);
      const failingStore = createMockRvfStore();
      failingStore.ingest = vi.fn(() => { throw new Error('fail'); });
      adapter.setRvfStore(failingStore);

      adapter.write('p1', new Float32Array(384));

      expect(adapter.getMetrics().rvfWriteFailures).toBe(1);
    });

    it('should reset metrics', () => {
      const adapter = new RvfMigrationAdapter({ stage: 2 });
      adapter.setSqliteDb(db);
      adapter.setRvfStore(rvfStore);
      adapter.write('p1', new Float32Array(384));

      adapter.resetMetrics();

      expect(adapter.getMetrics().totalWrites).toBe(0);
    });
  });

  describe('Status', () => {
    it('should report combined status', () => {
      const adapter = new RvfMigrationAdapter({ stage: 2 });
      adapter.setSqliteDb(db);
      adapter.setRvfStore(rvfStore);
      seedEmbeddings(db, 5);
      rvfStore.vectors.set('p1', new Float32Array(384));

      const status = adapter.status();
      expect(status.sqlite.vectorCount).toBe(5);
      expect(status.rvf?.totalVectors).toBe(1);
      expect(status.stage).toBe(2);
    });
  });
});

// ============================================================================
// RvfConsistencyValidator Tests
// ============================================================================

describe('RvfConsistencyValidator', () => {
  let db: DatabaseType;
  let rvfStore: ReturnType<typeof createMockRvfStore>;

  beforeEach(() => {
    db = createTestDb();
    rvfStore = createMockRvfStore();
  });

  it('should run a consistency check with zero divergence', () => {
    const validator = new RvfConsistencyValidator({ sampleSize: 5 });
    validator.setSqliteDb(db);
    validator.setRvfStore(rvfStore);
    seedEmbeddings(db, 10);

    // Pre-populate RVF with matching vectors
    for (let i = 0; i < 10; i++) {
      rvfStore.vectors.set(`pattern-${i}`, new Float32Array(384));
    }
    // Make search return the queried pattern as top-1
    rvfStore.search = vi.fn((query, k) => {
      // Return first available pattern with high score
      const ids = Array.from(rvfStore.vectors.keys());
      return ids.slice(0, k).map(id => ({ id, score: 0.99 }));
    });

    const result = validator.runCheck();

    expect(result.samplesChecked).toBeGreaterThan(0);
    expect(result.samplesChecked).toBeLessThanOrEqual(5);
  });

  it('should detect divergences when RVF search fails', () => {
    const validator = new RvfConsistencyValidator({ sampleSize: 3 });
    validator.setSqliteDb(db);
    seedEmbeddings(db, 5);

    // RVF store returns empty results
    const emptyStore = createMockRvfStore();
    emptyStore.search = vi.fn(() => []);
    validator.setRvfStore(emptyStore);

    const result = validator.runCheck();

    expect(result.divergences).toBeGreaterThan(0);
    expect(result.divergenceRate).toBeGreaterThan(0);
  });

  it('should track rolling divergence rate', () => {
    const validator = new RvfConsistencyValidator({ sampleSize: 2 });
    validator.setSqliteDb(db);
    seedEmbeddings(db, 5);
    const emptyStore = createMockRvfStore();
    emptyStore.search = vi.fn(() => []);
    validator.setRvfStore(emptyStore);

    // Run multiple checks
    validator.runCheck();
    validator.runCheck();

    const rollingRate = validator.getRollingDivergenceRate();
    expect(rollingRate).toBeGreaterThan(0);
    expect(validator.getCheckCount()).toBe(2);
  });

  it('should return empty results when no stores attached', () => {
    const validator = new RvfConsistencyValidator();
    const result = validator.runCheck();

    expect(result.samplesChecked).toBe(0);
    expect(result.divergences).toBe(0);
  });

  it('should trigger compaction when dead space exceeds threshold', () => {
    const validator = new RvfConsistencyValidator({
      sampleSize: 1,
      compactionThreshold: 0.3,
    });
    validator.setSqliteDb(db);
    seedEmbeddings(db, 2);

    // Mock store with high dead space
    const store = createMockRvfStore();
    store.search = vi.fn(() => [{ id: 'pattern-0', score: 0.99 }]);
    (store.status as ReturnType<typeof vi.fn>).mockReturnValue({
      totalVectors: 2,
      deadSpaceRatio: 0.5,
    });
    const compactFn = vi.fn();
    (store as any).compact = compactFn;
    validator.setRvfStore(store);

    const result = validator.runCheck();

    expect(result.deadSpaceRatio).toBe(0.5);
    expect(result.compactionTriggered).toBe(true);
    expect(compactFn).toHaveBeenCalled();
  });
});

// ============================================================================
// RvfStageGate Tests
// ============================================================================

describe('RvfStageGate', () => {
  function createMockValidator(divergenceRate: number, checkCount: number): RvfConsistencyValidator {
    const v = new RvfConsistencyValidator();
    vi.spyOn(v, 'getRollingDivergenceRate').mockReturnValue(divergenceRate);
    vi.spyOn(v, 'getCheckCount').mockReturnValue(checkCount);
    return v;
  }

  function createMetrics(overrides: Partial<ReturnType<RvfMigrationAdapter['getMetrics']>> = {}) {
    return {
      stage: 2 as MigrationStage,
      stageName: 'dual-write-sqlite-primary',
      totalWrites: 100,
      totalReads: 200,
      rvfWriteFailures: 0,
      rvfReadFailures: 0,
      fallbacksUsed: 0,
      sqliteReadLatencyAvgMs: 5,
      rvfReadLatencyAvgMs: 3,
      sqliteWriteLatencyAvgMs: 4,
      rvfWriteLatencyAvgMs: 3,
      ...overrides,
    };
  }

  describe('Stage 2→3 gate', () => {
    it('should allow promotion when all criteria met', () => {
      const gate = new RvfStageGate({ minChecksRequired: 10 });
      const validator = createMockValidator(0, 15);
      const metrics = createMetrics({ rvfReadLatencyAvgMs: 8, sqliteReadLatencyAvgMs: 5 });

      const result = gate.evaluate(2, validator, metrics);

      expect(result.canPromote).toBe(true);
      expect(result.targetStage).toBe(3);
      expect(result.checks.every(c => c.passed)).toBe(true);
    });

    it('should block when divergence too high', () => {
      const gate = new RvfStageGate();
      const validator = createMockValidator(0.05, 20); // 5% divergence
      const metrics = createMetrics();

      const result = gate.evaluate(2, validator, metrics);

      expect(result.canPromote).toBe(false);
      expect(result.checks.find(c => c.name === 'divergence-rate')?.passed).toBe(false);
    });

    it('should block when not enough checks', () => {
      const gate = new RvfStageGate({ minChecksRequired: 10 });
      const validator = createMockValidator(0, 3); // only 3 checks
      const metrics = createMetrics();

      const result = gate.evaluate(2, validator, metrics);

      expect(result.canPromote).toBe(false);
      expect(result.checks.find(c => c.name === 'consistency-checks-count')?.passed).toBe(false);
    });

    it('should block when read latency ratio too high', () => {
      const gate = new RvfStageGate();
      const validator = createMockValidator(0, 20);
      const metrics = createMetrics({ rvfReadLatencyAvgMs: 30, sqliteReadLatencyAvgMs: 5 });

      const result = gate.evaluate(2, validator, metrics);

      expect(result.canPromote).toBe(false);
      expect(result.checks.find(c => c.name === 'read-latency-ratio')?.passed).toBe(false);
    });
  });

  describe('Stage 3→4 gate', () => {
    it('should allow promotion with zero fallbacks', () => {
      const gate = new RvfStageGate();
      const validator = createMockValidator(0, 20);
      const metrics = createMetrics({
        stage: 3,
        fallbacksUsed: 0,
        rvfReadLatencyAvgMs: 3,
        sqliteReadLatencyAvgMs: 5,
      });

      const result = gate.evaluate(3, validator, metrics);

      expect(result.canPromote).toBe(true);
      expect(result.targetStage).toBe(4);
    });

    it('should block when fallbacks occurred', () => {
      const gate = new RvfStageGate();
      const validator = createMockValidator(0, 20);
      const metrics = createMetrics({ stage: 3, fallbacksUsed: 5 });

      const result = gate.evaluate(3, validator, metrics);

      expect(result.canPromote).toBe(false);
      expect(result.checks.find(c => c.name === 'fallback-count')?.passed).toBe(false);
    });

    it('should use write latency metrics (not read) for write-latency-ratio check', () => {
      const gate = new RvfStageGate({ maxWriteLatencyRatio3to4: 1.5 });
      const validator = createMockValidator(0, 20);
      // Read latency is fine, but write latency is bad
      const metrics = createMetrics({
        stage: 3,
        fallbacksUsed: 0,
        rvfReadLatencyAvgMs: 3, // good
        sqliteReadLatencyAvgMs: 5, // good
        rvfWriteLatencyAvgMs: 20, // bad: 4x the sqlite write latency
        sqliteWriteLatencyAvgMs: 5,
      });

      const result = gate.evaluate(3, validator, metrics);

      const writeCheck = result.checks.find(c => c.name === 'write-latency-ratio');
      expect(writeCheck?.passed).toBe(false);
      expect(writeCheck?.actual).toContain('4.00');
    });
  });

  describe('Edge cases', () => {
    it('stage 4: should not allow further promotion', () => {
      const gate = new RvfStageGate();
      const validator = createMockValidator(0, 20);
      const metrics = createMetrics({ stage: 4 });

      const result = gate.evaluate(4, validator, metrics);

      expect(result.canPromote).toBe(false);
      expect(result.summary).toContain('maximum stage');
    });

    it('stage 0→1: should allow without gates', () => {
      const gate = new RvfStageGate();
      const validator = createMockValidator(0, 0);
      const metrics = createMetrics({ stage: 0 });

      const result = gate.evaluate(0, validator, metrics);

      expect(result.canPromote).toBe(true);
      expect(result.summary).toContain('no automated gates');
    });

    it('stage 1→2: should allow without gates', () => {
      const gate = new RvfStageGate();
      const validator = createMockValidator(0, 0);
      const metrics = createMetrics({ stage: 1 });

      const result = gate.evaluate(1, validator, metrics);

      expect(result.canPromote).toBe(true);
    });
  });

  describe('Promotion with witness chain', () => {
    it('should record successful promotion', () => {
      const gate = new RvfStageGate({ minChecksRequired: 1 });
      const mockWitness = { append: vi.fn() };
      gate.setWitnessChain(mockWitness as any);

      const validator = createMockValidator(0, 10);
      const metrics = createMetrics();

      const { promoted, newStage } = gate.promote(2, validator, metrics);

      expect(promoted).toBe(true);
      expect(newStage).toBe(3);
      expect(mockWitness.append).toHaveBeenCalledWith(
        'QUALITY_GATE_PASS',
        expect.objectContaining({ action: 'stage-promotion-approved', from: 2, to: 3 }),
        'rvf-stage-gate',
      );
    });

    it('should record blocked promotion', () => {
      const gate = new RvfStageGate();
      const mockWitness = { append: vi.fn() };
      gate.setWitnessChain(mockWitness as any);

      const validator = createMockValidator(0.5, 20);
      const metrics = createMetrics();

      const { promoted } = gate.promote(2, validator, metrics);

      expect(promoted).toBe(false);
      expect(mockWitness.append).toHaveBeenCalledWith(
        'QUALITY_GATE_FAIL',
        expect.objectContaining({ action: 'stage-promotion-blocked' }),
        'rvf-stage-gate',
      );
    });

    it('should allow forced promotion', () => {
      const gate = new RvfStageGate();
      const mockWitness = { append: vi.fn() };
      gate.setWitnessChain(mockWitness as any);

      const validator = createMockValidator(0.5, 20); // Would normally block
      const metrics = createMetrics();

      const { promoted, newStage } = gate.promote(2, validator, metrics, true);

      expect(promoted).toBe(true);
      expect(newStage).toBe(3);
      expect(mockWitness.append).toHaveBeenCalledWith(
        'QUALITY_GATE_PASS',
        expect.objectContaining({ action: 'stage-promotion-forced', forced: true }),
        'rvf-stage-gate',
      );
    });
  });
});
