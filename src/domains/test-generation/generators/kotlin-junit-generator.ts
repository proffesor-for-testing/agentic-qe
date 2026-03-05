/**
 * Agentic QE v3 - Kotlin JUnit Test Generator (M4.2)
 * Strategy implementation for Kotlin's JUnit 5 + MockK test framework
 *
 * Generates test code using:
 * - JUnit Jupiter @Test annotations with backtick test names
 * - MockK for mocking (@MockK / @InjectMockKs / every / verify)
 * - coEvery / coVerify for coroutine (suspend) functions
 * - runTest {} or runBlocking {} for coroutine test bodies
 * - Kotlin-idiomatic assertions (shouldBe, shouldNotBeNull from Kotest or JUnit)
 *
 * @module test-generation/generators
 */

import { faker } from '@faker-js/faker';
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
 * KotlinJUnitGenerator - Test generator for Kotlin's JUnit 5 + MockK framework
 *
 * Generates idiomatic Kotlin test code with:
 * - @Test fun `should do something`() backtick method names
 * - @ExtendWith(MockKExtension::class) on test class
 * - @MockK / @InjectMockKs annotations for dependency injection
 * - every { mock.method() } returns value (MockK syntax)
 * - coEvery / coVerify for suspend functions
 * - runTest { } for coroutine test bodies
 *
 * @example
 * ```typescript
 * const generator = new KotlinJUnitGenerator();
 * const testCode = generator.generateTests({
 *   moduleName: 'UserService',
 *   importPath: 'com.example.service.UserService',
 *   testType: 'unit',
 *   patterns: [],
 *   analysis: { functions: [...], classes: [...] }
 * });
 * ```
 */
