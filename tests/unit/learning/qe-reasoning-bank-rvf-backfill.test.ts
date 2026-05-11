/**
 * Regression test for PR #445 — bootstrap patterns must reach the RVF HNSW index.
 *
 * Pins two invariants in QEReasoningBank.loadPretrainedPatterns:
 *   1. Fresh install — each pretrained pattern reaches patternStore.create()
 *      WITH an embedding (i.e. routed through storePattern(), not the raw
 *      patternStore.create() which would skip RvfPatternStore.store()'s
 *      `pattern.embedding && this.adapter` ingest gate).
 *   2. Existing install — when patternStore reports patterns but the RVF
 *      adapter is empty (totalVectors === 0), embeddings are read from
 *      SQLite and batch-ingested into the adapter (the backfill path).
 *
 * The gate behavior itself is already covered by
 * tests/unit/learning/rvf-pattern-store.test.ts (lines 162, 181). These tests
 * verify that QEReasoningBank feeds the gate correctly.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IPatternStore, PatternStoreStats } from '../../../src/learning/pattern-store.js';
import type { CreateQEPatternOptions, QEPattern } from '../../../src/learning/qe-patterns.js';
import type { Result } from '../../../src/shared/types/index.js';
import { ok } from '../../../src/shared/types/index.js';

const mocks = vi.hoisted(() => {
  const adapter = {
    statusValue: { totalVectors: 0 },
    status: vi.fn(),
    ingest: vi.fn(),
  };
  adapter.status.mockImplementation(() => adapter.statusValue);
  adapter.ingest.mockImplementation((entries: Array<{ id: string; vector: Float32Array }>) => ({
    accepted: entries.length,
    rejected: 0,
  }));

  const sqliteEmbeddings: Array<{ patternId: string; embedding: number[] }> = [];

  const patternStore: Partial<IPatternStore> & { __sqliteEmbeddings: typeof sqliteEmbeddings } = {
    initialize: vi.fn(async () => undefined),
    setSqliteStore: vi.fn(),
    store: vi.fn(async (p: QEPattern): Promise<Result<string>> => ok(p.id)),
    create: vi.fn(async (opts: CreateQEPatternOptions): Promise<Result<QEPattern>> =>
      ok({
        id: `id-${Math.random().toString(36).slice(2, 8)}`,
        patternType: opts.patternType,
        qeDomain: opts.qeDomain ?? 'test-generation',
        domain: 'generic',
        name: opts.name,
        description: opts.description,
        confidence: opts.confidence ?? 0.7,
        usageCount: 0,
        successRate: 0,
        qualityScore: 0.5,
        context: { tags: [], ...opts.context },
        template: { example: '', ...opts.template },
        embedding: opts.embedding,
        tier: 'short-term',
        createdAt: new Date(),
        lastUsedAt: new Date(),
        successfulUses: 0,
        reusable: false,
        reuseCount: 0,
        averageTokenSavings: 0,
      } as unknown as QEPattern),
    ),
    get: vi.fn(async () => null),
    search: vi.fn(async () => ok([])),
    recordUsage: vi.fn(async () => ok(undefined)),
    promote: vi.fn(async () => ok(undefined)),
    delete: vi.fn(async () => ok(undefined)),
    getStats: vi.fn(async (): Promise<PatternStoreStats> => ({
      totalPatterns: 0,
      byTier: { shortTerm: 0, longTerm: 0 },
      byDomain: {} as PatternStoreStats['byDomain'],
      byType: {} as PatternStoreStats['byType'],
      avgConfidence: 0,
      avgQualityScore: 0,
      avgSuccessRate: 0,
      searchOperations: 0,
      avgSearchLatencyMs: 0,
      hnswStats: { totalNodes: 0, totalEdges: 0, levels: 0, nativeAvailable: true },
    })),
    cleanup: vi.fn(async () => ({ removed: 0, promoted: 0 })),
    dispose: vi.fn(async () => undefined),
    getAdapter: vi.fn(() => adapter as never),
    __sqliteEmbeddings: sqliteEmbeddings,
  };

  return { adapter, patternStore, sqliteEmbeddings };
});

vi.mock('../../../src/learning/pattern-store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/learning/pattern-store.js')>();
  return {
    ...actual,
    createPatternStore: vi.fn(() => mocks.patternStore as unknown as IPatternStore),
  };
});

vi.mock('../../../src/learning/sqlite-persistence.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/learning/sqlite-persistence.js')>();
  return {
    ...actual,
    createSQLitePatternStore: vi.fn(() => ({
      initialize: vi.fn(async () => undefined),
      getAllEmbeddings: vi.fn(() => mocks.sqliteEmbeddings),
      recordUsage: vi.fn(),
      storePattern: vi.fn(),
      getPattern: vi.fn(() => undefined),
    })),
  };
});

import { QEReasoningBank } from '../../../src/learning/qe-reasoning-bank.js';
import { PRETRAINED_PATTERNS } from '../../../src/learning/pretrained-patterns.js';
import { createMockMemory } from '../../mocks/index.js';

describe('QEReasoningBank.loadPretrainedPatterns — RVF bootstrap (PR #445 regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adapter.statusValue.totalVectors = 0;
    mocks.sqliteEmbeddings.length = 0;
    // Re-arm mock implementations cleared by clearAllMocks
    mocks.adapter.status.mockImplementation(() => mocks.adapter.statusValue);
    mocks.adapter.ingest.mockImplementation((entries: Array<{ id: string; vector: Float32Array }>) => ({
      accepted: entries.length,
      rejected: 0,
    }));
    (mocks.patternStore.getAdapter as ReturnType<typeof vi.fn>).mockImplementation(() => mocks.adapter as never);
  });

  it('fresh install: routes each pretrained pattern through storePattern() so embeddings reach patternStore.create()', async () => {
    (mocks.patternStore.getStats as ReturnType<typeof vi.fn>).mockResolvedValue({
      totalPatterns: 0,
      byTier: { shortTerm: 0, longTerm: 0 },
      byDomain: {},
      byType: {},
      avgConfidence: 0,
      avgQualityScore: 0,
      avgSuccessRate: 0,
      searchOperations: 0,
      avgSearchLatencyMs: 0,
      hnswStats: { totalNodes: 0, totalEdges: 0, levels: 0, nativeAvailable: true },
    });

    const bank = new QEReasoningBank(createMockMemory());
    await bank.initialize();

    const createCalls = (mocks.patternStore.create as ReturnType<typeof vi.fn>).mock.calls;
    // At minimum, one create per pretrained pattern (cross-domain seeding may add more)
    expect(createCalls.length).toBeGreaterThanOrEqual(PRETRAINED_PATTERNS.length);

    // The first N calls correspond to the pretrained loop — each must carry an embedding.
    // This is the actual fix: pre-PR, patternStore.create(options) was called without
    // an embedding, so RvfPatternStore.store()'s `pattern.embedding && this.adapter`
    // gate skipped adapter.ingest(). Routing through storePattern() pre-computes it.
    for (let i = 0; i < PRETRAINED_PATTERNS.length; i++) {
      const opts = createCalls[i][0] as CreateQEPatternOptions;
      expect(opts.embedding, `pretrained pattern ${i} (${opts.name}) missing embedding`).toBeDefined();
      expect((opts.embedding as ArrayLike<number>).length).toBeGreaterThan(0);
    }

    await bank.dispose();
  });

  it('existing install: backfills the RVF adapter from SQLite when totalVectors === 0', async () => {
    // Simulate post-bug state: SQLite holds embeddings, .rvf is empty
    (mocks.patternStore.getStats as ReturnType<typeof vi.fn>).mockResolvedValue({
      totalPatterns: 3,
      byTier: { shortTerm: 3, longTerm: 0 },
      byDomain: {},
      byType: {},
      avgConfidence: 0.7,
      avgQualityScore: 0.5,
      avgSuccessRate: 0,
      searchOperations: 0,
      avgSearchLatencyMs: 0,
      hnswStats: { totalNodes: 0, totalEdges: 0, levels: 0, nativeAvailable: true },
    });
    mocks.sqliteEmbeddings.push(
      { patternId: 'p1', embedding: Array.from({ length: 384 }, () => 0.1) },
      { patternId: 'p2', embedding: Array.from({ length: 384 }, () => 0.2) },
      { patternId: 'p3', embedding: Array.from({ length: 384 }, () => 0.3) },
    );
    mocks.adapter.statusValue.totalVectors = 0;

    const bank = new QEReasoningBank(createMockMemory());
    await bank.initialize();

    expect(mocks.adapter.ingest).toHaveBeenCalledTimes(1);
    const ingestArg = (mocks.adapter.ingest as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<{
      id: string;
      vector: Float32Array;
    }>;
    expect(ingestArg).toHaveLength(3);
    expect(ingestArg.map((e) => e.id).sort()).toEqual(['p1', 'p2', 'p3']);
    expect(ingestArg[0].vector).toBeInstanceOf(Float32Array);
    expect(ingestArg[0].vector.length).toBe(384);

    // No fresh-install path should have run
    expect(mocks.patternStore.create).not.toHaveBeenCalled();

    await bank.dispose();
  });

  it('existing install: skips backfill when adapter already has vectors (idempotent guard)', async () => {
    (mocks.patternStore.getStats as ReturnType<typeof vi.fn>).mockResolvedValue({
      totalPatterns: 3,
      byTier: { shortTerm: 3, longTerm: 0 },
      byDomain: {},
      byType: {},
      avgConfidence: 0.7,
      avgQualityScore: 0.5,
      avgSuccessRate: 0,
      searchOperations: 0,
      avgSearchLatencyMs: 0,
      hnswStats: { totalNodes: 0, totalEdges: 0, levels: 0, nativeAvailable: true },
    });
    mocks.sqliteEmbeddings.push({
      patternId: 'p1',
      embedding: Array.from({ length: 384 }, () => 0.1),
    });
    mocks.adapter.statusValue.totalVectors = 19; // already populated

    const bank = new QEReasoningBank(createMockMemory());
    await bank.initialize();

    // adapter.ingest must NOT be re-called — ingest is not idempotent
    expect(mocks.adapter.ingest).not.toHaveBeenCalled();

    await bank.dispose();
  });

  it('existing install: no-op when patternStore has no getAdapter (non-RVF store)', async () => {
    (mocks.patternStore.getStats as ReturnType<typeof vi.fn>).mockResolvedValue({
      totalPatterns: 5,
      byTier: { shortTerm: 5, longTerm: 0 },
      byDomain: {},
      byType: {},
      avgConfidence: 0.7,
      avgQualityScore: 0.5,
      avgSuccessRate: 0,
      searchOperations: 0,
      avgSearchLatencyMs: 0,
      hnswStats: { totalNodes: 0, totalEdges: 0, levels: 0, nativeAvailable: false },
    });
    // Simulate non-RVF store: getAdapter returns undefined
    (mocks.patternStore.getAdapter as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

    const bank = new QEReasoningBank(createMockMemory());
    await expect(bank.initialize()).resolves.toBeUndefined();
    expect(mocks.adapter.ingest).not.toHaveBeenCalled();

    await bank.dispose();
  });
});
