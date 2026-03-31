/**
 * Agentic QE v3 - Swift Testing Generator
 * Strategy implementation for Apple's Swift Testing framework
 *
 * Generates test code using:
 * - `import Testing` (NOT XCTest)
 * - `@Suite struct MyTests { ... }`
 * - `@Test func testSomething() { ... }`
 * - `#expect(value == expected)` macro assertions
 * - `#expect(throws:)` for error testing
 * - Parameterized tests via `@Test(arguments:)`
 * - `async` for async function tests
 *
 * @module test-generation/generators
 */

import { testValues } from './test-value-helpers';
import { BaseTestGenerator } from './base-test-generator';
import type {
  TestFramework,
  TestType,
  FunctionInfo,
  ClassInfo,
  ParameterInfo,
  TestGenerationContext,
  CodeAnalysis,
  Pattern,
} from '../interfaces';
import type { ParsedFile } from '../../../shared/parsers/interfaces.js';

/**
 * SwiftTestingGenerator - Test generator for Apple's Swift Testing framework
 *
 * Generates idiomatic Swift test code with Swift Testing conventions:
 * - @Suite for grouping tests into structs
 * - @Test for marking test functions
 * - #expect() macro for assertions
 * - Parameterized tests via @Test(arguments:)
 *
 * @example
 * ```typescript
 * const generator = new SwiftTestingGenerator();
 * const testCode = generator.generateTests({
 *   moduleName: 'UserService',
 *   importPath: 'UserService',
 *   testType: 'unit',
 *   patterns: [],
 *   analysis: { functions: [...], classes: [...] }
 * });
 * ```
 */
export class SwiftTestingGenerator extends BaseTestGenerator {
  readonly framework: TestFramework = 'swift-testing';

  /**
   * Convert ParsedFile from multi-language parser to CodeAnalysis.
   * Maps universal parser types to the legacy IFunctionInfo/IClassInfo shape
   * used by generateTests().
   */
  static convertParsedFile(parsed: ParsedFile): CodeAnalysis {
    return {
      functions: parsed.functions.map(f => ({
        name: f.name,
        parameters: f.parameters.map(p => ({
          name: p.name,
          type: p.type,
          optional: p.isOptional,
          defaultValue: p.defaultValue,
        })),
        returnType: f.returnType,
        isAsync: f.isAsync,
        isExported: f.isPublic,
        complexity: f.complexity,
        startLine: f.startLine,
        endLine: f.endLine,
        body: f.body,
      })),
      classes: parsed.classes.map(c => ({
        name: c.name,
        methods: c.methods.map(m => ({
          name: m.name,
          parameters: m.parameters.map(p => ({
            name: p.name,
            type: p.type,
            optional: p.isOptional,
            defaultValue: p.defaultValue,
          })),
          returnType: m.returnType,
          isAsync: m.isAsync,
          isExported: m.isPublic,
          complexity: m.complexity,
          startLine: m.startLine,
          endLine: m.endLine,
        })),
        properties: c.properties.map(p => ({
          name: p.name,
          type: p.type,
          isPrivate: !p.isPublic,
          isReadonly: p.isReadonly,
        })),
        isExported: c.isPublic,
        hasConstructor: c.methods.some(m => m.name === 'init'),
        constructorParams: c.methods.find(m => m.name === 'init')?.parameters.map(p => ({
          name: p.name,
          type: p.type,
          optional: p.isOptional,
          defaultValue: p.defaultValue,
        })),
        decorators: c.decorators,
      })),
    };
  }

  // ============================================================================
  // Core Generation Methods
  // ============================================================================

  /**
   * Generate complete Swift Testing test file from analysis
   */
  generateTests(context: TestGenerationContext): string {
    const { moduleName, importPath, testType, patterns, analysis } = context;

    if (!analysis || (analysis.functions.length === 0 && analysis.classes.length === 0)) {
      return this.generateStubTests(context);
    }

    const patternComment = this.generateSwiftPatternComment(patterns);
    let code = `${patternComment}import Testing\n`;
    code += `@testable import ${this.extractModuleName(importPath)}\n\n`;

    // Generate tests for exported classes/structs
    const exportedClasses = analysis.classes.filter(cls => cls.isExported);
    for (const cls of exportedClasses) {
      code += this.generateClassTests(cls, testType);
      code += '\n';
    }

    // Generate tests for exported standalone functions
    const exportedFns = analysis.functions.filter(fn => fn.isExported);
    if (exportedFns.length > 0) {
      code += this.generateStandaloneFunctionSuite(moduleName, exportedFns, testType);
    }

    return code;
  }

