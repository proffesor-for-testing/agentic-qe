/**
 * Agentic QE v3 - Flutter Test Generator
 * Strategy implementation for Flutter/Dart test framework
 *
 * Generates test code using:
 * - flutter_test package (group, test, testWidgets, expect)
 * - mockito package (@GenerateMocks, when/verify/thenReturn)
 * - setUp / tearDown lifecycle hooks
 * - async/await with Future<T> handling
 * - Dart null safety (T? types)
 * - WidgetTester for widget tests
 *
 * @module test-generation/generators
 */

import { BaseTestGenerator } from './base-test-generator.js';
import type {
  TestFramework,
  TestType,
  FunctionInfo,
  ClassInfo,
  TestGenerationContext,
  CodeAnalysis,
} from '../interfaces.js';
import type { ParsedFile } from '../../../shared/parsers/interfaces.js';

/**
 * FlutterTestGenerator - Test generator for Flutter/Dart test framework
 *
 * Produces idiomatic Dart test files using flutter_test and mockito,
 * with support for widget tests, async Future handling, and null safety.
 *
 * @example
 * ```typescript
 * const generator = new FlutterTestGenerator();
 * const testCode = generator.generateTests({
 *   moduleName: 'UserService',
 *   importPath: 'package:my_app/services/user_service.dart',
 *   testType: 'unit',
 *   patterns: [],
 *   analysis: { functions: [...], classes: [...] }
 * });
 * ```
 */
export class FlutterTestGenerator extends BaseTestGenerator {
  readonly framework: TestFramework = 'flutter-test';

  /**
   * Dart primitive types for type-aware value generation
   */
  private static readonly DART_TYPE_DEFAULTS: ReadonlyArray<[string, string]> = [
    ['string', "'test_value'"],
    ['int', '42'],
    ['double', '3.14'],
    ['num', '42'],
    ['bool', 'true'],
    ['list', '[]'],
    ['map', '{}'],
    ['set', '{}'],
    ['dynamic', "'test'"],
    ['void', ''],
  ];

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Generate complete Dart test file from analysis
   */
  generateTests(context: TestGenerationContext): string {
    const { moduleName, importPath, testType, patterns, analysis } = context;

    const exportedFns = analysis ? analysis.functions.filter(fn => fn.isExported) : [];
    const exportedClasses = analysis ? analysis.classes.filter(cls => cls.isExported) : [];

    if (!analysis || (exportedFns.length === 0 && exportedClasses.length === 0)) {
      return this.generateStubTests(context);
    }

    const patternComment = this.generatePatternComment(patterns);
    const mockClasses = this.collectMockClasses(analysis);
    const hasWidgetTests = this.hasWidgetLikeClasses(analysis);

    let code = `${patternComment}`;
    code += this.generateDartImports(importPath, mockClasses, hasWidgetTests);
    code += '\n';

    if (mockClasses.length > 0) {
      code += `@GenerateMocks([${mockClasses.join(', ')}])\n`;
    }

    code += `void main() {\n`;

    // Generate tests for exported functions
    for (const fn of exportedFns) {
      code += this.indentBlock(this.generateFunctionTests(fn, testType), 2);
    }

    // Generate tests for exported classes
    for (const cls of exportedClasses) {
      code += this.indentBlock(this.generateClassTests(cls, testType), 2);
    }

    code += `}\n`;
    return code;
  }

  /**
   * Generate tests for a standalone function
   */
  generateFunctionTests(fn: FunctionInfo, _testType: TestType): string {
    const testCases = this.generateDartTestCases(fn);

    let code = `group('${fn.name}', () {\n`;

    for (const tc of testCases) {
      const asyncKeyword = fn.isAsync ? ' async' : '';
      code += `  test('${tc.description}', ()${asyncKeyword} {\n`;
      code += `    ${tc.action}\n`;
      if (tc.assertion) {
        code += `    ${tc.assertion}\n`;
      }
      code += `  });\n\n`;
    }

    code += `});\n\n`;
    return code;
  }

