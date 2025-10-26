/**
 * TestGeneratorAgent Unit Tests - Comprehensive TDD Implementation
 * Testing the TestGeneratorAgent with full coverage
 */

import { TestGeneratorAgent } from '@agents/TestGeneratorAgent';
import { EventBus } from '@core/EventBus';
import { Task, TaskStatus } from '@core/Task';
import { Logger } from '@utils/Logger';

// Mock dependencies
jest.mock('@utils/Logger');
jest.mock('@core/EventBus');

describe('TestGeneratorAgent', () => {
  let agent: TestGeneratorAgent;
  let mockEventBus: jest.Mocked<EventBus>;
  let mockLogger: jest.Mocked<Logger>;
  let mockMemoryStore: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockEventBus = {
      emit: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      initialize: jest.fn().mockResolvedValue(undefined),
      emitFleetEvent: jest.fn().mockResolvedValue('event-id'),
      getEvent: jest.fn()
    } as any;

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      getInstance: jest.fn().mockReturnValue(mockLogger)
    } as any;

    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);

    const config = {
      framework: 'jest',
      typescript: true,
      coverage: { threshold: 80 },
      mocking: { strategy: 'auto' }
    };

    mockMemoryStore = {
      store: jest.fn().mockResolvedValue(undefined),
      retrieve: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
      has: jest.fn().mockResolvedValue(false),
      keys: jest.fn().mockResolvedValue([])
    };

    const agentConfig = {
      id: 'test-gen-123',
      type: 'test-generator' as any,
      capabilities: [],
      context: {
        id: 'test-context',
        type: 'test',
        status: 'ACTIVE' as any,
        metadata: { environment: 'test' }
      },
      memoryStore: mockMemoryStore as any,
      eventBus: mockEventBus
    };

    agent = new TestGeneratorAgent(agentConfig);
  });

  describe('Initialization', () => {
    it('should initialize with Jest framework capabilities', async () => {
      await agent.initialize();

      const capabilities = agent.getCapabilities();
      expect(capabilities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'jest-test-generation',
            taskTypes: expect.arrayContaining(['unit-test-generation', 'mock-generation'])
          })
        ])
      );
    });

    it('should initialize with TypeScript support when configured', async () => {
      await agent.initialize();

      const capabilities = agent.getCapabilities();
      const jestCapability = capabilities.find((cap: any) => cap.name === 'jest-test-generation');

      expect(jestCapability?.description).toContain('TypeScript');
    });

    it('should set up coverage monitoring capabilities', async () => {
      await agent.initialize();

      const capabilities = agent.getCapabilities();
      expect(capabilities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'coverage-analysis',
            taskTypes: expect.arrayContaining(['coverage-reporting'])
          })
        ])
      );
    });
  });

  describe('Task Execution', () => {
    beforeEach(async () => {
      await agent.initialize();
      await agent.start();
    });

    it('should generate unit tests for source code', async () => {
      const task = {
        getId: () => 'task-123',
        getType: () => 'unit-test-generation',
        getStatus: () => TaskStatus.CREATED,
        getData: () => ({
          sourceFile: '/src/utils/Calculator.ts',
          testFramework: 'jest',
          coverageTarget: 90
        })
      } as any;

      await agent.assignTask(task);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEventBus.emit).toHaveBeenCalledWith('task:completed',
        expect.objectContaining({
          agentId: 'test-gen-123',
          taskId: 'task-123',
          result: expect.objectContaining({
            testFile: expect.stringContaining('.test.ts'),
            testsGenerated: expect.any(Number),
            coverageEstimate: expect.any(Number)
          })
        })
      );
    });

    it('should generate mocks for dependencies', async () => {
      const task = {
        getId: () => 'task-mock-456',
        getType: () => 'mock-generation',
        getStatus: () => TaskStatus.CREATED,
        getData: () => ({
          targetModule: '/src/services/UserService.ts',
          dependencies: ['Database', 'Logger', 'EmailService'],
          mockStrategy: 'jest'
        })
      } as any;

      await agent.assignTask(task);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEventBus.emit).toHaveBeenCalledWith('task:completed',
        expect.objectContaining({
          result: expect.objectContaining({
            mocks: expect.arrayContaining([
              expect.objectContaining({
                module: 'Database',
                mockCode: expect.any(String)
              })
            ])
          })
        })
      );
    });

    it('should handle complex class testing scenarios', async () => {
      const task = {
        getId: () => 'task-class-789',
        getType: () => 'unit-test-generation',
        getStatus: () => TaskStatus.CREATED,
        getData: () => ({
          sourceFile: '/src/core/FleetManager.ts',
          testType: 'class',
          methods: ['initialize', 'spawnAgent', 'submitTask'],
          includePrivateMethods: false,
          mockDependencies: true
        })
      } as any;

      await agent.assignTask(task);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEventBus.emit).toHaveBeenCalledWith('task:completed',
        expect.objectContaining({
          result: expect.objectContaining({
            testSuites: expect.arrayContaining([
              expect.objectContaining({
                describe: 'FleetManager',
                tests: expect.any(Array)
              })
            ])
          })
        })
      );
    });

    it('should generate edge case tests', async () => {
      const task = {
        getId: () => 'task-edge-101',
        getType: () => 'unit-test-generation',
        getStatus: () => TaskStatus.CREATED,
        getData: () => ({
          sourceFile: '/src/utils/Validator.ts',
          includeEdgeCases: true,
          edgeCaseTypes: ['null', 'undefined', 'empty', 'boundary']
        })
      } as any;

      await agent.assignTask(task);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEventBus.emit).toHaveBeenCalledWith('task:completed',
        expect.objectContaining({
          result: expect.objectContaining({
            edgeCaseTests: expect.arrayContaining([
              expect.objectContaining({
                scenario: expect.stringMatching(/null|undefined|empty|boundary/),
                testCode: expect.any(String)
              })
            ])
          })
        })
      );
    });
  });

  describe('Test Generation Patterns', () => {
    beforeEach(async () => {
      await agent.initialize();
      await agent.start();
    });

    it('should follow TDD London School patterns', async () => {
      const task = {
        getId: () => 'task-london-202',
        getType: () => 'unit-test-generation',
        getStatus: () => TaskStatus.CREATED,
        getData: () => ({
          sourceFile: '/src/services/PaymentService.ts',
          testingApproach: 'london-school',
          focusOnInteractions: true
        })
      } as any;

      await agent.assignTask(task);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEventBus.emit).toHaveBeenCalledWith('task:completed',
        expect.objectContaining({
          result: expect.objectContaining({
            testingStyle: 'london-school',
            interactionTests: expect.any(Array),
            mockUsage: 'extensive'
          })
        })
      );
    });

    it('should generate AAA pattern tests', async () => {
      const task = {
        getId: () => 'task-aaa-303',
        getType: () => 'unit-test-generation',
        getStatus: () => TaskStatus.CREATED,
        getData: () => ({
          sourceFile: '/src/utils/StringHelper.ts',
          testPattern: 'arrange-act-assert',
          includeComments: true
        })
      } as any;

      await agent.assignTask(task);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEventBus.emit).toHaveBeenCalledWith('task:completed',
        expect.objectContaining({
          result: expect.objectContaining({
            testStructure: 'arrange-act-assert',
            commentedSections: true
          })
        })
      );
    });
  });

  describe('Coverage Analysis', () => {
    beforeEach(async () => {
      await agent.initialize();
      await agent.start();
    });

    it('should analyze and report coverage gaps', async () => {
      const task = {
        getId: () => 'task-coverage-404',
        getType: () => 'coverage-reporting',
        getStatus: () => TaskStatus.CREATED,
        getData: () => ({
          sourceFiles: ['/src/core/*.ts'],
          existingTests: ['/tests/core/*.test.ts'],
          targetCoverage: 85
        })
      } as any;

      await agent.assignTask(task);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEventBus.emit).toHaveBeenCalledWith('task:completed',
        expect.objectContaining({
          result: expect.objectContaining({
            currentCoverage: expect.any(Number),
            coverageGaps: expect.any(Array),
            suggestedTests: expect.any(Array)
          })
        })
      );
    });

    it('should suggest tests to reach coverage targets', async () => {
      const task = {
        getId: () => 'task-suggestions-505',
        getType: () => 'coverage-reporting',
        getStatus: () => TaskStatus.CREATED,
        getData: () => ({
          sourceFile: '/src/agents/TestExecutorAgent.ts',
          currentCoverage: 65,
          targetCoverage: 90,
          uncoveredLines: [23, 45, 67, 89]
        })
      } as any;

      await agent.assignTask(task);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEventBus.emit).toHaveBeenCalledWith('task:completed',
        expect.objectContaining({
          result: expect.objectContaining({
            testSuggestions: expect.arrayContaining([
              expect.objectContaining({
                line: expect.any(Number),
                suggestedTest: expect.any(String),
                priority: expect.stringMatching(/high|medium|low/)
              })
            ])
          })
        })
      );
    });
  });

  describe('Error Handling and Edge Cases', () => {
    beforeEach(async () => {
      await agent.initialize();
      await agent.start();
    });

    it('should handle malformed source files gracefully', async () => {
      const task = {
        getId: () => 'task-malformed-606',
        getType: () => 'unit-test-generation',
        getStatus: () => TaskStatus.CREATED,
        getData: () => ({
          sourceFile: '/non/existent/file.ts',
          testFramework: 'jest'
        })
      } as any;

      await agent.assignTask(task);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEventBus.emit).toHaveBeenCalledWith('task:failed',
        expect.objectContaining({
          agentId: 'test-gen-123',
          taskId: 'task-malformed-606',
          error: expect.any(Error)
        })
      );
    });

    it('should handle unsupported test frameworks', async () => {
      const task = {
        getId: () => 'task-unsupported-707',
        getType: () => 'unit-test-generation',
        getStatus: () => TaskStatus.CREATED,
        getData: () => ({
          sourceFile: '/src/utils/Helper.ts',
          testFramework: 'unsupported-framework'
        })
      } as any;

      await agent.assignTask(task);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEventBus.emit).toHaveBeenCalledWith('task:failed',
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('Unsupported test framework')
          })
        })
      );
    });

    it('should handle circular dependencies in mocking', async () => {
      const task = {
        getId: () => 'task-circular-808',
        getType: () => 'mock-generation',
        getStatus: () => TaskStatus.CREATED,
        getData: () => ({
          targetModule: '/src/services/ServiceA.ts',
          dependencies: [
            { name: 'ServiceB', imports: ['ServiceA'] },
            { name: 'ServiceC', imports: ['ServiceB'] }
          ]
        })
      } as any;

      await agent.assignTask(task);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEventBus.emit).toHaveBeenCalledWith('task:completed',
        expect.objectContaining({
          result: expect.objectContaining({
            warnings: expect.arrayContaining([
              expect.stringContaining('circular dependency')
            ])
          })
        })
      );
    });
  });

  describe('Performance and Optimization', () => {
    beforeEach(async () => {
      await agent.initialize();
      await agent.start();
    });

    it('should handle large files efficiently', async () => {
      const task = {
        getId: () => 'task-large-909',
        getType: () => 'unit-test-generation',
        getStatus: () => TaskStatus.CREATED,
        getData: () => ({
          sourceFile: '/src/large/LargeClass.ts',
          methods: Array.from({ length: 50 }, (_, i) => `method${i}`),
          lineCount: 2000
        })
      } as any;

      const startTime = Date.now();
      await agent.assignTask(task);
      await new Promise(resolve => setTimeout(resolve, 50));
      const endTime = Date.now();

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(1000);

      expect(mockEventBus.emit).toHaveBeenCalledWith('task:completed',
        expect.objectContaining({
          result: expect.objectContaining({
            testsGenerated: expect.any(Number),
            processingTime: expect.any(Number)
          })
        })
      );
    });

    it('should optimize test generation for similar patterns', async () => {
      const tasks = Array.from({ length: 5 }, (_, i) => ({
        getId: () => `task-pattern-${1000 + i}`,
        getType: () => 'unit-test-generation',
        getStatus: () => TaskStatus.CREATED,
        getData: () => ({
          sourceFile: `/src/utils/Utility${i}.ts`,
          pattern: 'utility-class'
        })
      }));

      for (const task of tasks) {
        await agent.assignTask(task as any);
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      // Should reuse patterns for efficiency
      expect(mockEventBus.emit).toHaveBeenCalledTimes(tasks.length);
    });
  });

  describe('Configuration and Customization', () => {
    it('should respect framework configuration', async () => {
      const customConfig = {
        framework: 'vitest',
        typescript: true,
        coverage: { threshold: 95 },
        customMatchers: ['toBeWithinRange', 'toBeValidEmail']
      };

      const customAgentConfig = {
        id: 'custom-gen-456',
        type: 'test-generator' as any,
        capabilities: [],
        context: {
          id: 'custom-context',
          type: 'test',
          status: 'ACTIVE' as any,
          metadata: { environment: 'test' }
        },
        memoryStore: mockMemoryStore as any,
        eventBus: mockEventBus
      };

      const customAgent = new TestGeneratorAgent(customAgentConfig);

      await customAgent.initialize();

      const capabilities = customAgent.getCapabilities();
      const frameworkCapability = capabilities.find(cap => cap.name.includes('vitest'));

      expect(frameworkCapability).toBeDefined();
      expect(frameworkCapability?.description).toContain('vitest');
    });

    it('should adapt to different testing strategies', async () => {
      const strategyConfig = {
        framework: 'jest',
        strategy: 'behavior-driven',
        includeIntegrationHints: true,
        testNaming: 'descriptive'
      };

      const strategyAgentConfig = {
        id: 'strategy-gen-789',
        type: 'test-generator' as any,
        capabilities: [],
        context: {
          id: 'strategy-context',
          type: 'test',
          status: 'ACTIVE' as any,
          metadata: { environment: 'test' }
        },
        memoryStore: mockMemoryStore as any,
        eventBus: mockEventBus
      };

      const strategyAgent = new TestGeneratorAgent(strategyAgentConfig);

      await strategyAgent.initialize();
      await strategyAgent.start();

      const task = {
        getId: () => 'task-strategy-111',
        getType: () => 'unit-test-generation',
        getStatus: () => TaskStatus.CREATED,
        getData: () => ({
          sourceFile: '/src/services/UserService.ts',
          behaviorContext: 'user registration flow'
        })
      } as any;

      await strategyAgent.assignTask(task);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEventBus.emit).toHaveBeenCalledWith('task:completed',
        expect.objectContaining({
          result: expect.objectContaining({
            testStyle: 'behavior-driven',
            integrationHints: expect.any(Array)
          })
        })
      );
    });
  });
});