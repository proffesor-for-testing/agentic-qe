/**
 * Agentic QE v3 - Google Gemini Provider
 * ADR-043: Multi-Provider LLM Support Milestone 4
 *
 * Google Gemini provider implementation supporting:
 * - Gemini Pro, Gemini Pro 1.5, Gemini Flash, Gemini Ultra models
 * - Streaming via SSE
 * - Tool/function calling support
 * - Cost calculation
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
 * Gemini-specific configuration
 */
export interface GeminiConfig extends LLMConfig {
  /** Gemini model (e.g., 'gemini-pro', 'gemini-1.5-pro', 'gemini-1.5-flash') */
  model: string;
  /** Safety settings threshold */
  safetyThreshold?: 'BLOCK_NONE' | 'BLOCK_ONLY_HIGH' | 'BLOCK_MEDIUM_AND_ABOVE' | 'BLOCK_LOW_AND_ABOVE';
}

/**
 * Default Gemini configuration
 */
export const DEFAULT_GEMINI_CONFIG: GeminiConfig = {
  model: 'gemini-1.5-pro',
  maxTokens: 8192,
  temperature: 0.7,
  timeoutMs: 60000,
  maxRetries: 3,
  enableCache: true,
  enableCircuitBreaker: true,
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  safetyThreshold: 'BLOCK_MEDIUM_AND_ABOVE',
};

/**
 * Gemini API response types
 */
interface GeminiGenerateResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text?: string;
        functionCall?: {
          name: string;
          args: Record<string, unknown>;
        };
      }>;
      role: 'model' | 'user';
    };
    finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  modelVersion?: string;
}

interface GeminiStreamChunk {
  candidates?: Array<{
    content: {
      parts: Array<{
        text?: string;
      }>;
      role: 'model';
    };
    finishReason?: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

interface GeminiErrorResponse {
  error: {
    code: number;
    message: string;
    status: string;
  };
}

interface GeminiModelsResponse {
  models: Array<{
    name: string;
    displayName: string;
    description: string;
    inputTokenLimit: number;
    outputTokenLimit: number;
    supportedGenerationMethods: string[];
  }>;
}

interface GeminiEmbeddingResponse {
  embedding: {
    values: number[];
  };
}

/**
 * Gemini model pricing (cost per 1M tokens in USD)
 * Prices as of early 2025
 */
export const GEMINI_PRICING: Record<string, { input: number; output: number }> = {
  // Gemini Pro models
  'gemini-pro': { input: 0.5, output: 1.5 },
  'gemini-1.0-pro': { input: 0.5, output: 1.5 },
  // Gemini 1.5 Pro models
  'gemini-1.5-pro': { input: 3.5, output: 10.5 },
  'gemini-1.5-pro-latest': { input: 3.5, output: 10.5 },
  // Gemini Flash models (economical)
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  'gemini-1.5-flash-latest': { input: 0.075, output: 0.3 },
  'gemini-2.0-flash-exp': { input: 0.075, output: 0.3 },
  // Gemini Ultra (flagship)
  'gemini-ultra': { input: 7.0, output: 21.0 },
  'gemini-1.0-ultra': { input: 7.0, output: 21.0 },
  // Default fallback
  'default': { input: 1.0, output: 3.0 },
};

/**
 * Google Gemini LLM provider implementation
 */
export class GeminiProvider implements LLMProvider {
  readonly type: LLMProviderType = 'gemini';
  readonly name: string = 'Google Gemini';

  private config: GeminiConfig;
  private requestId: number = 0;
  private cachedModels: string[] | null = null;

  constructor(config: Partial<GeminiConfig> = {}) {
    this.config = { ...DEFAULT_GEMINI_CONFIG, ...config };
  }

  /**
   * Check if Gemini is available and configured
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
        error: 'API key not configured. Set GOOGLE_AI_API_KEY or GEMINI_API_KEY environment variable.',
      };
    }

    const start = Date.now();

    try {
      const response = await this.fetchWithTimeout(
        `${this.getBaseUrl()}/models?key=${apiKey}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
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

      const data = await response.json() as GeminiModelsResponse;
      const models = data.models
        ?.filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => m.name.replace('models/', '')) || [];
      this.cachedModels = models;

      return {
        healthy: true,
        latencyMs,
        models: models.slice(0, 20),
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
        'Gemini API key not configured',
        'API_KEY_MISSING',
        { provider: 'gemini', retryable: false }
      );
    }

    const contents = this.formatContents(input);
    const model = options?.model ?? this.config.model;
    const maxTokens = options?.maxTokens ?? this.config.maxTokens ?? 8192;
    const temperature = options?.temperature ?? this.config.temperature ?? 0.7;
    const requestId = `gemini-${++this.requestId}-${Date.now()}`;

    const start = Date.now();

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
        topP: this.config.topP,
      },
    };

    // Add system instruction if provided
    if (options?.systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: options.systemPrompt }],
      };
    }

    // Add stop sequences
    if (options?.stopSequences && options.stopSequences.length > 0) {
      (body.generationConfig as Record<string, unknown>).stopSequences = options.stopSequences;
    }

    try {
      const response = await this.fetchWithRetry(
        `${this.getBaseUrl()}/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        options?.timeoutMs ?? this.config.timeoutMs ?? 60000,
        this.config.maxRetries ?? 3
      );

      const latencyMs = Date.now() - start;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: { message: 'Unknown error', code: 0, status: 'UNKNOWN' },
        })) as GeminiErrorResponse;
        throw this.handleApiError(response.status, errorData, model);
      }

      const data = await response.json() as GeminiGenerateResponse;

      const usage: TokenUsage = {
        promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
      };

      const cost = this.calculateCost(model, usage);

      // ADR-042: Track token usage
      TokenMetricsCollector.recordTokenUsage(
        requestId,
        'gemini-provider',
        'llm',
        'generate',
        {
          inputTokens: usage.promptTokens,
          outputTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          estimatedCostUsd: cost.totalCost,
        }
      );

      const content = data.candidates[0]?.content?.parts
        ?.map(p => p.text ?? '')
        .join('') ?? '';

      return {
        content,
        model: data.modelVersion ?? model,
        provider: 'gemini',
        usage,
        cost,
        latencyMs,
        finishReason: this.mapFinishReason(data.candidates[0]?.finishReason),
        cached: false,
        requestId,
      };
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        throw error;
      }
      throw createLLMError(
        error instanceof Error ? error.message : 'Request failed',
        'NETWORK_ERROR',
        { provider: 'gemini', model, retryable: true, cause: error as Error }
      );
    }
  }

  /**
   * Generate text with streaming support
   */
  async *generateStream(
    input: string | Message[],
    options?: GenerateOptions
  ): AsyncGenerator<string, LLMResponse, unknown> {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      throw createLLMError(
        'Gemini API key not configured',
        'API_KEY_MISSING',
        { provider: 'gemini', retryable: false }
      );
    }

    const contents = this.formatContents(input);
    const model = options?.model ?? this.config.model;
    const maxTokens = options?.maxTokens ?? this.config.maxTokens ?? 8192;
    const temperature = options?.temperature ?? this.config.temperature ?? 0.7;
    const requestId = `gemini-stream-${++this.requestId}-${Date.now()}`;

    const start = Date.now();

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
      },
    };

