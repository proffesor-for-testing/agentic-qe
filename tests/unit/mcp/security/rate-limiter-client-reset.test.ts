import { describe, it, expect, vi } from 'vitest';
import { RateLimiter } from '../../../../src/mcp/security/rate-limiter.js';

describe('client bucket reset', () => {
  it('resets every endpoint bucket owned by the exact client and retains other clients', () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter({ tokensPerSecond: 1, maxBurst: 1 });
    limiter.addEndpointLimit({ pattern: '^/one', tokensPerSecond: 1, maxBurst: 1 });
    limiter.addEndpointLimit({ pattern: '^/two', tokensPerSecond: 1, maxBurst: 1 });
    try {
      for (const client of ['client', 'client:ep0', 'client:other', 'other']) {
        for (const endpoint of ['/one', '/two', '/ordinary']) expect(limiter.check(client, endpoint).allowed).toBe(true);
      }
      limiter.resetClient('client');
      for (const endpoint of ['/one', '/two', '/ordinary']) {
        expect(limiter.check('client', endpoint).allowed).toBe(true);
        expect(limiter.check('client:other', endpoint).allowed).toBe(false);
        expect(limiter.check('client:ep0', endpoint).allowed).toBe(false);
        expect(limiter.check('other', endpoint).allowed).toBe(false);
      }
    } finally { limiter.dispose(); vi.useRealTimers(); }
  });
});
