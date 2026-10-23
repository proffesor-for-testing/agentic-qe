/**
 * #1224: code search reports "no results" only after searching an index that
 * holds code, and a semantic search without an embedding model says it matched
 * text instead of returning made-up similarity.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  SemanticAnalyzerService,
  NOTHING_INDEXED_FOR_SEARCH,
} from '../../../../src/domains/code-intelligence/services/semantic-analyzer';
import type { MemoryBackend, VectorSearchResult } from '../../../../src/kernel/interfaces';
import { EMBEDDING_CONFIG, type IEmbeddingProvider } from '../../../../src/shared/embeddings';

const AUTH = `// Authentication helpers
export function login(username, password) {
  return { token: 'token-' + username, user: username };
}
`;
const CART = `export function total(items) { return items.reduce((s, i) => s + i.price, 0); }
`;

/** In-memory backend: key/value search by glob, vectors returned in insertion order. */
function createMemory(): MemoryBackend & { vectors: Map<string, { metadata: unknown }> } {
  const storage = new Map<string, unknown>();
  const vectors = new Map<string, { metadata: unknown }>();
  return {
    vectors,
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    set: vi.fn(async (key: string, value: unknown) => { storage.set(key, value); }),
    get: vi.fn(async (key: string) => storage.get(key)),
    delete: vi.fn(async (key: string) => storage.delete(key)),
    has: vi.fn(async (key: string) => storage.has(key)),
    search: vi.fn(async (pattern: string, limit?: number) => {
      const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
      const keys = [...storage.keys()].filter((k) => regex.test(k));
      return limit === undefined ? keys : keys.slice(0, limit);
    }),
    vectorSearch: vi.fn(async (_embedding: number[], k: number, keyPrefix?: string): Promise<VectorSearchResult[]> =>
      [...vectors.entries()]
        .filter(([key]) => !keyPrefix || key.startsWith(keyPrefix))
        .slice(0, k)
        .map(([key, v]) => ({ key, score: 0.9, metadata: v.metadata }))),
    storeVector: vi.fn(async (key: string, _embedding: number[], metadata?: unknown) => {
      vectors.set(key, { metadata });
    }),
  } as unknown as MemoryBackend & { vectors: Map<string, { metadata: unknown }> };
}

function createProvider(): IEmbeddingProvider {
  return {
    async embed(text: string): Promise<number[]> {
      const v = new Array(EMBEDDING_CONFIG.DIMENSIONS).fill(0);
      for (let i = 0; i < text.length && i < v.length; i++) v[i] = text.charCodeAt(i) / 1000;
      return v;
    },
    async healthCheck(): Promise<boolean> { return true; },
    getDimensions(): number { return EMBEDDING_CONFIG.DIMENSIONS; },
  };
}

/** No embedding model: Nomic disabled and no provider injected. */
const withoutEmbedder = (memory: MemoryBackend) =>
  new SemanticAnalyzerService(memory, { useNomicEmbeddings: false });

describe('code search over an empty index (#1224)', () => {
  it.each(['exact', 'fuzzy', 'semantic'] as const)('fails a %s search, saying nothing is indexed', async (type) => {
    const service = new SemanticAnalyzerService(createMemory(), {
      useNomicEmbeddings: false,
      embeddingProvider: createProvider(),
    });

    const result = await service.search({ query: 'login', type });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toBe(NOTHING_INDEXED_FOR_SEARCH);
  });

  it('still reports an unknown search type as such', async () => {
    const result = await withoutEmbedder(createMemory()).search({ query: 'x', type: 'regex' as never });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toBe('Unknown search type: regex');
  });

  it('reports a real "no results" once code is indexed', async () => {
    const service = withoutEmbedder(createMemory());
    await service.indexCode('src/auth.js', AUTH);

    const result = await service.search({ query: 'notInTheCode', type: 'exact' });

    expect(result.success && result.value).toMatchObject({ results: [], total: 0 });
  });
});

