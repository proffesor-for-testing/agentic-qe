/**
 * Agentic QE v3 - Rust Test Generator
 * Strategy implementation for Rust's built-in test framework (`#[test]`)
 *
 * Generates idiomatic Rust test code using:
 * - `#[cfg(test)] mod tests { use super::*; ... }` inline module
 * - `#[test]` / `#[tokio::test]` attributes
 * - `assert!`, `assert_eq!`, `assert_ne!` macros
 * - `#[should_panic(expected = "...")]` for panic tests
 * - Ownership-aware test value generation
 *
 * Rust tests live INLINE (same file), not in a separate test file.
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
  ParameterInfo,
  CodeAnalysis,
} from '../interfaces';
import type { ParsedFile } from '../../../shared/parsers/interfaces.js';
import {
  analyzeOwnership,
  isResultType,
  isOptionType,
} from '../../../shared/parsers/rust-ownership-analyzer';
import { buildRustTestContext } from '../context/rust-context-builder';

/**
 * RustTestGenerator - Test generator for Rust's built-in test framework
 *
 * Produces `#[cfg(test)]` modules with ownership-aware assertions
 * and idiomatic Rust test patterns.
 */
export class RustTestGenerator extends BaseTestGenerator {
  readonly framework: TestFramework = 'rust-test';

  // ==========================================================================
  // Public API (ITestGenerator)
  // ==========================================================================

  /**
   * Generate a complete inline test module from analysis context.
   */
  generateTests(context: TestGenerationContext): string {
    const { moduleName, testType, patterns, analysis } = context;

    if (!analysis || (analysis.functions.length === 0 && analysis.classes.length === 0)) {
      return this.generateStubTests(context);
    }

    const patternComment = this.generatePatternComment(patterns);
    const exportedFunctions = analysis.functions.filter((fn) => fn.isExported);
    const exportedClasses = analysis.classes.filter((cls) => cls.isExported);

    const rustCtx = buildRustTestContext(
      exportedFunctions.map((f) => ({ name: f.name, isAsync: f.isAsync, decorators: [] })),
    );

    let code = `${patternComment}#[cfg(test)]\nmod tests {\n`;
    if (rustCtx.useSuper) {
      code += `    use super::*;\n\n`;
    }

    for (const fn of exportedFunctions) {
      code += this.generateFunctionTests(fn, testType);
    }

    for (const cls of exportedClasses) {
      code += this.generateClassTests(cls, testType);
    }

    code += `}\n`;
    return code;
  }

  /**
   * Generate tests for a standalone function.
   */
  generateFunctionTests(fn: FunctionInfo, _testType: TestType): string {
    const ownerships = analyzeOwnership(fn.parameters);
    const returnType = fn.returnType || '';
    const testAttr = fn.isAsync ? '#[tokio::test]' : '#[test]';
    const asyncKw = fn.isAsync ? 'async ' : '';

    let code = '';

    // Happy-path test
    const args = fn.parameters.map((p) => this.generateRustTestValue(p)).join(', ');
    const call = fn.isAsync ? `${fn.name}(${args}).await` : `${fn.name}(${args})`;

    code += `    ${testAttr}\n`;
    code += `    ${asyncKw}fn test_${fn.name}_valid_input() {\n`;
    if (isResultType(returnType)) {
      code += `        let result = ${call};\n`;
      code += `        assert!(result.is_ok());\n`;
    } else if (isOptionType(returnType)) {
      code += `        let result = ${call};\n`;
      code += `        assert!(result.is_some());\n`;
    } else if (returnType === '' || returnType === '()') {
      code += `        ${call};\n`;
    } else {
      code += `        let result = ${call};\n`;
      code += `        ${this.generateRustAssertion(returnType)}\n`;
    }
    code += `    }\n\n`;

    // Result error-path test
    if (isResultType(returnType)) {
      code += `    ${testAttr}\n`;
      code += `    ${asyncKw}fn test_${fn.name}_error_case() {\n`;
      code += `        // TODO: provide invalid input to trigger Err path\n`;
      code += `        // let result = ${fn.name}(/* invalid args */)${fn.isAsync ? '.await' : ''};\n`;
      code += `        // assert!(result.is_err());\n`;
      code += `    }\n\n`;
    }

    // Option None-path test
    if (isOptionType(returnType)) {
      code += `    ${testAttr}\n`;
      code += `    ${asyncKw}fn test_${fn.name}_none_case() {\n`;
      code += `        // TODO: provide input that yields None\n`;
      code += `        // let result = ${fn.name}(/* args */)${fn.isAsync ? '.await' : ''};\n`;
      code += `        // assert!(result.is_none());\n`;
      code += `    }\n\n`;
    }

    // Boundary tests for each parameter
    for (const ownership of ownerships) {
      const param = fn.parameters.find((p) => p.name === ownership.name);
      if (!param) continue;

      const boundaryTests = this.generateRustBoundaryTests(fn, param, ownership.type);
      code += boundaryTests;
    }

    return code;
  }

