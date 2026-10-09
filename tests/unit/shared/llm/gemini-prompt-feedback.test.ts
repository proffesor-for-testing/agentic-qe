import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from '../../../../src/shared/llm/providers/gemini.js';

// Only persistence is isolated; the HTTP transport and provider parser are real.
vi.mock('../../../../src/learning/token-tracker.js', () => ({
  TokenMetricsCollector: { recordTokenUsage: vi.fn() },
}));

let server: Server;
let baseUrl: string;
let payload: Record<string, unknown>;
let requests: number;
beforeEach(async () => {
  requests = 0;
  server = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      requests++;
      const stream = request.url?.includes('streamGenerateContent');
      response.setHeader('Content-Type', stream ? 'text/event-stream' : 'application/json');
      response.end(stream ? `data: ${JSON.stringify(payload)}\n\n` : JSON.stringify(payload));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing owned server port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

async function generate(stream: boolean) {
  const provider = new GeminiProvider({ baseUrl, apiKey: 'owned-fixture', maxRetries: 1 });
  if (!stream) return provider.generate('ordinary fixture prompt');
  const iterator = provider.generateStream('ordinary fixture prompt');
  let text = '';
  for (;;) {
    const event = await iterator.next();
    if (event.done) {
      expect(event.value.content).toBe(text);
      return event.value;
    }
    text += event.value;
  }
}

const usageMetadata = { promptTokenCount: 2, candidatesTokenCount: 0, totalTokenCount: 2 };
for (const stream of [false, true]) {
  describe(stream ? 'streaming prompt feedback' : 'generation prompt feedback', () => {
    for (const blockReason of ['SAFETY', 'OTHER', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'IMAGE_SAFETY']) {
      it(`reports ${blockReason} with omitted candidates as content_filter`, async () => {
        payload = { promptFeedback: { blockReason }, usageMetadata };
        const response = await generate(stream);
        expect(response.finishReason).toBe('content_filter');
        expect(response.content).toBe('');
        expect(response.usage).toEqual({ promptTokens: 2, completionTokens: 0, totalTokens: 2 });
        expect(requests).toBe(1);
      });
    }
    it('reports blocked empty candidates as content_filter', async () => {
      payload = { candidates: [], promptFeedback: { blockReason: 'SAFETY' }, usageMetadata };
      expect((await generate(stream)).finishReason).toBe('content_filter');
    });
    it('preserves candidate safety termination', async () => {
      payload = { candidates: [{ content: { parts: [], role: 'model' }, finishReason: 'SAFETY' }], usageMetadata };
      expect((await generate(stream)).finishReason).toBe('content_filter');
    });
    it('preserves ordinary multi-part content with unspecified block feedback', async () => {
      payload = { candidates: [{ content: { parts: [{ text: 'first ' }, { text: 'second' }], role: 'model' }, finishReason: 'STOP' }], promptFeedback: { blockReason: 'BLOCK_REASON_UNSPECIFIED' }, usageMetadata };
      const response = await generate(stream);
      expect(response.finishReason).toBe('stop');
      expect(response.content).toBe('first second');
    });
    it('preserves an empty response without block feedback', async () => {
      payload = { candidates: [], promptFeedback: {}, usageMetadata };
      expect((await generate(stream)).finishReason).toBe('stop');
    });
  });
}
it.each([undefined, 'BLOCK_REASON_UNSPECIFIED'])('preserves missing candidates with %s feedback as an error', async blockReason => {
  payload = { promptFeedback: { blockReason }, usageMetadata };
  await expect(generate(false)).rejects.toMatchObject({ code: 'NETWORK_ERROR', retryable: true });
});
