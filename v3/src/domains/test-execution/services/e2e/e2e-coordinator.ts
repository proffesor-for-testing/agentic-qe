/**
 * Agentic QE v3 - E2E Test Coordinator
 *
 * Main coordinator that orchestrates E2E test execution by composing
 * the modular components: browser orchestrator, step executors,
 * step retry handler, and result collector.
 *
 * @module test-execution/services/e2e/e2e-coordinator
 */

import type { VibiumClient, ScreenshotResult, AccessibilityResult } from '../../../../integrations/vibium';
import type { IBrowserClient } from '../../../../integrations/browser';
import {
  getBrowserClientForUseCase,
} from '../../../../integrations/browser';
import type {
  E2EStep,
  E2EStepResult,
  E2ETestCase,
  E2ETestResult,
  E2ETestSuite,
  E2ETestSuiteResult,
} from '../../types';
import type {
  E2ERunnerConfig,
  IE2ETestRunnerService,
  ExecutionStrategy,
  StepExecutionContext,
} from './types';
import { DEFAULT_E2E_RUNNER_CONFIG } from './types';
import { BrowserOrchestrator, createBrowserOrchestrator } from './browser-orchestrator';
import { StepExecutors, createStepExecutors } from './step-executors';
import { StepRetryHandler, createStepRetryHandler } from './step-retry-handler';
import { ResultCollector, createResultCollector } from './result-collector';
import { toErrorMessage } from '../../../../shared/error-utils.js';

// ============================================================================
// E2E Test Runner Service Implementation
// ============================================================================

/**
 * E2E Test Runner Service
 *
 * Executes E2E test cases using browser automation clients.
 * Supports both the Vibium browser automation client and the agent-browser CLI tool.
 * Provides step-by-step execution with retry logic, timeout handling,
 * and comprehensive result aggregation.
 *
 * Agent-browser provides enhanced E2E testing capabilities:
 * - Snapshot-based element refs (@e1, @e2) for reliable element selection
 * - Session management for state persistence
 * - Network interception and API mocking
 * - Device emulation for responsive testing
 */
export class E2ETestRunnerService implements IE2ETestRunnerService {
  private readonly config: E2ERunnerConfig;
  private readonly orchestrator: BrowserOrchestrator;
  private readonly stepExecutors: StepExecutors;
  private readonly retryHandler: StepRetryHandler;
  private readonly resultCollector: ResultCollector;

