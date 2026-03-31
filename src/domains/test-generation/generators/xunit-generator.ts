/**
 * Agentic QE v3 - xUnit Test Generator
 * Strategy implementation for C#'s xUnit framework
 *
 * Generates test code using:
 * - xUnit [Fact] and [Theory] attributes
 * - Moq for mocking dependencies
 * - FluentAssertions for expressive assertions
 * - C# async/await patterns (async Task)
 * - IOptions<T> configuration pattern
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
 * XUnitGenerator - Test generator for C#'s xUnit framework
 *
 * Generates idiomatic C# test code with xUnit conventions:
 * - [Fact] for simple tests, [Theory] + [InlineData] for parameterized
 * - Moq for constructor dependency injection mocking
 * - FluentAssertions for readable assertions
 * - Proper async Task handling
 *
 * @example
 * ```typescript
 * const generator = new XUnitGenerator();
 * const testCode = generator.generateTests({
 *   moduleName: 'UserService',
 *   importPath: 'MyApp.Services',
 *   testType: 'unit',
 *   patterns: [],
 *   analysis: { functions: [...], classes: [...] }
 * });
 * ```
 */
export class XUnitGenerator extends BaseTestGenerator {
  readonly framework: TestFramework = 'xunit';

  /**
   * Convert ParsedFile from multi-language parser to CodeAnalysis.
   * Maps universal parser types to the legacy IFunctionInfo/IClassInfo shape.
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
        hasConstructor: c.methods.some(m => m.name === 'constructor' || m.name === '.ctor'),
        constructorParams: c.methods.find(m => m.name === 'constructor' || m.name === '.ctor')?.parameters.map(p => ({
          name: p.name,
          type: p.type,
          optional: p.isOptional,
          defaultValue: p.defaultValue,
        })),
      })),
    };
  }

  /**
   * Generate complete test file from analysis
   */
  generateTests(context: TestGenerationContext): string {
    const { moduleName, importPath, testType, patterns, analysis } = context;

    if (!analysis || (analysis.functions.length === 0 && analysis.classes.length === 0)) {
      return this.generateStubTests(context);
    }

    const patternComment = this.generateCSharpPatternComment(patterns);
    const className = this.pascalCase(moduleName);

    let code = `${patternComment}using Xunit;
using Moq;
using FluentAssertions;
using ${importPath};

namespace Tests.${className}
{
`;

    // Generate tests for exported classes
    const exportedClasses = analysis.classes.filter(cls => cls.isExported);
    for (const cls of exportedClasses) {
      code += this.generateClassTests(cls, testType);
    }

    // Generate tests for exported standalone functions
    const exportedFns = analysis.functions.filter(fn => fn.isExported);
    if (exportedFns.length > 0) {
      code += `    public class ${className}FunctionTests\n`;
      code += `    {\n`;
      for (const fn of exportedFns) {
        code += this.generateFunctionTests(fn, testType);
      }
      code += `    }\n`;
    }

    code += `}\n`;
    return code;
  }

  /**
   * Generate tests for a standalone function
   */
  generateFunctionTests(fn: FunctionInfo, _testType: TestType): string {
    const validParams = fn.parameters.map(p => this.generateCSharpTestValue(p)).join(', ');
    const isAsync = fn.isAsync || this.returnsTask(fn.returnType);
    const isVoid = fn.returnType === 'void' || fn.returnType === 'Task';

    const asyncModifier = isAsync ? 'async ' : '';
    const taskReturn = isAsync ? 'Task' : 'void';
    const awaitPrefix = isAsync ? 'await ' : '';

    let code = '';

    // Happy path [Fact]
    code += `        [Fact]\n`;
    code += `        public ${asyncModifier}${taskReturn} ${fn.name}_WithValidInput_ShouldSucceed()\n`;
    code += `        {\n`;

    if (isVoid) {
      code += `            // Act\n`;
      code += `            ${awaitPrefix}${fn.name}(${validParams});\n`;
      code += `\n`;
      code += `            // Assert - void method completed without exception\n`;
    } else {
      const assertion = this.generateCSharpAssertion(fn);
      code += `            // Act\n`;
      code += `            var result = ${awaitPrefix}${fn.name}(${validParams});\n`;
      code += `\n`;
      code += `            // Assert\n`;
      code += `            ${assertion}\n`;
    }
    code += `        }\n\n`;

    // Theory with InlineData for parameterized tests on numeric/string params
    const inlineDataParams = fn.parameters.filter(p => {
      const type = p.type?.toLowerCase() || '';
      return type.includes('int') || type.includes('string') || type.includes('number');
    });

    if (inlineDataParams.length > 0 && inlineDataParams.length === fn.parameters.length) {
      code += this.generateTheoryTest(fn, inlineDataParams, isAsync);
    }

    return code;
  }

