import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OllamaClient } from '../../src/shared/embeddings/ollama-client.js';
import { EMBEDDING_CONFIG, type OllamaHealthResponse } from '../../src/shared/embeddings/types.js';

let server: Server;
let client: OllamaClient;
let models: OllamaHealthResponse['models'];
let requestedModel: string | undefined;

beforeEach(async () => {
  models = [];
  requestedModel = undefined;
  server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/api/tags') {
      response.end(JSON.stringify({ models }));
      return;
    }
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      requestedModel = JSON.parse(body).model;
      response.end(JSON.stringify({ embedding: Array(EMBEDDING_CONFIG.DIMENSIONS).fill(0.25) }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing owned server port');
  client = new OllamaClient(`http://127.0.0.1:${address.port}`);
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

const model = EMBEDDING_CONFIG.MODEL;

describe('configured Ollama embedding model readiness', () => {
  it.each(['name', 'model'] as const)('matches exact and tagged identities in %s', async (field) => {
    for (const candidate of [model, `${model}:latest`]) {
      models = [{ name: '', model: '', [field]: candidate }];
      expect(await client.healthCheck()).toBe(true);
    }
  });

  it.each(['name', 'model'] as const)('rejects distinct models sharing the prefix in %s', async (field) => {
    for (const candidate of [`${model}-other:latest`, `${model}2:latest`, 'other-model:latest']) {
      models = [{ name: '', model: '', [field]: candidate }];
      expect(await client.healthCheck()).toBe(false);
    }
  });

  it('fails availability preflight for a different model instead of sending embedding work', async () => {
    models = [{ name: `${model}-other:latest`, model: '' }];
    await expect(client.ensureModelAvailable()).rejects.toThrow(`Ollama model '${model}' is not available`);
    expect(requestedModel).toBeUndefined();
  });

  it('retains configured inference identity after a successful availability preflight', async () => {
    models = [{ name: `${model}:latest`, model: '' }];
    await client.ensureModelAvailable();
    expect(await client.generateEmbedding('owned prompt')).toEqual(Array(EMBEDDING_CONFIG.DIMENSIONS).fill(0.25));
    expect(requestedModel).toBe(model);
  });

  it('reports an empty model list as unavailable', async () => {
    expect(await client.healthCheck()).toBe(false);
  });
});
