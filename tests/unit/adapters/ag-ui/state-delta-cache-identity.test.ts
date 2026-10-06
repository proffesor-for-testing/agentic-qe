import { describe, it, expect } from 'vitest';
import { StateDeltaCache } from '../../../../src/adapters/ag-ui/state-delta-cache.js';
import { applyPatch } from '../../../../src/adapters/ag-ui/json-patch.js';

describe('nested state delta identity', () => {
  it('keeps different nested transitions distinct and applies each correct delta', () => {
    const cache = new StateDeltaCache({ warmOnInit: false });
    const source = { agent: { status: 'idle', metadata: { attempt: 1 } } };
    for (const target of [
      { agent: { status: 'running', metadata: { attempt: 1 } } },
      { agent: { status: 'completed', metadata: { attempt: 2 } } },
    ]) {
      expect(applyPatch(source, cache.getDelta(source, target)).document).toEqual(target);
    }
    expect(cache.getMetrics().misses).toBe(2);
  });
  it('recognizes equal nested objects regardless of object key order', () => {
    const cache = new StateDeltaCache({ warmOnInit: false });
    cache.getDelta({ x: { a: 1, b: 2 } }, { x: { a: 2, b: 3 } });
    cache.getDelta({ x: { b: 2, a: 1 } }, { x: { b: 3, a: 2 } });
    expect(cache.getMetrics().hits).toBe(1);
  });
  it('keeps array order significant and warmed status transitions usable', () => {
    const cache = new StateDeltaCache();
    const source = { agent: { status: 'idle' } };
    for (const status of ['running', 'completed']) {
      const target = { agent: { status } };
      expect(applyPatch(source, cache.getDelta(source, target)).document).toEqual(target);
    }
    cache.getDelta({ values: [1, 2] }, { values: [2, 1] });
    expect(cache.has({ values: [2, 1] }, { values: [1, 2] })).toBe(false);
  });
});