  /**
   * Generate tests for a class with constructor dependency injection
   */
  generateClassTests(cls: ClassInfo, _testType: TestType): string {
    const className = cls.name;
    let code = `    public class ${className}Tests\n`;
    code += `    {\n`;

    // Generate mock fields for constructor dependencies
    const ctorParams = cls.constructorParams || [];
    const mockFields: string[] = [];
    const mockSetups: string[] = [];
    const ctorArgs: string[] = [];

    for (const param of ctorParams) {
      const paramType = param.type || 'object';
      const isInterface = paramType.startsWith('I') && /^I[A-Z]/.test(paramType);
      const isOptionsPattern = paramType.startsWith('IOptions<');

      if (isOptionsPattern) {
        // IOptions<T> pattern
        const innerType = paramType.match(/IOptions<(.+)>/)?.[1] || 'object';
        const fieldName = `_${this.camelCase(param.name)}`;
        mockFields.push(`        private readonly ${paramType} ${fieldName};`);
        mockSetups.push(`            ${fieldName} = Options.Create(new ${innerType}());`);
        ctorArgs.push(fieldName);
      } else if (isInterface) {
        // Mock interface
        const fieldName = `_mock${paramType.substring(1)}`;
        mockFields.push(`        private readonly Mock<${paramType}> ${fieldName};`);
        mockSetups.push(`            ${fieldName} = new Mock<${paramType}>();`);
        ctorArgs.push(`${fieldName}.Object`);
      } else {
        // Concrete type - generate test value
        const value = this.generateCSharpTestValue(param);
        ctorArgs.push(value);
      }
    }

    // Fields
    for (const field of mockFields) {
      code += `${field}\n`;
    }
    if (ctorParams.length > 0) {
      code += `        private readonly ${className} _sut;\n`;
    }
    code += `\n`;

    // Constructor
    code += `        public ${className}Tests()\n`;
    code += `        {\n`;
    for (const setup of mockSetups) {
      code += `${setup}\n`;
    }
    if (ctorParams.length > 0) {
      code += `            _sut = new ${className}(${ctorArgs.join(', ')});\n`;
    } else {
      code += `            _sut = new ${className}();\n`;
    }
    code += `        }\n\n`;

    // Instantiation test
    code += `        [Fact]\n`;
    code += `        public void Constructor_ShouldCreateInstance()\n`;
    code += `        {\n`;
    code += `            // Assert\n`;
    code += `            _sut.Should().NotBeNull();\n`;
    code += `        }\n\n`;

    // Method tests
    for (const method of cls.methods) {
      // Skip private and constructor methods
      if (method.name.startsWith('_') || method.name.startsWith('#') ||
          method.name === 'constructor' || method.name === '.ctor') {
        continue;
      }
      code += this.generateMethodTest(method, ctorParams);
    }

    code += `    }\n\n`;
    return code;
  }

