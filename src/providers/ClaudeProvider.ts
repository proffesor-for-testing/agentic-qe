/**
 * ClaudeProvider - Anthropic Claude API Implementation
 *
 * Provides LLM capabilities through Anthropic's Claude API with support for:
 * - Prompt caching for cost optimization
 * - Streaming responses
 * - Token counting
 * - Health checks
 *
 * @module providers/ClaudeProvider
 * @version 1.0.0
 */

import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, TextBlock, Message, MessageStreamEvent } from '@anthropic-ai/sdk/resources/messages';
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
 * Claude-specific configuration
 */
export interface ClaudeProviderConfig extends LLMProviderConfig {
  /** Anthropic API key (uses ANTHROPIC_API_KEY env var if not provided) */
  apiKey?: string;
  /** Default model to use */
  defaultModel?: string;
  /** Enable prompt caching */
  enableCaching?: boolean;
  /** Base URL for API (for testing/proxies) */
  baseUrl?: string;
}

/**
 * Claude model pricing (per million tokens)
 */
const CLAUDE_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-opus-4-20250514': { input: 15.0, output: 75.0 },
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4.0 },
  'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
  'claude-3-sonnet-20240229': { input: 3.0, output: 15.0 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
};

/**
 * ClaudeProvider - Anthropic Claude API implementation of ILLMProvider
 *
 * This provider enables access to Claude models through the Anthropic API
 * with full support for caching, streaming, and cost tracking.
 */
export class ClaudeProvider implements ILLMProvider {
  private readonly logger: Logger;
  private client?: Anthropic;
  private config: ClaudeProviderConfig;
  private isInitialized: boolean;
  private totalCost: number;
  private requestCount: number;

  constructor(config: ClaudeProviderConfig = {}) {
    this.logger = Logger.getInstance();
    this.config = {
      name: config.name || 'claude',
      debug: config.debug ?? false,
      timeout: config.timeout ?? 60000,
      maxRetries: config.maxRetries ?? 3,
      apiKey: config.apiKey,
      defaultModel: config.defaultModel || 'claude-sonnet-4-20250514',
      enableCaching: config.enableCaching ?? true,
      baseUrl: config.baseUrl
    };
    this.isInitialized = false;
    this.totalCost = 0;
    this.requestCount = 0;
  }

  /**
   * Initialize the Claude provider
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('ClaudeProvider already initialized');
      return;
    }

    const apiKey = this.config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new LLMProviderError(
        'Anthropic API key not provided',
        'claude',
        'AUTH_ERROR',
        false
      );
    }

    this.client = new Anthropic({
      apiKey,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
      ...(this.config.baseUrl ? { baseURL: this.config.baseUrl } : {})
    });
    this.isInitialized = true;

    this.logger.info('ClaudeProvider initialized', {
      model: this.config.defaultModel,
      caching: this.config.enableCaching
    });
  }

  /**
   * Complete a prompt
   */
  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResponse> {
    this.ensureInitialized();

    const model = options.model || this.config.defaultModel!;
    const startTime = Date.now();

    try {
      // Build messages array
      const messages: MessageParam[] = options.messages.map(m => {
        // Handle string content directly
        if (typeof m.content === 'string') {
          return {
            role: m.role as 'user' | 'assistant',
            content: m.content
          };
        }
        // Handle array content - convert to string
        const textContent = m.content
          .filter(c => c.type === 'text')
          .map(c => c.text || '')
          .join('');
        return {
          role: m.role as 'user' | 'assistant',
          content: textContent
        };
      });

      // Build system message if provided
      let systemMessage: string | undefined;
      if (options.system && options.system.length > 0) {
        systemMessage = options.system.map(s => s.text).join('\n\n');
      }

      const response = await this.client!.messages.create({
        model,
        messages,
        max_tokens: options.maxTokens || 4096,
        ...(systemMessage ? { system: systemMessage } : {}),
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {})
      });

      this.requestCount++;

      // Extract text content from response
      const content = response.content.map((block: TextBlock | { type: string }) => ({
        type: 'text' as const,
        text: (block as TextBlock).type === 'text' ? (block as TextBlock).text : ''
      }));

      // Calculate cost
      const cost = this.trackCost({
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_creation_input_tokens: (response.usage as any).cache_creation_input_tokens,
        cache_read_input_tokens: (response.usage as any).cache_read_input_tokens
      });

      const result: LLMCompletionResponse = {
        content,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          cache_creation_input_tokens: (response.usage as any).cache_creation_input_tokens,
          cache_read_input_tokens: (response.usage as any).cache_read_input_tokens
        },
        model: response.model,
        stop_reason: response.stop_reason as 'end_turn' | 'max_tokens' | 'stop_sequence',
        id: response.id,
        metadata: {
          latency: Date.now() - startTime,
          cost
        }
      };

