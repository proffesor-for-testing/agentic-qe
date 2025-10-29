/**
 * Unit Tests - Embedding Generator
 *
 * Tests both hash-based and ML-based embedding generation,
 * caching, and batch processing.
 */

import { EmbeddingGenerator, EmbeddingOptions } from '@core/embeddings/EmbeddingGenerator';
import { EmbeddingCache } from '@core/embeddings/EmbeddingCache';

describe('EmbeddingGenerator', () => {
  let generator: EmbeddingGenerator;

  beforeEach(() => {
    generator = new EmbeddingGenerator(1000, false); // Don't auto-init ML
  });

  afterEach(() => {
    generator.clearCache();
  });

  describe('Hash-based Embeddings', () => {
    describe('generateTextEmbedding', () => {
      it('should generate hash-based text embedding', async () => {
        const result = await generator.generateTextEmbedding('hello world', {
          useML: false,
          dimension: 256
        });

        expect(result).toBeDefined();
        expect(result.embedding).toHaveLength(256);
        expect(result.dimension).toBe(256);
        expect(result.method).toBe('hash');
        expect(result.model).toBe('hash');
        expect(result.cached).toBe(false);
        expect(result.generationTime).toBeGreaterThanOrEqual(0);
      });

      it('should generate deterministic embeddings', async () => {
        const text = 'test text';
        const options: EmbeddingOptions = { useML: false, useCache: false, dimension: 128 };

        const result1 = await generator.generateTextEmbedding(text, options);
        const result2 = await generator.generateTextEmbedding(text, options);

        expect(result1.embedding).toEqual(result2.embedding);
      });

      it('should generate different embeddings for different texts', async () => {
        const options: EmbeddingOptions = { useML: false, dimension: 256 };

        const result1 = await generator.generateTextEmbedding('text one', options);
        const result2 = await generator.generateTextEmbedding('text two', options);

        expect(result1.embedding).not.toEqual(result2.embedding);
      });

      it('should normalize embeddings when requested', async () => {
        const result = await generator.generateTextEmbedding('test', {
          useML: false,
          normalize: true,
          dimension: 128
        });

        // Calculate magnitude
        const magnitude = Math.sqrt(
          result.embedding.reduce((sum, val) => sum + val * val, 0)
        );

        expect(magnitude).toBeCloseTo(1.0, 5);
      });

      it('should support custom dimensions', async () => {
        const dimensions = [64, 128, 256, 512];

        for (const dim of dimensions) {
          const result = await generator.generateTextEmbedding('test', {
            useML: false,
            dimension: dim,
            useCache: false // Prevent cache interference
          });

          expect(result.embedding).toHaveLength(dim);
          expect(result.dimension).toBe(dim);
        }
      });
    });

    describe('generateCodeEmbedding', () => {
      it('should generate hash-based code embedding', async () => {
        const code = 'function test() { return 42; }';
        const result = await generator.generateCodeEmbedding(code, 'typescript', {
          useML: false,
          dimension: 256
        });

        expect(result).toBeDefined();
        expect(result.embedding).toHaveLength(256);
        expect(result.method).toBe('hash');
        expect(result.model).toBe('hash');
      });

      it('should generate different embeddings for different languages', async () => {
        const code = 'function test() { return 42; }';
        const options: EmbeddingOptions = { useML: false, useCache: false, dimension: 256 };

        const tsResult = await generator.generateCodeEmbedding(code, 'typescript', options);
        const jsResult = await generator.generateCodeEmbedding(code, 'javascript', options);

        // Cache key includes language, so embeddings will be different due to key prefix
        // Check that at least some values differ
        const differences = tsResult.embedding.filter((val, idx) => val !== jsResult.embedding[idx]);
        expect(differences.length).toBeGreaterThan(0);
      });
    });

    describe('generateHashEmbedding', () => {
      it('should generate hash embedding directly', () => {
        const embedding = generator.generateHashEmbedding('test text', 256);

        expect(embedding).toHaveLength(256);
        expect(embedding.every(val => val >= -1 && val <= 1)).toBe(true);
      });

      it('should handle various text inputs', () => {
        const inputs = [
          '',
          'a',
          'short text',
          'A very long text that contains many words and characters to test hash distribution',
          '特殊字符 🚀',
          '{"json": "data"}',
          'code\nwith\nnewlines'
        ];

        for (const input of inputs) {
          const embedding = generator.generateHashEmbedding(input, 128);
          expect(embedding).toHaveLength(128);
        }
      });
    });
  });

  describe('Caching', () => {
    it('should cache text embeddings', async () => {
      const text = 'cached text';
      const options: EmbeddingOptions = { useML: false, useCache: true, dimension: 128 };

      const result1 = await generator.generateTextEmbedding(text, options);
      const result2 = await generator.generateTextEmbedding(text, options);

      expect(result1.cached).toBe(false);
      expect(result2.cached).toBe(true);
      expect(result1.embedding).toEqual(result2.embedding);
    });

    it('should cache code embeddings', async () => {
      const code = 'const x = 42;';
      const language = 'typescript';
      const options: EmbeddingOptions = { useML: false, useCache: true, dimension: 128 };

      const result1 = await generator.generateCodeEmbedding(code, language, options);
      const result2 = await generator.generateCodeEmbedding(code, language, options);

      expect(result1.cached).toBe(false);
      expect(result2.cached).toBe(true);
    });

    it('should respect useCache option', async () => {
      const text = 'test';

      await generator.generateTextEmbedding(text, { useML: false, useCache: true });
      const result = await generator.generateTextEmbedding(text, { useML: false, useCache: false });

      expect(result.cached).toBe(false);
    });

    it('should allow manual cache operations', async () => {
      const key = 'manual-key';
      const embedding = [0.1, 0.2, 0.3];

      generator.cacheEmbedding(key, embedding, 'text');

      const cached = generator.getCachedEmbedding(key, 'text');
      expect(cached).toEqual(embedding);
    });

    it('should clear cache', async () => {
      await generator.generateTextEmbedding('text1', { useML: false });
      await generator.generateCodeEmbedding('code1', 'ts', { useML: false });

      generator.clearCache('text');
      const stats = generator.getCacheStats();

      expect(stats.textCount).toBe(0);
      expect(stats.codeCount).toBeGreaterThan(0);
    });

    it('should provide cache statistics', async () => {
      await generator.generateTextEmbedding('test1', { useML: false });
      await generator.generateTextEmbedding('test2', { useML: false });
      await generator.generateCodeEmbedding('code1', 'ts', { useML: false });

      const stats = generator.getCacheStats();

      expect(stats.textCount).toBeGreaterThanOrEqual(2);
      expect(stats.codeCount).toBeGreaterThanOrEqual(1);
      expect(stats.totalCount).toBeGreaterThanOrEqual(3);
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });

  describe('Batch Processing', () => {
    it('should generate batch text embeddings', async () => {
      const texts = ['text1', 'text2', 'text3', 'text4', 'text5'];
      const result = await generator.generateBatchTextEmbeddings(texts, {
        useML: false,
        dimension: 128
      });

      expect(result.embeddings).toHaveLength(5);
      expect(result.method).toBe('hash');
      expect(result.totalTime).toBeGreaterThanOrEqual(0);
      expect(result.avgTime).toBeGreaterThanOrEqual(0);
      expect(result.cacheHits).toBe(0); // First run, no cache hits
    });

    it('should benefit from caching in batch operations', async () => {
      const texts = ['batch1', 'batch2', 'batch3'];
      const options: EmbeddingOptions = { useML: false, useCache: true, dimension: 128 };

      // First batch
      const result1 = await generator.generateBatchTextEmbeddings(texts, options);
      expect(result1.cacheHits).toBe(0);

      // Second batch (same texts)
      const result2 = await generator.generateBatchTextEmbeddings(texts, options);
      expect(result2.cacheHits).toBe(3);
    });

    it('should handle empty batch', async () => {
      const result = await generator.generateBatchTextEmbeddings([], {
        useML: false
      });

      expect(result.embeddings).toHaveLength(0);
      expect(result.avgTime).toBe(0);
    });

    it('should handle large batches', async () => {
      const texts = Array.from({ length: 100 }, (_, i) => `text-${i}`);
      const result = await generator.generateBatchTextEmbeddings(texts, {
        useML: false,
        dimension: 128
      });

      expect(result.embeddings).toHaveLength(100);
      expect(result.totalTime).toBeGreaterThan(0);
    });
  });

  describe('Model Information', () => {
    it('should provide model info', () => {
      const info = generator.getModelInfo();

      expect(info).toBeDefined();
      expect(info.textModel).toBe('Xenova/all-MiniLM-L6-v2');
      expect(info.codeModel).toBe('microsoft/codebert-base');
      expect(info.textDimension).toBe(384);
      expect(info.codeDimension).toBe(768);
      expect(info.hashDimension).toBe(256);
      expect(info.mlAvailable).toBe(false); // Not initialized
      expect(info.cacheSize).toBe(1000);
    });

    it('should report ML availability', () => {
      expect(generator.isMLAvailable()).toBe(false);
    });
  });

  describe('Performance', () => {
    it('should generate embeddings quickly (hash-based)', async () => {
      const start = Date.now();
      await generator.generateTextEmbedding('performance test', {
        useML: false,
        dimension: 256
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10); // Should be < 10ms
    });

    it('should handle concurrent requests', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        generator.generateTextEmbedding(`concurrent-${i}`, {
          useML: false,
          dimension: 128
        })
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
      expect(results.every(r => r.embedding.length === 128)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', async () => {
      const result = await generator.generateTextEmbedding('', {
        useML: false,
        dimension: 128
      });

      expect(result.embedding).toHaveLength(128);
    });

    it('should handle very long texts', async () => {
      const longText = 'a'.repeat(10000);
      const result = await generator.generateTextEmbedding(longText, {
        useML: false,
        dimension: 256
      });

      expect(result.embedding).toHaveLength(256);
    });

    it('should handle special characters', async () => {
      const texts = [
        '🚀 🎉 ✨',
        '中文字符',
        'עברית',
        '日本語',
        '<?xml version="1.0"?>',
        'SELECT * FROM users;'
      ];

      for (const text of texts) {
        const result = await generator.generateTextEmbedding(text, {
          useML: false,
          dimension: 128
        });
        expect(result.embedding).toHaveLength(128);
      }
    });
  });
});

describe('EmbeddingCache', () => {
  let cache: EmbeddingCache;

  beforeEach(() => {
    cache = new EmbeddingCache(100);
  });

  describe('Basic Operations', () => {
    it('should store and retrieve embeddings', () => {
      const embedding = [0.1, 0.2, 0.3];
      cache.set('key1', embedding, 'text');

      const retrieved = cache.get('key1', 'text');
      expect(retrieved).toEqual(embedding);
    });

    it('should return null for missing keys', () => {
      const result = cache.get('nonexistent', 'text');
      expect(result).toBeNull();
    });

    it('should handle separate namespaces', () => {
      const textEmb = [0.1, 0.2];
      const codeEmb = [0.3, 0.4];

      cache.set('key', textEmb, 'text');
      cache.set('key', codeEmb, 'code');

      expect(cache.get('key', 'text')).toEqual(textEmb);
      expect(cache.get('key', 'code')).toEqual(codeEmb);
    });

    it('should check key existence', () => {
      cache.set('exists', [0.1], 'text');

      expect(cache.has('exists', 'text')).toBe(true);
      expect(cache.has('notexists', 'text')).toBe(false);
    });

    it('should delete entries', () => {
      cache.set('delete-me', [0.1], 'text');
      expect(cache.has('delete-me', 'text')).toBe(true);

      cache.delete('delete-me', 'text');
      expect(cache.has('delete-me', 'text')).toBe(false);
    });
  });

  describe('LRU Eviction', () => {
    it('should evict least recently used when full', () => {
      const smallCache = new EmbeddingCache(3);

      smallCache.set('key1', [0.1], 'text');
      smallCache.set('key2', [0.2], 'text');
      smallCache.set('key3', [0.3], 'text');
      smallCache.set('key4', [0.4], 'text'); // Should evict key1

      expect(smallCache.has('key1', 'text')).toBe(false);
      expect(smallCache.has('key2', 'text')).toBe(true);
      expect(smallCache.has('key3', 'text')).toBe(true);
      expect(smallCache.has('key4', 'text')).toBe(true);
    });

    it('should update LRU on access', () => {
      const smallCache = new EmbeddingCache(3);

      smallCache.set('key1', [0.1], 'text');
      smallCache.set('key2', [0.2], 'text');
      smallCache.set('key3', [0.3], 'text');

      // Access key1 to make it recently used
      smallCache.get('key1', 'text');

      // Add new entry - should evict key2 instead of key1
      smallCache.set('key4', [0.4], 'text');

      expect(smallCache.has('key1', 'text')).toBe(true);
      expect(smallCache.has('key2', 'text')).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should track cache hits and misses', () => {
      cache.set('key1', [0.1], 'text');

      cache.get('key1', 'text'); // Hit
      cache.get('key2', 'text'); // Miss
      cache.get('key1', 'text'); // Hit

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(66.67, 1);
    });

    it('should calculate memory usage', () => {
      cache.set('key1', [0.1, 0.2, 0.3], 'text');
      cache.set('key2', [0.4, 0.5, 0.6], 'text');

      const stats = cache.getStats();
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });

    it('should track most accessed entries', () => {
      cache.set('popular', [0.1], 'text');
      cache.set('rare', [0.2], 'text');

      // Access popular multiple times
      for (let i = 0; i < 5; i++) {
        cache.get('popular', 'text');
      }
      cache.get('rare', 'text');

      const mostAccessed = cache.getMostAccessed('text', 2);
      expect(mostAccessed[0][0]).toBe('popular');
      expect(mostAccessed[0][1]).toBe(5);
    });

    it('should reset statistics', () => {
      cache.set('key', [0.1], 'text');
      cache.get('key', 'text');

      cache.resetStats();
      const stats = cache.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('Optimization', () => {
    it('should optimize by removing low-access entries', () => {
      cache.set('frequent', [0.1], 'text');
      cache.set('rare1', [0.2], 'text');
      cache.set('rare2', [0.3], 'text');

      // Access frequent multiple times
      for (let i = 0; i < 5; i++) {
        cache.get('frequent', 'text');
      }

      const removed = cache.optimize(2, 'text');
      expect(removed).toBe(2); // rare1 and rare2
      expect(cache.has('frequent', 'text')).toBe(true);
      expect(cache.has('rare1', 'text')).toBe(false);
    });
  });

  describe('Clear Operations', () => {
    it('should clear specific namespace', () => {
      cache.set('text1', [0.1], 'text');
      cache.set('code1', [0.2], 'code');

      cache.clear('text');

      expect(cache.has('text1', 'text')).toBe(false);
      expect(cache.has('code1', 'code')).toBe(true);
    });

    it('should clear all namespaces', () => {
      cache.set('text1', [0.1], 'text');
      cache.set('code1', [0.2], 'code');

      cache.clear('all');

      expect(cache.has('text1', 'text')).toBe(false);
      expect(cache.has('code1', 'code')).toBe(false);
    });
  });
});
