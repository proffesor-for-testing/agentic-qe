/**
 * #1229: Ollama publishes all-MiniLM-L6-v2 as `all-minilm` (e.g. all-minilm:22m).
 * The client accepts that name, embeds with the installed name, and says
 * whether Ollama is unreachable or reachable without the model. Other models,
 * even 384-dimensional ones, are not accepted as MiniLM-L6 (ADR-097).
 */

import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OllamaClient, isConfiguredOllamaModel } from '../../src/shared/embeddings/ollama-client.js';
import { EMBEDDING_CONFIG, type OllamaHealthResponse } from '../../src/shared/embeddings/types.js';

let server: Server;
let url: string;
let models: OllamaHealthResponse['models'];
let tagsStatus: number;
let dimensions: number;
let requestedModel: string | undefined;

beforeEach(async () => {
  models = [];
  tagsStatus = 200;
  dimensions = EMBEDDING_CONFIG.DIMENSIONS;
  requestedModel = undefined;
  server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/api/tags') {
      response.statusCode = tagsStatus;
      response.end(JSON.stringify({ models }));
      return;
    }
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      requestedModel = JSON.parse(body).model;
      response.end(JSON.stringify({ embedding: Array(dimensions).fill(0.25) }));
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

const listed = (...names: string[]) => names.map((name) => ({ name, model: name } as NonNullable<OllamaHealthResponse['models']>[number]));
// No AQE_OLLAMA_EMBEDDING_MODEL from the environment running the tests.
const client = (ollamaModel = '') => new OllamaClient(url, 1, 1, 5000, ollamaModel);

describe('Ollama names of all-MiniLM-L6-v2 (#1229)', () => {
  it.each([
    'all-minilm',
    'all-minilm:latest',
    'all-minilm:22m',
    'all-minilm:l6-v2',
    'all-minilm:22m-l6-v2-fp16',
    'all-MiniLM-L6-v2',
    'all-MiniLM-L6-v2:latest',
    'Xenova/all-MiniLM-L6-v2:latest',
    'hf.co/sentence-transformers/all-MiniLM-L6-v2:F16',
  ])('accepts %s', (name) => {
    expect(isConfiguredOllamaModel(name)).toBe(true);
  });

  it.each([
    'all-minilm:33m',
    'all-minilm:l12-v2',
    'all-minilm:33m-l12-v2-fp16',
    'someone/all-minilm:22m',
    'all-MiniLM-L12-v2',
    'all-MiniLM-L6-v2-other:latest',
    'nomic-embed-text:latest',
  ])('rejects %s', (name) => {
    expect(isConfiguredOllamaModel(name)).toBe(false);
  });

  it('finds all-minilm:22m among other models and embeds with that name', async () => {
    models = listed('qwen3-coder:30b', 'nomic-embed-text:latest', 'all-minilm:22m');
    const ollama = client();

    expect(await ollama.checkModel()).toEqual({ status: 'available', model: 'all-minilm:22m' });
    expect(await ollama.generateEmbedding('login')).toHaveLength(EMBEDDING_CONFIG.DIMENSIONS);
    expect(requestedModel).toBe('all-minilm:22m');
    expect(ollama.getModelId()).toBe(EMBEDDING_CONFIG.MODEL);
  });

  it('says the model is not installed when Ollama answers without it', async () => {
    models = listed('nomic-embed-text:latest', 'all-minilm:33m');

    expect(await client().checkModel()).toEqual({
      status: 'missing',
      reason: `model '${EMBEDDING_CONFIG.MODEL}' not installed in Ollama at ${url}; install it with: ollama pull all-minilm:22m`,
    });
    await expect(client().ensureModelAvailable()).rejects.toThrow(`not installed in Ollama at ${url}`);
    expect(requestedModel).toBeUndefined();
  });

  it('says Ollama is not reachable when nothing answers', async () => {
    const closed = 'http://127.0.0.1:1';
    expect(await new OllamaClient(closed, 1, 1, 5000, '').checkModel()).toEqual({
      status: 'unreachable',
      reason: `Ollama at ${closed} is not reachable`,
    });
  });

  it('reports an HTTP error from the model list', async () => {
    tagsStatus = 500;
    expect(await client().checkModel()).toEqual({
      status: 'unreachable',
      reason: `Ollama at ${url} answered HTTP 500 when listing models`,
    });
  });
});

describe('AQE_OLLAMA_EMBEDDING_MODEL (#1229)', () => {
  it('uses the named model, matching it untagged as :latest', async () => {
    models = listed('all-minilm:22m', 'my-minilm:latest');
    const ollama = client('my-minilm');

    expect(await ollama.checkModel()).toEqual({ status: 'available', model: 'my-minilm:latest' });
    await ollama.generateEmbedding('login');
    expect(requestedModel).toBe('my-minilm:latest');
  });

  it('keeps the MiniLM identity for a name of the same model', () => {
    expect(client('all-minilm:22m').getModelId()).toBe(EMBEDDING_CONFIG.MODEL);
  });

  it('gives another model its own identity, so its vectors are not compared with MiniLM ones', () => {
    expect(client('my-minilm').getModelId()).toBe('ollama:my-minilm');
  });

  it('reads the variable from the environment', () => {
    const previous = process.env.AQE_OLLAMA_EMBEDDING_MODEL;
    process.env.AQE_OLLAMA_EMBEDDING_MODEL = ' my-minilm ';
    try {
      expect(new OllamaClient(url).getModelId()).toBe('ollama:my-minilm');
    } finally {
      if (previous === undefined) delete process.env.AQE_OLLAMA_EMBEDDING_MODEL;
      else process.env.AQE_OLLAMA_EMBEDDING_MODEL = previous;
    }
  });

  it('says the named model is not installed', async () => {
    models = listed('all-minilm:22m');
    expect(await client('my-minilm').checkModel()).toEqual({
      status: 'missing',
      reason: `model 'my-minilm' not installed in Ollama at ${url}; install it with: ollama pull my-minilm`,
    });
  });

  it('still rejects a model whose vectors are not 384-dimensional', async () => {
    models = listed('nomic-embed-text:latest');
    dimensions = 768;
    const ollama = client('nomic-embed-text');

    expect((await ollama.checkModel()).status).toBe('available');
    await expect(ollama.generateEmbedding('login')).rejects.toThrow('Invalid embedding dimensions: expected 384, got 768');
  });
});
