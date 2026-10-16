import { describe, expect, it } from 'vitest';
import {
  createLWWRegister,
  createLWWRegisterFromState,
  isLWWRegisterState,
} from '../../../src/memory/crdt/lww-register.js';

describe('LWW register finite timestamp boundaries (#987)', () => {
  const invalidTimestamps = [NaN, Infinity, -Infinity];

  it.each(invalidTimestamps)('rejects an invalid initial timestamp %s', (timestamp) => {
    expect(() => createLWWRegister('a', 'poison', timestamp)).toThrow(RangeError);
  });

  it.each(invalidTimestamps)('rejects a local write at %s before mutation', (timestamp) => {
    const register = createLWWRegister('a', 'retained', 5);
    const before = register.getState();
    expect(() => register.set('poison', timestamp)).toThrow(RangeError);
    expect(register.getState()).toEqual(before);
    register.set('newer', 6);
    expect(register.get()).toBe('newer');
  });

  it.each(invalidTimestamps)('rejects an invalid replicated timestamp %s before mutation', (timestamp) => {
    const register = createLWWRegister('a', 'retained', 5);
    const before = register.getState();
    const incoming = { ...before, value: 'poison', nodeId: 'b', timestamp };
    expect(() => register.applyState(incoming)).toThrow(RangeError);
    expect(register.getState()).toEqual(before);
    expect(() => createLWWRegisterFromState('c', incoming)).toThrow(RangeError);
    expect(isLWWRegisterState(incoming)).toBe(false);
  });

  it('does not poison an unwritten replica when an invalid state arrives first', () => {
    const a = createLWWRegister<string>('a');
    const b = createLWWRegister('b', 'valid', 5);
    expect(() => a.applyState({ ...b.getState(), timestamp: NaN })).toThrow(RangeError);
    a.merge(b);
    b.merge(a);
    expect(a.get()).toBe('valid');
    expect(b.get()).toBe('valid');
  });

  it('rejects a non-finite timestamp serialized as null rather than restoring it', () => {
    const state = createLWWRegister('a', 'poison', 5).getState();
    const serialized = JSON.parse(JSON.stringify({ ...state, timestamp: NaN }));
    expect(isLWWRegisterState(serialized)).toBe(false);
    expect(() => createLWWRegisterFromState('b', serialized)).toThrow(RangeError);
  });

  it.each([-1000, -0.5, 0, 0.5, Number.MAX_VALUE])('preserves finite timestamp %s', (timestamp) => {
    const a = createLWWRegister('a', 'valid', timestamp);
    const state = a.getState();
    expect(isLWWRegisterState(state)).toBe(true);
    expect(createLWWRegisterFromState('b', state).get()).toBe('valid');
    expect(a.getTimestamp()).toBe(timestamp);
  });
});
