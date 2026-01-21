/**
 * Agent LLM Adapter - Bridges ILLMProvider to IAgentLLM
 *
 * Phase 1.2.2: Provides the implementation that wraps any ILLMProvider
 * and presents the simplified IAgentLLM interface to agents.
 *
 * Features:
 * - Wraps any ILLMProvider (RuvllmProvider, ClaudeProvider, HybridRouter)
 * - Tracks usage statistics per agent
 * - Handles complexity-based routing when using HybridRouter
 * - Integrates with RuVector caching automatically
 * - Provides clear error handling
 *
 * @module agents/adapters/AgentLLMAdapter
 */

import type {
  ILLMProvider,
  LLMCompletionOptions,
  LLMCompletionResponse,
  LLMTextBlockParam,
  LLMProviderError,
} from '../../providers/ILLMProvider';
import type { HybridRouter, TaskComplexity } from '../../providers/HybridRouter';
import type {
  IAgentLLM,
  AgentCompletionOptions,
  AgentUsageStats,
  AgentModelInfo,
} from '../interfaces/IAgentLLM';
import { Logger } from '../../utils/Logger';
import { AgentLLMError } from '../interfaces/IAgentLLM';

/**
 * Configuration for AgentLLMAdapter
 */
export interface AgentLLMAdapterConfig {
  /** The underlying LLM provider */
  provider: ILLMProvider;

  /** Optional hybrid router for multi-provider routing */
  hybridRouter?: HybridRouter;

  /** Agent identifier for tracking */
  agentId?: string;

  /** Default model to use */
  defaultModel?: string;

  /** Default temperature */
  defaultTemperature?: number;

  /** Default max tokens */
  defaultMaxTokens?: number;

  /** Enable debug logging */
  debug?: boolean;
}

/**
 * AgentLLMAdapter - Implementation of IAgentLLM
 *
 * This adapter wraps any ILLMProvider and exposes the simplified IAgentLLM interface.
 * It handles:
 * - Message construction from simple prompts
 * - Usage statistics tracking
 * - Complexity-based routing (when HybridRouter is available)
 * - Error translation to AgentLLMError
 * - Model management
 */
export class AgentLLMAdapter implements IAgentLLM {
  private readonly provider: ILLMProvider;
  private readonly hybridRouter?: HybridRouter;
  private readonly agentId: string;
  private readonly config: Required<Omit<AgentLLMAdapterConfig, 'provider' | 'hybridRouter' | 'agentId'>> & Pick<AgentLLMAdapterConfig, 'agentId'>;
  private currentModel: string;

  // Usage tracking
  private stats: {
    requestCount: number;
    tokensUsed: number;
    costIncurred: number;
    totalLatency: number;
    cacheHits: number;
    cacheMisses: number;
    localRequests: number;
    cloudRequests: number;
  };

  constructor(config: AgentLLMAdapterConfig) {
    this.provider = config.provider;
    this.hybridRouter = config.hybridRouter;
    this.agentId = config.agentId || 'unknown-agent';

    // Get provider metadata for defaults
    const metadata = this.provider.getMetadata();

    this.config = {
      defaultModel: config.defaultModel || metadata.models[0] || 'auto',
      defaultTemperature: config.defaultTemperature ?? 0.7,
      defaultMaxTokens: config.defaultMaxTokens ?? 2048,
      debug: config.debug ?? false,
      agentId: config.agentId,
    };

    this.currentModel = this.config.defaultModel;

    // Initialize stats
    this.stats = {
      requestCount: 0,
      tokensUsed: 0,
      costIncurred: 0,
      totalLatency: 0,
      cacheHits: 0,
      cacheMisses: 0,
      localRequests: 0,
      cloudRequests: 0,
    };
  }

  /**
   * Complete a prompt
   */
  async complete(prompt: string, options?: AgentCompletionOptions): Promise<string> {
    const startTime = Date.now();

    try {
      // Build LLM completion options
      const completionOptions = this.buildCompletionOptions(prompt, options);

      // Execute completion
      const response = await this.provider.complete(completionOptions);

      // Track usage
      this.trackUsage(response, Date.now() - startTime);

      // Extract and return text
      return this.extractText(response);
    } catch (error) {
      throw this.translateError(error);
    }
  }

