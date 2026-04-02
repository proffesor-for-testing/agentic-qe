/**
 * Tests for exit-codes: HOOK_EXIT_CODES and classifyHookExit
 * @see IMP-07 Hook Security Hardening
 */

import { describe, it, expect } from 'vitest';
import {
  HOOK_EXIT_CODES,
  classifyHookExit,
  type HookExitCode,
} from '../../../src/hooks/security/exit-codes.js';

// =============================================================================
// HOOK_EXIT_CODES constants
// =============================================================================

describe('HOOK_EXIT_CODES', () => {
  it('SUCCESS is 0', () => {
    expect(HOOK_EXIT_CODES.SUCCESS).toBe(0);
  });

  it('USER_VISIBLE is 1', () => {
    expect(HOOK_EXIT_CODES.USER_VISIBLE).toBe(1);
  });

  it('MODEL_BLOCKING is 2', () => {
    expect(HOOK_EXIT_CODES.MODEL_BLOCKING).toBe(2);
  });

  it('constants are readonly (frozen via as const)', () => {
    // TypeScript enforces this at compile time via `as const`,
    // but verify the values are stable at runtime.
    const codes: Record<string, number> = { ...HOOK_EXIT_CODES };
    expect(codes).toEqual({ SUCCESS: 0, USER_VISIBLE: 1, MODEL_BLOCKING: 2 });
  });
});

// =============================================================================
// classifyHookExit
// =============================================================================

describe('classifyHookExit', () => {
  it('classifies exit code 0 as success', () => {
    expect(classifyHookExit(0)).toBe('success');
  });

  it('classifies exit code 1 as user_error', () => {
    expect(classifyHookExit(1)).toBe('user_error');
  });

  it('classifies exit code 2 as model_blocking', () => {
    expect(classifyHookExit(2)).toBe('model_blocking');
  });

  it.each([
    [3, 'user_error'],
    [126, 'user_error'],
    [127, 'user_error'],
    [137, 'user_error'],
    [255, 'user_error'],
    [-1, 'user_error'],
  ] as const)('classifies exit code %d as %s', (code, expected) => {
    expect(classifyHookExit(code)).toBe(expected);
  });

  it('type HookExitCode accepts only valid constant values', () => {
    // Runtime check that the type union matches the constants
    const validCodes: HookExitCode[] = [0, 1, 2];
    expect(validCodes).toHaveLength(3);
    expect(validCodes).toContain(HOOK_EXIT_CODES.SUCCESS);
    expect(validCodes).toContain(HOOK_EXIT_CODES.USER_VISIBLE);
    expect(validCodes).toContain(HOOK_EXIT_CODES.MODEL_BLOCKING);
  });
});
