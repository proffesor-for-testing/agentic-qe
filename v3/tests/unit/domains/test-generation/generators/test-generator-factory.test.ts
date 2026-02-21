/**
 * Test Generator Factory - Unit Tests
 * Verifies the Strategy Pattern implementation for test generation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TestGeneratorFactory,
  createTestGenerator,
  isValidTestFramework,
  testGeneratorFactory,
} from '../../../../../src/domains/test-generation/factories';
import {
  JestVitestGenerator,
  MochaGenerator,
  PytestGenerator,
  NodeTestGenerator,
} from '../../../../../src/domains/test-generation/generators';
import type {
  TestFramework,
  ITestGenerator,
  TestGenerationContext,
} from '../../../../../src/domains/test-generation/interfaces/test-generator.interface';

describe('TestGeneratorFactory', () => {
  let factory: TestGeneratorFactory;

  beforeEach(() => {
    factory = new TestGeneratorFactory();
  });

  describe('create()', () => {
    it('should create a JestVitestGenerator for jest framework', () => {
      const generator = factory.create('jest');
      expect(generator).toBeInstanceOf(JestVitestGenerator);
      expect(generator.framework).toBe('jest');
    });

    it('should create a JestVitestGenerator for vitest framework', () => {
      const generator = factory.create('vitest');
      expect(generator).toBeInstanceOf(JestVitestGenerator);
      expect(generator.framework).toBe('vitest');
    });

    it('should create a MochaGenerator for mocha framework', () => {
      const generator = factory.create('mocha');
      expect(generator).toBeInstanceOf(MochaGenerator);
      expect(generator.framework).toBe('mocha');
    });

    it('should create a PytestGenerator for pytest framework', () => {
      const generator = factory.create('pytest');
      expect(generator).toBeInstanceOf(PytestGenerator);
      expect(generator.framework).toBe('pytest');
    });

    it('should create a NodeTestGenerator for node-test framework', () => {
      const generator = factory.create('node-test');
      expect(generator).toBeInstanceOf(NodeTestGenerator);
      expect(generator.framework).toBe('node-test');
    });

    it('should cache generators for reuse', () => {
      const gen1 = factory.create('jest');
      const gen2 = factory.create('jest');
      expect(gen1).toBe(gen2); // Same instance
    });

    it('should create different generators for different frameworks', () => {
      const jestGen = factory.create('jest');
      const mochaGen = factory.create('mocha');
      expect(jestGen).not.toBe(mochaGen);
    });
  });

  describe('supports()', () => {
    it('should return true for supported frameworks', () => {
      expect(factory.supports('jest')).toBe(true);
      expect(factory.supports('vitest')).toBe(true);
      expect(factory.supports('mocha')).toBe(true);
      expect(factory.supports('pytest')).toBe(true);
      expect(factory.supports('node-test')).toBe(true);
    });

    it('should return false for unsupported frameworks', () => {
      expect(factory.supports('jasmine')).toBe(false);
      expect(factory.supports('ava')).toBe(false);
      expect(factory.supports('tap')).toBe(false);
      expect(factory.supports('')).toBe(false);
    });
  });

  describe('getDefault()', () => {
    it('should return vitest as the default framework', () => {
      expect(factory.getDefault()).toBe('vitest');
    });
  });

  describe('getSupportedFrameworks()', () => {
    it('should return all supported frameworks', () => {
      const frameworks = factory.getSupportedFrameworks();
      expect(frameworks).toContain('jest');
      expect(frameworks).toContain('vitest');
      expect(frameworks).toContain('mocha');
      expect(frameworks).toContain('pytest');
      expect(frameworks).toContain('node-test');
      expect(frameworks).toHaveLength(5);
    });
  });

  describe('clearCache()', () => {
    it('should clear the generator cache', () => {
      const gen1 = factory.create('jest');
      factory.clearCache();
      const gen2 = factory.create('jest');
      expect(gen1).not.toBe(gen2); // Different instances after cache clear
    });
  });
});

describe('createTestGenerator()', () => {
  it('should create a generator for the specified framework', () => {
    const generator = createTestGenerator('mocha');
    expect(generator.framework).toBe('mocha');
  });

  it('should use the default framework when none is specified', () => {
    const generator = createTestGenerator();
    expect(generator.framework).toBe('vitest');
  });
});

describe('isValidTestFramework()', () => {
  it('should return true for valid frameworks', () => {
    expect(isValidTestFramework('jest')).toBe(true);
    expect(isValidTestFramework('vitest')).toBe(true);
    expect(isValidTestFramework('mocha')).toBe(true);
    expect(isValidTestFramework('pytest')).toBe(true);
    expect(isValidTestFramework('node-test')).toBe(true);
  });

  it('should return false for invalid frameworks', () => {
    expect(isValidTestFramework('invalid')).toBe(false);
    expect(isValidTestFramework('')).toBe(false);
  });
});

describe('testGeneratorFactory singleton', () => {
  it('should be a TestGeneratorFactory instance', () => {
    expect(testGeneratorFactory).toBeInstanceOf(TestGeneratorFactory);
  });
});

describe('Generator Strategy Pattern', () => {
  const frameworks: TestFramework[] = ['jest', 'vitest', 'mocha', 'pytest', 'node-test'];

  describe.each(frameworks)('%s generator', (framework) => {
    let generator: ITestGenerator;
    let context: TestGenerationContext;

    beforeEach(() => {
      generator = createTestGenerator(framework);
      context = {
        moduleName: 'testModule',
        importPath: './test-module',
        testType: 'unit',
        patterns: [],
        analysis: {
          functions: [
            {
              name: 'add',
              parameters: [
                { name: 'a', type: 'number', optional: false, defaultValue: undefined },
                { name: 'b', type: 'number', optional: false, defaultValue: undefined },
              ],
              returnType: 'number',
              isAsync: false,
              isExported: true,
              complexity: 1,
              startLine: 1,
              endLine: 3,
            },
          ],
          classes: [
            {
              name: 'Calculator',
              methods: [
                {
                  name: 'multiply',
                  parameters: [
                    { name: 'x', type: 'number', optional: false, defaultValue: undefined },
                    { name: 'y', type: 'number', optional: false, defaultValue: undefined },
                  ],
                  returnType: 'number',
                  isAsync: false,
                  isExported: false,
                  complexity: 1,
                  startLine: 10,
                  endLine: 12,
                },
              ],
              properties: [],
              isExported: true,
              hasConstructor: false,
            },
          ],
        },
      };
    });

    it(`should have the correct framework: ${framework}`, () => {
      expect(generator.framework).toBe(framework);
    });

    it('should generate tests from analysis', () => {
      const code = generator.generateTests(context);
      expect(code).toBeTruthy();
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(100);
    });

    it('should generate function tests', () => {
      const fn = context.analysis!.functions[0];
      const code = generator.generateFunctionTests(fn, 'unit');
      expect(code).toContain('add');
      expect(code.length).toBeGreaterThan(50);
    });

    it('should generate class tests', () => {
      const cls = context.analysis!.classes[0];
      const code = generator.generateClassTests(cls, 'unit');
      expect(code).toContain('Calculator');
      expect(code).toContain('multiply');
    });

    it('should generate stub tests when no analysis', () => {
      const stubContext: TestGenerationContext = {
        moduleName: 'stubModule',
        importPath: './stub-module',
        testType: 'unit',
        patterns: [],
      };
      const code = generator.generateStubTests(stubContext);
      expect(code).toContain('stubModule');
      expect(code.length).toBeGreaterThan(100);
    });

    it('should generate coverage tests', () => {
      const code = generator.generateCoverageTests('coverageModule', './coverage-module', [10, 11, 12]);
      expect(code).toContain('coverageModule');
      expect(code).toContain('10');
      expect(code).toContain('12');
    });
  });
});
