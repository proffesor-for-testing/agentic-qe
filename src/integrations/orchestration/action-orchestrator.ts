/**
 * Agentic QE v3 - Action Orchestrator
 * Sequences lifecycle stages: Act → Poll → Verify for E2E test automation.
 * Generic over context type — clients provide stage definitions with their actions.
 *
 * This is the "driver" that replaces the manual tester:
 *   1. Triggers actions via API (create order, confirm shipment, etc.)
 *   2. Polls until the system reaches expected state
 *   3. Runs cross-system verification checks
 *   4. Advances to the next lifecycle stage
 *
 * Graceful degradation: if an action is unavailable (no write API access),
 * stages fall back per their `fallback` config (skip, manual, or fail).
 *
 * Key semantics for act-undefined stages:
 *   - If poll IS defined → skip act, proceed to poll → verify (poll-only stages)
 *   - If poll is also undefined → apply fallback (skip/manual/fail)
 */

import type { BaseTestContext } from './base-context';
import type { StepDef, StepResult } from './types';
import type {
  ActionOrchestrator,
  ActionOrchestratorConfig,
  ActionResult,
  LifecycleStage,
  RunResult,
  StageResult,
} from './action-types';
import { shouldSkipStep, skipReason } from './skip-logic';

// ============================================================================
// Helpers: ActionResult builders
// ============================================================================

function skippedAction(reason: string): ActionResult {
  return { success: true, durationMs: 0, data: { actionStatus: 'skipped', reason } };
}

function manualAction(reason: string): ActionResult {
  return { success: true, durationMs: 0, data: { actionStatus: 'manual', reason } };
}

function skippedPoll(): ActionResult {
  return { success: true, durationMs: 0, data: { actionStatus: 'skipped' } };
}

// ============================================================================
// Action Orchestrator Implementation
// ============================================================================

class ActionOrchestratorImpl<TContext extends BaseTestContext> implements ActionOrchestrator<TContext> {
  private stages: LifecycleStage<TContext>[];
  private verificationSteps: StepDef<TContext>[];
  private skipLayer2: boolean;
  private skipLayer3: boolean;
  private onStageStart?: (stageId: string, stageName: string, stageDescription: string, index: number, total: number) => void;
  private onStageComplete?: (stageId: string, result: StageResult) => void;
  private onStageFailed?: (stageId: string, result: StageResult, ctx: TContext) => Promise<'retry' | 'continue' | 'abort'>;
  private onManualAction?: (stage: LifecycleStage<TContext>) => Promise<void>;
  private continueOnVerifyFailure: boolean;
  private maxStageRetries: number;
  private results: RunResult;

  constructor(config: ActionOrchestratorConfig<TContext>) {
    this.stages = config.stages;
    this.verificationSteps = config.verificationSteps;
    this.skipLayer2 = config.skipLayer2 ?? false;
    this.skipLayer3 = config.skipLayer3 ?? false;
    this.onStageStart = config.onStageStart;
    this.onStageComplete = config.onStageComplete;
    this.onStageFailed = config.onStageFailed;
    this.onManualAction = config.onManualAction;
    this.continueOnVerifyFailure = config.continueOnVerifyFailure ?? false;
    this.maxStageRetries = config.maxStageRetries ?? 1;
    this.results = this.emptyResult();
  }

  async runAll(ctx: TContext): Promise<RunResult> {
    this.results = this.emptyResult();
    return this.runStages(ctx, this.stages);
  }

  async runFromStage(ctx: TContext, stageId: string): Promise<RunResult> {
    const startIndex = this.stages.findIndex((s) => s.id === stageId);
    if (startIndex === -1) {
      this.results = this.emptyResult();
      const failStage = this.failedStageResult(stageId, 'unknown', `Stage '${stageId}' not found`);
      this.results.stages.push(failStage);
      this.results.failed = 1;
      this.results.overallSuccess = false;
      return this.getReport();
    }

    this.results = this.emptyResult();
    return this.runStages(ctx, this.stages.slice(startIndex));
  }

