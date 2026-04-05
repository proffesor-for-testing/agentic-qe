/**
 * Tests for RvfPatternStore (ADR-066)
 *
 * Tests the RVF-backed pattern store adapter, factory routing,
 * and migration utility.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RvfPatternStore } from '../../../src/learning/rvf-pattern-store.js';
import type { RvfNativeAdapter } from '../../../src/integrations/ruvector/rvf-native-adapter.js';
import type { QEPattern } from '../../../src/learning/qe-patterns.js';
import { migratePatterns } from '../../../src/learning/rvf-pattern-migration.js';
import {
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
} from '../../../src/integrations/ruvector/feature-flags.js';

// ============================================================================
// Mock RVF Adapter
// ============================================================================

function createMockAdapter(opts: { dimension?: number } = {}): RvfNativeAdapter {
  const dimension = opts.dimension ?? 384;
  const vectors = new Map<string, Float32Array>();

  return {
    ingest: vi.fn((entries: Array<{ id: string; vector: Float32Array | number[] }>) => {
      for (const e of entries) {
        const vec = e.vector instanceof Float32Array ? e.vector : new Float32Array(e.vector);
        vectors.set(e.id, vec);
      }
      return { accepted: entries.length, rejected: 0 };
    }),
    search: vi.fn((query: Float32Array | number[], k: number) => {
      // Simple brute-force cosine similarity
      const qVec = query instanceof Float32Array ? query : new Float32Array(query);
      const results: Array<{ id: string; distance: number; score: number }> = [];
      for (const [id, vec] of vectors) {
        let dot = 0, magA = 0, magB = 0;
        for (let i = 0; i < dimension; i++) {
          dot += qVec[i] * vec[i];
          magA += qVec[i] * qVec[i];
          magB += vec[i] * vec[i];
        }
        const similarity = dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-9);
        results.push({ id, distance: 1 - similarity, score: similarity });
      }
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, k);
    }),
    delete: vi.fn((ids: string[]) => {
      let deleted = 0;
      for (const id of ids) {
        if (vectors.delete(id)) deleted++;
      }
      return deleted;
    }),
    status: vi.fn(() => ({
      totalVectors: vectors.size,
      totalSegments: 1,
      fileSizeBytes: vectors.size * dimension * 4,
      epoch: 1,
      witnessValid: true,
      witnessEntries: 0,
    })),
    close: vi.fn(),
    isOpen: vi.fn(() => true),
    path: vi.fn(() => '/tmp/test-patterns.rvf'),
    dimension: vi.fn(() => dimension),
    size: vi.fn(() => vectors.size),
    compact: vi.fn(),
    fork: vi.fn(),
    derive: vi.fn(),
    embedKernel: vi.fn(),
    extractKernel: vi.fn(() => null),
    verifyWitness: vi.fn(() => ({ valid: true, totalEntries: 0, errors: [] })),
    sign: vi.fn(() => null),
    fileId: vi.fn(() => 'test-file-id'),
    parentId: vi.fn(() => null),
    lineageDepth: vi.fn(() => 0),
    indexStats: vi.fn(() => ({
      totalVectors: vectors.size,
      dimension,
      totalSegments: 1,
      fileSizeBytes: 0,
      epoch: 1,
      witnessValid: true,
      witnessEntries: 0,
      idMapSize: vectors.size,
    })),
    freeze: vi.fn(() => 1),
  } as unknown as RvfNativeAdapter;
}

// ============================================================================
// Test Helpers
// ============================================================================

function makePattern(overrides: Partial<QEPattern> = {}): QEPattern {
  return {
    id: `pattern-${Math.random().toString(36).slice(2, 8)}`,
    patternType: 'test-template',
    qeDomain: 'test-generation',
    domain: 'test-generation',
    name: 'Test Pattern',
    description: 'A test pattern for unit testing',
    confidence: 0.8,
    usageCount: 5,
    successRate: 0.9,
    qualityScore: 0.75,
    context: { tags: ['test'] },
    template: { type: 'code', content: 'test()', variables: [] },
    embedding: Array.from({ length: 384 }, () => Math.random()),
    tier: 'short-term',
    createdAt: new Date(),
    lastUsedAt: new Date(),
    successfulUses: 4,
    reusable: false,
    reuseCount: 0,
    averageTokenSavings: 0,
    ...overrides,
  } as QEPattern;
}

// ============================================================================
// RvfPatternStore Tests
// ============================================================================

describe('RvfPatternStore', () => {
  let store: RvfPatternStore;
  let adapter: RvfNativeAdapter;

  beforeEach(async () => {
    adapter = createMockAdapter();
    store = new RvfPatternStore(
      () => adapter,
      { rvfPath: '/tmp/test.rvf', base: undefined as any },
    );
    await store.initialize();
  });

  afterEach(async () => {
    await store.dispose();
  });

  describe('Initialization', () => {
    it('should initialize and create adapter', async () => {
      expect(store.getAdapter()).toBe(adapter);
    });

    it('should skip re-initialization', async () => {
      const factoryFn = vi.fn(() => adapter);
      const s = new RvfPatternStore(factoryFn, { rvfPath: '/tmp/test.rvf', base: undefined as any });
      await s.initialize();
      await s.initialize(); // second call
      expect(factoryFn).toHaveBeenCalledTimes(1);
      await s.dispose();
    });
  });

  describe('Store', () => {
    it('should store a pattern and ingest its vector', async () => {
      const pattern = makePattern();
      const result = await store.store(pattern);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(pattern.id);
      }
      expect(adapter.ingest).toHaveBeenCalledOnce();
    });

    it('should reject pattern below confidence threshold', async () => {
      const pattern = makePattern({ confidence: 0.1 });
      const result = await store.store(pattern);

      expect(result.success).toBe(false);
      expect(adapter.ingest).not.toHaveBeenCalled();
    });

    it('should skip vector ingest when embedding is missing', async () => {
      const pattern = makePattern({ embedding: undefined });
      const result = await store.store(pattern);

      expect(result.success).toBe(true);
      expect(adapter.ingest).not.toHaveBeenCalled();
    });
  });

  describe('Search', () => {
    it('should search by vector via RVF adapter', async () => {
      // Store a pattern first
      const pattern = makePattern();
      await store.store(pattern);

      // Search with its own embedding
      const result = await store.search(pattern.embedding!, { limit: 5 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(adapter.search).toHaveBeenCalled();
      }
    });

    it('should filter results by domain', async () => {
      const p1 = makePattern({ qeDomain: 'test-generation' });
      const p2 = makePattern({ qeDomain: 'coverage-analysis' });

      // Mock sqliteStore for metadata lookup
      const mockSqlite = {
        getPattern: vi.fn((id: string) => {
          if (id === p1.id) return p1;
          if (id === p2.id) return p2;
          return null;
        }),
      };
      (store as any).sqliteStore = mockSqlite;

      await store.store(p1);
      await store.store(p2);

      const result = await store.search(p1.embedding!, {
        domain: 'test-generation',
        limit: 10,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        for (const r of result.value) {
          expect(r.pattern.qeDomain).toBe('test-generation');
        }
      }
    });
  });

  describe('Delete', () => {
    it('should delete vector from RVF adapter', async () => {
      const pattern = makePattern();
      await store.store(pattern);

      const result = await store.delete(pattern.id);

      expect(result.success).toBe(true);
      expect(adapter.delete).toHaveBeenCalledWith([pattern.id]);
    });
  });

  describe('Stats', () => {
    it('should return stats from RVF adapter', async () => {
      const pattern = makePattern();
      await store.store(pattern);

      const stats = await store.getStats();

      expect(stats.totalPatterns).toBe(1);
      expect(stats.hnswStats.nativeAvailable).toBe(true);
      expect(stats.hnswStats.vectorCount).toBe(1);
    });
  });

  describe('Create', () => {
    it('should create a pattern with defaults', async () => {
      const result = await store.create({
        patternType: 'test-template',
        name: 'New Pattern',
        description: 'Created via create()',
        template: { type: 'code', content: 'test()', variables: [] },
        embedding: Array.from({ length: 384 }, () => Math.random()),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.name).toBe('New Pattern');
        expect(result.value.tier).toBe('short-term');
        expect(result.value.confidence).toBe(0.5); // default
      }
    });
  });
});

// ============================================================================
// Factory Routing Tests
// ============================================================================

describe('createPatternStore factory routing', () => {
  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('should return PatternStore when useRVFPatternStore is false', async () => {
    setRuVectorFeatureFlags({ useRVFPatternStore: false });

    const { createPatternStore } = await import('../../../src/learning/pattern-store.js');
    const mockMemory = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(() => []),
      clear: vi.fn(),
    };
    const store = createPatternStore(mockMemory as any);

    // Should be the original PatternStore (not RvfPatternStore)
    expect(store.constructor.name).toBe('PatternStore');
    await store.dispose();
  });

  it('should return RvfPatternStore when useRVFPatternStore is true and native is available', async () => {
    // Check if native binary is actually available in this environment
    let nativeAvailable = false;
    try {
      const { isRvfNativeAvailable } = await import(
        '../../../src/integrations/ruvector/rvf-native-adapter.js'
      );
      nativeAvailable = isRvfNativeAvailable();
    } catch { /* not available */ }

    if (!nativeAvailable) {
      console.log('[TEST] Skipping true-path test — @ruvector/rvf-node not available');
      return;
    }

    setRuVectorFeatureFlags({ useRVFPatternStore: true });

    const { createPatternStore } = await import('../../../src/learning/pattern-store.js');
    const mockMemory = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(() => []),
      clear: vi.fn(),
    };
    const store = createPatternStore(mockMemory as any);

    expect(store.constructor.name).toBe('RvfPatternStore');
    await store.dispose();

    // Cleanup the .rvf file created
    const { existsSync, unlinkSync } = await import('fs');
    for (const ext of ['', '.idmap.json']) {
      const p = `.agentic-qe/patterns.rvf${ext}`;
      if (existsSync(p)) unlinkSync(p);
    }
  });
});

