/**
 * MockLLMProvider - Reusable mock for testing LLM provider integrations
 *
 * Provides configurable responses and call tracking for testing
 * components that depend on ILLMProvider without real API calls.
 */

import {
  ILLMProvider,
  LLMCompletionOptions,
  LLMCompletionResponse,
  LLMStreamEvent,
  LLMEmbeddingOptions,
  LLMEmbeddingResponse,
  LLMTokenCountOptions,
  LLMHealthStatus,
  LLMProviderMetadata,
  LLMProviderError
} from '../../src/providers/ILLMProvider';

/**
 * Tracked method call for assertions
 */
export interface MethodCall {
  method: string;
  args: any[];
  timestamp: Date;
}

/**
 * Configuration for mock behavior
 */
export interface MockLLMProviderConfig {
  /** Provider name for identification */
  name?: string;
  /** Should initialize succeed */
  initializeSuccess?: boolean;
  /** Should health check succeed */
  healthCheckSuccess?: boolean;
  /** Latency to simulate (ms) */
  simulateLatency?: number;
  /** Default model name */
  defaultModel?: string;
}

/**
 * MockLLMProvider - Configurable mock for testing
 *
 * @example
 * ```typescript
 * const mock = new MockLLMProvider();
 * mock.setCompletionResponse('Hello from mock!');
 * const response = await mock.complete({ messages: [...] });
 * expect(mock.getCallHistory()).toHaveLength(1);
 * ```
 */
export class MockLLMProvider implements ILLMProvider {
  private callHistory: MethodCall[] = [];
  private completionResponses: string[] = [];
  private streamingResponses: string[] = [];
  private embeddingResponses: number[][] = [];
  private tokenCounts: number[] = [];
  private initialized = false;
  private config: Required<MockLLMProviderConfig>;

  constructor(config: MockLLMProviderConfig = {}) {
    this.config = {
      name: config.name || 'mock-provider',
      initializeSuccess: config.initializeSuccess ?? true,
      healthCheckSuccess: config.healthCheckSuccess ?? true,
      simulateLatency: config.simulateLatency || 0,
      defaultModel: config.defaultModel || 'mock-model-v1'
    };
  }

  /**
   * Configure a completion response
   */
  setCompletionResponse(response: string): void {
    this.completionResponses.push(response);
  }

  /**
   * Configure multiple completion responses (for sequential calls)
   */
  setCompletionResponses(responses: string[]): void {
    this.completionResponses = [...responses];
  }

  /**
   * Configure an embedding response
   */
  setEmbeddingResponse(embedding: number[]): void {
    this.embeddingResponses.push(embedding);
  }

  /**
   * Configure multiple embedding responses
   */
  setEmbeddingResponses(embeddings: number[][]): void {
    this.embeddingResponses = [...embeddings];
  }

  /**
   * Configure a token count response
   */
  setTokenCount(count: number): void {
    this.tokenCounts.push(count);
  }

  /**
   * Configure multiple token count responses
   */
  setTokenCounts(counts: number[]): void {
    this.tokenCounts = [...counts];
  }

  /**
   * Configure streaming response
   */
  setStreamingResponse(response: string): void {
    this.streamingResponses.push(response);
  }

  /**
   * Get call history for assertions
   */
  getCallHistory(): MethodCall[] {
    return [...this.callHistory];
  }

  /**
   * Get calls by method name
   */
  getCallsByMethod(method: string): MethodCall[] {
    return this.callHistory.filter(call => call.method === method);
  }

  /**
   * Clear call history and configured responses
   */
  reset(): void {
    this.callHistory = [];
    this.completionResponses = [];
    this.streamingResponses = [];
    this.embeddingResponses = [];
    this.tokenCounts = [];
    this.initialized = false;
  }

