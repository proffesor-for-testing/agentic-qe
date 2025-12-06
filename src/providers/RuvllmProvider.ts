/**
 * RuvllmProvider - Local LLM Inference via ruvllm
 *
 * Provides local LLM inference for cost-effective operations on capable hardware.
 * Uses ruvllm for fast local inference with support for various open models.
 *
 * Features:
 * - Zero cloud costs for local inference
 * - Low latency for local operations
 * - Privacy-preserving (no data leaves the machine)
 * - Streaming support
 * - Model hot-swapping
 *
 * @module providers/RuvllmProvider
 * @version 1.0.0
 */

import { spawn, ChildProcess } from 'child_process';
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
 * Ruvllm-specific configuration
 */
export interface RuvllmProviderConfig extends LLMProviderConfig {
  /** Path to ruvllm executable or 'npx' for npm usage */
  ruvllmPath?: string;
  /** Port for local server */
  port?: number;
  /** Default model name/path */
  defaultModel?: string;
  /** GPU layers to offload (-1 for all) */
  gpuLayers?: number;
  /** Context window size */
  contextSize?: number;
  /** Number of threads */
  threads?: number;
  /** Model temperature */
  defaultTemperature?: number;
  /** Enable embeddings model */
  enableEmbeddings?: boolean;
}

/**
 * Local model info
 */
interface LocalModelInfo {
  name: string;
  path: string;
  loaded: boolean;
  contextSize: number;
  parameters: number;
}

/**
 * RuvllmProvider - Local LLM inference implementation of ILLMProvider
 *
 * This provider enables local LLM inference using ruvllm, providing
 * cost-free, low-latency inference for development and privacy-sensitive tasks.
 */
export class RuvllmProvider implements ILLMProvider {
  private readonly logger: Logger;
  private config: RuvllmProviderConfig;
  private isInitialized: boolean;
  private serverProcess?: ChildProcess;
  private baseUrl: string;
  private loadedModel?: LocalModelInfo;
  private requestCount: number;

  constructor(config: RuvllmProviderConfig = {}) {
    this.logger = Logger.getInstance();
    this.config = {
      name: config.name || 'ruvllm',
      debug: config.debug ?? false,
      timeout: config.timeout ?? 120000, // Longer timeout for local inference
      maxRetries: config.maxRetries ?? 2,
      ruvllmPath: config.ruvllmPath || 'npx',
      port: config.port ?? 8080,
      defaultModel: config.defaultModel || 'llama-3.2-3b-instruct',
      gpuLayers: config.gpuLayers ?? -1,
      contextSize: config.contextSize ?? 4096,
      threads: config.threads ?? 4,
      defaultTemperature: config.defaultTemperature ?? 0.7,
      enableEmbeddings: config.enableEmbeddings ?? false
    };
    this.isInitialized = false;
    this.baseUrl = `http://localhost:${this.config.port}`;
    this.requestCount = 0;
  }

  /**
   * Initialize the ruvllm provider
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('RuvllmProvider already initialized');
      return;
    }

    try {
      // Check if server is already running
      const isRunning = await this.checkServerHealth();
      if (isRunning) {
        this.isInitialized = true;
        this.logger.info('Connected to existing ruvllm server');
        return;
      }

      // Start ruvllm server
      await this.startServer();
      this.isInitialized = true;

      this.logger.info('RuvllmProvider initialized', {
        model: this.config.defaultModel,
        port: this.config.port,
        gpuLayers: this.config.gpuLayers
      });

    } catch (error) {
      throw new LLMProviderError(
        `Failed to initialize ruvllm: ${(error as Error).message}`,
        'ruvllm',
        'INIT_ERROR',
        false,
        error as Error
      );
    }
  }

  /**
   * Complete a prompt using local inference
   */
  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResponse> {
    this.ensureInitialized();

    const startTime = Date.now();

    try {
      // Build request body
      const requestBody = {
        model: options.model || this.config.defaultModel,
        messages: options.messages.map(m => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : m.content.map(c => c.text || '').join('')
        })),
        max_tokens: options.maxTokens || 2048,
        temperature: options.temperature ?? this.config.defaultTemperature,
        stream: false
      };