  async runStage(ctx: TContext, stageId: string): Promise<StageResult> {
    const stage = this.stages.find((s) => s.id === stageId);
    if (!stage) {
      return this.failedStageResult(stageId, 'unknown', `Stage '${stageId}' not found`);
    }
    return this.executeStage(ctx, stage);
  }

  getReport(): RunResult {
    return { ...this.results };
  }

  // ============================================================================
  // Private: Run stages in sequence
  // ============================================================================

  private async runStages(ctx: TContext, stages: LifecycleStage<TContext>[]): Promise<RunResult> {
    const runStart = Date.now();

    const totalStages = this.stages.length;
    for (const stage of stages) {
      const stageIndex = this.stages.indexOf(stage);
      this.onStageStart?.(stage.id, stage.name, stage.description, stageIndex, totalStages);

      let stageResult = await this.executeStage(ctx, stage);
      let retries = 0;

      // Self-healing loop: if stage fails and handler says 'retry', re-execute
      while (!stageResult.overallSuccess && this.onStageFailed && retries < this.maxStageRetries) {
        const decision = await this.onStageFailed(stage.id, stageResult, ctx);

        if (decision === 'retry') {
          retries++;
          stageResult = await this.executeStage(ctx, stage);
        } else if (decision === 'continue') {
          break;
        } else {
          // 'abort'
          this.results.stages.push(stageResult);
          this.results.totalChecks += stageResult.verification.passed + stageResult.verification.failed;
          this.results.failed++;
          this.results.totalDurationMs = Date.now() - runStart;
          this.results.overallSuccess = false;
          return this.getReport();
        }
      }

      this.results.stages.push(stageResult);
      this.results.totalChecks += stageResult.verification.passed + stageResult.verification.failed;

      // A stage is SKIPPED when all its verification steps were skipped (no real checks ran)
      const isStageSkipped = stageResult.overallSuccess &&
        stageResult.verification.skipped > 0 &&
        stageResult.verification.passed === 0 &&
        stageResult.verification.failed === 0;

      if (isStageSkipped) {
        this.results.skipped++;
      } else if (stageResult.overallSuccess) {
        this.results.passed++;
      } else {
        this.results.failed++;
        if (!this.continueOnVerifyFailure) {
          break;
        }
      }

      this.onStageComplete?.(stage.id, stageResult);
    }

    this.results.totalDurationMs = Date.now() - runStart;
    this.results.overallSuccess = this.results.failed === 0;
    return this.getReport();
  }

  // ============================================================================
  // Private: Execute a single stage (Act → Poll → Verify)
  // ============================================================================

  private async executeStage(ctx: TContext, stage: LifecycleStage<TContext>): Promise<StageResult> {
    const stageStart = Date.now();

    // --- ACT ---
    let actionResult: ActionResult;

    if (stage.act) {
      // Action function exists — execute it
      try {
        actionResult = await stage.act(ctx);

        if (actionResult.success && actionResult.data && !actionResult.data.actionStatus) {
          Object.assign(ctx, actionResult.data);
        }

        if (!actionResult.success) {
          return this.buildStageResult(stage, stageStart, actionResult, null, null);
        }
      } catch (error) {
        actionResult = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - stageStart,
        };
        return this.buildStageResult(stage, stageStart, actionResult, null, null);
      }
    } else if (stage.poll) {
      // No action but has poll — this is a poll-only stage (e.g., "wait for delivery").
      // Skip the action, proceed directly to poll → verify.
      actionResult = skippedAction(`No action defined — proceeding to poll`);
    } else {
      // No action AND no poll — apply fallback for verify-only or optional stages
      switch (stage.fallback) {
        case 'skip':
          actionResult = skippedAction('No action or poll — skipped');
          // For 'skip' with no poll and no verify, skip the whole stage
          if (stage.verifyStepIds.length === 0) {
            return this.buildStageResult(stage, stageStart, actionResult, skippedPoll(), null);
          }
          // Has verify steps — proceed to run them
          break;

        case 'manual':
          if (this.onManualAction) {
            await this.onManualAction(stage);
          }
          actionResult = manualAction(`Manual action: ${stage.name}`);
          break;

        case 'fail':
          return this.failedStageResult(stage.id, stage.name, `Action not available and fallback is 'fail'`);
      }
    }

