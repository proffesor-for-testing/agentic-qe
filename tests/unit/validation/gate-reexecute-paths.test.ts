/**
 * ADR-120 promotion-path retrofit: a forged/stale promotion or dream-apply
 * cannot survive re-execution of the frozen path rule on its sealed inputs.
 *
 * Two highest-value paths (PROMOTION-PATH-INVENTORY P1/P2):
 *   - pattern-promote/v1 — short-term → long-term pattern promotion.
 *   - dream-apply/v1     — the A8-EXT fake-`applied`-counter home.
 *
 * For EACH path we assert: a legitimate receipt verifies valid; a FORGED
 * receipt (inputs the frozen rule rejects, but recordedVerdict='promote')
 * fails gateReExecutes; and a TAMPERED receipt (sealed mutated after hashing)
 * fails sealIntact.
 */

import { describe, it, expect } from 'vitest';
import {
  reExecutePathGate,
  pathGateFingerprint,
  pathSealedHash,
  verifyPathPromotion,
  PROMOTION_PATH_RULES,
  type PathSealedInputs,
  type PathPromotionReceipt,
} from '../../../src/validation/gate-reexecute.js';

function receiptFor(
  ruleVersion: string,
  sealed: PathSealedInputs,
  recordedVerdict: 'promote' | 'reject',
): PathPromotionReceipt {
  return {
    ruleVersion,
    ruleFingerprint: pathGateFingerprint(ruleVersion),
    sealedHash: pathSealedHash(sealed),
    sealed,
    recordedVerdict,
  };
}

// A sealed pattern-promote decision that legitimately PASSES pattern-promote/v1.
const goodPattern: PathSealedInputs = {
  provenanceTier: 'oracle:test-exec',
  reward: 0.9,
  rewardThreshold: 0.7,
  occurrences: 10,
  occurrenceThreshold: 5,
  successRate: 0.85,
  successRateThreshold: 0.7,
  withinActivityWindow: true,
};

// A sealed dream-apply decision that legitimately PASSES dream-apply/v1.
const goodDream: PathSealedInputs = {
  provenanceTier: 'oracle:test-exec',
  insightConfidence: 0.85,
  insightConfidenceThreshold: 0.7,
  insightActionable: true,
};

describe('promotion-path registry', () => {
  it('should_expose_exactly_the_two_retrofit_rules', () => {
    expect(Object.keys(PROMOTION_PATH_RULES).sort()).toEqual(['dream-apply/v1', 'pattern-promote/v1']);
  });

  it('should_throw_when_fingerprinting_an_unknown_path_rule', () => {
    expect(() => pathGateFingerprint('pattern-promote/v99')).toThrow(/Unknown promotion-path rule/);
  });

  it('should_throw_when_re_executing_an_unknown_path_rule', () => {
    expect(() => reExecutePathGate('dream-apply/v99', goodDream)).toThrow(/Unknown promotion-path rule/);
  });
});

