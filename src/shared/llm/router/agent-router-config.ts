/**
 * Agentic QE v3 - Agent Router Configuration
 * ADR-043: Vendor-Independent LLM Support - Milestone 8
 *
 * Smart routing by agent type with:
 * - Comprehensive agent-to-model mapping for all 59+ QE agent types
 * - Capability-based routing (reasoning, tools, cost)
 * - Override mechanism for specific tasks
 * - Agent category detection and preferred model resolution
 */

import { LLMProviderType } from '../interfaces';
import { ExtendedProviderType, RoutingRule, TaskComplexity } from './types';

// ============================================================================
// Agent Category Types
// ============================================================================

/**
 * Agent categories for routing decisions
 */
export type AgentCategory =
  | 'security'           // Security-critical agents -> best reasoning models
  | 'test-generation'    // Test generators -> balanced models
  | 'code-analysis'      // Code analyzers -> balanced models
  | 'performance'        // Performance agents -> fast, cost-effective
  | 'documentation'      // Doc generators -> cost-effective
  | 'learning'           // ML/learning agents -> balanced models
  | 'coordination'       // Swarm coordinators -> fast models
  | 'simple'             // Simple tasks -> cheapest models
  | 'general';           // General purpose

/**
 * Model preference configuration
 */
export interface ModelPreference {
  /** Provider type */
  provider: ExtendedProviderType;
  /** Model identifier */
  model: string;
  /** Temperature for this agent type */
  temperature: number;
  /** Max tokens for typical requests */
  maxTokens?: number;
  /** Priority for rule ordering */
  priority: number;
}

/**
 * Agent capability requirements
 */
export interface AgentCapabilityRequirements {
  /** Requires advanced reasoning */
  requiresReasoning: boolean;
  /** Requires tool/function calling */
  requiresTools: boolean;
  /** Requires vision capabilities */
  requiresVision: boolean;
  /** Requires extended thinking */
  requiresExtendedThinking: boolean;
  /** Requires JSON mode */
  requiresJsonMode: boolean;
  /** Minimum context size needed */
  minContextSize: number;
  /** Cost sensitivity (low = prefer cheaper) */
  costSensitivity: 'low' | 'medium' | 'high';
  /** Latency sensitivity (high = prefer faster) */
  latencySensitivity: 'low' | 'medium' | 'high';
}

/**
 * Agent routing configuration
 */
export interface AgentRoutingConfig {
  /** Agent type identifier */
  agentType: string;
  /** Category for this agent */
  category: AgentCategory;
  /** Preferred model configuration */
  preferredModel: ModelPreference;
  /** Alternative models (fallback order) */
  alternativeModels: ModelPreference[];
  /** Capability requirements */
  capabilities: AgentCapabilityRequirements;
  /** Description of agent's purpose */
  description: string;
}

/**
 * Complete agent router configuration
 */
export interface AgentRouterConfig {
  /** Version of the configuration */
  version: string;
  /** All agent routing configurations */
  agents: Map<string, AgentRoutingConfig>;
  /** Category to model mappings */
  categoryDefaults: Map<AgentCategory, ModelPreference>;
  /** Override rules (highest priority) */
  overrides: AgentRoutingOverride[];
}

/**
 * Override configuration for specific scenarios
 */
export interface AgentRoutingOverride {
  /** Override identifier */
  id: string;
  /** Name of the override */
  name: string;
  /** Condition for applying override */
  condition: {
    agentTypes?: string[];
    taskPatterns?: RegExp[];
    complexity?: TaskComplexity[];
    requiresTools?: boolean;
    requiresReasoning?: boolean;
  };
  /** Model preference to use when override applies */
  modelPreference: ModelPreference;
  /** Whether override is enabled */
  enabled: boolean;
}

// ============================================================================
// Default Model Preferences by Category
// ============================================================================

/**
 * Default model preferences for each agent category
 */
