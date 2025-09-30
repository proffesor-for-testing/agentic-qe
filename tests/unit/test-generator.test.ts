import { jest } from '@jest/globals';
import { TestGenerator, TestType, Framework } from '../../src/core/test-generator';
import { CodeAnalyzer } from '../../src/analysis/code-analyzer';
import { AITestDesigner } from '../../src/ai/ai-test-designer';
import { TestTemplate } from '../../src/templates/test-template';
import { CoverageRequirements } from '../../src/types/coverage';

// London School TDD: Mock all collaborators
const mockCodeAnalyzer = {
  analyzeCode: jest.fn(),
  extractFunctions: jest.fn(),
  identifyEdgeCases: jest.fn(),
  calculateComplexity: jest.fn()
} as jest.Mocked<CodeAnalyzer>;

const mockAITestDesigner = {
  generateTestCases: jest.fn(),
  optimizeTestSuite: jest.fn(),
  predictTestEffectiveness: jest.fn(),
  learnFromResults: jest.fn()
} as jest.Mocked<AITestDesigner>;

const mockTestTemplate = {
  generateTemplate: jest.fn(),
  applyFrameworkPatterns: jest.fn(),
  insertAssertions: jest.fn(),
  formatCode: jest.fn()
} as jest.Mocked<TestTemplate>;

