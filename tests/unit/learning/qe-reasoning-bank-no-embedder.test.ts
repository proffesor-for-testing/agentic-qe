/**
 * Issue #981: in a fresh project with no embedding runtime, `aqe hooks learn`
 * (and every other storePattern caller, including MCP task-outcome learning
 * and `aqe learning import`) failed with
 *   VECTOR_SPACE_UNVERIFIED: refusing to persist or index an embedding without runtime provenance
 * because QEReasoningBank attached its hash-fallback vector — which has no
 * embedding-space provenance — and the pattern store rightly refuses it.
 *
 * Without an embedder the pattern must be stored text-only (the vector is
 * left for `aqe learning backfill-embeddings`), mirroring how search already
 * drops non-provenance vectors.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const embeddingMocks = vi.hoisted(() => ({
  identity: null as null | { spaceId: string },
  /** #1204: the retry probe's embedder; probes wait on `hang` when set. */
  probeUp: false,
  hang: null as Promise<void> | null,
  probes: [] as Array<{ text: string; enableCache?: boolean }>,
}));

vi.mock('../../../src/learning/real-embeddings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/learning/real-embeddings.js')>();
  return {
    ...actual,
    getActiveEmbeddingSpaceIdentity: () => embeddingMocks.identity,
    recheckEmbedder: vi.fn(async () => undefined),
    computeRealEmbedding: vi.fn(async (text: string, config?: { enableCache?: boolean }) => {
      embeddingMocks.probes.push({ text, enableCache: config?.enableCache });
      if (embeddingMocks.hang) await embeddingMocks.hang;
      if (!embeddingMocks.probeUp) throw new Error('[EmbedderEndpointClient] connect ECONNREFUSED 127.0.0.1:9');
      return new Array(384).fill(0.05);
    }),
  };
});

vi.mock('../../../src/audit/witness-chain.js', () => ({
  getWitnessChain: vi.fn(async () => ({ append: vi.fn() })),
}));

import { QEReasoningBank } from '../../../src/learning/qe-reasoning-bank.js';
import { recheckEmbedder } from '../../../src/learning/real-embeddings.js';
import { EMBEDDING_SPACE_CANARY } from '../../../src/learning/embedding-space.js';
import type { QEPattern } from '../../../src/learning/qe-patterns.js';
import { resetRuVectorFeatureFlags, setRuVectorFeatureFlags } from '../../../src/integrations/ruvector/feature-flags.js';

function bankWithStore(config: { embedderRetryIntervalMs?: number } = {}) {
  const create = vi.fn(async (options: { name: string; embedding?: number[] }) => ({
    success: true as const,
    value: { id: 'p-1', name: options.name, embedding: options.embedding } as unknown as QEPattern,
  }));
  const bank = new QEReasoningBank({} as never, undefined, config);
  Object.assign(bank as unknown as Record<string, unknown>, {
    initialized: true,
    patternStore: { create, get: vi.fn() },
  });
  return { bank, create };
}

const LEARN = {
  patternType: 'test-template' as const,
  name: 'retry-on-flaky-network',
  description: 'Wrap flaky network calls in bounded retry with jitter',
  template: { type: 'prompt' as const, content: 'retry', variables: [] },
};

describe('QEReasoningBank.storePattern without an embedding runtime (#981)', () => {
  afterEach(() => {
    embeddingMocks.identity = null;
    resetRuVectorFeatureFlags();
    vi.restoreAllMocks();
  });

  it('stores the pattern text-only when the auto-embedding has no runtime provenance', async () => {
    setRuVectorFeatureFlags({ useRVFPatternStore: false });
    const { bank, create } = bankWithStore();
    // Hash fallback: a vector with no recorded embedding-space provenance.
    vi.spyOn(bank, 'embed').mockResolvedValue([0.1, 0.2, 0.3]);

    const result = await bank.storePattern(LEARN);

    expect(result.success).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].embedding).toBeUndefined();
  });

  it('keeps the auto-embedding when the embedder recorded its provenance', async () => {
    setRuVectorFeatureFlags({ useRVFPatternStore: false });
    embeddingMocks.identity = { spaceId: 'space-a' };
    const { bank, create } = bankWithStore();
    const vector = [0.4, 0.5, 0.6];
    vi.spyOn(bank, 'embed').mockImplementation(async () => {
      (bank as unknown as { embeddingProvenance: WeakMap<number[], string> }).embeddingProvenance.set(vector, 'space-a');
      return vector;
    });

    await bank.storePattern(LEARN);

    expect(create.mock.calls[0][0].embedding).toBe(vector);
  });

  it('never strips a caller-supplied embedding (the store decides on provenance)', async () => {
    setRuVectorFeatureFlags({ useRVFPatternStore: false });
    const { bank, create } = bankWithStore();
    const embed = vi.spyOn(bank, 'embed');
    const supplied = [0.7, 0.8, 0.9];

    await bank.storePattern({ ...LEARN, embedding: supplied });

    expect(embed).not.toHaveBeenCalled();
    expect(create.mock.calls[0][0].embedding).toBe(supplied);
  });
});

