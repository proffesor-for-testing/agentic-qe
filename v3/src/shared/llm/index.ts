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
 * import { createProviderManager, createQEProviderManager } from '@agentic-qe/v3/shared/llm';
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

// Providers
export {
  ClaudeProvider,
  DEFAULT_CLAUDE_CONFIG,
  OpenAIProvider,
  DEFAULT_OPENAI_CONFIG,
  OllamaProvider,
  DEFAULT_OLLAMA_CONFIG,
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
