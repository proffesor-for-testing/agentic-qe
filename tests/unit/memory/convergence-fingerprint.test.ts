import { describe, expect, it } from 'vitest';
import { createCRDTStore } from '../../../src/memory/crdt/crdt-store.js';
import { createConvergenceTracker } from '../../../src/memory/crdt/convergence-tracker.js';
import type { CRDTStoreState } from '../../../src/memory/crdt/types.js';

function converged(left: CRDTStoreState, right: CRDTStoreState): boolean {
  const tracker = createConvergenceTracker();
  tracker.recordNodeState('left', left);
  tracker.recordNodeState('right', right);
  return tracker.hasConverged();
}

function setState(values: unknown[]): CRDTStoreState {
  const store = createCRDTStore({ nodeId: 'owner' });
  const set = store.getSet('items');
  for (const value of values) set.add(value);
  return store.getState();
}

describe('convergence state fingerprints', () => {
  it('does not certify different states with a polynomial hash collision', () => {
    expect(converged(setState(['Aa']), setState(['BB']))).toBe(false);
  });

  it('does not alias one delimiter-containing element with two elements', () => {
    expect(converged(setState(['a,s:b']), setState(['a', 'b']))).toBe(false);
  });

  it('distinguishes ordinary unequal states and typed values', () => {
    expect(converged(setState(['first']), setState(['second']))).toBe(false);
    expect(converged(setState([1]), setState(['1']))).toBe(false);
  });

  it('ignores set insertion order and internal addition tags', () => {
    expect(converged(setState(['a', 'b']), setState(['b', 'a']))).toBe(true);
  });

  it('compares active set membership while preserving removal semantics', () => {
    const store = createCRDTStore({ nodeId: 'owner' });
    store.getSet('items').add('removed');
    store.getSet('items').remove('removed');
    expect(converged(store.getState(), setState([]))).toBe(true);
    expect(converged(store.getState(), setState(['removed']))).toBe(false);
  });

  it('does not depend on register dictionary insertion order', () => {
    const store = createCRDTStore({ nodeId: 'owner' });
    store.setRegister('a', 1);
    store.setRegister('b', '1');
    const left = store.getState();
    const right = structuredClone(left);
    right.registers = { b: right.registers.b, a: right.registers.a };
    expect(converged(left, right)).toBe(true);
    right.registers.a.value = '1';
    expect(converged(left, right)).toBe(false);
  });

  it('ignores zero counter contributions but retains nonzero ownership', () => {
    const store = createCRDTStore({ nodeId: 'owner' });
    store.incrementGCounter('count', 2);
    const left = store.getState();
    const right = structuredClone(left);
    right.gCounters.count.counts.zero = 0;
    expect(converged(left, right)).toBe(true);
    right.gCounters.count.counts = { other: 2 };
    expect(converged(left, right)).toBe(false);
  });
});
