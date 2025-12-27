/**
 * GroqProvider - High-Performance LLM Inference via Groq
 *
 * Provides cloud-based LLM inference through Groq's ultra-fast API with support for:
 * - FREE tier: 14,400 requests/day (10 req/min)
 * - Streaming responses via SSE
 * - Rate limit handling with exponential backoff
 * - Rate limiting (10 req/min free tier)
 * - Multiple model families (LLaMA, Mixtral, DeepSeek)
 * - OpenAI-compatible API format
 *
 * @module providers/GroqProvider
 * @version 1.0.0
 */

import { randomUUID } from 'crypto';
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
 * Groq-specific configuration
 */
export interface GroqProviderConfig extends LLMProviderConfig {
  /** Groq API key (default: process.env.GROQ_API_KEY) */
  apiKey?: string;
  /** Base URL for Groq API (default: https://api.groq.com/openai/v1) */
  baseUrl?: string;
  /** Default model name */
  defaultModel?: string;
  /** Maximum retries on failure (default: 3) */
  maxRetries?: number;
  /** Rate limit retry delay in milliseconds (default: 6000) */
  rateLimitRetryDelay?: number;
}

/**
 * Groq API chat completion request (OpenAI-compatible)
 */
interface GroqChatCompletionRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  top_p?: number;
  stop?: string | string[];
}

/**
 * Groq API chat completion response (OpenAI-compatible)
 */
interface GroqChatCompletionResponse {
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
    finish_reason: 'stop' | 'length' | 'content_filter';
    logprobs: null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    queue_time?: number;
    prompt_time?: number;
    completion_time?: number;
    total_time?: number;
  };
  system_fingerprint: string;
  x_groq?: {
    id: string;
  };
}

/**
 * Groq API streaming chunk (SSE format)
 */
interface GroqStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
    };
    finish_reason: null | 'stop' | 'length' | 'content_filter';
  }>;
}

/**
 * Groq API error response
 */
interface GroqErrorResponse {
  error: {
    message: string;
    type: string;
    code: string | null;
  };
}

/**
 * GroqProvider - High-performance cloud LLM inference
 *
 * This provider enables ultra-fast LLM inference using Groq's specialized
 * LPU (Language Processing Unit) architecture, providing significantly
 * faster inference than traditional GPU-based providers.
 *
 * Supported Models:
 * - llama-3.3-70b-versatile (primary general-purpose model)
 * - deepseek-r1-distill-llama-70b (reasoning-focused)
 * - mixtral-8x7b-32768 (large context window)
 * - llama-3.1-8b-instant (fast lightweight)
 *
 * Rate Limits (FREE tier):
 * - 14,400 requests per day
 * - 10 requests per minute
 * - Automatic retry with exponential backoff
 */
export class GroqProvider implements ILLMProvider {
  private readonly logger: Logger;
  private config: GroqProviderConfig;
  private isInitialized: boolean;
  private apiKey: string;
  private baseUrl: string;
  private requestCount: number;
  private lastRequestTime: number;

  constructor(config: GroqProviderConfig = {}) {
    this.logger = Logger.getInstance();
    this.config = {
      name: config.name || 'groq',
      debug: config.debug ?? false,
      timeout: config.timeout ?? 60000, // 60 seconds
      maxRetries: config.maxRetries ?? 3,
      baseUrl: config.baseUrl || 'https://api.groq.com/openai/v1',
      defaultModel: config.defaultModel || 'llama-3.3-70b-versatile',
      rateLimitRetryDelay: config.rateLimitRetryDelay ?? 6000 // 6 seconds
    };
    this.isInitialized = false;
    this.apiKey = config.apiKey || process.env.GROQ_API_KEY || '';
    this.baseUrl = this.config.baseUrl!;
    this.requestCount = 0;
    this.lastRequestTime = 0;
  }

