/**
 * LLM Providers - Unified LLM Provider Layer
 *
 * This module provides a unified interface for multiple LLM providers:
 * - ClaudeProvider: Anthropic Claude API
 * - RuvllmProvider: Local LLM inference via ruvllm
 * - OpenRouterProvider: 300+ models with auto-routing and hot-swap
 * - LLMProviderFactory: Factory for provider creation and hybrid routing
 *
 * @module providers
 * @version 2.0.0
 */

// Core interface and types
export {
  ILLMProvider,
  LLMProviderConfig,
  LLMCompletionOptions,
  LLMCompletionResponse,
  LLMStreamEvent,
  LLMEmbeddingOptions,
  LLMEmbeddingResponse,
  LLMTokenCountOptions,
  LLMHealthStatus,
  LLMProviderMetadata,
  LLMMessageParam,
  LLMTextBlockParam,
  LLMProviderError,
  isLLMProviderError
} from './ILLMProvider';

// Provider implementations
export { ClaudeProvider, ClaudeProviderConfig } from './ClaudeProvider';
export { RuvllmProvider, RuvllmProviderConfig } from './RuvllmProvider';
export {
  OpenRouterProvider,
  OpenRouterConfig,
  OpenRouterModel,
  createOpenRouterProvider
} from './OpenRouterProvider';

// Hybrid router with RuVector cache integration (Phase 0.5)
export {
  HybridRouter,
  HybridRouterConfig,
  RuVectorCacheConfig,
  RequestPriority,
  TaskComplexity,
  RoutingStrategy,
  RoutingDecision,
  CostSavingsReport
} from './HybridRouter';

// RuVector client for self-learning cache (Phase 0.5)
export {
  RuVectorClient,
  RuVectorConfig,
  RuVectorError,
  createRuVectorClient,
  RUVECTOR_CLIENT_VERSION
} from './RuVectorClient';
export type {
  SearchResult as RuVectorSearchResult,
  Pattern as RuVectorPattern,
  QueryResult as RuVectorQueryResult,
  LearningMetrics as RuVectorLearningMetrics,
  HealthCheckResponse as RuVectorHealthCheckResponse
} from './RuVectorClient';

// RuVector PostgreSQL adapter for Docker-based self-learning (Phase 0.5)
export {
  RuVectorPostgresAdapter,
  createRuVectorPostgresAdapter,
  createDockerRuVectorAdapter,
  RUVECTOR_POSTGRES_ADAPTER_VERSION
} from './RuVectorPostgresAdapter';
export type {
  RuVectorPostgresConfig
} from './RuVectorPostgresAdapter';

// RuvLLM Pattern Curator integration (Phase 0 M0.6)
export {
  RuvllmPatternCurator,
  createRuvllmPatternCurator
} from './RuvllmPatternCurator';
export type {
  RuvllmPatternCuratorConfig
} from './RuvllmPatternCurator';

// Factory and utilities
export {
  LLMProviderFactory,
  LLMProviderFactoryConfig,
  ProviderType,
  ProviderSelectionCriteria,
  ProviderUsageStats,
  EnvironmentSignals,
  getGlobalLLMFactory,
  setGlobalLLMFactory
} from './LLMProviderFactory';

import type { ILLMProvider } from './ILLMProvider';
import { ClaudeProvider } from './ClaudeProvider';
import { RuvllmProvider } from './RuvllmProvider';
import { OpenRouterProvider } from './OpenRouterProvider';
import { LLMProviderFactory, type ProviderType } from './LLMProviderFactory';

/**
 * Create a default LLM provider based on environment using smart detection
 *
 * Provider Selection:
 * - Claude Code + ANTHROPIC_API_KEY → Claude
 * - OPENROUTER_API_KEY → OpenRouter (300+ models with auto-routing)
 * - ANTHROPIC_API_KEY → Claude
 * - ruvLLM available → Local inference
 */
export async function createDefaultProvider(): Promise<ILLMProvider> {
  const factory = new LLMProviderFactory({
    enableSmartDetection: true,
    defaultProvider: 'auto',
  });

  await factory.initialize();

  const availableProviders = factory.getAvailableProviders();
  if (availableProviders.length === 0) {
    throw new Error(
      'No LLM provider available. Set ANTHROPIC_API_KEY for Claude, OPENROUTER_API_KEY for OpenRouter, or ensure ruvllm is installed.'
    );
  }

  // Return the best provider based on smart detection
  const provider = factory.selectBestProvider();
  if (!provider) {
    throw new Error('Failed to select a provider');
  }

  return provider;
}

/**
 * Create a hybrid provider that routes between local and cloud
 */
export async function createHybridProvider(config?: {
  preferLocal?: boolean;
  claudeConfig?: any;
  ruvllmConfig?: any;
  openrouterConfig?: any;
}): Promise<ILLMProvider> {
  const factory = new LLMProviderFactory({
    claude: config?.claudeConfig,
    ruvllm: config?.ruvllmConfig,
    openrouter: config?.openrouterConfig,
    defaultProvider: config?.preferLocal ? 'ruvllm' : 'auto',
    enableFallback: true,
    enableSmartDetection: true,
  });

  await factory.initialize();

  return factory.createHybridRouter();
}

/**
 * Create an OpenRouter provider with auto-routing capability
 * Useful when you need access to 300+ models with automatic cost optimization
 */
export async function createOpenRouterWithAutoRoute(config?: {
  defaultModel?: string;
  siteUrl?: string;
  siteName?: string;
}): Promise<OpenRouterProvider> {
  const provider = new OpenRouterProvider({
    defaultModel: config?.defaultModel || 'auto',
    siteUrl: config?.siteUrl,
    siteName: config?.siteName,
    enableAutoRoute: true,
    enableModelDiscovery: true,
  });

  await provider.initialize();
  return provider;
}

/**
 * Hot-swap model at runtime (requires OpenRouter provider)
 */
export async function hotSwapModel(model: string): Promise<void> {
  const factory = getGlobalLLMFactory();
  await factory.hotSwapModel(model);
}

/**
 * Get current model from OpenRouter provider
 */
export function getCurrentModel(): string | undefined {
  const factory = getGlobalLLMFactory();
  return factory.getCurrentModel();
}

/**
 * List available models from OpenRouter
 */
export async function listAvailableModels(): Promise<import('./OpenRouterProvider').OpenRouterModel[]> {
  const factory = getGlobalLLMFactory();
  return factory.listAvailableModels();
}

// Re-export getGlobalLLMFactory for convenience
import { getGlobalLLMFactory } from './LLMProviderFactory';