// ============================================================================
// Migration Utility Tests
// ============================================================================

describe('migratePatterns', () => {
  it('should migrate embeddings from SQLite to RVF', () => {
    const adapter = createMockAdapter();
    const mockSqlite = {
      getAllEmbeddings: vi.fn(() => [
        { patternId: 'p1', embedding: Array.from({ length: 384 }, () => 0.5) },
        { patternId: 'p2', embedding: Array.from({ length: 384 }, () => 0.3) },
        { patternId: 'p3', embedding: Array.from({ length: 384 }, () => 0.7) },
      ]),
    };

    const result = migratePatterns(
      mockSqlite as any,
      adapter,
      { batchSize: 2, dimension: 384 },
    );

    expect(result.totalMigrated).toBe(3);
    expect(result.totalSkipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.durationMs).toBeGreaterThan(0);
    // Two batches: [p1,p2] and [p3]
    expect(adapter.ingest).toHaveBeenCalledTimes(2);
  });

  it('should skip embeddings with wrong dimension', () => {
    const adapter = createMockAdapter();
    const mockSqlite = {
      getAllEmbeddings: vi.fn(() => [
        { patternId: 'p1', embedding: Array.from({ length: 384 }, () => 0.5) },
        { patternId: 'p2', embedding: Array.from({ length: 128 }, () => 0.3) }, // wrong dim
      ]),
    };

    const result = migratePatterns(
      mockSqlite as any,
      adapter,
      { dimension: 384 },
    );

    expect(result.totalMigrated).toBe(1);
    expect(result.totalSkipped).toBe(1);
  });

  it('should handle empty embeddings list', () => {
    const adapter = createMockAdapter();
    const mockSqlite = {
      getAllEmbeddings: vi.fn(() => []),
    };

    const result = migratePatterns(mockSqlite as any, adapter);

    expect(result.totalMigrated).toBe(0);
    expect(result.totalSkipped).toBe(0);
    expect(adapter.ingest).not.toHaveBeenCalled();
  });

  it('should handle SQLite read failure gracefully', () => {
    const adapter = createMockAdapter();
    const mockSqlite = {
      getAllEmbeddings: vi.fn(() => { throw new Error('DB locked'); }),
    };

    const result = migratePatterns(mockSqlite as any, adapter);

    expect(result.totalMigrated).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('DB locked');
  });
});
