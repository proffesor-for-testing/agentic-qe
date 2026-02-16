/**
 * Agentic QE v3 - Step Executors
 *
 * Individual step execution logic for each E2E step type.
 * Supports both agent-browser and Vibium browser clients.
 * Assertion logic is delegated to assertion-handlers.ts.
 *
 * @module test-execution/services/e2e/step-executors
 */

import type { VibiumClient } from '../../../../integrations/vibium';
import type { IBrowserClient, IAgentBrowserClient } from '../../../../integrations/browser';
import {
  type E2EStep,
  type E2EStepResult,
  type NavigateStep,
  type ClickStep,
  type TypeStep,
  type WaitStep,
  type AssertStep,
  type ScreenshotStep,
  type A11yCheckStep,
  type WaitConditionType,
  isNavigateStep,
  isClickStep,
  isTypeStep,
  isWaitStep,
  isAssertStep,
  isScreenshotStep,
  isA11yCheckStep,
} from '../../types';
import type { StepExecutionContext, StepExecutionData, E2ERunnerConfig, UnifiedBrowserClient } from './types';
import { E2ERunnerError, AssertionError } from './types';
import {
  isAgentBrowserClient,
  isVibiumClient,
  toElementTarget,
  toVibiumScreenshotResult,
  toVibiumAccessibilityResult,
  BrowserOrchestrator,
} from './browser-orchestrator';
import { AssertionHandlers, createAssertionHandlers } from './assertion-handlers';
import { WaitConditionHandler, createWaitConditionHandler } from './wait-condition-handler';
import { safeJsonParse } from '../../../../shared/safe-json.js';

// ============================================================================
// Step Executor Class
// ============================================================================

/**
 * Step Executors
 *
 * Handles execution of individual E2E test steps.
 * Delegates to appropriate methods based on step type and browser client.
 */
export class StepExecutors {
  private readonly config: E2ERunnerConfig;
  private readonly orchestrator: BrowserOrchestrator;
  private readonly assertionHandlers: AssertionHandlers;
  private readonly waitConditionHandler: WaitConditionHandler;
  private readonly log: (message: string) => void;

  constructor(
    config: E2ERunnerConfig,
    orchestrator: BrowserOrchestrator,
    logger: (message: string) => void
  ) {
    this.config = config;
    this.orchestrator = orchestrator;
    this.assertionHandlers = createAssertionHandlers(orchestrator, logger);
    this.waitConditionHandler = createWaitConditionHandler(orchestrator);
    this.log = logger;
  }

  /**
   * Execute a single step based on its type
   */
  async executeStep(
    step: E2EStep,
    context: StepExecutionContext
  ): Promise<StepExecutionData> {
    const client = this.orchestrator.getClient();

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

    const unknownStep = step as E2EStep;
    throw new E2ERunnerError(
      `Unknown step type: ${unknownStep.type}`,
      'UNKNOWN_STEP_TYPE',
      unknownStep.id
    );
  }

  /**
   * Refresh snapshot after actions (agent-browser only)
   */
  async refreshSnapshotIfNeeded(context: StepExecutionContext): Promise<void> {
    if (context.useAgentBrowser) {
      context.currentSnapshot = await this.orchestrator.refreshSnapshot();
    }
  }

  // ==========================================================================
  // Navigate Step
  // ==========================================================================

