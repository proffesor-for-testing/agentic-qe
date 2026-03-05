/**
 * Tests for the Flutter Test Generator
 */

import { describe, it, expect } from 'vitest';
import { FlutterTestGenerator } from '../../../../src/domains/test-generation/generators/flutter-test-generator';
import type {
  FunctionInfo,
  ClassInfo,
  TestGenerationContext,
} from '../../../../src/domains/test-generation/interfaces';
import type { ParsedFile } from '../../../../src/shared/parsers/interfaces';

describe('FlutterTestGenerator', () => {
  const generator = new FlutterTestGenerator();

  describe('framework property', () => {
    it('should be flutter-test', () => {
      expect(generator.framework).toBe('flutter-test');
    });
  });

  describe('generateTests', () => {
    it('should generate stub tests when no analysis is provided', () => {
      const context: TestGenerationContext = {
        moduleName: 'UserService',
        importPath: 'package:my_app/services/user_service.dart',
        testType: 'unit',
        patterns: [],
      };

      const result = generator.generateTests(context);
      expect(result).toContain("import 'package:flutter_test/flutter_test.dart'");
      expect(result).toContain("group('UserService'");
      expect(result).toContain('should be defined');
    });

    it('should generate stub tests when analysis has no functions or classes', () => {
      const context: TestGenerationContext = {
        moduleName: 'EmptyService',
        importPath: 'package:my_app/services/empty_service.dart',
        testType: 'unit',
        patterns: [],
        analysis: { functions: [], classes: [] },
      };

      const result = generator.generateTests(context);
      expect(result).toContain("group('EmptyService'");
      expect(result).toContain('should be defined');
    });

    it('should generate function tests from analysis', () => {
      const fn: FunctionInfo = {
        name: 'calculateTotal',
        parameters: [
          { name: 'price', type: 'double', optional: false, defaultValue: undefined },
          { name: 'quantity', type: 'int', optional: false, defaultValue: undefined },
        ],
        returnType: 'double',
        isAsync: false,
        isExported: true,
        complexity: 1,
        startLine: 1,
        endLine: 5,
      };

      const context: TestGenerationContext = {
        moduleName: 'Calculator',
        importPath: 'package:my_app/calculator.dart',
        testType: 'unit',
        patterns: [],
        analysis: { functions: [fn], classes: [] },
      };

      const result = generator.generateTests(context);
      expect(result).toContain("import 'package:flutter_test/flutter_test.dart'");
      expect(result).toContain("import 'package:my_app/calculator.dart'");
      expect(result).toContain("group('calculateTotal'");
      expect(result).toContain('should handle valid input correctly');
      expect(result).toContain('void main()');
    });

    it('should generate class tests with Mockito mocks from analysis', () => {
      const cls: ClassInfo = {
        name: 'UserService',
        methods: [
          {
            name: 'getUser',
            parameters: [
              { name: 'id', type: 'String', optional: false, defaultValue: undefined },
            ],
            returnType: 'User',
            isAsync: false,
            isExported: true,
            complexity: 1,
            startLine: 10,
            endLine: 15,
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
        importPath: 'package:my_app/services/user_service.dart',
        testType: 'unit',
        patterns: [],
        analysis: { functions: [], classes: [cls] },
      };

      const result = generator.generateTests(context);

      // Should import Mockito
      expect(result).toContain("import 'package:mockito/mockito.dart'");
      expect(result).toContain("import 'package:mockito/annotations.dart'");

      // Should have @GenerateMocks annotation
      expect(result).toContain('@GenerateMocks([UserRepository])');

      // Should declare mock variables
      expect(result).toContain('late MockUserRepository mockUserRepository');

      // Should have setUp block
      expect(result).toContain('setUp(()');
      expect(result).toContain('mockUserRepository = MockUserRepository()');
      expect(result).toContain('subject = UserService(mockUserRepository)');

      // Should have instantiation test
      expect(result).toContain('should instantiate correctly');
      expect(result).toContain('expect(subject, isNotNull)');

      // Should have method test
      expect(result).toContain('getUser should execute successfully');
    });

    it('should not generate tests for non-exported functions', () => {
      const fn: FunctionInfo = {
        name: '_privateHelper',
        parameters: [],
        returnType: 'void',
        isAsync: false,
        isExported: false,
        complexity: 1,
        startLine: 1,
        endLine: 3,
      };

      const context: TestGenerationContext = {
        moduleName: 'Utils',
        importPath: 'package:my_app/utils.dart',
        testType: 'unit',
        patterns: [],
        analysis: { functions: [fn], classes: [] },
      };

      const result = generator.generateTests(context);
      // Should fall through to stub since no exported items
      expect(result).toContain('should be defined');
      expect(result).not.toContain('_privateHelper');
    });

    it('should include pattern comment when patterns are provided', () => {
      const context: TestGenerationContext = {
        moduleName: 'AuthService',
        importPath: 'package:my_app/auth_service.dart',
        testType: 'unit',
        patterns: [
          { id: '1', name: 'service', structure: '', examples: 1, applicability: 1 },
        ],
      };

      const result = generator.generateTests(context);
      expect(result).toContain('// Applied patterns: service');
    });
  });

  describe('generateFunctionTests', () => {
    it('should generate tests for a function with parameters', () => {
      const fn: FunctionInfo = {
        name: 'calculateDiscount',
        parameters: [
          { name: 'price', type: 'double', optional: false, defaultValue: undefined },
          { name: 'percentage', type: 'int', optional: false, defaultValue: undefined },
        ],
        returnType: 'double',
        isAsync: false,
        isExported: true,
        complexity: 2,
        startLine: 1,
        endLine: 5,
      };

      const result = generator.generateFunctionTests(fn, 'unit');

      expect(result).toContain("group('calculateDiscount'");
      expect(result).toContain('should handle valid input correctly');
      expect(result).toContain('final result = calculateDiscount(');
      expect(result).toContain('expect(result, isA<num>())');
    });

    it('should generate null-handling tests for required parameters', () => {
      const fn: FunctionInfo = {
        name: 'findUser',
        parameters: [
          { name: 'userId', type: 'String', optional: false, defaultValue: undefined },
        ],
        returnType: 'User',
        isAsync: false,
        isExported: true,
        complexity: 1,
        startLine: 1,
        endLine: 3,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('should handle null userId');
      expect(result).toContain('null');
    });

    it('should generate throwsA assertion for functions with explicit throw', () => {
      const fn: FunctionInfo = {
        name: 'validate',
        parameters: [
          { name: 'input', type: 'String', optional: false, defaultValue: undefined },
        ],
        returnType: 'void',
        isAsync: false,
        isExported: true,
        complexity: 3,
        startLine: 1,
        endLine: 10,
        body: 'if (input == null) throw ArgumentError("input required");',
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('throwsA(isA<Exception>())');
    });

    it('should generate async test for Future-returning functions', () => {
      const fn: FunctionInfo = {
        name: 'fetchData',
        parameters: [
          { name: 'url', type: 'String', optional: false, defaultValue: undefined },
        ],
        returnType: 'Future<String>',
        isAsync: true,
        isExported: true,
        complexity: 2,
        startLine: 1,
        endLine: 8,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('() async');
      expect(result).toContain('await fetchData(');
      expect(result).toContain('isA<String>()');
    });

    it('should handle void return type', () => {
      const fn: FunctionInfo = {
        name: 'logMessage',
        parameters: [
          { name: 'message', type: 'String', optional: false, defaultValue: undefined },
        ],
        returnType: 'void',
        isAsync: false,
        isExported: true,
        complexity: 1,
        startLine: 1,
        endLine: 3,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('// void function');
    });

    it('should skip null test for nullable parameters', () => {
      const fn: FunctionInfo = {
        name: 'greet',
        parameters: [
          { name: 'name', type: 'String?', optional: true, defaultValue: undefined },
        ],
        returnType: 'String',
        isAsync: false,
        isExported: true,
        complexity: 1,
        startLine: 1,
        endLine: 3,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      // Should NOT have a null test since parameter is optional/nullable
      expect(result).not.toContain('should throw on null name');
      expect(result).not.toContain('should handle null name');
    });

    it('should generate boundary tests for string parameters', () => {
      const fn: FunctionInfo = {
        name: 'processText',
        parameters: [
          { name: 'text', type: 'String', optional: false, defaultValue: undefined },
        ],
        returnType: 'String',
        isAsync: false,
        isExported: true,
        complexity: 1,
        startLine: 1,
        endLine: 5,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('should handle empty string for text');
    });

    it('should generate boundary tests for numeric parameters', () => {
      const fn: FunctionInfo = {
        name: 'divide',
        parameters: [
          { name: 'a', type: 'int', optional: false, defaultValue: undefined },
          { name: 'b', type: 'int', optional: false, defaultValue: undefined },
        ],
        returnType: 'double',
        isAsync: false,
        isExported: true,
        complexity: 2,
        startLine: 1,
        endLine: 5,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('should handle zero for a');
      expect(result).toContain('should handle zero for b');
    });
  });

  describe('generateClassTests', () => {
    it('should generate setUp for class without constructor params', () => {
      const cls: ClassInfo = {
        name: 'SimpleService',
        methods: [],
        properties: [],
        isExported: true,
        hasConstructor: false,
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).toContain('setUp(()');
      expect(result).toContain('subject = SimpleService()');
      expect(result).toContain('should instantiate correctly');
    });

    it('should use mocks for class with constructor dependencies', () => {
      const cls: ClassInfo = {
        name: 'OrderService',
        methods: [
          {
            name: 'placeOrder',
            parameters: [
              { name: 'order', type: 'Order', optional: false, defaultValue: undefined },
            ],
            returnType: 'void',
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
          { name: 'orderRepository', type: 'OrderRepository', optional: false, defaultValue: undefined },
          { name: 'paymentService', type: 'PaymentService', optional: false, defaultValue: undefined },
        ],
      };

      const result = generator.generateClassTests(cls, 'unit');

      // Should declare mock variables
      expect(result).toContain('late MockOrderRepository mockOrderRepository');
      expect(result).toContain('late MockPaymentService mockPaymentService');

      // Should initialize mocks in setUp
      expect(result).toContain('mockOrderRepository = MockOrderRepository()');
      expect(result).toContain('mockPaymentService = MockPaymentService()');

      // Should inject mocks into constructor
      expect(result).toContain('subject = OrderService(mockOrderRepository, mockPaymentService)');

      // Should generate method test
      expect(result).toContain('placeOrder should execute successfully');
    });

    it('should not mock primitive constructor parameters', () => {
      const cls: ClassInfo = {
        name: 'ConfigService',
        methods: [],
        properties: [],
        isExported: true,
        hasConstructor: true,
        constructorParams: [
          { name: 'apiKey', type: 'String', optional: false, defaultValue: undefined },
          { name: 'timeout', type: 'int', optional: false, defaultValue: undefined },
        ],
      };

      const result = generator.generateClassTests(cls, 'unit');
      // Should NOT have mock declarations for primitives
      expect(result).not.toContain('MockString');
      expect(result).not.toContain('Mockint');
    });

    it('should generate widget test for Widget-like classes', () => {
      const cls: ClassInfo = {
        name: 'UserProfileWidget',
        methods: [
          {
            name: 'build',
            parameters: [
              { name: 'context', type: 'BuildContext', optional: false, defaultValue: undefined },
            ],
            returnType: 'Widget',
            isAsync: false,
            isExported: true,
            complexity: 3,
            startLine: 10,
            endLine: 30,
          },
        ],
        properties: [],
        isExported: true,
        hasConstructor: false,
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).toContain('testWidgets');
      expect(result).toContain('WidgetTester tester');
      expect(result).toContain('tester.pumpWidget');
      expect(result).toContain('MaterialApp');
      expect(result).toContain('find.byType(UserProfileWidget)');
      expect(result).toContain('findsOneWidget');
    });

    it('should detect widget class by name ending in Screen', () => {
      const cls: ClassInfo = {
        name: 'LoginScreen',
        methods: [
          {
            name: 'build',
            parameters: [
              { name: 'context', type: 'BuildContext', optional: false, defaultValue: undefined },
            ],
            returnType: 'Widget',
            isAsync: false,
            isExported: true,
            complexity: 2,
            startLine: 5,
            endLine: 20,
          },
        ],
        properties: [],
        isExported: true,
        hasConstructor: false,
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).toContain('testWidgets');
      expect(result).toContain('LoginScreen');
    });

    it('should skip private methods (underscore prefix)', () => {
      const cls: ClassInfo = {
        name: 'DataService',
        methods: [
          {
            name: 'fetchData',
            parameters: [],
            returnType: 'List<String>',
            isAsync: true,
            isExported: true,
            complexity: 2,
            startLine: 5,
            endLine: 10,
          },
          {
            name: '_internalHelper',
            parameters: [],
            returnType: 'void',
            isAsync: false,
            isExported: false,
            complexity: 1,
            startLine: 12,
            endLine: 15,
          },
        ],
        properties: [],
        isExported: true,
        hasConstructor: false,
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).toContain('fetchData should execute successfully');
      expect(result).not.toContain('_internalHelper');
    });

    it('should generate async tests for async methods', () => {
      const cls: ClassInfo = {
        name: 'ApiService',
        methods: [
          {
            name: 'fetchUsers',
            parameters: [],
            returnType: 'Future<List<User>>',
            isAsync: true,
            isExported: true,
            complexity: 2,
            startLine: 5,
            endLine: 10,
          },
        ],
        properties: [],
        isExported: true,
        hasConstructor: false,
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).toContain('() async');
      expect(result).toContain('await subject.fetchUsers()');
    });
  });

  describe('generateStubTests', () => {
    it('should generate a valid stub test file', () => {
      const context: TestGenerationContext = {
        moduleName: 'PaymentService',
        importPath: 'package:my_app/services/payment_service.dart',
        testType: 'unit',
        patterns: [],
      };

      const result = generator.generateStubTests(context);

      expect(result).toContain("import 'package:flutter_test/flutter_test.dart'");
      expect(result).toContain("import 'package:my_app/services/payment_service.dart'");
      expect(result).toContain("group('PaymentService'");
      expect(result).toContain('should be defined');
      expect(result).toContain('should handle basic operations');
      expect(result).toContain('should handle edge cases');
      expect(result).toContain('should handle error conditions');
      expect(result).toContain('void main()');
    });
  });

  describe('generateCoverageTests', () => {
    it('should generate coverage tests for specific lines', () => {
      const result = generator.generateCoverageTests(
        'UserService',
        'package:my_app/services/user_service.dart',
        [25, 26, 27, 28]
      );

      expect(result).toContain('lines 25-28');
      expect(result).toContain("group('UserService coverage'");
      expect(result).toContain('should execute code path covering lines 25-28');
      expect(result).toContain('should handle edge case for lines 25-28');
      expect(result).toContain("import 'package:flutter_test/flutter_test.dart'");
      expect(result).toContain('returnsNormally');
    });

    it('should handle single line coverage', () => {
      const result = generator.generateCoverageTests(
        'Util',
        'package:my_app/util.dart',
        [42]
      );

      expect(result).toContain('line 42');
      expect(result).toContain('should execute code path covering line 42');
    });
  });

  describe('convertParsedFile', () => {
    it('should convert ParsedFile to CodeAnalysis', () => {
      const parsed: ParsedFile = {
        functions: [
          {
            name: 'greet',
            parameters: [
              { name: 'name', type: 'String', isOptional: false, defaultValue: undefined },
            ],
            returnType: 'String',
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
            name: 'Greeter',
            methods: [
              {
                name: 'sayHello',
                parameters: [
                  { name: 'target', type: 'String', isOptional: false, defaultValue: undefined },
                ],
                returnType: 'void',
                isAsync: false,
                isPublic: true,
                complexity: 1,
                decorators: [],
                genericParams: [],
                startLine: 5,
                endLine: 8,
              },
            ],
            properties: [
              { name: 'prefix', type: 'String', isPublic: true, isReadonly: true },
            ],
            isPublic: true,
            implements: [],
            extends: undefined,
            decorators: [],
            startLine: 4,
            endLine: 9,
          },
        ],
        imports: [],
        language: 'dart',
        filePath: 'lib/greeter.dart',
      };

      const result = FlutterTestGenerator.convertParsedFile(parsed);

      // Functions should be converted
      expect(result.functions).toHaveLength(1);
      expect(result.functions[0].name).toBe('greet');
      expect(result.functions[0].isExported).toBe(true);
      expect(result.functions[0].parameters[0].name).toBe('name');
      expect(result.functions[0].parameters[0].optional).toBe(false);

      // Classes should be converted
      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].name).toBe('Greeter');
      expect(result.classes[0].isExported).toBe(true);
      expect(result.classes[0].methods).toHaveLength(1);
      expect(result.classes[0].methods[0].name).toBe('sayHello');
      expect(result.classes[0].properties).toHaveLength(1);
      expect(result.classes[0].properties[0].name).toBe('prefix');
      expect(result.classes[0].properties[0].isPrivate).toBe(false);
    });
  });

  describe('integration', () => {
    it('should generate a complete test file for a class with async methods and dependencies', () => {
      const cls: ClassInfo = {
        name: 'AuthService',
        methods: [
          {
            name: 'login',
            parameters: [
              { name: 'email', type: 'String', optional: false, defaultValue: undefined },
              { name: 'password', type: 'String', optional: false, defaultValue: undefined },
            ],
            returnType: 'Future<User>',
            isAsync: true,
            isExported: true,
            complexity: 3,
            startLine: 10,
            endLine: 25,
          },
          {
            name: 'logout',
            parameters: [],
            returnType: 'Future<void>',
            isAsync: true,
            isExported: true,
            complexity: 1,
            startLine: 27,
            endLine: 32,
          },
        ],
        properties: [],
        isExported: true,
        hasConstructor: true,
        constructorParams: [
          { name: 'apiClient', type: 'ApiClient', optional: false, defaultValue: undefined },
          { name: 'tokenStorage', type: 'TokenStorage', optional: false, defaultValue: undefined },
        ],
      };

      const context: TestGenerationContext = {
        moduleName: 'AuthService',
        importPath: 'package:my_app/services/auth_service.dart',
        testType: 'unit',
        patterns: [],
        analysis: { functions: [], classes: [cls] },
      };

      const result = generator.generateTests(context);

      // Verify imports
      expect(result).toContain("import 'package:flutter_test/flutter_test.dart'");
      expect(result).toContain("import 'package:mockito/mockito.dart'");
      expect(result).toContain("import 'package:mockito/annotations.dart'");

      // Verify @GenerateMocks
      expect(result).toContain('@GenerateMocks(');
      expect(result).toContain('ApiClient');
      expect(result).toContain('TokenStorage');

      // Verify test structure
      expect(result).toContain('void main()');
      expect(result).toContain("group('AuthService'");
      expect(result).toContain('setUp(()');
      expect(result).toContain('mockApiClient = MockApiClient()');
      expect(result).toContain('mockTokenStorage = MockTokenStorage()');
      expect(result).toContain('subject = AuthService(mockApiClient, mockTokenStorage)');

      // Verify login test is async
      expect(result).toContain('login should execute successfully');
      expect(result).toContain('await subject.login(');

      // Verify logout test
      expect(result).toContain('logout should execute successfully');
    });
  });
});
