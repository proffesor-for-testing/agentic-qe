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
    const { moduleName, importPath, testType, patterns, analysis, dependencies } = context;

    if (!analysis || (analysis.functions.length === 0 && analysis.classes.length === 0)) {
      return this.generateStubTests(context);
    }

    const patternComment = this.generatePatternComment(patterns);
    const exports = this.extractExports(analysis.functions, analysis.classes);
    const importStatement = this.generateImportStatement(exports, importPath, moduleName);

    // KG: Add sinon stubs for external (non-relative) dependencies only
    let sinonImport = '';
    let stubSetup = '';
    const externalDeps = dependencies?.imports.filter(dep => !dep.startsWith('.')) || [];
    if (externalDeps.length > 0) {
      sinonImport = `import sinon from 'sinon';\n`;
      const depsToMock = externalDeps.slice(0, 5);
      stubSetup += `  // Auto-generated stubs from Knowledge Graph dependency analysis\n`;
      stubSetup += `  let stubs;\n\n`;
      stubSetup += `  beforeEach(function() {\n`;
      stubSetup += `    stubs = {\n`;
      for (const dep of depsToMock) {
        const depName = dep.split('/').pop()?.replace(/[^a-zA-Z0-9_]/g, '_') || dep;
        stubSetup += `      ${depName}: sinon.stub(),\n`;
      }
      stubSetup += `    };\n`;
      stubSetup += `  });\n\n`;
      stubSetup += `  afterEach(function() {\n`;
      stubSetup += `    sinon.restore();\n`;
      stubSetup += `  });\n\n`;
    }

    let code = `${patternComment}import { expect } from 'chai';
${sinonImport}${importStatement}

describe('${moduleName} - ${testType} tests', function() {
${stubSetup}`;

    // Bug #295 fix: Only generate tests for exported functions and classes
    const exportedFns = analysis.functions.filter(fn => fn.isExported);
    const exportedClasses = analysis.classes.filter(cls => cls.isExported);

    for (const fn of exportedFns) {
      code += this.generateFunctionTests(fn, testType);
    }

    for (const cls of exportedClasses) {
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

    const isVoid = fn.returnType === 'void' || fn.returnType === 'Promise<void>';

    let code = `  describe('${fn.name}', function() {\n`;
    // Smart assertion based on function name and return type
    let chaiAssertion = 'expect(result).to.not.be.undefined;';
    if (!isVoid) {
      if (/^(is|has|can)[A-Z]/.test(fn.name)) {
        chaiAssertion = "expect(typeof result).to.equal('boolean');";
      } else if (/^(get|fetch|find)[A-Z]/.test(fn.name)) {
        chaiAssertion = 'expect(result).to.not.be.undefined;';
      } else if (/^(create|build|make)[A-Z]/.test(fn.name)) {
        chaiAssertion = 'expect(result).to.be.ok;';
      } else if (fn.returnType) {
        const rt = fn.returnType.toLowerCase().replace(/promise<(.+)>/, '$1');
        if (rt.includes('boolean')) chaiAssertion = "expect(typeof result).to.equal('boolean');";
        else if (rt.includes('number')) chaiAssertion = "expect(typeof result).to.equal('number');";
        else if (rt.includes('string')) chaiAssertion = "expect(typeof result).to.equal('string');";
        else if (rt.includes('[]') || rt.includes('array')) chaiAssertion = 'expect(result).to.be.an(\'array\');';
      }
    }

    code += `    it('should handle valid input', ${fn.isAsync ? 'async ' : ''}function() {\n`;
    if (isVoid) {
      code += `      ${fnCall};\n`;
    } else {
      code += `      const result = ${fnCall};\n`;
      code += `      ${chaiAssertion}\n`;
    }
    code += `    });\n`;

    // Bug #295 fix: Use try-catch instead of blanket .to.throw() for undefined params
    const bodyText = fn.body || '';
    const hasExplicitThrow = /\bthrow\b/.test(bodyText) || /\bvalidat/i.test(bodyText);

    for (const param of fn.parameters) {
      if (!param.optional) {
        const paramsWithUndefined = fn.parameters
          .map((p) => (p.name === param.name ? 'undefined' : this.generateTestValue(p)))
          .join(', ');

        if (hasExplicitThrow) {
          code += `\n    it('should handle undefined ${param.name}', function() {\n`;
          code += `      expect(function() { ${fn.name}(${paramsWithUndefined}); }).to.throw();\n`;
          code += `    });\n`;
        } else {
          code += `\n    it('should handle undefined ${param.name}', function() {\n`;
          code += `      try {\n`;
          code += `        ${fn.name}(${paramsWithUndefined});\n`;
          code += `      } catch (e) {\n`;
          code += `        expect(e).to.be.instanceOf(Error);\n`;
          code += `      }\n`;
          code += `    });\n`;
        }
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
      if (!method.name.startsWith('_') && !method.name.startsWith('#')) {
        const methodParams = method.parameters.map((p) => this.generateTestValue(p)).join(', ');
        const isMethodVoid = method.returnType === 'void' || method.returnType === 'Promise<void>';

        // Smart assertion for methods
        let methodAssertion = 'expect(result).to.not.be.undefined;';
        if (!isMethodVoid) {
          if (/^(is|has|can)[A-Z]/.test(method.name)) {
            methodAssertion = "expect(typeof result).to.equal('boolean');";
          } else if (/^(create|build|make)[A-Z]/.test(method.name)) {
            methodAssertion = 'expect(result).to.be.ok;';
          } else if (method.returnType) {
            const mrt = method.returnType.toLowerCase().replace(/promise<(.+)>/, '$1');
            if (mrt.includes('boolean')) methodAssertion = "expect(typeof result).to.equal('boolean');";
            else if (mrt.includes('number')) methodAssertion = "expect(typeof result).to.equal('number');";
            else if (mrt.includes('string')) methodAssertion = "expect(typeof result).to.equal('string');";
            else if (mrt.includes('[]') || mrt.includes('array')) methodAssertion = "expect(result).to.be.an('array');";
          }
        }

        code += `\n    it('${method.name} should work', ${method.isAsync ? 'async ' : ''}function() {\n`;
        if (isMethodVoid) {
          code += `      ${method.isAsync ? 'await ' : ''}instance.${method.name}(${methodParams});\n`;
        } else {
          code += `      const result = ${method.isAsync ? 'await ' : ''}instance.${method.name}(${methodParams});\n`;
          code += `      ${methodAssertion}\n`;
        }
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
    const { moduleName, importPath, testType, patterns, dependencies, similarCode } = context;
    const patternComment = this.generatePatternComment(patterns);

    // Determine if async tests needed based on patterns
    const isAsync = patterns.some(
      (p) =>
        p.name.toLowerCase().includes('async') || p.name.toLowerCase().includes('promise')
    );
    const asyncSetup = isAsync ? 'async ' : '';

    // KG: Add sinon stubs for external (non-relative) dependencies only
    let sinonImport = '';
    let stubSetup = '';
    let stubTeardown = '';
    const stubExternalDeps = dependencies?.imports.filter(dep => !dep.startsWith('.')) || [];
    if (stubExternalDeps.length > 0) {
      sinonImport = `import sinon from 'sinon';\n`;
      const depsToMock = stubExternalDeps.slice(0, 5);
      stubSetup += `\n    // Auto-generated stubs from Knowledge Graph dependency analysis\n`;
      stubSetup += `    let stubs;\n\n`;
      stubSetup += `    beforeEach(function() {\n`;
      stubSetup += `      stubs = {\n`;
      for (const dep of depsToMock) {
        const depName = dep.split('/').pop()?.replace(/[^a-zA-Z0-9_]/g, '_') || dep;
        stubSetup += `        ${depName}: sinon.stub(),\n`;
      }
      stubSetup += `      };\n`;
      stubSetup += `    });\n\n`;
      stubTeardown += `    afterEach(function() {\n`;
      stubTeardown += `      sinon.restore();\n`;
      stubTeardown += `    });\n\n`;
    }

    // KG: Similarity comment
    let similarityComment = '';
    if (similarCode && similarCode.snippets.length > 0) {
      similarityComment += `    // KG: Similar modules found - consider testing shared patterns:\n`;
      for (const s of similarCode.snippets.slice(0, 3)) {
        similarityComment += `    //   - ${s.file} (${(s.score * 100).toFixed(0)}% similar)\n`;
      }
      similarityComment += `\n`;
    }

    // KG: Dependency interaction test
    let depTest = '';
    if (dependencies && dependencies.imports.length > 0) {
      depTest += `\n    it('should interact with dependencies correctly', function() {\n`;
      depTest += `      // KG-informed: module depends on ${dependencies.imports.length} imports\n`;
      depTest += `      const instance = typeof ${moduleName} === 'function'\n`;
      depTest += `        ? new ${moduleName}()\n`;
      depTest += `        : ${moduleName};\n`;
      depTest += `      expect(instance).to.exist;\n`;
      depTest += `    });\n`;
    }

    // KG: Public API surface test for modules with consumers
    let callerTest = '';
    if (dependencies && dependencies.importedBy.length > 0) {
      callerTest += `\n    it('should expose stable API for ${dependencies.importedBy.length} consumers', function() {\n`;
      callerTest += `      // KG-informed: used by ${dependencies.importedBy.slice(0, 3).join(', ')}\n`;
      callerTest += `      const publicKeys = Object.keys(typeof ${moduleName} === 'function'\n`;
      callerTest += `        ? ${moduleName}.prototype || {}\n`;
      callerTest += `        : ${moduleName});\n`;
      callerTest += `      expect(publicKeys.length).to.be.greaterThan(0);\n`;
      callerTest += `    });\n`;
    }

    return `${patternComment}import { expect } from 'chai';
${sinonImport}import { ${moduleName} } from '${importPath}';

describe('${moduleName}', function() {
  describe('${testType} tests', function() {
${stubSetup}${stubTeardown}${similarityComment}    it('should be defined', function() {
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
    });${depTest}${callerTest}
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
