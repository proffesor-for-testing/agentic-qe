/**
 * Agentic QE v3 - Action Orchestrator Types
 * Defines the Act → Poll → Verify lifecycle pattern.
 * Generic over context type so clients wire their own actions.
 */

import type { BaseTestContext } from './base-context';
import type { StepResult, StepDef } from './types';

// ============================================================================
// Lifecycle Stage
// ============================================================================

/**
 * A single stage in an order lifecycle. Each stage:
 *   1. act()    — perform an action (e.g., createOrder, confirmShipment)
 *   2. poll()   — wait for the system to reach expected state
 *   3. verify() — run verification steps against all relevant adapters
 *
 * If `act` is undefined, the stage is verify-only (useful when an external
 * system triggers the transition, or the action requires manual intervention).
 */
export interface LifecycleStage<TContext extends BaseTestContext = BaseTestContext> {
  id: string;
  name: string;
  description: string;

  /** Perform the triggering action. Returns data to merge into context. */
  act?: (ctx: TContext) => Promise<ActionResult>;

  /** Poll until the system reaches the expected state after the action. */
  poll?: (ctx: TContext) => Promise<ActionResult>;

  /** Step IDs to run as verification after this stage completes. */
  verifyStepIds: string[];

  /**
   * What happens when act() is not defined AND there is no poll:
   * - 'skip'   → skip entirely (no poll, no verify) — use for truly optional stages
   * - 'manual' → pause for manual action, then continue to verify
   * - 'fail'   → fail the run
   *
   * When act() is not defined but poll IS defined, the orchestrator always
   * proceeds to poll → verify regardless of fallback (poll-only stages like
   * "wait for delivery" need their poll to run).
   */
  fallback: 'skip' | 'manual' | 'fail';
}

// ============================================================================
// Action Result
// ============================================================================

export interface ActionResult {
  success: boolean;
  error?: string;
  /** Data to merge into the test context (e.g., { orderId: 'ORD-123' }) */
  data?: Record<string, unknown>;
  durationMs: number;
}

// ============================================================================
// Orchestrator Configuration
// ============================================================================

export interface ActionOrchestratorConfig<TContext extends BaseTestContext = BaseTestContext> {
  /** The lifecycle stages to execute in order */
  stages: LifecycleStage<TContext>[];

  /** All verification step definitions (the orchestrator picks by ID per stage) */
  verificationSteps: StepDef<TContext>[];

  /** Skip Layer 2 verification steps */
  skipLayer2?: boolean;

  /** Skip Layer 3 verification steps */
  skipLayer3?: boolean;

  /** Called after each stage completes */
  onStageComplete?: (stageId: string, result: StageResult) => void;

  /** Called when a stage requires manual intervention (fallback: 'manual') */
  onManualAction?: (stage: LifecycleStage<TContext>) => Promise<void>;

  /** Continue running verification on remaining stages even when a stage fails */
  continueOnVerifyFailure?: boolean;
}

// ============================================================================
// Stage Result
// ============================================================================

export interface StageResult {
  stageId: string;
  stageName: string;
  /** Action phase result. Check data.actionStatus for 'executed' | 'skipped' | 'manual'. */
  action: ActionResult;
  /** Poll phase result. Check data.actionStatus for 'executed' | 'skipped'. */
  poll: ActionResult;
  verification: {
    steps: Array<{ stepId: string; result: StepResult }>;
    passed: number;
    failed: number;
    skipped: number;
  };
  overallSuccess: boolean;
  durationMs: number;
}

// ============================================================================
// Run Result
// ============================================================================

export interface RunResult {
  stages: StageResult[];
  passed: number;
  failed: number;
  totalChecks: number;
  totalDurationMs: number;
  overallSuccess: boolean;
}

// ============================================================================
// Action Orchestrator Interface
// ============================================================================

export interface ActionOrchestrator<TContext extends BaseTestContext = BaseTestContext> {
  /** Run all stages in sequence */
  runAll(ctx: TContext): Promise<RunResult>;

  /** Run from a specific stage (resume after failure) */
  runFromStage(ctx: TContext, stageId: string): Promise<RunResult>;

  /** Run a single stage */
  runStage(ctx: TContext, stageId: string): Promise<StageResult>;

  /** Get the current result report */
  getReport(): RunResult;
}
