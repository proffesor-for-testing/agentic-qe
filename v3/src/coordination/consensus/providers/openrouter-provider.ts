/**
 * Agentic QE v3 - OpenRouter Model Provider
 * Multi-model access through unified API for consensus verification
 *
 * OpenRouter provides access to many models (Claude, GPT, Llama, Mistral, etc.)
 * through a single API, making it ideal for multi-model consensus verification.
 *
 * @see https://openrouter.ai/docs
 * @see docs/plans/AQE_V3_IMPROVEMENTS_PLAN.md - Phase 2: Multi-Model Verification
 */

import {
  ModelProvider,
  ModelCompletionOptions,
  ModelHealthResult,
} from '../interfaces';
import { BaseModelProvider } from '../model-provider';
import { toErrorMessage, toError } from '../../../shared/error-utils.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Popular models available through OpenRouter
 * OpenRouter supports 100+ models - these are the most useful for security verification
 */
export type OpenRouterModel =
  // Anthropic Claude models
  | 'anthropic/claude-3.5-sonnet'
  | 'anthropic/claude-3-opus'
  | 'anthropic/claude-3-sonnet'
  | 'anthropic/claude-3-haiku'
  // OpenAI GPT models
  | 'openai/gpt-4-turbo'
  | 'openai/gpt-4'
  | 'openai/gpt-4o'
  | 'openai/gpt-4o-mini'
  // Google models
  | 'google/gemini-pro-1.5'
  | 'google/gemini-flash-1.5'
  // Meta Llama models
  | 'meta-llama/llama-3.1-405b-instruct'
  | 'meta-llama/llama-3.1-70b-instruct'
  | 'meta-llama/llama-3.1-8b-instruct'
  // Mistral models
  | 'mistralai/mistral-large'
  | 'mistralai/mistral-medium'
  | 'mistralai/mixtral-8x22b-instruct'
  // DeepSeek models
  | 'deepseek/deepseek-chat'
  | 'deepseek/deepseek-coder'
  // Qwen models
  | 'qwen/qwen-2.5-72b-instruct'
  // Cohere models
  | 'cohere/command-r-plus'
  // Allow any model string for flexibility
  | string;

/**
 * Model tier for cost/capability classification
 */
export type ModelTier = 'free' | 'cheap' | 'standard' | 'premium';

/**
 * Configuration for OpenRouter provider
 */
export interface OpenRouterProviderConfig {
  /** OpenRouter API key (from OPENROUTER_API_KEY env var) */
  apiKey?: string;

  /** Default model to use */
  defaultModel?: OpenRouterModel;

  /** Your app name (shows in OpenRouter dashboard) */
  appName?: string;

  /** Your site URL (for rankings) */
  siteUrl?: string;

  /** Default timeout for requests (ms) */
  defaultTimeout?: number;

  /** Maximum retries on failure */
  maxRetries?: number;

  /** Retry delay in ms */
  retryDelayMs?: number;

  /** Enable request/response logging */
  enableLogging?: boolean;

  /** Fallback models to try if primary fails */
  fallbackModels?: OpenRouterModel[];

  /** Model tier preference for cost optimization */
  preferredTier?: ModelTier;
}

/**
 * Message format for OpenRouter (OpenAI-compatible)
 */
interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Request format for OpenRouter Chat Completions
 */
interface OpenRouterCompletionRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  transforms?: string[];
}

/**
 * Response format from OpenRouter
 */
interface OpenRouterCompletionResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenRouter generation stats
 */
interface OpenRouterGenerationStats {
  tokens_prompt: number;
  tokens_completion: number;
  cost: number;
}

// ============================================================================
// Model Cost and Tier Information
// ============================================================================

/**
 * Cost per 1M tokens for popular models (input/output)
 * Updated as of 2024 - check OpenRouter for current prices
 */
const MODEL_COSTS: Record<string, { input: number; output: number; tier: ModelTier }> = {
  // Claude models
  'anthropic/claude-3.5-sonnet': { input: 3, output: 15, tier: 'standard' },
  'anthropic/claude-3-opus': { input: 15, output: 75, tier: 'premium' },
  'anthropic/claude-3-sonnet': { input: 3, output: 15, tier: 'standard' },
  'anthropic/claude-3-haiku': { input: 0.25, output: 1.25, tier: 'cheap' },
  // OpenAI models
  'openai/gpt-4-turbo': { input: 10, output: 30, tier: 'standard' },
  'openai/gpt-4': { input: 30, output: 60, tier: 'premium' },
  'openai/gpt-4o': { input: 5, output: 15, tier: 'standard' },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.6, tier: 'cheap' },
  // Google models
  'google/gemini-pro-1.5': { input: 3.5, output: 10.5, tier: 'standard' },
  'google/gemini-flash-1.5': { input: 0.075, output: 0.3, tier: 'cheap' },
  // Llama models
  'meta-llama/llama-3.1-405b-instruct': { input: 2.7, output: 2.7, tier: 'standard' },
  'meta-llama/llama-3.1-70b-instruct': { input: 0.52, output: 0.75, tier: 'cheap' },
  'meta-llama/llama-3.1-8b-instruct': { input: 0.055, output: 0.055, tier: 'free' },
  // Mistral models
  'mistralai/mistral-large': { input: 3, output: 9, tier: 'standard' },
  'mistralai/mixtral-8x22b-instruct': { input: 0.65, output: 0.65, tier: 'cheap' },
  // DeepSeek models
  'deepseek/deepseek-chat': { input: 0.14, output: 0.28, tier: 'cheap' },
  'deepseek/deepseek-coder': { input: 0.14, output: 0.28, tier: 'cheap' },
  // Qwen models
  'qwen/qwen-2.5-72b-instruct': { input: 0.35, output: 0.4, tier: 'cheap' },
  // Cohere models
  'cohere/command-r-plus': { input: 2.5, output: 10, tier: 'standard' },
};