export const DEFAULT_CATEGORY_MODELS: Record<AgentCategory, ModelPreference> = {
  // Security agents need best reasoning capabilities
  security: {
    provider: 'claude',
    model: 'claude-opus-4-5-20251101',
    temperature: 0.1,
    maxTokens: 16000,
    priority: 100,
  },

  // Test generation needs good balance of quality and speed
  'test-generation': {
    provider: 'claude',
    model: 'claude-sonnet-4-20250514',
    temperature: 0.3,
    maxTokens: 8000,
    priority: 90,
  },

  // Code analysis requires good understanding
  'code-analysis': {
    provider: 'claude',
    model: 'claude-sonnet-4-20250514',
    temperature: 0.2,
    maxTokens: 8000,
    priority: 85,
  },

  // Performance testing - fast models preferred
  performance: {
    provider: 'claude',
    model: 'claude-3-5-haiku-20241022',
    temperature: 0.2,
    maxTokens: 4000,
    priority: 70,
  },

  // Documentation - cost-effective
  documentation: {
    provider: 'claude',
    model: 'claude-3-5-haiku-20241022',
    temperature: 0.4,
    maxTokens: 4000,
    priority: 60,
  },

  // Learning/ML agents - balanced
  learning: {
    provider: 'claude',
    model: 'claude-sonnet-4-20250514',
    temperature: 0.3,
    maxTokens: 8000,
    priority: 80,
  },

  // Coordination agents - fast is important
  coordination: {
    provider: 'claude',
    model: 'claude-3-5-haiku-20241022',
    temperature: 0.2,
    maxTokens: 2000,
    priority: 75,
  },

  // Simple tasks - cheapest models
  simple: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.3,
    maxTokens: 2000,
    priority: 50,
  },

  // General purpose - balanced default
  general: {
    provider: 'claude',
    model: 'claude-sonnet-4-20250514',
    temperature: 0.3,
    maxTokens: 4000,
    priority: 60,
  },
};

// ============================================================================
// Agent Type to Category Mapping (All 59+ QE Agent Types)
// ============================================================================

/**
 * Comprehensive mapping of agent types to their categories
 */
