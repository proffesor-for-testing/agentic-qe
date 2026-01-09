/**
 * Agentic QE v3 - Shared Kernel
 * Common building blocks used across all domains
 */

export * from './types';
export * from './entities';
export * from './value-objects';
export * from './events';
export * from './parsers';
export * from './io';
export * from './http';
export * from './embeddings';
export * from './git';
export * from './security';
export * from './metrics';

// LLM module - explicit exports to avoid conflicts with http/io modules
export type {
  LLMProvider,
  LLMConfig,
  LLMResponse,
  LLMError,
  LLMErrorCode,
  GenerateOptions,
  EmbedOptions,
  CircuitBreakerState as LLMCircuitBreakerState,
  CacheEntry as LLMCacheEntry,
} from './llm';

export {
  ProviderManager,
  CircuitBreaker as LLMCircuitBreaker,
  CostTracker,
  LLMCache,
  ClaudeProvider,
  OpenAIProvider,
  OllamaProvider,
  createLLMError,
  isLLMError,
} from './llm';
