/**
 * Issue #1187: an embedder that passes the startup check can still fail later
 * (an embedding endpoint goes down). Before the fix, pattern search threw, so
 * its lexical results were lost as well; storeQEPattern failed; and the status
 * still reported vector search.
 *
 * A runtime failure must degrade to lexical-only: search returns text matches
 * labelled lexical, a stored pattern keeps its text-only record, and the status
 * says lexical-only with the reason. The embedder is tried again after a
 * bounded interval, so a short outage (at startup or later) does not last
 * until the process restarts.
 *
 * #1204: that retry runs in the background. The call that triggers it stays
 * lexical-only and never waits for the embedder, and the bank reports vector
 * search only after the retry has succeeded.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DIM = 384;
const SPACE_ID = 'test-space-1187';
const RETRY_MS = 30_000;
const DOWN = '[EmbedderEndpointClient] connect ECONNREFUSED 127.0.0.1:8099';

const embeddingMocks = vi.hoisted(() => ({
  available: true,
  failingText: null as string | null,
  /** When set, embedding calls wait on this (an embedder host that never answers). */
  hang: null as Promise<never> | null,
  calls: [] as string[],
}));

// Deterministic test vector: one bucket per word, so texts that share words are close.
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

vi.mock('../../../src/learning/real-embeddings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/learning/real-embeddings.js')>();
  return {
    ...actual,
    computeRealEmbedding: vi.fn(async (text: string) => {
      embeddingMocks.calls.push(text);
      if (embeddingMocks.hang) await embeddingMocks.hang;
      if (!embeddingMocks.available || text === embeddingMocks.failingText) throw new Error(DOWN);
      return testVector(text);
    }),
    recheckEmbedder: vi.fn(async () => undefined),
    getActiveEmbeddingSpaceIdentity: () => ({ spaceId: SPACE_ID }) as never,
  };
});

import { RealQEReasoningBank } from '../../../src/learning/real-qe-reasoning-bank.js';
import { EMBEDDING_SPACE_CANARY } from '../../../src/learning/embedding-space.js';

const RETRY_PATTERN = {
  patternType: 'test-template' as const,
  name: 'Retry flaky network calls',
  description: 'Wrap flaky network calls in bounded retry with jitter',
  template: { type: 'prompt' as const, content: 'retry', variables: [] },
  context: { tags: ['flaky', 'network'] },
};

const MOCK_PATTERN = {
  patternType: 'test-template' as const,
  name: 'Mock clock in timer tests',
  description: 'Use fake timers for timeout based assertions',
  template: { type: 'prompt' as const, content: 'timers', variables: [] },
  context: { tags: ['timers'] },
};

