/**
 * Agentic QE v3 - Base Test Generator
 * Abstract base class providing shared utilities for all framework-specific generators
 *
 * Implements the Template Method pattern for common test generation logic,
 * while allowing subclasses to override framework-specific details.
 *
 * @module test-generation/generators
 */

import { faker } from '@faker-js/faker';
import type {
  ITestGenerator,
  TestFramework,
  TestType,
  FunctionInfo,
  ClassInfo,
  ParameterInfo,
  TestCase,
  TestGenerationContext,
  Pattern,
} from '../interfaces';

/**
 * BaseTestGenerator - Abstract base class for test generators
 *
 * Provides common functionality for:
 * - Test value generation based on parameter types
 * - Test case generation from function signatures
 * - Import statement extraction
 * - Helper utilities for naming and formatting
 *
 * Subclasses must implement framework-specific methods:
 * - generateTests()
 * - generateFunctionTests()
 * - generateClassTests()
 * - generateStubTests()
 * - generateCoverageTests()
 */
export abstract class BaseTestGenerator implements ITestGenerator {
  abstract readonly framework: TestFramework;

  // ============================================================================
  // Abstract Methods - Must be implemented by subclasses
  // ============================================================================

  abstract generateTests(context: TestGenerationContext): string;
  abstract generateFunctionTests(fn: FunctionInfo, testType: TestType): string;
  abstract generateClassTests(cls: ClassInfo, testType: TestType): string;
  abstract generateStubTests(context: TestGenerationContext): string;
  abstract generateCoverageTests(moduleName: string, importPath: string, lines: number[]): string;

  // ============================================================================
  // Shared Utilities - Available to all subclasses
  // ============================================================================

  /**
   * Generate a test value for a parameter based on its type and name
   * Uses @faker-js/faker for realistic test data
   *
   * @param param - Parameter information
   * @returns Generated test value as a string
   */
  protected generateTestValue(param: ParameterInfo): string {
    if (param.defaultValue) {
      return param.defaultValue;
    }

    const type = param.type?.toLowerCase() || 'unknown';
    const name = param.name.toLowerCase();

    // Infer from param name first (more specific)
    if (name.includes('id')) return `'${faker.string.uuid()}'`;
    if (name.includes('email')) return `'${faker.internet.email()}'`;
    if (name.includes('name')) return `'${faker.person.fullName()}'`;
    if (name.includes('url')) return `'${faker.internet.url()}'`;
    if (name.includes('date')) return `new Date('${faker.date.recent().toISOString()}')`;
    if (name.includes('phone')) return `'${faker.phone.number()}'`;
    if (name.includes('address')) return `'${faker.location.streetAddress()}'`;

    // Then by type
    if (type.includes('string')) return `'${faker.lorem.word()}'`;
    if (type.includes('number')) return String(faker.number.int({ min: 1, max: 100 }));
    if (type.includes('boolean')) return 'true';
    if (type.includes('[]') || type.includes('array')) return '[]';
    if (type.includes('object') || type.includes('{')) return '{}';
    if (type.includes('function')) return '() => {}';
    if (type.includes('promise')) return 'Promise.resolve()';
    if (type.includes('date')) return 'new Date()';

    // Default: generate a mock variable name
    return `mock${param.name.charAt(0).toUpperCase() + param.name.slice(1)}`;
  }

  /**
   * Generate test cases for a function based on its signature
   * Creates happy-path, edge-case, error-handling, and boundary tests
   *
   * @param fn - Function information from AST
   * @returns Array of test cases
   */
  protected generateTestCasesForFunction(fn: FunctionInfo): TestCase[] {
    const testCases: TestCase[] = [];

    // Generate valid input test (happy path)
    const validParams = fn.parameters.map((p) => this.generateTestValue(p)).join(', ');
    const fnCall = fn.isAsync ? `await ${fn.name}(${validParams})` : `${fn.name}(${validParams})`;

    testCases.push({
      description: 'should handle valid input correctly',
      type: 'happy-path',
      action: `const result = ${fnCall};`,
      assertion: 'expect(result).toBeDefined();',
    });

    // Generate tests for each parameter
    for (const param of fn.parameters) {
      // Test with undefined for required parameters
      if (!param.optional) {
        const paramsWithUndefined = fn.parameters
          .map((p) => (p.name === param.name ? 'undefined' : this.generateTestValue(p)))
          .join(', ');

        testCases.push({
          description: `should handle undefined ${param.name}`,
          type: 'error-handling',
          action: fn.isAsync
            ? `const action = async () => await ${fn.name}(${paramsWithUndefined});`
            : `const action = () => ${fn.name}(${paramsWithUndefined});`,
          assertion: 'expect(action).toThrow();',
        });
      }

      // Type-specific boundary tests
      testCases.push(...this.generateBoundaryTestCases(fn, param));
    }

    // Async rejection test
    if (fn.isAsync) {
      testCases.push({
        description: 'should handle async rejection gracefully',
        type: 'error-handling',
        action: `// Mock or setup to cause rejection`,
        assertion: `// await expect(${fn.name}(invalidParams)).rejects.toThrow();`,
      });
    }

    return testCases;
  }