  /**
   * Generate tests for a class, including dependency injection via Mockito
   */
  generateClassTests(cls: ClassInfo, testType: TestType): string {
    const isWidget = this.isWidgetClass(cls);
    const mockDeps = this.extractMockDependencies(cls);

    let code = `group('${cls.name}', () {\n`;

    // Declare mock variables
    for (const dep of mockDeps) {
      code += `  late Mock${dep.type} mock${dep.type};\n`;
    }

    if (!isWidget) {
      code += `  late ${cls.name} subject;\n`;
    }

    code += `\n`;

    // setUp block
    code += `  setUp(() {\n`;
    for (const dep of mockDeps) {
      code += `    mock${dep.type} = Mock${dep.type}();\n`;
    }

    if (!isWidget) {
      if (cls.hasConstructor && cls.constructorParams && cls.constructorParams.length > 0) {
        const args = cls.constructorParams
          .map(p => {
            const mockDep = mockDeps.find(d => d.name === p.name);
            if (mockDep) {
              return `mock${mockDep.type}`;
            }
            return this.generateDartValue(p.name, p.type);
          })
          .join(', ');
        code += `    subject = ${cls.name}(${args});\n`;
      } else {
        code += `    subject = ${cls.name}();\n`;
      }
    }
    code += `  });\n\n`;

    // Instantiation test
    if (!isWidget) {
      code += `  test('should instantiate correctly', () {\n`;
      code += `    expect(subject, isNotNull);\n`;
      code += `  });\n\n`;
    }

    // Method tests
    for (const method of cls.methods) {
      if (!method.name.startsWith('_')) {
        code += this.generateMethodTests(method, cls.name, isWidget, mockDeps, testType);
      }
    }

    code += `});\n\n`;
    return code;
  }

