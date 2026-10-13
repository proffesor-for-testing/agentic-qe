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
import { afterEach, describe, expect, it, vi } from 'vitest';

const embeddingMocks = vi.hoisted(() => ({
  identity: null as null | { spaceId: string },
}));

vi.mock('../../../src/learning/real-embeddings.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/learning/real-embeddings.js')>();
  return { ...actual, getActiveEmbeddingSpaceIdentity: () => embeddingMocks.identity };
});

vi.mock('../../../src/audit/witness-chain.js', () => ({
  getWitnessChain: vi.fn(async () => ({ append: vi.fn() })),
}));

import { QEReasoningBank } from '../../../src/learning/qe-reasoning-bank.js';
import type { QEPattern } from '../../../src/learning/qe-patterns.js';
import { resetRuVectorFeatureFlags, setRuVectorFeatureFlags } from '../../../src/integrations/ruvector/feature-flags.js';

function bankWithStore() {
  const create = vi.fn(async (options: { name: string; embedding?: number[] }) => ({
    success: true as const,
    value: { id: 'p-1', name: options.name, embedding: options.embedding } as unknown as QEPattern,
  }));
  const bank = new QEReasoningBank({} as never);
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
