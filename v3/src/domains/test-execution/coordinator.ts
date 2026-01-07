/**
 * Agentic QE v3 - Test Execution Coordinator
 * Orchestrates test execution workflow and publishes domain events
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '../../shared/types';
import {
  TestExecutionAPI,
  ExecuteTestsRequest,
  ParallelExecutionRequest,
  TestRunResult,
  FlakyDetectionRequest,
  FlakyTestReport,
  RetryRequest,
  RetryResult,
  ExecutionStats,
} from './interfaces';
import {
  TestExecutionEvents,
  TestRunStartedPayload,
  TestRunCompletedPayload,
  FlakyTestDetectedPayload,
  createEvent,
} from '../../shared/events';
import { EventBus, MemoryBackend } from '../../kernel/interfaces';
import { TestExecutorService } from './services/test-executor';
import { FlakyDetectorService } from './services/flaky-detector';
import { RetryHandlerService } from './services/retry-handler';

// ============================================================================
// Coordinator Interface
// ============================================================================

export interface ITestExecutionCoordinator extends TestExecutionAPI {
  /** Initialize the coordinator */
  initialize(): Promise<void>;

  /** Dispose resources */
  dispose(): Promise<void>;

  /** Get active runs */
  getActiveRuns(): string[];

  /** Cancel a running test */
  cancelRun(runId: string): Promise<Result<void, Error>>;
}

// ============================================================================
// Test Execution Coordinator
// ============================================================================

export class TestExecutionCoordinator implements ITestExecutionCoordinator {
  private readonly executor: TestExecutorService;
  private readonly flakyDetector: FlakyDetectorService;
  private readonly retryHandler: RetryHandlerService;
  private readonly activeRuns = new Set<string>();
  private initialized = false;

  constructor(
    private readonly eventBus: EventBus,
    memory: MemoryBackend
  ) {
    this.executor = new TestExecutorService(memory);
    this.flakyDetector = new FlakyDetectorService(memory);
    this.retryHandler = new RetryHandlerService(memory);
  }

  /**
   * Initialize the coordinator
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Subscribe to relevant events from other domains
    this.subscribeToEvents();

    this.initialized = true;
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    // Cancel all active runs
    for (const runId of this.activeRuns) {
      await this.cancelRun(runId);
    }

    this.activeRuns.clear();
    this.initialized = false;
  }

  /**
   * Get list of active run IDs
   */
  getActiveRuns(): string[] {
    return Array.from(this.activeRuns);
  }

  /**
   * Cancel a running test execution
   */
  async cancelRun(runId: string): Promise<Result<void, Error>> {
    if (!this.activeRuns.has(runId)) {
      return err(new Error(`Run not found or already completed: ${runId}`));
    }

    // In a real implementation, would signal the test runner to stop
    this.activeRuns.delete(runId);

    // Publish cancellation event
    await this.publishEvent<{ runId: string }>(
      'test-execution.TestRunCancelled',
      { runId }
    );

    return ok(undefined);
  }

  // ============================================================================
  // TestExecutionAPI Implementation
  // ============================================================================

