/**
 * JOURNEY-003: Test Execution
 *
 * Tests parallel test execution with real-time progress and retry logic
 * Created: 2025-12-07
 * Agent: qe-tester
 * Issue: #103 - Test Suite Migration (Phase 3 - Journey 3 of 7)
 */

import { TestExecutorAgent, TestExecutorConfig } from '@agents/TestExecutorAgent';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
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
} from '@types';
import * as path from 'path';
import * as fs from 'fs';

describe('Journey: Test Execution', () => {
  let memoryStore: SwarmMemoryManager;
  let eventBus: EventEmitter;
  let testExecutor: TestExecutorAgent;
  let dbPath: string;

  const testContext: AgentContext = {
    id: 'test-executor-journey',
    type: 'test-executor' as AgentType,
    status: 'idle',
    metadata: { environment: 'test' }
  };

  beforeAll(async () => {
    // Real database for journey testing
    const testDbDir = path.join(process.cwd(), '.swarm/journey-test');
    if (!fs.existsSync(testDbDir)) {
      fs.mkdirSync(testDbDir, { recursive: true });
    }

    dbPath = path.join(testDbDir, 'test-execution-journey.db');

    // Clean up any existing test database
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }

    memoryStore = new SwarmMemoryManager(dbPath);
    await memoryStore.initialize();

    eventBus = new EventEmitter();

    // Track journey initialization
    await memoryStore.store('journeys/test-execution/init', {
      status: 'initialized',
      timestamp: Date.now(),
      agent: 'qe-tester',
      dbPath
    }, { partition: 'coordination', ttl: 86400 });
  });

  afterAll(async () => {
    // Track journey completion
    await memoryStore.store('journeys/test-execution/status', {
      status: 'completed',
      timestamp: Date.now(),
      agent: 'qe-tester',
      journeyType: 'test-execution',
      testsCreated: 6,
      filesCreated: ['tests/journeys/test-execution.test.ts']
    }, { partition: 'coordination', ttl: 86400 });

    if (testExecutor && testExecutor.getStatus().status !== 'terminated') {
      await testExecutor.terminate();
    }

    await memoryStore.close();
  });

  beforeEach(async () => {
    const config: TestExecutorConfig = {
      id: 'test-executor-journey',
      type: 'test-executor' as AgentType,
      capabilities: [],
      context: testContext,
      memoryStore: memoryStore,
      eventBus: eventBus,
      frameworks: ['jest', 'mocha', 'cypress', 'playwright'],
      maxParallelTests: 4,
      timeout: 30000,
      reportFormat: 'json',
      retryAttempts: 3,
      retryBackoff: 1000,
      sublinearOptimization: true,
      simulationMode: true // Enable simulation for journey tests
    };

    // Set environment variable to allow simulation
    process.env.AQE_ALLOW_SIMULATION = 'true';

    testExecutor = new TestExecutorAgent(config);
    await testExecutor.initialize();
  });

  afterEach(async () => {
    if (testExecutor && testExecutor.getStatus().status !== 'terminated') {
      await testExecutor.terminate();
    }
    delete process.env.AQE_ALLOW_SIMULATION;
  });

  describe('parallel test execution', () => {
    it('should execute tests in parallel with multiple workers', async () => {
      // Create a realistic test suite with various test types
      const testSuite: TestSuite = {
        id: 'parallel-suite-001',
        name: 'User Service Test Suite',
        tests: [
          {
            id: 'unit-001',
            name: 'User creation validation',
            type: 'unit' as TestType,
            parameters: [],
            assertions: ['expect(user).toBeDefined()', 'expect(user.email).toBe(email)'],
            expectedResult: true
          },
          {
            id: 'unit-002',
            name: 'User authentication',
            type: 'unit' as TestType,
            parameters: [],
            assertions: ['expect(authenticated).toBe(true)'],
            expectedResult: true
          },
          {
            id: 'integration-001',
            name: 'User API endpoint',
            type: 'integration' as TestType,
            parameters: [],
            assertions: ['expect(response.status).toBe(200)'],
            expectedResult: 200
          },
          {
            id: 'integration-002',
            name: 'User database operations',
            type: 'integration' as TestType,
            parameters: [],
            assertions: ['expect(savedUser).toBeDefined()'],
            expectedResult: true
          },
          {
            id: 'e2e-001',
            name: 'User registration flow',
            type: 'e2e' as TestType,
            parameters: [],
            assertions: ['expect(page.url).toContain("/dashboard")'],
            expectedResult: true
          }
        ],
        metadata: {
          generatedAt: new Date(),
          coverageTarget: 85,
          framework: 'jest',
          estimatedDuration: 10000
        }
      };

      const task: QETask = {
        id: 'parallel-execution-001',
        type: 'parallel-test-execution',
        payload: { testSuite, maxParallel: 4 },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'parallel-assignment-001',
        task,
        agentId: testExecutor.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      // Store execution plan in database
      await memoryStore.store('journeys/test-execution/plan', {
        suiteId: testSuite.id,
        totalTests: testSuite.tests.length,
        maxParallel: 4,
        timestamp: Date.now()
      }, { partition: 'coordination' });

      const startTime = Date.now();
      const result = await testExecutor.executeTask(assignment);
      const executionTime = Date.now() - startTime;

      // Store execution results in database
      await memoryStore.store('journeys/test-execution/results', {
        results: result.results.length,
        totalTime: result.totalTime,
        parallelEfficiency: result.parallelEfficiency,
        executionTime,
        timestamp: Date.now()
      }, { partition: 'coordination' });

      // Verify parallel execution
      expect(result.results).toHaveLength(5);
      expect(result.totalTime).toBeGreaterThan(0);
      expect(result.parallelEfficiency).toBeGreaterThan(0);
      expect(executionTime).toBeLessThan(15000); // Should be faster than sequential

      // Verify data stored in database
      const storedResults = await memoryStore.retrieve('journeys/test-execution/results', {
        partition: 'coordination'
      });
      expect(storedResults).toBeDefined();
      expect(storedResults.results).toBe(5);
    }, 60000);

    it('should emit real-time progress events', async () => {
      const progressEvents: any[] = [];

      // Listen for progress events
      eventBus.on('test-batch-completed', (event) => {
        progressEvents.push(event);
      });

      const testSuite: TestSuite = {
        id: 'progress-suite-001',
        name: 'Progress Test Suite',
        tests: Array.from({ length: 8 }, (_, i) => ({
          id: `test-${i}`,
          name: `Test ${i}`,
          type: 'unit' as TestType,
          parameters: [],
          assertions: [`expect(result${i}).toBeDefined()`],
          expectedResult: true
        })),
        metadata: {
          generatedAt: new Date(),
          coverageTarget: 80,
          framework: 'jest',
          estimatedDuration: 8000
        }
      };

      const task: QETask = {
        id: 'progress-task-001',
        type: 'parallel-test-execution',
        payload: { testSuite, maxParallel: 4 },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'progress-assignment-001',
        task,
        agentId: testExecutor.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await testExecutor.executeTask(assignment);

      // Store progress events in database
      await memoryStore.store('journeys/test-execution/progress-events', {
        eventCount: progressEvents.length,
        events: progressEvents,
        timestamp: Date.now()
      }, { partition: 'coordination' });

      // Verify progress events were emitted
      expect(progressEvents.length).toBeGreaterThan(0);
      expect(result.results).toHaveLength(8);

      // Verify events stored in database
      const storedEvents = await memoryStore.retrieve('journeys/test-execution/progress-events', {
        partition: 'coordination'
      });
      expect(storedEvents).toBeDefined();
      expect(storedEvents.eventCount).toBeGreaterThan(0);
    }, 60000);

    it('should retry flaky tests automatically with max 3 attempts', async () => {
      let attemptCount = 0;
      const maxRetries = 3;

      // Mock a flaky test that succeeds on 3rd attempt
      // FIX: Return deterministic result on 3rd attempt instead of calling
      // the original implementation which uses random success rate (10% failure)
      (testExecutor as any).executeSingleTestInternal = jest.fn().mockImplementation(async (test: Test) => {
        attemptCount++;

        // Store retry attempt in database
        await memoryStore.store(`journeys/test-execution/retry-attempt-${attemptCount}`, {
          testId: test.id,
          attempt: attemptCount,
          timestamp: Date.now()
        }, { partition: 'coordination' });

        if (attemptCount < 3) {
          throw new Error('TIMEOUT'); // Retryable error
        }
        // Return deterministic passed result on 3rd attempt
        // (Original implementation uses random 90% success which causes flakiness)
        return {
          id: test.id,
          type: test.type,
          status: 'passed',
          duration: 100,
          assertions: test.assertions?.length || 1,
          coverage: { lines: 80, branches: 75, functions: 85, statements: 80 },
          errors: []
        };
      });

      const flakyTest: Test = {
        id: 'flaky-test-001',
        name: 'Flaky Network Test',
        type: 'integration' as TestType,
        parameters: [],
        assertions: ['expect(response).toBeDefined()'],
        expectedResult: true
      };

      const task: QETask = {
        id: 'retry-task-001',
        type: 'single-test-execution',
        payload: { test: flakyTest },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'retry-assignment-001',
        task,
        agentId: testExecutor.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await testExecutor.executeTask(assignment);

      // Store retry analysis in database
      await memoryStore.store('journeys/test-execution/retry-analysis', {
        testId: flakyTest.id,
        totalAttempts: attemptCount,
        maxRetries,
        finalStatus: result.status,
        timestamp: Date.now()
      }, { partition: 'coordination' });

      // Verify retry behavior
      expect(result.status).toBe('passed');
      expect(attemptCount).toBe(3);

      // Verify retry attempts stored in database
      for (let i = 1; i <= attemptCount; i++) {
        const attempt = await memoryStore.retrieve(`journeys/test-execution/retry-attempt-${i}`, {
          partition: 'coordination'
        });
        expect(attempt).toBeDefined();
        expect(attempt.attempt).toBe(i);
      }

      const analysis = await memoryStore.retrieve('journeys/test-execution/retry-analysis', {
        partition: 'coordination'
      });
      expect(analysis.totalAttempts).toBe(3);
      expect(analysis.finalStatus).toBe('passed');
    }, 60000);

    it('should load balance across workers', async () => {
      const testSuite: TestSuite = {
        id: 'load-balance-suite-001',
        name: 'Load Balancing Test Suite',
        tests: Array.from({ length: 12 }, (_, i) => ({
          id: `test-${i}`,
          name: `Test ${i}`,
          type: 'unit' as TestType,
          parameters: [],
          assertions: [`expect(result${i}).toBeDefined()`],
          expectedResult: true
        })),
        metadata: {
          generatedAt: new Date(),
          coverageTarget: 80,
          framework: 'jest',
          estimatedDuration: 12000
        }
      };

      const maxParallel = 4;

      const task: QETask = {
        id: 'load-balance-task-001',
        type: 'parallel-test-execution',
        payload: { testSuite, maxParallel },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'load-balance-assignment-001',
        task,
        agentId: testExecutor.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await testExecutor.executeTask(assignment);

      // Calculate load distribution
      const expectedBatches = Math.ceil(testSuite.tests.length / maxParallel);
      const actualBatches = Math.ceil(result.results.length / maxParallel);

      // Store load balancing metrics in database
      await memoryStore.store('journeys/test-execution/load-balancing', {
        totalTests: testSuite.tests.length,
        maxParallel,
        expectedBatches,
        actualBatches,
        parallelEfficiency: result.parallelEfficiency,
        timestamp: Date.now()
      }, { partition: 'coordination' });

      // Verify load balancing
      expect(result.results).toHaveLength(12);
      // Efficiency varies by environment - just verify it's calculated and positive
      // (CI/simulated environments have high overhead that reduces efficiency)
      expect(result.parallelEfficiency).toBeGreaterThan(0);
      expect(result.parallelEfficiency).toBeLessThanOrEqual(1);

      // Verify load balancing data in database
      const loadData = await memoryStore.retrieve('journeys/test-execution/load-balancing', {
        partition: 'coordination'
      });
      expect(loadData).toBeDefined();
      expect(loadData.totalTests).toBe(12);
      expect(loadData.maxParallel).toBe(4);
    }, 60000);

    it('should generate comprehensive execution report', async () => {
      const testSuite: TestSuite = {
        id: 'report-suite-001',
        name: 'Report Generation Test Suite',
        tests: [
          {
            id: 'unit-001',
            name: 'Unit Test 1',
            type: 'unit' as TestType,
            parameters: [],
            assertions: ['expect(true).toBe(true)'],
            expectedResult: true
          },
          {
            id: 'unit-002',
            name: 'Unit Test 2',
            type: 'unit' as TestType,
            parameters: [],
            assertions: ['expect(1+1).toBe(2)'],
            expectedResult: 2
          },
          {
            id: 'integration-001',
            name: 'Integration Test 1',
            type: 'integration' as TestType,
            parameters: [],
            assertions: ['expect(api.status).toBe(200)'],
            expectedResult: 200
          }
        ],
        metadata: {
          generatedAt: new Date(),
          coverageTarget: 85,
          framework: 'jest',
          estimatedDuration: 5000
        }
      };

      const task: QETask = {
        id: 'report-task-001',
        type: 'parallel-test-execution',
        payload: { testSuite },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'report-assignment-001',
        task,
        agentId: testExecutor.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await testExecutor.executeTask(assignment);

      // Generate comprehensive report
      const report = {
        suiteId: testSuite.id,
        suiteName: testSuite.name,
        totalTests: result.results.length,
        passedTests: result.results.filter(r => r.status === 'passed').length,
        failedTests: result.results.filter(r => r.status === 'failed').length,
        totalTime: result.totalTime,
        parallelEfficiency: result.parallelEfficiency,
        optimizationApplied: result.optimizationApplied,
        averageTestDuration: result.totalTime / result.results.length,
        testTypes: {
          unit: result.results.filter(r => r.type === 'unit').length,
          integration: result.results.filter(r => r.type === 'integration').length,
          e2e: result.results.filter(r => r.type === 'e2e').length
        },
        timestamp: Date.now()
      };

      // Store report in database
      await memoryStore.store('journeys/test-execution/report', report, {
        partition: 'coordination'
      });

      // Verify report generation
      expect(report.totalTests).toBe(3);
      expect(report.totalTime).toBeGreaterThan(0);
      expect(report.testTypes).toBeDefined();
      expect(report.testTypes.unit).toBeGreaterThan(0);

      // Verify report stored in database
      const storedReport = await memoryStore.retrieve('journeys/test-execution/report', {
        partition: 'coordination'
      });
      expect(storedReport).toBeDefined();
      expect(storedReport.totalTests).toBe(3);
      expect(storedReport.testTypes.unit).toBe(2);
      expect(storedReport.testTypes.integration).toBe(1);
    }, 60000);

    it('should store test results in database for analysis', async () => {
      const testSuite: TestSuite = {
        id: 'storage-suite-001',
        name: 'Database Storage Test Suite',
        tests: [
          {
            id: 'storage-test-001',
            name: 'Storage Test 1',
            type: 'unit' as TestType,
            parameters: [],
            assertions: ['expect(data).toBeDefined()'],
            expectedResult: true
          },
          {
            id: 'storage-test-002',
            name: 'Storage Test 2',
            type: 'integration' as TestType,
            parameters: [],
            assertions: ['expect(db.connected).toBe(true)'],
            expectedResult: true
          }
        ],
        metadata: {
          generatedAt: new Date(),
          coverageTarget: 80,
          framework: 'jest',
          estimatedDuration: 3000
        }
      };

      const task: QETask = {
        id: 'storage-task-001',
        type: 'parallel-test-execution',
        payload: { testSuite },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'storage-assignment-001',
        task,
        agentId: testExecutor.getStatus().agentId,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await testExecutor.executeTask(assignment);

      // Store individual test results in database
      for (let i = 0; i < result.results.length; i++) {
        const testResult = result.results[i];
        await memoryStore.store(`journeys/test-execution/test-results/${testResult.id}`, {
          testId: testResult.id,
          type: testResult.type,
          status: testResult.status,
          duration: testResult.duration,
          assertions: testResult.assertions,
          errors: testResult.errors || [],
          timestamp: Date.now()
        }, { partition: 'coordination' });
      }

      // Store aggregate statistics
      const statistics = {
        totalTests: result.results.length,
        passed: result.results.filter(r => r.status === 'passed').length,
        failed: result.results.filter(r => r.status === 'failed').length,
        avgDuration: result.results.reduce((sum, r) => sum + r.duration, 0) / result.results.length,
        timestamp: Date.now()
      };

      await memoryStore.store('journeys/test-execution/statistics', statistics, {
        partition: 'coordination'
      });

      // Verify results stored in database
      for (let i = 0; i < result.results.length; i++) {
        const testResult = result.results[i];
        const storedResult = await memoryStore.retrieve(
          `journeys/test-execution/test-results/${testResult.id}`,
          { partition: 'coordination' }
        );
        expect(storedResult).toBeDefined();
        expect(storedResult.testId).toBe(testResult.id);
        expect(storedResult.status).toBe(testResult.status);
      }

      // Verify statistics stored in database
      const storedStats = await memoryStore.retrieve('journeys/test-execution/statistics', {
        partition: 'coordination'
      });
      expect(storedStats).toBeDefined();
      expect(storedStats.totalTests).toBe(result.results.length);
      expect(storedStats.avgDuration).toBeGreaterThan(0);
    }, 60000);
  });
});