export const AGENT_CATEGORY_MAP: Record<string, AgentCategory> = {
  // ===== Security Agents (Security-Critical) =====
  'security-auditor': 'security',
  'security-architect': 'security',
  'security-scanner': 'security',
  'v3-qe-security-scanner': 'security',
  'security-manager': 'security',
  'vulnerability-scanner': 'security',
  'penetration-tester': 'security',
  'compliance-auditor': 'security',
  'threat-analyzer': 'security',

  // ===== Test Generation Agents =====
  'test-generator': 'test-generation',
  'v3-qe-test-generator': 'test-generation',
  'tester': 'test-generation',
  'tdd-specialist': 'test-generation',
  'tdd-london-swarm': 'test-generation',
  'unit-test-generator': 'test-generation',
  'integration-test-generator': 'test-generation',
  'e2e-test-generator': 'test-generation',
  'mutation-tester': 'test-generation',
  'property-based-tester': 'test-generation',
  'contract-tester': 'test-generation',
  'v3-qe-contract-tester': 'test-generation',
  'api-tester': 'test-generation',
  'visual-tester': 'test-generation',
  'v3-qe-visual-tester': 'test-generation',
  'accessibility-tester': 'test-generation',

  // ===== Code Analysis Agents =====
  'code-reviewer': 'code-analysis',
  'code-analyzer': 'code-analysis',
  'reviewer': 'code-analysis',
  'v3-qe-code-intelligence': 'code-analysis',
  'v3-qe-code-analyzer': 'code-analysis',
  'coverage-analyzer': 'code-analysis',
  'v3-qe-coverage-analyzer': 'code-analysis',
  'defect-predictor': 'code-analysis',
  'v3-qe-defect-predictor': 'code-analysis',
  'static-analyzer': 'code-analysis',
  'complexity-analyzer': 'code-analysis',
  'dependency-analyzer': 'code-analysis',
  'refactoring-advisor': 'code-analysis',
  'quality-assessor': 'code-analysis',
  'v3-qe-quality-assessor': 'code-analysis',

  // ===== Test Execution Agents =====
  'test-executor': 'code-analysis',
  'v3-qe-test-executor': 'code-analysis',
  'parallel-executor': 'code-analysis',
  'flaky-test-detector': 'code-analysis',
  'test-orchestrator': 'code-analysis',

  // ===== Performance Agents =====
  'performance-tester': 'performance',
  'performance-engineer': 'performance',
  'perf-analyzer': 'performance',
  'performance-benchmarker': 'performance',
  'load-tester': 'performance',
  'stress-tester': 'performance',
  'v3-qe-chaos-engineer': 'performance',
  'chaos-engineer': 'performance',
  'resilience-tester': 'performance',
  'scalability-tester': 'performance',

  // ===== Documentation Agents =====
  'api-docs': 'documentation',
  'doc-generator': 'documentation',
  'readme-generator': 'documentation',
  'changelog-generator': 'documentation',
  'specification-writer': 'documentation',

  // ===== Learning/Optimization Agents =====
  'v3-qe-learning-optimizer': 'learning',
  'learning-optimizer': 'learning',
  'ml-developer': 'learning',
  'pattern-learner': 'learning',
  'optimization-agent': 'learning',
  'smart-agent': 'learning',

  // ===== Requirements/Validation Agents =====
  'requirements-validator': 'code-analysis',
  'v3-qe-requirements-validator': 'code-analysis',
  'bdd-generator': 'test-generation',
  'acceptance-tester': 'test-generation',

  // ===== Coordination/Swarm Agents =====
  'coordinator': 'coordination',
  'hierarchical-coordinator': 'coordination',
  'mesh-coordinator': 'coordination',
  'adaptive-coordinator': 'coordination',
  'collective-intelligence-coordinator': 'coordination',
  'swarm-memory-manager': 'coordination',
  'byzantine-coordinator': 'coordination',
  'raft-manager': 'coordination',
  'gossip-coordinator': 'coordination',
  'consensus-builder': 'coordination',
  'crdt-synchronizer': 'coordination',
  'quorum-manager': 'coordination',
  'task-orchestrator': 'coordination',
  'memory-coordinator': 'coordination',

  // ===== Development Agents =====
  'coder': 'code-analysis',
  'planner': 'code-analysis',
  'researcher': 'code-analysis',
  'backend-dev': 'code-analysis',
  'mobile-dev': 'code-analysis',
  'cicd-engineer': 'code-analysis',
  'system-architect': 'code-analysis',
  'base-template-generator': 'test-generation',

  // ===== GitHub/Repository Agents =====
  'github-modes': 'coordination',
  'pr-manager': 'coordination',
  'code-review-swarm': 'code-analysis',
  'issue-tracker': 'coordination',
  'release-manager': 'coordination',
  'workflow-automation': 'coordination',
  'project-board-sync': 'coordination',
  'repo-architect': 'code-analysis',
  'multi-repo-swarm': 'coordination',

  // ===== SPARC Methodology Agents =====
  'sparc-coord': 'coordination',
  'sparc-coder': 'code-analysis',
  'specification': 'documentation',
  'pseudocode': 'code-analysis',
  'architecture': 'code-analysis',
  'refinement': 'code-analysis',

  // ===== Memory Specialists =====
  'memory-specialist': 'learning',

  // ===== Production Validation =====
  'production-validator': 'code-analysis',
};

// ============================================================================
// Default Capability Requirements by Category
// ============================================================================

/**
 * Default capability requirements for each agent category
 */
