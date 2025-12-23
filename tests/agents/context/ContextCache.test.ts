/**
 * Tests for ContextCache
 */

import { describe, it, expect, beforeEach, afterEach, vi } from '@jest/globals';
import { ContextCache } from '../../../src/agents/context/ContextCache.js';

describe('ContextCache', () => {
  let cache: ContextCache<string>;

  beforeEach(() => {
    cache = new ContextCache<string>({
      maxSize: 10,
      defaultTTL: 1000, // 1 second for testing
      enableCleanup: false, // Manual cleanup for tests
    });
  });

  afterEach(() => {
    cache.shutdown();
  });

  describe('Basic Operations', () => {
    it('should set and get values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for missing keys', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should check key existence', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    it('should delete keys', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.has('key1')).toBe(false);
      expect(cache.delete('key1')).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('Key Generation', () => {
    it('should generate consistent keys for same input', () => {
      const key1 = cache.generateKey('test query', { option: 'value' });
      const key2 = cache.generateKey('test query', { option: 'value' });
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different queries', () => {
      const key1 = cache.generateKey('query1');
      const key2 = cache.generateKey('query2');
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different options', () => {
      const key1 = cache.generateKey('query', { a: 1 });
      const key2 = cache.generateKey('query', { a: 2 });
      expect(key1).not.toBe(key2);
    });

    it('should normalize query case and whitespace', () => {
      const key1 = cache.generateKey('Test Query');
      const key2 = cache.generateKey('test query');
      const key3 = cache.generateKey('  test query  ');
      expect(key1).toBe(key2);
      expect(key1).toBe(key3);
    });
  });

  describe('TTL Expiration', () => {
    it('should expire entries after TTL', async () => {
      cache.set('key1', 'value1', 100); // 100ms TTL
      expect(cache.get('key1')).toBe('value1');

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(cache.get('key1')).toBeNull();
      expect(cache.getStats().expirations).toBe(1);
    });

    it('should use default TTL when not specified', async () => {
      const shortCache = new ContextCache<string>({
        defaultTTL: 100,
        enableCleanup: false,
      });

      shortCache.set('key1', 'value1');
      expect(shortCache.get('key1')).toBe('value1');

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(shortCache.get('key1')).toBeNull();
      shortCache.shutdown();
    });

    it('should handle custom TTL per entry', async () => {
      cache.set('short', 'value1', 100);
      cache.set('long', 'value2', 500);

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(cache.get('short')).toBeNull();
      expect(cache.get('long')).toBe('value2');
    });

    it('should update expiration on set', async () => {
      cache.set('key1', 'value1', 100);
      await new Promise(resolve => setTimeout(resolve, 50));

      // Refresh with longer TTL
      cache.set('key1', 'updated', 200);

      await new Promise(resolve => setTimeout(resolve, 120));

      expect(cache.get('key1')).toBe('updated');
    });
  });

  describe('LRU Eviction', () => {
    it('should evict least recently used when at capacity', () => {
      const smallCache = new ContextCache<string>({
        maxSize: 3,
        enableCleanup: false,
      });

      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');

      // key1 should be evicted
      smallCache.set('key4', 'value4');

      expect(smallCache.get('key1')).toBeNull();
      expect(smallCache.get('key2')).toBe('value2');
      expect(smallCache.get('key3')).toBe('value3');
      expect(smallCache.get('key4')).toBe('value4');
      expect(smallCache.getStats().evictions).toBe(1);

      smallCache.shutdown();
    });

    it('should update LRU order on get', () => {
      const smallCache = new ContextCache<string>({
        maxSize: 3,
        enableCleanup: false,
      });

      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');

      // Access key1 to make it recently used
      smallCache.get('key1');

      // key2 should be evicted (least recently used)
      smallCache.set('key4', 'value4');

      expect(smallCache.get('key1')).toBe('value1');
      expect(smallCache.get('key2')).toBeNull();
      expect(smallCache.get('key3')).toBe('value3');
      expect(smallCache.get('key4')).toBe('value4');

      smallCache.shutdown();
    });

    it('should update LRU order on set', () => {
      const smallCache = new ContextCache<string>({
        maxSize: 3,
        enableCleanup: false,
      });

      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');

      // Update key1 to make it recently used
      smallCache.set('key1', 'updated1');

      // key2 should be evicted
      smallCache.set('key4', 'value4');

      expect(smallCache.get('key1')).toBe('updated1');
      expect(smallCache.get('key2')).toBeNull();

      smallCache.shutdown();
    });
  });

  describe('Statistics', () => {
    it('should track hits and misses', () => {
      cache.set('key1', 'value1');

      cache.get('key1'); // Hit
      cache.get('key2'); // Miss
      cache.get('key1'); // Hit

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3);
    });

    it('should track evictions', () => {
      const smallCache = new ContextCache<string>({
        maxSize: 2,
        enableCleanup: false,
      });

      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');

      const stats = smallCache.getStats();
      expect(stats.evictions).toBe(1);
      expect(stats.size).toBe(2);

      smallCache.shutdown();
    });

    it('should track expirations', async () => {
      cache.set('key1', 'value1', 50);
      await new Promise(resolve => setTimeout(resolve, 100));

      cache.get('key1'); // Should trigger expiration

      const stats = cache.getStats();
      expect(stats.expirations).toBe(1);
    });

    it('should calculate average access count', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.get('key1');
      cache.get('key1');
      cache.get('key2');

      const stats = cache.getStats();
      expect(stats.avgAccessCount).toBe(1.5); // (2 + 1) / 2
    });

    it('should report size and capacity', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(10);
    });
  });

  describe('Cleanup', () => {
    it('should manually cleanup expired entries', async () => {
      cache.set('key1', 'value1', 50);
      cache.set('key2', 'value2', 200);

      await new Promise(resolve => setTimeout(resolve, 100));

      const removed = cache.cleanup();
      expect(removed).toBe(1);
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(true);
    });

    it('should automatically cleanup when enabled', async () => {
      const autoCache = new ContextCache<string>({
        defaultTTL: 50,
        enableCleanup: true,
        cleanupInterval: 100,
      });

      autoCache.set('key1', 'value1');
      autoCache.set('key2', 'value2');

      await new Promise(resolve => setTimeout(resolve, 80));

      // Wait for cleanup interval
      await new Promise(resolve => setTimeout(resolve, 120));

      expect(autoCache.getStats().expirations).toBeGreaterThan(0);
      autoCache.shutdown();
    });
  });

  describe('Cache Hit Rate Optimization', () => {
    it('should achieve high hit rate for similar queries', () => {
      // Simulate agent queries
      const queries = [
        'test user authentication',
        'test user authentication',
        'test user login',
        'test user authentication',
        'test authentication flow',
        'test user authentication',
      ];

      for (const query of queries) {
        const key = cache.generateKey(query);
        let value = cache.get(key);

        if (!value) {
          value = `result for ${query}`;
          cache.set(key, value);
        }
      }

      const stats = cache.getStats();
      // 3 unique queries, 6 total queries = 3 hits, 3 misses = 50% hit rate
      expect(stats.hits).toBe(3);
      expect(stats.misses).toBe(3);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should handle workload with 70-80% cache hit target', () => {
      // Simulate realistic agent workload with repeated patterns
      // To achieve 70%+ hit rate, need more repetitions
      const workload = [
        // Initial misses (4 unique)
        'create user tests',
        'test authentication',
        'validate input',
        'error handling',

        // Repeated queries (cache hits) - 12 repetitions
        'create user tests',
        'test authentication',
        'create user tests',
        'validate input',
        'test authentication',
        'error handling',
        'create user tests',
        'test authentication',
        'validate input',
        'error handling',
        'create user tests',
        'test authentication',

        // New queries (misses) - 2 more unique
        'performance testing',
        'integration tests',

        // More repetitions (hits) - 6 more
        'create user tests',
        'test authentication',
        'validate input',
        'error handling',
        'performance testing',
        'integration tests',
      ];

      for (const query of workload) {
        const key = cache.generateKey(query);
        let value = cache.get(key);

        if (!value) {
          value = `context for ${query}`;
          cache.set(key, value);
        }
      }

      const stats = cache.getStats();

      // 6 unique queries (misses), 18 repetitions (hits) = 24 total
      // Hit rate = 18/24 = 75%
      expect(stats.hits).toBe(18);
      expect(stats.misses).toBe(6);
      expect(stats.hitRate).toBe(0.75);
      expect(stats.hitRate).toBeGreaterThanOrEqual(0.7);
      expect(stats.hitRate).toBeLessThanOrEqual(0.8);
    });
  });

  describe('Entry Management', () => {
    it('should get all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const entries = cache.getEntries();
      expect(entries.length).toBe(2);
      expect(entries[0].value).toMatch(/value[12]/);
      expect(entries[1].value).toMatch(/value[12]/);
    });

    it('should track entry metadata', () => {
      const before = Date.now();
      cache.set('key1', 'value1');
      const after = Date.now();

      cache.get('key1');
      cache.get('key1');

      const entries = cache.getEntries();
      const entry = entries[0];

      expect(entry.key).toBe('key1');
      expect(entry.value).toBe('value1');
      expect(entry.accessCount).toBe(2);
      expect(entry.createdAt).toBeGreaterThanOrEqual(before);
      expect(entry.createdAt).toBeLessThanOrEqual(after);
      expect(entry.lastAccessedAt).toBeGreaterThanOrEqual(entry.createdAt);
    });
  });

  describe('Complex Types', () => {
    it('should cache objects', () => {
      const objCache = new ContextCache<{ data: string }>();

      const obj = { data: 'test' };
      objCache.set('key1', obj);

      const retrieved = objCache.get('key1');
      expect(retrieved).toEqual(obj);

      objCache.shutdown();
    });

    it('should cache arrays', () => {
      const arrCache = new ContextCache<string[]>();

      const arr = ['a', 'b', 'c'];
      arrCache.set('key1', arr);

      const retrieved = arrCache.get('key1');
      expect(retrieved).toEqual(arr);

      arrCache.shutdown();
    });
  });
});
