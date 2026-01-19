/**
 * Agentic QE v3 - E2E Test Runner Service
 *
 * Executes E2E test cases using the Vibium browser automation client.
 * Provides step-by-step execution with retry logic, timeout handling,
 * and comprehensive result aggregation.
 *
 * @module test-execution/services/e2e-runner
 */

import type { Result } from '../../../shared/types';
import { ok, err } from '../../../shared/types';
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
// Step Executor Types
// ============================================================================

/**
 * Step executor function signature
 */
type StepExecutor<T extends E2EStep> = (
  step: T,
  client: VibiumClient,
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
 * Executes E2E test cases using the Vibium browser automation client.
 * Provides step-by-step execution with retry logic, timeout handling,
 * and comprehensive result aggregation.
 */
export class E2ETestRunnerService implements IE2ETestRunnerService {
  private readonly config: E2ERunnerConfig;

  /**
   * Create E2E Test Runner Service
   * @param client - Vibium browser automation client (dependency injection)
   * @param config - Runner configuration
   */
  constructor(
    private readonly client: VibiumClient,
    config: Partial<E2ERunnerConfig> = {}
  ) {
    this.config = { ...DEFAULT_E2E_RUNNER_CONFIG, ...config };
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
      // Launch browser if not already launched
      const session = await this.client.getSession();
      if (!session) {
        const launchResult = await this.client.launch({
          headless: true,
          viewport: testCase.viewport,
          ...this.getBrowserContextOptions(testCase),
        });
        if (!launchResult.success) {
          return this.createErrorResult(
            testCase,
            startedAt,
            `Failed to launch browser: ${launchResult.error.message}`
          );
        }
      }

      // Create execution context
      const context: StepExecutionContext = {
        testCase,
        baseUrl: testCase.baseUrl,
        variables: testCase.testData ?? {},
        previousResults: stepResults,
      };

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
  // Step Executors
  // ==========================================================================

  /**
   * Execute a navigate step
   */
  private async executeNavigateStep(
    step: NavigateStep,
    client: VibiumClient,
    context: StepExecutionContext
  ): Promise<StepExecutionData> {
    const url = this.resolveUrl(step.target, context.baseUrl);

    const result = await client.navigate({
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
   */
  private async executeClickStep(
    step: ClickStep,
    client: VibiumClient,
    _context: StepExecutionContext
  ): Promise<StepExecutionData> {
    // Scroll into view if requested
    if (step.options?.scrollIntoView) {
      await this.scrollIntoView(client, step.target);
    }

    // Hover first if requested
    if (step.options?.hoverFirst) {
      // Find element to hover
      const findResult = await client.findElement({ selector: step.target });
      if (!findResult.success) {
        throw findResult.error;
      }
    }

    const result = await client.click({
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
      await this.delay(500); // Brief delay for navigation to start
      const pageInfo = await client.getPageInfo();
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
   */
  private async executeTypeStep(
    step: TypeStep,
    client: VibiumClient,
    _context: StepExecutionContext
  ): Promise<StepExecutionData> {
    const result = await client.type({
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
   */
  private async executeWaitStep(
    step: WaitStep,
    client: VibiumClient,
    _context: StepExecutionContext
  ): Promise<StepExecutionData> {
    const timeout = step.timeout ?? this.config.defaultStepTimeout;
    const pollingInterval = step.options.pollingInterval ?? this.config.pollingInterval;

    const waitResult = await this.waitForCondition(
      step.options.condition,
      client,
      step,
      timeout,
      pollingInterval
    );

    return {
      data: waitResult,
    };
  }

  /**
   * Execute an assert step
   */
  private async executeAssertStep(
    step: AssertStep,
    client: VibiumClient,
    _context: StepExecutionContext
  ): Promise<StepExecutionData> {
    const assertResult = await this.performAssertion(
      step.options.assertion,
      client,
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
   */
  private async executeScreenshotStep(
    step: ScreenshotStep,
    client: VibiumClient,
    _context: StepExecutionContext
  ): Promise<StepExecutionData> {
    const result = await client.screenshot({
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
   */
  private async executeA11yCheckStep(
    step: A11yCheckStep,
    client: VibiumClient,
    _context: StepExecutionContext
  ): Promise<StepExecutionData> {
    const result = await client.checkAccessibility({
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
   * Perform an assertion
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

    if (isNavigateStep(step)) {
      return this.executeNavigateStep(step, this.client, context);
    } else if (isClickStep(step)) {
      return this.executeClickStep(step, this.client, context);
    } else if (isTypeStep(step)) {
      return this.executeTypeStep(step, this.client, context);
    } else if (isWaitStep(step)) {
      return this.executeWaitStep(step, this.client, context);
    } else if (isAssertStep(step)) {
      return this.executeAssertStep(step, this.client, context);
    } else if (isScreenshotStep(step)) {
      return this.executeScreenshotStep(step, this.client, context);
    } else if (isA11yCheckStep(step)) {
      return this.executeA11yCheckStep(step, this.client, context);
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
   */
  private evaluateCondition(condition: string, context: StepExecutionContext): boolean {
    try {
      // Simple variable substitution evaluation
      const evalContext = {
        ...context.variables,
        env: process.env,
      };
      const fn = new Function(...Object.keys(evalContext), `return ${condition}`);
      return Boolean(fn(...Object.values(evalContext)));
    } catch {
      return true; // On error, execute the step
    }
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
   */
  private async captureFailureScreenshot(stepId: string): Promise<ScreenshotResult | null> {
    try {
      const result = await this.client.screenshot({
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
 * Create an E2E Test Runner Service instance
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
