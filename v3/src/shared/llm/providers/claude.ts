/**
 * Agentic QE v3 - Claude Provider
 * ADR-011: LLM Provider System for Quality Engineering
 *
 * Primary LLM provider using Anthropic's Claude API.
 * Supports Claude Opus 4.5, Sonnet 4, and Haiku 3.5 models.
 */

import {
  LLMProvider,
  LLMProviderType,
  ClaudeConfig,
  Message,
  GenerateOptions,
  EmbedOptions,
  CompleteOptions,
  LLMResponse,
  EmbeddingResponse,
  CompletionResponse,
  HealthCheckResult,
  TokenUsage,
  CostInfo,
  createLLMError,
} from '../interfaces';
import { CostTracker } from '../cost-tracker';
import { TokenMetricsCollector } from '../../../learning/token-tracker.js';

/**
 * Default Claude configuration
 */
export const DEFAULT_CLAUDE_CONFIG: ClaudeConfig = {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  temperature: 0.7,
  timeoutMs: 60000,
  maxRetries: 3,
  anthropicVersion: '2023-06-01',
  enableCache: true,
  enableCircuitBreaker: true,
};

/**
 * Claude API response types
 */
interface ClaudeMessageResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{ type: 'text'; text: string }>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface ClaudeErrorResponse {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

/**
 * Claude LLM provider implementation
 */
export class ClaudeProvider implements LLMProvider {
  readonly type: LLMProviderType = 'claude';
  readonly name: string = 'Anthropic Claude';

  private config: ClaudeConfig;
  private requestId: number = 0;

  constructor(config: Partial<ClaudeConfig> = {}) {
    this.config = { ...DEFAULT_CLAUDE_CONFIG, ...config };
  }

  /**
   * Check if Claude is available and configured
   */
  async isAvailable(): Promise<boolean> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return false;
    }