/**
 * Get models by tier for cost optimization
 */
export function getModelsByTier(tier: ModelTier): OpenRouterModel[] {
  return Object.entries(MODEL_COSTS)
    .filter(([, info]) => info.tier === tier)
    .map(([model]) => model as OpenRouterModel);
}

/**
 * Get recommended models for security verification
 * Returns diverse set for better consensus
 */
export function getRecommendedSecurityModels(): OpenRouterModel[] {
  return [
    'anthropic/claude-3.5-sonnet',  // Best for security analysis
    'openai/gpt-4o',                 // Strong reasoning
    'google/gemini-pro-1.5',         // Good code understanding
    'mistralai/mistral-large',       // Cost-effective alternative
  ];
}

/**
 * Get cost-optimized models for security verification
 */
export function getCostOptimizedModels(): OpenRouterModel[] {
  return [
    'anthropic/claude-3-haiku',      // Fast and cheap Claude
    'openai/gpt-4o-mini',            // Cheap GPT-4
    'google/gemini-flash-1.5',       // Very cheap Gemini
    'deepseek/deepseek-chat',        // Very cheap alternative
  ];
}

// ============================================================================
// OpenRouter Provider Implementation
// ============================================================================

const DEFAULT_CONFIG: Required<Omit<OpenRouterProviderConfig, 'apiKey' | 'appName' | 'siteUrl' | 'fallbackModels' | 'preferredTier'>> = {
  defaultModel: 'anthropic/claude-3.5-sonnet',
  defaultTimeout: 120000, // 2 minutes
  maxRetries: 3,
  retryDelayMs: 1000,
  enableLogging: false,
};

/**
 * OpenRouter Model Provider
 *
 * Provides access to 100+ models through a single API for multi-model
 * consensus verification. Uses OpenAI-compatible API format.
 *
 * @example
 * ```typescript
 * const provider = new OpenRouterModelProvider({
 *   apiKey: process.env.OPENROUTER_API_KEY,
 *   defaultModel: 'anthropic/claude-3.5-sonnet',
 * });
 *
 * const result = await provider.complete('Analyze this code for vulnerabilities...');
 * ```
 */
export class OpenRouterModelProvider extends BaseModelProvider {
  readonly id: string;
  readonly name: string;
  readonly type: 'openrouter' = 'openrouter';

  // Required by BaseModelProvider
  protected costPerToken: { input: number; output: number };
  protected supportedModels: string[] = Object.keys(MODEL_COSTS);

  private config: Required<Omit<OpenRouterProviderConfig, 'apiKey' | 'appName' | 'siteUrl' | 'fallbackModels' | 'preferredTier'>> & {
    apiKey: string;
    appName?: string;
    siteUrl?: string;
    fallbackModels?: OpenRouterModel[];
    preferredTier?: ModelTier;
  };
  private totalCost = 0;
  private requestCount = 0;

