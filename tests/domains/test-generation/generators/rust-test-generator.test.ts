/**
 * Tests for the Rust Test Generator
 */

import { describe, it, expect } from 'vitest';
import { RustTestGenerator } from '../../../../src/domains/test-generation/generators/rust-test-generator';
import type {
  FunctionInfo,
  ClassInfo,
  TestGenerationContext,
} from '../../../../src/domains/test-generation/interfaces';

describe('RustTestGenerator', () => {
  const generator = new RustTestGenerator();

  describe('framework property', () => {
    it('should be rust-test', () => {
      expect(generator.framework).toBe('rust-test');
    });
  });

  describe('generateTests', () => {
    it('should generate stub tests when no analysis is provided', () => {
      const context: TestGenerationContext = {
        moduleName: 'my_module',
        importPath: './my_module',
        testType: 'unit',
        patterns: [],
      };

      const result = generator.generateTests(context);
      expect(result).toContain('#[cfg(test)]');
      expect(result).toContain('mod tests');
      expect(result).toContain('use super::*');
      expect(result).toContain('test_my_module_exists');
    });

    it('should generate stub tests when analysis has no functions or classes', () => {
      const context: TestGenerationContext = {
        moduleName: 'empty_mod',
        importPath: './empty_mod',
        testType: 'unit',
        patterns: [],
        analysis: { functions: [], classes: [] },
      };

      const result = generator.generateTests(context);
      expect(result).toContain('#[cfg(test)]');
      expect(result).toContain('test_empty_mod_exists');
    });

    it('should generate function tests from analysis', () => {
      const fn: FunctionInfo = {
        name: 'add',
        parameters: [
          { name: 'a', type: 'i32', optional: false, defaultValue: undefined },
          { name: 'b', type: 'i32', optional: false, defaultValue: undefined },
        ],
        returnType: 'i32',
        isAsync: false,
        isExported: true,
        complexity: 1,
        startLine: 1,
        endLine: 3,
      };

      const context: TestGenerationContext = {
        moduleName: 'math',
        importPath: './math',
        testType: 'unit',
        patterns: [],
        analysis: { functions: [fn], classes: [] },
      };

      const result = generator.generateTests(context);
      expect(result).toContain('#[cfg(test)]');
      expect(result).toContain('mod tests');
      expect(result).toContain('use super::*');
      expect(result).toContain('#[test]');
      expect(result).toContain('test_add_valid_input');
      expect(result).toContain('add(42, 42)');
    });

    it('should only generate tests for exported functions', () => {
      const exported: FunctionInfo = {
        name: 'public_fn',
        parameters: [],
        returnType: 'bool',
        isAsync: false,
        isExported: true,
        complexity: 1,
        startLine: 1,
        endLine: 3,
      };
      const internal: FunctionInfo = {
        name: 'private_fn',
        parameters: [],
        returnType: 'bool',
        isAsync: false,
        isExported: false,
        complexity: 1,
        startLine: 5,
        endLine: 7,
      };

      const context: TestGenerationContext = {
        moduleName: 'mixed',
        importPath: './mixed',
        testType: 'unit',
        patterns: [],
        analysis: { functions: [exported, internal], classes: [] },
      };

      const result = generator.generateTests(context);
      expect(result).toContain('test_public_fn');
      expect(result).not.toContain('test_private_fn');
    });

    it('should include pattern comment when patterns are provided', () => {
      const fn: FunctionInfo = {
        name: 'greet',
        parameters: [{ name: 'name', type: '&str', optional: false, defaultValue: undefined }],
        returnType: 'String',
        isAsync: false,
        isExported: true,
        complexity: 1,
        startLine: 1,
        endLine: 3,
      };

      const context: TestGenerationContext = {
        moduleName: 'greet_mod',
        importPath: './greet_mod',
        testType: 'unit',
        patterns: [
          { id: '1', name: 'OwnershipTest', structure: '', examples: 1, applicability: 1 },
        ],
        analysis: { functions: [fn], classes: [] },
      };

      const result = generator.generateTests(context);
      expect(result).toContain('Applied patterns: OwnershipTest');
    });
  });

  describe('generateFunctionTests', () => {
    it('should generate #[test] attribute for sync functions', () => {
      const fn: FunctionInfo = {
        name: 'compute',
        parameters: [{ name: 'x', type: 'i32', optional: false, defaultValue: undefined }],
        returnType: 'i32',
        isAsync: false,
        isExported: true,
        complexity: 1,
        startLine: 1,
        endLine: 3,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('#[test]');
      expect(result).not.toContain('#[tokio::test]');
      expect(result).toContain('test_compute_valid_input');
    });

    it('should generate #[tokio::test] for async functions', () => {
      const fn: FunctionInfo = {
        name: 'fetch_data',
        parameters: [{ name: 'url', type: '&str', optional: false, defaultValue: undefined }],
        returnType: 'Result<String, Error>',
        isAsync: true,
        isExported: true,
        complexity: 2,
        startLine: 1,
        endLine: 10,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('#[tokio::test]');
      expect(result).toContain('async fn');
      expect(result).toContain('.await');
    });

    it('should generate Result Ok/Err path tests', () => {
      const fn: FunctionInfo = {
        name: 'parse_config',
        parameters: [{ name: 'input', type: '&str', optional: false, defaultValue: undefined }],
        returnType: 'Result<Config, ParseError>',
        isAsync: false,
        isExported: true,
        complexity: 3,
        startLine: 1,
        endLine: 15,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('result.is_ok()');
      expect(result).toContain('test_parse_config_error_case');
      expect(result).toContain('result.is_err()');
    });

    it('should generate Option Some/None path tests', () => {
      const fn: FunctionInfo = {
        name: 'find_user',
        parameters: [{ name: 'id', type: 'u64', optional: false, defaultValue: undefined }],
        returnType: 'Option<User>',
        isAsync: false,
        isExported: true,
        complexity: 2,
        startLine: 1,
        endLine: 8,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('result.is_some()');
      expect(result).toContain('test_find_user_none_case');
      expect(result).toContain('result.is_none()');
    });

    it('should generate void function test without result binding', () => {
      const fn: FunctionInfo = {
        name: 'log_event',
        parameters: [{ name: 'msg', type: '&str', optional: false, defaultValue: undefined }],
        returnType: '()',
        isAsync: false,
        isExported: true,
        complexity: 1,
        startLine: 1,
        endLine: 3,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('log_event("test_value")');
      // The happy-path test for a void fn should not bind a result
      const happyPath = result.split('\n').filter(l => l.includes('log_event("test_value")'));
      expect(happyPath.length).toBeGreaterThan(0);
      expect(happyPath[0]).not.toContain('let result');
    });

    it('should generate boundary tests for string parameters', () => {
      const fn: FunctionInfo = {
        name: 'validate',
        parameters: [{ name: 'input', type: '&str', optional: false, defaultValue: undefined }],
        returnType: 'bool',
        isAsync: false,
        isExported: true,
        complexity: 2,
        startLine: 1,
        endLine: 5,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('test_validate_empty_input');
      expect(result).toContain('""');
    });

    it('should generate boundary tests for numeric parameters', () => {
      const fn: FunctionInfo = {
        name: 'factorial',
        parameters: [{ name: 'n', type: 'u32', optional: false, defaultValue: undefined }],
        returnType: 'u64',
        isAsync: false,
        isExported: true,
        complexity: 2,
        startLine: 1,
        endLine: 5,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('test_factorial_zero_n');
    });

    it('should generate boundary tests for Vec parameters', () => {
      const fn: FunctionInfo = {
        name: 'sum_all',
        parameters: [{ name: 'items', type: 'Vec<i32>', optional: false, defaultValue: undefined }],
        returnType: 'i32',
        isAsync: false,
        isExported: true,
        complexity: 1,
        startLine: 1,
        endLine: 3,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('test_sum_all_empty_items');
      expect(result).toContain('vec![]');
    });
  });

  describe('generateClassTests', () => {
    it('should generate struct instantiation test', () => {
      const cls: ClassInfo = {
        name: 'UserService',
        methods: [],
        properties: [],
        isExported: true,
        hasConstructor: true,
        constructorParams: [
          { name: 'db_url', type: '&str', optional: false, defaultValue: undefined },
        ],
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).toContain('test_user_service_new');
      expect(result).toContain('UserService::new("test_value")');
    });

    it('should generate method tests for struct', () => {
      const cls: ClassInfo = {
        name: 'Calculator',
        methods: [
          {
            name: 'add',
            parameters: [
              { name: 'a', type: 'i32', optional: false, defaultValue: undefined },
              { name: 'b', type: 'i32', optional: false, defaultValue: undefined },
            ],
            returnType: 'i32',
            isAsync: false,
            isExported: true,
            complexity: 1,
            startLine: 5,
            endLine: 7,
          },
        ],
        properties: [],
        isExported: true,
        hasConstructor: true,
        constructorParams: [],
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).toContain('test_calculator_add');
      expect(result).toContain('Calculator::new()');
      expect(result).toContain('instance.add(42, 42)');
    });

    it('should generate async method tests', () => {
      const cls: ClassInfo = {
        name: 'HttpClient',
        methods: [
          {
            name: 'get',
            parameters: [
              { name: 'url', type: '&str', optional: false, defaultValue: undefined },
            ],
            returnType: 'Result<Response, Error>',
            isAsync: true,
            isExported: true,
            complexity: 3,
            startLine: 5,
            endLine: 15,
          },
        ],
        properties: [],
        isExported: true,
        hasConstructor: true,
        constructorParams: [],
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).toContain('#[tokio::test]');
      expect(result).toContain('async fn');
      expect(result).toContain('.await');
      expect(result).toContain('result.is_ok()');
    });

    it('should skip methods starting with underscore', () => {
      const cls: ClassInfo = {
        name: 'MyStruct',
        methods: [
          {
            name: '_internal',
            parameters: [],
            returnType: '()',
            isAsync: false,
            isExported: false,
            complexity: 1,
            startLine: 5,
            endLine: 7,
          },
          {
            name: 'public_method',
            parameters: [],
            returnType: 'bool',
            isAsync: false,
            isExported: true,
            complexity: 1,
            startLine: 9,
            endLine: 11,
          },
        ],
        properties: [],
        isExported: true,
        hasConstructor: true,
        constructorParams: [],
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).not.toContain('test_my_struct__internal');
      expect(result).toContain('test_my_struct_public_method');
    });
  });

  describe('generateStubTests', () => {
    it('should generate a valid stub test module', () => {
      const context: TestGenerationContext = {
        moduleName: 'utils',
        importPath: './utils',
        testType: 'unit',
        patterns: [],
      };

      const result = generator.generateStubTests(context);
      expect(result).toContain('#[cfg(test)]');
      expect(result).toContain('mod tests');
      expect(result).toContain('use super::*');
      expect(result).toContain('test_utils_exists');
      expect(result).toContain('test_utils_basic_operation');
    });
  });

  describe('generateCoverageTests', () => {
    it('should generate coverage tests for specific lines', () => {
      const result = generator.generateCoverageTests('MyModule', './my_module', [10, 11, 12]);
      expect(result).toContain('Coverage test for lines 10-12');
      expect(result).toContain('#[cfg(test)]');
      expect(result).toContain('test_my_module_coverage_10');
      expect(result).toContain('test_my_module_edge_case_10');
    });

    it('should handle single line coverage', () => {
      const result = generator.generateCoverageTests('SingleLine', './single', [42]);
      expect(result).toContain('Coverage test for line 42');
      expect(result).toContain('test_single_line_coverage_42');
    });
  });

  describe('ownership-aware test values', () => {
    it('should generate &str test values', () => {
      const fn: FunctionInfo = {
        name: 'greet',
        parameters: [{ name: 'name', type: '&str', optional: false, defaultValue: undefined }],
        returnType: 'String',
        isAsync: false,
        isExported: true,
        complexity: 1,
        startLine: 1,
        endLine: 3,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('"test_value"');
    });

    it('should generate String test values', () => {
      const fn: FunctionInfo = {
        name: 'process',
        parameters: [{ name: 'data', type: 'String', optional: false, defaultValue: undefined }],
        returnType: '()',
        isAsync: false,
        isExported: true,
        complexity: 1,
        startLine: 1,
        endLine: 3,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('String::from("test")');
    });

    it('should generate Vec test values', () => {
      const fn: FunctionInfo = {
        name: 'sum',
        parameters: [
          { name: 'values', type: 'Vec<i32>', optional: false, defaultValue: undefined },
        ],
        returnType: 'i32',
        isAsync: false,
        isExported: true,
        complexity: 1,
        startLine: 1,
        endLine: 3,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('vec![42]');
    });

    it('should generate bool test values', () => {
      const fn: FunctionInfo = {
        name: 'toggle',
        parameters: [
          { name: 'flag', type: 'bool', optional: false, defaultValue: undefined },
        ],
        returnType: 'bool',
        isAsync: false,
        isExported: true,
        complexity: 1,
        startLine: 1,
        endLine: 3,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('toggle(true)');
    });

    it('should generate Option test values', () => {
      const fn: FunctionInfo = {
        name: 'maybe',
        parameters: [
          { name: 'val', type: 'Option<i32>', optional: false, defaultValue: undefined },
        ],
        returnType: '()',
        isAsync: false,
        isExported: true,
        complexity: 1,
        startLine: 1,
        endLine: 3,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('Some(42)');
    });

    it('should generate borrowed slice test values', () => {
      const fn: FunctionInfo = {
        name: 'process_slice',
        parameters: [
          { name: 'data', type: '&[i32]', optional: false, defaultValue: undefined },
        ],
        returnType: 'i32',
        isAsync: false,
        isExported: true,
        complexity: 1,
        startLine: 1,
        endLine: 3,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('&[42]');
    });

    it('should generate HashMap test values', () => {
      const fn: FunctionInfo = {
        name: 'count_keys',
        parameters: [
          { name: 'map', type: 'HashMap<String, i32>', optional: false, defaultValue: undefined },
        ],
        returnType: 'usize',
        isAsync: false,
        isExported: true,
        complexity: 1,
        startLine: 1,
        endLine: 3,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('HashMap::new()');
    });
  });
});
