/**
 * Issue #961 (same bug class): the consensus OpenRouter provider must keep its
 * request deadline armed until the response body is fully read. The provider's
 * fixed https://openrouter.ai URL is redirected to a real local HTTP server
 * that sends headers and then stalls mid-body; transport stays native fetch.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { Socket } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenRouterModelProvider } from '../../../../../src/coordination/consensus/providers/openrouter-provider';

const DEADLINE_MS = 100;
const OPENROUTER_ORIGIN = 'https://openrouter.ai';
const realFetch = globalThis.fetch;
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

interface Endpoint { requestSeen: Promise<void>; clientClosed: () => boolean; requestedUrls: string[] }

async function withOpenRouterEndpoint(
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
  const local = `http://127.0.0.1:${address.port}`;
  const requestedUrls: string[] = [];
  vi.stubGlobal('fetch', (input: string | URL, init?: RequestInit) => {
    requestedUrls.push(String(input));
    return realFetch(String(input).replace(OPENROUTER_ORIGIN, local), init);
  });
  try {
    await run({ requestSeen, clientClosed: () => closed, requestedUrls });
  } finally {
    vi.unstubAllGlobals();
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

const createProvider = () => new OpenRouterModelProvider({ apiKey: 'synthetic-fixture-key', maxRetries: 0 });

async function settleWithin<T>(call: () => Promise<T>, endpoint: Endpoint, waitMs = 600) {
  let settled = false;
  let failure: unknown;
  const outcome = call().then(() => { settled = true; }, e => { settled = true; failure = e; });
  await endpoint.requestSeen;
  await delay(waitMs);
  return { settled, failure, outcome };
}

describe('OpenRouterModelProvider response-body deadline (#961)', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['a 200 body', 200, '{"id":"owned","choices":[{"message":{"content":"'],
    ['an error body', 500, '{"error":"'],
  ] as const)('complete() times out when %s stalls after headers', async (_label, status, prefix) => {
    let outcome: Promise<void> | undefined;
    try {
      await withOpenRouterEndpoint(stallAfter(status, prefix), async endpoint => {
        const liveDeadlines = trackLiveTimers(DEADLINE_MS);
        const result = await settleWithin(() => createProvider().complete('owned fixture', { timeout: DEADLINE_MS }), endpoint);
        outcome = result.outcome;
        expect(endpoint.requestedUrls).toEqual([`${OPENROUTER_ORIGIN}/api/v1/chat/completions`]);
        expect(result.settled).toBe(true);
        expect((result.failure as Error).message).toBe(`OpenRouter request timed out after ${DEADLINE_MS}ms`);
        expect(endpoint.clientClosed()).toBe(true);
        expect(liveDeadlines()).toBe(0);
      });
    } finally {
      await outcome; // socket teardown also settles a hanging baseline
    }
  });

  it('still returns complete responses and clears the deadline', async () => {
    await withOpenRouterEndpoint((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        id: 'owned', model: 'owned/model',
        choices: [{ message: { role: 'assistant', content: 'owned reply' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
      }));
    }, async () => {
      const liveDeadlines = trackLiveTimers(2_000);
      expect(await createProvider().complete('owned fixture', { timeout: 2_000 })).toBe('owned reply');
      expect(liveDeadlines()).toBe(0);
    });
  });
});