    if (options?.systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: options.systemPrompt }],
      };
    }

    const response = await this.fetchWithTimeout(
      `${this.getBaseUrl()}/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      options?.timeoutMs ?? this.config.timeoutMs ?? 60000
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        error: { message: 'Unknown error', code: 0, status: 'UNKNOWN' },
      })) as GeminiErrorResponse;
      throw this.handleApiError(response.status, errorData, model);
    }

    if (!response.body) {
      throw createLLMError(
        'No response body for streaming',
        'NETWORK_ERROR',
        { provider: 'gemini', model, retryable: true }
      );
    }

    let fullContent = '';
    let finishReason: LLMResponse['finishReason'] = 'stop';
    let lastUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

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
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          try {
            const chunk = safeJsonParse(trimmed.slice(6)) as GeminiStreamChunk;
            const text = chunk.candidates?.[0]?.content?.parts
              ?.map(p => p.text ?? '')
              .join('') ?? '';

            if (text) {
              fullContent += text;
              yield text;
            }

            if (chunk.candidates?.[0]?.finishReason) {
              finishReason = this.mapFinishReason(chunk.candidates[0].finishReason);
            }

            if (chunk.usageMetadata) {
              lastUsage = {
                promptTokens: chunk.usageMetadata.promptTokenCount,
                completionTokens: chunk.usageMetadata.candidatesTokenCount,
                totalTokens: chunk.usageMetadata.totalTokenCount,
              };
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const latencyMs = Date.now() - start;

    // Use actual usage if available, otherwise estimate
    const usage = lastUsage.totalTokens > 0 ? lastUsage : {
      promptTokens: Math.ceil(JSON.stringify(contents).length / 4),
      completionTokens: Math.ceil(fullContent.length / 4),
      totalTokens: 0,
    };
    usage.totalTokens = usage.promptTokens + usage.completionTokens;

    const cost = this.calculateCost(model, usage);

    TokenMetricsCollector.recordTokenUsage(
      requestId,
      'gemini-provider',
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
      model,
      provider: 'gemini',
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
   */
  async embed(text: string, options?: EmbedOptions): Promise<EmbeddingResponse> {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      throw createLLMError(
        'Gemini API key not configured',
        'API_KEY_MISSING',
        { provider: 'gemini', retryable: false }
      );
    }

    const model = options?.model ?? 'text-embedding-004';
    const start = Date.now();

    try {
      const response = await this.fetchWithTimeout(
        `${this.getBaseUrl()}/models/${model}:embedContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: { parts: [{ text }] },
          }),
        },
        options?.timeoutMs ?? this.config.timeoutMs ?? 30000
      );

      const latencyMs = Date.now() - start;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: { message: 'Unknown error', code: 0, status: 'UNKNOWN' },
        })) as GeminiErrorResponse;
        throw this.handleApiError(response.status, errorData, model);
      }

      const data = await response.json() as GeminiEmbeddingResponse;

      return {
        embedding: data.embedding.values,
        model,
        provider: 'gemini',
        tokenCount: Math.ceil(text.length / 4), // Approximate
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
        { provider: 'gemini', model, retryable: true, cause: error as Error }
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
    const response = await this.generate(prompt, {
      model: options?.model,
      temperature: options?.temperature ?? 0.2,
      maxTokens: options?.maxTokens ?? 256,
      stopSequences: options?.stopSequences ?? ['\n\n'],
    });

    return {
      completion: response.content,
      model: response.model,
      provider: 'gemini',
      usage: response.usage,
      latencyMs: response.latencyMs,
      cached: response.cached,
    };
  }

  /**
   * Get current provider configuration
   */
  getConfig(): GeminiConfig {
    return { ...this.config };
  }

  /**
   * Get supported models
   */
  getSupportedModels(): string[] {
    if (this.cachedModels) {
      return this.cachedModels;
    }

    return [
      'gemini-pro',
      'gemini-1.0-pro',
      'gemini-1.5-pro',
      'gemini-1.5-pro-latest',
      'gemini-1.5-flash',
      'gemini-1.5-flash-latest',
      'gemini-2.0-flash-exp',
      'gemini-ultra',
    ];
  }

  /**
   * Get cost per token for current model
   */
  getCostPerToken(): { input: number; output: number } {
    const pricing = GEMINI_PRICING[this.config.model] || GEMINI_PRICING['default'];
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
    const pricing = GEMINI_PRICING[model] || GEMINI_PRICING['default'];

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
    return this.config.apiKey ?? process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  }

  /**
   * Get base URL
   */
  private getBaseUrl(): string {
    return (this.config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  }

  /**
   * Format input to Gemini contents format
   */
  private formatContents(
    input: string | Message[]
  ): Array<{ role: string; parts: Array<{ text: string }> }> {
    if (typeof input === 'string') {
      return [{ role: 'user', parts: [{ text: input }] }];
    }

    return input
      .filter(m => m.role !== 'system') // System handled separately
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
  }

  /**
   * Map Gemini finish reason to standard format
   */
  private mapFinishReason(
    reason?: GeminiGenerateResponse['candidates'][0]['finishReason']
  ): LLMResponse['finishReason'] {
    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
        return 'content_filter';
      case 'RECITATION':
        return 'content_filter';
      default:
        return 'stop';
    }
  }

  /**
   * Handle API errors
   */
  private handleApiError(
    status: number,
    data: GeminiErrorResponse,
    model: string
  ): never {
    const message = data.error?.message ?? 'Unknown API error';
    const errorStatus = data.error?.status ?? '';

    switch (status) {
      case 400:
        // Check for context length exceeded FIRST (message-based detection)
        if (message.includes('token') || message.includes('length') || message.includes('exceeds')) {
          throw createLLMError(message, 'CONTEXT_LENGTH_EXCEEDED', {
            provider: 'gemini',
            model,
            retryable: false,
          });
        }
        // Then check for API key issues
        if (message.includes('API key')) {
          throw createLLMError(message, 'API_KEY_INVALID', {
            provider: 'gemini',
            model,
            retryable: false,
          });
        }
        // Generic INVALID_ARGUMENT falls through to UNKNOWN
        throw createLLMError(message, 'UNKNOWN', {
          provider: 'gemini',
          model,
          retryable: false,
        });
      case 401:
      case 403:
        throw createLLMError(message, 'API_KEY_INVALID', {
          provider: 'gemini',
          model,
          retryable: false,
        });
      case 404:
        throw createLLMError(message, 'MODEL_NOT_FOUND', {
          provider: 'gemini',
          model,
          retryable: false,
        });
      case 429:
        throw createLLMError(message, 'RATE_LIMITED', {
          provider: 'gemini',
          model,
          retryable: true,
          retryAfterMs: 60000,
        });
      case 500:
      case 502:
      case 503:
        throw createLLMError(message, 'PROVIDER_UNAVAILABLE', {
          provider: 'gemini',
          model,
          retryable: true,
          retryAfterMs: 5000,
        });
      default:
        throw createLLMError(message, 'UNKNOWN', {
          provider: 'gemini',
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
          provider: 'gemini',
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

        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          return response;
        }

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
