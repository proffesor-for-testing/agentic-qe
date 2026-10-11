/**
 * Issue #961: the consensus Ollama provider must keep its request deadline
 * armed until the response body is fully read. Uses a real local HTTP server
 * that sends headers and then stalls mid-body.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { Socket } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OllamaModelProvider } from '../../../../../src/coordination/consensus/providers/ollama-provider';
import { CONSENSUS_CONSTANTS } from '../../../../../src/coordination/constants';

const DEADLINE_MS = 100;
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const constants = CONSENSUS_CONSTANTS as { OLLAMA_CONNECTION_TEST_TIMEOUT_MS: number };

interface Endpoint { baseUrl: string; requestSeen: Promise<void>; clientClosed: () => boolean }

async function withEndpoint(
  reply: (request: IncomingMessage, response: ServerResponse) => void,
  run: (endpoint: Endpoint) => Promise<void>,
): Promise<void> {
  let received!: () => void;
  const requestSeen = new Promise<void>(resolve => { received = resolve; });
  const sockets = new Set<Socket>();
  let closed = false;
  const server = createServer((request, response) => {
    reply(request, response);
    received();
  });
  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => { closed = true; sockets.delete(socket); });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No fixture port');
  try {
    await run({ baseUrl: `http://127.0.0.1:${address.port}`, requestSeen, clientClosed: () => closed });
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

const stallAfter = (status: number, prefix: string) => (_req: IncomingMessage, res: ServerResponse) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.write(prefix);
};

/** Counts timers armed with `ms` that have neither fired nor been cleared. */
function trackLiveTimers(ms: number): () => number {
  const live = new Set<unknown>();
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, wait?: number, ...args: unknown[]) => {
    const id = realSet(() => { live.delete(id); fn(); }, wait, ...args);
    if (wait === ms) live.add(id);
    return id;
  }) as typeof setTimeout);
  vi.spyOn(globalThis, 'clearTimeout').mockImplementation(((id: unknown) => {
    live.delete(id);
    realClear(id as Parameters<typeof clearTimeout>[0]);
  }) as typeof clearTimeout);
  return () => live.size;
}

/** Starts `call`, waits well past the deadline and reports how it settled. */
async function settleWithin<T>(call: () => Promise<T>, endpoint: Endpoint, waitMs = 600) {
  let settled = false;
  let value: T | undefined;
  let failure: unknown;
  const outcome = call().then(
    v => { settled = true; value = v; },
    e => { settled = true; failure = e; },
  );
  await endpoint.requestSeen;
  await delay(waitMs);
  return { settled, value, failure, outcome };
}

describe('OllamaModelProvider response-body deadline (#961)', () => {
  let originalConnectionTimeout: number;
  beforeEach(() => {
    originalConnectionTimeout = constants.OLLAMA_CONNECTION_TEST_TIMEOUT_MS;
    constants.OLLAMA_CONNECTION_TEST_TIMEOUT_MS = DEADLINE_MS;
  });
  afterEach(() => {
    constants.OLLAMA_CONNECTION_TEST_TIMEOUT_MS = originalConnectionTimeout;
    vi.restoreAllMocks();
  });

  it('complete() times out when /api/chat stalls after headers', async () => {
    let outcome: Promise<void> | undefined;
    try {
      await withEndpoint(stallAfter(200, '{"message":{"content":"'), async endpoint => {
        const liveDeadlines = trackLiveTimers(DEADLINE_MS);
        const provider = new OllamaModelProvider({ baseUrl: endpoint.baseUrl, maxRetries: 0 });
        const result = await settleWithin(() => provider.complete('owned fixture', { timeout: DEADLINE_MS }), endpoint);
        outcome = result.outcome;
        expect(result.settled).toBe(true);
        expect(result.failure).toBeInstanceOf(Error);
        expect((result.failure as Error).message).toBe(`Ollama request timed out after ${DEADLINE_MS}ms`);
        expect(endpoint.clientClosed()).toBe(true);
        expect(liveDeadlines()).toBe(0);
      });
    } finally {
      await outcome; // socket teardown also settles a hanging baseline
    }
  });

  it('complete() times out when an error body stalls after headers', async () => {
    let outcome: Promise<void> | undefined;
    try {
      await withEndpoint(stallAfter(500, '{"error":"'), async endpoint => {
        const provider = new OllamaModelProvider({ baseUrl: endpoint.baseUrl, maxRetries: 0 });
        const result = await settleWithin(() => provider.complete('owned fixture', { timeout: DEADLINE_MS }), endpoint);
        outcome = result.outcome;
        expect(result.settled).toBe(true);
        expect((result.failure as Error).message).toBe(`Ollama request timed out after ${DEADLINE_MS}ms`);
      });
    } finally {
      await outcome;
    }
  });

  it('listModels() gives up when /api/tags stalls after headers', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    let outcome: Promise<void> | undefined;
    try {
      await withEndpoint(stallAfter(200, '{"models":['), async endpoint => {
        const provider = new OllamaModelProvider({ baseUrl: endpoint.baseUrl, enableLogging: true });
        const result = await settleWithin(() => provider.listModels(), endpoint);
        outcome = result.outcome;
        expect(result.settled).toBe(true);
        expect(result.value).toEqual([]);
        expect(logged).toHaveBeenCalledWith(
          '[Ollama] Failed to list models:',
          expect.objectContaining({ message: `Ollama list models timed out after ${DEADLINE_MS}ms` }),
        );
        expect(endpoint.clientClosed()).toBe(true);
      });
    } finally {
      await outcome;
    }
  });

  it('still returns complete responses well inside the deadline', async () => {
    await withEndpoint((req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(req.url === '/api/tags'
        ? JSON.stringify({ models: [{ name: 'owned-model:1b' }] })
        : JSON.stringify({ model: 'owned-model:1b', message: { role: 'assistant', content: 'owned reply' }, done: true }));
    }, async ({ baseUrl }) => {
      constants.OLLAMA_CONNECTION_TEST_TIMEOUT_MS = 2_000;
      const liveDeadlines = trackLiveTimers(2_000);
      const provider = new OllamaModelProvider({ baseUrl, maxRetries: 0 });
      expect(await provider.listModels()).toEqual(['owned-model:1b']);
      expect(await provider.complete('owned fixture', { timeout: 2_000 })).toBe('owned reply');
      expect(liveDeadlines()).toBe(0); // deadlines are cleared once each body is read
    });
  });
});
