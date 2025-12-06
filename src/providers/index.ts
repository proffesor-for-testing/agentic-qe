/**
 * LLM Providers - Unified LLM Provider Layer
 *
 * This module provides a unified interface for multiple LLM providers:
 * - ClaudeProvider: Anthropic Claude API
 * - RuvllmProvider: Local LLM inference via ruvllm
 * - LLMProviderFactory: Factory for provider creation and hybrid routing
 *
 * @module providers
 * @version 1.0.0
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

// Factory and utilities
export {
  LLMProviderFactory,
  LLMProviderFactoryConfig,
  ProviderType,
  ProviderSelectionCriteria,
  ProviderUsageStats,
  getGlobalLLMFactory,
  setGlobalLLMFactory
} from './LLMProviderFactory';

import type { ILLMProvider } from './ILLMProvider';
import { ClaudeProvider } from './ClaudeProvider';
import { RuvllmProvider } from './RuvllmProvider';
import { LLMProviderFactory } from './LLMProviderFactory';

/**
 * Create a default LLM provider based on environment
 *
 * Uses Claude if ANTHROPIC_API_KEY is set, otherwise attempts ruvllm
 */
export async function createDefaultProvider(): Promise<ILLMProvider> {
  // Try Claude first (most common use case)
  if (process.env.ANTHROPIC_API_KEY) {
    const provider = new ClaudeProvider();
    await provider.initialize();
    return provider;
  }

  // Fall back to local ruvllm
  const provider = new RuvllmProvider();
  try {
    await provider.initialize();
    return provider;
  } catch {
    throw new Error(
      'No LLM provider available. Set ANTHROPIC_API_KEY for Claude or ensure ruvllm is installed.'
    );
  }
}

/**
 * Create a hybrid provider that routes between local and cloud
 */
export async function createHybridProvider(config?: {
  preferLocal?: boolean;
  claudeConfig?: any;
  ruvllmConfig?: any;
}): Promise<ILLMProvider> {
  const factory = new LLMProviderFactory({
    claude: config?.claudeConfig,
    ruvllm: config?.ruvllmConfig,
    defaultProvider: config?.preferLocal ? 'ruvllm' : 'claude',
    enableFallback: true
  });

  await factory.initialize();

  return factory.createHybridRouter();
}
