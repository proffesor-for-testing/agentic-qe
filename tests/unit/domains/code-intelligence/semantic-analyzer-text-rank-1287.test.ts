/**
 * #1287: text matches with the same score (every query word present) are
 * ranked by relevance, so the file defining `processOrder` comes first for
 * "process order" among 40 files that only mention "order processing". Covers
 * lexical-only semantic search, fuzzy search, and the text hits of a
 * partial-vector search. The score itself stays the share of query words found.
 */

import { describe, it, expect, vi } from 'vitest';
import { SemanticAnalyzerService } from '../../../../src/domains/code-intelligence/services/semantic-analyzer';
import type { MemoryBackend, VectorSearchResult } from '../../../../src/kernel/interfaces';
import { EMBEDDING_CONFIG, type IEmbeddingProvider } from '../../../../src/shared/embeddings';

const MODULE = (i: number) => `// Module ${i}: order processing step ${i}
export function stepHandler${i}(order) {
  const total = order.items.reduce((s, it) => s + it.price * it.qty, 0);
  return { id: order.id, step: ${i}, total };
}
`;
const ORDERS = `// Order workflow
export async function processOrder(order, payments) {
  await payments.charge(order.customerId, order.amount);
  return { status: 'processed', orderId: order.id };
}
`;
const AUTH = `// Authentication helpers
export function loginWithPassword(username, password) {
  return { token: 'token-' + username, user: username };
}
`;

/** In-memory backend: key/value search by glob, every stored vector scores 0.9. */
function createMemory(): MemoryBackend {
  const storage = new Map<string, unknown>();
  const vectors = new Map<string, unknown>();
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
        .map(([key, metadata]) => ({ key, score: 0.9, metadata }))),
    storeVector: vi.fn(async (key: string, _embedding: number[], metadata?: unknown) => {
      vectors.set(key, metadata);
    }),
  } as unknown as MemoryBackend;
}

/** An embedding model that can be taken down and brought back. */
function createSwitchableProvider(): IEmbeddingProvider & { up: boolean } {
  return {
    up: true,
    async embed(): Promise<number[]> {
      if (!this.up) throw new Error('Ollama API error (503): embedding model down');
      return new Array(EMBEDDING_CONFIG.DIMENSIONS).fill(0.05);
    },
    async healthCheck(): Promise<boolean> { return true; },
    getDimensions(): number { return EMBEDDING_CONFIG.DIMENSIONS; },
  };
}

/** The issue's fixture: 40 order-step modules first, then the defining file. */
async function indexFixture(service: SemanticAnalyzerService): Promise<void> {
  for (let i = 1; i <= 40; i++) await service.indexCode(`src/mod${String(i).padStart(2, '0')}.js`, MODULE(i));
  await service.indexCode('src/auth.js', AUTH);
  await service.indexCode('src/orders.js', ORDERS);
}

const files = (results: { file: string }[]) => results.map((r) => r.file);

describe('text matches with equal scores are ranked by relevance (#1287)', () => {
  it('lexical-only semantic search puts the file defining processOrder first for "process order"', async () => {
    const service = new SemanticAnalyzerService(createMemory(), { useNomicEmbeddings: false });
    await indexFixture(service);

    const search = await service.search({ query: 'process order', type: 'semantic', limit: 10 });

    expect(search.success).toBe(true);
    if (!search.success) return;
    expect(search.value.mode).toBe('lexical-only');
    expect(search.value.results[0]).toMatchObject({ file: 'src/orders.js', score: 1, matchType: 'lexical' });
    // The score is unchanged: every file holding both words still scores 1.
    expect(search.value.results.every((r) => r.score === 1)).toBe(true);
  });

  it('fuzzy search ranks the same way', async () => {
    const service = new SemanticAnalyzerService(createMemory(), { useNomicEmbeddings: false });
    await indexFixture(service);

    const search = await service.search({ query: 'process order', type: 'fuzzy', limit: 10 });

    expect(search.success && files(search.value.results)[0]).toBe('src/orders.js');
  });

  it('ranks the text hits of a partial-vector search, after the vector hits', async () => {
    const provider = createSwitchableProvider();
    const service = new SemanticAnalyzerService(createMemory(), { useNomicEmbeddings: false, embeddingProvider: provider });
    await service.indexCode('src/auth.js', AUTH);
    provider.up = false;
    for (let i = 1; i <= 40; i++) await service.indexCode(`src/mod${String(i).padStart(2, '0')}.js`, MODULE(i));
    await service.indexCode('src/orders.js', ORDERS);
    provider.up = true;

    const search = await service.search({ query: 'process order', type: 'semantic', limit: 5 });

    expect(search.success).toBe(true);
    if (!search.success) return;
    expect(search.value.mode).toBe('partial-vector');
    expect(search.value.results.slice(0, 2).map((r) => [r.file, r.matchType])).toEqual([
      ['src/auth.js', 'vector'],
      ['src/orders.js', 'lexical'],
    ]);
  });

  it('puts more occurrences first for a one-word query', async () => {
    const service = new SemanticAnalyzerService(createMemory(), { useNomicEmbeddings: false });
    await service.indexCode('src/a.js', 'const order = 1;\n');
    await service.indexCode('src/b.js', 'order(order.id, order.items);\n');

    const search = await service.search({ query: 'order', type: 'fuzzy' });

    expect(search.success && files(search.value.results)).toEqual(['src/b.js', 'src/a.js']);
  });

  it('still ranks a higher share of query words above a better tie-break', async () => {
    const service = new SemanticAnalyzerService(createMemory(), { useNomicEmbeddings: false });
    await service.indexCode('src/both.js', '// process and order\n');
    await service.indexCode('src/one.js', 'order(order, order, order);\n');
    await service.indexCode('src/none.js', 'const x = 1;\n');

    const search = await service.search({ query: 'process order', type: 'fuzzy' });

    expect(search.success && search.value.results.map((r) => [r.file, r.score])).toEqual([
      ['src/both.js', 1],
      ['src/one.js', 0.5],
    ]);
  });
});
