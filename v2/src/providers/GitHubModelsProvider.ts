/**
 * GitHubModelsProvider - GitHub Models API Integration
 *
 * Provides LLM capabilities through GitHub Models with support for:
 * - Unlimited free usage in GitHub Codespaces
 * - OpenAI-compatible API format
 * - Multiple model families (GPT-4, Phi, LLaMA)
 * - Streaming responses
 * - Automatic Codespaces detection
 *
 * @module providers/GitHubModelsProvider
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
 * GitHub Models-specific configuration
 */
export interface GitHubModelsProviderConfig extends LLMProviderConfig {
  /** GitHub token (defaults to process.env.GITHUB_TOKEN) */
  token?: string;
  /** Base URL for GitHub Models API */
  baseUrl?: string;
  /** Default model name */
  defaultModel?: string;
  /** Force Codespaces mode (auto-detected if not set) */
  inCodespaces?: boolean;
}

/**
 * OpenAI-compatible chat completion request
 */
interface ChatCompletionRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

/**
 * OpenAI-compatible chat completion response
 */
interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Streaming chunk format
 */
interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }>;
}

/**
 * Available GitHub Models
 */
const GITHUB_MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'Phi-3.5-mini-instruct',
  'Meta-Llama-3.1-8B-Instruct'
] as const;

/**
 * Model pricing (per million tokens) - Free in Codespaces, estimated for external
 */
const GITHUB_MODELS_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'Phi-3.5-mini-instruct': { input: 0.0, output: 0.0 },
  'Meta-Llama-3.1-8B-Instruct': { input: 0.0, output: 0.0 }
};

/**
 * GitHubModelsProvider - GitHub Models API implementation
 *
 * This provider enables access to GitHub Models with unlimited free usage
 * in GitHub Codespaces. Supports OpenAI-compatible API format.
 */
export class GitHubModelsProvider implements ILLMProvider {
  private readonly logger: Logger;
  private config: GitHubModelsProviderConfig;
  private isInitialized: boolean;
  private baseUrl: string;
  private token: string | undefined;
  private inCodespaces: boolean;
  private requestCount: number;
  private currentModel: string;

  constructor(config: GitHubModelsProviderConfig = {}) {
    this.logger = Logger.getInstance();
    this.config = {
      name: config.name || 'github-models',
      debug: config.debug ?? false,
      timeout: config.timeout ?? 60000, // 1 minute
      maxRetries: config.maxRetries ?? 3,
      baseUrl: config.baseUrl || 'https://models.inference.ai.azure.com',
      defaultModel: config.defaultModel || 'gpt-4o-mini',
      token: config.token,
      inCodespaces: config.inCodespaces
    };
    this.isInitialized = false;
    this.baseUrl = this.config.baseUrl!;
    this.token = this.config.token;
    this.inCodespaces = this.config.inCodespaces ?? this.isInCodespaces();
    this.requestCount = 0;
    this.currentModel = this.config.defaultModel!;
  }

  /**
   * Check if running in GitHub Codespaces
   */
  isInCodespaces(): boolean {
    return process.env.CODESPACES === 'true';
  }

