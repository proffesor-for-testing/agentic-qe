/**
 * Test Quality Gate Tests
 * Validates mock/mutation detection for generated test code.
 *
 * Covers:
 * - No-source-import detection
 * - Tautological assertion detection
 * - Empty test body detection
 * - Mirrored assertion detection
 * - Score calculation
 * - Edge cases
 */

import { describe, it, expect } from 'vitest';
import {
  TestQualityGate,
  type TestQualityGateResult,
} from '../../../../src/domains/test-generation/gates/test-quality-gate.js';

// ============================================================================
// Helpers
// ============================================================================

function createGate(config?: Parameters<typeof TestQualityGate.prototype['validate']> extends never[] ? never : Record<string, unknown>) {
  return new TestQualityGate(config as any);
}

// ============================================================================
// No-Source-Import Detection
// ============================================================================

describe('TestQualityGate - no-source-import detection', () => {
  const gate = new TestQualityGate();

  it('should pass when test imports from the source file via ES import', () => {
    const testCode = `
      import { describe, it, expect } from 'vitest';
      import { calculateTotal } from '../src/my-module';

      describe('calculateTotal', () => {
        it('should return sum', () => {
          expect(calculateTotal([1, 2])).toBe(3);
        });
      });
    `;
    const result = gate.validate(testCode, 'src/my-module.ts');
    const importIssues = result.issues.filter(i => i.type === 'no-source-import');
    expect(importIssues).toHaveLength(0);
  });

  it('should flag error when test only imports from vitest (no source import)', () => {
    const testCode = `
      import { describe, it, expect } from 'vitest';

      describe('something', () => {
        it('should work', () => {
          expect(1 + 1).toBe(2);
        });
      });
    `;
    const result = gate.validate(testCode, 'src/my-module.ts');
    const importIssues = result.issues.filter(i => i.type === 'no-source-import');
    expect(importIssues).toHaveLength(1);
    expect(importIssues[0].severity).toBe('error');
    expect(importIssues[0].description).toContain('my-module');
  });

  it('should pass when test uses require() to import the source file', () => {
    const testCode = `
      const { describe, it, expect } = require('vitest');
      const { calculateTotal } = require('../src/my-module');

      describe('calculateTotal', () => {
        it('should return sum', () => {
          expect(calculateTotal([1, 2])).toBe(3);
        });
      });
    `;
    const result = gate.validate(testCode, 'src/my-module.ts');
    const importIssues = result.issues.filter(i => i.type === 'no-source-import');
    expect(importIssues).toHaveLength(0);
  });

  it('should match source file with .js extension in import path', () => {
    const testCode = `
      import { foo } from '../utils/helper.js';
    `;
    const result = gate.validate(testCode, 'utils/helper.ts');
    const importIssues = result.issues.filter(i => i.type === 'no-source-import');
    expect(importIssues).toHaveLength(0);
  });

  it('should handle Windows-style path separators in sourceFilePath', () => {
    const testCode = `
      import { bar } from '../src/my-module';
    `;
    const result = gate.validate(testCode, 'src\\my-module.ts');
    const importIssues = result.issues.filter(i => i.type === 'no-source-import');
    expect(importIssues).toHaveLength(0);
  });
});

// ============================================================================
// Tautological Assertion Detection
// ============================================================================

