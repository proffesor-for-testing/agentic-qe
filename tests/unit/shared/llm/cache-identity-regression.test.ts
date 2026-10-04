import { describe, it, expect } from 'vitest';
import type { LLMResponse } from '../../../../src/shared/llm/interfaces.js';
import {
  LLMCache,
  LLMResponseCache,
} from '../../../../src/shared/llm/cache.js';
describe('response cache identity isolation', () => {
  it('does not replay the response for a known 32-bit hash collision', () => {
    const cache = new LLMResponseCache();
    const response: LLMResponse = {
      content: 'only Aa',
      model: 'test',
      provider: 'openai',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      cost: { inputCost: 0, outputCost: 0, totalCost: 0, currency: 'USD' },
      latencyMs: 1,
      finishReason: 'stop',
      cached: false,
      requestId: 'request-a',
    };
    cache.setGeneration('Aa', response);
    expect(cache.getGeneration('BB')).toBeUndefined();
    expect(cache.getGeneration('Aa')).toBe(response);
  });
  it('separates delimiter characters in prompts and system instructions', () => {
    expect(
      LLMCache.generateKey('generation', 'b|c', { systemPrompt: 'a' }),
    ).not.toBe(
      LLMCache.generateKey('generation', 'c', { systemPrompt: 'a|b' }),
    );
  });
  it('retains identical option/default identities and separates models', () => {
    expect(LLMCache.generateKey('generation', 'hello')).toBe(
      LLMCache.generateKey('generation', 'hello', {
        temperature: 0.7,
        maxTokens: 0,
      }),
    );
    expect(LLMCache.generateKey('embedding', 'hello', { model: 'a' })).not.toBe(
      LLMCache.generateKey('embedding', 'hello', { model: 'b' }),
    );
  });
});
