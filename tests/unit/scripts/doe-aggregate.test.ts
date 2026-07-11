/**
 * Unit tests for the ADR-122 DoE ANOVA stat helpers (scripts/doe-aggregate.mjs).
 *
 * CRIT-2 guardrail: these lock the statistics to KNOWN closed-form answers and to
 * SYNTHETIC data with a planted truth. If the F-test / incomplete-beta ever drift,
 * the "which factor matters" and "beads: no quality gain" verdicts drift with them,
 * so they are pinned here rather than trusted by inspection.
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error — .mjs helper module has no type declarations
import { betai, fPValue, gammaln, anovaMainEffects } from '../../../scripts/doe-aggregate.mjs';

describe('gammaln', () => {
  it('matches known factorials: Γ(n) = (n-1)!', () => {
    expect(Math.exp(gammaln(1))).toBeCloseTo(1, 6); // 0! = 1
    expect(Math.exp(gammaln(5))).toBeCloseTo(24, 4); // 4! = 24
    expect(Math.exp(gammaln(6))).toBeCloseTo(120, 3); // 5! = 120
  });
  it('matches Γ(1/2) = √π', () => {
    expect(Math.exp(gammaln(0.5))).toBeCloseTo(Math.sqrt(Math.PI), 6);
  });
});

describe('betai (regularized incomplete beta)', () => {
  it('is 0 at x=0 and 1 at x=1', () => {
    expect(betai(2, 3, 0)).toBe(0);
    expect(betai(2, 3, 1)).toBe(1);
  });
  it('I_x(1,1) = x  (uniform CDF)', () => {
    expect(betai(1, 1, 0.2)).toBeCloseTo(0.2, 6);
    expect(betai(1, 1, 0.75)).toBeCloseTo(0.75, 6);
  });
  it('I_x(2,2) = x²(3 − 2x)  (closed form)', () => {
    const closed = (x: number) => x * x * (3 - 2 * x);
    expect(betai(2, 2, 0.5)).toBeCloseTo(closed(0.5), 6); // = 0.5
    expect(betai(2, 2, 0.3)).toBeCloseTo(closed(0.3), 6);
    expect(betai(2, 2, 0.9)).toBeCloseTo(closed(0.9), 6);
  });
  it('I_{0.5}(a,a) = 0.5 for any a (symmetry)', () => {
    for (const a of [0.5, 1, 3, 7.5]) expect(betai(a, a, 0.5)).toBeCloseTo(0.5, 6);
  });
});

describe('fPValue (F-distribution upper tail)', () => {
  it('F=1 at equal df gives p ≈ 0.5', () => {
    for (const df of [1, 5, 10, 40]) expect(fPValue(1, df, df)).toBeCloseTo(0.5, 4);
  });
  it('f ≤ 0 gives p = 1; huge F gives p ≈ 0', () => {
    expect(fPValue(0, 3, 20)).toBe(1);
    expect(fPValue(-2, 3, 20)).toBe(1);
    expect(fPValue(1e6, 3, 20)).toBeLessThan(1e-6);
  });
  it('is monotonically decreasing in f', () => {
    const a = fPValue(2, 4, 30);
    const b = fPValue(5, 4, 30);
    const c = fPValue(10, 4, 30);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });
  it('matches a known F critical value: p(F=4.96, df=2,3) ≈ 0.11', () => {
    // Cross-checked against F-table / R pf(4.96,2,3,lower=FALSE) ≈ 0.111.
    expect(fPValue(4.96, 2, 3)).toBeCloseTo(0.111, 2);
  });
});

describe('anovaMainEffects — planted-effect recovery', () => {
  // Synthetic 2×2 factorial: `model` has a LARGE planted effect (pass-rate
  // 0.2 vs 0.8), `feat` has NO effect (identical distribution). 20 reps/cell,
  // within-cell variance present so the error term is well-defined.
  const bits = (ones: number, zeros: number) => [
    ...Array(ones).fill(1), ...Array(zeros).fill(0),
  ];
  const rows = [
    { model: 'lo', feat: 'off', reps: bits(4, 16) }, // mean 0.2
    { model: 'lo', feat: 'on', reps: bits(4, 16) }, // mean 0.2
    { model: 'hi', feat: 'off', reps: bits(16, 4) }, // mean 0.8
    { model: 'hi', feat: 'on', reps: bits(16, 4) }, // mean 0.8
  ];
  const a = anovaMainEffects(rows, ['model', 'feat']);

  it('flattens all replicates and finds the grand mean', () => {
    expect(a.N).toBe(80);
    expect(a.grand).toBeCloseTo(0.5, 6);
    expect(a.numCells).toBe(4);
    expect(a.dfError).toBe(76);
  });

  it('recovers the planted MODEL effect: high F, p < 0.001', () => {
    const m = a.perFactor.model;
    expect(m.df).toBe(1);
    expect(m.levels.find((l: any) => l.level === 'lo').mean).toBeCloseTo(0.2, 6);
    expect(m.levels.find((l: any) => l.level === 'hi').mean).toBeCloseTo(0.8, 6);
    expect(m.F).toBeGreaterThan(20);
    expect(m.p).toBeLessThan(0.001);
  });

  it('rejects the NULL feat effect: F ≈ 0, p ≈ 1 (not significant)', () => {
    const feat = a.perFactor.feat;
    expect(feat.ss).toBeCloseTo(0, 9);
    expect(feat.F).toBeCloseTo(0, 9);
    expect(feat.p).toBeGreaterThan(0.5);
  });

  it('reports the design as balanced when reps are equal', () => {
    expect(a.balanced).toBe(true);
  });
});

describe('anovaMainEffects — a random (null) factor stays insignificant', () => {
  // A factor whose levels are assigned by a fixed pseudo-random pattern with the
  // SAME underlying pass-rate should not reach significance.
  const mk = (label: string, pattern: number[]) => ({ noise: label, reps: pattern });
  // Both levels drawn from the same 50/50 mix — no real effect.
  const rows = [
    mk('a', [1, 0, 1, 0, 1, 0, 0, 1]),
    mk('a', [0, 1, 0, 1, 1, 0, 1, 0]),
    mk('b', [1, 0, 0, 1, 0, 1, 1, 0]),
    mk('b', [0, 1, 1, 0, 1, 0, 0, 1]),
  ];
  it('null factor has p ≥ 0.05', () => {
    const a = anovaMainEffects(rows, ['noise']);
    expect(a.perFactor.noise.p).toBeGreaterThan(0.05);
  });
});

describe('anovaMainEffects — unbalanced cells handled honestly', () => {
  // opus cell has 7 reps, others 5 → unbalanced. Factor SS still weights by #obs.
  const rows = [
    { model: 'qwen', reps: [0, 0, 1, 0, 0] }, // n=5
    { model: 'opus', reps: [1, 1, 1, 0, 1, 1, 1] }, // n=7
  ];
  const a = anovaMainEffects(rows, ['model']);
  it('flags the design as unbalanced', () => {
    expect(a.balanced).toBe(false);
    expect(a.N).toBe(12);
  });
  it('weights level means by their own replicate counts', () => {
    const m = a.perFactor.model;
    expect(m.levels.find((l: any) => l.level === 'qwen').n).toBe(5);
    expect(m.levels.find((l: any) => l.level === 'opus').n).toBe(7);
    expect(m.levels.find((l: any) => l.level === 'opus').mean).toBeCloseTo(6 / 7, 6);
  });
});
