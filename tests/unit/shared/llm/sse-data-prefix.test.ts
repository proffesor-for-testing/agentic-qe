import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from '../../../../src/shared/llm/providers/gemini.js';
import { OpenRouterProvider } from '../../../../src/shared/llm/providers/openrouter.js';

// Isolate token persistence; provider transport and response parsing remain real.
vi.mock('../../../../src/learning/token-tracker.js', () => ({
  TokenMetricsCollector: { recordTokenUsage: vi.fn() },
}));

let server: Server;
let baseUrl: string;
let body: string;
beforeEach(async () => {
  server = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      response.setHeader('Content-Type', 'text/event-stream');
      response.write(body.slice(0, 3));
      setTimeout(() => response.end(body.slice(3)), 5);
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

for (const kind of ['gemini', 'openrouter'] as const) {
  describe(`${kind} SSE data fields`, () => {
    for (const prefix of ['data:', 'data: ', 'data:  ']) {
      it(`accepts ${JSON.stringify(prefix)} across transport chunks`, async () => {
        const response = kind === 'gemini'
          ? { candidates: [{ content: { parts: [{ text: 'owned streamed text' }], role: 'model' }, finishReason: 'MAX_TOKENS' }], usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3, totalTokenCount: 5 } }
          : { model: 'owned-response-model', choices: [{ index: 0, delta: { content: 'owned streamed text' }, finish_reason: 'length' }] };
        body = `: keepalive\n\nevent: message\n${prefix}${JSON.stringify(response)}\n\n${prefix}[DONE]\n\n`;
        const config = { baseUrl, apiKey: 'owned-not-a-secret' };
        const provider = kind === 'gemini' ? new GeminiProvider(config) : new OpenRouterProvider(config);
        const iterator = provider.generateStream('owned prompt');
        let text = '';
        for (;;) {
          const event = await iterator.next();
          if (event.done) {
            expect(text).toBe('owned streamed text');
            expect(event.value.content).toBe(text);
            expect(event.value.finishReason).toBe('length');
            if (kind === 'gemini') expect(event.value.usage.totalTokens).toBe(5);
            else expect(event.value.model).toBe('owned-response-model');
            break;
          }
          text += event.value;
        }
      });
    }
  });
}