  /**
   * Generate stub tests when no AST analysis is available
   */
  generateStubTests(context: TestGenerationContext): string {
    const { moduleName, importPath, patterns } = context;
    const patternComment = this.generatePatternComment(patterns);

    return `${patternComment}import 'package:flutter_test/flutter_test.dart';
import '${importPath}';

void main() {
  group('${moduleName}', () {
    test('should be defined', () {
      // Verify module is importable and accessible
      expect(true, isTrue);
    });

    test('should handle basic operations', () {
      // TODO: Add specific tests for ${moduleName}
      expect(true, isTrue);
    });

    test('should handle edge cases', () {
      // TODO: Test boundary conditions
      expect(true, isTrue);
    });

    test('should handle error conditions', () {
      // TODO: Test error handling
      expect(true, isTrue);
    });
  });
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
    const funcName = this.camelCase(moduleName);
    const lineRange = this.formatLineRange(lines);

    return `// Coverage test for ${lineRange} in ${moduleName}
import 'package:flutter_test/flutter_test.dart';
import '${importPath}';

void main() {
  group('${moduleName} coverage', () {
    group('${lineRange}', () {
      test('should execute code path covering ${lineRange}', () {
        // Arrange: Set up test inputs to reach uncovered lines
        // ignore: unnecessary_type_check
        final result = ${funcName}();

        // Assert: Verify the code was reached and behaves correctly
        expect(result, isNotNull);
      });

      test('should handle edge case for ${lineRange}', () {
        // Arrange: Set up edge case input
        // Act & Assert: Verify edge case handling
        expect(() => ${funcName}(), returnsNormally);
      });
    });
  });
}
`;
  }

  /**
   * Convert a ParsedFile (language-agnostic) to ICodeAnalysis for this generator
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
          body: m.body,
        })),
        properties: c.properties.map(p => ({
          name: p.name,
          type: p.type,
          isPrivate: !p.isPublic,
          isReadonly: p.isReadonly,
        })),
        isExported: c.isPublic,
        hasConstructor: c.methods.some(m => m.name === 'constructor' || m.name === c.name),
        constructorParams: c.methods
          .find(m => m.name === 'constructor' || m.name === c.name)
          ?.parameters.map(p => ({
            name: p.name,
            type: p.type,
            optional: p.isOptional,
            defaultValue: p.defaultValue,
          })),
      })),
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Generate Dart import statements for a test file
   */
  private generateDartImports(
    importPath: string,
    mockClasses: string[],
    hasWidgetTests: boolean
  ): string {
    let imports = '';

    if (hasWidgetTests) {
      imports += `import 'package:flutter/material.dart';\n`;
    }
    imports += `import 'package:flutter_test/flutter_test.dart';\n`;

    if (mockClasses.length > 0) {
      imports += `import 'package:mockito/mockito.dart';\n`;
      imports += `import 'package:mockito/annotations.dart';\n`;
    }

    imports += `import '${importPath}';\n`;

    // Generate .mocks.dart import if using mockito
    if (mockClasses.length > 0) {
      // Derive the .mocks.dart filename from importPath
      const testFileName = importPath
        .replace(/\.dart$/, '_test.mocks.dart')
        .replace(/.*\//, '');
      imports += `import '${testFileName}';\n`;
    }

    return imports;
  }

  /**
   * Collect all types that need @GenerateMocks
   */
  private collectMockClasses(analysis: CodeAnalysis): string[] {
    const mockTypes = new Set<string>();

    for (const cls of analysis.classes) {
      if (cls.constructorParams) {
        for (const p of cls.constructorParams) {
          if (p.type && this.isDartServiceType(p.type)) {
            mockTypes.add(p.type.replace(/\?$/, ''));
          }
        }
      }
    }

    return Array.from(mockTypes);
  }

  /**
   * Determine if a type looks like a service/repository (should be mocked)
   */
  private isDartServiceType(type: string): boolean {
    const cleanType = type.replace(/\?$/, '');
    // Primitive and collection types should not be mocked
    const nonMockable = [
      'string', 'int', 'double', 'num', 'bool', 'dynamic',
      'list', 'map', 'set', 'void', 'object', 'future',
    ];
    if (nonMockable.includes(cleanType.toLowerCase())) return false;
    if (/^(List|Map|Set|Future|Stream)</.test(cleanType)) return false;
    // PascalCase custom types are likely services
    return /^[A-Z]/.test(cleanType);
  }

  /**
   * Check if any class in the analysis looks like a Flutter Widget
   */
  private hasWidgetLikeClasses(analysis: CodeAnalysis): boolean {
    return analysis.classes.some(cls => this.isWidgetClass(cls));
  }

  /**
   * Determine if a class is a Widget (by name convention or methods)
   */
  private isWidgetClass(cls: ClassInfo): boolean {
    const name = cls.name.toLowerCase();
    return (
      name.endsWith('widget') ||
      name.endsWith('page') ||
      name.endsWith('screen') ||
      name.endsWith('view') ||
      cls.methods.some(m => m.name === 'build')
    );
  }

  /**
   * Extract constructor dependencies that should be mocked
   */
  private extractMockDependencies(
    cls: ClassInfo
  ): Array<{ name: string; type: string }> {
    if (!cls.hasConstructor || !cls.constructorParams) return [];

    return cls.constructorParams
      .filter(p => p.type && this.isDartServiceType(p.type))
      .map(p => ({
        name: p.name,
        type: p.type!.replace(/\?$/, ''),
      }));
  }

  /**
   * Generate tests for a class method
   */
  private generateMethodTests(
    method: FunctionInfo,
    className: string,
    isWidget: boolean,
    mockDeps: Array<{ name: string; type: string }>,
    _testType: TestType
  ): string {
    let code = '';

    if (isWidget && method.name === 'build') {
      // Widget test using testWidgets
      code += `  testWidgets('should render ${className} widget', (WidgetTester tester) async {\n`;
      code += `    await tester.pumpWidget(\n`;
      code += `      MaterialApp(\n`;
      code += `        home: ${className}(),\n`;
      code += `      ),\n`;
      code += `    );\n\n`;
      code += `    expect(find.byType(${className}), findsOneWidget);\n`;
      code += `  });\n\n`;
      return code;
    }

    const asyncKeyword = method.isAsync ? ' async' : '';
    const awaitPrefix = method.isAsync ? 'await ' : '';
    const isVoid = method.returnType === 'void' || method.returnType === 'Future<void>';

    // Happy path test
    const validParams = method.parameters
      .map(p => this.generateDartValue(p.name, p.type))
      .join(', ');
    const methodCall = `${awaitPrefix}subject.${method.name}(${validParams})`;

    code += `  test('${method.name} should execute successfully', ()${asyncKeyword} {\n`;

    // Add mock stubs if needed
    for (const dep of mockDeps) {
      if (method.returnType && method.isAsync) {
        code += `    // Configure mock behavior as needed\n`;
        break;
      }
    }

    if (isVoid) {
      code += `    ${methodCall};\n`;
      code += `    // void return - verify no exceptions thrown\n`;
    } else {
      code += `    final result = ${methodCall};\n`;
      code += `    expect(result, isNotNull);\n`;
    }
    code += `  });\n\n`;

    // Null parameter tests for required params
    const bodyText = method.body || '';
    const hasExplicitThrow = /\bthrow\b/.test(bodyText);

    for (const param of method.parameters) {
      if (!param.optional) {
        const isNullable = param.type?.endsWith('?') ?? false;
        if (!isNullable) {
          code += `  test('${method.name} should handle null ${param.name}', ()${asyncKeyword} {\n`;
          if (hasExplicitThrow) {
            code += `    expect(\n`;
            code += `      () ${method.isAsync ? 'async ' : ''}=> subject.${method.name}(`;
            const nullParams = method.parameters
              .map(p => p.name === param.name ? 'null' : this.generateDartValue(p.name, p.type))
              .join(', ');
            code += `${nullParams}),\n`;
            code += `      throwsA(isA<Exception>()),\n`;
            code += `    );\n`;
          } else {
            code += `    // Function may or may not accept null - verify graceful handling\n`;
            code += `    try {\n`;
            const nullParams = method.parameters
              .map(p => p.name === param.name ? 'null' : this.generateDartValue(p.name, p.type))
              .join(', ');
            code += `      ${awaitPrefix}subject.${method.name}(${nullParams});\n`;
            code += `    } catch (e) {\n`;
            code += `      expect(e, isA<Error>());\n`;
            code += `    }\n`;
          }
          code += `  });\n\n`;
        }
      }
    }

    return code;
  }

