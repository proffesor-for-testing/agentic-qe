/**
 * Tests for the Swift Testing Generator
 */

import { describe, it, expect } from 'vitest';
import { SwiftTestingGenerator } from '../../../../src/domains/test-generation/generators/swift-testing-generator';
import type {
  FunctionInfo,
  ClassInfo,
  TestGenerationContext,
  CodeAnalysis,
} from '../../../../src/domains/test-generation/interfaces';
import type { ParsedFile } from '../../../../src/shared/parsers/interfaces';

describe('SwiftTestingGenerator', () => {
  const generator = new SwiftTestingGenerator();

  describe('framework property', () => {
    it('should be swift-testing', () => {
      expect(generator.framework).toBe('swift-testing');
    });
  });

  describe('generateTests', () => {
    it('should generate stub tests when no analysis is provided', () => {
      const context: TestGenerationContext = {
        moduleName: 'UserService',
        importPath: 'UserService',
        testType: 'unit',
        patterns: [],
      };

      const result = generator.generateTests(context);
      expect(result).toContain('import Testing');
      expect(result).toContain('@testable import UserService');
      expect(result).toContain('@Suite');
      expect(result).toContain('struct UserServiceTests');
      expect(result).toContain('@Test');
      expect(result).toContain('#expect');
    });

    it('should generate stub tests when analysis has no functions or classes', () => {
      const context: TestGenerationContext = {
        moduleName: 'EmptyModule',
        importPath: 'EmptyModule',
        testType: 'unit',
        patterns: [],
        analysis: { functions: [], classes: [] },
      };

      const result = generator.generateTests(context);
      expect(result).toContain('struct EmptyModuleTests');
      expect(result).toContain('testModuleExists');
    });

    it('should generate class tests from analysis', () => {
      const cls: ClassInfo = {
        name: 'UserService',
        methods: [
          {
            name: 'getUser',
            parameters: [
              { name: 'id', type: 'String', optional: false, defaultValue: undefined },
            ],
            returnType: 'User?',
            isAsync: true,
            isExported: true,
            complexity: 2,
            startLine: 14,
            endLine: 18,
          },
          {
            name: 'getAllUsers',
            parameters: [],
            returnType: '[User]',
            isAsync: true,
            isExported: true,
            complexity: 1,
            startLine: 20,
            endLine: 22,
          },
        ],
        properties: [
          { name: 'repository', type: 'UserRepository', isPrivate: true, isReadonly: true },
        ],
        isExported: true,
        hasConstructor: true,
        constructorParams: [
          { name: 'repository', type: 'UserRepository', optional: false, defaultValue: undefined },
        ],
      };

      const context: TestGenerationContext = {
        moduleName: 'UserService',
        importPath: 'UserService',
        testType: 'unit',
        patterns: [],
        analysis: { functions: [], classes: [cls] },
      };

      const result = generator.generateTests(context);

      // Should use Swift Testing framework
      expect(result).toContain('import Testing');
      expect(result).toContain('@testable import UserService');

      // Should use @Suite struct
      expect(result).toContain('@Suite');
      expect(result).toContain('struct UserServiceTests');

      // Should test init
      expect(result).toContain('testInit');
      expect(result).toContain('let subject = UserService(');
      expect(result).toContain('#expect(subject != nil)');

      // Should generate tests for getUser and getAllUsers
      expect(result).toContain('testGetUser');
      expect(result).toContain('testGetAllUsers');

      // Should use async for async methods
      expect(result).toContain('async');
      expect(result).toContain('await');
    });

    it('should generate function tests from analysis', () => {
      const fn: FunctionInfo = {
        name: 'calculateTotal',
        parameters: [
          { name: 'price', type: 'Double', optional: false, defaultValue: undefined },
          { name: 'quantity', type: 'Int', optional: false, defaultValue: undefined },
        ],
        returnType: 'Double',
        isAsync: false,
        isExported: true,
        complexity: 1,
        startLine: 1,
        endLine: 3,
      };

      const context: TestGenerationContext = {
        moduleName: 'MathUtils',
        importPath: 'MathUtils',
        testType: 'unit',
        patterns: [],
        analysis: { functions: [fn], classes: [] },
      };

      const result = generator.generateTests(context);
      expect(result).toContain('struct MathUtilsFunctionTests');
      expect(result).toContain('testCalculateTotal');
      expect(result).toContain('let result =');
    });
  });

  describe('generateFunctionTests', () => {
    it('should generate tests for a function with parameters', () => {
      const fn: FunctionInfo = {
        name: 'calculateDiscount',
        parameters: [
          { name: 'price', type: 'Double', optional: false, defaultValue: undefined },
          { name: 'percentage', type: 'Int', optional: false, defaultValue: undefined },
        ],
        returnType: 'Double',
        isAsync: false,
        isExported: true,
        complexity: 2,
        startLine: 1,
        endLine: 5,
      };

      const result = generator.generateFunctionTests(fn, 'unit');

      expect(result).toContain('@Test');
      expect(result).toContain('testCalculateDiscountValidInput');
      expect(result).toContain('let result =');
      expect(result).toContain('calculateDiscount(price:');
      expect(result).toContain('#expect');
    });

    it('should generate async tests for async functions', () => {
      const fn: FunctionInfo = {
        name: 'fetchData',
        parameters: [
          { name: 'url', type: 'String', optional: false, defaultValue: undefined },
        ],
        returnType: 'Data',
        isAsync: true,
        isExported: true,
        complexity: 1,
        startLine: 1,
        endLine: 3,
      };

      const result = generator.generateFunctionTests(fn, 'unit');

      expect(result).toContain('async');
      expect(result).toContain('await');
      expect(result).toContain('testFetchDataValidInput() async');
    });

    it('should generate void function tests without result capture', () => {
      const fn: FunctionInfo = {
        name: 'logEvent',
        parameters: [
          { name: 'event', type: 'String', optional: false, defaultValue: undefined },
        ],
        returnType: 'Void',
        isAsync: false,
        isExported: true,
        complexity: 1,
        startLine: 1,
        endLine: 3,
      };

      const result = generator.generateFunctionTests(fn, 'unit');

      expect(result).toContain('logEvent(event:');
      expect(result).not.toContain('let result =');
      expect(result).toContain('// void function');
    });

    it('should generate throw tests for functions with guard/throw', () => {
      const fn: FunctionInfo = {
        name: 'validateInput',
        parameters: [
          { name: 'input', type: 'String', optional: false, defaultValue: undefined },
        ],
        returnType: 'Bool',
        isAsync: false,
        isExported: true,
        complexity: 3,
        startLine: 1,
        endLine: 10,
        body: 'guard !input.isEmpty else { throw ValidationError.empty }',
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('ThrowsOnInvalid');
    });

    it('should use named parameters in Swift style', () => {
      const fn: FunctionInfo = {
        name: 'addUser',
        parameters: [
          { name: 'name', type: 'String', optional: false, defaultValue: undefined },
          { name: 'email', type: 'String', optional: false, defaultValue: undefined },
        ],
        returnType: 'User',
        isAsync: false,
        isExported: true,
        complexity: 1,
        startLine: 1,
        endLine: 3,
      };

      const result = generator.generateFunctionTests(fn, 'unit');

      // Swift uses named parameters: addUser(name: ..., email: ...)
      expect(result).toContain('name:');
      expect(result).toContain('email:');
    });
  });

  describe('generateClassTests', () => {
    it('should generate @Suite struct for class without constructor params', () => {
      const cls: ClassInfo = {
        name: 'SimpleService',
        methods: [],
        properties: [],
        isExported: true,
        hasConstructor: false,
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).toContain('@Suite');
      expect(result).toContain('struct SimpleServiceTests');
      expect(result).toContain('let subject = SimpleService()');
      expect(result).toContain('#expect(subject != nil)');
    });

    it('should generate constructor tests for class with init params', () => {
      const cls: ClassInfo = {
        name: 'OrderService',
        methods: [
          {
            name: 'placeOrder',
            parameters: [
              { name: 'order', type: 'Order', optional: false, defaultValue: undefined },
            ],
            returnType: 'Bool',
            isAsync: false,
            isExported: true,
            complexity: 3,
            startLine: 10,
            endLine: 20,
          },
        ],
        properties: [],
        isExported: true,
        hasConstructor: true,
        constructorParams: [
          { name: 'repository', type: 'OrderRepository', optional: false, defaultValue: undefined },
          { name: 'paymentService', type: 'PaymentService', optional: false, defaultValue: undefined },
        ],
      };

      const result = generator.generateClassTests(cls, 'unit');

      // Should use @Suite struct
      expect(result).toContain('@Suite');
      expect(result).toContain('struct OrderServiceTests');

      // Should create subject with constructor params
      expect(result).toContain('OrderService(repository:');
      expect(result).toContain('paymentService:');

      // Should test init
      expect(result).toContain('testInit');

      // Should test method
      expect(result).toContain('testPlaceOrder');
    });

    it('should handle async methods on a class', () => {
      const cls: ClassInfo = {
        name: 'AsyncService',
        methods: [
          {
            name: 'fetchItems',
            parameters: [],
            returnType: '[Item]',
            isAsync: true,
            isExported: true,
            complexity: 1,
            startLine: 5,
            endLine: 8,
          },
        ],
        properties: [],
        isExported: true,
        hasConstructor: false,
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).toContain('async');
      expect(result).toContain('await');
      expect(result).toContain('testFetchItems');
    });

    it('should handle optional return types', () => {
      const cls: ClassInfo = {
        name: 'Cache',
        methods: [
          {
            name: 'getValue',
            parameters: [
              { name: 'key', type: 'String', optional: false, defaultValue: undefined },
            ],
            returnType: 'String?',
            isAsync: false,
            isExported: true,
            complexity: 1,
            startLine: 5,
            endLine: 8,
          },
        ],
        properties: [],
        isExported: true,
        hasConstructor: false,
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).toContain('testGetValue');
      // Should handle optional result without forcing non-nil assertion
      expect(result).toContain('optional');
    });
  });

  describe('generateStubTests', () => {
    it('should generate a valid stub test suite', () => {
      const context: TestGenerationContext = {
        moduleName: 'PaymentService',
        importPath: 'PaymentService',
        testType: 'unit',
        patterns: [],
      };

      const result = generator.generateStubTests(context);

      expect(result).toContain('import Testing');
      expect(result).toContain('@testable import PaymentService');
      expect(result).toContain('@Suite');
      expect(result).toContain('struct PaymentServiceTests');
      expect(result).toContain('testModuleExists');
      expect(result).toContain('testBasicOperations');
      expect(result).toContain('testEdgeCases');
      expect(result).toContain('testErrorConditions');
    });

    it('should include pattern comment when patterns are provided', () => {
      const context: TestGenerationContext = {
        moduleName: 'AuthService',
        importPath: 'AuthService',
        testType: 'unit',
        patterns: [
          { id: '1', name: 'service', structure: '', examples: 1, applicability: 1 },
        ],
      };

      const result = generator.generateStubTests(context);
      expect(result).toContain('// Applied patterns: service');
    });

    it('should use @testable import from importPath', () => {
      const context: TestGenerationContext = {
        moduleName: 'NetworkManager',
        importPath: 'MyApp',
        testType: 'integration',
        patterns: [],
      };

      const result = generator.generateStubTests(context);
      expect(result).toContain('@testable import MyApp');
      expect(result).toContain('integration tests');
    });
  });

  describe('generateCoverageTests', () => {
    it('should generate coverage tests for specific lines', () => {
      const result = generator.generateCoverageTests(
        'UserService',
        'UserService',
        [25, 26, 27, 28]
      );

      expect(result).toContain('import Testing');
      expect(result).toContain('@testable import UserService');
      expect(result).toContain('lines 25-28');
      expect(result).toContain('UserServiceCoverageTests');
      expect(result).toContain('testCoverLines25To28');
      expect(result).toContain('testEdgeCaseLines25To28');
    });

    it('should handle single line coverage', () => {
      const result = generator.generateCoverageTests(
        'Util',
        'MyApp',
        [42]
      );

      expect(result).toContain('line 42');
      expect(result).toContain('testCoverLines42To42');
    });
  });

  describe('convertParsedFile', () => {
    it('should convert ParsedFile to CodeAnalysis correctly', () => {
      const parsed: ParsedFile = {
        functions: [
          {
            name: 'calculateTotal',
            parameters: [
              { name: 'price', type: 'Double', isOptional: false, defaultValue: undefined },
            ],
            returnType: 'Double',
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
            name: 'UserService',
            methods: [
              {
                name: 'init',
                parameters: [
                  { name: 'repository', type: 'UserRepository', isOptional: false, defaultValue: undefined },
                ],
                returnType: undefined,
                isAsync: false,
                isPublic: true,
                complexity: 1,
                decorators: [],
                genericParams: [],
                startLine: 5,
                endLine: 7,
              },
              {
                name: 'getUser',
                parameters: [
                  { name: 'id', type: 'String', isOptional: false, defaultValue: undefined },
                ],
                returnType: 'User?',
                isAsync: true,
                isPublic: true,
                complexity: 2,
                decorators: [],
                genericParams: [],
                startLine: 9,
                endLine: 14,
              },
            ],
            properties: [
              { name: 'repository', type: 'UserRepository', isPublic: false, isReadonly: true },
            ],
            isPublic: true,
            implements: ['UserServiceProtocol'],
            extends: undefined,
            decorators: ['@Observable'],
            startLine: 4,
            endLine: 15,
          },
        ],
        imports: [
          { module: 'Foundation', namedImports: [], isTypeOnly: false },
        ],
        language: 'swift',
        filePath: 'UserService.swift',
      };

      const analysis: CodeAnalysis = SwiftTestingGenerator.convertParsedFile(parsed);

      // Functions
      expect(analysis.functions).toHaveLength(1);
      expect(analysis.functions[0].name).toBe('calculateTotal');
      expect(analysis.functions[0].isExported).toBe(true);
      expect(analysis.functions[0].parameters[0].name).toBe('price');
      expect(analysis.functions[0].parameters[0].type).toBe('Double');

      // Classes
      expect(analysis.classes).toHaveLength(1);
      expect(analysis.classes[0].name).toBe('UserService');
      expect(analysis.classes[0].isExported).toBe(true);
      expect(analysis.classes[0].hasConstructor).toBe(true);
      expect(analysis.classes[0].constructorParams).toHaveLength(1);
      expect(analysis.classes[0].constructorParams![0].name).toBe('repository');
      expect(analysis.classes[0].methods).toHaveLength(2);

      // Properties
      expect(analysis.classes[0].properties).toHaveLength(1);
      expect(analysis.classes[0].properties[0].isPrivate).toBe(true);
      expect(analysis.classes[0].properties[0].isReadonly).toBe(true);
    });

    it('should handle class without init method', () => {
      const parsed: ParsedFile = {
        functions: [],
        classes: [
          {
            name: 'SimpleStruct',
            methods: [
              {
                name: 'doWork',
                parameters: [],
                returnType: 'Void',
                isAsync: false,
                isPublic: true,
                complexity: 1,
                decorators: [],
                genericParams: [],
                startLine: 2,
                endLine: 4,
              },
            ],
            properties: [],
            isPublic: true,
            implements: [],
            extends: undefined,
            decorators: [],
            startLine: 1,
            endLine: 5,
          },
        ],
        imports: [],
        language: 'swift',
        filePath: 'SimpleStruct.swift',
      };

      const analysis = SwiftTestingGenerator.convertParsedFile(parsed);
      expect(analysis.classes[0].hasConstructor).toBe(false);
      expect(analysis.classes[0].constructorParams).toBeUndefined();
    });
  });

  describe('Swift Testing specific patterns', () => {
    it('should use #expect instead of XCTAssert', () => {
      const context: TestGenerationContext = {
        moduleName: 'Test',
        importPath: 'Test',
        testType: 'unit',
        patterns: [],
      };

      const result = generator.generateStubTests(context);
      expect(result).toContain('#expect');
      expect(result).not.toContain('XCTAssert');
    });

    it('should use @Suite struct instead of class inheriting XCTestCase', () => {
      const context: TestGenerationContext = {
        moduleName: 'Test',
        importPath: 'Test',
        testType: 'unit',
        patterns: [],
      };

      const result = generator.generateStubTests(context);
      expect(result).toContain('@Suite');
      expect(result).toContain('struct');
      expect(result).not.toContain('XCTestCase');
      expect(result).not.toContain('class TestTests');
    });

    it('should use import Testing instead of import XCTest', () => {
      const context: TestGenerationContext = {
        moduleName: 'Test',
        importPath: 'Test',
        testType: 'unit',
        patterns: [],
      };

      const result = generator.generateStubTests(context);
      expect(result).toContain('import Testing');
      expect(result).not.toContain('import XCTest');
    });

    it('should strip .swift extension from import path', () => {
      const context: TestGenerationContext = {
        moduleName: 'UserService',
        importPath: 'Sources/UserService.swift',
        testType: 'unit',
        patterns: [],
      };

      const result = generator.generateStubTests(context);
      expect(result).toContain('@testable import UserService');
      expect(result).not.toContain('.swift');
    });
  });

  describe('full integration test', () => {
    it('should generate a complete test file for a service class', () => {
      const cls: ClassInfo = {
        name: 'UserService',
        methods: [
          {
            name: 'getUser',
            parameters: [
              { name: 'id', type: 'String', optional: false, defaultValue: undefined },
            ],
            returnType: 'User?',
            isAsync: true,
            isExported: true,
            complexity: 2,
            startLine: 14,
            endLine: 18,
          },
          {
            name: 'createUser',
            parameters: [
              { name: 'name', type: 'String', optional: false, defaultValue: undefined },
              { name: 'email', type: 'String', optional: false, defaultValue: undefined },
            ],
            returnType: 'User',
            isAsync: true,
            isExported: true,
            complexity: 3,
            startLine: 20,
            endLine: 28,
          },
          {
            name: 'deleteUser',
            parameters: [
              { name: 'id', type: 'String', optional: false, defaultValue: undefined },
            ],
            returnType: 'Void',
            isAsync: true,
            isExported: true,
            complexity: 1,
            startLine: 30,
            endLine: 32,
          },
          {
            name: 'isActive',
            parameters: [
              { name: 'user', type: 'User', optional: false, defaultValue: undefined },
            ],
            returnType: 'Bool',
            isAsync: false,
            isExported: true,
            complexity: 1,
            startLine: 34,
            endLine: 36,
          },
        ],
        properties: [
          { name: 'repository', type: 'UserRepository', isPrivate: true, isReadonly: true },
        ],
        isExported: true,
        hasConstructor: true,
        constructorParams: [
          { name: 'repository', type: 'UserRepository', optional: false, defaultValue: undefined },
        ],
      };

      const fn: FunctionInfo = {
        name: 'formatUserName',
        parameters: [
          { name: 'first', type: 'String', optional: false, defaultValue: undefined },
          { name: 'last', type: 'String', optional: false, defaultValue: undefined },
        ],
        returnType: 'String',
        isAsync: false,
        isExported: true,
        complexity: 1,
        startLine: 40,
        endLine: 42,
      };

      const context: TestGenerationContext = {
        moduleName: 'UserService',
        importPath: 'UserService',
        testType: 'unit',
        patterns: [
          { id: '1', name: 'service', structure: '', examples: 1, applicability: 1 },
        ],
        analysis: { functions: [fn], classes: [cls] },
      };

      const result = generator.generateTests(context);

      // Header
      expect(result).toContain('// Applied patterns: service');
      expect(result).toContain('import Testing');
      expect(result).toContain('@testable import UserService');

      // Class tests
      expect(result).toContain('@Suite');
      expect(result).toContain('struct UserServiceTests');
      expect(result).toContain('testInit');
      expect(result).toContain('testGetUser');
      expect(result).toContain('testCreateUser');
      expect(result).toContain('testDeleteUser');
      expect(result).toContain('testIsActive');

      // Function tests
      expect(result).toContain('struct UserServiceFunctionTests');
      expect(result).toContain('testFormatUserName');

      // Swift Testing assertions
      expect(result).toContain('#expect');
      expect(result).not.toContain('XCTAssert');
    });
  });
});
