/**
 * #1355: the shared quality-gate verdict used by `aqe test generate` and
 * test_generate_enhanced.
 */
import { describe, it, expect } from 'vitest';
import {
  describeGateRejection,
  partitionByQualityGate,
  passedQualityGate,
  isUnexecutableScaffold,
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

  describe('isUnexecutableScaffold (what test_generate_enhanced counts by)', () => {
    const failed = (...types: string[]) => ({ qualityGateResult: { passed: false, issues: types.map(type => ({ type })) } });

    it('holds back generator-labelled scaffolding in any language', () => {
      expect(isUnexecutableScaffold({ generationMode: 'scaffolding' }, 'calc.py')).toBe(true);
    });

    it('holds back JS/TS the parser found unexecutable', () => {
      expect(isUnexecutableScaffold(failed('no-assertions'), 'src/math.ts')).toBe(true);
      expect(isUnexecutableScaffold(failed('syntax-error'), 'src/math.mjs')).toBe(true);
    });

    it('keeps tests whose only gate findings it cannot judge', () => {
      expect(isUnexecutableScaffold(failed('no-source-import'), 'src/math.ts')).toBe(false);
      expect(isUnexecutableScaffold(failed('no-assertions', 'no-source-import'), 'src/calc.py')).toBe(false);
      expect(isUnexecutableScaffold(failed('no-assertions'), 'pkg/calc.go')).toBe(false);
      expect(isUnexecutableScaffold(failed('no-assertions'), undefined)).toBe(false);
    });
  });
});
