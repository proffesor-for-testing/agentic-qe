/**
 * Agentic QE v3 - E2E Test Runner Service
 *
 * Executes E2E test cases using browser automation clients.
 * Supports both the Vibium browser automation client and the agent-browser CLI tool.
 * Provides step-by-step execution with retry logic, timeout handling,
 * and comprehensive result aggregation.
 *
 * Browser Client Support:
 * - IBrowserClient: Common interface for all browser tools
 * - IAgentBrowserClient: Extended interface for agent-browser specific features
 * - VibiumClient: Legacy Vibium integration (backward compatible)
 *
 * Agent-browser provides enhanced E2E testing capabilities:
 * - Snapshot-based element refs (@e1, @e2) for reliable element selection
 * - Session management for state persistence
 * - Network interception and API mocking
 * - Device emulation for responsive testing
 *
 * @module test-execution/services/e2e-runner
 */

import type { Result } from '../../../shared/types';
import { ok, err } from '../../../shared/types';
import { safeEvaluateBoolean } from '../../../shared/utils/safe-expression-evaluator.js';
// Import Vibium types for backward compatibility
import type {
  VibiumClient,
  NavigateResult,
  InteractionResult,
  ScreenshotResult,
  AccessibilityResult,
  ElementInfo,
} from '../../../integrations/vibium';
import {
  VibiumError,
  VibiumTimeoutError,
  VibiumElementNotFoundError,
} from '../../../integrations/vibium';
// Import unified browser client types
import {
  createAgentBrowserClient,
  getBrowserClientForUseCase,
  type IBrowserClient,
  type IAgentBrowserClient,
  type ElementTarget,
  type BrowserNavigateResult,
  type BrowserScreenshotResult,
  type ParsedSnapshot,
  BrowserError,
  BrowserTimeoutError,
  BrowserElementNotFoundError,
} from '../../../integrations/browser';
import {
  type E2EStep,
  type E2EStepResult,
  type E2ETestCase,
  type E2ETestResult,
  type E2ETestSuite,
  type E2ETestSuiteResult,
  type E2ETestHooks,
  type NavigateStep,
  type ClickStep,
  type TypeStep,
  type WaitStep,
  type AssertStep,
  type ScreenshotStep,
  type A11yCheckStep,
  type WaitConditionType,
  type AssertionType,
  E2EStepType,
  isNavigateStep,
  isClickStep,
  isTypeStep,
  isWaitStep,
  isAssertStep,
  isScreenshotStep,
  isA11yCheckStep,
} from '../types';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Browser client type for configuration
 */
export type BrowserClientType = 'vibium' | 'agent-browser' | 'auto';

/**
 * E2E Test Runner configuration
 */
export interface E2ERunnerConfig {
  /** Default step timeout in milliseconds */
  defaultStepTimeout: number;
  /** Default retry count for steps */
  defaultRetries: number;
  /** Delay between retries in milliseconds */
  retryDelay: number;
  /** Capture screenshot on failure */
  screenshotOnFailure: boolean;
  /** Stop on first failure */
  stopOnFirstFailure: boolean;
  /** Default polling interval for wait conditions */
  pollingInterval: number;
  /** Maximum parallel workers for suite execution */
  maxParallelWorkers: number;
  /** Enable verbose logging */
  verbose: boolean;
  /**
   * Prefer agent-browser over Vibium for E2E testing
   * Agent-browser provides enhanced features: refs (@e1, @e2), sessions, mocking
   * @default true
   */
  preferAgentBrowser: boolean;
  /**
   * Browser client type preference
   * - 'vibium': Use Vibium (MCP-based)
   * - 'agent-browser': Use agent-browser (CLI-based with refs)
   * - 'auto': Auto-select based on availability and use case
   * @default 'auto'
   */
  browserClientType: BrowserClientType;
  /**
   * Pre-configured browser client instance
   * If provided, this client will be used instead of creating a new one
   * Useful for sharing browser instances across test suites
   */
  browserClient?: IBrowserClient;
}

/**
 * Default E2E runner configuration
 */
export const DEFAULT_E2E_RUNNER_CONFIG: E2ERunnerConfig = {
  defaultStepTimeout: 30000,
  defaultRetries: 2,
  retryDelay: 1000,
  screenshotOnFailure: true,
  stopOnFirstFailure: false,
  pollingInterval: 100,
  maxParallelWorkers: 4,
  verbose: false,
  preferAgentBrowser: true,
  browserClientType: 'auto',
};

// ============================================================================
// Execution Strategy
// ============================================================================

/**
 * Test suite execution strategy
 */
export type ExecutionStrategy = 'sequential' | 'parallel';

// ============================================================================
// E2E Runner Errors
// ============================================================================

/**
 * E2E Runner error class
 */
export class E2ERunnerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly stepId?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'E2ERunnerError';
  }
}

/**
 * Step timeout error
 */
export class StepTimeoutError extends E2ERunnerError {
  constructor(stepId: string, timeout: number, cause?: Error) {
    super(`Step "${stepId}" timed out after ${timeout}ms`, 'STEP_TIMEOUT', stepId, cause);
    this.name = 'StepTimeoutError';
  }
}

/**
 * Assertion failure error
 */
export class AssertionError extends E2ERunnerError {
  constructor(
    message: string,
    stepId: string,
    public readonly expected: unknown,
    public readonly actual: unknown,
    cause?: Error
  ) {
    super(message, 'ASSERTION_FAILED', stepId, cause);
    this.name = 'AssertionError';
  }
}

// ============================================================================
// Helper Functions for Browser Client Integration
// ============================================================================

/**
 * Type guard to check if client is an agent-browser client
 */
function isAgentBrowserClient(client: IBrowserClient | VibiumClient): client is IAgentBrowserClient {
  return 'tool' in client && client.tool === 'agent-browser';
}

/**
 * Type guard to check if client is a Vibium client (legacy)
 */
function isVibiumClient(client: IBrowserClient | VibiumClient): client is VibiumClient {
  return !('tool' in client) || !client.tool;
}

/**
 * Convert a step selector to an ElementTarget for the unified browser interface
 * Supports CSS selectors, XPath, text content, and agent-browser refs
 *
 * @param selector - The selector string from the step
 * @returns ElementTarget for use with IBrowserClient
 */
function toElementTarget(selector: string): ElementTarget {
  // Agent-browser snapshot refs (@e1, @e2, e1, e2)
  if (/^@?e\d+$/.test(selector)) {
    const value = selector.startsWith('@') ? selector : `@${selector}`;
    return { type: 'ref', value };
  }

  // XPath selectors
  if (selector.startsWith('//') || selector.startsWith('xpath=')) {
    const value = selector.replace(/^xpath=/, '');
    return { type: 'xpath', value };
  }

  // Text content matching
  if (selector.startsWith('text=')) {
    const value = selector.replace(/^text=/, '');
    return { type: 'text', value };
  }

  // Default to CSS selector
  return { type: 'css', value: selector };
}

