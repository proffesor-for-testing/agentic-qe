/**
 * Unit Tests: SessionOperationCache
 * Imp-15: Session Reuse for Repeated Operations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SessionOperationCache,
  getSessionCache,
  resetSessionCache,
  DEFAULT_SESSION_CACHE_CONFIG,
} from '../../../src/optimization/session-cache.js';

describe('SessionOperationCache', () => {
  let cache: SessionOperationCache;

  beforeEach(() => {
    resetSessionCache();
    cache = new SessionOperationCache({ persistToDb: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // computeFingerprint
  // ==========================================================================

  describe('computeFingerprint', () => {
    it('should produce consistent hashes for the same input', () => {
      const fp1 = cache.computeFingerprint('test-gen', 'generate', { file: 'a.ts' });
      const fp2 = cache.computeFingerprint('test-gen', 'generate', { file: 'a.ts' });
      expect(fp1).toBe(fp2);
    });

    it('should produce different hashes for different inputs', () => {
      const fp1 = cache.computeFingerprint('test-gen', 'generate', { file: 'a.ts' });
      const fp2 = cache.computeFingerprint('test-gen', 'generate', { file: 'b.ts' });
      expect(fp1).not.toBe(fp2);
    });

    it('should produce different hashes for different domains', () => {
      const fp1 = cache.computeFingerprint('domain-a', 'action', {});
      const fp2 = cache.computeFingerprint('domain-b', 'action', {});
      expect(fp1).not.toBe(fp2);
    });

    it('should produce different hashes for different actions', () => {
      const fp1 = cache.computeFingerprint('domain', 'action-a', {});
      const fp2 = cache.computeFingerprint('domain', 'action-b', {});
      expect(fp1).not.toBe(fp2);
    });

    it('should return a 16-character hex string', () => {
      const fp = cache.computeFingerprint('d', 'a', { x: 1 });
      expect(fp).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  // ==========================================================================
  // get (cache miss)
  // ==========================================================================

  describe('get (miss)', () => {
    it('should return null on miss', () => {
      const result = cache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should increment misses counter on miss', () => {
      cache.get('nonexistent');
      cache.get('also-nonexistent');
      const stats = cache.getStats();
      expect(stats.misses).toBe(2);
      expect(stats.hits).toBe(0);
    });
  });

  // ==========================================================================
  // get (cache hit)
  // ==========================================================================

  describe('get (hit)', () => {
    it('should return cached entry on hit', () => {
      const fp = 'test-fingerprint';
      cache.set(fp, 'domain', 'action', { answer: 42 }, 150);

      const result = cache.get(fp);
      expect(result).not.toBeNull();
      expect(result!.fingerprint).toBe(fp);
      expect(result!.domain).toBe('domain');
      expect(result!.action).toBe('action');
      expect(result!.result).toEqual({ answer: 42 });
      expect(result!.tokensSaved).toBe(150);
    });

    it('should increment hitCount on each hit', () => {
      const fp = 'test-fp';
      cache.set(fp, 'd', 'a', {}, 100);

      cache.get(fp);
      cache.get(fp);
      const entry = cache.get(fp);
      expect(entry!.hitCount).toBe(3);
    });

    it('should update lastHitAt on hit', () => {
      const fp = 'test-fp';
      cache.set(fp, 'd', 'a', {}, 100);

      const before = Date.now();
      const entry = cache.get(fp);
      expect(entry!.lastHitAt).toBeGreaterThanOrEqual(before);
    });

    it('should increment hits counter', () => {
      cache.set('fp1', 'd', 'a', {}, 100);
      cache.get('fp1');
      cache.get('fp1');
      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
    });
  });

  // ==========================================================================
  // TTL expiry
  // ==========================================================================

  describe('TTL expiry', () => {
    it('should return null for expired entries', () => {
      // Create cache with very short TTL
      const shortTtlCache = new SessionOperationCache({
        ttlMs: 1,
        persistToDb: false,
      });

      shortTtlCache.set('fp', 'd', 'a', {}, 100);

      // Wait a tiny bit to ensure TTL expires
      // The entry cachedAt is set to Date.now() in set(), and TTL is 1ms
      // We need to advance past the TTL
      vi.useFakeTimers();
      vi.advanceTimersByTime(5);

      const result = shortTtlCache.get('fp');
      expect(result).toBeNull();

      vi.useRealTimers();
    });

    it('should count expired lookups as misses', () => {
      const shortTtlCache = new SessionOperationCache({
        ttlMs: 1,
        persistToDb: false,
      });

      shortTtlCache.set('fp', 'd', 'a', {}, 100);

      vi.useFakeTimers();
      vi.advanceTimersByTime(5);

      shortTtlCache.get('fp');
      const stats = shortTtlCache.getStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(0);

      vi.useRealTimers();
    });
  });

  // ==========================================================================
  // Eviction
  // ==========================================================================

  describe('eviction', () => {
    it('should evict oldest entry when at maxEntries', () => {
      const smallCache = new SessionOperationCache({
        maxEntries: 2,
        persistToDb: false,
      });

      smallCache.set('fp1', 'd', 'a', { v: 1 }, 100);
      smallCache.set('fp2', 'd', 'a', { v: 2 }, 200);
      // This should evict fp1 (oldest)
      smallCache.set('fp3', 'd', 'a', { v: 3 }, 300);

      expect(smallCache.get('fp1')).toBeNull();
      expect(smallCache.get('fp3')).not.toBeNull();
      // fp2 should still be there
      expect(smallCache.get('fp2')).not.toBeNull();
    });
  });

  // ==========================================================================
  // getStats
  // ==========================================================================

  describe('getStats', () => {
    it('should return correct hit rate', () => {
      cache.set('fp1', 'd', 'a', {}, 100);

      cache.get('fp1');     // hit
      cache.get('fp1');     // hit
      cache.get('missing'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3);
    });

    it('should return correct estimated tokens saved', () => {
      cache.set('fp1', 'd', 'a', {}, 100);
      cache.set('fp2', 'd', 'a', {}, 200);

      cache.get('fp1'); // hit, 100 tokens saved once
      cache.get('fp1'); // hit, 100 tokens saved again
      cache.get('fp2'); // hit, 200 tokens saved once

      const stats = cache.getStats();
      // fp1: 100 * 2 hits = 200, fp2: 200 * 1 hit = 200 => total 400
      expect(stats.estimatedTokensSaved).toBe(400);
    });

    it('should return hitRate 0 with no lookups', () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
    });

    it('should return correct size', () => {
      cache.set('fp1', 'd', 'a', {}, 100);
      cache.set('fp2', 'd', 'a', {}, 200);
      expect(cache.getStats().size).toBe(2);
    });
  });

  // ==========================================================================
  // clear
  // ==========================================================================

  describe('clear', () => {
    it('should clear all entries and reset counters', () => {
      cache.set('fp1', 'd', 'a', {}, 100);
      cache.get('fp1');
      cache.get('missing');

      cache.clear();

      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.estimatedTokensSaved).toBe(0);
    });

    it('should not return previously cached entries after clear', () => {
      cache.set('fp1', 'd', 'a', {}, 100);
      cache.clear();
      expect(cache.get('fp1')).toBeNull();
    });
  });

  // ==========================================================================
  // Disabled cache
  // ==========================================================================

  describe('disabled cache', () => {
    it('should always return null from get when disabled', () => {
      const disabled = new SessionOperationCache({
        enabled: false,
        persistToDb: false,
      });

      disabled.set('fp1', 'd', 'a', {}, 100);
      expect(disabled.get('fp1')).toBeNull();
    });

    it('should not store entries when disabled', () => {
      const disabled = new SessionOperationCache({
        enabled: false,
        persistToDb: false,
      });

      disabled.set('fp1', 'd', 'a', {}, 100);
      expect(disabled.getStats().size).toBe(0);
    });
  });

  // ==========================================================================
  // loadFromDb graceful degradation
  // ==========================================================================

  describe('loadFromDb', () => {
    it('should gracefully degrade when DB is unavailable', () => {
      // By default, the DB is not initialized in tests.
      // loadFromDb should not throw.
      expect(() => cache.loadFromDb()).not.toThrow();
      expect(cache.getStats().size).toBe(0);
    });
  });

  // ==========================================================================
  // Singleton
  // ==========================================================================

  describe('getSessionCache singleton', () => {
    it('should return the same instance on repeated calls', () => {
      const a = getSessionCache({ persistToDb: false });
      const b = getSessionCache();
      expect(a).toBe(b);
    });

    it('should return a fresh instance after resetSessionCache', () => {
      const a = getSessionCache({ persistToDb: false });
      resetSessionCache();
      const b = getSessionCache({ persistToDb: false });
      expect(a).not.toBe(b);
    });
  });

  // ==========================================================================
  // Default config
  // ==========================================================================

  describe('default config', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_SESSION_CACHE_CONFIG.enabled).toBe(true);
      expect(DEFAULT_SESSION_CACHE_CONFIG.maxEntries).toBe(500);
      expect(DEFAULT_SESSION_CACHE_CONFIG.ttlMs).toBe(60 * 60 * 1000);
      expect(DEFAULT_SESSION_CACHE_CONFIG.persistToDb).toBe(true);
    });
  });
});
