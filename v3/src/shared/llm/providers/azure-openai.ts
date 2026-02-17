/**
 * Agentic QE v3 - Azure OpenAI Provider
 * ADR-043 Milestone 5: Azure OpenAI Provider Support
 *
 * Enterprise LLM provider using Azure's OpenAI Service.
 * Supports deployment-based model selection, both API key and Azure AD token authentication.
 *
 * Environment Variables:
 *   AZURE_OPENAI_API_KEY - API key for authentication
 *   AZURE_OPENAI_ENDPOINT - Azure OpenAI resource endpoint
 *   AZURE_OPENAI_API_VERSION - API version (default: 2024-02-15-preview)
 *   AZURE_OPENAI_DEPLOYMENT - Default deployment name
 *
 * @example
 * ```typescript
 * const provider = new AzureOpenAIProvider({
 *   endpoint: 'https://my-resource.openai.azure.com',
 *   deploymentId: 'my-gpt4-deployment',
 *   apiKey: 'my-api-key',
 * });
 *
 * // Or with Azure AD token
 * const provider = new AzureOpenAIProvider({
 *   endpoint: 'https://my-resource.openai.azure.com',
 *   deploymentId: 'my-gpt4-deployment',
 *   azureAdToken: 'my-ad-token',
 * });
 * ```
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
  createLLMError,
} from '../interfaces';
import { CostTracker } from '../cost-tracker';
import { TokenMetricsCollector } from '../../../learning/token-tracker.js';
import { toError } from '../../error-utils.js';

/**
 * Azure OpenAI-specific configuration
 */
export interface AzureOpenAIConfig extends LLMConfig {
  /** Azure OpenAI resource endpoint (e.g., https://my-resource.openai.azure.com) */
  endpoint?: string;
  /** Deployment ID (deployment name in Azure portal) */
  deploymentId: string;
  /** API version (default: 2024-02-15-preview) */
  apiVersion?: string;
  /** Azure AD token for authentication (alternative to API key) */
  azureAdToken?: string;
  /** Presence penalty (-2 to 2) */
  presencePenalty?: number;
  /** Frequency penalty (-2 to 2) */
  frequencyPenalty?: number;
}

/**
 * Default Azure OpenAI configuration
 */
export const DEFAULT_AZURE_OPENAI_CONFIG: Partial<AzureOpenAIConfig> = {
  model: 'gpt-4o', // Base model - actual deployment may vary
  maxTokens: 4096,
  temperature: 0.7,
  timeoutMs: 60000,
  maxRetries: 3,
  enableCache: true,
  enableCircuitBreaker: true,
  apiVersion: '2024-02-15-preview',
};

/**
 * Azure OpenAI API response types
 */
interface AzureOpenAICompletionResponse {
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
    finish_reason: 'stop' | 'length' | 'content_filter' | null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface AzureOpenAIEmbeddingResponse {
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

interface AzureOpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    code: string | null;
    innererror?: {
      code: string;
      content_filter_result?: unknown;
    };
  };
}

/**
 * Azure OpenAI LLM provider implementation
 * Supports both API key and Azure AD token authentication
 */
export class AzureOpenAIProvider implements LLMProvider {
  readonly type: LLMProviderType = 'azure-openai';
  readonly name: string = 'Azure OpenAI';

  private config: AzureOpenAIConfig;
  private requestId: number = 0;

  constructor(config: Partial<AzureOpenAIConfig> & { deploymentId: string }) {
    this.config = { ...DEFAULT_AZURE_OPENAI_CONFIG, ...config } as AzureOpenAIConfig;
  }

