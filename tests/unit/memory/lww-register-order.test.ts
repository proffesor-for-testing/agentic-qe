import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLWWRegister } from '../../../src/memory/crdt/lww-register.js';

describe('LWW register total write ordering', () => {
  it.each([0, 1])('converges equal-timestamp writes at %s', (timestamp) => {
    const a = createLWWRegister<string>('a');
    const b = createLWWRegister<string>('b');
    a.set('left', timestamp);
    b.set('right', timestamp);
    const left = a.getState();
    const right = b.getState();
    a.applyState(right);
    b.applyState(left);
    expect(a.get()).toBe('right');
    expect(b.get()).toBe('right');
  });

  it('rejects an older write after an actual epoch-zero value', () => {
    const register = createLWWRegister('owner', 'retained', 0);
    register.set('stale', -1);
    expect(register.get()).toBe('retained');
  });

  it('does not increment the version when replaying an epoch-zero write', () => {
    const register = createLWWRegister<string>('owner');
    register.set('retained', 0);
    const state = register.getState();
    register.applyState(state);
    expect(register.getState().version).toBe(state.version);
  });

  it('orders distinct canonically equivalent Unicode owner IDs', () => {
    const a = createLWWRegister<string>('\u00e9');
    const b = createLWWRegister<string>('e\u0301');
    a.set('left', 1);
    b.set('right', 1);
    const left = a.getState();
    const right = b.getState();
    a.applyState(right);
    b.applyState(left);
    expect(a.get()).toBe('left');
    expect(b.get()).toBe('left');
  });

  it('accepts the first write at a negative timestamp', () => {
    const register = createLWWRegister<string>('owner');
    register.set('first', -1);
    expect(register.get()).toBe('first');
  });

  it('treats a written undefined value as initialized', () => {
    const register = createLWWRegister<string | undefined>('owner');
    register.set(undefined, 0);
    register.set('stale', -1);
    expect(register.get()).toBeUndefined();
  });

  it('treats an unwritten register as the merge identity', () => {
    const writer = createLWWRegister<string>('a');
    writer.set('neg', -1);
    const before = writer.getState();
    writer.applyState(createLWWRegister<string>('r').getState());
    expect(writer.get()).toBe('neg');
    expect(writer.getState().version).toBe(before.version);
  });

  describe('consecutive local writes without an explicit timestamp', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('keeps the later write when the clock has not advanced', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      const register = createLWWRegister<string>('owner');
      register.set('first');
      register.set('second');
      expect(register.get()).toBe('second');
    });

    it('keeps the later write after the clock steps backwards', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      const register = createLWWRegister<string>('owner');
      register.set('first');
      vi.setSystemTime(900);
      register.set('second');
      expect(register.get()).toBe('second');
    });

    it('lets a replica that saw the first write converge on the second', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      const a = createLWWRegister<string>('a');
      const b = createLWWRegister<string>('b');
      a.set('first');
      b.applyState(a.getState());
      a.set('second');
      b.applyState(a.getState());
      expect(b.get()).toBe('second');
    });

    it('still lets a newer remote write win over a local one', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      const register = createLWWRegister<string>('a');
      register.set('local');
      register.applyState({ value: 'remote', timestamp: 5000, nodeId: 'b', version: 1, lastUpdated: 5000 });
      register.set('later local');
      expect(register.get()).toBe('remote');
    });
  });
});
