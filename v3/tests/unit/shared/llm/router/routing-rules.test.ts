/**
 * Agentic QE v3 - Routing Rules Engine Unit Tests
 * ADR-043: Vendor-Independent LLM Support - Milestones 3 & 8
 *
 * Tests for the RoutingRuleEngine class covering:
 * - Rule evaluation with AND logic
 * - Priority-based rule ordering
 * - Agent-type aware routing
 * - Default QE routing rules
 *
 * Milestone 8 Tests:
 * - Smart routing by agent type
 * - Agent category detection
 * - Model preference resolution
 * - Capability requirements
 * - Agent-aware rule generation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RoutingRuleEngine,
  DEFAULT_QE_ROUTING_RULES,
  createRoutingRule,
  mergeWithDefaultRules,
  inferComplexity,
  // Milestone 8 exports
  getExtendedAgentCategory,
  getModelPreferenceForAgent,
  agentRequiresAdvancedReasoning,
  agentIsCostSensitive,
  agentIsLatencySensitive,
  getAgentTypesInCategory,
  getAllAgentCategories,
  getCategoryModelPreference,
  createAgentBasedRoutingRule,
  createCategoryBasedRoutingRules,
  generateComprehensiveAgentRules,
  mergeAgentAwareRules,
  // Agent router config exports
  getAgentRoutingCategory,
  getPreferredModelForAgent,
  getAgentCapabilityRequirements,
  getAgentsByCategory,
  createAgentAwareRules,
  createAllAgentRoutingRules,
  getAlternativeModelsForAgent,
  buildAgentRouterConfig,
  DEFAULT_CATEGORY_MODELS,
  AGENT_CATEGORY_MAP,
  DEFAULT_CATEGORY_CAPABILITIES,
} from '../../../../../src/shared/llm/router';
import type {
  RoutingRule,
  RuleCondition,
  ChatParams,
  TaskComplexity,
  AgentCategory,
  ModelPreference,
} from '../../../../../src/shared/llm/router';

// ============================================================================
// Test Suite
// ============================================================================

describe('RoutingRuleEngine', () => {
  let engine: RoutingRuleEngine;

  beforeEach(() => {
    engine = new RoutingRuleEngine();
  });

  // ==========================================================================
  // Basic Engine Operations
  // ==========================================================================

  describe('Basic Operations', () => {
    it('should initialize with empty rules', () => {
      const rules = engine.getRules();
      expect(rules).toEqual([]);
    });

    it('should set rules and sort by priority', () => {
      const rules: RoutingRule[] = [
        createRule('low', 10),
        createRule('high', 100),
        createRule('medium', 50),
      ];

      engine.setRules(rules);
      const sorted = engine.getRules();

      expect(sorted[0].id).toBe('high');
      expect(sorted[1].id).toBe('medium');
      expect(sorted[2].id).toBe('low');
    });

    it('should add a new rule', () => {
      engine.addRule(createRule('rule1', 50));
      engine.addRule(createRule('rule2', 100));

      const rules = engine.getRules();
      expect(rules).toHaveLength(2);
      expect(rules[0].id).toBe('rule2'); // Higher priority first
    });

    it('should remove a rule by ID', () => {
      engine.setRules([createRule('rule1', 50), createRule('rule2', 100)]);

      const removed = engine.removeRule('rule1');
      expect(removed).toBe(true);
      expect(engine.getRules()).toHaveLength(1);
      expect(engine.getRules()[0].id).toBe('rule2');
    });

    it('should return false when removing non-existent rule', () => {
      const removed = engine.removeRule('non-existent');
      expect(removed).toBe(false);
    });

    it('should enable/disable rules', () => {
      engine.setRules([createRule('rule1', 50, true)]);

      engine.setRuleEnabled('rule1', false);
      // Disabled rules are filtered out
      expect(engine.getRules()).toHaveLength(0);
    });

    it('should filter out disabled rules', () => {
      const rules: RoutingRule[] = [
        createRule('enabled', 100, true),
        createRule('disabled', 50, false),
      ];

      engine.setRules(rules);
      const active = engine.getRules();

      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('enabled');
    });
  });

  // ==========================================================================
  // Rule Evaluation
  // ==========================================================================

  describe('Rule Evaluation', () => {
    it('should return null when no rules match', () => {
      engine.setRules([
        createRuleWithCondition('rule1', { agentType: ['specific-agent'] }),
      ]);

      const result = engine.evaluate({
        messages: [{ role: 'user', content: 'test' }],
        agentType: 'different-agent',
      });

      expect(result).toBeNull();
    });

    it('should return matching rule with rules evaluated count', () => {
      engine.setRules([
        createRuleWithCondition('rule1', { agentType: ['target-agent'] }),
      ]);

      const result = engine.evaluate({
        messages: [{ role: 'user', content: 'test' }],
        agentType: 'target-agent',
      });

      expect(result).not.toBeNull();
      expect(result!.rule.id).toBe('rule1');
      expect(result!.rulesEvaluated).toBe(1);
    });

    it('should return first matching rule by priority', () => {
      engine.setRules([
        createRuleWithCondition('low-priority', { agentType: ['agent'] }, 10),
        createRuleWithCondition('high-priority', { agentType: ['agent'] }, 100),
      ]);

      const result = engine.evaluate({
        messages: [{ role: 'user', content: 'test' }],
        agentType: 'agent',
      });

      expect(result!.rule.id).toBe('high-priority');
    });

    it('should evaluate all matching rules', () => {
      engine.setRules([
        createRuleWithCondition('rule1', { agentType: ['agent'] }),
        createRuleWithCondition('rule2', { agentType: ['agent'] }),
        createRuleWithCondition('rule3', { agentType: ['other'] }),
      ]);

      const matches = engine.evaluateAll({
        messages: [{ role: 'user', content: 'test' }],
        agentType: 'agent',
      });

      expect(matches).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Condition Matching
  // ==========================================================================

  describe('Condition Matching', () => {
    describe('Agent Type Condition', () => {
      it('should match single agent type', () => {
        engine.setRules([
          createRuleWithCondition('rule', { agentType: ['security-auditor'] }),
        ]);

        const result = engine.evaluate({
          messages: [{ role: 'user', content: 'test' }],
          agentType: 'security-auditor',
        });

        expect(result).not.toBeNull();
      });

      it('should match any agent type in list', () => {
        engine.setRules([
          createRuleWithCondition('rule', {
            agentType: ['security-auditor', 'security-architect'],
          }),
        ]);

        const result = engine.evaluate({
          messages: [{ role: 'user', content: 'test' }],
          agentType: 'security-architect',
        });

        expect(result).not.toBeNull();
      });

      it('should not match when agent type missing', () => {
        engine.setRules([
          createRuleWithCondition('rule', { agentType: ['specific-agent'] }),
        ]);

        const result = engine.evaluate({
          messages: [{ role: 'user', content: 'test' }],
        });

        expect(result).toBeNull();
      });
    });

    describe('Tools Requirement Condition', () => {
      it('should match when tools required and present', () => {
        engine.setRules([
          createRuleWithCondition('rule', { requiresTools: true }),
        ]);

        const result = engine.evaluate({
          messages: [{ role: 'user', content: 'test' }],
          requiresTools: true,
        });

        expect(result).not.toBeNull();
      });

      it('should not match when tools required but not present', () => {
        engine.setRules([
          createRuleWithCondition('rule', { requiresTools: true }),
        ]);

        const result = engine.evaluate({
          messages: [{ role: 'user', content: 'test' }],
          requiresTools: false,
        });

        expect(result).toBeNull();
      });
    });

    describe('Complexity Condition', () => {
      it('should match exact complexity level', () => {
        engine.setRules([
          createRuleWithCondition('rule', { complexity: 'high' }),
        ]);

        const result = engine.evaluate({
          messages: [{ role: 'user', content: 'test' }],
          complexity: 'high',
        });

        expect(result).not.toBeNull();
      });

      it('should not match different complexity', () => {
        engine.setRules([
          createRuleWithCondition('rule', { complexity: 'high' }),
        ]);

        const result = engine.evaluate({
          messages: [{ role: 'user', content: 'test' }],
          complexity: 'low',
        });

        expect(result).toBeNull();
      });
    });

    describe('Token Range Condition', () => {
      it('should match when tokens within range', () => {
        engine.setRules([
          createRuleWithCondition('rule', { tokenRange: { min: 100, max: 500 } }),
        ]);

        const result = engine.evaluate({
          messages: [{ role: 'user', content: 'x'.repeat(1000) }], // ~250 tokens
        });

        expect(result).not.toBeNull();
      });

      it('should not match when tokens below minimum', () => {
        engine.setRules([
          createRuleWithCondition('rule', { tokenRange: { min: 1000 } }),
        ]);

        const result = engine.evaluate({
          messages: [{ role: 'user', content: 'short' }],
        });

        expect(result).toBeNull();
      });

      it('should not match when tokens above maximum', () => {
        engine.setRules([
          createRuleWithCondition('rule', { tokenRange: { max: 100 } }),
        ]);

        const result = engine.evaluate({
          messages: [{ role: 'user', content: 'x'.repeat(2000) }], // ~500 tokens
        });

        expect(result).toBeNull();
      });
    });

    describe('Required Capabilities Condition', () => {
      it('should match when all capabilities present', () => {
        engine.setRules([
          createRuleWithCondition('rule', {
            requiredCapabilities: ['streaming', 'tools'],
          }),
        ]);

        const result = engine.evaluate({
          messages: [{ role: 'user', content: 'test' }],
          requiredCapabilities: ['streaming', 'tools', 'vision'],
        });

        expect(result).not.toBeNull();
      });

      it('should not match when capabilities missing', () => {
        engine.setRules([
          createRuleWithCondition('rule', {
            requiredCapabilities: ['streaming', 'tools'],
          }),
        ]);

        const result = engine.evaluate({
          messages: [{ role: 'user', content: 'test' }],
          requiredCapabilities: ['streaming'],
        });

        expect(result).toBeNull();
      });
    });

    describe('Custom Condition', () => {
      it('should evaluate custom condition function', () => {
        engine.setRules([
          createRuleWithCondition('rule', {
            custom: (params) => params.messages.length > 2,
          }),
        ]);

        const result = engine.evaluate({
          messages: [
            { role: 'user', content: '1' },
            { role: 'assistant', content: '2' },
            { role: 'user', content: '3' },
          ],
        });

        expect(result).not.toBeNull();
      });
    });

    describe('AND Logic', () => {
      it('should require all conditions to match', () => {
        engine.setRules([
          createRuleWithCondition('rule', {
            agentType: ['test-agent'],
            complexity: 'high',
            requiresTools: true,
          }),
        ]);

        // All conditions match
        const result1 = engine.evaluate({
          messages: [{ role: 'user', content: 'test' }],
          agentType: 'test-agent',
          complexity: 'high',
          requiresTools: true,
        });
        expect(result1).not.toBeNull();

        // Missing one condition
        const result2 = engine.evaluate({
          messages: [{ role: 'user', content: 'test' }],
          agentType: 'test-agent',
          complexity: 'high',
          requiresTools: false,
        });
        expect(result2).toBeNull();
      });
    });
  });

  // ==========================================================================
  // Default QE Rules
  // ==========================================================================

  describe('Default QE Rules', () => {
    beforeEach(() => {
      engine.setRules(DEFAULT_QE_ROUTING_RULES);
    });

    it('should have security agent rules', () => {
      const result = engine.evaluate({
        messages: [{ role: 'user', content: 'analyze security' }],
        agentType: 'security-auditor',
      });

      expect(result).not.toBeNull();
      expect(result!.rule.action.model).toContain('opus');
    });

    it('should have test generation rules', () => {
      const result = engine.evaluate({
        messages: [{ role: 'user', content: 'generate tests' }],
        agentType: 'v3-qe-test-generator',
        requiresTools: true,
      });

      expect(result).not.toBeNull();
    });

    it('should have complexity-based rules', () => {
      const lowResult = engine.evaluate({
        messages: [{ role: 'user', content: 'simple task' }],
        complexity: 'low',
      });

      const highResult = engine.evaluate({
        messages: [{ role: 'user', content: 'complex task' }],
        complexity: 'high',
      });

      expect(lowResult!.rule.action.model).toContain('haiku');
      expect(highResult).not.toBeNull();
    });
  });
});

// ============================================================================
// Helper Functions Tests
// ============================================================================

describe('Helper Functions', () => {
  describe('createRoutingRule', () => {
    it('should create a rule with required fields', () => {
      const rule = createRoutingRule(
        'test-rule',
        'Test Rule',
        { agentType: ['agent'] },
        { provider: 'claude', model: 'test-model' }
      );

      expect(rule.id).toBe('test-rule');
      expect(rule.name).toBe('Test Rule');
      expect(rule.enabled).toBe(true);
      expect(rule.priority).toBe(50); // Default
    });

    it('should accept optional fields', () => {
      const rule = createRoutingRule(
        'test-rule',
        'Test Rule',
        { agentType: ['agent'] },
        { provider: 'claude', model: 'test-model' },
        { description: 'Test description', priority: 100, enabled: false }
      );

      expect(rule.description).toBe('Test description');
      expect(rule.priority).toBe(100);
      expect(rule.enabled).toBe(false);
    });
  });

  describe('mergeWithDefaultRules', () => {
    it('should merge custom rules with defaults', () => {
      const customRules: RoutingRule[] = [
        createRoutingRule(
          'custom-rule',
          'Custom Rule',
          { agentType: ['custom'] },
          { provider: 'claude', model: 'custom-model' },
          { priority: 200 }
        ),
      ];

      const merged = mergeWithDefaultRules(customRules);

      // Custom rule should be first (highest priority)
      expect(merged[0].id).toBe('custom-rule');
      // Should include default rules
      expect(merged.length).toBeGreaterThan(1);
    });

    it('should override default rules with same ID', () => {
      const customRules: RoutingRule[] = [
        createRoutingRule(
          'security-agents-opus', // Same ID as default
          'Override Security Rule',
          { agentType: ['custom-security'] },
          { provider: 'openai', model: 'gpt-4o' },
          { priority: 200 }
        ),
      ];

      const merged = mergeWithDefaultRules(customRules);
      const securityRule = merged.find((r) => r.id === 'security-agents-opus');

      expect(securityRule!.action.provider).toBe('openai');
    });
  });

  describe('inferComplexity', () => {
    it('should return low for small token counts', () => {
      expect(inferComplexity(100)).toBe('low');
      expect(inferComplexity(499)).toBe('low');
    });

    it('should return medium for medium token counts', () => {
      expect(inferComplexity(500)).toBe('medium');
      expect(inferComplexity(1999)).toBe('medium');
    });

    it('should return high for large token counts', () => {
      expect(inferComplexity(2000)).toBe('high');
      expect(inferComplexity(10000)).toBe('high');
    });
  });

  describe('getAgentRoutingCategory', () => {
    it('should categorize security agents', () => {
      expect(getAgentRoutingCategory('security-auditor')).toBe('security');
      expect(getAgentRoutingCategory('security-architect')).toBe('security');
      expect(getAgentRoutingCategory('v3-qe-security-scanner')).toBe('security');
    });

    it('should categorize testing agents', () => {
      expect(getAgentRoutingCategory('tester')).toBe('test-generation');
      expect(getAgentRoutingCategory('v3-qe-test-generator')).toBe('test-generation');
    });

    it('should categorize analysis agents', () => {
      expect(getAgentRoutingCategory('code-analyzer')).toBe('code-analysis');
      expect(getAgentRoutingCategory('reviewer')).toBe('code-analysis');
    });

    it('should return general for unknown agents', () => {
      expect(getAgentRoutingCategory('unknown-agent')).toBe('general');
      expect(getAgentRoutingCategory('custom-agent')).toBe('general');
    });
  });
});

// ============================================================================
// Test Helpers
// ============================================================================

function createRule(
  id: string,
  priority: number,
  enabled: boolean = true
): RoutingRule {
  return {
    id,
    name: `Rule ${id}`,
    condition: {},
    action: { provider: 'claude', model: 'test-model' },
    enabled,
    priority,
  };
}

function createRuleWithCondition(
  id: string,
  condition: RuleCondition,
  priority: number = 50
): RoutingRule {
  return {
    id,
    name: `Rule ${id}`,
    condition,
    action: { provider: 'claude', model: 'test-model' },
    enabled: true,
    priority,
  };
}

// ============================================================================
// ADR-043 Milestone 8: Agent-Aware Routing Tests
// ============================================================================

describe('Agent-Aware Routing (Milestone 8)', () => {
  // ==========================================================================
  // Agent Category Detection Tests
  // ==========================================================================

  describe('Agent Category Detection', () => {
    it('should detect security agents correctly', () => {
      const securityAgents = [
        'security-auditor',
        'security-architect',
        'v3-qe-security-scanner',
        'security-manager',
        'vulnerability-scanner',
      ];

      for (const agent of securityAgents) {
        expect(getAgentRoutingCategory(agent)).toBe('security');
        expect(getExtendedAgentCategory(agent)).toBe('security');
      }
    });

    it('should detect test-generation agents correctly', () => {
      const testAgents = [
        'test-generator',
        'v3-qe-test-generator',
        'tester',
        'tdd-specialist',
        'unit-test-generator',
      ];

      for (const agent of testAgents) {
        expect(getAgentRoutingCategory(agent)).toBe('test-generation');
      }
    });

    it('should detect code-analysis agents correctly', () => {
      const analysisAgents = [
        'code-reviewer',
        'code-analyzer',
        'reviewer',
        'coverage-analyzer',
        'defect-predictor',
      ];

      for (const agent of analysisAgents) {
        expect(getAgentRoutingCategory(agent)).toBe('code-analysis');
      }
    });

    it('should detect performance agents correctly', () => {
      const perfAgents = [
        'performance-tester',
        'performance-engineer',
        'load-tester',
        'chaos-engineer',
      ];

      for (const agent of perfAgents) {
        expect(getAgentRoutingCategory(agent)).toBe('performance');
      }
    });

    it('should detect coordination agents correctly', () => {
      const coordAgents = [
        'coordinator',
        'hierarchical-coordinator',
        'swarm-memory-manager',
        'task-orchestrator',
      ];

      for (const agent of coordAgents) {
        expect(getAgentRoutingCategory(agent)).toBe('coordination');
      }
    });

    it('should use pattern matching for unknown agents', () => {
      // Security patterns
      expect(getAgentRoutingCategory('custom-security-agent')).toBe('security');
      expect(getAgentRoutingCategory('my-audit-tool')).toBe('security');

      // Test patterns
      expect(getAgentRoutingCategory('my-test-generator')).toBe('test-generation');
      expect(getAgentRoutingCategory('custom-tdd-agent')).toBe('test-generation');

      // Analysis patterns
      expect(getAgentRoutingCategory('my-code-analyzer')).toBe('code-analysis');
      expect(getAgentRoutingCategory('quality-checker')).toBe('code-analysis');

      // Performance patterns
      expect(getAgentRoutingCategory('load-test-runner')).toBe('performance');
      expect(getAgentRoutingCategory('benchmark-agent')).toBe('performance');
    });

    it('should return general for truly unknown agents', () => {
      expect(getAgentRoutingCategory('unknown-agent-xyz')).toBe('general');
      expect(getAgentRoutingCategory('random-thing')).toBe('general');
    });
  });

  // ==========================================================================
  // Model Preference Resolution Tests
  // ==========================================================================

  describe('Model Preference Resolution', () => {
    it('should return opus model for security agents', () => {
      const preference = getPreferredModelForAgent('security-auditor');
      expect(preference.model).toContain('opus');
      expect(preference.provider).toBe('claude');
      expect(preference.temperature).toBeLessThanOrEqual(0.2);
    });

    it('should return sonnet model for test generation agents', () => {
      const preference = getPreferredModelForAgent('v3-qe-test-generator');
      expect(preference.model).toContain('sonnet');
      expect(preference.provider).toBe('claude');
    });

    it('should return sonnet model for code analysis agents', () => {
      const preference = getPreferredModelForAgent('code-reviewer');
      expect(preference.model).toContain('sonnet');
    });

    it('should return haiku model for performance agents', () => {
      const preference = getPreferredModelForAgent('performance-tester');
      expect(preference.model).toContain('haiku');
    });

    it('should return haiku model for coordination agents', () => {
      const preference = getPreferredModelForAgent('coordinator');
      expect(preference.model).toContain('haiku');
    });

    it('should return appropriate model for simple tasks', () => {
      const preference = getCategoryModelPreference('simple');
      expect(preference.provider).toBe('openai');
      expect(preference.model).toContain('mini');
    });

    it('should have priority values set correctly', () => {
      const securityPreference = getPreferredModelForAgent('security-auditor');
      const simplePreference = getCategoryModelPreference('simple');

      expect(securityPreference.priority).toBeGreaterThan(simplePreference.priority);
    });
  });

  // ==========================================================================
  // Capability Requirements Tests
  // ==========================================================================

  describe('Capability Requirements', () => {
    it('should require advanced reasoning for security agents', () => {
      const capabilities = getAgentCapabilityRequirements('security-auditor');
      expect(capabilities.requiresReasoning).toBe(true);
      expect(capabilities.requiresExtendedThinking).toBe(true);
    });

    it('should have correct capabilities for test generation', () => {
      const capabilities = getAgentCapabilityRequirements('v3-qe-test-generator');
      expect(capabilities.requiresReasoning).toBe(true);
      expect(capabilities.requiresTools).toBe(true);
      expect(capabilities.requiresJsonMode).toBe(true);
    });

    it('should be cost-sensitive for performance agents', () => {
      const capabilities = getAgentCapabilityRequirements('load-tester');
      expect(capabilities.costSensitivity).toBe('high');
    });

    it('should be latency-sensitive for coordination agents', () => {
      const capabilities = getAgentCapabilityRequirements('coordinator');
      expect(capabilities.latencySensitivity).toBe('high');
    });

    it('should detect advanced reasoning requirement correctly', () => {
      expect(agentRequiresAdvancedReasoning('security-auditor')).toBe(true);
      expect(agentRequiresAdvancedReasoning('performance-tester')).toBe(false);
    });

    it('should detect cost sensitivity correctly', () => {
      expect(agentIsCostSensitive('performance-tester')).toBe(true);
      expect(agentIsCostSensitive('security-auditor')).toBe(false);
    });

    it('should detect latency sensitivity correctly', () => {
      expect(agentIsLatencySensitive('coordinator')).toBe(true);
      expect(agentIsLatencySensitive('security-auditor')).toBe(false);
    });
  });

  // ==========================================================================
  // Agent Type by Category Tests
  // ==========================================================================

  describe('Agent Types by Category', () => {
    it('should return all security agents', () => {
      const securityAgents = getAgentsByCategory('security');
      expect(securityAgents).toContain('security-auditor');
      expect(securityAgents).toContain('security-architect');
      expect(securityAgents).toContain('v3-qe-security-scanner');
      expect(securityAgents.length).toBeGreaterThanOrEqual(5);
    });

    it('should return all test generation agents', () => {
      const testAgents = getAgentsByCategory('test-generation');
      expect(testAgents).toContain('test-generator');
      expect(testAgents).toContain('tester');
      expect(testAgents.length).toBeGreaterThanOrEqual(10);
    });

    it('should return all code analysis agents', () => {
      const analysisAgents = getAgentsByCategory('code-analysis');
      expect(analysisAgents).toContain('code-reviewer');
      expect(analysisAgents).toContain('reviewer');
      expect(analysisAgents.length).toBeGreaterThanOrEqual(10);
    });

    it('should return all categories', () => {
      const categories = getAllAgentCategories();
      expect(categories).toContain('security');
      expect(categories).toContain('test-generation');
      expect(categories).toContain('code-analysis');
      expect(categories).toContain('performance');
      expect(categories).toContain('documentation');
      expect(categories).toContain('learning');
      expect(categories).toContain('coordination');
      expect(categories).toContain('simple');
      expect(categories).toContain('general');
      expect(categories.length).toBe(9);
    });
  });

  // ==========================================================================
  // Agent-Based Rule Generation Tests
  // ==========================================================================

  describe('Agent-Based Rule Generation', () => {
    it('should create routing rule for single agent', () => {
      const rule = createAgentBasedRoutingRule('security-auditor');

      expect(rule.id).toBe('agent-routing-security-auditor');
      expect(rule.condition.agentType).toContain('security-auditor');
      expect(rule.action.model).toContain('opus');
      expect(rule.enabled).toBe(true);
    });

    it('should allow overrides in rule creation', () => {
      const rule = createAgentBasedRoutingRule('test-generator', {
        provider: 'openai',
        model: 'gpt-4o',
        temperature: 0.5,
        priority: 200,
      });

      expect(rule.action.provider).toBe('openai');
      expect(rule.action.model).toBe('gpt-4o');
      expect(rule.action.temperature).toBe(0.5);
      expect(rule.priority).toBe(200);
    });

    it('should create rules for entire category', () => {
      const rules = createCategoryBasedRoutingRules('security');

      expect(rules.length).toBeGreaterThanOrEqual(5);
      rules.forEach((rule) => {
        expect(rule.action.model).toContain('opus');
        expect(rule.enabled).toBe(true);
      });
    });

    it('should apply category overrides to all rules', () => {
      const rules = createCategoryBasedRoutingRules('performance', {
        provider: 'ollama',
        model: 'llama3.1',
        priorityBoost: 50,
      });

      rules.forEach((rule) => {
        expect(rule.action.provider).toBe('ollama');
        expect(rule.action.model).toBe('llama3.1');
      });
    });

    it('should generate comprehensive rules for all agents', () => {
      const rules = generateComprehensiveAgentRules();

      // Should have rules for all known agent types
      expect(rules.length).toBeGreaterThanOrEqual(50);

      // Rules should be sorted by priority
      for (let i = 1; i < rules.length; i++) {
        expect(rules[i - 1].priority).toBeGreaterThanOrEqual(rules[i].priority);
      }
    });

    it('should create rules using createAgentAwareRules', () => {
      const rules = createAgentAwareRules(['security-auditor', 'test-generator']);

      expect(rules.length).toBe(2);
      expect(rules.find((r) => r.condition.agentType?.includes('security-auditor'))).toBeDefined();
      expect(rules.find((r) => r.condition.agentType?.includes('test-generator'))).toBeDefined();
    });
  });

  // ==========================================================================
  // Rule Merging Tests
  // ==========================================================================

  describe('Agent-Aware Rule Merging', () => {
    it('should merge agent rules with existing rules', () => {
      const existingRules: RoutingRule[] = [
        createRule('existing-rule', 100),
      ];

      const merged = mergeAgentAwareRules(existingRules, ['security-auditor', 'tester']);

      expect(merged.length).toBe(3);
      expect(merged[0].id).toBe('existing-rule'); // Highest priority
    });

    it('should not duplicate existing rules', () => {
      const existingRules: RoutingRule[] = [
        {
          id: 'agent-routing-security-auditor',
          name: 'Existing Security Rule',
          condition: { agentType: ['security-auditor'] },
          action: { provider: 'claude', model: 'custom-model' },
          enabled: true,
          priority: 200,
        },
      ];

      const merged = mergeAgentAwareRules(existingRules, ['security-auditor', 'tester']);

      expect(merged.length).toBe(2); // Only one new rule added
      expect(merged.find((r) => r.id === 'agent-routing-security-auditor')?.action.model).toBe(
        'custom-model'
      );
    });

    it('should sort merged rules by priority', () => {
      const existingRules: RoutingRule[] = [
        createRule('low-priority', 10),
      ];

      const merged = mergeAgentAwareRules(existingRules, ['security-auditor']);

      expect(merged[0].id).toBe('agent-routing-security-auditor'); // Security has high priority
      expect(merged[1].id).toBe('low-priority');
    });
  });

  // ==========================================================================
  // Alternative Models Tests
  // ==========================================================================

  describe('Alternative Models', () => {
    it('should return alternative models for security agents', () => {
      const alternatives = getAlternativeModelsForAgent('security-auditor');

      expect(alternatives.length).toBeGreaterThanOrEqual(2);
      expect(alternatives[0].provider).not.toBe('claude'); // First alternative is different
    });

    it('should return alternative models for test generation', () => {
      const alternatives = getAlternativeModelsForAgent('test-generator');

      expect(alternatives.length).toBeGreaterThanOrEqual(2);
    });

    it('should have alternatives sorted by priority', () => {
      const alternatives = getAlternativeModelsForAgent('code-reviewer');

      for (let i = 1; i < alternatives.length; i++) {
        expect(alternatives[i - 1].priority).toBeGreaterThanOrEqual(alternatives[i].priority);
      }
    });
  });

  // ==========================================================================
  // Configuration Builder Tests
  // ==========================================================================

  describe('Agent Router Configuration Builder', () => {
    it('should build complete configuration with all agents', () => {
      const config = buildAgentRouterConfig({ includeAllAgents: true });

      expect(config.version).toBe('1.0.0');
      expect(config.agents.size).toBeGreaterThanOrEqual(50);
      expect(config.categoryDefaults.size).toBe(9);
      expect(config.overrides.length).toBeGreaterThanOrEqual(4);
    });

    it('should build configuration for specific categories', () => {
      const config = buildAgentRouterConfig({
        categories: ['security', 'test-generation'],
      });

      expect(config.agents.size).toBeGreaterThan(0);

      // All agents should be from specified categories
      for (const [_, agentConfig] of config.agents) {
        expect(['security', 'test-generation']).toContain(agentConfig.category);
      }
    });

    it('should include custom overrides', () => {
      const customOverride = {
        id: 'custom-override',
        name: 'Custom Override',
        condition: { complexity: ['high' as const] },
        modelPreference: {
          provider: 'openai' as const,
          model: 'gpt-4o',
          temperature: 0.2,
          priority: 300,
        },
        enabled: true,
      };

      const config = buildAgentRouterConfig({
        customOverrides: [customOverride],
      });

      expect(config.overrides.find((o) => o.id === 'custom-override')).toBeDefined();
    });

    it('should have correct category defaults', () => {
      const config = buildAgentRouterConfig();

      const securityDefault = config.categoryDefaults.get('security');
      expect(securityDefault?.model).toContain('opus');

      const performanceDefault = config.categoryDefaults.get('performance');
      expect(performanceDefault?.model).toContain('haiku');
    });
  });

  // ==========================================================================
  // Extended Categories Tests (replaced deprecated getAgentCategory)
  // ==========================================================================

  describe('Extended Categories', () => {
    it('should use getAgentRoutingCategory for extended categories', () => {
      // Security remains security
      expect(getAgentRoutingCategory('security-auditor')).toBe('security');

      // Test-generation uses new category name
      expect(getAgentRoutingCategory('v3-qe-test-generator')).toBe('test-generation');

      // Code-analysis category
      expect(getAgentRoutingCategory('code-analyzer')).toBe('code-analysis');

      // General remains general
      expect(getAgentRoutingCategory('unknown-agent')).toBe('general');
    });

    it('should map to extended categories', () => {
      // Performance has its own category
      expect(getAgentRoutingCategory('performance-tester')).toBe('performance');

      // Learning has its own category
      expect(getAgentRoutingCategory('v3-qe-learning-optimizer')).toBe('learning');

      // Coordination has its own category
      expect(getAgentRoutingCategory('coordinator')).toBe('coordination');
    });
  });

  // ==========================================================================
  // Default Constants Tests
  // ==========================================================================

  describe('Default Constants', () => {
    it('should have all category models defined', () => {
      expect(DEFAULT_CATEGORY_MODELS.security).toBeDefined();
      expect(DEFAULT_CATEGORY_MODELS['test-generation']).toBeDefined();
      expect(DEFAULT_CATEGORY_MODELS['code-analysis']).toBeDefined();
      expect(DEFAULT_CATEGORY_MODELS.performance).toBeDefined();
      expect(DEFAULT_CATEGORY_MODELS.documentation).toBeDefined();
      expect(DEFAULT_CATEGORY_MODELS.learning).toBeDefined();
      expect(DEFAULT_CATEGORY_MODELS.coordination).toBeDefined();
      expect(DEFAULT_CATEGORY_MODELS.simple).toBeDefined();
      expect(DEFAULT_CATEGORY_MODELS.general).toBeDefined();
    });

    it('should have comprehensive agent category map', () => {
      // Check a few key agents are mapped
      expect(AGENT_CATEGORY_MAP['security-auditor']).toBe('security');
      expect(AGENT_CATEGORY_MAP['test-generator']).toBe('test-generation');
      expect(AGENT_CATEGORY_MAP['code-reviewer']).toBe('code-analysis');
      expect(AGENT_CATEGORY_MAP['performance-tester']).toBe('performance');

      // Should have 50+ agents mapped
      expect(Object.keys(AGENT_CATEGORY_MAP).length).toBeGreaterThanOrEqual(50);
    });

    it('should have capability defaults for all categories', () => {
      expect(DEFAULT_CATEGORY_CAPABILITIES.security).toBeDefined();
      expect(DEFAULT_CATEGORY_CAPABILITIES.security.requiresReasoning).toBe(true);

      expect(DEFAULT_CATEGORY_CAPABILITIES.performance).toBeDefined();
      expect(DEFAULT_CATEGORY_CAPABILITIES.performance.costSensitivity).toBe('high');
    });
  });
});