  /**
   * Generate Dart-idiomatic test cases for a function
   */
  private generateDartTestCases(
    fn: FunctionInfo
  ): Array<{ description: string; action: string; assertion: string }> {
    const cases: Array<{ description: string; action: string; assertion: string }> = [];

    // Happy path
    const validParams = fn.parameters
      .map(p => this.generateDartValue(p.name, p.type))
      .join(', ');
    const awaitPrefix = fn.isAsync ? 'await ' : '';
    const fnCall = `${awaitPrefix}${fn.name}(${validParams})`;
    const isVoid = fn.returnType === 'void' || fn.returnType === 'Future<void>';

    let assertion = 'expect(result, isNotNull);';
    if (!isVoid && fn.returnType) {
      const rt = fn.returnType.toLowerCase().replace(/future<(.+)>/, '$1');
      if (rt === 'bool') assertion = 'expect(result, isA<bool>());';
      else if (rt === 'int' || rt === 'double' || rt === 'num') assertion = 'expect(result, isA<num>());';
      else if (rt === 'string') assertion = 'expect(result, isA<String>());';
      else if (rt.startsWith('list')) assertion = 'expect(result, isA<List>());';
      else if (rt.startsWith('map')) assertion = 'expect(result, isA<Map>());';
    }

    if (isVoid) {
      cases.push({
        description: 'should handle valid input correctly',
        action: `${fnCall};`,
        assertion: '// void function - no return value to assert',
      });
    } else {
      cases.push({
        description: 'should handle valid input correctly',
        action: `final result = ${fnCall};`,
        assertion,
      });
    }

    // Null parameter tests
    const bodyText = fn.body || '';
    const hasExplicitThrow = /\bthrow\b/.test(bodyText);

    for (const param of fn.parameters) {
      if (!param.optional) {
        const isNullable = param.type?.endsWith('?') ?? false;
        if (!isNullable) {
          const nullParams = fn.parameters
            .map(p => p.name === param.name ? 'null' : this.generateDartValue(p.name, p.type))
            .join(', ');

          if (hasExplicitThrow) {
            cases.push({
              description: `should throw on null ${param.name}`,
              action: `expect(\n      () ${fn.isAsync ? 'async ' : ''}=> ${fn.name}(${nullParams}),\n      throwsA(isA<Exception>()),\n    );`,
              assertion: '',
            });
          } else {
            cases.push({
              description: `should handle null ${param.name}`,
              action: `try {\n      ${awaitPrefix}${fn.name}(${nullParams});\n    } catch (e) {\n      expect(e, isA<Error>());\n    }`,
              assertion: '',
            });
          }
        }
      }
    }

    // Boundary tests for string params
    for (const param of fn.parameters) {
      const type = param.type?.toLowerCase() ?? '';
      if (type === 'string' || type === 'string?') {
        const emptyParams = fn.parameters
          .map(p => p.name === param.name ? "''" : this.generateDartValue(p.name, p.type))
          .join(', ');
        cases.push({
          description: `should handle empty string for ${param.name}`,
          action: `try {\n      ${awaitPrefix}${fn.name}(${emptyParams});\n    } catch (e) {\n      expect(e, isA<Error>());\n    }`,
          assertion: '',
        });
      }

      if (type === 'int' || type === 'double' || type === 'num') {
        const zeroParams = fn.parameters
          .map(p => p.name === param.name ? '0' : this.generateDartValue(p.name, p.type))
          .join(', ');
        cases.push({
          description: `should handle zero for ${param.name}`,
          action: `try {\n      ${awaitPrefix}${fn.name}(${zeroParams});\n    } catch (e) {\n      expect(e, isA<Error>());\n    }`,
          assertion: '',
        });
      }
    }

    return cases;
  }