  /**
   * Generate boundary test cases for a parameter based on its type
   */
  protected generateBoundaryTestCases(fn: FunctionInfo, param: ParameterInfo): TestCase[] {
    const testCases: TestCase[] = [];
    const type = param.type?.toLowerCase() || '';

    // String boundary tests
    if (type.includes('string')) {
      const paramsWithEmpty = fn.parameters
        .map((p) => (p.name === param.name ? "''" : this.generateTestValue(p)))
        .join(', ');
      const emptyCall = fn.isAsync
        ? `await ${fn.name}(${paramsWithEmpty})`
        : `${fn.name}(${paramsWithEmpty})`;

      testCases.push({
        description: `should handle empty string for ${param.name}`,
        type: 'boundary',
        action: `const result = ${emptyCall};`,
        assertion: 'expect(result).toBeDefined();',
      });
    }

    // Number boundary tests
    if (type.includes('number')) {
      // Test with zero
      const paramsWithZero = fn.parameters
        .map((p) => (p.name === param.name ? '0' : this.generateTestValue(p)))
        .join(', ');
      const zeroCall = fn.isAsync
        ? `await ${fn.name}(${paramsWithZero})`
        : `${fn.name}(${paramsWithZero})`;

      testCases.push({
        description: `should handle zero for ${param.name}`,
        type: 'boundary',
        action: `const result = ${zeroCall};`,
        assertion: 'expect(result).toBeDefined();',
      });

      // Test with negative value
      const paramsWithNegative = fn.parameters
        .map((p) => (p.name === param.name ? '-1' : this.generateTestValue(p)))
        .join(', ');
      const negativeCall = fn.isAsync
        ? `await ${fn.name}(${paramsWithNegative})`
        : `${fn.name}(${paramsWithNegative})`;

      testCases.push({
        description: `should handle negative value for ${param.name}`,
        type: 'edge-case',
        action: `const result = ${negativeCall};`,
        assertion: 'expect(result).toBeDefined();',
      });
    }

    // Array boundary tests
    if (type.includes('[]') || type.includes('array')) {
      const paramsWithEmpty = fn.parameters
        .map((p) => (p.name === param.name ? '[]' : this.generateTestValue(p)))
        .join(', ');
      const emptyCall = fn.isAsync
        ? `await ${fn.name}(${paramsWithEmpty})`
        : `${fn.name}(${paramsWithEmpty})`;

      testCases.push({
        description: `should handle empty array for ${param.name}`,
        type: 'boundary',
        action: `const result = ${emptyCall};`,
        assertion: 'expect(result).toBeDefined();',
      });
    }

    return testCases;
  }

  /**
   * Extract exports from code analysis for import statements
   */
  protected extractExports(
    functions: FunctionInfo[],
    classes: ClassInfo[]
  ): string[] {
    const exports: string[] = [];

    for (const fn of functions) {
      if (fn.isExported) exports.push(fn.name);
    }
    for (const cls of classes) {
      if (cls.isExported) exports.push(cls.name);
    }

    return exports;
  }

  /**
   * Generate import statement based on exports
   */
  protected generateImportStatement(
    exports: string[],
    importPath: string,
    moduleName: string
  ): string {
    if (exports.length > 0) {
      return `import { ${exports.join(', ')} } from '${importPath}';`;
    }
    return `import * as ${moduleName} from '${importPath}';`;
  }

  /**
   * Generate pattern comment header
   */
  protected generatePatternComment(patterns: Pattern[]): string {
    if (patterns.length === 0) return '';
    return `// Applied patterns: ${patterns.map((p) => p.name).join(', ')}\n`;
  }

  /**
   * Convert string to camelCase
   */
  protected camelCase(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
      .replace(/^./, (chr) => chr.toLowerCase());
  }

  /**
   * Convert string to PascalCase
   */
  protected pascalCase(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
      .replace(/^./, (chr) => chr.toUpperCase());
  }

  /**
   * Format line range for display
   */
  protected formatLineRange(lines: number[]): string {
    if (lines.length === 1) {
      return `line ${lines[0]}`;
    }
    return `lines ${lines[0]}-${lines[lines.length - 1]}`;
  }
}
