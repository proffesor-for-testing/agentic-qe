/**
 * Issue #914: cached deltas are cloned with JSON semantics, the same semantics
 * #857 uses to hash state. Since #864, structuredClone threw DataCloneError when
 * state held a function. AG-UI state is JSON, so non-JSON values now follow
 * JSON.stringify rules on both cache misses and cache hits.
 */
import { describe, expect, it } from 'vitest';
import { StateDeltaCache } from '../../../../src/adapters/ag-ui/state-delta-cache.js';
import { applyPatch } from '../../../../src/adapters/ag-ui/json-patch.js';

const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe('StateDeltaCache JSON-safe delta clones (#914)', () => {
  it.each(['getDelta', 'precompute'] as const)('%s accepts state that holds a function', (method) => {
    const cache = new StateDeltaCache({ warmOnInit: false });
    const from = { status: 'idle' };
    const to = { status: 'running', onDone: () => 'callback', nested: { keep: 1, drop: () => 2 } };

    const first = cache[method](from, to);
    const hit = cache.getDelta(from, to);

    expect(hit).toEqual(first);
    expect(JSON.stringify(first)).not.toContain('callback');
    expect(first.every(op => typeof (op as { value?: unknown }).value !== 'function')).toBe(true);
    expect(applyPatch(from, hit).document).toEqual(json(to));
  });

  it('returns the same delta for states that hash the same', () => {
    const cache = new StateDeltaCache({ warmOnInit: false });
    const from = { count: 1 };
    const withFunction = cache.getDelta(from, { count: 2, fn: () => 1 });
    const plain = cache.getDelta(from, { count: 2 });
    expect(plain).toEqual(withFunction);
    expect(new StateDeltaCache({ warmOnInit: false }).getDelta(from, { count: 2 })).toEqual(withFunction);
  });

  it('serializes Dates, undefined and array holes the same way on a miss and a hit', () => {
    const cache = new StateDeltaCache({ warmOnInit: false });
    const from = { items: [] as unknown[] };
    const to = { at: new Date('2026-10-11T00:00:00.000Z'), gone: undefined, items: [undefined, 1] };
    const miss = cache.getDelta(from, to);
    const hit = cache.getDelta(from, to);
    expect(hit).toEqual(miss);
    expect(applyPatch(from, miss).document).toEqual({ at: '2026-10-11T00:00:00.000Z', items: [null, 1] });
  });

  it('still fails predictably on values JSON cannot represent', () => {
    const cache = new StateDeltaCache({ warmOnInit: false });
    expect(() => cache.getDelta({}, { big: 1n })).toThrow(TypeError);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => cache.getDelta({}, cyclic)).toThrow(TypeError);
  });

  it('still detaches cached deltas from returned arrays and values', () => {
    const cache = new StateDeltaCache({ warmOnInit: false });
    const from = { list: [] as Array<{ v: number }> };
    const to = { list: [{ v: 1 }] };
    const first = cache.getDelta(from, to);
    (first[0] as { value: unknown }).value = 'mutated';
    first.length = 0;
    expect(applyPatch(from, cache.getDelta(from, to)).document).toEqual(to);
  });
});
