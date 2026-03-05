/**
 * GoTestGenerator - Unit Tests
 * Verifies Go test generation with table-driven tests, context.Context, error returns, and struct methods.
 */

import { describe, it, expect } from 'vitest';
import { GoTestGenerator } from '../../../../../src/domains/test-generation/generators/go-test-generator';
import type {
  FunctionInfo,
  ClassInfo,
  TestGenerationContext,
} from '../../../../../src/domains/test-generation/interfaces';

describe('GoTestGenerator', () => {
  const generator = new GoTestGenerator();

  it('should have framework set to go-test', () => {
    expect(generator.framework).toBe('go-test');
  });

  describe('generateFunctionTests()', () => {
    it('should generate table-driven tests for a simple function', () => {
      const fn: FunctionInfo = {
        name: 'Add',
        parameters: [
          { name: 'a', type: 'int', optional: false, defaultValue: undefined },
          { name: 'b', type: 'int', optional: false, defaultValue: undefined },
        ],
        returnType: 'int',
        isAsync: false,
        isExported: true,
        complexity: 1,
        startLine: 1,
        endLine: 5,
      };

      const result = generator.generateFunctionTests(fn, 'unit');

      expect(result).toContain('func TestAdd(t *testing.T)');
      expect(result).toContain('tests := []struct {');
      expect(result).toContain('name string');
      expect(result).toContain('a int');
      expect(result).toContain('b int');
      expect(result).toContain('want int');
      expect(result).toContain('t.Run(tt.name, func(t *testing.T)');
      expect(result).toContain('got := Add(tt.a, tt.b)');
      expect(result).toContain('assert.Equal(t, tt.want, got)');
      // Should have test cases
      expect(result).toContain('"valid input"');
      expect(result).toContain('"zero values"');
    });

    it('should generate tests for a function with error return', () => {
      const fn: FunctionInfo = {
        name: 'GetUser',
        parameters: [
          { name: 'id', type: 'int64', optional: false, defaultValue: undefined },
        ],
        returnType: '*User, error',
        isAsync: false,
        isExported: true,
        complexity: 3,
        startLine: 10,
        endLine: 25,
      };

      const result = generator.generateFunctionTests(fn, 'unit');

      expect(result).toContain('func TestGetUser(t *testing.T)');
      expect(result).toContain('wantErr bool');
      expect(result).toContain('got, err := GetUser(tt.id)');
      expect(result).toContain('if tt.wantErr {');
      expect(result).toContain('assert.Error(t, err)');
      expect(result).toContain('return');
      expect(result).toContain('assert.NoError(t, err)');
      // Should have valid and invalid test cases
      expect(result).toContain('"valid input"');
      expect(result).toContain('"invalid input"');
      expect(result).toContain('wantErr: true');
      expect(result).toContain('wantErr: false');
    });

    it('should generate tests for a function with context.Context parameter', () => {
      const fn: FunctionInfo = {
        name: 'FetchData',
        parameters: [
          { name: 'ctx', type: 'context.Context', optional: false, defaultValue: undefined },
          { name: 'query', type: 'string', optional: false, defaultValue: undefined },
        ],
        returnType: '[]byte, error',
        isAsync: false,
        isExported: true,
        complexity: 5,
        startLine: 30,
        endLine: 50,
      };

      const result = generator.generateFunctionTests(fn, 'unit');

      expect(result).toContain('func TestFetchData(t *testing.T)');
      // context.Context param should not appear as a struct field
      expect(result).not.toMatch(/\bctx\s+context\.Context\b.*struct/);
      // Should use context.Background() in the call
      expect(result).toContain('context.Background()');
      expect(result).toContain('FetchData(context.Background(), tt.query)');
      // Should have query as a struct field
      expect(result).toContain('query string');
      expect(result).toContain('wantErr bool');
    });
  });

  describe('generateClassTests()', () => {
    it('should generate tests for a struct with methods', () => {
      const cls: ClassInfo = {
        name: 'UserService',
        methods: [
          {
            name: 'GetUser',
            parameters: [
              { name: 'ctx', type: 'context.Context', optional: false, defaultValue: undefined },
              { name: 'id', type: 'int64', optional: false, defaultValue: undefined },
            ],
            returnType: '*User, error',
            isAsync: false,
            isExported: true,
            complexity: 3,
            startLine: 20,
            endLine: 35,
          },
          {
            name: 'CreateUser',
            parameters: [
              { name: 'name', type: 'string', optional: false, defaultValue: undefined },
            ],
            returnType: '*User, error',
            isAsync: false,
            isExported: true,
            complexity: 4,
            startLine: 40,
            endLine: 60,
          },
        ],
        properties: [
          { name: 'db', type: '*sql.DB', isPrivate: true, isReadonly: false },
        ],
        isExported: true,
        hasConstructor: true,
        constructorParams: [],
      };

      const result = generator.generateClassTests(cls, 'unit');

      // Should generate instantiation test
      expect(result).toContain('func TestNewUserService(t *testing.T)');
      expect(result).toContain('svc := NewUserService()');
      expect(result).toContain('assert.NotNil(t, svc)');

      // Should generate table-driven tests for each exported method
      expect(result).toContain('func TestUserService_GetUser(t *testing.T)');
      expect(result).toContain('func TestUserService_CreateUser(t *testing.T)');

      // GetUser should use context.Background()
      expect(result).toContain('svc.GetUser(context.Background(), tt.id)');

      // Both methods return error so should have wantErr
      expect(result).toContain('wantErr bool');
      expect(result).toContain('assert.Error(t, err)');
      expect(result).toContain('assert.NoError(t, err)');
    });

    it('should skip unexported (lowercase) methods', () => {
      const cls: ClassInfo = {
        name: 'Cache',
        methods: [
          {
            name: 'Get',
            parameters: [
              { name: 'key', type: 'string', optional: false, defaultValue: undefined },
            ],
            returnType: 'interface{}, bool',
            isAsync: false,
            isExported: true,
            complexity: 1,
            startLine: 5,
            endLine: 10,
          },
          {
            name: 'evict',
            parameters: [],
            returnType: 'void',
            isAsync: false,
            isExported: false,
            complexity: 2,
            startLine: 12,
            endLine: 20,
          },
        ],
        properties: [],
        isExported: true,
        hasConstructor: false,
      };

      const result = generator.generateClassTests(cls, 'unit');

      expect(result).toContain('func TestCache_Get(t *testing.T)');
      // lowercase method "evict" should be skipped
      expect(result).not.toContain('TestCache_evict');
    });
  });

  describe('generateTests()', () => {
    it('should generate a full test file with package, imports, and test functions', () => {
      const context: TestGenerationContext = {
        moduleName: 'userService',
        importPath: 'github.com/myorg/myapp/services',
        testType: 'unit',
        patterns: [],
        analysis: {
          functions: [
            {
              name: 'NewUserService',
              parameters: [],
              returnType: '*UserService',
              isAsync: false,
              isExported: true,
              complexity: 1,
              startLine: 1,
              endLine: 5,
            },
          ],
          classes: [],
        },
      };

      const result = generator.generateTests(context);

      expect(result).toContain('package user_service_test');
      expect(result).toContain('import (');
      expect(result).toContain('"testing"');
      expect(result).toContain('"github.com/stretchr/testify/assert"');
      expect(result).toContain('"github.com/myorg/myapp/services"');
      expect(result).toContain('func TestNewUserService(t *testing.T)');
    });

    it('should fall back to stub tests when no analysis is available', () => {
      const context: TestGenerationContext = {
        moduleName: 'cache',
        importPath: 'github.com/myorg/myapp/cache',
        testType: 'unit',
        patterns: [],
      };

      const result = generator.generateTests(context);

      expect(result).toContain('package cache_test');
      expect(result).toContain('TestModule_IsDefined');
      expect(result).toContain('TestModule_BasicOperations');
      expect(result).toContain('TestModule_ErrorHandling');
    });

    it('should include pattern comments when patterns are provided', () => {
      const context: TestGenerationContext = {
        moduleName: 'handler',
        importPath: 'github.com/myorg/myapp/handler',
        testType: 'unit',
        patterns: [
          { id: '1', name: 'error-first', structure: '', examples: 5, applicability: 0.9 },
          { id: '2', name: 'table-driven', structure: '', examples: 10, applicability: 0.95 },
        ],
        analysis: {
          functions: [
            {
              name: 'Handle',
              parameters: [{ name: 'input', type: 'string', optional: false, defaultValue: undefined }],
              returnType: 'string',
              isAsync: false,
              isExported: true,
              complexity: 1,
              startLine: 1,
              endLine: 5,
            },
          ],
          classes: [],
        },
      };

      const result = generator.generateTests(context);

      expect(result).toContain('// Applied patterns: error-first, table-driven');
    });

    it('should include context import when functions use context.Context', () => {
      const context: TestGenerationContext = {
        moduleName: 'repo',
        importPath: 'github.com/myorg/myapp/repo',
        testType: 'unit',
        patterns: [],
        analysis: {
          functions: [
            {
              name: 'FindAll',
              parameters: [
                { name: 'ctx', type: 'context.Context', optional: false, defaultValue: undefined },
              ],
              returnType: '[]Item, error',
              isAsync: false,
              isExported: true,
              complexity: 2,
              startLine: 1,
              endLine: 10,
            },
          ],
          classes: [],
        },
      };

      const result = generator.generateTests(context);

      expect(result).toContain('"context"');
    });
  });

  describe('generateStubTests()', () => {
    it('should generate placeholder tests with KG context', () => {
      const context: TestGenerationContext = {
        moduleName: 'auth',
        importPath: 'github.com/myorg/myapp/auth',
        testType: 'integration',
        patterns: [],
        dependencies: {
          imports: ['github.com/myorg/myapp/db', 'github.com/myorg/myapp/cache'],
          importedBy: ['github.com/myorg/myapp/handler'],
          callees: [],
          callers: [],
        },
        similarCode: {
          snippets: [
            { file: 'auth_v2.go', snippet: '...', score: 0.85 },
          ],
        },
      };

      const result = generator.generateStubTests(context);

      expect(result).toContain('package auth_test');
      expect(result).toContain('integration test');
      expect(result).toContain('KG: Similar modules found');
      expect(result).toContain('85% similar');
      expect(result).toContain('KG: Module depends on');
      expect(result).toContain('KG: Used by 1 consumers');
    });
  });

  describe('generateCoverageTests()', () => {
    it('should generate coverage-focused tests for specific lines', () => {
      const result = generator.generateCoverageTests(
        'userService',
        'github.com/myorg/myapp/services',
        [42, 43, 44, 45],
      );

      expect(result).toContain('package user_service_test');
      expect(result).toContain('Coverage test for lines 42-45');
      expect(result).toContain('TestUserService_Cover_42_45');
      expect(result).toContain('assert.NoError(t, err)');
      expect(result).toContain('assert.NotNil(t, result)');
    });
  });

  describe('table-driven test generation', () => {
    it('should generate multiple test cases including edge cases', () => {
      const fn: FunctionInfo = {
        name: 'ParseConfig',
        parameters: [
          { name: 'data', type: 'string', optional: false, defaultValue: undefined },
          { name: 'strict', type: 'bool', optional: false, defaultValue: undefined },
        ],
        returnType: '*Config, error',
        isAsync: false,
        isExported: true,
        complexity: 5,
        startLine: 1,
        endLine: 30,
      };

      const result = generator.generateFunctionTests(fn, 'unit');

      // Should have multiple test cases
      expect(result).toContain('"valid input"');
      expect(result).toContain('"zero values"');
      expect(result).toContain('"invalid input"');

      // Zero values: empty string and false for bool
      expect(result).toMatch(/data:\s*""/);
      expect(result).toMatch(/strict:\s*false/);
    });
  });
});