  private async executeNavigateStep(
    step: NavigateStep,
    client: UnifiedBrowserClient,
    context: StepExecutionContext
  ): Promise<StepExecutionData> {
    const url = this.resolveUrl(step.target, context.baseUrl);

    if (!isVibiumClient(client)) {
      const browserClient = client as IBrowserClient;
      const result = await browserClient.navigate(url);

      if (!result.success) {
        throw result.error;
      }

      await this.refreshSnapshotIfNeeded(context);

      return {
        data: {
          url: result.value.url,
          title: result.value.title,
        },
      };
    }

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

  // ==========================================================================
  // Click Step
  // ==========================================================================

  private async executeClickStep(
    step: ClickStep,
    client: UnifiedBrowserClient,
    context: StepExecutionContext
  ): Promise<StepExecutionData> {
    if (!isVibiumClient(client)) {
      const browserClient = client as IBrowserClient;
      const target = toElementTarget(step.target);

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

      await this.refreshSnapshotIfNeeded(context);

      if (step.options?.waitForNavigation && isAgentBrowserClient(browserClient)) {
        await browserClient.waitForNetworkIdle(step.timeout);
      }

      return { data: {} };
    }

    const vibiumClient = client as VibiumClient;

    if (step.options?.scrollIntoView) {
      await this.orchestrator.scrollIntoView(step.target);
    }

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

  // ==========================================================================
  // Type Step
  // ==========================================================================

  private async executeTypeStep(
    step: TypeStep,
    client: UnifiedBrowserClient,
    context: StepExecutionContext
  ): Promise<StepExecutionData> {
    if (!isVibiumClient(client)) {
      const browserClient = client as IBrowserClient;
      const target = toElementTarget(step.target);

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

      await this.refreshSnapshotIfNeeded(context);

      return {
        data: {
          elementText: step.options?.sensitive ? '[MASKED]' : step.value,
        },
      };
    }

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

  // ==========================================================================
  // Wait Step
  // ==========================================================================

  private async executeWaitStep(
    step: WaitStep,
    client: UnifiedBrowserClient,
    context: StepExecutionContext
  ): Promise<StepExecutionData> {
    const timeout = step.timeout ?? this.config.defaultStepTimeout;
    const pollingInterval = step.options.pollingInterval ?? this.config.pollingInterval;

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
            const pattern =
              typeof step.options.urlPattern === 'string'
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
          break;
      }

      if (waitResult && !waitResult.success) {
        throw waitResult.error;
      }

      context.currentSnapshot = await this.orchestrator.refreshSnapshot();
      return { data: {} };
    }

    if (!isVibiumClient(client)) {
      await this.delay(pollingInterval);
      return { data: {} };
    }

    const waitData = await this.waitConditionHandler.waitForCondition(
      step.options.condition,
      client as VibiumClient,
      step,
      timeout,
      pollingInterval
    );

    return { data: waitData };
  }

  // ==========================================================================
  // Assert Step
  // ==========================================================================

  private async executeAssertStep(
    step: AssertStep,
    client: UnifiedBrowserClient,
    context: StepExecutionContext
  ): Promise<StepExecutionData> {
    if (!isVibiumClient(client)) {
      const browserClient = client as IBrowserClient;
      const assertResult = await this.assertionHandlers.performUnifiedAssertion(
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

    const vibiumClient = client as VibiumClient;
    const assertResult = await this.assertionHandlers.performVibiumAssertion(
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

  // ==========================================================================
  // Screenshot Step
  // ==========================================================================

  private async executeScreenshotStep(
    step: ScreenshotStep,
    client: UnifiedBrowserClient,
    _context: StepExecutionContext
  ): Promise<StepExecutionData> {
    if (!isVibiumClient(client)) {
      const browserClient = client as IBrowserClient;
      const result = await browserClient.screenshot({
        path: step.target,
        fullPage: step.options?.fullPage,
      });

      if (!result.success) {
        throw result.error;
      }

      const screenshotResult = toVibiumScreenshotResult(result.value);

      return {
        screenshot: screenshotResult,
        data: {
          url: result.value.path,
        },
      };
    }

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

  // ==========================================================================
  // Accessibility Check Step
  // ==========================================================================

  private async executeA11yCheckStep(
    step: A11yCheckStep,
    client: UnifiedBrowserClient,
    _context: StepExecutionContext
  ): Promise<StepExecutionData> {
    if (!isVibiumClient(client)) {
      const browserClient = client as IBrowserClient;

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

      const axeResults = safeJsonParse(evalResult.value);
      const a11yResult = toVibiumAccessibilityResult(axeResults);

      if (step.options?.failOnSeverity) {
        const severityOrder: Record<string, number> = {
          critical: 0,
          high: 1,
          medium: 2,
          low: 3,
          info: 4,
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

    return { accessibilityResult: a11yResult };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  private resolveUrl(url: string, baseUrl: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return new URL(url, baseUrl).toString();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create step executors instance
 */
export function createStepExecutors(
  config: E2ERunnerConfig,
  orchestrator: BrowserOrchestrator,
  logger: (message: string) => void
): StepExecutors {
  return new StepExecutors(config, orchestrator, logger);
}
