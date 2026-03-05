/**
 * Agentic QE v3 - Go Test Generator
 * Strategy implementation for Go's testing package
 *
 * Generates test code using:
 * - Table-driven tests (idiomatic Go)
 * - testing.T and testing.B
 * - github.com/stretchr/testify/assert
 * - Mock structs implementing interfaces
 * - context.Context as first parameter
 * - (value, error) return pattern
 * - t.Helper() for test helpers
 * - _test.go file naming convention
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
 * GoTestGenerator - Test generator for Go's testing package
 *
 * Generates idiomatic Go test code with:
 * - Table-driven tests using anonymous struct slices
 * - testify/assert for assertions
 * - Mock structs for interface dependencies
 * - Proper (value, error) return handling
 * - context.Context propagation
 *
 * @example
 * ```typescript
 * const generator = new GoTestGenerator();
 * const testCode = generator.generateTests({
 *   moduleName: 'user_service',
 *   importPath: 'github.com/myorg/myapp/services',
 *   testType: 'unit',
 *   patterns: [],
 *   analysis: { functions: [...], classes: [...] }
 * });
 * ```
 */
export class GoTestGenerator extends BaseTestGenerator {
  readonly framework: TestFramework = 'go-test';

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
        hasConstructor: c.methods.some(m => m.name === 'New' || m.name === 'Init'),
        constructorParams: c.methods.find(m => m.name === 'New' || m.name === 'Init')?.parameters.map(p => ({
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
    const { moduleName, importPath, testType, patterns, analysis, dependencies } = context;

    if (!analysis || (analysis.functions.length === 0 && analysis.classes.length === 0)) {
      return this.generateStubTests(context);
    }

    const patternComment = this.generateGoPatternComment(patterns);
    const packageName = this.extractPackageName(moduleName);

    // Collect imports needed
    const imports: string[] = ['"testing"'];
    const needsAssert = analysis.functions.length > 0 || analysis.classes.some(c => c.methods.length > 0);
    if (needsAssert) {
      imports.push('"github.com/stretchr/testify/assert"');
    }

    // Check if any function uses context.Context
    const needsContext = this.analysisNeedsContext(analysis);
    if (needsContext) {
      imports.push('"context"');
    }

    // Add the module import if importPath is provided and non-empty
    if (importPath && importPath !== moduleName) {
      imports.push(`"${importPath}"`);
    }

    // KG: Add mock imports for external dependencies
    const externalDeps = dependencies?.imports.filter(dep => !dep.startsWith('.')) || [];
    for (const dep of externalDeps.slice(0, 5)) {
      imports.push(`"${dep}"`);
    }

    let code = `${patternComment}package ${packageName}_test

import (
${imports.map(i => `\t${i}`).join('\n')}
)

`;

    // Generate tests for exported functions
    const exportedFns = analysis.functions.filter(fn => fn.isExported);
    for (const fn of exportedFns) {
      code += this.generateFunctionTests(fn, testType);
      code += '\n';
    }

    // Generate tests for exported structs/classes
    const exportedClasses = analysis.classes.filter(cls => cls.isExported);
    for (const cls of exportedClasses) {
      code += this.generateClassTests(cls, testType);
      code += '\n';
    }

    return code;
  }

  /**
   * Generate table-driven tests for a standalone function
   */
  generateFunctionTests(fn: FunctionInfo, _testType: TestType): string {
    const hasError = this.returnIncludesError(fn.returnType);
    const hasContext = this.paramHasContext(fn.parameters);
    const testName = `Test${this.pascalCase(fn.name)}`;

    // Build table-driven test struct fields
    const structFields = this.buildStructFields(fn, hasError);
    const testCases = this.buildTestCases(fn, hasError);
    const functionCall = this.buildFunctionCall(fn, hasContext);
    const assertions = this.buildAssertions(fn, hasError);

    let code = `func ${testName}(t *testing.T) {\n`;
    code += `\ttests := []struct {\n`;
    code += `\t\tname string\n`;
    code += structFields;
    code += `\t}{\n`;
    code += testCases;
    code += `\t}\n`;
    code += `\tfor _, tt := range tests {\n`;
    code += `\t\tt.Run(tt.name, func(t *testing.T) {\n`;
    code += functionCall;
    code += assertions;
    code += `\t\t})\n`;
    code += `\t}\n`;
    code += `}\n`;

    return code;
  }

  /**
   * Generate tests for a struct (class) and its methods
   */
  generateClassTests(cls: ClassInfo, _testType: TestType): string {
    let code = '';

    // Generate a constructor/instantiation test if applicable
    const constructorArgs = cls.constructorParams?.map(p => this.generateGoTestValue(p)).join(', ') || '';
    code += `func TestNew${cls.name}(t *testing.T) {\n`;
    if (cls.hasConstructor) {
      code += `\tsvc := New${cls.name}(${constructorArgs})\n`;
    } else {
      code += `\tsvc := &${cls.name}{}\n`;
    }
    code += `\tassert.NotNil(t, svc)\n`;
    code += `}\n\n`;

    // Generate table-driven tests for each public method
    for (const method of cls.methods) {
      // In Go, exported methods start with uppercase
      if (method.name.startsWith('_') || /^[a-z]/.test(method.name)) {
        continue;
      }

      const hasError = this.returnIncludesError(method.returnType);
      const hasContext = this.paramHasContext(method.parameters);
      const testName = `Test${cls.name}_${method.name}`;

      const structFields = this.buildStructFields(method, hasError);
      const testCases = this.buildTestCases(method, hasError);

      code += `func ${testName}(t *testing.T) {\n`;

      // Setup the struct instance
      if (cls.hasConstructor) {
        code += `\tsvc := New${cls.name}(${constructorArgs})\n\n`;
      } else {
        code += `\tsvc := &${cls.name}{}\n\n`;
      }

      code += `\ttests := []struct {\n`;
      code += `\t\tname string\n`;
      code += structFields;
      code += `\t}{\n`;
      code += testCases;
      code += `\t}\n`;
      code += `\tfor _, tt := range tests {\n`;
      code += `\t\tt.Run(tt.name, func(t *testing.T) {\n`;

      // Build method call
      const callArgs = this.buildCallArgs(method.parameters, hasContext);
      if (hasError) {
        code += `\t\t\tgot, err := svc.${method.name}(${callArgs})\n`;
        code += `\t\t\tif tt.wantErr {\n`;
        code += `\t\t\t\tassert.Error(t, err)\n`;
        code += `\t\t\t\treturn\n`;
        code += `\t\t\t}\n`;
        code += `\t\t\tassert.NoError(t, err)\n`;
        code += `\t\t\tassert.Equal(t, tt.want, got)\n`;
      } else {
        code += `\t\t\tgot := svc.${method.name}(${callArgs})\n`;
        code += `\t\t\tassert.Equal(t, tt.want, got)\n`;
      }

      code += `\t\t})\n`;
      code += `\t}\n`;
      code += `}\n\n`;
    }

    return code;
  }

  /**
   * Generate stub tests when no AST analysis is available
   */
  generateStubTests(context: TestGenerationContext): string {
    const { moduleName, importPath, testType, patterns, dependencies, similarCode } = context;
    const patternComment = this.generateGoPatternComment(patterns);
    const packageName = this.extractPackageName(moduleName);

    // KG: Generate similarity-informed test hints
    let similarityComment = '';
    if (similarCode && similarCode.snippets.length > 0) {
      similarityComment = `// KG: Similar modules found - consider testing shared patterns:\n`;
      for (const s of similarCode.snippets.slice(0, 3)) {
        similarityComment += `//   - ${s.file} (${(s.score * 100).toFixed(0)}% similar)\n`;
      }
      similarityComment += `\n`;
    }

    // KG: dependency test hints
    let depComment = '';
    if (dependencies && dependencies.imports.length > 0) {
      depComment += `// KG: Module depends on: ${dependencies.imports.slice(0, 5).join(', ')}\n`;
    }
    if (dependencies && dependencies.importedBy.length > 0) {
      depComment += `// KG: Used by ${dependencies.importedBy.length} consumers\n`;
    }

    return `${patternComment}package ${packageName}_test

import (
\t"testing"

\t"github.com/stretchr/testify/assert"
${importPath ? `\t"${importPath}"` : ''}
)

${similarityComment}${depComment}
func TestModule_IsDefined(t *testing.T) {
\t// ${testType} test: Verify the module is properly accessible
\tassert.NotNil(t, ${moduleName})
}

func TestModule_BasicOperations(t *testing.T) {
\t// ${testType} test: Verify core functionality
\t// TODO: Add specific test cases based on module API
\tassert.True(t, true, "placeholder - replace with real assertions")
}

func TestModule_ErrorHandling(t *testing.T) {
\t// ${testType} test: Verify error conditions are handled
\t// TODO: Add error case testing
\tassert.True(t, true, "placeholder - replace with real assertions")
}
`;
  }

  /**
   * Generate coverage-focused tests for specific lines
   */
  generateCoverageTests(
    moduleName: string,
    importPath: string,
    lines: number[],
  ): string {
    const funcName = this.pascalCase(moduleName);
    const lineRange = this.formatLineRange(lines);
    const packageName = this.extractPackageName(moduleName);

    return `package ${packageName}_test

import (
\t"testing"

\t"github.com/stretchr/testify/assert"
${importPath ? `\t"${importPath}"` : ''}
)

// Coverage test for ${lineRange} in ${moduleName}
func Test${funcName}_Cover_${lines[0]}_${lines[lines.length - 1]}(t *testing.T) {
\t// Arrange: Set up test inputs to reach uncovered lines (${lineRange})
\t// TODO: Replace with appropriate input values

\t// Act: Execute the code path
\tresult, err := ${funcName}(/* TODO: add args */)

\t// Assert: Verify expected behavior
\tassert.NoError(t, err)
\tassert.NotNil(t, result)
}
`;
  }

  // ============================================================================
  // Go-Specific Helpers
  // ============================================================================

  /**
   * Generate Go pattern comment
   */
  private generateGoPatternComment(patterns: Pattern[]): string {
    if (patterns.length === 0) return '';
    return `// Applied patterns: ${patterns.map(p => p.name).join(', ')}\n`;
  }

  /**
   * Extract package name from module name (last segment, lowercase)
   */
  private extractPackageName(moduleName: string): string {
    const parts = moduleName.split('/');
    const last = parts[parts.length - 1];
    // Convert camelCase/PascalCase to snake_case-style lowercase
    return last.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9_]/g, '');
  }

