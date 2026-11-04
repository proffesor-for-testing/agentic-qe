/**
 * #1355: the shared quality-gate verdict used by `aqe test generate` and
 * test_generate_enhanced.
 */
import { describe, it, expect } from 'vitest';
import {
  describeGateRejection,
  partitionByQualityGate,
  passedQualityGate,
  TestQualityGate,
} from '../../../../src/domains/test-generation/gates/index';

describe('quality-gate verdict (#1355)', () => {
  it('counts a test only when the gate ran and passed it', () => {
    expect(passedQualityGate({ qualityGateResult: { passed: true } })).toBe(true);
    expect(passedQualityGate({ qualityGateResult: { passed: false } })).toBe(false);
    expect(passedQualityGate({})).toBe(false);
  });

  it('partitions tests in order', () => {
    const a = { id: 'a', qualityGateResult: { passed: true } };
    const b = { id: 'b', qualityGateResult: { passed: false } };
    const c = { id: 'c' };
    expect(partitionByQualityGate([a, b, c])).toEqual({ passed: [a], rejected: [b, c] });
  });

  it('describes the rejection from the gate issues', () => {
    expect(describeGateRejection({ qualityGateResult: { passed: false, issues: [{ description: 'No assertions.' }, { description: 'No import.' }] } }))
      .toBe('No assertions.; No import.');
    expect(describeGateRejection({})).toBe('missing passing quality evidence');
  });

  it('checks the import against the logical import target of inline sourceCode', () => {
    const testCode = "import { add } from './module-under-test';\nimport { it, expect } from 'vitest';\nit('adds', () => { expect(add(1, 2)).toBe(3); });\n";
    const gate = new TestQualityGate();
    const temp = '/tmp/aqe-temp-1355.ts';

    expect(gate.validate(testCode, temp).issues.map(i => i.type)).toContain('no-source-import');
    expect(gate.validate(testCode, temp, undefined, './module-under-test').passed).toBe(true);
  });
});
