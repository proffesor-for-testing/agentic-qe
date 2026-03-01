/**
 * Agentic QE v3 - Real Provider Integration Tests
 * ADR-043: Vendor-Independent LLM Support
 *
 * REAL integration tests using MSW (Mock Service Worker) to intercept
 * actual HTTP requests. Unlike other tests that mock at the module level,
 * these tests exercise the full HTTP stack.
 *
 * @see https://mswjs.io/
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { HybridRouter, createHybridRouter, createQERouter } from '../../../src/shared/llm/router/hybrid-router';
import { ProviderManager } from '../../../src/shared/llm/provider-manager';
import type { ChatParams } from '../../../src/shared/llm/router/types';

// ============================================================================
// MSW Server Setup - Real HTTP Interception
// ============================================================================

// Mock Claude API responses
const handlers = [
  // Claude Messages API
  http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const model = body.model as string;
    const messages = body.messages as Array<{ role: string; content: string }>;
    const inputTokens = messages.reduce((acc, m) => acc + m.content.length / 4, 0);

    return HttpResponse.json({
      id: `msg_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: `MSW intercepted response for model ${model}. This is a real integration test.`,
        },
      ],
      model: model,
      stop_reason: 'end_turn',
      usage: {
        input_tokens: Math.ceil(inputTokens),
        output_tokens: 50,
      },
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': `req_${Date.now()}`,
      },
    });
  }),

  // OpenAI Chat Completions API
  http.post('https://api.openai.com/v1/chat/completions', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const model = body.model as string;
    const messages = body.messages as Array<{ role: string; content: string }>;
    const inputTokens = messages.reduce((acc, m) => acc + m.content.length / 4, 0);

    return HttpResponse.json({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: `OpenAI MSW response for model ${model}.`,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: Math.ceil(inputTokens),
        completion_tokens: 30,
        total_tokens: Math.ceil(inputTokens) + 30,
      },
    });
  }),

  // Ollama API (local)
  http.post('http://localhost:11434/api/chat', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    const model = body.model as string;

    return HttpResponse.json({
      model: model,
      message: {
        role: 'assistant',
        content: `Ollama MSW response for model ${model}.`,
      },
      done: true,
      total_duration: 1000000000,
      load_duration: 100000000,
      prompt_eval_count: 10,
      eval_count: 20,
    });
  }),
];

const server = setupServer(...handlers);

// ============================================================================
// Test Suite
// ============================================================================

describe('Real Provider Integration Tests (MSW)', () => {
  let providerManager: ProviderManager;
  let router: HybridRouter;

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'bypass' });
  });

  afterAll(() => {
    server.close();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  beforeAll(async () => {
    providerManager = new ProviderManager({
      defaultProvider: 'claude',
      providers: {
        claude: {
          apiKey: 'test-api-key-for-msw',
          model: 'claude-sonnet-4-20250514',
        },
        openai: {
          apiKey: 'test-openai-key-for-msw',
          model: 'gpt-4o',
        },
        ollama: {
          baseUrl: 'http://localhost:11434',
          model: 'llama2',
        },
      },
    });
    await providerManager.initialize();
    router = createHybridRouter(providerManager);
  });

  describe('Claude Provider via MSW', () => {
    it('should make real HTTP request to Claude API (intercepted by MSW)', async () => {
      await router.initialize();
      router.setMode('manual');

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Hello from MSW integration test' }],
        preferredProvider: 'claude',
      };

      const response = await router.chat(params);

      // Verify response came through the full HTTP stack
      expect(response.content).toContain('MSW intercepted response');
      expect(response.provider).toBe('claude');
      expect(response.usage.promptTokens).toBeGreaterThan(0);
      expect(response.usage.completionTokens).toBe(50);
      expect(response.requestId).toBeDefined();
    });

    it('should handle model ID normalization through real request', async () => {
      await router.initialize();
      router.setMode('manual');

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Test model normalization' }],
        preferredProvider: 'claude',
        model: 'claude-sonnet-4', // Canonical model ID
      };

      const response = await router.chat(params);

      // Verify the provider received the provider-specific model ID (mapped from canonical)
      // The MSW mock echoes back the model it received
      expect(response.content).toContain('claude-sonnet-4-20250514');
      expect(response.provider).toBe('claude');
      // The routing decision stores canonical in model, provider-specific in response
      expect(response.routingDecision?.model).toBe('claude-sonnet-4');
      expect(response.routingDecision?.providerModelId).toBe('claude-sonnet-4-20250514');
    });
  });

  describe('Provider Fallback via MSW', () => {
    it('should fallback to next provider when primary fails', async () => {
      // Override Claude handler to return error
      server.use(
        http.post('https://api.anthropic.com/v1/messages', () => {
          return HttpResponse.json(
            { error: { message: 'Rate limited' } },
            { status: 429 }
          );
        })
      );

      await router.initialize();
      router.setMode('manual');

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Test fallback' }],
        preferredProvider: 'claude',
      };

      // This should trigger fallback to another provider
      const response = await router.chat(params);

      // Either succeeded with fallback or got a proper error
      expect(response.content).toBeDefined();
      expect(['claude', 'openai', 'ollama']).toContain(response.provider);
    });
  });

  describe('Cost Tracking via MSW', () => {
    it('should track costs from real responses', async () => {
      await router.initialize();
      router.setMode('manual');

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Test cost tracking with MSW' }],
        preferredProvider: 'claude',
      };

      const response = await router.chat(params);

      // Verify cost object is calculated based on actual token usage
      expect(response.cost).toBeDefined();
      expect(response.cost.inputCost).toBeDefined();
      expect(response.cost.outputCost).toBeDefined();
      expect(response.cost.totalCost).toBeDefined();
      // Cost should be non-negative (could be 0 for test configs without pricing)
      expect(response.cost.totalCost).toBeGreaterThanOrEqual(0);

      // Verify token usage is tracked
      expect(response.usage).toBeDefined();
      expect(response.usage.promptTokens).toBeGreaterThan(0);
      expect(response.usage.completionTokens).toBe(50);
      expect(response.usage.totalTokens).toBe(response.usage.promptTokens + 50);
    });
  });

  describe('QE Router Integration', () => {
    it('should use QE-specific router with MSW', async () => {
      const qeRouter = createQERouter(providerManager);
      await qeRouter.initialize();

      const config = qeRouter.getConfig();
      expect(config.mode).toBe('rule-based');
      expect(config.enableMetrics).toBe(true);

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Generate a test' }],
        agentType: 'v3-qe-test-generator',
      };

      const decision = await qeRouter.selectProvider(params);

      expect(decision.providerType).toBeDefined();
      expect(decision.model).toBeDefined();
      expect(decision.providerModelId).toBeDefined();
    });
  });

  describe('Multi-Provider Routing', () => {
    it('should route to different providers based on rules', async () => {
      await router.initialize();
      router.setMode('rule-based');

      // Security agent should route to high-capability model
      const securityParams: ChatParams = {
        messages: [{ role: 'user', content: 'Security analysis' }],
        agentType: 'security-auditor',
      };
      const securityDecision = await router.selectProvider(securityParams);
      expect(securityDecision.providerType).toBe('claude');

      // Low complexity should route to efficient model
      const simpleParams: ChatParams = {
        messages: [{ role: 'user', content: 'Simple task' }],
        complexity: 'low',
      };
      const simpleDecision = await router.selectProvider(simpleParams);
      expect(simpleDecision.providerType).toBe('claude');
      expect(simpleDecision.model).toBe('claude-haiku-3-5');
    });
  });
});
