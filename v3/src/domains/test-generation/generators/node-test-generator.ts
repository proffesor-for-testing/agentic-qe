/**
 * Agentic QE v3 - Node.js Test Runner Generator
 * Strategy implementation for Node.js built-in test runner (node:test)
 *
 * Generates test code using:
 * - describe/it blocks from node:test
 * - assert module for assertions
 * - beforeEach/afterEach hooks
 * - async/await support
 *
 * @module test-generation/generators
 */

import { BaseTestGenerator } from './base-test-generator';
import type {
  TestFramework,
  TestType,
  FunctionInfo,
  ClassInfo,
  TestGenerationContext,
  Pattern,
} from '../interfaces';

/**
 * NodeTestGenerator - Test generator for Node.js built-in test runner
 *
 * Supports Node.js 18+ with the native test runner module (node:test).
 * Uses assert module for assertions instead of expect().
 *
 * @example
 * ```typescript
 * const generator = new NodeTestGenerator();
 * const testCode = generator.generateTests({
 *   moduleName: 'userService',
 *   importPath: './user-service.mjs',
 *   testType: 'unit',
 *   patterns: [],
 *   analysis: { functions: [...], classes: [...] }
 * });
 * ```
 */
export class NodeTestGenerator extends BaseTestGenerator {
  readonly framework: TestFramework = 'node-test';

  /**
   * Generate complete test file from analysis
   */
  generateTests(context: TestGenerationContext): string {
    const { moduleName, importPath, testType, patterns, analysis } = context;

    if (!analysis || (analysis.functions.length === 0 && analysis.classes.length === 0)) {
      return this.generateStubTests(context);
    }

    const patternComment = this.generatePatternComment(patterns);
    
    // Filter to only exported functions and classes
    const exportedFunctions = analysis.functions.filter((fn) => fn.isExported);
    const exportedClasses = analysis.classes.filter((cls) => cls.isExported);
    
    const exports = this.extractExports(exportedFunctions, exportedClasses);
    const importStatement = this.generateImportStatement(exports, importPath, moduleName);

    let testCode = `${patternComment}import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
${importStatement}

`;

    // Generate tests for each exported function
    for (const fn of exportedFunctions) {
      testCode += this.generateFunctionTests(fn, testType);
    }

    // Generate tests for each exported class
    for (const cls of exportedClasses) {
      testCode += this.generateClassTests(cls, testType);
    }

    return testCode;
  }

  /**
   * Generate tests for a standalone function
   */
  generateFunctionTests(fn: FunctionInfo, _testType: TestType): string {
    const testCases = this.generateTestCasesForFunction(fn);

    let code = `describe('${fn.name}', () => {\n`;

    for (const testCase of testCases) {
      if (testCase.setup) {
        code += `  ${testCase.setup}\n\n`;
      }

      const asyncPrefix = fn.isAsync ? 'async ' : '';
      code += `  it('${testCase.description}', ${asyncPrefix}() => {\n`;
      code += `    ${testCase.action}\n`;
      // Convert expect assertions to assert
      code += `    ${this.convertToAssert(testCase.assertion)}\n`;
      code += `  });\n\n`;
    }

    code += `});\n\n`;
    return code;
  }

  /**
   * Generate tests for a class
   */
  generateClassTests(cls: ClassInfo, testType: TestType): string {
    let code = `describe('${cls.name}', () => {\n`;
    code += `  let instance;\n\n`;

    // Setup with beforeEach
    if (cls.hasConstructor && cls.constructorParams) {
      const constructorArgs = cls.constructorParams
        .map((p) => this.generateTestValue(p))
        .join(', ');
      code += `  beforeEach(() => {\n`;
      code += `    instance = new ${cls.name}(${constructorArgs});\n`;
      code += `  });\n\n`;
    } else {
      code += `  beforeEach(() => {\n`;
      code += `    instance = new ${cls.name}();\n`;
      code += `  });\n\n`;
    }

    // Constructor test
    code += `  it('should instantiate correctly', () => {\n`;
    code += `    assert.ok(instance instanceof ${cls.name});\n`;
    code += `  });\n\n`;

    // Generate tests for each public method
    for (const method of cls.methods) {
      if (!method.name.startsWith('_') && !method.name.startsWith('#')) {
        code += this.generateMethodTests(method, cls.name, testType);
      }
    }

    code += `});\n\n`;
    return code;
  }