export class KotlinJUnitGenerator extends BaseTestGenerator {
  readonly framework: TestFramework = 'kotlin-junit';

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
        hasConstructor: c.methods.some(m => m.name === '<init>' || m.name === 'constructor'),
        constructorParams: c.methods.find(m => m.name === '<init>' || m.name === 'constructor')?.parameters.map(p => ({
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
   * Generate complete Kotlin JUnit 5 + MockK test file from analysis
   */
  generateTests(context: TestGenerationContext): string {
    const { moduleName, importPath, testType, patterns, analysis } = context;

    if (!analysis || (analysis.functions.length === 0 && analysis.classes.length === 0)) {
      return this.generateStubTests(context);
    }

    const packagePath = this.extractPackage(importPath);
    const patternComment = this.generateKotlinPatternComment(patterns);

    let code = `${patternComment}package ${packagePath}\n\n`;
    code += this.generateImports(analysis);

    // Generate tests for exported classes
    const exportedClasses = analysis.classes.filter(cls => cls.isExported);
    for (const cls of exportedClasses) {
      code += this.generateClassTests(cls, testType);
    }

    // Generate tests for exported standalone functions
    const exportedFns = analysis.functions.filter(fn => fn.isExported);
    if (exportedFns.length > 0) {
      code += this.generateTopLevelFunctionTests(moduleName, exportedFns, testType);
    }

    return code;
  }

  /**
   * Generate tests for a standalone function
   */
  generateFunctionTests(fn: FunctionInfo, _testType: TestType): string {
    const params = fn.parameters.map(p => this.generateKotlinTestValue(p)).join(', ');
    const isVoid = fn.returnType === 'Unit' || fn.returnType === 'void' || !fn.returnType;
    const isSuspend = fn.isAsync;

    let code = '';
    code += `    @Test\n`;
    code += `    fun \`${fn.name} should handle valid input correctly\`()`;

    if (isSuspend) {
      code += ` = runTest {\n`;
    } else {
      code += ` {\n`;
    }

    if (isVoid) {
      code += `        ${fn.name}(${params})\n`;
      code += `        // Unit function - verify no exception thrown\n`;
    } else {
      code += `        val result = ${fn.name}(${params})\n`;
      code += `        ${this.generateKotlinAssertion(fn.name, fn.returnType)}\n`;
    }

    code += `    }\n\n`;

    // Parameter edge cases - null handling for non-optional, non-nullable params
    for (const param of fn.parameters) {
      if (!param.optional && !this.isNullableType(param.type)) {
        const nullParams = fn.parameters
          .map(p => p.name === param.name ? 'null' : this.generateKotlinTestValue(p))
          .join(', ');

        const bodyText = fn.body || '';
        const hasExplicitThrow = /\bthrow\b/.test(bodyText) || /\bvalidat/i.test(bodyText)
          || /\brequire\b/.test(bodyText) || /\bcheck\b/.test(bodyText);

        code += `    @Test\n`;
        code += `    fun \`${fn.name} should handle null ${param.name}\`()`;

        if (isSuspend) {
          code += ` = runTest {\n`;
        } else {
          code += ` {\n`;
        }

        if (hasExplicitThrow) {
          code += `        assertThrows<Exception> {\n`;
          code += `            ${fn.name}(${nullParams})\n`;
          code += `        }\n`;
        } else {
          code += `        // Function may accept or reject null - both are valid\n`;
          code += `        try {\n`;
          code += `            ${fn.name}(${nullParams})\n`;
          code += `        } catch (e: Exception) {\n`;
          code += `            assertThat(e).isInstanceOf(Exception::class.java)\n`;
          code += `        }\n`;
        }

        code += `    }\n\n`;
      }
    }

    return code;
  }

  /**
   * Generate tests for a class with MockK dependency injection
   */
  generateClassTests(cls: ClassInfo, testType: TestType): string {
    const decorators: string[] = (cls as ClassInfoWithDecorators).decorators || [];
    const isSpringClass = decorators.some(d =>
      d.includes('Service') || d.includes('Component') || d.includes('Repository')
      || d.includes('Controller')
    );

    let code = `@ExtendWith(MockKExtension::class)\n`;
    code += `class ${cls.name}Test {\n\n`;

    // Generate @MockK fields for constructor dependencies
    if (cls.hasConstructor && cls.constructorParams && cls.constructorParams.length > 0) {
      for (const param of cls.constructorParams) {
        const kotlinType = this.mapToKotlinType(param.type);
        code += `    @MockK\n`;
        code += `    private lateinit var ${param.name}: ${kotlinType}\n\n`;
      }

      code += `    @InjectMockKs\n`;
      code += `    private lateinit var subject: ${cls.name}\n\n`;
    } else {
      code += `    private lateinit var subject: ${cls.name}\n\n`;
      code += `    @BeforeEach\n`;
      code += `    fun setUp() {\n`;
      code += `        subject = ${cls.name}()\n`;
      code += `    }\n\n`;
    }

    // Instantiation test
    code += `    @Test\n`;
    code += `    fun \`should instantiate correctly\`() {\n`;
    code += `        assertThat(subject).isNotNull()\n`;
    code += `    }\n\n`;

    // Generate tests for each public method
    for (const method of cls.methods) {
      if (!method.name.startsWith('_') && !method.name.startsWith('#')
        && method.name !== '<init>' && method.name !== 'constructor') {
        code += this.generateMethodTests(method, cls);
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
    const packagePath = this.extractPackage(importPath);
    const patternComment = this.generateKotlinPatternComment(patterns);

    return `${patternComment}package ${packagePath}

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.BeforeEach
import org.assertj.core.api.Assertions.assertThat

@DisplayName("${moduleName} ${testType} tests")
class ${moduleName}Test {

    @Test
    fun \`should be defined\`() {
        // Verify the class can be referenced
        assertThat(${moduleName}::class).isNotNull()
    }

    @Test
    fun \`should handle basic operations\`() {
        // TODO: Implement when AST analysis is available
        assertThat(true).isTrue()
    }

    @Test
    fun \`should handle edge cases\`() {
        // TODO: Test boundary conditions
        assertThat(true).isTrue()
    }

    @Test
    fun \`should handle error conditions\`() {
        // TODO: Test error handling
        assertThat(true).isTrue()
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
    const packagePath = this.extractPackage(importPath);

    return `// Coverage test for ${lineRange} in ${moduleName}
package ${packagePath}

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.DisplayName
import org.assertj.core.api.Assertions.assertThat

@DisplayName("${moduleName} coverage - ${lineRange}")
class ${moduleName}CoverageTest {

    @Test
    fun \`should execute code path covering ${lineRange}\`() {
        // Arrange: Set up test inputs to reach uncovered lines
        // TODO: Replace with appropriate input
        val testInput: Any? = null

        // Act: Execute the code path
        // TODO: Call the method that covers ${lineRange}

        // Assert: Verify the code was reached and behaves correctly
        assertThat(testInput).isNull() // placeholder
    }

    @Test
    fun \`should handle edge case for ${lineRange}\`() {
        // Arrange: Set up edge case input
        // TODO: Provide edge case input

        // Act & Assert: Verify edge case handling
        assertThat(true).isTrue() // placeholder
    }
}
`;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Generate Kotlin import statements based on analysis
   */
  private generateImports(analysis: CodeAnalysis): string {
    let imports = '';
    imports += `import org.junit.jupiter.api.Test\n`;
    imports += `import org.junit.jupiter.api.DisplayName\n`;
    imports += `import org.junit.jupiter.api.BeforeEach\n`;
    imports += `import org.junit.jupiter.api.assertThrows\n`;
    imports += `import org.assertj.core.api.Assertions.assertThat\n`;

    // Check if mocks are needed (any class with constructor deps)
    const needsMockK = analysis.classes.some(cls =>
      cls.hasConstructor && cls.constructorParams && cls.constructorParams.length > 0
    );
    if (needsMockK) {
      imports += `import io.mockk.*\n`;
      imports += `import io.mockk.impl.annotations.MockK\n`;
      imports += `import io.mockk.impl.annotations.InjectMockKs\n`;
      imports += `import io.mockk.junit5.MockKExtension\n`;
      imports += `import org.junit.jupiter.api.extension.ExtendWith\n`;
    }

    // Check for suspend/coroutine functions
    const hasSuspend = analysis.classes.some(cls =>
      cls.methods.some(m => m.isAsync)
    ) || analysis.functions.some(f => f.isAsync);

    if (hasSuspend) {
      imports += `import kotlinx.coroutines.test.runTest\n`;
    }

    // Check for nullable types (Flow, Deferred, etc.)
    const hasFlow = analysis.classes.some(cls =>
      cls.methods.some(m => m.returnType?.includes('Flow'))
    ) || analysis.functions.some(f => f.returnType?.includes('Flow'));

    if (hasFlow) {
      imports += `import kotlinx.coroutines.flow.toList\n`;
    }

    imports += `\n`;
    return imports;
  }

  /**
   * Generate tests for a class method
   */
  private generateMethodTests(method: FunctionInfo, cls: ClassInfo): string {
    const params = method.parameters.map(p => this.generateKotlinTestValue(p)).join(', ');
    const isVoid = method.returnType === 'Unit' || method.returnType === 'void' || !method.returnType;
    const isSuspend = method.isAsync;
    const isNullableReturn = this.isNullableType(method.returnType);

    let code = '';

    // Happy path test
    code += `    @Test\n`;
    code += `    fun \`${method.name} should execute successfully\`()`;

    if (isSuspend) {
      code += ` = runTest {\n`;
    } else {
      code += ` {\n`;
    }

    // Add MockK stubbing for constructor dependencies
    if (cls.hasConstructor && cls.constructorParams && cls.constructorParams.length > 0) {
      code += this.generateMockKStubbing(method, cls);
    }

    if (isVoid) {
      code += `        subject.${method.name}(${params})\n`;
      code += `        // Unit function - verify no exception thrown\n`;
    } else if (isNullableReturn) {
      code += `        val result = subject.${method.name}(${params})\n`;
      code += `        // Result may be null\n`;
      code += `        assertThat(result).isNotNull()\n`;
    } else {
      code += `        val result = subject.${method.name}(${params})\n`;
      code += `        ${this.generateKotlinAssertion(method.name, method.returnType)}\n`;
    }

    code += `    }\n\n`;

    // Null parameter tests for non-optional, non-nullable params
    const bodyText = method.body || '';
    const hasExplicitThrow = /\bthrow\b/.test(bodyText) || /\bvalidat/i.test(bodyText)
      || /\brequire\b/.test(bodyText) || /\bcheck\b/.test(bodyText);

    for (const param of method.parameters) {
      if (!param.optional && !this.isNullableType(param.type)) {
        code += `    @Test\n`;
        code += `    fun \`${method.name} should handle null ${param.name}\`()`;

        if (isSuspend) {
          code += ` = runTest {\n`;
        } else {
          code += ` {\n`;
        }

        const nullParams = method.parameters
          .map(p => p.name === param.name ? 'null' : this.generateKotlinTestValue(p))
          .join(', ');

        if (hasExplicitThrow) {
          code += `        assertThrows<Exception> {\n`;
          code += `            subject.${method.name}(${nullParams})\n`;
          code += `        }\n`;
        } else {
          code += `        // Method may accept or reject null - both are valid\n`;
          code += `        try {\n`;
          code += `            subject.${method.name}(${nullParams})\n`;
          code += `        } catch (e: Exception) {\n`;
          code += `            assertThat(e).isInstanceOf(Exception::class.java)\n`;
          code += `        }\n`;
        }

        code += `    }\n\n`;
      }
    }

    return code;
  }

  /**
   * Generate MockK every { } returns stubs for dependencies used by a method
   */
  private generateMockKStubbing(method: FunctionInfo, cls: ClassInfo): string {
    let stub = `        // Arrange: configure mocks\n`;
    const isSuspend = method.isAsync;

    for (const dep of cls.constructorParams || []) {
      const depType = dep.type?.toLowerCase() || '';
      if (depType.includes('repository') || depType.includes('dao')) {
        if (method.returnType?.includes('List') || method.returnType?.includes('list')) {
          if (isSuspend) {
            stub += `        coEvery { ${dep.name}.findAll() } returns emptyList()\n`;
          } else {
            stub += `        every { ${dep.name}.findAll() } returns emptyList()\n`;
          }
        } else {
          if (isSuspend) {
            stub += `        coEvery { ${dep.name}.findById(any()) } returns null\n`;
          } else {
            stub += `        every { ${dep.name}.findById(any()) } returns null\n`;
          }
        }
      }
    }

    return stub;
  }

  /**
   * Generate top-level function tests grouped in a test class
   */
  private generateTopLevelFunctionTests(
    moduleName: string,
    functions: FunctionInfo[],
    testType: TestType
  ): string {
    let code = `class ${moduleName}Test {\n\n`;

    for (const fn of functions) {
      code += this.generateFunctionTests(fn, testType);
    }

    code += `}\n`;
    return code;
  }

  /**
   * Generate a Kotlin assertion based on method name and return type
   */
  private generateKotlinAssertion(methodName: string, returnType: string | undefined): string {
    if (!returnType) return 'assertThat(result).isNotNull()';

    const rt = returnType.replace(/\?$/, '').toLowerCase();

    if (/^(is|has|can)[A-Z]/.test(methodName)) {
      return 'assertThat(result).isInstanceOf(Boolean::class.java)';
    }
    if (/^(get|fetch|find)[A-Z]/.test(methodName)) {
      return 'assertThat(result).isNotNull()';
    }
    if (/^(create|build|make)[A-Z]/.test(methodName)) {
      return 'assertThat(result).isNotNull()';
    }

    if (rt.includes('list') || rt.includes('collection') || rt.includes('set')) {
      return 'assertThat(result).isNotNull()';
    }
    if (rt.includes('flow')) return 'assertThat(result).isNotNull()';
    if (rt === 'boolean') return 'assertThat(result).isInstanceOf(Boolean::class.java)';
    if (rt === 'int' || rt === 'long' || rt === 'double' || rt === 'float') {
      return 'assertThat(result).isNotNull()';
    }
    if (rt === 'string') return 'assertThat(result).isNotNull()';

    return 'assertThat(result).isNotNull()';
  }

  /**
   * Generate a Kotlin test value for a parameter
   */
  private generateKotlinTestValue(param: ParameterInfo): string {
    if (param.defaultValue) return param.defaultValue;

    const type = param.type?.replace(/\?$/, '').toLowerCase() || 'unknown';
    const name = param.name.toLowerCase();

    // Infer from param name
    if (name.includes('id')) return `${faker.number.int({ min: 1, max: 1000 })}L`;
    if (name.includes('email')) return `"${faker.internet.email()}"`;
    if (name.includes('name')) return `"${faker.person.fullName()}"`;
    if (name.includes('url')) return `"${faker.internet.url()}"`;

    // Infer from type
    if (type === 'long') return `${faker.number.int({ min: 1, max: 1000 })}L`;
    if (type === 'int') return String(faker.number.int({ min: 1, max: 100 }));
    if (type === 'double') return `${faker.number.float({ min: 0, max: 100 })}`;
    if (type === 'float') return `${faker.number.float({ min: 0, max: 100 })}f`;
    if (type === 'boolean') return 'true';
    if (type === 'string') return `"${faker.lorem.word()}"`;
    if (type.includes('list')) return 'emptyList()';
    if (type.includes('map')) return 'emptyMap()';
    if (type.includes('set')) return 'emptySet()';

    // Nullable types
    if (this.isNullableType(param.type)) return 'null';

    return 'mockk()';
  }

  /**
   * Map a generic type string to a Kotlin type for variable declarations
   */
  private mapToKotlinType(type: string | undefined): string {
    if (!type) return 'Any';

    const stripped = type.replace(/\?$/, '');
    const lower = stripped.toLowerCase();

    if (lower === 'string') return 'String';
    if (lower === 'boolean') return 'Boolean';
    if (lower === 'int' || lower === 'integer') return 'Int';
    if (lower === 'long') return 'Long';
    if (lower === 'double') return 'Double';
    if (lower === 'float') return 'Float';
    if (lower === 'unit' || lower === 'void') return 'Unit';

    // Preserve generic types as-is
    return stripped;
  }

  /**
   * Check if a type is nullable (ends with ?)
   */
  private isNullableType(type: string | undefined): boolean {
    if (!type) return false;
    return type.endsWith('?');
  }

  /**
   * Extract Kotlin package path from an import path
   */
  private extractPackage(importPath: string): string {
    // If it looks like a Kotlin/Java package already, use it
    if (importPath.includes('.') && !importPath.includes('/')) {
      const parts = importPath.split('.');
      // If last part is PascalCase, it's a class name - remove it
      if (parts.length > 1 && /^[A-Z]/.test(parts[parts.length - 1])) {
        return parts.slice(0, -1).join('.');
      }
      return importPath;
    }

    // Convert path-style to package-style
    return importPath
      .replace(/\//g, '.')
      .replace(/\.(kt|kts|java|ts|js)$/, '')
      .replace(/^\.+/, '');
  }

  /**
   * Generate Kotlin-style pattern comment
   */
  private generateKotlinPatternComment(patterns: Pattern[]): string {
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