  /**
   * Generate a Dart test value based on parameter name and type
   */
  private generateDartValue(name: string, type: string | undefined): string {
    if (!type) return "'test'";

    const cleanType = type.replace(/\?$/, '').toLowerCase();

    // Check name-based hints first
    const nameLower = name.toLowerCase();
    if (nameLower.includes('id')) return "'test-id-123'";
    if (nameLower.includes('email')) return "'test@example.com'";
    if (nameLower.includes('name')) return "'Test Name'";
    if (nameLower.includes('url')) return "'https://example.com'";

    // Type-based defaults
    for (const [typeKey, value] of FlutterTestGenerator.DART_TYPE_DEFAULTS) {
      if (cleanType.includes(typeKey)) return value;
    }

    // Collection types
    if (cleanType.startsWith('list')) return '<${extractGenericType(type)}>[]';
    if (cleanType.startsWith('map')) return '<String, dynamic>{}';
    if (cleanType.startsWith('set')) return '<${extractGenericType(type)}>{}';
    if (cleanType.startsWith('future')) return "Future.value('test')";
    if (cleanType.startsWith('stream')) return "Stream.value('test')";

    // Custom type - return a mock or placeholder
    if (/^[A-Z]/.test(type.replace(/\?$/, ''))) {
      return `Mock${type.replace(/\?$/, '')}()`;
    }

    return "'test'";
  }

  /**
   * Indent a block of code by a given number of spaces
   */
  private indentBlock(code: string, spaces: number): string {
    const indent = ' '.repeat(spaces);
    return code
      .split('\n')
      .map(line => (line.trim() ? `${indent}${line}` : line))
      .join('\n');
  }
}
