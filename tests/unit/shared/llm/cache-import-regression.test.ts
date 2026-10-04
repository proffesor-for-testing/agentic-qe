import { describe, it, expect } from 'vitest';
import { LLMCache } from '../../../../src/shared/llm/cache.js';
describe('imported LRU access order', () => {
  it('keeps capacity bounded after importing an existing key repeatedly', () => {
    const cache = new LLMCache<string>({ maxSize: 2 });
    cache.set('a', 'a');
    const rows = cache.entries();
    cache.import(rows);
    cache.import(rows);
    cache.set('b', 'b');
    cache.set('c', 'c');
    cache.set('d', 'd');
    expect(cache.keys()).toEqual(['c', 'd']);
    expect(cache.getStats().size).toBe(2);
  });
  it('treats an imported replacement as most recently used', () => {
    const source = new LLMCache<string>();
    source.set('a', 'new');
    const cache = new LLMCache<string>({ maxSize: 2 });
    cache.set('a', 'old');
    cache.set('b', 'b');
    cache.import(source.entries());
    cache.set('c', 'c');
    expect(cache.get('a')).toBe('new');
    expect(cache.get('b')).toBeUndefined();
  });
  it('retains FIFO eviction when LRU is disabled', () => {
    const source = new LLMCache<string>();
    source.set('a', 'a');
    const cache = new LLMCache<string>({ maxSize: 2, enableLRU: false });
    cache.import(source.entries());
    cache.set('b', 'b');
    cache.set('c', 'c');
    expect(cache.keys()).toEqual(['b', 'c']);
  });
});
