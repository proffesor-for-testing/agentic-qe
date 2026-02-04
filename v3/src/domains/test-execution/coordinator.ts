/**
 * Agentic QE v3 - Test Execution Coordinator
 * Orchestrates test execution workflow and publishes domain events
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '../../shared/types';
import {
  TestExecutionAPI,
  SimpleTestRequest,
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
import { TestExecutorService, TestExecutorConfig } from './services/test-executor';
import { FlakyDetectorService, FlakyDetectorConfig } from './services/flaky-detector';
import { RetryHandlerService, RetryHandlerConfig } from './services/retry-handler';
import { TestPrioritizerService, TestPrioritizerConfig, type TestMetadata, type TestPrioritizationContext } from './services/test-prioritizer';
import {
  E2ETestRunnerService,
  createE2ETestRunnerService,
  type E2ERunnerConfig,
  type ExecutionStrategy,
} from './services/e2e-runner';
import type {
  E2ETestCase,
  E2ETestSuite,
  E2ETestResult,
  E2ETestSuiteResult,
} from './types';
import type { VibiumClient } from '../../integrations/vibium';

// ============================================================================
// MinCut & Consensus Mixin Imports (ADR-047, MM-001)
// ============================================================================

import {
  MinCutAwareDomainMixin,
  createMinCutAwareMixin,
  type IMinCutAwareDomain,
  type MinCutAwareConfig,
} from '../../coordination/mixins/mincut-aware-domain';

import {
  ConsensusEnabledMixin,
  createConsensusEnabledMixin,
  type IConsensusEnabledDomain,
  type ConsensusEnabledConfig,
} from '../../coordination/mixins/consensus-enabled-domain';

// ADR-058: Governance-aware mixin for MemoryWriteGate integration
import {
  GovernanceAwareDomainMixin,
  createGovernanceAwareMixin,
} from '../../coordination/mixins/governance-aware-domain.js';

import type { QueenMinCutBridge } from '../../coordination/mincut/queen-integration';

import {
  type DomainFinding,
  createDomainFinding,
} from '../../coordination/consensus/domain-findings';

import type { DomainName } from '../../shared/types';
import type { WeakVertex } from '../../coordination/mincut/interfaces';

// ============================================================================
// Coordinator Configuration
// ============================================================================

/**
 * Configuration for the test execution coordinator
 */
export interface TestExecutionCoordinatorConfig {
  /**
   * When true, enables simulation mode for all services (for unit testing).
   * When false (default), services operate in deterministic production mode.
   */
  simulateForTesting: boolean;
  /**
   * Optional executor-specific config overrides
   */
  executorConfig?: Partial<TestExecutorConfig>;
  /**
   * Optional flaky detector-specific config overrides
   */
  flakyDetectorConfig?: Partial<FlakyDetectorConfig>;
  /**
   * Optional retry handler-specific config overrides
   */
  retryHandlerConfig?: Partial<RetryHandlerConfig>;
  /**
   * Optional test prioritizer config overrides
   */
  prioritizerConfig?: Partial<TestPrioritizerConfig>;
  /**
   * Enable intelligent test prioritization using Decision Transformer
   * @default true
   */
  enablePrioritization?: boolean;
  /**
   * Optional E2E runner config overrides
   */
  e2eRunnerConfig?: Partial<E2ERunnerConfig>;
  /**
   * Vibium client for E2E testing (dependency injection)
   */
  vibiumClient?: VibiumClient;
  // MinCut integration config (ADR-047)
  enableMinCutAwareness: boolean;
  topologyHealthThreshold: number;
  pauseOnCriticalTopology: boolean;
  // Consensus integration config (MM-001)
  enableConsensus: boolean;
  consensusThreshold: number;
  consensusStrategy: 'majority' | 'weighted' | 'unanimous';
  consensusMinModels: number;
}

