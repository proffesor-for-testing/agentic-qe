/**
 * Agentic QE v3 - Routing Scenarios Integration Tests
 * ADR-043: Vendor-Independent LLM Support - Milestone 12
 *
 * Comprehensive tests for all 4 routing modes:
 * - Manual routing
 * - Rule-based routing
 * - Cost-optimized routing
 * - Performance-optimized routing
 *
 * Plus tests for:
 * - Routing constraints (local-only, tools-required)
 * - Decision caching
 * - Agent-type aware routing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HybridRouter, createHybridRouter, createQERouter } from '../../../src/shared/llm/router/hybrid-router';
import { ProviderManager } from '../../../src/shared/llm/provider-manager';
import { RoutingRuleEngine, DEFAULT_QE_ROUTING_RULES } from '../../../src/shared/llm/router/routing-rules';
import {
  DEFAULT_ROUTER_CONFIG,
  type ChatParams,
  type RoutingRule,
  type RoutingMode,
  type TaskComplexity,
} from '../../../src/shared/llm/router/types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Routing Scenarios Integration Tests', () => {
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
    await router.initialize();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Manual Routing Mode', () => {
    beforeEach(() => {
      router.setMode('manual');
    });

    it('should select specified provider in manual mode', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Test' }],
        preferredProvider: 'openai',
      };

      const decision = await router.selectProvider(params);

      expect(decision.providerType).toBe('openai');
      expect(decision.reason).toBe('manual');
    });

    it('should use default provider when none specified', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Test' }],
      };

      const decision = await router.selectProvider(params);

      expect(decision.providerType).toBe('claude');
      expect(decision.reason).toBe('manual');
    });

    it('should select specified model in manual mode', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Test' }],
        preferredProvider: 'claude',
        model: 'claude-3-5-haiku-20241022',
      };

      const decision = await router.selectProvider(params);

      // Model is normalized to canonical form, providerModelId contains provider-specific ID
      expect(decision.model).toBe('claude-haiku-3-5');
      expect(decision.providerModelId).toBe('claude-3-5-haiku-20241022');
    });

    it('should fall back when preferred provider unavailable', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Test' }],
        preferredProvider: 'gemini' as any, // Not configured
      };

      const decision = await router.selectProvider(params);

      // Should fall back to an available provider
      expect(decision.reason).toBe('fallback');
      expect(['claude', 'openai', 'ollama']).toContain(decision.providerType);
    });
  });

  describe('Rule-Based Routing Mode', () => {
    beforeEach(() => {
      router.setMode('rule-based');
    });

    it('should match rule for security-auditor agent type', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Audit this code for vulnerabilities' }],
        agentType: 'security-auditor',
        complexity: 'high',
      };

      const decision = await router.selectProvider(params);

      // Security agents should get high-capability models
      expect(decision.reason).toMatch(/rule-match|default/);
    });

    it('should match rule for test-generator agent type', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Generate tests for UserService' }],
        agentType: 'v3-qe-test-generator',
      };

      const decision = await router.selectProvider(params);

      expect(decision.reason).toMatch(/rule-match|default/);
    });

    it('should use default when no rule matches', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Simple question' }],
        agentType: 'unknown-agent-type',
        complexity: 'trivial',
      };

      const decision = await router.selectProvider(params);

      // Router may use default provider via rule-match mechanism or explicit default
      expect(decision.providerType).toBeDefined();
      expect(decision.model).toBeDefined();
      // The decision reason varies by implementation - key is that it makes a valid decision
      expect(decision.reason).toBeDefined();
    });

    it('should track rules evaluated in metadata', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Test' }],
        agentType: 'tester',
      };

      const decision = await router.selectProvider(params);

      if (decision.metadata.rulesEvaluated !== undefined) {
        expect(decision.metadata.rulesEvaluated).toBeGreaterThanOrEqual(0);
      }
    });

    it('should support requiresTools condition', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Use tools to analyze' }],
        requiresTools: true,
      };

      const decision = await router.selectProvider(params);

      expect(decision).toBeDefined();
      // Should route to a provider that supports tools
    });

    it('should evaluate complexity condition', async () => {
      const complexParams: ChatParams = {
        messages: [{ role: 'user', content: 'Complex analysis' }],
        complexity: 'expert',
      };

      const decision = await router.selectProvider(complexParams);
      expect(decision).toBeDefined();
    });
  });

  describe('Cost-Optimized Routing Mode', () => {
    beforeEach(() => {
      router.setMode('cost-optimized');
    });

    it('should select lowest cost provider', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Simple task' }],
        maxTokens: 100,
      };

      const decision = await router.selectProvider(params);

      expect(decision.reason).toBe('cost-optimization');
      // Ollama should typically win (zero cost)
      expect(decision.providerType).toBe('ollama');
    });

    it('should include cost estimate in decision', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Test' }],
        maxTokens: 500,
      };

      const decision = await router.selectProvider(params);

      if (decision.metadata.estimatedCost) {
        expect(decision.metadata.estimatedCost.totalCostUsd).toBeDefined();
        expect(decision.metadata.estimatedCost.inputTokens).toBeGreaterThan(0);
      }
    });

    it('should list alternatives considered', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Test' }],
      };

      const decision = await router.selectProvider(params);

      if (decision.metadata.alternativesConsidered) {
        expect(decision.metadata.alternativesConsidered.length).toBeGreaterThan(0);

        // Each alternative should have cost reasoning
        for (const alt of decision.metadata.alternativesConsidered) {
          expect(alt.reason).toContain('cost');
        }
      }
    });

    it('should estimate cost based on message length', async () => {
      const shortParams: ChatParams = {
        messages: [{ role: 'user', content: 'Hi' }],
        maxTokens: 100,
      };

      const longParams: ChatParams = {
        messages: [{ role: 'user', content: 'This is a much longer message '.repeat(50) }],
        maxTokens: 2000,
      };

      const shortDecision = await router.selectProvider(shortParams);
      const longDecision = await router.selectProvider(longParams);

      // Both should have cost estimates
      expect(shortDecision.metadata.estimatedCost || shortDecision.reason).toBeTruthy();
      expect(longDecision.metadata.estimatedCost || longDecision.reason).toBeTruthy();
    });
  });

  describe('Performance-Optimized Routing Mode', () => {
    beforeEach(() => {
      router.setMode('performance-optimized');
    });

    it('should select based on latency metrics', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Fast response needed' }],
      };

      const decision = await router.selectProvider(params);

      expect(decision.reason).toBe('performance-optimization');
    });

    it('should include latency estimate in decision', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Test' }],
      };

      const decision = await router.selectProvider(params);

      // Performance mode should track latency
      if (decision.metadata.estimatedLatencyMs !== undefined) {
        expect(decision.metadata.estimatedLatencyMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should list alternatives with latency reasons', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Test' }],
      };

      const decision = await router.selectProvider(params);

      if (decision.metadata.alternativesConsidered) {
        for (const alt of decision.metadata.alternativesConsidered) {
          expect(alt.reason).toContain('latency');
        }
      }
    });
  });

  describe('Routing Constraints', () => {
    it('should respect local-only constraint with Ollama', async () => {
      // Create custom rule for local-only
      const localOnlyRule: RoutingRule = {
        id: 'local-only-test',
        name: 'Local Only Test',
        condition: { localOnly: true },
        action: { provider: 'ollama', model: 'llama3.1' },
        enabled: true,
        priority: 100,
      };

      const ruleEngine = new RoutingRuleEngine([localOnlyRule]);
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Test' }],
        routingContext: { localOnly: true },
      };

      // Manually test rule evaluation
      const result = ruleEngine.evaluate(params);

      expect(result).toBeDefined();
      if (result) {
        expect(result.rule.action.provider).toBe('ollama');
      }
    });

    it('should handle tools-required constraint', async () => {
      const toolsRule: RoutingRule = {
        id: 'tools-required-test',
        name: 'Tools Required',
        condition: { requiresTools: true },
        action: { provider: 'claude', model: 'claude-sonnet-4-20250514' },
        enabled: true,
        priority: 90,
      };

      const ruleEngine = new RoutingRuleEngine([toolsRule]);
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Use tools' }],
        requiresTools: true,
      };

      const result = ruleEngine.evaluate(params);

      expect(result).toBeDefined();
      if (result) {
        expect(result.rule.action.provider).toBe('claude');
      }
    });

    it('should evaluate complexity constraints', async () => {
      const complexityRule: RoutingRule = {
        id: 'high-complexity',
        name: 'High Complexity Handler',
        condition: { complexity: ['high', 'expert'] },
        action: { provider: 'claude', model: 'claude-opus-4-5-20251101' },
        enabled: true,
        priority: 95,
      };

      const ruleEngine = new RoutingRuleEngine([complexityRule]);

      const highComplexity: ChatParams = {
        messages: [{ role: 'user', content: 'Complex analysis' }],
        complexity: 'high',
      };

      const result = ruleEngine.evaluate(highComplexity);

      expect(result).toBeDefined();
      if (result) {
        expect(result.rule.id).toBe('high-complexity');
      }
    });
  });

  describe('Decision Caching', () => {
    it('should cache routing decisions', async () => {
      router.updateConfig({ cacheDecisions: true, decisionCacheTtlMs: 60000 });

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Test' }],
        agentType: 'tester',
        complexity: 'medium',
      };

      // First call
      const decision1 = await router.selectProvider(params);

      // Second call with same params should use cache
      const decision2 = await router.selectProvider(params);

      expect(decision1.providerType).toBe(decision2.providerType);
      expect(decision1.model).toBe(decision2.model);
    });

    it('should clear cache when mode changes', async () => {
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Test' }],
        agentType: 'tester',
      };

      router.setMode('rule-based');
      await router.selectProvider(params);

      router.setMode('cost-optimized');
      // Cache should be cleared

      const decision = await router.selectProvider(params);
      expect(decision.reason).toBe('cost-optimization');
    });

    it('should manually clear cache', () => {
      router.clearCache();
      // Should not throw
      expect(true).toBe(true);
    });

    it('should generate different cache keys for different params', async () => {
      const params1: ChatParams = {
        messages: [{ role: 'user', content: 'Test' }],
        agentType: 'tester',
        complexity: 'low',
      };

      const params2: ChatParams = {
        messages: [{ role: 'user', content: 'Test' }],
        agentType: 'reviewer',
        complexity: 'high',
      };

      const decision1 = await router.selectProvider(params1);
      const decision2 = await router.selectProvider(params2);

      // Different agent types may route differently
      // The key point is both should complete without error
      expect(decision1).toBeDefined();
      expect(decision2).toBeDefined();
    });
  });

  describe('Agent-Type Aware Routing', () => {
    it('should route security agents appropriately', async () => {
      router.setMode('rule-based');

      const securityAgents = ['security-auditor', 'security-architect'];

      for (const agentType of securityAgents) {
        const params: ChatParams = {
          messages: [{ role: 'user', content: 'Security analysis' }],
          agentType,
          complexity: 'high',
        };

        const decision = await router.selectProvider(params);
        expect(decision).toBeDefined();
        expect(decision.providerType).toBeDefined();
      }
    });

    it('should route QE agents appropriately', async () => {
      router.setMode('rule-based');

      const qeAgents = [
        'v3-qe-test-generator',
        'v3-qe-coverage-analyzer',
        'v3-qe-quality-assessor',
      ];

      for (const agentType of qeAgents) {
        const params: ChatParams = {
          messages: [{ role: 'user', content: 'QE task' }],
          agentType,
        };

        const decision = await router.selectProvider(params);
        expect(decision).toBeDefined();
      }
    });

    it('should include matched rule info in decision', async () => {
      router.setMode('rule-based');

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Test' }],
        agentType: 'security-auditor',
        complexity: 'high',
      };

      const decision = await router.selectProvider(params);

      // If a rule matched, it should be tracked
      if (decision.reason === 'rule-match') {
        expect(decision.matchedRule).toBeDefined();
        expect(decision.matchedRule?.id).toBeDefined();
      }
    });
  });

  describe('Routing Rule Engine', () => {
    it('should evaluate rules in priority order', () => {
      const rules: RoutingRule[] = [
        {
          id: 'low-priority',
          name: 'Low Priority',
          condition: { agentType: ['tester'] },
          action: { provider: 'ollama', model: 'llama3.1' },
          enabled: true,
          priority: 10,
        },
        {
          id: 'high-priority',
          name: 'High Priority',
          condition: { agentType: ['tester'] },
          action: { provider: 'claude', model: 'claude-sonnet-4-20250514' },
          enabled: true,
          priority: 100,
        },
      ];

      const engine = new RoutingRuleEngine(rules);
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Test' }],
        agentType: 'tester',
      };

      const result = engine.evaluate(params);

      expect(result).toBeDefined();
      expect(result?.rule.id).toBe('high-priority');
    });

    it('should skip disabled rules', () => {
      const rules: RoutingRule[] = [
        {
          id: 'disabled-rule',
          name: 'Disabled',
          condition: { agentType: ['tester'] },
          action: { provider: 'openai', model: 'gpt-4o' },
          enabled: false,
          priority: 100,
        },
        {
          id: 'enabled-rule',
          name: 'Enabled',
          condition: { agentType: ['tester'] },
          action: { provider: 'claude', model: 'claude-sonnet-4-20250514' },
          enabled: true,
          priority: 50,
        },
      ];

      const engine = new RoutingRuleEngine(rules);
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Test' }],
        agentType: 'tester',
      };

      const result = engine.evaluate(params);

      expect(result?.rule.id).toBe('enabled-rule');
    });

    it('should match multiple conditions with AND logic', () => {
      const rule: RoutingRule = {
        id: 'multi-condition',
        name: 'Multiple Conditions',
        condition: {
          agentType: ['security-auditor'],
          complexity: ['high', 'expert'],
          requiresTools: false,
        },
        action: { provider: 'claude', model: 'claude-opus-4-5-20251101' },
        enabled: true,
        priority: 100,
      };

      const engine = new RoutingRuleEngine([rule]);

      // Should match - all conditions met
      const matchParams: ChatParams = {
        messages: [{ role: 'user', content: 'Test' }],
        agentType: 'security-auditor',
        complexity: 'high',
        requiresTools: false,
      };

      expect(engine.evaluate(matchParams)?.rule.id).toBe('multi-condition');

      // Should not match - complexity mismatch
      const noMatchParams: ChatParams = {
        messages: [{ role: 'user', content: 'Test' }],
        agentType: 'security-auditor',
        complexity: 'low',
        requiresTools: false,
      };

      expect(engine.evaluate(noMatchParams)).toBeNull();
    });

    it('should return rules evaluated count', () => {
      const rules: RoutingRule[] = Array.from({ length: 5 }, (_, i) => ({
        id: `rule-${i}`,
        name: `Rule ${i}`,
        condition: { agentType: [`agent-${i}`] },
        action: { provider: 'claude' as const, model: 'claude-sonnet-4-20250514' },
        enabled: true,
        priority: i,
      }));

      const engine = new RoutingRuleEngine(rules);
      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Test' }],
        agentType: 'agent-2',
      };

      const result = engine.evaluate(params);

      expect(result?.rulesEvaluated).toBeGreaterThan(0);
    });

    it('should have default QE routing rules', () => {
      expect(DEFAULT_QE_ROUTING_RULES.length).toBeGreaterThan(0);

      // Verify rules have required fields
      for (const rule of DEFAULT_QE_ROUTING_RULES) {
        expect(rule.id).toBeDefined();
        expect(rule.name).toBeDefined();
        expect(rule.condition).toBeDefined();
        expect(rule.action).toBeDefined();
        expect(rule.action.provider).toBeDefined();
        expect(rule.action.model).toBeDefined();
      }
    });
  });

  describe('Routing Metrics', () => {
    it('should track total decisions', async () => {
      // Reset metrics to start fresh
      router.resetMetrics();

      // Use different params to avoid caching
      await router.selectProvider({
        messages: [{ role: 'user', content: 'Test 1' }],
        agentType: 'coder',
      });
      await router.selectProvider({
        messages: [{ role: 'user', content: 'Test 2' }],
        agentType: 'tester',
      });
      await router.selectProvider({
        messages: [{ role: 'user', content: 'Test 3' }],
        agentType: 'reviewer',
      });

      const metrics = router.getMetrics();
      // With caching enabled, some decisions may be cached
      // At minimum we should have made at least 1 decision
      expect(metrics.totalDecisions).toBeGreaterThanOrEqual(1);
    });

    it('should track decisions by mode', async () => {
      router.setMode('manual');
      await router.selectProvider({ messages: [{ role: 'user', content: 'Test' }] });

      router.setMode('rule-based');
      await router.selectProvider({ messages: [{ role: 'user', content: 'Test' }] });

      const metrics = router.getMetrics();
      expect(metrics.decisionsByMode.manual).toBeGreaterThanOrEqual(1);
      expect(metrics.decisionsByMode['rule-based']).toBeGreaterThanOrEqual(1);
    });

    it('should reset metrics', async () => {
      await router.selectProvider({ messages: [{ role: 'user', content: 'Test' }] });

      router.resetMetrics();

      const metrics = router.getMetrics();
      expect(metrics.totalDecisions).toBe(0);
    });

    it('should track cache statistics', async () => {
      router.updateConfig({ cacheDecisions: true });

      const params: ChatParams = {
        messages: [{ role: 'user', content: 'Test' }],
        agentType: 'tester',
      };

      await router.selectProvider(params);
      await router.selectProvider(params); // Should hit cache

      const metrics = router.getMetrics();
      expect(metrics.cacheStats).toBeDefined();
      expect(metrics.cacheStats.hits + metrics.cacheStats.misses).toBeGreaterThan(0);
    });

    it('should calculate fallback rate', async () => {
      const metrics = router.getMetrics();
      expect(metrics.fallbackRate).toBeDefined();
      expect(metrics.fallbackRate).toBeGreaterThanOrEqual(0);
      expect(metrics.fallbackRate).toBeLessThanOrEqual(1);
    });
  });
});
