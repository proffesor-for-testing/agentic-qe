/**
 * Provenance-tier gate (ADR-121).
 *
 * Only oracle:test-exec (or judge:llm under an explicit budget flag) may change
 * fleet behavior; proxy:structural is never auto-promoted; unknown/null tiers
 * degrade to the conservative default rather than bypassing the gate.
 */

import { describe, it, expect } from 'vitest';
import {
  tierAllowsPromotion,
  coerceTier,
  tierRank,
  DEFAULT_PROVENANCE_TIER,
  PROVENANCE_TIERS,
} from '../../../src/learning/provenance-tier.js';

describe('tierAllowsPromotion', () => {
  it('should_allow_when_oracle_test_exec', () => {
    expect(tierAllowsPromotion('oracle:test-exec')).toBe(true);
  });

  it('should_reject_when_proxy_structural', () => {
    expect(tierAllowsPromotion('proxy:structural')).toBe(false);
  });

  it('should_reject_judge_tier_by_default', () => {
    expect(tierAllowsPromotion('judge:llm')).toBe(false);
  });

  it('should_allow_judge_tier_only_under_explicit_budget_flag', () => {
    expect(tierAllowsPromotion('judge:llm', { allowJudgeTier: true })).toBe(true);
  });

  it('should_never_allow_proxy_even_with_judge_budget_flag', () => {
    expect(tierAllowsPromotion('proxy:structural', { allowJudgeTier: true })).toBe(false);
  });

  it('should_reject_when_tier_is_null', () => {
    expect(tierAllowsPromotion(null)).toBe(false);
  });

  it('should_reject_when_tier_is_unknown_string', () => {
    expect(tierAllowsPromotion('totally-made-up')).toBe(false);
  });
});

describe('coerceTier', () => {
  it('should_return_conservative_default_for_null', () => {
    expect(coerceTier(null)).toBe(DEFAULT_PROVENANCE_TIER);
    expect(DEFAULT_PROVENANCE_TIER).toBe('proxy:structural');
  });

  it('should_return_conservative_default_for_unknown', () => {
    expect(coerceTier('garbage')).toBe('proxy:structural');
  });

  it('should_passthrough_a_known_tier', () => {
    expect(coerceTier('oracle:test-exec')).toBe('oracle:test-exec');
  });
});

describe('tierRank', () => {
  it('should_rank_oracle_strongest', () => {
    expect(tierRank('oracle:test-exec')).toBeLessThan(tierRank('judge:llm'));
    expect(tierRank('judge:llm')).toBeLessThan(tierRank('proxy:structural'));
  });

  it('should_rank_unknown_as_weakest', () => {
    expect(tierRank('garbage')).toBe(PROVENANCE_TIERS.length - 1);
  });
});