const DEFAULT_COORDINATOR_CONFIG: TestExecutionCoordinatorConfig = {
  simulateForTesting: false,
  enablePrioritization: true,
  // MinCut integration defaults (ADR-047)
  enableMinCutAwareness: true,
  topologyHealthThreshold: 0.5,
  pauseOnCriticalTopology: false,
  // Consensus integration defaults (MM-001)
  enableConsensus: true,
  consensusThreshold: 0.7,
  consensusStrategy: 'weighted',
  consensusMinModels: 2,
};

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

  // MinCut integration methods (ADR-047)
  setMinCutBridge(bridge: QueenMinCutBridge): void;
  isTopologyHealthy(): boolean;
  /** Get topology-based routing for target domains */
  getTopologyBasedRouting(targetDomains: DomainName[]): DomainName[];
  /** Get weak vertices in this domain */
  getDomainWeakVertices(): WeakVertex[];
  /** Check if this domain is a weak point in topology */
  isDomainWeakPoint(): boolean;
  // Consensus integration methods (MM-001)
  isConsensusAvailable(): boolean;
}

// ============================================================================
// Test Execution Coordinator
// ============================================================================

export class TestExecutionCoordinator implements ITestExecutionCoordinator {
  private readonly executor: TestExecutorService;
  private readonly flakyDetector: FlakyDetectorService;
  private readonly retryHandler: RetryHandlerService;
  private readonly prioritizer: TestPrioritizerService;
  private readonly e2eRunner?: E2ETestRunnerService;
  private readonly activeRuns = new Set<string>();
  private readonly config: TestExecutionCoordinatorConfig;
  private initialized = false;

  // MinCut topology awareness mixin (ADR-047)
  private readonly minCutMixin: MinCutAwareDomainMixin;

  // Consensus verification mixin (MM-001)
  private readonly consensusMixin: ConsensusEnabledMixin;

  // Domain identifier for mixin initialization
  private readonly domainName = 'test-execution';

  // ADR-058: Governance mixin for MemoryWriteGate integration
  private readonly governanceMixin: GovernanceAwareDomainMixin;

  constructor(
    private readonly eventBus: EventBus,
    memory: MemoryBackend,
    config: Partial<TestExecutionCoordinatorConfig> = {}
  ) {
    const fullConfig: TestExecutionCoordinatorConfig = {
      ...DEFAULT_COORDINATOR_CONFIG,
      ...config,
    };
    this.config = fullConfig;

    // Initialize MinCut-aware mixin (ADR-047)
    this.minCutMixin = createMinCutAwareMixin(this.domainName, {
      enableMinCutAwareness: this.config.enableMinCutAwareness,
      topologyHealthThreshold: this.config.topologyHealthThreshold,
      pauseOnCriticalTopology: this.config.pauseOnCriticalTopology,
    });

    // Initialize Consensus-enabled mixin (MM-001)
    this.consensusMixin = createConsensusEnabledMixin({
      enableConsensus: this.config.enableConsensus,
      consensusThreshold: this.config.consensusThreshold,
      verifyFindingTypes: ['flaky-test-detection', 'test-failure-analysis', 'retry-strategy'],
      strategy: this.config.consensusStrategy,
      minModels: this.config.consensusMinModels,
      modelTimeout: 60000,
      verifySeverities: ['critical', 'high'],
      enableLogging: false,
    });

    // ADR-058: Initialize governance mixin for MemoryWriteGate integration
    this.governanceMixin = createGovernanceAwareMixin(this.domainName);

    // Create services with appropriate configuration
    this.executor = new TestExecutorService({ memory }, {
      simulateForTesting: fullConfig.simulateForTesting,
      ...fullConfig.executorConfig,
    });
    this.flakyDetector = new FlakyDetectorService(memory, {
      simulateForTesting: fullConfig.simulateForTesting,
      ...fullConfig.flakyDetectorConfig,
    });
    this.retryHandler = new RetryHandlerService(memory, {
      simulateForTesting: fullConfig.simulateForTesting,
      ...fullConfig.retryHandlerConfig,
    });
    this.prioritizer = new TestPrioritizerService(memory, fullConfig.prioritizerConfig);

    // Create E2E runner if Vibium client is provided
    if (fullConfig.vibiumClient) {
      this.e2eRunner = createE2ETestRunnerService(
        fullConfig.vibiumClient,
        fullConfig.e2eRunnerConfig
      );
    }
  }

