/**
 * Unit tests for withTimeout — the advisory-routing guard.
 *
 * Pattern search + model routing are optional hints in createDomainHandler, so a
 * slow/stuck learning-engine init must never block the tool. withTimeout bounds
 * that work and falls back. Defense-in-depth after the QEReasoningBank init
 * recursion that hung every MCP domain tool.
 */

import { describe, it, expect } from 'vitest';
import { withTimeout } from '../../../../src/mcp/handlers/handler-factory';

describe('withTimeout (advisory-routing guard)', () => {
  it('should resolve to the fallback when the promise exceeds the timeout', async () => {
    // Arrange: a promise that never settles within the budget
    const neverSettles = new Promise<string>(() => { /* hangs */ });

    // Act
    const result = await withTimeout(neverSettles, 20, 'FALLBACK');

    // Assert
    expect(result).toBe('FALLBACK');
  });

  it('should resolve to the real value when it settles in time', async () => {
    // Arrange
    const fast = Promise.resolve('REAL');

    // Act
    const result = await withTimeout(fast, 1000, 'FALLBACK');

    // Assert
    expect(result).toBe('REAL');
  });

  it('should fall back (not reject) when the promise rejects', async () => {
    // Arrange
    const rejects = Promise.reject(new Error('boom'));

    // Act
    const result = await withTimeout(rejects, 1000, 'FALLBACK');

    // Assert — a rejecting advisory step must not break the tool call
    expect(result).toBe('FALLBACK');
  });
});