describe('semantic search without an embedding model (#1224)', () => {
  it('indexes the text without storing a made-up vector', async () => {
    const memory = createMemory();
    const result = await withoutEmbedder(memory).indexCode('src/auth.js', AUTH);

    expect(result.success).toBe(true);
    expect(memory.storeVector).not.toHaveBeenCalled();
  });

  it('matches query words, labels the answer lexical-only, and names real files', async () => {
    const service = withoutEmbedder(createMemory());
    await service.indexCode('src/auth.js', AUTH);
    await service.indexCode('src/cart.js', CART);

    const result = await service.search({ query: 'login', type: 'semantic' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.mode).toBe('lexical-only');
    expect(result.value.reason).toBe('embeddings are disabled for code search');
    expect(result.value.results.map((r) => r.file)).toEqual(['src/auth.js']);
    expect(result.value.results[0]).toMatchObject({ matchType: 'lexical', highlights: ['login'] });
    expect(result.value.results[0].snippet).toContain('export function login');
    expect(result.value.total).toBe(result.value.results.length);
  });

  it('throws from getEmbedding instead of returning a pseudo-embedding', async () => {
    await expect(withoutEmbedder(createMemory()).getEmbedding('code')).rejects.toThrow(
      'Code embeddings unavailable: embeddings are disabled for code search',
    );
  });

  it('falls back to text matching, with the reason, when the model fails at runtime', async () => {
    const failing: IEmbeddingProvider = { ...createProvider(), embed: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')) };
    const service = new SemanticAnalyzerService(createMemory(), { useNomicEmbeddings: false, embeddingProvider: failing });
    await service.indexCode('src/auth.js', AUTH);

    const result = await service.search({ query: 'login', type: 'semantic' });

    expect(result.success && result.value).toMatchObject({
      mode: 'lexical-only',
      reason: 'the embedding model failed: connect ECONNREFUSED',
      total: 1,
      results: [{ file: 'src/auth.js', matchType: 'lexical' }],
    });
  });
});

describe('semantic search with an embedding model (#1224)', () => {
  it('returns vector hits for real files and reports vector mode', async () => {
    const service = new SemanticAnalyzerService(createMemory(), {
      useNomicEmbeddings: false,
      embeddingProvider: createProvider(),
    });
    await service.indexCode('src/auth.js', AUTH);

    const result = await service.search({ query: 'auth code', type: 'semantic' });

    expect(result.success && result.value).toMatchObject({
      mode: 'vector',
      total: 1,
      results: [{ file: 'src/auth.js', matchType: 'vector' }],
    });
    expect(result.success && result.value.results[0].snippet).toContain('Authentication helpers');
  });

  it('ignores vectors not made by the current model and says why it matched text', async () => {
    const memory = createMemory();
    const service = new SemanticAnalyzerService(memory, { useNomicEmbeddings: false, embeddingProvider: createProvider() });
    await service.indexCode('src/auth.js', AUTH);
    // A vector stored by an older version (pseudo-embedding, no model recorded).
    memory.vectors.clear();
    memory.vectors.set('code-intelligence:semantic:code:old', { metadata: { file: 'src/auth.js' } });

    const result = await service.search({ query: 'login', type: 'semantic' });

    expect(result.success && result.value).toMatchObject({
      mode: 'lexical-only',
      reason: 'no indexed file has an embedding from injected-provider; re-index to enable vector search',
      results: [{ file: 'src/auth.js', matchType: 'lexical' }],
    });
  });
});

describe('exact and fuzzy search read every indexed file (#1224)', () => {
  it('finds an exact match in a file past the old limit*3 scan window', async () => {
    const service = withoutEmbedder(createMemory());
    for (let i = 0; i < 5; i++) await service.indexCode(`src/f${i}.js`, `export const v${i} = ${i};\n`);
    await service.indexCode('src/auth.js', AUTH);

    const result = await service.search({ query: 'function login', type: 'exact', limit: 1 });

    expect(result.success && result.value.results.map((r) => r.file)).toEqual(['src/auth.js']);
  });

  it('does not match a query word on a one-letter identifier', async () => {
    const service = withoutEmbedder(createMemory());
    await service.indexCode('src/cart.js', CART);
    await service.indexCode('src/auth.js', AUTH);

    const result = await service.search({ query: 'login', type: 'fuzzy' });

    expect(result.success && result.value.results.map((r) => r.file)).toEqual(['src/auth.js']);
  });
});
