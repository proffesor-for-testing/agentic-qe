import { describe, it, expect } from 'vitest';
import { SessionOperationCache } from '../../../src/optimization/session-cache.js';
const cache = new SessionOperationCache({ persistToDb: false });
const key = (input: Record<string, unknown>) =>
  cache.computeFingerprint('test', 'action', input);
describe('session cache JSON identities', () => {
  it('keeps a one-element undefined or sparse array distinct from an empty array', () => {
    expect(key({ items: [undefined] })).not.toBe(key({ items: [] }));
    expect(key({ items: new Array(1) })).not.toBe(key({ items: [] }));
    expect(key({ items: [undefined] })).toBe(key({ items: [null] }));
  });
  it('honors different toJSON values instead of caching every Date as an empty object', () => {
    expect(key({ date: new Date('2026-01-01') })).not.toBe(
      key({ date: new Date('2026-01-02') }),
    );
    expect(key({ date: new Date('2026-01-01') })).toBe(
      key({ date: '2026-01-01T00:00:00.000Z' }),
    );
  });
  it('retains recursive key-order stability and JSON omission semantics', () => {
    expect(key({ b: { y: 1, x: 2 }, a: 3 })).toBe(
      key({ a: 3, b: { x: 2, y: 1 } }),
    );
    expect(key({ a: undefined, b: 1 })).toBe(key({ b: 1 }));
  });
});
