import { describe, it, expect, vi } from 'vitest';
import { RateLimiter } from '../../../../src/mcp/security/rate-limiter.js';

describe('token cost validation', () => {
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('rejects invalid cost %s before mutating a bucket', cost => {
    vi.useFakeTimers();
    const limiter = new RateLimiter({ tokensPerSecond: 1, maxBurst: 2 });
    try {
      expect(() => limiter.consume('client', undefined, cost)).toThrow(RangeError);
      expect(limiter.getClientStats('client')).toBeNull();
      expect(limiter.getStats().totalRequests).toBe(0);
      expect(limiter.consume('client', undefined, 2).allowed).toBe(true);
      expect(limiter.check('client').allowed).toBe(false);
    } finally { limiter.dispose(); vi.useRealTimers(); }
  });
  it('preserves zero and fractional nonnegative costs', () => {
    const limiter = new RateLimiter({ tokensPerSecond: 1, maxBurst: 2 });
    try {
      expect(limiter.consume('client', undefined, 0).allowed).toBe(true);
      expect(limiter.consume('client', undefined, 0.5).allowed).toBe(true);
    } finally { limiter.dispose(); }
  });
});