      this.logger.debug('Claude completion successful', {
        model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        latency: result.metadata?.latency
      });

      return result;

    } catch (error) {
      const err = error as Error;
      throw new LLMProviderError(
        `Claude completion failed: ${err.message}`,
        'claude',
        this.getErrorCode(error),
        this.isRetryableError(error),
        err
      );
    }
  }

  /**
   * Stream a completion
   */
  async *streamComplete(options: LLMCompletionOptions): AsyncIterableIterator<LLMStreamEvent> {
    this.ensureInitialized();

    const model = options.model || this.config.defaultModel!;

    try {
      // Build messages array
      const messages: MessageParam[] = options.messages.map(m => {
        if (typeof m.content === 'string') {
          return {
            role: m.role as 'user' | 'assistant',
            content: m.content
          };
        }
        const textContent = m.content
          .filter(c => c.type === 'text')
          .map(c => c.text || '')
          .join('');
        return {
          role: m.role as 'user' | 'assistant',
          content: textContent
        };
      });

      let systemMessage: string | undefined;
      if (options.system && options.system.length > 0) {
        systemMessage = options.system.map(s => s.text).join('\n\n');
      }

      const stream = this.client!.messages.stream({
        model,
        messages,
        max_tokens: options.maxTokens || 4096,
        ...(systemMessage ? { system: systemMessage } : {}),
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {})
      });

      for await (const event of stream) {
        const streamEvent = this.mapStreamEvent(event);
        if (streamEvent) {
          yield streamEvent;
        }
      }

      this.requestCount++;

    } catch (error) {
      const err = error as Error;
      throw new LLMProviderError(
        `Claude stream failed: ${err.message}`,
        'claude',
        this.getErrorCode(error),
        this.isRetryableError(error),
        err
      );
    }
  }

  /**
   * Generate embeddings (Claude doesn't natively support embeddings)
   */
  async embed(options: LLMEmbeddingOptions): Promise<LLMEmbeddingResponse> {
    throw new LLMProviderError(
      'Claude does not support native embeddings. Use a dedicated embedding model.',
      'claude',
      'UNSUPPORTED',
      false
    );
  }

  /**
   * Count tokens in text
   */
  async countTokens(options: LLMTokenCountOptions): Promise<number> {
    this.ensureInitialized();

    try {
      // Use Anthropic's token counting endpoint
      const result = await this.client!.messages.countTokens({
        model: options.model || this.config.defaultModel!,
        messages: [{ role: 'user', content: options.text }]
      });

      return result.input_tokens;
    } catch {
      // Fallback: estimate ~4 chars per token
      return Math.ceil(options.text.length / 4);
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<LLMHealthStatus> {
    const startTime = Date.now();

    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Simple health check with minimal tokens
      await this.complete({
        model: this.config.defaultModel!,
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 5
      });

      return {
        healthy: true,
        latency: Date.now() - startTime,
        timestamp: new Date(),
        metadata: {
          model: this.config.defaultModel,
          requestCount: this.requestCount,
          totalCost: this.totalCost
        }
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
    const pricing = CLAUDE_PRICING[this.config.defaultModel!] || { input: 3.0, output: 15.0 };

    return {
      name: 'claude',
      version: '1.0.0',
      models: Object.keys(CLAUDE_PRICING),
      capabilities: {
        streaming: true,
        caching: true,
        embeddings: false,
        vision: true
      },
      costs: {
        inputPerMillion: pricing.input,
        outputPerMillion: pricing.output,
        cacheWriteMultiplier: 1.25,
        cacheReadMultiplier: 0.1
      },
      location: 'cloud'
    };
  }

  /**
   * Shutdown the provider
   */
  async shutdown(): Promise<void> {
    this.client = undefined;
    this.isInitialized = false;
    this.logger.info('ClaudeProvider shutdown', {
      totalCost: this.totalCost,
      requestCount: this.requestCount
    });
  }

  /**
   * Track cost for a request
   */
  trackCost(usage: LLMCompletionResponse['usage']): number {
    const model = this.config.defaultModel!;
    const pricing = CLAUDE_PRICING[model] || { input: 3.0, output: 15.0 };

    let inputCost = (usage.input_tokens / 1_000_000) * pricing.input;
    const outputCost = (usage.output_tokens / 1_000_000) * pricing.output;

    // Adjust for cache pricing
    if (usage.cache_creation_input_tokens) {
      const cacheWriteCost = (usage.cache_creation_input_tokens / 1_000_000) * pricing.input * 1.25;
      inputCost += cacheWriteCost;
    }

    if (usage.cache_read_input_tokens) {
      const cacheReadCost = (usage.cache_read_input_tokens / 1_000_000) * pricing.input * 0.1;
      inputCost += cacheReadCost;
    }

    const totalCost = inputCost + outputCost;
    this.totalCost += totalCost;

    return totalCost;
  }

  /**
   * Get total cost incurred
   */
  getTotalCost(): number {
    return this.totalCost;
  }

  /**
   * Ensure provider is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.client) {
      throw new LLMProviderError(
        'ClaudeProvider not initialized. Call initialize() first.',
        'claude',
        'NOT_INITIALIZED',
        false
      );
    }
  }

  /**
   * Map Anthropic stream event to LLMStreamEvent
   */
  private mapStreamEvent(event: MessageStreamEvent): LLMStreamEvent | null {
    switch (event.type) {
      case 'message_start':
        return {
          type: 'message_start',
          message: {
            id: event.message.id,
            model: event.message.model,
            stop_reason: (event.message.stop_reason ?? undefined) as 'end_turn' | 'max_tokens' | 'stop_sequence' | undefined,
            usage: event.message.usage ? {
              input_tokens: event.message.usage.input_tokens,
              output_tokens: event.message.usage.output_tokens
            } : undefined
          }
        };
      case 'content_block_start':
        // Only handle text blocks
        if (event.content_block?.type === 'text') {
          return {
            type: 'content_block_start',
            content_block: {
              type: 'text',
              text: event.content_block.text
            }
          };
        }
        return null;
      case 'content_block_delta':
        // Only handle text deltas
        if ('delta' in event && event.delta?.type === 'text_delta') {
          return {
            type: 'content_block_delta',
            delta: {
              type: 'text_delta',
              text: (event.delta as { type: 'text_delta'; text: string }).text
            }
          };
        }
        return null;
      case 'content_block_stop':
        return { type: 'content_block_stop' };
      case 'message_delta':
        return {
          type: 'message_delta',
          message: {
            usage: event.usage ? {
              input_tokens: 0, // Not available in delta
              output_tokens: event.usage.output_tokens
            } : undefined
          }
        };
      case 'message_stop':
        return { type: 'message_stop' };
      default:
        return null;
    }
  }

  /**
   * Get error code from exception
   */
  private getErrorCode(error: unknown): string {
    if (error instanceof Anthropic.APIError) {
      return `API_${error.status}`;
    }
    return 'UNKNOWN';
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Anthropic.APIError) {
      return [429, 500, 502, 503, 504].includes(error.status);
    }
    return false;
  }
}
