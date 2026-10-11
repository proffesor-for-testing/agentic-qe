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

describe('persisted legacy Nomic cache provenance', () => {
  function legacyCache(text: string): EmbeddingCache {
    const old = new EmbeddingCache();
    const unverified = Array(EMBEDDING_CONFIG.DIMENSIONS).fill(0);
    unverified[0] = 1;
    old.set(text, EMBEDDING_CONFIG.MODEL, unverified);
    const imported = new EmbeddingCache();
    imported.import(JSON.parse(JSON.stringify(old.export())));
    return imported;
  }

  it('recomputes imported unversioned text entries with the actual owned backend', async () => {
    available = true;
    const embedder = new NomicEmbedder({ ollamaBaseUrl: baseUrl, cache: legacyCache('owned text') });
    expect(await embedder.embed('owned text')).toEqual(vector);
    expect(providerRequests).toBe(1);
    expect(await embedder.embed('owned text')).toEqual(vector);
    expect(providerRequests).toBe(1);
  });

  it('does not report imported legacy chunk vectors as genuine during an outage', async () => {
    const formatter = new NomicEmbedder({ ollamaBaseUrl: baseUrl });
    const cache = legacyCache(formatter.formatForEmbedding(chunk));
    const embedder = new NomicEmbedder({ ollamaBaseUrl: baseUrl, cache });
    const result = (await embedder.embedCodeChunks([chunk])).results[0];
    expect(result.model).toBe('pseudo-embedding');
    expect(result.cached).toBe(false);
    expect(providerRequests).toBe(0);
    const repeated = (await embedder.embedCodeChunks([chunk])).results[0];
    expect(repeated.model).toBe('pseudo-embedding');
    expect(repeated.cached).toBe(true);
  });

  it('preserves newly produced genuine vectors across export/import and an outage', async () => {
    available = true;
    const cache = new EmbeddingCache();
    const producer = new NomicEmbedder({ ollamaBaseUrl: baseUrl, cache });
    expect(await producer.embed('owned text')).toEqual(vector);
    const imported = new EmbeddingCache();
    imported.import(JSON.parse(JSON.stringify(cache.export())));
    available = false;
    const consumer = new NomicEmbedder({ ollamaBaseUrl: baseUrl, cache: imported });
    expect(await consumer.embed('owned text')).toEqual(vector);
    expect(providerRequests).toBe(1);
    expect(imported.export()[0].entry.model).toBe(EMBEDDING_CONFIG.MODEL);
  });
});
