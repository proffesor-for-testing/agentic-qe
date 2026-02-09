/**
 * Hooks Index
 *
 * Re-exports all hook executors and ADR-064 Agent Teams hooks.
 *
 * @module hooks
 */

export * from './cross-phase-hooks.js';

// ============================================================================
// ADR-064: Agent Teams Hooks
// ============================================================================

export { TeammateIdleHook, createTeammateIdleHook } from './teammate-idle-hook.js';
export type { TeammateIdleHookConfig, TaskQueue, PendingTask, TeammateIdleStats } from './teammate-idle-hook.js';

export { TaskCompletedHook, createTaskCompletedHook } from './task-completed-hook.js';
export type {
  TaskCompletedHookConfig, ExtractedPattern, PatternStore, CompletionAction, CompletionHandler,
  TaskResult, TaskMetrics, QualityGateConfig, QualityGateResult,
} from './task-completed-hook.js';

export { QualityGateEnforcer, createQualityGateEnforcer } from './quality-gate-enforcer.js';
export type { GateCheckResult } from './quality-gate-enforcer.js';

export { ReasoningBankPatternStore, createReasoningBankPatternStore } from './reasoning-bank-pattern-store.js';
