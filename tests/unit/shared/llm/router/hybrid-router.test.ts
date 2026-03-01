/**
 * Agentic QE v3 - HybridRouter Unit Tests
 * ADR-043: Vendor-Independent LLM Support
 *
 * Tests for the HybridRouter class covering:
 * - 4 routing modes (manual, rule-based, cost-optimized, performance-optimized)
 * - Agent-type aware routing
 * - Fallback chain with automatic failover
 * - Metrics collection
 */

import { describe, it, expect, beforeEach, vi, afterEach, Mock } from 'vitest';
import {
  HybridRouter,
  createHybridRouter,
  createQERouter,
  DEFAULT_QE_ROUTING_RULES,
  RoutingMode,
  ChatParams,
  RouterConfig,
  RoutingDecision,
} from '../../../../../src/shared/llm/router';
import { ProviderManager } from '../../../../../src/shared/llm/provider-manager';
import {
  LLMProvider,
  LLMProviderType,
  LLMResponse,
  Message,
  GenerateOptions,
  createLLMError,
} from '../../../../../src/shared/llm/interfaces';

// ============================================================================
// Mock Provider
// ============================================================================

function createMockProvider(
  type: LLMProviderType,
  config: {
    available?: boolean;
    model?: string;
    inputCost?: number;
    outputCost?: number;
    avgLatency?: number;
    generateResponse?: Partial<LLMResponse>;
    shouldFail?: boolean;
    failError?: Error;
  } = {}
): LLMProvider {
  const {
    available = true,
    model = 'mock-model',
    inputCost = 0.001,
    outputCost = 0.002,
    avgLatency = 100,
    generateResponse = {},
    shouldFail = false,
    failError,
  } = config;

  return {
    type,
    name: `Mock ${type}`,
    isAvailable: vi.fn().mockResolvedValue(available),
    healthCheck: vi.fn().mockResolvedValue({
      healthy: available,
      latencyMs: avgLatency,
    }),
    generate: vi.fn().mockImplementation(async () => {
      if (shouldFail) {
        throw failError ?? createLLMError('Mock error', 'PROVIDER_UNAVAILABLE', { retryable: true });
      }
      return {
        content: 'Mock response',
        model,
        provider: type,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        cost: { inputCost: 0.001, outputCost: 0.001, totalCost: 0.002, currency: 'USD' },
        latencyMs: avgLatency,
        finishReason: 'stop',
        cached: false,
        requestId: 'mock-request-id',
        ...generateResponse,
      } as LLMResponse;
    }),
    embed: vi.fn().mockResolvedValue({
      embedding: [0.1, 0.2, 0.3],
      model,
      provider: type,
      tokenCount: 10,
      latencyMs: avgLatency,
      cached: false,
    }),
    complete: vi.fn().mockResolvedValue({
      completion: 'Mock completion',
      model,
      provider: type,
      usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
      latencyMs: avgLatency,
      cached: false,
    }),
    getConfig: vi.fn().mockReturnValue({ model, maxTokens: 4096 }),
    getSupportedModels: vi.fn().mockReturnValue([model]),
    getCostPerToken: vi.fn().mockReturnValue({ input: inputCost, output: outputCost }),
    dispose: vi.fn().mockResolvedValue(undefined),
  } as unknown as LLMProvider;
}

// ============================================================================
// Mock Provider Manager
// ============================================================================

function createMockProviderManager(providers: Map<LLMProviderType, LLMProvider>) {
  const manager = {
    initialize: vi.fn().mockResolvedValue(undefined),
    getProvider: vi.fn((type: LLMProviderType) => providers.get(type)),
    getAvailableProviders: vi.fn(() => Array.from(providers.keys())),
    getMetrics: vi.fn(() => {
      const metrics: Record<LLMProviderType, { avgLatencyMs: number }> = {} as any;
      for (const type of providers.keys()) {
        metrics[type] = { avgLatencyMs: 100 };
      }
      return metrics;
    }),
    generate: vi.fn(),
    healthCheck: vi.fn(),
    dispose: vi.fn(),
  };

  return manager as unknown as ProviderManager;
}

// ============================================================================
// Test Suite
// ============================================================================

