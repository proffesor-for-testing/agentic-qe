/**
 * Issue #653: FTS5 hybrid scoring must participate when a text query reaches
 * the pattern stores as a pre-computed embedding (QEReasoningBank path).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { blendFtsScore, createPatternStore, type PatternStore } from '../../../src/learning/pattern-store.js';
import { RvfPatternStore } from '../../../src/learning/rvf-pattern-store.js';
import { createSQLitePatternStore, type SQLitePatternStore } from '../../../src/learning/sqlite-persistence.js';
import * as embeddings from '../../../src/learning/real-embeddings.js';
import { QEReasoningBank } from '../../../src/learning/qe-reasoning-bank.js';
import type { QEPattern } from '../../../src/learning/qe-patterns.js';
import type { MemoryBackend } from '../../../src/kernel/interfaces.js';
import { setRuVectorFeatureFlags, resetRuVectorFeatureFlags } from '../../../src/integrations/ruvector/feature-flags.js';

const SPACE_ID = 'test-space-653';
const DIM = 8;

function memoryBackend(): MemoryBackend {
  const storage = new Map<string, unknown>();
  return {
    get: vi.fn(async (k: string) => storage.get(k) ?? null),
    set: vi.fn(async (k: string, v: unknown) => { storage.set(k, v); }),
    delete: vi.fn(async (k: string) => { storage.delete(k); }),
    has: vi.fn(async (k: string) => storage.has(k)),
    keys: vi.fn(async () => [...storage.keys()]),
    search: vi.fn(async () => []),
    clear: vi.fn(async () => { storage.clear(); }),
    size: vi.fn(async () => storage.size),
    close: vi.fn(async () => undefined),
    getState: vi.fn(() => ({ type: 'memory', ready: true })),
  } as unknown as MemoryBackend;
}

function pattern(id: string, name: string, description: string, qualityScore = 0.5): QEPattern {
  const now = new Date();
  return {
    id,
    patternType: 'test-template',
    qeDomain: 'test-generation',
    domain: 'test-generation',
    name,
    description,
    confidence: 0.7,
    usageCount: 0,
    successRate: 0,
    qualityScore,
    context: { tags: [], language: 'typescript', testType: 'unit' },
    template: { type: 'code', content: '// template', variables: [] },
    tier: 'short-term',
    createdAt: now,
    lastUsedAt: now,
    successfulUses: 0,
  } as QEPattern;
}

const NEEDLE = pattern('needle', 'Idempotency key replay guard', 'Reject a second payment carrying a reused idempotency key', 0.1);
const FILLER = [
  pattern('filler-1', 'Login form validation', 'Validate empty username and password fields', 0.9),
  pattern('filler-2', 'Pagination boundary', 'Check the last page of a paginated listing', 0.9),
  pattern('filler-3', 'Date formatting', 'Format timestamps using the user locale', 0.9),
];
const UNRELATED_VECTOR = Array.from({ length: DIM }, (_, i) => (i === 0 ? 1 : 0));

describe('SQLitePatternStore.searchFTS natural-language queries (#653)', () => {
  let tmpDir: string;
  let sqlite: SQLitePatternStore;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-653-fts-'));
    sqlite = createSQLitePatternStore({ useUnified: false, dbPath: path.join(tmpDir, 'patterns.db') });
    await sqlite.initialize();
    for (const p of [NEEDLE, ...FILLER]) sqlite.storePattern(p);
  });

  afterEach(() => {
    sqlite.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('matches a sentence query by its terms, not only as an exact phrase', () => {
    const hits = sqlite.searchFTS('write a test that the idempotency key cannot be replayed', 10);
    expect(hits[0]?.id).toBe('needle');
  });

  it('ranks rare query terms above patterns that only share common words', () => {
    for (let i = 0; i < 5; i++) {
      sqlite.storePattern(pattern(`noise-${i}`, `Write a test for the ${i} test case`,
        'How to write a test that the test runner should run for the test case in the test suite'));
    }

    const hits = sqlite.searchFTS('how should I write a test for the idempotency key', 10);

    expect(hits[0]?.id).toBe('needle');
  });

  it('flags hits that contain the whole query as a phrase', () => {
    const hits = sqlite.searchFTS('idempotency key replay', 10);

    expect(hits.find(h => h.id === 'needle')?.phrase).toBe(true);
    expect(sqlite.searchFTS('replay the idempotency key', 10).find(h => h.id === 'needle')?.phrase).toBe(false);
  });

  it('treats FTS5 operators and quotes in the query as literal text', () => {
    expect(() => sqlite.searchFTS('idempotency" OR NEAR(key AND * -', 10)).not.toThrow();
    expect(sqlite.searchFTS('idempotency" OR NEAR(key AND * -', 10)[0]?.id).toBe('needle');
  });

  it('returns nothing for a query with no usable terms', () => {
    expect(sqlite.searchFTS('" - * ( )', 10)).toEqual([]);
  });

  it('reports the fraction of distinct query terms each hit contains', () => {
    const hits = sqlite.searchFTS('idempotency key for the checkout', 10);

    // needle text has "idempotency" and "key" but not "for", "the", "checkout"
    expect(hits.find(h => h.id === 'needle')?.coverage).toBeCloseTo(2 / 5, 6);
  });
});

describe('PatternStore.search with a pre-computed vector and textQuery (#653)', () => {
  let tmpDir: string;
  let sqlite: SQLitePatternStore;
  let store: PatternStore;

  beforeEach(async () => {
    setRuVectorFeatureFlags({ useRVFPatternStore: false });
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-653-ps-'));
    sqlite = createSQLitePatternStore({ useUnified: false, dbPath: path.join(tmpDir, 'patterns.db') });
    await sqlite.initialize();
    store = createPatternStore(memoryBackend(), { embeddingDimension: DIM, embeddingSpaceId: SPACE_ID }) as PatternStore;
    await store.initialize();
    store.setSqliteStore(sqlite);
    for (const p of [NEEDLE, ...FILLER]) await store.store(p);
  });

  afterEach(async () => {
    await store.dispose();
    sqlite.close();
    resetRuVectorFeatureFlags();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('adds FTS5 lexical hits when the caller supplies the original text', async () => {
    const result = await store.search(UNRELATED_VECTOR, {
      embeddingSpaceId: SPACE_ID,
      textQuery: 'idempotency key replay',
      limit: 3,
    });

    expect(result.success).toBe(true);
    const top = result.success ? result.value[0] : undefined;
    expect(top?.pattern.id).toBe('needle');
    expect(top?.matchType).toBe('lexical');
  });

  it('routes with compatible stored pattern evidence instead of swallowing a provenance error', async () => {
    const identity = vi.spyOn(embeddings, 'getActiveEmbeddingSpaceIdentity')
      .mockReturnValue({ spaceId: SPACE_ID } as never);
    const bank = new QEReasoningBank(memoryBackend(), undefined, { useONNXEmbeddings: true, embeddingDimension: DIM });
    Object.assign(bank, { initialized: true, patternStore: store });
    const provider = vi.spyOn(embeddings, 'computeRealEmbedding').mockResolvedValue(UNRELATED_VECTOR);
    const routedSearch = vi.spyOn(store, 'search');
    try {
      const result = await bank.routeTask({ task: 'idempotency key replay', domain: 'test-generation' });
      expect(result.success).toBe(true);
      expect(result.success ? result.value.patterns.map(p => p.id) : []).toContain('needle');
      expect(routedSearch).toHaveBeenCalledWith(UNRELATED_VECTOR, expect.objectContaining({
        embeddingSpaceId: SPACE_ID, useVectorSearch: true,
      }));
    } finally { identity.mockRestore(); provider.mockRestore(); routedSearch.mockRestore(); }
  });

  it('never upgrades text fallback or list-all metadata into reusable vector evidence', async () => {
    const reusable = { ...pattern('reusable', 'sentinel', 'sentinel', 1),
      reusable: true, successRate: 1, confidence: 1, averageTokenSavings: 100 };
    await store.store(reusable);
    vi.spyOn(sqlite, 'searchFTS').mockImplementation(() => { throw new Error('FTS unavailable'); });
    for (const query of ['sentinel', '']) {
      const result = await store.search(query);
      const hit = result.success ? result.value.find(r => r.pattern.id === reusable.id) : undefined;
      expect(hit).toMatchObject({ matchType: query ? 'lexical' : 'context', similarity: 0,
        canReuse: false, estimatedTokenSavings: 0 });
    }
  });

  it('never reports a keyword-only hit as a near-duplicate', async () => {
    // Experience capture merges into an existing pattern at similarity >= 0.85;
    // sharing query words must not qualify, however the BM25 score normalizes.
    const result = await store.search('Generate unit tests for UserService idempotency', { limit: 5 });

    const keywordHits = result.success ? result.value.filter(r => r.matchType === 'lexical') : [];
    expect(keywordHits.length).toBeGreaterThan(0);
    for (const hit of keywordHits) expect(hit.similarity).toBeLessThanOrEqual(0.5);
    // Below every early-exit threshold (lowest preset 0.7): keywords alone never skip work
    for (const hit of keywordHits) expect(hit.score).toBeLessThanOrEqual(0.5);
  });

  it('keeps whole-phrase keyword evidence separate from vector reuse', async () => {
    const result = await store.search('Idempotency key replay guard', { limit: 5 });

    const needle = result.success ? result.value.find(r => r.pattern.id === 'needle') : undefined;
    expect(needle?.similarity).toBe(0);
    expect(needle?.matchType).toBe('lexical');
    expect(needle?.canReuse).toBeFalsy();
  });

  it('keeps vector-only behaviour when no textQuery is supplied', async () => {
    const result = await store.search(UNRELATED_VECTOR, { embeddingSpaceId: SPACE_ID, limit: 3 });

    expect(result.success).toBe(true);
    const exact = result.success ? result.value.filter(r => r.matchType === 'lexical') : [];
    expect(exact).toEqual([]);
  });
});

describe('RvfPatternStore.search with a pre-computed vector and textQuery (#653)', () => {
  let tmpDir: string;
  let sqlite: SQLitePatternStore;
  let store: RvfPatternStore;
  let adapter: { search: ReturnType<typeof vi.fn> } & Record<string, unknown>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-653-rvf-'));
    adapter = {
      ingest: vi.fn(), search: vi.fn(() => []), delete: vi.fn(), status: vi.fn(() => ({ totalVectors: 0 })),
      dimension: vi.fn(() => DIM), close: vi.fn(), compact: vi.fn(), size: vi.fn(() => 0),
    };
    store = new RvfPatternStore(() => adapter as never, {
      rvfPath: path.join(tmpDir, 'p.rvf'), base: undefined as never, embeddingSpaceId: SPACE_ID,
    });
    sqlite = createSQLitePatternStore({ useUnified: false, dbPath: path.join(tmpDir, 'patterns.db') });
    await sqlite.initialize();
    store.setSqliteStore(sqlite);
    await store.initialize();
    for (const p of [NEEDLE, ...FILLER]) sqlite.storePattern(p);
  });

  afterEach(async () => {
    await store.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('adds FTS5 lexical hits when the caller supplies the original text', async () => {
    const result = await store.search(UNRELATED_VECTOR, {
      embeddingSpaceId: SPACE_ID,
      textQuery: 'idempotency key replay',
      limit: 3,
    });

    expect(result.success).toBe(true);
    expect(result.success ? result.value.map(r => r.pattern.id) : []).toContain('needle');
  });

  it('does not treat list-all quality metadata as vector reuse evidence', async () => {
    const reusable = { ...pattern('reusable', 'sentinel', 'sentinel', 1),
      reusable: true, successRate: 1, confidence: 1, averageTokenSavings: 100 };
    sqlite.storePattern(reusable);
    const result = await store.search('');
    const hit = result.success ? result.value.find(r => r.pattern.id === reusable.id) : undefined;
    expect(hit).toMatchObject({ matchType: 'context', similarity: 0,
      canReuse: false, estimatedTokenSavings: 0 });
  });

  it('never reports a keyword-only hit as a near-duplicate', async () => {
    const result = await store.search('Generate unit tests for UserService idempotency', { limit: 5 });

    const keywordHits = result.success ? result.value.filter(r => r.matchType === 'lexical') : [];
    expect(keywordHits.length).toBeGreaterThan(0);
    for (const hit of keywordHits) expect(hit.similarity).toBeLessThanOrEqual(0.5);
    // Below every early-exit threshold (lowest preset 0.7): keywords alone never skip work
    for (const hit of keywordHits) expect(hit.score).toBeLessThanOrEqual(0.5);
  });

  it('keeps whole-phrase keyword evidence separate from vector reuse', async () => {
    const result = await store.search('Idempotency key replay guard', { limit: 5 });

    const needle = result.success ? result.value.find(r => r.pattern.id === 'needle') : undefined;
    expect(needle?.similarity).toBe(0);
    expect(needle?.matchType).toBe('lexical');
    expect(needle?.canReuse).toBeFalsy();
  });

  it('blends FTS5 relevance into vector hits the same way PatternStore does', async () => {
    adapter.search.mockReturnValue([
      { id: 'filler-1', distance: 0.3, score: 0.7 },
      { id: 'needle', distance: 0.3, score: 0.7 },
    ]);
    const fts = sqlite.searchFTS('idempotency key replay', 6).find(r => r.id === 'needle')!.ftsScore;

    const result = await store.search(UNRELATED_VECTOR, {
      embeddingSpaceId: SPACE_ID,
      textQuery: 'idempotency key replay',
      limit: 3,
    });

    const scores = new Map(result.success ? result.value.map(r => [r.pattern.id, r.score]) : []);
    expect(scores.get('needle')).toBeCloseTo(0.75 * 0.7 + 0.25 * fts, 6);
    expect(scores.get('filler-1')).toBeCloseTo(0.7, 6);
  });

  it('does not let a hit sharing one query word outrank a semantic vector hit', async () => {
    // ftsScore is relative to the best lexical hit, so without term coverage
    // the best of a weak set (here: one shared word) always scored 0.5.
    for (let i = 0; i < 6; i++) {
      sqlite.storePattern(pattern(`other-${i}`, `Unrelated check ${i}`, `Assert widget ${i} renders a tooltip`));
    }
    adapter.search.mockReturnValue([{ id: 'needle', distance: 0.55, score: 0.45 }]);

    const result = await store.search(UNRELATED_VECTOR, {
      embeddingSpaceId: SPACE_ID,
      textQuery: 'prevent double charging when a client retries the checkout page',
      limit: 3,
    });

    const ranked = result.success ? result.value : [];
    expect(ranked[0]?.pattern.id).toBe('needle');
    const pageHit = ranked.find(r => r.pattern.id === 'filler-2');
    expect(pageHit?.score ?? 0).toBeLessThan(0.45);
  });

  it('does not boost a weak vector on one common query term', async () => {
    adapter.search.mockReturnValue([{ id: 'needle', distance: 0.7, score: 0.3 }]);
    vi.spyOn(sqlite, 'searchFTS').mockReturnValue([{ id: 'needle', ftsScore: 1, phrase: false, coverage: 0.1 }]);
    const result = await store.search(UNRELATED_VECTOR, { embeddingSpaceId: SPACE_ID, textQuery: 'test a rare invariant' });
    expect(result.success && result.value[0].score).toBeCloseTo(0.3);
    expect(result.success && result.value[0].similarity).toBeCloseTo(0.3);
  });

  it('scans every compatible embedding when RVF is unbound, excluding alien and legacy spaces', async () => {
    Object.assign(store, { adapter: null });
    for (let i = 0; i < 8; i++) {
      sqlite.storePattern(pattern(`alien-${i}`, 'Alien vector', 'Different embedding space'), UNRELATED_VECTOR, 'alien');
    }
    sqlite.storePattern(pattern('late-compatible', 'Compatible vector', 'Same embedding space'), UNRELATED_VECTOR, SPACE_ID);
    const result = await store.search(UNRELATED_VECTOR, { embeddingSpaceId: SPACE_ID, limit: 1 });
    expect(result.success ? result.value.map(r => r.pattern.id) : []).toEqual(['late-compatible']);
  });

  it('never lowers a strong vector hit because its lexical score is weaker', async () => {
    adapter.search.mockReturnValue([{ id: 'needle', distance: 0.02, score: 0.98 }]);
    vi.spyOn(sqlite, 'searchFTS').mockReturnValue([{ id: 'needle', ftsScore: 0.1, phrase: false, coverage: 1 }]);

    const result = await store.search(UNRELATED_VECTOR, {
      embeddingSpaceId: SPACE_ID,
      textQuery: 'idempotency',
      limit: 3,
    });

    const needle = result.success ? result.value.find(r => r.pattern.id === 'needle') : undefined;
    expect(needle?.score).toBeCloseTo(0.98, 6);
  });
});

describe('blendFtsScore (#653)', () => {
  it('lets lexical agreement raise but never lower the vector score', () => {
    expect(blendFtsScore(0.7, 1)).toBeCloseTo(0.775, 6);
    expect(blendFtsScore(0.98, 0.1)).toBe(0.98);
    expect(blendFtsScore(0, 0)).toBe(0);
  });
});

describe('QEReasoningBank.searchPatterns forwards the original text (#653)', () => {
  it('passes the text query alongside its embedding to the pattern store', async () => {
    const bank = new QEReasoningBank(memoryBackend(), undefined, { useONNXEmbeddings: false, embeddingDimension: DIM });
    const search = vi.fn(async () => ({ success: true as const, value: [] }));
    Object.assign(bank as unknown as Record<string, unknown>, {
      initialized: true,
      patternStore: { search },
    });

    await bank.searchPatterns('idempotency key replay', { limit: 5 });

    expect(search).toHaveBeenCalledTimes(1);
    const [query, options] = search.mock.calls[0] as unknown as [number[], Record<string, unknown>];
    expect(query).toBe('idempotency key replay');
    expect(options.useVectorSearch).toBe(false);
    expect(options.textQuery).toBe('idempotency key replay');
  });

  it.each(['hash', 'resized', 'failed'] as const)('does not stamp global provider identity on %s vectors', async mode => {
    const identity = vi.spyOn(embeddings, 'getActiveEmbeddingSpaceIdentity').mockReturnValue({ spaceId: SPACE_ID } as never);
    const provider = vi.spyOn(embeddings, 'computeRealEmbedding');
    if (mode === 'failed') provider.mockRejectedValue(new Error('provider offline'));
    else provider.mockResolvedValue(Array(384).fill(0.1));
    const bank = new QEReasoningBank(memoryBackend(), undefined, { useONNXEmbeddings: mode !== 'hash', embeddingDimension: DIM });
    const search = vi.fn(async () => ({ success: true as const, value: [] }));
    Object.assign(bank, { initialized: true, patternStore: { search } });
    try {
      await bank.routeTask({ task: 'idempotency key replay', domain: 'test-generation' });
      await bank.searchPatterns('idempotency key replay');
      for (const call of search.mock.calls) {
        const [query, options] = call as unknown as [unknown, Record<string, unknown>];
        expect(query).toBe('idempotency key replay');
        expect(options.embeddingSpaceId).toBeUndefined();
        expect(options.useVectorSearch).toBe(false);
      }
      expect(search).toHaveBeenCalledTimes(2);
    } finally { identity.mockRestore(); provider.mockRestore(); }
  });

  it('does not attach a textQuery to the empty list-all query', async () => {
    const bank = new QEReasoningBank(memoryBackend(), undefined, { useONNXEmbeddings: false, embeddingDimension: DIM });
    const search = vi.fn(async () => ({ success: true as const, value: [] }));
    Object.assign(bank as unknown as Record<string, unknown>, { initialized: true, patternStore: { search } });

    await bank.searchPatterns('', { limit: 5 });

    const [, options] = search.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(options.textQuery).toBeUndefined();
  });
});