  /**
   * Generate tests for a struct/impl (mapped from ClassInfo).
   */
  generateClassTests(cls: ClassInfo, testType: TestType): string {
    let code = '';
    const constructorArgs =
      cls.constructorParams?.map((p) => this.generateRustTestValue(p)).join(', ') || '';

    // Instantiation test
    code += `    #[test]\n`;
    code += `    fn test_${this.snakeCase(cls.name)}_new() {\n`;
    code += `        let instance = ${cls.name}::new(${constructorArgs});\n`;
    code += `        // Verify construction succeeded\n`;
    code += `        assert!(true); // Replace with struct field assertions\n`;
    code += `    }\n\n`;

    // Method tests
    for (const method of cls.methods) {
      if (!method.name.startsWith('_')) {
        code += this.generateMethodTest(cls.name, method, constructorArgs);
      }
    }

    return code;
  }

  /**
   * Generate stub tests when no AST analysis is available.
   */
  generateStubTests(context: TestGenerationContext): string {
    const { moduleName, testType, patterns } = context;
    const patternComment = this.generatePatternComment(patterns);

    return `${patternComment}#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_${this.snakeCase(moduleName)}_exists() {
        // Stub ${testType} test — replace with real assertions
        assert!(true);
    }

    #[test]
    fn test_${this.snakeCase(moduleName)}_basic_operation() {
        // TODO: test core functionality of ${moduleName}
        assert!(true);
    }
}
`;
  }

  /**
   * Generate coverage-focused tests for specific lines.
   */
  generateCoverageTests(
    moduleName: string,
    _importPath: string,
    lines: number[],
  ): string {
    const lineRange = this.formatLineRange(lines);
    const snakeName = this.snakeCase(moduleName);

    return `// Coverage test for ${lineRange} in ${moduleName}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_${snakeName}_coverage_${lines[0]}() {
        // Exercises code path covering ${lineRange}
        // TODO: provide appropriate input
        assert!(true);
    }

    #[test]
    fn test_${snakeName}_edge_case_${lines[0]}() {
        // Edge case for ${lineRange}
        // TODO: provide edge-case input
        assert!(true);
    }
}
`;
  }

  // ==========================================================================
  // Rust-specific helpers
  // ==========================================================================

  /**
   * Generate an ownership-aware test value for a Rust parameter.
   */
  protected generateRustTestValue(param: ParameterInfo): string {
    const type = param.type || '';

    if (param.defaultValue) return param.defaultValue;

    // References
    if (type === '&str' || type === "&'static str") return '"test_value"';
    if (type === '&mut str') return '"test_value"';
    if (type.startsWith('&[') && type.endsWith(']')) {
      const inner = type.slice(2, -1).trim();
      return `&[${this.defaultValueForInnerType(inner)}]`;
    }
    if (type.startsWith('&mut [') && type.endsWith(']')) {
      const inner = type.slice(5, -1).trim();
      return `&mut [${this.defaultValueForInnerType(inner)}]`;
    }
    if (type.startsWith('&mut ')) return `&mut ${this.defaultValueForType(type.slice(5))}`;
    if (type.startsWith('&')) return `&${this.defaultValueForType(type.slice(1))}`;

    return this.defaultValueForType(type);
  }