export const DEFAULT_CATEGORY_CAPABILITIES: Record<AgentCategory, AgentCapabilityRequirements> = {
  security: {
    requiresReasoning: true,
    requiresTools: true,
    requiresVision: false,
    requiresExtendedThinking: true,
    requiresJsonMode: true,
    minContextSize: 100000,
    costSensitivity: 'low',
    latencySensitivity: 'low',
  },

  'test-generation': {
    requiresReasoning: true,
    requiresTools: true,
    requiresVision: false,
    requiresExtendedThinking: false,
    requiresJsonMode: true,
    minContextSize: 50000,
    costSensitivity: 'medium',
    latencySensitivity: 'medium',
  },

  'code-analysis': {
    requiresReasoning: true,
    requiresTools: true,
    requiresVision: false,
    requiresExtendedThinking: false,
    requiresJsonMode: true,
    minContextSize: 50000,
    costSensitivity: 'medium',
    latencySensitivity: 'medium',
  },

  performance: {
    requiresReasoning: false,
    requiresTools: true,
    requiresVision: false,
    requiresExtendedThinking: false,
    requiresJsonMode: true,
    minContextSize: 16000,
    costSensitivity: 'high',
    latencySensitivity: 'high',
  },

  documentation: {
    requiresReasoning: false,
    requiresTools: false,
    requiresVision: false,
    requiresExtendedThinking: false,
    requiresJsonMode: false,
    minContextSize: 16000,
    costSensitivity: 'high',
    latencySensitivity: 'medium',
  },

  learning: {
    requiresReasoning: true,
    requiresTools: true,
    requiresVision: false,
    requiresExtendedThinking: false,
    requiresJsonMode: true,
    minContextSize: 50000,
    costSensitivity: 'medium',
    latencySensitivity: 'medium',
  },

  coordination: {
    requiresReasoning: false,
    requiresTools: true,
    requiresVision: false,
    requiresExtendedThinking: false,
    requiresJsonMode: true,
    minContextSize: 16000,
    costSensitivity: 'medium',
    latencySensitivity: 'high',
  },

  simple: {
    requiresReasoning: false,
    requiresTools: false,
    requiresVision: false,
    requiresExtendedThinking: false,
    requiresJsonMode: false,
    minContextSize: 4000,
    costSensitivity: 'high',
    latencySensitivity: 'medium',
  },

  general: {
    requiresReasoning: false,
    requiresTools: true,
    requiresVision: false,
    requiresExtendedThinking: false,
    requiresJsonMode: false,
    minContextSize: 16000,
    costSensitivity: 'medium',
    latencySensitivity: 'medium',
  },
};

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get the category for an agent type
 * @param agentType - The agent type identifier
 * @returns The category for routing decisions
 */
export function getAgentRoutingCategory(agentType: string): AgentCategory {
  // Direct lookup first
  if (agentType in AGENT_CATEGORY_MAP) {
    return AGENT_CATEGORY_MAP[agentType];
  }

  // Pattern-based detection
  const lowerType = agentType.toLowerCase();

  // Security patterns
  if (lowerType.includes('security') || lowerType.includes('audit') ||
      lowerType.includes('vulnerab') || lowerType.includes('penetration') ||
      lowerType.includes('threat') || lowerType.includes('compliance')) {
    return 'security';
  }

  // Test generation patterns
  if (lowerType.includes('test-gen') || lowerType.includes('tdd') ||
      lowerType.includes('unit-test') || lowerType.includes('e2e-test') ||
      lowerType.includes('integration-test') || lowerType.includes('mutation')) {
    return 'test-generation';
  }

  // Code analysis patterns
  if (lowerType.includes('code-') || lowerType.includes('coverage') ||
      lowerType.includes('defect') || lowerType.includes('review') ||
      lowerType.includes('analyzer') || lowerType.includes('quality')) {
    return 'code-analysis';
  }

  // Performance patterns
  if (lowerType.includes('perf') || lowerType.includes('load') ||
      lowerType.includes('stress') || lowerType.includes('benchmark') ||
      lowerType.includes('chaos') || lowerType.includes('resilience')) {
    return 'performance';
  }

  // Documentation patterns
  if (lowerType.includes('doc') || lowerType.includes('readme') ||
      lowerType.includes('changelog') || lowerType.includes('spec')) {
    return 'documentation';
  }

  // Learning patterns
  if (lowerType.includes('learn') || lowerType.includes('ml-') ||
      lowerType.includes('pattern') || lowerType.includes('optim')) {
    return 'learning';
  }

  // Coordination patterns
  if (lowerType.includes('coord') || lowerType.includes('swarm') ||
      lowerType.includes('orchestrat') || lowerType.includes('consensus') ||
      lowerType.includes('manager')) {
    return 'coordination';
  }

  return 'general';
}

/**
 * Get the preferred model for an agent type
 * @param agentType - The agent type identifier
 * @returns The model preference configuration
 */
export function getPreferredModelForAgent(agentType: string): ModelPreference {
  const category = getAgentRoutingCategory(agentType);
  return DEFAULT_CATEGORY_MODELS[category];
}

