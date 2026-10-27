/**
 * #1279: text matching finds a query word only where a content word contains
 * it. A query word that merely contains a short content word (`stepHandler450`
 * vs `step`) no longer counts as found, which made almost every file a 1.0 match.
 */

import { describe, it, expect, vi } from 'vitest';
import { SemanticAnalyzerService } from '../../../../src/domains/code-intelligence/services/semantic-analyzer';
import type { MemoryBackend, VectorSearchResult } from '../../../../src/kernel/interfaces';
import { EMBEDDING_CONFIG, type IEmbeddingProvider } from '../../../../src/shared/embeddings';

const STEP = (i: number) =>
  `// Module ${i}: order processing step ${i}\nexport function stepHandler${i}(order) { return { step: ${i}, id: order.id }; }\n`;
const AUTH = `// Authentication helpers
export function loginWithPassword(username, password) {
  return { token: 'token-' + username, user: username };
}
`;
const ORDERS = `// Order workflow
export async function processOrder(order, payments) {
  await payments.charge(order.customerId, order.amount);
  return { status: 'processed', orderId: order.id };
}
`;

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
      if (!this.up) throw new Error('embedding model down');
      const v = new Array(EMBEDDING_CONFIG.DIMENSIONS).fill(0);
      for (let i = 0; i < text.length && i < v.length; i++) v[i] = text.charCodeAt(i) / 1000;
      return v;
    },
    async healthCheck(): Promise<boolean> { return true; },
    getDimensions(): number { return EMBEDDING_CONFIG.DIMENSIONS; },
  };
}

/** No embedding model: semantic search is lexical-only. */
async function indexedWithoutModel(): Promise<SemanticAnalyzerService> {
  const service = new SemanticAnalyzerService(createMemory(), { useNomicEmbeddings: false });
  for (let i = 1; i <= 5; i++) await service.indexCode(`src/mod${i}.js`, STEP(i));
  await service.indexCode('src/auth.js', AUTH);
  await service.indexCode('src/orders.js', ORDERS);
  return service;
}

const files = (result: Awaited<ReturnType<SemanticAnalyzerService['search']>>) =>
  result.success ? result.value.results.map((r) => r.file) : result.error.message;

describe('text matching does not count a short content word as the query word (#1279)', () => {
  it.each(['semantic', 'fuzzy'] as const)(
    'a %s search for an identifier that is not in the code finds nothing',
    async (type) => {
      const service = await indexedWithoutModel();

      expect(files(await service.search({ query: 'stepHandler450', type }))).toEqual([]);
    },
  );

  it.each(['semantic', 'fuzzy'] as const)('a %s search for stepHandler3 finds only that file', async (type) => {
    const service = await indexedWithoutModel();

    expect(files(await service.search({ query: 'stepHandler3', type }))).toEqual(['src/mod3.js']);
  });

  it.each([
    ['loginWithPassword', ['src/auth.js']],
    ['processOrder', ['src/orders.js']],
    ['login', ['src/auth.js']],
  ])('the camelCase or partial query %s still finds its file', async (query, expected) => {
    const service = await indexedWithoutModel();

    expect(files(await service.search({ query, type: 'semantic' }))).toEqual(expected);
  });

  it('separate query words each still match inside longer identifiers', async () => {
    const service = await indexedWithoutModel();

    const result = await service.search({ query: 'process order', type: 'fuzzy' });

    // "process" is in processOrder / processing, "order" in order / processOrder.
    expect(result.success && result.value.results.map((r) => [r.file, r.score])).toEqual(
      expect.arrayContaining([['src/orders.js', 1], ['src/mod1.js', 1]]),
    );
    expect(files(result)).not.toContain('src/auth.js');
  });

  it('a query word longer than every content word is not found (plural vs singular)', async () => {
    const service = new SemanticAnalyzerService(createMemory(), { useNomicEmbeddings: false });
    await service.indexCode('src/one.js', 'export const order = 1;\n');

    expect(files(await service.search({ query: 'orders', type: 'fuzzy' }))).toEqual([]);
  });

  it('the text-matched part of a partial-vector search uses the same rule', async () => {
    const provider = createSwitchableProvider();
    const service = new SemanticAnalyzerService(createMemory(), { useNomicEmbeddings: false, embeddingProvider: provider });
    await service.indexCode('src/auth.js', AUTH);
    provider.up = false; // these files get no vector
    for (let i = 1; i <= 3; i++) await service.indexCode(`src/mod${i}.js`, STEP(i));
    provider.up = true;

    const result = await service.search({ query: 'stepHandler450', type: 'semantic' });

    expect(result.success && result.value.mode).toBe('partial-vector');
    expect(result.success && result.value.results.filter((r) => r.matchType === 'lexical')).toEqual([]);
  });

  it('findSimilar highlights only content words that contain a query word', async () => {
    const service = new SemanticAnalyzerService(createMemory(), {
      useNomicEmbeddings: false,
      embeddingProvider: createSwitchableProvider(),
    });
    await service.indexCode('src/mod1.js', STEP(1));

    const result = await service.findSimilar('stepHandler450 order');

    expect(result.success && result.value.map((r) => r.highlights)).toEqual([['order']]);
  });
});
