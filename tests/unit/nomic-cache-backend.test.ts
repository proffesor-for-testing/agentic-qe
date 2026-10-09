import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NomicEmbedder } from '../../src/shared/embeddings/nomic-embedder.js';
import { EmbeddingCache } from '../../src/shared/embeddings/embedding-cache.js';
import { EMBEDDING_CONFIG, type CodeChunk } from '../../src/shared/embeddings/types.js';

let server: Server;
let baseUrl: string;
let available: boolean;
let providerRequests: number;
const vector = Array(EMBEDDING_CONFIG.DIMENSIONS).fill(0);
vector[vector.length - 1] = 1;
const chunk: CodeChunk = { id: 'owned-chunk', type: 'function', name: 'choose', language: 'typescript', content: 'function choose(x) { return x; }', fileId: 'owned.ts', startLine: 1, endLine: 1 };

beforeEach(async () => {
  available = false;
  providerRequests = 0;
  server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/api/tags') {
      response.end(JSON.stringify({ models: available ? [{ name: `${EMBEDDING_CONFIG.MODEL}:latest`, model: `${EMBEDDING_CONFIG.MODEL}:latest` }] : [] }));
      return;
    }
    request.resume();
    request.on('end', () => {
      providerRequests++;
      response.end(JSON.stringify({ embedding: vector }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing owned server port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe('Nomic cache backend identity', () => {
  it.each([false, true])('counts one lookup per text when model availability is %s', async (modelAvailable) => {
    available = modelAvailable;
    const embedder = new NomicEmbedder({ ollamaBaseUrl: baseUrl });
    await embedder.embed('first');
    await embedder.embed('second');
    await embedder.embed('first');
    expect(embedder.getCacheStats()).toMatchObject({ size: 2, hits: 1, misses: 2 });
  });

  it.each([false, true])('counts one lookup per chunk when model availability is %s', async (modelAvailable) => {
    available = modelAvailable;
    const embedder = new NomicEmbedder({ ollamaBaseUrl: baseUrl });
    await embedder.embedCodeChunks([chunk]);
    await embedder.embedCodeChunks([chunk]);
    expect(embedder.getCacheStats()).toMatchObject({ size: 1, hits: 1, misses: 1 });
  });

  it.each([false, true])('labels newly generated vectors after an availability reset from %s', async (initiallyAvailable) => {
    available = initiallyAvailable;
    const cache = new EmbeddingCache();
    const embedder = new NomicEmbedder({ ollamaBaseUrl: baseUrl, cache });
    const get = cache.get.bind(cache);
    // An injected cache can trigger the public reset between lookup and work.
    cache.get = (text, model) => {
      available = !initiallyAvailable;
      embedder.resetOllamaCheck();
      return get(text, model);
    };
    const result = await embedder.embed('availability transition');
    expect(cache.export()[0].entry.model).toBe(initiallyAvailable ? 'pseudo-embedding' : EMBEDDING_CONFIG.MODEL);
    expect(providerRequests).toBe(initiallyAvailable ? 0 : 1);
    if (!initiallyAvailable) expect(result).toEqual(vector);
  });

  it('reports cached fallback chunks with the same model as their cache miss', async () => {
    const embedder = new NomicEmbedder({ ollamaBaseUrl: baseUrl });
    const first = (await embedder.embedCodeChunks([chunk])).results[0];
    const second = (await embedder.embedCodeChunks([chunk])).results[0];
    expect(first.model).toBe('pseudo-embedding');
    expect(first.cached).toBe(false);
    expect(second.model).toBe(first.model);
    expect(second.cached).toBe(true);
    expect(second.embedding).toEqual(first.embedding);
    expect(providerRequests).toBe(0);
  });

  it('replaces chunk fallback reuse with model work after the public availability reset', async () => {
    const embedder = new NomicEmbedder({ ollamaBaseUrl: baseUrl });
    await embedder.embedCodeChunks([chunk]);
    available = true;
    embedder.resetOllamaCheck();
    const result = (await embedder.embedCodeChunks([chunk])).results[0];
    expect(result.cached).toBe(false);
    expect(result.model).toBe(EMBEDDING_CONFIG.MODEL);
    expect(result.embedding).toEqual(vector);
    expect(providerRequests).toBe(1);
    expect((await embedder.embedCodeChunks([chunk])).results[0].cached).toBe(true);
    expect(providerRequests).toBe(1);
  });

  it('uses model work rather than an earlier text fallback after reset', async () => {
    const embedder = new NomicEmbedder({ ollamaBaseUrl: baseUrl });
    await embedder.embed('owned text');
    available = true;
    embedder.resetOllamaCheck();
    expect(await embedder.embed('owned text')).toEqual(vector);
    expect(providerRequests).toBe(1);
  });

  it('isolates a shared fallback cache from a new strict model consumer', async () => {
    const cache = new EmbeddingCache();
    await new NomicEmbedder({ ollamaBaseUrl: baseUrl, cache }).embed('owned text');
    available = true;
    const strict = new NomicEmbedder({ ollamaBaseUrl: baseUrl, cache, enableFallback: false });
    expect(await strict.embed('owned text')).toEqual(vector);
    expect(providerRequests).toBe(1);
  });

  it('retains genuine cached text model vectors during a later outage', async () => {
    available = true;
    const embedder = new NomicEmbedder({ ollamaBaseUrl: baseUrl });
    expect(await embedder.embed('owned text')).toEqual(vector);
    available = false;
    embedder.resetOllamaCheck();
    expect(await embedder.embed('owned text')).toEqual(vector);
    expect(providerRequests).toBe(1);
  });

  it('retains genuine cached chunk vectors and labels during a later outage', async () => {
    available = true;
    const embedder = new NomicEmbedder({ ollamaBaseUrl: baseUrl });
    await embedder.embedCodeChunks([chunk]);
    available = false;
    embedder.resetOllamaCheck();
    const result = (await embedder.embedCodeChunks([chunk])).results[0];
    expect(result.embedding).toEqual(vector);
    expect(result.model).toBe(EMBEDDING_CONFIG.MODEL);
    expect(result.cached).toBe(true);
    expect(providerRequests).toBe(1);
  });

  it('does not enable fallback for a strict consumer without a genuine cached vector', async () => {
    const strict = new NomicEmbedder({ ollamaBaseUrl: baseUrl, enableFallback: false });
    await expect(strict.embed('owned text')).rejects.toThrow('fallback is disabled');
    expect(providerRequests).toBe(0);
  });
});
