import { describe, expect, it } from 'vitest';
import { EmbeddingCache } from '../../../src/shared/embeddings/embedding-cache.js';

describe('Embedding cache model/content identity', () => {
  it('keeps delimiter-containing model and content tuples distinct through persistence', () => {
    const cache = new EmbeddingCache();
    cache.set('hello', 'model:variant', [1, 2]);
    expect(cache.has('variant:hello', 'model')).toBe(false);
    expect(cache.get('variant:hello', 'model')).toBeNull();
    cache.set('variant:hello', 'model', [9, 8]);
    expect(cache.get('hello', 'model:variant')).toEqual([1, 2]);
    expect(cache.get('variant:hello', 'model')).toEqual([9, 8]);
    const restored = new EmbeddingCache();
    restored.import(cache.export());
    expect(restored.get('hello', 'model:variant')).toEqual([1, 2]);
    expect(restored.get('variant:hello', 'model')).toEqual([9, 8]);
  });
});
