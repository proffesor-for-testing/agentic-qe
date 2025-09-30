import { jest } from '@jest/globals';
import { TestExecutor, ExecutionConfig, ExecutionStrategy } from '../../src/core/test-executor';
import { TestRunner } from '../../src/runners/test-runner';
import { ResourceManager } from '../../src/core/resource-manager';
import { ResultAggregator } from '../../src/core/result-aggregator';
import { FailureInvestigator } from '../../src/analysis/failure-investigator';

// London School TDD: Mock all dependencies for isolation
const mockTestRunner = {
  runTests: jest.fn(),
  getCapabilities: jest.fn(),
  isHealthy: jest.fn(),
  stop: jest.fn()
} as jest.Mocked<TestRunner>;

const mockResourceManager = {
  allocateResources: jest.fn(),
  releaseResources: jest.fn(),
  getAvailableResources: jest.fn(),
  monitorUsage: jest.fn()
} as jest.Mocked<ResourceManager>;

const mockResultAggregator = {
  aggregateResults: jest.fn(),
  generateReport: jest.fn(),
  calculateMetrics: jest.fn(),
  exportResults: jest.fn()
} as jest.Mocked<ResultAggregator>;

const mockFailureInvestigator = {
  investigateFailures: jest.fn(),
  categorizeFailures: jest.fn(),
  suggestFixes: jest.fn(),
  generateReport: jest.fn()
} as jest.Mocked<FailureInvestigator>;

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

const mockMetrics = {
  recordMetric: jest.fn(),
  incrementCounter: jest.fn(),
  recordTiming: jest.fn()
};

