import { describe, expect, it } from 'vitest';
import { StateDeltaCache } from '../../../../src/adapters/ag-ui/state-delta-cache.js';
import { applyPatch } from '../../../../src/adapters/ag-ui/json-patch.js';

const json = (value: Record<string, unknown>) => JSON.parse(JSON.stringify(value));

describe('State delta cache JSON state representation', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['function property', { status: 'running', callback: () => 1 }],
    ['nested function', { item: { text: 'value', callback: () => 1 } }],
    ['array function', { items: [() => 1, 'retained'] }],
    ['date', { time: new Date('2026-01-01T00:00:00Z') }],
    ['undefined array value', { items: [undefined, 'retained'] }],
  ];
  it.each(cases)('returns the same JSON state on misses and hits for %s', (_, target) => {
    const cache = new StateDeltaCache({ warmOnInit: false });
    const source = { status: 'idle' };
    const first = cache.getDelta(source, target);
    expect(applyPatch(json(source), first).document).toEqual(json(target));
    const cached = cache.getDelta(source, json(target));
    expect(cached).toEqual(first);
    expect(applyPatch(json(source), cached).document).toEqual(json(target));
    expect(cache.getMetrics().hits).toBe(1);
  });
  it('precomputes a flat function-valued state as JSON', () => {
    const cache = new StateDeltaCache({ warmOnInit: false });
    const target = { status: 'running', callback: () => 1 };
    expect(applyPatch({}, cache.precompute({}, target)).document).toEqual(json(target));
    expect(cache.getDelta({}, json(target))).toEqual([{ op: 'add', path: '/status', value: 'running' }]);
  });
  it('precomputes JSON-safe values and preserves returned-value ownership', () => {
    const cache = new StateDeltaCache({ warmOnInit: false });
    const target = { item: { text: 'retained', callback: () => 1 } };
    const delta = cache.precompute({}, target);
    expect(applyPatch({}, delta).document).toEqual(json(target));
    delta.length = 0;
    expect(applyPatch({}, cache.getDelta({}, json(target))).document).toEqual(json(target));
  });
  it('preserves ordinary JSON patch and cache ownership control', () => {
    const cache = new StateDeltaCache({ warmOnInit: false });
    const target = { values: [{ text: 'value' }], enabled: false, count: 0 };
    const delta = cache.getDelta({}, target);
    delta.length = 0;
    expect(applyPatch({}, cache.getDelta({}, target)).document).toEqual(target);
  });
  it.each(['getDelta', 'precompute'] as const)('rejects non-JSON cycles and BigInt before changing %s cache', method => {
    const cache = new StateDeltaCache({ warmOnInit: false });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => cache[method]({}, cyclic)).toThrow(TypeError);
    expect(() => cache[method]({}, { value: 1n })).toThrow(TypeError);
    expect(cache.getMetrics().size).toBe(0);
  });
});