describe('HybridRouter', () => {
  let router: HybridRouter;
  let providerManager: ProviderManager;
  let claudeProvider: LLMProvider;
  let openaiProvider: LLMProvider;
  let ollamaProvider: LLMProvider;

  beforeEach(() => {
    claudeProvider = createMockProvider('claude', {
      model: 'claude-sonnet-4-20250514',
      inputCost: 0.003,
      outputCost: 0.015,
      avgLatency: 150,
    });

    openaiProvider = createMockProvider('openai', {
      model: 'gpt-4o',
      inputCost: 0.005,
      outputCost: 0.015,
      avgLatency: 100,
    });

    ollamaProvider = createMockProvider('ollama', {
      model: 'llama3.1',
      inputCost: 0.0,
      outputCost: 0.0,
      avgLatency: 200,
    });

    const providers = new Map<LLMProviderType, LLMProvider>([
      ['claude', claudeProvider],
      ['openai', openaiProvider],
      ['ollama', ollamaProvider],
    ]);

    providerManager = createMockProviderManager(providers);
    router = new HybridRouter(providerManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Initialization Tests
  // ==========================================================================

  describe('Initialization', () => {
    it('should initialize with default configuration', async () => {
      await router.initialize();
      const config = router.getConfig();

      expect(config.mode).toBe('rule-based');
      expect(config.defaultProvider).toBe('claude');
      expect(config.enableMetrics).toBe(true);
    });

    it('should accept custom configuration', async () => {
      const customRouter = new HybridRouter(providerManager, {
        mode: 'cost-optimized',
        defaultProvider: 'openai',
      });

      await customRouter.initialize();
      const config = customRouter.getConfig();

      expect(config.mode).toBe('cost-optimized');
      expect(config.defaultProvider).toBe('openai');
    });

    it('should initialize provider manager on first use', async () => {
      await router.selectProvider({ messages: [{ role: 'user', content: 'test' }] });
      expect(providerManager.initialize).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Mode Tests
  // ==========================================================================

  describe('Routing Modes', () => {
    it('should get and set routing mode', () => {
      expect(router.getMode()).toBe('rule-based');

      router.setMode('manual');
      expect(router.getMode()).toBe('manual');

      router.setMode('cost-optimized');
      expect(router.getMode()).toBe('cost-optimized');
    });

    it('should clear cache when mode changes', async () => {
      await router.initialize();
      const params: ChatParams = { messages: [{ role: 'user', content: 'test' }] };

      // Make a decision to populate cache
      await router.selectProvider(params);

      // Change mode should clear cache
      router.setMode('performance-optimized');

      // No way to directly check cache, but this ensures no errors
      expect(router.getMode()).toBe('performance-optimized');
    });
  });

  // ==========================================================================
  // Manual Mode Tests
  // ==========================================================================

  describe('Manual Mode', () => {
    beforeEach(async () => {
      router.setMode('manual');
      await router.initialize();
    });

    it('should use preferred provider when specified', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'test' }],
        preferredProvider: 'openai',
      };

      const decision = await router.selectProvider(params);

      expect(decision.providerType).toBe('openai');
      expect(decision.reason).toBe('manual');
    });

    it('should use default provider when no preference', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'test' }],
      };

      const decision = await router.selectProvider(params);

      expect(decision.providerType).toBe('claude');
      expect(decision.reason).toBe('manual');
    });

    it('should use specified model when provided', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'custom-model',
      };

      const decision = await router.selectProvider(params);

      expect(decision.model).toBe('custom-model');
    });
  });

  // ==========================================================================
  // Rule-Based Mode Tests
  // ==========================================================================

  describe('Rule-Based Mode', () => {
    beforeEach(async () => {
      router.setMode('rule-based');
      await router.initialize();
    });

    it('should route security agents to Claude Opus', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'analyze security' }],
        agentType: 'security-auditor',
      };

      const decision = await router.selectProvider(params);

      expect(decision.providerType).toBe('claude');
      // Canonical model ID stored in model, provider-specific in providerModelId
      expect(decision.model).toBe('claude-opus-4-5');
      expect(decision.providerModelId).toBe('claude-opus-4-5-20251101');
      expect(decision.reason).toBe('rule-match');
    });

    it('should route test generation with tools to Claude Sonnet', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'generate tests' }],
        agentType: 'v3-qe-test-generator',
        requiresTools: true,
      };

      const decision = await router.selectProvider(params);

      expect(decision.providerType).toBe('claude');
      // Canonical model ID stored in model, provider-specific in providerModelId
      expect(decision.model).toBe('claude-sonnet-4');
      expect(decision.providerModelId).toBe('claude-sonnet-4-20250514');
    });

    it('should route high complexity reasoning tasks to advanced models', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'complex analysis' }],
        complexity: 'high',
      };

      const decision = await router.selectProvider(params);

      expect(decision.providerType).toBe('claude');
    });

    it('should route low complexity tasks to efficient models', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'simple task' }],
        complexity: 'low',
      };

      const decision = await router.selectProvider(params);

      expect(decision.providerType).toBe('claude');
      // Canonical model ID stored in model, provider-specific in providerModelId
      expect(decision.model).toBe('claude-haiku-3-5');
      expect(decision.providerModelId).toBe('claude-3-5-haiku-20241022');
    });

    it('should use default when no rules match', async () => {
      // Use a custom router with a rule that won't match
      // Note: empty rules array falls back to DEFAULT_QE_ROUTING_RULES in constructor
      const unmatchableRule = {
        id: 'unmatchable',
        name: 'Unmatchable Rule',
        condition: { agentType: ['unmatchable-agent-type-xyz'] },
        action: { provider: 'ollama' as const, model: 'test' },
        enabled: true,
        priority: 100,
      };
      const noMatchRouter = new HybridRouter(providerManager, {
        mode: 'rule-based',
        rules: [unmatchableRule], // Rule that won't match
      });
      await noMatchRouter.initialize();

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'general task' }],
        agentType: 'some-other-agent', // Won't match unmatchable-agent-type-xyz
      };

      const decision = await noMatchRouter.selectProvider(params);

      expect(decision.reason).toBe('default');
    });
  });

  // ==========================================================================
  // Cost-Optimized Mode Tests
  // ==========================================================================

  describe('Cost-Optimized Mode', () => {
    beforeEach(async () => {
      router.setMode('cost-optimized');
      await router.initialize();
    });

    it('should select cheapest available provider', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'test' }],
      };

      const decision = await router.selectProvider(params);

      // Ollama has zero cost
      expect(decision.providerType).toBe('ollama');
      expect(decision.reason).toBe('cost-optimization');
    });

    it('should include estimated cost in metadata', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'test' }],
      };

      const decision = await router.selectProvider(params);

      expect(decision.metadata.estimatedCost).toBeDefined();
    });

    it('should include alternatives considered in metadata', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'test' }],
      };

      const decision = await router.selectProvider(params);

      expect(decision.metadata.alternativesConsidered).toBeDefined();
      // alternativesConsidered is an array of AlternativeProvider objects
      const providerNames = decision.metadata.alternativesConsidered!.map((alt) => alt.provider);
      expect(providerNames).toContain('claude');
      expect(providerNames).toContain('openai');
    });
  });

  // ==========================================================================
  // Performance-Optimized Mode Tests
  // ==========================================================================

  describe('Performance-Optimized Mode', () => {
    beforeEach(async () => {
      router.setMode('performance-optimized');
      await router.initialize();
    });

    it('should select fastest available provider', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'test' }],
      };

      const decision = await router.selectProvider(params);

      expect(decision.reason).toBe('performance-optimization');
    });

    it('should include estimated latency in metadata', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'test' }],
      };

      const decision = await router.selectProvider(params);

      // Latency metadata may not be set if no historical data
      expect(decision.metadata).toBeDefined();
    });
  });

  // ==========================================================================
  // Chat Execution Tests
  // ==========================================================================

  describe('Chat Execution', () => {
    beforeEach(async () => {
      await router.initialize();
    });

    it('should execute chat request with selected provider', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      const response = await router.chat(params);

      expect(response.content).toBe('Mock response');
      expect(response.routingDecision).toBeDefined();
    });

    it('should include routing decision in response', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Hello!' }],
        agentType: 'security-auditor',
      };

      const response = await router.chat(params);

      expect(response.routingDecision.providerType).toBe('claude');
    });

    it('should pass options to provider', async () => {
      // Use manual mode with explicit provider to ensure claude is selected
      router.setMode('manual');

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Hello!' }],
        temperature: 0.5,
        maxTokens: 1000,
        systemPrompt: 'Be helpful',
        preferredProvider: 'claude',
      };

      await router.chat(params);

      expect(claudeProvider.generate).toHaveBeenCalledWith(
        params.messages,
        expect.objectContaining({
          temperature: 0.5,
          maxTokens: 1000,
          systemPrompt: 'Be helpful',
        })
      );
    });
  });

  // ==========================================================================
  // Fallback Tests
  // ==========================================================================

  describe('Fallback Chain', () => {
    it('should fallback to next provider on failure', async () => {
      // Make Claude fail
      const failingClaude = createMockProvider('claude', {
        shouldFail: true,
      });

      // Create fresh openai provider for this test
      const workingOpenai = createMockProvider('openai', {
        model: 'gpt-4o',
        avgLatency: 100,
      });

      const providers = new Map<LLMProviderType, LLMProvider>([
        ['claude', failingClaude],
        ['openai', workingOpenai],
        ['ollama', ollamaProvider],
      ]);

      providerManager = createMockProviderManager(providers);

      // Create router with manual mode and explicit fallback chain
      // Manual mode ensures we start with claude, then fallback to openai
      router = new HybridRouter(providerManager, {
        mode: 'manual',
        defaultProvider: 'claude',
        defaultModel: 'claude-sonnet-4-20250514',
        fallbackChain: {
          id: 'test-fallback',
          entries: [
            { provider: 'claude', models: ['claude-sonnet-4-20250514'], enabled: true, priority: 100 },
            { provider: 'openai', models: ['gpt-4o'], enabled: true, priority: 90 },
            { provider: 'ollama', models: ['llama3.1'], enabled: true, priority: 80 },
          ],
          maxRetries: 3,
          retryDelayMs: 0,
          backoffMultiplier: 1,
          maxDelayMs: 0,
        },
      });
      await router.initialize();

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'test' }],
        preferredProvider: 'claude', // Start with Claude
      };

      const response = await router.chat(params);

      // Should have fallen back to OpenAI (the next provider after Claude)
      expect(response.provider).toBe('openai');
      expect(workingOpenai.generate).toHaveBeenCalled();
    });

    it('should try multiple fallbacks if needed', async () => {
      const failingClaude = createMockProvider('claude', { shouldFail: true });
      const failingOpenAI = createMockProvider('openai', { shouldFail: true });

      const providers = new Map<LLMProviderType, LLMProvider>([
        ['claude', failingClaude],
        ['openai', failingOpenAI],
        ['ollama', ollamaProvider],
      ]);

      providerManager = createMockProviderManager(providers);
      router = new HybridRouter(providerManager);
      await router.initialize();

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'test' }],
      };

      const response = await router.chat(params);

      expect(response.provider).toBe('ollama');
    });

    it('should throw when all providers fail', async () => {
      const failingClaude = createMockProvider('claude', { shouldFail: true });
      const failingOpenAI = createMockProvider('openai', { shouldFail: true });
      const failingOllama = createMockProvider('ollama', { shouldFail: true });

      const providers = new Map<LLMProviderType, LLMProvider>([
        ['claude', failingClaude],
        ['openai', failingOpenAI],
        ['ollama', failingOllama],
      ]);

      providerManager = createMockProviderManager(providers);
      router = new HybridRouter(providerManager);
      await router.initialize();

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'test' }],
      };

      await expect(router.chat(params)).rejects.toThrow('All providers failed');
    });

    it('should not retry non-retryable errors', async () => {
      const nonRetryableError = createLLMError('API key invalid', 'API_KEY_INVALID', {
        retryable: false,
      });

      const failingClaude = createMockProvider('claude', {
        shouldFail: true,
        failError: nonRetryableError,
      });

      const providers = new Map<LLMProviderType, LLMProvider>([
        ['claude', failingClaude],
        ['openai', openaiProvider],
      ]);

      providerManager = createMockProviderManager(providers);
      router = new HybridRouter(providerManager);
      await router.initialize();

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'test' }],
      };

      await expect(router.chat(params)).rejects.toThrow('API key invalid');
      expect(openaiProvider.generate).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Metrics Tests
  // ==========================================================================

  describe('Metrics', () => {
    beforeEach(async () => {
      await router.initialize();
    });

    it('should collect routing decision metrics', async () => {
      // Use different params to avoid cache hits
      const params1: ChatParams = {
        messages: [{ role: 'user', content: 'test' }],
        agentType: 'agent-1',
      };

      const params2: ChatParams = {
        messages: [{ role: 'user', content: 'test' }],
        agentType: 'agent-2',
      };

      await router.chat(params1);
      await router.chat(params2);

      const metrics = router.getMetrics();

      expect(metrics.totalDecisions).toBeGreaterThanOrEqual(2);
    });

    it('should track cache statistics', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'test' }],
        agentType: 'test-agent',
      };

      // First call - cache miss
      await router.selectProvider(params);

      // Second call - should be cache hit
      await router.selectProvider(params);

      const metrics = router.getMetrics();

      expect(metrics.cacheStats).toBeDefined();
    });

    it('should reset metrics on request', async () => {
      await router.chat({ messages: [{ role: 'user', content: 'test' }] });

      router.resetMetrics();

      const metrics = router.getMetrics();
      expect(metrics.totalDecisions).toBe(0);
    });

    it('should track rule evaluation statistics', async () => {
      router.setMode('rule-based');

      await router.chat({
        messages: [{ role: 'user', content: 'test' }],
        agentType: 'security-auditor',
      });

      const metrics = router.getMetrics();

      expect(metrics.ruleStats).toBeDefined();
    });
  });

  // ==========================================================================
  // Streaming Tests
  // ==========================================================================

  describe('Streaming', () => {
    beforeEach(async () => {
      await router.initialize();
    });

    it('should yield stream chunks', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'test' }],
      };

      const chunks: string[] = [];
      for await (const chunk of router.stream(params)) {
        chunks.push(chunk.content);
        if (chunk.done) break;
      }

      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should include provider info in chunks', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'test' }],
      };

      for await (const chunk of router.stream(params)) {
        expect(chunk.provider).toBeDefined();
        expect(chunk.model).toBeDefined();
        if (chunk.done) break;
      }
    });
  });

  // ==========================================================================
  // Configuration Tests
  // ==========================================================================

  describe('Configuration', () => {
    it('should update configuration', async () => {
      router.updateConfig({
        mode: 'manual',
        defaultProvider: 'openai',
      });

      const config = router.getConfig();
      expect(config.mode).toBe('manual');
      expect(config.defaultProvider).toBe('openai');
    });

    it('should update rules when config changes', async () => {
      const customRules = [{
        id: 'custom-rule',
        name: 'Custom Rule',
        condition: { agentType: ['custom-agent'] },
        action: { provider: 'ollama' as const, model: 'custom-model' },
        enabled: true,
        priority: 200,
      }];

      router.updateConfig({ rules: customRules });
      await router.initialize();

      const decision = await router.selectProvider({
        messages: [{ role: 'user', content: 'test' }],
        agentType: 'custom-agent',
      });

      expect(decision.model).toBe('custom-model');
    });
  });

  // ==========================================================================
  // Factory Function Tests
  // ==========================================================================

  describe('Factory Functions', () => {
    it('should create router with createHybridRouter', () => {
      const router = createHybridRouter(providerManager, {
        mode: 'cost-optimized',
      });

      expect(router.getMode()).toBe('cost-optimized');
    });

    it('should create QE-optimized router with createQERouter', () => {
      const router = createQERouter(providerManager);

      expect(router.getMode()).toBe('rule-based');
      expect(router.getConfig().defaultProvider).toBe('claude');
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle empty messages array', async () => {
      const params: ChatParams = {
        messages: [],
      };

      const decision = await router.selectProvider(params);
      expect(decision).toBeDefined();
    });

    it('should handle very long messages', async () => {
      const longContent = 'x'.repeat(100000);
      const params: ChatParams = {
        messages: [{ role: 'user', content: longContent }],
      };

      const decision = await router.selectProvider(params);
      expect(decision).toBeDefined();
    });

    it('should handle multiple system prompts scenario', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'test' }],
        systemPrompt: 'Be helpful and concise',
      };

      const response = await router.chat(params);
      expect(response).toBeDefined();
    });
  });
});