/**
 * Get capability requirements for an agent type
 * @param agentType - The agent type identifier
 * @returns The capability requirements
 */
export function getAgentCapabilityRequirements(agentType: string): AgentCapabilityRequirements {
  const category = getAgentRoutingCategory(agentType);
  return DEFAULT_CATEGORY_CAPABILITIES[category];
}

/**
 * Get all agent types in a specific category
 * @param category - The agent category
 * @returns Array of agent types in that category
 */
export function getAgentsByCategory(category: AgentCategory): string[] {
  return Object.entries(AGENT_CATEGORY_MAP)
    .filter(([_, cat]) => cat === category)
    .map(([agentType, _]) => agentType);
}

/**
 * Check if an agent type requires advanced reasoning
 * @param agentType - The agent type identifier
 * @returns True if advanced reasoning is required
 */
export function requiresAdvancedReasoning(agentType: string): boolean {
  const capabilities = getAgentCapabilityRequirements(agentType);
  return capabilities.requiresReasoning || capabilities.requiresExtendedThinking;
}

/**
 * Check if an agent type is cost-sensitive
 * @param agentType - The agent type identifier
 * @returns True if the agent is cost-sensitive
 */
export function isCostSensitive(agentType: string): boolean {
  const capabilities = getAgentCapabilityRequirements(agentType);
  return capabilities.costSensitivity === 'high';
}

/**
 * Check if an agent type is latency-sensitive
 * @param agentType - The agent type identifier
 * @returns True if the agent is latency-sensitive
 */
export function isLatencySensitive(agentType: string): boolean {
  const capabilities = getAgentCapabilityRequirements(agentType);
  return capabilities.latencySensitivity === 'high';
}

// ============================================================================
// Routing Rule Generation
// ============================================================================

/**
 * Create routing rules for a specific agent type
 * @param agentType - The agent type identifier
 * @returns A routing rule for this agent type
 */
export function createAgentRoutingRule(agentType: string): RoutingRule {
  const preference = getPreferredModelForAgent(agentType);
  const category = getAgentRoutingCategory(agentType);
  const capabilities = getAgentCapabilityRequirements(agentType);

  return {
    id: `agent-${agentType}`,
    name: `Route ${agentType} to ${preference.model}`,
    description: `Optimized routing for ${category} agent: ${agentType}`,
    condition: {
      agentType: [agentType],
      requiresReasoning: capabilities.requiresReasoning,
    },
    action: {
      provider: preference.provider,
      model: preference.model,
      temperature: preference.temperature,
      maxTokens: preference.maxTokens,
      priority: preference.priority,
    },
    enabled: true,
    priority: preference.priority,
  };
}

/**
 * Create routing rules for all agents in a category
 * @param category - The agent category
 * @returns Array of routing rules for all agents in the category
 */
export function createCategoryRoutingRules(category: AgentCategory): RoutingRule[] {
  const agentTypes = getAgentsByCategory(category);
  return agentTypes.map(createAgentRoutingRule);
}

/**
 * Create routing rules for multiple agent types
 * @param agentTypes - Array of agent types
 * @returns Array of routing rules
 */
export function createAgentAwareRules(agentTypes: string[]): RoutingRule[] {
  return agentTypes.map(createAgentRoutingRule);
}

/**
 * Create comprehensive routing rules for all known agent types
 * @returns Array of all agent routing rules, sorted by priority
 */
export function createAllAgentRoutingRules(): RoutingRule[] {
  const allAgentTypes = Object.keys(AGENT_CATEGORY_MAP);
  const rules = allAgentTypes.map(createAgentRoutingRule);

  // Sort by priority (highest first)
  return rules.sort((a, b) => b.priority - a.priority);
}

// ============================================================================
// Override Configuration
// ============================================================================

/**
 * Default routing overrides for special scenarios
 */
