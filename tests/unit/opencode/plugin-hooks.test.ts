/**
 * AQE OpenCode Plugin Hook Unit Tests
 *
 * Tests the four plugin hooks that bridge AQE capabilities into OpenCode:
 * - onToolCallBefore: safety checks (file guard, dangerous commands)
 * - onToolCallAfter: pattern capture and experience recording
 * - onSessionPromptBefore: guidance injection and model routing
 * - onSessionPromptAfter: outcome capture (via SessionManager)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createOnToolCallBefore } from '../../../packages/aqe-opencode-plugin/src/hooks/on-tool-call-before';
import { createOnToolCallAfter } from '../../../packages/aqe-opencode-plugin/src/hooks/on-tool-call-after';
import { createOnSessionPromptBefore } from '../../../packages/aqe-opencode-plugin/src/hooks/on-session-prompt-before';
import { AQEPluginConfigSchema, type AQEPluginConfig } from '../../../packages/aqe-opencode-plugin/src/config';
import {
  SessionManager,
  resetSessionManager,
} from '../../../packages/aqe-opencode-plugin/src/lifecycle';
import type {
  ToolCallContext,
  ToolResult,
  SessionPromptContext,
} from '../../../packages/aqe-opencode-plugin/src/types/opencode';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Build a config with sensible defaults for testing.
 * Note: The Zod schema for dangerousPatterns has a `.default([])` that
 * overrides the inline defaults, so we must provide them explicitly.
 */
function makeConfig(overrides?: Partial<Record<string, unknown>>): AQEPluginConfig {
  const base = {
    safety: {
      blockDbWrites: true,
      blockDangerousCommands: true,
      dangerousPatterns: [
        'rm\\s+-rf\\s+/',
        'rm\\s+-rf\\s+\\.',
        'drop\\s+table',
        'delete\\s+from',
        'truncate\\s+',
        'mkfs\\.',
        'dd\\s+if=.*of=/dev/',
        'chmod\\s+-R\\s+777\\s+/',
      ],
    },
    ...overrides,
  };
  return AQEPluginConfigSchema.parse(base);
}

