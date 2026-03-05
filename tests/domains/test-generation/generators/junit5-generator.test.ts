/**
 * Tests for the JUnit 5 Test Generator
 */

import { describe, it, expect } from 'vitest';
import { JUnit5Generator } from '../../../../src/domains/test-generation/generators/junit5-generator';
import type {
  FunctionInfo,
  ClassInfo,
  TestGenerationContext,
} from '../../../../src/domains/test-generation/interfaces';

describe('JUnit5Generator', () => {
  const generator = new JUnit5Generator();

  describe('framework property', () => {
    it('should be junit5', () => {
      expect(generator.framework).toBe('junit5');
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
      expect(result).toContain('@DisplayName');
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
      expect(result).toContain('shouldBeDefined');
    });

    it('should generate class tests from analysis', () => {
      const cls: ClassInfo = {
        name: 'UserService',
        methods: [
          {
            name: 'getUser',
            parameters: [
              { name: 'id', type: 'Long', optional: false, defaultValue: undefined },
            ],
            returnType: 'Optional<User>',
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

      // Should have package declaration
      expect(result).toContain('package com.example.service');

      // Should import JUnit 5 / AssertJ / Mockito
      expect(result).toContain('import org.junit.jupiter.api.Test');
      expect(result).toContain('import org.junit.jupiter.api.DisplayName');
      expect(result).toContain('import static org.assertj.core.api.Assertions.assertThat');
      expect(result).toContain('import org.mockito.Mock');
      expect(result).toContain('import org.mockito.InjectMocks');

      // Should use @Mock for repository dependency
      expect(result).toContain('@Mock');
      expect(result).toContain('private UserRepository repository');

      // Should use @InjectMocks for subject
      expect(result).toContain('@InjectMocks');
      expect(result).toContain('private UserService subject');

      // Should generate tests for getUser and getAllUsers
      expect(result).toContain('getUser_shouldExecuteSuccessfully');
      expect(result).toContain('getAllUsers_shouldExecuteSuccessfully');

      // Should generate null parameter tests
      expect(result).toContain('getUser_shouldHandleNullId');

      // Should have Optional import
      expect(result).toContain('import java.util.Optional');

      // Should have List import
      expect(result).toContain('import java.util.List');
    });

    it('should generate tests for service with CompletableFuture methods', () => {
      const cls: ClassInfo = {
        name: 'AsyncService',
        methods: [
          {
            name: 'processAsync',
            parameters: [
              { name: 'data', type: 'String', optional: false, defaultValue: undefined },
            ],
            returnType: 'CompletableFuture<String>',
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

      // Should import CompletableFuture
      expect(result).toContain('import java.util.concurrent.CompletableFuture');

      // Should use .join() for async assertions
      expect(result).toContain('result.join()');
      expect(result).toContain('CompletableFuture<String> result');
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

      expect(result).toContain('@Test');
      expect(result).toContain('@DisplayName("calculateDiscount should handle valid input correctly")');
      expect(result).toContain('calculateDiscount_shouldHandleValidInput');
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
      expect(result).toContain('shouldHandleNullUserId');
      expect(result).toContain('null');
    });

    it('should generate assertThatThrownBy for functions with explicit throw', () => {
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
        body: 'if (input == null) throw new IllegalArgumentException("input required");',
      };

      const result = generator.generateFunctionTests(fn, 'unit');
      expect(result).toContain('assertThatThrownBy');
      expect(result).toContain('.isInstanceOf(Exception.class)');
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
      expect(result).toContain('subject = new SimpleService()');
      expect(result).toContain('shouldInstantiateCorrectly');
    });

    it('should use @Mock and @InjectMocks for class with constructor params', () => {
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

      // Should have @Mock for each dependency
      expect(result).toContain('@Mock');
      expect(result).toContain('private OrderRepository orderRepository');
      expect(result).toContain('private PaymentService paymentService');

      // Should have @InjectMocks for subject
      expect(result).toContain('@InjectMocks');
      expect(result).toContain('private OrderService subject');

      // Should NOT have @BeforeEach (InjectMocks handles setup)
      expect(result).not.toContain('@BeforeEach');

      // Should generate method tests
      expect(result).toContain('placeOrder_shouldExecuteSuccessfully');
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
      expect(result).toContain('shouldBeDefined');
      expect(result).toContain('shouldHandleBasicOperations');
      expect(result).toContain('shouldHandleEdgeCases');
      expect(result).toContain('shouldHandleErrorConditions');
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
      expect(result).toContain('shouldCoverLines_25_to_28');
      expect(result).toContain('shouldHandleEdgeCase_25_to_28');
    });

    it('should handle single line coverage', () => {
      const result = generator.generateCoverageTests(
        'Util',
        'com.example.Util',
        [42]
      );

      expect(result).toContain('line 42');
      expect(result).toContain('shouldCoverLines_42_to_42');
    });
  });

  describe('Spring annotation detection', () => {
    it('should use @ExtendWith(MockitoExtension.class) for @Service classes', () => {
      const cls: ClassInfo & { decorators?: string[] } = {
        name: 'UserService',
        methods: [],
        properties: [],
        isExported: true,
        hasConstructor: false,
        decorators: ['@Service'],
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).toContain('@ExtendWith(MockitoExtension.class)');
    });

    it('should use @WebMvcTest for @RestController classes', () => {
      const cls: ClassInfo & { decorators?: string[] } = {
        name: 'UserController',
        methods: [],
        properties: [],
        isExported: true,
        hasConstructor: false,
        decorators: ['@RestController'],
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).toContain('@WebMvcTest');
    });

    it('should use @DataJpaTest for @Repository classes', () => {
      const cls: ClassInfo & { decorators?: string[] } = {
        name: 'UserRepository',
        methods: [],
        properties: [],
        isExported: true,
        hasConstructor: false,
        decorators: ['@Repository'],
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).toContain('@DataJpaTest');
    });

    it('should default to MockitoExtension when no Spring annotations', () => {
      const cls: ClassInfo & { decorators?: string[] } = {
        name: 'PlainClass',
        methods: [],
        properties: [],
        isExported: true,
        hasConstructor: false,
        decorators: [],
      };

      const result = generator.generateClassTests(cls, 'unit');
      expect(result).toContain('@ExtendWith(MockitoExtension.class)');
    });
  });
});
