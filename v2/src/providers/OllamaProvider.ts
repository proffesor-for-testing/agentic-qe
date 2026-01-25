/**
 * OllamaProvider - Local LLM Inference via Ollama
 *
 * Provides local LLM inference through Ollama with support for:
 * - Multiple model families (Qwen, LLaMA, Mistral, DeepSeek)
 * - Streaming responses
 * - Vector embeddings
 * - Model hot-swapping
 * - Zero cloud costs
 * - Privacy-preserving local inference
 *
 * @module providers/OllamaProvider
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
 * Ollama-specific configuration
 */
export interface OllamaProviderConfig extends LLMProviderConfig {
  /** Base URL for Ollama server (default: http://localhost:11434) */
  baseUrl?: string;
  /** Default model name */
  defaultModel?: string;
  /** Keep model loaded in memory (default: true) */
  keepAlive?: boolean;
  /** Keep alive duration in seconds (default: 5 minutes) */
  keepAliveDuration?: number;
}

/**
 * Ollama API response for /api/generate
 */
interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Ollama API response for /api/embeddings
 */
interface OllamaEmbeddingResponse {
  model: string;
  embeddings: number[][];
}

/**
 * Ollama model information from /api/tags
 */
interface OllamaModelInfo {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

/**
 * OllamaProvider - Local LLM inference implementation
 *
 * This provider enables local LLM inference using Ollama, providing
 * cost-free, privacy-preserving inference with multiple model families.
 *
 * Supported Models:
 * - qwen3-coder:30b (primary coding model)
 * - llama3.3:70b (large general-purpose)
 * - devstral-small-2:24b (efficient coding)
 * - rnj-1:8b (edge deployment)
 * - deepseek-coder-v2 (code-specific)
 */
export class OllamaProvider implements ILLMProvider {
  private readonly logger: Logger;
  private config: OllamaProviderConfig;
  private isInitialized: boolean;
  private baseUrl: string;
  private requestCount: number;
  private availableModels: Set<string>;
  private currentModel: string;

  constructor(config: OllamaProviderConfig = {}) {
    this.logger = Logger.getInstance();
    this.config = {
      name: config.name || 'ollama',
      debug: config.debug ?? false,
      timeout: config.timeout ?? 120000, // 2 minutes for local inference
      maxRetries: config.maxRetries ?? 2,
      baseUrl: config.baseUrl || 'http://localhost:11434',
      defaultModel: config.defaultModel || 'qwen3-coder:30b',
      keepAlive: config.keepAlive ?? true,
      keepAliveDuration: config.keepAliveDuration ?? 300 // 5 minutes
    };
    this.isInitialized = false;
    this.baseUrl = this.config.baseUrl!;
    this.requestCount = 0;
    this.availableModels = new Set();
    this.currentModel = this.config.defaultModel!;
  }

