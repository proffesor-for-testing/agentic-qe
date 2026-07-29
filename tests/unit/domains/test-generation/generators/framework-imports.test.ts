/**
 * Regression test for bug #2: jest framework was previously emitting
 * `import { describe, it, expect } from 'jest'` which is invalid (the
 * 'jest' package is the CLI, not a runtime export). Tests-as-emitted
 * would fail at runtime with "Cannot find module 'jest'".
 *
 * Fix: emit `from 'vitest'` for vitest, `from '@jest/globals'` for jest.
 */

import { describe, it, expect } from 'vitest';
import { JestVitestGenerator } from '../../../../../src/domains/test-generation/generators/jest-vitest-generator';
import type {
  FunctionInfo,
  TestGenerationContext,
} from '../../../../../src/domains/test-generation/interfaces/test-generator.interface';

function makeContext(): TestGenerationContext {
  const fn: FunctionInfo = {
    name: 'add',
    parameters: [
      { name: 'a', type: 'number' },
      { name: 'b', type: 'number' },
    ],
    returnType: 'number',
    isAsync: false,
    isExported: true,
    body: '',
  };
  return {
    moduleName: 'add',
    importPath: './add',
    testType: 'unit',
    patterns: [],
    analysis: { functions: [fn], classes: [] },
  };
}

describe('Framework-aware import generation (bug #2)', () => {
  it('emits "from \'vitest\'" when framework is vitest', () => {
    const code = new JestVitestGenerator('vitest').generateTests(makeContext());
    expect(code).toContain("from 'vitest'");
    expect(code).toContain(', vi');
    // Must not import from jest sources
    expect(code).not.toContain("from 'jest'");
    expect(code).not.toContain("from '@jest/globals'");
  });

  it('emits "from \'@jest/globals\'" when framework is jest', () => {
    const code = new JestVitestGenerator('jest').generateTests(makeContext());
    expect(code).toContain("from '@jest/globals'");
    expect(code).toContain(', jest');
    // Must NEVER emit `from 'jest'` — the original bug
    expect(code).not.toMatch(/from\s+['"]jest['"]/);
    // And must not import from vitest
    expect(code).not.toContain("from 'vitest'");
  });

  it('emits framework-correct imports in stub path (no analysis)', () => {
    // generateStubTests is the path taken when AST analysis is empty
    const stubCtx: TestGenerationContext = {
      moduleName: 'stub',
      importPath: './stub',
      testType: 'unit',
      patterns: [],
      analysis: { functions: [], classes: [] },
    };

    const jestCode = new JestVitestGenerator('jest').generateTests(stubCtx);
    expect(jestCode).toContain("from '@jest/globals'");
    expect(jestCode).not.toMatch(/from\s+['"]jest['"]/);

    const vitestCode = new JestVitestGenerator('vitest').generateTests(stubCtx);
    expect(vitestCode).toContain("from 'vitest'");
    expect(vitestCode).not.toContain("from 'jest'");
  });

  it('main and stub paths use the same import source for the same framework', () => {
    // Consistency: both paths must emit the same import source
    const mainCode = new JestVitestGenerator('jest').generateTests(makeContext());
    const stubCode = new JestVitestGenerator('jest').generateTests({
      moduleName: 'x',
      importPath: './x',
      testType: 'unit',
      patterns: [],
      analysis: { functions: [], classes: [] },
    });

    const mainImport = mainCode.match(/from\s+['"]([^'"]+)['"]/)?.[1];
    const stubImport = stubCode.match(/from\s+['"]([^'"]+)['"]/)?.[1];
    expect(mainImport).toBe('@jest/globals');
    expect(stubImport).toBe('@jest/globals');
  });

  it('uses a valid namespace identifier for dotted JavaScript module filenames', () => {
    const code = new JestVitestGenerator('vitest').generateTests({
      moduleName: 'policy.default.mjs',
      importPath: './policy.default.mjs',
      testType: 'unit',
      patterns: [],
      analysis: { functions: [], classes: [] },
    });

    expect(code).toContain("import * as moduleUnderTest from './policy.default.mjs';");
    expect(code).not.toContain('import { policy.default.mjs }');
    expect(code).toContain('expect(moduleUnderTest).toBeDefined()');
  });

  it('does not invent an undefined-input contract when the function has no validation', () => {
    const code = new JestVitestGenerator('vitest').generateTests(makeContext());

    expect(code).not.toContain('expect(true).toBe(true)');
    expect(code).not.toContain('should handle undefined');
  });
});
