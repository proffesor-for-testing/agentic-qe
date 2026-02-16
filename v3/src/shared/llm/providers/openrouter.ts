/**
 * Agentic QE v3 - OpenRouter Provider
 * ADR-043: Multi-Provider LLM Support Milestone 1
 *
 * OpenRouter provider enabling access to 200+ models through a unified API.
 * Features:
 * - Streaming via SSE
 * - Tool/function calling support
 * - Cost calculation with OpenRouter pricing
 * - Automatic model routing
 */

import {
  LLMProvider,
  LLMProviderType,
  LLMConfig,
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
import { TokenMetricsCollector } from '../../../learning/token-tracker.js';
import { toError } from '../../error-utils.js';
import { safeJsonParse } from '../../safe-json.js';

/**
 * OpenRouter-specific configuration
 */
export interface OpenRouterConfig extends LLMConfig {
  /** OpenRouter model (e.g., 'anthropic/claude-3.5-sonnet', 'openai/gpt-4o') */
  model: string;
  /** Site URL for OpenRouter attribution (optional but recommended) */
  siteUrl?: string;
  /** Site name for OpenRouter attribution (optional but recommended) */
  siteName?: string;
  /** Allow fallback to alternative models if primary is unavailable */
  allowFallback?: boolean;
  /** Force specific provider (e.g., 'anthropic' for Claude) */
  forceProvider?: string;
}

/**
 * Default OpenRouter configuration
 */
export const DEFAULT_OPENROUTER_CONFIG: OpenRouterConfig = {
  model: 'anthropic/claude-3.5-sonnet',
  maxTokens: 4096,
  temperature: 0.7,
  timeoutMs: 60000,
  maxRetries: 3,
  enableCache: true,
  enableCircuitBreaker: true,
  baseUrl: 'https://openrouter.ai/api/v1',
  allowFallback: false,
};

/**
 * OpenRouter API response types (OpenAI-compatible)
 */
interface OpenRouterCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenRouterStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null;
  }>;
}

interface OpenRouterErrorResponse {
  error: {
    message: string;
    type: string;
    code: string | number | null;
  };
}

interface OpenRouterModelsResponse {
  data: Array<{
    id: string;
    name: string;
    pricing: {
      prompt: string;
      completion: string;
    };
    context_length: number;
    architecture?: {
      modality: string;
      tokenizer: string;
    };
  }>;
}

/**
 * OpenRouter model pricing (cost per 1M tokens in USD)
 * Note: OpenRouter adds a small fee on top of provider pricing
 */
export const OPENROUTER_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic models via OpenRouter
  'anthropic/claude-3.5-sonnet': { input: 3.0, output: 15.0 },
  'anthropic/claude-3.5-sonnet:beta': { input: 3.0, output: 15.0 },
  'anthropic/claude-3-opus': { input: 15.0, output: 75.0 },
  'anthropic/claude-3-sonnet': { input: 3.0, output: 15.0 },
  'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },
  // OpenAI models via OpenRouter
  'openai/gpt-4o': { input: 5.0, output: 15.0 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
  'openai/gpt-4-turbo': { input: 10.0, output: 30.0 },
  'openai/gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  // Google models via OpenRouter
  'google/gemini-pro': { input: 0.125, output: 0.375 },
  'google/gemini-pro-1.5': { input: 3.5, output: 10.5 },
  // Meta models via OpenRouter
  'meta-llama/llama-3.1-70b-instruct': { input: 0.59, output: 0.79 },
  'meta-llama/llama-3.1-8b-instruct': { input: 0.06, output: 0.06 },
  // Mistral models via OpenRouter
  'mistralai/mistral-large': { input: 2.0, output: 6.0 },
  'mistralai/mixtral-8x7b-instruct': { input: 0.24, output: 0.24 },
  'mistralai/mistral-7b-instruct': { input: 0.06, output: 0.06 },
  // Default fallback for unknown models
  'default': { input: 1.0, output: 3.0 },
};

/**
 * OpenRouter LLM provider implementation
 */
export class OpenRouterProvider implements LLMProvider {
  readonly type: LLMProviderType = 'openai'; // Compatible with OpenAI interface
  readonly name: string = 'OpenRouter';

  private config: OpenRouterConfig;
  private requestId: number = 0;
  private cachedModels: string[] | null = null;

  constructor(config: Partial<OpenRouterConfig> = {}) {
    this.config = { ...DEFAULT_OPENROUTER_CONFIG, ...config };
  }