    try {
      const result = await this.healthCheck();
      return result.healthy;
    } catch {
      return false;
    }
  }

  /**
   * Health check with latency measurement
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      return {
        healthy: false,
        error: 'API key not configured. Set ANTHROPIC_API_KEY environment variable.',
      };
    }

    const start = Date.now();

    try {
      // Use a minimal request to check API availability
      const response = await this.fetchWithTimeout(
        `${this.getBaseUrl()}/v1/messages`,
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            model: this.config.model,
            max_tokens: 1,
            messages: [{ role: 'user', content: 'Hi' }],
          }),
        },
        5000
      );

      const latencyMs = Date.now() - start;

      if (!response.ok) {
        const error = await response.text();
        return {
          healthy: false,
          latencyMs,
          error: `API error: ${response.status} - ${error}`,
        };
      }

      return {
        healthy: true,
        latencyMs,
        models: this.getSupportedModels(),
        details: {
          apiVersion: this.config.anthropicVersion,
          defaultModel: this.config.model,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate text from a prompt or messages
   */
  async generate(
    input: string | Message[],
    options?: GenerateOptions
  ): Promise<LLMResponse> {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      throw createLLMError(
        'Anthropic API key not configured',
        'API_KEY_MISSING',
        { provider: 'claude', retryable: false }
      );
    }

    const messages = this.formatMessages(input);
    const model = options?.model ?? this.config.model;
    const maxTokens = options?.maxTokens ?? this.config.maxTokens ?? 4096;
    const temperature = options?.temperature ?? this.config.temperature ?? 0.7;
    const requestId = `claude-${++this.requestId}-${Date.now()}`;

    const start = Date.now();

    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages,
    };

    if (options?.systemPrompt) {
      body.system = options.systemPrompt;
    }

    if (options?.stopSequences && options.stopSequences.length > 0) {
      body.stop_sequences = options.stopSequences;
    }

    try {
      const response = await this.fetchWithRetry(
        `${this.getBaseUrl()}/v1/messages`,
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(body),
        },
        options?.timeoutMs ?? this.config.timeoutMs ?? 60000,
        this.config.maxRetries ?? 3
      );

      const latencyMs = Date.now() - start;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: 'Unknown error' } })) as ClaudeErrorResponse;
        throw this.handleApiError(response.status, errorData, model);
      }

      const data = await response.json() as ClaudeMessageResponse;

      const usage: TokenUsage = {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      };

      const cost = CostTracker.calculateCost(model, usage);

      // ADR-042: Track token usage in TokenMetricsCollector
      TokenMetricsCollector.recordTokenUsage(
        requestId,
        'claude-provider',
        'llm',
        'generate',
        {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
          estimatedCostUsd: cost.totalCost,
        }
      );

      const content = data.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('');

      return {
        content,
        model: data.model,
        provider: 'claude',
        usage,
        cost,
        latencyMs,
        finishReason: this.mapFinishReason(data.stop_reason),
        cached: false,
        requestId,
      };
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        throw error; // Re-throw LLM errors
      }
      throw createLLMError(
        error instanceof Error ? error.message : 'Request failed',
        'NETWORK_ERROR',
        { provider: 'claude', model, retryable: true, cause: error as Error }
      );
    }
  }

  /**
   * Generate embedding for text
   * Note: Claude doesn't have a native embedding API, so we use a text-based approach
   */
  async embed(_text: string, _options?: EmbedOptions): Promise<EmbeddingResponse> {
    // Claude doesn't support embeddings natively
    // For production use, integrate with Anthropic's embedding solution or use a different provider
    throw createLLMError(
      'Claude does not support native embeddings. Use OpenAI or Ollama for embeddings.',
      'MODEL_NOT_FOUND',
      { provider: 'claude', retryable: false }
    );
  }

  /**
   * Complete a partial text (code completion style)
   */
  async complete(
    prompt: string,
    options?: CompleteOptions
  ): Promise<CompletionResponse> {
    // Use generate with code-completion-optimized settings
    const response = await this.generate(prompt, {
      model: options?.model,
      temperature: options?.temperature ?? 0.2, // Lower temperature for completion
      maxTokens: options?.maxTokens ?? 256, // Shorter for completion
      stopSequences: options?.stopSequences ?? ['\n\n', '```'],
    });

    return {
      completion: response.content,
      model: response.model,
      provider: 'claude',
      usage: response.usage,
      latencyMs: response.latencyMs,
      cached: response.cached,
    };
  }

  /**
   * Get current provider configuration
   */
  getConfig(): ClaudeConfig {
    return { ...this.config };
  }

  /**
   * Get supported models
   */
  getSupportedModels(): string[] {
    return [
      'claude-opus-4-5-20251101',
      'claude-sonnet-4-20250514',
      'claude-3-5-haiku-20241022',
      // Legacy models
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ];
  }

  /**
   * Get cost per token for current model
   */
  getCostPerToken(): { input: number; output: number } {
    return CostTracker.getCostPerToken(this.config.model);
  }

  /**
   * Dispose provider resources
   */
  async dispose(): Promise<void> {
    // No persistent resources to clean up
  }

  /**
   * Get API key from config or environment
   */
  private getApiKey(): string | undefined {
    return this.config.apiKey ?? process.env.ANTHROPIC_API_KEY;
  }

  /**
   * Get base URL
   */
  private getBaseUrl(): string {
    return (this.config.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
  }

  /**
   * Get request headers
   */
  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.getApiKey()!,
      'anthropic-version': this.config.anthropicVersion ?? '2023-06-01',
    };
  }

  /**
   * Format input to messages array
   */
  private formatMessages(input: string | Message[]): Array<{ role: string; content: string }> {
    if (typeof input === 'string') {
      return [{ role: 'user', content: input }];
    }

    // Filter out system messages (handled separately in Claude)
    return input
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));
  }

  /**
   * Map Claude finish reason to standard format
   */
  private mapFinishReason(
    reason: ClaudeMessageResponse['stop_reason']
  ): LLMResponse['finishReason'] {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'stop_sequence':
        return 'stop';
      default:
        return 'stop';
    }
  }

  /**
   * Handle API errors with proper error types
   */
  private handleApiError(
    status: number,
    data: ClaudeErrorResponse | { error: { message: string; type?: string } },
    model: string
  ): never {
    const message = 'error' in data
      ? data.error?.message ?? 'Unknown API error'
      : 'Unknown API error';

    const errorType = 'error' in data && 'type' in data.error ? data.error.type : '';

    switch (status) {
      case 401:
        throw createLLMError(message, 'API_KEY_INVALID', {
          provider: 'claude',
          model,
          retryable: false,
        });
      case 429:
        throw createLLMError(message, 'RATE_LIMITED', {
          provider: 'claude',
          model,
          retryable: true,
          retryAfterMs: 60000,
        });
      case 400:
        if (errorType === 'invalid_request_error' && message.includes('context')) {
          throw createLLMError(message, 'CONTEXT_LENGTH_EXCEEDED', {
            provider: 'claude',
            model,
            retryable: false,
          });
        }
        throw createLLMError(message, 'UNKNOWN', {
          provider: 'claude',
          model,
          retryable: false,
        });
      case 500:
      case 502:
      case 503:
        throw createLLMError(message, 'PROVIDER_UNAVAILABLE', {
          provider: 'claude',
          model,
          retryable: true,
          retryAfterMs: 5000,
        });
      default:
        throw createLLMError(message, 'UNKNOWN', {
          provider: 'claude',
          model,
          retryable: false,
        });
    }
  }

  /**
   * Fetch with timeout
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw createLLMError('Request timed out', 'TIMEOUT', {
          provider: 'claude',
          retryable: true,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Fetch with retry logic
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    timeoutMs: number,
    maxRetries: number
  ): Promise<Response> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, options, timeoutMs);

        // Don't retry on client errors (except rate limiting)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          return response;
        }

        // Retry on server errors and rate limiting
        if (response.status >= 500 || response.status === 429) {
          if (attempt < maxRetries - 1) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
            await this.sleep(delay);
            continue;
          }
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Only retry on network/timeout errors
        if (attempt < maxRetries - 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
          await this.sleep(delay);
        }
      }
    }

    throw lastError ?? new Error('Request failed after retries');
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