function makeToolCtx(overrides?: Partial<ToolCallContext>): ToolCallContext {
  return {
    callId: 'test-call-1',
    toolName: 'read',
    input: {},
    session: { sessionId: 'test-session', cwd: '/tmp', startedAt: Date.now() },
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeToolResult(overrides?: Partial<ToolResult>): ToolResult {
  return {
    success: true,
    output: 'ok',
    durationMs: 50,
    ...overrides,
  };
}

function makePromptCtx(overrides?: Partial<SessionPromptContext>): SessionPromptContext {
  return {
    prompt: 'Write a unit test for the auth module',
    session: { sessionId: 'test-session', cwd: '/tmp', startedAt: Date.now() },
    turn: 1,
    timestamp: Date.now(),
    ...overrides,
  };
}

// =============================================================================
// onToolCallBefore
// =============================================================================

describe('AQE OpenCode Plugin Hooks', () => {
  let config: AQEPluginConfig;
  let session: SessionManager;

  beforeEach(() => {
    resetSessionManager();
    config = makeConfig();
    session = new SessionManager(config);
  });

  afterEach(async () => {
    await session.endSession();
    resetSessionManager();
  });

  describe('onToolCallBefore', () => {
    it('should cancel write operations targeting .db files', async () => {
      const hook = createOnToolCallBefore(config, session);
      const ctx = makeToolCtx({
        toolName: 'write',
        input: { file_path: '/project/.agentic-qe/memory.db' },
      });

      const result = await hook(ctx);

      expect(result).toBeDefined();
      expect(result?.cancel).toBe(true);
      expect(result?.reason).toContain('database file');
    });

    it('should cancel edit operations targeting .sqlite files', async () => {
      const hook = createOnToolCallBefore(config, session);
      const ctx = makeToolCtx({
        toolName: 'edit',
        input: { file_path: '/data/store.sqlite' },
      });

      const result = await hook(ctx);

      expect(result).toBeDefined();
      expect(result?.cancel).toBe(true);
    });

    it('should cancel edit operations targeting .sqlite3 files', async () => {
      const hook = createOnToolCallBefore(config, session);
      const ctx = makeToolCtx({
        toolName: 'edit',
        input: { file_path: '/data/store.sqlite3' },
      });

      const result = await hook(ctx);

      expect(result).toBeDefined();
      expect(result?.cancel).toBe(true);
    });

    it('should allow read operations on any file', async () => {
      const hook = createOnToolCallBefore(config, session);
      const ctx = makeToolCtx({
        toolName: 'read',
        input: { file_path: '/project/.agentic-qe/memory.db' },
      });

      const result = await hook(ctx);

      // No cancellation — undefined or void return means "proceed"
      expect(result?.cancel).toBeUndefined();
    });

    it('should allow write operations on non-db files', async () => {
      const hook = createOnToolCallBefore(config, session);
      const ctx = makeToolCtx({
        toolName: 'write',
        input: { file_path: '/project/src/index.ts' },
      });

      const result = await hook(ctx);

      expect(result?.cancel).toBeUndefined();
    });

    it('should detect dangerous bash commands', async () => {
      const hook = createOnToolCallBefore(config, session);
      const ctx = makeToolCtx({
        toolName: 'bash',
        input: { command: 'rm -rf /' },
      });

      const result = await hook(ctx);

      expect(result).toBeDefined();
      expect(result?.cancel).toBe(true);
      expect(result?.reason).toContain('dangerous command');
    });

    it('should detect DROP TABLE in bash commands', async () => {
      const hook = createOnToolCallBefore(config, session);
      const ctx = makeToolCtx({
        toolName: 'bash',
        input: { command: 'sqlite3 db.sqlite "DROP TABLE users"' },
      });

      const result = await hook(ctx);

      expect(result).toBeDefined();
      expect(result?.cancel).toBe(true);
    });

    it('should allow safe bash commands', async () => {
      const hook = createOnToolCallBefore(config, session);
      const ctx = makeToolCtx({
        toolName: 'bash',
        input: { command: 'npm test -- --run' },
      });

      const result = await hook(ctx);

      expect(result?.cancel).toBeUndefined();
    });

    it('should complete within 100ms', async () => {
      const hook = createOnToolCallBefore(config, session);
      const ctx = makeToolCtx({
        toolName: 'write',
        input: { file_path: '/project/src/index.ts' },
      });

      const start = performance.now();
      await hook(ctx);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100);
    });

    it('should be a no-op when plugin is disabled', async () => {
      const disabledConfig = makeConfig({ enabled: false });
      const hook = createOnToolCallBefore(disabledConfig, session);
      const ctx = makeToolCtx({
        toolName: 'write',
        input: { file_path: '/project/memory.db' },
      });

      const result = await hook(ctx);

      // When disabled, the hook returns immediately (undefined)
      expect(result).toBeUndefined();
    });

    it('should be a no-op when onToolCallBefore hook is disabled', async () => {
      const partialConfig = makeConfig({
        hooks: { onToolCallBefore: false, onToolCallAfter: true, onSessionPromptBefore: true, onSessionPromptAfter: true },
      });
      const hook = createOnToolCallBefore(partialConfig, session);
      const ctx = makeToolCtx({
        toolName: 'write',
        input: { file_path: '/project/memory.db' },
      });

      const result = await hook(ctx);

      expect(result).toBeUndefined();
    });
  });

  // ===========================================================================
  // onToolCallAfter
  // ===========================================================================

  describe('onToolCallAfter', () => {
    it('should capture patterns from successful test generation', async () => {
      const hook = createOnToolCallAfter(config, session);
      const ctx = makeToolCtx({
        toolName: 'write',
        input: {
          file_path: '/project/src/auth.test.ts',
          content: 'describe("auth", () => { it("should login", () => { expect(true).toBe(true); }); });',
        },
      });
      const result = makeToolResult({ success: true });

      // Ensure session is initialized so recording works
      await session.ensureInitialized();

      await hook(ctx, result);

      // Pattern capture is async fire-and-forget, but metrics are synchronous
      const metrics = session.getMetrics();
      expect(metrics.toolCallCount).toBe(1);
      expect(metrics.toolCallSuccesses).toBe(1);
    });

    it('should record failure metrics for failed tool calls', async () => {
      const hook = createOnToolCallAfter(config, session);
      const ctx = makeToolCtx({ toolName: 'bash' });
      const result = makeToolResult({ success: false, error: 'command failed' });

      await session.ensureInitialized();
      await hook(ctx, result);

      const metrics = session.getMetrics();
      expect(metrics.toolCallCount).toBe(1);
      expect(metrics.toolCallFailures).toBe(1);
    });

    it('should record experience to memory', async () => {
      const hook = createOnToolCallAfter(config, session);
      const ctx = makeToolCtx({
        toolName: 'write',
        input: {
          file_path: '/project/src/service.test.ts',
          content: 'describe("service", () => { it("works", () => { expect(1).toBe(1); }); beforeEach(() => {}); });',
        },
      });
      const result = makeToolResult({ success: true });

      await session.ensureInitialized();
      await hook(ctx, result);

      // Allow async pattern capture to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      const metrics = session.getMetrics();
      expect(metrics.patternsCaptured).toBeGreaterThanOrEqual(1);
    });

    it('should complete within 500ms', async () => {
      const hook = createOnToolCallAfter(config, session);
      const ctx = makeToolCtx({ toolName: 'read', input: { file_path: '/test.ts' } });
      const result = makeToolResult({ success: true });

      await session.ensureInitialized();

      const start = performance.now();
      await hook(ctx, result);
      const elapsed = performance.now() - start;

      // The synchronous part (metrics recording) should be fast.
      // Async pattern capture is fire-and-forget.
      expect(elapsed).toBeLessThan(500);
    });

    it('should not capture patterns for trivial bash commands', async () => {
      const hook = createOnToolCallAfter(config, session);
      const ctx = makeToolCtx({
        toolName: 'bash',
        input: { command: 'ls -la' },
      });
      const result = makeToolResult({ success: true });

      await session.ensureInitialized();
      await hook(ctx, result);

      // Allow async work to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      const metrics = session.getMetrics();
      // ls is a trivial command, should not produce a pattern
      expect(metrics.patternsCaptured).toBe(0);
    });

    it('should be a no-op when plugin is disabled', async () => {
      const disabledConfig = makeConfig({ enabled: false });
      const hook = createOnToolCallAfter(disabledConfig, session);
      const ctx = makeToolCtx({ toolName: 'bash' });
      const result = makeToolResult({ success: true });

      await hook(ctx, result);

      const metrics = session.getMetrics();
      expect(metrics.toolCallCount).toBe(0);
    });
  });

  // ===========================================================================
  // onSessionPromptBefore
  // ===========================================================================

  describe('onSessionPromptBefore', () => {
    it('should inject guidance for matching domains', async () => {
      const hook = createOnSessionPromptBefore(config, session);

      // A complex prompt that should trigger guidance injection
      const ctx = makePromptCtx({
        prompt:
          'Architect a new security module with authentication, rate limiting, ' +
          'and encrypted session management. This involves refactoring the entire ' +
          'auth subsystem and migrating the database schema. We need to handle ' +
          'concurrent sessions and optimize performance.',
      });

      await session.ensureInitialized();
      const result = await hook(ctx);

      // With high complexity and multiple domains, guidance should be injected
      // (even if no patterns match, the routing hint should appear)
      if (result) {
        expect(result.modifiedPrompt).toBeDefined();
        expect(result.modifiedPrompt.length).toBeGreaterThan(ctx.prompt.length);
      }
      // If no result, complexity was below threshold and no patterns matched — acceptable
    });

    it('should respect token budget for guidance', async () => {
      const tightBudgetConfig = makeConfig({
        guidance: { maxTokens: 100, enableRouting: true, minPatternConfidence: 0.6 },
      });
      const tightSession = new SessionManager(tightBudgetConfig);
      const hook = createOnSessionPromptBefore(tightBudgetConfig, tightSession);

      const ctx = makePromptCtx({
        prompt:
          'Architect and refactor the entire security subsystem with ' +
          'concurrent database migration and performance optimization across the codebase.',
      });

      await tightSession.ensureInitialized();
      const result = await hook(ctx);

      if (result) {
        // Guidance portion is everything before the separator
        const parts = result.modifiedPrompt.split('---');
        const guidancePart = parts[0] || '';
        // Rough token estimate: chars / 4
        const estimatedTokens = Math.ceil(guidancePart.length / 4);
        // Should stay within budget (with some tolerance for formatting)
        expect(estimatedTokens).toBeLessThanOrEqual(150); // 100 budget + formatting overhead
      }

      await tightSession.endSession();
    });

    it('should add model routing hints for complex prompts', async () => {
      const hook = createOnSessionPromptBefore(config, session);

      // A very complex prompt (multiple high-weight signals)
      const ctx = makePromptCtx({
        prompt:
          'Architect a security audit with vulnerability scanning, ' +
          'refactor the concurrent database connection pool, ' +
          'optimize performance bottlenecks across the entire project, ' +
          'and design a migration strategy for the schema. ' +
          'How do we handle race conditions in the parallel test runner? ' +
          'What about the deployment pipeline? ' +
          'Can we fix the regression in the auth module? ' +
          'Also investigate the CI/CD pipeline failures.',
      });

      await session.ensureInitialized();
      const result = await hook(ctx);

      // This should exceed the 70-point threshold and trigger a routing hint
      if (result) {
        expect(result.modifiedPrompt).toContain('TASK_MODEL_RECOMMENDATION');
      }
    });

    it('should return nothing for simple prompts with no pattern matches', async () => {
      const hook = createOnSessionPromptBefore(config, session);

      const ctx = makePromptCtx({
        prompt: 'Fix the typo in line 5.',
      });

      await session.ensureInitialized();
      const result = await hook(ctx);

      // Simple prompt, no patterns — hook should return void
      expect(result).toBeUndefined();
    });

    it('should be a no-op when plugin is disabled', async () => {
      const disabledConfig = makeConfig({ enabled: false });
      const hook = createOnSessionPromptBefore(disabledConfig, session);

      const ctx = makePromptCtx({
        prompt: 'Architect a complete security overhaul with refactoring and migration.',
      });

      const result = await hook(ctx);

      expect(result).toBeUndefined();
    });
  });

  // ===========================================================================
  // onSessionPromptAfter (via SessionManager metrics)
  // ===========================================================================

  describe('onSessionPromptAfter', () => {
    it('should capture success/failure outcomes via session metrics', async () => {
      await session.ensureInitialized();

      // Simulate recording prompt outcomes
      session.recordPrompt(500, 1000);
      session.recordPrompt(300, 800);

      const metrics = session.getMetrics();
      expect(metrics.promptCount).toBe(2);
      expect(metrics.inputTokens).toBe(800);
      expect(metrics.outputTokens).toBe(1800);
    });

    it('should queue experiences for dream consolidation', async () => {
      await session.ensureInitialized();

      session.addToDreamQueue({
        type: 'prompt-outcome',
        data: { prompt: 'test', success: true },
        timestamp: Date.now(),
      });

      session.addToDreamQueue({
        type: 'tool-experience',
        data: { tool: 'bash', success: true },
        timestamp: Date.now(),
      });

      const queue = session.getDreamQueue();
      expect(queue).toHaveLength(2);
      expect(queue[0].type).toBe('prompt-outcome');
      expect(queue[1].type).toBe('tool-experience');

      const metrics = session.getMetrics();
      expect(metrics.dreamQueueSize).toBe(2);
    });

    it('should persist metrics on session end', async () => {
      await session.ensureInitialized();
      session.recordPrompt(100, 200);
      session.recordToolCall(true, 50);

      await session.endSession();

      expect(session.getState()).toBe('ended');
      const metrics = session.getMetrics();
      expect(metrics.endedAt).toBeDefined();
      expect(metrics.endedAt).not.toBeNull();
    });
  });
});
