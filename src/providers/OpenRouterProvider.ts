/**
 * OpenRouterProvider - OpenRouter API Implementation
 *
 * Provides LLM capabilities through OpenRouter's unified API with support for:
 * - 300+ models from multiple providers (OpenAI, Anthropic, Google, etc.)
 * - Model hot-swapping at runtime
 * - Auto-routing to cheapest capable model
 * - Streaming responses
 * - Cost tracking
 *
 * @module providers/OpenRouterProvider
 * @version 1.0.0
 */

import {
  ILLMProvider,
  LLMProviderConfig,
  LLMCompletionOptions,
  LLMCompletionResponse,
  LLMStreamEvent,
  LLMEmbeddingOptions,
  LLMEmbeddingResponse,
  LLMTokenCountOptions,
  LLMHealthStatus,
  LLMProviderMetadata,
  LLMProviderError
} from './ILLMProvider';
import { Logger } from '../utils/Logger';

/**
 * OpenRouter model information
 */
export interface OpenRouterModel {
  /** Model ID (e.g., 'anthropic/claude-3.5-sonnet') */
  id: string;
  /** Display name */
  name: string;
  /** Provider (e.g., 'Anthropic', 'OpenAI') */
  provider?: string;
  /** Context length */
  contextLength: number;
  /** Pricing per million tokens */
  pricing: {
    prompt: number;
    completion: number;
  };
  /** Supported modalities */
  modalities?: string[];
  /** Whether model supports tool use */
  supportsToolUse?: boolean;
}

/**
 * OpenRouter-specific configuration
 */
export interface OpenRouterConfig extends LLMProviderConfig {
  /** OpenRouter API key (uses OPENROUTER_API_KEY env var if not provided) */
  apiKey?: string;
  /** Default model to use (default: auto-selects cheapest capable) */
  defaultModel?: string;
  /** Your site URL for OpenRouter rankings */
  siteUrl?: string;
  /** Your site name */
  siteName?: string;
  /** Fallback models if primary unavailable */
  fallbackModels?: string[];
  /** Enable model discovery (fetch available models on init) */
  enableModelDiscovery?: boolean;
  /** Base URL for API (default: https://openrouter.ai/api/v1) */
  baseUrl?: string;
  /** Enable auto-routing to cheapest model */
  enableAutoRoute?: boolean;
}

/**
 * Default OpenRouter pricing (per million tokens)
 * These are fallback values; actual prices come from the API
 *
 * Model selection aligned with issue #142 roadmap:
 * - Local Dev: devstral-small (24B), qwen2.5-coder (32B)
 * - Production: Devstral-2 (123B), Qwen3-Coder
 */
