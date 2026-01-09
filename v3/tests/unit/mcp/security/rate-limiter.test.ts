/**
 * Agentic QE v3 - Rate Limiter Tests
 * Tests for token bucket rate limiting
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RateLimiter,
  SlidingWindowRateLimiter,
  createRateLimiter,
  createStrictRateLimiter,
  createSlidingWindowLimiter,
} from '../../../../src/mcp/security/rate-limiter';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = createRateLimiter({
      tokensPerSecond: 10,
      maxBurst: 20,
      perClient: true,
    });
  });

  afterEach(() => {
    limiter.dispose();
  });

  describe('basic rate limiting', () => {
    it('should allow requests within limit', () => {
      const result = limiter.check('client1');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeLessThanOrEqual(20);
    });

    it('should track remaining tokens', () => {
      // Use some tokens
      limiter.check('client1');
      limiter.check('client1');
      limiter.check('client1');

      const result = limiter.check('client1');
      expect(result.remaining).toBe(16); // 20 - 4 = 16
    });

    it('should deny requests when tokens exhausted', () => {
      // Exhaust all tokens
      for (let i = 0; i < 20; i++) {
        limiter.check('client1');
      }

      const result = limiter.check('client1');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeDefined();
    });

    it('should provide retry-after time', () => {
      // Exhaust tokens
      for (let i = 0; i < 20; i++) {
        limiter.check('client1');
      }

      const result = limiter.check('client1');
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(1000); // Max 1 second wait for 10 tokens/sec
    });
  });

  describe('per-client limiting', () => {
    it('should maintain separate buckets per client', () => {
      // Exhaust client1's tokens
      for (let i = 0; i < 20; i++) {
        limiter.check('client1');
      }

      // client2 should still have tokens
      const result = limiter.check('client2');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(19);
    });

    it('should use global bucket when no client specified', () => {
      // Create limiter without per-client limiting
      const globalLimiter = createRateLimiter({
        tokensPerSecond: 10,
        maxBurst: 20,
        perClient: false,
      });

      const result1 = globalLimiter.check();
      const result2 = globalLimiter.check();

      expect(result1.remaining - result2.remaining).toBe(1);

      globalLimiter.dispose();
    });
  });

  describe('token refill', () => {
    it('should refill tokens over time', async () => {
      vi.useFakeTimers();

      // Use some tokens
      for (let i = 0; i < 10; i++) {
        limiter.check('client1');
      }

      const beforeRefill = limiter.check('client1');
      expect(beforeRefill.remaining).toBe(9);

      // Wait for tokens to refill (100ms = 1 token at 10/sec)
      vi.advanceTimersByTime(1000);

      const afterRefill = limiter.check('client1');
      expect(afterRefill.remaining).toBeGreaterThan(9);

      vi.useRealTimers();
    });

    it('should not exceed max burst', async () => {
      vi.useFakeTimers();

      // Wait a long time - should still cap at maxBurst
      vi.advanceTimersByTime(10000);

      const result = limiter.check('client1');
      expect(result.remaining).toBe(19); // maxBurst - 1
      expect(result.remaining).toBeLessThanOrEqual(20);

      vi.useRealTimers();
    });
  });

  describe('consume multiple tokens', () => {
    it('should consume multiple tokens at once', () => {
      const result = limiter.consume('client1', undefined, 5);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(15);
    });

    it('should deny if not enough tokens', () => {
      const result = limiter.consume('client1', undefined, 25);

      expect(result.allowed).toBe(false);
    });
  });

  describe('async wait', () => {
    it('should wait for tokens to become available', async () => {
      vi.useFakeTimers();

      // Exhaust tokens
      for (let i = 0; i < 20; i++) {
        limiter.check('client1');
      }

      const waitPromise = limiter.wait('client1');

      // Advance time to allow token refill
      vi.advanceTimersByTime(200);

      const result = await waitPromise;
      expect(result.allowed).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('endpoint-specific limits', () => {
    it('should apply endpoint-specific limits', () => {
      limiter.addEndpointLimit({
        pattern: /\/api\/admin/,
        tokensPerSecond: 5,
        maxBurst: 10,
      });

      const adminResult = limiter.check('client1', '/api/admin/users');
      expect(adminResult.remaining).toBe(9); // 10 maxBurst - 1

      // Normal endpoint has separate bucket from admin endpoint
      const normalResult = limiter.check('client1', '/api/users');
      expect(normalResult.remaining).toBe(19); // 20 maxBurst - 1 (separate bucket)
    });

    it('should clear endpoint limits', () => {
      limiter.addEndpointLimit({
        pattern: '/test',
        tokensPerSecond: 1,
        maxBurst: 2,
      });

      limiter.clearEndpointLimits();

      const result = limiter.check('client1', '/test');
      expect(result.remaining).toBe(19); // Uses default maxBurst
    });
  });

  describe('reset', () => {
    it('should reset client bucket', () => {
      // Use tokens
      for (let i = 0; i < 10; i++) {
        limiter.check('client1');
      }

      limiter.resetClient('client1');

      const result = limiter.check('client1');
      expect(result.remaining).toBe(19); // Full bucket
    });

    it('should reset all buckets', () => {
      limiter.check('client1');
      limiter.check('client2');
      limiter.check('client3');

      limiter.reset();

      const stats = limiter.getStats();
      expect(stats.activeBuckets).toBe(1); // Only global bucket
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('statistics', () => {
    it('should track request statistics', () => {
      limiter.check('client1');
      limiter.check('client2');
      limiter.check('client1');

      const stats = limiter.getStats();

      expect(stats.totalRequests).toBe(3);
      expect(stats.allowedRequests).toBe(3);
      expect(stats.deniedRequests).toBe(0);
    });

    it('should track denied requests', () => {
      // Exhaust tokens
      for (let i = 0; i < 20; i++) {
        limiter.check('client1');
      }

      // Try more requests
      limiter.check('client1');
      limiter.check('client1');

      const stats = limiter.getStats();
      expect(stats.deniedRequests).toBe(2);
    });

    it('should track active buckets', () => {
      limiter.check('client1');
      limiter.check('client2');
      limiter.check('client3');

      const stats = limiter.getStats();
      expect(stats.activeBuckets).toBe(4); // 3 clients + 1 global
    });

    it('should get client-specific stats', () => {
      limiter.check('client1');
      limiter.check('client1');
      limiter.check('client1');

      const clientStats = limiter.getClientStats('client1');

      expect(clientStats).not.toBeNull();
      expect(clientStats?.totalRequests).toBe(3);
    });

    it('should return null for unknown client', () => {
      const stats = limiter.getClientStats('unknown');
      expect(stats).toBeNull();
    });
  });

  describe('rate limit headers', () => {
    it('should provide rate limit headers', () => {
      const result = limiter.check('client1');

      expect(result.headers['X-RateLimit-Limit']).toBe(20);
      expect(result.headers['X-RateLimit-Remaining']).toBe(19);
      expect(result.headers['X-RateLimit-Reset']).toBeDefined();
    });

    it('should include Retry-After when denied', () => {
      // Exhaust tokens
      for (let i = 0; i < 20; i++) {
        limiter.check('client1');
      }

      const result = limiter.check('client1');
      expect(result.headers['Retry-After']).toBeDefined();
      expect(result.headers['Retry-After']).toBeGreaterThan(0);
    });
  });
});

describe('SlidingWindowRateLimiter', () => {
  let limiter: SlidingWindowRateLimiter;

  beforeEach(() => {
    limiter = createSlidingWindowLimiter(1000, 10); // 10 requests per second
  });

  afterEach(() => {
    limiter.dispose();
  });

  describe('basic functionality', () => {
    it('should allow requests within limit', () => {
      const result = limiter.check('client1');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it('should deny requests exceeding limit', () => {
      // Make 10 requests
      for (let i = 0; i < 10; i++) {
        limiter.check('client1');
      }

      const result = limiter.check('client1');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should track per-client limits', () => {
      // Use client1's quota
      for (let i = 0; i < 10; i++) {
        limiter.check('client1');
      }

      // client2 should still have quota
      const result = limiter.check('client2');
      expect(result.allowed).toBe(true);
    });
  });

  describe('sliding window behavior', () => {
    it('should allow requests after window slides', async () => {
      vi.useFakeTimers();

      // Use all quota
      for (let i = 0; i < 10; i++) {
        limiter.check('client1');
      }

      // Wait for window to slide
      vi.advanceTimersByTime(1100);

      const result = limiter.check('client1');
      expect(result.allowed).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('reset', () => {
    it('should reset specific client', () => {
      for (let i = 0; i < 5; i++) {
        limiter.check('client1');
      }

      limiter.reset('client1');

      const result = limiter.check('client1');
      expect(result.remaining).toBe(9);
    });

    it('should reset all clients', () => {
      limiter.check('client1');
      limiter.check('client2');

      limiter.reset();

      const result1 = limiter.check('client1');
      const result2 = limiter.check('client2');

      expect(result1.remaining).toBe(9);
      expect(result2.remaining).toBe(9);
    });
  });
});

describe('createStrictRateLimiter', () => {
  it('should create limiter with strict defaults', () => {
    const limiter = createStrictRateLimiter();

    // Should have lower limits (10 req/s, 20 burst)
    const stats = limiter.getStats();
    expect(stats.activeBuckets).toBe(1);

    // Exhaust 20 tokens
    for (let i = 0; i < 20; i++) {
      limiter.check('client1');
    }

    const result = limiter.check('client1');
    expect(result.allowed).toBe(false);

    limiter.dispose();
  });
});
