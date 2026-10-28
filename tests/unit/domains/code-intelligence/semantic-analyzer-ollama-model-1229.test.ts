/**
 * #1229: semantic code search uses Ollama's all-minilm (its name for
 * all-MiniLM-L6-v2) instead of falling back to text matching, and when it
 * cannot embed it says whether Ollama is down or lacks the model. Vectors
 * stay tagged with their model, so another model's vectors are not mixed in.
 */

import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SemanticAnalyzerService } from '../../../../src/domains/code-intelligence/services/semantic-analyzer';
import type { MemoryBackend, VectorSearchResult } from '../../../../src/kernel/interfaces';
import { EMBEDDING_CONFIG } from '../../../../src/shared/embeddings';

const AUTH = `// Authenticates a user and starts a session.
export function login(username, password, store) {
  return store.findUser(username).issueSessionToken(password);
}
`;

/** In-memory backend: key/value search by glob, every stored vector scores 0.9. */
function createMemory(): MemoryBackend & { stored: Map<string, unknown> } {
  const storage = new Map<string, unknown>();
  const vectors = new Map<string, unknown>();
  return {
    stored: vectors,
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
  } as unknown as MemoryBackend & { stored: Map<string, unknown> };
}

let server: Server;
let url: string;
let installed: string[];
const embedRequests: string[] = [];

beforeEach(async () => {
  installed = [];
  embedRequests.length = 0;
  server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/api/tags') {
      response.end(JSON.stringify({ models: installed.map((name) => ({ name, model: name })) }));
      return;
    }
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      embedRequests.push(JSON.parse(body).model);
      response.end(JSON.stringify({ embedding: Array(EMBEDDING_CONFIG.DIMENSIONS).fill(0.05) }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server port');
  url = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

// ollamaModel '' ignores any AQE_OLLAMA_EMBEDDING_MODEL in the test environment.
const analyzer = (memory: MemoryBackend, ollamaBaseUrl = url, ollamaModel = '') =>
  new SemanticAnalyzerService(memory, { nomicConfig: { ollamaBaseUrl, ollamaModel } });

describe('semantic search with Ollama all-minilm (#1229)', () => {
  it('runs vector search with all-minilm:22m and tags the vectors as all-MiniLM-L6-v2', async () => {
    installed = ['nomic-embed-text:latest', 'all-minilm:22m'];
    const memory = createMemory();
    const service = analyzer(memory);

    const indexed = await service.indexCode('src/auth.js', AUTH);
    const search = await service.search({ query: 'login', type: 'semantic' });

    expect(indexed.success && indexed.value).toEqual({ vector: true });
    expect(search.success).toBe(true);
    if (!search.success) return;
    expect(search.value.mode).toBe('vector');
    expect(search.value.reason).toBeUndefined();
    expect(search.value.results.map((r) => [r.file, r.matchType])).toEqual([['src/auth.js', 'vector']]);
    expect([...memory.stored.values()]).toEqual([expect.objectContaining({ embeddingModel: EMBEDDING_CONFIG.MODEL })]);
    expect(new Set(embedRequests)).toEqual(new Set(['all-minilm:22m']));
  });

  it('says the model is not installed when Ollama answers without it', async () => {
    installed = ['nomic-embed-text:latest', 'all-minilm:33m'];
    const service = analyzer(createMemory());
    await service.indexCode('src/auth.js', AUTH);

    const search = await service.search({ query: 'login', type: 'semantic' });

    expect(search.success && search.value.mode).toBe('lexical-only');
    expect(search.success && search.value.reason).toBe(
      `no embedding model available (model '${EMBEDDING_CONFIG.MODEL}' not installed in Ollama at ${url}; ` +
      'install it with: ollama pull all-minilm:22m)'
    );
    expect(embedRequests).toEqual([]);
  });

  it('says Ollama is not reachable when nothing answers', async () => {
    const closed = 'http://127.0.0.1:1';
    const service = analyzer(createMemory(), closed);
    await service.indexCode('src/auth.js', AUTH);

    const search = await service.search({ query: 'login', type: 'semantic' });

    expect(search.success && search.value.mode).toBe('lexical-only');
    expect(search.success && search.value.reason).toBe(`no embedding model available (Ollama at ${closed} is not reachable)`);
  });

  it('does not compare MiniLM query vectors with vectors from another model', async () => {
    installed = ['all-minilm:22m', 'my-embedder:latest'];
    const memory = createMemory();
    await analyzer(memory, url, 'my-embedder').indexCode('src/auth.js', AUTH);

    const search = await analyzer(memory).search({ query: 'login', type: 'semantic' });

    expect([...memory.stored.values()]).toEqual([expect.objectContaining({ embeddingModel: 'ollama:my-embedder' })]);
    expect(search.success && search.value.mode).toBe('lexical-only');
    expect(search.success && search.value.reason).toBe(
      `no indexed file has an embedding from ${EMBEDDING_CONFIG.MODEL}; re-index to enable vector search`
    );
  });
});
