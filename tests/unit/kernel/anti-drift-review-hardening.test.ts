/**
 * Review follow-ups for #1077 / #1078 (anti-drift middleware):
 * - the emit-time payload text cache is released once onReceive reads it,
 * - an embedder outage is counted in getStats() even while warnings are rate limited,
 * - the warning rate limiter evicts its oldest key instead of wiping every key,
 *   and carries the evicted key's suppressed count into the next warning.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DomainEvent } from '../../../src/shared/types/index.js';
const mocks = vi.hoisted(() => ({ embed: vi.fn(), warn: vi.fn() }));
vi.mock('../../../src/learning/real-embeddings.js', () => ({
  isTransformerAvailable: () => true, computeRealEmbedding: mocks.embed,
}));
vi.mock('../../../src/logging/index.js', () => ({
  LoggerFactory: { create: () => ({ warn: mocks.warn, debug: vi.fn() }) },
}));
import { SemanticAntiDriftMiddleware } from '../../../src/kernel/anti-drift-middleware.js';
import type { SemanticFingerprint } from '../../../src/shared/types/index.js';

const event = (type: string, payload: Record<string, unknown> = { v: 'original' }): DomainEvent =>
  ({ id: `${type}-${Math.random()}`, type, source: 'coverage-analysis', timestamp: new Date(), payload });
/** Original payloads embed to one axis, anything else to the orthogonal one. */
const embedByText = async (text: string) => (text.includes('original') ? [1, 0] : [0, 1]);
const cache = (mw: SemanticAntiDriftMiddleware) =>
  (mw as unknown as { emittedPayloadText: WeakMap<SemanticFingerprint, string> }).emittedPayloadText;

async function drift(mw: SemanticAntiDriftMiddleware, type: string): Promise<DomainEvent | null> {
  const emitted = await mw.onEmit(event(type));
  return mw.onReceive({ ...emitted, payload: { v: 'tampered' } } as DomainEvent);
}

describe('anti-drift review hardening', () => {
  beforeEach(() => { mocks.embed.mockReset().mockImplementation(embedByText); mocks.warn.mockReset(); });
  afterEach(() => vi.useRealTimers());

  it('releases the cached emit-time payload text once onReceive has read it', async () => {
    const mw = new SemanticAntiDriftMiddleware();
    const emitted = await mw.onEmit(event('coverage.GapFound'));
    const fp = emitted.semanticFingerprint!;
    expect(cache(mw).has(fp)).toBe(true);
    expect(await mw.onReceive(emitted)).not.toBeNull();
    expect(cache(mw).has(fp)).toBe(false);
    expect(mocks.embed).toHaveBeenCalledTimes(1); // the receive still skipped re-embedding
    // A second receive of the same fingerprint (not done by the bus) re-embeds and still verifies.
    expect(await mw.onReceive(emitted)).not.toBeNull();
    expect(mocks.embed).toHaveBeenCalledTimes(2);
    expect(mw.getStats()).toMatchObject({ totalChecked: 2, driftCount: 0, averageSimilarity: 1 });
  });

  it('counts every event delivered unverified, even when the outage warning is suppressed', async () => {
    const mw = new SemanticAntiDriftMiddleware();
    mocks.embed.mockRejectedValue(new Error('embedder offline'));
    for (let n = 0; n < 20; n++) await mw.onEmit(event('TaskCompleted'));
    expect(mocks.warn).toHaveBeenCalledTimes(1);
    expect(mw.getStats()).toMatchObject({ totalChecked: 0, driftCount: 0, unverifiedCount: 20 });
  });

  it('counts a receive-side outage once and keeps unverifiedCount at 0 when healthy', async () => {
    const mw = new SemanticAntiDriftMiddleware();
    const emitted = await mw.onEmit(event('coverage.GapFound'));
    expect(mw.getStats().unverifiedCount).toBe(0);
    mocks.embed.mockRejectedValueOnce(new Error('embedder offline'));
    const changed = { ...emitted, payload: { v: 'changed' } } as DomainEvent;
    expect(await mw.onReceive(changed)).not.toBeNull();
    expect(mw.getStats()).toMatchObject({ totalChecked: 0, unverifiedCount: 1 });
  });

  it('evicts only the oldest rate-limit key and reports its suppressed drops', async () => {
    const mw = new SemanticAntiDriftMiddleware();
    expect(await drift(mw, 'data.Oldest')).toBeNull();
    for (let n = 0; n < 3; n++) await drift(mw, 'data.Oldest'); // suppressed: 3
    for (let k = 1; k < 256; k++) await drift(mw, `data.Key${k}`); // limiter now full
    expect(mocks.warn).toHaveBeenCalledTimes(256);

    await drift(mw, 'data.Newcomer'); // evicts data.Oldest
    const last = mocks.warn.mock.calls.at(-1)!;
    expect(last[1]).toMatchObject({ eventType: 'data.Newcomer', suppressedForEvictedKeys: 3 });

    // Recently warned keys keep their window: no fresh warning, suppression counted.
    await drift(mw, 'data.Key255');
    expect(mocks.warn).toHaveBeenCalledTimes(257);
    expect(mw.getStats().driftCount).toBe(4 + 255 + 1 + 1);
  });
});