  /**
   * Return a default literal for a Rust type.
   */
  private defaultValueForType(type: string): string {
    const t = type.trim();

    if (t === 'String') return 'String::from("test")';
    if (t === 'str') return '"test_value"';
    if (t === 'i32' || t === 'i64' || t === 'u32' || t === 'u64') return '42';
    if (t === 'i8' || t === 'i16' || t === 'u8' || t === 'u16') return '42';
    if (t === 'isize' || t === 'usize') return '42';
    if (t === 'f32' || t === 'f64') return '3.14';
    if (t === 'bool') return 'true';
    if (t === 'char') return "'a'";

    // Vec<T>
    if (t.startsWith('Vec<') && t.endsWith('>')) {
      const inner = t.slice(4, -1).trim();
      return `vec![${this.defaultValueForInnerType(inner)}]`;
    }

    // HashMap<K, V>
    if (t.startsWith('HashMap<') && t.endsWith('>')) {
      return 'HashMap::new()';
    }

    // Option<T>
    if (t.startsWith('Option<') && t.endsWith('>')) {
      const inner = t.slice(7, -1).trim();
      return `Some(${this.defaultValueForInnerType(inner)})`;
    }

    // Result<T, E>
    if (t.startsWith('Result<') && t.endsWith('>')) {
      const inner = t.slice(7, -1);
      const okType = inner.split(',')[0]?.trim() || '()';
      return `Ok(${this.defaultValueForInnerType(okType)})`;
    }

    // Fallback
    return `Default::default() /* TODO: provide ${t} */`;
  }

  /**
   * Return a simple default for a type used inside a container.
   */
  private defaultValueForInnerType(inner: string): string {
    const t = inner.trim();
    if (t === 'i32' || t === 'i64' || t === 'u32' || t === 'u64') return '42';
    if (t === 'i8' || t === 'i16' || t === 'u8' || t === 'u16') return '42';
    if (t === 'isize' || t === 'usize') return '42';
    if (t === 'f32' || t === 'f64') return '3.14';
    if (t === 'bool') return 'true';
    if (t === 'String') return 'String::from("test")';
    if (t === '&str' || t === 'str') return '"test"';
    if (t === '()') return '()';
    return `Default::default()`;
  }

  /**
   * Generate a Rust assertion macro call based on the return type.
   */
  private generateRustAssertion(returnType: string): string {
    const t = returnType.trim();

    if (t === 'bool') return 'assert!(result);';
    if (t === 'String' || t === '&str') return 'assert!(!result.is_empty());';
    if (['i32', 'i64', 'u32', 'u64', 'f32', 'f64', 'usize', 'isize'].includes(t)) {
      return 'assert!(result >= 0);';
    }
    if (t.startsWith('Vec<')) return 'assert!(!result.is_empty());';

    return 'assert!(true); // TODO: add specific assertion';
  }

