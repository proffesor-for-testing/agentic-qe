/**
 * ADR-118 §4 durable receipt persistence: persist → reload → re-verify offline.
 *
 * A lineage is only trustworthy if it survives the process and re-verifies from
 * disk (signatures + frozen-gate re-execution). Uses an in-memory SQLite DB.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { DEFAULT_POLICY } from '../../../src/learning/qe-flywheel/policy.js';
import { createSigner } from '../../../src/learning/qe-flywheel/receipt.js';
import {
  runFlywheelGeneration,
  type PolicyScorer,
  type RetrievalPolicy,
} from '../../../src/learning/qe-flywheel/generation.js';
import {
  persistReceipt,
  persistReceipts,
  loadReceipts,
  verifyPersistedLineage,
} from '../../../src/learning/qe-flywheel/receipt-store.js';

const SEED = 'c'.repeat(64);
const ANCHOR_HASH = 'e566f31a608705bf';
const scorer: PolicyScorer = (p) => ({ heldOut: p.alpha, anchorMean: 0.9 });

async function gen(baseline: RetrievalPolicy, candidate: RetrievalPolicy, generation: number) {
  return runFlywheelGeneration({
    generation, baseline, candidate, scorer,
    anchorHash: ANCHOR_HASH, anchorTol: 0, provenanceTier: 'oracle:test-exec',
    signer: createSigner(SEED),
  });
}

describe('receipt-store', () => {
  let db: Database.Database;
  beforeEach(() => { db = new Database(':memory:'); });
  afterEach(() => db.close());

  it('should_roundtrip_a_receipt_through_persist_and_load', async () => {
    const g = await gen({ ...DEFAULT_POLICY, alpha: 0.5 }, { ...DEFAULT_POLICY, alpha: 0.6 }, 1);
    persistReceipt(db, g.receipt);

    const loaded = loadReceipts(db);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(g.receipt); // full fidelity incl. signature + sealed
  });

  it('should_reverify_a_persisted_compounding_lineage_offline', async () => {
    const signer = createSigner(SEED);
    const g1 = await runFlywheelGeneration({ generation: 1, baseline: { ...DEFAULT_POLICY, alpha: 0.5 }, candidate: { ...DEFAULT_POLICY, alpha: 0.6 }, scorer, anchorHash: ANCHOR_HASH, anchorTol: 0, provenanceTier: 'oracle:test-exec', signer });
    const g2 = await runFlywheelGeneration({ generation: 2, baseline: g1.champion, candidate: { ...DEFAULT_POLICY, alpha: 0.7 }, scorer, anchorHash: ANCHOR_HASH, anchorTol: 0, provenanceTier: 'oracle:test-exec', signer });
    persistReceipts(db, [g1.receipt, g2.receipt]);

    const lin = verifyPersistedLineage(db);
    expect(lin.promotions).toBe(2);
    expect(lin.lineageIntact).toBe(true);
    expect(lin.allReplayable).toBe(true);
  });

  it('should_catch_a_persisted_receipt_tampered_in_the_DB', async () => {
    const g = await gen({ ...DEFAULT_POLICY, alpha: 0.6 }, { ...DEFAULT_POLICY, alpha: 0.5 }, 1); // a reject
    persistReceipt(db, g.receipt);
    // tamper the stored verdict directly (simulate a forged row)
    db.prepare(`UPDATE flywheel_receipts SET verdict = 'promote' WHERE seq = 1`).run();

    // reload + re-verify: the flipped verdict no longer reproduces under the frozen rule
    expect(verifyPersistedLineage(db).allReplayable).toBe(false);
  });

  it('should_be_append_only_preserving_prior_rows', async () => {
    const g1 = await gen({ ...DEFAULT_POLICY, alpha: 0.5 }, { ...DEFAULT_POLICY, alpha: 0.6 }, 1);
    const g2 = await gen({ ...DEFAULT_POLICY, alpha: 0.6 }, { ...DEFAULT_POLICY, alpha: 0.7 }, 2);
    persistReceipt(db, g1.receipt);
    persistReceipt(db, g2.receipt);
    expect(loadReceipts(db)).toHaveLength(2); // second insert did not clobber the first
  });
});
