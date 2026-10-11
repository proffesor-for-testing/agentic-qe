import { describe, expect, it } from 'vitest';
import { createCRDTStore } from '../../../src/memory/crdt/crdt-store.js';
import type { CRDTStoreDelta } from '../../../src/memory/crdt/types.js';

const transport = (delta: CRDTStoreDelta): CRDTStoreDelta => JSON.parse(JSON.stringify(delta));

describe('CRDT delta checkpoint continuity', () => {
  it.each(['fresh', 'stale'])('replicates a complete checkpoint to a %s peer after trimming', (kind) => {
    const source = createCRDTStore({ nodeId: 'source', maxDeltaHistory: 1 });
    const peer = createCRDTStore({ nodeId: 'peer' });
    source.setRegister('early', 'retained');
    source.incrementGCounter('positive', 4);
    source.incrementCounter('net', 5);
    source.decrementCounter('net', 2);
    source.addToSet('members', 'removed');
    source.addToSet('members', 'retained');
    const initial = source.getDelta(0)!;
    if (kind === 'stale') peer.applyDelta(transport(initial));
    const checkpoint = kind === 'stale' ? initial.toVersion : 0;
    source.removeFromSet('members', 'removed');
    source.getDelta(initial.toVersion);
    source.setRegister('late', 'new');
    const delta = transport(source.getDelta(checkpoint)!);
    peer.applyDelta(delta);
    expect(delta.fromVersion).toBe(checkpoint);
    expect(delta.toVersion).toBe(source.getVersion());
    expect(peer.getRegister('early').get()).toBe('retained');
    expect(peer.getRegister('late').get()).toBe('new');
    expect(peer.getGCounter('positive').get()).toBe(4);
    expect(peer.getCounter('net').get()).toBe(3);
    expect(peer.getSet('members').values()).toEqual(['retained']);
    expect(delta.sets!.members.tombstones['s:removed']).toHaveLength(1);
    peer.applyDelta(delta);
    expect(peer.getGCounter('positive').get()).toBe(4);
    expect(peer.getCounter('net').get()).toBe(3);
  });

  it('retains incremental delivery for a checkpoint inside the retained window', () => {
    const source = createCRDTStore({ nodeId: 'source', maxDeltaHistory: 1 });
    source.setRegister('early', 'retained');
    const initial = source.getDelta(0)!;
    source.setRegister('late', 'new');
    const delta = source.getDelta(initial.toVersion)!;
    expect(Object.keys(delta.registers!)).toEqual(['late']);
    expect(delta.fromVersion).toBe(initial.toVersion);
  });

  it('returns no delta for an up-to-date peer', () => {
    const source = createCRDTStore({ nodeId: 'source', maxDeltaHistory: 1 });
    source.setRegister('value', 'retained');
    source.getDelta(0);
    expect(source.getDelta(source.getVersion())).toBeNull();
  });

  it('retains normal complete delivery while history is available', () => {
    const source = createCRDTStore({ nodeId: 'source', maxDeltaHistory: 2 });
    source.setRegister('early', 'retained');
    source.getDelta(0);
    source.setRegister('late', 'new');
    const peer = createCRDTStore({ nodeId: 'peer' });
    peer.applyDelta(transport(source.getDelta(0)!));
    expect(peer.getRegister('early').get()).toBe('retained');
    expect(peer.getRegister('late').get()).toBe('new');
  });
});
