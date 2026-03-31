/**
 * Agentic QE v3 - JUnit 5 Test Generator
 * Strategy implementation for Java's JUnit 5 (Jupiter) test framework
 *
 * Generates test code using:
 * - JUnit Jupiter @Test and @DisplayName annotations
 * - AssertJ fluent assertions (assertThat)
 * - Mockito @Mock / @InjectMocks for dependency injection
 * - @ExtendWith(MockitoExtension.class) for mock lifecycle
 * - Spring test annotations when Spring decorators are detected
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
import { detectSpringAnnotations } from '../detectors/spring-detector.js';

/**
 * JUnit5Generator - Test generator for Java's JUnit 5 (Jupiter) framework
 *
 * Generates idiomatic Java test code with JUnit 5 conventions:
 * - @Test @DisplayName("should ...") on test methods
 * - assertThat(result).isEqualTo(expected) (AssertJ)
 * - @Mock for dependencies, @InjectMocks for subject under test
 * - Spring-aware test annotations when Spring decorators are detected
 *
 * @example
 * ```typescript
 * const generator = new JUnit5Generator();
 * const testCode = generator.generateTests({
 *   moduleName: 'UserService',
 *   importPath: 'com.example.service.UserService',
 *   testType: 'unit',
 *   patterns: [],
 *   analysis: { functions: [...], classes: [...] }
 * });
 * ```
 */
export class JUnit5Generator extends BaseTestGenerator {
  readonly framework: TestFramework = 'junit5';

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
   * Generate complete JUnit 5 test file from analysis
   */
  generateTests(context: TestGenerationContext): string {
    const { moduleName, importPath, testType, patterns, analysis } = context;

    if (!analysis || (analysis.functions.length === 0 && analysis.classes.length === 0)) {
      return this.generateStubTests(context);
    }

    const packagePath = this.extractPackage(importPath);
    const patternComment = this.generateJavaPatternComment(patterns);

    let code = `${patternComment}package ${packagePath};\n\n`;
    code += this.generateImports(analysis);

    // Generate tests for exported classes
    const exportedClasses = analysis.classes.filter(cls => cls.isExported);
    for (const cls of exportedClasses) {
      code += this.generateClassTests(cls, testType);
    }

    // Generate tests for exported standalone functions (static methods in Java)
    const exportedFns = analysis.functions.filter(fn => fn.isExported);
    if (exportedFns.length > 0) {
      code += this.generateStaticFunctionTests(moduleName, exportedFns, testType);
    }

    return code;
  }

  /**
   * Generate tests for a standalone function (treated as static method in Java)
   */
  generateFunctionTests(fn: FunctionInfo, _testType: TestType): string {
    const params = fn.parameters.map(p => this.generateJavaTestValue(p)).join(', ');
    const isVoid = fn.returnType === 'void';
    const isAsync = fn.isAsync || fn.returnType?.includes('CompletableFuture');
    const asyncSuffix = isAsync ? '.join()' : '';

    let code = '';
    code += `    @Test\n`;
    code += `    @DisplayName("${fn.name} should handle valid input correctly")\n`;
    code += `    void ${fn.name}_shouldHandleValidInput() {\n`;

    if (isVoid) {
      code += `        ${fn.name}(${params});\n`;
      code += `        // void method - verify no exception thrown\n`;
    } else {
      const javaType = this.mapToJavaType(fn.returnType);
      code += `        ${javaType} result = ${fn.name}(${params})${asyncSuffix};\n`;
      code += `        ${this.generateJavaAssertion(fn.name, fn.returnType)}\n`;
    }

    code += `    }\n\n`;

    // Parameter edge cases
    for (const param of fn.parameters) {
      if (!param.optional) {
        code += `    @Test\n`;
        code += `    @DisplayName("${fn.name} should handle null ${param.name}")\n`;
        code += `    void ${fn.name}_shouldHandleNull${this.pascalCase(param.name)}() {\n`;
        const nullParams = fn.parameters
          .map(p => p.name === param.name ? 'null' : this.generateJavaTestValue(p))
          .join(', ');

        const bodyText = fn.body || '';
        const hasExplicitThrow = /\bthrow\b/.test(bodyText) || /\bvalidat/i.test(bodyText);

        if (hasExplicitThrow) {
          code += `        assertThatThrownBy(() -> ${fn.name}(${nullParams}))\n`;
          code += `            .isInstanceOf(Exception.class);\n`;
        } else {
          code += `        // Function may accept or reject null - both are valid\n`;
          code += `        try {\n`;
          code += `            ${fn.name}(${nullParams});\n`;
          code += `        } catch (Exception e) {\n`;
          code += `            assertThat(e).isInstanceOf(Exception.class);\n`;
          code += `        }\n`;
        }
        code += `    }\n\n`;
      }
    }

    return code;
  }

