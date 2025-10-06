/**
 * Hooks System - Context Engineering & Verification Hooks
 *
 * Provides 5-stage verification hooks with context engineering:
 * - PreToolUse: Build small context bundles with top-N artifacts, hints, patterns, and workflow state
 * - PostToolUse: Persist outcomes to multiple memory tables with appropriate TTLs
 * - 5-Stage Verification: Pre-task, post-task, pre-edit, post-edit, session-end hooks
 * - Real Implementations: Checkers, validators, and rollback manager
 */

export { VerificationHookManager } from './VerificationHookManager';
export { RollbackManager } from './RollbackManager';

// Re-export checkers and validators
export * from './checkers';
export * from './validators';

// Re-export types for convenience
export type {
  PreToolUseBundle,
  PostToolUsePersistence,
  VerificationResult,
  ValidationResult,
  EditVerificationResult,
  EditUpdateResult,
  SessionFinalizationResult
} from './VerificationHookManager';

export type {
  Snapshot,
  SnapshotOptions,
  RollbackTriggerOptions,
  RollbackResult,
  CleanupOptions
} from './RollbackManager';
