import { describe, expect, it } from 'vitest';
import { StateDeltaCache } from '../../../../src/adapters/ag-ui/state-delta-cache.js';

describe('State delta cache capacity configuration', () => {
  it.each([0, -1, 1.5, Number.NaN, Infinity])('rejects unsupported capacity %s before warming can begin', maxSize => {
    expect(() => new StateDeltaCache({ maxSize, warmOnInit: false })).toThrow(RangeError);
  });

  it('keeps valid capacity and warming bounded', () => {
    const warmed = new StateDeltaCache({ maxSize: 1 });
    expect(warmed.size).toBe(1);
    const cache = new StateDeltaCache({ maxSize: 1, warmOnInit: false });
    cache.precompute({ value: 0 }, { value: 1 });
    cache.precompute({ value: 1 }, { value: 2 });
    expect(cache.size).toBe(1);
    expect(cache.has({ value: 1 }, { value: 2 })).toBe(true);
  });
});
