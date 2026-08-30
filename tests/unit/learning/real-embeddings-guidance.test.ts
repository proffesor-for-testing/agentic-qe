import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@huggingface/transformers', () => {
  throw new Error('optional dependency unavailable');
});

describe('real embeddings configuration guidance', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.AQE_EMBEDDER_ENDPOINT;
  });

  it('should recommend the endpoint and disclose local provider advisories', async () => {
    const { computeRealEmbedding, resetInitialization } = await import(
      '../../../src/learning/real-embeddings.js'
    );
    resetInitialization();

    const result = computeRealEmbedding('semantic test input', { enableCache: false });
    await expect(result).rejects.toThrow('AQE_EMBEDDER_ENDPOINT');
    await expect(result).rejects.toThrow('unresolved HIGH advisories');
    await expect(result).rejects.toThrow('GHSA-xcpc-8h2w-3j85');
    await expect(result).rejects.toThrow('GHSA-f88m-g3jw-g9cj');
  });
});