  /**
   * Generate boundary tests for a parameter based on its Rust type.
   */
  private generateRustBoundaryTests(
    fn: FunctionInfo,
    param: ParameterInfo,
    type: string,
  ): string {
    let code = '';
    const testAttr = fn.isAsync ? '#[tokio::test]' : '#[test]';
    const asyncKw = fn.isAsync ? 'async ' : '';
    const awaitSuffix = fn.isAsync ? '.await' : '';

    // String/&str boundary: empty string
    if (type.includes('str') || type.includes('String')) {
      const args = fn.parameters
        .map((p) => (p.name === param.name ? '""' : this.generateRustTestValue(p)))
        .join(', ');

      code += `    ${testAttr}\n`;
      code += `    ${asyncKw}fn test_${fn.name}_empty_${param.name}() {\n`;
      code += `        let result = ${fn.name}(${args})${awaitSuffix};\n`;
      code += `        // Verify behavior with empty string for ${param.name}\n`;
      code += `        assert!(true); // TODO: refine assertion\n`;
      code += `    }\n\n`;
    }

    // Numeric boundary: zero
    if (['i32', 'i64', 'u32', 'u64', 'f32', 'f64', 'usize', 'isize'].includes(type)) {
      const args = fn.parameters
        .map((p) => (p.name === param.name ? '0' : this.generateRustTestValue(p)))
        .join(', ');

      code += `    ${testAttr}\n`;
      code += `    ${asyncKw}fn test_${fn.name}_zero_${param.name}() {\n`;
      code += `        let result = ${fn.name}(${args})${awaitSuffix};\n`;
      code += `        assert!(true); // TODO: refine assertion\n`;
      code += `    }\n\n`;
    }

    // Vec boundary: empty vec
    if (type.startsWith('Vec<') || type.includes('&[')) {
      const emptyVal = type.startsWith('Vec<') ? 'vec![]' : '&[]';
      const args = fn.parameters
        .map((p) => (p.name === param.name ? emptyVal : this.generateRustTestValue(p)))
        .join(', ');

      code += `    ${testAttr}\n`;
      code += `    ${asyncKw}fn test_${fn.name}_empty_${param.name}() {\n`;
      code += `        let result = ${fn.name}(${args})${awaitSuffix};\n`;
      code += `        assert!(true); // TODO: refine assertion\n`;
      code += `    }\n\n`;
    }

    return code;
  }

  /**
   * Generate test for a struct method.
   */
  private generateMethodTest(
    structName: string,
    method: FunctionInfo,
    constructorArgs: string,
  ): string {
    const testAttr = method.isAsync ? '#[tokio::test]' : '#[test]';
    const asyncKw = method.isAsync ? 'async ' : '';
    const awaitSuffix = method.isAsync ? '.await' : '';
    const args = method.parameters.map((p) => this.generateRustTestValue(p)).join(', ');
    const returnType = method.returnType || '';
    const isVoid = returnType === '' || returnType === '()';

    let code = `    ${testAttr}\n`;
    code += `    ${asyncKw}fn test_${this.snakeCase(structName)}_${method.name}() {\n`;

    const mutKw = method.parameters.some((p) => p.type?.startsWith('&mut')) ? 'mut ' : '';
    code += `        let ${mutKw}instance = ${structName}::new(${constructorArgs});\n`;

    const call = `instance.${method.name}(${args})${awaitSuffix}`;

    if (isVoid) {
      code += `        ${call};\n`;
    } else if (isResultType(returnType)) {
      code += `        let result = ${call};\n`;
      code += `        assert!(result.is_ok());\n`;
    } else if (isOptionType(returnType)) {
      code += `        let result = ${call};\n`;
      code += `        assert!(result.is_some());\n`;
    } else {
      code += `        let result = ${call};\n`;
      code += `        ${this.generateRustAssertion(returnType)}\n`;
    }

    code += `    }\n\n`;
    return code;
  }

  /**
   * Convert a string to snake_case (Rust naming convention).
   */
  private snakeCase(str: string): string {
    return str
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/_+/g, '_');
  }

  /**
   * Convert a ParsedFile (from multi-language parser) to CodeAnalysis (generator input).
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
        hasConstructor: c.methods.some(m => m.name === 'new' || m.name === 'default'),
        constructorParams: c.methods.find(m => m.name === 'new')?.parameters.map(p => ({
          name: p.name,
          type: p.type,
          optional: p.isOptional,
          defaultValue: p.defaultValue,
        })) ?? [],
      })),
    };
  }
}
