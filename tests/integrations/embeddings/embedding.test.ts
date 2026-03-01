/**
 * Tests for unified embedding infrastructure
 *
 * Per ADR-040: Code deduplication strategy between QE and claude-flow.
 *
 * Tests focus on:
 * - Embedding cache with persistent storage (passes without model)
 * - HNSW indexing infrastructure
 * - Type system and exports
 * - Factory pattern
 *
 * Note: Model-dependent tests are skipped as they require the actual
 * transformers model which is slow to load in tests. In production,
 * the ONNX runtime provides 75x faster embeddings.
 *
 * @module tests/integrations/embeddings
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  EmbeddingCache,
  HNSWEmbeddingIndex,
  EmbeddingFactory,
  type IEmbedding,
  type EmbeddingNamespace,
  PERFORMANCE_TARGETS,
} from '../../../src/integrations/embeddings/index.js';

describe('Unified Embedding Infrastructure', () => {
  describe('EmbeddingCache', () => {
    let cache: EmbeddingCache;

    beforeEach(() => {
      cache = new EmbeddingCache({
        maxSize: 100,
        persistent: false, // Disable persistent storage for tests
      });
    });

    afterEach(() => {
      cache.close();
    });

    it('should store and retrieve embeddings', () => {
      const embedding: IEmbedding = {
        vector: [1, 2, 3, 4],
        dimension: 4,
        namespace: 'test',
        text: 'test',
        timestamp: Date.now(),
        quantization: 'none',
      };

      cache.set('key1', embedding, 'test');
      const retrieved = cache.get('key1', 'test');

      expect(retrieved).toBeDefined();
      expect(retrieved?.text).toBe('test');
    });

    it('should support namespace separation', () => {
      const embedding1: IEmbedding = {
        vector: [1, 2, 3],
        dimension: 3,
        namespace: 'text',
        text: 'text',
        timestamp: Date.now(),
        quantization: 'none',
      };

      const embedding2: IEmbedding = {
        vector: [4, 5, 6],
        dimension: 3,
        namespace: 'code',
        text: 'code',
        timestamp: Date.now(),
        quantization: 'none',
      };

      cache.set('key', embedding1, 'text');
      cache.set('key', embedding2, 'code');

      expect(cache.get('key', 'text')?.text).toBe('text');
      expect(cache.get('key', 'code')?.text).toBe('code');
    });

    it('should evict LRU entries when full', () => {
      const cache = new EmbeddingCache({
        maxSize: 3,
        persistent: false,
      });

      // Add 3 entries to fill the cache
      cache.set('key0', {
        vector: [0],
        dimension: 1,
        namespace: 'test',
        text: 'test0',
        timestamp: Date.now(),
        quantization: 'none',
      }, 'test');

      cache.set('key1', {
        vector: [1],
        dimension: 1,
        namespace: 'test',
        text: 'test1',
        timestamp: Date.now(),
        quantization: 'none',
      }, 'test');

      cache.set('key2', {
        vector: [2],
        dimension: 1,
        namespace: 'test',
        text: 'test2',
        timestamp: Date.now(),
        quantization: 'none',
      }, 'test');

      // Cache is now full with 3 entries

      // Add a 4th entry - should evict one entry
      cache.set('key3', {
        vector: [3],
        dimension: 1,
        namespace: 'test',
        text: 'test3',
        timestamp: Date.now(),
        quantization: 'none',
      }, 'test');

      // Cache should still have exactly 3 entries (maxSize)
      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(3);

      // key3 should definitely be present (just added)
      expect(cache.has('key3', 'test')).toBe(true);

      // At least one of the original keys should have been evicted
      const originalKeysPresent = [
        cache.has('key0', 'test'),
        cache.has('key1', 'test'),
        cache.has('key2', 'test'),
      ].filter(Boolean).length;

      expect(originalKeysPresent).toBeLessThan(3); // At least one was evicted
      expect(originalKeysPresent).toBeGreaterThanOrEqual(2); // At least 2 remain
    });

    it('should return statistics', () => {
      const embedding: IEmbedding = {
        vector: [1, 2, 3],
        dimension: 3,
        namespace: 'test',
        text: 'test',
        timestamp: Date.now(),
        quantization: 'none',
      };

      cache.set('key1', embedding, 'test');
      const stats = cache.getStats();

      expect(stats.totalEntries).toBe(1);
      expect(stats.entriesByNamespace.test).toBe(1);
    });

    it('should get most accessed entries', () => {
      const embedding: IEmbedding = {
        vector: [1, 2, 3],
        dimension: 3,
        namespace: 'test',
        text: 'test',
        timestamp: Date.now(),
        quantization: 'none',
      };

      cache.set('key1', embedding, 'test');
      cache.set('key2', embedding, 'test');

      // Access key1 more times
      cache.get('key1', 'test');
      cache.get('key1', 'test');
      cache.get('key2', 'test');

      const mostAccessed = cache.getMostAccessed('test', 5);

      expect(mostAccessed[0].key).toBe('key1');
      expect(mostAccessed[0].accessCount).toBe(3); // 1 set + 2 get
    });

    it('should optimize cache by removing least used entries', () => {
      const cache = new EmbeddingCache({
        maxSize: 10,
        persistent: false,
      });

      // Add entries with different access patterns
      for (let i = 0; i < 5; i++) {
        const embedding: IEmbedding = {
          vector: [i],
          dimension: 1,
          namespace: 'test',
          text: `test${i}`,
          timestamp: Date.now(),
          quantization: 'none',
        };
        cache.set(`key${i}`, embedding, 'test');

        // Access only first 3 entries
        if (i < 3) {
          cache.get(`key${i}`, 'test');
          cache.get(`key${i}`, 'test');
        }
      }

      const removed = cache.optimize(2, 'test'); // Remove entries with < 2 accesses

      expect(removed).toBe(2); // key3 and key4 should be removed
      expect(cache.has('key0', 'test')).toBe(true);
      expect(cache.has('key1', 'test')).toBe(true);
      expect(cache.has('key2', 'test')).toBe(true);
      expect(cache.has('key3', 'test')).toBe(false);
      expect(cache.has('key4', 'test')).toBe(false);
    });
  });

  describe('HNSWEmbeddingIndex', () => {
    let index: HNSWEmbeddingIndex;

    beforeEach(() => {
      index = new HNSWEmbeddingIndex({
        dimension: 4,
        M: 16,
        efConstruction: 200,
      });
    });

    afterEach(() => {
      index.clearAll();
    });

    it('should initialize index for namespace', () => {
      index.initializeIndex('test');
      expect(index.isInitialized('test')).toBe(true);
    });

    it('should support multiple namespaces', () => {
      index.initializeIndex('text');
      index.initializeIndex('code');

      expect(index.getInitializedNamespaces()).toHaveLength(2);
    });

    it('should add and search embeddings', () => {
      index.initializeIndex('test');

      const embedding1: IEmbedding = {
        vector: [1, 0, 0, 0],
        dimension: 4,
        namespace: 'test',
        text: 'test1',
        timestamp: Date.now(),
        quantization: 'none',
      };

      const embedding2: IEmbedding = {
        vector: [0, 1, 0, 0],
        dimension: 4,
        namespace: 'test',
        text: 'test2',
        timestamp: Date.now(),
        quantization: 'none',
      };

      index.addEmbedding(embedding1, 0);
      index.addEmbedding(embedding2, 1);

      const query: IEmbedding = {
        vector: [0.9, 0, 0, 0],
        dimension: 4,
        namespace: 'test',
        text: 'query',
        timestamp: Date.now(),
        quantization: 'none',
      };

      const results = index.search(query, { limit: 2 });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should add embeddings in batch', () => {
      index.initializeIndex('test');

      const embeddings: Array<{ embedding: IEmbedding; id: number }> = [
        {
          embedding: {
            vector: [1, 0, 0, 0],
            dimension: 4,
            namespace: 'test',
            text: 'test1',
            timestamp: Date.now(),
            quantization: 'none',
          },
          id: 0,
        },
        {
          embedding: {
            vector: [0, 1, 0, 0],
            dimension: 4,
            namespace: 'test',
            text: 'test2',
            timestamp: Date.now(),
            quantization: 'none',
          },
          id: 1,
        },
      ];

      index.addEmbeddingsBatch(embeddings);

      const stats = index.getIndexStats('test');
      expect(stats).toBeDefined();
      expect(stats!.size).toBe(2);
    });

    it('should get index statistics', () => {
      index.initializeIndex('test');

      const embedding: IEmbedding = {
        vector: [1, 2, 3, 4],
        dimension: 4,
        namespace: 'test',
        text: 'test',
        timestamp: Date.now(),
        quantization: 'none',
      };

      index.addEmbedding(embedding, 0);

      const stats = index.getIndexStats('test');
      expect(stats).toBeDefined();
      expect(stats!.dimension).toBe(4);
      expect(stats!.metric).toBe('cosine');
    });

    it('should clear index for namespace', () => {
      index.initializeIndex('test');

      const embedding: IEmbedding = {
        vector: [1, 2, 3, 4],
        dimension: 4,
        namespace: 'test',
        text: 'test',
        timestamp: Date.now(),
        quantization: 'none',
      };

      index.addEmbedding(embedding, 0);
      index.clearIndex('test');

      expect(index.isInitialized('test')).toBe(false);
    });
  });

  describe('EmbeddingFactory', () => {
    afterEach(() => {
      EmbeddingFactory.closeAll();
    });

    it('should create and cache generators', () => {
      const gen1 = EmbeddingFactory.createGenerator('test');
      const gen2 = EmbeddingFactory.createGenerator('test');

      expect(gen1).toBe(gen2); // Same instance
    });

    it('should create different generators for different names', () => {
      const gen1 = EmbeddingFactory.createGenerator('test1');
      const gen2 = EmbeddingFactory.createGenerator('test2');

      expect(gen1).not.toBe(gen2);
    });

    it('should create cache', () => {
      const cache = EmbeddingFactory.createCache('mycache', {
        maxSize: 1000,
        persistent: false,
      });

      expect(cache).toBeInstanceOf(EmbeddingCache);
    });

    it('should cache cache instances', () => {
      const cache1 = EmbeddingFactory.createCache('cache1');
      const cache2 = EmbeddingFactory.createCache('cache1');

      expect(cache1).toBe(cache2);
    });

    it('should create HNSW index', () => {
      const index = EmbeddingFactory.createIndex('myindex', {
        dimension: 384,
      });

      expect(index).toBeInstanceOf(HNSWEmbeddingIndex);
    });

    it('should cache index instances', () => {
      const index1 = EmbeddingFactory.createIndex('index1');
      const index2 = EmbeddingFactory.createIndex('index1');

      expect(index1).toBe(index2);
    });

    it('should close all resources', () => {
      EmbeddingFactory.createGenerator('gen1');
      EmbeddingFactory.createCache('cache1');
      EmbeddingFactory.createIndex('index1');

      // Should not throw
      EmbeddingFactory.closeAll();
    });
  });

  describe('Performance Targets', () => {
    it('should define performance targets', () => {
      expect(PERFORMANCE_TARGETS.testEmbeddingMs).toBe(15);
      expect(PERFORMANCE_TARGETS.onnxSpeedup).toBe(75);
      expect(PERFORMANCE_TARGETS.quantizationReductionMin).toBe(50);
      expect(PERFORMANCE_TARGETS.quantizationReductionMax).toBe(75);
      expect(PERFORMANCE_TARGETS.hnswSpeedupMin).toBe(150);
      expect(PERFORMANCE_TARGETS.hnswSpeedupMax).toBe(12500);
    });
  });

  describe('Type System', () => {
    it('should support all embedding namespaces', () => {
      const namespaces: EmbeddingNamespace[] = ['text', 'code', 'test', 'coverage', 'defect'];
      expect(namespaces).toHaveLength(5);
    });

    it('should create valid embedding object', () => {
      const embedding: IEmbedding = {
        vector: [1, 2, 3],
        dimension: 3,
        namespace: 'test',
        text: 'test',
        timestamp: Date.now(),
        quantization: 'none',
      };

      expect(embedding.vector).toBeDefined();
      expect(embedding.namespace).toBe('test');
      expect(embedding.quantization).toBe('none');
    });
  });
});
