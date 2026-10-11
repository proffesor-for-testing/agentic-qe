import { afterEach, describe, expect, it } from 'vitest';
import { LLMResponseCache } from '../../../../src/shared/llm/cache';
import { ProviderManager } from '../../../../src/shared/llm/provider-manager';
import { registerProvider, resetProviderRegistry } from '../../../../src/shared/llm/provider-registry';
import { InMemorySpendLedger } from '../../../../src/shared/llm/spend-ledger';
import { CostTracker } from '../../../../src/shared/llm/cost-tracker';
import type { LLMProvider, LLMResponse } from '../../../../src/shared/llm/interfaces';

const host = 'owned-filter-fixture';
function response(reason: LLMResponse['finishReason'], content = ''): LLMResponse {
  return { content, finishReason: reason, provider: host, model: 'owned-free-model',
    usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 },
    cost: { inputCost: 0, outputCost: 0, totalCost: 0, currency: 'USD' },
    latencyMs: 1, cached: false, requestId: 'owned-response' };
}
afterEach(() => resetProviderRegistry());

describe('content-filter response caching', () => {
  it('does not retain a provider safety refusal in the public generation cache', () => {
    const cache = new LLMResponseCache();
    cache.setGeneration('prompt', response('content_filter'));
    expect(cache.getGeneration('prompt')).toBeUndefined();
    expect(cache.getStats().generation.size).toBe(0);
  });

  it('dispatches again after a filtered result, then caches a successful response', async () => {
    let calls = 0;
    const provider = {
      type: host, name: 'Owned fixture', billingMode: 'subscription',
      isAvailable: async () => true, getConfig: () => ({}),
      healthCheck: async () => ({ healthy: true, latencyMs: 1, provider: host }),
      complete: async () => { throw new Error('Unused fixture method'); },
      getSupportedModels: () => ['owned-free-model'],
      getCostPerToken: () => ({ input: 0, output: 0 }),
      generate: async () => ++calls === 1 ? response('content_filter') : response('stop', 'accepted'),
      dispose: async () => {},
    } as unknown as LLMProvider;
    registerProvider(host, () => provider, { billingMode: 'subscription', displayName: 'Owned fixture', source: 'config', sourceDetail: 'test fixture' });
    const tracker = new CostTracker();
    const manager = new ProviderManager({ primary: host, fallbacks: [], global: { enableCostTracking: true } },
      { spendLedger: new InMemorySpendLedger(), costTracker: tracker });
    try {
      expect((await manager.generate('prompt')).finishReason).toBe('content_filter');
      const accepted = await manager.generate('prompt');
      expect(accepted.content).toBe('accepted');
      expect(accepted.cached).toBe(false);
      expect((await manager.generate('prompt')).cached).toBe(true);
      expect(calls).toBe(2);
    } finally { await manager.dispose(); tracker.dispose(); }
  });

  it('preserves legitimate empty successful responses and ordinary successful hits', () => {
    const cache = new LLMResponseCache();
    for (const content of ['', 'accepted']) {
      const key = `control:${content}`;
      cache.setGeneration(key, response('stop', content));
      expect(cache.getGeneration(key)?.content).toBe(content);
    }
    expect(cache.getStats().generation.size).toBe(2);
  });

  it('keeps disabled generation caching disabled', () => {
    const cache = new LLMResponseCache({ cacheGenerations: false });
    cache.setGeneration('prompt', response('stop', 'accepted'));
    expect(cache.getGeneration('prompt')).toBeUndefined();
  });
});
