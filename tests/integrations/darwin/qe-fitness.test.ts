import { describe, it, expect } from 'vitest';
import {
  qeFitnessToScoreCard,
  applyQePromotionGate,
  arenaStrategiesToScoreCards,
  computeQeFitness,
  type EvaluatedStrategyLike,
} from '../../../src/integrations/darwin/qe-fitness.js';
import type { QeFitness } from '../../../src/integrations/darwin/types.js';

// A strong QE outcome: high kill-rate, high coverage, cheap suite, baseline green.
const STRONG: QeFitness = { baselinePassed: true, killRate: 0.9, coveragePct: 80, suiteCostRatio: 0.2 };

describe('computeQeFitness (ADR-104 parity)', () => {
  it('should match 0.6*kill + 0.3*coverage - 0.1*cost', () => {
    // 0.6*0.9 + 0.3*0.8 - 0.1*0.2 = 0.54 + 0.24 - 0.02 = 0.76
    expect(computeQeFitness(0.9, 80, 0.2)).toBe(0.76);
  });

  it('should treat null coverage as a zero coverage term', () => {
    // 0.6*0.5 + 0 - 0.1*0.5 = 0.25
    expect(computeQeFitness(0.5, null, 0.5)).toBe(0.25);
  });
});

describe('qeFitnessToScoreCard', () => {
  it('should set finalScore to the QE fitness when safe and baseline passes', () => {
    const card = qeFitnessToScoreCard('g1_v0', STRONG);
    expect(card.finalScore).toBe(0.76);
    expect(card.reason).toContain('QE fitness');
  });

  it('should map killRate to taskSuccess and coverage fraction to traceQuality', () => {
    const card = qeFitnessToScoreCard('g1_v0', STRONG);
    expect(card.taskSuccess).toBe(0.9);
    expect(card.traceQuality).toBe(0.8);
    expect(card.costEfficiency).toBeCloseTo(0.8, 5); // 1 - 0.2
  });

  it('should drive the noRegression gate: testPassRate=1 when baseline passes', () => {
    expect(qeFitnessToScoreCard('v', STRONG).testPassRate).toBe(1);
  });

  it('should collapse to finalScore 0 and testPassRate 0 on a baseline regression', () => {
    const card = qeFitnessToScoreCard('v', { ...STRONG, baselinePassed: false });
    expect(card.finalScore).toBe(0);
    expect(card.testPassRate).toBe(0);
    expect(card.taskSuccess).toBe(0);
    expect(card.reason).toContain('regression');
  });

  it('should force finalScore negative and safetyScore 0 when the variant is unsafe', () => {
    const card = qeFitnessToScoreCard('v', STRONG, { safe: false });
    expect(card.finalScore).toBe(-1);
    expect(card.safetyScore).toBe(0);
    expect(card.reason).toContain('unsafe');
  });

  it('should be monotonic in killRate (higher kill-rate => higher finalScore)', () => {
    const lo = qeFitnessToScoreCard('lo', { ...STRONG, killRate: 0.4 }).finalScore;
    const hi = qeFitnessToScoreCard('hi', { ...STRONG, killRate: 0.95 }).finalScore;
    expect(hi).toBeGreaterThan(lo);
  });

  it('should apply a hallucinatedFile penalty proportional to the false-finding rate', () => {
    const clean = qeFitnessToScoreCard('clean', STRONG).finalScore;
    const noisy = qeFitnessToScoreCard('noisy', { ...STRONG, falseFindingRate: 0.5 });
    expect(noisy.hallucinatedFile).toBe(0.5);
    expect(noisy.finalScore).toBeCloseTo(clean - 0.5 * 0.15, 5);
  });

  it('should keep all positive terms within [0,1]', () => {
    const card = qeFitnessToScoreCard('v', { baselinePassed: true, killRate: 2, coveragePct: 150, suiteCostRatio: -1 });
    for (const t of [card.taskSuccess, card.testPassRate, card.traceQuality, card.costEfficiency, card.safetyScore]) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
    }
  });
});

describe('applyQePromotionGate (ADR-072 mirror)', () => {
  const child = (final: number, testPassRate = 1, safetyScore = 1): ReturnType<typeof qeFitnessToScoreCard> =>
    ({ ...qeFitnessToScoreCard('c', STRONG), finalScore: final, testPassRate, safetyScore });

  it('should promote when the child beats parent by more than the delta and is safe', () => {
    const parent = child(0.5);
    const out = applyQePromotionGate(child(0.7), parent, 0.05);
    expect(out.promoted).toBe(true);
    expect(out.reason).toContain('promoted');
  });

  it('should NOT promote when the gain is within the promotion delta', () => {
    const out = applyQePromotionGate(child(0.52), child(0.5), 0.05);
    expect(out.promoted).toBe(false);
  });

  it('should NOT promote on a testPassRate regression even with a higher score', () => {
    const parent = child(0.5, 1);
    const out = applyQePromotionGate(child(0.9, 0), parent, 0.05);
    expect(out.promoted).toBe(false);
    expect(out.reason).toContain('regression');
  });

  it('should NOT promote when unsafe (safetyScore below the gate)', () => {
    const out = applyQePromotionGate(child(0.9, 1, 0), child(0.1), 0.05);
    expect(out.promoted).toBe(false);
  });
});

describe('arenaStrategiesToScoreCards', () => {
  it('should produce one score card per strategy keyed by id, finalScore == fitness', () => {
    const strategies: EvaluatedStrategyLike[] = [
      { id: 's1', baselinePassed: true, killRate: 0.9, coveragePct: 80, suiteCostRatio: 1.0, fitness: 0.76 },
      { id: 's2', baselinePassed: true, killRate: 0.5, coveragePct: 60, suiteCostRatio: 0.5, fitness: 0.43 },
    ];

    const cards = arenaStrategiesToScoreCards(strategies);

    expect(Object.keys(cards)).toEqual(['s1', 's2']);
    expect(cards.s1.finalScore).toBe(0.76);
    expect(cards.s2.finalScore).toBe(0.43);
  });
});