  /**
   * Check if Azure OpenAI is available and configured
   */
  async isAvailable(): Promise<boolean> {
    const endpoint = this.getEndpoint();
    const hasAuth = this.getApiKey() || this.getAzureAdToken();

    if (!endpoint || !hasAuth || !this.config.deploymentId) {
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
    const endpoint = this.getEndpoint();
    const hasAuth = this.getApiKey() || this.getAzureAdToken();

    if (!endpoint) {
      return {
        healthy: false,
        error: 'Azure endpoint not configured. Set AZURE_OPENAI_ENDPOINT environment variable.',
      };
    }

    if (!hasAuth) {
      return {
        healthy: false,
        error: 'Azure authentication not configured. Set AZURE_OPENAI_API_KEY or provide azureAdToken.',
      };
    }

    if (!this.config.deploymentId) {
      return {
        healthy: false,
        error: 'Deployment ID not configured. Set AZURE_OPENAI_DEPLOYMENT or provide deploymentId.',
      };
    }

    const start = Date.now();

    try {
      // Use a minimal request to check API availability
      const response = await this.fetchWithTimeout(
        this.buildUrl('chat/completions'),
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
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
          endpoint: this.getEndpoint(),
          deploymentId: this.config.deploymentId,
          apiVersion: this.config.apiVersion,
          authType: this.getAzureAdToken() ? 'Azure AD' : 'API Key',
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
    const endpoint = this.getEndpoint();
    const hasAuth = this.getApiKey() || this.getAzureAdToken();

    if (!endpoint || !hasAuth) {
      throw createLLMError(
        'Azure OpenAI not configured',
        'API_KEY_MISSING',
        { provider: 'azure-openai', retryable: false }
      );
    }

    const messages = this.formatMessages(input, options?.systemPrompt);
    const model = options?.model ?? this.config.model ?? 'gpt-4o';
    const maxTokens = options?.maxTokens ?? this.config.maxTokens ?? 4096;
    const temperature = options?.temperature ?? this.config.temperature ?? 0.7;
    const requestId = `azure-openai-${++this.requestId}-${Date.now()}`;

    const start = Date.now();

    const body: Record<string, unknown> = {
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
        this.buildUrl('chat/completions'),
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
        })) as AzureOpenAIErrorResponse;
        throw this.handleApiError(response.status, errorData, model);
      }

      const data = await response.json() as AzureOpenAICompletionResponse;

      const usage: TokenUsage = {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      };

      // Use Azure-specific cost calculation (same rates as OpenAI)
      const cost = CostTracker.calculateCost(model, usage);

      // ADR-042: Track token usage in TokenMetricsCollector
      TokenMetricsCollector.recordTokenUsage(
        requestId,
        'azure-openai-provider',
        'llm',
        'generate',
        {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
          estimatedCostUsd: cost.totalCost,
        }
      );

      const content = data.choices[0]?.message?.content ?? '';

      return {
        content,
        model: data.model,
        provider: 'azure-openai',
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
        { provider: 'azure-openai', model, retryable: true, cause: error as Error }
      );
    }
  }

  /**
   * Generate embedding for text
   * Note: Requires a separate embedding deployment in Azure
   */
  async embed(text: string, options?: EmbedOptions): Promise<EmbeddingResponse> {
    const endpoint = this.getEndpoint();
    const hasAuth = this.getApiKey() || this.getAzureAdToken();

    if (!endpoint || !hasAuth) {
      throw createLLMError(
        'Azure OpenAI not configured',
        'API_KEY_MISSING',
        { provider: 'azure-openai', retryable: false }
      );
    }

    // For embeddings, a separate deployment is needed
    const embeddingDeployment = options?.model ?? this.config.deploymentId;
    const start = Date.now();

    try {
      const response = await this.fetchWithTimeout(
        this.buildUrl('embeddings', embeddingDeployment),
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            input: text,
          }),
        },
        options?.timeoutMs ?? this.config.timeoutMs ?? 30000
      );

      const latencyMs = Date.now() - start;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: { message: 'Unknown error', type: 'unknown', code: null },
        })) as AzureOpenAIErrorResponse;
        throw this.handleApiError(response.status, errorData, embeddingDeployment);
      }

      const data = await response.json() as AzureOpenAIEmbeddingResponse;

      return {
        embedding: data.data[0].embedding,
        model: data.model,
        provider: 'azure-openai',
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
        { provider: 'azure-openai', model: embeddingDeployment, retryable: true, cause: error as Error }
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
      provider: 'azure-openai',
      usage: response.usage,
      latencyMs: response.latencyMs,
      cached: response.cached,
    };
  }

  /**
   * Get current provider configuration
   */
  getConfig(): AzureOpenAIConfig {
    return { ...this.config };
  }

  /**
   * Get supported models (deployment-based)
   * Note: In Azure, models are accessed via deployments
   */
  getSupportedModels(): string[] {
    return [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-35-turbo', // Azure uses different naming
      'text-embedding-ada-002',
      'text-embedding-3-small',
      'text-embedding-3-large',
    ];
  }

  /**
   * Get cost per token for current model
   * Azure OpenAI has the same pricing as OpenAI
   */
  getCostPerToken(): { input: number; output: number } {
    return CostTracker.getCostPerToken(this.config.model ?? 'gpt-4o');
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
    return this.config.apiKey ?? process.env.AZURE_OPENAI_API_KEY;
  }

  /**
   * Get Azure AD token from config
   */
  private getAzureAdToken(): string | undefined {
    return this.config.azureAdToken;
  }

  /**
   * Get Azure OpenAI endpoint
   */
  private getEndpoint(): string | undefined {
    const endpoint = this.config.endpoint ?? process.env.AZURE_OPENAI_ENDPOINT;
    return endpoint?.replace(/\/$/, ''); // Remove trailing slash
  }

  /**
   * Get API version
   */
  private getApiVersion(): string {
    return this.config.apiVersion ?? process.env.AZURE_OPENAI_API_VERSION ?? '2024-02-15-preview';
  }

  /**
   * Build Azure OpenAI URL
   * Format: https://{resource-name}.openai.azure.com/openai/deployments/{deployment-id}/{operation}?api-version={version}
   */
  private buildUrl(operation: string, deploymentId?: string): string {
    const endpoint = this.getEndpoint();
    const deployment = deploymentId ?? this.config.deploymentId;
    const apiVersion = this.getApiVersion();

    return `${endpoint}/openai/deployments/${deployment}/${operation}?api-version=${apiVersion}`;
  }

  /**
   * Get request headers
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Azure AD token takes precedence
    const adToken = this.getAzureAdToken();
    if (adToken) {
      headers['Authorization'] = `Bearer ${adToken}`;
    } else {
      const apiKey = this.getApiKey();
      if (apiKey) {
        headers['api-key'] = apiKey;
      }
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
   * Map Azure OpenAI finish reason to standard format
   */
  private mapFinishReason(
    reason: AzureOpenAICompletionResponse['choices'][0]['finish_reason']
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
    data: AzureOpenAIErrorResponse,
    model: string
  ): never {
    const message = data.error?.message ?? 'Unknown API error';
    const errorCode = data.error?.code ?? '';
    const innerCode = data.error?.innererror?.code ?? '';

    switch (status) {
      case 401:
        throw createLLMError(message, 'API_KEY_INVALID', {
          provider: 'azure-openai',
          model,
          retryable: false,
        });
      case 403:
        throw createLLMError(message, 'API_KEY_INVALID', {
          provider: 'azure-openai',
          model,
          retryable: false,
        });
      case 429:
        throw createLLMError(message, 'RATE_LIMITED', {
          provider: 'azure-openai',
          model,
          retryable: true,
          retryAfterMs: 60000,
        });
      case 400:
        if (errorCode === 'context_length_exceeded' || innerCode === 'context_length_exceeded') {
          throw createLLMError(message, 'CONTEXT_LENGTH_EXCEEDED', {
            provider: 'azure-openai',
            model,
            retryable: false,
          });
        }
        if (innerCode === 'content_filter') {
          throw createLLMError(message, 'CONTENT_FILTERED', {
            provider: 'azure-openai',
            model,
            retryable: false,
          });
        }
        throw createLLMError(message, 'UNKNOWN', {
          provider: 'azure-openai',
          model,
          retryable: false,
        });
      case 404:
        throw createLLMError(`Deployment not found: ${model}`, 'MODEL_NOT_FOUND', {
          provider: 'azure-openai',
          model,
          retryable: false,
        });
      case 500:
      case 502:
      case 503:
        throw createLLMError(message, 'PROVIDER_UNAVAILABLE', {
          provider: 'azure-openai',
          model,
          retryable: true,
          retryAfterMs: 5000,
        });
      default:
        throw createLLMError(message, 'UNKNOWN', {
          provider: 'azure-openai',
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
          provider: 'azure-openai',
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