  /**
   * Generate stub tests when no AST analysis is available
   */
  generateStubTests(context: TestGenerationContext): string {
    const { moduleName, importPath, testType, patterns } = context;
    const patternComment = this.generateCSharpPatternComment(patterns);
    const className = this.pascalCase(moduleName);

    return `${patternComment}using Xunit;
using Moq;
using FluentAssertions;
using ${importPath};

namespace Tests.${className}
{
    /// <summary>
    /// ${testType} tests for ${className}
    /// </summary>
    public class ${className}Tests
    {
        [Fact]
        public void ShouldBeDefinedAndAccessible()
        {
            // Arrange & Act
            var instance = new ${className}();

            // Assert
            instance.Should().NotBeNull();
        }

        [Fact]
        public void ShouldHandleBasicOperations()
        {
            // Arrange
            var instance = new ${className}();

            // Act & Assert
            instance.Should().NotBeNull();
            instance.Should().BeOfType<${className}>();
        }

        [Fact]
        public void ShouldHandleEdgeCases()
        {
            // Arrange & Act
            Action act = () => new ${className}();

            // Assert - constructor should not throw
            act.Should().NotThrow();
        }
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
    const className = this.pascalCase(moduleName);
    const lineRange = this.formatLineRange(lines);

    return `// Coverage test for ${lineRange} in ${moduleName}
using Xunit;
using FluentAssertions;
using ${importPath};

namespace Tests.${className}.Coverage
{
    /// <summary>
    /// Tests to cover ${lineRange}
    /// </summary>
    public class ${className}CoverageTests
    {
        [Fact]
        public void Cover_Lines_${lines[0]}_${lines[lines.length - 1]}()
        {
            // Arrange: Set up test inputs to reach uncovered lines
            // TODO: Replace with appropriate input
            var sut = new ${className}();

            // Act: Execute the code path
            Action act = () => { /* invoke method targeting ${lineRange} */ };

            // Assert: Verify expected behavior
            act.Should().NotThrow();
        }
    }
}
`;
  }

  // ============================================================================
  // C#/xUnit-Specific Helpers
  // ============================================================================

  /**
   * Generate C# pattern comment
   */
  private generateCSharpPatternComment(patterns: Pattern[]): string {
    if (patterns.length === 0) return '';
    return `// Applied patterns: ${patterns.map(p => p.name).join(', ')}\n`;
  }

  /**
   * Check if a return type represents a Task (async)
   */
  private returnsTask(returnType: string | undefined): boolean {
    if (!returnType) return false;
    const rt = returnType.toLowerCase();
    return rt.startsWith('task') || rt.includes('task<');
  }

  /**
   * Generate a C# test value for a parameter
   */
  private generateCSharpTestValue(param: ParameterInfo): string {
    if (param.defaultValue) return param.defaultValue;

    const type = param.type?.toLowerCase() || 'unknown';
    const name = param.name.toLowerCase();

    // Infer from param name
    if (name.includes('id') && (type.includes('int') || type === 'unknown')) {
      return String(testValues.int(1, 1000));
    }
    if (name.includes('id')) return `"${testValues.uuid()}"`;
    if (name.includes('name')) return `"${testValues.fullName()}"`;
    if (name.includes('email')) return `"${testValues.email()}"`;
    if (name.includes('url')) return `"${testValues.url()}"`;

    // Infer from type
    if (type === 'int' || type === 'int32' || type === 'int64' || type === 'long') {
      return String(testValues.int(1, 100));
    }
    if (type === 'double' || type === 'float' || type === 'decimal') {
      return `${testValues.float(0, 100, 2)}m`;
    }
    if (type === 'string' || type.includes('string')) return `"${testValues.word()}"`;
    if (type === 'bool' || type === 'boolean') return 'true';
    if (type.includes('list<') || type.includes('ienumerable<') || type.includes('[]')) {
      return 'new List<object>()';
    }
    if (type.includes('dictionary<')) return 'new Dictionary<string, object>()';
    if (type.includes('guid')) return 'Guid.NewGuid()';
    if (type.includes('datetime')) return 'DateTime.UtcNow';

    // Nullable types
    if (type.endsWith('?')) {
      const innerType = type.slice(0, -1);
      return this.generateCSharpTestValue({ ...param, type: innerType });
    }

    return `default /* TODO: provide ${param.name}: ${param.type || 'unknown'} */`;
  }

