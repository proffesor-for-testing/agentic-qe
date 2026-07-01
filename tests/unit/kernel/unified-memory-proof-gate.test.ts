/**
 * Proof-gate wiring into the live memory.db kv path (AQE ADR-116; upstream ADR-194).
 *
 * Verifies the tamper-evident hash-chain audit added to UnifiedMemoryManager:
 * opt-in, no-op when disabled, one receipt per write once enabled, persistence
 * across process restarts, and detection of a mutated audit chain.
 *
 * Uses an isolated temp DB — never the production .agentic-qe/memory.db.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  getUnifiedMemory,
  initializeUnifiedMemory,
  resetUnifiedMemory,
} from '../../../src/kernel/unified-memory';

const TEST_DB_DIR = '/tmp/aqe-proof-gate-test-' + Date.now();
const dbPath = path.join(TEST_DB_DIR, 'memory.db');

beforeEach(() => {
  resetUnifiedMemory();
  fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  delete process.env.AQE_PROOF_GATE;
});

afterEach(() => {
  resetUnifiedMemory();
  fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
  delete process.env.AQE_PROOF_GATE;
});

describe('UnifiedMemoryManager proof-gate (ADR-194)', () => {
  it('should be disabled by default and not audit writes', async () => {
    const um = await initializeUnifiedMemory({ dbPath });

    await um.kvSet('k1', { a: 1 });

    expect(um.isProofGateEnabled()).toBe(false);
    expect(um.getProofChainLength()).toBe(0);
    expect(um.getProofChainRoot()).toBeNull();
  });

  it('should throw on verifyMemoryIntegrity when the gate is disabled', async () => {
    const um = await initializeUnifiedMemory({ dbPath });

    expect(() => um.verifyMemoryIntegrity()).toThrow(/not enabled/);
  });

  it('should admit exactly one receipt per kv write once enabled', async () => {
    const um = await initializeUnifiedMemory({ dbPath });
    um.enableProofGate();

    await um.kvSet('k1', { a: 1 });
    await um.kvSet('k2', { b: 2 });
    await um.kvDelete('k1');

    // 2 sets + 1 delete = 3 admitted receipts (the chain's own persistence
    // writes to the reserved namespace and must NOT be audited).
    expect(um.getProofChainLength()).toBe(3);
    expect(um.verifyMemoryIntegrity()).toBe(true);
    expect(um.getProofChainRoot()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should advance the chain root on each audited write', async () => {
    const um = await initializeUnifiedMemory({ dbPath });
    um.enableProofGate();

    await um.kvSet('k1', { a: 1 });
    const root1 = um.getProofChainRoot();
    await um.kvSet('k2', { b: 2 });
    const root2 = um.getProofChainRoot();

    expect(root1).not.toBe(root2);
  });

  it('should persist the chain and verify across a manager restart', async () => {
    const first = await initializeUnifiedMemory({ dbPath });
    first.enableProofGate();
    await first.kvSet('k1', { a: 1 });
    await first.kvSet('k2', { b: 2 });
    const rootBefore = first.getProofChainRoot();
    resetUnifiedMemory();

    // Fresh manager on the same DB restores the persisted chain.
    const second = await initializeUnifiedMemory({ dbPath });
    second.enableProofGate();

    expect(second.getProofChainLength()).toBe(2);
    expect(second.getProofChainRoot()).toBe(rootBefore);
    expect(second.verifyMemoryIntegrity()).toBe(true);
  });

  it('should detect a mutated audit chain (tamper-evidence)', async () => {
    const um = await initializeUnifiedMemory({ dbPath });
    um.enableProofGate();
    await um.kvSet('k1', { a: 1 });
    await um.kvSet('k2', { b: 2 });

    // Tamper: flip a byte in the persisted chain commitment, directly in kv_store.
    const db = um.getDatabase();
    const row = db
      .prepare(`SELECT value FROM kv_store WHERE namespace = '__proofgate__' AND key = 'chain'`)
      .get() as { value: string };
    const state = JSON.parse(row.value);
    state.chain[0] = state.chain[0].replace(/^./, (c: string) => (c === 'a' ? 'b' : 'a'));
    db.prepare(`UPDATE kv_store SET value = ? WHERE namespace = '__proofgate__' AND key = 'chain'`)
      .run(JSON.stringify(state));
    resetUnifiedMemory();

    // Reload the tampered chain and re-derive from genesis.
    const reopened = await initializeUnifiedMemory({ dbPath });
    reopened.enableProofGate();

    expect(reopened.verifyMemoryIntegrity()).toBe(false);
  });

  it('should auto-enable from AQE_PROOF_GATE=1 without an explicit call', async () => {
    process.env.AQE_PROOF_GATE = '1';
    const um = await initializeUnifiedMemory({ dbPath });

    await um.kvSet('k1', { a: 1 });

    expect(um.isProofGateEnabled()).toBe(true);
    expect(um.getProofChainLength()).toBe(1);
  });
});
