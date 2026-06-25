/**
 * adversarial-verify — calibration (A2 step 5). Characterizes the k-of-n
 * aggregation with a DETERMINISTIC noisy refuter: majority-of-3 should beat a
 * single refuter (lower total error) when each refuter is imperfect. Documents
 * the operating point. (Empirical false-kill with REAL LLM refuters is a
 * follow-up — inject a real Judge into `calibrate()`.)
 */
import { describe, it, expect } from 'vitest';
import { calibrate, type LabeledFinding, type Judge } from '../../../../src/verification/adversarial-verify/index.js';

// 20 labeled findings: 10 REAL (title tagged) + 10 FALSE. The stub judge below
// recovers the label from the prompt (which carries the title) — a simulation
// hack to model refuter accuracy; real refuters read the code, not the title.
const labeled: LabeledFinding[] = Array.from({ length: 20 }, (_, i) => {
  const isReal = i < 10;
  return {
    isReal,
    finding: {
      id: `f${i}`, title: `${isReal ? 'REAL' : 'FALSE'} issue ${i}`, file: `src/f${i}.ts`,
      severity: 'medium', confidence: 0.9, evidence: [`src/f${i}.ts:1`],
    },
  };
});

// Deterministic LCG so the test is reproducible.
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
}

/**
 * A refuter that is `accuracy`-correct: on a FALSE finding it refutes, on a REAL
 * finding it upholds — but with prob (1-accuracy) it flips. Deterministic.
 */
function noisyJudge(accuracy: number, seed: number): Judge {
  const rand = lcg(seed);
  return async (prompt) => {
    const isFalseFinding = /FALSE issue/.test(prompt); // ground truth from the title
    const correct = rand() < accuracy;
    // correct vote: refute a FALSE finding, uphold a REAL one
    const refuted = correct ? isFalseFinding : !isFalseFinding;
    return { refuted, reasoning: correct ? 'assessed' : 'noisy' };
  };
}

describe('calibrate — k-of-n aggregation reduces refuter noise', () => {
  it('should report confusion vs ground truth for a labeled set', async () => {
    const report = await calibrate(labeled, { judge: noisyJudge(1.0, 1), refuters: 3 });
    // a perfect refuter → zero error
    expect(report).toMatchObject({ total: 20, realCount: 10, falseCount: 10, falseKill: 0, falseKeep: 0 });
    expect(report.correctConfirm).toBe(10);
    expect(report.correctKill).toBe(10);
  });

  it('should make majority-of-3 no worse — and typically better — than a single refuter', async () => {
    const ACC = 0.75; // each refuter is 75% accurate
    const single = await calibrate(labeled, { judge: noisyJudge(ACC, 42), refuters: 1 });
    const triple = await calibrate(labeled, { judge: noisyJudge(ACC, 42), refuters: 3 });
    const totalErr = (r: { falseKill: number; falseKeep: number }) => r.falseKill + r.falseKeep;

    // Majority voting reduces total error for an imperfect refuter (variance↓).
    expect(totalErr(triple)).toBeLessThanOrEqual(totalErr(single));
    // And it should not be a degenerate "kill everything" — real findings survive.
    expect(triple.correctConfirm).toBeGreaterThan(0);
  });

  it('should expose false-kill as the costly error to tune the threshold against', async () => {
    // A unanimous (3-of-3) kill threshold makes it HARDER to refute → fewer
    // false-kills (real findings survive) at the cost of more false-keeps.
    const majority = await calibrate(labeled, { judge: noisyJudge(0.7, 7), refuters: 3 });
    const unanimous = await calibrate(labeled, { judge: noisyJudge(0.7, 7), refuters: 3, killThreshold: (n) => n });
    expect(unanimous.falseKill).toBeLessThanOrEqual(majority.falseKill);
  });
});
