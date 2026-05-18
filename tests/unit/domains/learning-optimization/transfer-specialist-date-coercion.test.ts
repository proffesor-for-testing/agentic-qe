/**
 * Regression: #493 follow-up — Date coercion in TransferSpecialistService.
 *
 * Two failure modes pinned:
 *
 * 1. THROW — `validateRelevance` calls `Date.now() - knowledge.createdAt.getTime()`
 *    at line 316. When `knowledge` came from a kv-read (`queryKnowledge`,
 *    `getKnowledgeById`, or `bulkTransfer`), `createdAt` is a string after
 *    JSON.parse and `.getTime()` throws TypeError.
 *
 * 2. SILENT — `validateRelevance` compares `new Date() > knowledge.expiresAt`
 *    at line 322. When `expiresAt` is a string, the comparison coerces to
 *    NaN and is always false — so expired knowledge is **never recognised
 *    as expired** and the 0.5 relevance penalty never applies. No error,
 *    just silently wrong scores.
 *
 * Fix: rehydrateDates at the kv-read seam inside queryKnowledge,
 * getKnowledgeById, and bulkTransfer. The downstream `.getTime()` and
 * `>` comparison in validateRelevance then work as designed.
 */

import { describe, it, expect, vi } from 'vitest';
import { TransferSpecialistService } from '../../../../src/domains/learning-optimization/services/transfer-specialist';
import type { MemoryBackend, StoreOptions, VectorSearchResult } from '../../../../src/kernel/interfaces';
import type { Knowledge, KnowledgeQuery, PatternContext } from '../../../../src/domains/learning-optimization/interfaces';

function makeKvMemory(seed: Record<string, unknown>): MemoryBackend {
  const storage = new Map<string, unknown>(Object.entries(seed));
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockImplementation(async (key: string, value: unknown, _options?: StoreOptions) => {
      storage.set(key, value);
    }),
    get: vi.fn().mockImplementation(async <T>(key: string): Promise<T | undefined> => {
      return storage.get(key) as T | undefined;
    }),
    delete: vi.fn().mockImplementation(async (key: string) => storage.delete(key)),
    has: vi.fn().mockImplementation(async (key: string) => storage.has(key)),
    search: vi.fn().mockImplementation(async (pattern: string, _limit?: number) => {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return Array.from(storage.keys()).filter((k) => regex.test(k));
    }),
    vectorSearch: vi.fn().mockResolvedValue([] as VectorSearchResult[]),
    storeVector: vi.fn().mockResolvedValue(undefined),
  };
}

/** Build a kv-shape Knowledge record — ISO strings on createdAt/expiresAt. */
function makeKvKnowledge(overrides: Partial<Knowledge> = {}): Knowledge {
  const base: Knowledge = {
    id: 'k1',
    type: 'fact',
    domain: 'test-generation',
    content: {
      format: 'text',
      data: 'sample',
      metadata: { language: 'typescript', tags: ['auth'] },
    },
    sourceAgentId: { value: 'agent-1', domain: 'test-generation', type: 'generator' },
    targetDomains: ['test-execution'],
    relevanceScore: 0.8,
    version: 1,
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() as unknown as Date,
  };
  return { ...base, ...overrides };
}

