/** #912: empty completion results must not pin a Gemini refusal in the cache. */
import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LLMResponseCache } from '../../../../src/shared/llm/cache';
import { ProviderManager } from '../../../../src/shared/llm/provider-manager';
import { InMemorySpendLedger } from '../../../../src/shared/llm/spend-ledger';
import { CostTracker } from '../../../../src/shared/llm/cost-tracker';
import type { CompletionResponse } from '../../../../src/shared/llm/interfaces';

vi.mock('../../../../src/learning/token-tracker.js', () => ({
  TokenMetricsCollector: { recordTokenUsage: vi.fn() },
}));

const response = (completion: string): CompletionResponse => ({
  completion, model: 'owned-model', provider: 'gemini',
  usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 }, latencyMs: 1, cached: false,
});

describe('empty completion cache admission', () => {
  it('does not store an empty completion under the public cache API', () => {
    const cache = new LLMResponseCache();
    cache.setCompletion('prompt', response(''));
    expect(cache.getCompletion('prompt')).toBeUndefined();
    expect(cache.getStats().completion.size).toBe(0);
  });

  it.each(['accepted', ' '])('keeps nonempty completion %j cacheable', (completion) => {
    const cache = new LLMResponseCache();
    cache.setCompletion('prompt', response(completion));
    expect(cache.getCompletion('prompt')?.completion).toBe(completion);
  });

  it('respects disabled completion caching', () => {
    const cache = new LLMResponseCache({ cacheCompletions: false });
    cache.setCompletion('prompt', response('accepted'));
    expect(cache.getCompletion('prompt')).toBeUndefined();
  });
});

describe('ProviderManager.complete with real Gemini HTTP transport', () => {
  let server: Server;
  let manager: ProviderManager;
  let tracker: CostTracker;
  let baseUrl: string;
  let calls: number;
  let payload: Record<string, unknown>;
  beforeEach(async () => {
    calls = 0;
    server = createServer((request, reply) => {
      request.resume();
      request.on('end', () => {
        reply.setHeader('Content-Type', 'application/json');
        if (request.method === 'GET') {
          reply.end(JSON.stringify({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] }));
        } else {
          calls++;
          reply.end(JSON.stringify(payload));
        }
      });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing owned HTTP server port');
    baseUrl = `http://127.0.0.1:${address.port}`;
    tracker = new CostTracker();
    manager = new ProviderManager({ primary: 'gemini', fallbacks: [], providers: {
      gemini: { baseUrl, model: 'gemini-2.5-flash', apiKey: 'owned-fixture', maxRetries: 1 },
    } }, { spendLedger: new InMemorySpendLedger(), costTracker: tracker });
  });
  afterEach(async () => {
    await manager?.dispose();
    tracker?.dispose();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  it('preserves skipCache requests without populating or reading the cache', async () => {
    payload = { candidates: [{ content: { parts: [{ text: 'accepted' }], role: 'model' }, finishReason: 'STOP' }] };
    await manager.complete('owned skip-cache prompt', { skipCache: true });
    await manager.complete('owned skip-cache prompt', { skipCache: true });
    expect(calls).toBe(2);
    expect((await manager.complete('owned skip-cache prompt')).cached).toBe(false);
    expect((await manager.complete('owned skip-cache prompt')).cached).toBe(true);
    expect(calls).toBe(3);
  });

  it.each(['prompt', 'candidate'])('dispatches each %s refusal again, then caches a later nonempty completion', async (blockedAt) => {
    payload = blockedAt === 'prompt'
      ? { promptFeedback: { blockReason: 'SAFETY' } }
      : { candidates: [{ content: { parts: [], role: 'model' }, finishReason: 'SAFETY' }] };
    const first = await manager.complete('ordinary owned fixture prompt');
    const second = await manager.complete('ordinary owned fixture prompt');
    expect(first.completion).toBe('');
    expect(first.cached).toBe(false);
    expect(second.completion).toBe('');
    expect(second.cached).toBe(false);
    expect(calls).toBe(2);
    payload = { candidates: [{ content: { parts: [{ text: 'accepted' }], role: 'model' }, finishReason: 'STOP' }] };
    const third = await manager.complete('ordinary owned fixture prompt');
    expect(third.completion).toBe('accepted');
    expect(third.cached).toBe(false);
    expect((await manager.complete('ordinary owned fixture prompt')).cached).toBe(true);
    expect(calls).toBe(3);
  });
});