export const DEFAULT_ROUTING_OVERRIDES: AgentRoutingOverride[] = [
  {
    id: 'high-complexity-any-agent',
    name: 'High Complexity Override',
    condition: {
      complexity: ['high', 'expert'],
      requiresReasoning: true,
    },
    modelPreference: {
      provider: 'claude',
      model: 'claude-opus-4-5-20251101',
      temperature: 0.2,
      maxTokens: 16000,
      priority: 150,
    },
    enabled: true,
  },
  {
    id: 'cost-optimization-simple-tasks',
    name: 'Cost Optimization for Simple Tasks',
    condition: {
      complexity: ['trivial', 'low'],
    },
    modelPreference: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 2000,
      priority: 40,
    },
    enabled: true,
  },
  {
    id: 'local-only-privacy-sensitive',
    name: 'Local Only for Privacy',
    condition: {
      taskPatterns: [/privacy/i, /confidential/i, /sensitive/i, /pii/i],
    },
    modelPreference: {
      provider: 'ollama',
      model: 'llama3.1:70b',
      temperature: 0.2,
      maxTokens: 4000,
      priority: 200,
    },
    enabled: true,
  },
  {
    id: 'tools-required-sonnet',
    name: 'Tool-Heavy Tasks to Sonnet',
    condition: {
      requiresTools: true,
    },
    modelPreference: {
      provider: 'claude',
      model: 'claude-sonnet-4-20250514',
      temperature: 0.3,
      maxTokens: 8000,
      priority: 95,
    },
    enabled: true,
  },
];

// ============================================================================
// Alternative Model Configurations
// ============================================================================

/**
 * Alternative models for each category (fallback order)
 */
export const ALTERNATIVE_MODELS: Record<AgentCategory, ModelPreference[]> = {
  security: [
    { provider: 'openai', model: 'gpt-4o', temperature: 0.1, priority: 90 },
    { provider: 'claude', model: 'claude-sonnet-4-20250514', temperature: 0.1, priority: 80 },
    { provider: 'openrouter', model: 'anthropic/claude-opus-4.5', temperature: 0.1, priority: 70 },
  ],

  'test-generation': [
    { provider: 'openai', model: 'gpt-4o', temperature: 0.3, priority: 80 },
    { provider: 'claude', model: 'claude-3-5-haiku-20241022', temperature: 0.3, priority: 70 },
    { provider: 'gemini', model: 'gemini-2.0-pro', temperature: 0.3, priority: 60 },
  ],

  'code-analysis': [
    { provider: 'openai', model: 'gpt-4o', temperature: 0.2, priority: 75 },
    { provider: 'claude', model: 'claude-3-5-haiku-20241022', temperature: 0.2, priority: 65 },
    { provider: 'gemini', model: 'gemini-2.0-pro', temperature: 0.2, priority: 55 },
  ],

  performance: [
    { provider: 'openai', model: 'gpt-4o-mini', temperature: 0.2, priority: 60 },
    { provider: 'gemini', model: 'gemini-2.0-flash', temperature: 0.2, priority: 50 },
    { provider: 'ollama', model: 'llama3.1', temperature: 0.2, priority: 40 },
  ],

  documentation: [
    { provider: 'openai', model: 'gpt-4o-mini', temperature: 0.4, priority: 50 },
    { provider: 'gemini', model: 'gemini-2.0-flash', temperature: 0.4, priority: 40 },
    { provider: 'ollama', model: 'llama3.1', temperature: 0.4, priority: 30 },
  ],

  learning: [
    { provider: 'openai', model: 'gpt-4o', temperature: 0.3, priority: 70 },
    { provider: 'claude', model: 'claude-3-5-haiku-20241022', temperature: 0.3, priority: 60 },
    { provider: 'gemini', model: 'gemini-2.0-pro', temperature: 0.3, priority: 50 },
  ],

  coordination: [
    { provider: 'openai', model: 'gpt-4o-mini', temperature: 0.2, priority: 65 },
    { provider: 'gemini', model: 'gemini-2.0-flash', temperature: 0.2, priority: 55 },
    { provider: 'ollama', model: 'llama3.1', temperature: 0.2, priority: 45 },
  ],

  simple: [
    { provider: 'gemini', model: 'gemini-2.0-flash', temperature: 0.3, priority: 40 },
    { provider: 'claude', model: 'claude-3-5-haiku-20241022', temperature: 0.3, priority: 30 },
    { provider: 'ollama', model: 'phi4', temperature: 0.3, priority: 20 },
  ],

  general: [
    { provider: 'openai', model: 'gpt-4o', temperature: 0.3, priority: 50 },
    { provider: 'claude', model: 'claude-3-5-haiku-20241022', temperature: 0.3, priority: 40 },
    { provider: 'gemini', model: 'gemini-2.0-pro', temperature: 0.3, priority: 30 },
  ],
};

