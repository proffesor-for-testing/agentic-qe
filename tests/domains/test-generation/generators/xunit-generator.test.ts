/**
 * Tests for XUnitGenerator - C# xUnit test generation
 */

import { describe, it, expect } from 'vitest';
import { XUnitGenerator } from '../../../../src/domains/test-generation/generators/xunit-generator';
import type {
  FunctionInfo,
  ClassInfo,
  TestGenerationContext,
} from '../../../../src/domains/test-generation/interfaces';

describe('XUnitGenerator', () => {
  const generator = new XUnitGenerator();

  it('should have framework set to xunit', () => {
    expect(generator.framework).toBe('xunit');
  });

  describe('generateTests', () => {
    it('should generate stub tests when analysis is empty', () => {
      const context: TestGenerationContext = {
        moduleName: 'Calculator',
        importPath: 'MyApp.Services',
        testType: 'unit',
        patterns: [],
        analysis: { functions: [], classes: [] },
      };

      const result = generator.generateTests(context);
      expect(result).toContain('using Xunit;');
      expect(result).toContain('namespace Tests.Calculator');
      expect(result).toContain('[Fact]');
      expect(result).toContain('Should().NotBeNull()');
    });

    it('should generate stub tests when analysis is undefined', () => {
      const context: TestGenerationContext = {
        moduleName: 'MyService',
        importPath: 'MyApp.Services',
        testType: 'unit',
        patterns: [],
      };

      const result = generator.generateTests(context);
      expect(result).toContain('using Xunit;');
      expect(result).toContain('ShouldBeDefinedAndAccessible');
    });

    it('should include pattern comment when patterns provided', () => {
      const context: TestGenerationContext = {
        moduleName: 'MyService',
        importPath: 'MyApp.Services',
        testType: 'unit',
        patterns: [
          { id: '1', name: 'repository', structure: '', examples: 1, applicability: 1 },
          { id: '2', name: 'async', structure: '', examples: 1, applicability: 1 },
        ],
        analysis: {
          functions: [{
            name: 'DoWork',
            parameters: [],
            returnType: 'void',
            isAsync: false,
            isExported: true,
            complexity: 1,
            startLine: 1,
            endLine: 5,
          }],
          classes: [],
        },
      };

      const result = generator.generateTests(context);
      expect(result).toContain('// Applied patterns: repository, async');
    });
  });

  describe('generateClassTests - simple class with methods', () => {
    const simpleClass: ClassInfo = {
      name: 'Calculator',
      methods: [
        {
          name: 'Add',
          parameters: [
            { name: 'a', type: 'int', optional: false, defaultValue: undefined },
            { name: 'b', type: 'int', optional: false, defaultValue: undefined },
          ],
          returnType: 'int',
          isAsync: false,
          isExported: true,
          complexity: 1,
          startLine: 5,
          endLine: 8,
        },
        {
          name: 'IsPositive',
          parameters: [
            { name: 'value', type: 'int', optional: false, defaultValue: undefined },
          ],
          returnType: 'bool',
          isAsync: false,
          isExported: true,
          complexity: 1,
          startLine: 10,
          endLine: 13,
        },
      ],
      properties: [],
      isExported: true,
      hasConstructor: false,
      constructorParams: [],
    };

    it('should generate class test structure', () => {
      const result = generator.generateClassTests(simpleClass, 'unit');
      expect(result).toContain('public class CalculatorTests');
      expect(result).toContain('Constructor_ShouldCreateInstance');
      expect(result).toContain('_sut = new Calculator()');
    });

    it('should generate method tests with assertions', () => {
      const result = generator.generateClassTests(simpleClass, 'unit');
      expect(result).toContain('Add_ShouldWork');
      expect(result).toContain('IsPositive_ShouldWork');
      expect(result).toContain('[Fact]');
    });

    it('should use FluentAssertions', () => {
      const result = generator.generateClassTests(simpleClass, 'unit');
      expect(result).toContain('.Should()');
    });
  });

  describe('generateClassTests - service with constructor dependencies (Moq)', () => {
    const serviceClass: ClassInfo = {
      name: 'UserService',
      methods: [
        {
          name: 'GetUserAsync',
          parameters: [
            { name: 'id', type: 'int', optional: false, defaultValue: undefined },
          ],
          returnType: 'Task<User?>',
          isAsync: true,
          isExported: true,
          complexity: 2,
          startLine: 10,
          endLine: 14,
        },
        {
          name: 'GetAllUsers',
          parameters: [],
          returnType: 'List<User>',
          isAsync: false,
          isExported: true,
          complexity: 1,
          startLine: 16,
          endLine: 19,
        },
      ],
      properties: [
        { name: '_repository', type: 'IUserRepository', isPrivate: true, isReadonly: true },
      ],
      isExported: true,
      hasConstructor: true,
      constructorParams: [
        { name: 'repository', type: 'IUserRepository', optional: false, defaultValue: undefined },
      ],
    };

    it('should generate Mock<T> for interface dependencies', () => {
      const result = generator.generateClassTests(serviceClass, 'unit');
      expect(result).toContain('Mock<IUserRepository>');
      expect(result).toContain('_mockUserRepository');
    });

    it('should pass mock.Object to constructor', () => {
      const result = generator.generateClassTests(serviceClass, 'unit');
      expect(result).toContain('_mockUserRepository.Object');
      expect(result).toContain('_sut = new UserService(_mockUserRepository.Object)');
    });

    it('should generate Moq Setup calls', () => {
      const result = generator.generateClassTests(serviceClass, 'unit');
      expect(result).toContain('.Setup(');
      expect(result).toContain('It.IsAny<');
    });

    it('should use ReturnsAsync for async methods', () => {
      const result = generator.generateClassTests(serviceClass, 'unit');
      expect(result).toContain('ReturnsAsync');
    });

    it('should use Returns for sync methods', () => {
      const result = generator.generateClassTests(serviceClass, 'unit');
      expect(result).toContain('.Returns(');
    });

    it('should generate async Task test methods for async methods', () => {
      const result = generator.generateClassTests(serviceClass, 'unit');
      expect(result).toContain('public async Task GetUserAsync_ShouldWork');
      expect(result).toContain('await _sut.GetUserAsync');
    });

    it('should generate exception handling tests for async methods', () => {
      const result = generator.generateClassTests(serviceClass, 'unit');
      expect(result).toContain('WhenDependencyFails_ShouldHandleGracefully');
      expect(result).toContain('ThrowAsync<Exception>');
    });
  });

  describe('generateFunctionTests - async Task methods', () => {
    const asyncFn: FunctionInfo = {
      name: 'ProcessOrderAsync',
      parameters: [
        { name: 'orderId', type: 'int', optional: false, defaultValue: undefined },
        { name: 'userId', type: 'string', optional: false, defaultValue: undefined },
      ],
      returnType: 'Task<bool>',
      isAsync: true,
      isExported: true,
      complexity: 3,
      startLine: 1,
      endLine: 10,
    };

    it('should generate async test method', () => {
      const result = generator.generateFunctionTests(asyncFn, 'unit');
      expect(result).toContain('public async Task');
      expect(result).toContain('await ProcessOrderAsync');
    });

    it('should include [Fact] attribute', () => {
      const result = generator.generateFunctionTests(asyncFn, 'unit');
      expect(result).toContain('[Fact]');
    });

    it('should generate appropriate return type assertion', () => {
      const result = generator.generateFunctionTests(asyncFn, 'unit');
      expect(result).toContain('result.Should()');
    });
  });

  describe('generateFunctionTests - Theory/InlineData generation', () => {
    const parameterizedFn: FunctionInfo = {
      name: 'Multiply',
      parameters: [
        { name: 'a', type: 'int', optional: false, defaultValue: undefined },
        { name: 'b', type: 'int', optional: false, defaultValue: undefined },
      ],
      returnType: 'int',
      isAsync: false,
      isExported: true,
      complexity: 1,
      startLine: 1,
      endLine: 3,
    };

    it('should generate [Theory] attribute', () => {
      const result = generator.generateFunctionTests(parameterizedFn, 'unit');
      expect(result).toContain('[Theory]');
    });

    it('should generate [InlineData] attributes', () => {
      const result = generator.generateFunctionTests(parameterizedFn, 'unit');
      expect(result).toContain('[InlineData(');
    });

    it('should generate multiple InlineData rows', () => {
      const result = generator.generateFunctionTests(parameterizedFn, 'unit');
      const inlineDataCount = (result.match(/\[InlineData\(/g) || []).length;
      expect(inlineDataCount).toBeGreaterThanOrEqual(3);
    });

    it('should use parameter names in method signature', () => {
      const result = generator.generateFunctionTests(parameterizedFn, 'unit');
      expect(result).toContain('int a, int b');
    });

    it('should use Assert.NotNull in Theory tests', () => {
      const result = generator.generateFunctionTests(parameterizedFn, 'unit');
      expect(result).toContain('Assert.NotNull(result)');
    });
  });

  describe('generateStubTests', () => {
    it('should generate valid stub test file', () => {
      const context: TestGenerationContext = {
        moduleName: 'MyService',
        importPath: 'MyApp.Services',
        testType: 'unit',
        patterns: [],
      };

      const result = generator.generateStubTests(context);
      expect(result).toContain('using Xunit;');
      expect(result).toContain('using Moq;');
      expect(result).toContain('using FluentAssertions;');
      expect(result).toContain('namespace Tests.MyService');
      expect(result).toContain('ShouldBeDefinedAndAccessible');
      expect(result).toContain('ShouldHandleBasicOperations');
      expect(result).toContain('ShouldHandleEdgeCases');
    });
  });

  describe('generateCoverageTests', () => {
    it('should generate coverage tests for specific lines', () => {
      const result = generator.generateCoverageTests('UserService', 'MyApp.Services', [10, 11, 12]);
      expect(result).toContain('Coverage test for lines 10-12');
      expect(result).toContain('Cover_Lines_10_12');
      expect(result).toContain('using Xunit;');
      expect(result).toContain('namespace Tests.UserService.Coverage');
    });

    it('should handle single line', () => {
      const result = generator.generateCoverageTests('UserService', 'MyApp.Services', [42]);
      expect(result).toContain('Coverage test for line 42');
      expect(result).toContain('Cover_Lines_42_42');
    });
  });

  describe('convertParsedFile', () => {
    it('should convert ParsedFile to CodeAnalysis', () => {
      const parsed = {
        language: 'csharp' as const,
        functions: [
          {
            name: 'Calculate',
            parameters: [
              { name: 'x', type: 'int', isOptional: false, defaultValue: undefined },
            ],
            returnType: 'int',
            isAsync: false,
            isPublic: true,
            complexity: 1,
            decorators: [],
            genericParams: [],
            startLine: 1,
            endLine: 3,
          },
        ],
        classes: [
          {
            name: 'MathService',
            methods: [
              {
                name: 'constructor',
                parameters: [],
                returnType: undefined,
                isAsync: false,
                isPublic: true,
                complexity: 1,
                decorators: [],
                genericParams: [],
                startLine: 5,
                endLine: 7,
              },
            ],
            properties: [
              { name: '_logger', type: 'ILogger', isPublic: false, isReadonly: true },
            ],
            isPublic: true,
            baseClass: undefined,
            interfaces: [],
            decorators: [],
            genericParams: [],
          },
        ],
        imports: [],
        exports: [],
      };

      const analysis = XUnitGenerator.convertParsedFile(parsed);

      expect(analysis.functions).toHaveLength(1);
      expect(analysis.functions[0].name).toBe('Calculate');
      expect(analysis.functions[0].isExported).toBe(true);

      expect(analysis.classes).toHaveLength(1);
      expect(analysis.classes[0].name).toBe('MathService');
      expect(analysis.classes[0].hasConstructor).toBe(true);
      expect(analysis.classes[0].properties[0].isPrivate).toBe(true);
    });
  });

  describe('full integration - generateTests with class analysis', () => {
    it('should produce complete xUnit test file for a service class', () => {
      const context: TestGenerationContext = {
        moduleName: 'UserService',
        importPath: 'MyApp.Services',
        testType: 'unit',
        patterns: [],
        analysis: {
          functions: [],
          classes: [
            {
              name: 'UserService',
              methods: [
                {
                  name: 'GetUserAsync',
                  parameters: [
                    { name: 'id', type: 'int', optional: false, defaultValue: undefined },
                  ],
                  returnType: 'Task<User?>',
                  isAsync: true,
                  isExported: true,
                  complexity: 2,
                  startLine: 10,
                  endLine: 14,
                },
                {
                  name: 'GetAllUsers',
                  parameters: [],
                  returnType: 'List<User>',
                  isAsync: false,
                  isExported: true,
                  complexity: 1,
                  startLine: 16,
                  endLine: 19,
                },
              ],
              properties: [
                { name: '_repository', type: 'IUserRepository', isPrivate: true, isReadonly: true },
              ],
              isExported: true,
              hasConstructor: true,
              constructorParams: [
                { name: 'repository', type: 'IUserRepository', optional: false, defaultValue: undefined },
              ],
            },
          ],
        },
      };

      const result = generator.generateTests(context);

      // File structure
      expect(result).toContain('using Xunit;');
      expect(result).toContain('using Moq;');
      expect(result).toContain('using FluentAssertions;');
      expect(result).toContain('using MyApp.Services;');
      expect(result).toContain('namespace Tests.UserService');

      // Class structure
      expect(result).toContain('public class UserServiceTests');
      expect(result).toContain('Mock<IUserRepository>');
      expect(result).toContain('_sut = new UserService(');

      // Method tests
      expect(result).toContain('GetUserAsync_ShouldWork');
      expect(result).toContain('GetAllUsers_ShouldWork');
      expect(result).toContain('async Task');
      expect(result).toContain('await _sut.GetUserAsync');
    });
  });
});
