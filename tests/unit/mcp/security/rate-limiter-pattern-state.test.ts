import { describe, it, expect, vi } from 'vitest';
import { RateLimiter } from '../../../../src/mcp/security/rate-limiter.js';

describe('stateful endpoint regular expressions', () => {
  it.each(['g', 'y'])('uses the same policy and bucket on repeated checks with %s', flags => {
    vi.useFakeTimers();
    const limiter = new RateLimiter({ tokensPerSecond: 10, maxBurst: 20 });
    const pattern = new RegExp('^/expensive', flags);
    pattern.lastIndex = 4;
    limiter.addEndpointLimit({ pattern, tokensPerSecond: 1, maxBurst: 2 });
    try {
      expect(limiter.check('client', '/expensive').headers['X-RateLimit-Limit']).toBe(2);
      expect(limiter.check('client', '/expensive').allowed).toBe(true);
      expect(limiter.check('client', '/expensive').allowed).toBe(false);
      expect(limiter.check('other', '/ordinary').headers['X-RateLimit-Limit']).toBe(20);
      expect(pattern.lastIndex).toBe(4);
    } finally { limiter.dispose(); vi.useRealTimers(); }
  });
});