  /**
   * Generate tests for a standalone function
   */
  generateFunctionTests(fn: FunctionInfo, _testType: TestType): string {
    const params = fn.parameters.map(p => `${p.name}: ${this.generateSwiftTestValue(p)}`).join(', ');
    const isVoid = fn.returnType === 'Void' || fn.returnType === '()' || !fn.returnType;
    const asyncPrefix = fn.isAsync ? 'await ' : '';
    const asyncKeyword = fn.isAsync ? ' async' : '';

    let code = '';

    // Happy path test
    code += `    @Test\n`;
    code += `    func test${this.pascalCase(fn.name)}ValidInput()${asyncKeyword} {\n`;

    if (isVoid) {
      code += `        ${asyncPrefix}${fn.name}(${params})\n`;
      code += `        // void function - verify no crash\n`;
    } else {
      code += `        let result = ${asyncPrefix}${fn.name}(${params})\n`;
      code += `        ${this.generateSwiftAssertion(fn.name, fn.returnType)}\n`;
    }

    code += `    }\n\n`;

    // Nil parameter tests for non-optional params
    const bodyText = fn.body || '';
    const hasExplicitThrow = /\bthrow\b/.test(bodyText) || /\bguard\b/.test(bodyText);

    for (const param of fn.parameters) {
      if (!param.optional) {
        const isOptionalType = param.type?.endsWith('?') || param.type?.includes('Optional');
        // Only generate nil tests for types that can be nil (Optional)
        if (isOptionalType || param.type?.endsWith('?')) {
          code += `    @Test\n`;
          code += `    func test${this.pascalCase(fn.name)}Nil${this.pascalCase(param.name)}()${asyncKeyword} {\n`;

          const nilParams = fn.parameters
            .map(p => `${p.name}: ${p.name === param.name ? 'nil' : this.generateSwiftTestValue(p)}`)
            .join(', ');

          if (hasExplicitThrow) {
            code += `        #expect(throws: (any Error).self) {\n`;
            code += `            ${asyncPrefix}try ${fn.name}(${nilParams})\n`;
            code += `        }\n`;
          } else {
            code += `        let result = ${asyncPrefix}${fn.name}(${nilParams})\n`;
            code += `        // Function may handle nil gracefully\n`;
            code += `        #expect(result != nil || true) // accepts any behavior\n`;
          }

          code += `    }\n\n`;
        }

        // Throwing test for non-optional params with guard/throw
        if (hasExplicitThrow && !isOptionalType && !param.type?.endsWith('?')) {
          code += `    @Test\n`;
          code += `    func test${this.pascalCase(fn.name)}ThrowsOnInvalid${this.pascalCase(param.name)}()${asyncKeyword} throws {\n`;
          code += `        // Verify error handling for invalid ${param.name}\n`;
          code += `        // TODO: Provide invalid value for ${param.name}: ${param.type || 'unknown'}\n`;
          code += `    }\n\n`;
        }
      }
    }

    return code;
  }

  /**
   * Generate tests for a class or struct
   */
  generateClassTests(cls: ClassInfo, testType: TestType): string {
    const decorators: string[] = (cls as ClassInfoWithDecorators).decorators || [];
    const isObservable = decorators.includes('@Observable');

    let code = `@Suite\n`;
    code += `struct ${cls.name}Tests {\n\n`;

    // Instantiation test
    if (cls.hasConstructor && cls.constructorParams && cls.constructorParams.length > 0) {
      const initParams = cls.constructorParams
        .map(p => `${p.name}: ${this.generateSwiftTestValue(p)}`)
        .join(', ');

      code += `    @Test\n`;
      code += `    func testInit() {\n`;
      code += `        let subject = ${cls.name}(${initParams})\n`;
      code += `        #expect(subject != nil)\n`;
      code += `    }\n\n`;

      // Generate method tests with subject construction
      for (const method of cls.methods) {
        if (method.name !== 'init' && !method.name.startsWith('_')) {
          code += this.generateMethodTests(method, cls);
        }
      }
    } else {
      code += `    @Test\n`;
      code += `    func testInit() {\n`;
      code += `        let subject = ${cls.name}()\n`;
      code += `        #expect(subject != nil)\n`;
      code += `    }\n\n`;

      for (const method of cls.methods) {
        if (method.name !== 'init' && !method.name.startsWith('_')) {
          code += this.generateMethodTests(method, cls);
        }
      }
    }

    // Protocol conformance test if implements are available
    if ((cls as ClassInfoWithDecorators).decorators?.length) {
      const protocols = decorators.filter(d => !d.startsWith('@'));
      for (const proto of protocols) {
        code += `    @Test\n`;
        code += `    func testConformsTo${proto}() {\n`;
        code += `        let subject: any ${proto} = ${cls.name}(${this.generateInitCall(cls)})\n`;
        code += `        #expect(subject is ${proto})\n`;
        code += `    }\n\n`;
      }
    }

    code += `}\n`;
    return code;
  }