  /**
   * Initialize the coordinator
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Initialize test prioritizer
    if (this.config.enablePrioritization) {
      await this.prioritizer.initialize();
    }

    // Subscribe to relevant events from other domains
    this.subscribeToEvents();

    // Initialize Consensus engine if enabled (MM-001)
    if (this.config.enableConsensus) {
      try {
        await (this.consensusMixin as any).initializeConsensus();
        console.log(`[${this.domainName}] Consensus engine initialized`);
      } catch (error) {
        console.error(`[${this.domainName}] Failed to initialize consensus engine:`, error);
        console.warn(`[${this.domainName}] Continuing without consensus verification`);
      }
    }

    this.initialized = true;
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    // Dispose Consensus engine (MM-001)
    try {
      await (this.consensusMixin as any).disposeConsensus();
    } catch (error) {
      console.error(`[${this.domainName}] Error disposing consensus engine:`, error);
    }

    // Dispose MinCut mixin (ADR-047)
    this.minCutMixin.dispose();

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
   * Simple test execution - convenience method for CLI
   * Auto-detects framework and uses sensible defaults
   */
  async runTests(request: SimpleTestRequest): Promise<Result<TestRunResult, Error>> {
    const framework = this.detectFramework(request.testFiles);
    const workers = request.workers ?? Math.min(4, Math.max(1, request.testFiles.length));
    const timeout = request.timeout ?? 60000;

    // Use parallel execution by default (unless explicitly disabled)
    if (request.parallel !== false && request.testFiles.length > 1) {
      const result = await this.executeParallel({
        testFiles: request.testFiles,
        framework,
        workers,
        timeout,
      });

      // Handle retries if requested and there were failures
      if (request.retryCount && request.retryCount > 0 && result.success && result.value.failed > 0) {
        const failedTestIds = result.value.failedTests.map(t => t.testId);
        await this.retry({
          runId: result.value.runId,
          failedTests: failedTestIds,
          maxRetries: request.retryCount,
          backoff: 'exponential',
        });
      }

      return result;
    }

    // Sequential execution
    const result = await this.execute({
      testFiles: request.testFiles,
      framework,
      timeout,
    });

    // Handle retries if requested and there were failures
    if (request.retryCount && request.retryCount > 0 && result.success && result.value.failed > 0) {
      const failedTestIds = result.value.failedTests.map(t => t.testId);
      await this.retry({
        runId: result.value.runId,
        failedTests: failedTestIds,
        maxRetries: request.retryCount,
        backoff: 'exponential',
      });
    }

    return result;
  }

  /**
   * Detect test framework from file patterns and project configuration
   */
  private detectFramework(testFiles: string[]): string {
    // Check file patterns for common framework indicators
    const hasVitestPattern = testFiles.some(f => f.includes('.test.') || f.includes('.spec.'));
    const hasMochaPattern = testFiles.some(f => f.includes('_test.') || f.includes('.mocha.'));

    // Default to vitest as it's most common in modern projects
    if (hasVitestPattern) return 'vitest';
    if (hasMochaPattern) return 'mocha';

    // Could add project config detection here (vitest.config.ts, jest.config.js, etc.)
    return 'vitest';
  }

