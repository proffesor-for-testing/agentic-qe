/**
 * Agentic QE v3 - LLM Provider System
 * ADR-011: Multi-provider LLM support for Quality Engineering
 *
 * This module provides a unified interface for working with multiple LLM providers:
 * - Claude (Anthropic) - Primary provider
 * - OpenAI (GPT-4) - Secondary provider
 * - Ollama (Local) - Zero-cost local development
 *
 * Features:
 * - Round-robin and cost-based load balancing
 * - Circuit breaker for resilience
 * - LRU caching for repeated queries
 * - Cost tracking and limits
 * - Automatic failover
 *
 * @example
 * ```typescript
 * import { createProviderManager, createQEProviderManager } from 'agentic-qe/shared/llm';
 *
 * // Create a provider manager
 * const manager = createQEProviderManager();
 * await manager.initialize();
 *
 * // Generate text
 * const response = await manager.generate('Write a test for UserService', {
 *   systemPrompt: 'You are a QE assistant...',
 *   maxTokens: 2048,
 * });
 *
 * // Generate embedding
 * const embedding = await manager.embed('test coverage analysis');
 *
 * // Code completion
 * const completion = await manager.complete('function calculateTotal(');
 *
 * // Check health
 * const health = await manager.healthCheck();
 *
 * // Get cost summary
 * const costs = manager.getCostSummary('day');
 * ```
 */

// Core interfaces
export {
  // Types
  type LLMProviderType,
  type MessageRole,
  type Message,
  type TokenUsage,
  type CostInfo,

  // Response types
  type LLMResponse,
  type EmbeddingResponse,
  type CompletionResponse,

  // Configuration types
  type LLMConfig,
  type ClaudeConfig,
  type OpenAIConfig,
  type OllamaConfig,
  type OpenRouterConfig,
  type GeminiConfig,
  type AzureOpenAIConfig,
  type BedrockConfig,
  type ProviderManagerConfig,

  // Request types
  type GenerateOptions,
  type EmbedOptions,
  type CompleteOptions,

  // Provider interface
  type LLMProvider,
  type HealthCheckResult,

  // Circuit breaker types
  type CircuitBreakerState,
  type CircuitBreakerConfig,
  type CircuitBreakerStats,

  // Cost tracking types
  type CostPeriod,
  type CostSummary,
  type CostAlert,

  // Cache types
  type CacheEntry,
  type LLMCacheConfig,
  type LLMCacheStats,

  // Provider manager types
  type ProviderSelection,
  type ProviderMetrics,

  // Error types
  type LLMErrorCode,
  type LLMError,
  createLLMError,
  isLLMError,
} from './interfaces';

// Providers (ADR-043: All 7 provider types)
export {
  ClaudeProvider,
  DEFAULT_CLAUDE_CONFIG,
  OpenAIProvider,
  DEFAULT_OPENAI_CONFIG,
  OllamaProvider,
  DEFAULT_OLLAMA_CONFIG,
  // ADR-043 New Providers
  OpenRouterProvider,
  DEFAULT_OPENROUTER_CONFIG,
  GeminiProvider,
  DEFAULT_GEMINI_CONFIG,
  AzureOpenAIProvider,
  DEFAULT_AZURE_OPENAI_CONFIG,
  BedrockProvider,
  DEFAULT_BEDROCK_CONFIG,
} from './providers';

// Circuit breaker
export {
  CircuitBreaker,
  CircuitBreakerManager,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from './circuit-breaker';

// Cache
export {
  LLMCache,
  LLMResponseCache,
  DEFAULT_CACHE_CONFIG,
  type CacheableResponse,
} from './cache';

// Cost tracker
export {
  CostTracker,
  MODEL_PRICING,
  getGlobalCostTracker,
  resetGlobalCostTracker,
} from './cost-tracker';

// Provider manager
export {
  ProviderManager,
  createProviderManager,
  createQEProviderManager,
  DEFAULT_PROVIDER_MANAGER_CONFIG,
} from './provider-manager';

// Model mapping (ADR-043)
export {
  mapModelId,
  normalizeModelId,
  getCanonicalName,
  getModelFamily,
  getModelTier,
  isModelAvailableOnProvider,
  getSupportedProviders,
  listCanonicalModels,
  listModelsByProvider,
  listModelsByFamily,
  listModelsByTier,
  getModelMapping,
  MODEL_MAPPINGS,
  type ProviderType,
  type ModelMapping,
} from './model-mapping';

// Model registry (ADR-043)
export {
  getModelCapabilities,
  getModelCost,
  getModelInfo,
  listModels,
  findModelsByCapability,
  findModelsByCost,
  findCheapestModel,
  findBestModelInBudget,
  getRecommendedModels,
  getDeprecationStatus,
  estimateRequestCost,
  compareModels,
  MODEL_REGISTRY,
  type ModelCapabilities,
  type ModelCostInfo,
  type ModelInfo,
} from './model-registry';

// Metrics (ADR-043 Milestone 11)
export {
  RouterMetricsCollector,
  createRouterMetricsCollector,
  getGlobalRouterMetrics,
  resetGlobalRouterMetrics,
  CostMetricsCollector,
  createCostMetricsCollector,
  getGlobalCostMetrics,
  resetGlobalCostMetrics,
  type RoutingDecisionRecord,
  type ProviderCallRecord,
  type FallbackRecord,
  type RouterMetricsSummary,
  type ProviderMetrics as RouterProviderMetrics,
  type AgentMetrics,
  type MetricsTimeWindow,
  type CostRecord,
  type CostTrend,
  type CostBreakdown,
  type BudgetAlert,
  type CostOptimizationSuggestion,
} from './metrics';

// HybridRouter (ADR-043: Intelligent provider routing)
export {
  HybridRouter,
  createHybridRouter,
  createQERouter,
} from './router';

// Router types and configuration (ADR-043)
export type {
  ExtendedProviderType,
  RoutingMode,
  RoutingDecision,
  RouterConfig,
  ChatParams,
  ChatResponse,
  FallbackChain,
} from './router';

export {
  ALL_PROVIDER_TYPES,
  DEFAULT_ROUTER_CONFIG,
  DEFAULT_FALLBACK_BEHAVIOR,
  RoutingRuleEngine,
  DEFAULT_QE_ROUTING_RULES,
} from './router';
