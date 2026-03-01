/**
 * Agentic QE v3 - Agent Routing Integration Tests
 * ADR-043: Vendor-Independent LLM Support - Milestone 8
 *
 * End-to-end tests for smart routing by agent type:
 * - Security agent routes to Claude Opus
 * - Test generator routes to Claude Sonnet
 * - Performance agents route to fast/cheap models
 * - Cost optimization overrides
 * - Complete routing flow with HybridRouter
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  HybridRouter,
  createHybridRouter,
  createQERouter,
  RoutingRuleEngine,
  // Agent routing exports
  getAgentRoutingCategory,
  getPreferredModelForAgent,
  getAgentCapabilityRequirements,
  createAgentBasedRoutingRule,
  createCategoryBasedRoutingRules,
  generateComprehensiveAgentRules,
  buildAgentRouterConfig,
  DEFAULT_CATEGORY_MODELS,
  AGENT_CATEGORY_MAP,
} from '../../../src/shared/llm/router';
import type {
  ChatParams,
  RoutingRule,
  AgentCategory,
  ModelPreference,
} from '../../../src/shared/llm/router';
import { ProviderManager } from '../../../src/shared/llm/provider-manager';
import {
  LLMProvider,
  LLMProviderType,
  LLMResponse,
  createLLMError,
} from '../../../src/shared/llm/interfaces';

// ============================================================================
// Mock Helpers
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
        throw createLLMError('Mock error', 'PROVIDER_UNAVAILABLE', { retryable: true });
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
// Integration Test Suite
// ============================================================================

describe('Agent Routing Integration Tests', () => {
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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Security Agent Routing Tests
  // ==========================================================================

  describe('Security Agent Routing', () => {
    it('should route security-auditor to Claude Opus', async () => {
      const rules = generateComprehensiveAgentRules();
      const router = new HybridRouter(providerManager, {
        mode: 'rule-based',
        rules,
      });
      await router.initialize();

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Analyze security vulnerabilities' }],
        agentType: 'security-auditor',
      };

      const decision = await router.selectProvider(params);

      expect(decision.providerType).toBe('claude');
      expect(decision.model).toContain('opus');
      expect(decision.reason).toBe('rule-match');
    });

    it('should route security-architect to Claude Opus', async () => {
      const rule = createAgentBasedRoutingRule('security-architect');
      const engine = new RoutingRuleEngine([rule]);

      const result = engine.evaluate({
        messages: [{ role: 'user', content: 'Design security architecture' }],
        agentType: 'security-architect',
      });

      expect(result).not.toBeNull();
      expect(result!.rule.action.model).toContain('opus');
    });

    it('should use low temperature for security agents', () => {
      const preference = getPreferredModelForAgent('security-auditor');
      expect(preference.temperature).toBeLessThanOrEqual(0.2);
    });

    it('should require advanced reasoning for security agents', () => {
      const capabilities = getAgentCapabilityRequirements('security-auditor');
      expect(capabilities.requiresReasoning).toBe(true);
      expect(capabilities.requiresExtendedThinking).toBe(true);
    });
  });

  // ==========================================================================
  // Test Generator Routing Tests
  // ==========================================================================

  describe('Test Generator Routing', () => {
    it('should route test-generator to Claude Sonnet', async () => {
      const rules = generateComprehensiveAgentRules();
      const router = new HybridRouter(providerManager, {
        mode: 'rule-based',
        rules,
      });
      await router.initialize();

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Generate unit tests' }],
        agentType: 'test-generator',
      };

      const decision = await router.selectProvider(params);

      expect(decision.providerType).toBe('claude');
      expect(decision.model).toContain('sonnet');
    });

    it('should route v3-qe-test-generator to Sonnet', () => {
      const preference = getPreferredModelForAgent('v3-qe-test-generator');
      expect(preference.model).toContain('sonnet');
      expect(preference.provider).toBe('claude');
    });

    it('should route tdd-specialist to test-generation category', () => {
      const category = getAgentRoutingCategory('tdd-specialist');
      expect(category).toBe('test-generation');
    });

    it('should require tools for test generation', () => {
      const capabilities = getAgentCapabilityRequirements('test-generator');
      expect(capabilities.requiresTools).toBe(true);
      expect(capabilities.requiresJsonMode).toBe(true);
    });
  });

  // ==========================================================================
  // Code Analysis Routing Tests
  // ==========================================================================

  describe('Code Analysis Routing', () => {
    it('should route code-reviewer to Claude Sonnet', async () => {
      const rules = generateComprehensiveAgentRules();
      const router = new HybridRouter(providerManager, {
        mode: 'rule-based',
        rules,
      });
      await router.initialize();

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Review this code' }],
        agentType: 'code-reviewer',
      };

      const decision = await router.selectProvider(params);

      expect(decision.model).toContain('sonnet');
    });

    it('should route coverage-analyzer to Sonnet', () => {
      const preference = getPreferredModelForAgent('coverage-analyzer');
      expect(preference.model).toContain('sonnet');
    });

    it('should have medium cost sensitivity for code analysis', () => {
      const capabilities = getAgentCapabilityRequirements('code-analyzer');
      expect(capabilities.costSensitivity).toBe('medium');
    });
  });

  // ==========================================================================
  // Performance Agent Routing Tests
  // ==========================================================================

  describe('Performance Agent Routing', () => {
    it('should route performance-tester to Haiku (fast/cheap)', () => {
      const preference = getPreferredModelForAgent('performance-tester');
      expect(preference.model).toContain('haiku');
    });

    it('should route load-tester to Haiku', () => {
      const preference = getPreferredModelForAgent('load-tester');
      expect(preference.model).toContain('haiku');
    });

    it('should route chaos-engineer to performance category', () => {
      const category = getAgentRoutingCategory('chaos-engineer');
      expect(category).toBe('performance');
    });

    it('should be cost-sensitive for performance agents', () => {
      const capabilities = getAgentCapabilityRequirements('performance-tester');
      expect(capabilities.costSensitivity).toBe('high');
      expect(capabilities.latencySensitivity).toBe('high');
    });

    it('should not require advanced reasoning for performance agents', () => {
      const capabilities = getAgentCapabilityRequirements('load-tester');
      expect(capabilities.requiresReasoning).toBe(false);
    });
  });

  // ==========================================================================
  // Cost Optimization Override Tests
  // ==========================================================================

  describe('Cost Optimization Override', () => {
    it('should override to cheaper model in cost-optimized mode', async () => {
      const router = new HybridRouter(providerManager, {
        mode: 'cost-optimized',
      });
      await router.initialize();

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Simple task' }],
        agentType: 'security-auditor', // Normally would go to Opus
      };

      const decision = await router.selectProvider(params);

      // In cost-optimized mode, should select cheapest (Ollama)
      expect(decision.providerType).toBe('ollama');
      expect(decision.reason).toBe('cost-optimization');
    });

    it('should include cost estimate in decision', async () => {
      const router = new HybridRouter(providerManager, {
        mode: 'cost-optimized',
      });
      await router.initialize();

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Test' }],
      };

      const decision = await router.selectProvider(params);

      expect(decision.metadata.estimatedCost).toBeDefined();
      expect(decision.metadata.alternativesConsidered).toBeDefined();
    });

    it('should prefer simple category model for low complexity', () => {
      const preference = DEFAULT_CATEGORY_MODELS.simple;
      expect(preference.provider).toBe('openai');
      expect(preference.model).toContain('mini');
    });
  });

  // ==========================================================================
  // End-to-End Routing Flow Tests
  // ==========================================================================

  describe('End-to-End Routing Flow', () => {
    it('should complete full routing cycle for security agent', async () => {
      const rules = generateComprehensiveAgentRules();
      const router = new HybridRouter(providerManager, {
        mode: 'rule-based',
        rules,
      });
      await router.initialize();

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Scan for vulnerabilities' }],
        agentType: 'security-auditor',
      };

      const response = await router.chat(params);

      expect(response.content).toBeDefined();
      expect(response.routingDecision.providerType).toBe('claude');
      expect(response.routingDecision.model).toContain('opus');
    });

    it('should complete full routing cycle for test generator', async () => {
      const rules = generateComprehensiveAgentRules();
      const router = new HybridRouter(providerManager, {
        mode: 'rule-based',
        rules,
      });
      await router.initialize();

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Generate tests for UserService' }],
        agentType: 'test-generator',
      };

      const response = await router.chat(params);

      expect(response.routingDecision.model).toContain('sonnet');
    });

    it('should collect metrics for agent-based routing', async () => {
      const rules = generateComprehensiveAgentRules();
      const router = new HybridRouter(providerManager, {
        mode: 'rule-based',
        rules,
      });
      await router.initialize();

      // Make several requests with different agent types
      await router.chat({
        messages: [{ role: 'user', content: 'Security scan' }],
        agentType: 'security-auditor',
      });

      await router.chat({
        messages: [{ role: 'user', content: 'Generate tests' }],
        agentType: 'test-generator',
      });

      const metrics = router.getMetrics();

      expect(metrics.totalDecisions).toBeGreaterThanOrEqual(2);
      expect(metrics.decisionsByMode['rule-based']).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================================================
  // Rule Generation Integration Tests
  // ==========================================================================

  describe('Rule Generation Integration', () => {
    it('should generate rules for all 59+ agent types', () => {
      const rules = generateComprehensiveAgentRules();

      expect(rules.length).toBeGreaterThanOrEqual(50);

      // Verify key agent types have rules
      const agentTypesCovered = new Set(
        rules.flatMap((r) => r.condition.agentType ?? [])
      );

      expect(agentTypesCovered.has('security-auditor')).toBe(true);
      expect(agentTypesCovered.has('test-generator')).toBe(true);
      expect(agentTypesCovered.has('code-reviewer')).toBe(true);
      expect(agentTypesCovered.has('performance-tester')).toBe(true);
    });

    it('should generate category-based rules correctly', () => {
      const securityRules = createCategoryBasedRoutingRules('security');

      expect(securityRules.length).toBeGreaterThanOrEqual(5);

      securityRules.forEach((rule) => {
        expect(rule.action.model).toContain('opus');
        expect(rule.action.provider).toBe('claude');
      });
    });

    it('should apply priority boost to category rules', () => {
      const normalRules = createCategoryBasedRoutingRules('performance');
      const boostedRules = createCategoryBasedRoutingRules('performance', {
        priorityBoost: 100,
      });

      expect(boostedRules[0].priority).toBe(normalRules[0].priority + 100);
    });
  });

  // ==========================================================================
  // Configuration Builder Integration Tests
  // ==========================================================================

  describe('Configuration Builder Integration', () => {
    it('should build complete router config', () => {
      const config = buildAgentRouterConfig({ includeAllAgents: true });

      expect(config.version).toBe('1.0.0');
      expect(config.agents.size).toBeGreaterThanOrEqual(50);

      // Verify security agent config
      const securityConfig = config.agents.get('security-auditor');
      expect(securityConfig).toBeDefined();
      expect(securityConfig!.category).toBe('security');
      expect(securityConfig!.preferredModel.model).toContain('opus');
    });

    it('should build config for specific categories only', () => {
      const config = buildAgentRouterConfig({
        categories: ['security'],
      });

      // Should only have security agents
      for (const [_, agentConfig] of config.agents) {
        expect(agentConfig.category).toBe('security');
      }
    });

    it('should include default overrides', () => {
      const config = buildAgentRouterConfig();

      // Should have the high complexity override
      const highComplexityOverride = config.overrides.find(
        (o) => o.id === 'high-complexity-any-agent'
      );
      expect(highComplexityOverride).toBeDefined();
      expect(highComplexityOverride!.modelPreference.model).toContain('opus');
    });
  });

  // ==========================================================================
  // Mixed Mode Routing Tests
  // ==========================================================================

  describe('Mixed Mode Routing', () => {
    it('should switch between manual and rule-based modes', async () => {
      const rules = generateComprehensiveAgentRules();
      const router = new HybridRouter(providerManager, {
        mode: 'rule-based',
        rules,
      });
      await router.initialize();

      // Rule-based should use agent routing
      const ruleBasedDecision = await router.selectProvider({
        messages: [{ role: 'user', content: 'Test' }],
        agentType: 'security-auditor',
      });
      expect(ruleBasedDecision.reason).toBe('rule-match');
      expect(ruleBasedDecision.model).toContain('opus');

      // Switch to manual mode
      router.setMode('manual');

      const manualDecision = await router.selectProvider({
        messages: [{ role: 'user', content: 'Test' }],
        agentType: 'security-auditor',
        preferredProvider: 'openai',
      });
      expect(manualDecision.reason).toBe('manual');
      expect(manualDecision.providerType).toBe('openai');
    });

    it('should respect priority ordering in rule-based mode', async () => {
      const lowPriorityRule: RoutingRule = {
        id: 'low-priority',
        name: 'Low Priority',
        condition: { agentType: ['security-auditor'] },
        action: { provider: 'ollama', model: 'llama3.1' },
        enabled: true,
        priority: 10,
      };

      const highPriorityRule = createAgentBasedRoutingRule('security-auditor');

      const router = new HybridRouter(providerManager, {
        mode: 'rule-based',
        rules: [lowPriorityRule, highPriorityRule],
      });
      await router.initialize();

      const decision = await router.selectProvider({
        messages: [{ role: 'user', content: 'Test' }],
        agentType: 'security-auditor',
      });

      // High priority rule should win
      expect(decision.model).toContain('opus');
    });
  });
});
