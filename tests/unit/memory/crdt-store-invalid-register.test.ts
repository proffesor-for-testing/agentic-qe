import { describe, expect, it } from 'vitest';
import {
  createCRDTStore,
  createCRDTStoreFromState,
} from '../../../src/memory/crdt/crdt-store.js';
import type {
  CRDTChangeEvent,
  CRDTStoreDelta,
} from '../../../src/memory/crdt/types.js';

describe('CRDT store replication with an invalid register (#1087)', () => {
  for (const operation of ['state', 'delta', 'restore'] as const) {
    for (const timestamp of [NaN, Infinity, -Infinity, null, '5', undefined]) {
      for (const position of [0, 1, 2]) {
        for (const existing of operation === 'restore' ? [false] : [false, true]) {
          it(`${operation} skips timestamp ${String(timestamp)} at position ${position}, existing=${existing}`, () => {
            const remote = createCRDTStore({ nodeId: 'remote' });
            for (const key of ['a', 'b', 'c']) remote.setRegister(key, key.toUpperCase(), 10);
            remote.incrementGCounter('hits', 3);
            remote.incrementCounter('balance', 4);
            remote.decrementCounter('balance', 1);
            remote.addToSet('members', 'alice');
            const state = remote.getState();
            state.registers.b.timestamp = timestamp as number;
            const entries = Object.entries(state.registers).filter(([key]) => key !== 'b');
            entries.splice(position, 0, ['b', state.registers.b]);
            state.registers = Object.fromEntries(entries);
            const delta: CRDTStoreDelta = { ...state, fromVersion: 0, toVersion: 20 };
            // Persisted NaN/Infinity become null; undefined disappears from JSON.
            const local = operation === 'restore'
              ? createCRDTStoreFromState('local', JSON.parse(JSON.stringify(state)))
              : createCRDTStore({ nodeId: 'local' });
            if (existing) local.setRegister('b', 'retained', 5);
            const events: CRDTChangeEvent[] = [];
            local.on('change', event => events.push(event));
            const apply = () => operation === 'delta' ? local.applyDelta(delta) : local.applyState(state);
            if (operation !== 'restore') expect(apply).not.toThrow();

            expect(local.getRegister('a').get()).toBe('A');
            expect(local.getRegister('c').get()).toBe('C');
            if (existing) expect(local.getRegister('b').get()).toBe('retained');
            else expect(local.hasRegister('b')).toBe(false);
            expect(local.getGCounter('hits').get()).toBe(3);
            expect(local.getCounter('balance').get()).toBe(3);
            expect(local.getSet('members').has('alice')).toBe(true);
            expect(local.getVersion()).toBeGreaterThan(0);
            expect(events.some(event => event.key === 'b')).toBe(false);

            if (operation !== 'restore') {
              expect(apply).not.toThrow();
              expect(local.getRegister('c').get()).toBe('C');
              expect(local.getGCounter('hits').get()).toBe(3);
            }
          });
        }
      }
    }
  }
});
