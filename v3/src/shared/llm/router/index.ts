/**
 * Agentic QE v3 - HybridRouter Module
 * ADR-043: Vendor-Independent LLM Support - Milestones 3, 8 & 11
 *
 * Exports for the HybridRouter system providing intelligent
 * provider selection with 4 routing modes:
 * - manual: Explicit provider selection
 * - rule-based: Rule engine evaluates conditions
 * - cost-optimized: Select cheapest available provider
 * - performance-optimized: Select fastest available provider
 *
 * Milestone 8 Additions:
 * - Smart routing by agent type with comprehensive agent-to-model mapping
 * - Capability-based routing (reasoning, tools, cost)
 * - Agent category detection for all 59+ QE agent types
 * - Override mechanism for specific tasks
 *
 * Milestone 11 Additions:
 * - Comprehensive metrics and observability
 * - Per-provider latency, cost, and token metrics
 * - Routing decision audit log
 * - Cost breakdown by agent type
 */

// ============================================================================
// Type Exports
// ============================================================================

export type {
  // Extended provider types (ADR-043)
  ExtendedProviderType,
  ProviderCapabilities,
  ExtendedLLMProvider,
  RequiredFeature,

  // Model mapping types
  ModelFamily,
  ModelTier,
  ModelMapping,
  ModelRegistry,

  // Prompt translation types
  MessageFormat,
  SystemPromptStrategy,
  ToolSchemaFormat,
  TranslatedMessages,
  ToolDefinition,
  TranslatedTools,
  TranslationOptions,
  PromptTranslator,

  // Routing modes
  RoutingMode,
  TaskComplexity,

  // Rule types
  RuleCondition,
  RuleAction,
  RoutingRule,

  // Decision types
  SelectionReason,
  RoutingDecision,

  // Fallback types
  FallbackBehavior,
  FallbackChainEntry,
  FallbackChain,

  // Configuration
  RouterConfig,

  // Chat types
  ChatParams,
  ChatResponse,
  StreamChunk,

  // Metrics types
  ProviderRoutingMetrics,
  RouterMetrics,
} from './types';

// ============================================================================
// Default Configuration Exports
// ============================================================================

export {
  ALL_PROVIDER_TYPES,
  DEFAULT_PROVIDER_CAPABILITIES,
  DEFAULT_FALLBACK_BEHAVIOR,
  DEFAULT_ROUTER_CONFIG,
} from './types';

// ============================================================================
// Routing Rules Exports
// ============================================================================

export {
  RoutingRuleEngine,
  DEFAULT_QE_ROUTING_RULES,
  createRoutingRule,
  mergeWithDefaultRules,
  inferComplexity,
  getAgentCategory,
  // Milestone 8: Enhanced agent-aware routing
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
} from './routing-rules';

export type { ExtendedAgentCategory } from './routing-rules';

// ============================================================================
// Agent Router Config Exports (ADR-043 Milestone 8)
// ============================================================================

export type {
  AgentCategory,
  ModelPreference,
  AgentCapabilityRequirements,
  AgentRoutingConfig,
  AgentRouterConfig,
  AgentRoutingOverride,
} from './agent-router-config';

export {
  // Category defaults
  DEFAULT_CATEGORY_MODELS,
  AGENT_CATEGORY_MAP,
  DEFAULT_CATEGORY_CAPABILITIES,
  DEFAULT_ROUTING_OVERRIDES,
  ALTERNATIVE_MODELS,
  // Core functions
  getAgentRoutingCategory,
  getPreferredModelForAgent,
  getAgentCapabilityRequirements,
  getAgentsByCategory,
  requiresAdvancedReasoning,
  isCostSensitive,
  isLatencySensitive,
  // Rule generation
  createAgentRoutingRule,
  createCategoryRoutingRules,
  createAgentAwareRules,
  createAllAgentRoutingRules,
  // Alternative models
  getAlternativeModelsForAgent,
  // Configuration builder
  buildAgentRouterConfig,
} from './agent-router-config';

// ============================================================================
// HybridRouter Exports
// ============================================================================

export {
  HybridRouter,
  createHybridRouter,
  createQERouter,
} from './hybrid-router';