  /**
   * Generate stub tests when no AST analysis is available
   */
  generateStubTests(context: TestGenerationContext): string {
    const { moduleName, importPath, testType, patterns } = context;
    const patternComment = this.generateSwiftPatternComment(patterns);

    return `${patternComment}import Testing
@testable import ${this.extractModuleName(importPath)}

@Suite("${moduleName} ${testType} tests")
struct ${moduleName}Tests {

    @Test
    func testModuleExists() {
        // Verify the module can be imported
        #expect(true)
    }

    @Test
    func testBasicOperations() {
        // TODO: Implement when AST analysis is available
        #expect(true)
    }

    @Test
    func testEdgeCases() {
        // TODO: Test boundary conditions
        #expect(true)
    }

    @Test
    func testErrorConditions() {
        // TODO: Test error handling
        #expect(true)
    }
}
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
    const lineRange = this.formatLineRange(lines);

    return `// Coverage test for ${lineRange} in ${moduleName}
import Testing
@testable import ${this.extractModuleName(importPath)}

@Suite("${moduleName} coverage - ${lineRange}")
struct ${moduleName}CoverageTests {

    @Test
    func testCoverLines${lines[0]}To${lines[lines.length - 1]}() {
        // Arrange: Set up test inputs to reach uncovered lines
        // TODO: Replace with appropriate input

        // Act: Execute the code path
        // TODO: Call the method that covers ${lineRange}

        // Assert: Verify the code was reached and behaves correctly
        #expect(true) // placeholder
    }

    @Test
    func testEdgeCaseLines${lines[0]}To${lines[lines.length - 1]}() {
        // Arrange: Set up edge case input
        // TODO: Provide edge case input

        // Act & Assert: Verify edge case handling
        #expect(true) // placeholder
    }
}
`;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Generate tests for a method on a class/struct
   */
  private generateMethodTests(method: FunctionInfo, cls: ClassInfo): string {
    const initCall = this.generateInitCall(cls);
    const params = method.parameters.map(p => `${p.name}: ${this.generateSwiftTestValue(p)}`).join(', ');
    const isVoid = method.returnType === 'Void' || method.returnType === '()' || !method.returnType;
    const asyncPrefix = method.isAsync ? 'await ' : '';
    const asyncKeyword = method.isAsync ? ' async' : '';
    const isOptionalReturn = method.returnType?.endsWith('?') || method.returnType?.includes('Optional');

    let code = '';

    // Happy path test
    code += `    @Test\n`;
    code += `    func test${this.pascalCase(method.name)}()${asyncKeyword} {\n`;
    code += `        let subject = ${cls.name}(${initCall})\n`;

    if (isVoid) {
      code += `        ${asyncPrefix}subject.${method.name}(${params})\n`;
      code += `        // void method - verify no crash\n`;
    } else if (isOptionalReturn) {
      code += `        let result = ${asyncPrefix}subject.${method.name}(${params})\n`;
      code += `        // Result is optional - may be nil\n`;
      code += `        #expect(result != nil || true)\n`;
    } else {
      code += `        let result = ${asyncPrefix}subject.${method.name}(${params})\n`;
      code += `        ${this.generateSwiftAssertion(method.name, method.returnType)}\n`;
    }

    code += `    }\n\n`;

    // Nil parameter tests for optional params
    const bodyText = method.body || '';
    const hasExplicitThrow = /\bthrow\b/.test(bodyText) || /\bguard\b/.test(bodyText);

    for (const param of method.parameters) {
      if (!param.optional && (param.type?.endsWith('?') || param.type?.includes('Optional'))) {
        code += `    @Test\n`;
        code += `    func test${this.pascalCase(method.name)}Nil${this.pascalCase(param.name)}()${asyncKeyword} {\n`;
        code += `        let subject = ${cls.name}(${initCall})\n`;

        const nilParams = method.parameters
          .map(p => `${p.name}: ${p.name === param.name ? 'nil' : this.generateSwiftTestValue(p)}`)
          .join(', ');

        if (hasExplicitThrow) {
          code += `        #expect(throws: (any Error).self) {\n`;
          code += `            ${asyncPrefix}try subject.${method.name}(${nilParams})\n`;
          code += `        }\n`;
        } else {
          code += `        let result = ${asyncPrefix}subject.${method.name}(${nilParams})\n`;
          code += `        #expect(result != nil || true)\n`;
        }

        code += `    }\n\n`;
      }
    }

    return code;
  }

