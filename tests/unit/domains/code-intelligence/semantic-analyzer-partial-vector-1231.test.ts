/**
 * #1231: when the embedding model was down for part of an index run, the files
 * indexed then have no vector. A semantic search still finds them by text,
 * labels those hits 'lexical', and reports the result as 'partial-vector' with
 * how many indexed files have a vector. It never reports such a result as 'vector'.
 */

import { describe, it, expect, vi } from 'vitest';
import { SemanticAnalyzerService } from '../../../../src/domains/code-intelligence/services/semantic-analyzer';
import type { MemoryBackend, VectorSearchResult } from '../../../../src/kernel/interfaces';
import { EMBEDDING_CONFIG, type IEmbeddingProvider } from '../../../../src/shared/embeddings';

const AUTH = `// Authentication helpers
export function loginWithPassword(username, password) {
  return { token: 'token-' + username, user: username };
}
`;
const ORDER = (i: number) => `// Order step ${i}\nexport function stepHandler${i}(order) { return order.id; }\n`;

/** In-memory backend: key/value search by glob, every stored vector scores 0.9. */
function createMemory(): MemoryBackend {
  const storage = new Map<string, unknown>();
  const vectors = new Map<string, { metadata: unknown }>();
  return {
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
  } as unknown as MemoryBackend;
}

/** An embedding model that can be taken down and brought back. */
function createSwitchableProvider(): IEmbeddingProvider & { up: boolean } {
  return {
    up: true,
    async embed(text: string): Promise<number[]> {
      if (!this.up) throw new Error('Ollama API error (503): embedding model down');
      const v = new Array(EMBEDDING_CONFIG.DIMENSIONS).fill(0);
      for (let i = 0; i < text.length && i < v.length; i++) v[i] = text.charCodeAt(i) / 1000;
      return v;
    },
    async healthCheck(): Promise<boolean> { return true; },
    getDimensions(): number { return EMBEDDING_CONFIG.DIMENSIONS; },
  };
}

describe('indexCode reports whether the file got a vector (#1231)', () => {
  it('says the vector is stored while the model works, and why not when it fails', async () => {
    const provider = createSwitchableProvider();
    const service = new SemanticAnalyzerService(createMemory(), { useNomicEmbeddings: false, embeddingProvider: provider });

    const withVector = await service.indexCode('src/a.js', ORDER(1));
    provider.up = false;
    const withoutVector = await service.indexCode('src/b.js', ORDER(2));

    expect(withVector.success && withVector.value).toEqual({ vector: true });
    expect(withoutVector.success && withoutVector.value).toEqual({
      vector: false,
      vectorFailure: 'the embedding model failed: Ollama API error (503): embedding model down',
    });
  });

  it('does not ask the model when told not to embed', async () => {
    const provider = createSwitchableProvider();
    const embed = vi.spyOn(provider, 'embed');
    const memory = createMemory();
    const service = new SemanticAnalyzerService(memory, { useNomicEmbeddings: false, embeddingProvider: provider });

    const result = await service.indexCode('src/a.js', ORDER(1), { embed: false });

    expect(result.success && result.value).toEqual({ vector: false });
    expect(embed).not.toHaveBeenCalled();
    expect(memory.storeVector).not.toHaveBeenCalled();
  });
});

describe('semantic search over a partly vectored index (#1231)', () => {
  async function partlyVectoredService() {
    const provider = createSwitchableProvider();
    const service = new SemanticAnalyzerService(createMemory(), { useNomicEmbeddings: false, embeddingProvider: provider });
    await service.indexCode('src/mod1.js', ORDER(1));
    await service.indexCode('src/mod2.js', ORDER(2));
    provider.up = false; // model down for the rest of the run
    await service.indexCode('src/mod3.js', ORDER(3));
    await service.indexCode('src/zz-auth.js', AUTH);
    provider.up = true; // back up when the search runs
    return service;
  }

  it('finds a file that has no vector by text, labelled lexical', async () => {
    const service = await partlyVectoredService();

    const result = await service.search({ query: 'loginWithPassword', type: 'semantic' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const auth = result.value.results.find((r) => r.file === 'src/zz-auth.js');
    expect(auth).toMatchObject({ matchType: 'lexical', highlights: ['loginwithpassword'] });
    expect(auth?.snippet).toContain('export function loginWithPassword');
    expect(result.value.total).toBe(result.value.results.length);
  });

  it('reports partial-vector with the counts and reason, not vector', async () => {
    const service = await partlyVectoredService();

    const result = await service.search({ query: 'loginWithPassword', type: 'semantic' });

    expect(result.success && result.value).toMatchObject({
      mode: 'partial-vector',
      coverage: { indexedFiles: 4, filesWithVector: 2 },
      reason:
        '2 of 4 indexed files have no embedding from injected-provider (it was unavailable when they were indexed, ' +
        'or an older aqe version indexed them), so they were matched by text only (matchType "lexical"); ' +
        're-index to rank them by vector',
    });
  });

  it('keeps vector hits labelled vector, lists each file once, and merges by score', async () => {
    const service = await partlyVectoredService();

    const result = await service.search({ query: 'stepHandler order', type: 'semantic' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    // The lexical hit matched every query word (score 1); the vector hits scored 0.9.
    expect(result.value.results.map((r) => [r.file, r.matchType, r.score])).toEqual([
      ['src/mod3.js', 'lexical', 1],
      ['src/mod1.js', 'vector', 0.9],
      ['src/mod2.js', 'vector', 0.9],
    ]);
  });

  it('keeps the requested limit across vector and lexical hits', async () => {
    const service = await partlyVectoredService();

    const result = await service.search({ query: 'stepHandler order', type: 'semantic', limit: 2 });

    expect(result.success && result.value.results.map((r) => r.file)).toEqual(['src/mod3.js', 'src/mod1.js']);
  });

  it('treats content indexed by an older version (no model recorded) as vector-less, listing it once', async () => {
    const memory = createMemory();
    const service = new SemanticAnalyzerService(memory, { useNomicEmbeddings: false, embeddingProvider: createSwitchableProvider() });
    await service.indexCode('src/zz-auth.js', AUTH);
    // Content stored by an older version: same vector, no model recorded.
    const [key] = await memory.search('code-intelligence:semantic:content:*');
    const { embeddingModel: _dropped, ...legacy } = (await memory.get<Record<string, unknown>>(key))!;
    await memory.set(key, legacy);

    const result = await service.search({ query: 'loginWithPassword', type: 'semantic' });

    expect(result.success && result.value).toMatchObject({
      mode: 'partial-vector',
      coverage: { indexedFiles: 1, filesWithVector: 0 },
      results: [{ file: 'src/zz-auth.js', matchType: 'vector' }],
      total: 1,
    });
  });

  it('reports vector with full coverage once every file has a vector', async () => {
    const service = new SemanticAnalyzerService(createMemory(), {
      useNomicEmbeddings: false,
      embeddingProvider: createSwitchableProvider(),
    });
    await service.indexCode('src/mod1.js', ORDER(1));
    await service.indexCode('src/zz-auth.js', AUTH);

    const result = await service.search({ query: 'loginWithPassword', type: 'semantic' });

    expect(result.success && result.value).toMatchObject({
      mode: 'vector',
      coverage: { indexedFiles: 2, filesWithVector: 2 },
    });
    expect(result.success && result.value.reason).toBeUndefined();
  });
});