  /**
   * Generate appropriate C# assertion based on function signature
   */
  private generateCSharpAssertion(fn: FunctionInfo): string {
    const returnType = fn.returnType || '';
    const rt = returnType.toLowerCase().replace(/task<(.+)>/, '$1');

    // Nullable return type
    if (rt.endsWith('?') || returnType.includes('?')) {
      return 'result.Should().NotBeNull();';
    }

    // Boolean checks
    if (/^(is|has|can)[A-Z]/.test(fn.name)) {
      return 'result.Should().BeOneOf(true, false);';
    }

    // Type-specific assertions
    if (rt === 'bool' || rt === 'boolean') return 'result.Should().BeTrue();';
    if (rt === 'int' || rt === 'long' || rt === 'double' || rt === 'float' || rt === 'decimal') {
      return 'result.Should().BeGreaterThanOrEqualTo(0);';
    }
    if (rt === 'string') return 'result.Should().NotBeNullOrEmpty();';
    if (rt.includes('list<') || rt.includes('ienumerable<') || rt.includes('[]')) {
      return 'result.Should().NotBeNull();';
    }

    return 'result.Should().NotBeNull();';
  }

  /**
   * Generate a [Theory] test with [InlineData] attributes
   */
  private generateTheoryTest(
    fn: FunctionInfo,
    params: ParameterInfo[],
    isAsync: boolean
  ): string {
    const asyncModifier = isAsync ? 'async ' : '';
    const taskReturn = isAsync ? 'Task' : 'void';
    const awaitPrefix = isAsync ? 'await ' : '';

    // Generate parameter signature
    const paramSig = params.map(p => {
      const csType = this.toCSharpType(p.type);
      return `${csType} ${p.name}`;
    }).join(', ');

    // Generate inline data rows
    const dataRows = this.generateInlineDataRows(params);

    let code = '';
    for (const row of dataRows) {
      code += `        [InlineData(${row})]\n`;
    }
    code += `        [Theory]\n`;
    code += `        public ${asyncModifier}${taskReturn} ${fn.name}_WithVariousInputs_ShouldHandleCorrectly(${paramSig})\n`;
    code += `        {\n`;
    code += `            // Act\n`;
    const args = params.map(p => p.name).join(', ');
    code += `            var result = ${awaitPrefix}${fn.name}(${args});\n`;
    code += `\n`;
    code += `            // Assert\n`;
    code += `            Assert.NotNull(result);\n`;
    code += `        }\n\n`;

    return code;
  }

  /**
   * Generate [InlineData] rows for parameterized tests
   */
  private generateInlineDataRows(params: ParameterInfo[]): string[] {
    const rows: string[] = [];

    // Generate 3 varied data rows
    for (let i = 0; i < 3; i++) {
      const values = params.map(p => {
        const type = p.type?.toLowerCase() || '';
        if (type.includes('int') || type.includes('number')) {
          return String(testValues.int(1, 100));
        }
        if (type.includes('string') || type === 'unknown') {
          return `"${testValues.word()}"`;
        }
        return 'null';
      });
      rows.push(values.join(', '));
    }

    return rows;
  }

  /**
   * Map interface/generic types to C# primitive types for InlineData
   */
  private toCSharpType(type: string | undefined): string {
    if (!type) return 'object';
    const t = type.toLowerCase();
    if (t === 'int' || t === 'int32') return 'int';
    if (t === 'long' || t === 'int64') return 'long';
    if (t === 'string') return 'string';
    if (t === 'bool' || t === 'boolean') return 'bool';
    if (t === 'double') return 'double';
    if (t === 'float') return 'float';
    if (t.includes('number')) return 'int';
    return 'object';
  }

