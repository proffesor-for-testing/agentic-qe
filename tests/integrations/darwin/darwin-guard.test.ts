/**
 * Tests for Darwin-Guard (RuVector #615 / ADR-271 §4 pattern port).
 *
 * Covers the three rigor layers — exclude-don't-zero screening, valid-only
 * population stats, veto-only judge — plus the train/eval contamination guard.
 */

import { describe, it, expect } from 'vitest';
import {
  candidateExclusionReason,
  screenCandidates,
  populationStats,
  applyJudgeVeto,
  assertTrainEvalDisjoint,
  filterHoldout,
} from '../../../src/integrations/darwin/darwin-guard.js';
import type { DarwinScoreCard } from '../../../src/integrations/darwin/types.js';

/** A structurally valid, non-gamed, safe score card. Override per test. */
function mkCard(overrides: Partial<DarwinScoreCard> = {}): DarwinScoreCard {
  return {
    variantId: 'v',
    taskSuccess: 0.9,
    testPassRate: 1,
    traceQuality: 0.8,
    costEfficiency: 0.8,
    latencyEfficiency: 1,
    safetyScore: 1,
    secretExposure: 0,
    destructiveAction: 0,
    hallucinatedFile: 0,
    toolLoop: 0,
    costOverrun: 0,
    baseScore: 0.8,
    finalScore: 0.76,
    promoted: false,
    reason: 'ok',
    ...overrides,
  };
}

describe('candidateExclusionReason', () => {
  it('should accept a structurally valid, non-gamed card', () => {
    expect(candidateExclusionReason(mkCard())).toBeNull();
  });

  it('should exclude a non-finite finalScore', () => {
    expect(candidateExclusionReason(mkCard({ finalScore: NaN }))).toContain('non-finite');
  });

  it('should exclude a finalScore outside [-1,1]', () => {
    expect(candidateExclusionReason(mkCard({ finalScore: 1.5 }))).toContain('out of [-1,1]');
  });

  it('should exclude an out-of-bounds positive term', () => {
    expect(candidateExclusionReason(mkCard({ taskSuccess: 1.2 }))).toContain('taskSuccess');
  });

  it('should exclude an out-of-bounds penalty term', () => {
    expect(candidateExclusionReason(mkCard({ destructiveAction: 2 }))).toContain('destructiveAction');
  });

  it('should exclude a gamed card: failed safety gate but positive reward', () => {
    const gamed = mkCard({ safetyScore: 0, finalScore: 0.9 });
    expect(candidateExclusionReason(gamed)).toContain('gamed');
  });

  it('should exclude a gamed card: destructive penalty tripped but positive reward', () => {
    const gamed = mkCard({ destructiveAction: 1, finalScore: 0.5 });
    expect(candidateExclusionReason(gamed)).toContain('gamed');
  });

  it('should NOT flag an honest unsafe card whose reward is non-positive', () => {
    // Honest scoring forces unsafe → finalScore ≤ 0; that is valid, not gamed.
    expect(candidateExclusionReason(mkCard({ safetyScore: 0, finalScore: -1 }))).toBeNull();
  });
});

describe('screenCandidates', () => {
  it('should partition a population into valid and excluded with reasons', () => {
    const valid = mkCard({ variantId: 'good' });
    const gamed = mkCard({ variantId: 'hack', safetyScore: 0, finalScore: 0.95 });
    const nan = mkCard({ variantId: 'broken', finalScore: NaN });

    const screen = screenCandidates([valid, gamed, nan]);

    expect(screen.valid.map((c) => c.variantId)).toEqual(['good']);
    expect(screen.excluded.map((e) => e.card.variantId)).toEqual(['hack', 'broken']);
    expect(screen.excluded[0].reason).toContain('gamed');
  });
});

describe('populationStats (advantage baseline over valid only)', () => {
  it('should return zeroed stats for an empty population', () => {
    expect(populationStats([])).toEqual({ count: 0, mean: 0, max: 0, std: 0 });
  });

  it('should compute mean, max and std over valid candidates', () => {
    const cards = [mkCard({ finalScore: 0.2 }), mkCard({ finalScore: 0.4 }), mkCard({ finalScore: 0.6 })];

    const stats = populationStats(cards);

    expect(stats.count).toBe(3);
    expect(stats.mean).toBeCloseTo(0.4, 10);
    expect(stats.max).toBeCloseTo(0.6, 10);
    expect(stats.std).toBeCloseTo(Math.sqrt(((0.2) ** 2 + 0 + (0.2) ** 2) / 3), 10);
  });

  it('should not let a gamed candidate bias the baseline (exclude, not zero)', () => {
    // The Goodhart insight: a gamed card must be REMOVED, not scored 0 — a 0
    // would still drag the mean down and distort the advantage baseline.
    const honest = [mkCard({ variantId: 'a', finalScore: 0.5 }), mkCard({ variantId: 'b', finalScore: 0.7 })];
    const gamed = mkCard({ variantId: 'hack', safetyScore: 0, finalScore: 0.99 });

    const screenedStats = populationStats(screenCandidates([...honest, gamed]).valid);
    const honestStats = populationStats(honest);

    // Screening then aggregating === aggregating the honest subset directly.
    expect(screenedStats).toEqual(honestStats);
    // And it differs from the naive "zero the hack" baseline, proving exclusion matters.
    const naiveZeroMean = (0.5 + 0.7 + 0) / 3;
    expect(screenedStats.mean).not.toBeCloseTo(naiveZeroMean, 5);
  });
});

describe('applyJudgeVeto (veto-only)', () => {
  it('should flip a promoted card to not-promoted when vetoed', () => {
    const promoted = mkCard({ promoted: true, reason: 'promoted: beat parent' });

    const result = applyJudgeVeto(promoted, { veto: true, reason: 'subtle injection' });

    expect(result.promoted).toBe(false);
    expect(result.reason).toContain('vetoed by judge: subtle injection');
  });

  it('should be a no-op when the judge does not veto (cannot upgrade)', () => {
    const notPromoted = mkCard({ promoted: false });

    const result = applyJudgeVeto(notPromoted, { veto: false });

    // The judge can never promote — a non-veto leaves the gate's decision intact.
    expect(result.promoted).toBe(false);
    expect(result).toBe(notPromoted);
  });

  it('should be a no-op when vetoing an already-not-promoted card', () => {
    const notPromoted = mkCard({ promoted: false, reason: 'not promoted: below parent' });

    const result = applyJudgeVeto(notPromoted, { veto: true });

    expect(result.promoted).toBe(false);
    expect(result.reason).toBe('not promoted: below parent');
  });

  it('should never raise finalScore', () => {
    const promoted = mkCard({ promoted: true, finalScore: 0.8 });

    const result = applyJudgeVeto(promoted, { veto: true });

    expect(result.finalScore).toBe(0.8); // judge touches only `promoted`/`reason`
  });
});

describe('assertTrainEvalDisjoint', () => {
  it('should not throw when the sets are disjoint', () => {
    expect(() => assertTrainEvalDisjoint(['t1', 't2'], ['e1', 'e2'])).not.toThrow();
  });

  it('should throw and name the overlapping id on contamination', () => {
    expect(() => assertTrainEvalDisjoint(['t1', 'shared'], ['e1', 'shared'])).toThrow(/shared/);
  });
});

describe('filterHoldout', () => {
  it('should drop cases whose id was seen in training and keep the rest', () => {
    const cases = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

    const holdout = filterHoldout(cases, ['b']);

    expect(holdout.map((c) => c.id)).toEqual(['a', 'c']);
  });
});
