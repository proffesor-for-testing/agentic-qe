/**
 * Agentic QE v3 - Model Provider Registry
 * Exports all model providers and registration utilities
 *
 * This module provides easy access to all implemented model providers
 * for the multi-model consensus system.
 *
 * @see docs/plans/AQE_V3_IMPROVEMENTS_PLAN.md - Phase 2: Multi-Model Verification
 */

import { ModelProvider } from '../interfaces';
import { ModelProviderRegistry, createProviderRegistry } from '../model-provider';

// Export provider implementations
export {
  ClaudeModelProvider,
  createClaudeProvider,
  type ClaudeProviderConfig,
  type ClaudeAPIModel,
} from './claude-provider';

export {
  OpenAIModelProvider,
  createOpenAIProvider,
  type OpenAIProviderConfig,
  type OpenAIModel,
} from './openai-provider';

export {
  GeminiModelProvider,
  createGeminiProvider,
  type GeminiProviderConfig,
  type GeminiModel,
} from './gemini-provider';

export {
  OpenRouterModelProvider,
  createOpenRouterProvider,
  createMultiModelProviders,
  getRecommendedSecurityModels,
  getCostOptimizedModels,
  type OpenRouterProviderConfig,
  type OpenRouterModel,
} from './openrouter-provider';

export {
  OllamaModelProvider,
  createOllamaProvider,
  createMultiOllamaProviders,
  isOllamaAvailable,
  getRecommendedOllamaModels,
  getLightweightOllamaModels,
  getCodeOllamaModels,
  type OllamaProviderConfig,
  type OllamaModel,
} from './ollama-provider';

export {
  NativeLearningProvider,
  createNativeLearningProvider,
  withNativeLearning,
  type NativeLearningProviderConfig,
  type SecurityVerificationPattern,
  type PatternMatchResult,
} from './native-learning-provider';

// Re-export registry utilities
export { ModelProviderRegistry, createProviderRegistry };

// ============================================================================
// Provider Registration
// ============================================================================

/**
 * Configuration for registering providers
 */
export interface RegisterProvidersConfig {
  /** Claude configuration (if undefined, provider is skipped) */
  claude?: {
    apiKey?: string;
    defaultModel?: import('./claude-provider').ClaudeAPIModel;
    enableLogging?: boolean;
  };

  /** OpenAI configuration (if undefined, provider is skipped) */
  openai?: {
    apiKey?: string;
    organization?: string;
    defaultModel?: import('./openai-provider').OpenAIModel;
    enableLogging?: boolean;
  };

  /** Gemini configuration (if undefined, provider is skipped) */
  gemini?: {
    apiKey?: string;
    defaultModel?: import('./gemini-provider').GeminiModel;
    enableLogging?: boolean;
  };

  /** OpenRouter configuration (if undefined, provider is skipped) */
  openrouter?: {
    apiKey?: string;
    defaultModel?: import('./openrouter-provider').OpenRouterModel;
    enableLogging?: boolean;
    /** Create multiple provider instances for different models */
    multiModel?: boolean;
    /** Models to use when multiModel is true */
    models?: import('./openrouter-provider').OpenRouterModel[];
  };

  /** Ollama configuration for local/on-prem models (if undefined, provider is skipped) */
  ollama?: {
    baseUrl?: string;
    defaultModel?: import('./ollama-provider').OllamaModel;
    enableLogging?: boolean;
  };

  /** Enable logging for all providers */
  enableLogging?: boolean;
}