  /**
   * Check if OpenRouter is available and configured
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
        error: 'API key not configured. Set OPENROUTER_API_KEY environment variable.',
      };
    }

    const start = Date.now();

    try {
      // Check API availability by listing models (lightweight call)
      const response = await this.fetchWithTimeout(
        `${this.getBaseUrl()}/models`,
        {
          method: 'GET',
          headers: this.getHeaders(),
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

      const data = await response.json() as OpenRouterModelsResponse;
      const models = data.data?.map(m => m.id) || [];
      this.cachedModels = models;

      return {
        healthy: true,
        latencyMs,
        models: models.slice(0, 20), // Return top 20 models
        details: {
          totalModels: models.length,
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
        'OpenRouter API key not configured',
        'API_KEY_MISSING',
        { provider: 'openai', retryable: false }
      );
    }

    const messages = this.formatMessages(input, options?.systemPrompt);
    const model = options?.model ?? this.config.model;
    const maxTokens = options?.maxTokens ?? this.config.maxTokens ?? 4096;
    const temperature = options?.temperature ?? this.config.temperature ?? 0.7;
    const requestId = `openrouter-${++this.requestId}-${Date.now()}`;

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

    // OpenRouter-specific options
    if (this.config.allowFallback !== undefined) {
      body.route = this.config.allowFallback ? 'fallback' : undefined;
    }

    if (this.config.forceProvider) {
      body.provider = { order: [this.config.forceProvider] };
    }

    try {
      const response = await this.fetchWithRetry(
        `${this.getBaseUrl()}/chat/completions`,
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
        })) as OpenRouterErrorResponse;
        throw this.handleApiError(response.status, errorData, model);
      }

      const data = await response.json() as OpenRouterCompletionResponse;

      const usage: TokenUsage = {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      };

      const cost = this.calculateCost(model, usage);

      // ADR-042: Track token usage in TokenMetricsCollector
      TokenMetricsCollector.recordTokenUsage(
        requestId,
        'openrouter-provider',
        'llm',
        'generate',
        {
          inputTokens: usage.promptTokens,
          outputTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          estimatedCostUsd: cost.totalCost,
        }
      );

      const content = data.choices[0]?.message?.content ?? '';

      return {
        content,
        model: data.model,
        provider: 'openai', // Report as openai for compatibility
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
   * Generate text with streaming support
   * Returns an async generator that yields content chunks
   */
  async *generateStream(
    input: string | Message[],
    options?: GenerateOptions
  ): AsyncGenerator<string, LLMResponse, unknown> {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      throw createLLMError(
        'OpenRouter API key not configured',
        'API_KEY_MISSING',
        { provider: 'openai', retryable: false }
      );
    }

    const messages = this.formatMessages(input, options?.systemPrompt);
    const model = options?.model ?? this.config.model;
    const maxTokens = options?.maxTokens ?? this.config.maxTokens ?? 4096;
    const temperature = options?.temperature ?? this.config.temperature ?? 0.7;
    const requestId = `openrouter-stream-${++this.requestId}-${Date.now()}`;

