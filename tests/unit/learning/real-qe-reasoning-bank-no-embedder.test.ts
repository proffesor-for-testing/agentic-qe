/**
 * Issue #1022: without an embedding runtime (no @huggingface/transformers and
 * no AQE_EMBEDDER_ENDPOINT), RealQEReasoningBank.initialize() threw on the
 * embedding-space canary, so the MCP ReasoningBankService never started and
 * task_orchestrate failed. The CLI paths that build this bank (`aqe eval`,
 * `aqe validate-swarm`) failed the same way.
 *
 * Without an embedder the bank must start text-only: patterns are stored with
 * no vector (pending backfill), search is lexical (FTS) only and labelled as
 * such, and no similarity score is computed. With an embedder, behaviour is
 * unchanged.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DIM = 384;
const SPACE_ID = 'test-space-1022';

const embeddingMocks = vi.hoisted(() => ({
  available: false,
  calls: [] as string[],
}));

// Deterministic test vector: one bucket per word, so texts that share words
// are close. Only used for the embedder-present case.
function testVector(text: string): number[] {
  const v = new Array(DIM).fill(0);
  for (const word of text.toLowerCase().split(/\W+/).filter(Boolean)) {
    let h = 0;
    for (const ch of word) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    v[h % DIM] += 1;
  }
  const norm = Math.hypot(...v) || 1;
  return v.map(x => x / norm);
}

const UNAVAILABLE =
  'Transformer initialization previously failed: In-process embeddings require the optional ' +
  'package "@huggingface/transformers", which is not installed.';

vi.mock('../../../src/learning/real-embeddings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/learning/real-embeddings.js')>();
  return {
    ...actual,
    computeRealEmbedding: vi.fn(async (text: string) => {
      embeddingMocks.calls.push(text);
      if (!embeddingMocks.available) throw new Error(UNAVAILABLE);
      return testVector(text);
    }),
    getActiveEmbeddingSpaceIdentity: () =>
      embeddingMocks.available ? ({ spaceId: SPACE_ID } as never) : null,
  };
});

import { RealQEReasoningBank } from '../../../src/learning/real-qe-reasoning-bank.js';

const PATTERN = {
  patternType: 'test-template' as const,
  name: 'Retry flaky network calls',
  description: 'Wrap flaky network calls in bounded retry with jitter',
  template: { type: 'prompt' as const, content: 'retry', variables: [] },
  context: { tags: ['flaky', 'network'] },
};

describe('RealQEReasoningBank without an embedding runtime (#1022)', () => {
  let dir: string;
  let bank: RealQEReasoningBank;

  const createBank = () =>
    new RealQEReasoningBank({ sqlite: { dbPath: path.join(dir, 'patterns.db'), useUnified: false } });

  // Read through the bank's own store rather than opening the file again.
  const store = () => (bank as unknown as {
    sqliteStore: { getAllEmbeddings(): unknown[]; getPattern(id: string): { name: string } | null };
  }).sqliteStore;
  const countEmbeddings = (): number => store().getAllEmbeddings().length;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1022-'));
    embeddingMocks.calls = [];
  });

  afterEach(async () => {
    await bank?.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
    embeddingMocks.available = false;
  });

  describe('embedder absent', () => {
    beforeEach(async () => {
      embeddingMocks.available = false;
      bank = createBank();
      await bank.initialize();
    });

    it('initializes and reports lexical-only search with the reason', async () => {
      expect(bank.getPatternSearchStatus()).toEqual({ mode: 'lexical-only', reason: UNAVAILABLE });
      expect((await bank.getQEStats()).patternSearch.mode).toBe('lexical-only');
    });

    it('stores patterns text-only, with no vector', async () => {
      const before = countEmbeddings();
      const result = await bank.storeQEPattern(PATTERN);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.embedding).toBeUndefined();
      expect(countEmbeddings()).toBe(before);
      expect(store().getPattern(result.value.id)?.name).toBe(PATTERN.name);
    });

    it('finds stored patterns by text matching, labelled lexical with no similarity score', async () => {
      await bank.storeQEPattern(PATTERN);
      embeddingMocks.calls = [];

      const result = await bank.searchQEPatterns('flaky network retry');

      expect(result.success).toBe(true);
      if (!result.success) return;
      const hit = result.value.find(r => r.pattern.name === PATTERN.name);
      expect(hit).toBeDefined();
      expect(hit!.matchType).toBe('lexical');
      expect(hit!.similarity).toBe(0);
      expect(hit!.canReuse).toBe(false);
      expect(result.value.every(r => r.matchType === 'lexical')).toBe(true);
      expect(embeddingMocks.calls).toEqual([]);
    });

    it('returns no matches when a vector similarity threshold is requested', async () => {
      await bank.storeQEPattern(PATTERN);

      const result = await bank.searchQEPatterns('flaky network retry', { minSimilarity: 0.5 });

      expect(result.success).toBe(true);
      if (result.success) expect(result.value).toEqual([]);
    });

    it('still routes tasks', async () => {
      const result = await bank.routeTask({ task: 'generate unit tests for src/a.ts' });

      expect(result.success).toBe(true);
      if (result.success) expect(result.value.recommendedAgent).toBeTruthy();
    });
  });

  describe('embedder present (unchanged behaviour)', () => {
    beforeEach(async () => {
      embeddingMocks.available = true;
      bank = createBank();
      await bank.initialize();
    });

    it('reports vector search', () => {
      expect(bank.getPatternSearchStatus()).toEqual({ mode: 'vector' });
    });

    it('stores the pattern with its vector and finds it by vector similarity', async () => {
      const before = countEmbeddings();
      const stored = await bank.storeQEPattern(PATTERN);

      expect(stored.success).toBe(true);
      if (!stored.success) return;
      expect(stored.value.embedding).toHaveLength(DIM);
      expect(countEmbeddings()).toBe(before + 1);

      const result = await bank.searchQEPatterns('Retry flaky network calls');
      expect(result.success).toBe(true);
      if (!result.success) return;
      const hit = result.value.find(r => r.pattern.id === stored.value.id);
      expect(hit?.matchType).toBe('vector');
      expect(hit!.similarity).toBeGreaterThan(0.5);
    });
  });
});