  /**
   * Check if any function/method in the analysis uses context.Context
   */
  private analysisNeedsContext(analysis: CodeAnalysis): boolean {
    const allFns = [
      ...analysis.functions,
      ...analysis.classes.flatMap(c => c.methods),
    ];
    return allFns.some(fn => this.paramHasContext(fn.parameters));
  }

  /**
   * Check if a parameter list includes context.Context
   */
  private paramHasContext(params: ParameterInfo[]): boolean {
    return params.some(p =>
      p.type?.includes('context.Context') || p.type?.includes('Context') || p.name === 'ctx',
    );
  }

  /**
   * Check if return type includes error
   */
  private returnIncludesError(returnType: string | undefined): boolean {
    if (!returnType) return false;
    const rt = returnType.toLowerCase();
    return rt.includes('error') || rt.includes(', error') || rt.includes(',error');
  }

  /**
   * Build struct fields for table-driven test
   */
  private buildStructFields(fn: FunctionInfo, hasError: boolean): string {
    let fields = '';
    // Add fields for each non-context parameter
    for (const param of fn.parameters) {
      if (this.isContextParam(param)) continue;
      const goType = this.mapToGoType(param.type);
      fields += `\t\t${param.name} ${goType}\n`;
    }
    // Add want and wantErr fields
    if (fn.returnType && fn.returnType !== 'void') {
      const returnGoType = this.mapReturnToGoType(fn.returnType, hasError);
      fields += `\t\twant ${returnGoType}\n`;
    }
    if (hasError) {
      fields += `\t\twantErr bool\n`;
    }
    return fields;
  }

