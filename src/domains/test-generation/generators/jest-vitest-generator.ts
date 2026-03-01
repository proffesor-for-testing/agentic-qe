/**
 * Agentic QE v3 - Jest/Vitest Test Generator
 * Strategy implementation for Jest and Vitest test frameworks
 *
 * Generates test code using:
 * - describe/it blocks
 * - expect().toBe/toEqual/toBeDefined assertions
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
 * JestVitestGenerator - Test generator for Jest and Vitest frameworks
 *
 * Both frameworks share nearly identical APIs, so this single generator
 * handles both by adjusting minor differences (e.g., vi vs jest mocking).
 *
 * @example
 * ```typescript
 * const generator = new JestVitestGenerator('vitest');
 * const testCode = generator.generateTests({
 *   moduleName: 'userService',
 *   importPath: './user-service',
 *   testType: 'unit',
 *   patterns: [],
 *   analysis: { functions: [...], classes: [...] }
 * });
 * ```
 */
export class JestVitestGenerator extends BaseTestGenerator {
  readonly framework: TestFramework;

  constructor(framework: 'jest' | 'vitest' = 'vitest') {
    super();
    this.framework = framework;
  }

  /**
   * Get the mock utility name (vi for vitest, jest for jest)
   */
  private get mockUtil(): string {
    return this.framework === 'vitest' ? 'vi' : 'jest';
  }

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

    const mockImport = this.framework === 'vitest' ? ', vi' : '';

    let testCode = `${patternComment}import { describe, it, expect, beforeEach${mockImport} } from '${this.framework}';
${importStatement}
`;

    // KG: Generate mock declarations for external (non-relative) dependencies only.
    // Relative imports (./foo, ../bar) are intra-module and must not be blanket-mocked,
    // as that wipes out named exports the module under test depends on.
    if (dependencies && dependencies.imports.length > 0) {
      const mockFn = this.framework === 'vitest' ? 'vi.fn()' : 'jest.fn()';
      const externalDeps = dependencies.imports.filter(dep => !dep.startsWith('.'));
      if (externalDeps.length > 0) {
        testCode += `\n// Auto-generated mocks from Knowledge Graph dependency analysis\n`;
        for (const dep of externalDeps.slice(0, 10)) {
          testCode += `${this.framework === 'vitest' ? 'vi' : 'jest'}.mock('${dep}', () => ({ default: ${mockFn} }));\n`;
        }
        testCode += `\n`;
      } else {
        testCode += `\n`;
      }
    } else {
      testCode += `\n`;
    }

    // Bug #295 fix: Only generate tests for exported functions and classes
    const exportedFns = analysis.functions.filter(fn => fn.isExported);
    const exportedClasses = analysis.classes.filter(cls => cls.isExported);

