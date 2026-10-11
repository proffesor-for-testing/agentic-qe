import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { Socket } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from '../../../../src/shared/llm/providers/gemini.js';
import { OpenRouterProvider } from '../../../../src/shared/llm/providers/openrouter.js';
import { fetchWithResponseDeadline } from '../../../../src/shared/llm/providers/response-deadline.js';

// Native HTTP/provider parsing; no learning database writes.
vi.mock('../../../../src/learning/token-tracker.js', () => ({
  TokenMetricsCollector: { recordTokenUsage: vi.fn() },
}));
afterEach(() => vi.restoreAllMocks());

async function withEndpoint(
  reply: (response: ServerResponse, schedule: (ms: number, action: () => void) => void) => void,
  run: (endpoint: string) => Promise<void>,
): Promise<void> {
  const sockets = new Set<Socket>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const schedule = (ms: number, action: () => void) => {
    const timer = setTimeout(() => { timers.delete(timer); action(); }, ms);
    timers.add(timer);
  };
  const server = createServer((_request, response) => reply(response, schedule));
  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No fixture port');
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally {
    for (const timer of timers) clearTimeout(timer);
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

const names = ['gemini', 'openrouter'] as const;
function event(name: typeof names[number], value: string): string {
  const data = name === 'gemini'
    ? { candidates: [{ content: { parts: [{ text: value }] } }] }
    : { choices: [{ delta: { content: value } }] };
  return `data: ${JSON.stringify(data)}\n\n`;
}
function provider(name: typeof names[number], baseUrl: string) {
  const config = { baseUrl, apiKey: 'owned-fixture-key', timeoutMs: 200, maxRetries: 1 };
  return name === 'gemini' ? new GeminiProvider(config) : new OpenRouterProvider(config);
}

describe('stream response idle deadlines over native HTTP', () => {
  it.each(names)('keeps a healthy %s stream alive beyond one request timeout', async name => {
    await withEndpoint((response, schedule) => {
      response.setHeader('content-type', 'text/event-stream');
      for (let i = 0; i < 8; i++) {
        schedule(50 * (i + 1), () => {
          response.write(event(name, `chunk-${i}`));
          if (i === 7) response.end();
        });
      }
    }, async endpoint => {
      const chunks: string[] = [];
      let failure: unknown;
      try { for await (const chunk of provider(name, endpoint).generateStream('owned fixture')) chunks.push(chunk); }
      catch (error) { failure = error; }
      expect({ chunks, failure }).toEqual({ chunks: Array.from({ length: 8 }, (_, i) => `chunk-${i}`), failure: undefined });
    });
  });

  it.each(names)('gives %s its body idle budget after delayed headers', async name => {
    await withEndpoint((response, schedule) => {
      schedule(120, () => {
        response.setHeader('content-type', 'text/event-stream');
        response.flushHeaders();
        schedule(120, () => response.end(event(name, 'after headers')));
      });
    }, async endpoint => {
      const chunks: string[] = [];
      let failure: unknown;
      try { for await (const chunk of provider(name, endpoint).generateStream('owned fixture')) chunks.push(chunk); }
      catch (error) { failure = error; }
      expect({ chunks, failure }).toEqual({ chunks: ['after headers'], failure: undefined });
    });
  });

  it.each(names)('still times out a %s stream when progress stops', async name => {
    await withEndpoint(response => {
      response.setHeader('content-type', 'text/event-stream');
      response.write(event(name, 'first'));
    }, async endpoint => {
      const reader = provider(name, endpoint).generateStream('owned fixture');
      try {
        expect(await reader.next()).toMatchObject({ value: 'first', done: false });
        await expect(reader.next()).rejects.toMatchObject({ code: 'TIMEOUT', provider: name });
      } finally { await reader.return(undefined as never); }
    });
  });

  it('keeps the absolute budget for a non-streaming JSON body despite progress', async () => {
    await withEndpoint((response, schedule) => {
      response.setHeader('content-type', 'application/json');
      response.write('{"value":"');
      for (let i = 1; i <= 8; i++) schedule(i * 50, () => response.write('x'));
      schedule(450, () => response.end('"}'));
    }, async endpoint => {
      const response = await fetchWithResponseDeadline(endpoint, {}, 200, () => new Error('owned deadline'));
      await expect(response.json()).rejects.toThrow('owned deadline');
    });
  });
});
