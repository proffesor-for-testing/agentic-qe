/**
 * MultiModelExecutor Tests (ADR-092 Phase 0)
 *
 * Verifies the advisor consultation path end-to-end against a mock HybridRouter.
 * Real HybridRouter integration is exercised by the `aqe llm advise` CLI
 * smoke test, not here.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MultiModelExecutor, DEFAULT_ADVISOR_MODEL, DEFAULT_ADVISOR_PROVIDER } from '../../../src/routing/advisor/multi-model-executor.js';
import type { HybridRouter } from '../../../src/shared/llm/router/hybrid-router.js';
import type { ChatParams, ChatResponse } from '../../../src/shared/llm/router/types.js';

/**
 * Minimal mock HybridRouter for isolated unit testing.
 * Returns a deterministic ChatResponse and records params for assertions.
 */
function createMockRouter(overrides: Partial<ChatResponse> = {}): {
  router: HybridRouter;
  lastParams: { params?: ChatParams };
} {
  const lastParams: { params?: ChatParams } = {};
  const router = {
    chat: vi.fn(async (params: ChatParams): Promise<ChatResponse> => {
      lastParams.params = params;
      return {
        content: '1. Read auth.ts first.\n2. Write a failing test for the JWT path.\n3. Implement minimal fix.',
        model: DEFAULT_ADVISOR_MODEL,
        providerModelId: DEFAULT_ADVISOR_MODEL,
        provider: DEFAULT_ADVISOR_PROVIDER,
        usage: {
          promptTokens: 420,
          completionTokens: 28,
          totalTokens: 448,
        },
        cost: {
          inputCost: 0.001,
          outputCost: 0.0002,
          totalCost: 0.0012,
          currency: 'USD',
        },
        latencyMs: 1830,
        finishReason: 'stop',
        cached: false,
        requestId: 'test-request-id',
        routingDecision: {} as any,
        ...overrides,
      };
    }),
  } as unknown as HybridRouter;
  return { router, lastParams };
}

describe('MultiModelExecutor (ADR-092)', () => {
  let tmpDir: string;
  let cbPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'aqe-mme-'));
    cbPath = join(tmpDir, 'cb.json');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  let testCounter = 0;
  function makeExecutor(router: HybridRouter): MultiModelExecutor {
    return new MultiModelExecutor(router, { statePath: cbPath, maxCallsPerSession: 100 });
  }

  describe('consult()', () => {
    it('returns an AdvisorResult with advice text, model, tokens, latency, and hash', async () => {
      const { router } = createMockRouter();
      const executor = makeExecutor(router);

      const result = await executor.consult({
        systemPrompt: 'You are a test architect.',
        messages: [
          { role: 'user', content: 'Write tests for the JWT auth handler.' },
          { role: 'assistant', content: 'I will start by reading the existing auth module.' },
        ],
        taskDescription: 'Generate unit tests for JWT auth',
      });

      expect(result.advice).toContain('Read auth.ts');
      expect(result.model).toBe(DEFAULT_ADVISOR_MODEL);
      expect(result.provider).toBe(DEFAULT_ADVISOR_PROVIDER);
      expect(result.tokensIn).toBe(420);
      expect(result.tokensOut).toBe(28);
      expect(result.latencyMs).toBe(1830);
      expect(result.costUsd).toBeCloseTo(0.0012);
      expect(result.adviceHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.cacheHit).toBe(false);
      expect(result.triggerReason).toBe('manual');
    });

    it('passes agentName and triggerReason through to the advisor metadata', async () => {
      const { router, lastParams } = createMockRouter();
      const executor = makeExecutor(router);

      await executor.consult(
        { messages: [{ role: 'user', content: 'test' }] },
        { agentName: 'qe-test-architect', triggerReason: 'tiny_dancer.confidence=0.71' }
      );

      expect(lastParams.params?.metadata?.advisorCall).toBe(true);
      expect(lastParams.params?.metadata?.triggerReason).toBe('tiny_dancer.confidence=0.71');
      expect(lastParams.params?.metadata?.adrRef).toBe('ADR-092');
      expect(lastParams.params?.agentType).toBe('qe-test-architect');
    });

    it('defaults to openrouter + anthropic/claude-opus-4 when no provider/model specified', async () => {
      const { router, lastParams } = createMockRouter();
      const executor = makeExecutor(router);

      await executor.consult({ messages: [{ role: 'user', content: 'x' }] });

      expect(lastParams.params?.preferredProvider).toBe('openrouter');
      expect(lastParams.params?.model).toBe('anthropic/claude-opus-4');
    });

    it('respects explicit provider and model overrides', async () => {
      const { router, lastParams } = createMockRouter();
      const executor = makeExecutor(router);

      await executor.consult(
        { messages: [{ role: 'user', content: 'x' }] },
        { provider: 'claude' as any, model: 'claude-opus-4-6' }
      );

      expect(lastParams.params?.preferredProvider).toBe('claude');
      expect(lastParams.params?.model).toBe('claude-opus-4-6');
    });

    it('includes the advisor system prompt that enforces under-100-word enumerated advice', async () => {
      const { router, lastParams } = createMockRouter();
      const executor = makeExecutor(router);

      await executor.consult({ messages: [{ role: 'user', content: 'x' }] });

      expect(lastParams.params?.systemPrompt).toContain('under 100 words');
      expect(lastParams.params?.systemPrompt).toContain('enumerated steps');
    });

    it('serializes transcript with system prompt, task description, and conversation', async () => {
      const { router, lastParams } = createMockRouter();
      const executor = makeExecutor(router);

      await executor.consult({
        systemPrompt: 'test-system-prompt',
        taskDescription: 'test-task',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi' },
        ],
      });

      const userMessage = lastParams.params?.messages?.[0]?.content ?? '';
      expect(userMessage).toContain('# Executor System Prompt');
      expect(userMessage).toContain('test-system-prompt');
      expect(userMessage).toContain('# Task');
      expect(userMessage).toContain('test-task');
      expect(userMessage).toContain('# Conversation so far');
      expect(userMessage).toContain('[USER] hello');
      expect(userMessage).toContain('[ASSISTANT] hi');
      expect(userMessage).toContain('# Your job');
    });

    it('produces different advice hashes for different advice strings', async () => {
      const { router: router1 } = createMockRouter({ content: 'Advice A' });
      const { router: router2 } = createMockRouter({ content: 'Advice B' });

      const result1 = await makeExecutor(router1).consult(
        { messages: [{ role: 'user', content: 'x' }] },
        { sessionId: 'hash-test-1' },
      );
      const result2 = await makeExecutor(router2).consult(
        { messages: [{ role: 'user', content: 'x' }] },
        { sessionId: 'hash-test-2' },
      );

      expect(result1.adviceHash).not.toBe(result2.adviceHash);
    });
  });
});
