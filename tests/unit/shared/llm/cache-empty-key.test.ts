import { describe, expect, it } from 'vitest';
import { LLMCache } from '../../../../src/shared/llm/cache.js';

describe('LLM cache eviction of empty keys', () => {
  it.each([true, false])('retains the capacity bound with enableLRU=%s', enableLRU => {
    const cache = new LLMCache<string>({ maxSize: 1, enableLRU });
    cache.set('', 'old');
    cache.set('new', 'new value');
    expect(cache.get('')).toBeUndefined();
    expect(cache.get('new')).toBe('new value');
    expect(cache.getStats().size).toBe(1);
    expect(cache.getStats().evictions).toBe(1);
  });
});