describe('pattern-promote/v1 (P1)', () => {
  it('should_promote_when_tier_thresholds_and_window_all_hold', () => {
    expect(reExecutePathGate('pattern-promote/v1', goodPattern).promote).toBe(true);
  });

  it('should_reject_proxy_tier_evidence', () => {
    const r = reExecutePathGate('pattern-promote/v1', { ...goodPattern, provenanceTier: 'proxy:structural' });
    expect(r.promote).toBe(false);
    expect(r.reason).toMatch(/tier/);
  });

  it('should_reject_sub_threshold_reward', () => {
    expect(reExecutePathGate('pattern-promote/v1', { ...goodPattern, reward: 0.5 }).promote).toBe(false);
  });

  it('should_reject_stale_pattern_outside_activity_window', () => {
    const r = reExecutePathGate('pattern-promote/v1', { ...goodPattern, withinActivityWindow: false });
    expect(r.promote).toBe(false);
    expect(r.reason).toMatch(/window/);
  });

  it('should_verify_a_legitimate_promote_receipt', () => {
    const verdict = verifyPathPromotion(receiptFor('pattern-promote/v1', goodPattern, 'promote'));
    expect(verdict.valid).toBe(true);
    expect(verdict.checks).toEqual({ sealIntact: true, gateUnchanged: true, gateReExecutes: true });
  });

  it('should_fail_gateReExecutes_on_a_forged_proxy_tier_promote', () => {
    // Forgery: proxy-tier inputs the frozen rule REJECTS, but logged as promote.
    const forged = receiptFor('pattern-promote/v1', { ...goodPattern, provenanceTier: 'proxy:structural' }, 'promote');
    const verdict = verifyPathPromotion(forged);
    expect(verdict.valid).toBe(false);
    expect(verdict.checks.gateReExecutes).toBe(false);
    expect(verdict.checks.sealIntact).toBe(true); // hash still matches the (forged) inputs
    expect(verdict.failures).toContain('gateReExecutes');
  });

  it('should_fail_gateReExecutes_on_a_forged_sub_threshold_promote', () => {
    const forged = receiptFor('pattern-promote/v1', { ...goodPattern, reward: 0.1 }, 'promote');
    expect(verifyPathPromotion(forged).checks.gateReExecutes).toBe(false);
  });

  it('should_fail_sealIntact_when_sealed_inputs_are_tampered_after_hashing', () => {
    const receipt = receiptFor('pattern-promote/v1', goodPattern, 'promote');
    receipt.sealed = { ...receipt.sealed, reward: 0.99, provenanceTier: 'proxy:structural' };
    const verdict = verifyPathPromotion(receipt);
    expect(verdict.valid).toBe(false);
    expect(verdict.checks.sealIntact).toBe(false);
    expect(verdict.failures).toContain('sealIntact');
  });
});

describe('dream-apply/v1 (P2 — A8-EXT)', () => {
  it('should_apply_when_tier_confidence_and_actionable_all_hold', () => {
    expect(reExecutePathGate('dream-apply/v1', goodDream).promote).toBe(true);
  });

  it('should_reject_proxy_tier_insight', () => {
    const r = reExecutePathGate('dream-apply/v1', { ...goodDream, provenanceTier: 'proxy:structural' });
    expect(r.promote).toBe(false);
    expect(r.reason).toMatch(/tier/);
  });

  it('should_reject_low_confidence_insight', () => {
    expect(reExecutePathGate('dream-apply/v1', { ...goodDream, insightConfidence: 0.3 }).promote).toBe(false);
  });

  it('should_reject_a_non_actionable_insight', () => {
    const r = reExecutePathGate('dream-apply/v1', { ...goodDream, insightActionable: false });
    expect(r.promote).toBe(false);
    expect(r.reason).toMatch(/actionable/);
  });

  it('should_apply_judge_tier_only_under_explicit_budget', () => {
    const judge = { ...goodDream, provenanceTier: 'judge:llm' };
    expect(reExecutePathGate('dream-apply/v1', judge).promote).toBe(false);
    expect(reExecutePathGate('dream-apply/v1', { ...judge, allowJudgeTier: true }).promote).toBe(true);
  });

  it('should_verify_a_legitimate_apply_receipt', () => {
    const verdict = verifyPathPromotion(receiptFor('dream-apply/v1', goodDream, 'promote'));
    expect(verdict.valid).toBe(true);
  });

  it('should_fail_gateReExecutes_on_a_forged_proxy_tier_apply', () => {
    // The marquee A8-EXT forgery: a proxy-tier insight logged as applied.
    const forged = receiptFor('dream-apply/v1', { ...goodDream, provenanceTier: 'proxy:structural' }, 'promote');
    const verdict = verifyPathPromotion(forged);
    expect(verdict.valid).toBe(false);
    expect(verdict.checks.gateReExecutes).toBe(false);
    expect(verdict.failures).toContain('gateReExecutes');
  });

  it('should_fail_gateReExecutes_on_a_forged_non_actionable_apply', () => {
    const forged = receiptFor('dream-apply/v1', { ...goodDream, insightActionable: false }, 'promote');
    expect(verifyPathPromotion(forged).checks.gateReExecutes).toBe(false);
  });

  it('should_fail_sealIntact_when_sealed_inputs_are_tampered_after_hashing', () => {
    const receipt = receiptFor('dream-apply/v1', goodDream, 'promote');
    receipt.sealed = { ...receipt.sealed, insightConfidence: 0.01 };
    const verdict = verifyPathPromotion(receipt);
    expect(verdict.valid).toBe(false);
    expect(verdict.checks.sealIntact).toBe(false);
  });
});
