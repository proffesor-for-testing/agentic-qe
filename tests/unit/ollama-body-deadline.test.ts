import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OllamaClient } from '../../src/shared/embeddings/ollama-client.js';
import { EMBEDDING_CONFIG } from '../../src/shared/embeddings/types.js';

let server: Server;
let url: string;
let headersDelay: number;
let bodyDelay: number;
let status: number;
let malformed: boolean;
let dimensions: number;
let requests: number;
let recoverOnRetry: boolean;
const timers = new Set<ReturnType<typeof setTimeout>>();

beforeEach(async () => {
  headersDelay = bodyDelay = requests = 0;
  status = 200;
  malformed = recoverOnRetry = false;
  dimensions = EMBEDDING_CONFIG.DIMENSIONS;
  server = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      const attempt = ++requests;
      const later = (delay: number, callback: () => void) => {
        const timer = setTimeout(() => { timers.delete(timer); callback(); }, delay);
        timers.add(timer);
      };
      later(headersDelay, () => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.flushHeaders();
        later(recoverOnRetry && attempt > 1 ? 0 : bodyDelay, () => {
          response.end(malformed ? '{' : status !== 200 ? 'owned error' : JSON.stringify(
            request.url === '/api/tags'
              ? { models: [{ name: EMBEDDING_CONFIG.MODEL }] }
              : { embedding: Array(dimensions).fill(attempt) }
          ));
        });
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing owned server address');
  url = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe('Ollama response-body deadlines', () => {
  it('accepts a complete valid response within the request timeout', async () => {
    expect(await new OllamaClient(url, 1, 0, 100).generateEmbedding('owned')).toEqual(Array(384).fill(1));
  });

  it('keeps the embedding timeout active after headers arrive', async () => {
    bodyDelay = 180;
    await expect(new OllamaClient(url, 1, 0, 30).generateEmbedding('owned')).rejects.toThrow(/abort/i);
  });

  it('retains the existing deadline for slow response headers', async () => {
    headersDelay = 180;
    await expect(new OllamaClient(url, 1, 0, 30).generateEmbedding('owned')).rejects.toThrow(/abort/i);
  });

  it('bounds delayed error-body consumption with the same deadline', async () => {
    status = 503;
    bodyDelay = 180;
    await expect(new OllamaClient(url, 1, 0, 30).generateEmbedding('owned')).rejects.toThrow(/abort/i);
  });

  it('retains the status and message from a complete error response', async () => {
    status = 503;
    await expect(new OllamaClient(url, 1, 0, 100).generateEmbedding('owned')).rejects.toThrow('Ollama API error (503): owned error');
  });

  it('retries a body timeout with a fresh deadline', async () => {
    bodyDelay = 180;
    recoverOnRetry = true;
    expect(await new OllamaClient(url, 2, 0, 30).generateEmbedding('owned')).toEqual(Array(384).fill(2));
    expect(requests).toBe(2);
  });

  it('does not retry invalid embedding dimensions', async () => {
    dimensions = 2;
    await expect(new OllamaClient(url, 2, 0, 100).generateEmbedding('owned')).rejects.toThrow('Invalid embedding dimensions');
    expect(requests).toBe(1);
  });

  it.each(['healthCheck', 'getServerInfo'] as const)('bounds %s JSON consumption after headers', async (method) => {
    bodyDelay = 5300;
    expect(await new OllamaClient(url)[method]()).toBe(method === 'healthCheck' ? false : null);
  }, 10000);

  it.each(['healthCheck', 'getServerInfo'] as const)('retains the fast %s response', async (method) => {
    const result = await new OllamaClient(url)[method]();
    if (method === 'healthCheck') expect(result).toBe(true);
    else expect(result).toEqual({ models: [{ name: EMBEDDING_CONFIG.MODEL }] });
  });

  it.each(['healthCheck', 'getServerInfo'] as const)('returns its %s status-only failure without requiring a body', async (method) => {
    status = 503;
    bodyDelay = 5300;
    expect(await new OllamaClient(url)[method]()).toBe(method === 'healthCheck' ? false : null);
  });

  it.each(['healthCheck', 'getServerInfo'] as const)('retains %s malformed JSON handling', async (method) => {
    malformed = true;
    expect(await new OllamaClient(url)[method]()).toBe(method === 'healthCheck' ? false : null);
  });
});