  /**
   * Initialize the Ollama provider
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('OllamaProvider already initialized');
      return;
    }

    try {
      // Check if Ollama is running
      const isHealthy = await this.checkOllamaHealth();
      if (!isHealthy) {
        throw new Error('Ollama server is not running or unreachable');
      }

      // Discover available models
      await this.discoverModels();

      this.isInitialized = true;

      this.logger.info('OllamaProvider initialized', {
        baseUrl: this.baseUrl,
        defaultModel: this.config.defaultModel,
        availableModels: Array.from(this.availableModels),
        keepAlive: this.config.keepAlive
      });

    } catch (error) {
      throw new LLMProviderError(
        `Failed to initialize Ollama: ${(error as Error).message}`,
        'ollama',
        'INIT_ERROR',
        false,
        error as Error
      );
    }
  }

  /**
   * Complete a prompt using Ollama
   */
  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResponse> {
    this.ensureInitialized();

    const startTime = Date.now();
    const model = options.model || this.currentModel;

    try {
      // Build prompt from messages
      const prompt = this.buildPrompt(options);

      // Make request to Ollama
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.maxTokens || 2048
          },
          keep_alive: this.config.keepAlive
            ? `${this.config.keepAliveDuration}s`
            : 0
        }),
        signal: AbortSignal.timeout(this.config.timeout!)
      });

      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
      }

      const data: OllamaGenerateResponse = await response.json();
      this.requestCount++;

      const latency = Date.now() - startTime;

      return {
        content: [{
          type: 'text',
          text: data.response
        }],
        usage: {
          input_tokens: data.prompt_eval_count || this.estimateTokens(prompt),
          output_tokens: data.eval_count || this.estimateTokens(data.response)
        },
        model: data.model,
        stop_reason: 'end_turn',
        id: `ollama-${Date.now()}-${randomUUID().split('-')[0]}`,
        metadata: {
          latency,
          cost: 0, // Local inference is free
          totalDuration: data.total_duration,
          loadDuration: data.load_duration,
          promptEvalDuration: data.prompt_eval_duration,
          evalDuration: data.eval_duration
        }
      };

    } catch (error) {
      throw new LLMProviderError(
        `Ollama completion failed: ${(error as Error).message}`,
        'ollama',
        'INFERENCE_ERROR',
        true,
        error as Error
      );
    }
  }

  /**
   * Stream a completion using Ollama
   */
  async *streamComplete(options: LLMCompletionOptions): AsyncIterableIterator<LLMStreamEvent> {
    this.ensureInitialized();

    const model = options.model || this.currentModel;

    try {
      const prompt = this.buildPrompt(options);

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: true,
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.maxTokens || 2048
          },
          keep_alive: this.config.keepAlive
            ? `${this.config.keepAliveDuration}s`
            : 0
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}`);
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
          if (line.trim() === '') continue;

          try {
            const data: OllamaGenerateResponse = JSON.parse(line);

            if (data.response) {
              yield {
                type: 'content_block_delta',
                delta: { type: 'text_delta', text: data.response }
              };
            }

            if (data.done) {
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

    } catch (error) {
      throw new LLMProviderError(
        `Ollama stream failed: ${(error as Error).message}`,
        'ollama',
        'STREAM_ERROR',
        true,
        error as Error
      );
    }
  }

  /**
   * Generate embeddings using Ollama
   */
  async embed(options: LLMEmbeddingOptions): Promise<LLMEmbeddingResponse> {
    this.ensureInitialized();

    try {
      const model = options.model || 'nomic-embed-text';

      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: options.text
        }),
        signal: AbortSignal.timeout(this.config.timeout!)
      });

      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
      }

      const data: OllamaEmbeddingResponse = await response.json();

      return {
        embedding: data.embeddings[0] || [],
        model,
        tokens: this.estimateTokens(options.text)
      };

    } catch (error) {
      throw new LLMProviderError(
        `Ollama embedding failed: ${(error as Error).message}`,
        'ollama',
        'EMBEDDING_ERROR',
        true,
        error as Error
      );
    }
  }

  /**
   * Count tokens in text (approximate)
   */
  async countTokens(options: LLMTokenCountOptions): Promise<number> {
    return this.estimateTokens(options.text);
  }

  /**
   * Health check - ping Ollama server
   */
  async healthCheck(): Promise<LLMHealthStatus> {
    const startTime = Date.now();

    try {
      const isHealthy = await this.checkOllamaHealth();
      const latency = Date.now() - startTime;

      return {
        healthy: isHealthy,
        latency,
        timestamp: new Date(),
        metadata: {
          baseUrl: this.baseUrl,
          currentModel: this.currentModel,
          availableModels: Array.from(this.availableModels),
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
      name: 'ollama',
      version: '1.0.0',
      models: [
        'qwen3-coder:30b',
        'llama3.3:70b',
        'devstral-small-2:24b',
        'rnj-1:8b',
        'deepseek-coder-v2',
        'llama3.2:3b',
        'mistral:7b',
        'phi3:mini',
        'codellama:13b'
      ],
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
   * Shutdown the provider
   */
  async shutdown(): Promise<void> {
    this.isInitialized = false;
    this.logger.info('OllamaProvider shutdown', {
      requestCount: this.requestCount
    });
  }

  /**
   * Track cost (always 0 for local inference)
   */
  trackCost(usage: LLMCompletionResponse['usage']): number {
    return 0;
  }

  /**
   * Set the current model for subsequent requests
   *
   * @param model - Model name to use
   */
  async setModel(model: string): Promise<void> {
    this.ensureInitialized();

    // Check if model is available
    if (!this.availableModels.has(model)) {
      this.logger.warn(`Model ${model} not found locally. It will be downloaded on first use.`);
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
    return Array.from(this.availableModels);
  }

  /**
   * Discover available models from Ollama
   */
  private async discoverModels(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        this.logger.warn('Failed to fetch models from Ollama');
        return;
      }

      const data: { models: OllamaModelInfo[] } = await response.json();

      this.availableModels.clear();
      for (const model of data.models) {
        this.availableModels.add(model.name);
      }

      this.logger.debug('Discovered Ollama models', {
        count: this.availableModels.size,
        models: Array.from(this.availableModels)
      });

    } catch (error) {
      this.logger.warn('Model discovery failed', { error: (error as Error).message });
    }
  }

  /**
   * Check if Ollama server is running
   */
  private async checkOllamaHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Build prompt from options
   */
  private buildPrompt(options: LLMCompletionOptions): string {
    const parts: string[] = [];

    // Add system message if provided
    if (options.system && options.system.length > 0) {
      const systemContent = options.system.map(s => s.text).join('\n\n');
      parts.push(`System: ${systemContent}\n`);
    }

    // Add conversation messages
    for (const message of options.messages) {
      const content = typeof message.content === 'string'
        ? message.content
        : message.content.map(c => c.text || '').join('');

      const role = message.role.charAt(0).toUpperCase() + message.role.slice(1);
      parts.push(`${role}: ${content}`);
    }

    // Add final prompt for assistant response
    parts.push('Assistant:');

    return parts.join('\n\n');
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
        'OllamaProvider not initialized. Call initialize() first.',
        'ollama',
        'NOT_INITIALIZED',
        false
      );
    }
  }
}