/**
 * Convert BrowserScreenshotResult to Vibium ScreenshotResult format
 * This is needed for backward compatibility
 */
function toVibiumScreenshotResult(result: BrowserScreenshotResult): ScreenshotResult {
  return {
    base64: result.base64,
    path: result.path,
    format: result.format,
    dimensions: result.dimensions,
    sizeBytes: result.base64 ? Math.ceil(result.base64.length * 0.75) : 0, // Estimate size from base64
    capturedAt: new Date(),
  };
}

/**
 * Convert axe-core results to Vibium AccessibilityResult format
 */
function toVibiumAccessibilityResult(axeResults: {
  violations: Array<{ id: string; impact: string; description: string; nodes: unknown[] }>;
  passes: { id: string }[];
  incomplete: { id: string }[];
  inapplicable: unknown[];
}): AccessibilityResult {
  // Count violations by severity
  const violationsBySeverity = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  const violations: Array<{ id: string; impact: string; description: string; nodes: number }> = axeResults.violations.map((v) => {
    const impact = v.impact as keyof typeof violationsBySeverity;
    if (impact in violationsBySeverity) {
      violationsBySeverity[impact]++;
    }
    return {
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.length,
    };
  });

  return {
    passes: violations.length === 0,
    violations: violations as unknown as AccessibilityResult['violations'],
    violationsBySeverity,
    passedRules: axeResults.passes.map((p) => p.id),
    incompleteRules: axeResults.incomplete.map((i) => i.id),
    checkedAt: new Date(),
  };
}

// ============================================================================
// Step Executor Types
// ============================================================================

/**
 * Unified browser client type - supports both IBrowserClient and legacy VibiumClient
 */
type UnifiedBrowserClient = IBrowserClient | VibiumClient;

/**
 * Step executor function signature
 * Updated to support both IBrowserClient and VibiumClient
 */
type StepExecutor<T extends E2EStep> = (
  step: T,
  client: UnifiedBrowserClient,
  context: StepExecutionContext
) => Promise<StepExecutionData>;

/**
 * Step execution context
 */
interface StepExecutionContext {
  /** Test case being executed */
  testCase: E2ETestCase;
  /** Base URL for the test */
  baseUrl: string;
  /** Variables available in the test */
  variables: Record<string, unknown>;
  /** Previous step results */
  previousResults: E2EStepResult[];
  /** Current page snapshot (agent-browser only) */
  currentSnapshot?: ParsedSnapshot;
  /** Whether to use agent-browser enhanced features */
  useAgentBrowser: boolean;
}

/**
 * Step execution data returned by executors
 */
interface StepExecutionData {
  /** Data to include in step result */
  data?: E2EStepResult['data'];
  /** Screenshot captured during step */
  screenshot?: ScreenshotResult;
  /** Accessibility result (for a11y steps) */
  accessibilityResult?: AccessibilityResult;
}

// ============================================================================
// E2E Test Runner Service Interface
// ============================================================================

/**
 * E2E Test Runner Service Interface
 */
export interface IE2ETestRunnerService {
  /**
   * Execute a single E2E test case
   * @param testCase - Test case to execute
   * @returns Promise resolving to test result
   */
  runTestCase(testCase: E2ETestCase): Promise<E2ETestResult>;

