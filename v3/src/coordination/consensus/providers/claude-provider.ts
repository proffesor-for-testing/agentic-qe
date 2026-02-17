/**
 * Agentic QE v3 - Claude Model Provider
 * MM-003: Claude implementation for multi-model consensus verification
 *
 * Provides security finding verification using Claude models from Anthropic.
 * Supports Claude 3.5 Sonnet and Claude 3 Opus with configurable parameters.
 *
 * @see docs/plans/AQE_V3_IMPROVEMENTS_PLAN.md - Phase 2: Multi-Model Verification
 */

import {
  ModelProvider,
  ModelCompletionOptions,
  ModelHealthResult,
} from '../interfaces';
import { toErrorMessage, toError } from '../../../shared/error-utils.js';
import {
  BaseModelProvider,
  buildVerificationPrompt,
} from '../model-provider';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Claude-specific API model versions (distinct from routing ClaudeModel)
 */
export type ClaudeAPIModel =
  | 'claude-3-5-sonnet-20241022'
  | 'claude-3-5-sonnet-latest'
  | 'claude-3-opus-20240229'
  | 'claude-3-opus-latest';

/**
 * Configuration for Claude provider
 */
export interface ClaudeProviderConfig {
  /** Anthropic API key */
  apiKey?: string;

  /** Default model to use */
  defaultModel?: ClaudeAPIModel;

  /** Base URL for Anthropic API (for proxies) */
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
 * Message format for Claude API
 */
interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Request format for Claude Messages API
 */
interface ClaudeCompletionRequest {
  model: string;
  max_tokens: number;
  temperature?: number;
  system?: string;
  messages: ClaudeMessage[];
}

/**
 * Response format from Claude Messages API
 */
interface ClaudeCompletionResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{ type: 'text'; text: string }>;
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Error response from Claude API
 */
interface ClaudeErrorResponse {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

// ============================================================================
// Claude Model Provider Implementation
// ============================================================================

/**
 * Claude model provider for consensus verification
 *
 * Uses Anthropic's Claude models to verify security findings through
 * the Messages API. Provides robust error handling, retries, and
 * configurable timeouts.
 *
 * @example
 * ```typescript
 * const provider = new ClaudeModelProvider({
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 *   defaultModel: 'claude-3-5-sonnet-20241022',
 * });
 *
 * const response = await provider.complete(prompt);
 * ```
 */
export class ClaudeModelProvider extends BaseModelProvider {
  readonly id = 'claude';
  readonly name = 'Claude (Anthropic)';
  readonly type: ModelProvider['type'] = 'claude';

  // Cost per million tokens (as of 2024)
  // Claude 3.5 Sonnet: $3 input, $15 output per 1M tokens
  // Claude 3 Opus: $15 input, $75 output per 1M tokens
  protected costPerToken = {
    input: 3 / 1_000_000,  // Will be overridden per model
    output: 15 / 1_000_000,
  };

  protected supportedModels: string[] = [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-sonnet-latest',
    'claude-3-opus-20240229',
    'claude-3-opus-latest',
  ];

  private readonly config: Required<ClaudeProviderConfig>;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  /**
   * Create a new Claude provider
   *
   * @param config - Provider configuration
   * @throws {Error} If API key is not provided
   */
  constructor(config: ClaudeProviderConfig = {}) {
    super();

    // Get API key from config or environment
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) {
      throw new Error(
        'Claude API key is required. Provide via config.apiKey or ANTHROPIC_API_KEY environment variable.'
      );
    }

    this.apiKey = apiKey;
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com';

    this.config = {
      apiKey,
      defaultModel: config.defaultModel || 'claude-3-5-sonnet-20241022',
      baseUrl: this.baseUrl,
      defaultTimeout: config.defaultTimeout || 30000,
      maxRetries: config.maxRetries ?? 3,
      retryDelayMs: config.retryDelayMs || 1000,
      enableLogging: config.enableLogging || false,
    };

    // Update cost based on default model
    this.updateCostForModel(this.config.defaultModel);
  }

  /**
   * Complete a prompt using Claude
   *
   * @param prompt - The prompt to complete
   * @param options - Optional completion options
   * @returns Promise resolving to completion text
   */
  async complete(prompt: string, options?: ModelCompletionOptions): Promise<string> {
    if (this.disposed) {
      throw new Error('Provider has been disposed');
    }

    const model = (options?.model as ClaudeAPIModel) || this.config.defaultModel;
    const maxTokens = options?.maxTokens || 4096;
    const temperature = options?.temperature ?? 0.7;
    const timeout = options?.timeout || this.config.defaultTimeout;
    const systemPrompt = options?.systemPrompt || this.getDefaultSystemPrompt();

    const request: ClaudeCompletionRequest = {
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    };

    if (this.config.enableLogging) {
      console.log(`[Claude] Sending request to ${model}`);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.makeRequest(request, timeout);

        if (this.config.enableLogging) {
          console.log(`[Claude] Received response (${response.usage.input_tokens} in, ${response.usage.output_tokens} out)`);
        }

        // Extract text from response
        const text = response.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('\n');

        return text;
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
            console.log(`[Claude] Retry ${attempt + 1}/${this.config.maxRetries} after ${delay}ms`);
          }
          await this.sleep(delay);
        }
      }
    }

    throw new Error(
      `Claude completion failed after ${this.config.maxRetries + 1} attempts: ${lastError?.message}`
    );
  }

  /**
   * Make HTTP request to Claude API
   */
  private async makeRequest(
    request: ClaudeCompletionRequest,
    timeout: number
  ): Promise<ClaudeCompletionResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = (await response.json()) as ClaudeErrorResponse;
        throw new Error(
          `Claude API error (${response.status}): ${errorData.error.message}`
        );
      }

      return (await response.json()) as ClaudeCompletionResponse;
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
    if (message.includes('invalid request') || message.includes('validation error')) {
      return true;
    }

    return false;
  }

  /**
   * Update cost based on model selection
   */
  private updateCostForModel(model: string): void {
    if (model.includes('opus')) {
      // Claude 3 Opus: $15 input, $75 output per 1M tokens
      this.costPerToken = {
        input: 15 / 1_000_000,
        output: 75 / 1_000_000,
      };
    } else {
      // Claude 3.5 Sonnet: $3 input, $15 output per 1M tokens
      this.costPerToken = {
        input: 3 / 1_000_000,
        output: 15 / 1_000_000,
      };
    }
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
 * Create a Claude model provider
 *
 * @param config - Optional provider configuration
 * @returns Configured Claude provider
 *
 * @example
 * ```typescript
 * const provider = createClaudeProvider({
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 *   defaultModel: 'claude-3-opus-latest',
 * });
 * ```
 */
export function createClaudeProvider(config?: ClaudeProviderConfig): ClaudeModelProvider {
  return new ClaudeModelProvider(config);
}
