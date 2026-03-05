/**
 * Tests for the Kotlin JUnit Test Generator (M4.2)
 */

import { describe, it, expect } from 'vitest';
import { KotlinJUnitGenerator } from '../../../../src/domains/test-generation/generators/kotlin-junit-generator';
import type {
  FunctionInfo,
  ClassInfo,
  TestGenerationContext,
} from '../../../../src/domains/test-generation/interfaces';
import type { ParsedFile } from '../../../../src/shared/parsers/interfaces';

describe('KotlinJUnitGenerator', () => {
  const generator = new KotlinJUnitGenerator();

  describe('framework property', () => {
    it('should be kotlin-junit', () => {
      expect(generator.framework).toBe('kotlin-junit');
    });
  });

  describe('generateTests', () => {
    it('should generate stub tests when no analysis is provided', () => {
      const context: TestGenerationContext = {
        moduleName: 'UserService',
        importPath: 'com.example.service.UserService',
        testType: 'unit',
        patterns: [],
      };

      const result = generator.generateTests(context);
      expect(result).toContain('class UserServiceTest');
      expect(result).toContain('@Test');
      expect(result).toContain('assertThat');
    });

    it('should generate stub tests when analysis has no functions or classes', () => {
      const context: TestGenerationContext = {
        moduleName: 'EmptyService',
        importPath: 'com.example.EmptyService',
        testType: 'unit',
        patterns: [],
        analysis: { functions: [], classes: [] },
      };

      const result = generator.generateTests(context);
      expect(result).toContain('class EmptyServiceTest');
      expect(result).toContain('should be defined');
    });

    it('should generate class tests from analysis with MockK', () => {
      const cls: ClassInfo = {
        name: 'UserService',
        methods: [
          {
            name: 'getUser',
            parameters: [
              { name: 'id', type: 'Long', optional: false, defaultValue: undefined },
            ],
            returnType: 'User?',
            isAsync: false,
            isExported: true,
            complexity: 1,
            startLine: 14,
            endLine: 16,
          },
          {
            name: 'getAllUsers',
            parameters: [],
            returnType: 'List<User>',
            isAsync: false,
            isExported: true,
            complexity: 1,
            startLine: 18,
            endLine: 20,
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
        importPath: 'com.example.service.UserService',
        testType: 'unit',
        patterns: [],
        analysis: { functions: [], classes: [cls] },
      };

      const result = generator.generateTests(context);

      // Should have package declaration (Kotlin uses no semicolons)
      expect(result).toContain('package com.example.service');

      // Should import JUnit 5 + MockK
      expect(result).toContain('import org.junit.jupiter.api.Test');
      expect(result).toContain('import io.mockk.*');
      expect(result).toContain('import io.mockk.impl.annotations.MockK');
      expect(result).toContain('import io.mockk.impl.annotations.InjectMockKs');
      expect(result).toContain('import io.mockk.junit5.MockKExtension');

      // Should use @MockK for repository dependency
      expect(result).toContain('@MockK');
      expect(result).toContain('private lateinit var repository: UserRepository');

      // Should use @InjectMockKs for subject
      expect(result).toContain('@InjectMockKs');
      expect(result).toContain('private lateinit var subject: UserService');

      // Should generate tests for getUser and getAllUsers
      expect(result).toContain('getUser should execute successfully');
      expect(result).toContain('getAllUsers should execute successfully');

      // Should use MockK stubbing syntax (every {} returns)
      expect(result).toContain('every {');
    });

    it('should generate tests for suspend functions with coroutine support', () => {
      const cls: ClassInfo = {
        name: 'AsyncService',
        methods: [
          {
            name: 'fetchData',
            parameters: [
              { name: 'query', type: 'String', optional: false, defaultValue: undefined },
            ],
            returnType: 'List<String>',
            isAsync: true,
            isExported: true,
            complexity: 2,
            startLine: 10,
            endLine: 15,
          },
        ],
        properties: [],
        isExported: true,
        hasConstructor: false,
      };

      const context: TestGenerationContext = {
        moduleName: 'AsyncService',
        importPath: 'com.example.service.AsyncService',
        testType: 'unit',
        patterns: [],
        analysis: { functions: [], classes: [cls] },
      };

      const result = generator.generateTests(context);

      // Should import coroutine test utilities
      expect(result).toContain('import kotlinx.coroutines.test.runTest');

      // Should use runTest { } for suspend test bodies
      expect(result).toContain('= runTest {');
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
      expect(result).toContain('fun `calculateDiscount should handle valid input correctly`()');
      expect(result).toContain('val result = calculateDiscount(');
      expect(result).toContain('assertThat(result)');
    });

    it('should generate null-handling tests for required parameters', () => {
      const fn: FunctionInfo = {
        name: 'findUser',
        parameters: [
          { name: 'userId', type: 'Long', optional: false, defaultValue: undefined },
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

    it('should generate assertThrows for functions with explicit throw/require', () => {
      const fn: FunctionInfo = {
        name: 'validate',
        parameters: [
          { name: 'input', type: 'String', optional: false, defaultValue: undefined },
        ],
        returnType: 'Unit',
        isAsync: false,
        isExported: true,
        complexity: 3,
        startLine: 1,
        endLine: 10,
        body: 'require(input.isNotBlank()) { "input required" }',
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('assertThrows<Exception>');
    });

    it('should use runTest for suspend functions', () => {
      const fn: FunctionInfo = {
        name: 'fetchRemoteData',
        parameters: [
          { name: 'url', type: 'String', optional: false, defaultValue: undefined },
        ],
        returnType: 'String',
        isAsync: true,
        isExported: true,
        complexity: 2,
        startLine: 1,
        endLine: 8,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('= runTest {');
      expect(result).toContain('val result = fetchRemoteData(');
    });

    it('should not generate null tests for nullable parameters', () => {
      const fn: FunctionInfo = {
        name: 'processOptional',
        parameters: [
          { name: 'data', type: 'String?', optional: false, defaultValue: undefined },
        ],
        returnType: 'String',
        isAsync: false,
        isExported: true,
        complexity: 1,
        startLine: 1,
        endLine: 3,
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      // Should NOT generate null handling test since the param is already nullable
      expect(result).not.toContain('should handle null data');
    });
  });

  describe('generateClassTests', () => {
    it('should generate @BeforeEach setup for class without constructor params', () => {
      const cls: ClassInfo = {
        name: 'SimpleService',
        methods: [],
        properties: [],
        isExported: true,
        hasConstructor: false,
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).toContain('@BeforeEach');
      expect(result).toContain('subject = SimpleService()');
      expect(result).toContain('should instantiate correctly');
    });

    it('should use @MockK and @InjectMockKs for class with constructor params', () => {
      const cls: ClassInfo = {
        name: 'OrderService',
        methods: [
          {
            name: 'placeOrder',
            parameters: [
              { name: 'order', type: 'Order', optional: false, defaultValue: undefined },
            ],
            returnType: 'Unit',
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

      // Should have @MockK for each dependency (lateinit var)
      expect(result).toContain('@MockK');
      expect(result).toContain('private lateinit var orderRepository: OrderRepository');
      expect(result).toContain('private lateinit var paymentService: PaymentService');

      // Should have @InjectMockKs for subject
      expect(result).toContain('@InjectMockKs');
      expect(result).toContain('private lateinit var subject: OrderService');

      // Should NOT have @BeforeEach (InjectMockKs handles setup)
      expect(result).not.toContain('@BeforeEach');

      // Should generate method tests
      expect(result).toContain('placeOrder should execute successfully');
    });

    it('should use coEvery for suspend methods with repository deps', () => {
      const cls: ClassInfo = {
        name: 'UserService',
        methods: [
          {
            name: 'getAllUsers',
            parameters: [],
            returnType: 'List<User>',
            isAsync: true,
            isExported: true,
            complexity: 1,
            startLine: 10,
            endLine: 12,
          },
        ],
        properties: [],
        isExported: true,
        hasConstructor: true,
        constructorParams: [
          { name: 'userRepository', type: 'UserRepository', optional: false, defaultValue: undefined },
        ],
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).toContain('coEvery {');
      expect(result).toContain('= runTest {');
    });

    it('should use @ExtendWith(MockKExtension::class) annotation', () => {
      const cls: ClassInfo = {
        name: 'PlainClass',
        methods: [],
        properties: [],
        isExported: true,
        hasConstructor: false,
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).toContain('@ExtendWith(MockKExtension::class)');
    });
  });

  describe('generateStubTests', () => {
    it('should generate a valid stub test class', () => {
      const context: TestGenerationContext = {
        moduleName: 'PaymentService',
        importPath: 'com.example.payment.PaymentService',
        testType: 'unit',
        patterns: [],
      };

      const result = generator.generateStubTests(context);

      expect(result).toContain('package com.example.payment');
      expect(result).toContain('class PaymentServiceTest');
      expect(result).toContain('should be defined');
      expect(result).toContain('should handle basic operations');
      expect(result).toContain('should handle edge cases');
      expect(result).toContain('should handle error conditions');
    });

    it('should include pattern comment when patterns are provided', () => {
      const context: TestGenerationContext = {
        moduleName: 'AuthService',
        importPath: 'com.example.auth.AuthService',
        testType: 'unit',
        patterns: [
          { id: '1', name: 'service', structure: '', examples: 1, applicability: 1 },
        ],
      };

      const result = generator.generateStubTests(context);
      expect(result).toContain('// Applied patterns: service');
    });

    it('should use Kotlin syntax without semicolons', () => {
      const context: TestGenerationContext = {
        moduleName: 'TestClass',
        importPath: 'com.example.TestClass',
        testType: 'unit',
        patterns: [],
      };

      const result = generator.generateStubTests(context);
      // Kotlin does not use semicolons
      expect(result).not.toContain(';');
      // Should use backtick test names
      expect(result).toContain('fun `');
    });
  });

  describe('generateCoverageTests', () => {
    it('should generate coverage tests for specific lines', () => {
      const result = generator.generateCoverageTests(
        'UserService',
        'com.example.service.UserService',
        [25, 26, 27, 28]
      );

      expect(result).toContain('package com.example.service');
      expect(result).toContain('lines 25-28');
      expect(result).toContain('UserServiceCoverageTest');
      expect(result).toContain('should execute code path covering lines 25-28');
      expect(result).toContain('should handle edge case for lines 25-28');
    });

    it('should handle single line coverage', () => {
      const result = generator.generateCoverageTests(
        'Util',
        'com.example.Util',
        [42]
      );

      expect(result).toContain('line 42');
      expect(result).toContain('should execute code path covering line 42');
    });

    it('should use Kotlin val instead of Java var', () => {
      const result = generator.generateCoverageTests(
        'Service',
        'com.example.Service',
        [10, 11]
      );

      expect(result).toContain('val testInput');
      expect(result).not.toContain('Object testInput');
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
            body: 'return "Hello, $name"',
            startLine: 1,
            endLine: 3,
          },
        ],
        classes: [
          {
            name: 'UserService',
            methods: [
              {
                name: '<init>',
                parameters: [
                  { name: 'repo', type: 'UserRepository', isOptional: false, defaultValue: undefined },
                ],
                returnType: undefined,
                isAsync: false,
                isPublic: true,
                complexity: 1,
                decorators: [],
                genericParams: [],
                startLine: 5,
                endLine: 5,
              },
              {
                name: 'findById',
                parameters: [
                  { name: 'id', type: 'Long', isOptional: false, defaultValue: undefined },
                ],
                returnType: 'User?',
                isAsync: true,
                isPublic: true,
                complexity: 2,
                decorators: [],
                genericParams: [],
                startLine: 7,
                endLine: 10,
              },
            ],
            properties: [
              { name: 'repo', type: 'UserRepository', isPublic: false, isReadonly: true },
            ],
            isPublic: true,
            implements: [],
            extends: undefined,
            decorators: [],
            startLine: 4,
            endLine: 11,
          },
        ],
        imports: [
          { module: 'com.example.User', namedImports: ['User'], isTypeOnly: false },
        ],
        language: 'kotlin',
        filePath: 'src/main/kotlin/UserService.kt',
      };

      const result = KotlinJUnitGenerator.convertParsedFile(parsed);

      // Functions should be mapped
      expect(result.functions).toHaveLength(1);
      expect(result.functions[0].name).toBe('greet');
      expect(result.functions[0].isExported).toBe(true);
      expect(result.functions[0].parameters[0].name).toBe('name');
      expect(result.functions[0].parameters[0].type).toBe('String');
      expect(result.functions[0].body).toBe('return "Hello, $name"');

      // Classes should be mapped
      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].name).toBe('UserService');
      expect(result.classes[0].hasConstructor).toBe(true);
      expect(result.classes[0].constructorParams).toHaveLength(1);
      expect(result.classes[0].constructorParams![0].name).toBe('repo');
      expect(result.classes[0].constructorParams![0].type).toBe('UserRepository');

      // Properties
      expect(result.classes[0].properties).toHaveLength(1);
      expect(result.classes[0].properties[0].isPrivate).toBe(true);
      expect(result.classes[0].properties[0].isReadonly).toBe(true);

      // Methods (excluding constructor)
      expect(result.classes[0].methods).toHaveLength(2);
      expect(result.classes[0].methods[1].name).toBe('findById');
      expect(result.classes[0].methods[1].isAsync).toBe(true);
    });
  });

  describe('full integration test', () => {
    it('should generate a complete Kotlin test file with classes and functions', () => {
      const context: TestGenerationContext = {
        moduleName: 'OrderService',
        importPath: 'com.example.order.OrderService',
        testType: 'unit',
        patterns: [
          { id: '1', name: 'repository-pattern', structure: '', examples: 2, applicability: 0.9 },
        ],
        analysis: {
          functions: [
            {
              name: 'formatPrice',
              parameters: [
                { name: 'amount', type: 'Double', optional: false, defaultValue: undefined },
              ],
              returnType: 'String',
              isAsync: false,
              isExported: true,
              complexity: 1,
              startLine: 1,
              endLine: 3,
            },
          ],
          classes: [
            {
              name: 'OrderService',
              methods: [
                {
                  name: 'createOrder',
                  parameters: [
                    { name: 'userId', type: 'Long', optional: false, defaultValue: undefined },
                    { name: 'items', type: 'List<OrderItem>', optional: false, defaultValue: undefined },
                  ],
                  returnType: 'Order',
                  isAsync: true,
                  isExported: true,
                  complexity: 4,
                  startLine: 15,
                  endLine: 30,
                },
              ],
              properties: [],
              isExported: true,
              hasConstructor: true,
              constructorParams: [
                { name: 'orderRepo', type: 'OrderRepository', optional: false, defaultValue: undefined },
              ],
            },
          ],
        },
      };

      const result = generator.generateTests(context);

      // Pattern comment
      expect(result).toContain('// Applied patterns: repository-pattern');

      // Package
      expect(result).toContain('package com.example.order');

      // MockK imports
      expect(result).toContain('import io.mockk.*');
      expect(result).toContain('import io.mockk.impl.annotations.MockK');

      // Coroutine imports
      expect(result).toContain('import kotlinx.coroutines.test.runTest');

      // Class test with MockK injection
      expect(result).toContain('@ExtendWith(MockKExtension::class)');
      expect(result).toContain('class OrderServiceTest');
      expect(result).toContain('@MockK');
      expect(result).toContain('private lateinit var orderRepo: OrderRepository');
      expect(result).toContain('@InjectMockKs');
      expect(result).toContain('private lateinit var subject: OrderService');

      // Method test with suspend support
      expect(result).toContain('createOrder should execute successfully');
      expect(result).toContain('= runTest {');

      // Top-level function test
      expect(result).toContain('formatPrice should handle valid input correctly');
    });
  });
});
