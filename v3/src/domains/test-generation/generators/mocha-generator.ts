/**
 * Agentic QE v3 - Mocha Test Generator
 * Strategy implementation for Mocha test framework with Chai assertions
 *
 * Generates test code using:
 * - describe/it blocks (Mocha)
 * - expect().to.be/to.equal assertions (Chai)
 * - function() {} style for this context
 * - beforeEach/afterEach hooks
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
 * MochaGenerator - Test generator for Mocha framework with Chai
 *
 * Uses traditional function() syntax to preserve Mocha's this context
 * for features like this.timeout() and this.retries().
 *
 * @example
 * ```typescript
 * const generator = new MochaGenerator();
 * const testCode = generator.generateTests({
 *   moduleName: 'userService',
 *   importPath: './user-service',
 *   testType: 'unit',
 *   patterns: [],
 *   analysis: { functions: [...], classes: [...] }
 * });
 * ```
 */
export class MochaGenerator extends BaseTestGenerator {
  readonly framework: TestFramework = 'mocha';

  /**
   * Generate complete test file from analysis
   */
  generateTests(context: TestGenerationContext): string {
    const { moduleName, importPath, testType, patterns, analysis } = context;

    if (!analysis || (analysis.functions.length === 0 && analysis.classes.length === 0)) {
      return this.generateStubTests(context);
    }

    const patternComment = this.generatePatternComment(patterns);
    const exports = this.extractExports(analysis.functions, analysis.classes);
    const importStatement = this.generateImportStatement(exports, importPath, moduleName);

    let code = `${patternComment}import { expect } from 'chai';
${importStatement}

describe('${moduleName} - ${testType} tests', function() {
`;

    for (const fn of analysis.functions) {
      code += this.generateFunctionTests(fn, testType);
    }

    for (const cls of analysis.classes) {
      code += this.generateClassTests(cls, testType);
    }

    code += `});\n`;
    return code;
  }

  /**
   * Generate tests for a standalone function
   */
  generateFunctionTests(fn: FunctionInfo, _testType: TestType): string {
    const validParams = fn.parameters.map((p) => this.generateTestValue(p)).join(', ');
    const fnCall = fn.isAsync ? `await ${fn.name}(${validParams})` : `${fn.name}(${validParams})`;

    let code = `  describe('${fn.name}', function() {\n`;
    code += `    it('should handle valid input', ${fn.isAsync ? 'async ' : ''}function() {\n`;
    code += `      const result = ${fnCall};\n`;
    code += `      expect(result).to.not.be.undefined;\n`;
    code += `    });\n`;

    // Test for undefined parameters
    for (const param of fn.parameters) {
      if (!param.optional) {
        const paramsWithUndefined = fn.parameters
          .map((p) => (p.name === param.name ? 'undefined' : this.generateTestValue(p)))
          .join(', ');

        code += `\n    it('should handle undefined ${param.name}', function() {\n`;
        code += `      expect(function() { ${fn.name}(${paramsWithUndefined}); }).to.throw();\n`;
        code += `    });\n`;
      }
    }

    code += `  });\n\n`;
    return code;
  }

  /**
   * Generate tests for a class
   */
  generateClassTests(cls: ClassInfo, _testType: TestType): string {
    const constructorArgs =
      cls.constructorParams?.map((p) => this.generateTestValue(p)).join(', ') || '';

    let code = `  describe('${cls.name}', function() {\n`;
    code += `    let instance;\n\n`;
    code += `    beforeEach(function() {\n`;
    code += `      instance = new ${cls.name}(${constructorArgs});\n`;
    code += `    });\n\n`;
    code += `    it('should instantiate correctly', function() {\n`;
    code += `      expect(instance).to.be.instanceOf(${cls.name});\n`;
    code += `    });\n`;

    for (const method of cls.methods) {
      if (!method.name.startsWith('_')) {
        const methodParams = method.parameters.map((p) => this.generateTestValue(p)).join(', ');
        code += `\n    it('${method.name} should work', ${method.isAsync ? 'async ' : ''}function() {\n`;
        code += `      const result = ${method.isAsync ? 'await ' : ''}instance.${method.name}(${methodParams});\n`;
        code += `      expect(result).to.not.be.undefined;\n`;
        code += `    });\n`;
      }
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

    // Determine if async tests needed based on patterns
    const isAsync = patterns.some(
      (p) =>
        p.name.toLowerCase().includes('async') || p.name.toLowerCase().includes('promise')
    );
    const asyncSetup = isAsync ? 'async ' : '';

    return `${patternComment}import { expect } from 'chai';
import { ${moduleName} } from '${importPath}';

describe('${moduleName}', function() {
  describe('${testType} tests', function() {
    it('should be defined', function() {
      expect(${moduleName}).to.not.be.undefined;
    });

    it('should handle basic operations', ${asyncSetup}function() {
      // Verify module exports expected interface
      const moduleType = typeof ${moduleName};
      expect(['function', 'object']).to.include(moduleType);

      if (moduleType === 'function') {
        const instance = new ${moduleName}();
        expect(instance).to.exist;
      } else {
        expect(Object.keys(${moduleName})).to.have.length.greaterThan(0);
      }
    });

    it('should handle edge cases', function() {
      // Verify resilience to edge inputs
      const instance = typeof ${moduleName} === 'function'
        ? new ${moduleName}()
        : ${moduleName};
      expect(instance).to.exist;
      expect(function() { JSON.stringify(instance); }).to.not.throw();
    });

    it('should handle error conditions', function() {
      // Verify error resilience
      expect(function() {
        const instance = typeof ${moduleName} === 'function'
          ? new ${moduleName}()
          : ${moduleName};
        return instance;
      }).to.not.throw();
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
import { expect } from 'chai';
import { ${funcName} } from '${importPath}';

describe('${moduleName} coverage', function() {
  describe('${lineRange}', function() {
    it('should execute code path covering ${lineRange}', function() {
      // Arrange: Set up test inputs to reach uncovered lines
      const testInput = undefined; // Replace with appropriate input

      // Act: Execute the code path
      const result = ${funcName}(testInput);

      // Assert: Verify the code was reached and behaves correctly
      expect(result).to.not.be.undefined;
    });

    it('should handle edge case for ${lineRange}', function() {
      // Arrange: Set up edge case input
      const edgeCaseInput = null;

      // Act & Assert: Verify edge case handling
      expect(function() { ${funcName}(edgeCaseInput); }).to.not.throw();
    });
  });
});
`;
  }
}
