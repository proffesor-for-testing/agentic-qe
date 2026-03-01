/**
 * Agentic QE v3 - Multi-Provider Integration Tests
 * ADR-043: Vendor-Independent LLM Support - Milestone 12
 *
 * Tests HybridRouter with multiple providers configured including:
 * - Provider registration and discovery
 * - Model ID normalization across providers
 * - Cost calculation accuracy
 * - Token tracking integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HybridRouter, createHybridRouter, createQERouter } from '../../../src/shared/llm/router/hybrid-router';
import { ProviderManager } from '../../../src/shared/llm/provider-manager';
import {
  DEFAULT_ROUTER_CONFIG,
  DEFAULT_FALLBACK_CHAIN,
  ALL_PROVIDER_TYPES,
  type ExtendedProviderType,
  type ChatParams,
  type RoutingDecision,
} from '../../../src/shared/llm/router/types';
import {
  mapModelId,
  normalizeModelId,
  getCanonicalName,
  MODEL_MAPPINGS,
} from '../../../src/shared/llm/model-mapping';
import { ClaudeProvider, OpenAIProvider, OllamaProvider } from '../../../src/shared/llm/providers';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Multi-Provider Integration Tests', () => {
  let providerManager: ProviderManager;
  let router: HybridRouter;

  beforeEach(async () => {
    vi.clearAllMocks();
    providerManager = new ProviderManager({
      defaultProvider: 'claude',
      providers: {
        claude: { apiKey: 'test-claude-key' },
        openai: { apiKey: 'test-openai-key' },
        ollama: { baseUrl: 'http://localhost:11434' },
      },
    });
    await providerManager.initialize();
    router = createHybridRouter(providerManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Provider Registration and Discovery', () => {
    it('should register multiple providers from configuration', () => {
      const availableProviders = providerManager.getAvailableProviders();

      expect(availableProviders).toContain('claude');
      expect(availableProviders).toContain('openai');
      expect(availableProviders).toContain('ollama');
    });

    it('should discover providers by type', () => {
      const claudeProvider = providerManager.getProvider('claude');
      const openaiProvider = providerManager.getProvider('openai');
      const ollamaProvider = providerManager.getProvider('ollama');

      expect(claudeProvider).toBeDefined();
      expect(openaiProvider).toBeDefined();
      expect(ollamaProvider).toBeDefined();
    });

    it('should return undefined for unregistered providers', () => {
      const unknownProvider = providerManager.getProvider('gemini' as any);
      expect(unknownProvider).toBeUndefined();
    });

    it('should track provider count', () => {
      const providers = providerManager.getAvailableProviders();
      expect(providers.length).toBeGreaterThanOrEqual(3);
    });

    it('should support all 7+ ADR-043 provider types', () => {
      const expectedProviders: ExtendedProviderType[] = [
        'claude', 'openai', 'ollama', 'openrouter',
        'gemini', 'azure-openai', 'bedrock', 'onnx'
      ];

      // Verify ALL_PROVIDER_TYPES includes all expected providers
      for (const provider of expectedProviders) {
        expect(ALL_PROVIDER_TYPES).toContain(provider);
      }
      expect(ALL_PROVIDER_TYPES.length).toBeGreaterThanOrEqual(7);
    });
  });

  describe('Model ID Normalization', () => {
    it('should map canonical ID to provider-specific ID', () => {
      // Using the actual canonical ID format from model-mapping.ts
      const claudeId = mapModelId('claude-sonnet-4', 'anthropic');
      expect(claudeId).toBe('claude-sonnet-4-20250514');
    });

    it('should normalize provider-specific ID to canonical', () => {
      const canonical = normalizeModelId('claude-sonnet-4-20250514');
      expect(canonical).toBe('claude-sonnet-4');
    });

    it('should handle unknown model IDs by throwing error', () => {
      // The model mapping throws an error for unknown models
      expect(() => mapModelId('unknown-model-xyz', 'anthropic')).toThrow('Unknown model');
    });

    it('should support bidirectional mapping for Claude models', () => {
      const original = 'claude-opus-4-5';
      const providerId = mapModelId(original, 'anthropic');
      const backToCanonical = normalizeModelId(providerId);

      expect(providerId).toBe('claude-opus-4-5-20251101');
      expect(backToCanonical).toBe(original);
    });

    it('should support bidirectional mapping for OpenAI models', () => {
      const original = 'gpt-4o';
      const providerId = mapModelId(original, 'openai');
      const backToCanonical = normalizeModelId(providerId);

      expect(providerId).toBe('gpt-4o');
      expect(backToCanonical).toBe(original);
    });

    it('should get canonical name for display', () => {
      const name = getCanonicalName('claude-sonnet-4');
      expect(name).toBe('Claude Sonnet 4');
    });

    it('should have mappings for all major model families', () => {
      const families = new Set(Object.values(MODEL_MAPPINGS).map(m => m.family));

      expect(families.has('claude')).toBe(true);
      expect(families.has('gpt')).toBe(true);
      expect(families.has('gemini')).toBe(true);
      expect(families.has('llama')).toBe(true);
    });
  });

  describe('HybridRouter with Multiple Providers', () => {
    it('should initialize router with provider manager', async () => {
      await router.initialize();

      const config = router.getConfig();
      expect(config.mode).toBe('rule-based');
      expect(config.defaultProvider).toBe('claude');
    });

    it('should select provider based on routing mode', async () => {
      await router.initialize();

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Hello' }],
        agentType: 'tester',
      };

      const decision = await router.selectProvider(params);

      expect(decision).toBeDefined();
      expect(decision.providerType).toBeDefined();
      expect(decision.model).toBeDefined();
      expect(decision.reason).toBeDefined();
    });

    it('should support changing routing modes', async () => {
      await router.initialize();

      router.setMode('manual');
      expect(router.getMode()).toBe('manual');

      router.setMode('cost-optimized');
      expect(router.getMode()).toBe('cost-optimized');

      router.setMode('performance-optimized');
      expect(router.getMode()).toBe('performance-optimized');

      router.setMode('rule-based');
      expect(router.getMode()).toBe('rule-based');
    });

    it('should use QE-specific router configuration', async () => {
      const qeRouter = createQERouter(providerManager);
      await qeRouter.initialize();

      const config = qeRouter.getConfig();
      expect(config.mode).toBe('rule-based');
      expect(config.defaultProvider).toBe('claude');
      expect(config.defaultModel).toBe('claude-sonnet-4-20250514');
      expect(config.enableMetrics).toBe(true);
      expect(config.cacheDecisions).toBe(true);
    });
  });

  describe('Cost Calculation Accuracy', () => {
    it('should calculate cost for Claude provider', () => {
      const claudeProvider = providerManager.getProvider('claude');
      expect(claudeProvider).toBeDefined();

      const cost = claudeProvider!.getCostPerToken();
      expect(cost.input).toBeGreaterThan(0);
      expect(cost.output).toBeGreaterThan(0);
      expect(cost.output).toBeGreaterThan(cost.input); // Output typically costs more
    });

    it('should calculate cost for OpenAI provider', () => {
      const openaiProvider = providerManager.getProvider('openai');
      expect(openaiProvider).toBeDefined();

      const cost = openaiProvider!.getCostPerToken();
      expect(cost.input).toBeGreaterThan(0);
      expect(cost.output).toBeGreaterThan(0);
    });

    it('should report zero cost for local Ollama provider', () => {
      const ollamaProvider = providerManager.getProvider('ollama');
      expect(ollamaProvider).toBeDefined();

      const cost = ollamaProvider!.getCostPerToken();
      expect(cost.input).toBe(0);
      expect(cost.output).toBe(0);
    });

    it('should estimate cost in routing decision', async () => {
      await router.initialize();
      router.setMode('cost-optimized');

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Generate a test case for authentication' }],
        maxTokens: 1000,
      };

      const decision = await router.selectProvider(params);

      // Cost-optimized mode should include cost estimate
      if (decision.metadata.estimatedCost) {
        expect(decision.metadata.estimatedCost.inputTokens).toBeGreaterThan(0);
        expect(decision.metadata.estimatedCost.outputTokens).toBeGreaterThan(0);
        expect(decision.metadata.estimatedCost.totalCostUsd).toBeDefined();
      }
    });

    it('should consider alternatives in cost optimization', async () => {
      await router.initialize();
      router.setMode('cost-optimized');

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const decision = await router.selectProvider(params);

      if (decision.metadata.alternativesConsidered) {
        expect(decision.metadata.alternativesConsidered.length).toBeGreaterThan(0);

        for (const alt of decision.metadata.alternativesConsidered) {
          expect(alt.provider).toBeDefined();
          expect(alt.reason).toBeDefined();
        }
      }
    });
  });

  describe('Token Tracking Integration', () => {
    it('should track token usage in response', async () => {
      await router.initialize();

      // Mock successful response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Test response' }],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: { input_tokens: 50, output_tokens: 100 },
        }),
      });

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Test message' }],
        preferredProvider: 'claude',
      };

      router.setMode('manual');
      const response = await router.chat(params);

      expect(response.usage).toBeDefined();
      expect(response.usage.promptTokens).toBe(50);
      expect(response.usage.completionTokens).toBe(100);
      expect(response.usage.totalTokens).toBe(150);
    });

    it('should include cost information in response', async () => {
      await router.initialize();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Response with cost' }],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 200 },
        }),
      });

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Test' }],
        preferredProvider: 'claude',
      };

      router.setMode('manual');
      const response = await router.chat(params);

      expect(response.cost).toBeDefined();
      expect(response.cost.totalCost).toBeGreaterThan(0);
      expect(response.cost.inputCost).toBeDefined();
      expect(response.cost.outputCost).toBeDefined();
    });

    it('should track latency in response', async () => {
      await router.initialize();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Fast response' }],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      });

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Test' }],
        preferredProvider: 'claude',
      };

      router.setMode('manual');
      const response = await router.chat(params);

      expect(response.latencyMs).toBeDefined();
      expect(response.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Provider Configuration', () => {
    it('should respect default provider configuration', () => {
      const config = router.getConfig();
      expect(config.defaultProvider).toBe('claude');
      expect(config.defaultModel).toBe('claude-sonnet-4-20250514');
    });

    it('should have valid fallback chain configuration', () => {
      const config = router.getConfig();
      expect(config.fallbackChain).toBeDefined();
      expect(config.fallbackChain.entries.length).toBeGreaterThan(0);
      expect(config.fallbackChain.maxRetries).toBeGreaterThan(0);
    });

    it('should support updating configuration', () => {
      const newConfig = {
        mode: 'cost-optimized' as const,
        defaultModel: 'claude-3-5-haiku-20241022',
      };

      router.updateConfig(newConfig);

      const config = router.getConfig();
      expect(config.mode).toBe('cost-optimized');
      expect(config.defaultModel).toBe('claude-3-5-haiku-20241022');
    });

    it('should have default fallback entries for all base providers', () => {
      const fallbackProviders = DEFAULT_FALLBACK_CHAIN.entries.map(e => e.provider);

      expect(fallbackProviders).toContain('claude');
      expect(fallbackProviders).toContain('openai');
      expect(fallbackProviders).toContain('ollama');
    });
  });
});