  /**
   * Stream a completion
   */
  async *streamComplete(
    prompt: string,
    options?: AgentCompletionOptions
  ): AsyncIterableIterator<string> {
    const startTime = Date.now();

    try {
      // Build completion options with streaming enabled
      const completionOptions = this.buildCompletionOptions(prompt, {
        ...options,
        stream: true,
      });

      // Stream from provider
      let totalTokens = 0;
      let fullText = '';

      for await (const event of this.provider.streamComplete(completionOptions)) {
        // Extract text delta
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          const chunk = event.delta.text;
          fullText += chunk;
          yield chunk;
        }

        // Track final usage
        if (event.type === 'message_stop' && event.message) {
          if (event.message.usage) {
            totalTokens = event.message.usage.input_tokens + event.message.usage.output_tokens;
          }
        }
      }

      // Track completion stats
      this.stats.requestCount++;
      this.stats.tokensUsed += totalTokens;
      this.stats.totalLatency += Date.now() - startTime;

      if (this.config.debug) {
        Logger.getInstance().info(`[${this.agentId}] Stream completed: ${totalTokens} tokens, ${Date.now() - startTime}ms`);
      }
    } catch (error) {
      throw this.translateError(error);
    }
  }

  /**
   * Generate embeddings
   */
  async embed(text: string): Promise<number[]> {
    try {
      const response = await this.provider.embed({ text });
      return response.embedding;
    } catch (error) {
      throw this.translateError(error);
    }
  }

  /**
   * Get available models
   */
  async getAvailableModels(): Promise<AgentModelInfo[]> {
    try {
      const metadata = this.provider.getMetadata();

      return metadata.models.map(modelId => ({
        id: modelId,
        name: modelId,
        provider: metadata.name,
        capabilities: {
          maxTokens: 4096, // Default, could be model-specific
          streaming: metadata.capabilities.streaming,
          vision: metadata.capabilities.vision,
          functionCalling: false, // Not exposed yet
        },
        cost: metadata.location === 'cloud' ? {
          inputPerMillion: metadata.costs.inputPerMillion,
          outputPerMillion: metadata.costs.outputPerMillion,
        } : undefined,
      }));
    } catch (error) {
      throw this.translateError(error);
    }
  }

  /**
   * Get current model
   */
  getCurrentModel(): string {
    return this.currentModel;
  }

  /**
   * Switch model
   */
  async switchModel(model: string): Promise<void> {
    // Validate model exists
    const metadata = this.provider.getMetadata();
    if (!metadata.models.includes(model)) {
      throw new AgentLLMError(
        `Model '${model}' not available. Available models: ${metadata.models.join(', ')}`,
        'MODEL_NOT_FOUND',
        false
      );
    }

    this.currentModel = model;

    if (this.config.debug) {
      Logger.getInstance().info(`[${this.agentId}] Switched to model: ${model}`);
    }
  }

  /**
   * Health check
   */
  async isHealthy(): Promise<boolean> {
    try {
      const health = await this.provider.healthCheck();
      return health.healthy;
    } catch {
      return false;
    }
  }

  /**
   * Get usage statistics
   */
  getUsageStats(): AgentUsageStats {
    const avgLatency = this.stats.requestCount > 0
      ? this.stats.totalLatency / this.stats.requestCount
      : 0;

    const totalCacheRequests = this.stats.cacheHits + this.stats.cacheMisses;
    const cacheHitRate = totalCacheRequests > 0
      ? this.stats.cacheHits / totalCacheRequests
      : undefined;

    return {
      requestCount: this.stats.requestCount,
      tokensUsed: this.stats.tokensUsed,
      costIncurred: this.stats.costIncurred,
      averageLatency: avgLatency,
      cacheHitRate,
      routingBreakdown: {
        local: this.stats.localRequests,
        cloud: this.stats.cloudRequests,
        cache: this.stats.cacheHits,
      },
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      requestCount: 0,
      tokensUsed: 0,
      costIncurred: 0,
      totalLatency: 0,
      cacheHits: 0,
      cacheMisses: 0,
      localRequests: 0,
      cloudRequests: 0,
    };

    if (this.config.debug) {
      Logger.getInstance().info(`[${this.agentId}] Stats reset`);
    }
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Build LLMCompletionOptions from simplified AgentCompletionOptions
   */
  private buildCompletionOptions(
    prompt: string,
    options?: AgentCompletionOptions
  ): LLMCompletionOptions {
    const systemPrompt = options?.systemPrompt;
    const system: LLMTextBlockParam[] | undefined = systemPrompt ? [
      {
        type: 'text',
        text: systemPrompt,
        ...(options?.cacheKey ? { cache_control: { type: 'ephemeral' as const } } : {}),
      },
    ] : undefined;

    const completionOptions: LLMCompletionOptions = {
      model: this.currentModel,
      system,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      maxTokens: options?.maxTokens ?? this.config.defaultMaxTokens,
      temperature: options?.temperature ?? this.config.defaultTemperature,
      stream: options?.stream ?? false,
      metadata: {
        agentId: this.agentId,
        cacheKey: options?.cacheKey,
        complexity: options?.complexity,
        ...options?.metadata,
      },
    };

    return completionOptions;
  }

  /**
   * Extract text from LLMCompletionResponse
   */
  private extractText(response: LLMCompletionResponse): string {
    return response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');
  }

  /**
   * Track usage from response
   */
  private trackUsage(response: LLMCompletionResponse, latency: number): void {
    this.stats.requestCount++;
    this.stats.totalLatency += latency;

    // Track tokens
    const tokens = response.usage.input_tokens + response.usage.output_tokens;
    this.stats.tokensUsed += tokens;

    // Track cost (if available)
    if (this.provider.trackCost) {
      const cost = this.provider.trackCost(response.usage);
      this.stats.costIncurred += cost;
    }

    // Track cache hits/misses
    if (response.usage.cache_read_input_tokens && response.usage.cache_read_input_tokens > 0) {
      this.stats.cacheHits++;
    } else if (response.usage.input_tokens > 0) {
      this.stats.cacheMisses++;
    }

    // Track routing (if metadata available from HybridRouter)
    if (response.metadata?.source === 'cache' || response.model === 'ruvector-cache') {
      this.stats.cacheHits++;
    } else if (response.metadata?.routingDecision) {
      const decision = response.metadata.routingDecision;
      if (decision.provider === 'local') {
        this.stats.localRequests++;
      } else if (decision.provider === 'cloud') {
        this.stats.cloudRequests++;
      }
    }

    if (this.config.debug) {
      Logger.getInstance().info(`[${this.agentId}] Request completed: ${tokens} tokens, ${latency}ms, cost: $${this.stats.costIncurred.toFixed(6)}`);
    }
  }

  /**
   * Translate provider errors to AgentLLMError
   */
  private translateError(error: unknown): AgentLLMError {
    if (error instanceof AgentLLMError) {
      return error;
    }

    // Check if it's an LLMProviderError
    const providerError = error as LLMProviderError;
    if (providerError.name === 'LLMProviderError') {
      let code: AgentLLMError['code'];

      switch (providerError.code) {
        case 'PROVIDER_UNAVAILABLE':
        case 'NO_PROVIDERS':
        case 'NOT_INITIALIZED':
          code = 'UNAVAILABLE';
          break;
        case 'UNSUPPORTED':
          code = 'UNSUPPORTED';
          break;
        default:
          code = 'REQUEST_FAILED';
      }

      return new AgentLLMError(
        providerError.message,
        code,
        providerError.retryable,
        providerError.cause
      );
    }

    // Generic error
    const message = error instanceof Error ? error.message : String(error);
    return new AgentLLMError(
      `LLM request failed: ${message}`,
      'REQUEST_FAILED',
      false,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Factory function to create AgentLLMAdapter
 *
 * @param provider - The LLM provider to wrap
 * @param config - Optional configuration
 * @returns IAgentLLM instance
 *
 * @example
 * ```typescript
 * const llm = createAgentLLM(ruvllmProvider, {
 *   agentId: 'test-generator-1',
 *   defaultModel: 'llama-3.2-3b-instruct',
 *   defaultTemperature: 0.2
 * });
 * ```
 */
export function createAgentLLM(
  provider: ILLMProvider,
  config?: Partial<Omit<AgentLLMAdapterConfig, 'provider'>>
): IAgentLLM {
  return new AgentLLMAdapter({
    provider,
    ...config,
  });
}