  /**
   * Simulate latency if configured
   */
  private async simulateDelay(): Promise<void> {
    if (this.config.simulateLatency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.config.simulateLatency));
    }
  }

  /**
   * Track method call
   */
  private trackCall(method: string, args: any[]): void {
    this.callHistory.push({
      method,
      args,
      timestamp: new Date()
    });
  }

  /**
   * Initialize the provider
   */
  async initialize(): Promise<void> {
    this.trackCall('initialize', []);
    await this.simulateDelay();

    if (!this.config.initializeSuccess) {
      throw new LLMProviderError(
        'Mock initialization failed',
        this.config.name,
        'INIT_ERROR',
        false
      );
    }

    this.initialized = true;
  }

  /**
   * Complete a prompt
   */
  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResponse> {
    this.trackCall('complete', [options]);

    if (!this.initialized) {
      throw new LLMProviderError(
        'Provider not initialized',
        this.config.name,
        'NOT_INITIALIZED',
        false
      );
    }

    await this.simulateDelay();

    const responseText = this.completionResponses.shift() || 'Mock response';
    const inputTokens = JSON.stringify(options.messages).length / 4; // Rough estimate
    const outputTokens = responseText.length / 4;

    return {
      id: `mock-${Date.now()}`,
      model: options.model || this.config.defaultModel,
      content: [{ type: 'text', text: responseText }],
      usage: {
        input_tokens: Math.ceil(inputTokens),
        output_tokens: Math.ceil(outputTokens)
      },
      stop_reason: 'end_turn',
      metadata: { mock: true }
    };
  }

  /**
   * Stream completion
   */
  async *streamComplete(options: LLMCompletionOptions): AsyncIterableIterator<LLMStreamEvent> {
    this.trackCall('streamComplete', [options]);

    if (!this.initialized) {
      throw new LLMProviderError(
        'Provider not initialized',
        this.config.name,
        'NOT_INITIALIZED',
        false
      );
    }

    await this.simulateDelay();

    const responseText = this.streamingResponses.shift() || 'Streaming mock response';

    // Message start
    yield {
      type: 'message_start',
      message: {
        id: `mock-stream-${Date.now()}`,
        model: options.model || this.config.defaultModel
      }
    };

    // Content block start
    yield {
      type: 'content_block_start',
      content_block: { type: 'text', text: '' }
    };

    // Stream text in chunks
    const words = responseText.split(' ');
    for (const word of words) {
      await this.simulateDelay();
      yield {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: word + ' ' }
      };
    }

    // Content block stop
    yield {
      type: 'content_block_stop'
    };

    // Message stop
    yield {
      type: 'message_stop',
      message: {
        usage: {
          input_tokens: 10,
          output_tokens: words.length
        }
      }
    };
  }

  /**
   * Generate embeddings
   */
  async embed(options: LLMEmbeddingOptions): Promise<LLMEmbeddingResponse> {
    this.trackCall('embed', [options]);

    if (!this.initialized) {
      throw new LLMProviderError(
        'Provider not initialized',
        this.config.name,
        'NOT_INITIALIZED',
        false
      );
    }

    await this.simulateDelay();

    const embedding = this.embeddingResponses.shift() ||
      Array.from({ length: options.dimensions || 384 }, () => Math.random());

    return {
      embedding,
      model: options.model || 'mock-embeddings-v1',
      tokens: Math.ceil(options.text.length / 4)
    };
  }

  /**
   * Count tokens
   */
  async countTokens(options: LLMTokenCountOptions): Promise<number> {
    this.trackCall('countTokens', [options]);

    if (!this.initialized) {
      throw new LLMProviderError(
        'Provider not initialized',
        this.config.name,
        'NOT_INITIALIZED',
        false
      );
    }

    await this.simulateDelay();

    return this.tokenCounts.shift() || Math.ceil(options.text.length / 4);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<LLMHealthStatus> {
    this.trackCall('healthCheck', []);
    await this.simulateDelay();

    if (!this.config.healthCheckSuccess) {
      return {
        healthy: false,
        error: 'Mock health check failed',
        timestamp: new Date()
      };
    }

    return {
      healthy: true,
      latency: this.config.simulateLatency,
      timestamp: new Date(),
      metadata: { mock: true }
    };
  }

  /**
   * Get provider metadata
   */
  getMetadata(): LLMProviderMetadata {
    this.trackCall('getMetadata', []);

    return {
      name: this.config.name,
      version: '1.0.0',
      models: [this.config.defaultModel, 'mock-model-v2'],
      capabilities: {
        streaming: true,
        caching: false,
        embeddings: true,
        vision: false
      },
      costs: {
        inputPerMillion: 0,
        outputPerMillion: 0
      },
      location: 'local'
    };
  }

  /**
   * Shutdown
   */
  async shutdown(): Promise<void> {
    this.trackCall('shutdown', []);
    await this.simulateDelay();
    this.initialized = false;
  }

  /**
   * Track cost
   */
  trackCost(usage: LLMCompletionResponse['usage']): number {
    this.trackCall('trackCost', [usage]);
    // Mock: free provider
    return 0;
  }
}