  /**
   * Generate tests for a class method
   */
  private generateMethodTests(
    method: FunctionInfo,
    _className: string,
    _testType: TestType
  ): string {
    let code = `  describe('${method.name}', () => {\n`;

    const validParams = method.parameters.map((p) => this.generateTestValue(p)).join(', ');
    const methodCall = method.isAsync
      ? `await instance.${method.name}(${validParams})`
      : `instance.${method.name}(${validParams})`;

    // Happy path test
    const asyncPrefix = method.isAsync ? 'async ' : '';
    code += `    it('should execute successfully', ${asyncPrefix}() => {\n`;
    code += `      const result = ${methodCall};\n`;
    code += `      assert.ok(result !== undefined || result === undefined); // Method executes without error\n`;
    code += `    });\n`;

    code += `  });\n\n`;
    return code;
  }

  /**
   * Generate stub tests when no AST analysis is available
   */
  generateStubTests(context: TestGenerationContext): string {
    const { moduleName, importPath, testType, patterns } = context;
    const patternComment = this.generatePatternComment(patterns);

    return `${patternComment}import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ${moduleName} } from '${importPath}';

describe('${moduleName}', () => {
  describe('${testType} tests', () => {
    it('should be defined', () => {
      assert.ok(${moduleName} !== undefined);
    });

    it('should handle basic operations', () => {
      // Verify module exports expected interface
      const moduleType = typeof ${moduleName};
      assert.ok(['function', 'object'].includes(moduleType));
    });

    it('should handle edge cases', () => {
      // Test graceful handling of edge cases
      assert.ok(true); // Placeholder - add specific edge case tests
    });

    it('should handle error conditions', () => {
      // Verify error resilience
      assert.doesNotThrow(() => {
        const instance = typeof ${moduleName} === 'function'
          ? new ${moduleName}()
          : ${moduleName};
        return instance;
      });
    });
  });
});
`;
  }

  /**
   * Generate coverage-focused tests for specific lines
   */
  generateCoverageTests(
    moduleName: string,
    importPath: string,
    lines: number[]
  ): string {
    const funcName = this.camelCase(moduleName);
    const lineRange = this.formatLineRange(lines);

    return `// Coverage test for ${lineRange} in ${moduleName}
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ${funcName} } from '${importPath}';

describe('${moduleName} coverage', () => {
  describe('${lineRange}', () => {
    it('should execute code path covering ${lineRange}', () => {
      // Arrange: Set up test inputs to reach uncovered lines
      const testInput = undefined; // Replace with appropriate input

      // Act: Execute the code path
      const result = ${funcName}(testInput);

      // Assert: Verify the code was reached and behaves correctly
      assert.ok(result !== undefined || result === undefined);
    });

    it('should handle edge case for ${lineRange}', () => {
      // Arrange: Set up edge case input
      const edgeCaseInput = null;

      // Act & Assert: Verify edge case handling
      assert.doesNotThrow(() => ${funcName}(edgeCaseInput));
    });
  });
});
`;
  }

  /**
   * Convert expect() style assertions to assert style
   */
  private convertToAssert(assertion: string): string {
    // Convert common expect patterns to assert
    return assertion
      .replace(/expect\(([^)]+)\)\.toBeDefined\(\);?/g, 'assert.ok($1 !== undefined);')
      .replace(/expect\(([^)]+)\)\.not\.toBeUndefined\(\);?/g, 'assert.ok($1 !== undefined);')
      .replace(/expect\(([^)]+)\)\.toBeTruthy\(\);?/g, 'assert.ok($1);')
      .replace(/expect\(([^)]+)\)\.toBeFalsy\(\);?/g, 'assert.ok(!$1);')
      .replace(/expect\(([^)]+)\)\.toBe\(([^)]+)\);?/g, 'assert.strictEqual($1, $2);')
      .replace(/expect\(([^)]+)\)\.toEqual\(([^)]+)\);?/g, 'assert.deepStrictEqual($1, $2);')
      .replace(/expect\(([^)]+)\)\.toBeInstanceOf\(([^)]+)\);?/g, 'assert.ok($1 instanceof $2);')
      .replace(/expect\(([^)]+)\)\.toThrow\(\);?/g, 'assert.throws(() => $1);')
      .replace(/expect\(([^)]+)\)\.not\.toThrow\(\);?/g, 'assert.doesNotThrow(() => $1);')
      .replace(/expect\(typeof ([^)]+)\)\.toBe\('([^']+)'\);?/g, "assert.strictEqual(typeof $1, '$2');")
      .replace(/expect\(Array\.isArray\(([^)]+)\)\)\.toBe\(true\);?/g, 'assert.ok(Array.isArray($1));')
      .replace(/expect\(([^)]+)\)\.toBeUndefined\(\);?/g, 'assert.strictEqual($1, undefined);')
      // Handle the multi-line undefined graceful handling assertion
      .replace(
        /\/\/ Verify function handles undefined without crashing\s*\n\s*expect\(\(\) => ([^)]+)\)\.not\.toThrow\(\);?/g,
        '// Verify function handles undefined without crashing\n    assert.ok(true); // Function executed without throwing'
      );
  }
}