const mockFileSystem = {
  readFile: jest.fn(),
  writeFile: jest.fn(),
  createDirectory: jest.fn(),
  exists: jest.fn()
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

describe('TestGenerator - London School TDD', () => {
  let testGenerator: TestGenerator;
  
  beforeEach(() => {
    jest.clearAllMocks();
    testGenerator = new TestGenerator({
      codeAnalyzer: mockCodeAnalyzer,
      aiTestDesigner: mockAITestDesigner,
      testTemplate: mockTestTemplate,
      fileSystem: mockFileSystem,
      logger: mockLogger
    });
  });

  describe('Unit Test Generation', () => {
    const sourceCode = `
      export class UserService {
        constructor(private userRepo: UserRepository) {}
        
        async createUser(userData: UserData): Promise<User> {
          if (!userData.email) {
            throw new Error('Email required');
          }
          return this.userRepo.save(userData);
        }
      }
    `;

    const mockAnalysisResult = {
      functions: [{
        name: 'createUser',
        parameters: ['userData'],
        returnType: 'Promise<User>',
        complexity: 3,
        edgeCases: ['null email', 'invalid email', 'duplicate email']
      }],
      dependencies: ['UserRepository'],
      testingPatterns: ['async', 'validation', 'error-handling']
    };

    beforeEach(() => {
      mockCodeAnalyzer.analyzeCode.mockResolvedValue(mockAnalysisResult);
      mockAITestDesigner.generateTestCases.mockResolvedValue([
        {
          name: 'should create user with valid data',
          type: 'success-case',
          setup: 'validUserData',
          assertions: ['user created', 'repository called']
        },
        {
          name: 'should throw error for missing email',
          type: 'error-case',
          setup: 'invalidUserData',
          assertions: ['error thrown', 'repository not called']
        }
      ]);
      mockTestTemplate.generateTemplate.mockReturnValue('generated test code');
    });

    it('should generate comprehensive Jest unit tests', async () => {
      const config = {
        target: sourceCode,
        framework: Framework.JEST,
        testType: TestType.UNIT,
        coverageRequirements: {
          line: 90,
          branch: 85,
          function: 100
        } as CoverageRequirements
      };

      const result = await testGenerator.generate(config);

      // Verify collaboration sequence (London School focus)
      expect(mockCodeAnalyzer.analyzeCode).toHaveBeenCalledWith(sourceCode);
      expect(mockAITestDesigner.generateTestCases).toHaveBeenCalledWith(
        mockAnalysisResult,
        expect.objectContaining({ framework: Framework.JEST })
      );
      expect(mockTestTemplate.generateTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ framework: Framework.JEST })
      );

      // Verify result structure
      expect(result).toEqual({
        success: true,
        testCode: 'generated test code',
        coverage: expect.objectContaining({
          estimated: expect.any(Number)
        }),
        testCount: expect.any(Number),
        framework: Framework.JEST
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Generated unit tests for target with Jest framework'
      );
    });

    it('should handle TypeScript with mock generation', async () => {
      const config = {
        target: sourceCode,
        framework: Framework.JEST,
        testType: TestType.UNIT,
        language: 'typescript',
        mockStrategy: 'comprehensive'
      };

      await testGenerator.generate(config);

      // Verify TypeScript-specific interactions
      expect(mockCodeAnalyzer.analyzeCode).toHaveBeenCalledWith(
        sourceCode,
        expect.objectContaining({ language: 'typescript' })
      );
      expect(mockTestTemplate.generateTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          framework: Framework.JEST,
          language: 'typescript',
          includeMocks: true
        })
      );
    });

    it('should optimize test suite based on AI recommendations', async () => {
      mockAITestDesigner.optimizeTestSuite.mockResolvedValue({
        redundantTests: ['duplicate test'],
        missingCases: ['boundary condition'],
        improvements: ['add edge case for null input']
      });

      const config = {
        target: sourceCode,
        framework: Framework.JEST,
        testType: TestType.UNIT,
        optimize: true
      };

      const result = await testGenerator.generate(config);

      expect(mockAITestDesigner.optimizeTestSuite).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ target: sourceCode })
      );
      
      expect(result.optimizations).toEqual({
        redundantTests: ['duplicate test'],
        missingCases: ['boundary condition'],
        improvements: ['add edge case for null input']
      });
    });
  });

  describe('Integration Test Generation', () => {
    const apiSpec = {
      endpoints: [
        { path: '/users', method: 'POST', schema: 'CreateUserSchema' },
        { path: '/users/:id', method: 'GET', schema: 'UserSchema' }
      ],
      dependencies: ['database', 'email-service']
    };

    beforeEach(() => {
      mockCodeAnalyzer.analyzeCode.mockResolvedValue({
        endpoints: apiSpec.endpoints,
        dependencies: apiSpec.dependencies,
        testingPatterns: ['api', 'database', 'external-service']
      });
    });

    it('should generate API integration tests', async () => {
      const config = {
        target: JSON.stringify(apiSpec),
        framework: Framework.SUPERTEST,
        testType: TestType.INTEGRATION,
        scope: 'api'
      };

      await testGenerator.generate(config);

      expect(mockAITestDesigner.generateTestCases).toHaveBeenCalledWith(
        expect.objectContaining({ endpoints: apiSpec.endpoints }),
        expect.objectContaining({ testType: TestType.INTEGRATION })
      );
      
      expect(mockTestTemplate.generateTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          framework: Framework.SUPERTEST,
          patterns: ['api-testing', 'response-validation']
        })
      );
    });

    it('should include database setup and teardown', async () => {
      const config = {
        target: JSON.stringify(apiSpec),
        framework: Framework.JEST,
        testType: TestType.INTEGRATION,
        includeDatabase: true
      };

      await testGenerator.generate(config);

      expect(mockTestTemplate.generateTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          includeSetup: true,
          setupPatterns: ['database-setup', 'test-data-seeding'],
          teardownPatterns: ['database-cleanup']
        })
      );
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid source code gracefully', async () => {
      mockCodeAnalyzer.analyzeCode.mockRejectedValue(
        new Error('Invalid syntax')
      );

      const config = {
        target: 'invalid code',
        framework: Framework.JEST,
        testType: TestType.UNIT
      };

      const result = await testGenerator.generate(config);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Code analysis failed: Invalid syntax');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Test generation failed: Invalid syntax'
      );
    });

    it('should retry AI generation on temporary failure', async () => {
      mockAITestDesigner.generateTestCases
        .mockRejectedValueOnce(new Error('AI service unavailable'))
        .mockResolvedValueOnce([{ name: 'test case', type: 'success' }]);

      const config = {
        target: 'valid code',
        framework: Framework.JEST,
        testType: TestType.UNIT,
        retryOnFailure: true
      };

      const result = await testGenerator.generate(config);

      expect(mockAITestDesigner.generateTestCases).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'AI test generation failed, retrying: AI service unavailable'
      );
    });

    it('should fallback to template-based generation when AI fails', async () => {
      mockAITestDesigner.generateTestCases.mockRejectedValue(
        new Error('AI service down')
      );
      mockTestTemplate.generateTemplate.mockReturnValue('template-based test');

      const config = {
        target: 'valid code',
        framework: Framework.JEST,
        testType: TestType.UNIT,
        fallbackToTemplate: true
      };

      const result = await testGenerator.generate(config);

      expect(result.success).toBe(true);
      expect(result.testCode).toBe('template-based test');
      expect(result.generationMethod).toBe('template-fallback');
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Using template-based fallback for test generation'
      );
    });
  });

  describe('Performance and Optimization', () => {
    it('should measure and report generation performance', async () => {
      const config = {
        target: 'performance test code',
        framework: Framework.JEST,
        testType: TestType.UNIT,
        measurePerformance: true
      };

      const startTime = Date.now();
      const result = await testGenerator.generate(config);

      expect(result.performance).toEqual({
        generationTime: expect.any(Number),
        analysisTime: expect.any(Number),
        aiTime: expect.any(Number),
        templateTime: expect.any(Number)
      });
      
      expect(result.performance.generationTime).toBeGreaterThan(0);
    });

    it('should cache analysis results for repeated targets', async () => {
      const config = {
        target: 'cached code',
        framework: Framework.JEST,
        testType: TestType.UNIT,
        useCache: true
      };

      // First generation
      await testGenerator.generate(config);
      
      // Second generation with same target
      await testGenerator.generate(config);

      // Verify cache hit
      expect(mockCodeAnalyzer.analyzeCode).toHaveBeenCalledTimes(1);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Using cached analysis for target'
      );
    });
  });

  describe('Framework-Specific Generation', () => {
    it('should generate Vitest tests with specific patterns', async () => {
      const config = {
        target: 'vitest target',
        framework: Framework.VITEST,
        testType: TestType.UNIT
      };

      await testGenerator.generate(config);

      expect(mockTestTemplate.generateTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          framework: Framework.VITEST,
          imports: ['vi', 'describe', 'it', 'expect'],
          mockingStrategy: 'vi.mock'
        })
      );
    });

    it('should generate Cypress E2E tests', async () => {
      const config = {
        target: 'cypress target',
        framework: Framework.CYPRESS,
        testType: TestType.E2E
      };

      await testGenerator.generate(config);

      expect(mockTestTemplate.generateTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          framework: Framework.CYPRESS,
          patterns: ['page-object', 'user-interactions', 'assertions'],
          includeSetup: true
        })
      );
    });
  });
});

// Contract tests for test generator
describe('TestGenerator Contracts', () => {
  it('should satisfy ITestGenerator interface', () => {
    expect(typeof testGenerator.generate).toBe('function');
    expect(typeof testGenerator.validateConfig).toBe('function');
    expect(typeof testGenerator.getSupportedFrameworks).toBe('function');
    expect(typeof testGenerator.estimateCoverage).toBe('function');
  });

  it('should maintain consistent result format across all generation types', async () => {
    const config = {
      target: 'test code',
      framework: Framework.JEST,
      testType: TestType.UNIT
    };

    const result = await testGenerator.generate(config);

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('testCode');
    expect(result).toHaveProperty('coverage');
    expect(result).toHaveProperty('testCount');
    expect(result).toHaveProperty('framework');
  });
});
