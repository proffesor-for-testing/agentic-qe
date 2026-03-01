/**
 * Agentic QE v3 - LLM Cache Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  LLMCache,
  LLMResponseCache,
  DEFAULT_CACHE_CONFIG,
} from '../../../../src/shared/llm/cache';
import type { LLMResponse, EmbeddingResponse } from '../../../../src/shared/llm/interfaces';

describe('LLMCache', () => {
  let cache: LLMCache<string>;

  beforeEach(() => {
    cache = new LLMCache<string>({
      maxSize: 100,
      defaultTtlMs: 60000,
      enableLRU: true,
    });
  });

  describe('basic operations', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for missing keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should check if key exists', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should delete values', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.delete('key1')).toBe(false);
    });

    it('should clear all values', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('TTL expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should expire entries after TTL', () => {
      cache.set('key1', 'value1', 1000); // 1 second TTL

      expect(cache.get('key1')).toBe('value1');

      vi.advanceTimersByTime(1001);

      expect(cache.get('key1')).toBeUndefined();
    });

    it('should not expire entries with 0 TTL', () => {
      cache.set('key1', 'value1', 0); // No expiry

      vi.advanceTimersByTime(999999);

      expect(cache.get('key1')).toBe('value1');
    });

    it('should prune expired entries', () => {
      cache.set('key1', 'value1', 1000);
      cache.set('key2', 'value2', 2000);
      cache.set('key3', 'value3', 3000);

      vi.advanceTimersByTime(1500);

      const pruned = cache.pruneExpired();
      expect(pruned).toBe(1);
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(true);
      expect(cache.has('key3')).toBe(true);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used when full', () => {
      const smallCache = new LLMCache<string>({ maxSize: 3, enableLRU: true });

      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');

      // Access key1 to make it recently used
      smallCache.get('key1');

      // Add key4, should evict key2 (least recently used after key1 access)
      smallCache.set('key4', 'value4');

      expect(smallCache.has('key1')).toBe(true);
      expect(smallCache.has('key2')).toBe(false); // Evicted
      expect(smallCache.has('key3')).toBe(true);
      expect(smallCache.has('key4')).toBe(true);
    });

    it('should track eviction count', () => {
      const smallCache = new LLMCache<string>({ maxSize: 2, enableLRU: true });

      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3'); // Triggers eviction

      expect(smallCache.getStats().evictions).toBe(1);
    });
  });

  describe('statistics', () => {
    it('should track hits and misses', () => {
      cache.set('key1', 'value1');

      cache.get('key1'); // Hit
      cache.get('key1'); // Hit
      cache.get('missing'); // Miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.667, 2);
    });

    it('should track size', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      expect(cache.getStats().size).toBe(2);
    });

    it('should estimate memory usage', () => {
      cache.set('key1', 'a'.repeat(100));
      cache.set('key2', 'b'.repeat(200));

      const stats = cache.getStats();
      expect(stats.memoryUsageBytes).toBeGreaterThan(0);
    });
  });

  describe('export/import', () => {
    it('should export entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const entries = cache.entries();
      expect(entries.length).toBe(2);
    });

    it('should import entries', () => {
      const sourceCache = new LLMCache<string>();
      sourceCache.set('key1', 'value1');
      sourceCache.set('key2', 'value2');

      const entries = sourceCache.entries();

      const targetCache = new LLMCache<string>();
      targetCache.import(entries);

      expect(targetCache.get('key1')).toBe('value1');
      expect(targetCache.get('key2')).toBe('value2');
    });

    it('should respect max size on import', () => {
      const sourceCache = new LLMCache<string>();
      for (let i = 0; i < 10; i++) {
        sourceCache.set(`key${i}`, `value${i}`);
      }

      const smallCache = new LLMCache<string>({ maxSize: 3 });
      smallCache.import(sourceCache.entries());

      expect(smallCache.getStats().size).toBeLessThanOrEqual(3);
    });
  });

  describe('key generation', () => {
    it('should generate consistent keys', () => {
      const key1 = LLMCache.generateKey('generation', 'test input', {
        model: 'gpt-4',
        temperature: 0.7,
      });
      const key2 = LLMCache.generateKey('generation', 'test input', {
        model: 'gpt-4',
        temperature: 0.7,
      });

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different inputs', () => {
      const key1 = LLMCache.generateKey('generation', 'input A');
      const key2 = LLMCache.generateKey('generation', 'input B');

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different options', () => {
      const key1 = LLMCache.generateKey('generation', 'test', { model: 'gpt-4' });
      const key2 = LLMCache.generateKey('generation', 'test', { model: 'claude' });

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different types', () => {
      const key1 = LLMCache.generateKey('generation', 'test');
      const key2 = LLMCache.generateKey('embedding', 'test');

      expect(key1).not.toBe(key2);
    });
  });
});

describe('LLMResponseCache', () => {
  let cache: LLMResponseCache;

  const mockResponse: LLMResponse = {
    content: 'Test response',
    model: 'claude-3',
    provider: 'claude',
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    cost: { inputCost: 0.01, outputCost: 0.02, totalCost: 0.03, currency: 'USD' },
    latencyMs: 500,
    finishReason: 'stop',
    cached: false,
    requestId: 'test-1',
  };

  const mockEmbedding: EmbeddingResponse = {
    embedding: [0.1, 0.2, 0.3],
    model: 'text-embedding-3-small',
    provider: 'openai',
    tokenCount: 5,
    latencyMs: 100,
    cached: false,
  };

  beforeEach(() => {
    cache = new LLMResponseCache({
      maxSize: 100,
      cacheGenerations: true,
      cacheEmbeddings: true,
      cacheCompletions: true,
    });
  });

  describe('generation caching', () => {
    it('should cache and retrieve generations', () => {
      cache.setGeneration('test prompt', mockResponse);
      const cached = cache.getGeneration('test prompt');

      expect(cached).toEqual(mockResponse);
    });

    it('should cache with options', () => {
      cache.setGeneration('test prompt', mockResponse, {
        model: 'gpt-4',
        temperature: 0.7,
      });

      const cached = cache.getGeneration('test prompt', {
        model: 'gpt-4',
        temperature: 0.7,
      });

      expect(cached).toEqual(mockResponse);
    });

    it('should not find cache with different options', () => {
      cache.setGeneration('test prompt', mockResponse, { model: 'gpt-4' });

      const cached = cache.getGeneration('test prompt', { model: 'claude-3' });

      expect(cached).toBeUndefined();
    });

    it('should respect cache disabled setting', () => {
      const disabledCache = new LLMResponseCache({ cacheGenerations: false });

      disabledCache.setGeneration('test prompt', mockResponse);
      const cached = disabledCache.getGeneration('test prompt');

      expect(cached).toBeUndefined();
    });
  });

  describe('embedding caching', () => {
    it('should cache and retrieve embeddings', () => {
      cache.setEmbedding('test text', mockEmbedding);
      const cached = cache.getEmbedding('test text');

      expect(cached).toEqual(mockEmbedding);
    });

    it('should cache with model option', () => {
      cache.setEmbedding('test text', mockEmbedding, {
        model: 'text-embedding-3-small',
      });

      const cached = cache.getEmbedding('test text', {
        model: 'text-embedding-3-small',
      });

      expect(cached).toEqual(mockEmbedding);
    });
  });

  describe('completion caching', () => {
    it('should cache and retrieve completions', () => {
      const completion = {
        completion: 'completed text',
        model: 'gpt-4',
        provider: 'openai' as const,
        usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
        latencyMs: 200,
        cached: false,
      };

      cache.setCompletion('partial', completion);
      const cached = cache.getCompletion('partial');

      expect(cached).toEqual(completion);
    });
  });

  describe('statistics', () => {
    it('should provide combined stats', () => {
      cache.setGeneration('gen1', mockResponse);
      cache.setEmbedding('emb1', mockEmbedding);

      cache.getGeneration('gen1'); // Hit
      cache.getGeneration('missing'); // Miss
      cache.getEmbedding('emb1'); // Hit

      const stats = cache.getStats();

      expect(stats.generation.hits).toBe(1);
      expect(stats.generation.misses).toBe(1);
      expect(stats.embedding.hits).toBe(1);
      expect(stats.total.hits).toBe(2);
      expect(stats.total.misses).toBe(1);
    });
  });

  describe('maintenance', () => {
    it('should clear all caches', () => {
      cache.setGeneration('gen1', mockResponse);
      cache.setEmbedding('emb1', mockEmbedding);

      cache.clear();

      expect(cache.getGeneration('gen1')).toBeUndefined();
      expect(cache.getEmbedding('emb1')).toBeUndefined();
    });

    it('should prune expired from all caches', () => {
      vi.useFakeTimers();

      const shortTtlCache = new LLMResponseCache({ defaultTtlMs: 1000 });
      shortTtlCache.setGeneration('gen1', mockResponse);
      shortTtlCache.setEmbedding('emb1', mockEmbedding);

      vi.advanceTimersByTime(1500);

      const pruned = shortTtlCache.pruneExpired();
      expect(pruned).toBe(2);

      vi.useRealTimers();
    });
  });
});