describe('TestExecutor - London School TDD', () => {
  let testExecutor: TestExecutor;
  
  beforeEach(() => {
    jest.clearAllMocks();
    testExecutor = new TestExecutor({
      testRunner: mockTestRunner,
      resourceManager: mockResourceManager,
      resultAggregator: mockResultAggregator,
      failureInvestigator: mockFailureInvestigator,
      logger: mockLogger,
      metrics: mockMetrics
    });
  });

  describe('Parallel Test Execution', () => {
    const testSuite = {
      id: 'suite-123',
      tests: [
        { id: 'test-1', file: 'user.test.ts', estimatedDuration: 2000 },
        { id: 'test-2', file: 'auth.test.ts', estimatedDuration: 3000 },
        { id: 'test-3', file: 'api.test.ts', estimatedDuration: 1500 },
        { id: 'test-4', file: 'db.test.ts', estimatedDuration: 4000 }
      ],
      totalTests: 4
    };

    beforeEach(() => {
      mockResourceManager.getAvailableResources.mockReturnValue({
        cpu: 80,
        memory: 8192,
        workers: 4
      });
      
      mockTestRunner.runTests.mockResolvedValue({
        success: true,
        results: [{ id: 'test-1', status: 'passed', duration: 1800 }],
        duration: 1800
      });
    });

    it('should execute tests in parallel with optimal resource allocation', async () => {
      const config: ExecutionConfig = {
        strategy: ExecutionStrategy.PARALLEL,
        maxParallelJobs: 4,
        timeout: 30000,
        retryFailedTests: true
      };

      const result = await testExecutor.execute(testSuite, config);

      // Verify resource allocation collaboration
      expect(mockResourceManager.allocateResources).toHaveBeenCalledWith({
        workers: 4,
        memoryPerWorker: expect.any(Number),
        cpuPerWorker: expect.any(Number)
      });

      // Verify parallel execution setup
      expect(mockTestRunner.runTests).toHaveBeenCalledTimes(4);
      
      // Verify each test execution call
      testSuite.tests.forEach((test, index) => {
        expect(mockTestRunner.runTests).toHaveBeenNthCalledWith(
          index + 1,
          [test],
          expect.objectContaining({ workerId: expect.any(Number) })
        );
      });

      // Verify result aggregation
      expect(mockResultAggregator.aggregateResults).toHaveBeenCalledWith(
        expect.any(Array)
      );

      // Verify metrics recording
      expect(mockMetrics.recordMetric).toHaveBeenCalledWith(
        'execution.parallel.completed',
        expect.objectContaining({
          testCount: 4,
          parallelJobs: 4,
          totalDuration: expect.any(Number)
        })
      );

      expect(result.success).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Parallel execution completed for suite suite-123'
      );
    });

    it('should balance load across workers based on test duration', async () => {
      const config: ExecutionConfig = {
        strategy: ExecutionStrategy.PARALLEL,
        maxParallelJobs: 2,
        loadBalancing: 'duration-based'
      };

      await testExecutor.execute(testSuite, config);

      // Verify load balancing logic through resource allocation
      expect(mockResourceManager.allocateResources).toHaveBeenCalledWith({
        workers: 2,
        loadBalancingStrategy: 'duration-based',
        memoryPerWorker: expect.any(Number)
      });

      // Should group tests optimally: [test-4] and [test-2] vs [test-1, test-3]
      expect(mockTestRunner.runTests).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ estimatedDuration: 4000 })
        ]),
        expect.objectContaining({ workerId: 0 })
      );
      
      expect(mockTestRunner.runTests).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ estimatedDuration: 3000 })
        ]),
        expect.objectContaining({ workerId: 1 })
      );
    });

    it('should handle worker failures and redistribute tests', async () => {
      // Mock worker failure
      mockTestRunner.runTests
        .mockResolvedValueOnce({ success: true, results: [], duration: 1800 })
        .mockRejectedValueOnce(new Error('Worker crashed'))
        .mockResolvedValueOnce({ success: true, results: [], duration: 1500 })
        .mockResolvedValueOnce({ success: true, results: [], duration: 2200 });

      const config: ExecutionConfig = {
        strategy: ExecutionStrategy.PARALLEL,
        maxParallelJobs: 4,
        handleWorkerFailures: true
      };

      const result = await testExecutor.execute(testSuite, config);

      // Verify failure handling and redistribution
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Worker failed, redistributing tests: Worker crashed'
      );
      
      // Should attempt redistribution
      expect(mockTestRunner.runTests).toHaveBeenCalledTimes(5); // 4 original + 1 retry
      
      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
        'execution.worker.failure'
      );

      expect(result.warnings).toContain('Worker failure occurred during execution');
    });
  });

  describe('Sequential Test Execution', () => {
    const integrationSuite = {
      id: 'integration-suite',
      tests: [
        { id: 'setup-test', dependencies: [] },
        { id: 'db-test', dependencies: ['setup-test'] },
        { id: 'api-test', dependencies: ['db-test'] },
        { id: 'cleanup-test', dependencies: ['api-test'] }
      ]
    };

    it('should execute tests sequentially respecting dependencies', async () => {
      const config: ExecutionConfig = {
        strategy: ExecutionStrategy.SEQUENTIAL,
        respectDependencies: true,
        failFast: true
      };

      await testExecutor.execute(integrationSuite, config);

      // Verify sequential execution order
      expect(mockTestRunner.runTests).toHaveBeenNthCalledWith(
        1,
        [expect.objectContaining({ id: 'setup-test' })],
        expect.any(Object)
      );
      
      expect(mockTestRunner.runTests).toHaveBeenNthCalledWith(
        2,
        [expect.objectContaining({ id: 'db-test' })],
        expect.any(Object)
      );
      
      expect(mockTestRunner.runTests).toHaveBeenNthCalledWith(
        3,
        [expect.objectContaining({ id: 'api-test' })],
        expect.any(Object)
      );
      
      expect(mockTestRunner.runTests).toHaveBeenNthCalledWith(
        4,
        [expect.objectContaining({ id: 'cleanup-test' })],
        expect.any(Object)
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Sequential execution respecting test dependencies'
      );
    });

    it('should fail fast on first test failure in sequential mode', async () => {
      mockTestRunner.runTests
        .mockResolvedValueOnce({ success: true, results: [], duration: 1000 })
        .mockResolvedValueOnce({ success: false, results: [{ error: 'DB connection failed' }], duration: 500 });

      const config: ExecutionConfig = {
        strategy: ExecutionStrategy.SEQUENTIAL,
        failFast: true
      };

      const result = await testExecutor.execute(integrationSuite, config);

      // Should stop after second test failure
      expect(mockTestRunner.runTests).toHaveBeenCalledTimes(2);
      
      expect(result.success).toBe(false);
      expect(result.failedFast).toBe(true);
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Test execution failed fast at test db-test'
      );
    });
  });

  describe('Adaptive Test Execution', () => {
    it('should switch between parallel and sequential based on test characteristics', async () => {
      const mixedSuite = {
        id: 'mixed-suite',
        tests: [
          { id: 'unit-1', type: 'unit', estimatedDuration: 100 },
          { id: 'unit-2', type: 'unit', estimatedDuration: 150 },
          { id: 'integration-1', type: 'integration', dependencies: ['unit-1'] },
          { id: 'e2e-1', type: 'e2e', estimatedDuration: 5000 }
        ]
      };

      const config: ExecutionConfig = {
        strategy: ExecutionStrategy.ADAPTIVE,
        optimizeForSpeed: true
      };

      await testExecutor.execute(mixedSuite, config);

      // Verify adaptive strategy coordination
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Using adaptive execution strategy'
      );
      
      // Should execute unit tests in parallel first
      expect(mockTestRunner.runTests).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ type: 'unit' })
        ]),
        expect.objectContaining({ parallel: true })
      );
      
      // Then integration tests sequentially
      expect(mockTestRunner.runTests).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ type: 'integration' })
        ]),
        expect.objectContaining({ sequential: true })
      );
    });
  });

  describe('Test Retry Logic', () => {
    it('should retry failed tests with exponential backoff', async () => {
      const flakyTest = {
        id: 'flaky-suite',
        tests: [{ id: 'flaky-test', estimatedDuration: 1000 }]
      };

      // Mock initial failure then success
      mockTestRunner.runTests
        .mockResolvedValueOnce({ 
          success: false, 
          results: [{ id: 'flaky-test', status: 'failed', error: 'Timeout' }],
          duration: 1000 
        })
        .mockResolvedValueOnce({ 
          success: true, 
          results: [{ id: 'flaky-test', status: 'passed' }],
          duration: 800 
        });

      const config: ExecutionConfig = {
        retryFailedTests: true,
        maxRetries: 3,
        retryDelay: 1000,
        exponentialBackoff: true
      };

      const result = await testExecutor.execute(flakyTest, config);

      // Verify retry logic
      expect(mockTestRunner.runTests).toHaveBeenCalledTimes(2);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Retrying failed test flaky-test (attempt 1/3)'
      );
      
      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
        'execution.retry.attempt'
      );

      expect(result.success).toBe(true);
      expect(result.retriedTests).toEqual(['flaky-test']);
    });

    it('should give up after max retries exceeded', async () => {
      const persistentlyFailingTest = {
        id: 'failing-suite',
        tests: [{ id: 'broken-test', estimatedDuration: 500 }]
      };

      // Mock persistent failure
      mockTestRunner.runTests.mockResolvedValue({ 
        success: false, 
        results: [{ id: 'broken-test', status: 'failed', error: 'Assertion error' }],
        duration: 500 
      });

      const config: ExecutionConfig = {
        retryFailedTests: true,
        maxRetries: 2
      };

      const result = await testExecutor.execute(persistentlyFailingTest, config);

      expect(mockTestRunner.runTests).toHaveBeenCalledTimes(3); // Initial + 2 retries
      
      expect(result.success).toBe(false);
      expect(result.permanentFailures).toEqual(['broken-test']);
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Test broken-test failed permanently after 2 retries'
      );
    });
  });

  describe('Resource Management and Optimization', () => {
    it('should monitor and adjust resource usage during execution', async () => {
      const largeSuite = {
        id: 'large-suite',
        tests: Array.from({ length: 100 }, (_, i) => ({ 
          id: `test-${i}`, 
          estimatedDuration: 1000 
        }))
      };

      mockResourceManager.monitorUsage.mockReturnValue({
        cpu: 85,
        memory: 90,
        recommendedAdjustment: 'reduce-parallelism'
      });

      const config: ExecutionConfig = {
        strategy: ExecutionStrategy.PARALLEL,
        maxParallelJobs: 8,
        adaptiveResourceManagement: true
      };

      await testExecutor.execute(largeSuite, config);

      // Verify resource monitoring
      expect(mockResourceManager.monitorUsage).toHaveBeenCalled();
      
      // Verify adjustment based on monitoring
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Adjusting parallelism due to high resource usage'
      );
      
      expect(mockMetrics.recordMetric).toHaveBeenCalledWith(
        'execution.resource.adjustment',
        expect.objectContaining({ action: 'reduce-parallelism' })
      );
    });

    it('should cleanup resources after execution completion', async () => {
      const testSuite = {
        id: 'cleanup-test',
        tests: [{ id: 'simple-test' }]
      };

      await testExecutor.execute(testSuite, {});

      // Verify resource cleanup
      expect(mockResourceManager.releaseResources).toHaveBeenCalled();
      
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Released execution resources for suite cleanup-test'
      );
    });
  });

  describe('Failure Investigation', () => {
    it('should automatically investigate test failures', async () => {
      const failingSuite = {
        id: 'investigation-suite',
        tests: [{ id: 'failing-test' }]
      };

      const failureResult = {
        success: false,
        results: [{
          id: 'failing-test',
          status: 'failed',
          error: 'Expected 200 but got 500',
          stackTrace: 'at line 42...',
          logs: ['API call failed']
        }]
      };

      mockTestRunner.runTests.mockResolvedValue(failureResult);
      mockFailureInvestigator.investigateFailures.mockResolvedValue({
        category: 'api-error',
        rootCause: 'Service unavailable',
        suggestions: ['Check service health', 'Verify configuration']
      });

      const config: ExecutionConfig = {
        investigateFailures: true
      };

      const result = await testExecutor.execute(failingSuite, config);

      // Verify failure investigation
      expect(mockFailureInvestigator.investigateFailures).toHaveBeenCalledWith(
        failureResult.results.filter(r => r.status === 'failed')
      );
      
      expect(result.failureInvestigation).toEqual({
        category: 'api-error',
        rootCause: 'Service unavailable',
        suggestions: ['Check service health', 'Verify configuration']
      });
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Failure investigation completed for 1 failed tests'
      );
    });
  });
});

// Contract tests for test executor
describe('TestExecutor Contracts', () => {
  it('should satisfy ITestExecutor interface', () => {
    expect(typeof testExecutor.execute).toBe('function');
    expect(typeof testExecutor.validateSuite).toBe('function');
    expect(typeof testExecutor.estimateExecutionTime).toBe('function');
    expect(typeof testExecutor.getExecutionStatus).toBe('function');
    expect(typeof testExecutor.cancelExecution).toBe('function');
  });

  it('should return consistent result format across all execution strategies', async () => {
    const testSuite = {
      id: 'contract-test',
      tests: [{ id: 'test-1' }]
    };

    const result = await testExecutor.execute(testSuite, {});

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('duration');
    expect(result).toHaveProperty('testResults');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('metrics');
  });
});