describe('QEReasoningBank when the embedder endpoint fails at runtime (#1187)', () => {
  const ENDPOINT_DOWN = new Error('[EmbedderEndpointClient] connect ECONNREFUSED 127.0.0.1:9');

  afterEach(() => {
    embeddingMocks.identity = null;
    resetRuVectorFeatureFlags();
    vi.restoreAllMocks();
  });

  it('stores the pattern text-only instead of failing', async () => {
    setRuVectorFeatureFlags({ useRVFPatternStore: false });
    embeddingMocks.identity = { spaceId: 'space-a' };
    const { bank, create } = bankWithStore();
    vi.spyOn(bank, 'embed').mockRejectedValue(ENDPOINT_DOWN);

    const result = await bank.storePattern(LEARN);

    expect(result.success).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].embedding).toBeUndefined();
  });

  it('searches by text instead of failing', async () => {
    const { bank } = bankWithStore();
    const search = vi.fn(async () => ({ success: true as const, value: [] }));
    Object.assign(bank as unknown as Record<string, unknown>, {
      patternStore: { create: vi.fn(), get: vi.fn(), search },
    });
    vi.spyOn(bank, 'embed').mockRejectedValue(ENDPOINT_DOWN);

    const result = await bank.searchPatterns('flaky network retry');

    expect(result.success).toBe(true);
    expect(search).toHaveBeenCalledWith('flaky network retry', expect.objectContaining({
      useVectorSearch: false,
      textQuery: 'flaky network retry',
      embeddingSpaceId: undefined,
    }));
  });
});

describe('QEReasoningBank retries a failed embedder after a cooldown (#1204)', () => {
  const RETRY_MS = 20_000;
  const DOWN = new Error('Failed to initialize transformer model: connect ECONNREFUSED 127.0.0.1:9');
  const later = (ms: number) => vi.setSystemTime(Date.now() + ms);
  const retrySettled = (bank: QEReasoningBank) => (bank as unknown as {
    embedderRecovery: { whenRetrySettled(): Promise<void> };
  }).embedderRecovery.whenRetrySettled();

  /** A bank whose endpoint was down at startup: its first embed failed. */
  async function failedBank() {
    setRuVectorFeatureFlags({ useRVFPatternStore: false });
    embeddingMocks.identity = { spaceId: 'space-a' };
    const { bank, create } = bankWithStore({ embedderRetryIntervalMs: RETRY_MS });
    const vector = [0.4, 0.5, 0.6];
    const embed = vi.spyOn(bank, 'embed').mockImplementation(async () => {
      if (!embeddingMocks.probeUp) throw DOWN;
      (bank as unknown as { embeddingProvenance: WeakMap<number[], string> }).embeddingProvenance.set(vector, 'space-a');
      return vector;
    });
    await bank.storePattern(LEARN);
    embed.mockClear();
    create.mockClear();
    embeddingMocks.probes = [];
    return { bank, create, embed, vector };
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    embeddingMocks.identity = null;
    embeddingMocks.probeUp = false;
    embeddingMocks.hang = null;
    embeddingMocks.probes = [];
    resetRuVectorFeatureFlags();
    vi.restoreAllMocks();
  });

  it('reports the failure and does not call the embedder again before the interval', async () => {
    const { bank, create, embed } = await failedBank();
    later(RETRY_MS - 1);

    await bank.storePattern(LEARN);

    expect(bank.getEmbedderFailure()).toBe(DOWN.message);
    expect(embed).not.toHaveBeenCalled();
    expect(embeddingMocks.probes).toEqual([]);
    expect(create.mock.calls[0][0].embedding).toBeUndefined();
  });

  it('stores with vectors again once a retry after the interval finds the embedder back', async () => {
    const { bank, create, vector } = await failedBank();
    embeddingMocks.probeUp = true;
    later(RETRY_MS);

    await bank.storePattern(LEARN); // triggers the retry; stays text-only
    await retrySettled(bank);
    await bank.storePattern(LEARN);

    expect(create.mock.calls[0][0].embedding).toBeUndefined();
    expect(create.mock.calls[1][0].embedding).toBe(vector);
    expect(bank.getEmbedderFailure()).toBeNull();
    expect(recheckEmbedder).toHaveBeenCalled();
    expect(embeddingMocks.probes).toEqual([{ text: EMBEDDING_SPACE_CANARY, enableCache: false }]);
  });

  it('stays text-only when the retry fails', async () => {
    const { bank, create } = await failedBank();
    later(RETRY_MS);

    await bank.storePattern(LEARN);
    await retrySettled(bank);
    await bank.storePattern(LEARN);

    expect(create.mock.calls.every(call => call[0].embedding === undefined)).toBe(true);
    expect(bank.getEmbedderFailure()).toBe(DOWN.message);
  });

  it('never makes the triggering call wait for an embedder host that does not answer', async () => {
    const { bank, create } = await failedBank();
    let release!: () => void;
    embeddingMocks.hang = new Promise<void>((resolve) => { release = resolve; });
    later(RETRY_MS);

    const result = await bank.storePattern(LEARN);

    expect(result.success).toBe(true);
    expect(create.mock.calls[0][0].embedding).toBeUndefined();
    expect(embeddingMocks.probes).toHaveLength(1);
    release();
    await retrySettled(bank);
  });
});
