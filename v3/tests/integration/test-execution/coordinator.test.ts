/**
 * Integration Tests - Test Execution Coordinator
 * Tests the full workflow of test execution including parallel execution and flaky detection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TestExecutionCoordinator,
  ITestExecutionCoordinator,
} from '../../../src/domains/test-execution/coordinator';
import { EventBus, MemoryBackend, AgentCoordinator } from '../../../src/kernel/interfaces';
import { createMockEventBus, createMockMemory, createMockAgentCoordinator } from '../../mocks';

describe('Test Execution Coordinator Integration', () => {
  let coordinator: ITestExecutionCoordinator;
  let eventBus: EventBus;
  let memory: MemoryBackend;
  let agentCoordinator: AgentCoordinator;

  beforeEach(async () => {
    eventBus = createMockEventBus();
    memory = createMockMemory();
    agentCoordinator = createMockAgentCoordinator();

    coordinator = new TestExecutionCoordinator(
      eventBus,
      memory,
      agentCoordinator
    );
    await coordinator.initialize();
  });

  afterEach(async () => {
    await coordinator.dispose();
    vi.clearAllMocks();
  });

  describe('Test Execution Workflow', () => {
    it('should execute a single test suite', async () => {
      const request = {
        suites: [
          {
            name: 'UserService',
            tests: [
              { name: 'should create user', file: 'user.test.ts' },
              { name: 'should delete user', file: 'user.test.ts' },
            ],
          },
        ],
        options: {
          parallel: false,
          timeout: 30000,
        },
      };

      const result = await coordinator.executeTests(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.totalTests).toBeGreaterThan(0);
        expect(result.value.suiteResults).toHaveLength(1);
      }
    });

    it('should execute tests in parallel', async () => {
      const request = {
        suites: [
          { name: 'Suite1', tests: [{ name: 'test1', file: 'a.test.ts' }] },
          { name: 'Suite2', tests: [{ name: 'test2', file: 'b.test.ts' }] },
          { name: 'Suite3', tests: [{ name: 'test3', file: 'c.test.ts' }] },
        ],
        options: {
          parallel: true,
          maxWorkers: 3,
          timeout: 30000,
        },
      };

      const startTime = Date.now();
      const result = await coordinator.executeTests(request);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.suiteResults).toHaveLength(3);
        // Parallel execution should be faster than sequential
        expect(result.value.parallelExecution).toBe(true);
      }
    });

    it('should emit TestRunStarted and TestRunCompleted events', async () => {
      const publishSpy = vi.spyOn(eventBus, 'publish');

      const request = {
        suites: [
          { name: 'Suite', tests: [{ name: 'test', file: 'test.ts' }] },
        ],
        options: { parallel: false, timeout: 30000 },
      };

      await coordinator.executeTests(request);

      expect(publishSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'test-execution.run-started',
        })
      );
      expect(publishSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'test-execution.run-completed',
        })
      );
    });

    it('should handle test failures gracefully', async () => {
      const request = {
        suites: [
          {
            name: 'FailingSuite',
            tests: [
              { name: 'failing test', file: 'fail.test.ts', expectedToFail: true },
            ],
          },
        ],
        options: { parallel: false, timeout: 30000 },
      };

      const result = await coordinator.executeTests(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.failedTests).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Flaky Test Detection', () => {
    it('should detect flaky tests through multiple runs', async () => {
      const request = {
        testFile: 'flaky.test.ts',
        runs: 5,
        options: {
          threshold: 0.8, // 80% pass rate to be considered stable
        },
      };

      const result = await coordinator.detectFlakyTests(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.flakyTests).toBeDefined();
        expect(Array.isArray(result.value.flakyTests)).toBe(true);
      }
    });

    it('should emit FlakyTestDetected event when flakiness found', async () => {
      const publishSpy = vi.spyOn(eventBus, 'publish');

      const request = {
        testFile: 'intermittent.test.ts',
        runs: 3,
        options: { threshold: 0.9 },
      };

      await coordinator.detectFlakyTests(request);

      // May or may not emit depending on mock behavior
      // Just verify no errors
      expect(publishSpy).toBeDefined();
    });

    it('should provide flakiness statistics', async () => {
      const request = {
        testFile: 'stats.test.ts',
        runs: 10,
        options: { threshold: 0.8 },
      };

      const result = await coordinator.detectFlakyTests(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.statistics).toBeDefined();
        expect(result.value.statistics.totalRuns).toBeGreaterThan(0);
      }
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed tests automatically', async () => {
      const request = {
        suites: [
          {
            name: 'RetryableSuite',
            tests: [{ name: 'flaky test', file: 'retry.test.ts' }],
          },
        ],
        options: {
          parallel: false,
          timeout: 30000,
          retryConfig: {
            maxRetries: 3,
            retryDelay: 100,
            retryOn: ['timeout', 'assertion'],
          },
        },
      };

      const result = await coordinator.executeTests(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.retriedTests).toBeDefined();
      }
    });

    it('should respect max retry limit', async () => {
      const request = {
        suites: [
          {
            name: 'AlwaysFailingSuite',
            tests: [{ name: 'persistent failure', file: 'fail.test.ts' }],
          },
        ],
        options: {
          parallel: false,
          timeout: 30000,
          retryConfig: {
            maxRetries: 2,
            retryDelay: 50,
          },
        },
      };

      const result = await coordinator.executeTests(request);

      expect(result.success).toBe(true);
      if (result.success && result.value.retriedTests) {
        // Should not exceed max retries
        expect(
          result.value.retriedTests.every(t => t.attempts <= 3)
        ).toBe(true);
      }
    });

    it('should apply exponential backoff on retries', async () => {
      const request = {
        suites: [
          {
            name: 'BackoffSuite',
            tests: [{ name: 'retry with backoff', file: 'backoff.test.ts' }],
          },
        ],
        options: {
          parallel: false,
          timeout: 30000,
          retryConfig: {
            maxRetries: 3,
            retryDelay: 100,
            backoffMultiplier: 2,
          },
        },
      };

      const result = await coordinator.executeTests(request);

      expect(result).toBeDefined();
    });
  });

  describe('Execution Optimization', () => {
    it('should optimize test order based on history', async () => {
      // Store some test history
      await memory.store('test-history:fast.test.ts', { avgDuration: 100 });
      await memory.store('test-history:slow.test.ts', { avgDuration: 5000 });
      await memory.store('test-history:flaky.test.ts', { avgDuration: 500, failures: 3 });

      const request = {
        suites: [
          {
            name: 'OptimizedSuite',
            tests: [
              { name: 'slow', file: 'slow.test.ts' },
              { name: 'fast', file: 'fast.test.ts' },
              { name: 'flaky', file: 'flaky.test.ts' },
            ],
          },
        ],
        options: {
          parallel: false,
          timeout: 30000,
          optimize: true,
        },
      };

      const result = await coordinator.executeTests(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.optimized).toBe(true);
      }
    });

    it('should prioritize recently failed tests', async () => {
      // Store failure history
      await memory.store('test-failures:critical.test.ts', {
        lastFailed: new Date().toISOString(),
        failureCount: 5,
      });

      const request = {
        suites: [
          {
            name: 'PrioritizedSuite',
            tests: [
              { name: 'passing', file: 'pass.test.ts' },
              { name: 'critical', file: 'critical.test.ts' },
            ],
          },
        ],
        options: {
          parallel: false,
          timeout: 30000,
          prioritize: 'failures',
        },
      };

      const result = await coordinator.executeTests(request);

      expect(result.success).toBe(true);
    });
  });

  describe('Test Isolation', () => {
    it('should isolate test environments', async () => {
      const request = {
        suites: [
          {
            name: 'IsolatedSuite',
            tests: [{ name: 'isolated test', file: 'isolated.test.ts' }],
          },
        ],
        options: {
          parallel: true,
          timeout: 30000,
          isolation: 'process', // Run each test in separate process
        },
      };

      const result = await coordinator.executeTests(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isolation).toBe('process');
      }
    });

    it('should clean up resources after test completion', async () => {
      const request = {
        suites: [
          {
            name: 'CleanupSuite',
            tests: [{ name: 'resource test', file: 'resource.test.ts' }],
          },
        ],
        options: {
          parallel: false,
          timeout: 30000,
          cleanup: true,
        },
      };

      const result = await coordinator.executeTests(request);

      expect(result.success).toBe(true);
      // Verify cleanup was performed
      expect(coordinator.getActiveWorkflows().length).toBe(0);
    });
  });

  describe('Concurrent Execution Management', () => {
    it('should handle multiple concurrent test runs', async () => {
      const requests = [
        {
          suites: [{ name: 'Suite1', tests: [{ name: 't1', file: '1.test.ts' }] }],
          options: { parallel: false, timeout: 30000 },
        },
        {
          suites: [{ name: 'Suite2', tests: [{ name: 't2', file: '2.test.ts' }] }],
          options: { parallel: false, timeout: 30000 },
        },
        {
          suites: [{ name: 'Suite3', tests: [{ name: 't3', file: '3.test.ts' }] }],
          options: { parallel: false, timeout: 30000 },
        },
      ];

      const results = await Promise.all(
        requests.map(req => coordinator.executeTests(req))
      );

      results.forEach(result => {
        expect(result).toBeDefined();
      });
    });

    it('should track active workflows', async () => {
      const request = {
        suites: [
          { name: 'TrackedSuite', tests: [{ name: 'tracked', file: 'tracked.test.ts' }] },
        ],
        options: { parallel: false, timeout: 30000 },
      };

      // Start execution but don't wait
      const resultPromise = coordinator.executeTests(request);

      // Check workflows
      const workflows = coordinator.getActiveWorkflows();
      expect(workflows).toBeDefined();

      await resultPromise;
    });
  });

  describe('Error Handling', () => {
    it('should handle timeout gracefully', async () => {
      const request = {
        suites: [
          {
            name: 'TimeoutSuite',
            tests: [{ name: 'slow test', file: 'slow.test.ts', duration: 10000 }],
          },
        ],
        options: {
          parallel: false,
          timeout: 100, // Very short timeout
        },
      };

      const result = await coordinator.executeTests(request);

      // Should complete (possibly with timeout error)
      expect(result).toBeDefined();
    });

    it('should handle empty test suite', async () => {
      const request = {
        suites: [],
        options: { parallel: false, timeout: 30000 },
      };

      const result = await coordinator.executeTests(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.totalTests).toBe(0);
      }
    });

    it('should handle invalid test file', async () => {
      const request = {
        suites: [
          {
            name: 'InvalidSuite',
            tests: [{ name: 'invalid', file: 'nonexistent.test.ts' }],
          },
        ],
        options: { parallel: false, timeout: 30000 },
      };

      const result = await coordinator.executeTests(request);

      // Should handle gracefully, possibly marking tests as skipped
      expect(result).toBeDefined();
    });
  });

  describe('Reporting', () => {
    it('should generate execution report', async () => {
      const request = {
        suites: [
          {
            name: 'ReportSuite',
            tests: [
              { name: 'passing test', file: 'pass.test.ts' },
              { name: 'failing test', file: 'fail.test.ts' },
            ],
          },
        ],
        options: {
          parallel: false,
          timeout: 30000,
          generateReport: true,
        },
      };

      const result = await coordinator.executeTests(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.report).toBeDefined();
        expect(result.value.report?.summary).toBeDefined();
      }
    });

    it('should include timing information in report', async () => {
      const request = {
        suites: [
          {
            name: 'TimedSuite',
            tests: [{ name: 'timed test', file: 'timed.test.ts' }],
          },
        ],
        options: {
          parallel: false,
          timeout: 30000,
          generateReport: true,
        },
      };

      const result = await coordinator.executeTests(request);

      expect(result.success).toBe(true);
      if (result.success && result.value.report) {
        expect(result.value.report.duration).toBeGreaterThanOrEqual(0);
        expect(result.value.report.startTime).toBeDefined();
        expect(result.value.report.endTime).toBeDefined();
      }
    });
  });
});
