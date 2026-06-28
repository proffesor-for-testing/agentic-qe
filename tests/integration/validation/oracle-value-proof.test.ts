/**
 * P5 end-user value proof (ADR-113): on the SAME module, the new durable-first
 * test style catches bugs the old happy-path style misses, and the full chain
 * (oracle eval -> regenerability gate) turns that into a pass/fail an end user sees.
 *
 * This is the "better tests for us and our users" claim, demonstrated with real
 * `node --test` runs — no live LLM required.
 */

import { describe, it, expect } from 'vitest';
import { evaluateOracle } from '../../../src/validation/oracle-eval';
import {
  evaluateRegenerabilityGate,
  regenerabilityScore,
  type ModuleTestProfile,
} from '../../../src/feedback/regenerability-gate';

// A small grading function with 5 mutable operators (+, >= x2, &&, >).
const REFERENCE_IMPL = `export function classify(score, bonus) {
  const total = score + bonus;
  if (total >= 90 && bonus > 0) return 'A';
  if (total >= 70) return 'B';
  return 'C';
}
`;

const HEADER = `import test from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../src/classify.mjs';
`;

// OLD STYLE: a single happy-path example (what the previous guidance produced).
const OLD_HAPPY_PATH = `${HEADER}
test('grade A', () => { assert.equal(classify(95, 5), 'A'); });
`;

// NEW STYLE: boundary + branch assertions that pin the contract.
const NEW_DURABLE = `${HEADER}
test('A above threshold', () => { assert.equal(classify(88, 4), 'A'); });   // total 92, with + -> - drops to B
test('A exactly at 90 with bonus', () => { assert.equal(classify(85, 5), 'A'); }); // >= -> > drops to B
test('90 without bonus is B', () => { assert.equal(classify(90, 0), 'B'); });      // && -> || and bonus > -> >=
test('70 boundary is B', () => { assert.equal(classify(70, 0), 'B'); });           // second >= -> >
test('below all bands is C', () => { assert.equal(classify(10, 0), 'C'); });
`;

const TIMEOUT = 120_000;

describe('P5: durable-first delivers a measurable mutation-score uplift', () => {
  it('the old happy-path suite passes but catches almost no bugs', () => {
    const result = evaluateOracle({
      moduleName: 'classify',
      referenceImpl: REFERENCE_IMPL,
      generatedTest: OLD_HAPPY_PATH,
    });

    expect(result.baselinePassed).toBe(true);   // it "works"
    expect(result.mutationScore).toBeLessThan(0.5); // ...but lets bugs through
  }, TIMEOUT);

  it('the new durable suite catches them — a strict improvement on the same module', () => {
    const oldResult = evaluateOracle({ moduleName: 'classify', referenceImpl: REFERENCE_IMPL, generatedTest: OLD_HAPPY_PATH });
    const newResult = evaluateOracle({ moduleName: 'classify', referenceImpl: REFERENCE_IMPL, generatedTest: NEW_DURABLE });

    expect(newResult.baselinePassed).toBe(true);
    expect(newResult.mutationScore).toBeGreaterThan(oldResult.mutationScore);
    expect(newResult.mutationScore).toBeGreaterThanOrEqual(0.8);
  }, TIMEOUT);

  it('the regenerability gate fails the old suite and passes the new one (end-user verdict)', () => {
    const oldScore = evaluateOracle({ moduleName: 'classify', referenceImpl: REFERENCE_IMPL, generatedTest: OLD_HAPPY_PATH }).mutationScore;
    const newScore = evaluateOracle({ moduleName: 'classify', referenceImpl: REFERENCE_IMPL, generatedTest: NEW_DURABLE }).mutationScore;

    const oldProfile: ModuleTestProfile = { module: 'classify', mutationScore: oldScore, hasDurable: false, hasEphemeral: true };
    const newProfile: ModuleTestProfile = { module: 'classify', mutationScore: newScore, hasDurable: true };

    // Block mode so the verdict is a hard pass/fail, as a CI gate would surface it.
    const oldVerdict = evaluateRegenerabilityGate([oldProfile], { mutationScoreMin: 0.6, regenerabilityMin: 0.5, mode: 'block' });
    const newVerdict = evaluateRegenerabilityGate([newProfile], { mutationScoreMin: 0.6, regenerabilityMin: 0.5, mode: 'block' });

    expect(oldVerdict.passed).toBe(false);
    expect(oldVerdict.blocking).toBe(true);
    expect(newVerdict.passed).toBe(true);

    // The regenerability score reflects the tier difference, not just the kill rate.
    expect(regenerabilityScore(newProfile).tier).toBe('durable');
    expect(regenerabilityScore(oldProfile).tier).toBe('ephemeral');
  }, TIMEOUT);
});