/**
 * Register all available model providers
 *
 * Creates and registers providers based on the provided configuration.
 * Providers are only registered if their configuration is provided and
 * they can be successfully initialized.
 *
 * @param config - Configuration for each provider
 * @returns Provider registry with registered providers
 *
 * @example
 * ```typescript
 * // Register all providers using environment variables
 * const registry = registerAllProviders({
 *   claude: { apiKey: process.env.ANTHROPIC_API_KEY },
 *   openai: { apiKey: process.env.OPENAI_API_KEY },
 *   gemini: { apiKey: process.env.GOOGLE_API_KEY },
 * });
 *
 * // Get all available providers
 * const providers = await registry.getAvailable();
 * console.log(`Registered ${providers.length} providers`);
 * ```
 *
 * @example
 * ```typescript
 * // Register only Claude and OpenAI
 * const registry = registerAllProviders({
 *   claude: {
 *     apiKey: process.env.ANTHROPIC_API_KEY,
 *     defaultModel: 'claude-3-opus-latest',
 *   },
 *   openai: {
 *     apiKey: process.env.OPENAI_API_KEY,
 *     defaultModel: 'gpt-4-turbo',
 *   },
 *   enableLogging: true, // Enable logging for all providers
 * });
 * ```
 */
export function registerAllProviders(config: RegisterProvidersConfig = {}): ModelProviderRegistry {
  const registry = createProviderRegistry();
  const globalLogging = config.enableLogging || false;

  // Try to register Claude provider
  if (config.claude) {
    try {
      const { createClaudeProvider } = require('./claude-provider');
      const provider = createClaudeProvider({
        ...config.claude,
        enableLogging: config.claude.enableLogging ?? globalLogging,
      });
      registry.register(provider);
    } catch (error) {
      if (globalLogging) {
        console.warn(`[Providers] Failed to register Claude provider: ${error}`);
      }
    }
  }

  // Try to register OpenAI provider
  if (config.openai) {
    try {
      const { createOpenAIProvider } = require('./openai-provider');
      const provider = createOpenAIProvider({
        ...config.openai,
        enableLogging: config.openai.enableLogging ?? globalLogging,
      });
      registry.register(provider);
    } catch (error) {
      if (globalLogging) {
        console.warn(`[Providers] Failed to register OpenAI provider: ${error}`);
      }
    }
  }

  // Try to register Gemini provider
  if (config.gemini) {
    try {
      const { createGeminiProvider } = require('./gemini-provider');
      const provider = createGeminiProvider({
        ...config.gemini,
        enableLogging: config.gemini.enableLogging ?? globalLogging,
      });
      registry.register(provider);
    } catch (error) {
      if (globalLogging) {
        console.warn(`[Providers] Failed to register Gemini provider: ${error}`);
      }
    }
  }

  // Try to register OpenRouter provider(s)
  if (config.openrouter) {
    try {
      const { createOpenRouterProvider, createMultiModelProviders } = require('./openrouter-provider');

      if (config.openrouter.multiModel && config.openrouter.models) {
        // Create multiple provider instances for different models
        const providers = createMultiModelProviders(config.openrouter.models);
        for (const provider of providers) {
          registry.register(provider);
        }
      } else {
        // Create single provider
        const provider = createOpenRouterProvider({
          apiKey: config.openrouter.apiKey,
          defaultModel: config.openrouter.defaultModel,
          enableLogging: config.openrouter.enableLogging ?? globalLogging,
        });
        registry.register(provider);
      }
    } catch (error) {
      if (globalLogging) {
        console.warn(`[Providers] Failed to register OpenRouter provider: ${error}`);
      }
    }
  }

  // Try to register Ollama provider (local/on-prem)
  if (config.ollama) {
    try {
      const { createOllamaProvider } = require('./ollama-provider');
      const provider = createOllamaProvider({
        baseUrl: config.ollama.baseUrl,
        defaultModel: config.ollama.defaultModel,
        enableLogging: config.ollama.enableLogging ?? globalLogging,
      });
      registry.register(provider);
    } catch (error) {
      if (globalLogging) {
        console.warn(`[Providers] Failed to register Ollama provider: ${error}`);
      }
    }
  }

  return registry;
}

/**
 * Register providers from environment variables
 *
 * Automatically detects and registers providers based on environment variables:
 * - ANTHROPIC_API_KEY: Enables Claude provider
 * - OPENAI_API_KEY: Enables OpenAI provider
 * - GOOGLE_API_KEY: Enables Gemini provider
 * - OPENROUTER_API_KEY: Enables OpenRouter provider (supports 100+ models)
 * - OLLAMA_HOST: Enables Ollama provider for local/on-prem models
 *
 * @param enableLogging - Whether to enable logging for all providers
 * @returns Provider registry with detected providers
 *
 * @example
 * ```typescript
 * // Automatically register all providers with available API keys
 * const registry = registerProvidersFromEnv();
 * const providers = await registry.getAvailable();
 * console.log(`Auto-registered ${providers.length} providers`);
 * ```
 */
