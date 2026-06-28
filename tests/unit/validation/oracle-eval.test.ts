/**
 * P0 proof for the Oracle-Evals plan: the oracle evaluator must distinguish
 * a thorough test (kills mutants) from a no-op / weak test (survives) and a
 * broken test (fails the reference). Real `node --test` runs via qe-arena.
 *
 * Reference under test: `inRange(x, lo, hi)` → `x >= lo && x <= hi`, which the
 * operator mutator turns into exactly 3 first-order mutants (>=→>, <=→<, &&→||).
 */

import { describe, it, expect } from 'vitest';
import { evaluateOracle } from '../../../src/validation/oracle-eval';

const REFERENCE_IMPL = `export function inRange(x, lo, hi) {
  return x >= lo && x <= hi;
}
`;

const TEST_HEADER = `import test from 'node:test';
import assert from 'node:assert/strict';
import { inRange } from '../src/inRange.mjs';
`;

// Asserts every boundary — kills all three mutants.
const THOROUGH_TEST = `${TEST_HEADER}
test('in range', () => { assert.equal(inRange(5, 1, 10), true); });
test('low boundary included', () => { assert.equal(inRange(1, 1, 10), true); });   // kills >= -> >
test('high boundary included', () => { assert.equal(inRange(10, 1, 10), true); }); // kills <= -> <
test('below range excluded', () => { assert.equal(inRange(0, 1, 10), false); });   // kills && -> ||
`;

// Passes against the reference but asserts nothing — should be rejected.
const NOOP_TEST = `${TEST_HEADER}
test('noop', () => { /* no assertions */ });
`;

// One happy-path assertion that no mutant can break — has "coverage", catches nothing.
const WEAK_TEST = `${TEST_HEADER}
test('happy path only', () => { assert.equal(inRange(5, 1, 10), true); });
`;

// Wrong expectation — does not even pass against the correct implementation.
const BROKEN_TEST = `${TEST_HEADER}
test('wrong', () => { assert.equal(inRange(5, 1, 10), false); });
`;

const TIMEOUT = 120_000;

describe('evaluateOracle (P0 spike — real node --test + arena mutants)', () => {
  it('enumerates exactly 3 mutants and a thorough test kills all of them', () => {
    const result = evaluateOracle({
      moduleName: 'inRange',
      referenceImpl: REFERENCE_IMPL,
      generatedTest: THOROUGH_TEST,
    });

    expect(result.baselinePassed).toBe(true);
    expect(result.mutantsTotal).toBe(3);
    expect(result.mutantsKilled).toBe(3);
    expect(result.mutationScore).toBe(1);
    expect(result.passed).toBe(true);
  }, TIMEOUT);

  it('rejects an assertion-less test at the sanity guard (the must_contain failure mode)', () => {
    const result = evaluateOracle({
      moduleName: 'inRange',
      referenceImpl: REFERENCE_IMPL,
      generatedTest: NOOP_TEST,
    });

    // No assertion calls (only the `import assert` line) → rejected before running.
    expect(result.baselinePassed).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/no assertions/);
  }, TIMEOUT);

  it('rejects a happy-path-only test with coverage but no fault detection', () => {
    const result = evaluateOracle({
      moduleName: 'inRange',
      referenceImpl: REFERENCE_IMPL,
      generatedTest: WEAK_TEST,
    });

    expect(result.baselinePassed).toBe(true);
    expect(result.mutantsKilled).toBe(0);
    expect(result.passed).toBe(false);
  }, TIMEOUT);

  it('rejects a test that fails against the reference implementation', () => {
    const result = evaluateOracle({
      moduleName: 'inRange',
      referenceImpl: REFERENCE_IMPL,
      generatedTest: BROKEN_TEST,
    });

    expect(result.baselinePassed).toBe(false);
    expect(result.passed).toBe(false);
  }, TIMEOUT);
});
