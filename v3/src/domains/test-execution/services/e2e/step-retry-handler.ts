/**
 * Agentic QE v3 - Step Retry Handler
 *
 * Handles retry logic for individual E2E test steps.
 * Provides timeout wrapping and retry orchestration.
 *
 * @module test-execution/services/e2e/step-retry-handler
 */

import type { E2EStep, E2EStepResult } from '../../types';
import type { StepExecutionContext, StepExecutionData, E2ERunnerConfig } from './types';
import { E2ERunnerError, StepTimeoutError } from './types';
import { safeEvaluateBoolean } from '../../../../shared/utils/safe-expression-evaluator.js';
import { StepExecutors } from './step-executors';

// ============================================================================
// Step Retry Handler Class
// ============================================================================

/**
 * Step Retry Handler
 *
 * Orchestrates step execution with retry logic, timeout handling,
 * and conditional execution evaluation.
 */
export class StepRetryHandler {
  private readonly config: E2ERunnerConfig;
  private readonly stepExecutors: StepExecutors;
  private readonly log: (message: string) => void;

  constructor(
    config: E2ERunnerConfig,
    stepExecutors: StepExecutors,
    logger: (message: string) => void
  ) {
    this.config = config;
    this.stepExecutors = stepExecutors;
    this.log = logger;
  }

  /**
   * Execute a step with retry logic
   */
  async executeStepWithRetry(
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
        const result = await this.withTimeout(
          this.executeStepInternal(step, context),
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
   * Execute step with conditional check
   */
  private async executeStepInternal(
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

    return this.stepExecutors.executeStep(step, context);
  }

  /**
   * Evaluate conditional expression
   * Uses safe expression evaluator to prevent code injection (CVE fix)
   */
  private evaluateCondition(condition: string, context: StepExecutionContext): boolean {
    const evalContext: Record<string, unknown> = {
      ...context.variables,
    };

    return safeEvaluateBoolean(condition, evalContext, true);
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
}

/**
 * Create step retry handler instance
 */
export function createStepRetryHandler(
  config: E2ERunnerConfig,
  stepExecutors: StepExecutors,
  logger: (message: string) => void
): StepRetryHandler {
  return new StepRetryHandler(config, stepExecutors, logger);
}