  /**
   * Initialize the Groq provider
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('GroqProvider already initialized');
      return;
    }

    try {
      // Validate API key
      if (!this.apiKey) {
        throw new Error('Groq API key is required. Set GROQ_API_KEY environment variable or pass apiKey in config.');
      }

      // Test connection with health check
      const health = await this.healthCheck();
      if (!health.healthy) {
        throw new Error(`Groq API health check failed: ${health.error}`);
      }

      this.isInitialized = true;

      this.logger.info('GroqProvider initialized', {
        baseUrl: this.baseUrl,
        defaultModel: this.config.defaultModel,
        maxRetries: this.config.maxRetries
      });

    } catch (error) {
      throw new LLMProviderError(
        `Failed to initialize Groq: ${(error as Error).message}`,
        'groq',
        'INIT_ERROR',
        false,
        error as Error
      );
    }
  }

  /**
   * Complete a prompt using Groq
   */
  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResponse> {
    this.ensureInitialized();

    const startTime = Date.now();
    const model = options.model || this.config.defaultModel!;

    let lastError: Error | null = null;
    let retries = 0;

    while (retries <= this.config.maxRetries!) {
      try {
        // Build request payload
        const requestBody = this.buildChatRequest(options, model);

        // Make request to Groq
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(this.config.timeout!)
        });

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = this.extractRetryAfter(response);
          const delay = retryAfter || this.config.rateLimitRetryDelay!;

          this.logger.warn('Rate limit hit, retrying', {
            retryAfter: delay,
            attempt: retries + 1
          });

          if (retries < this.config.maxRetries!) {
            await this.sleep(delay);
            retries++;
            continue;
          }

          throw new LLMProviderError(
            'Rate limit exceeded. Free tier: 10 req/min, 14,400 req/day',
            'groq',
            'RATE_LIMITED',
            true
          );
        }

        // Handle authentication errors
        if (response.status === 401) {
          const errorData: GroqErrorResponse = await response.json();
          throw new LLMProviderError(
            `Authentication failed: ${errorData.error.message}`,
            'groq',
            'AUTH_ERROR',
            false
          );
        }

        // Handle other errors
        if (!response.ok) {
          const errorData: GroqErrorResponse = await response.json();
          throw new Error(`Groq API error: ${errorData.error.message}`);
        }

        const data: GroqChatCompletionResponse = await response.json();
        this.requestCount++;
        this.lastRequestTime = Date.now();

        const latency = Date.now() - startTime;

        // Map to standardized response format
        const usage = {
          input_tokens: data.usage.prompt_tokens,
          output_tokens: data.usage.completion_tokens
        };

