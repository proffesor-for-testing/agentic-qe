/**
 * LLM Provider Abstraction Layer
 *
 * Unified interface for multiple LLM providers (Claude API, local ruvllm, etc.)
 * Enables hybrid routing between local and cloud inference.
 *
 * @module providers/ILLMProvider
 */

import Anthropic from '@anthropic-ai/sdk';

/**
 * Message parameter for LLM requests
 */
export interface LLMMessageParam {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{
    type: 'text' | 'image';
    text?: string;
    source?: {
      type: 'base64';
      media_type: string;
      data: string;
    };
  }>;
}

/**
 * Text block parameter for system prompts
 */
export interface LLMTextBlockParam {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

/**
 * Options for LLM completion requests
 */
export interface LLMCompletionOptions {
  /** Model identifier (e.g., 'claude-sonnet-4', 'ruvllm-7b') */
  model: string;
  /** System prompts (supports caching with cache_control) */
  system?: LLMTextBlockParam[];
  /** Conversation messages */
  messages: LLMMessageParam[];
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for sampling (0.0-1.0) */
  temperature?: number;
  /** Enable streaming responses */
  stream?: boolean;
  /** Additional provider-specific options */
  metadata?: Record<string, any>;
}

/**
 * Response from LLM completion
 */
export interface LLMCompletionResponse {
  /** Response content */
  content: Array<{ type: 'text'; text: string }>;
  /** Token usage statistics */
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  /** Model used for completion */
  model: string;
  /** Stop reason */
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence';
  /** Unique request ID */
  id: string;
  /** Response metadata */
  metadata?: Record<string, any>;
}

/**
 * Stream event from LLM
 */
export interface LLMStreamEvent {
  type: 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_start' | 'message_delta' | 'message_stop';
  delta?: {
    type: 'text_delta';
    text: string;
  };
  content_block?: {
    type: 'text';
    text: string;
  };
  message?: Partial<LLMCompletionResponse>;
}

/**
 * Options for embedding generation
 */
export interface LLMEmbeddingOptions {
  /** Text to embed */
  text: string;
  /** Model for embedding (optional, provider may have default) */
  model?: string;
  /** Dimensions for embedding (optional) */
  dimensions?: number;
}

/**
 * Response from embedding generation
 */
export interface LLMEmbeddingResponse {
  /** Embedding vector */
  embedding: number[];
  /** Model used */
  model: string;
  /** Token count */
  tokens: number;
}

/**
 * Provider health status
 */
export interface LLMHealthStatus {
  /** Provider is healthy and ready */
  healthy: boolean;
  /** Latency in milliseconds */
  latency?: number;
  /** Error message if unhealthy */
  error?: string;
  /** Last check timestamp */
  timestamp: Date;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Provider capabilities and metadata
 */
export interface LLMProviderMetadata {
  /** Provider name (e.g., 'claude', 'ruvllm') */
  name: string;
  /** Provider version */
  version: string;
  /** Supported models */
  models: string[];
  /** Capabilities */
  capabilities: {
    /** Supports streaming */
    streaming: boolean;
    /** Supports prompt caching */
    caching: boolean;
    /** Supports embeddings */
    embeddings: boolean;
    /** Supports vision/multimodal */
    vision: boolean;
  };
  /** Cost per million tokens (input/output) */
  costs: {
    inputPerMillion: number;
    outputPerMillion: number;
    cacheWriteMultiplier?: number; // e.g., 1.25 for 25% premium
    cacheReadMultiplier?: number;  // e.g., 0.1 for 90% discount
  };
  /** Local or cloud provider */
  location: 'local' | 'cloud';
}

/**
 * Token counting options
 */
export interface LLMTokenCountOptions {
  /** Text to count tokens for */
  text: string;
  /** Model to use for counting (may affect tokenization) */
  model?: string;
}

/**
 * ILLMProvider - Unified interface for LLM providers
 *
 * Abstracts differences between providers (Claude API, ruvllm, etc.)
 * to enable hybrid routing and provider switching at runtime.
 *
 * @example
 * ```typescript
 * const provider = new ClaudeProvider({ apiKey: 'sk-...' });
 * await provider.initialize();
 *
 * const response = await provider.complete({
 *   model: 'claude-sonnet-4',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 *   maxTokens: 1024
 * });
 * ```
 */
export interface ILLMProvider {
  /**
   * Initialize the provider
   *
   * Sets up connections, validates credentials, loads models, etc.
   *
   * @throws {Error} If initialization fails
   */
  initialize(): Promise<void>;

  /**
   * Complete a prompt with the LLM
   *
   * @param options - Completion options
   * @returns Completion response
   * @throws {Error} If request fails
   */
  complete(options: LLMCompletionOptions): Promise<LLMCompletionResponse>;

  /**
   * Complete a prompt with streaming
   *
   * @param options - Completion options (stream enabled)
   * @returns Async iterator of stream events
   * @throws {Error} If request fails
   */
  streamComplete(options: LLMCompletionOptions): AsyncIterableIterator<LLMStreamEvent>;

  /**
   * Generate embeddings for text
   *
   * @param options - Embedding options
   * @returns Embedding response
   * @throws {Error} If embeddings not supported or request fails
   */
  embed(options: LLMEmbeddingOptions): Promise<LLMEmbeddingResponse>;

  /**
   * Count tokens in text
   *
   * @param options - Token counting options
   * @returns Token count
   */
  countTokens(options: LLMTokenCountOptions): Promise<number>;

  /**
   * Health check
   *
   * Verifies provider is operational and responsive.
   *
   * @returns Health status
   */
  healthCheck(): Promise<LLMHealthStatus>;

  /**
   * Get provider metadata
   *
   * Returns information about the provider's capabilities, costs, and models.
   *
   * @returns Provider metadata
   */
  getMetadata(): LLMProviderMetadata;

  /**
   * Gracefully shutdown the provider
   *
   * Closes connections, releases resources, etc.
   */
  shutdown(): Promise<void>;

  /**
   * Track cost for a request
   *
   * Internal method to track token usage and calculate costs.
   *
   * @param usage - Token usage from response
   * @returns Cost in dollars
   */
  trackCost(usage: LLMCompletionResponse['usage']): number;
}

/**
 * Provider configuration base
 */
export interface LLMProviderConfig {
  /** Provider name for logging/identification */
  name?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum retries on failure */
  maxRetries?: number;
}

/**
 * Error thrown by LLM providers
 */
export class LLMProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly code: string,
    public readonly retryable: boolean = false,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'LLMProviderError';
  }
}

/**
 * Type guard for checking if error is LLMProviderError
 */
export function isLLMProviderError(error: unknown): error is LLMProviderError {
  return error instanceof LLMProviderError;
}