describe('RealQEReasoningBank when the embedder fails at runtime (#1187)', () => {
  let dir: string;
  let bank: RealQEReasoningBank;

  const createBank = () => new RealQEReasoningBank({
    sqlite: { dbPath: path.join(dir, 'patterns.db'), useUnified: false },
    embedderRetryIntervalMs: RETRY_MS,
  });
  const store = () => (bank as unknown as {
    sqliteStore: { getAllEmbeddings(): unknown[]; getPattern(id: string): { name: string } | null };
  }).sqliteStore;
  const countEmbeddings = (): number => store().getAllEmbeddings().length;
  const later = (ms: number) => vi.setSystemTime(Date.now() + ms);
  const retrySettled = () => (bank as unknown as {
    embedderRecovery: { whenRetrySettled(): Promise<void> };
  }).embedderRecovery.whenRetrySettled();

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1187-'));
    vi.useFakeTimers({ toFake: ['Date'] });
    embeddingMocks.available = true;
    embeddingMocks.failingText = null;
    embeddingMocks.hang = null;
    embeddingMocks.calls = [];
  });

  afterEach(async () => {
    await retrySettled();
    await bank?.dispose();
    vi.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('embedder passes the startup check, then fails', () => {
    beforeEach(async () => {
      bank = createBank();
      await bank.initialize();
      expect(bank.getPatternSearchStatus()).toEqual({ mode: 'vector' });
      await bank.storeQEPattern(RETRY_PATTERN);
      embeddingMocks.available = false;
    });

    it('returns the lexical matches, labelled lexical, instead of failing', async () => {
      const result = await bank.searchQEPatterns('flaky network retry');

      expect(result.success).toBe(true);
      if (!result.success) return;
      const hit = result.value.find(r => r.pattern.name === RETRY_PATTERN.name);
      expect(hit).toBeDefined();
      expect(hit!.matchType).toBe('lexical');
      expect(hit!.similarity).toBe(0);
      expect(hit!.canReuse).toBe(false);
      expect(result.value.every(r => r.matchType === 'lexical')).toBe(true);
    });

    it('reports lexical-only with the reason in the status and the stats', async () => {
      await bank.searchQEPatterns('flaky network retry');

      expect(bank.getPatternSearchStatus()).toEqual({
        mode: 'lexical-only',
        reason: `Embedder failed at runtime: ${DOWN}`,
      });
      expect((await bank.getQEStats()).patternSearch.mode).toBe('lexical-only');
    });

    it('stores a new pattern text-only, with no vector', async () => {
      const before = countEmbeddings();

      const result = await bank.storeQEPattern(MOCK_PATTERN);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.embedding).toBeUndefined();
      expect(countEmbeddings()).toBe(before);
      expect(store().getPattern(result.value.id)?.name).toBe(MOCK_PATTERN.name);
      expect(bank.getPatternSearchStatus().mode).toBe('lexical-only');
    });

    it('does not call the failed embedder again before the retry interval', async () => {
      await bank.searchQEPatterns('flaky network retry');
      embeddingMocks.calls = [];
      embeddingMocks.available = true;
      later(RETRY_MS - 1_000);

      await bank.searchQEPatterns('flaky network retry');
      await bank.storeQEPattern(MOCK_PATTERN);

      expect(embeddingMocks.calls).toEqual([]);
      expect(bank.getPatternSearchStatus().mode).toBe('lexical-only');
    });

    it('stays lexical-only when the retry also fails', async () => {
      await bank.searchQEPatterns('flaky network retry');
      later(RETRY_MS);

      const result = await bank.searchQEPatterns('flaky network retry');
      await retrySettled();

      expect(result.success).toBe(true);
      expect(bank.getPatternSearchStatus().mode).toBe('lexical-only');
    });

    it('returns to vector search once the embedder is back after the interval', async () => {
      await bank.searchQEPatterns('flaky network retry');
      embeddingMocks.available = true;
      later(RETRY_MS);
      await bank.searchQEPatterns('flaky network retry'); // starts the background retry
      await retrySettled();

      const result = await bank.searchQEPatterns('Retry flaky network calls');

      expect(bank.getPatternSearchStatus()).toEqual({ mode: 'vector' });
      expect(result.success).toBe(true);
      if (!result.success) return;
      const hit = result.value.find(r => r.pattern.name === RETRY_PATTERN.name);
      expect(hit?.matchType).toBe('vector');
      expect(hit!.similarity).toBeGreaterThan(0.5);
    });

    it('keeps a pattern stored during the outage text-only (findable by text) after recovery', async () => {
      const before = countEmbeddings();
      const stored = await bank.storeQEPattern(MOCK_PATTERN);
      embeddingMocks.available = true;
      later(RETRY_MS);
      await bank.searchQEPatterns('fake timers'); // starts the background retry
      await retrySettled();

      const result = await bank.searchQEPatterns('fake timers timeout assertions');

      expect(bank.getPatternSearchStatus()).toEqual({ mode: 'vector' });
      expect(stored.success && result.success).toBe(true);
      if (!stored.success || !result.success) return;
      expect(countEmbeddings()).toBe(before);
      const hit = result.value.find(r => r.pattern.id === stored.value.id);
      expect(hit?.matchType).toBe('lexical');
    });
  });

  describe('overlapping searches', () => {
    it('reports lexical-only after any of them hit an embedder failure, never vector', async () => {
      bank = createBank();
      await bank.initialize();
      await bank.storeQEPattern(RETRY_PATTERN);
      embeddingMocks.failingText = 'flaky network retry';

      const [vectorCall, failedCall] = await Promise.all([
        bank.searchQEPatterns('Retry flaky network calls'),
        bank.searchQEPatterns('flaky network retry'),
      ]);

      expect(vectorCall.success && failedCall.success).toBe(true);
      if (!failedCall.success) return;
      expect(failedCall.value.every(r => r.matchType === 'lexical')).toBe(true);
      expect(bank.getPatternSearchStatus().mode).toBe('lexical-only');
    });
  });

  describe('embedder unavailable at startup, back later', () => {
    beforeEach(async () => {
      embeddingMocks.available = false;
      bank = createBank();
      await bank.initialize();
    });

    it('leaves lexical-only mode once a retry after the interval succeeds', async () => {
      expect(bank.getPatternSearchStatus()).toEqual({ mode: 'lexical-only', reason: DOWN });
      embeddingMocks.available = true;
      later(RETRY_MS);
      await bank.searchQEPatterns('flaky'); // starts the background retry
      await retrySettled();

      const stored = await bank.storeQEPattern(RETRY_PATTERN);
      const result = await bank.searchQEPatterns('Retry flaky network calls');

      expect(bank.getPatternSearchStatus()).toEqual({ mode: 'vector' });
      expect(stored.success).toBe(true);
      if (!stored.success || !result.success) return;
      expect(stored.value.embedding).toHaveLength(DIM);
      const hit = result.value.find(r => r.pattern.id === stored.value.id);
      expect(hit?.matchType).toBe('vector');
    });
  });

  describe('the call that triggers a retry (#1204)', () => {
    beforeEach(async () => {
      bank = createBank();
      await bank.initialize();
      await bank.storeQEPattern(RETRY_PATTERN);
      embeddingMocks.available = false;
      await bank.searchQEPatterns('flaky network retry');
      later(RETRY_MS);
    });

    it('stays lexical-only and does not wait for an embedder host that never answers', async () => {
      let release!: () => void;
      embeddingMocks.hang = new Promise<never>((_, reject) => { release = () => reject(new Error(DOWN)); });

      const result = await bank.searchQEPatterns('flaky network retry');

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.every(r => r.matchType === 'lexical')).toBe(true);
      expect(bank.getPatternSearchStatus().mode).toBe('lexical-only');
      // The retry is still waiting on the host; finish it so the test can clean up.
      release();
      await retrySettled();
      expect(bank.getPatternSearchStatus().mode).toBe('lexical-only');
    });

    it('reports lexical-only while the retry runs, and vector only after it succeeded', async () => {
      let release!: () => void;
      embeddingMocks.available = true;
      embeddingMocks.hang = new Promise<never>((resolve) => { release = () => resolve(undefined as never); });

      const triggering = await bank.searchQEPatterns('Retry flaky network calls');

      expect(triggering.success && triggering.value.every(r => r.matchType === 'lexical')).toBe(true);
      expect(bank.getPatternSearchStatus().mode).toBe('lexical-only');
      embeddingMocks.hang = null;
      release();
      await retrySettled();
      expect(bank.getPatternSearchStatus()).toEqual({ mode: 'vector' });
    });

    it('starts one retry for overlapping calls', async () => {
      embeddingMocks.available = true;
      embeddingMocks.calls = [];

      await Promise.all([
        bank.searchQEPatterns('flaky network retry'),
        bank.searchQEPatterns('network retry'),
        bank.storeQEPattern(MOCK_PATTERN),
      ]);
      await retrySettled();

      expect(embeddingMocks.calls.filter(t => t === EMBEDDING_SPACE_CANARY)).toHaveLength(1);
    });
  });
});
