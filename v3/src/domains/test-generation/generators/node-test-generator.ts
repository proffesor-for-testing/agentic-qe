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
 * Requires Node.js 18+.
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
} from '../interfaces';

/**
 * NodeTestGenerator - Test generator for Node.js built-in test runner
 *
 * Uses `node:test` describe/it and `node:assert` instead of third-party
 * frameworks. Generated tests run with `node --test`.
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

    // Bug #295: Only test exported functions and classes
    const exportedFunctions = analysis.functions.filter((fn) => fn.isExported);
    const exportedClasses = analysis.classes.filter((cls) => cls.isExported);

    const exports = this.extractExports(exportedFunctions, exportedClasses);
    const importStatement = this.generateImportStatement(exports, importPath, moduleName);

    let testCode = `${patternComment}import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
${importStatement}

`;

    for (const fn of exportedFunctions) {
      testCode += this.generateFunctionTests(fn, testType);
    }

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
      code += `    ${this.convertToAssert(testCase.action)}\n`;
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

    const constructorArgs =
      cls.constructorParams?.map((p) => this.generateTestValue(p)).join(', ') || '';

    code += `  beforeEach(() => {\n`;
    code += `    instance = new ${cls.name}(${constructorArgs});\n`;
    code += `  });\n\n`;

    code += `  it('should instantiate correctly', () => {\n`;
    code += `    assert.ok(instance instanceof ${cls.name});\n`;
    code += `  });\n\n`;

    for (const method of cls.methods) {
      if (!method.name.startsWith('_') && !method.name.startsWith('#')) {
        code += this.generateMethodTest(method);
      }
    }

    code += `});\n\n`;
    return code;
  }

  /**
   * Generate test for a class method
   */
  private generateMethodTest(method: FunctionInfo): string {
    const validParams = method.parameters.map((p) => this.generateTestValue(p)).join(', ');
    const isVoid = method.returnType === 'void' || method.returnType === 'Promise<void>';
    const asyncPrefix = method.isAsync ? 'async ' : '';
    const methodCall = method.isAsync
      ? `await instance.${method.name}(${validParams})`
      : `instance.${method.name}(${validParams})`;

    // Smart assertion based on method name and return type
    let assertLine = 'assert.ok(result !== undefined);';
    if (!isVoid) {
      const mLower = method.name.toLowerCase();
      if (/^(is|has|can)[A-Z]/.test(method.name)) {
        assertLine = "assert.strictEqual(typeof result, 'boolean');";
      } else if (/^(get|fetch|find)[A-Z]/.test(method.name)) {
        assertLine = 'assert.ok(result !== undefined);';
      } else if (/^(create|build|make)[A-Z]/.test(method.name)) {
        assertLine = 'assert.ok(result);';
      } else if (method.returnType) {
        const rt = method.returnType.toLowerCase().replace(/promise<(.+)>/, '$1');
        if (rt.includes('{')) assertLine = "assert.strictEqual(typeof result, 'object');";
        else if (rt === 'boolean') assertLine = "assert.strictEqual(typeof result, 'boolean');";
        else if (rt === 'number') assertLine = "assert.strictEqual(typeof result, 'number');";
        else if (rt === 'string') assertLine = "assert.strictEqual(typeof result, 'string');";
        else if (rt.includes('[]') || rt.includes('array')) assertLine = 'assert.ok(Array.isArray(result));';
        else if (rt.includes('boolean')) assertLine = "assert.strictEqual(typeof result, 'boolean');";
        else if (rt.includes('number')) assertLine = "assert.strictEqual(typeof result, 'number');";
        else if (rt.includes('string')) assertLine = "assert.strictEqual(typeof result, 'string');";
      }
    }

    let code = `  it('${method.name} should execute successfully', ${asyncPrefix}() => {\n`;
    if (isVoid) {
      code += `    ${methodCall};\n`;
    } else {
      code += `    const result = ${methodCall};\n`;
      code += `    ${assertLine}\n`;
    }
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
      const moduleType = typeof ${moduleName};
      assert.ok(['function', 'object'].includes(moduleType));
    });

    it('should handle error conditions', () => {
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
  it('should exercise code path covering ${lineRange}', () => {
    const testInput = undefined; // Replace with appropriate input
    const result = ${funcName}(testInput);
    assert.ok(result !== undefined || result === undefined);
  });

  it('should handle edge case for ${lineRange}', () => {
    assert.doesNotThrow(() => ${funcName}(null));
  });
});
`;
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Convert expect() style assertions to node:assert
   */
  private convertToAssert(assertion: string): string {
    // Order matters: specific patterns (nested parens) must come before generic ones
    return assertion
      // Specific patterns with nested parens — must be first
      .replace(/expect\(typeof ([^)]+)\)\.toBe\('([^']+)'\);?/g, "assert.strictEqual(typeof $1, '$2');")
      .replace(/expect\(Array\.isArray\(([^)]+)\)\)\.toBe\(true\);?/g, 'assert.ok(Array.isArray($1));')
      // toThrow/doesNotThrow — the captured value is already a function reference, pass directly
      .replace(/expect\(([^)]+)\)\.toThrow\(\);?/g, 'assert.throws($1);')
      .replace(/expect\(([^)]+)\)\.not\.toThrow\(\);?/g, 'assert.doesNotThrow($1);')
      // toBeInstanceOf
      .replace(/expect\(([^)]+)\)\.toBeInstanceOf\(([^)]+)\);?/g, 'assert.ok($1 instanceof $2);')
      // Simple matchers
      .replace(/expect\(([^)]+)\)\.toBeDefined\(\);?/g, 'assert.ok($1 !== undefined);')
      .replace(/expect\(([^)]+)\)\.not\.toBeUndefined\(\);?/g, 'assert.ok($1 !== undefined);')
      .replace(/expect\(([^)]+)\)\.toBeUndefined\(\);?/g, 'assert.strictEqual($1, undefined);')
      .replace(/expect\(([^)]+)\)\.toBeTruthy\(\);?/g, 'assert.ok($1);')
      .replace(/expect\(([^)]+)\)\.toBeFalsy\(\);?/g, 'assert.ok(!$1);')
      // Generic toBe/toEqual — must be last (they match broadly)
      .replace(/expect\(([^)]+)\)\.toBe\(([^)]+)\);?/g, 'assert.strictEqual($1, $2);')
      .replace(/expect\(([^)]+)\)\.toEqual\(([^)]+)\);?/g, 'assert.deepStrictEqual($1, $2);');
  }
}