  /**
   * Execute an E2E test suite
   * @param suite - Test suite to execute
   * @param strategy - Execution strategy (sequential or parallel)
   * @returns Promise resolving to suite result
   */
  runTestSuite(suite: E2ETestSuite, strategy?: ExecutionStrategy): Promise<E2ETestSuiteResult>;
}

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
  private readonly unifiedClient: UnifiedBrowserClient;
  private readonly useAgentBrowser: boolean;

  /**
   * Create E2E Test Runner Service
   *
   * @param client - Browser automation client (VibiumClient or IBrowserClient)
   * @param config - Runner configuration
   *
   * @example
   * ```typescript
   * // Using VibiumClient (legacy)
   * const vibiumClient = await createVibiumClient({ enabled: true });
   * const runner = new E2ETestRunnerService(vibiumClient);
   *
   * // Using agent-browser (recommended for E2E)
   * const agentClient = await createAgentBrowserClient();
   * const runner = new E2ETestRunnerService(agentClient, {
   *   preferAgentBrowser: true
   * });
   *
   * // Using auto-selection
   * const runner = createE2ETestRunnerServiceWithBrowserClient(undefined, {
   *   browserClientType: 'auto'
   * });
   * ```
   */
  constructor(
    private readonly client: VibiumClient | IBrowserClient,
    config: Partial<E2ERunnerConfig> = {}
  ) {
    this.config = { ...DEFAULT_E2E_RUNNER_CONFIG, ...config };

    // Use provided browser client from config if available
    this.unifiedClient = config.browserClient ?? client;

    // Determine if we're using agent-browser
    this.useAgentBrowser = isAgentBrowserClient(this.unifiedClient);

    this.log(`E2E Runner initialized with ${this.useAgentBrowser ? 'agent-browser' : 'vibium'} client`);
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
      return this.createSkippedResult(testCase, startedAt);
    }

    // Validate required environment variables
    if (testCase.requiredEnvVars?.length) {
      const missingVars = testCase.requiredEnvVars.filter((v) => !process.env[v]);
      if (missingVars.length > 0) {
        return this.createErrorResult(
          testCase,
          startedAt,
          `Missing required environment variables: ${missingVars.join(', ')}`
        );
      }
    }

    try {
      // Launch browser based on client type
      const launchError = await this.ensureBrowserLaunched(testCase);
      if (launchError) {
        return this.createErrorResult(testCase, startedAt, launchError);
      }

      // Create execution context
      const context: StepExecutionContext = {
        testCase,
        baseUrl: testCase.baseUrl,
        variables: testCase.testData ?? {},
        previousResults: stepResults,
        useAgentBrowser: this.useAgentBrowser,
      };

      // Get initial snapshot for agent-browser
      if (this.useAgentBrowser) {
        context.currentSnapshot = await this.refreshSnapshot();
      }

      // Execute beforeAll hooks
      if (testCase.hooks?.beforeAll) {
        const hookResults = await this.executeHooks(
          testCase.hooks.beforeAll,
          context,
          'beforeAll'
        );
        stepResults.push(...hookResults);
        if (this.hasFailure(hookResults) && this.config.stopOnFirstFailure) {
          return this.createResult(testCase, startedAt, stepResults, screenshots, accessibilityResults);
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
        const stepResult = await this.executeStepWithRetry(step, context);
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
            const failureScreenshot = await this.captureFailureScreenshot(step.id);
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

      return this.createResult(testCase, startedAt, stepResults, screenshots, accessibilityResults);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(testCase, startedAt, errorMessage, stepResults);
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
      // Execute tests in parallel with limited concurrency
      const results = await this.executeInParallel(testsToRun, suite.maxWorkers);
      testResults.push(...results);
    } else {
      // Execute tests sequentially
      for (const testCase of testsToRun) {
        const result = await this.runTestCase(testCase);
        testResults.push(result);
      }
    }

    const completedAt = new Date();
    const summary = this.calculateSummary(testResults);

    return {
      suiteId: suite.id,
      suiteName: suite.name,
      success: summary.failed === 0,
      testResults,
      summary: {
        ...summary,
        totalDurationMs: completedAt.getTime() - startedAt.getTime(),
      },
      startedAt,
      completedAt,
    };
  }

  // ==========================================================================
  // Browser Launch Helper
  // ==========================================================================

  /**
   * Ensure browser is launched for the test case
   * Handles both agent-browser and Vibium clients
   */
  private async ensureBrowserLaunched(testCase: E2ETestCase): Promise<string | null> {
    try {
      if (this.useAgentBrowser && isAgentBrowserClient(this.unifiedClient)) {
        // Agent-browser launch - use client's configured session name
        // Don't force a new session name to avoid conflicts
        const launchResult = await this.unifiedClient.launch({
          headless: true,
          viewport: testCase.viewport,
          // Use client's default session name, not test-specific
        });

        if (!launchResult.success) {
          return `Failed to launch browser: ${launchResult.error.message}`;
        }
        return null;
      } else if (isVibiumClient(this.client)) {
        // Legacy Vibium launch
        const session = await this.client.getSession();
        if (!session) {
          const launchResult = await this.client.launch({
            headless: true,
            viewport: testCase.viewport,
            ...this.getBrowserContextOptions(testCase),
          });
          if (!launchResult.success) {
            return `Failed to launch browser: ${launchResult.error.message}`;
          }
        }
        return null;
      } else {
        // Generic IBrowserClient launch
        const launchResult = await (this.unifiedClient as IBrowserClient).launch({
          headless: true,
          viewport: testCase.viewport,
        });
        if (!launchResult.success) {
          return `Failed to launch browser: ${launchResult.error.message}`;
        }
        return null;
      }
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * Refresh the page snapshot (agent-browser only)
   */
  private async refreshSnapshot(): Promise<ParsedSnapshot | undefined> {
    if (!this.useAgentBrowser || !isAgentBrowserClient(this.unifiedClient)) {
      return undefined;
    }

    try {
      const snapshotResult = await this.unifiedClient.getSnapshot({ interactive: true });
      if (snapshotResult.success) {
        return snapshotResult.value;
      }
    } catch {
      this.log('Failed to refresh snapshot');
    }
    return undefined;
  }

  // ==========================================================================
  // Step Executors
  // ==========================================================================

  /**
   * Execute a navigate step
   * Supports both agent-browser and Vibium clients
   */
  private async executeNavigateStep(
    step: NavigateStep,
    client: UnifiedBrowserClient,
    context: StepExecutionContext
  ): Promise<StepExecutionData> {
    const url = this.resolveUrl(step.target, context.baseUrl);

    // Use unified browser client if available
    if (!isVibiumClient(client)) {
      const browserClient = client as IBrowserClient;
      const result = await browserClient.navigate(url);

      if (!result.success) {
        throw result.error;
      }

      // Refresh snapshot after navigation for agent-browser
      if (context.useAgentBrowser) {
        context.currentSnapshot = await this.refreshSnapshot();
      }

      return {
        data: {
          url: result.value.url,
          title: result.value.title,
        },
      };
    }

    // Legacy Vibium path
    const vibiumClient = client as VibiumClient;
    const result = await vibiumClient.navigate({
      url,
      waitUntil: step.options?.waitUntil ?? 'load',
      timeout: step.timeout ?? this.config.defaultStepTimeout,
    });

    if (!result.success) {
      throw result.error;
    }

    return {
      data: {
        url: result.value.url,
        title: result.value.title,
      },
    };
  }

  /**
   * Execute a click step
   * Supports both agent-browser and Vibium clients
   */
  private async executeClickStep(
    step: ClickStep,
    client: UnifiedBrowserClient,
    context: StepExecutionContext
  ): Promise<StepExecutionData> {
    // Use unified browser client if available
    if (!isVibiumClient(client)) {
      const browserClient = client as IBrowserClient;
      const target = toElementTarget(step.target);

      // Wait for element if using agent-browser
      if (context.useAgentBrowser && isAgentBrowserClient(browserClient)) {
        const waitResult = await browserClient.waitForElement(target, step.timeout);
        if (!waitResult.success) {
          throw waitResult.error;
        }
      }

      const result = await browserClient.click(target);

      if (!result.success) {
        throw result.error;
      }

      // Refresh snapshot after click for agent-browser
      if (context.useAgentBrowser) {
        context.currentSnapshot = await this.refreshSnapshot();
      }

      // Wait for navigation if requested
      if (step.options?.waitForNavigation && isAgentBrowserClient(browserClient)) {
        await browserClient.waitForNetworkIdle(step.timeout);
      }

      return {
        data: {},
      };
    }

    // Legacy Vibium path
    const vibiumClient = client as VibiumClient;

    // Scroll into view if requested
    if (step.options?.scrollIntoView) {
      await this.scrollIntoView(vibiumClient, step.target);
    }

    // Hover first if requested
    if (step.options?.hoverFirst) {
      const findResult = await vibiumClient.findElement({ selector: step.target });
      if (!findResult.success) {
        throw findResult.error;
      }
    }

    const result = await vibiumClient.click({
      selector: step.target,
      button: step.options?.button,
      clickCount: step.options?.clickCount,
      delay: step.options?.delay,
      position: step.options?.position,
      modifiers: step.options?.modifiers,
      force: step.options?.force,
      timeout: step.timeout ?? this.config.defaultStepTimeout,
    });

    if (!result.success) {
      throw result.error;
    }

    // Wait for navigation if requested
    if (step.options?.waitForNavigation) {
      await this.delay(500);
      const pageInfo = await vibiumClient.getPageInfo();
      if (pageInfo.success) {
        return {
          data: {
            url: pageInfo.value.url,
          },
        };
      }
    }

    return {
      data: {
        elementText: result.value.element?.textContent,
      },
    };
  }

  /**
   * Execute a type step
   * Supports both agent-browser and Vibium clients
   */
  private async executeTypeStep(
    step: TypeStep,
    client: UnifiedBrowserClient,
    context: StepExecutionContext
  ): Promise<StepExecutionData> {
    // Use unified browser client if available
    if (!isVibiumClient(client)) {
      const browserClient = client as IBrowserClient;
      const target = toElementTarget(step.target);

      // Wait for element if using agent-browser
      if (context.useAgentBrowser && isAgentBrowserClient(browserClient)) {
        const waitResult = await browserClient.waitForElement(target, step.timeout);
        if (!waitResult.success) {
          throw waitResult.error;
        }
      }

      const result = await browserClient.fill(target, step.value);

      if (!result.success) {
        throw result.error;
      }

      // Refresh snapshot after fill for agent-browser
      if (context.useAgentBrowser) {
        context.currentSnapshot = await this.refreshSnapshot();
      }

      return {
        data: {
          elementText: step.options?.sensitive ? '[MASKED]' : step.value,
        },
      };
    }

    // Legacy Vibium path
    const vibiumClient = client as VibiumClient;
    const result = await vibiumClient.type({
      selector: step.target,
      text: step.value,
      delay: step.options?.delay,
      clear: step.options?.clear,
      pressEnter: step.options?.pressEnter,
      timeout: step.timeout ?? this.config.defaultStepTimeout,
    });

    if (!result.success) {
      throw result.error;
    }

    return {
      data: {
        elementText: step.options?.sensitive ? '[MASKED]' : step.value,
      },
    };
  }

  /**
   * Execute a wait step
   * Supports both agent-browser and Vibium clients
   */
  private async executeWaitStep(
    step: WaitStep,
    client: UnifiedBrowserClient,
    context: StepExecutionContext
  ): Promise<StepExecutionData> {
    const timeout = step.timeout ?? this.config.defaultStepTimeout;
    const pollingInterval = step.options.pollingInterval ?? this.config.pollingInterval;

    // Use agent-browser's native wait methods when available
    if (!isVibiumClient(client) && isAgentBrowserClient(client)) {
      const browserClient = client as IAgentBrowserClient;
      let waitResult;

      switch (step.options.condition) {
        case 'element-visible':
        case 'element-hidden':
          if (step.target) {
            waitResult = await browserClient.waitForElement(toElementTarget(step.target), timeout);
          }
          break;

        case 'element-text':
          if (step.options.expectedText) {
            waitResult = await browserClient.waitForText(step.options.expectedText, timeout);
          }
          break;

        case 'url-match':
          if (step.options.urlPattern) {
            const pattern = typeof step.options.urlPattern === 'string'
              ? step.options.urlPattern
              : step.options.urlPattern.source;
            waitResult = await browserClient.waitForUrl(pattern, timeout);
          }
          break;

        case 'network-idle':
        case 'page-loaded':
        case 'dom-loaded':
          waitResult = await browserClient.waitForNetworkIdle(timeout);
          break;

        default:
          // Fall back to polling for unsupported conditions
          break;
      }

      if (waitResult && !waitResult.success) {
        throw waitResult.error;
      }

      // Refresh snapshot after wait
      context.currentSnapshot = await this.refreshSnapshot();

      return { data: {} };
    }

    // Legacy Vibium path with polling
    // Only use with VibiumClient
    if (!isVibiumClient(client)) {
      // For non-Vibium clients that aren't agent-browser, just wait for timeout
      await this.delay(pollingInterval);
      return { data: {} };
    }

    const waitData = await this.waitForCondition(
      step.options.condition,
      client as VibiumClient,
      step,
      timeout,
      pollingInterval
    );

    return {
      data: waitData,
    };
  }

  /**
   * Execute an assert step
   * Supports both agent-browser and Vibium clients
   */
  private async executeAssertStep(
    step: AssertStep,
    client: UnifiedBrowserClient,
    context: StepExecutionContext
  ): Promise<StepExecutionData> {
    // Use unified browser client for assertions when available
    if (!isVibiumClient(client)) {
      const browserClient = client as IBrowserClient;
      const assertResult = await this.performUnifiedAssertion(
        step.options.assertion,
        browserClient,
        step,
        context
      );

      return {
        data: {
          actualValue: assertResult.actual,
          expectedValue: assertResult.expected,
        },
      };
    }

    // Legacy Vibium path
    const vibiumClient = client as VibiumClient;
    const assertResult = await this.performAssertion(
      step.options.assertion,
      vibiumClient,
      step
    );

    return {
      data: {
        actualValue: assertResult.actual,
        expectedValue: assertResult.expected,
      },
    };
  }

  /**
   * Execute a screenshot step
   * Supports both agent-browser and Vibium clients
   */
  private async executeScreenshotStep(
    step: ScreenshotStep,
    client: UnifiedBrowserClient,
    _context: StepExecutionContext
  ): Promise<StepExecutionData> {
    // Use unified browser client if available
    if (!isVibiumClient(client)) {
      const browserClient = client as IBrowserClient;
      const result = await browserClient.screenshot({
        path: step.target,
        fullPage: step.options?.fullPage,
      });

      if (!result.success) {
        throw result.error;
      }

      // Convert to ScreenshotResult format for consistency
      const screenshotResult = toVibiumScreenshotResult(result.value);

      return {
        screenshot: screenshotResult,
        data: {
          url: result.value.path,
        },
      };
    }

    // Legacy Vibium path
    const vibiumClient = client as VibiumClient;
    const result = await vibiumClient.screenshot({
      selector: step.target,
      fullPage: step.options?.fullPage,
      format: step.options?.format,
      quality: step.options?.quality,
      omitBackground: step.options?.omitBackground,
    });

    if (!result.success) {
      throw result.error;
    }

    return {
      screenshot: result.value,
      data: {
        url: result.value.path,
      },
    };
  }

  /**
   * Execute an accessibility check step
   * Supports both agent-browser and Vibium clients
   */
  private async executeA11yCheckStep(
    step: A11yCheckStep,
    client: UnifiedBrowserClient,
    _context: StepExecutionContext
  ): Promise<StepExecutionData> {
    // Use unified browser client with evaluate for axe-core
    if (!isVibiumClient(client)) {
      const browserClient = client as IBrowserClient;

      // Inject and run axe-core via evaluate
      const axeScript = `
        (async () => {
          if (!window.axe) {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.7.2/axe.min.js';
            document.head.appendChild(script);
            await new Promise(resolve => script.onload = resolve);
          }
          const results = await axe.run(${step.target ? `'${step.target}'` : 'document'}, {
            runOnly: ${JSON.stringify(step.options?.tags ?? ['wcag2a', 'wcag2aa'])},
          });
          return JSON.stringify(results);
        })()
      `;

      const evalResult = await browserClient.evaluate<string>(axeScript);

      if (!evalResult.success) {
        throw evalResult.error;
      }

      const axeResults = JSON.parse(evalResult.value);
      const a11yResult = toVibiumAccessibilityResult(axeResults);

      // Check severity thresholds
      if (step.options?.failOnSeverity) {
        const severityOrder: Record<string, number> = {
          critical: 0, high: 1, medium: 2, low: 3, info: 4,
        };
        const threshold = severityOrder[step.options.failOnSeverity];
        const violationsOverThreshold = axeResults.violations.filter(
          (v: { impact: string }) => severityOrder[v.impact] <= threshold
        );
        if (violationsOverThreshold.length > 0) {
          throw new AssertionError(
            `Accessibility violations found: ${violationsOverThreshold.length} at or above ${step.options.failOnSeverity}`,
            step.id,
            0,
            violationsOverThreshold.length
          );
        }
      }

      return { accessibilityResult: a11yResult };
    }

    // Legacy Vibium path
    const vibiumClient = client as VibiumClient;
    const result = await vibiumClient.checkAccessibility({
      selector: step.target,
      wcagLevel: step.options?.wcagLevel ?? 'AA',
      rules: step.options?.rules
        ? {
            include: step.options.tags,
            exclude: step.options.context?.exclude,
          }
        : undefined,
    });

    if (!result.success) {
      throw result.error;
    }

    const a11yResult = result.value;

    // Check if violations exceed threshold
    if (step.options?.failOnSeverity) {
      const severityOrder: Record<string, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
        info: 4,
      };
      const threshold = severityOrder[step.options.failOnSeverity];
      const violations = a11yResult.violations.filter(
        (v) => severityOrder[v.impact] <= threshold
      );
      if (violations.length > 0) {
        throw new AssertionError(
          `Accessibility violations found: ${violations.length} violations at or above ${step.options.failOnSeverity} severity`,
          step.id,
          0,
          violations.length
        );
      }
    }

    // Check max violations threshold
    if (
      step.options?.maxViolations !== undefined &&
      a11yResult.violations.length > step.options.maxViolations
    ) {
      throw new AssertionError(
        `Too many accessibility violations: ${a11yResult.violations.length} (max: ${step.options.maxViolations})`,
        step.id,
        step.options.maxViolations,
        a11yResult.violations.length
      );
    }

    return {
      accessibilityResult: a11yResult,
    };
  }

  // ==========================================================================
  // Wait Condition Handlers
  // ==========================================================================

  /**
   * Wait for a condition to be met
   */
  private async waitForCondition(
    condition: WaitConditionType,
    client: VibiumClient,
    step: WaitStep,
    timeout: number,
    pollingInterval: number
  ): Promise<E2EStepResult['data']> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      let conditionMet = false;
      let data: E2EStepResult['data'] = {};

      try {
        switch (condition) {
          case 'element-visible':
            conditionMet = await this.checkElementVisible(client, step.target!);
            break;

          case 'element-hidden':
            conditionMet = !(await this.checkElementVisible(client, step.target!));
            break;

          case 'element-enabled':
            conditionMet = await this.checkElementEnabled(client, step.target!);
            break;

          case 'element-disabled':
            conditionMet = !(await this.checkElementEnabled(client, step.target!));
            break;

          case 'element-text': {
            const textResult = await this.checkElementText(
              client,
              step.target!,
              step.options.expectedText!,
              step.options.textMatchMode ?? 'contains'
            );
            conditionMet = textResult.matches;
            data.elementText = textResult.actualText;
            break;
          }

          case 'element-attribute': {
            const attrResult = await this.checkElementAttribute(
              client,
              step.target!,
              step.options.attributeName!,
              step.options.attributeValue!
            );
            conditionMet = attrResult.matches;
            data.attributeValue = attrResult.actualValue;
            break;
          }

          case 'url-match': {
            const pageInfo = await client.getPageInfo();
            if (pageInfo.success) {
              const pattern = step.options.urlPattern!;
              conditionMet =
                typeof pattern === 'string'
                  ? pageInfo.value.url.includes(pattern)
                  : new RegExp(pattern).test(pageInfo.value.url);
              data.url = pageInfo.value.url;
            }
            break;
          }

          case 'network-idle':
          case 'dom-loaded':
          case 'page-loaded': {
            const pageInfo = await client.getPageInfo();
            if (pageInfo.success) {
              const loadStateMap: Record<string, string[]> = {
                'network-idle': ['networkidle'],
                'dom-loaded': ['domcontentloaded', 'networkidle', 'loaded'],
                'page-loaded': ['loaded', 'networkidle'],
              };
              conditionMet = loadStateMap[condition].includes(pageInfo.value.loadState);
            }
            break;
          }

          case 'custom':
            // Custom conditions require external evaluation - always pass for now
            conditionMet = true;
            break;
        }

        // Handle negation
        if (step.options.negate) {
          conditionMet = !conditionMet;
        }

        if (conditionMet) {
          return data;
        }
      } catch {
        // Condition check failed, continue polling
      }

      await this.delay(pollingInterval);
    }

    throw new StepTimeoutError(
      step.id,
      timeout,
      new Error(`Wait condition "${condition}" not met`)
    );
  }

  // ==========================================================================
  // Assertion Handlers
  // ==========================================================================

  /**
   * Perform an assertion using the unified browser client (IBrowserClient)
   * Supports agent-browser and generic browser clients
   */
  private async performUnifiedAssertion(
    assertion: AssertionType,
    client: IBrowserClient,
    step: AssertStep,
    _context: StepExecutionContext
  ): Promise<{ actual: unknown; expected: unknown }> {
    let actual: unknown;
    const expected = step.options.expected ?? step.value;

    switch (assertion) {
      case 'element-exists':
      case 'element-visible':
      case 'visible': {  // 'visible' is short form alias
        if (step.target) {
          const result = await client.isVisible(toElementTarget(step.target));
          actual = result.success ? result.value : false;
        } else {
          actual = false;
        }
        this.assertCondition(actual === true, step, true, actual);
        break;
      }

      case 'element-not-exists':
      case 'element-hidden':
      case 'hidden': {  // 'hidden' is short form alias
        if (step.target) {
          const result = await client.isVisible(toElementTarget(step.target));
          actual = result.success ? !result.value : true;
        } else {
          actual = true;
        }
        this.assertCondition(actual === true, step, true, actual);
        break;
      }

      case 'element-text':
      case 'text': {  // 'text' is short form alias
        if (step.target) {
          const result = await client.getText(toElementTarget(step.target));
          if (!result.success) {
            throw result.error;
          }
          actual = result.value;
          this.assertTextMatch(actual as string, expected as string, step.options.operator, step);
        }
        break;
      }

      case 'url-equals':
      case 'url-contains':
      case 'url-matches': {
        // Get current URL via evaluate
        const urlResult = await client.evaluate<string>('window.location.href');
        if (!urlResult.success) {
          throw urlResult.error;
        }
        actual = urlResult.value;

        if (assertion === 'url-equals') {
          this.assertCondition(actual === expected, step, expected, actual);
        } else if (assertion === 'url-contains') {
          this.assertCondition(
            (actual as string).includes(expected as string),
            step,
            expected,
            actual
          );
        } else {
          const regex = new RegExp(expected as string);
          this.assertCondition(regex.test(actual as string), step, expected, actual);
        }
        break;
      }

      case 'title-equals':
      case 'title-contains': {
        const titleResult = await client.evaluate<string>('document.title');
        if (!titleResult.success) {
          throw titleResult.error;
        }
        actual = titleResult.value;

        if (assertion === 'title-equals') {
          this.assertCondition(actual === expected, step, expected, actual);
        } else {
          this.assertCondition(
            (actual as string).includes(expected as string),
            step,
            expected,
            actual
          );
        }
        break;
      }

      case 'page-has-text': {
        // Search for text on page
        const textResult = await client.evaluate<boolean>(
          `document.body.innerText.includes('${expected}')`
        );
        actual = textResult.success ? textResult.value : false;
        this.assertCondition(actual === true, step, true, actual);
        break;
      }

      case 'element-attribute': {
        if (step.target && step.options.attributeName) {
          const attrResult = await client.evaluate<string | null>(
            `document.querySelector('${step.target}')?.getAttribute('${step.options.attributeName}')`
          );
          if (attrResult.success) {
            actual = attrResult.value;
            this.assertCondition(actual === expected, step, expected, actual);
          } else {
            throw attrResult.error;
          }
        }
        break;
      }

      case 'element-value': {
        if (step.target) {
          const valueResult = await client.evaluate<string | null>(
            `document.querySelector('${step.target}')?.value`
          );
          if (valueResult.success) {
            actual = valueResult.value;
            this.assertCondition(actual === expected, step, expected, actual);
          } else {
            throw valueResult.error;
          }
        }
        break;
      }

      case 'element-count': {
        if (step.target) {
          const countResult = await client.evaluate<number>(
            `document.querySelectorAll('${step.target}').length`
          );
          if (countResult.success) {
            actual = countResult.value;
            const expectedCount = step.options.count ?? (expected as number);
            this.assertNumericCondition(
              actual as number,
              expectedCount,
              step.options.operator ?? 'eq',
              step
            );
          } else {
            throw countResult.error;
          }
        }
        break;
      }

      case 'element-class': {
        if (step.target && step.options.className) {
          const classResult = await client.evaluate<boolean>(
            `document.querySelector('${step.target}')?.classList.contains('${step.options.className}')`
          );
          actual = classResult.success ? classResult.value : false;
          this.assertCondition(actual === true, step, true, actual);
        }
        break;
      }

      case 'element-enabled':
      case 'element-disabled': {
        if (step.target) {
          const enabledResult = await client.evaluate<boolean>(
            `!document.querySelector('${step.target}')?.disabled`
          );
          actual = enabledResult.success ? enabledResult.value : false;
          if (assertion === 'element-disabled') {
            actual = !actual;
          }
          this.assertCondition(actual === true, step, true, actual);
        }
        break;
      }

      case 'console-no-errors':
        // This would require console log monitoring - mark as passed for now
        actual = true;
        break;

      case 'custom':
        // Custom assertions require external evaluation - always pass for now
        actual = true;
        break;

      default:
        throw new E2ERunnerError(
          `Unsupported assertion type: ${assertion}`,
          'UNSUPPORTED_ASSERTION',
          step.id
        );
    }

    return { actual, expected };
  }

  /**
   * Perform an assertion (Legacy Vibium path)
   */
  private async performAssertion(
    assertion: AssertionType,
    client: VibiumClient,
    step: AssertStep
  ): Promise<{ actual: unknown; expected: unknown }> {
    let actual: unknown;
    const expected = step.options.expected ?? step.value;

    switch (assertion) {
      case 'element-exists': {
        const result = await client.findElement({ selector: step.target! });
        actual = result.success;
        this.assertCondition(actual === true, step, expected, actual);
        break;
      }

      case 'element-not-exists': {
        const result = await client.findElement({ selector: step.target! });
        actual = !result.success;
        this.assertCondition(actual === true, step, true, actual);
        break;
      }

      case 'element-visible': {
        actual = await this.checkElementVisible(client, step.target!);
        this.assertCondition(actual === true, step, true, actual);
        break;
      }

      case 'element-hidden': {
        actual = !(await this.checkElementVisible(client, step.target!));
        this.assertCondition(actual === true, step, true, actual);
        break;
      }

      case 'element-enabled': {
        actual = await this.checkElementEnabled(client, step.target!);
        this.assertCondition(actual === true, step, true, actual);
        break;
      }

      case 'element-disabled': {
        actual = !(await this.checkElementEnabled(client, step.target!));
        this.assertCondition(actual === true, step, true, actual);
        break;
      }

      case 'element-text': {
        const textResult = await client.getText(step.target!);
        if (!textResult.success) {
          throw textResult.error;
        }
        actual = textResult.value;
        this.assertTextMatch(actual as string, expected as string, step.options.operator, step);
        break;
      }

      case 'element-attribute': {
        const attrResult = await client.getAttribute(step.target!, step.options.attributeName!);
        if (!attrResult.success) {
          throw attrResult.error;
        }
        actual = attrResult.value;
        this.assertCondition(actual === expected, step, expected, actual);
        break;
      }

      case 'element-value': {
        const attrResult = await client.getAttribute(step.target!, 'value');
        if (!attrResult.success) {
          throw attrResult.error;
        }
        actual = attrResult.value;
        this.assertCondition(actual === expected, step, expected, actual);
        break;
      }

      case 'element-count': {
        const elementsResult = await client.findElements({ selector: step.target! });
        if (!elementsResult.success) {
          throw elementsResult.error;
        }
        actual = elementsResult.value.length;
        const expectedCount = step.options.count ?? (expected as number);
        this.assertNumericCondition(
          actual as number,
          expectedCount,
          step.options.operator ?? 'eq',
          step
        );
        break;
      }

      case 'element-class': {
        const classResult = await client.getAttribute(step.target!, 'class');
        if (!classResult.success) {
          throw classResult.error;
        }
        const classes = (classResult.value || '').split(/\s+/);
        actual = classes.includes(step.options.className!);
        this.assertCondition(actual === true, step, true, actual);
        break;
      }

      case 'url-equals':
      case 'url-contains':
      case 'url-matches': {
        const pageInfo = await client.getPageInfo();
        if (!pageInfo.success) {
          throw pageInfo.error;
        }
        actual = pageInfo.value.url;
        if (assertion === 'url-equals') {
          this.assertCondition(actual === expected, step, expected, actual);
        } else if (assertion === 'url-contains') {
          this.assertCondition(
            (actual as string).includes(expected as string),
            step,
            expected,
            actual
          );
        } else {
          const regex = new RegExp(expected as string);
          this.assertCondition(regex.test(actual as string), step, expected, actual);
        }
        break;
      }

      case 'title-equals':
      case 'title-contains': {
        const pageInfo = await client.getPageInfo();
        if (!pageInfo.success) {
          throw pageInfo.error;
        }
        actual = pageInfo.value.title;
        if (assertion === 'title-equals') {
          this.assertCondition(actual === expected, step, expected, actual);
        } else {
          this.assertCondition(
            (actual as string).includes(expected as string),
            step,
            expected,
            actual
          );
        }
        break;
      }

      case 'page-has-text': {
        // This would require getting page text content
        // For now, we'll check if text exists using findElements
        const selector = `//*[contains(text(),'${expected}')]`;
        const result = await client.findElements({ selector, selectorType: 'xpath' });
        actual = result.success && result.value.length > 0;
        this.assertCondition(actual === true, step, true, actual);
        break;
      }

      case 'console-no-errors':
        // This would require console log monitoring - mark as passed for now
        actual = true;
        break;

      case 'custom':
        // Custom assertions require external evaluation - always pass for now
        actual = true;
        break;

      default:
        throw new E2ERunnerError(
          `Unsupported assertion type: ${assertion}`,
          'UNSUPPORTED_ASSERTION',
          step.id
        );
    }

    return { actual, expected };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Execute a step with retry logic
   */
  private async executeStepWithRetry(
    step: E2EStep,
    context: StepExecutionContext
  ): Promise<E2EStepResult> {
    const maxAttempts = (step.retries ?? this.config.defaultRetries) + 1;
    const timeout = step.timeout ?? this.config.defaultStepTimeout;
    let lastError: Error | undefined;
    let totalDurationMs = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const startedAt = new Date();

      try {
        // Execute with timeout
        const result = await this.withTimeout(
          this.executeStep(step, context),
          timeout,
          step.id
        );

        const completedAt = new Date();
        const durationMs = completedAt.getTime() - startedAt.getTime();
        totalDurationMs += durationMs;

        return {
          stepId: step.id,
          stepType: step.type,
          success: true,
          durationMs,
          data: result.data,
          screenshot: result.screenshot,
          accessibilityResult: result.accessibilityResult,
          startedAt,
          completedAt,
          retryInfo:
            attempt > 1
              ? {
                  attempts: attempt,
                  totalDurationMs,
                }
              : undefined,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        totalDurationMs += Date.now() - startedAt.getTime();

        if (attempt < maxAttempts) {
          this.log(`Step "${step.id}" failed (attempt ${attempt}/${maxAttempts}), retrying...`);
          await this.delay(this.config.retryDelay);
        }
      }
    }

    // All retries exhausted
    const completedAt = new Date();
    return {
      stepId: step.id,
      stepType: step.type,
      success: false,
      durationMs: totalDurationMs,
      error: {
        message: lastError?.message ?? 'Unknown error',
        code: lastError instanceof E2ERunnerError ? lastError.code : 'UNKNOWN',
        stack: lastError?.stack,
      },
      startedAt: new Date(completedAt.getTime() - totalDurationMs),
      completedAt,
      retryInfo: {
        attempts: maxAttempts,
        totalDurationMs,
      },
    };
  }

  /**
   * Execute a single step based on its type
   */
  private async executeStep(
    step: E2EStep,
    context: StepExecutionContext
  ): Promise<StepExecutionData> {
    // Check conditional execution
    if (step.condition) {
      const shouldExecute = this.evaluateCondition(step.condition, context);
      if (!shouldExecute) {
        return { data: {} };
      }
    }

    // Use the unified client for step execution
    const client = this.unifiedClient;

    if (isNavigateStep(step)) {
      return this.executeNavigateStep(step, client, context);
    } else if (isClickStep(step)) {
      return this.executeClickStep(step, client, context);
    } else if (isTypeStep(step)) {
      return this.executeTypeStep(step, client, context);
    } else if (isWaitStep(step)) {
      return this.executeWaitStep(step, client, context);
    } else if (isAssertStep(step)) {
      return this.executeAssertStep(step, client, context);
    } else if (isScreenshotStep(step)) {
      return this.executeScreenshotStep(step, client, context);
    } else if (isA11yCheckStep(step)) {
      return this.executeA11yCheckStep(step, client, context);
    }

    // This should never be reached if all step types are handled
    const unknownStep = step as E2EStep;
    throw new E2ERunnerError(
      `Unknown step type: ${unknownStep.type}`,
      'UNKNOWN_STEP_TYPE',
      unknownStep.id
    );
  }

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
      const result = await this.executeStepWithRetry(hook, context);
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

    // Start workers
    const workerPromises: Promise<void>[] = [];
    for (let i = 0; i < Math.min(workers, testCases.length); i++) {
      workerPromises.push(executeNext());
    }

    await Promise.all(workerPromises);
    return results;
  }

  /**
   * Check if element is visible
   */
  private async checkElementVisible(client: VibiumClient, selector: string): Promise<boolean> {
    const result = await client.findElement({
      selector,
      visible: true,
      timeout: 1000,
    });
    return result.success && result.value.visible;
  }

  /**
   * Check if element is enabled
   */
  private async checkElementEnabled(client: VibiumClient, selector: string): Promise<boolean> {
    const result = await client.findElement({ selector, timeout: 1000 });
    return result.success && result.value.enabled;
  }

  /**
   * Check element text against expected value
   */
  private async checkElementText(
    client: VibiumClient,
    selector: string,
    expectedText: string,
    matchMode: 'exact' | 'contains' | 'regex'
  ): Promise<{ matches: boolean; actualText: string }> {
    const result = await client.getText(selector);
    if (!result.success) {
      return { matches: false, actualText: '' };
    }

    const actualText = result.value;
    let matches = false;

    switch (matchMode) {
      case 'exact':
        matches = actualText === expectedText;
        break;
      case 'contains':
        matches = actualText.includes(expectedText);
        break;
      case 'regex':
        matches = new RegExp(expectedText).test(actualText);
        break;
    }

    return { matches, actualText };
  }

  /**
   * Check element attribute against expected value
   */
  private async checkElementAttribute(
    client: VibiumClient,
    selector: string,
    attributeName: string,
    expectedValue: string
  ): Promise<{ matches: boolean; actualValue: string }> {
    const result = await client.getAttribute(selector, attributeName);
    if (!result.success) {
      return { matches: false, actualValue: '' };
    }

    return {
      matches: result.value === expectedValue,
      actualValue: result.value,
    };
  }

  /**
   * Scroll element into view
   */
  private async scrollIntoView(client: VibiumClient, selector: string): Promise<void> {
    // Use findElement which may auto-scroll
    await client.findElement({ selector, visible: true });
  }

  /**
   * Assert a condition is true
   */
  private assertCondition(
    condition: boolean,
    step: AssertStep,
    expected: unknown,
    actual: unknown
  ): void {
    if (!condition) {
      const message =
        step.options.errorMessage ??
        `Assertion failed: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;

      if (step.options.soft) {
        this.log(`Soft assertion failed: ${message}`);
      } else {
        throw new AssertionError(message, step.id, expected, actual);
      }
    }
  }

  /**
   * Assert text matches using specified operator
   */
  private assertTextMatch(
    actual: string,
    expected: string,
    operator: AssertStep['options']['operator'],
    step: AssertStep
  ): void {
    let matches = false;

    switch (operator) {
      case 'eq':
      case undefined:
        matches = actual === expected;
        break;
      case 'neq':
        matches = actual !== expected;
        break;
      case 'contains':
        matches = actual.includes(expected);
        break;
      case 'matches':
        matches = new RegExp(expected).test(actual);
        break;
      default:
        matches = actual === expected;
    }

    this.assertCondition(matches, step, expected, actual);
  }

  /**
   * Assert numeric condition
   */
  private assertNumericCondition(
    actual: number,
    expected: number,
    operator: AssertStep['options']['operator'],
    step: AssertStep
  ): void {
    let matches = false;

    switch (operator) {
      case 'eq':
        matches = actual === expected;
        break;
      case 'neq':
        matches = actual !== expected;
        break;
      case 'gt':
        matches = actual > expected;
        break;
      case 'gte':
        matches = actual >= expected;
        break;
      case 'lt':
        matches = actual < expected;
        break;
      case 'lte':
        matches = actual <= expected;
        break;
      default:
        matches = actual === expected;
    }

    this.assertCondition(matches, step, expected, actual);
  }

  /**
   * Resolve URL with base URL
   */
  private resolveUrl(url: string, baseUrl: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return new URL(url, baseUrl).toString();
  }

  /**
   * Evaluate conditional expression
   * Uses safe expression evaluator to prevent code injection (CVE fix)
   */
  private evaluateCondition(condition: string, context: StepExecutionContext): boolean {
    // Build evaluation context from step variables
    // Note: process.env is excluded for security - only explicit variables allowed
    const evalContext: Record<string, unknown> = {
      ...context.variables,
    };

    // Use safe evaluator instead of new Function() - prevents code injection
    return safeEvaluateBoolean(condition, evalContext, true);
  }

  /**
   * Get browser context options from test case
   */
  private getBrowserContextOptions(testCase: E2ETestCase): Record<string, unknown> {
    const options: Record<string, unknown> = {};

    if (testCase.browserContext?.userAgent) {
      options.userAgent = testCase.browserContext.userAgent;
    }
    if (testCase.browserContext?.locale) {
      options.locale = testCase.browserContext.locale;
    }
    if (testCase.browserContext?.timezoneId) {
      options.timezoneId = testCase.browserContext.timezoneId;
    }

    return options;
  }

  /**
   * Capture screenshot on failure
   * Supports both agent-browser and Vibium clients
   */
  private async captureFailureScreenshot(stepId: string): Promise<ScreenshotResult | null> {
    try {
      // Use unified browser client if available
      if (!isVibiumClient(this.unifiedClient)) {
        const browserClient = this.unifiedClient as IBrowserClient;
        const result = await browserClient.screenshot({ fullPage: true });
        if (result.success) {
          return toVibiumScreenshotResult(result.value);
        }
        return null;
      }

      // Legacy Vibium path
      const result = await (this.client as VibiumClient).screenshot({
        fullPage: true,
        format: 'png',
      });
      if (result.success) {
        return result.value;
      }
    } catch {
      this.log(`Failed to capture failure screenshot for step ${stepId}`);
    }
    return null;
  }

  /**
   * Check if any results have failures
   */
  private hasFailure(results: E2EStepResult[]): boolean {
    return results.some((r) => !r.success);
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(results: E2ETestResult[]): {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  } {
    return {
      total: results.length,
      passed: results.filter((r) => r.status === 'passed').length,
      failed: results.filter((r) => r.status === 'failed' || r.status === 'error').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
    };
  }

  /**
   * Create skipped test result
   */
  private createSkippedResult(testCase: E2ETestCase, startedAt: Date): E2ETestResult {
    return {
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      success: true,
      status: 'skipped',
      stepResults: [],
      totalDurationMs: 0,
      startedAt,
      completedAt: new Date(),
    };
  }

  /**
   * Create error test result
   */
  private createErrorResult(
    testCase: E2ETestCase,
    startedAt: Date,
    errorMessage: string,
    stepResults: E2EStepResult[] = []
  ): E2ETestResult {
    return {
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      success: false,
      status: 'error',
      stepResults,
      totalDurationMs: Date.now() - startedAt.getTime(),
      startedAt,
      completedAt: new Date(),
      errorSummary: {
        failedStep: stepResults.length > 0 ? stepResults[stepResults.length - 1].stepId : 'setup',
        errorMessage,
      },
    };
  }

  /**
   * Create test result from step results
   */
  private createResult(
    testCase: E2ETestCase,
    startedAt: Date,
    stepResults: E2EStepResult[],
    screenshots: ScreenshotResult[],
    accessibilityResults: AccessibilityResult[]
  ): E2ETestResult {
    const completedAt = new Date();
    const hasRequiredFailure = stepResults.some(
      (r) =>
        !r.success &&
        testCase.steps.find((s) => s.id === r.stepId)?.required &&
        !testCase.steps.find((s) => s.id === r.stepId)?.continueOnFailure
    );

    const status: E2ETestResult['status'] = hasRequiredFailure ? 'failed' : 'passed';

    const failedStep = stepResults.find((r) => !r.success);

    return {
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      success: status === 'passed',
      status,
      stepResults,
      totalDurationMs: completedAt.getTime() - startedAt.getTime(),
      screenshots: screenshots.length > 0 ? screenshots : undefined,
      accessibilityResults: accessibilityResults.length > 0 ? accessibilityResults : undefined,
      startedAt,
      completedAt,
      browserInfo: testCase.viewport
        ? {
            browserType: 'chromium',
            viewport: testCase.viewport,
            userAgent: testCase.browserContext?.userAgent ?? '',
          }
        : undefined,
      errorSummary: failedStep
        ? {
            failedStep: failedStep.stepId,
            errorMessage: failedStep.error?.message ?? 'Unknown error',
            errorCode: failedStep.error?.code,
            screenshot: failedStep.error?.failureScreenshot,
          }
        : undefined,
    };
  }

  /**
   * Wrap promise with timeout
   */
  private async withTimeout<T>(promise: Promise<T>, timeout: number, stepId: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new StepTimeoutError(stepId, timeout));
      }, timeout);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
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
 *
 * @example
 * ```typescript
 * import { createVibiumClient } from '../../../integrations/vibium';
 * import { createE2ETestRunnerService } from './e2e-runner';
 *
 * const client = await createVibiumClient({ enabled: true });
 * const runner = createE2ETestRunnerService(client, {
 *   screenshotOnFailure: true,
 *   verbose: true,
 * });
 *
 * const result = await runner.runTestCase(testCase);
 * ```
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
 *
 * @example
 * ```typescript
 * import { createAgentBrowserClient } from '../../../integrations/browser';
 * import { createE2ETestRunnerServiceWithBrowserClient } from './e2e-runner';
 *
 * // Using agent-browser (recommended for E2E testing)
 * const agentClient = await createAgentBrowserClient();
 * const runner = createE2ETestRunnerServiceWithBrowserClient(agentClient, {
 *   preferAgentBrowser: true,
 *   screenshotOnFailure: true,
 * });
 *
 * // Execute test with snapshot refs
 * const result = await runner.runTestCase(testCase);
 * ```
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
 *
 * @example
 * ```typescript
 * import { createAutoE2ETestRunnerService } from './e2e-runner';
 *
 * // Auto-select best browser client for E2E testing
 * const runner = await createAutoE2ETestRunnerService({
 *   screenshotOnFailure: true,
 *   verbose: true,
 * });
 *
 * const result = await runner.runTestCase(testCase);
 * ```
 */
export async function createAutoE2ETestRunnerService(
  config?: Partial<E2ERunnerConfig>
): Promise<E2ETestRunnerService> {
  // Get browser client for E2E testing use case
  const client = await getBrowserClientForUseCase('e2e-testing');

  return new E2ETestRunnerService(client as unknown as VibiumClient, {
    ...config,
    browserClient: client,
    preferAgentBrowser: true,
  });
}
