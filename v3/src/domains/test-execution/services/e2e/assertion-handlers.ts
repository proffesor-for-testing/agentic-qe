/**
 * Agentic QE v3 - Assertion Handlers
 *
 * Handles assertion logic for both unified browser clients and Vibium clients.
 * Extracted from step-executors for modularity.
 *
 * @module test-execution/services/e2e/assertion-handlers
 */

import type { VibiumClient } from '../../../../integrations/vibium';
import type { IBrowserClient } from '../../../../integrations/browser';
import type { AssertStep, AssertionType } from '../../types';
import type { StepExecutionContext } from './types';
import { E2ERunnerError, AssertionError } from './types';
import { toElementTarget, BrowserOrchestrator } from './browser-orchestrator';

// ============================================================================
// Assertion Handlers Class
// ============================================================================

/**
 * Assertion Handlers
 *
 * Handles all assertion logic for E2E test steps.
 * Supports both unified browser clients and legacy Vibium clients.
 */
export class AssertionHandlers {
  private readonly orchestrator: BrowserOrchestrator;
  private readonly log: (message: string) => void;

  constructor(
    orchestrator: BrowserOrchestrator,
    logger: (message: string) => void
  ) {
    this.orchestrator = orchestrator;
    this.log = logger;
  }

  // ==========================================================================
  // Unified Browser Client Assertions
  // ==========================================================================

  /**
   * Perform assertion using unified browser client
   */
  async performUnifiedAssertion(
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
      case 'visible': {
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
      case 'hidden': {
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
      case 'text': {
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
        actual = true;
        break;

      case 'custom':
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
  // Vibium Client Assertions
  // ==========================================================================

  /**
   * Perform assertion using Vibium client
   */
  async performVibiumAssertion(
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
        actual = await this.orchestrator.checkElementVisible(step.target!);
        this.assertCondition(actual === true, step, true, actual);
        break;
      }

      case 'element-hidden': {
        actual = !(await this.orchestrator.checkElementVisible(step.target!));
        this.assertCondition(actual === true, step, true, actual);
        break;
      }

      case 'element-enabled': {
        actual = await this.orchestrator.checkElementEnabled(step.target!);
        this.assertCondition(actual === true, step, true, actual);
        break;
      }

      case 'element-disabled': {
        actual = !(await this.orchestrator.checkElementEnabled(step.target!));
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
        const selector = `//*[contains(text(),'${expected}')]`;
        const result = await client.findElements({ selector, selectorType: 'xpath' });
        actual = result.success && result.value.length > 0;
        this.assertCondition(actual === true, step, true, actual);
        break;
      }

      case 'console-no-errors':
        actual = true;
        break;

      case 'custom':
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
  // Assertion Helpers
  // ==========================================================================

  /**
   * Assert a condition is true
   */
  assertCondition(
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
  assertTextMatch(
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
  assertNumericCondition(
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
}

/**
 * Create assertion handlers instance
 */
export function createAssertionHandlers(
  orchestrator: BrowserOrchestrator,
  logger: (message: string) => void
): AssertionHandlers {
  return new AssertionHandlers(orchestrator, logger);
}
