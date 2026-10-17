/** #1078: a mid-session embedding outage must not lose lifecycle events. */
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
import { InMemoryEventBus } from '../../../src/kernel/event-bus.js';
const event = (id: string): DomainEvent => ({ id, type: 'TaskCompleted', source: 'quality-assessment',
  timestamp: new Date(), payload: { taskId: id, result: 'measured quality result' } });
const vector = [1, 0, 0, 0];

describe('anti-drift embedding failures do not prevent event delivery', () => {
  beforeEach(() => { mocks.embed.mockReset().mockResolvedValue(vector); mocks.warn.mockReset(); });
  afterEach(() => vi.useRealTimers());

  it('an emit-side failure delivers the original event without a fabricated fingerprint', async () => {
    const mw = new SemanticAntiDriftMiddleware();
    const bus = new InMemoryEventBus();
    bus.registerMiddleware(mw);
    const received: DomainEvent[] = [];
    bus.subscribe('TaskCompleted', async item => { received.push(item); });
    mocks.embed.mockRejectedValueOnce(new Error('private payload and endpoint token'));
    const original = event('emit-outage');
    await expect(bus.publish(original)).resolves.toBeUndefined();
    expect(received).toEqual([original]);
    expect(received[0].semanticFingerprint).toBeUndefined();
    expect(mw.getStats()).toMatchObject({ totalChecked: 0, driftCount: 0 });
    expect(mocks.warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain('private payload');
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain('endpoint token');
  });

  it('a receive-side failure delivers the event without comparing incompatible fallback vectors', async () => {
    const mw = new SemanticAntiDriftMiddleware();
    const bus = new InMemoryEventBus();
    bus.registerMiddleware(mw);
    const received: DomainEvent[] = [];
    bus.subscribe('TaskCompleted', async item => { received.push(item); });
    // Force a receive-side cache miss even when unchanged in-process payloads
    // skip their second inference (#1079).
    bus.registerMiddleware({ name: 'changed-in-transit', priority: 20,
      onEmit: async item => ({ ...item, payload: { changed: 'new semantic text' } }) });
    mocks.embed.mockResolvedValueOnce(vector).mockRejectedValueOnce(new Error('endpoint offline'));
    await bus.publish(event('receive-outage'));
    expect(received).toHaveLength(1);
    expect(received[0].semanticFingerprint?.embedding).toEqual(vector);
    expect(received[0].semanticFingerprint?.hopCount).toBe(0); // no check was completed
    expect(mw.getStats()).toMatchObject({ totalChecked: 0, driftCount: 0 });
    expect(mocks.warn).toHaveBeenCalledOnce();
  });

  it('a later healthy event is fingerprinted and checked normally', async () => {
    const mw = new SemanticAntiDriftMiddleware();
    mocks.embed.mockRejectedValueOnce(new Error('temporarily unavailable'));
    expect((await mw.onEmit(event('failed'))).semanticFingerprint).toBeUndefined();
    const recovered = await mw.onEmit(event('recovered'));
    expect(recovered.semanticFingerprint?.embedding).toEqual(vector);
    expect(await mw.onReceive(recovered)).not.toBeNull();
    expect(mw.getStats()).toMatchObject({ totalChecked: 1, driftCount: 0, averageSimilarity: 1 });
  });

  it('rate limits outage warnings and reports suppressed checks without logging payloads', async () => {
    vi.useFakeTimers();
    const mw = new SemanticAntiDriftMiddleware();
    mocks.embed.mockRejectedValue(new Error('untrusted error text'));
    for (let n = 0; n < 20; n++) await mw.onEmit(event(`failed-${n}`));
    expect(mocks.warn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60001);
    await mw.onEmit(event('still-down'));
    expect(mocks.warn).toHaveBeenCalledTimes(2);
    expect(mocks.warn.mock.calls[1][1]).toMatchObject({ suppressedSinceLastWarning: 19 });
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain('measured quality result');
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain('untrusted error text');
  });

  it('does not swallow serialization errors unrelated to the embedder', async () => {
    const mw = new SemanticAntiDriftMiddleware();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    await expect(mw.onEmit({ ...event('cyclic'), payload: cyclic })).rejects.toThrow(/circular/i);
    expect(mocks.warn).not.toHaveBeenCalled();
  });
});