  /**
   * Create E2E Test Runner Service
   *
   * @param client - Browser automation client (VibiumClient or IBrowserClient)
   * @param config - Runner configuration
   */
  constructor(
    private readonly client: VibiumClient | IBrowserClient,
    config: Partial<E2ERunnerConfig> = {}
  ) {
    this.config = { ...DEFAULT_E2E_RUNNER_CONFIG, ...config };

    // Create logger function
    const logger = (message: string) => this.log(message);

    // Initialize modular components
    this.orchestrator = createBrowserOrchestrator(client, this.config, logger);
    this.stepExecutors = createStepExecutors(this.config, this.orchestrator, logger);
    this.retryHandler = createStepRetryHandler(this.config, this.stepExecutors, logger);
    this.resultCollector = createResultCollector();

    this.log(
      `E2E Runner initialized with ${this.orchestrator.isUsingAgentBrowser() ? 'agent-browser' : 'vibium'} client`
    );
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Execute a single E2E test case
   */
  async runTestCase(testCase: E2ETestCase): Promise<E2ETestResult> {
    const startedAt = new Date();
    const stepResults: E2EStepResult[] = [];
    const screenshots: ScreenshotResult[] = [];
    const accessibilityResults: AccessibilityResult[] = [];

    // Check if test should be skipped
    if (testCase.skip) {
      return this.resultCollector.createSkippedResult(testCase, startedAt);
    }

    // Validate required environment variables
    if (testCase.requiredEnvVars?.length) {
      const missingVars = testCase.requiredEnvVars.filter((v) => !process.env[v]);
      if (missingVars.length > 0) {
        return this.resultCollector.createErrorResult(
          testCase,
          startedAt,
          `Missing required environment variables: ${missingVars.join(', ')}`
        );
      }
    }

    try {
      // Launch browser
      const launchError = await this.orchestrator.ensureBrowserLaunched(testCase);
      if (launchError) {
        return this.resultCollector.createErrorResult(testCase, startedAt, launchError);
      }

      // Create execution context
      const context: StepExecutionContext = {
        testCase,
        baseUrl: testCase.baseUrl,
        variables: testCase.testData ?? {},
        previousResults: stepResults,
        useAgentBrowser: this.orchestrator.isUsingAgentBrowser(),
      };

      // Get initial snapshot for agent-browser
      if (this.orchestrator.isUsingAgentBrowser()) {
        context.currentSnapshot = await this.orchestrator.refreshSnapshot();
      }

      // Execute beforeAll hooks
      if (testCase.hooks?.beforeAll) {
        const hookResults = await this.executeHooks(
          testCase.hooks.beforeAll,
          context,
          'beforeAll'
        );
        stepResults.push(...hookResults);
        if (this.resultCollector.hasFailure(hookResults) && this.config.stopOnFirstFailure) {
          return this.resultCollector.createResult(
            testCase,
            startedAt,
            stepResults,
            screenshots,
            accessibilityResults
          );
        }
      }

      // Execute test steps
      for (const step of testCase.steps) {
        // Execute beforeEach hooks
        if (testCase.hooks?.beforeEach) {
          const hookResults = await this.executeHooks(
            testCase.hooks.beforeEach,
            context,
            'beforeEach'
          );
          stepResults.push(...hookResults);
        }

        // Handle delay before step
        if (step.delayBefore && step.delayBefore > 0) {
          await this.delay(step.delayBefore);
        }

        // Execute the step with retry logic
        const stepResult = await this.retryHandler.executeStepWithRetry(step, context);
        stepResults.push(stepResult);

        // Collect screenshots and accessibility results
        if (stepResult.screenshot) {
          screenshots.push(stepResult.screenshot);
        }
        if (stepResult.accessibilityResult) {
          accessibilityResults.push(stepResult.accessibilityResult);
        }

        // Handle delay after step
        if (step.delayAfter && step.delayAfter > 0) {
          await this.delay(step.delayAfter);
        }

        // Execute afterEach hooks
        if (testCase.hooks?.afterEach) {
          const hookResults = await this.executeHooks(
            testCase.hooks.afterEach,
            context,
            'afterEach'
          );
          stepResults.push(...hookResults);
        }

        // Check for step failure
        if (!stepResult.success) {
          // Execute onFailure hooks
          if (testCase.hooks?.onFailure) {
            const hookResults = await this.executeHooks(
              testCase.hooks.onFailure,
              context,
              'onFailure'
            );
            stepResults.push(...hookResults);
          }

          // Capture failure screenshot if enabled
          if (this.config.screenshotOnFailure && !stepResult.screenshot) {
            const failureScreenshot = await this.orchestrator.captureFailureScreenshot(step.id);
            if (failureScreenshot) {
              stepResult.error = {
                ...stepResult.error!,
                failureScreenshot,
              };
              screenshots.push(failureScreenshot);
            }
          }

          // Stop on first failure if configured and step is required
          if (this.config.stopOnFirstFailure && step.required && !step.continueOnFailure) {
            break;
          }
        }
      }

      // Execute afterAll hooks
      if (testCase.hooks?.afterAll) {
        const hookResults = await this.executeHooks(
          testCase.hooks.afterAll,
          context,
          'afterAll'
        );
        stepResults.push(...hookResults);
      }

      return this.resultCollector.createResult(
        testCase,
        startedAt,
        stepResults,
        screenshots,
        accessibilityResults
      );
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      return this.resultCollector.createErrorResult(testCase, startedAt, errorMessage, stepResults);
    }
  }

  /**
   * Execute an E2E test suite
   */
  async runTestSuite(
    suite: E2ETestSuite,
    strategy: ExecutionStrategy = suite.parallel ? 'parallel' : 'sequential'
  ): Promise<E2ETestSuiteResult> {
    const startedAt = new Date();
    const testResults: E2ETestResult[] = [];

    // Filter test cases (handle 'only' flag)
    const onlyTests = suite.testCases.filter((tc) => tc.only);
    const testsToRun = onlyTests.length > 0 ? onlyTests : suite.testCases;

    if (strategy === 'parallel') {
      const results = await this.executeInParallel(testsToRun, suite.maxWorkers);
      testResults.push(...results);
    } else {
      for (const testCase of testsToRun) {
        const result = await this.runTestCase(testCase);
        testResults.push(result);
      }
    }

    return this.resultCollector.createSuiteResult(
      suite.id,
      suite.name,
      testResults,
      startedAt
    );
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Execute hook steps
   */
  private async executeHooks(
    hooks: E2EStep[],
    context: StepExecutionContext,
    hookType: string
  ): Promise<E2EStepResult[]> {
    const results: E2EStepResult[] = [];

    for (const hook of hooks) {
      this.log(`Executing ${hookType} hook: ${hook.id}`);
      const result = await this.retryHandler.executeStepWithRetry(hook, context);
      results.push(result);

      if (!result.success && hook.required) {
        this.log(`${hookType} hook "${hook.id}" failed`);
        break;
      }
    }

    return results;
  }

  /**
   * Execute tests in parallel with limited concurrency
   */
  private async executeInParallel(
    testCases: E2ETestCase[],
    maxWorkers?: number
  ): Promise<E2ETestResult[]> {
    const workers = maxWorkers ?? this.config.maxParallelWorkers;
    const results: E2ETestResult[] = [];
    const queue = [...testCases];

    const executeNext = async (): Promise<void> => {
      while (queue.length > 0) {
        const testCase = queue.shift();
        if (testCase) {
          const result = await this.runTestCase(testCase);
          results.push(result);
        }
      }
    };

    const workerPromises: Promise<void>[] = [];
    for (let i = 0; i < Math.min(workers, testCases.length); i++) {
      workerPromises.push(executeNext());
    }

    await Promise.all(workerPromises);
    return results;
  }

  /**
   * Delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Log message if verbose mode is enabled
   */
  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[E2ERunner] ${message}`);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an E2E Test Runner Service instance with a VibiumClient (legacy)
 *
 * @param client - Vibium browser automation client
 * @param config - Optional runner configuration
 * @returns E2E Test Runner Service instance
 */
export function createE2ETestRunnerService(
  client: VibiumClient,
  config?: Partial<E2ERunnerConfig>
): E2ETestRunnerService {
  return new E2ETestRunnerService(client, config);
}

/**
 * Create an E2E Test Runner Service instance with a browser client
 *
 * This factory supports the unified IBrowserClient interface, including
 * agent-browser with its enhanced E2E testing capabilities.
 *
 * @param client - Browser client (IBrowserClient or IAgentBrowserClient)
 * @param config - Optional runner configuration
 * @returns E2E Test Runner Service instance
 */
export function createE2ETestRunnerServiceWithBrowserClient(
  client: IBrowserClient,
  config?: Partial<E2ERunnerConfig>
): E2ETestRunnerService {
  return new E2ETestRunnerService(client as unknown as VibiumClient, {
    ...config,
    browserClient: client,
  });
}

/**
 * Create an E2E Test Runner Service with auto-selected browser client
 *
 * This factory automatically selects the best available browser client:
 * - Prefers agent-browser for E2E testing (supports refs, sessions, mocking)
 * - Falls back to Vibium if agent-browser is unavailable
 *
 * @param config - Optional runner configuration
 * @returns Promise resolving to E2E Test Runner Service instance
 */
export async function createAutoE2ETestRunnerService(
  config?: Partial<E2ERunnerConfig>
): Promise<E2ETestRunnerService> {
  const client = await getBrowserClientForUseCase('e2e-testing');

  return new E2ETestRunnerService(client as unknown as VibiumClient, {
    ...config,
    browserClient: client,
    preferAgentBrowser: true,
  });
}
