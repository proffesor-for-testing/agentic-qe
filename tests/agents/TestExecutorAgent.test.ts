/**
 * Comprehensive test suite for TestExecutorAgent
 * Tests parallel execution, retry logic, and sublinear optimization
 */

import { TestExecutorAgent, TestExecutorConfig } from '../../src/agents/TestExecutorAgent';
import { EventEmitter } from 'events';
import {
  AgentType,
  AgentContext,
  QETask,
  TaskAssignment,
  TestSuite,
  Test,
  TestType,
  QETestResult
} from '../../src/types';

// Mock MemoryStore implementation
class MockMemoryStore {
  private data = new Map<string, any>();

  async store(key: string, value: any, ttl?: number): Promise<void> {
    this.data.set(key, { value, ttl, timestamp: Date.now() });
  }

  async retrieve(key: string): Promise<any> {
    const item = this.data.get(key);
    return item ? item.value : undefined;
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }
}

describe('TestExecutorAgent', () => {
  let mockMemoryStore: MockMemoryStore;
  let mockEventBus: EventEmitter;
  let testExecutorConfig: TestExecutorConfig;
  let testExecutor: TestExecutorAgent;

  const testContext: AgentContext = {
    id: 'test-executor-context',
    type: 'test-executor' as AgentType,
    status: 'idle',
    metadata: { environment: 'test' }
  };

  beforeEach(() => {
    mockMemoryStore = new MockMemoryStore();
    mockEventBus = new EventEmitter();

    testExecutorConfig = {
      id: 'test-executor-1',
      type: 'test-executor' as AgentType,
      capabilities: [],
      context: testContext,
      memoryStore: mockMemoryStore,
      eventBus: mockEventBus,
      frameworks: ['jest', 'cypress', 'playwright'],
      maxParallelTests: 4,
      timeout: 30000,
      reportFormat: 'json',
      retryAttempts: 3,
      retryBackoff: 1000,
      sublinearOptimization: true
    };

    testExecutor = new TestExecutorAgent(testExecutorConfig);
  });

  afterEach(async () => {
    if (testExecutor.getStatus().status !== 'terminated') {
      await testExecutor.terminate();
    }
  });

  describe('Initialization', () => {
    test('should initialize with correct capabilities', async () => {
      await testExecutor.initialize();

      const status = testExecutor.getStatus();
      expect(status.capabilities).toContain('parallel-test-execution');
      expect(status.capabilities).toContain('test-framework-support');
      expect(status.capabilities).toContain('intelligent-retry');
    });

    test('should validate supported frameworks', async () => {
      await testExecutor.initialize();

      expect(testExecutor.hasCapability('test-framework-support')).toBe(true);
      const capability = testExecutor.getCapability('test-framework-support');
      expect(capability?.parameters.frameworks).toContain('jest');
      expect(capability?.parameters.frameworks).toContain('cypress');
    });
  });

  describe('Parallel Test Execution', () => {
    beforeEach(async () => {
      await testExecutor.initialize();
    });

    test('should execute tests in parallel', async () => {
      const testSuite: TestSuite = {
        id: 'parallel-suite',
        name: 'Parallel Test Suite',
        tests: [
          {
            id: 'test-1',
            name: 'Unit Test 1',
            type: 'unit' as TestType,
            parameters: [],
            assertions: ['expect(true).toBe(true)'],
            expectedResult: true
          },
          {
            id: 'test-2',
            name: 'Unit Test 2',
            type: 'unit' as TestType,
            parameters: [],
            assertions: ['expect(1 + 1).toBe(2)'],
            expectedResult: 2
          },
          {
            id: 'test-3',
            name: 'Integration Test',
            type: 'integration' as TestType,
            parameters: [],
            assertions: ['expect(api.status).toBe(200)'],
            expectedResult: 200
          }
        ],
        metadata: {
          generatedAt: new Date(),
          coverageTarget: 80,
          framework: 'jest',
          estimatedDuration: 5000
        }
      };

      const task: QETask = {
        id: 'parallel-execution-task',
        type: 'parallel-test-execution',
        payload: { testSuite, maxParallel: 3 },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'parallel-assignment',
        task,
        agentId: testExecutor.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const startTime = Date.now();
      const result = await testExecutor.executeTask(assignment);
      const executionTime = Date.now() - startTime;

      expect(result.results).toHaveLength(3);
      expect(result.totalTime).toBeGreaterThan(0);
      expect(result.parallelEfficiency).toBeGreaterThan(0);
      expect(executionTime).toBeLessThan(10000); // Should be faster than sequential
    });

    test('should apply sublinear optimization', async () => {
      const testSuite: TestSuite = {
        id: 'optimization-suite',
        name: 'Optimization Test Suite',
        tests: Array.from({ length: 10 }, (_, i) => ({
          id: `test-${i}`,
          name: `Test ${i}`,
          type: 'unit' as TestType,
          parameters: [],
          assertions: [`expect(${i}).toBeDefined()`],
          expectedResult: i
        })),
        metadata: {
          generatedAt: new Date(),
          coverageTarget: 80,
          framework: 'jest',
          estimatedDuration: 10000
        }
      };

      const task: QETask = {
        id: 'optimization-task',
        type: 'parallel-test-execution',
        payload: { testSuite, optimizationLevel: 'sublinear' },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'optimization-assignment',
        task,
        agentId: testExecutor.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await testExecutor.executeTask(assignment);

      expect(result.optimizationApplied).toBe(true);
      expect(result.results.length).toBeGreaterThan(0);
    });
  });

  describe('Intelligent Retry Logic', () => {
    beforeEach(async () => {
      await testExecutor.initialize();
    });

    test('should retry failed tests with exponential backoff', async () => {
      // Mock a test that fails initially but succeeds on retry
      let attemptCount = 0;
      const originalExecuteTestInternal = (testExecutor as any).executeSingleTestInternal;

      (testExecutor as any).executeSingleTestInternal = jest.fn().mockImplementation(async (test: Test) => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('TIMEOUT'); // Retryable error
        }
        return originalExecuteTestInternal.call(testExecutor, test);
      });

      const test: Test = {
        id: 'retry-test',
        name: 'Retry Test',
        type: 'unit' as TestType,
        parameters: [],
        assertions: ['expect(true).toBe(true)'],
        expectedResult: true
      };

      const task: QETask = {
        id: 'retry-task',
        type: 'single-test-execution',
        payload: { test },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'retry-assignment',
        task,
        agentId: testExecutor.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await testExecutor.executeTask(assignment);

      expect(result.status).toBe('passed');
      expect(attemptCount).toBeGreaterThan(1);
    });

    test('should not retry non-retryable errors', async () => {
      let attemptCount = 0;
      (testExecutor as any).executeSingleTestInternal = jest.fn().mockImplementation(async () => {
        attemptCount++;
        throw new Error('SYNTAX_ERROR'); // Non-retryable error
      });

      const test: Test = {
        id: 'no-retry-test',
        name: 'No Retry Test',
        type: 'unit' as TestType,
        parameters: [],
        assertions: ['expect(true).toBe(true)'],
        expectedResult: true
      };

      const task: QETask = {
        id: 'no-retry-task',
        type: 'single-test-execution',
        payload: { test },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'no-retry-assignment',
        task,
        agentId: testExecutor.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await expect(testExecutor.executeTask(assignment)).rejects.toThrow('SYNTAX_ERROR');
      expect(attemptCount).toBe(1);
    });
  });

  describe('Test Discovery and Analysis', () => {
    beforeEach(async () => {
      await testExecutor.initialize();
    });

    test('should discover tests in directory', async () => {
      const task: QETask = {
        id: 'discovery-task',
        type: 'test-discovery',
        payload: { searchPath: './test-directory' },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'discovery-assignment',
        task,
        agentId: testExecutor.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await testExecutor.executeTask(assignment);

      expect(result.searchPath).toBe('./test-directory');
      expect(result.total).toBeGreaterThan(0);
      expect(result.discovered).toBeDefined();
      expect(result.discovered.unitTests).toBeGreaterThan(0);
    });

    test('should analyze test quality', async () => {
      const task: QETask = {
        id: 'analysis-task',
        type: 'test-analysis',
        payload: { testPath: './test-files' },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'analysis-assignment',
        task,
        agentId: testExecutor.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await testExecutor.executeTask(assignment);

      expect(result.analysis).toBeDefined();
      expect(result.analysis.coverage).toBeGreaterThan(0);
      expect(result.analysis.complexity).toBeGreaterThan(0);
      expect(result.score).toBeGreaterThan(0);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await testExecutor.initialize();
    });

    test('should handle unsupported task types', async () => {
      const task: QETask = {
        id: 'unsupported-task',
        type: 'unsupported-type',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'unsupported-assignment',
        task,
        agentId: testExecutor.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await expect(testExecutor.executeTask(assignment)).rejects.toThrow('Unsupported task type');
    });

    test('should handle memory storage errors gracefully', async () => {
      // Mock memory store that fails
      const failingStore = {
        store: jest.fn().mockRejectedValue(new Error('Storage failed')),
        retrieve: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(true),
        clear: jest.fn().mockResolvedValue(undefined)
      };

      const failingExecutor = new TestExecutorAgent({
        ...testExecutorConfig,
        memoryStore: failingStore
      });

      await failingExecutor.initialize();

      const testSuite: TestSuite = {
        id: 'error-suite',
        name: 'Error Test Suite',
        tests: [{
          id: 'error-test',
          name: 'Error Test',
          type: 'unit' as TestType,
          parameters: [],
          assertions: [],
          expectedResult: true
        }],
        metadata: {
          generatedAt: new Date(),
          coverageTarget: 80,
          framework: 'jest',
          estimatedDuration: 1000
        }
      };

      const task: QETask = {
        id: 'error-task',
        type: 'parallel-test-execution',
        payload: { testSuite },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'error-assignment',
        task,
        agentId: failingExecutor.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      // Should not throw despite storage errors
      const result = await failingExecutor.executeTask(assignment);
      expect(result.results).toBeDefined();

      await failingExecutor.terminate();
    });
  });

  describe('Performance Tracking', () => {
    beforeEach(async () => {
      await testExecutor.initialize();
    });

    test('should track execution metrics', async () => {
      const task: QETask = {
        id: 'metrics-task',
        type: 'single-test-execution',
        payload: {
          test: {
            id: 'metrics-test',
            name: 'Metrics Test',
            type: 'unit' as TestType,
            parameters: [],
            assertions: ['expect(true).toBe(true)'],
            expectedResult: true
          }
        },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'metrics-assignment',
        task,
        agentId: testExecutor.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const initialMetrics = testExecutor.getStatus().performanceMetrics;
      await testExecutor.executeTask(assignment);
      const updatedMetrics = testExecutor.getStatus().performanceMetrics;

      expect(updatedMetrics.tasksCompleted).toBe(initialMetrics.tasksCompleted + 1);
      expect(updatedMetrics.averageExecutionTime).toBeGreaterThan(0);
    });

    test('should emit batch completion events', (done) => {
      mockEventBus.on('test-batch-completed', (event) => {
        expect(event.data.batchSize).toBeGreaterThan(0);
        expect(event.data.totalCompleted).toBeGreaterThan(0);
        expect(event.data.agentId).toBe(testExecutor.getStatus().agentId.id);
        done();
      });

      // Trigger batch completion by calling the internal method
      (testExecutor as any).reportBatchCompletion(2, 5);
    });
  });

  describe('Configuration Validation', () => {
    test('should handle invalid framework configuration', async () => {
      const invalidConfig = {
        ...testExecutorConfig,
        frameworks: ['invalid-framework']
      };

      const invalidExecutor = new TestExecutorAgent(invalidConfig);

      await expect(invalidExecutor.initialize()).rejects.toThrow('Unsupported test framework');
    });

    test('should use default configuration values', () => {
      const minimalConfig = {
        id: 'minimal-executor',
        type: 'test-executor' as AgentType,
        capabilities: [],
        context: testContext,
        memoryStore: mockMemoryStore,
        eventBus: mockEventBus,
        frameworks: [],
        maxParallelTests: 0,
        timeout: 0,
        reportFormat: 'json' as const,
        retryAttempts: 0,
        retryBackoff: 0,
        sublinearOptimization: false
      };

      const executor = new TestExecutorAgent(minimalConfig);
      const capability = executor.getCapability('parallel-test-execution');

      expect(capability?.parameters.maxParallelTests).toBe(8); // Default value
      expect(capability?.parameters.retryAttempts).toBe(3); // Default value
    });
  });
});