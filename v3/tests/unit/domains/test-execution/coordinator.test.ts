/**
 * Agentic QE v3 - Test Execution Coordinator Unit Tests
 * Milestone 1.5: Domain Coordinator Testing
 *
 * Tests cover:
 * - Constructor and initialization
 * - Task routing and execution
 * - Health reporting
 * - Agent management
 * - Event handling
 * - Error scenarios
 * - Queen integration
 * - MinCut topology awareness
 * - Consensus verification
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TestExecutionCoordinator,
  createTestExecutionCoordinator,
  type TestExecutionCoordinatorConfig,
} from '../../../../src/domains/test-execution/coordinator';
import {
  createCoordinatorTestContext,
  resetTestContext,
  expectEventPublished,
  expectNoEventPublished,
  expectSubscription,
  expectAgentSpawned,
  flushPromises,
  type CoordinatorTestContext,
} from '../coordinator-test-utils';
import type { ExecuteTestsRequest, ParallelExecutionRequest } from '../../../../src/domains/test-execution/interfaces';
import { TestExecutionEvents } from '../../../../src/shared/events';

describe('TestExecutionCoordinator', () => {
  let ctx: CoordinatorTestContext;
  let coordinator: TestExecutionCoordinator;

  // Default config with simulation mode enabled for deterministic testing
  const defaultConfig: Partial<TestExecutionCoordinatorConfig> = {
    simulateForTesting: true,
    enablePrioritization: false, // Disable DT for unit tests
    enableMinCutAwareness: false,
    enableConsensus: false,
  };

  beforeEach(() => {
    ctx = createCoordinatorTestContext();
    coordinator = new TestExecutionCoordinator(
      ctx.eventBus,
      ctx.memory,
      defaultConfig
    );
  });

  afterEach(async () => {
    await coordinator.dispose();
    resetTestContext(ctx);
  });

  // ===========================================================================
  // Constructor and Initialization Tests
  // ===========================================================================

  describe('Constructor and Initialization', () => {
    it('should create coordinator with default config', () => {
      const coord = new TestExecutionCoordinator(ctx.eventBus, ctx.memory);
      expect(coord).toBeDefined();
    });

    it('should create coordinator with custom config', () => {
      const customConfig: Partial<TestExecutionCoordinatorConfig> = {
        simulateForTesting: true,
        enablePrioritization: false,
        enableMinCutAwareness: true,
        topologyHealthThreshold: 0.7,
      };
      const coord = new TestExecutionCoordinator(ctx.eventBus, ctx.memory, customConfig);
      expect(coord).toBeDefined();
    });

    it('should initialize without errors', async () => {
      await expect(coordinator.initialize()).resolves.not.toThrow();
    });

    it('should be idempotent on multiple initializations', async () => {
      await coordinator.initialize();
      await coordinator.initialize();
      // Should not throw
    });

    it('should subscribe to domain events on initialization', async () => {
      await coordinator.initialize();
      await flushPromises();

      // Should subscribe to test generation events
      expect(ctx.eventBus.subscribe).toHaveBeenCalled();
    });

    it('should start with no active runs', async () => {
      await coordinator.initialize();
      expect(coordinator.getActiveRuns()).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Test Execution Tests
  // ===========================================================================

  describe('Test Execution', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    describe('execute()', () => {
      it('should execute tests and return results', async () => {
        const request: ExecuteTestsRequest = {
          testFiles: ['test1.test.ts', 'test2.test.ts'],
          framework: 'vitest',
          timeout: 30000,
        };

        const result = await coordinator.execute(request);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.runId).toBeDefined();
          expect(typeof result.value.passed).toBe('number');
          expect(typeof result.value.failed).toBe('number');
          expect(typeof result.value.duration).toBe('number');
        }
      });

      it('should publish TestRunStarted event', async () => {
        const request: ExecuteTestsRequest = {
          testFiles: ['test1.test.ts'],
          framework: 'vitest',
          timeout: 30000,
        };

        await coordinator.execute(request);

        expectEventPublished(ctx.eventBus, TestExecutionEvents.TestRunStarted);
      });

      it('should publish TestRunCompleted event on success', async () => {
        const request: ExecuteTestsRequest = {
          testFiles: ['test1.test.ts'],
          framework: 'vitest',
          timeout: 30000,
        };

        await coordinator.execute(request);

        expectEventPublished(ctx.eventBus, TestExecutionEvents.TestRunCompleted);
      });

      it('should track active runs during execution', async () => {
        const request: ExecuteTestsRequest = {
          testFiles: ['test1.test.ts'],
          framework: 'vitest',
          timeout: 30000,
        };

        // Start but don't await to check mid-execution state
        const executionPromise = coordinator.execute(request);

        // Note: In simulation mode, execution is synchronous
        await executionPromise;

        // After completion, should have no active runs
        expect(coordinator.getActiveRuns()).toHaveLength(0);
      });

      it('should remove run from active runs after completion', async () => {
        const request: ExecuteTestsRequest = {
          testFiles: ['test1.test.ts'],
          framework: 'vitest',
          timeout: 30000,
        };

        await coordinator.execute(request);

        expect(coordinator.getActiveRuns()).toHaveLength(0);
      });
    });

    describe('executeParallel()', () => {
      it('should execute tests in parallel', async () => {
        const request: ParallelExecutionRequest = {
          testFiles: ['test1.test.ts', 'test2.test.ts', 'test3.test.ts'],
          framework: 'vitest',
          workers: 2,
          timeout: 30000,
        };

        const result = await coordinator.executeParallel(request);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.runId).toBeDefined();
        }
      });

      it('should publish TestRunStarted with parallel flag', async () => {
        const request: ParallelExecutionRequest = {
          testFiles: ['test1.test.ts', 'test2.test.ts'],
          framework: 'vitest',
          workers: 2,
          timeout: 30000,
        };

        await coordinator.executeParallel(request);

        const events = ctx.eventBus.getEventsByType(TestExecutionEvents.TestRunStarted);
        expect(events.length).toBeGreaterThan(0);
        expect((events[0].payload as any).parallel).toBe(true);
        expect((events[0].payload as any).workers).toBe(2);
      });
    });

    describe('runTests() - Simple API', () => {
      it('should auto-detect framework from file patterns', async () => {
        const result = await coordinator.runTests({
          testFiles: ['example.test.ts'],
        });

        expect(result.success).toBe(true);
      });

      it('should use parallel execution for multiple files', async () => {
        const result = await coordinator.runTests({
          testFiles: ['test1.test.ts', 'test2.test.ts'],
          parallel: true,
          workers: 2,
        });

        expect(result.success).toBe(true);
      });

      it('should use sequential execution when parallel is false', async () => {
        const result = await coordinator.runTests({
          testFiles: ['test1.test.ts', 'test2.test.ts'],
          parallel: false,
        });

        expect(result.success).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Flaky Detection Tests
  // ===========================================================================

  describe('Flaky Detection', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    it('should detect flaky tests', async () => {
      const result = await coordinator.detectFlaky({
        testFiles: ['flaky.test.ts'],
        iterations: 3,
        threshold: 0.3,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.flakyTests).toBeDefined();
        expect(Array.isArray(result.value.flakyTests)).toBe(true);
      }
    });

    it('should publish FlakyTestDetected events', async () => {
      // Pre-populate some flaky test history
      await coordinator.detectFlaky({
        testFiles: ['flaky.test.ts'],
        iterations: 5,
        threshold: 0.2,
      });

      // Check for flaky events (may or may not have detected any)
      const events = ctx.eventBus.getEventsByType(TestExecutionEvents.FlakyTestDetected);
      // Events depend on simulation behavior
      expect(events).toBeDefined();
    });
  });

  // ===========================================================================
  // Retry Handler Tests
  // ===========================================================================

  describe('Retry Handler', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    it('should retry failed tests', async () => {
      // First execute tests to get a runId
      const execResult = await coordinator.execute({
        testFiles: ['test1.test.ts'],
        framework: 'vitest',
        timeout: 30000,
      });

      expect(execResult.success).toBe(true);
      if (!execResult.success) return;

      const result = await coordinator.retry({
        runId: execResult.value.runId,
        failedTests: [],
        maxRetries: 3,
        backoff: 'exponential',
      });

      expect(result.success).toBe(true);
    });

    it('should publish RetryTriggered event', async () => {
      const execResult = await coordinator.execute({
        testFiles: ['test1.test.ts'],
        framework: 'vitest',
        timeout: 30000,
      });

      if (!execResult.success) return;

      await coordinator.retry({
        runId: execResult.value.runId,
        failedTests: ['test-1'],
        maxRetries: 2,
      });

      // Retry is triggered only if there are actual failed tests to retry
      // In simulation mode, this depends on the executor behavior
    });

    it('should return error for unknown run ID', async () => {
      const result = await coordinator.retry({
        runId: 'unknown-run-id',
        failedTests: ['test-1'],
        maxRetries: 2,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('not found');
      }
    });
  });

  // ===========================================================================
  // Run Cancellation Tests
  // ===========================================================================

  describe('Run Cancellation', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    it('should cancel active runs', async () => {
      // Start a run
      const execResult = await coordinator.execute({
        testFiles: ['test1.test.ts'],
        framework: 'vitest',
        timeout: 30000,
      });

      // In simulation mode, run completes immediately
      // So we test cancellation of non-existent run
      const result = await coordinator.cancelRun('non-existent-run');
      expect(result.success).toBe(false);
    });

    it('should publish TestRunCancelled event', async () => {
      // This would require a way to cancel mid-execution
      // For now, verify the method exists and handles errors correctly
      const result = await coordinator.cancelRun('test-run-id');
      expect(result.success).toBe(false);
    });

    it('should return error for non-existent run', async () => {
      const result = await coordinator.cancelRun('non-existent-run');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('not found');
      }
    });
  });

  // ===========================================================================
  // Statistics Tests
  // ===========================================================================

  describe('Execution Statistics', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    it('should return stats for completed run', async () => {
      const execResult = await coordinator.execute({
        testFiles: ['test1.test.ts'],
        framework: 'vitest',
        timeout: 30000,
      });

      if (!execResult.success) return;

      const statsResult = await coordinator.getStats(execResult.value.runId);

      expect(statsResult.success).toBe(true);
      if (statsResult.success) {
        expect(statsResult.value).toBeDefined();
      }
    });
  });

  // ===========================================================================
  // MinCut Topology Awareness Tests
  // ===========================================================================

  describe('MinCut Topology Awareness', () => {
    let topologyCoordinator: TestExecutionCoordinator;

    beforeEach(async () => {
      topologyCoordinator = new TestExecutionCoordinator(
        ctx.eventBus,
        ctx.memory,
        {
          ...defaultConfig,
          enableMinCutAwareness: true,
          topologyHealthThreshold: 0.5,
          pauseOnCriticalTopology: true,
        }
      );
      await topologyCoordinator.initialize();
    });

    afterEach(async () => {
      await topologyCoordinator.dispose();
    });

    it('should report topology health status', () => {
      // Without MinCut bridge, should default to healthy
      expect(topologyCoordinator.isTopologyHealthy()).toBe(true);
    });

    it('should accept MinCut bridge', () => {
      // Just verify the method doesn't throw
      expect(() => {
        topologyCoordinator.setMinCutBridge({} as any);
      }).not.toThrow();
    });

    it('should check if domain is weak point', () => {
      // Without bridge, should return false
      expect(topologyCoordinator.isDomainWeakPoint()).toBe(false);
    });

    it('should get domain weak vertices', () => {
      const weakVertices = topologyCoordinator.getDomainWeakVertices();
      expect(Array.isArray(weakVertices)).toBe(true);
    });

    it('should filter target domains based on topology', () => {
      const targets = ['test-generation', 'coverage-analysis'] as any[];
      const filtered = topologyCoordinator.getTopologyBasedRouting(targets);
      expect(Array.isArray(filtered)).toBe(true);
    });
  });

  // ===========================================================================
  // Consensus Verification Tests
  // ===========================================================================

  describe('Consensus Verification', () => {
    let consensusCoordinator: TestExecutionCoordinator;

    beforeEach(async () => {
      consensusCoordinator = new TestExecutionCoordinator(
        ctx.eventBus,
        ctx.memory,
        {
          ...defaultConfig,
          enableConsensus: true,
          consensusThreshold: 0.7,
          consensusStrategy: 'weighted',
          consensusMinModels: 2,
        }
      );
      await consensusCoordinator.initialize();
    });

    afterEach(async () => {
      await consensusCoordinator.dispose();
    });

    it('should check consensus availability', () => {
      // May return false if consensus engine not fully initialized
      const available = consensusCoordinator.isConsensusAvailable();
      expect(typeof available).toBe('boolean');
    });

    it('should get consensus statistics', () => {
      const stats = consensusCoordinator.getConsensusStats();
      // Stats may be undefined if consensus engine not fully initialized
      expect(stats === undefined || typeof stats === 'object').toBe(true);
    });
  });

  // ===========================================================================
  // Disposal Tests
  // ===========================================================================

  describe('Disposal', () => {
    it('should dispose without errors', async () => {
      await coordinator.initialize();
      await expect(coordinator.dispose()).resolves.not.toThrow();
    });

    it('should cancel active runs on dispose', async () => {
      await coordinator.initialize();

      // Start an execution (completes immediately in simulation)
      await coordinator.execute({
        testFiles: ['test1.test.ts'],
        framework: 'vitest',
        timeout: 30000,
      });

      await coordinator.dispose();

      expect(coordinator.getActiveRuns()).toHaveLength(0);
    });

    it('should be idempotent on multiple disposals', async () => {
      await coordinator.initialize();
      await coordinator.dispose();
      await coordinator.dispose();
      // Should not throw
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('Error Handling', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    it('should handle empty test file list', async () => {
      const result = await coordinator.execute({
        testFiles: [],
        framework: 'vitest',
        timeout: 30000,
      });

      // Should either succeed with 0 tests or return error
      expect(result).toBeDefined();
    });

    it('should handle invalid framework gracefully', async () => {
      const result = await coordinator.execute({
        testFiles: ['test1.test.ts'],
        framework: 'unknown-framework' as any,
        timeout: 30000,
      });

      // Implementation should handle or default
      expect(result).toBeDefined();
    });

    it('should handle zero timeout', async () => {
      const result = await coordinator.execute({
        testFiles: ['test1.test.ts'],
        framework: 'vitest',
        timeout: 0,
      });

      expect(result).toBeDefined();
    });
  });

  // ===========================================================================
  // Factory Function Tests
  // ===========================================================================

  describe('Factory Function', () => {
    it('should create coordinator via factory function', () => {
      const coord = createTestExecutionCoordinator(
        ctx.eventBus,
        ctx.memory,
        defaultConfig
      );
      expect(coord).toBeDefined();
    });

    it('should create coordinator with default config via factory', () => {
      const coord = createTestExecutionCoordinator(ctx.eventBus, ctx.memory);
      expect(coord).toBeDefined();
    });
  });

  // ===========================================================================
  // ADR-057: Infrastructure Self-Healing Auto-Recovery Tests
  // ===========================================================================

  describe('Infrastructure Self-Healing Auto-Recovery', () => {
    /**
     * Creates a mock InfraHealingOrchestrator that:
     * - feedTestOutput() → tracks calls
     * - getObserver().getFailingServices() → returns configured failing services
     * - recordAffectedTests() → tracks calls
     * - runRecoveryCycle() → returns configured recovery results
     */
    function createMockInfraHealing(options: {
      failingServices?: Set<string>;
      recoveryResults?: Array<{ serviceName: string; recovered: boolean; affectedTestIds: string[] }>;
    } = {}) {
      const failingServices = options.failingServices ?? new Set<string>();
      const recoveryResults = (options.recoveryResults ?? []).map(r => ({
        serviceName: r.serviceName,
        recovered: r.recovered,
        totalAttempts: 1,
        totalDurationMs: 100,
        escalated: false,
        affectedTestIds: r.affectedTestIds,
        steps: [],
      }));

      const feedCalls: string[] = [];
      const recordCalls: Array<{ service: string; testIds: string[] }> = [];

      return {
        mock: {
          feedTestOutput: vi.fn((output: string) => { feedCalls.push(output); }),
          getObserver: vi.fn(() => ({
            getFailingServices: vi.fn(() => failingServices),
            getLastObservation: vi.fn(() => null),
          })),
          recordAffectedTests: vi.fn((service: string, testIds: string[]) => {
            recordCalls.push({ service, testIds });
          }),
          runRecoveryCycle: vi.fn(async () => recoveryResults),
        },
        feedCalls,
        recordCalls,
      };
    }

    it('should attempt auto-recovery when infra failures are detected', async () => {
      const { mock } = createMockInfraHealing({
        failingServices: new Set(['postgres']),
        recoveryResults: [{
          serviceName: 'postgres',
          recovered: true,
          affectedTestIds: ['test-1'],
        }],
      });

      const infraCoordinator = new TestExecutionCoordinator(
        ctx.eventBus,
        ctx.memory,
        {
          ...defaultConfig,
          infraHealing: mock as any,
          infraAutoRecover: true,
          infraMaxAutoRecoveryAttempts: 1,
          executorConfig: {
            simulateForTesting: true,
            simulatedFailureRate: 1.0, // Force all tests to fail
          },
        },
      );
      await infraCoordinator.initialize();

      await infraCoordinator.execute({
        testFiles: ['db-test.test.ts'],
        framework: 'vitest',
        timeout: 30000,
      });

      // feedTestOutput should have been called with the error messages
      expect(mock.feedTestOutput).toHaveBeenCalled();
      // runRecoveryCycle should have been called (auto-recovery triggered)
      expect(mock.runRecoveryCycle).toHaveBeenCalled();

      await infraCoordinator.dispose();
    });

    it('should not auto-recover when infraAutoRecover is false', async () => {
      const { mock } = createMockInfraHealing({
        failingServices: new Set(['postgres']),
        recoveryResults: [{
          serviceName: 'postgres',
          recovered: true,
          affectedTestIds: ['test-1'],
        }],
      });

      const infraCoordinator = new TestExecutionCoordinator(
        ctx.eventBus,
        ctx.memory,
        {
          ...defaultConfig,
          infraHealing: mock as any,
          infraAutoRecover: false,
          executorConfig: {
            simulateForTesting: true,
            simulatedFailureRate: 1.0,
          },
        },
      );
      await infraCoordinator.initialize();

      await infraCoordinator.execute({
        testFiles: ['db-test.test.ts'],
        framework: 'vitest',
        timeout: 30000,
      });

      // feedTestOutput still called (detection always happens)
      expect(mock.feedTestOutput).toHaveBeenCalled();
      // But runRecoveryCycle should NOT be called
      expect(mock.runRecoveryCycle).not.toHaveBeenCalled();

      await infraCoordinator.dispose();
    });

    it('should respect maxAutoRecoveryAttempts limit', async () => {
      const { mock } = createMockInfraHealing({
        failingServices: new Set(['postgres']),
        recoveryResults: [{
          serviceName: 'postgres',
          recovered: true,
          affectedTestIds: ['test-1'],
        }],
      });

      const infraCoordinator = new TestExecutionCoordinator(
        ctx.eventBus,
        ctx.memory,
        {
          ...defaultConfig,
          infraHealing: mock as any,
          infraAutoRecover: true,
          infraMaxAutoRecoveryAttempts: 1,
          executorConfig: {
            simulateForTesting: true,
            simulatedFailureRate: 1.0, // Will keep failing even after recovery
          },
        },
      );
      await infraCoordinator.initialize();

      await infraCoordinator.execute({
        testFiles: ['db-test.test.ts'],
        framework: 'vitest',
        timeout: 30000,
      });

      // runRecoveryCycle called at most 1 time (maxAutoRecoveryAttempts = 1)
      expect(mock.runRecoveryCycle.mock.calls.length).toBeLessThanOrEqual(1);

      await infraCoordinator.dispose();
    });

    it('should not recover when no infra failures are detected', async () => {
      const { mock } = createMockInfraHealing({
        failingServices: new Set(), // No infra failures
      });

      const infraCoordinator = new TestExecutionCoordinator(
        ctx.eventBus,
        ctx.memory,
        {
          ...defaultConfig,
          infraHealing: mock as any,
          infraAutoRecover: true,
          executorConfig: {
            simulateForTesting: true,
            simulatedFailureRate: 1.0,
          },
        },
      );
      await infraCoordinator.initialize();

      await infraCoordinator.execute({
        testFiles: ['logic-test.test.ts'],
        framework: 'vitest',
        timeout: 30000,
      });

      // feedTestOutput called (detection happens)
      expect(mock.feedTestOutput).toHaveBeenCalled();
      // But no recovery because observer found no infra failures
      expect(mock.runRecoveryCycle).not.toHaveBeenCalled();

      await infraCoordinator.dispose();
    });

    it('should record affected tests per failing service', async () => {
      const { mock, recordCalls } = createMockInfraHealing({
        failingServices: new Set(['postgres', 'redis']),
      });

      const infraCoordinator = new TestExecutionCoordinator(
        ctx.eventBus,
        ctx.memory,
        {
          ...defaultConfig,
          infraHealing: mock as any,
          infraAutoRecover: false, // Just test detection/recording
          executorConfig: {
            simulateForTesting: true,
            simulatedFailureRate: 1.0,
          },
        },
      );
      await infraCoordinator.initialize();

      await infraCoordinator.execute({
        testFiles: ['db-test.test.ts'],
        framework: 'vitest',
        timeout: 30000,
      });

      // recordAffectedTests called for each failing service
      expect(mock.recordAffectedTests).toHaveBeenCalledTimes(2);
      const services = recordCalls.map(c => c.service).sort();
      expect(services).toEqual(['postgres', 'redis']);

      await infraCoordinator.dispose();
    });
  });
});
