/**
 * Agentic QE v3 - OpenAI Provider
 * ADR-011: LLM Provider System for Quality Engineering
 *
 * Secondary LLM provider using OpenAI's API.
 * Supports GPT-4o, GPT-4-turbo, and GPT-3.5-turbo models.
 */

import {
  LLMProvider,
  LLMProviderType,
  OpenAIConfig,
  Message,
  GenerateOptions,
  EmbedOptions,
  CompleteOptions,
  LLMResponse,
  EmbeddingResponse,
  CompletionResponse,
  HealthCheckResult,
  TokenUsage,
  createLLMError,
} from '../interfaces';
import { CostTracker } from '../cost-tracker';

/**
 * Default OpenAI configuration
 */
export const DEFAULT_OPENAI_CONFIG: OpenAIConfig = {
  model: 'gpt-4o',
  maxTokens: 4096,
  temperature: 0.7,
  timeoutMs: 60000,
  maxRetries: 3,
  enableCache: true,
  enableCircuitBreaker: true,
};

/**
 * OpenAI API response types
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
    finish_reason: 'stop' | 'length' | 'content_filter' | 'function_call' | null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIEmbeddingResponse {
  object: 'list';
  data: Array<{
    object: 'embedding';
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    code: string | null;
  };
}

/**
 * OpenAI LLM provider implementation
 */
export class OpenAIProvider implements LLMProvider {
  readonly type: LLMProviderType = 'openai';
  readonly name: string = 'OpenAI';

  private config: OpenAIConfig;
  private requestId: number = 0;

  constructor(config: Partial<OpenAIConfig> = {}) {
    this.config = { ...DEFAULT_OPENAI_CONFIG, ...config };
  }

  /**
   * Check if OpenAI is available and configured
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
        error: 'API key not configured. Set OPENAI_API_KEY environment variable.',
      };
    }

    const start = Date.now();

    try {
      // Use a minimal request to check API availability
      const response = await this.fetchWithTimeout(
        `${this.getBaseUrl()}/v1/chat/completions`,
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
          defaultModel: this.config.model,
          organization: this.config.organization,
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
        'OpenAI API key not configured',
        'API_KEY_MISSING',
        { provider: 'openai', retryable: false }
      );
    }

    const messages = this.formatMessages(input, options?.systemPrompt);
    const model = options?.model ?? this.config.model;
    const maxTokens = options?.maxTokens ?? this.config.maxTokens ?? 4096;
    const temperature = options?.temperature ?? this.config.temperature ?? 0.7;
    const requestId = `openai-${++this.requestId}-${Date.now()}`;

    const start = Date.now();

    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages,
    };

    if (options?.stopSequences && options.stopSequences.length > 0) {
      body.stop = options.stopSequences;
    }

    if (this.config.presencePenalty !== undefined) {
      body.presence_penalty = this.config.presencePenalty;
    }

    if (this.config.frequencyPenalty !== undefined) {
      body.frequency_penalty = this.config.frequencyPenalty;
    }

    try {
      const response = await this.fetchWithRetry(
        `${this.getBaseUrl()}/v1/chat/completions`,
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
        const errorData = await response.json().catch(() => ({
          error: { message: 'Unknown error', type: 'unknown', code: null },
        }));
        throw this.handleApiError(response.status, errorData, model);
      }

      const data: OpenAICompletionResponse = await response.json();

      const usage: TokenUsage = {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      };

      const cost = CostTracker.calculateCost(model, usage);

      const content = data.choices[0]?.message?.content ?? '';

      return {
        content,
        model: data.model,
        provider: 'openai',
        usage,
        cost,
        latencyMs,
        finishReason: this.mapFinishReason(data.choices[0]?.finish_reason),
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
        { provider: 'openai', model, retryable: true, cause: error as Error }
      );
    }
  }

  /**
   * Generate embedding for text
   */
  async embed(text: string, options?: EmbedOptions): Promise<EmbeddingResponse> {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      throw createLLMError(
        'OpenAI API key not configured',
        'API_KEY_MISSING',
        { provider: 'openai', retryable: false }
      );
    }

