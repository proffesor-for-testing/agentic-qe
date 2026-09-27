/**
 * Agentic QE v3 - OpenAI Model Provider
 * MM-004: OpenAI implementation for multi-model consensus verification
 *
 * Provides security finding verification using OpenAI GPT models.
 * Supports the GPT-6 family (sol, luna, astra) with configurable parameters.
 *
 * @see docs/plans/AQE_V3_IMPROVEMENTS_PLAN.md - Phase 2: Multi-Model Verification
 */

import {
  ModelProvider,
  ModelCompletionOptions,
  ModelHealthResult,
} from '../interfaces';
import {
  BaseModelProvider,
} from '../model-provider';
import { CONSENSUS_CONSTANTS } from '../../constants.js';
import { toErrorMessage, toError } from '../../../shared/error-utils.js';
import { applyOpenAIParams } from '../../../shared/llm/openai-params.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * OpenAI-specific model versions
 */
export type OpenAIModel =
  | 'gpt-6-sol'
  | 'gpt-6-luna'
  | 'gpt-6-astra'
  | 'gpt-5.6-sol'
  | 'gpt-5.4-mini'
  /** @deprecated Legacy GPT-4 generation — kept for config compatibility only. */
  | 'gpt-4'
  /** @deprecated Legacy GPT-4 generation — kept for config compatibility only. */
  | 'gpt-4-turbo'
  /** @deprecated Legacy GPT-4 generation — kept for config compatibility only. */
  | 'gpt-4-turbo-preview'
  /** @deprecated Legacy GPT-4 generation — kept for config compatibility only. */
  | 'gpt-4-0125-preview'
  /** @deprecated Legacy GPT-4 generation — kept for config compatibility only. */
  | 'gpt-4-1106-preview';

/**
 * Cost per million tokens (USD), from the OpenAI API catalog (2026-09-27).
 * Legacy GPT-4 rows are kept so configs pinned to them still price correctly.
 */
const OPENAI_MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-6-astra': { input: 10, output: 50 },
  'gpt-6-sol': { input: 2, output: 10 },
  'gpt-6-luna': { input: 0.1, output: 0.5 },
  'gpt-5.4-mini': { input: 0.75, output: 4.5 },
  // Deprecated (legacy GPT-4 generation)
  'gpt-4': { input: 30, output: 60 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-4-turbo-preview': { input: 10, output: 30 },
  'gpt-4-0125-preview': { input: 10, output: 30 },
  'gpt-4-1106-preview': { input: 10, output: 30 },
};

/**
 * Configuration for OpenAI provider
 */
export interface OpenAIProviderConfig {
  /** OpenAI API key */
  apiKey?: string;

  /** Organization ID (optional) */
  organization?: string;

  /** Default model to use */
  defaultModel?: OpenAIModel;

  /** Base URL for OpenAI API (for proxies) */
  baseUrl?: string;

  /** Default timeout for requests (ms) */
  defaultTimeout?: number;

  /** Maximum retries on failure */
  maxRetries?: number;

  /** Retry delay in ms */
  retryDelayMs?: number;

  /** Enable request/response logging */
  enableLogging?: boolean;
}

/**
 * Message format for OpenAI Chat Completions API
 */
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Request format for OpenAI Chat Completions
 */
interface OpenAICompletionRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

/**
 * Response format from OpenAI Chat Completions API
 */
interface OpenAICompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Error response from OpenAI API
 */
interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    param: string | null;
    code: string | null;
  };
}

// ============================================================================
// OpenAI Model Provider Implementation
// ============================================================================

/**
 * OpenAI model provider for consensus verification
 *
 * Uses OpenAI's GPT models to verify security findings through
 * the Chat Completions API. Provides robust error handling, retries,
 * and configurable timeouts.
 *
 * @example
 * ```typescript
 * const provider = new OpenAIModelProvider({
 *   apiKey: process.env.OPENAI_API_KEY,
 *   defaultModel: 'gpt-6-sol',
 * });
 *
 * const response = await provider.complete(prompt);
 * ```
 */
export class OpenAIModelProvider extends BaseModelProvider {
  readonly id = 'openai';
  readonly name = 'OpenAI GPT';
  readonly type: ModelProvider['type'] = 'openai';

  // Overridden per model from OPENAI_MODEL_COSTS in the constructor
  protected costPerToken = {
    input: 2 / 1_000_000,
    output: 10 / 1_000_000,
  };

  protected supportedModels: string[] = [
    'gpt-6-sol',
    'gpt-6-luna',
    'gpt-6-astra',
    'gpt-5.6-sol',
    'gpt-5.4-mini',
  ];

  private readonly config: Required<OpenAIProviderConfig>;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  /**
   * Create a new OpenAI provider
   *
   * @param config - Provider configuration
   * @throws {Error} If API key is not provided
   */
  constructor(config: OpenAIProviderConfig = {}) {
    super();

    // Get API key from config or environment
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY || '';
    if (!apiKey) {
      throw new Error(
        'OpenAI API key is required. Provide via config.apiKey or OPENAI_API_KEY environment variable.'
      );
    }

    this.apiKey = apiKey;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';

    this.config = {
      apiKey,
      organization: config.organization || '',
      defaultModel: config.defaultModel || 'gpt-6-sol',
      baseUrl: this.baseUrl,
      defaultTimeout: config.defaultTimeout || CONSENSUS_CONSTANTS.MODEL_TIMEOUT_MS,
      maxRetries: config.maxRetries ?? CONSENSUS_CONSTANTS.DEFAULT_RETRY_ATTEMPTS,
      retryDelayMs: config.retryDelayMs || CONSENSUS_CONSTANTS.DEFAULT_RETRY_DELAY_MS,
      enableLogging: config.enableLogging || false,
    };

    // Update cost based on default model
    this.updateCostForModel(this.config.defaultModel);
  }

