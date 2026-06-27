/**
 * P1 integration test: the skill-eval runner routes an oracle test case through
 * the mutation oracle (not keyword matching) and surfaces mutation_score / pass.
 * A stub subclass injects a known generated test in place of a live LLM call.
 */

import { describe, it, expect } from 'vitest';
import { SkillEvaluationRunner, extractTestSource } from '../../../scripts/run-skill-eval';

const REFERENCE_IMPL = `export function inRange(x, lo, hi) {
  return x >= lo && x <= hi;
}
`;

const HEADER = `import test from 'node:test';
import assert from 'node:assert/strict';
import { inRange } from '../src/inRange.mjs';
`;

const THOROUGH = `${HEADER}
test('low boundary', () => { assert.equal(inRange(1, 1, 10), true); });
test('high boundary', () => { assert.equal(inRange(10, 1, 10), true); });
test('below', () => { assert.equal(inRange(0, 1, 10), false); });
`;

// Asserts a single happy path: passes the reference, kills no mutant.
const WEAK = `${HEADER}
test('happy path only', () => { assert.equal(inRange(5, 1, 10), true); });
`;

/** Runner that returns a canned "skill output" instead of calling an LLM. */
class StubRunner extends SkillEvaluationRunner {
  constructor(suite: unknown, private readonly canned: string) {
    super(suite as never, false);
  }
  protected isLive(): boolean {
    return true; // inject a canned "model output" so oracle cases run
  }
  protected async produceSkillOutput(): Promise<string> {
    return this.canned;
  }
}

function oracleSuite() {
  return {
    skill: 'oracle-itest',
    version: '1.0.0',
    models_to_test: ['stub'],
    test_cases: [
      {
        id: 'tc_oracle',
        description: 'generated test must kill mutants',
        priority: 'critical',
        input: {},
        expected_output: {},
        validation: { oracle: true },
        oracle: { module_name: 'inRange', reference_impl: REFERENCE_IMPL, threshold: 0.5 },
      },
    ],
    success_criteria: { pass_rate: 1.0, critical_pass_rate: 1.0 },
  };
}

const TIMEOUT = 120_000;

describe('SkillEvaluationRunner oracle mode (P1)', () => {
  it('passes the case and reports full mutation score for a thorough generated test', async () => {
    const result = await new StubRunner(oracleSuite(), THOROUGH).runForModel('stub');
    const tc = result.test_results[0];

    expect(tc.passed).toBe(true);
    expect(tc.oracle_baseline_passed).toBe(true);
    expect(tc.mutants_total).toBe(3);
    expect(tc.mutation_score).toBe(1);
    expect(result.pass_rate).toBe(1);
  }, TIMEOUT);

  it('fails the case for a weak happy-path test that catches no bugs (keyword matching would have passed it)', async () => {
    const result = await new StubRunner(oracleSuite(), WEAK).runForModel('stub');
    const tc = result.test_results[0];

    expect(tc.passed).toBe(false);
    expect(tc.oracle_baseline_passed).toBe(true); // it runs and passes...
    expect(tc.mutation_score).toBe(0); // ...but kills nothing
    expect(tc.survived_mutant_ids).toHaveLength(3);
  }, TIMEOUT);
});

describe('oracle cases under the simulating (non-live) runner', () => {
  it('skips oracle cases instead of failing them, so evals stay green in CI', async () => {
    // Base runner: not live (no provider) — oracle cases must be skipped, not failed.
    const result = await new SkillEvaluationRunner(oracleSuite() as never, false).runForModel('stub');
    const tc = result.test_results[0];

    expect(tc.skipped).toBe(true);
    expect(tc.skip_reason).toMatch(/live provider/);
  }, TIMEOUT);
});

describe('extractTestSource', () => {
  it('returns the first fenced code block when present', () => {
    const out = 'Here is your test:\n```js\nconst x = 1;\n```\nDone.';
    expect(extractTestSource(out)).toBe('const x = 1;\n');
  });

  it('returns output verbatim in raw mode', () => {
    expect(extractTestSource('const x = 1;', 'raw')).toBe('const x = 1;');
  });
});
