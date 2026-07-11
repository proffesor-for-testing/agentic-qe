/**
 * ADR-118 QE-policy flywheel core: frozen-gate generations, Ed25519 receipts,
 * compounding lineage, honest-null, drift canary, reversible pointer.
 *
 * A deterministic scorer (better policy = higher held-out) and a seeded signer
 * make every assertion reproducible. No DB, no model — the corpus scorer is the
 * injected seam.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_POLICY,
  policyId,
  proposeCandidates,
  type RetrievalPolicy,
} from '../../../src/learning/qe-flywheel/policy.js';
import {
  createSigner,
  verifyReceiptSignature,
  toPromotionReceipt,
} from '../../../src/learning/qe-flywheel/receipt.js';
import {
  runFlywheelGeneration,
  reconstructLineage,
  checkHeadroom,
  checkDriftCanary,
  initActivePolicy,
  serveChampion,
  rollback,
  type PolicyScorer,
} from '../../../src/learning/qe-flywheel/generation.js';
import { verifyPromotion } from '../../../src/validation/gate-reexecute.js';

const SEED = 'a'.repeat(64); // 32-byte hex seed → deterministic key
const ANCHOR_HASH = 'e566f31a608705bf';

/** held-out tracks alpha; anchor tracks bodyWeight (so we can force each independently). */
const scorer: PolicyScorer = (p) => ({ heldOut: p.alpha, anchorMean: Math.min(1, 0.9 + (p.bodyWeight - 1) * 0.1) });

function genInput(baseline: RetrievalPolicy, candidate: RetrievalPolicy, tier = 'oracle:test-exec') {
  return {
    generation: 1, baseline, candidate, scorer,
    anchorHash: ANCHOR_HASH, anchorTol: 0.0, provenanceTier: tier,
    signer: createSigner(SEED),
  };
}

describe('policy', () => {
  it('should_give_equal_policies_the_same_id', () => {
    expect(policyId(DEFAULT_POLICY)).toBe(policyId({ ...DEFAULT_POLICY }));
  });
  it('should_propose_bounded_deduped_neighbors', () => {
    const cands = proposeCandidates(DEFAULT_POLICY, 0.1);
    expect(cands.length).toBeGreaterThan(0);
    const ids = new Set(cands.map(policyId));
    expect(ids.size).toBe(cands.length); // no dups
    for (const c of cands) expect(c.alpha).toBeGreaterThanOrEqual(0);
  });
});

describe('receipt — Ed25519', () => {
  it('should_be_deterministic_from_a_seed', () => {
    expect(createSigner(SEED).keyId).toBe(createSigner(SEED).keyId);
  });
  it('should_verify_a_signed_receipt_and_reject_tampering', async () => {
    const r = await runFlywheelGeneration(genInput({ ...DEFAULT_POLICY, alpha: 0.5 }, { ...DEFAULT_POLICY, alpha: 0.6 }));
    expect(verifyReceiptSignature(r.receipt)).toBe(true);
    const tampered = { ...r.receipt, verdict: 'reject' as const };
    expect(verifyReceiptSignature(tampered)).toBe(false);
  });
});

describe('runFlywheelGeneration — the frozen gate', () => {
  it('should_promote_a_candidate_that_beats_baseline_at_oracle_tier', async () => {
    const r = await runFlywheelGeneration(genInput({ ...DEFAULT_POLICY, alpha: 0.5 }, { ...DEFAULT_POLICY, alpha: 0.6 }));
    expect(r.verdict).toBe('promote');
    expect(r.champion.alpha).toBe(0.6);
    // the receipt fully re-verifies under ADR-120
    expect(verifyPromotion(toPromotionReceipt(r.receipt)).valid).toBe(true);
  });

  it('should_reject_when_held_out_does_not_improve', async () => {
    const r = await runFlywheelGeneration(genInput({ ...DEFAULT_POLICY, alpha: 0.6 }, { ...DEFAULT_POLICY, alpha: 0.5 }));
    expect(r.verdict).toBe('reject');
    expect(r.champion.alpha).toBe(0.6); // baseline unchanged
  });

  it('should_reject_a_held_out_gain_that_regresses_the_anchor', async () => {
    // candidate improves held-out (alpha up) but drops bodyWeight → anchor regresses
    const r = await runFlywheelGeneration(genInput(
      { ...DEFAULT_POLICY, alpha: 0.5, bodyWeight: 1.0 },
      { ...DEFAULT_POLICY, alpha: 0.7, bodyWeight: 0.5 },
    ));
    expect(r.verdict).toBe('reject');
  });

  it('should_reject_proxy_tier_evidence_even_with_a_clean_gain', async () => {
    const r = await runFlywheelGeneration(genInput(
      { ...DEFAULT_POLICY, alpha: 0.5 }, { ...DEFAULT_POLICY, alpha: 0.6 }, 'proxy:structural',
    ));
    expect(r.verdict).toBe('reject');
  });
});