  /**
   * Generate tests for a class
   */
  generateClassTests(cls: ClassInfo, testType: TestType): string {
    // Detect Spring annotations from decorators
    const decorators: string[] = (cls as ClassInfoWithDecorators).decorators || [];
    const springAnnotation = detectSpringAnnotations(decorators);
    const testAnnotation = springAnnotation?.testAnnotation || '@ExtendWith(MockitoExtension.class)';

    let code = `${testAnnotation}\n`;
    code += `class ${cls.name}Test {\n\n`;

    // Generate @Mock fields for constructor dependencies
    if (cls.hasConstructor && cls.constructorParams && cls.constructorParams.length > 0) {
      for (const param of cls.constructorParams) {
        const javaType = this.mapToJavaType(param.type);
        code += `    @Mock\n`;
        code += `    private ${javaType} ${param.name};\n\n`;
      }

      code += `    @InjectMocks\n`;
      code += `    private ${cls.name} subject;\n\n`;
    } else {
      code += `    private ${cls.name} subject;\n\n`;
      code += `    @BeforeEach\n`;
      code += `    void setUp() {\n`;
      code += `        subject = new ${cls.name}();\n`;
      code += `    }\n\n`;
    }

    // Constructor / instantiation test
    code += `    @Test\n`;
    code += `    @DisplayName("should instantiate correctly")\n`;
    code += `    void shouldInstantiateCorrectly() {\n`;
    code += `        assertThat(subject).isNotNull();\n`;
    code += `    }\n\n`;

    // Generate tests for each public method
    for (const method of cls.methods) {
      if (!method.name.startsWith('_') && !method.name.startsWith('#') && method.name !== '<init>' && method.name !== 'constructor') {
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
    const patternComment = this.generateJavaPatternComment(patterns);

    return `${patternComment}package ${packagePath};

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.BeforeEach;
import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("${moduleName} ${testType} tests")
class ${moduleName}Test {

    @Test
    @DisplayName("should be defined")
    void shouldBeDefined() {
        // Verify the class can be referenced
        assertThat(${moduleName}.class).isNotNull();
    }

    @Test
    @DisplayName("should handle basic operations")
    void shouldHandleBasicOperations() {
        // TODO: Implement when AST analysis is available
        assertThat(true).isTrue();
    }

    @Test
    @DisplayName("should handle edge cases")
    void shouldHandleEdgeCases() {
        // TODO: Test boundary conditions
        assertThat(true).isTrue();
    }

    @Test
    @DisplayName("should handle error conditions")
    void shouldHandleErrorConditions() {
        // TODO: Test error handling
        assertThat(true).isTrue();
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
package ${packagePath};

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("${moduleName} coverage - ${lineRange}")
class ${moduleName}CoverageTest {

    @Test
    @DisplayName("should execute code path covering ${lineRange}")
    void shouldCoverLines_${lines[0]}_to_${lines[lines.length - 1]}() {
        // Arrange: Set up test inputs to reach uncovered lines
        // TODO: Replace with appropriate input
        Object testInput = null;

        // Act: Execute the code path
        // TODO: Call the method that covers ${lineRange}

        // Assert: Verify the code was reached and behaves correctly
        assertThat(testInput).isNull(); // placeholder
    }

    @Test
    @DisplayName("should handle edge case for ${lineRange}")
    void shouldHandleEdgeCase_${lines[0]}_to_${lines[lines.length - 1]}() {
        // Arrange: Set up edge case input
        // TODO: Provide edge case input

        // Act & Assert: Verify edge case handling
        assertThat(true).isTrue(); // placeholder
    }
}
`;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Generate JUnit 5 import statements based on analysis
   */
  private generateImports(analysis: CodeAnalysis): string {
    let imports = '';
    imports += `import org.junit.jupiter.api.Test;\n`;
    imports += `import org.junit.jupiter.api.DisplayName;\n`;
    imports += `import org.junit.jupiter.api.BeforeEach;\n`;
    imports += `import static org.assertj.core.api.Assertions.assertThat;\n`;
    imports += `import static org.assertj.core.api.Assertions.assertThatThrownBy;\n`;

    // Check if mocks are needed (any class with constructor deps)
    const needsMockito = analysis.classes.some(cls => cls.hasConstructor && cls.constructorParams && cls.constructorParams.length > 0);
    if (needsMockito) {
      imports += `import org.mockito.Mock;\n`;
      imports += `import org.mockito.InjectMocks;\n`;
      imports += `import org.mockito.junit.jupiter.MockitoExtension;\n`;
      imports += `import org.junit.jupiter.api.extension.ExtendWith;\n`;
    }

    // Check for async return types
    const hasAsync = analysis.classes.some(cls =>
      cls.methods.some(m => m.returnType?.includes('CompletableFuture'))
    ) || analysis.functions.some(f => f.returnType?.includes('CompletableFuture'));

    if (hasAsync) {
      imports += `import java.util.concurrent.CompletableFuture;\n`;
    }

    // Check for Optional
    const hasOptional = analysis.classes.some(cls =>
      cls.methods.some(m => m.returnType?.includes('Optional'))
    ) || analysis.functions.some(f => f.returnType?.includes('Optional'));

    if (hasOptional) {
      imports += `import java.util.Optional;\n`;
    }

    // Check for List
    const hasList = analysis.classes.some(cls =>
      cls.methods.some(m => m.returnType?.includes('List'))
    ) || analysis.functions.some(f => f.returnType?.includes('List'));

    if (hasList) {
      imports += `import java.util.List;\n`;
    }

    // Check for Mockito stubbing usage
    const hasStubbing = analysis.classes.some(cls =>
      cls.hasConstructor && cls.constructorParams && cls.constructorParams.length > 0
    );
    if (hasStubbing) {
      imports += `import static org.mockito.Mockito.when;\n`;
      imports += `import static org.mockito.Mockito.verify;\n`;
      imports += `import static org.mockito.ArgumentMatchers.any;\n`;
    }

    imports += `\n`;
    return imports;
  }

  /**
   * Generate tests for a class method
   */
  private generateMethodTests(method: FunctionInfo, cls: ClassInfo): string {
    const params = method.parameters.map(p => this.generateJavaTestValue(p)).join(', ');
    const isVoid = method.returnType === 'void';
    const isAsync = method.returnType?.includes('CompletableFuture');
    const isOptional = method.returnType?.includes('Optional');

    let code = '';

    // Happy path test
    code += `    @Test\n`;
    code += `    @DisplayName("${method.name} should execute successfully")\n`;
    code += `    void ${method.name}_shouldExecuteSuccessfully() {\n`;

    // Add Mockito stubbing for constructor dependencies
    if (cls.hasConstructor && cls.constructorParams && cls.constructorParams.length > 0) {
      code += this.generateMockitoStubbing(method, cls);
    }

    if (isVoid) {
      code += `        subject.${method.name}(${params});\n`;
      code += `        // void method - verify no exception thrown\n`;
    } else if (isAsync) {
      const innerType = this.extractGenericType(method.returnType || 'Object');
      code += `        CompletableFuture<${innerType}> result = subject.${method.name}(${params});\n`;
      code += `        assertThat(result).isNotNull();\n`;
      code += `        assertThat(result.join()).isNotNull();\n`;
    } else if (isOptional) {
      code += `        Optional<?> result = subject.${method.name}(${params});\n`;
      code += `        assertThat(result).isNotNull();\n`;
    } else {
      const javaType = this.mapToJavaType(method.returnType);
      code += `        ${javaType} result = subject.${method.name}(${params});\n`;
      code += `        ${this.generateJavaAssertion(method.name, method.returnType)}\n`;
    }

    code += `    }\n\n`;

    // Null parameter tests for non-optional params
    const bodyText = method.body || '';
    const hasExplicitThrow = /\bthrow\b/.test(bodyText) || /\bvalidat/i.test(bodyText);

    for (const param of method.parameters) {
      if (!param.optional) {
        code += `    @Test\n`;
        code += `    @DisplayName("${method.name} should handle null ${param.name}")\n`;
        code += `    void ${method.name}_shouldHandleNull${this.pascalCase(param.name)}() {\n`;

        const nullParams = method.parameters
          .map(p => p.name === param.name ? 'null' : this.generateJavaTestValue(p))
          .join(', ');

        if (hasExplicitThrow) {
          code += `        assertThatThrownBy(() -> subject.${method.name}(${nullParams}))\n`;
          code += `            .isInstanceOf(Exception.class);\n`;
        } else {
          code += `        // Method may accept or reject null - both are valid\n`;
          code += `        try {\n`;
          code += `            subject.${method.name}(${nullParams});\n`;
          code += `        } catch (Exception e) {\n`;
          code += `            assertThat(e).isInstanceOf(Exception.class);\n`;
          code += `        }\n`;
        }

        code += `    }\n\n`;
      }
    }

    return code;
  }

  /**
   * Generate Mockito when/thenReturn stubs for dependencies used by a method
   */
  private generateMockitoStubbing(method: FunctionInfo, cls: ClassInfo): string {
    let stub = `        // Arrange: configure mocks\n`;

    // For each constructor dependency, generate a plausible stub if the method
    // likely calls it. We use a heuristic: if a param type matches a known
    // repository/service pattern, stub its common methods.
    for (const dep of cls.constructorParams || []) {
      const depType = dep.type?.toLowerCase() || '';
      if (depType.includes('repository') || depType.includes('dao')) {
        // Repository pattern - stub findById / findAll
        if (method.returnType?.includes('Optional')) {
          stub += `        when(${dep.name}.findById(any())).thenReturn(Optional.empty());\n`;
        } else if (method.returnType?.includes('List')) {
          stub += `        when(${dep.name}.findAll()).thenReturn(List.of());\n`;
        }
      }
    }

    return stub;
  }

  /**
   * Generate static function tests grouped in a utility test class
   */
  private generateStaticFunctionTests(
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
   * Generate a Java assertion based on method name and return type
   */
  private generateJavaAssertion(methodName: string, returnType: string | undefined): string {
    if (!returnType) return 'assertThat(result).isNotNull();';

    const rt = returnType.toLowerCase();

    if (/^(is|has|can)[A-Z]/.test(methodName)) {
      return 'assertThat(result).isInstanceOf(Boolean.class);';
    }
    if (/^(get|fetch|find)[A-Z]/.test(methodName)) {
      return 'assertThat(result).isNotNull();';
    }
    if (/^(create|build|make)[A-Z]/.test(methodName)) {
      return 'assertThat(result).isNotNull();';
    }

    if (rt.includes('optional')) return 'assertThat(result).isNotNull();';
    if (rt.includes('list') || rt.includes('[]')) return 'assertThat(result).isNotNull();';
    if (rt.includes('completablefuture')) return 'assertThat(result).isNotNull();';
    if (rt === 'boolean') return 'assertThat(result).isInstanceOf(Boolean.class);';
    if (rt === 'int' || rt === 'integer' || rt === 'long') return 'assertThat(result).isNotNull();';
    if (rt === 'string') return 'assertThat(result).isNotNull();';

    return 'assertThat(result).isNotNull();';
  }

  /**
   * Generate a Java test value for a parameter
   */
  private generateJavaTestValue(param: ParameterInfo): string {
    if (param.defaultValue) return param.defaultValue;

    const type = param.type?.toLowerCase() || 'unknown';
    const name = param.name.toLowerCase();

    // Infer from param name
    if (name.includes('id')) return `${testValues.int(1, 1000)}L`;
    if (name.includes('email')) return `"${testValues.email()}"`;
    if (name.includes('name')) return `"${testValues.fullName()}"`;
    if (name.includes('url')) return `"${testValues.url()}"`;

    // Infer from type
    if (type === 'long' || type === 'Long') return `${testValues.int(1, 1000)}L`;
    if (type === 'int' || type === 'integer' || type === 'Integer') return String(testValues.int(1, 100));
    if (type === 'double' || type === 'Double' || type === 'float' || type === 'Float') return `${testValues.float(0, 100)}`;
    if (type === 'boolean' || type === 'Boolean') return 'true';
    if (type.includes('string')) return `"${testValues.word()}"`;
    if (type.includes('list')) return 'List.of()';
    if (type.includes('map')) return 'Map.of()';
    if (type.includes('set')) return 'Set.of()';
    if (type.includes('optional')) return 'Optional.empty()';

    return 'null';
  }

  /**
   * Map a TypeScript/generic type to a Java type for variable declarations
   */
  private mapToJavaType(type: string | undefined): string {
    if (!type) return 'Object';

    if (type.includes('Optional')) return 'Optional<?>';
    if (type.includes('CompletableFuture')) return `CompletableFuture<${this.extractGenericType(type)}>`;
    if (type.includes('List')) return 'List<?>';
    if (type.includes('Map')) return 'Map<?, ?>';
    if (type.includes('Set')) return 'Set<?>';

    const lower = type.toLowerCase();
    if (lower === 'string') return 'String';
    if (lower === 'boolean') return 'boolean';
    if (lower === 'int' || lower === 'integer') return 'int';
    if (lower === 'long') return 'long';
    if (lower === 'double') return 'double';
    if (lower === 'float') return 'float';
    if (lower === 'void') return 'void';

    return type;
  }

  /**
   * Extract the generic type parameter from a type like Optional<User>
   */
  private extractGenericType(type: string): string {
    const match = type.match(/<(.+)>/);
    return match ? match[1] : 'Object';
  }

  /**
   * Extract Java package path from an import path
   */
  private extractPackage(importPath: string): string {
    // If it looks like a Java package already, use it
    if (importPath.includes('.') && !importPath.includes('/')) {
      // Remove the class name to get the package
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
      .replace(/\.(java|ts|js)$/, '')
      .replace(/^\.+/, '');
  }

  /**
   * Generate Java-style pattern comment
   */
  private generateJavaPatternComment(patterns: Pattern[]): string {
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