    // --- POLL ---
    let pollResult: ActionResult;

    if (stage.poll) {
      try {
        pollResult = await stage.poll(ctx);

        if (pollResult.success && pollResult.data && !pollResult.data.actionStatus) {
          Object.assign(ctx, pollResult.data);
        }

        if (!pollResult.success) {
          return this.buildStageResult(stage, stageStart, actionResult, pollResult, null);
        }
      } catch (error) {
        pollResult = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - stageStart,
        };
        return this.buildStageResult(stage, stageStart, actionResult, pollResult, null);
      }
    } else {
      pollResult = skippedPoll();
    }

    // --- VERIFY ---
    const verification = await this.runVerificationSteps(ctx, stage.verifyStepIds);

    return this.buildStageResult(stage, stageStart, actionResult, pollResult, verification);
  }

  // ============================================================================
  // Private: Run verification steps for a stage
  // ============================================================================

  private async runVerificationSteps(
    ctx: TContext,
    stepIds: string[]
  ): Promise<StageResult['verification']> {
    const result: StageResult['verification'] = {
      steps: [],
      passed: 0,
      failed: 0,
      skipped: 0,
    };

    for (const stepId of stepIds) {
      const step = this.verificationSteps.find((s) => s.id === stepId);

      if (!step) {
        result.steps.push({
          stepId,
          result: { success: false, error: `Step '${stepId}' not found`, durationMs: 0, checks: [] },
        });
        result.failed++;
        continue;
      }

      const skipConfig = { skipLayer2: this.skipLayer2, skipLayer3: this.skipLayer3 };
      if (shouldSkipStep(step, skipConfig)) {
        result.steps.push({
          stepId,
          result: { success: true, durationMs: 0, checks: [], data: { skipped: true, skipReason: skipReason(step, skipConfig) } },
        });
        result.skipped++;
        continue;
      }

      try {
        const stepResult = await step.execute(ctx);
        result.steps.push({ stepId, result: stepResult });

        if (stepResult.success) {
          result.passed++;
        } else {
          result.failed++;
        }
      } catch (error) {
        result.steps.push({
          stepId,
          result: {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: 0,
            checks: [],
          },
        });
        result.failed++;
      }
    }

    return result;
  }

  // ============================================================================
  // Private: Result builders
  // ============================================================================

  private buildStageResult(
    stage: LifecycleStage<TContext>,
    stageStart: number,
    action: ActionResult,
    poll: ActionResult | null,
    verification: StageResult['verification'] | null
  ): StageResult {
    const verifyResult = verification ?? { steps: [], passed: 0, failed: 0, skipped: 0 };
    const actionOk = action.success;
    const pollOk = poll ? poll.success : true;
    const verifyOk = verifyResult.failed === 0;

    return {
      stageId: stage.id,
      stageName: stage.name,
      action,
      poll: poll ?? skippedPoll(),
      verification: verifyResult,
      overallSuccess: actionOk && pollOk && verifyOk,
      durationMs: Date.now() - stageStart,
    };
  }

  private failedStageResult(stageId: string, stageName: string, error: string): StageResult {
    return {
      stageId,
      stageName,
      action: { success: false, error, durationMs: 0 },
      poll: skippedPoll(),
      verification: { steps: [], passed: 0, failed: 0, skipped: 0 },
      overallSuccess: false,
      durationMs: 0,
    };
  }

  private emptyResult(): RunResult {
    return {
      stages: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalChecks: 0,
      totalDurationMs: 0,
      overallSuccess: true,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an action orchestrator configured with lifecycle stages.
 * The orchestrator sequences: Act → Poll → Verify for each stage,
 * with graceful degradation when actions are unavailable.
 */
export function createActionOrchestrator<TContext extends BaseTestContext>(
  config: ActionOrchestratorConfig<TContext>
): ActionOrchestrator<TContext> {
  return new ActionOrchestratorImpl<TContext>(config);
}
