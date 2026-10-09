import { describe, expect, it } from 'vitest';
import { StateDeltaCache } from '../../../../src/adapters/ag-ui/state-delta-cache.js';
import { applyPatch } from '../../../../src/adapters/ag-ui/json-patch.js';

describe('State delta refresh at capacity', () => {
  it('does not evict an unrelated transition when refreshing an existing cache entry', () => {
    const cache = new StateDeltaCache({ maxSize: 2, warmOnInit: false });
    const firstFrom = { status: 'idle' };
    const firstTo = { status: 'running' };
    const secondFrom = { status: 'running' };
    const secondTo = { status: 'completed' };
    cache.precompute(firstFrom, firstTo);
    cache.precompute(secondFrom, secondTo);
    cache.precompute(secondFrom, secondTo);
    expect(cache.size).toBe(2);
    expect(cache.has(firstFrom, firstTo)).toBe(true);
    expect(cache.getMetrics().evictions).toBe(0);
    expect(applyPatch(firstFrom, cache.getDelta(firstFrom, firstTo)).document).toEqual(firstTo);
    cache.precompute({ status: 'completed' }, { status: 'idle' });
    expect(cache.size).toBe(2);
    expect(cache.getMetrics().evictions).toBe(1);
  });
});
