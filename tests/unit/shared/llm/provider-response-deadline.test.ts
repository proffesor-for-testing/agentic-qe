import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { Socket } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AzureOpenAIProvider } from '../../../../src/shared/llm/providers/azure-openai.js';
import { BedrockProvider } from '../../../../src/shared/llm/providers/bedrock.js';
import { ClaudeProvider } from '../../../../src/shared/llm/providers/claude.js';
import { CognitumProvider } from '../../../../src/shared/llm/providers/cognitum.js';
import { GeminiProvider } from '../../../../src/shared/llm/providers/gemini.js';
import { OpenAIProvider } from '../../../../src/shared/llm/providers/openai.js';
import { OpenRouterProvider } from '../../../../src/shared/llm/providers/openrouter.js';
import { OllamaProvider } from '../../../../src/shared/llm/providers/ollama.js';
import { fetchWithResponseDeadline } from '../../../../src/shared/llm/providers/response-deadline.js';

// Only token persistence is isolated; transport and provider parsing are real.
vi.mock('../../../../src/learning/token-tracker.js', () => ({
  TokenMetricsCollector: { recordTokenUsage: vi.fn() },
}));

afterEach(() => vi.restoreAllMocks());

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function withEndpoint(
  reply: (response: ServerResponse) => void,
  run: (endpoint: string, requestSeen: Promise<void>) => Promise<void>,
): Promise<void> {
  let received!: () => void;
  const requestSeen = new Promise<void>(resolve => { received = resolve; });
  const sockets = new Set<Socket>();
  const server = createServer((_request, response) => {
    reply(response);
    received();
  });
  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No fixture port');
  try {
    await run(`http://127.0.0.1:${address.port}`, requestSeen);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

describe('provider response deadlines over native HTTP', () => {
  it.each(['generate', 'embed'] as const)('bounds %s after headers while JSON is incomplete', async method => {
    let outcome: Promise<void> | undefined;
    try {
      await withEndpoint(response => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.write('{"id":');
      }, async (endpoint, requestSeen) => {
        const provider = new AzureOpenAIProvider({
          endpoint, deploymentId: 'owned-fixture', apiKey: 'synthetic-fixture-key',
          timeoutMs: 100, maxRetries: 1,
        });
        let failure: unknown;
        let settled = false;
        outcome = provider[method]('owned fixture').then(
          () => { settled = true; },
          error => { settled = true; failure = error; },
        );
        await requestSeen;
        await delay(400);
        expect(settled).toBe(true);
        expect(failure).toMatchObject({ code: 'TIMEOUT', provider: 'azure-openai' });
      });
    } finally {
      // Socket teardown also settles the intentionally hanging baseline.
      await outcome;
    }
  });

  const providers = {
    bedrock: (baseUrl: string) => new BedrockProvider({ baseUrl, accessKeyId: 'owned-key', secretAccessKey: 'owned-secret', model: 'owned', timeoutMs: 100, maxRetries: 1 }),
    claude: (baseUrl: string) => new ClaudeProvider({ baseUrl, apiKey: 'owned-key', timeoutMs: 100, maxRetries: 1 }),
    cognitum: (baseUrl: string) => new CognitumProvider({ baseUrl, apiKey: 'owned-key', timeoutMs: 100, maxRetries: 1 }),
    gemini: (baseUrl: string) => new GeminiProvider({ baseUrl, apiKey: 'owned-key', timeoutMs: 100, maxRetries: 1 }),
    openai: (baseUrl: string) => new OpenAIProvider({ baseUrl, apiKey: 'owned-key', timeoutMs: 100, maxRetries: 1 }),
    openrouter: (baseUrl: string) => new OpenRouterProvider({ baseUrl, apiKey: 'owned-key', timeoutMs: 100, maxRetries: 1 }),
    ollama: (baseUrl: string) => new OllamaProvider({ baseUrl, timeoutMs: 100, maxRetries: 1 }),
  };
  it.each(Object.entries(providers))('bounds %s generation body reads with provider classification', async (name, create) => {
    let outcome: Promise<void> | undefined;
    try {
      await withEndpoint(response => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.write('{"id":');
      }, async (endpoint, requestSeen) => {
        let settled = false;
        let failure: unknown;
        outcome = create(endpoint).generate('owned fixture').then(
          () => { settled = true; },
          error => { settled = true; failure = error; },
        );
        await requestSeen;
        await delay(400);
        expect(settled).toBe(true);
        expect(failure).toMatchObject({ code: 'TIMEOUT', provider: name });
      });
    } finally {
      await outcome;
    }
  });

  it('still returns a complete Azure response', async () => {
    await withEndpoint(response => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ id: 'owned', model: 'gpt-4o', choices: [{ message: { content: 'owned reply' }, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } }));
    }, async endpoint => {
      const provider = new AzureOpenAIProvider({ endpoint, deploymentId: 'owned', apiKey: 'owned-key', timeoutMs: 500, maxRetries: 1 });
      expect(await provider.generate('owned fixture')).toMatchObject({ content: 'owned reply', provider: 'azure-openai', usage: { totalTokens: 5 } });
    });
  });

  it.each(['gemini', 'openrouter'] as const)('delivers the first %s stream event before bounding a stalled body', async name => {
    let reader: AsyncGenerator<string, unknown> | undefined;
    try {
      await withEndpoint(response => {
        response.setHeader('content-type', 'text/event-stream');
        const event = name === 'gemini'
          ? { candidates: [{ content: { parts: [{ text: 'owned event' }] } }] }
          : { choices: [{ delta: { content: 'owned event' } }] };
        response.write(`data: ${JSON.stringify(event)}\n\n`);
      }, async endpoint => {
        reader = providers[name](endpoint).generateStream('owned fixture');
        expect(await reader.next()).toMatchObject({ done: false, value: 'owned event' });
        await expect(reader.next()).rejects.toMatchObject({ code: 'TIMEOUT', provider: name });
      });
    } finally {
      await reader?.return(undefined);
    }
  });

  it.each(['gemini', 'openrouter'] as const)('cancels the %s request when its consumer returns early', async name => {
    const nativeFetch = globalThis.fetch;
    let signal: AbortSignal | null | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation((url, options) => {
      signal = options?.signal;
      return nativeFetch(url, options);
    });
    await withEndpoint(response => {
      response.setHeader('content-type', 'text/event-stream');
      const event = name === 'gemini'
        ? { candidates: [{ content: { parts: [{ text: 'owned event' }] } }] }
        : { choices: [{ delta: { content: 'owned event' } }] };
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    }, async endpoint => {
      const reader = providers[name](endpoint).generateStream('owned fixture');
      try {
        expect(await reader.next()).toMatchObject({ done: false, value: 'owned event' });
      } finally {
        await reader.return(undefined as never);
      }
      await delay(150);
      expect(signal?.aborted).toBe(false);
    });
  });

  it.each(['json', 'empty'] as const)('releases a completed %s response deadline and preserves metadata', async kind => {
    const timeout = vi.fn(() => new Error('owned deadline'));
    await withEndpoint(response => {
      response.statusCode = kind === 'empty' ? 204 : 200;
      response.setHeader('x-owned', 'retained');
      response.end(kind === 'empty' ? undefined : '{"owned":true}');
    }, async endpoint => {
      const response = await fetchWithResponseDeadline(endpoint, {}, 100, timeout);
      expect(response.url).toBe(`${endpoint}/`);
      expect(response.headers.get('x-owned')).toBe('retained');
      if (kind === 'json') expect(await response.json()).toEqual({ owned: true });
      else expect(response.body).toBeNull();
      await delay(150);
      expect(timeout).not.toHaveBeenCalled();
    });
  });

  it('retains the deadline while waiting for response headers', async () => {
    await withEndpoint(() => {}, async endpoint => {
      await expect(fetchWithResponseDeadline(endpoint, {}, 100, () => new Error('owned deadline'))).rejects.toThrow('owned deadline');
    });
  });
});