describe('checkHeadroom', () => {
  it('should_report_no_headroom_when_baseline_saturates', async () => {
    const h = await checkHeadroom({ ...DEFAULT_POLICY, alpha: 1.0 }, scorer);
    expect(h.hasHeadroom).toBe(false);
  });
  it('should_report_headroom_when_baseline_is_below_saturation', async () => {
    const h = await checkHeadroom({ ...DEFAULT_POLICY, alpha: 0.5 }, scorer);
    expect(h.hasHeadroom).toBe(true);
  });
});

describe('reconstructLineage', () => {
  it('should_prove_a_compounding_chain_of_promotions', async () => {
    const signer = createSigner(SEED);
    const g1 = await runFlywheelGeneration({ ...genInput({ ...DEFAULT_POLICY, alpha: 0.5 }, { ...DEFAULT_POLICY, alpha: 0.6 }), generation: 1, signer });
    // gen 2 re-bases on gen 1's promoted champion
    const g2 = await runFlywheelGeneration({ ...genInput(g1.champion, { ...DEFAULT_POLICY, alpha: 0.7 }), generation: 2, signer });
    const lin = reconstructLineage([g1.receipt, g2.receipt]);
    expect(lin.promotions).toBe(2);
    expect(lin.lineageIntact).toBe(true);
    expect(lin.allReplayable).toBe(true);
  });

  it('should_accept_an_honest_null_run_with_zero_promotions', async () => {
    // every candidate is worse → 0 promotions, but a valid, replayable lineage
    const r = await runFlywheelGeneration(genInput({ ...DEFAULT_POLICY, alpha: 0.6 }, { ...DEFAULT_POLICY, alpha: 0.5 }));
    const lin = reconstructLineage([r.receipt]);
    expect(lin.promotions).toBe(0);
    expect(lin.lineageIntact).toBe(true);
    expect(lin.allReplayable).toBe(true);
  });

  it('should_flag_a_broken_non_compounding_lineage', async () => {
    const signer = createSigner(SEED);
    const g1 = await runFlywheelGeneration({ ...genInput({ ...DEFAULT_POLICY, alpha: 0.5 }, { ...DEFAULT_POLICY, alpha: 0.6 }), generation: 1, signer });
    // gen 2 does NOT re-base on g1's champion (baseline alpha 0.5, not 0.6) → broken chain
    const g2 = await runFlywheelGeneration({ ...genInput({ ...DEFAULT_POLICY, alpha: 0.55 }, { ...DEFAULT_POLICY, alpha: 0.7 }), generation: 2, signer });
    expect(reconstructLineage([g1.receipt, g2.receipt]).lineageIntact).toBe(false);
  });

  it('should_flag_a_forged_promote_receipt_as_not_replayable', async () => {
    // reject receipt whose verdict is flipped to promote — verifyPromotion catches it
    const r = await runFlywheelGeneration(genInput({ ...DEFAULT_POLICY, alpha: 0.6 }, { ...DEFAULT_POLICY, alpha: 0.5 }));
    const forged = { ...r.receipt, verdict: 'promote' as const };
    expect(reconstructLineage([forged]).allReplayable).toBe(false);
  });
});

describe('active-policy pointer + drift canary', () => {
  it('should_serve_then_shadow_and_roll_back', () => {
    const root = { ...DEFAULT_POLICY, alpha: 0.5 };
    const champ = { ...DEFAULT_POLICY, alpha: 0.6 };
    let active = initActivePolicy(root);
    active = serveChampion(active, champ, 1);
    expect(active.current.alpha).toBe(0.6);
    expect(active.previous?.alpha).toBe(0.5); // rollback target retained
    active = rollback(active);
    expect(active.current.alpha).toBe(0.5); // restored
  });

  it('should_detect_drift_when_served_regresses_vs_predecessor', () => {
    expect(checkDriftCanary({ heldOut: 0.55, anchorMean: 0.9 }, { heldOut: 0.60, anchorMean: 0.9 }).drifted).toBe(true);
    expect(checkDriftCanary({ heldOut: 0.62, anchorMean: 0.9 }, { heldOut: 0.60, anchorMean: 0.9 }).drifted).toBe(false);
  });

  it('should_detect_drift_on_anchor_regression_alone', () => {
    expect(checkDriftCanary({ heldOut: 0.7, anchorMean: 0.85 }, { heldOut: 0.6, anchorMean: 0.90 }).drifted).toBe(true);
  });
});
