/**
 * Unit Tests for TestGeneratorService Dependency Injection
 * Verifies that DI pattern enables proper testing and mocking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TestGeneratorService,
  createTestGeneratorService,
  createTestGeneratorServiceWithDependencies,
  type TestGeneratorDependencies,
} from '../../../../src/domains/test-generation/services/test-generator';
import type { ITestGeneratorFactory } from '../../../../src/domains/test-generation/factories/test-generator-factory';
import type { ITDDGeneratorService } from '../../../../src/domains/test-generation/services/tdd-generator';
import type { IPropertyTestGeneratorService } from '../../../../src/domains/test-generation/services/property-test-generator';
import type { ITestDataGeneratorService } from '../../../../src/domains/test-generation/services/test-data-generator';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';

describe('TestGeneratorService - Dependency Injection', () => {
  let mockMemory: MemoryBackend;
  let mockGeneratorFactory: ITestGeneratorFactory;
  let mockTDDGenerator: ITDDGeneratorService;
  let mockPropertyGenerator: IPropertyTestGeneratorService;
  let mockDataGenerator: ITestDataGeneratorService;

  beforeEach(() => {
    // Create mock memory backend
    mockMemory = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(true),
      search: vi.fn().mockResolvedValue([]),
      clear: vi.fn().mockResolvedValue(undefined),
      keys: vi.fn().mockResolvedValue([]),
      has: vi.fn().mockResolvedValue(false),
      size: vi.fn().mockResolvedValue(0),
    } as unknown as MemoryBackend;

    // Create mock generator factory
    mockGeneratorFactory = {
      create: vi.fn().mockReturnValue({
        framework: 'vitest',
        generateTests: vi.fn().mockReturnValue('// Generated test code'),
        generateFunctionTests: vi.fn(),
        generateClassTests: vi.fn(),
        generateStubTests: vi.fn(),
        generateCoverageTests: vi.fn().mockReturnValue('// Coverage test'),
      }),
      supports: vi.fn().mockReturnValue(true),
      getDefault: vi.fn().mockReturnValue('vitest'),
    };

    // Create mock TDD generator
    mockTDDGenerator = {
      generateTDDTests: vi.fn().mockResolvedValue({
        phase: 'red',
        testCode: '// TDD test',
        nextStep: 'Write implementation',
      }),
    };

    // Create mock property test generator
    mockPropertyGenerator = {
      generatePropertyTests: vi.fn().mockResolvedValue({
        tests: [],
        arbitraries: [],
      }),
    };

    // Create mock test data generator
    mockDataGenerator = {
      generateTestData: vi.fn().mockResolvedValue({
        records: [],
        schema: {},
        seed: 12345,
      }),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Factory Functions', () => {
    it('should create service with default dependencies using factory', async () => {
      const service = createTestGeneratorService(mockMemory);
      expect(service).toBeInstanceOf(TestGeneratorService);
    });

    it('should create service with custom dependencies using factory', async () => {
      const dependencies: TestGeneratorDependencies = {
        memory: mockMemory,
        generatorFactory: mockGeneratorFactory,
        tddGenerator: mockTDDGenerator,
        propertyTestGenerator: mockPropertyGenerator,
        testDataGenerator: mockDataGenerator,
      };

      const service = createTestGeneratorServiceWithDependencies(dependencies);
      expect(service).toBeInstanceOf(TestGeneratorService);
    });

    it('should allow partial dependency injection with defaults', async () => {
      const dependencies: TestGeneratorDependencies = {
        memory: mockMemory,
        tddGenerator: mockTDDGenerator, // Only override TDD generator
        // Others will use defaults
      };

      const service = createTestGeneratorServiceWithDependencies(dependencies);
      expect(service).toBeInstanceOf(TestGeneratorService);
    });
  });

  describe('Dependency Injection Pattern', () => {
    it('should use injected generator factory', async () => {
      const dependencies: TestGeneratorDependencies = {
        memory: mockMemory,
        generatorFactory: mockGeneratorFactory,
      };

      const service = createTestGeneratorServiceWithDependencies(dependencies);

      const result = await service.generateForCoverageGap(
        'test.ts',
        [10, 11, 12],
        'vitest'
      );

      expect(result.success).toBe(true);
      expect(mockGeneratorFactory.create).toHaveBeenCalledWith('vitest');
    });

    it('should use injected TDD generator', async () => {
      const dependencies: TestGeneratorDependencies = {
        memory: mockMemory,
        tddGenerator: mockTDDGenerator,
      };

      const service = createTestGeneratorServiceWithDependencies(dependencies);

      const result = await service.generateTDDTests({
        feature: 'user authentication',
        behavior: 'should validate email format',
        framework: 'vitest',
        phase: 'red',
      });

      expect(result.success).toBe(true);
      expect(mockTDDGenerator.generateTDDTests).toHaveBeenCalled();
    });

    it('should use injected property test generator', async () => {
      const dependencies: TestGeneratorDependencies = {
        memory: mockMemory,
        propertyTestGenerator: mockPropertyGenerator,
      };

      const service = createTestGeneratorServiceWithDependencies(dependencies);

      const result = await service.generatePropertyTests({
        function: 'reverse',
        properties: ['reversing twice returns original'],
        constraints: {},
      });

      expect(result.success).toBe(true);
      expect(mockPropertyGenerator.generatePropertyTests).toHaveBeenCalled();
    });

    it('should use injected test data generator', async () => {
      const dependencies: TestGeneratorDependencies = {
        memory: mockMemory,
        testDataGenerator: mockDataGenerator,
      };

      const service = createTestGeneratorServiceWithDependencies(dependencies);

      const result = await service.generateTestData({
        schema: { name: 'string', age: 'number' },
        count: 10,
      });

      expect(result.success).toBe(true);
      expect(mockDataGenerator.generateTestData).toHaveBeenCalled();
    });
  });

  describe('Configuration Overrides', () => {
    it('should accept custom configuration', () => {
      const service = createTestGeneratorService(mockMemory, {
        defaultFramework: 'jest',
        maxTestsPerFile: 100,
        coverageTargetDefault: 90,
        enableAIGeneration: false,
      });

      expect(service).toBeInstanceOf(TestGeneratorService);
    });

    it('should merge partial configuration with defaults', () => {
      const service = createTestGeneratorService(mockMemory, {
        maxTestsPerFile: 25, // Override only this
      });

      expect(service).toBeInstanceOf(TestGeneratorService);
    });
  });

  describe('Benefits of DI Pattern', () => {
    it('enables testing with mock dependencies', async () => {
      // This test demonstrates the key benefit of DI:
      // We can inject mock dependencies to isolate the service under test

      const dependencies: TestGeneratorDependencies = {
        memory: mockMemory,
        generatorFactory: mockGeneratorFactory,
        tddGenerator: mockTDDGenerator,
        propertyTestGenerator: mockPropertyGenerator,
        testDataGenerator: mockDataGenerator,
      };

      const service = createTestGeneratorServiceWithDependencies(dependencies);

      // All internal operations now use our mocks, making testing predictable
      const result = await service.generateTDDTests({
        feature: 'test feature',
        behavior: 'test behavior',
        framework: 'vitest',
        phase: 'red',
      });

      expect(result.success).toBe(true);
      expect(mockTDDGenerator.generateTDDTests).toHaveBeenCalledOnce();
    });

    it('enables swapping implementations at runtime', async () => {
      // Alternative TDD generator implementation
      const alternativeTDDGenerator: ITDDGeneratorService = {
        generateTDDTests: vi.fn().mockResolvedValue({
          phase: 'green',
          implementationCode: '// Alternative implementation',
          nextStep: 'Refactor',
        }),
      };

      const dependencies: TestGeneratorDependencies = {
        memory: mockMemory,
        tddGenerator: alternativeTDDGenerator,
      };

      const service = createTestGeneratorServiceWithDependencies(dependencies);

      const result = await service.generateTDDTests({
        feature: 'payment processing',
        behavior: 'should handle card validation',
        framework: 'vitest',
        phase: 'green',
      });

      expect(result.success).toBe(true);
      expect(alternativeTDDGenerator.generateTDDTests).toHaveBeenCalled();
    });
  });
});
