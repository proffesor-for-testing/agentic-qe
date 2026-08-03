import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@huggingface/transformers', () => {
  throw new Error('optional dependency unavailable');
});

describe('real embeddings configuration guidance', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.AQE_EMBEDDER_ENDPOINT;
  });

  it('should name the environment variable read by the endpoint configuration', async () => {
    const { computeRealEmbedding, resetInitialization } = await import(
      '../../../src/learning/real-embeddings.js'
    );
    resetInitialization();

    await expect(
      computeRealEmbedding('semantic test input', { enableCache: false })
    ).rejects.toThrow('AQE_EMBEDDER_ENDPOINT');
  });
});