  /**
   * Execute a test suite
   */
  async execute(request: ExecuteTestsRequest): Promise<Result<TestRunResult, Error>> {
    const runId = uuidv4();
    this.activeRuns.add(runId);

    try {
      // Prioritize tests if enabled
      let orderedTestFiles = request.testFiles;
      let prioritizationResult = null;

      if (this.config.enablePrioritization && request.testFiles.length > 1) {
        const priorityResult = await this.prioritizeTests(
          request.testFiles,
          runId,
          false,
          1
        );

        if (priorityResult.success) {
          orderedTestFiles = priorityResult.value.orderedFiles;
          prioritizationResult = priorityResult.value.prioritizationInfo;
        }
      }

      // Publish start event
      await this.publishEvent<TestRunStartedPayload>(
        TestExecutionEvents.TestRunStarted,
        {
          runId,
          testCount: orderedTestFiles.length,
          parallel: false,
          workers: 1,
        }
      );

      // Execute tests with prioritized order
      const orderedRequest: ExecuteTestsRequest = {
        ...request,
        testFiles: orderedTestFiles,
      };
      const result = await this.executor.execute(orderedRequest);

      // Remove from active runs
      this.activeRuns.delete(runId);

      if (result.success) {
        // Record execution results for learning
        if (this.config.enablePrioritization && prioritizationResult) {
          await this.recordExecutionResults(runId, orderedTestFiles, result.value, prioritizationResult);
        }

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
   * Enhanced with topology awareness per ADR-047
   * Enhanced with consensus verification per MM-001
   */
  async executeParallel(request: ParallelExecutionRequest): Promise<Result<TestRunResult, Error>> {
    const runId = uuidv4();
    this.activeRuns.add(runId);

    try {
      // ADR-047: Check topology health before expensive parallel operations
      if (this.config.enableMinCutAwareness && !this.isTopologyHealthy()) {
        console.warn(`[${this.domainName}] Topology degraded, reducing parallel workers`);
        // Reduce workers when topology is unhealthy
        request = { ...request, workers: Math.max(1, Math.floor(request.workers / 2)) };
      }

      // ADR-047: Check if operations should be paused due to critical topology
      if (this.minCutMixin.shouldPauseOperations()) {
        this.activeRuns.delete(runId);
        return err(new Error('Parallel test execution paused: topology is in critical state'));
      }

      // Prioritize tests if enabled
      let orderedTestFiles = request.testFiles;
      let prioritizationResult = null;

      if (this.config.enablePrioritization && request.testFiles.length > 1) {
        const priorityResult = await this.prioritizeTests(
          request.testFiles,
          runId,
          true,
          request.workers
        );

        if (priorityResult.success) {
          orderedTestFiles = priorityResult.value.orderedFiles;
          prioritizationResult = priorityResult.value.prioritizationInfo;
        }
      }

      // Publish start event
      await this.publishEvent<TestRunStartedPayload>(
        TestExecutionEvents.TestRunStarted,
        {
          runId,
          testCount: orderedTestFiles.length,
          parallel: true,
          workers: request.workers,
        }
      );

      // Execute tests in parallel with prioritized order
      const orderedRequest: ParallelExecutionRequest = {
        ...request,
        testFiles: orderedTestFiles,
      };
      const result = await this.executor.executeParallel(orderedRequest);

      // Remove from active runs
      this.activeRuns.delete(runId);

      if (result.success) {
        // Record execution results for learning
        if (this.config.enablePrioritization && prioritizationResult) {
          await this.recordExecutionResults(runId, orderedTestFiles, result.value, prioritizationResult);
        }

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
   * Enhanced with consensus verification per MM-001 for high-confidence detections
   */
  async detectFlaky(request: FlakyDetectionRequest): Promise<Result<FlakyTestReport, Error>> {
    const result = await this.flakyDetector.detectFlaky(request);

    if (result.success) {
      // Process each detected flaky test
      const verifiedFlakyTests: typeof result.value.flakyTests = [];

      for (const flaky of result.value.flakyTests) {
        // MM-001: Verify high-confidence flaky test detections using consensus
        if (this.config.enableConsensus && flaky.failureRate > 0.3) {
          const isVerified = await this.verifyFlakyTestDetection(
            {
              testId: flaky.testId,
              testFile: flaky.file,
              failureRate: flaky.failureRate,
              pattern: flaky.pattern,
            },
            Math.min(0.9, flaky.failureRate + 0.3) // Confidence based on failure rate
          );

          if (!isVerified) {
            console.log(`[${this.domainName}] Flaky test '${flaky.testId}' not verified, skipping publication`);
            continue; // Skip unverified flaky detections
          }
        }

        verifiedFlakyTests.push(flaky);

        // Publish events for verified flaky tests
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

      // Return result with only verified flaky tests
      return ok({
        ...result.value,
        flakyTests: verifiedFlakyTests,
      });
    }

    return result;
  }

  /**
   * Retry failed tests
   * Enhanced with consensus verification per MM-001 for retry strategies
   * Enhanced with topology awareness per ADR-047
   */
  async retry(request: RetryRequest): Promise<Result<RetryResult, Error>> {
    // ADR-047: Check if operations should be paused due to critical topology
    if (this.minCutMixin.shouldPauseOperations()) {
      return err(new Error('Retry operation paused: topology is in critical state'));
    }

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

    // MM-001: Verify retry strategy using consensus for large retry batches
    if (this.config.enableConsensus && testsToRetry.length > 5) {
      const isStrategyVerified = await this.verifyRetryStrategy(
        {
          runId: request.runId,
          testCount: testsToRetry.length,
          maxRetries: request.maxRetries,
          backoffType: request.backoff ?? 'exponential',
        },
        0.7 + (testsToRetry.length / 100) // Higher confidence for larger batches
      );

      if (!isStrategyVerified) {
        console.warn(`[${this.domainName}] Retry strategy not verified, proceeding with reduced retries`);
        request = { ...request, maxRetries: Math.max(1, Math.floor(request.maxRetries / 2)) };
      }
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

  /**
   * Prioritize tests using Decision Transformer
   */
  private async prioritizeTests(
    testFiles: string[],
    runId: string,
    parallel: boolean,
    workers: number
  ): Promise<Result<{
    orderedFiles: string[];
    prioritizationInfo: unknown;
  }, Error>> {
    try {
      // Create test metadata from file paths
      const testMetadata: TestMetadata[] = testFiles.map((filePath) => ({
        testId: this.generateTestId(filePath),
        filePath,
        testName: this.extractTestName(filePath),
        testType: 'unit',
        priority: 'p2',
        complexity: 0.5,
        domain: 'test-execution',
        estimatedDuration: 5000,
        coverage: 0,
        failureHistory: [],
        flakinessScore: 0,
        executionCount: 0,
      }));

      // Create prioritization context
      const context: TestPrioritizationContext = {
        runId,
        totalTests: testFiles.length,
        availableTime: 60000, // 1 minute default
        workers,
        mode: parallel ? 'parallel' : 'sequential',
        phase: 'ci',
      };

      // Get prioritization from DT
      const result = await this.prioritizer.prioritize(testMetadata, context);

      if (!result.success) {
        return err(result.error);
      }

      // Extract ordered file paths
      const orderedFiles = result.value.tests.map(t => t.filePath);

      return ok({
        orderedFiles,
        prioritizationInfo: {
          method: result.value.method,
          averageConfidence: result.value.averageConfidence,
          learningStatus: result.value.learningStatus,
        },
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Record execution results for DT learning
   */
  private async recordExecutionResults(
    runId: string,
    testFiles: string[],
    result: TestRunResult,
    prioritizationInfo: unknown
  ): Promise<void> {
    // Record each test execution for learning
    for (let i = 0; i < testFiles.length; i++) {
      const testId = this.generateTestId(testFiles[i]);
      const info = prioritizationInfo as {
        method: string;
        averageConfidence: number;
      } | undefined;

      // Find if this test failed (check if it's in failed tests)
      const failedTest = result.failedTests.find(t => t.file === testFiles[i]);
      const passed = !failedTest;
      const duration = failedTest?.duration ?? result.duration / testFiles.length;

      // Determine priority based on position
      const priority = i < Math.ceil(testFiles.length * 0.2) ? 'critical' :
                      i < Math.ceil(testFiles.length * 0.5) ? 'high' :
                      i < Math.ceil(testFiles.length * 0.8) ? 'standard' : 'low';

      const context: TestPrioritizationContext = {
        runId,
        totalTests: testFiles.length,
        availableTime: 60000,
        workers: 1,
        mode: 'sequential',
        phase: 'ci',
      };

      await this.prioritizer.recordExecution(
        testId,
        {
          passed,
          duration,
          priority,
          failedEarly: failedTest !== undefined && i < Math.ceil(testFiles.length * 0.3),
          coverageImproved: false, // Would need coverage data
          flakyDetected: false, // Checked separately
        },
        context
      );
    }
  }

  /**
   * Generate test ID from file path
   */
  private generateTestId(filePath: string): string {
    return `test-${filePath.replace(/[^a-zA-Z0-9]/g, '-')}`;
  }

  /**
   * Extract test name from file path
   */
  private extractTestName(filePath: string): string {
    const parts = filePath.split('/');
    return parts[parts.length - 1] || filePath;
  }

  // ============================================================================
  // E2E Test Execution Methods
  // ============================================================================

  /**
   * Execute E2E test case
   */
  async executeE2ETestCase(testCase: E2ETestCase): Promise<Result<E2ETestResult, Error>> {
    if (!this.e2eRunner) {
      return err(new Error('E2E runner not available - Vibium client not configured'));
    }

    try {
      // Publish start event
      await this.publishEvent<{ testCaseId: string; testCaseName: string }>(
        'test-execution.E2ETestStarted',
        {
          testCaseId: testCase.id,
          testCaseName: testCase.name,
        }
      );

      // Execute test case
      const result = await this.e2eRunner.runTestCase(testCase);

      // Publish completion event
      await this.publishEvent<{
        testCaseId: string;
        testCaseName: string;
        success: boolean;
        duration: number;
      }>(
        'test-execution.E2ETestCompleted',
        {
          testCaseId: result.testCaseId,
          testCaseName: result.testCaseName,
          success: result.success,
          duration: result.totalDurationMs,
        }
      );

      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Execute E2E test suite
   */
  async executeE2ETestSuite(
    suite: E2ETestSuite,
    strategy: ExecutionStrategy = 'sequential'
  ): Promise<Result<E2ETestSuiteResult, Error>> {
    if (!this.e2eRunner) {
      return err(new Error('E2E runner not available - Vibium client not configured'));
    }

    try {
      // Publish start event
      await this.publishEvent<{
        suiteId: string;
        suiteName: string;
        testCount: number;
        strategy: ExecutionStrategy;
      }>(
        'test-execution.E2ETestSuiteStarted',
        {
          suiteId: suite.id,
          suiteName: suite.name,
          testCount: suite.testCases.length,
          strategy,
        }
      );

      // Execute test suite
      const result = await this.e2eRunner.runTestSuite(suite, strategy);

      // Publish completion event
      await this.publishEvent<{
        suiteId: string;
        suiteName: string;
        success: boolean;
        passed: number;
        failed: number;
        total: number;
        duration: number;
      }>(
        'test-execution.E2ETestSuiteCompleted',
        {
          suiteId: result.suiteId,
          suiteName: result.suiteName,
          success: result.success,
          passed: result.summary.passed,
          failed: result.summary.failed,
          total: result.summary.total,
          duration: result.summary.totalDurationMs,
        }
      );

      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ============================================================================
  // MinCut Integration Methods (ADR-047)
  // ============================================================================

  /**
   * Set the MinCut bridge for topology awareness
   */
  setMinCutBridge(bridge: QueenMinCutBridge): void {
    this.minCutMixin.setMinCutBridge(bridge);
    console.log(`[${this.domainName}] MinCut bridge connected for topology awareness`);
  }

  /**
   * Check if topology is healthy
   */
  isTopologyHealthy(): boolean {
    return this.minCutMixin.isTopologyHealthy();
  }

  /**
   * Get topology-based routing excluding weak domains
   * Per ADR-047: Filters out domains that are currently weak points
   *
   * @param targetDomains - List of potential target domains
   * @returns Filtered list of healthy domains for routing
   */
  getTopologyBasedRouting(targetDomains: DomainName[]): DomainName[] {
    return this.minCutMixin.getTopologyBasedRouting(targetDomains);
  }

  /**
   * Get weak vertices belonging to this domain
   * Per ADR-047: Identifies agents that are single points of failure
   */
  getDomainWeakVertices(): WeakVertex[] {
    return this.minCutMixin.getDomainWeakVertices();
  }

  /**
   * Check if this domain is a weak point in the topology
   * Per ADR-047: Returns true if any weak vertex belongs to test-execution domain
   */
  isDomainWeakPoint(): boolean {
    return this.minCutMixin.isDomainWeakPoint();
  }

  // ============================================================================
  // Consensus Integration Methods (MM-001)
  // ============================================================================

  /**
   * Check if consensus engine is available
   */
  isConsensusAvailable(): boolean {
    return (this.consensusMixin as any).isConsensusAvailable?.() ?? false;
  }

  /**
   * Get consensus statistics
   * Per MM-001: Returns metrics about consensus verification
   */
  getConsensusStats() {
    return this.consensusMixin.getConsensusStats();
  }

  /**
   * Verify flaky test detection using multi-model consensus
   * Per MM-001: Flaky test classification is a high-stakes decision
   *
   * @param test - The test suspected to be flaky
   * @param confidence - Initial confidence in the flaky classification
   * @returns true if the flaky classification is verified or doesn't require consensus
   */
  private async verifyFlakyTestDetection(
    test: { testId: string; testFile: string; failureRate: number; pattern: string },
    confidence: number
  ): Promise<boolean> {
    const finding: DomainFinding<typeof test> = createDomainFinding({
      id: uuidv4(),
      type: 'flaky-test-detection',
      confidence,
      description: `Verify flaky test classification: ${test.testId} (failure rate: ${(test.failureRate * 100).toFixed(1)}%)`,
      payload: test,
      detectedBy: 'test-execution-coordinator',
      severity: test.failureRate > 0.5 ? 'high' : 'medium',
    });

    if (this.consensusMixin.requiresConsensus(finding)) {
      const result = await this.consensusMixin.verifyFinding(finding);
      if (result.success && result.value.verdict === 'verified') {
        console.log(`[${this.domainName}] Flaky test '${test.testId}' classification verified by consensus`);
        return true;
      }
      console.warn(`[${this.domainName}] Flaky test '${test.testId}' classification NOT verified: ${result.success ? result.value.verdict : result.error.message}`);
      return false;
    }
    return true; // No consensus needed
  }

  /**
   * Verify retry strategy using multi-model consensus
   * Per MM-001: Retry strategies affect test execution outcomes
   *
   * @param strategy - The retry strategy to verify
   * @param confidence - Initial confidence in the strategy
   * @returns true if the strategy is verified or doesn't require consensus
   */
  private async verifyRetryStrategy(
    strategy: { runId: string; testCount: number; maxRetries: number; backoffType: string },
    confidence: number
  ): Promise<boolean> {
    const finding: DomainFinding<typeof strategy> = createDomainFinding({
      id: uuidv4(),
      type: 'retry-strategy',
      confidence,
      description: `Verify retry strategy: ${strategy.testCount} tests with ${strategy.maxRetries} max retries (${strategy.backoffType})`,
      payload: strategy,
      detectedBy: 'test-execution-coordinator',
      severity: strategy.testCount > 10 ? 'high' : 'medium',
    });

    if (this.consensusMixin.requiresConsensus(finding)) {
      const result = await this.consensusMixin.verifyFinding(finding);
      if (result.success && result.value.verdict === 'verified') {
        console.log(`[${this.domainName}] Retry strategy verified by consensus`);
        return true;
      }
      console.warn(`[${this.domainName}] Retry strategy NOT verified: ${result.success ? result.value.verdict : result.error.message}`);
      return false;
    }
    return true; // No consensus needed
  }

  /**
   * Verify test failure analysis using multi-model consensus
   * Per MM-001: Failure analysis impacts debugging and fix prioritization
   *
   * @param analysis - The failure analysis to verify
   * @param confidence - Initial confidence in the analysis
   * @returns true if the analysis is verified or doesn't require consensus
   */
  private async verifyTestFailureAnalysis(
    analysis: { testId: string; failureType: string; rootCause: string; suggestedFix: string },
    confidence: number
  ): Promise<boolean> {
    const finding: DomainFinding<typeof analysis> = createDomainFinding({
      id: uuidv4(),
      type: 'test-failure-analysis',
      confidence,
      description: `Verify failure analysis for ${analysis.testId}: ${analysis.failureType} - ${analysis.rootCause}`,
      payload: analysis,
      detectedBy: 'test-execution-coordinator',
      severity: 'high', // Failure analysis is always important
    });

    if (this.consensusMixin.requiresConsensus(finding)) {
      const result = await this.consensusMixin.verifyFinding(finding);
      if (result.success && result.value.verdict === 'verified') {
        console.log(`[${this.domainName}] Failure analysis for '${analysis.testId}' verified by consensus`);
        return true;
      }
      console.warn(`[${this.domainName}] Failure analysis NOT verified: ${result.success ? result.value.verdict : result.error.message}`);
      return false;
    }
    return true; // No consensus needed
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createTestExecutionCoordinator(
  eventBus: EventBus,
  memory: MemoryBackend,
  config?: Partial<TestExecutionCoordinatorConfig>
): ITestExecutionCoordinator {
  return new TestExecutionCoordinator(eventBus, memory, config);
}