const DEFAULT_PRICING: Record<string, { input: number; output: number }> = {
  // ===========================================
  // FREE TIER - Best for development/testing
  // ===========================================
  // Devstral 2 2512 FREE - 123B dense, 256K context, best for agentic coding
  'mistralai/devstral-2512:free': { input: 0, output: 0 },

  // ===========================================
  // PAID TIER - Devstral Models (cheapest to most expensive)
  // ===========================================
  // Devstral Small 2505 - CHEAPEST paid option ($0.06/$0.12 per M)
  'mistralai/devstral-small-2505': { input: 0.06, output: 0.12 },
  // Devstral Small - 24B, 128K context ($0.07/$0.28 per M)
  'mistralai/devstral-small': { input: 0.07, output: 0.28 },
  // Devstral 2512 paid - same model, paid tier ($0.15/$0.60 per M)
  'mistralai/devstral-2512': { input: 0.15, output: 0.60 },
  // Devstral Medium - high-performance ($0.40/$2.00 per M)
  'mistralai/devstral-medium': { input: 0.40, output: 2.00 },

  // ===========================================
  // Qwen Coder Models (per issue #142 roadmap)
  // ===========================================
  'qwen/qwen-2.5-coder-32b-instruct': { input: 0.18, output: 0.18 },
  'qwen/qwen3-coder-30b-a3b': { input: 0.10, output: 0.30 }, // MoE efficient

  // ===========================================
  // Vendor Models (fallback)
  // ===========================================
  'anthropic/claude-3.5-sonnet': { input: 3.0, output: 15.0 },
  'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },
  'openai/gpt-4o': { input: 2.5, output: 10.0 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
  'google/gemini-pro-1.5': { input: 1.25, output: 5.0 },
  'meta-llama/llama-3.1-70b-instruct': { input: 0.52, output: 0.75 },
  'auto': { input: 0.5, output: 2.0 },
};

/**
 * Recommended models for different use cases
 * Aligned with issue #142 LLM Independence roadmap
 *
 * @see https://github.com/proffesor-for-testing/agentic-qe/issues/142
 */
export const RECOMMENDED_MODELS = {
  // ===========================================
  // FREE TIER - Development & Testing
  // ===========================================
  /** Devstral 2 2512 FREE - 123B, 256K context, FREE, best agentic coding */
  AGENTIC_CODING_FREE: 'mistralai/devstral-2512:free',

  // ===========================================
  // PAID TIER - Cost-effective options
  // ===========================================
  /** Devstral Small 2505 - CHEAPEST ($0.06/$0.12 per M) */
  CHEAPEST_PAID: 'mistralai/devstral-small-2505',
  /** Devstral Small - 24B, 128K, good balance */
  LIGHTWEIGHT_CODING: 'mistralai/devstral-small',
  /** Devstral Medium - complex reasoning ($0.40/$2.00 per M) */
  COMPLEX_REASONING: 'mistralai/devstral-medium',
  /** Qwen 2.5 Coder 32B - well-tested, complex tasks */
  QWEN_CODER: 'qwen/qwen-2.5-coder-32b-instruct',

  // ===========================================
  // Vendor Models (highest quality fallback)
  // ===========================================
  /** Claude 3.5 Sonnet - highest quality */
  HIGH_QUALITY: 'anthropic/claude-3.5-sonnet',
  /** GPT-4o Mini - cost-effective vendor */
  COST_EFFECTIVE: 'openai/gpt-4o-mini',

  // ===========================================
  // Aliases for convenience
  // ===========================================
  /** Primary FREE model for development */
  FREE: 'mistralai/devstral-2512:free',
  /** Alias for agentic coding */
  AGENTIC_CODING: 'mistralai/devstral-2512:free',
} as const;

/**
 * OpenRouterProvider - OpenRouter API implementation of ILLMProvider
 *
 * Enables access to 300+ models through OpenRouter's unified API
 * with support for runtime model switching and cost optimization.
 */
export class OpenRouterProvider implements ILLMProvider {
  private readonly logger: Logger;
  private config: Required<Pick<OpenRouterConfig, 'name' | 'debug' | 'timeout' | 'maxRetries'>> & OpenRouterConfig;
  private isInitialized: boolean;
  private totalCost: number;
  private requestCount: number;
  private apiKey?: string;
  private currentModel: string;
  private availableModels: Map<string, OpenRouterModel> = new Map();

  constructor(config: OpenRouterConfig = {}) {
    this.logger = Logger.getInstance();
    this.config = {
      name: config.name || 'openrouter',
      debug: config.debug ?? false,
      timeout: config.timeout ?? 60000,
      maxRetries: config.maxRetries ?? 3,
      // Default to FREE Devstral 2 (123B, 256K context, best agentic coding)
      defaultModel: config.defaultModel || RECOMMENDED_MODELS.AGENTIC_CODING,
      siteUrl: config.siteUrl || process.env.OPENROUTER_SITE_URL,
      siteName: config.siteName || process.env.OPENROUTER_SITE_NAME || 'Agentic-QE-Fleet',
      // Fallback chain: FREE → cheapest paid → complex → vendor
      fallbackModels: config.fallbackModels || [
        RECOMMENDED_MODELS.CHEAPEST_PAID,       // Devstral Small 2505 ($0.06/$0.12)
        RECOMMENDED_MODELS.LIGHTWEIGHT_CODING,  // Devstral Small ($0.07/$0.28)
        RECOMMENDED_MODELS.COMPLEX_REASONING,   // Devstral Medium ($0.40/$2.00)
        RECOMMENDED_MODELS.COST_EFFECTIVE,      // GPT-4o Mini fallback
      ],
      enableModelDiscovery: config.enableModelDiscovery ?? true,
      baseUrl: config.baseUrl || 'https://openrouter.ai/api/v1',
      enableAutoRoute: config.enableAutoRoute ?? true,
      apiKey: config.apiKey,
    };
    this.currentModel = this.config.defaultModel!;
    this.isInitialized = false;
    this.totalCost = 0;
    this.requestCount = 0;
  }

  /**
   * Initialize the OpenRouter provider
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('OpenRouterProvider already initialized');
      return;
    }

    this.apiKey = this.config.apiKey || process.env.OPENROUTER_API_KEY;
    if (!this.apiKey) {
      throw new LLMProviderError(
        'OpenRouter API key not provided. Set OPENROUTER_API_KEY environment variable.',
        'openrouter',
        'AUTH_ERROR',
        false
      );
    }

    // Optionally discover available models
    if (this.config.enableModelDiscovery) {
      try {
        await this.discoverModels();
      } catch (error) {
        this.logger.warn('Failed to discover models, using defaults:', error);
      }
    }

    this.isInitialized = true;

    this.logger.info('OpenRouterProvider initialized', {
      model: this.currentModel,
      autoRoute: this.config.enableAutoRoute,
      modelsDiscovered: this.availableModels.size
    });
  }

  /**
   * Discover available models from OpenRouter API
   */
  private async discoverModels(): Promise<void> {
    try {
      const response = await fetch(`${this.config.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      const data = await response.json() as { data: any[] };

      for (const model of data.data || []) {
        this.availableModels.set(model.id, {
          id: model.id,
          name: model.name || model.id,
          contextLength: model.context_length || 4096,
          pricing: {
            prompt: (model.pricing?.prompt || 0) * 1000000,
            completion: (model.pricing?.completion || 0) * 1000000,
          },
          modalities: model.modalities,
          supportsToolUse: model.supports_tool_use,
        });
      }

      this.logger.debug(`Discovered ${this.availableModels.size} models from OpenRouter`);
    } catch (error) {
      this.logger.warn('Model discovery failed:', error);
    }
  }

  /**
   * Complete a prompt
   */
  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResponse> {
    this.ensureInitialized();

    const model = options.model || this.currentModel;
    const startTime = Date.now();

    try {
      // Build request body (OpenAI-compatible format)
      const messages = this.buildMessages(options);

      const body: Record<string, any> = {
        model,
        messages,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.7,
      };

      // Add system prompt if provided
      if (options.system && options.system.length > 0) {
        const systemText = options.system.map(s => s.text).join('\n');
        messages.unshift({ role: 'system', content: systemText });
      }

      const response = await this.makeRequest('/chat/completions', body);

      // Convert OpenRouter response to our format
      const choice = response.choices?.[0];
      const content = choice?.message?.content || '';

      const result: LLMCompletionResponse = {
        content: [{ type: 'text', text: content }],
        usage: {
          input_tokens: response.usage?.prompt_tokens || 0,
          output_tokens: response.usage?.completion_tokens || 0,
        },
        model: response.model || model,
        stop_reason: this.mapStopReason(choice?.finish_reason),
        id: response.id || `or-${Date.now()}`,
        metadata: {
          latency: Date.now() - startTime,
          provider: 'openrouter',
        },
      };

      // Track cost
      this.trackCost(result.usage);
      this.requestCount++;

      return result;
    } catch (error) {
      this.handleError(error, 'complete');
      throw error;
    }
  }

  /**
   * Stream a completion
   */
  async *streamComplete(options: LLMCompletionOptions): AsyncIterableIterator<LLMStreamEvent> {
    this.ensureInitialized();

    const model = options.model || this.currentModel;

    try {
      const messages = this.buildMessages(options);

      const body: Record<string, any> = {
        model,
        messages,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.7,
        stream: true,
      };

      // Add system prompt if provided
      if (options.system && options.system.length > 0) {
        const systemText = options.system.map(s => s.text).join('\n');
        messages.unshift({ role: 'system', content: systemText });
      }

      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new LLMProviderError(
          `OpenRouter request failed: ${response.status}`,
          'openrouter',
          'REQUEST_ERROR',
          response.status >= 500
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new LLMProviderError(
          'No response body for streaming',
          'openrouter',
          'STREAM_ERROR',
          false
        );
      }

      const decoder = new TextDecoder();
      let buffer = '';

      // Emit message start
      yield {
        type: 'message_start',
        message: {
          id: `or-stream-${Date.now()}`,
          model,
          content: [],
          usage: { input_tokens: 0, output_tokens: 0 },
          stop_reason: 'end_turn',
        },
      };

      // Emit content block start
      yield {
        type: 'content_block_start',
        content_block: { type: 'text', text: '' },
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              yield { type: 'content_block_stop' };
              yield { type: 'message_stop' };
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                yield {
                  type: 'content_block_delta',
                  delta: { type: 'text_delta', text: delta },
                };
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      yield { type: 'content_block_stop' };
      yield { type: 'message_stop' };
    } catch (error) {
      this.handleError(error, 'streamComplete');
      throw error;
    }
  }

  /**
   * Generate embeddings
   * Note: OpenRouter embedding support varies by model
   */
  async embed(options: LLMEmbeddingOptions): Promise<LLMEmbeddingResponse> {
    this.ensureInitialized();

    const model = options.model || 'openai/text-embedding-3-small';

    try {
      const response = await this.makeRequest('/embeddings', {
        model,
        input: options.text,
        dimensions: options.dimensions,
      });

      const embedding = response.data?.[0]?.embedding || [];

      return {
        embedding,
        model: response.model || model,
        tokens: response.usage?.prompt_tokens || 0,
      };
    } catch (error) {
      // Embeddings may not be available for all models
      throw new LLMProviderError(
        `Embeddings not available: ${(error as Error).message}`,
        'openrouter',
        'EMBEDDINGS_UNAVAILABLE',
        false
      );
    }
  }

  /**
   * Count tokens (approximation using character count)
   */
  async countTokens(options: LLMTokenCountOptions): Promise<number> {
    // OpenRouter doesn't have a token counting endpoint
    // Use approximation: ~4 characters per token for English
    return Math.ceil(options.text.length / 4);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<LLMHealthStatus> {
    const startTime = Date.now();

    if (!this.isInitialized) {
      return {
        healthy: false,
        error: 'Provider not initialized',
        timestamp: new Date(),
      };
    }

    try {
      // Check API health by fetching models endpoint
      const response = await fetch(`${this.config.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      const healthy = response.ok;

      return {
        healthy,
        latency: Date.now() - startTime,
        timestamp: new Date(),
        metadata: {
          statusCode: response.status,
          requestCount: this.requestCount,
          totalCost: this.totalCost,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        error: (error as Error).message,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Get provider metadata
   */
  getMetadata(): LLMProviderMetadata {
    const models = this.availableModels.size > 0
      ? Array.from(this.availableModels.keys())
      : Object.keys(DEFAULT_PRICING);

    // Get pricing for current model
    const modelInfo = this.availableModels.get(this.currentModel);
    const defaultPricing = DEFAULT_PRICING[this.currentModel] || DEFAULT_PRICING['auto'];

    return {
      name: 'openrouter',
      version: '1.0.0',
      models,
      capabilities: {
        streaming: true,
        caching: false, // OpenRouter doesn't support prompt caching
        embeddings: true,
        vision: true, // Many models support vision
      },
      costs: {
        inputPerMillion: modelInfo?.pricing.prompt || defaultPricing.input,
        outputPerMillion: modelInfo?.pricing.completion || defaultPricing.output,
      },
      location: 'cloud',
    };
  }

  /**
   * Shutdown the provider
   */
  async shutdown(): Promise<void> {
    this.logger.info('OpenRouterProvider shutting down', {
      totalRequests: this.requestCount,
      totalCost: this.totalCost,
    });

    this.isInitialized = false;
    this.availableModels.clear();
  }

  /**
   * Track cost for a request
   */
  trackCost(usage: LLMCompletionResponse['usage']): number {
    const modelInfo = this.availableModels.get(this.currentModel);
    const defaultPricing = DEFAULT_PRICING[this.currentModel] || DEFAULT_PRICING['auto'];

    const inputCost = (usage.input_tokens / 1_000_000) *
      (modelInfo?.pricing.prompt || defaultPricing.input);
    const outputCost = (usage.output_tokens / 1_000_000) *
      (modelInfo?.pricing.completion || defaultPricing.output);

    const cost = inputCost + outputCost;
    this.totalCost += cost;

    return cost;
  }

  // ============================================
  // Hot-Swap Methods (G6)
  // ============================================

  /**
   * Hot-swap to a different model at runtime
   */
  async setModel(model: string): Promise<void> {
    if (!this.isInitialized) {
      throw new LLMProviderError(
        'Provider not initialized',
        'openrouter',
        'NOT_INITIALIZED',
        false
      );
    }

    // Validate model exists (if we have model info)
    if (this.availableModels.size > 0 && !this.availableModels.has(model) && model !== 'auto') {
      this.logger.warn(`Model ${model} not found in available models, proceeding anyway`);
    }

    const previousModel = this.currentModel;
    this.currentModel = model;

    this.logger.info('Model hot-swapped', {
      from: previousModel,
      to: model,
    });
  }

  /**
   * Get current model
   */
  getCurrentModel(): string {
    return this.currentModel;
  }

  /**
   * Get available models
   */
  async getAvailableModels(): Promise<OpenRouterModel[]> {
    if (this.availableModels.size === 0) {
      await this.discoverModels();
    }
    return Array.from(this.availableModels.values());
  }

  /**
   * Get model info
   */
  getModelInfo(model: string): OpenRouterModel | null {
    return this.availableModels.get(model) || null;
  }

  /**
   * Get total cost tracked
   */
  getTotalCost(): number {
    return this.totalCost;
  }

  /**
   * Get request count
   */
  getRequestCount(): number {
    return this.requestCount;
  }

  // ============================================
  // Private Methods
  // ============================================

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new LLMProviderError(
        'OpenRouterProvider not initialized. Call initialize() first.',
        'openrouter',
        'NOT_INITIALIZED',
        false
      );
    }
  }

  private buildMessages(options: LLMCompletionOptions): Array<{ role: string; content: string }> {
    return options.messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string'
        ? m.content
        : m.content.filter(c => c.type === 'text').map(c => c.text || '').join(''),
    }));
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    if (this.config.siteUrl) {
      headers['HTTP-Referer'] = this.config.siteUrl;
    }
    if (this.config.siteName) {
      headers['X-Title'] = this.config.siteName;
    }

    return headers;
  }

  private async makeRequest(endpoint: string, body: Record<string, any>): Promise<any> {
    let lastError: Error | null = null;
    const maxRetries = this.config.maxRetries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.config.timeout),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          const retryable = response.status >= 500 || response.status === 429;

          if (retryable && attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
            this.logger.warn(`Request failed (${response.status}), retrying in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }

          throw new LLMProviderError(
            `OpenRouter request failed: ${response.status} - ${errorBody}`,
            'openrouter',
            'REQUEST_ERROR',
            retryable
          );
        }

        return await response.json();
      } catch (error) {
        lastError = error as Error;

        if (error instanceof LLMProviderError && !error.retryable) {
          throw error;
        }

        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          this.logger.warn(`Request error, retrying in ${delay}ms...`, error);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    throw lastError || new Error('Request failed after all retries');
  }

  private mapStopReason(finishReason: string | undefined): 'end_turn' | 'max_tokens' | 'stop_sequence' {
    switch (finishReason) {
      case 'stop':
        return 'end_turn';
      case 'length':
        return 'max_tokens';
      case 'content_filter':
        return 'stop_sequence';
      default:
        return 'end_turn';
    }
  }

  private handleError(error: unknown, operation: string): void {
    if (error instanceof LLMProviderError) {
      this.logger.error(`OpenRouter ${operation} failed:`, {
        code: error.code,
        retryable: error.retryable,
        message: error.message,
      });
    } else {
      this.logger.error(`OpenRouter ${operation} error:`, error);
    }
  }
}

/**
 * Create an OpenRouter provider with configuration
 */
export function createOpenRouterProvider(config?: OpenRouterConfig): OpenRouterProvider {
  return new OpenRouterProvider(config);
}