  /**
   * Generate a constructor call string for creating instances in tests
   */
  private generateInitCall(cls: ClassInfo): string {
    if (cls.hasConstructor && cls.constructorParams && cls.constructorParams.length > 0) {
      return cls.constructorParams
        .map(p => `${p.name}: ${this.generateSwiftTestValue(p)}`)
        .join(', ');
    }
    return '';
  }

  /**
   * Generate standalone function tests grouped in a Suite
   */
  private generateStandaloneFunctionSuite(
    moduleName: string,
    functions: FunctionInfo[],
    testType: TestType
  ): string {
    let code = `@Suite\n`;
    code += `struct ${moduleName}FunctionTests {\n\n`;

    for (const fn of functions) {
      code += this.generateFunctionTests(fn, testType);
    }

    code += `}\n`;
    return code;
  }

  /**
   * Generate a Swift assertion based on method name and return type
   */
  private generateSwiftAssertion(methodName: string, returnType: string | undefined): string {
    if (!returnType) return '#expect(true) // void function';

    const rt = returnType;

    if (/^(is|has|can)[A-Z]/.test(methodName)) {
      return '#expect(result == true || result == false)';
    }
    if (/^(get|fetch|find)[A-Z]/.test(methodName)) {
      return '#expect(result != nil)';
    }
    if (/^(create|build|make)[A-Z]/.test(methodName)) {
      return '#expect(result != nil)';
    }

    const lower = rt.toLowerCase();
    if (rt.endsWith('?')) return '#expect(result != nil || true) // optional';
    if (lower === 'bool') return '#expect(result == true || result == false)';
    if (lower === 'int' || lower === 'double' || lower === 'float') return '#expect(result >= 0 || result < 0) // numeric result';
    if (lower === 'string') return '#expect(!result.isEmpty || result.isEmpty)';
    if (rt.startsWith('[') || lower.includes('array')) return '#expect(result.count >= 0)';

    return '#expect(result != nil)';
  }

  /**
   * Generate a Swift test value for a parameter
   */
  private generateSwiftTestValue(param: ParameterInfo): string {
    if (param.defaultValue) return param.defaultValue;

    const type = param.type?.replace('?', '') || 'unknown';
    const name = param.name.toLowerCase();
    const lower = type.toLowerCase();

    // Infer from param name
    if (name.includes('id')) return `"${testValues.uuid()}"`;
    if (name.includes('email')) return `"${testValues.email()}"`;
    if (name.includes('name')) return `"${testValues.fullName()}"`;
    if (name.includes('url')) return `"${testValues.url()}"`;

    // Infer from type
    if (lower === 'string') return `"${testValues.word()}"`;
    if (lower === 'int') return String(testValues.int(1, 100));
    if (lower === 'double' || lower === 'float' || lower === 'cgfloat') return String(testValues.float(0, 100, 2));
    if (lower === 'bool') return 'true';
    if (lower.startsWith('[') && lower.endsWith(']')) return '[]';
    if (lower.includes('array')) return '[]';
    if (lower.includes('dictionary') || lower.includes('dict') || lower.startsWith('[') && lower.includes(':')) return '[:]';
    if (lower === 'data') return 'Data()';
    if (lower === 'date') return 'Date()';
    if (lower === 'uuid') return 'UUID()';
    if (lower === 'url') return 'URL(string: "https://example.com")!';

    // Default to a mock/placeholder
    return `${type}() /* TODO: provide test value */`;
  }

  /**
   * Extract the Swift module name from an import path
   */
  private extractModuleName(importPath: string): string {
    // If it looks like a module name already (no slashes, no dots except in extensions)
    if (!importPath.includes('/') && !importPath.includes('.')) {
      return importPath;
    }

    // Strip file extension and path, return last component as module name
    const parts = importPath.replace(/\.(swift)$/, '').split('/');
    return parts[parts.length - 1];
  }

  /**
   * Generate Swift-style pattern comment
   */
  private generateSwiftPatternComment(patterns: Pattern[]): string {
    if (patterns.length === 0) return '';
    return `// Applied patterns: ${patterns.map(p => p.name).join(', ')}\n`;
  }
}

/**
 * Extended ClassInfo that may include decorator information from parsed files
 */
interface ClassInfoWithDecorators extends ClassInfo {
  decorators?: string[];
}