  /**
   * Build test case entries for table-driven test
   */
  private buildTestCases(fn: FunctionInfo, hasError: boolean): string {
    const nonCtxParams = fn.parameters.filter(p => !this.isContextParam(p));
    let cases = '';

    // Happy path case
    const happyArgs = nonCtxParams.map(p => `${p.name}: ${this.generateGoTestValue(p)}`).join(', ');
    const happyWant = this.generateGoWantValue(fn.returnType, hasError);
    cases += `\t\t{name: "valid input", ${happyArgs}${happyWant}},\n`;

    // Edge case: zero/empty values
    if (nonCtxParams.length > 0) {
      const edgeArgs = nonCtxParams.map(p => `${p.name}: ${this.generateGoZeroValue(p)}`).join(', ');
      if (hasError) {
        cases += `\t\t{name: "zero values", ${edgeArgs}, wantErr: true},\n`;
      } else {
        const zeroWant = this.generateGoWantValue(fn.returnType, false);
        cases += `\t\t{name: "zero values", ${edgeArgs}${zeroWant}},\n`;
      }
    }

    // Error case with invalid input
    if (hasError && nonCtxParams.length > 0) {
      const invalidArgs = nonCtxParams.map(p => `${p.name}: ${this.generateGoInvalidValue(p)}`).join(', ');
      cases += `\t\t{name: "invalid input", ${invalidArgs}, wantErr: true},\n`;
    }

    return cases;
  }

