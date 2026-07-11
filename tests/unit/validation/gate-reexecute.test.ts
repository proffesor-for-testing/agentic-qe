/**
 * ADR-120 gateReExecutes: a forged/stale promotion cannot survive re-execution
 * of the frozen rule on the sealed inputs.
 *
 * The marquee case is the A8-EXT fake-`applied` class: a receipt that LOGS a
 * promote the frozen accept/v1 rule would actually reject (e.g. on proxy-tier
 * evidence) must fail gateReExecutes.
 */

import { describe, it, expect } from 'vitest';
import {
  reExecuteGate,
  gateFingerprint,
  sealedHash,
  verifyPromotion,
  ACCEPTANCE_RULES,
  type SealedInputs,
  type PromotionReceipt,
} from '../../../src/validation/gate-reexecute.js';

/** A sealed decision that legitimately PASSES accept/v1 (oracle tier, held-out gain, no regression). */
const goodSealed: SealedInputs = {
  candidateHeldOut: 0.85,
  baselineHeldOut: 0.80,
  candidateAnchorMean: 0.92,
  baselineAnchorMean: 0.90,
  anchorHash: 'e566f31a',
  anchorTol: 0.0,
  provenanceTier: 'oracle:test-exec',
};

function receiptFor(sealed: SealedInputs, recordedVerdict: 'promote' | 'reject'): PromotionReceipt {
  return {
    ruleVersion: 'accept/v1',
    ruleFingerprint: gateFingerprint('accept/v1'),
    sealedHash: sealedHash(sealed),
    sealed,
    recordedVerdict,
  };
}

describe('accept/v1 rule', () => {
  it('should_promote_when_all_conditions_hold', () => {
    expect(reExecuteGate('accept/v1', goodSealed).promote).toBe(true);
  });

  it('should_reject_proxy_tier_evidence', () => {
    const r = reExecuteGate('accept/v1', { ...goodSealed, provenanceTier: 'proxy:structural' });
    expect(r.promote).toBe(false);
    expect(r.reason).toMatch(/tier/);
  });

  it('should_reject_when_held_out_does_not_beat_baseline', () => {
    expect(reExecuteGate('accept/v1', { ...goodSealed, candidateHeldOut: 0.80 }).promote).toBe(false);
  });

  it('should_reject_on_anchor_regression_at_zero_tolerance', () => {
    const r = reExecuteGate('accept/v1', { ...goodSealed, candidateAnchorMean: 0.89 });
    expect(r.promote).toBe(false);
    expect(r.reason).toMatch(/anchor regression/);
  });

  it('should_allow_judge_tier_only_under_explicit_budget', () => {
    const judge = { ...goodSealed, provenanceTier: 'judge:llm' };
    expect(reExecuteGate('accept/v1', judge).promote).toBe(false);
    expect(reExecuteGate('accept/v1', { ...judge, allowJudgeTier: true }).promote).toBe(true);
  });
});

describe('gateFingerprint / reExecuteGate — unregistered rules', () => {
  it('should_throw_when_fingerprinting_an_unknown_version', () => {
    expect(() => gateFingerprint('accept/v99')).toThrow(/Unknown acceptance rule/);
  });
  it('should_throw_when_re_executing_an_unknown_version', () => {
    expect(() => reExecuteGate('accept/v99', goodSealed)).toThrow(/Unknown acceptance rule/);
  });
  it('should_only_expose_frozen_registered_rules', () => {
    expect(Object.keys(ACCEPTANCE_RULES)).toEqual(['accept/v1']);
  });
});

describe('verifyPromotion', () => {
  it('should_verify_a_legitimate_promote_receipt', () => {
    const v = verifyPromotion(receiptFor(goodSealed, 'promote'));
    expect(v.valid).toBe(true);
    expect(v.checks).toEqual({ sealIntact: true, gateUnchanged: true, gateReExecutes: true });
  });

  it('should_verify_a_legitimate_reject_receipt', () => {
    // proxy-tier evidence legitimately recorded as reject — reproduces under the rule.
    const sealed = { ...goodSealed, provenanceTier: 'proxy:structural' };
    expect(verifyPromotion(receiptFor(sealed, 'reject')).valid).toBe(true);
  });

  it('should_CATCH_a_forged_promote_the_rule_would_reject_A8EXT', () => {
    // The fake-`applied` class: proxy-tier evidence, but the receipt LOGS a promote.
    const forged = receiptFor({ ...goodSealed, provenanceTier: 'proxy:structural' }, 'promote');
    const v = verifyPromotion(forged);
    expect(v.valid).toBe(false);
    expect(v.checks.gateReExecutes).toBe(false);
    expect(v.failures).toContain('gateReExecutes');
  });

  it('should_catch_tampered_sealed_inputs', () => {
    const r = receiptFor(goodSealed, 'promote');
    // mutate the sealed inputs AFTER the hash was recorded
    r.sealed = { ...r.sealed, candidateHeldOut: 0.99 };
    const v = verifyPromotion(r);
    expect(v.checks.sealIntact).toBe(false);
    expect(v.valid).toBe(false);
  });

  it('should_catch_a_swapped_rule_fingerprint', () => {
    const r = receiptFor(goodSealed, 'promote');
    r.ruleFingerprint = 'deadbeef';
    const v = verifyPromotion(r);
    expect(v.checks.gateUnchanged).toBe(false);
    expect(v.valid).toBe(false);
  });

  it('should_reject_when_pinned_fingerprint_does_not_match', () => {
    const v = verifyPromotion(receiptFor(goodSealed, 'promote'), { pinnedRuleFingerprint: 'other' });
    expect(v.checks.gateUnchanged).toBe(false);
    expect(v.valid).toBe(false);
  });
});
