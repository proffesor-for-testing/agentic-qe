/**
 * Tests for the HashChainGate TS port (ported from ruvector-proof-gate,
 * upstream ADR-194; AQE ADR-116).
 * Mirrors the Rust crate's re-derivation tamper cases + adds persistence round-trip.
 */

import { describe, it, expect } from 'vitest';

import { HashChainGate, type HashChainState } from '../../../src/integrations/ruvector/proof-gate.js';

function gateWith(n: number): HashChainGate {
  const g = new HashChainGate();
  for (let i = 0; i < n; i++) g.admit({ op: 'insert', table: 'qe_patterns', seq: i, rows: i * 10 });
  return g;
}

describe('HashChainGate — admission & receipts', () => {
  it('produces sequential, unique commitments and verifies its own receipts', () => {
    const g = new HashChainGate();
    const r0 = g.admit('a');
    const r1 = g.admit('b');
    expect(r0.sequence).toBe(0);
    expect(r1.sequence).toBe(1);
    expect(r0.chainCommitment).not.toBe(r1.chainCommitment);
    expect(g.verifyReceipt(r0)).toBe(true);
    expect(g.verifyReceipt(r1)).toBe(true);
    expect(g.length).toBe(2);
  });

  it('rejects a receipt whose commitment was altered', () => {
    const g = new HashChainGate();
    const r = g.admit('x');
    expect(g.verifyReceipt({ ...r, chainCommitment: 'deadbeef' })).toBe(false);
  });

  it('chains identical payloads to DIFFERENT commitments (order binds)', () => {
    const g = new HashChainGate();
    const a = g.admit('same');
    const b = g.admit('same');
    expect(a.payloadHash).toBe(b.payloadHash); // same content
    expect(a.chainCommitment).not.toBe(b.chainCommitment); // different chain position
  });

  it('canonicalizes object key order (equal payloads → equal hash)', () => {
    const g1 = new HashChainGate();
    const g2 = new HashChainGate();
    expect(g1.admit({ a: 1, b: 2 }).payloadHash).toBe(g2.admit({ b: 2, a: 1 }).payloadHash);
  });
});

describe('HashChainGate — verifyIntegrity (re-derivation)', () => {
  it('a clean chain (and an empty chain) re-verifies', () => {
    expect(gateWith(8).verifyIntegrity()).toBe(true);
    expect(new HashChainGate().verifyIntegrity()).toBe(true);
  });

  it('detects a mutated commitment, payload hash, reorder, and length mismatch', () => {
    // Mutated commitment
    const a = gateWith(8).toJSON();
    a.chain[3] = a.chain[3].replace(/^./, (c) => (c === 'f' ? '0' : 'f'));
    expect(HashChainGate.fromJSON(a).verifyIntegrity()).toBe(false);

    // Mutated payload hash
    const b = gateWith(8).toJSON();
    b.payloadHashes[2] = b.payloadHashes[2].replace(/^./, (c) => (c === 'f' ? '0' : 'f'));
    expect(HashChainGate.fromJSON(b).verifyIntegrity()).toBe(false);

    // Reordered entries
    const c = gateWith(8).toJSON();
    [c.chain[2], c.chain[5]] = [c.chain[5], c.chain[2]];
    [c.payloadHashes[2], c.payloadHashes[5]] = [c.payloadHashes[5], c.payloadHashes[2]];
    expect(HashChainGate.fromJSON(c).verifyIntegrity()).toBe(false);

    // Length mismatch
    const d = gateWith(8).toJSON();
    d.payloadHashes.pop();
    expect(HashChainGate.fromJSON(d).verifyIntegrity()).toBe(false);
  });
});

describe('HashChainGate — persistence round-trip', () => {
  it('survives toJSON/fromJSON with intact verification and continuable chain', () => {
    const g = gateWith(5);
    const state: HashChainState = g.toJSON();
    const restored = HashChainGate.fromJSON(state);

    expect(restored.verifyIntegrity()).toBe(true);
    expect(restored.chainRoot()).toBe(g.chainRoot());
    expect(restored.length).toBe(5);

    // Chain continues correctly from the restored head.
    const r = restored.admit('after-restore');
    expect(r.sequence).toBe(5);
    expect(restored.verifyIntegrity()).toBe(true);
  });
});
