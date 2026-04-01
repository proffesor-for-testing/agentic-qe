/**
 * Hook Exit Code Semantics
 *
 * Defines exit-code conventions for hook processes so the runtime
 * can distinguish success, user-visible errors, and model-blocking
 * failures that should halt agent execution.
 *
 * @module hooks/security/exit-codes
 * @see IMP-07 Hook Security Hardening
 */

export const HOOK_EXIT_CODES = {
  /** Hook completed successfully. */
  SUCCESS: 0,
  /** Hook failed with user-visible error (non-blocking). */
  USER_VISIBLE: 1,
  /** Hook failed and must block the model from proceeding. */
  MODEL_BLOCKING: 2,
} as const;

export type HookExitCode = typeof HOOK_EXIT_CODES[keyof typeof HOOK_EXIT_CODES];

/**
 * Classify a numeric process exit code into a semantic category.
 *
 * - 0  -> 'success'
 * - 2  -> 'model_blocking' (halts agent execution)
 * - anything else -> 'user_error' (logged, non-blocking)
 */
export function classifyHookExit(code: number): 'success' | 'user_error' | 'model_blocking' {
  if (code === 0) return 'success';
  if (code === 2) return 'model_blocking';
  return 'user_error';
}