    const model = options?.model ?? 'text-embedding-3-small';
    const start = Date.now();

    try {
      const response = await this.fetchWithTimeout(
        `${this.getBaseUrl()}/v1/embeddings`,
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            model,
            input: text,
          }),
        },
        options?.timeoutMs ?? this.config.timeoutMs ?? 30000
      );

      const latencyMs = Date.now() - start;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: { message: 'Unknown error', type: 'unknown', code: null },
        }));
        throw this.handleApiError(response.status, errorData, model);
      }

      const data: OpenAIEmbeddingResponse = await response.json();

      return {
        embedding: data.data[0].embedding,
        model: data.model,
        provider: 'openai',
        tokenCount: data.usage.total_tokens,
        latencyMs,
        cached: false,
      };
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        throw error;
      }
      throw createLLMError(
        error instanceof Error ? error.message : 'Embedding request failed',
        'NETWORK_ERROR',
        { provider: 'openai', model, retryable: true, cause: error as Error }
      );
    }
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
      stopSequences: options?.stopSequences ?? ['\n\n'],
    });

    return {
      completion: response.content,
      model: response.model,
      provider: 'openai',
      usage: response.usage,
      latencyMs: response.latencyMs,
      cached: response.cached,
    };
  }

  /**
   * Get current provider configuration
   */
  getConfig(): OpenAIConfig {
    return { ...this.config };
  }

  /**
   * Get supported models
   */
  getSupportedModels(): string[] {
    return [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
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
    return this.config.apiKey ?? process.env.OPENAI_API_KEY;
  }

  /**
   * Get base URL
   */
  private getBaseUrl(): string {
    return (this.config.baseUrl ?? 'https://api.openai.com').replace(/\/$/, '');
  }

  /**
   * Get request headers
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.getApiKey()}`,
    };

    if (this.config.organization) {
      headers['OpenAI-Organization'] = this.config.organization;
    }

    return headers;
  }

  /**
   * Format input to messages array
   */
  private formatMessages(
    input: string | Message[],
    systemPrompt?: string
  ): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];

    if (typeof input === 'string') {
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      messages.push({ role: 'user', content: input });
    } else {
      // Include system prompt if not already present
      const hasSystem = input.some((m) => m.role === 'system');
      if (systemPrompt && !hasSystem) {
        messages.push({ role: 'system', content: systemPrompt });
      }

      for (const m of input) {
        messages.push({ role: m.role, content: m.content });
      }
    }

    return messages;
  }

  /**
   * Map OpenAI finish reason to standard format
   */
  private mapFinishReason(
    reason: OpenAICompletionResponse['choices'][0]['finish_reason']
  ): LLMResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }

  /**
   * Handle API errors with proper error types
   */
  private handleApiError(
    status: number,
    data: OpenAIErrorResponse,
    model: string
  ): never {
    const message = data.error?.message ?? 'Unknown API error';
    const errorType = data.error?.type ?? '';
    const errorCode = data.error?.code ?? '';

    switch (status) {
      case 401:
        throw createLLMError(message, 'API_KEY_INVALID', {
          provider: 'openai',
          model,
          retryable: false,
        });
      case 429:
        throw createLLMError(message, 'RATE_LIMITED', {
          provider: 'openai',
          model,
          retryable: true,
          retryAfterMs: 60000,
        });
      case 400:
        if (errorCode === 'context_length_exceeded' || errorType === 'invalid_request_error') {
          throw createLLMError(message, 'CONTEXT_LENGTH_EXCEEDED', {
            provider: 'openai',
            model,
            retryable: false,
          });
        }
        throw createLLMError(message, 'UNKNOWN', {
          provider: 'openai',
          model,
          retryable: false,
        });
      case 500:
      case 502:
      case 503:
        throw createLLMError(message, 'PROVIDER_UNAVAILABLE', {
          provider: 'openai',
          model,
          retryable: true,
          retryAfterMs: 5000,
        });
      default:
        throw createLLMError(message, 'UNKNOWN', {
          provider: 'openai',
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
          provider: 'openai',
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
