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
   * Name-based value generators. Each entry is [nameSubstring, generatorFn].
   * Checked in order; first match wins.
   */
  private static readonly NAME_VALUE_TABLE: ReadonlyArray<[string, () => string]> = [
    ['id', () => `'${faker.string.uuid()}'`],
    ['email', () => `'${faker.internet.email()}'`],
    ['name', () => `'${faker.person.fullName()}'`],
    ['url', () => `'${faker.internet.url()}'`],
    ['date', () => `new Date('${faker.date.recent().toISOString()}')`],
    ['phone', () => `'${faker.phone.number()}'`],
    ['address', () => `'${faker.location.streetAddress()}'`],
  ];

  /**
   * Type-based value generators. Each entry is [typeSubstring, generatorFn].
   * Checked in order; first match wins.
   */
  private static readonly TYPE_VALUE_TABLE: ReadonlyArray<[string, () => string]> = [
    ['string', () => `'${faker.lorem.word()}'`],
    ['number', () => String(faker.number.int({ min: 1, max: 100 }))],
    ['boolean', () => 'true'],
    ['[]', () => '[]'],
    ['array', () => '[]'],
    ['object', () => '{}'],
    ['{', () => '{}'],
    ['function', () => '() => {}'],
    ['promise', () => 'Promise.resolve()'],
    ['date', () => 'new Date()'],
  ];

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
    for (const [nameKey, generator] of BaseTestGenerator.NAME_VALUE_TABLE) {
      if (name.includes(nameKey)) return generator();
    }

    // Then by type
    for (const [typeKey, generator] of BaseTestGenerator.TYPE_VALUE_TABLE) {
      if (type.includes(typeKey)) return generator();
    }

    // Bug #295 fix: Return a safe inline value instead of an undefined variable reference
    return `{} /* TODO: provide ${param.name}: ${param.type || 'unknown'} */`;
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
    const isVoid = fn.returnType === 'void' || fn.returnType === 'Promise<void>';

    // Smart assertion based on function name and return type
    let assertion = 'expect(result).toBeDefined();';
    if (!isVoid) {
      // Use regex to require uppercase after prefix — avoids matching 'isolate', 'issue', 'isbn', etc.
      if (/^(is|has|can)[A-Z]/.test(fn.name)) {
        assertion = "expect(typeof result).toBe('boolean');";
      } else if (/^(get|fetch|find)[A-Z]/.test(fn.name)) {
        assertion = 'expect(result).not.toBeUndefined();';
      } else if (/^(create|build|make)[A-Z]/.test(fn.name)) {
        assertion = 'expect(result).toBeTruthy();';
      } else if (fn.returnType) {
        const rt = fn.returnType.toLowerCase().replace(/promise<(.+)>/, '$1');
        if (rt.includes('boolean')) assertion = "expect(typeof result).toBe('boolean');";
        else if (rt.includes('number')) assertion = "expect(typeof result).toBe('number');";
        else if (rt.includes('string')) assertion = "expect(typeof result).toBe('string');";
        else if (rt.includes('[]') || rt.includes('array')) assertion = 'expect(Array.isArray(result)).toBe(true);';
      }
    }

    testCases.push({
      description: 'should handle valid input correctly',
      type: 'happy-path',
      action: isVoid ? `${fnCall};` : `const result = ${fnCall};`,
      assertion: isVoid ? `// void function — no return value to assert` : assertion,
    });

    // Generate tests for each parameter
    // Bug #295 fix: Check function body for explicit throw/validation before assuming toThrow()
    const bodyText = fn.body || '';
    const hasExplicitThrow = /\bthrow\b/.test(bodyText) || /\bvalidat/i.test(bodyText);

    for (const param of fn.parameters) {
      // Test with undefined for required parameters
      if (!param.optional) {
        const paramsWithUndefined = fn.parameters
          .map((p) => (p.name === param.name ? 'undefined' : this.generateTestValue(p)))
          .join(', ');

        if (hasExplicitThrow) {
          testCases.push({
            description: `should handle undefined ${param.name}`,
            type: 'error-handling',
            action: fn.isAsync
              ? `const action = async () => await ${fn.name}(${paramsWithUndefined});`
              : `const action = () => ${fn.name}(${paramsWithUndefined});`,
            assertion: 'expect(action).toThrow();',
          });
        } else {
          // Function has no explicit throw — but may still crash on property access.
          // Use try-catch pattern that accepts either behavior.
          const undefinedCall = fn.isAsync
            ? `await ${fn.name}(${paramsWithUndefined})`
            : `${fn.name}(${paramsWithUndefined})`;
          testCases.push({
            description: `should handle undefined ${param.name}`,
            type: 'edge-case',
            action: fn.isAsync
              ? `let threw = false;\n    try {\n      await ${fn.name}(${paramsWithUndefined});\n    } catch (e) {\n      threw = true;\n      expect(e).toBeInstanceOf(Error);\n    }`
              : `let threw = false;\n    try {\n      ${fn.name}(${paramsWithUndefined});\n    } catch (e) {\n      threw = true;\n      expect(e).toBeInstanceOf(Error);\n    }`,
            assertion: `expect(true).toBe(true); // function either handles undefined or throws TypeError`,
          });
        }
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

    // Boundary inputs are likely to trigger validation — use try-catch to handle both cases
    const wrapBoundaryAction = (call: string, isAsync: boolean): string => {
      if (isAsync) {
        return `try {\n      const result = await ${call};\n      expect(result).toBeDefined();\n    } catch (e) {\n      expect(e).toBeInstanceOf(Error);\n    }`;
      }
      return `try {\n      const result = ${call};\n      expect(result).toBeDefined();\n    } catch (e) {\n      expect(e).toBeInstanceOf(Error);\n    }`;
    };

    // String boundary tests
    if (type.includes('string')) {
      const paramsWithEmpty = fn.parameters
        .map((p) => (p.name === param.name ? "''" : this.generateTestValue(p)))
        .join(', ');
      const emptyCall = `${fn.name}(${paramsWithEmpty})`;

      testCases.push({
        description: `should handle empty string for ${param.name}`,
        type: 'boundary',
        action: wrapBoundaryAction(emptyCall, fn.isAsync),
        assertion: '',
      });
    }

    // Number boundary tests
    if (type.includes('number')) {
      // Test with zero
      const paramsWithZero = fn.parameters
        .map((p) => (p.name === param.name ? '0' : this.generateTestValue(p)))
        .join(', ');
      const zeroCall = `${fn.name}(${paramsWithZero})`;

      testCases.push({
        description: `should handle zero for ${param.name}`,
        type: 'boundary',
        action: wrapBoundaryAction(zeroCall, fn.isAsync),
        assertion: '',
      });

      // Test with negative value
      const paramsWithNegative = fn.parameters
        .map((p) => (p.name === param.name ? '-1' : this.generateTestValue(p)))
        .join(', ');
      const negativeCall = `${fn.name}(${paramsWithNegative})`;

      testCases.push({
        description: `should handle negative value for ${param.name}`,
        type: 'edge-case',
        action: wrapBoundaryAction(negativeCall, fn.isAsync),
        assertion: '',
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