  /**
   * Complete a prompt using OpenAI
   *
   * @param prompt - The prompt to complete
   * @param options - Optional completion options
   * @returns Promise resolving to completion text
   */
  async complete(prompt: string, options?: ModelCompletionOptions): Promise<string> {
    if (this.disposed) {
      throw new Error('Provider has been disposed');
    }

    const model = (options?.model as OpenAIModel) || this.config.defaultModel;
    const maxTokens = options?.maxTokens || CONSENSUS_CONSTANTS.DEFAULT_MAX_TOKENS;
    const temperature = options?.temperature ?? 0.7;
    const timeout = options?.timeout || this.config.defaultTimeout;
    const systemPrompt = options?.systemPrompt || this.getDefaultSystemPrompt();

    const messages: OpenAIMessage[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    const request: OpenAICompletionRequest = applyOpenAIParams(
      { model, messages },
      model,
      { maxTokens, temperature }
    );

    if (this.config.enableLogging) {
      console.log(`[OpenAI] Sending request to ${model}`);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.makeRequest(request, timeout);

        if (this.config.enableLogging) {
          console.log(`[OpenAI] Received response (${response.usage.prompt_tokens} in, ${response.usage.completion_tokens} out)`);
        }

        // Extract text from first choice
        if (response.choices.length === 0) {
          throw new Error('OpenAI returned no choices');
        }

        return response.choices[0].message.content;
      } catch (error) {
        lastError = toError(error);

        // Don't retry on certain errors
        if (this.isNonRetryableError(error)) {
          throw lastError;
        }

        // Retry with exponential backoff
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt);
          if (this.config.enableLogging) {
            console.log(`[OpenAI] Retry ${attempt + 1}/${this.config.maxRetries} after ${delay}ms`);
          }
          await this.sleep(delay);
        }
      }
    }

    throw new Error(
      `OpenAI completion failed after ${this.config.maxRetries + 1} attempts: ${lastError?.message}`
    );
  }

  /**
   * Make HTTP request to OpenAI API
   */
  private async makeRequest(
    request: OpenAICompletionRequest,
    timeout: number
  ): Promise<OpenAICompletionResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      };

      if (this.config.organization) {
        headers['OpenAI-Organization'] = this.config.organization;
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = (await response.json()) as OpenAIErrorResponse;
        throw new Error(
          `OpenAI API error (${response.status}): ${errorData.error.message}`
        );
      }

      return (await response.json()) as OpenAICompletionResponse;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Perform health check
   */
  protected async performHealthCheck(): Promise<ModelHealthResult> {
    const startTime = Date.now();

    try {
      // Make a minimal request to check API availability
      const testPrompt = 'Hello';
      await this.complete(testPrompt, {
        maxTokens: 10,
        timeout: 5000,
      });

      return {
        healthy: true,
        latencyMs: Date.now() - startTime,
        availableModels: this.supportedModels,
      };
    } catch (error) {
      return {
        healthy: false,
        error: toErrorMessage(error),
        availableModels: this.supportedModels,
      };
    }
  }

  /**
   * Get default system prompt for security analysis
   */
  private getDefaultSystemPrompt(): string {
    return `You are a security expert specializing in code security analysis and vulnerability assessment.

Your role is to carefully analyze security findings and determine their validity. You should:

1. Examine the evidence objectively
2. Consider both true positives and false positives
3. Assess the severity accurately
4. Provide clear, actionable reasoning
5. Suggest concrete remediation steps when appropriate

Focus on accuracy over speed. It's better to mark something as "INCONCLUSIVE" if you're unsure than to give an incorrect assessment.`;
  }

  /**
   * Check if an error should not be retried
   */
  private isNonRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();

    // Don't retry authentication errors
    if (message.includes('unauthorized') || message.includes('invalid api key')) {
      return true;
    }

    // Don't retry invalid request errors
    if (message.includes('invalid_request_error')) {
      return true;
    }

    // Don't retry quota/billing errors
    if (message.includes('insufficient_quota') || message.includes('billing')) {
      return true;
    }

    return false;
  }

  /**
   * Update cost based on model selection
   */
  private updateCostForModel(model: string): void {
    // Unknown models are priced as the default tier (gpt-6-sol)
    const pricing = OPENAI_MODEL_COSTS[model] ?? OPENAI_MODEL_COSTS['gpt-6-sol'];
    this.costPerToken = {
      input: pricing.input / 1_000_000,
      output: pricing.output / 1_000_000,
    };
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get cost per token for current model
   */
  override getCostPerToken(): { input: number; output: number } {
    return { ...this.costPerToken };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an OpenAI model provider
 *
 * @param config - Optional provider configuration
 * @returns Configured OpenAI provider
 *
 * @example
 * ```typescript
 * const provider = createOpenAIProvider({
 *   apiKey: process.env.OPENAI_API_KEY,
 *   defaultModel: 'gpt-6-sol',
 * });
 * ```
 */
export function createOpenAIProvider(config?: OpenAIProviderConfig): OpenAIModelProvider {
  return new OpenAIModelProvider(config);
}