export function registerProvidersFromEnv(enableLogging: boolean = false): ModelProviderRegistry {
  const config: RegisterProvidersConfig = {
    enableLogging,
  };

  // Detect Claude
  if (process.env.ANTHROPIC_API_KEY) {
    config.claude = {
      apiKey: process.env.ANTHROPIC_API_KEY,
    };
  }

  // Detect OpenAI
  if (process.env.OPENAI_API_KEY) {
    config.openai = {
      apiKey: process.env.OPENAI_API_KEY,
      organization: process.env.OPENAI_ORGANIZATION,
    };
  }

  // Detect Gemini
  if (process.env.GOOGLE_API_KEY) {
    config.gemini = {
      apiKey: process.env.GOOGLE_API_KEY,
    };
  }

  // Detect OpenRouter (supports 100+ models through unified API)
  if (process.env.OPENROUTER_API_KEY) {
    config.openrouter = {
      apiKey: process.env.OPENROUTER_API_KEY,
    };
  }

  // Detect Ollama (local/on-prem models)
  if (process.env.OLLAMA_HOST) {
    config.ollama = {
      baseUrl: process.env.OLLAMA_HOST,
    };
  }

  return registerAllProviders(config);
}

/**
 * Get provider recommendations for consensus verification
 *
 * Returns recommended provider combinations based on:
 * - Model diversity (different architectures)
 * - Cost efficiency
 * - Response time
 *
 * @param registry - Provider registry to select from
 * @param preferCost - Prefer lower-cost models
 * @param preferSpeed - Prefer faster models
 * @returns Recommended provider IDs
 *
 * @example
 * ```typescript
 * const registry = registerProvidersFromEnv();
 * const recommended = await getRecommendedProviders(registry, true, false);
 * console.log(`Recommended providers: ${recommended.join(', ')}`);
 * ```
 */
export async function getRecommendedProviders(
  registry: ModelProviderRegistry,
  preferCost: boolean = false,
  preferSpeed: boolean = false
): Promise<string[]> {
  // Get available providers
  const available = await registry.getAvailable();
  const availableIds = new Set(available.map(p => p.id));

  // Priority order based on preferences
  if (preferCost) {
    // Prefer cost-effective models: Gemini Flash > Claude Sonnet > OpenAI GPT-4-turbo
    return ['gemini', 'claude', 'openai'].filter(id => availableIds.has(id)).slice(0, 3);
  }

  if (preferSpeed) {
    // Prefer faster models: Gemini Flash > Claude Sonnet > OpenAI GPT-4-turbo
    return ['gemini', 'claude', 'openai'].filter(id => availableIds.has(id)).slice(0, 3);
  }

  // Default: Prefer model diversity and accuracy
  // Claude Opus > OpenAI GPT-4 > Gemini Pro
  const priority = ['claude', 'openai', 'gemini'];
  return priority.filter(id => availableIds.has(id)).slice(0, 3);
}

/**
 * Validate provider health and return healthy providers
 *
 * @param registry - Provider registry to check
 * @returns Provider IDs that passed health check
 *
 * @example
 * ```typescript
 * const registry = registerProvidersFromEnv();
 * const healthy = await getHealthyProviders(registry);
 * console.log(`Healthy providers: ${healthy.join(', ')}`);
 * ```
 */
export async function getHealthyProviders(
  registry: ModelProviderRegistry
): Promise<string[]> {
  const providers = registry.getAll();

  const healthChecks = await Promise.all(
    providers.map(async (provider) => {
      const health = await provider.healthCheck();
      return {
        id: provider.id,
        healthy: health.healthy,
      };
    })
  );

  return healthChecks
    .filter(check => check.healthy)
    .map(check => check.id);
}
