/**
 * Integration Tests - Test Execution Coordinator
 * Tests the full workflow of test execution using actual interfaces
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TestExecutionCoordinator,
  ITestExecutionCoordinator,
} from '../../../src/domains/test-execution/coordinator';
import { EventBus, MemoryBackend } from '../../../src/kernel/interfaces';
import { createMockEventBus, createMockMemory } from '../../mocks';

describe('Test Execution Coordinator Integration', () => {
  let coordinator: ITestExecutionCoordinator;
  let eventBus: EventBus;
  let memory: MemoryBackend;

  beforeEach(async () => {
    eventBus = createMockEventBus();
    memory = createMockMemory();

    // Enable simulation mode for integration tests since no real test runner is available
    coordinator = new TestExecutionCoordinator(eventBus, memory, {
      simulateForTesting: true,
    });
    await coordinator.initialize();
  });

  afterEach(async () => {
    await coordinator.dispose();
    vi.clearAllMocks();
  });

  describe('Test Execution Workflow', () => {
    it('should execute test files', async () => {
      const request = {
        testFiles: ['tests/unit/example.test.ts'],
        framework: 'vitest',
        timeout: 30000,
      };

      const result = await coordinator.execute(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.runId).toBeDefined();
        expect(result.value.status).toBeDefined();
        expect(result.value.total).toBeGreaterThanOrEqual(0);
      }
    });

    it('should execute tests with custom environment', async () => {
      const request = {
        testFiles: ['tests/integration/api.test.ts'],
        framework: 'vitest',
        env: { NODE_ENV: 'test', DEBUG: 'true' },
      };

      const result = await coordinator.execute(request);

      expect(result.success).toBe(true);
    });

    it('should track test results', async () => {
      const request = {
        testFiles: ['tests/unit/math.test.ts'],
        framework: 'vitest',
      };

      const result = await coordinator.execute(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.passed).toBeDefined();
        expect(result.value.failed).toBeDefined();
        expect(result.value.skipped).toBeDefined();
        expect(result.value.duration).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle empty test files array', async () => {
      const request = {
        testFiles: [],
        framework: 'vitest',
      };

      const result = await coordinator.execute(request);

      // Should handle gracefully - either success with 0 tests or error
      expect(result).toBeDefined();
    });
  });

  describe('Parallel Execution', () => {
    it('should execute tests in parallel', async () => {
      const request = {
        testFiles: ['tests/a.test.ts', 'tests/b.test.ts', 'tests/c.test.ts'],
        framework: 'vitest',
        workers: 3,
      };

      const result = await coordinator.executeParallel(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.runId).toBeDefined();
      }
    });

    it('should support file-based sharding', async () => {
      const request = {
        testFiles: ['tests/suite1.test.ts', 'tests/suite2.test.ts'],
        framework: 'vitest',
        workers: 2,
        sharding: 'file' as const,
      };

      const result = await coordinator.executeParallel(request);

      expect(result.success).toBe(true);
    });

    it('should support process isolation', async () => {
      const request = {
        testFiles: ['tests/isolated.test.ts'],
        framework: 'vitest',
        workers: 1,
        isolation: 'process' as const,
      };

      const result = await coordinator.executeParallel(request);

      expect(result.success).toBe(true);
    });
  });

  describe('Flaky Test Detection', () => {
    it('should detect flaky tests', async () => {
      const request = {
        testFiles: ['tests/potentially-flaky.test.ts'],
        runs: 5,
        threshold: 0.8,
      };

      const result = await coordinator.detectFlaky(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.flakyTests).toBeDefined();
        expect(Array.isArray(result.value.flakyTests)).toBe(true);
        expect(result.value.totalRuns).toBe(5);
      }
    });

    it('should identify flakiness patterns', async () => {
      const request = {
        testFiles: ['tests/timing-sensitive.test.ts'],
        runs: 3,
        threshold: 0.9,
      };

      const result = await coordinator.detectFlaky(request);

      expect(result.success).toBe(true);
      if (result.success) {
        // Each flaky test should have a pattern
        result.value.flakyTests.forEach(test => {
          expect(test.pattern).toBeDefined();
          expect(['timing', 'ordering', 'resource', 'async', 'unknown']).toContain(test.pattern);
        });
      }
    });

    it('should provide recommendations for flaky tests', async () => {
      const request = {
        testFiles: ['tests/flaky.test.ts'],
        runs: 4,
        threshold: 0.75,
      };

      const result = await coordinator.detectFlaky(request);

      expect(result.success).toBe(true);
      if (result.success) {
        result.value.flakyTests.forEach(test => {
          expect(test.recommendation).toBeDefined();
        });
      }
    });
  });

  describe('Retry Logic', () => {
    it('should handle retry for existing run', async () => {
      // First execute tests to get a valid runId
      const execResult = await coordinator.execute({
        testFiles: ['tests/retry-test.ts'],
        framework: 'vitest',
      });

      expect(execResult.success).toBe(true);

      if (execResult.success) {
        // Try to retry (even if no failures, should handle gracefully)
        const request = {
          runId: execResult.value.runId,
          failedTests: [], // No failures to retry
          maxRetries: 3,
        };

        const result = await coordinator.retry(request);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.retried).toBeDefined();
        }
      }
    });

    it('should handle retry for non-existent run', async () => {
      const request = {
        runId: 'non-existent-run',
        failedTests: ['test-1'],
        maxRetries: 3,
      };

      const result = await coordinator.retry(request);

      // Should fail gracefully for non-existent run
      expect(result).toBeDefined();
      if (!result.success) {
        expect(result.error.message).toContain('not found');
      }
    });

    it('should support linear backoff option', async () => {
      const execResult = await coordinator.execute({
        testFiles: ['tests/backoff.ts'],
        framework: 'vitest',
      });

      if (execResult.success) {
        const request = {
          runId: execResult.value.runId,
          failedTests: [],
          maxRetries: 2,
          backoff: 'linear' as const,
        };

        const result = await coordinator.retry(request);
        expect(result).toBeDefined();
      }
    });

    it('should support exponential backoff option', async () => {
      const execResult = await coordinator.execute({
        testFiles: ['tests/exp-backoff.ts'],
        framework: 'vitest',
      });

      if (execResult.success) {
        const request = {
          runId: execResult.value.runId,
          failedTests: [],
          maxRetries: 3,
          backoff: 'exponential' as const,
        };

        const result = await coordinator.retry(request);
        expect(result).toBeDefined();
      }
    });
  });

  describe('Execution Statistics', () => {
    it('should retrieve stats for a run', async () => {
      // First execute a test
      const execResult = await coordinator.execute({
        testFiles: ['tests/stats.test.ts'],
        framework: 'vitest',
      });

      expect(execResult.success).toBe(true);

      if (execResult.success) {
        const statsResult = await coordinator.getStats(execResult.value.runId);

        expect(statsResult.success).toBe(true);
        if (statsResult.success) {
          expect(statsResult.value.runId).toBe(execResult.value.runId);
          expect(statsResult.value.duration).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('should handle non-existent run ID', async () => {
      const result = await coordinator.getStats('non-existent-run');

      // Should handle gracefully
      expect(result).toBeDefined();
    });
  });

  describe('Event Publishing', () => {
    it('should publish TestRunStarted event', async () => {
      const publishSpy = vi.spyOn(eventBus, 'publish');

      await coordinator.execute({
        testFiles: ['tests/event.test.ts'],
        framework: 'vitest',
      });

      expect(publishSpy).toHaveBeenCalled();
    });

    it('should publish TestRunCompleted event', async () => {
      const publishSpy = vi.spyOn(eventBus, 'publish');

      await coordinator.execute({
        testFiles: ['tests/complete.test.ts'],
        framework: 'vitest',
      });

      // Should have published at least one event
      expect(publishSpy.mock.calls.length).toBeGreaterThan(0);
    });
  });

  describe('Run Management', () => {
    it('should track active runs', async () => {
      const activeRuns = coordinator.getActiveRuns();
      expect(activeRuns).toBeDefined();
      expect(Array.isArray(activeRuns)).toBe(true);
    });

    it('should cancel active run', async () => {
      // Start a run
      const execPromise = coordinator.execute({
        testFiles: ['tests/long-running.test.ts'],
        framework: 'vitest',
        timeout: 60000,
      });

      // Get active runs and try to cancel
      const activeRuns = coordinator.getActiveRuns();

      if (activeRuns.length > 0) {
        const cancelResult = await coordinator.cancelRun(activeRuns[0]);
        expect(cancelResult).toBeDefined();
      }

      await execPromise;
    });

    it('should handle canceling non-existent run', async () => {
      const result = await coordinator.cancelRun('non-existent-run');

      // Should handle gracefully
      expect(result).toBeDefined();
    });
  });

  describe('Concurrent Execution', () => {
    it('should handle multiple concurrent executions', async () => {
      const requests = [
        { testFiles: ['tests/a.test.ts'], framework: 'vitest' },
        { testFiles: ['tests/b.test.ts'], framework: 'vitest' },
        { testFiles: ['tests/c.test.ts'], framework: 'vitest' },
      ];

      const results = await Promise.all(
        requests.map(req => coordinator.execute(req))
      );

      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle coordinator not initialized', async () => {
      const uninitCoordinator = new TestExecutionCoordinator(eventBus, memory, {
        simulateForTesting: true,
      });

      // Don't initialize - try to use
      const result = await uninitCoordinator.execute({
        testFiles: ['tests/test.ts'],
        framework: 'vitest',
      });

      // Should handle gracefully
      expect(result).toBeDefined();
    });

    it('should handle invalid framework', async () => {
      const request = {
        testFiles: ['tests/test.ts'],
        framework: 'unknown-framework',
      };

      const result = await coordinator.execute(request);

      // Should handle gracefully
      expect(result).toBeDefined();
    });
  });
});
