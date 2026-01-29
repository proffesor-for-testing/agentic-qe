/**
 * Agentic QE v3 - Wait Condition Handler
 *
 * Handles wait condition polling for Vibium clients.
 * Extracted from step-executors for modularity.
 *
 * @module test-execution/services/e2e/wait-condition-handler
 */

import type { VibiumClient } from '../../../../integrations/vibium';
import type { E2EStepResult, WaitStep, WaitConditionType } from '../../types';
import { StepTimeoutError } from './types';
import { BrowserOrchestrator } from './browser-orchestrator';

// ============================================================================
// Wait Condition Handler Class
// ============================================================================

/**
 * Wait Condition Handler
 *
 * Handles wait condition polling for Vibium browser clients.
 */
export class WaitConditionHandler {
  private readonly orchestrator: BrowserOrchestrator;

  constructor(orchestrator: BrowserOrchestrator) {
    this.orchestrator = orchestrator;
  }

  /**
   * Wait for a condition to be met (Vibium polling)
   */
  async waitForCondition(
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
            conditionMet = await this.orchestrator.checkElementVisible(step.target!);
            break;

          case 'element-hidden':
            conditionMet = !(await this.orchestrator.checkElementVisible(step.target!));
            break;

          case 'element-enabled':
            conditionMet = await this.orchestrator.checkElementEnabled(step.target!);
            break;

          case 'element-disabled':
            conditionMet = !(await this.orchestrator.checkElementEnabled(step.target!));
            break;

          case 'element-text': {
            const textResult = await this.orchestrator.checkElementText(
              step.target!,
              step.options.expectedText!,
              step.options.textMatchMode ?? 'contains'
            );
            conditionMet = textResult.matches;
            data.elementText = textResult.actualText;
            break;
          }

          case 'element-attribute': {
            const attrResult = await this.orchestrator.checkElementAttribute(
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
            conditionMet = true;
            break;
        }

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

  /**
   * Delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create wait condition handler instance
 */
export function createWaitConditionHandler(
  orchestrator: BrowserOrchestrator
): WaitConditionHandler {
  return new WaitConditionHandler(orchestrator);
}