      // Add system message if provided
      if (options.system && options.system.length > 0) {
        const systemContent = options.system.map(s => s.text).join('\n');
        requestBody.messages = [
          { role: 'system', content: systemContent },
          ...requestBody.messages
        ];
      }

      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.config.timeout!)
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      this.requestCount++;

      // Map to standard response format
      const result: LLMCompletionResponse = {
        content: [{
          type: 'text',
          text: data.choices?.[0]?.message?.content || ''
        }],
        usage: {
          input_tokens: data.usage?.prompt_tokens || 0,
          output_tokens: data.usage?.completion_tokens || 0
        },
        model: data.model || this.config.defaultModel!,
        stop_reason: this.mapStopReason(data.choices?.[0]?.finish_reason),
        id: data.id || `ruvllm-${Date.now()}`,
        metadata: {
          latency: Date.now() - startTime,
          cost: 0 // Local inference is free
        }
      };

      this.logger.debug('Ruvllm completion successful', {
        model: result.model,
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
        latency: result.metadata?.latency
      });

      return result;

    } catch (error) {
      throw new LLMProviderError(
        `Ruvllm completion failed: ${(error as Error).message}`,
        'ruvllm',
        'INFERENCE_ERROR',
        true,
        error as Error
      );
    }
  }

  /**
   * Stream a completion
   */
  async *streamComplete(options: LLMCompletionOptions): AsyncIterableIterator<LLMStreamEvent> {
    this.ensureInitialized();

    try {
      const requestBody = {
        model: options.model || this.config.defaultModel,
        messages: options.messages.map(m => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : m.content.map(c => c.text || '').join('')
        })),
        max_tokens: options.maxTokens || 2048,
        temperature: options.temperature ?? this.config.defaultTemperature,
        stream: true
      };

      if (options.system && options.system.length > 0) {
        const systemContent = options.system.map(s => s.text).join('\n');
        requestBody.messages = [
          { role: 'system', content: systemContent },
          ...requestBody.messages
        ];
      }

      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
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
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                yield {
                  type: 'content_block_delta',
                  delta: { type: 'text_delta', text: content }
                };
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }

      yield { type: 'content_block_stop' };
      yield { type: 'message_stop' };

      this.requestCount++;

    } catch (error) {
      throw new LLMProviderError(
        `Ruvllm stream failed: ${(error as Error).message}`,
        'ruvllm',
        'STREAM_ERROR',
        true,
        error as Error
      );
    }
  }

  /**
   * Generate embeddings
   */
  async embed(options: LLMEmbeddingOptions): Promise<LLMEmbeddingResponse> {
    this.ensureInitialized();

    if (!this.config.enableEmbeddings) {
      throw new LLMProviderError(
        'Embeddings not enabled. Set enableEmbeddings: true in config.',
        'ruvllm',
        'UNSUPPORTED',
        false
      );
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model || 'embedding',
          input: options.text
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();

      return {
        embedding: data.data?.[0]?.embedding || [],
        model: data.model || 'embedding',
        tokens: data.usage?.total_tokens || 0
      };

    } catch (error) {
      throw new LLMProviderError(
        `Embedding generation failed: ${(error as Error).message}`,
        'ruvllm',
        'EMBEDDING_ERROR',
        true,
        error as Error
      );
    }
  }

  /**
   * Count tokens in text
   */
  async countTokens(options: LLMTokenCountOptions): Promise<number> {
    // Approximate token count (ruvllm doesn't have a direct endpoint)
    // Most models use ~4 characters per token
    return Math.ceil(options.text.length / 4);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<LLMHealthStatus> {
    const startTime = Date.now();

    try {
      const isHealthy = await this.checkServerHealth();

      return {
        healthy: isHealthy,
        latency: Date.now() - startTime,
        timestamp: new Date(),
        metadata: {
          model: this.config.defaultModel,
          port: this.config.port,
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
      name: 'ruvllm',
      version: '1.0.0',
      models: [
        'llama-3.2-3b-instruct',
        'llama-3.2-1b-instruct',
        'llama-3.1-8b-instruct',
        'phi-3-mini',
        'mistral-7b-instruct',
        'qwen2-7b-instruct'
      ],
      capabilities: {
        streaming: true,
        caching: false,
        embeddings: this.config.enableEmbeddings!,
        vision: false
      },
      costs: {
        inputPerMillion: 0, // Free for local inference
        outputPerMillion: 0
      },
      location: 'local'
    };
  }

  /**
   * Shutdown the provider
   */
  async shutdown(): Promise<void> {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = undefined;
    }
    this.isInitialized = false;
    this.logger.info('RuvllmProvider shutdown', {
      requestCount: this.requestCount
    });
  }

  /**
   * Track cost (always 0 for local inference)
   */
  trackCost(usage: LLMCompletionResponse['usage']): number {
    return 0; // Local inference is free
  }

  /**
   * Start the ruvllm server
   */
  private async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        'ruvllm',
        'serve',
        '--model', this.config.defaultModel!,
        '--port', String(this.config.port),
        '--gpu-layers', String(this.config.gpuLayers),
        '--context-size', String(this.config.contextSize),
        '--threads', String(this.config.threads)
      ];

      if (this.config.ruvllmPath === 'npx') {
        this.serverProcess = spawn('npx', args, {
          stdio: this.config.debug ? 'inherit' : 'pipe'
        });
      } else {
        this.serverProcess = spawn(this.config.ruvllmPath!, args.slice(1), {
          stdio: this.config.debug ? 'inherit' : 'pipe'
        });
      }

      this.serverProcess.on('error', (error) => {
        reject(new Error(`Failed to start ruvllm: ${error.message}`));
      });

      // Wait for server to be ready
      const checkInterval = setInterval(async () => {
        try {
          const isReady = await this.checkServerHealth();
          if (isReady) {
            clearInterval(checkInterval);
            resolve();
          }
        } catch {
          // Server not ready yet
        }
      }, 500);

      // Timeout after 60 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Timeout waiting for ruvllm server to start'));
      }, 60000);
    });
  }

  /**
   * Check if server is healthy
   */
  private async checkServerHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Ensure provider is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new LLMProviderError(
        'RuvllmProvider not initialized. Call initialize() first.',
        'ruvllm',
        'NOT_INITIALIZED',
        false
      );
    }
  }

  /**
   * Map finish reason to standard stop reason
   */
  private mapStopReason(reason: string): 'end_turn' | 'max_tokens' | 'stop_sequence' {
    switch (reason) {
      case 'length':
        return 'max_tokens';
      case 'stop':
        return 'stop_sequence';
      default:
        return 'end_turn';
    }
  }
}
