/**
 * @ruvector/adversarial-verify — calibration (plan 05 / A2 step 5).
 *
 * Measure the verifier against a LABELED set (findings tagged real/false) to get
 * the operating point: false-kill (a REAL finding wrongly refuted — the costly
 * error) and false-keep (a FALSE finding that survives). Works with any `Judge`
 * — a deterministic stub (characterize the k-of-n aggregation) or a real LLM
 * (empirical false-kill on a labeled corpus).
 */
import type { AdversarialVerifyOptions, Finding } from './types.js';
import { adversarialVerify } from './verify.js';

export interface LabeledFinding {
  finding: Finding;
  /** Ground truth: is this a genuine, actionable problem? */
  isReal: boolean;
}

export interface CalibrationReport {
  total: number;
  realCount: number;
  falseCount: number;
  /** REAL findings wrongly refuted (the costly error). */
  falseKill: number;
  falseKillRate: number; // over realCount
  /** FALSE findings wrongly upheld (survived verification). */
  falseKeep: number;
  falseKeepRate: number; // over falseCount
  correctConfirm: number; // real & upheld
  correctKill: number; // false & refuted
  uncertain: number; // no votes cast
}

/** Run the verifier over a labeled set and report the confusion vs ground truth. */
export async function calibrate(
  labeled: LabeledFinding[],
  opts: AdversarialVerifyOptions,
): Promise<CalibrationReport> {
  const verdicts = await adversarialVerify(labeled.map((l) => l.finding), opts);
  const r: CalibrationReport = {
    total: labeled.length, realCount: 0, falseCount: 0,
    falseKill: 0, falseKillRate: 0, falseKeep: 0, falseKeepRate: 0,
    correctConfirm: 0, correctKill: 0, uncertain: 0,
  };
  labeled.forEach((l, i) => {
    const v = verdicts[i].verdict;
    if (v === 'uncertain') r.uncertain++;
    if (l.isReal) {
      r.realCount++;
      if (v === 'refuted') r.falseKill++;
      else if (v === 'upheld') r.correctConfirm++;
    } else {
      r.falseCount++;
      if (v === 'upheld') r.falseKeep++;
      else if (v === 'refuted') r.correctKill++;
    }
  });
  r.falseKillRate = r.realCount ? r.falseKill / r.realCount : 0;
  r.falseKeepRate = r.falseCount ? r.falseKeep / r.falseCount : 0;
  return r;
}
