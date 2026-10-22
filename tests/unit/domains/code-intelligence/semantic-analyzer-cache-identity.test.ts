/**
 * SemanticAnalyzerService: the analysis/embedding caches must identify code
 * by its content.
 *
 * Both caches were keyed by a 31-multiplier 32-bit string hash. That hash is
 * trivially ambiguous: for any shared prefix and suffix, the two-character
 * runs "Aa" and "BB" produce the same value, so two different functions share
 * one cache entry. The second caller then receives the embedding computed for
 * the first one, which is what semantic search ranks on.
 */

import { describe, it, expect, vi } from 'vitest';
import { SemanticAnalyzerService } from '../../../../src/domains/code-intelligence/services/semantic-analyzer';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';
import { EMBEDDING_CONFIG, type IEmbeddingProvider } from '../../../../src/shared/embeddings';

// Different code, identical under the old 32-bit hash.
const CODE_A = 'export function Aa(x: number) { if (x > 0) { return x; } return 0; }';
const CODE_B = 'export function BB(x: number) { if (x > 0) { return x; } return 0; }';

/** Deterministic, content-dependent embedding — distinct text, distinct vector. */
function createMockEmbeddingProvider(): IEmbeddingProvider {
  return {
    async embed(text: string): Promise<number[]> {
      const embedding = new Array(EMBEDDING_CONFIG.DIMENSIONS).fill(0);
      for (let i = 0; i < text.length && i < embedding.length; i++) {
        embedding[i] = text.charCodeAt(i) / 1000;
      }
      const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0)) || 1;
      return embedding.map((v) => v / magnitude);
    },
    async healthCheck(): Promise<boolean> {
      return true;
    },
    getDimensions(): number {
      return EMBEDDING_CONFIG.DIMENSIONS;
    },
  };
}

function createService() {
  const memory = {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(true),
  } as unknown as MemoryBackend;

  return new SemanticAnalyzerService(memory, {
    embeddingProvider: createMockEmbeddingProvider(),
    useNomicEmbeddings: false,
    enableCaching: true,
  });
}

describe('SemanticAnalyzerService cache identity', () => {
  it('sanity: the two snippets are different code with different embeddings', async () => {
    expect(CODE_A).not.toBe(CODE_B);

    const uncached = createService();
    // Reading B first proves B's own vector, independent of any A entry.
    const direct = await uncached.getEmbedding(CODE_B);
    const other = await createService().getEmbedding(CODE_A);
    expect(direct).not.toEqual(other);
  });

  it('does not return a cached embedding computed for different code', async () => {
    const service = createService();

    const embeddingA = await service.getEmbedding(CODE_A);
    const embeddingB = await service.getEmbedding(CODE_B);

    // B must get its own vector, not A's.
    expect(embeddingB).not.toEqual(embeddingA);

    const expectedB = await createService().getEmbedding(CODE_B);
    expect(embeddingB).toEqual(expectedB);
  });

  it('still serves a repeated request for the same code from cache', async () => {
    const service = createService();
    const first = await service.getEmbedding(CODE_A);
    const second = await service.getEmbedding(CODE_A);
    expect(second).toEqual(first);
  });
});
