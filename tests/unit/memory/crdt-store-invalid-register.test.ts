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
            for (const key of ['a', 'b', 'c']) remote.setRegister(key, key.toUpperCase());
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
            if (existing) local.setRegister('b', 'retained');
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


describe('cleared registers survive JSON replication (#1087)', () => {
  for (const operation of ['state', 'delta'] as const) {
    it(`${operation} propagates a clear over an older value without resurrecting it`, () => {
      const receiver = createCRDTStore({ nodeId: 'receiver' });
      receiver.getRegister('key').set('old', 10);
      const sender = createCRDTStore({ nodeId: 'sender' });
      sender.applyState(receiver.getState());
      sender.setRegister('key', undefined);
      const payload = JSON.parse(JSON.stringify(
        operation === 'state' ? sender.getState() : sender.getDelta(0),
      ));
      // JSON omits undefined values, but the timestamp still carries the clear.
      expect(payload.registers.key).not.toHaveProperty('value');
      if (operation === 'state') receiver.applyState(payload);
      else receiver.applyDelta(payload);
      expect(receiver.getRegister('key').get()).toBeUndefined();
      sender.applyState(JSON.parse(JSON.stringify(receiver.getState())));
      expect(sender.getRegister('key').get()).toBeUndefined();
    });
  }

  it('restores the presence of a cleared register after JSON persistence', () => {
    const sender = createCRDTStore({ nodeId: 'sender' });
    sender.setRegister('key', undefined);
    const restored = createCRDTStoreFromState('restored', JSON.parse(JSON.stringify(sender.getState())));
    expect(restored.hasRegister('key')).toBe(true);
    expect(restored.getRegister('key').get()).toBeUndefined();
  });
});