  /**
   * Execute a test suite
   */
  async execute(request: ExecuteTestsRequest): Promise<Result<TestRunResult, Error>> {
    const runId = uuidv4();
    this.activeRuns.add(runId);

    try {
      // Publish start event
      await this.publishEvent<TestRunStartedPayload>(
        TestExecutionEvents.TestRunStarted,
        {
          runId,
          testCount: request.testFiles.length,
          parallel: false,
          workers: 1,
        }
      );

      // Execute tests
      const result = await this.executor.execute(request);

      // Remove from active runs
      this.activeRuns.delete(runId);

      if (result.success) {
        // Publish completion event
        await this.publishEvent<TestRunCompletedPayload>(
          TestExecutionEvents.TestRunCompleted,
          {
            runId: result.value.runId,
            passed: result.value.passed,
            failed: result.value.failed,
            skipped: result.value.skipped,
            duration: result.value.duration,
          }
        );

        // Record failed tests for flaky analysis
        for (const failed of result.value.failedTests) {
          await this.flakyDetector.recordExecution(failed.testId, {
            runId: result.value.runId,
            passed: false,
            duration: failed.duration,
            error: failed.error,
            timestamp: new Date(),
          });
        }
      }

      return result;
    } catch (error) {
      this.activeRuns.delete(runId);
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Execute tests in parallel
   */
  async executeParallel(request: ParallelExecutionRequest): Promise<Result<TestRunResult, Error>> {
    const runId = uuidv4();
    this.activeRuns.add(runId);

    try {
      // Publish start event
      await this.publishEvent<TestRunStartedPayload>(
        TestExecutionEvents.TestRunStarted,
        {
          runId,
          testCount: request.testFiles.length,
          parallel: true,
          workers: request.workers,
        }
      );

      // Execute tests in parallel
      const result = await this.executor.executeParallel(request);

      // Remove from active runs
      this.activeRuns.delete(runId);

      if (result.success) {
        // Publish completion event
        await this.publishEvent<TestRunCompletedPayload>(
          TestExecutionEvents.TestRunCompleted,
          {
            runId: result.value.runId,
            passed: result.value.passed,
            failed: result.value.failed,
            skipped: result.value.skipped,
            duration: result.value.duration,
          }
        );

        // Check for flaky tests based on history
        for (const failed of result.value.failedTests) {
          const flakinessScore = await this.flakyDetector.getFlakinessScore(failed.testId);

          if (flakinessScore > 0.3) {
            await this.publishEvent<FlakyTestDetectedPayload>(
              TestExecutionEvents.FlakyTestDetected,
              {
                testId: failed.testId,
                testFile: failed.file,
                failureRate: flakinessScore,
                pattern: 'unknown',
              }
            );
          }
        }
      }

      return result;
    } catch (error) {
      this.activeRuns.delete(runId);
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Detect flaky tests
   */
  async detectFlaky(request: FlakyDetectionRequest): Promise<Result<FlakyTestReport, Error>> {
    const result = await this.flakyDetector.detectFlaky(request);

    if (result.success) {
      // Publish events for detected flaky tests
      for (const flaky of result.value.flakyTests) {
        await this.publishEvent<FlakyTestDetectedPayload>(
          TestExecutionEvents.FlakyTestDetected,
          {
            testId: flaky.testId,
            testFile: flaky.file,
            failureRate: flaky.failureRate,
            pattern: flaky.pattern,
          }
        );
      }
    }

    return result;
  }

  /**
   * Retry failed tests
   */
  async retry(request: RetryRequest): Promise<Result<RetryResult, Error>> {
    // Get original run results to get failed test details
    const runResult = await this.executor.getResults(request.runId);

    if (!runResult.success) {
      return err(new Error(`Original run not found: ${request.runId}`));
    }

    // Filter failed tests that were requested for retry
    const testsToRetry = runResult.value.failedTests.filter(
      t => request.failedTests.includes(t.testId)
    );

    if (testsToRetry.length === 0) {
      return ok({
        originalFailed: 0,
        retried: 0,
        nowPassing: 0,
        stillFailing: 0,
        flakyDetected: [],
      });
    }

    // Publish retry triggered event
    await this.publishEvent<{ runId: string; testCount: number }>(
      TestExecutionEvents.RetryTriggered,
      {
        runId: request.runId,
        testCount: testsToRetry.length,
      }
    );

    // Execute retries
    const result = await this.retryHandler.executeWithRetry({
      runId: request.runId,
      failedTests: testsToRetry,
      maxRetries: request.maxRetries,
      backoff: request.backoff ?? 'exponential',
      onRetry: (testId, attempt) => {
        // Could publish individual retry events here
        void testId;
        void attempt;
      },
    });

    // Publish flaky test events for tests that passed on retry
    if (result.success) {
      for (const flakyTestId of result.value.flakyDetected) {
        const testInfo = testsToRetry.find(t => t.testId === flakyTestId);

        await this.publishEvent<FlakyTestDetectedPayload>(
          TestExecutionEvents.FlakyTestDetected,
          {
            testId: flakyTestId,
            testFile: testInfo?.file ?? 'unknown',
            failureRate: 0.5, // Approximate - passed on retry
            pattern: 'unknown',
          }
        );
      }
    }

    return result;
  }

  /**
   * Get execution statistics
   */
  async getStats(runId: string): Promise<Result<ExecutionStats, Error>> {
    return this.executor.getStats(runId);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private subscribeToEvents(): void {
    // Subscribe to test generation events
    this.eventBus.subscribe('test-generation.TestSuiteCreated', async (event) => {
      // Could auto-execute newly generated tests
      const payload = event.payload as { suiteId: string; testCount: number };
      void payload; // Available for future auto-execution feature
    });

    // Subscribe to coverage analysis requests
    this.eventBus.subscribe('coverage-analysis.CoverageGapDetected', async (event) => {
      // Could trigger targeted test execution for uncovered areas
      const payload = event.payload as { file: string; uncoveredLines: number[] };
      void payload; // Available for future targeted execution feature
    });
  }

  private async publishEvent<T>(type: string, payload: T): Promise<void> {
    const event = createEvent(type, 'test-execution', payload);
    await this.eventBus.publish(event);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createTestExecutionCoordinator(
  eventBus: EventBus,
  memory: MemoryBackend
): ITestExecutionCoordinator {
  return new TestExecutionCoordinator(eventBus, memory);
}
