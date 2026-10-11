/**
 * Issue #905: RateLimiter.wait() must never hang when the requested cost can
 * never be admitted (tokens > maxBurst, or a bucket that never refills).
 * Uses real timers so a hang shows up as a real timeout, not a mocked clock.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { RateLimiter } from '../../../../src/mcp/security/rate-limiter.js';

const SETTLE_BUDGET_MS = 250;

type Outcome = { status: 'resolved' | 'rejected' | 'timeout'; value?: unknown; elapsed: number };

/** Report how `p` settled, or 'timeout' if it did not settle within `ms`. */
async function settleWithin<T>(p: Promise<T>, ms: number): Promise<Outcome> {
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ status: 'timeout' }>(resolve => {
    timer = setTimeout(() => resolve({ status: 'timeout' }), ms);
  });
  try {
    const outcome = await Promise.race([
      p.then(
        v => ({ status: 'resolved' as const, value: v as unknown }),
        e => ({ status: 'rejected' as const, value: e as unknown }),
      ),
      timeout,
    ]);
    return { ...outcome, elapsed: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

describe('RateLimiter.wait() over-burst (#905)', () => {
  let limiter: RateLimiter | undefined;
  afterEach(() => { limiter?.dispose(); limiter = undefined; });

  it('rejects promptly with RangeError when tokens > default maxBurst', async () => {
    limiter = new RateLimiter({ tokensPerSecond: 1000, maxBurst: 5 });
    const r = await settleWithin(limiter.wait('client', undefined, 6), SETTLE_BUDGET_MS);
    expect(r.status).toBe('rejected');
    expect(r.value).toBeInstanceOf(RangeError);
    expect((r.value as Error).message).toMatch(/exceeds maxBurst 5/);
    expect(r.elapsed).toBeLessThan(SETTLE_BUDGET_MS);
    // The rejected call neither created nor drained a bucket.
    expect(limiter.getClientStats('client')).toBeNull();
    expect(limiter.getStats().totalRequests).toBe(0);
  });

  it('uses the endpoint-specific maxBurst of the resolved bucket', async () => {
    limiter = new RateLimiter({ tokensPerSecond: 1000, maxBurst: 100 });
    limiter.addEndpointLimit({ pattern: /^tight$/, tokensPerSecond: 1000, maxBurst: 3 });
    const r = await settleWithin(limiter.wait('client', 'tight', 4), SETTLE_BUDGET_MS);
    expect(r.status).toBe('rejected');
    expect(r.value).toBeInstanceOf(RangeError);
    // The same cost against the default bucket is admissible.
    const ok = await settleWithin(limiter.wait('client', 'other', 4), SETTLE_BUDGET_MS);
    expect(ok.status).toBe('resolved');
    expect((ok.value as { allowed: boolean }).allowed).toBe(true);
  });

  it('rejects instead of spinning when an exhausted bucket can never refill', async () => {
    limiter = new RateLimiter({ tokensPerSecond: 1000, maxBurst: 100 });
    limiter.addEndpointLimit({ pattern: /^frozen$/, tokensPerSecond: 0, maxBurst: 1 });
    expect(limiter.consume('client', 'frozen').allowed).toBe(true);
    const r = await settleWithin(limiter.wait('client', 'frozen', 1), SETTLE_BUDGET_MS);
    expect(r.status).toBe('rejected');
    expect(r.value).toBeInstanceOf(RangeError);
  });

  it('still waits for refill and resolves when tokens === maxBurst', async () => {
    limiter = new RateLimiter({ tokensPerSecond: 100, maxBurst: 2 });
    expect(limiter.consume('client', undefined, 2).allowed).toBe(true);
    const r = await settleWithin(limiter.wait('client', undefined, 2), 1000);
    expect(r.status).toBe('resolved');
    expect((r.value as { allowed: boolean }).allowed).toBe(true);
    expect(r.elapsed).toBeGreaterThanOrEqual(10); // genuinely waited for refill
  });

  it('keeps rejecting invalid costs with RangeError', async () => {
    limiter = new RateLimiter({ tokensPerSecond: 10, maxBurst: 5 });
    await expect(limiter.wait('client', undefined, Number.NaN)).rejects.toBeInstanceOf(RangeError);
  });
});