  /**
   * Build function call for table-driven test body
   */
  private buildFunctionCall(fn: FunctionInfo, hasContext: boolean): string {
    const hasError = this.returnIncludesError(fn.returnType);
    const callArgs = this.buildCallArgs(fn.parameters, hasContext);

    let code = '';
    if (hasError) {
      code += `\t\t\tgot, err := ${fn.name}(${callArgs})\n`;
      code += `\t\t\tif tt.wantErr {\n`;
      code += `\t\t\t\tassert.Error(t, err)\n`;
      code += `\t\t\t\treturn\n`;
      code += `\t\t\t}\n`;
      code += `\t\t\tassert.NoError(t, err)\n`;
    } else if (fn.returnType && fn.returnType !== 'void') {
      code += `\t\t\tgot := ${fn.name}(${callArgs})\n`;
    } else {
      code += `\t\t\t${fn.name}(${callArgs})\n`;
    }

    return code;
  }

  /**
   * Build assertions for table-driven test body
   */
  private buildAssertions(fn: FunctionInfo, hasError: boolean): string {
    if (!fn.returnType || fn.returnType === 'void') {
      return `\t\t\t// void function - no return value to assert\n`;
    }

    let code = '';
    if (!hasError) {
      code += `\t\t\tassert.Equal(t, tt.want, got)\n`;
    } else {
      // Error assertions are already in buildFunctionCall
      code += `\t\t\tassert.Equal(t, tt.want, got)\n`;
    }

    return code;
  }

  /**
   * Build the argument list for a function call inside a table-driven test
   */
  private buildCallArgs(params: ParameterInfo[], hasContext: boolean): string {
    const args: string[] = [];
    for (const param of params) {
      if (this.isContextParam(param)) {
        args.push('context.Background()');
      } else {
        args.push(`tt.${param.name}`);
      }
    }
    // If the function expects context but it was not in the param list explicitly
    if (hasContext && args.length === 0) {
      args.unshift('context.Background()');
    }
    return args.join(', ');
  }

  /**
   * Check if a parameter is a context.Context parameter
   */
  private isContextParam(param: ParameterInfo): boolean {
    return param.name === 'ctx' ||
      param.type?.includes('context.Context') === true ||
      param.type?.includes('Context') === true;
  }

  /**
   * Generate a Go test value for a parameter
   */
  private generateGoTestValue(param: ParameterInfo): string {
    if (param.defaultValue) {
      return param.defaultValue;
    }

    const type = param.type?.toLowerCase() || 'unknown';
    const name = param.name.toLowerCase();

    // Infer from param name
    if (name.includes('id') && !name.includes('valid')) {
      if (type.includes('int')) return String(faker.number.int({ min: 1, max: 1000 }));
      return `"${faker.string.uuid()}"`;
    }
    if (name.includes('name')) return `"${faker.person.fullName()}"`;
    if (name.includes('email')) return `"${faker.internet.email()}"`;
    if (name.includes('url')) return `"${faker.internet.url()}"`;

    // Infer from type
    if (type.includes('string') || type === 'str') return `"${faker.lorem.word()}"`;
    if (type.includes('int64')) return `int64(${faker.number.int({ min: 1, max: 100 })})`;
    if (type.includes('int32')) return `int32(${faker.number.int({ min: 1, max: 100 })})`;
    if (type.includes('int')) return String(faker.number.int({ min: 1, max: 100 }));
    if (type.includes('float64')) return `${faker.number.float({ min: 1, max: 100, fractionDigits: 2 })}`;
    if (type.includes('float32')) return `float32(${faker.number.float({ min: 1, max: 100, fractionDigits: 2 })})`;
    if (type.includes('bool')) return 'true';
    if (type.includes('[]byte')) return '[]byte("test data")';
    if (type.includes('[]')) return 'nil';
    if (type.includes('map')) return 'nil';
    if (type.includes('*')) return 'nil';
    if (type.includes('error')) return 'nil';

    return `nil /* TODO: provide ${param.name}: ${param.type || 'unknown'} */`;
  }

