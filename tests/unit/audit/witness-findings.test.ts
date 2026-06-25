/**
 * Witnessed finding delivery (A7). Records delivered/blocked verdicts into a
 * tamper-evident chain (in-memory DB — never the real .db), round-trips Ed25519
 * signatures, and FAILS CLOSED on tampering.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createWitnessChain, type WitnessChain } from '../../../src/audit/witness-chain.js';
import { WitnessKeyManager } from '../../../src/audit/witness-key-manager.js';
import {
  recordDeliveredFindings, recordGateResult, verifyDeliveryChain, type DeliverableVerdict,
} from '../../../src/audit/witness-findings.js';

const verdict = (id: string, v: DeliverableVerdict['verdict']): DeliverableVerdict => ({
  id, title: `claim ${id}`, verdict: v, severity: 'high', file: `src/${id}.ts`, confidence: 0.9, refutations: v === 'refuted' ? ['fabricated'] : [],
});

async function makeChain(km?: WitnessKeyManager): Promise<{ chain: WitnessChain; db: Database.Database }> {
  const db = new Database(':memory:');
  const chain = createWitnessChain(db, km);
  await chain.initialize();
  return { chain, db };
}

describe('witness-findings — delivery provenance (A7)', () => {
  let chain: WitnessChain;
  let db: Database.Database;
  beforeEach(async () => { ({ chain, db } = await makeChain()); });

  it('should append delivered findings as a verifiable chain', async () => {
    const entries = recordDeliveredFindings(chain, [verdict('a', 'upheld'), verdict('b', 'upheld')]);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.action_type === 'FINDING_DELIVERED')).toBe(true);
    expect(verifyDeliveryChain(chain)).toEqual({ valid: true, entriesChecked: 2 });
  });

  it('should record a gate result as DELIVERED survivors + BLOCKED kills', async () => {
    const { delivered, blocked } = recordGateResult(chain, {
      emitted: [verdict('real', 'upheld')],
      blocked: [verdict('fake', 'refuted')],
    });
    expect(delivered[0].action_type).toBe('FINDING_DELIVERED');
    expect(blocked[0].action_type).toBe('FINDING_BLOCKED');
    expect(verifyDeliveryChain(chain).entriesChecked).toBe(2);
  });

  it('should FAIL CLOSED — throw when the delivery chain is tampered', () => {
    recordDeliveredFindings(chain, [verdict('a', 'upheld'), verdict('b', 'upheld'), verdict('c', 'upheld')]);
    // Tamper with a stored finding's payload directly in the DB.
    db.prepare("UPDATE witness_chain SET action_data = ? WHERE id = 2").run(JSON.stringify({ id: 'b', tampered: true }));
    expect(() => verifyDeliveryChain(chain)).toThrow(/tampering detected/i);
  });

  it('should sign + verify delivered findings when a key manager is present', async () => {
    const km = new WitnessKeyManager();
    ({ chain } = await makeChain(km));
    const [entry] = recordDeliveredFindings(chain, [verdict('signed', 'upheld')]);
    expect(entry.signature).toBeTruthy();
    expect(entry.signer_key_id).toBeTruthy();
    expect(verifyDeliveryChain(chain, { checkSignatures: true })).toMatchObject({ valid: true });
  });
});
