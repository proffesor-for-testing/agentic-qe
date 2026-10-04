import { describe, it, expect } from 'vitest';
import { EmbeddingCache } from '../../../src/shared/embeddings/embedding-cache.js';
describe('embedding cache vector ownership', () => {
  it('does not change stored vectors when a producer reuses its output buffer', () => {
    const cache = new EmbeddingCache();
    const vector = [1, 2, 3];
    cache.set('text', 'model', vector);
    vector[0] = 999;
    expect(cache.get('text', 'model')).toEqual([1, 2, 3]);
  });
  it('returns snapshots that callers can normalize without changing future hits', () => {
    const cache = new EmbeddingCache();
    cache.set('text', 'model', [1, 2, 3]);
    cache.get('text', 'model')![0] = 999;
    expect(cache.get('text', 'model')).toEqual([1, 2, 3]);
  });
  it('isolates exported and imported persistence snapshots', () => {
    const cache = new EmbeddingCache();
    cache.set('text', 'model', [1, 2, 3]);
    const rows = cache.export();
    rows[0].entry.embedding[0] = 999;
    expect(cache.get('text', 'model')).toEqual([1, 2, 3]);
    const imported = new EmbeddingCache();
    imported.import(rows);
    rows[0].entry.embedding[1] = 999;
    expect(imported.get('text', 'model')).toEqual([999, 2, 3]);
  });
});