  /**
   * Generate a Go zero value for boundary testing
   */
  private generateGoZeroValue(param: ParameterInfo): string {
    const type = param.type?.toLowerCase() || 'unknown';
    if (type.includes('string') || type === 'str') return '""';
    if (type.includes('int')) return '0';
    if (type.includes('float')) return '0.0';
    if (type.includes('bool')) return 'false';
    if (type.includes('[]') || type.includes('map') || type.includes('*')) return 'nil';
    return 'nil';
  }

  /**
   * Generate a Go invalid value for error testing
   */
  private generateGoInvalidValue(param: ParameterInfo): string {
    const type = param.type?.toLowerCase() || 'unknown';
    const name = param.name.toLowerCase();

    if (name.includes('id') && type.includes('int')) return '-1';
    if (type.includes('string') || type === 'str') return '""';
    if (type.includes('int')) return '-1';
    if (type.includes('float')) return '-1.0';
    if (type.includes('*')) return 'nil';
    return 'nil';
  }

  /**
   * Generate the want value for table-driven test cases
   */
  private generateGoWantValue(returnType: string | undefined, hasError: boolean): string {
    if (!returnType || returnType === 'void') return '';

    // Strip error from multi-return
    let cleanType = returnType;
    if (hasError) {
      cleanType = returnType.replace(/,?\s*error/i, '').trim();
      if (cleanType.startsWith('(') && cleanType.endsWith(')')) {
        cleanType = cleanType.slice(1, -1).trim();
      }
    }

    const rt = cleanType.toLowerCase();
    let value: string;
    if (rt.includes('string') || rt === 'str') value = '"expected"';
    else if (rt.includes('int')) value = '0';
    else if (rt.includes('float')) value = '0.0';
    else if (rt.includes('bool')) value = 'true';
    else if (rt.includes('*') || rt.includes('[]') || rt.includes('map')) value = 'nil';
    else value = 'nil';

    if (hasError) {
      return `, want: ${value}, wantErr: false`;
    }
    return `, want: ${value}`;
  }

  /**
   * Map a type string to an idiomatic Go type for struct fields
   */
  private mapToGoType(type: string | undefined): string {
    if (!type) return 'interface{}';
    const t = type.toLowerCase();
    if (t.includes('context.context') || t.includes('context')) return 'context.Context';
    if (t === 'string' || t === 'str') return 'string';
    if (t === 'int64') return 'int64';
    if (t === 'int32') return 'int32';
    if (t.includes('int')) return 'int';
    if (t === 'float64') return 'float64';
    if (t === 'float32') return 'float32';
    if (t.includes('float')) return 'float64';
    if (t === 'bool' || t === 'boolean') return 'bool';
    if (t.includes('[]byte')) return '[]byte';
    if (t.includes('[]')) return type; // preserve original slice type
    if (t.includes('map')) return type;
    if (t.includes('error')) return 'error';
    if (t.includes('*')) return type;
    return type;
  }

  /**
   * Map return type to Go type, stripping error component
   */
  private mapReturnToGoType(returnType: string, hasError: boolean): string {
    let cleanType = returnType;
    if (hasError) {
      cleanType = returnType.replace(/,?\s*error/i, '').trim();
      if (cleanType.startsWith('(') && cleanType.endsWith(')')) {
        cleanType = cleanType.slice(1, -1).trim();
      }
    }
    return this.mapToGoType(cleanType) || 'interface{}';
  }
}