describe('TransferSpecialistService — kv-Date rehydration (#493 follow-up)', () => {
  describe('queryKnowledge (kv-read seam)', () => {
    it('rehydrates createdAt + expiresAt to real Date instances', async () => {
      const k = makeKvKnowledge({
        id: 'k-recent',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() as unknown as Date,
      });
      const service = new TransferSpecialistService(
        makeKvMemory({ 'learning:knowledge:shared:k-recent': k }),
      );

      // Search the shared namespace (omit domain to use the
      // `learning:knowledge:shared:*` pattern that matches our seed keys).
      const result = await service.queryKnowledge({
        limit: 10,
      } as KnowledgeQuery);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0]!.createdAt).toBeInstanceOf(Date);
      expect(result.value[0]!.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe('validateRelevance through kv-read seam (throw path)', () => {
    it('does NOT throw on age-decay math when knowledge came from queryKnowledge', async () => {
      const k = makeKvKnowledge({ id: 'k-aged' });
      const service = new TransferSpecialistService(
        makeKvMemory({ 'learning:knowledge:shared:k-aged': k }),
      );

      const queryResult = await service.queryKnowledge({
        limit: 10,
      } as KnowledgeQuery);
      expect(queryResult.success).toBe(true);
      if (!queryResult.success) return;
      expect(queryResult.value.length).toBeGreaterThan(0);
      const fetched = queryResult.value[0]!;

      // The throw site: validateRelevance does Date.now() - knowledge.createdAt.getTime()
      const ctx: PatternContext = { tags: [] };
      const relevance = await service.validateRelevance(fetched, ctx);

      expect(relevance.success).toBe(true);
      if (!relevance.success) return;
      // Returned a sensible number, not NaN, not throw.
      expect(Number.isFinite(relevance.value)).toBe(true);
      expect(relevance.value).toBeGreaterThan(0);
      expect(relevance.value).toBeLessThanOrEqual(1);
    });
  });

  describe('validateRelevance expiry check (silent path)', () => {
    it('correctly halves the relevance score when expiresAt is in the past', async () => {
      // The silent bug: pre-fix, expiresAt is a string, `new Date() > string`
      // coerces to NaN, comparison is always false, the 0.5 penalty NEVER
      // applies. Post-fix, expired knowledge gets the penalty.
      const expiredKnowledge = makeKvKnowledge({
        id: 'k-expired',
        relevanceScore: 1.0, // start at max so the 0.5x penalty is clearly visible
        // Force a fresh createdAt so age-decay doesn't dominate the math.
        createdAt: new Date().toISOString() as unknown as Date,
        expiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() as unknown as Date,
      });
      const liveKnowledge = makeKvKnowledge({
        id: 'k-live',
        relevanceScore: 1.0,
        createdAt: new Date().toISOString() as unknown as Date,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() as unknown as Date,
      });

      const service = new TransferSpecialistService(
        makeKvMemory({
          'learning:knowledge:shared:k-expired': expiredKnowledge,
          'learning:knowledge:shared:k-live': liveKnowledge,
        }),
      );

      const expiredFetched = await service.getKnowledgeById('k-expired');
      const liveFetched = await service.getKnowledgeById('k-live');
      expect(expiredFetched).not.toBeNull();
      expect(liveFetched).not.toBeNull();
      // Date rehydration verified at the read seam.
      expect(expiredFetched!.expiresAt).toBeInstanceOf(Date);
      expect(liveFetched!.expiresAt).toBeInstanceOf(Date);

      const ctx: PatternContext = { tags: [] };
      const expiredRel = await service.validateRelevance(expiredFetched!, ctx);
      const liveRel = await service.validateRelevance(liveFetched!, ctx);

      expect(expiredRel.success).toBe(true);
      expect(liveRel.success).toBe(true);
      if (!expiredRel.success || !liveRel.success) return;

      // The semantic that pre-fix WAS broken: expired knowledge scores lower
      // than live knowledge. Pre-fix both would yield the same score because
      // the expiry comparison silently returned false.
      expect(expiredRel.value).toBeLessThan(liveRel.value);
      // Quantitatively: expired ≈ live * 0.5 (give or take age-decay).
      expect(expiredRel.value).toBeCloseTo(liveRel.value * 0.5, 2);
    });
  });

  describe('getKnowledgeById (kv-read seam)', () => {
    it('returns a Knowledge with real Date fields', async () => {
      const k = makeKvKnowledge({ id: 'k-direct' });
      const service = new TransferSpecialistService(
        makeKvMemory({ 'learning:knowledge:shared:k-direct': k }),
      );

      const result = await service.getKnowledgeById('k-direct');

      expect(result).not.toBeNull();
      expect(result!.createdAt).toBeInstanceOf(Date);
    });

    it('returns null when the key is missing (no kv corruption surface)', async () => {
      const service = new TransferSpecialistService(makeKvMemory({}));
      const result = await service.getKnowledgeById('does-not-exist');
      expect(result).toBeNull();
    });
  });
});
