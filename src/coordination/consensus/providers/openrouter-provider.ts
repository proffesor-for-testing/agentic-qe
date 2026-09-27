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
  | 'anthropic/claude-sonnet-5'
  | 'anthropic/claude-opus-5'
  | 'anthropic/claude-opus-5.5'
  | 'anthropic/claude-haiku-4.5'
  // OpenAI GPT models
  | 'openai/gpt-6-sol'
  | 'openai/gpt-6-luna'
  | 'openai/gpt-6-astra'
  | 'openai/gpt-oss-120b'
  // Google models
  | 'google/gemini-3.8-flash'
  | 'google/gemini-3.1-pro-preview'
  | 'google/gemini-2.5-pro'
  | 'google/gemini-2.5-flash'
  // Meta Llama models
  | 'meta-llama/llama-4-maverick'
  | 'meta-llama/llama-4-scout'
  // Mistral models
  | 'mistralai/mistral-large-2512'
  // DeepSeek models
  | 'deepseek/deepseek-v4-pro'
  | 'deepseek/deepseek-v4.1-flash'
  // Qwen models
  | 'qwen/qwen3-coder'
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
 * Cost per 1M tokens for current models (input/output)
 * From the OpenRouter public catalog (2026-09-27) - check OpenRouter for current prices
 */
const MODEL_COSTS: Record<string, { input: number; output: number; tier: ModelTier }> = {
  // Claude models
  'anthropic/claude-sonnet-5': { input: 2, output: 10, tier: 'standard' },
  'anthropic/claude-opus-5': { input: 5, output: 25, tier: 'premium' },
  'anthropic/claude-opus-5.5': { input: 4, output: 20, tier: 'premium' },
  'anthropic/claude-haiku-4.5': { input: 1, output: 5, tier: 'cheap' },
  // OpenAI models
  'openai/gpt-6-astra': { input: 10, output: 50, tier: 'premium' },
  'openai/gpt-6-sol': { input: 2, output: 10, tier: 'standard' },
  'openai/gpt-6-luna': { input: 0.1, output: 0.5, tier: 'cheap' },
  'openai/gpt-oss-120b': { input: 0.15, output: 0.6, tier: 'cheap' },
  // Google models
  'google/gemini-3.1-pro-preview': { input: 2, output: 12, tier: 'standard' },
  'google/gemini-2.5-pro': { input: 1.25, output: 10, tier: 'standard' },
  'google/gemini-3.8-flash': { input: 0.75, output: 3.75, tier: 'cheap' },
  'google/gemini-2.5-flash': { input: 0.3, output: 2.5, tier: 'cheap' },
  // Llama models
  'meta-llama/llama-4-maverick': { input: 0.1875, output: 0.6525, tier: 'cheap' },
  'meta-llama/llama-4-scout': { input: 0.1, output: 0.3, tier: 'cheap' },
  // Mistral models
  'mistralai/mistral-large-2512': { input: 0.5, output: 1.5, tier: 'cheap' },
  // DeepSeek models
  'deepseek/deepseek-v4-pro': { input: 0.348, output: 0.696, tier: 'cheap' },
  'deepseek/deepseek-v4.1-flash': { input: 0.035, output: 0.29, tier: 'cheap' },
  // Qwen models
  'qwen/qwen3-coder': { input: 0.3, output: 1, tier: 'cheap' },
};

/**
 * Deprecated models no longer served by OpenRouter. Pricing only, so historical
 * usage still costs correctly — excluded from supported models and tier lists.
 */
const DEPRECATED_MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'anthropic/claude-3.5-sonnet': { input: 3, output: 15 },
  'anthropic/claude-3-opus': { input: 15, output: 75 },
  'anthropic/claude-3-sonnet': { input: 3, output: 15 },
  'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },
  'openai/gpt-4-turbo': { input: 10, output: 30 },
  'openai/gpt-4': { input: 30, output: 60 },
  'openai/gpt-4o': { input: 5, output: 15 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
  'google/gemini-pro-1.5': { input: 3.5, output: 10.5 },
  'google/gemini-flash-1.5': { input: 0.075, output: 0.3 },
  'meta-llama/llama-3.1-405b-instruct': { input: 2.7, output: 2.7 },
  'meta-llama/llama-3.1-70b-instruct': { input: 0.52, output: 0.75 },
  'meta-llama/llama-3.1-8b-instruct': { input: 0.055, output: 0.055 },
  'mistralai/mistral-large': { input: 3, output: 9 },
  'mistralai/mixtral-8x22b-instruct': { input: 0.65, output: 0.65 },
  'deepseek/deepseek-chat': { input: 0.14, output: 0.28 },
  'deepseek/deepseek-coder': { input: 0.14, output: 0.28 },
  'qwen/qwen-2.5-72b-instruct': { input: 0.35, output: 0.4 },
  'cohere/command-r-plus': { input: 2.5, output: 10 },
};

function lookupModelCost(model: string): { input: number; output: number } | undefined {
  return MODEL_COSTS[model] ?? DEPRECATED_MODEL_COSTS[model];
}

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
    'anthropic/claude-sonnet-5',     // Best for security analysis
    'openai/gpt-6-sol',              // Strong reasoning
    'google/gemini-2.5-pro',         // Good code understanding
    'deepseek/deepseek-v4-pro',      // Cost-effective alternative
  ];
}

/**
 * Get cost-optimized models for security verification
 */
export function getCostOptimizedModels(): OpenRouterModel[] {
  return [
    'anthropic/claude-haiku-4.5',    // Fast and cheap Claude
    'openai/gpt-6-luna',             // Cheap GPT-6
    'google/gemini-3.8-flash',       // Cheap Gemini
    'qwen/qwen3-coder',              // Very cheap alternative
  ];
}

// ============================================================================
// OpenRouter Provider Implementation
// ============================================================================

const DEFAULT_CONFIG: Required<Omit<OpenRouterProviderConfig, 'apiKey' | 'appName' | 'siteUrl' | 'fallbackModels' | 'preferredTier'>> = {
  defaultModel: 'anthropic/claude-sonnet-5',
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
 *   defaultModel: 'anthropic/claude-sonnet-5',
 * });
 *
 * const result = await provider.complete('Analyze this code for vulnerabilities...');
 * ```
 */
export class OpenRouterModelProvider extends BaseModelProvider {
  readonly id: string;
  readonly name: string;
  readonly type = 'openrouter' as const;

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

    this.id = `openrouter-${(this.config.defaultModel ?? 'default').replace(/[^a-z0-9]/gi, '-')}`;
    this.name = `OpenRouter (${this.config.defaultModel ?? 'default'})`;

    // Set cost per token based on default model
    const modelCosts = lookupModelCost(this.config.defaultModel);
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
            const costs = lookupModelCost(tryModel) || { input: 1, output: 2 };
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
 *   defaultModel: 'meta-llama/llama-4-maverick',
 * });
 *
 * // With fallback models
 * const provider = createOpenRouterProvider({
 *   defaultModel: 'anthropic/claude-sonnet-5',
 *   fallbackModels: ['openai/gpt-6-sol', 'google/gemini-2.5-pro'],
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