  constructor(config: OpenRouterProviderConfig = {}) {
    super();

    const apiKey = config.apiKey || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OpenRouter API key is required. Set OPENROUTER_API_KEY environment variable or pass apiKey in config.'
      );
    }

    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      apiKey,
    };

    this.id = `openrouter-${this.config.defaultModel.replace(/[^a-z0-9]/gi, '-')}`;
    this.name = `OpenRouter (${this.config.defaultModel})`;

    // Set cost per token based on default model
    const modelCosts = MODEL_COSTS[this.config.defaultModel];
    if (modelCosts) {
      this.costPerToken = {
        input: modelCosts.input / 1_000_000,
        output: modelCosts.output / 1_000_000,
      };
    } else {
      // Default cost for unknown models
      this.costPerToken = { input: 0.001 / 1_000, output: 0.002 / 1_000 };
    }
  }

  /**
   * Get total cost incurred
   */
  getTotalCost(): number {
    return this.totalCost;
  }

  /**
   * Get cost per token (required override)
   */
  override getCostPerToken(): { input: number; output: number } {
    return { ...this.costPerToken };
  }

  /**
   * Complete a prompt using OpenRouter
   */
  async complete(
    prompt: string,
    options?: ModelCompletionOptions
  ): Promise<string> {
    if (this.disposed) {
      throw new Error('Provider has been disposed');
    }

    const model = (options?.model as OpenRouterModel) || this.config.defaultModel;
    const maxTokens = options?.maxTokens || 4096;
    const temperature = options?.temperature ?? 0.7;
    const timeout = options?.timeout || this.config.defaultTimeout;
    const systemPrompt = options?.systemPrompt || this.getDefaultSystemPrompt();

    const request: OpenRouterCompletionRequest = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature,
      max_tokens: maxTokens,
      stream: false,
    };

    let lastError: Error | null = null;
    const modelsToTry = [model, ...(this.config.fallbackModels || [])];

    for (const tryModel of modelsToTry) {
      request.model = tryModel;

      for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
        try {
          const response = await this.makeRequest(request, timeout);
          this.requestCount++;

          // Track cost
          if (response.usage) {
            const costs = MODEL_COSTS[tryModel] || { input: 1, output: 2 };
            const cost =
              (response.usage.prompt_tokens * costs.input +
                response.usage.completion_tokens * costs.output) /
              1_000_000;
            this.totalCost += cost;
          }

          const content = response.choices[0]?.message?.content;
          if (!content) {
            throw new Error('Empty response from OpenRouter');
          }

          if (this.config.enableLogging) {
            console.log(`[OpenRouter] Model: ${tryModel}, Tokens: ${response.usage?.total_tokens || 'unknown'}`);
          }

          return content;
        } catch (error) {
          lastError = toError(error);

          // Don't retry on non-retryable errors
          if (this.isNonRetryableError(lastError)) {
            if (this.config.enableLogging) {
              console.error(`[OpenRouter] Non-retryable error with ${tryModel}:`, lastError.message);
            }
            break; // Try next model
          }

          // Wait before retry
          if (attempt < this.config.maxRetries) {
            const delay = this.config.retryDelayMs * Math.pow(2, attempt);
            await this.sleep(delay);
          }
        }
      }
    }

    throw lastError || new Error('All models failed');
  }

  /**
   * Perform provider health check (required by BaseModelProvider)
   */
  protected async performHealthCheck(): Promise<ModelHealthResult> {
    try {
      const startTime = Date.now();

      // Simple health check - request models list
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch('https://openrouter.ai/api/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latency = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      return {
        healthy: true,
        latencyMs: latency,
        availableModels: this.supportedModels,
      };
    } catch (error) {
      return {
        healthy: false,
        error: toErrorMessage(error),
        availableModels: [],
      };
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Make a request to OpenRouter API
   */
  private async makeRequest(
    request: OpenRouterCompletionRequest,
    timeout: number
  ): Promise<OpenRouterCompletionResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': this.config.siteUrl || 'https://github.com/agentic-qe',
        'X-Title': this.config.appName || 'Agentic QE',
      };

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${errorBody}`);
      }

      return (await response.json()) as OpenRouterCompletionResponse;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check if an error is non-retryable
   */
  private isNonRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('invalid api key') ||
      message.includes('authentication') ||
      message.includes('unauthorized') ||
      message.includes('invalid_request') ||
      message.includes('model not found') ||
      message.includes('context_length_exceeded')
    );
  }

  /**
   * Sleep for a given duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get default system prompt for security verification
   */
  private getDefaultSystemPrompt(): string {
    return `You are a security expert analyzing code for vulnerabilities.
Your task is to verify security findings with high accuracy.
Be thorough but avoid false positives.
Always explain your reasoning clearly.
Format your response with: verdict (confirmed/rejected/uncertain), confidence (0-100), and reasoning.`;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new OpenRouter provider
 *
 * @param config - Provider configuration
 * @returns OpenRouterModelProvider instance
 *
 * @example
 * ```typescript
 * // Basic usage
 * const provider = createOpenRouterProvider();
 *
 * // With specific model
 * const provider = createOpenRouterProvider({
 *   defaultModel: 'meta-llama/llama-3.1-70b-instruct',
 * });
 *
 * // With fallback models
 * const provider = createOpenRouterProvider({
 *   defaultModel: 'anthropic/claude-3.5-sonnet',
 *   fallbackModels: ['openai/gpt-4o', 'google/gemini-pro-1.5'],
 * });
 * ```
 */
export function createOpenRouterProvider(
  config?: OpenRouterProviderConfig
): OpenRouterModelProvider {
  return new OpenRouterModelProvider(config);
}

/**
 * Create multiple providers for different models (for consensus)
 *
 * @param models - List of models to create providers for
 * @param baseConfig - Base configuration for all providers
 * @returns Array of OpenRouterModelProvider instances
 */
export function createMultiModelProviders(
  models: OpenRouterModel[] = getRecommendedSecurityModels(),
  baseConfig?: Omit<OpenRouterProviderConfig, 'defaultModel'>
): OpenRouterModelProvider[] {
  return models.map(
    (model) =>
      new OpenRouterModelProvider({
        ...baseConfig,
        defaultModel: model,
      })
  );
}
