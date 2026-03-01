/**
 * Agentic QE v3 - Routing Rules Engine
 * ADR-043: Vendor-Independent LLM Support - Milestone 3 & 8
 *
 * Rule engine for evaluating routing conditions and selecting providers:
 * - Condition evaluation with AND logic
 * - Priority-based rule ordering
 * - Agent-type aware routing with smart category detection
 * - Default QE agent routing rules for all 59+ agent types
 * - Capability-based routing (reasoning, tools, cost)
 *
 * Milestone 8 Enhancements:
 * - Comprehensive agent-to-model mapping configuration
 * - Agent category detection with pattern matching
 * - Override mechanism for specific tasks
 */

import { LLMProviderType } from '../interfaces';
import {
  RoutingRule,
  RuleCondition,
  ChatParams,
  TaskComplexity,
  ExtendedProviderType,
} from './types';
import {
  AgentCategory,
  getAgentRoutingCategory,
  getPreferredModelForAgent,
  getAgentCapabilityRequirements,
  createAllAgentRoutingRules,
  AGENT_CATEGORY_MAP,
  DEFAULT_CATEGORY_MODELS,
  ModelPreference,
} from './agent-router-config';

// ============================================================================
// Rule Engine
// ============================================================================

/**
 * Engine for evaluating routing rules
 */
export class RoutingRuleEngine {
  private rules: RoutingRule[] = [];

  constructor(rules: RoutingRule[] = []) {
    this.setRules(rules);
  }

