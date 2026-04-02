/**
 * Hook Security Module
 *
 * Re-exports all security primitives for the hook system:
 * - Config snapshot (deep-freeze at startup)
 * - SSRF guard (private IP / DNS rebinding protection)
 * - Exit code semantics (success / user_error / model_blocking)
 *
 * @module hooks/security
 * @see IMP-07 Hook Security Hardening
 */

export { captureHooksConfigSnapshot, deepFreeze } from './config-snapshot.js';
export { validateHookUrl, isPrivateIp, type SsrfValidationResult } from './ssrf-guard.js';
export { HOOK_EXIT_CODES, classifyHookExit, type HookExitCode } from './exit-codes.js';