  /**
   * Generate a test method for a class method, with Moq setup where needed
   */
  private generateMethodTest(method: FunctionInfo, ctorParams: ParameterInfo[]): string {
    const isAsync = method.isAsync || this.returnsTask(method.returnType);
    const isVoid = method.returnType === 'void' || method.returnType === 'Task';
    const asyncModifier = isAsync ? 'async ' : '';
    const taskReturn = isAsync ? 'Task' : 'void';
    const awaitPrefix = isAsync ? 'await ' : '';

    const methodParams = method.parameters
      .map(p => this.generateCSharpTestValue(p))
      .join(', ');

    let code = `        [Fact]\n`;
    code += `        public ${asyncModifier}${taskReturn} ${method.name}_ShouldWork()\n`;
    code += `        {\n`;

    // Arrange: Setup mocks for methods that likely interact with dependencies
    const mockSetups = this.generateMockSetups(method, ctorParams);
    if (mockSetups) {
      code += `            // Arrange\n`;
      code += mockSetups;
      code += `\n`;
    }

    // Act
    code += `            // Act\n`;
    if (isVoid) {
      code += `            ${awaitPrefix}_sut.${method.name}(${methodParams});\n`;
    } else {
      code += `            var result = ${awaitPrefix}_sut.${method.name}(${methodParams});\n`;
    }

    // Assert
    code += `\n`;
    code += `            // Assert\n`;
    if (isVoid) {
      code += `            // Verify method completed without exception\n`;
    } else {
      const assertion = this.generateCSharpAssertion(method);
      code += `            ${assertion}\n`;
    }

    code += `        }\n\n`;

    // Async exception test
    if (isAsync) {
      code += `        [Fact]\n`;
      code += `        public async Task ${method.name}_WhenDependencyFails_ShouldHandleGracefully()\n`;
      code += `        {\n`;
      code += `            // Act & Assert\n`;
      code += `            Func<Task> act = async () => await _sut.${method.name}(${methodParams});\n`;
      code += `            // Uncomment when dependency mock throws:\n`;
      code += `            // await act.Should().ThrowAsync<Exception>();\n`;
      code += `            await Task.CompletedTask;\n`;
      code += `        }\n\n`;
    }

    return code;
  }

  /**
   * Generate Moq .Setup() calls based on method and constructor dependencies
   */
  private generateMockSetups(method: FunctionInfo, ctorParams: ParameterInfo[]): string {
    let code = '';

    // Look for interface dependencies that might need setup
    for (const param of ctorParams) {
      const paramType = param.type || '';
      const isInterface = paramType.startsWith('I') && /^I[A-Z]/.test(paramType);
      const isOptionsPattern = paramType.startsWith('IOptions<');

      if (isInterface && !isOptionsPattern) {
        const mockName = `_mock${paramType.substring(1)}`;
        const returnType = method.returnType || 'object';
        const isAsync = method.isAsync || this.returnsTask(returnType);
        const returnsMethod = isAsync ? 'ReturnsAsync' : 'Returns';
        const defaultReturn = this.getDefaultReturnValue(returnType);

        code += `            ${mockName}\n`;
        code += `                .Setup(x => x.${method.name}(It.IsAny<${this.getFirstParamType(method)}>()))\n`;
        code += `                .${returnsMethod}(${defaultReturn});\n`;
      }
    }

    return code;
  }

  /**
   * Get the type of the first parameter for It.IsAny<T>()
   */
  private getFirstParamType(method: FunctionInfo): string {
    if (method.parameters.length === 0) return 'object';
    const type = method.parameters[0].type;
    if (!type) return 'object';
    return type;
  }

  /**
   * Get a default return value string for a given return type
   */
  private getDefaultReturnValue(returnType: string): string {
    const rt = returnType.toLowerCase().replace(/task<(.+)>/, '$1');
    if (rt.endsWith('?')) return 'null';
    if (rt === 'bool' || rt === 'boolean') return 'true';
    if (rt === 'int' || rt === 'long') return '0';
    if (rt === 'string') return '"test"';
    if (rt.includes('list<')) return `new ${returnType.replace(/task<(.+)>/i, '$1')}()`;
    return `default(${returnType.replace(/task<(.+)>/i, '$1').replace(/\?$/, '')})`;
  }
}
