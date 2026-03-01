/**
 * Issue N6: Object return type assertion ordering
 *
 * Verifies that generators produce the correct assertion when a function
 * returns an object type like `{ valid: boolean; count: number }`.
 * The `{` check must come before `.includes('boolean')` to prevent
 * misclassifying object types as primitives.
 */

import { describe, it, expect } from 'vitest';
import {
  JestVitestGenerator,
  MochaGenerator,
  PytestGenerator,
  NodeTestGenerator,
} from '../../../../../src/domains/test-generation/generators';
import type {
  FunctionInfo,
  TestGenerationContext,
} from '../../../../../src/domains/test-generation/interfaces/test-generator.interface';

// Helper: build a minimal FunctionInfo with the given return type
function makeFn(overrides: Partial<FunctionInfo> = {}): FunctionInfo {
  return {
    name: 'processData',
    parameters: [],
    returnType: '{ valid: boolean; count: number }',
    isAsync: false,
    isExported: true,
    body: '',
    ...overrides,
  };
}

// Helper: build a minimal TestGenerationContext around a single function
function makeContext(fn: FunctionInfo): TestGenerationContext {
  return {
    moduleName: 'testModule',
    importPath: './test-module',
    testType: 'unit',
    patterns: [],
    analysis: {
      functions: [fn],
      classes: [],
    },
  };
}

describe('Issue N6: Object return type assertion', () => {
  // =========================================================================
  // Jest/Vitest generator
  // =========================================================================
  describe('JestVitestGenerator', () => {
    const gen = new JestVitestGenerator('vitest');

    it('should use object assertion for { valid: boolean } return type', () => {
      const ctx = makeContext(makeFn({ returnType: '{ valid: boolean; count: number }' }));
      const code = gen.generateTests(ctx);

      // Should assert object, NOT boolean
      expect(code).toContain("toBe('object')");
      expect(code).not.toMatch(/expect\(typeof result\)\.toBe\('boolean'\)/);
    });

    it('should use boolean assertion for plain boolean return type', () => {
      const ctx = makeContext(makeFn({ returnType: 'boolean' }));
      const code = gen.generateTests(ctx);

      expect(code).toContain("toBe('boolean')");
    });

    it('should use number assertion for plain number return type', () => {
      const ctx = makeContext(makeFn({ returnType: 'number' }));
      const code = gen.generateTests(ctx);

      expect(code).toContain("toBe('number')");
    });

    it('should use object assertion for Promise<{ data: string }>', () => {
      const ctx = makeContext(makeFn({
        returnType: 'Promise<{ data: string }>',
        isAsync: true,
      }));
      const code = gen.generateTests(ctx);

      expect(code).toContain("toBe('object')");
      expect(code).not.toMatch(/expect\(typeof result\)\.toBe\('string'\)/);
    });
  });

  // =========================================================================
  // Mocha generator
  // =========================================================================
  describe('MochaGenerator', () => {
    const gen = new MochaGenerator();

    it('should use object assertion for { valid: boolean } return type', () => {
      const ctx = makeContext(makeFn({ returnType: '{ valid: boolean }' }));
      const code = gen.generateTests(ctx);

      expect(code).toContain("to.be.an('object')");
      expect(code).not.toMatch(/expect\(typeof result\)\.to\.equal\('boolean'\)/);
    });

    it('should use boolean assertion for plain boolean return type', () => {
      const ctx = makeContext(makeFn({ returnType: 'boolean' }));
      const code = gen.generateTests(ctx);

      expect(code).toContain("to.equal('boolean')");
    });
  });

  // =========================================================================
  // Node test generator
  // =========================================================================
  describe('NodeTestGenerator', () => {
    const gen = new NodeTestGenerator();

    it('should use object assertion for { valid: boolean } return type', () => {
      const ctx = makeContext(makeFn({ returnType: '{ valid: boolean }' }));
      const code = gen.generateTests(ctx);

      // NodeTestGenerator uses convertToAssert — should produce assert for object
      // The base generator creates expect().toBe('object'), convertToAssert maps it
      expect(code).toContain('object');
      expect(code).not.toMatch(/typeof result.*boolean/);
    });
  });

  // =========================================================================
  // Pytest generator
  // =========================================================================
  describe('PytestGenerator', () => {
    const gen = new PytestGenerator();

    it('should use dict assertion for { valid: boolean } return type', () => {
      const ctx = makeContext(makeFn({ returnType: '{ valid: boolean }' }));
      const code = gen.generateTests(ctx);

      expect(code).toContain('isinstance(result, dict)');
      // Should NOT produce isinstance(result, bool)
      expect(code).not.toMatch(/isinstance\(result, bool\)/);
    });

    it('should use bool assertion for plain boolean return type', () => {
      const ctx = makeContext(makeFn({ returnType: 'boolean' }));
      const code = gen.generateTests(ctx);

      expect(code).toContain('isinstance(result, bool)');
    });
  });
});