    const start = Date.now();

    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages,
      stream: true,
    };

    if (options?.stopSequences && options.stopSequences.length > 0) {
      body.stop = options.stopSequences;
    }

    const response = await this.fetchWithTimeout(
      `${this.getBaseUrl()}/chat/completions`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      },
      options?.timeoutMs ?? this.config.timeoutMs ?? 60000
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        error: { message: 'Unknown error', type: 'unknown', code: null },
      })) as OpenRouterErrorResponse;
      throw this.handleApiError(response.status, errorData, model);
    }

    if (!response.body) {
      throw createLLMError(
        'No response body for streaming',
        'NETWORK_ERROR',
        { provider: 'openai', model, retryable: true }
      );
    }

    let fullContent = '';
    let finishReason: LLMResponse['finishReason'] = 'stop';
    let responseModel = model;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;

          if (trimmed.startsWith('data: ')) {
            try {
              const chunk = safeJsonParse(trimmed.slice(6)) as OpenRouterStreamChunk;
              const delta = chunk.choices[0]?.delta;

              if (delta?.content) {
                fullContent += delta.content;
                yield delta.content;
              }

              if (chunk.choices[0]?.finish_reason) {
                finishReason = this.mapFinishReason(chunk.choices[0].finish_reason);
              }

              if (chunk.model) {
                responseModel = chunk.model;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const latencyMs = Date.now() - start;

    // Estimate token usage for streaming (approximate)
    const estimatedPromptTokens = Math.ceil(JSON.stringify(messages).length / 4);
    const estimatedCompletionTokens = Math.ceil(fullContent.length / 4);

    const usage: TokenUsage = {
      promptTokens: estimatedPromptTokens,
      completionTokens: estimatedCompletionTokens,
      totalTokens: estimatedPromptTokens + estimatedCompletionTokens,
    };

    const cost = this.calculateCost(model, usage);

    // Track token usage
    TokenMetricsCollector.recordTokenUsage(
      requestId,
      'openrouter-provider',
      'llm',
      'generate-stream',
      {
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        estimatedCostUsd: cost.totalCost,
      }
    );

    return {
      content: fullContent,
      model: responseModel,
      provider: 'openai',
      usage,
      cost,
      latencyMs,
      finishReason,
      cached: false,
      requestId,
    };
  }

  /**
   * Generate embedding for text
   * Note: OpenRouter supports embeddings through some models
   */
  async embed(text: string, options?: EmbedOptions): Promise<EmbeddingResponse> {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      throw createLLMError(
        'OpenRouter API key not configured',
        'API_KEY_MISSING',
        { provider: 'openai', retryable: false }
      );
    }

    const model = options?.model ?? 'openai/text-embedding-3-small';
    const start = Date.now();

    try {
      const response = await this.fetchWithTimeout(
        `${this.getBaseUrl()}/embeddings`,
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
        })) as OpenRouterErrorResponse;
        throw this.handleApiError(response.status, errorData, model);
      }

      interface EmbeddingData {
        object: 'list';
        data: Array<{ object: 'embedding'; index: number; embedding: number[] }>;
        model: string;
        usage: { prompt_tokens: number; total_tokens: number };
      }

      const data = await response.json() as EmbeddingData;

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
  getConfig(): OpenRouterConfig {
    return { ...this.config };
  }

  /**
   * Get supported models (from cache or API)
   */
  getSupportedModels(): string[] {
    if (this.cachedModels) {
      return this.cachedModels;
    }

    // Return common models as fallback
    return [
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3-opus',
      'anthropic/claude-3-sonnet',
      'anthropic/claude-3-haiku',
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'openai/gpt-4-turbo',
      'openai/gpt-3.5-turbo',
      'google/gemini-pro',
      'google/gemini-pro-1.5',
      'meta-llama/llama-3.1-70b-instruct',
      'meta-llama/llama-3.1-8b-instruct',
      'mistralai/mistral-large',
      'mistralai/mixtral-8x7b-instruct',
    ];
  }

  /**
   * Get cost per token for current model
   */
  getCostPerToken(): { input: number; output: number } {
    const pricing = OPENROUTER_PRICING[this.config.model] || OPENROUTER_PRICING['default'];
    return {
      input: pricing.input / 1_000_000,
      output: pricing.output / 1_000_000,
    };
  }

  /**
   * Dispose provider resources
   */
  async dispose(): Promise<void> {
    this.cachedModels = null;
  }

  /**
   * Calculate cost for a given usage
   */
  private calculateCost(model: string, usage: TokenUsage): CostInfo {
    const pricing = OPENROUTER_PRICING[model] || OPENROUTER_PRICING['default'];

    // Convert from per-million to actual cost
    const inputCost = (usage.promptTokens / 1_000_000) * pricing.input;
    const outputCost = (usage.completionTokens / 1_000_000) * pricing.output;

    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      currency: 'USD',
    };
  }

  /**
   * Get API key from config or environment
   */
  private getApiKey(): string | undefined {
    return this.config.apiKey ?? process.env.OPENROUTER_API_KEY;
  }

  /**
   * Get base URL
   */
  private getBaseUrl(): string {
    return (this.config.baseUrl ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  }

  /**
   * Get request headers
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.getApiKey()}`,
    };

    // OpenRouter-specific headers for attribution
    if (this.config.siteUrl) {
      headers['HTTP-Referer'] = this.config.siteUrl;
    }

    if (this.config.siteName) {
      headers['X-Title'] = this.config.siteName;
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
   * Map OpenRouter finish reason to standard format
   */
  private mapFinishReason(
    reason: OpenRouterCompletionResponse['choices'][0]['finish_reason']
  ): LLMResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      case 'tool_calls':
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
    data: OpenRouterErrorResponse,
    model: string
  ): never {
    const message = data.error?.message ?? 'Unknown API error';
    const errorType = data.error?.type ?? '';
    const errorCode = data.error?.code;

    switch (status) {
      case 401:
        throw createLLMError(message, 'API_KEY_INVALID', {
          provider: 'openai',
          model,
          retryable: false,
        });
      case 402:
        throw createLLMError(message, 'COST_LIMIT_EXCEEDED', {
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
      case 404:
        throw createLLMError(message, 'MODEL_NOT_FOUND', {
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
        lastError = toError(error);

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