  /**
   * Initialize the GitHub Models provider
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('GitHubModelsProvider already initialized');
      return;
    }

    try {
      // Get token from config or environment
      this.token = this.config.token || process.env.GITHUB_TOKEN;

      if (!this.token) {
        throw new LLMProviderError(
          'GitHub token is required. Set GITHUB_TOKEN environment variable or provide token in config.',
          'github-models',
          'AUTH_ERROR',
          false
        );
      }

      // Detect Codespaces environment
      this.inCodespaces = this.config.inCodespaces ?? this.isInCodespaces();

      // Validate token and API access
      await this.validateToken();

      this.isInitialized = true;

      this.logger.info('GitHubModelsProvider initialized', {
        baseUrl: this.baseUrl,
        defaultModel: this.config.defaultModel,
        inCodespaces: this.inCodespaces,
        availableModels: GITHUB_MODELS
      });

    } catch (error) {
      if (error instanceof LLMProviderError) {
        throw error;
      }
      throw new LLMProviderError(
        `Failed to initialize GitHub Models: ${(error as Error).message}`,
        'github-models',
        'INIT_ERROR',
        false,
        error as Error
      );
    }
  }

  /**
   * Complete a prompt using GitHub Models
   */
  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResponse> {
    this.ensureInitialized();

    const startTime = Date.now();
    const model = options.model || this.currentModel;

    try {
      // Build messages array
      const messages = this.buildMessages(options);

      // Make request to GitHub Models
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens || 2048,
          stream: false
        } as ChatCompletionRequest),
        signal: AbortSignal.timeout(this.config.timeout!)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitHub Models API returned ${response.status}: ${errorText}`);
      }

      const data: ChatCompletionResponse = await response.json();
      this.requestCount++;

      const latency = Date.now() - startTime;

      return {
        content: [{
          type: 'text',
          text: data.choices[0]?.message?.content || ''
        }],
        usage: {
          input_tokens: data.usage.prompt_tokens,
          output_tokens: data.usage.completion_tokens
        },
        model: data.model,
        stop_reason: this.mapFinishReason(data.choices[0]?.finish_reason),
        id: data.id || `github-${Date.now()}-${randomUUID().split('-')[0]}`,
        metadata: {
          latency,
          cost: this.trackCost({
            input_tokens: data.usage.prompt_tokens,
            output_tokens: data.usage.completion_tokens
          }),
          inCodespaces: this.inCodespaces
        }
      };

    } catch (error) {
      throw new LLMProviderError(
        `GitHub Models completion failed: ${(error as Error).message}`,
        'github-models',
        'API_ERROR',
        true,
        error as Error
      );
    }
  }

  /**
   * Stream a completion using GitHub Models
   */
  async *streamComplete(options: LLMCompletionOptions): AsyncIterableIterator<LLMStreamEvent> {
    this.ensureInitialized();

    const model = options.model || this.currentModel;

    try {
      const messages = this.buildMessages(options);

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens || 2048,
          stream: true
        } as ChatCompletionRequest)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitHub Models API returned ${response.status}: ${errorText}`);
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
          if (line.trim() === '' || line.startsWith(':')) continue;
          if (line === 'data: [DONE]') {
            yield { type: 'content_block_stop' };
            yield { type: 'message_stop' };
            this.requestCount++;
            return;
          }

          if (line.startsWith('data: ')) {
            try {
              const data: ChatCompletionChunk = JSON.parse(line.slice(6));
              const content = data.choices[0]?.delta?.content;

              if (content) {
                yield {
                  type: 'content_block_delta',
                  delta: { type: 'text_delta', text: content }
                };
              }

              if (data.choices[0]?.finish_reason) {
                yield { type: 'content_block_stop' };
                yield { type: 'message_stop' };
                this.requestCount++;
                return;
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        }
      }

    } catch (error) {
      throw new LLMProviderError(
        `GitHub Models stream failed: ${(error as Error).message}`,
        'github-models',
        'API_ERROR',
        true,
        error as Error
      );
    }
  }

  /**
   * Generate embeddings (not supported by GitHub Models)
   */
  async embed(options: LLMEmbeddingOptions): Promise<LLMEmbeddingResponse> {
    throw new LLMProviderError(
      'Embeddings are not supported by GitHub Models',
      'github-models',
      'NOT_SUPPORTED',
      false
    );
  }

  /**
   * Count tokens in text (approximate)
   */
  async countTokens(options: LLMTokenCountOptions): Promise<number> {
    return this.estimateTokens(options.text);
  }

  /**
   * Health check - verify API access
   */
  async healthCheck(): Promise<LLMHealthStatus> {
    const startTime = Date.now();

    try {
      // Make a minimal completion request
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          model: this.currentModel,
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1
        }),
        signal: AbortSignal.timeout(5000)
      });

      const latency = Date.now() - startTime;
      const isHealthy = response.ok;

      if (!isHealthy) {
        const errorText = await response.text();
        return {
          healthy: false,
          error: `API returned ${response.status}: ${errorText}`,
          timestamp: new Date(),
          latency
        };
      }

      return {
        healthy: true,
        latency,
        timestamp: new Date(),
        metadata: {
          baseUrl: this.baseUrl,
          currentModel: this.currentModel,
          inCodespaces: this.inCodespaces,
          requestCount: this.requestCount
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
    return {
      name: 'github-models',
      version: '1.0.0',
      models: [...GITHUB_MODELS],
      capabilities: {
        streaming: true,
        caching: false,
        embeddings: false,
        vision: false
      },
      costs: {
        inputPerMillion: this.inCodespaces ? 0 : GITHUB_MODELS_PRICING[this.currentModel]?.input || 0,
        outputPerMillion: this.inCodespaces ? 0 : GITHUB_MODELS_PRICING[this.currentModel]?.output || 0
      },
      location: 'cloud'
    };
  }

  /**
   * Shutdown the provider
   */
  async shutdown(): Promise<void> {
    this.isInitialized = false;
    this.logger.info('GitHubModelsProvider shutdown', {
      requestCount: this.requestCount
    });
  }

  /**
   * Track cost for a request
   */
  trackCost(usage: LLMCompletionResponse['usage']): number {
    // Free in Codespaces
    if (this.inCodespaces) {
      return 0;
    }

    // Estimate cost for non-Codespaces usage
    const pricing = GITHUB_MODELS_PRICING[this.currentModel];
    if (!pricing) {
      return 0;
    }

    const inputCost = (usage.input_tokens / 1_000_000) * pricing.input;
    const outputCost = (usage.output_tokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
  }

  /**
   * Set the current model for subsequent requests
   */
  async setModel(model: string): Promise<void> {
    this.ensureInitialized();

    if (!GITHUB_MODELS.includes(model as any)) {
      this.logger.warn(`Model ${model} is not in the known models list. It may not be supported.`);
    }

    this.currentModel = model;
    this.logger.info(`Switched to model: ${model}`);
  }

  /**
   * Get current model
   */
  getCurrentModel(): string {
    return this.currentModel;
  }

  /**
   * Get list of available models
   */
  getAvailableModels(): string[] {
    return [...GITHUB_MODELS];
  }

  /**
   * Validate GitHub token
   */
  private async validateToken(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          model: this.currentModel,
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1
        }),
        signal: AbortSignal.timeout(5000)
      });

      if (response.status === 401) {
        throw new LLMProviderError(
          'Invalid or expired GitHub token',
          'github-models',
          'AUTH_ERROR',
          false
        );
      }

      if (response.status === 403) {
        throw new LLMProviderError(
          'GitHub token does not have required permissions',
          'github-models',
          'AUTH_ERROR',
          false
        );
      }

    } catch (error) {
      // Re-throw LLMProviderError immediately
      if (error instanceof LLMProviderError) {
        throw error;
      }

      // For network errors or other issues, log warning and proceed
      // The actual API calls will fail if there's a real issue
      this.logger.warn('Token validation failed, but will attempt to proceed', {
        error: (error as Error).message
      });
    }
  }

  /**
   * Build messages array from options
   */
  private buildMessages(options: LLMCompletionOptions): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];

    // Add system message if provided
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
        role: message.role,
        content
      });
    }

    return messages;
  }

  /**
   * Map OpenAI finish reason to Claude format
   */
  private mapFinishReason(reason: string | undefined): 'end_turn' | 'max_tokens' | 'stop_sequence' {
    switch (reason) {
      case 'stop':
        return 'end_turn';
      case 'length':
        return 'max_tokens';
      default:
        return 'end_turn';
    }
  }

  /**
   * Estimate token count (approximate: 1 token ≈ 4 characters)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Ensure provider is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new LLMProviderError(
        'GitHubModelsProvider not initialized. Call initialize() first.',
        'github-models',
        'NOT_INITIALIZED',
        false
      );
    }
  }
}
