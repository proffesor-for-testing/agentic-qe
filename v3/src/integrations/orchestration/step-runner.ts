/**
 * Agentic QE v3 - Step Runner
 * Generic step runner that executes StepDef arrays in sequence.
 * Manages skip logic for Progressive Enhancement layers.
 */

import type {
  StepDef,
  StepResult,
  StepRunner,
  StepRunnerConfig,
  SuiteResult,
  BaseTestContext,
} from './types';

// ============================================================================
// Step Runner Implementation
// ============================================================================

class StepRunnerImpl<TContext extends BaseTestContext> implements StepRunner<TContext> {
  private steps: StepDef<TContext>[];
  private skipLayer2: boolean;
  private skipLayer3: boolean;
  private onStepComplete?: (stepId: string, result: StepResult) => void;
  private results: SuiteResult;

  constructor(config: StepRunnerConfig<TContext>) {
    this.steps = config.steps;
    this.skipLayer2 = config.skipLayer2Steps ?? false;
    this.skipLayer3 = config.skipLayer3Steps ?? false;
    this.onStepComplete = config.onStepComplete;
    this.results = {
      steps: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDurationMs: 0,
    };
  }

  async runStep(ctx: TContext, stepId: string): Promise<StepResult> {
    const step = this.steps.find((s) => s.id === stepId);
    if (!step) {
      return {
        success: false,
        error: `Step '${stepId}' not found`,
        durationMs: 0,
        checks: [],
      };
    }
    return this.executeStep(ctx, step);
  }

  async runFromStep(ctx: TContext, startStepId: string): Promise<SuiteResult> {
    const startIndex = this.steps.findIndex((s) => s.id === startStepId);
    if (startIndex === -1) {
      this.resetResults();
      const failResult: StepResult = {
        success: false,
        error: `Step '${startStepId}' not found in step definitions`,
        durationMs: 0,
        checks: [],
      };
      this.results.steps.push({ step: { id: startStepId, name: 'unknown', layer: 1 }, result: failResult });
      this.results.failed = 1;
      return this.getReport();
    }

    this.resetResults();
    const stepsToRun = this.steps.slice(startIndex);
    return this.runSteps(ctx, stepsToRun);
  }

  async runAll(ctx: TContext): Promise<SuiteResult> {
    this.resetResults();
    return this.runSteps(ctx, this.steps);
  }

  getReport(): SuiteResult {
    return { ...this.results };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private resetResults(): void {
    this.results = {
      steps: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalDurationMs: 0,
    };
  }

  private async runSteps(ctx: TContext, steps: StepDef<TContext>[]): Promise<SuiteResult> {
    const suiteStart = Date.now();

    for (const step of steps) {
      if (this.shouldSkip(step)) {
        const skippedResult: StepResult = {
          success: true,
          durationMs: 0,
          checks: [],
          data: { skipped: true, reason: this.skipReason(step) },
        };
        this.results.steps.push({
          step: { id: step.id, name: step.name, layer: step.layer },
          result: skippedResult,
        });
        this.results.skipped++;
        this.onStepComplete?.(step.id, skippedResult);
        continue;
      }

      const result = await this.executeStep(ctx, step);
      if (!result.success) {
        // Stop on first failure — caller can use runFromStep to resume
        break;
      }
    }

    this.results.totalDurationMs = Date.now() - suiteStart;
    return this.getReport();
  }

  private async executeStep(ctx: TContext, step: StepDef<TContext>): Promise<StepResult> {
    const start = Date.now();

    try {
      const result = await step.execute(ctx);
      result.durationMs = Date.now() - start;

      this.results.steps.push({
        step: { id: step.id, name: step.name, layer: step.layer },
        result,
      });

      if (result.success) {
        this.results.passed++;
      } else {
        this.results.failed++;
      }

      this.onStepComplete?.(step.id, result);
      return result;
    } catch (error) {
      const failResult: StepResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - start,
        checks: [],
      };

      this.results.steps.push({
        step: { id: step.id, name: step.name, layer: step.layer },
        result: failResult,
      });
      this.results.failed++;
      this.onStepComplete?.(step.id, failResult);
      return failResult;
    }
  }

  private shouldSkip(step: StepDef<TContext>): boolean {
    if (step.layer === 2 && this.skipLayer2) return true;
    if (step.layer === 3 && this.skipLayer3) return true;
    if (step.requires.iib && this.skipLayer2) return true;
    if (step.requires.nshift && this.skipLayer3) return true;
    return false;
  }

  private skipReason(step: StepDef<TContext>): string {
    if (step.layer === 2 && this.skipLayer2) return 'Layer 2 steps skipped (no IIB credentials)';
    if (step.layer === 3 && this.skipLayer3) return 'Layer 3 steps skipped (no NShift credentials)';
    if (step.requires.iib && this.skipLayer2) return 'Requires IIB provider (not available)';
    if (step.requires.nshift && this.skipLayer3) return 'Requires NShift client (not available)';
    return 'Unknown skip reason';
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a step runner configured with client-provided step definitions.
 * The runner is generic — it doesn't know what the steps do, only how to
 * sequence them, skip based on layer requirements, and report results.
 */
export function createStepRunner<TContext extends BaseTestContext>(
  config: StepRunnerConfig<TContext>
): StepRunner<TContext> {
  return new StepRunnerImpl<TContext>(config);
}
