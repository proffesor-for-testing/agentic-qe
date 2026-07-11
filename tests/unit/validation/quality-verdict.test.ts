/**
 * ADR-119 two-gate, three-valued quality verdict.
 *
 * Verifies the strict order (mechanical gate → preflight → two-attempt spec
 * gate) and the three-valued semantics: a non-executing test fails; judge
 * non-execution is inconclusive (never a silent pass); a spec fail requires two
 * real short opinions; a single real opinion is inconclusive, not fail.
 */

import { describe, it, expect } from 'vitest';
import {
  computeQualityVerdict,
  type Judge,
  type JudgeOpinion,
  type RequirementChecklist,
} from '../../../src/validation/quality-verdict.js';

const CHECKLIST: RequirementChecklist = {
  id: 'anchor-v1',
  requirements: ['R1', 'R2', 'R3'],
};

/** A judge returning a scripted sequence of opinions; preflight configurable. */
function fakeJudge(opinions: JudgeOpinion[], ready = true): Judge {
  let i = 0;
  return {
    preflight: () => ready,
    grade: () => opinions[Math.min(i++, opinions.length - 1)],
  };
}

const passedOracle = { passed: true, baselinePassed: true };
const op = (coverage: number, ran = true): JudgeOpinion => ({
  ran,
  coverage,
  unmet: coverage >= 1 ? [] : ['R3'],
});

describe('computeQualityVerdict — mechanical gate', () => {
  it('should_fail_when_oracle_did_not_run', async () => {
    const r = await computeQualityVerdict({
      oracle: null, artifact: 't', checklist: CHECKLIST, judge: fakeJudge([op(1)]),
    });
    expect(r.verdict).toBe('fail');
    expect(r.mechanical).toBe('fail');
    expect(r.attempts).toBe(0); // judge never consulted
  });

  it('should_fail_when_tests_did_not_execute', async () => {
    const r = await computeQualityVerdict({
      oracle: { passed: false, baselinePassed: false },
      artifact: 't', checklist: CHECKLIST, judge: fakeJudge([op(1)]),
    });
    expect(r.verdict).toBe('fail');
    expect(r.reason).toMatch(/did not execute/);
  });
});

describe('computeQualityVerdict — judge preflight', () => {
  it('should_be_inconclusive_when_judge_preflight_fails', async () => {
    const r = await computeQualityVerdict({
      oracle: passedOracle, artifact: 't', checklist: CHECKLIST,
      judge: fakeJudge([op(1)], /* ready */ false),
    });
    expect(r.verdict).toBe('inconclusive');
    expect(r.mechanical).toBe('pass');
    expect(r.reason).toMatch(/preflight/);
  });
});

describe('computeQualityVerdict — spec gate', () => {
  it('should_pass_on_first_attempt_reaching_full_coverage', async () => {
    const r = await computeQualityVerdict({
      oracle: passedOracle, artifact: 't', checklist: CHECKLIST, judge: fakeJudge([op(1)]),
    });
    expect(r.verdict).toBe('pass');
    expect(r.attempts).toBe(1); // stops early on 1.0
  });

  it('should_fail_only_on_two_real_short_opinions', async () => {
    const r = await computeQualityVerdict({
      oracle: passedOracle, artifact: 't', checklist: CHECKLIST,
      judge: fakeJudge([op(0.67), op(0.67)]),
    });
    expect(r.verdict).toBe('fail');
    expect(r.attempts).toBe(2);
    expect(r.unmet).toContain('R3');
  });

  it('should_be_inconclusive_when_only_one_real_opinion_is_obtainable', async () => {
    // One short real opinion + one that did not run (usage limit / timeout).
    const r = await computeQualityVerdict({
      oracle: passedOracle, artifact: 't', checklist: CHECKLIST,
      judge: fakeJudge([op(0.67), op(0, /* ran */ false)]),
    });
    expect(r.verdict).toBe('inconclusive');
    expect(r.specCoverage).toBeCloseTo(0.67);
  });

  it('should_pass_on_second_attempt_if_first_was_short_but_second_reaches_full', async () => {
    const r = await computeQualityVerdict({
      oracle: passedOracle, artifact: 't', checklist: CHECKLIST,
      judge: fakeJudge([op(0.67), op(1)]),
    });
    expect(r.verdict).toBe('pass');
    expect(r.attempts).toBe(2);
  });
});

describe('computeQualityVerdict — guards', () => {
  it('should_throw_on_empty_checklist_denominator', async () => {
    await expect(computeQualityVerdict({
      oracle: passedOracle, artifact: 't',
      checklist: { id: 'x', requirements: [] }, judge: fakeJudge([op(1)]),
    })).rejects.toThrow(/constant denominator/);
  });
});
