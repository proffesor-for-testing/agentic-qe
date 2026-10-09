import { describe, expect, it } from 'vitest';
import { StateDeltaCache } from '../../../../src/adapters/ag-ui/state-delta-cache.js';
import { applyPatch } from '../../../../src/adapters/ag-ui/json-patch.js';

describe('Custom state transition JSON Pointers', () => {
  it('decodes escaped field names before producing status patches', () => {
    const cache = new StateDeltaCache({ warmOnInit: false });
    const patch = cache.precomputeStatusTransition('/a~1b/~0status', 'idle', 'running');
    expect(applyPatch({ 'a/b': { '~status': 'idle' } }, patch).document).toEqual({ 'a/b': { '~status': 'running' } });
    expect(patch[0].path).toBe('/a~1b/~0status');
  });

  it('treats slash as the empty member name rather than the whole document', () => {
    const cache = new StateDeltaCache({ warmOnInit: false });
    const patch = cache.precomputeProgressTransition('/', 0, 50);
    expect(applyPatch({ '': 0, retained: true }, patch).document).toEqual({ '': 50, retained: true });
    expect(patch[0].path).toBe('/');
    expect(cache.precomputeStatusTransition('/status', 'idle', 'running')[0].path).toBe('/status');
  });
});