    for (const fn of exportedFns) {
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
      code += `    ${testCase.action}\n`;
      code += `    ${testCase.assertion}\n`;
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
    code += `  let instance: ${cls.name};\n\n`;

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
    code += `    expect(instance).toBeInstanceOf(${cls.name});\n`;
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

    // Happy path test — use smart assertion for void vs non-void return
    const asyncPrefix = method.isAsync ? 'async ' : '';
    const isVoid = method.returnType === 'void' || method.returnType === 'Promise<void>';

    // Smart assertion based on method name and return type
    let methodAssertion = 'expect(result).toBeDefined();';
    if (!isVoid) {
      if (/^(is|has|can)[A-Z]/.test(method.name)) {
        methodAssertion = "expect(typeof result).toBe('boolean');";
      } else if (/^(get|fetch|find)[A-Z]/.test(method.name)) {
        methodAssertion = 'expect(result).not.toBeUndefined();';
      } else if (/^(create|build|make)[A-Z]/.test(method.name)) {
        methodAssertion = 'expect(result).toBeTruthy();';
      } else if (method.returnType) {
        const mrt = method.returnType.toLowerCase().replace(/promise<(.+)>/, '$1');
        // Issue N6: Check for object/interface return types FIRST
        if (mrt.includes('{')) methodAssertion = "expect(typeof result).toBe('object');";
        else if (mrt === 'boolean') methodAssertion = "expect(typeof result).toBe('boolean');";
        else if (mrt === 'number') methodAssertion = "expect(typeof result).toBe('number');";
        else if (mrt === 'string') methodAssertion = "expect(typeof result).toBe('string');";
        else if (mrt.includes('[]') || mrt.includes('array')) methodAssertion = 'expect(Array.isArray(result)).toBe(true);';
        else if (mrt.includes('boolean')) methodAssertion = "expect(typeof result).toBe('boolean');";
        else if (mrt.includes('number')) methodAssertion = "expect(typeof result).toBe('number');";
        else if (mrt.includes('string')) methodAssertion = "expect(typeof result).toBe('string');";
      }
    }

    code += `    it('should execute successfully', ${asyncPrefix}() => {\n`;
    if (isVoid) {
      code += `      ${methodCall};\n`;
      code += `      // void return — no assertion on result needed\n`;
    } else {
      code += `      const result = ${methodCall};\n`;
      code += `      ${methodAssertion}\n`;
    }
    code += `    });\n`;

    // Bug #295 fix: Only assert toThrow when method body has explicit throw/validation
    const methodBody = method.body || '';
    const methodThrows = /\bthrow\b/.test(methodBody) || /\bvalidat/i.test(methodBody);

    for (const param of method.parameters) {
      if (!param.optional) {
        const paramsWithUndefined = method.parameters
          .map((p) => (p.name === param.name ? 'undefined as any' : this.generateTestValue(p)))
          .join(', ');

        if (methodThrows) {
          code += `\n    it('should handle invalid ${param.name}', ${asyncPrefix}() => {\n`;
          code += `      expect(() => instance.${method.name}(${paramsWithUndefined})).toThrow();\n`;
          code += `    });\n`;
        } else {
          // Use try-catch to handle both throwing (TypeError from property access) and non-throwing
          code += `\n    it('should handle undefined ${param.name}', ${asyncPrefix}() => {\n`;
          code += `      try {\n`;
          code += `        ${method.isAsync ? 'await ' : ''}instance.${method.name}(${paramsWithUndefined});\n`;
          code += `      } catch (e) {\n`;
          code += `        expect(e).toBeInstanceOf(Error);\n`;
          code += `      }\n`;
          code += `    });\n`;
        }
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

    const basicOpsTest = this.generateBasicOpsTest(moduleName, patterns);
    const edgeCaseTest = this.generateEdgeCaseTest(moduleName, patterns);
    const errorHandlingTest = this.generateErrorHandlingTest(moduleName, patterns);

    // KG: Generate mock declarations for external (non-relative) dependencies only
    let mockDeclarations = '';
    if (dependencies && dependencies.imports.length > 0) {
      const mockFn = this.framework === 'vitest' ? 'vi.fn()' : 'jest.fn()';
      const externalDeps = dependencies.imports.filter(dep => !dep.startsWith('.'));
      if (externalDeps.length > 0) {
        mockDeclarations += `\n// Auto-generated mocks from Knowledge Graph dependency analysis\n`;
        for (const dep of externalDeps.slice(0, 10)) {
          mockDeclarations += `${this.mockUtil}.mock('${dep}', () => ({ default: ${mockFn} }));\n`;
        }
      }
    }

    // KG: Generate similarity-informed comment
    let similarityComment = '';
    if (similarCode && similarCode.snippets.length > 0) {
      similarityComment += `  // KG: Similar modules found - consider testing shared patterns:\n`;
      for (const s of similarCode.snippets.slice(0, 3)) {
        similarityComment += `  //   - ${s.file} (${(s.score * 100).toFixed(0)}% similar)\n`;
      }
      similarityComment += `\n`;
    }

    // KG: Dependency interaction test
    let depTest = '';
    if (dependencies && dependencies.imports.length > 0) {
      depTest += `\n    it('should interact with dependencies correctly', () => {\n`;
      depTest += `      // KG-informed: module depends on ${dependencies.imports.length} imports\n`;
      depTest += `      const instance = typeof ${moduleName} === 'function'\n`;
      depTest += `        ? new ${moduleName}()\n`;
      depTest += `        : ${moduleName};\n`;
      depTest += `      expect(instance).toBeDefined();\n`;
      depTest += `    });\n`;
    }

    // KG: Public API surface test for modules with consumers
    let callerTest = '';
    if (dependencies && dependencies.importedBy.length > 0) {
      callerTest += `\n    it('should expose stable API for ${dependencies.importedBy.length} consumers', () => {\n`;
      callerTest += `      // KG-informed: used by ${dependencies.importedBy.slice(0, 3).join(', ')}\n`;
      callerTest += `      const publicKeys = Object.keys(typeof ${moduleName} === 'function'\n`;
      callerTest += `        ? ${moduleName}.prototype || {}\n`;
      callerTest += `        : ${moduleName});\n`;
      callerTest += `      expect(publicKeys.length).toBeGreaterThan(0);\n`;
      callerTest += `    });\n`;
    }

    return `${patternComment}import { ${moduleName} } from '${importPath}';
${mockDeclarations}
describe('${moduleName}', () => {
${similarityComment}  describe('${testType} tests', () => {
    it('should be defined', () => {
      expect(${moduleName}).toBeDefined();
    });

${basicOpsTest}
${edgeCaseTest}
${errorHandlingTest}${depTest}${callerTest}
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
import { ${funcName} } from '${importPath}';

describe('${moduleName} coverage', () => {
  describe('${lineRange}', () => {
    it('should execute code path covering ${lineRange}', () => {
      // Arrange: Set up test inputs to reach uncovered lines
      const testInput = undefined; // Replace with appropriate input

      // Act: Execute the code path
      const result = ${funcName}(testInput);

      // Assert: Verify the code was reached and behaves correctly
      expect(result).toBeDefined();
    });

    it('should handle edge case for ${lineRange}', () => {
      // Arrange: Set up edge case input
      const edgeCaseInput = null;

      // Act & Assert: Verify edge case handling
      expect(() => ${funcName}(edgeCaseInput)).not.toThrow();
    });
  });
});
`;
  }

  // ============================================================================
  // Pattern-Aware Stub Test Generators
  // ============================================================================

  /**
   * Generate basic operations test based on detected patterns
   */
  private generateBasicOpsTest(moduleName: string, patterns: Pattern[]): string {
    const isService = patterns.some(
      (p) =>
        p.name.toLowerCase().includes('service') ||
        p.name.toLowerCase().includes('repository')
    );

    const isFactory = patterns.some((p) => p.name.toLowerCase().includes('factory'));

    const hasAsyncPattern = patterns.some(
      (p) =>
        p.name.toLowerCase().includes('async') || p.name.toLowerCase().includes('promise')
    );

    if (isService) {
      return `    it('should handle basic operations', async () => {
      // Service pattern: test core functionality
      const instance = new ${moduleName}();
      expect(instance).toBeInstanceOf(${moduleName});

      // Verify service is properly initialized
      const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(instance))
        .filter(m => m !== 'constructor');
      expect(methods.length).toBeGreaterThan(0);
    });`;
    }

    if (isFactory) {
      return `    it('should handle basic operations', () => {
      // Factory pattern: test object creation
      const result = ${moduleName}.create ? ${moduleName}.create() : new ${moduleName}();
      expect(result).toBeDefined();
      expect(typeof result).not.toBe('undefined');
    });`;
    }

    if (hasAsyncPattern) {
      return `    it('should handle basic operations', async () => {
      // Async pattern: test promise resolution
      const instance = typeof ${moduleName} === 'function'
        ? new ${moduleName}()
        : ${moduleName};

      // Verify async methods resolve properly
      if (typeof instance.execute === 'function') {
        await expect(instance.execute()).resolves.toBeDefined();
      }
    });`;
    }

    // Default implementation
    return `    it('should handle basic operations', () => {
      // Verify module exports expected interface
      const moduleType = typeof ${moduleName};
      expect(['function', 'object']).toContain(moduleType);

      if (moduleType === 'function') {
        // Class or function: verify instantiation
        const instance = new ${moduleName}();
        expect(instance).toBeDefined();
      } else {
        // Object module: verify properties exist
        expect(Object.keys(${moduleName}).length).toBeGreaterThan(0);
      }
    });`;
  }

  /**
   * Generate edge case test based on detected patterns
   */
  private generateEdgeCaseTest(moduleName: string, patterns: Pattern[]): string {
    const hasValidation = patterns.some(
      (p) =>
        p.name.toLowerCase().includes('validation') ||
        p.name.toLowerCase().includes('validator')
    );

    const hasCollection = patterns.some(
      (p) =>
        p.name.toLowerCase().includes('collection') ||
        p.name.toLowerCase().includes('list')
    );

    if (hasValidation) {
      return `    it('should handle edge cases', () => {
      // Validation pattern: test boundary conditions
      const instance = new ${moduleName}();

      // Test with empty values
      if (typeof instance.validate === 'function') {
        expect(() => instance.validate('')).toBeDefined();
        expect(() => instance.validate(null)).toBeDefined();
      }
    });`;
    }

    if (hasCollection) {
      return `    it('should handle edge cases', () => {
      // Collection pattern: test empty and large datasets
      const instance = new ${moduleName}();

      // Empty collection should be handled gracefully
      if (typeof instance.add === 'function') {
        expect(() => instance.add(undefined)).toBeDefined();
      }
      if (typeof instance.get === 'function') {
        expect(instance.get('nonexistent')).toBeUndefined();
      }
    });`;
    }

    // Default edge case test
    return `    it('should handle edge cases', () => {
      // Test null/undefined handling
      const instance = typeof ${moduleName} === 'function'
        ? new ${moduleName}()
        : ${moduleName};

      // Module should handle edge case inputs gracefully
      expect(instance).toBeDefined();
      expect(() => JSON.stringify(instance)).not.toThrow();
    });`;
  }

  /**
   * Generate error handling test based on detected patterns
   */
  private generateErrorHandlingTest(moduleName: string, patterns: Pattern[]): string {
    const hasErrorPattern = patterns.some(
      (p) =>
        p.name.toLowerCase().includes('error') ||
        p.name.toLowerCase().includes('exception')
    );

    const hasAsyncPattern = patterns.some(
      (p) =>
        p.name.toLowerCase().includes('async') || p.name.toLowerCase().includes('promise')
    );

    if (hasAsyncPattern) {
      return `    it('should handle error conditions', async () => {
      // Async error handling: verify rejections are caught
      const instance = typeof ${moduleName} === 'function'
        ? new ${moduleName}()
        : ${moduleName};

      // Async operations should reject gracefully on invalid input
      const asyncMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(instance) || {})
        .filter(m => m !== 'constructor');

      // At minimum, module should be stable
      expect(instance).toBeDefined();
    });`;
    }

    if (hasErrorPattern) {
      return `    it('should handle error conditions', () => {
      // Error pattern: verify custom error types
      try {
        const instance = new ${moduleName}();
        // Trigger error condition if possible
        if (typeof instance.throwError === 'function') {
          expect(() => instance.throwError()).toThrow();
        }
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });`;
    }

    // Default error handling test
    return `    it('should handle error conditions', () => {
      // Verify error resilience
      expect(() => {
        const instance = typeof ${moduleName} === 'function'
          ? new ${moduleName}()
          : ${moduleName};
        return instance;
      }).not.toThrow();

      // Module should not throw on inspection
      expect(() => Object.keys(${moduleName})).not.toThrow();
    });`;
  }
}