describe('TestQualityGate - tautological assertion detection', () => {
  const gate = new TestQualityGate({ checkSourceImports: false });

  it('should detect expect(true).toBe(true)', () => {
    const testCode = `
      import { foo } from './source';
      it('test', () => {
        expect(true).toBe(true);
      });
    `;
    const result = gate.validate(testCode, 'source.ts');
    const tautIssues = result.issues.filter(i => i.type === 'tautological-assertion');
    expect(tautIssues.length).toBeGreaterThanOrEqual(1);
    expect(tautIssues[0].severity).toBe('error');
  });

  it('should detect expect(false).toBe(false)', () => {
    const testCode = `expect(false).toBe(false);`;
    const result = gate.validate(testCode, 'source.ts');
    const tautIssues = result.issues.filter(i => i.type === 'tautological-assertion');
    expect(tautIssues.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect expect(null).toEqual(null)', () => {
    const testCode = `expect(null).toEqual(null);`;
    const result = gate.validate(testCode, 'source.ts');
    const tautIssues = result.issues.filter(i => i.type === 'tautological-assertion');
    expect(tautIssues.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect expect(1).toBe(1) (numeric literal)', () => {
    const testCode = `expect(1).toBe(1);`;
    const result = gate.validate(testCode, 'source.ts');
    const tautIssues = result.issues.filter(i => i.type === 'tautological-assertion');
    expect(tautIssues.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect expect("hello").toBe("hello") (string literal)', () => {
    const testCode = `expect("hello").toBe("hello");`;
    const result = gate.validate(testCode, 'source.ts');
    const tautIssues = result.issues.filter(i => i.type === 'tautological-assertion');
    expect(tautIssues.length).toBeGreaterThanOrEqual(1);
  });

  it("should detect expect('hello').toBe('hello') (single-quoted string)", () => {
    const testCode = `expect('hello').toBe('hello');`;
    const result = gate.validate(testCode, 'source.ts');
    const tautIssues = result.issues.filter(i => i.type === 'tautological-assertion');
    expect(tautIssues.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect expect(x).toBe(x) (same identifier)', () => {
    const testCode = `expect(x).toBe(x);`;
    const result = gate.validate(testCode, 'source.ts');
    const tautIssues = result.issues.filter(i => i.type === 'tautological-assertion');
    expect(tautIssues.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect expect(x).toEqual(x) variant', () => {
    const testCode = `expect(x).toEqual(x);`;
    const result = gate.validate(testCode, 'source.ts');
    const tautIssues = result.issues.filter(i => i.type === 'tautological-assertion');
    expect(tautIssues.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect expect(x).toStrictEqual(x) variant', () => {
    const testCode = `expect(x).toStrictEqual(x);`;
    const result = gate.validate(testCode, 'source.ts');
    const tautIssues = result.issues.filter(i => i.type === 'tautological-assertion');
    expect(tautIssues.length).toBeGreaterThanOrEqual(1);
  });

  it('should NOT flag expect(result).toBe(true) (different things)', () => {
    const testCode = `expect(result).toBe(true);`;
    const result = gate.validate(testCode, 'source.ts');
    const tautIssues = result.issues.filter(i => i.type === 'tautological-assertion');
    expect(tautIssues).toHaveLength(0);
  });

  it('should NOT flag expect(a).toBe(b) (different identifiers)', () => {
    const testCode = `expect(a).toBe(b);`;
    const result = gate.validate(testCode, 'source.ts');
    const tautIssues = result.issues.filter(i => i.type === 'tautological-assertion');
    expect(tautIssues).toHaveLength(0);
  });

  it('should report correct line number for tautological assertion', () => {
    const testCode = `line1\nline2\nexpect(true).toBe(true);\nline4`;
    const result = gate.validate(testCode, 'source.ts');
    const tautIssues = result.issues.filter(i => i.type === 'tautological-assertion');
    expect(tautIssues.length).toBeGreaterThanOrEqual(1);
    expect(tautIssues[0].line).toBe(3);
  });
});

// ============================================================================
// Empty Test Body Detection
// ============================================================================

describe('TestQualityGate - empty test body detection', () => {
  const gate = new TestQualityGate({ checkSourceImports: false });

  it('should detect it("should work", () => {})', () => {
    const testCode = `it('should work', () => {})`;
    const result = gate.validate(testCode, 'source.ts');
    const emptyIssues = result.issues.filter(i => i.type === 'empty-test-body');
    expect(emptyIssues.length).toBeGreaterThanOrEqual(1);
    expect(emptyIssues[0].severity).toBe('error');
  });

  it('should detect it with only whitespace in body', () => {
    const testCode = `it('should work', () => {   })`;
    const result = gate.validate(testCode, 'source.ts');
    const emptyIssues = result.issues.filter(i => i.type === 'empty-test-body');
    expect(emptyIssues.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect test("works", () => {})', () => {
    const testCode = `test('works', () => {})`;
    const result = gate.validate(testCode, 'source.ts');
    const emptyIssues = result.issues.filter(i => i.type === 'empty-test-body');
    expect(emptyIssues.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect it with comment-only body', () => {
    const testCode = `it('should work', () => { /* comment */ })`;
    const result = gate.validate(testCode, 'source.ts');
    const emptyIssues = result.issues.filter(i => i.type === 'empty-test-body');
    expect(emptyIssues.length).toBeGreaterThanOrEqual(1);
  });

  it('should NOT flag it with assertions in body', () => {
    // This test has content (even if tautological - that is caught by another check)
    const testCode = `it('should work', () => { expect(1).toBe(1); })`;
    const result = gate.validate(testCode, 'source.ts');
    const emptyIssues = result.issues.filter(i => i.type === 'empty-test-body');
    expect(emptyIssues).toHaveLength(0);
  });

  it('should detect async empty test body', () => {
    const testCode = `it('should work', async () => {})`;
    const result = gate.validate(testCode, 'source.ts');
    const emptyIssues = result.issues.filter(i => i.type === 'empty-test-body');
    expect(emptyIssues.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// Mirrored Assertion Detection
// ============================================================================

describe('TestQualityGate - mirrored assertion detection', () => {
  const gate = new TestQualityGate({ checkSourceImports: false });

  it('should warn when test assertion mirrors a source numeric literal', () => {
    const sourceCode = `export const MAX = 100;`;
    const testCode = `
      import { MAX } from './source';
      it('test', () => {
        expect(getMax()).toBe(100);
      });
    `;
    const result = gate.validate(testCode, 'source.ts', sourceCode);
    const mirroredIssues = result.issues.filter(i => i.type === 'mirrored-assertion');
    expect(mirroredIssues.length).toBeGreaterThanOrEqual(1);
    expect(mirroredIssues[0].severity).toBe('warning');
  });

  it('should warn when test assertion mirrors a source string literal', () => {
    const sourceCode = `export function greet() { return 'hello world'; }`;
    const testCode = `
      import { greet } from './source';
      it('test', () => {
        expect(greet()).toBe('hello world');
      });
    `;
    const result = gate.validate(testCode, 'source.ts', sourceCode);
    const mirroredIssues = result.issues.filter(i => i.type === 'mirrored-assertion');
    expect(mirroredIssues.length).toBeGreaterThanOrEqual(1);
  });

  it('should NOT warn for trivial values like 0 or 1', () => {
    const sourceCode = `export const val = 0;`;
    const testCode = `
      import { val } from './source';
      it('test', () => {
        expect(val).toBe(0);
      });
    `;
    const result = gate.validate(testCode, 'source.ts', sourceCode);
    const mirroredIssues = result.issues.filter(i => i.type === 'mirrored-assertion');
    expect(mirroredIssues).toHaveLength(0);
  });

  it('should skip mirrored check when sourceCode is not provided', () => {
    const testCode = `
      import { foo } from './source';
      it('test', () => {
        expect(foo()).toBe(100);
      });
    `;
    const result = gate.validate(testCode, 'source.ts');
    const mirroredIssues = result.issues.filter(i => i.type === 'mirrored-assertion');
    expect(mirroredIssues).toHaveLength(0);
  });
});

// ============================================================================
// Score Calculation
// ============================================================================

describe('TestQualityGate - score calculation', () => {
  it('should return score 100 and passed: true for a perfect test', () => {
    const gate = new TestQualityGate();
    const testCode = `
      import { add } from '../src/math';
      describe('add', () => {
        it('adds two numbers', () => {
          const result = add(2, 3);
          expect(result).toBe(5);
        });
      });
    `;
    const result = gate.validate(testCode, 'src/math.ts');
    expect(result.score).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('should subtract 20 points per error issue', () => {
    const gate = new TestQualityGate({ checkSourceImports: false });
    // One tautological assertion = one error = -20 => score 80
    const testCode = `expect(true).toBe(true);`;
    const result = gate.validate(testCode, 'source.ts');
    const errorCount = result.issues.filter(i => i.severity === 'error').length;
    expect(result.score).toBe(100 - errorCount * 20);
  });

  it('should subtract 5 points per warning issue', () => {
    const gate = new TestQualityGate({ checkSourceImports: false });
    const sourceCode = `export const MAX = 100;`;
    const testCode = `
      import { MAX } from './source';
      it('test', () => {
        expect(getMax()).toBe(100);
      });
    `;
    const result = gate.validate(testCode, 'source.ts', sourceCode);
    const warningCount = result.issues.filter(i => i.severity === 'warning').length;
    const errorCount = result.issues.filter(i => i.severity === 'error').length;
    expect(result.score).toBe(100 - errorCount * 20 - warningCount * 5);
  });

  it('should clamp score to 0 when many errors', () => {
    const gate = new TestQualityGate({ checkSourceImports: false });
    const testCode = `
      expect(true).toBe(true);
      expect(false).toBe(false);
      expect(null).toBe(null);
      expect(undefined).toBe(undefined);
      expect(1).toBe(1);
      expect(2).toBe(2);
    `;
    const result = gate.validate(testCode, 'source.ts');
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('should fail when score is below minPassScore', () => {
    const gate = new TestQualityGate({ minPassScore: 90, checkSourceImports: false });
    // One error = score 80 < 90
    const testCode = `expect(true).toBe(true);`;
    const result = gate.validate(testCode, 'source.ts');
    expect(result.passed).toBe(false);
  });
});

// ============================================================================
// Configuration
// ============================================================================

describe('TestQualityGate - configuration', () => {
  it('should skip source import check when disabled', () => {
    const gate = new TestQualityGate({ checkSourceImports: false });
    const testCode = `import { describe } from 'vitest';`;
    const result = gate.validate(testCode, 'source.ts');
    const importIssues = result.issues.filter(i => i.type === 'no-source-import');
    expect(importIssues).toHaveLength(0);
  });

  it('should skip tautological check when disabled', () => {
    const gate = new TestQualityGate({
      checkTautologicalAssertions: false,
      checkSourceImports: false,
    });
    const testCode = `expect(true).toBe(true);`;
    const result = gate.validate(testCode, 'source.ts');
    const tautIssues = result.issues.filter(i => i.type === 'tautological-assertion');
    expect(tautIssues).toHaveLength(0);
  });

  it('should skip empty body check when disabled', () => {
    const gate = new TestQualityGate({
      checkEmptyTestBodies: false,
      checkSourceImports: false,
    });
    const testCode = `it('test', () => {})`;
    const result = gate.validate(testCode, 'source.ts');
    const emptyIssues = result.issues.filter(i => i.type === 'empty-test-body');
    expect(emptyIssues).toHaveLength(0);
  });

  it('should skip mirrored check when disabled', () => {
    const gate = new TestQualityGate({
      checkMirroredAssertions: false,
      checkSourceImports: false,
    });
    const sourceCode = `export const MAX = 100;`;
    const testCode = `expect(getMax()).toBe(100);`;
    const result = gate.validate(testCode, 'source.ts', sourceCode);
    const mirroredIssues = result.issues.filter(i => i.type === 'mirrored-assertion');
    expect(mirroredIssues).toHaveLength(0);
  });

  it('should use custom minPassScore', () => {
    const gate = new TestQualityGate({ minPassScore: 50, checkSourceImports: false });
    // Two errors: score = 60 >= 50 => pass
    const testCode = `
      expect(true).toBe(true);
      expect(false).toBe(false);
    `;
    const result = gate.validate(testCode, 'source.ts');
    // 2 errors = score 60, which is >= 50
    expect(result.passed).toBe(true);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('TestQualityGate - edge cases', () => {
  it('should handle empty test code', () => {
    const gate = new TestQualityGate();
    const result = gate.validate('', 'source.ts');
    // Empty code has no source import => error
    expect(result.issues.length).toBeGreaterThanOrEqual(1);
    const importIssues = result.issues.filter(i => i.type === 'no-source-import');
    expect(importIssues).toHaveLength(1);
  });

  it('should handle test code with no assertions at all', () => {
    const gate = new TestQualityGate({ checkSourceImports: false });
    const testCode = `
      const x = 1;
      const y = 2;
    `;
    const result = gate.validate(testCode, 'source.ts');
    // No assertions means no tautological or empty body issues
    // (no it/test blocks to be empty)
    expect(result.score).toBe(100);
  });

  it('should handle source code with no extractable literals', () => {
    const gate = new TestQualityGate({ checkSourceImports: false });
    const sourceCode = `export function noop() {}`;
    const testCode = `
      import { noop } from './source';
      it('test', () => { expect(noop()).toBeUndefined(); });
    `;
    const result = gate.validate(testCode, 'source.ts', sourceCode);
    const mirroredIssues = result.issues.filter(i => i.type === 'mirrored-assertion');
    expect(mirroredIssues).toHaveLength(0);
  });

  it('should detect multiple issues in a single test file', () => {
    const gate = new TestQualityGate();
    const testCode = `
      import { describe, it, expect } from 'vitest';
      describe('bad tests', () => {
        it('empty', () => {});
        it('tautology', () => { expect(true).toBe(true); });
      });
    `;
    const result = gate.validate(testCode, 'src/my-module.ts');
    // Should have: no-source-import, empty-test-body, tautological-assertion
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
    const types = new Set(result.issues.map(i => i.type));
    expect(types.has('no-source-import')).toBe(true);
    expect(types.has('empty-test-body')).toBe(true);
    expect(types.has('tautological-assertion')).toBe(true);
  });
});