        return {
          content: [{
            type: 'text',
            text: data.choices[0].message.content
          }],
          usage,
          model: data.model,
          stop_reason: this.mapStopReason(data.choices[0].finish_reason),
          id: data.id,
          metadata: {
            latency,
            cost: this.trackCost(usage),
            groq_metadata: {
              queue_time: data.usage.queue_time,
              prompt_time: data.usage.prompt_time,
              completion_time: data.usage.completion_time,
              total_time: data.usage.total_time,
              system_fingerprint: data.system_fingerprint
            }
          }
        };

      } catch (error) {
        lastError = error as Error;

        // Don't retry on auth errors or rate limit errors that exceed max retries
        if (error instanceof LLMProviderError) {
          if (error.code === 'AUTH_ERROR') {
            throw error;
          }
          if (error.code === 'RATE_LIMITED' && retries >= this.config.maxRetries!) {
            throw error;
          }
        }

        // Retry on network errors with exponential backoff
        if (retries < this.config.maxRetries!) {
          const backoffDelay = Math.min(1000 * Math.pow(2, retries), 10000);
          this.logger.warn('Request failed, retrying', {
            error: (error as Error).message,
            attempt: retries + 1,
            delay: backoffDelay
          });
          await this.sleep(backoffDelay);
          retries++;
          continue;
        }

        break;
      }
    }

    // All retries exhausted
    throw new LLMProviderError(
      `Groq completion failed after ${retries} retries: ${lastError?.message}`,
      'groq',
      'API_ERROR',
      true,
      lastError!
    );
  }

  /**
   * Stream a completion using Groq
   */
  async *streamComplete(options: LLMCompletionOptions): AsyncIterableIterator<LLMStreamEvent> {
    this.ensureInitialized();

    const model = options.model || this.config.defaultModel!;

    try {
      const requestBody = this.buildChatRequest(options, model);
      requestBody.stream = true;

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (response.status === 429) {
        throw new LLMProviderError(
          'Rate limit exceeded',
          'groq',
          'RATE_LIMITED',
          true
        );
      }

      if (response.status === 401) {
        throw new LLMProviderError(
          'Authentication failed',
          'groq',
          'AUTH_ERROR',
          false
        );
      }

      if (!response.ok) {
        const errorData: GroqErrorResponse = await response.json();
        throw new Error(`Groq API error: ${errorData.error.message}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      yield { type: 'message_start' };
      yield { type: 'content_block_start', content_block: { type: 'text', text: '' } };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '' || line.trim() === 'data: [DONE]') continue;
          if (!line.startsWith('data: ')) continue;

          try {
            const jsonData = line.slice(6); // Remove 'data: ' prefix
            const chunk: GroqStreamChunk = JSON.parse(jsonData);

            const delta = chunk.choices[0]?.delta;
            if (delta?.content) {
              yield {
                type: 'content_block_delta',
                delta: { type: 'text_delta', text: delta.content }
              };
            }

            if (chunk.choices[0]?.finish_reason) {
              yield { type: 'content_block_stop' };
              yield { type: 'message_stop' };
              this.requestCount++;
              return;
            }
          } catch (parseError) {
            // Skip invalid JSON lines
            this.logger.debug('Failed to parse SSE chunk', { line });
          }
        }
      }

    } catch (error) {
      if (error instanceof LLMProviderError) {
        throw error;
      }
      throw new LLMProviderError(
        `Groq stream failed: ${(error as Error).message}`,
        'groq',
        'STREAM_ERROR',
        true,
        error as Error
      );
    }
  }

  /**
   * Generate embeddings (not supported by Groq)
   */
  async embed(options: LLMEmbeddingOptions): Promise<LLMEmbeddingResponse> {
    throw new LLMProviderError(
      'Groq does not support embeddings. Use a dedicated embedding provider.',
      'groq',
      'UNSUPPORTED_OPERATION',
      false
    );
  }

  /**
   * Count tokens in text (approximate)
   */
  async countTokens(options: LLMTokenCountOptions): Promise<number> {
    // Approximate token count: 1 token ≈ 4 characters (similar to GPT tokenization)
    return Math.ceil(options.text.length / 4);
  }

  /**
   * Health check - ping Groq API
   */
  async healthCheck(): Promise<LLMHealthStatus> {
    const startTime = Date.now();

    try {
      // Use a minimal request to test API connectivity
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        signal: AbortSignal.timeout(5000)
      });

      const latency = Date.now() - startTime;

      if (response.ok) {
        return {
          healthy: true,
          latency,
          timestamp: new Date(),
          metadata: {
            baseUrl: this.baseUrl,
            requestCount: this.requestCount
          }
        };
      }

      return {
        healthy: false,
        error: `API returned ${response.status}`,
        timestamp: new Date()
      };

    } catch (error) {
      return {
        healthy: false,
        error: (error as Error).message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Get provider metadata
   */
  getMetadata(): LLMProviderMetadata {
    return {
      name: 'groq',
      version: '1.0.0',
      models: [
        'llama-3.3-70b-versatile',
        'llama-3.1-70b-versatile',
        'llama-3.1-8b-instant',
        'deepseek-r1-distill-llama-70b',
        'mixtral-8x7b-32768',
        'gemma2-9b-it',
        'llama3-70b-8192',
        'llama3-8b-8192'
      ],
      capabilities: {
        streaming: true,
        caching: false, // No caching implementation
        embeddings: false,
        vision: false
      },
      costs: {
        inputPerMillion: 0, // Free tier
        outputPerMillion: 0 // Free tier
      },
      location: 'cloud'
    };
  }

  /**
   * Shutdown the provider
   */
  async shutdown(): Promise<void> {
    this.isInitialized = false;
    this.logger.info('GroqProvider shutdown', {
      requestCount: this.requestCount
    });
  }

  /**
   * Track cost (free tier = $0)
   */
  trackCost(usage: LLMCompletionResponse['usage']): number {
    // Groq free tier has no cost
    // For paid tier, costs would be calculated here
    return 0;
  }

  /**
   * Build chat completion request
   */
  private buildChatRequest(
    options: LLMCompletionOptions,
    model: string
  ): GroqChatCompletionRequest {
    const messages: GroqChatCompletionRequest['messages'] = [];

    // Add system messages
    if (options.system && options.system.length > 0) {
      const systemContent = options.system.map(s => s.text).join('\n\n');
      messages.push({
        role: 'system',
        content: systemContent
      });
    }

    // Add conversation messages
    for (const message of options.messages) {
      const content = typeof message.content === 'string'
        ? message.content
        : message.content.map(c => c.text || '').join('');

      messages.push({
        role: message.role as 'user' | 'assistant' | 'system',
        content
      });
    }

    return {
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens || 2048,
      stream: false
    };
  }

  /**
   * Map Groq finish reason to standard stop reason
   */
  private mapStopReason(
    finishReason: 'stop' | 'length' | 'content_filter'
  ): 'end_turn' | 'max_tokens' | 'stop_sequence' {
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

  /**
   * Extract retry-after header from rate limit response
   */
  private extractRetryAfter(response: Response): number | null {
    const retryAfter = response.headers.get('retry-after');
    if (!retryAfter) return null;

    const seconds = parseInt(retryAfter, 10);
    return isNaN(seconds) ? null : seconds * 1000;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Ensure provider is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new LLMProviderError(
        'GroqProvider not initialized. Call initialize() first.',
        'groq',
        'NOT_INITIALIZED',
        false
      );
    }
  }
}
