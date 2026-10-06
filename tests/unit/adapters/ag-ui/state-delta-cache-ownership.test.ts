import { describe, expect, it } from 'vitest';
import { StateDeltaCache } from '../../../../src/adapters/ag-ui/state-delta-cache.js';
import { applyPatch } from '../../../../src/adapters/ag-ui/json-patch.js';

describe('State delta cache value ownership', () => {
  it.each(['getDelta', 'precompute'] as const)('detaches cache entries from the %s result and input values', (method) => {
    const cache = new StateDeltaCache({ warmOnInit: false });
    const from = { status: 'idle', items: [] };
    const to = { status: 'running', items: [{ detail: 'expected' }] };
    const expected = structuredClone(to);
    const returned = cache[method](from, to);
    returned.length = 0;
    to.items[0].detail = 'changed externally';
    const cached = cache.getDelta(from, expected);
    expect(applyPatch(from, cached).document).toEqual(expected);
    cached.length = 0;
    expect(applyPatch(from, cache.getDelta(from, expected)).document).toEqual(expected);
  });
});