/**
 * Get alternative models for an agent type
 * @param agentType - The agent type identifier
 * @returns Array of alternative model preferences
 */
export function getAlternativeModelsForAgent(agentType: string): ModelPreference[] {
  const category = getAgentRoutingCategory(agentType);
  return ALTERNATIVE_MODELS[category];
}

// ============================================================================
// Configuration Builder
// ============================================================================

/**
 * Build a complete agent router configuration
 * @param options - Optional configuration overrides
 * @returns Complete agent router configuration
 */
export function buildAgentRouterConfig(options?: {
  includeAllAgents?: boolean;
  categories?: AgentCategory[];
  customOverrides?: AgentRoutingOverride[];
}): AgentRouterConfig {
  const {
    includeAllAgents = true,
    categories,
    customOverrides = [],
  } = options ?? {};

  const agents = new Map<string, AgentRoutingConfig>();

  // Determine which agent types to include
  let agentTypes: string[];
  if (categories) {
    agentTypes = categories.flatMap(getAgentsByCategory);
  } else if (includeAllAgents) {
    agentTypes = Object.keys(AGENT_CATEGORY_MAP);
  } else {
    agentTypes = [];
  }

  // Build agent configurations
  for (const agentType of agentTypes) {
    const category = getAgentRoutingCategory(agentType);
    const preferredModel = getPreferredModelForAgent(agentType);
    const capabilities = getAgentCapabilityRequirements(agentType);
    const alternativeModels = getAlternativeModelsForAgent(agentType);

    agents.set(agentType, {
      agentType,
      category,
      preferredModel,
      alternativeModels,
      capabilities,
      description: `${category} agent for ${agentType} tasks`,
    });
  }

  // Build category defaults map
  const categoryDefaults = new Map<AgentCategory, ModelPreference>();
  for (const [category, preference] of Object.entries(DEFAULT_CATEGORY_MODELS)) {
    categoryDefaults.set(category as AgentCategory, preference);
  }

  // Merge overrides
  const allOverrides = [...DEFAULT_ROUTING_OVERRIDES, ...customOverrides];

  return {
    version: '1.0.0',
    agents,
    categoryDefaults,
    overrides: allOverrides,
  };
}

// ============================================================================
// Exports Summary
// ============================================================================

/**
 * Exported types and constants for agent routing:
 *
 * Types:
 * - AgentCategory: Category types for routing
 * - ModelPreference: Model configuration
 * - AgentCapabilityRequirements: Capability flags
 * - AgentRoutingConfig: Complete agent config
 * - AgentRouterConfig: Full router config
 * - AgentRoutingOverride: Override configuration
 *
 * Constants:
 * - DEFAULT_CATEGORY_MODELS: Default model per category
 * - AGENT_CATEGORY_MAP: Agent type to category mapping
 * - DEFAULT_CATEGORY_CAPABILITIES: Default capabilities per category
 * - DEFAULT_ROUTING_OVERRIDES: Default override rules
 * - ALTERNATIVE_MODELS: Fallback models per category
 *
 * Functions:
 * - getAgentRoutingCategory: Get category for agent type
 * - getPreferredModelForAgent: Get preferred model for agent
 * - getAgentCapabilityRequirements: Get capabilities for agent
 * - getAgentsByCategory: Get all agents in a category
 * - requiresAdvancedReasoning: Check if agent needs reasoning
 * - isCostSensitive: Check if agent is cost-sensitive
 * - isLatencySensitive: Check if agent is latency-sensitive
 * - createAgentRoutingRule: Create rule for single agent
 * - createCategoryRoutingRules: Create rules for category
 * - createAgentAwareRules: Create rules for agent list
 * - createAllAgentRoutingRules: Create rules for all agents
 * - getAlternativeModelsForAgent: Get fallback models
 * - buildAgentRouterConfig: Build complete config
 */