  /**
   * Set routing rules (sorts by priority)
   */
  setRules(rules: RoutingRule[]): void {
    this.rules = [...rules]
      .filter((rule) => rule.enabled)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get current rules
   */
  getRules(): RoutingRule[] {
    return [...this.rules];
  }

  /**
   * Add a new rule
   */
  addRule(rule: RoutingRule): void {
    this.rules.push(rule);
    this.rules = this.rules
      .filter((r) => r.enabled)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Remove a rule by ID
   */
  removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex((r) => r.id === ruleId);
    if (index >= 0) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Enable or disable a rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): boolean {
    const rule = this.rules.find((r) => r.id === ruleId);
    if (rule) {
      rule.enabled = enabled;
      this.rules = this.rules
        .filter((r) => r.enabled)
        .sort((a, b) => b.priority - a.priority);
      return true;
    }
    return false;
  }

  /**
   * Evaluate rules against chat parameters and return matching rule
   * Returns null if no rules match
   */
  evaluate(params: ChatParams): { rule: RoutingRule; rulesEvaluated: number } | null {
    let rulesEvaluated = 0;

    for (const rule of this.rules) {
      rulesEvaluated++;
      if (this.matchesCondition(params, rule.condition)) {
        return { rule, rulesEvaluated };
      }
    }

    return null;
  }

  /**
   * Get all rules that match the given parameters
   */
  evaluateAll(params: ChatParams): RoutingRule[] {
    return this.rules.filter((rule) => this.matchesCondition(params, rule.condition));
  }

  /**
   * Check if parameters match a condition
   * All specified conditions must match (AND logic)
   */
  private matchesCondition(params: ChatParams, condition: RuleCondition): boolean {
    // Agent type check
    if (condition.agentType !== undefined) {
      if (!params.agentType || !condition.agentType.includes(params.agentType)) {
        return false;
      }
    }

    // Tools requirement check
    if (condition.requiresTools !== undefined) {
      if (!!params.requiresTools !== condition.requiresTools) {
        return false;
      }
    }

    // Complexity check (can be single value or array)
    if (condition.complexity !== undefined) {
      const complexities = Array.isArray(condition.complexity)
        ? condition.complexity
        : [condition.complexity];
      if (!params.complexity || !complexities.includes(params.complexity)) {
        return false;
      }
    }

    // Local only check
    if (condition.localOnly !== undefined && condition.localOnly) {
      // If localOnly is true, preferredProvider must be a local provider
      const localProviders: ExtendedProviderType[] = ['ollama', 'onnx'];
      if (
        params.preferredProvider &&
        !localProviders.includes(params.preferredProvider as ExtendedProviderType)
      ) {
        return false;
      }
    }

    // Reasoning requirement check
    if (condition.requiresReasoning !== undefined) {
      // This is a hint - complex reasoning should route to advanced models
      if (condition.requiresReasoning && params.complexity === 'low') {
        return false;
      }
    }

    // Token range check
    if (condition.tokenRange !== undefined) {
      const estimatedTokens = this.estimateTokens(params);
      if (condition.tokenRange.min !== undefined && estimatedTokens < condition.tokenRange.min) {
        return false;
      }
      if (condition.tokenRange.max !== undefined && estimatedTokens > condition.tokenRange.max) {
        return false;
      }
    }

    // Required capabilities check
    if (condition.requiredCapabilities !== undefined && condition.requiredCapabilities.length > 0) {
      if (!params.requiredCapabilities || params.requiredCapabilities.length === 0) {
        return false;
      }
      const hasAllCapabilities = condition.requiredCapabilities.every((cap) =>
        params.requiredCapabilities!.includes(cap)
      );
      if (!hasAllCapabilities) {
        return false;
      }
    }

    // Custom condition check
    if (condition.custom !== undefined) {
      if (!condition.custom(params)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Estimate token count from chat parameters
   */
  private estimateTokens(params: ChatParams): number {
    let tokens = 0;

    // Estimate system prompt tokens
    if (params.systemPrompt) {
      tokens += Math.ceil(params.systemPrompt.length / 4);
    }

    // Estimate message tokens
    for (const message of params.messages) {
      tokens += Math.ceil(message.content.length / 4);
    }

    return tokens;
  }
}

// ============================================================================
// Default QE Routing Rules
// ============================================================================

/**
 * Default routing rules for QE agents
 * These rules optimize provider selection based on agent capabilities
 */
export const DEFAULT_QE_ROUTING_RULES: RoutingRule[] = [
  // Security agents need most capable models
  {
    id: 'security-agents-opus',
    name: 'Security Agents to Claude Opus',
    description: 'Route security-critical agents to Claude Opus for best security analysis',
    condition: {
      agentType: ['security-auditor', 'security-architect', 'v3-qe-security-scanner'],
    },
    action: {
      provider: 'claude',
      model: 'claude-opus-4-5-20251101',
      temperature: 0.1,
    },
    enabled: true,
    priority: 100,
  },

  // Test generation with tools
  {
    id: 'test-gen-with-tools',
    name: 'Test Generation with Tools',
    description: 'Route test generation requests that need tools to Claude Sonnet',
    condition: {
      agentType: ['v3-qe-test-generator', 'tester'],
      requiresTools: true,
    },
    action: {
      provider: 'claude',
      model: 'claude-sonnet-4-20250514',
      temperature: 0.3,
    },
    enabled: true,
    priority: 95,
  },

  // High complexity reasoning tasks
  {
    id: 'high-complexity-reasoning',
    name: 'High Complexity Reasoning',
    description: 'Route high complexity tasks requiring reasoning to advanced models',
    condition: {
      complexity: 'high',
      requiresReasoning: true,
    },
    action: {
      provider: 'claude',
      model: 'claude-opus-4-5-20251101',
      temperature: 0.2,
    },
    enabled: true,
    priority: 90,
  },

  // Code analysis agents
  {
    id: 'code-analysis-agents',
    name: 'Code Analysis Agents',
    description: 'Route code analysis to Claude Sonnet for balanced performance',
    condition: {
      agentType: ['code-analyzer', 'v3-qe-code-intelligence', 'reviewer'],
    },
    action: {
      provider: 'claude',
      model: 'claude-sonnet-4-20250514',
      temperature: 0.2,
    },
    enabled: true,
    priority: 85,
  },

  // Coverage analysis agents
  {
    id: 'coverage-analysis',
    name: 'Coverage Analysis Agents',
    description: 'Route coverage analysis to efficient models',
    condition: {
      agentType: ['v3-qe-coverage-analyzer'],
    },
    action: {
      provider: 'claude',
      model: 'claude-sonnet-4-20250514',
      temperature: 0.1,
    },
    enabled: true,
    priority: 80,
  },

  // Defect prediction - needs good reasoning
  {
    id: 'defect-prediction',
    name: 'Defect Prediction Agents',
    description: 'Route defect prediction to capable models',
    condition: {
      agentType: ['v3-qe-defect-predictor'],
    },
    action: {
      provider: 'claude',
      model: 'claude-sonnet-4-20250514',
      temperature: 0.3,
    },
    enabled: true,
    priority: 75,
  },

  // Medium complexity - use Sonnet
  {
    id: 'medium-complexity',
    name: 'Medium Complexity Tasks',
    description: 'Route medium complexity to balanced Claude Sonnet',
    condition: {
      complexity: 'medium',
    },
    action: {
      provider: 'claude',
      model: 'claude-sonnet-4-20250514',
      temperature: 0.3,
    },
    enabled: true,
    priority: 60,
  },

  // Low complexity - use Haiku for cost savings
  {
    id: 'low-complexity-haiku',
    name: 'Low Complexity to Haiku',
    description: 'Route low complexity tasks to Haiku for cost efficiency',
    condition: {
      complexity: 'low',
    },
    action: {
      provider: 'claude',
      model: 'claude-3-5-haiku-20241022',
      temperature: 0.3,
    },
    enabled: true,
    priority: 50,
  },

  // Local-only requests to Ollama
  {
    id: 'local-only-ollama',
    name: 'Local Only Requests',
    description: 'Route local-only requests to Ollama',
    condition: {
      localOnly: true,
    },
    action: {
      provider: 'ollama',
      model: 'llama3.1',
      temperature: 0.3,
    },
    enabled: true,
    priority: 40,
  },

  // Small token requests - use efficient models
  {
    id: 'small-requests-haiku',
    name: 'Small Token Requests',
    description: 'Route small requests to Haiku for efficiency',
    condition: {
      tokenRange: { max: 500 },
    },
    action: {
      provider: 'claude',
      model: 'claude-3-5-haiku-20241022',
      temperature: 0.3,
    },
    enabled: true,
    priority: 30,
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a custom routing rule
 */
export function createRoutingRule(
  id: string,
  name: string,
  condition: RuleCondition,
  action: Omit<RoutingRule['action'], 'priority'>,
  options?: {
    description?: string;
    enabled?: boolean;
    priority?: number;
  }
): RoutingRule {
  return {
    id,
    name,
    description: options?.description,
    condition,
    action: {
      ...action,
      priority: options?.priority,
    },
    enabled: options?.enabled ?? true,
    priority: options?.priority ?? 50,
  };
}

/**
 * Merge custom rules with default QE rules
 * Custom rules take precedence if they have same or higher priority
 */
export function mergeWithDefaultRules(customRules: RoutingRule[]): RoutingRule[] {
  const defaultIds = new Set(DEFAULT_QE_ROUTING_RULES.map((r) => r.id));
  const merged: RoutingRule[] = [];

  // Add custom rules first
  for (const rule of customRules) {
    merged.push(rule);
    // Remove default rule if custom has same ID
    defaultIds.delete(rule.id);
  }

  // Add remaining default rules
  for (const rule of DEFAULT_QE_ROUTING_RULES) {
    if (defaultIds.has(rule.id)) {
      merged.push(rule);
    }
  }

  // Sort by priority
  return merged.sort((a, b) => b.priority - a.priority);
}

/**
 * Get complexity from estimated tokens
 */
export function inferComplexity(estimatedTokens: number): TaskComplexity {
  if (estimatedTokens < 500) return 'low';
  if (estimatedTokens < 2000) return 'medium';
  return 'high';
}

// ============================================================================
// Enhanced Agent-Aware Routing (ADR-043 Milestone 8)
// ============================================================================

/**
 * Extended agent category type (comprehensive)
 * Re-export from agent-router-config for convenience
 */
export type ExtendedAgentCategory = AgentCategory;

/**
 * Get the comprehensive agent category with full type support
 * @param agentType - The agent type identifier
 * @returns The detailed agent category
 */
export function getExtendedAgentCategory(agentType: string): AgentCategory {
  return getAgentRoutingCategory(agentType);
}

/**
 * Get the preferred model configuration for an agent type
 * @param agentType - The agent type identifier
 * @returns Model preference with provider, model, temperature, and priority
 */
export function getModelPreferenceForAgent(agentType: string): ModelPreference {
  return getPreferredModelForAgent(agentType);
}

/**
 * Check if an agent type requires advanced reasoning models
 * @param agentType - The agent type identifier
 * @returns True if the agent requires advanced reasoning
 */
export function agentRequiresAdvancedReasoning(agentType: string): boolean {
  const capabilities = getAgentCapabilityRequirements(agentType);
  return capabilities.requiresReasoning || capabilities.requiresExtendedThinking;
}

/**
 * Check if an agent type is cost-sensitive (should use cheaper models)
 * @param agentType - The agent type identifier
 * @returns True if the agent is cost-sensitive
 */
export function agentIsCostSensitive(agentType: string): boolean {
  const capabilities = getAgentCapabilityRequirements(agentType);
  return capabilities.costSensitivity === 'high';
}

/**
 * Check if an agent type is latency-sensitive (should use faster models)
 * @param agentType - The agent type identifier
 * @returns True if the agent is latency-sensitive
 */
export function agentIsLatencySensitive(agentType: string): boolean {
  const capabilities = getAgentCapabilityRequirements(agentType);
  return capabilities.latencySensitivity === 'high';
}

/**
 * Get all agent types that belong to a specific category
 * @param category - The agent category
 * @returns Array of agent type identifiers
 */
export function getAgentTypesInCategory(category: AgentCategory): string[] {
  return Object.entries(AGENT_CATEGORY_MAP)
    .filter(([_, cat]) => cat === category)
    .map(([agentType]) => agentType);
}

/**
 * Get all known agent categories
 * @returns Array of all agent categories
 */
export function getAllAgentCategories(): AgentCategory[] {
  return [
    'security',
    'test-generation',
    'code-analysis',
    'performance',
    'documentation',
    'learning',
    'coordination',
    'simple',
    'general',
  ];
}

/**
 * Get the default model preference for a category
 * @param category - The agent category
 * @returns Model preference for the category
 */
export function getCategoryModelPreference(category: AgentCategory): ModelPreference {
  return DEFAULT_CATEGORY_MODELS[category];
}

/**
 * Create a routing rule based on agent type with optimal model selection
 * @param agentType - The agent type identifier
 * @param overrides - Optional overrides for the default configuration
 * @returns A routing rule configured for the agent type
 */
export function createAgentBasedRoutingRule(
  agentType: string,
  overrides?: {
    provider?: ExtendedProviderType;
    model?: string;
    temperature?: number;
    priority?: number;
    enabled?: boolean;
  }
): RoutingRule {
  const preference = getPreferredModelForAgent(agentType);
  const category = getAgentRoutingCategory(agentType);
  const capabilities = getAgentCapabilityRequirements(agentType);

  return {
    id: `agent-routing-${agentType}`,
    name: `Smart Routing for ${agentType}`,
    description: `Optimized ${category} routing: routes to ${preference.model} based on agent capabilities`,
    condition: {
      agentType: [agentType],
      requiresReasoning: capabilities.requiresReasoning,
    },
    action: {
      provider: overrides?.provider ?? preference.provider,
      model: overrides?.model ?? preference.model,
      temperature: overrides?.temperature ?? preference.temperature,
      priority: overrides?.priority ?? preference.priority,
    },
    enabled: overrides?.enabled ?? true,
    priority: overrides?.priority ?? preference.priority,
  };
}

/**
 * Create routing rules for all agents in a category
 * @param category - The agent category
 * @param overrides - Optional overrides for all rules in the category
 * @returns Array of routing rules for the category
 */
export function createCategoryBasedRoutingRules(
  category: AgentCategory,
  overrides?: {
    provider?: ExtendedProviderType;
    model?: string;
    temperature?: number;
    priorityBoost?: number;
  }
): RoutingRule[] {
  const agentTypes = getAgentTypesInCategory(category);
  const categoryPreference = getCategoryModelPreference(category);

  return agentTypes.map((agentType) => {
    const baseRule = createAgentBasedRoutingRule(agentType);
    if (overrides) {
      baseRule.action.provider = overrides.provider ?? baseRule.action.provider;
      baseRule.action.model = overrides.model ?? baseRule.action.model;
      baseRule.action.temperature = overrides.temperature ?? baseRule.action.temperature;
      if (overrides.priorityBoost) {
        baseRule.priority += overrides.priorityBoost;
        baseRule.action.priority = baseRule.priority;
      }
    }
    return baseRule;
  });
}

/**
 * Generate comprehensive routing rules for all 59+ QE agent types
 * Uses the agent-router-config for optimal model selection
 * @returns Array of routing rules sorted by priority
 */
export function generateComprehensiveAgentRules(): RoutingRule[] {
  return createAllAgentRoutingRules();
}

/**
 * Merge agent-aware rules with existing rules, respecting priority
 * Agent-specific rules take precedence when they have higher priority
 * @param existingRules - Current routing rules
 * @param agentTypes - Agent types to add rules for
 * @returns Merged array of routing rules
 */
export function mergeAgentAwareRules(
  existingRules: RoutingRule[],
  agentTypes: string[]
): RoutingRule[] {
  const existingIds = new Set(existingRules.map((r) => r.id));
  const agentRules = agentTypes
    .map((agentType) => createAgentBasedRoutingRule(agentType))
    .filter((r) => !existingIds.has(r.id));

  const merged = [...existingRules, ...agentRules];
  return merged.sort((a, b) => b.priority - a.priority);
}
